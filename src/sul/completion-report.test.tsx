import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { completionOwners, completionRecords, filterCompletions } from './completion-report';
import { createERPClient, type ERPRow } from '../lib/erp-online';
import SulApp, { createAppState } from './SulApp';
vi.mock('@g4ai/ds', async original => ({ ...await original<Record<string, unknown>>(), notify: vi.fn() }));
const a = '11111111-1111-4111-8111-111111111111', b = '22222222-2222-4222-8222-222222222222';
const customers = [{ id: 'c1', name: 'Cliente Um', code: '11' }, { id: 'c2', name: 'Cliente Dois', code: '22' }];
const users = [{ id: a, name: 'Homônimo' }, { id: b, name: 'Homônimo' }];
const activity = (n: number): ERPRow => ({ id: `a${n}`, name: `Atividade ${String(n).padStart(3, '0')}`, date: '2026-10-25', customerId: n % 2 ? 'c2' : 'c1', sellerId: n % 2 ? b : a, result: 'Relacionamento', status: 'Realizada' });
function source(activities: ERPRow[] = [], tasks: ERPRow[] = []) { return { activities, tasks, customers, users }; }
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); location.hash = ''; });

describe('Fonte local de tarefas e atividades concluídas', () => {
  it('exige Realizada nas duas coleções, sem presumir conclusão pelo nome da coleção', () => {
    const result = completionRecords(source([activity(0), { ...activity(1), status: 'Não realizada' }, { id: 'sem-status' }], [{ id: 't1', status: 'Realizada' }, { id: 't2', status: 'Não realizada' }]));
    expect(result.map(row => row['id'])).toEqual(['activities:a0', 'tasks:t1']);
  });
  it('não transforma outro status ou ausência em conclusão', () => {
    expect(completionRecords(source([{ id: 'x', status: 'Concluído' }, { id: 'y', status: null }], [{ id: 'z', status: '' }]))).toEqual([]);
  });
  it('não funde tarefa e atividade com mesmo ID e não altera o estado original', () => {
    const input = source([activity(0)], [{ ...activity(0), name: 'Tarefa realizada' }]), before = structuredClone(input);
    expect(completionRecords(input).map(row => row['id'])).toEqual(['activities:a0', 'tasks:a0']);
    expect(input).toEqual(before);
  });
  it('prepara o nome do cliente apenas pelo ID local já visível', () => {
    const rows = completionRecords(source([activity(0), { ...activity(1), customerId: 'sankhya:customer:141', customerSnapshot: { name: 'Não associar' } }]));
    expect(rows[0]?.['customer']).toBe('Cliente Um'); expect(rows[1]?.['customer']).toBeUndefined();
  });
  it('filtra por identificador recebido, nunca por nome idêntico nem pela pessoa logada', () => {
    const rows = completionRecords(source([activity(0), activity(1), { id: 'legado', name: 'Legado', status: 'Realizada', seller: 'Homônimo' }]));
    expect(filterCompletions(rows, { seller: a }).map(row => row['id'])).toEqual(['activities:a0']);
    expect(filterCompletions(rows, { seller: 'Homônimo' })).toEqual([]);
    expect(completionOwners(rows, users)).toEqual([{ value: a, label: 'Homônimo' }, { value: b, label: 'Homônimo' }]);
  });
  it('preserva desconhecido sem substituir pelo usuário ou inferir cadastro Auth', () => {
    const rows = completionRecords(source([{ id: 'legado', status: 'Realizada', seller: 'Homônimo' }]));
    expect(rows).toHaveLength(1); expect(completionOwners(rows, users)).toEqual([]);
    expect(filterCompletions(rows, { seller: a })).toEqual([]);
  });
  it('combina cliente, responsável e situação no mesmo conjunto', () => {
    const rows = completionRecords(source([activity(0), activity(1), activity(2)]));
    expect(filterCompletions(rows, { customer: 'c1', seller: a, status: 'Realizada' })).toHaveLength(2);
    expect(filterCompletions(rows, { customer: 'c1', seller: b })).toEqual([]);
    expect(filterCompletions(rows, { status: 'Não realizada' })).toEqual([]);
  });
  it('usa apenas a data declarada, com limites inclusivos, sem criar data de conclusão', () => {
    const rows = completionRecords(source([{ ...activity(0), date: '2026-10-01' }, activity(1), { ...activity(2), date: '2026-10-26', completedAt: '2026-10-25' }]));
    expect(filterCompletions(rows, { from: '2026-10-01', to: '2026-10-25' }).map(row => row['id'])).toEqual(['activities:a0', 'activities:a1']);
  });
  it.each([null, undefined, '', '2026-02-29', '25/10/2026', '2026-10-25T12:00:00Z'])('não usa data ausente/inválida no recorte: %j', date => {
    const rows = completionRecords(source([{ ...activity(0), date, createdAt: '2026-10-25' }]));
    expect(filterCompletions(rows, {})).toHaveLength(1);
    expect(filterCompletions(rows, { from: '2026-10-01' })).toEqual([]);
  });
});

function mount() {
  location.hash = '#/relatorios/tarefas';
  const state = createAppState({ ...source(Array.from({ length: 30 }, (_, i) => activity(i)), [{ id: 't0', name: 'Tarefa concluída', date: '2026-10-25', status: 'Realizada', sellerId: a }, { id: 't1', name: 'Tarefa pendente', status: 'Não realizada' }]), company: { userId: a, user: 'Homônimo', role: 'Administrador' } });
  state['activities'].push({ id: 'pendente', name: 'Atividade pendente', status: 'Não realizada' });
  const persist = vi.fn(async next => next), transport = vi.fn();
  const view = render(<SulApp initialState={state} persist={persist} online={createERPClient(transport)} onSignOut={async () => {}} />);
  return { ...view, state, persist, transport };
}
async function csvText(create: ReturnType<typeof vi.fn>) {
  await waitFor(() => expect(create).toHaveBeenCalledOnce());
  const blob = create.mock.calls[0]![0] as Blob;
  return new Promise<string>(resolve => { const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.readAsText(blob); });
}
function downloads() {
  const create = vi.fn((_blob: Blob | MediaSource) => 'blob:tarefas'), Original = URL;
  vi.stubGlobal('URL', class extends Original { static override createObjectURL = create; static override revokeObjectURL = vi.fn(); });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {}); return create;
}
describe('Relatório existente com controles e fonte locais', () => {
  it('mostra apenas concluídas, mantém as cinco colunas e não chama ERP nem persiste', async () => {
    const { transport, persist, state } = mount();
    expect(screen.getByText('Atividade 000')).toBeInTheDocument();
    expect(screen.queryByText('Atividade pendente')).not.toBeInTheDocument();
    expect(screen.queryByText('Tarefa pendente')).not.toBeInTheDocument();
    expect(screen.getAllByRole('columnheader')).toHaveLength(5);
    expect(screen.getByRole('button', { name: 'Filtros' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Exportar CSV' })).toBeInTheDocument());
    expect(transport).not.toHaveBeenCalled(); expect(persist).not.toHaveBeenCalled();
    expect(state['activities'][0]['id']).toBe('a0');
  });
  it('filtra cliente nos controles existentes e aplica o filtro à lista', async () => {
    const { transport, persist } = mount();
    fireEvent.click(screen.getByRole('button', { name: 'Filtros' }));
    fireEvent.click(await screen.findByRole('combobox', { name: 'Cliente' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Cliente Dois (22)' }));
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar filtros' }));
    await screen.findByText('Atividade 001');
    expect(screen.queryByText('Atividade 000')).not.toBeInTheDocument();
    expect(transport).not.toHaveBeenCalled(); expect(persist).not.toHaveBeenCalled();
  });
  it('oferece responsáveis dos registros e não vendedores dos pedidos ou do ERP', async () => {
    const { transport } = mount();
    fireEvent.click(screen.getByRole('button', { name: 'Filtros' }));
    fireEvent.click(await screen.findByRole('combobox', { name: 'Vendedor' }));
    const choices = await screen.findAllByRole('option', { name: 'Homônimo' });
    expect(choices).toHaveLength(2); fireEvent.click(choices[0]!);
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar filtros' }));
    await screen.findByText('Atividade 000'); expect(screen.queryByText('Atividade 001')).not.toBeInTheDocument();
    expect(transport).not.toHaveBeenCalled();
  });
  it('oferece situação da fonte local, não status dos pedidos', async () => {
    mount(); fireEvent.click(screen.getByRole('button', { name: 'Filtros' }));
    fireEvent.click(await screen.findByRole('combobox', { name: 'Situação' }));
    expect(await screen.findByRole('option', { name: 'Realizada' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Concluído' })).not.toBeInTheDocument();
  });
  it('exporta todas as linhas da busca por cliente, não só a página visível', async () => {
    const { persist, transport } = mount(), create = downloads();
    fireEvent.change(screen.getByPlaceholderText('Filtrar…'), { target: { value: 'CLIENTE DOIS' } });
    expect(screen.queryByText('Atividade 000')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Exportar CSV' }));
    const text = await csvText(create);
    expect(text.split('\r\n')).toHaveLength(16); expect(text).toContain('Atividade 029');
    expect(text).not.toContain('Atividade 000'); expect(text).toContain('date;customer;result;name;status');
    expect(text).not.toContain('undefined'); expect(persist).not.toHaveBeenCalled(); expect(transport).not.toHaveBeenCalled();
  });
  it('exporta a ordem do cabeçalho escolhido e não aplica paginação ao CSV', async () => {
    mount(); const create = downloads();
    const sort = screen.getByRole('button', { name: /Ordenar por Descrição/ });
    fireEvent.click(sort); fireEvent.click(sort);
    fireEvent.click(screen.getByRole('button', { name: 'Exportar CSV' }));
    const text = await csvText(create), lines = text.split('\r\n');
    expect(lines).toHaveLength(32); expect(lines[1]).toContain('Tarefa concluída');
    expect(lines.at(-1)).toContain('Atividade 000');
  });
});
