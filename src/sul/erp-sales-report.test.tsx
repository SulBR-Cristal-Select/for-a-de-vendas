import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createERPClient, type ERPRow } from '../lib/erp-online';
import { sumERPDecimals } from '../lib/erp-decimal';
import { foldERPText } from '../lib/erp-order';
import { STANDARD_SALES_REPORT_POLICY } from '../../supabase/functions/sankhya-online/policy';
import { salesReportQuery } from './erp-sales-report';
import { exportERPRows } from './erp-hooks';
import SulApp, { createAppState } from './SulApp';
vi.mock('@g4ai/ds', async original => ({ ...await original<Record<string,unknown>>(),notify:vi.fn() }));
const observation={source:'sankhya',readOnly:true,readAt:'2026-10-25T13:28:00.000Z'};
function order(id:number):ERPRow {return {id:`sankhya:order:${id}`,source:'observado',readOnly:true,number:String(id),date:'2026-10-25',customerId:`sankhya:customer:${id%2+1}`,customerName:`Cliente documental ${id%2+1}`,sellerCode:id%2?34:12,sellerName:'Homônimo',total:'0.1',status:'confirmado',operationName:'Venda normal',erp:{source:'sankhya',companyCode:1,documentCode:id,movement:'P',operationCode:1001,statusCode:'L'}};}
function fakeERP(rows=Array.from({length:65},(_,i)=>order(i+1))) {
 const customers=[1,2].map(n=>({id:`sankhya:customer:${n}`,code:String(n),name:`Cliente documental ${n}`,active:true}));
 const sellers=[34,12].map(n=>({id:`sankhya:seller:${n}`,code:n,name:'Homônimo'}));
 const transport=vi.fn(async({operation,query}:any)=>{
  if(operation==='record') {const r=query.resource==='sellers'?sellers:customers;return{error:null,data:{...observation,record:r.find(x=>x.id===query.id||x.code===query.id)||null}};}
  if(operation==='window') {const r=[...(query.resource==='sellers'?sellers:customers)].sort((a,b)=>Number(a.code)-Number(b.code));return{error:null,data:{...observation,items:r.slice(query.offset,query.offset+query.limit),offset:query.offset,total:r.length,totalWithoutSearch:r.length}};}
  if(operation!=='sales-report')throw Error('Operação não esperada no relatório');
  let filtered=rows.filter(r=>(!query.customerId||r['customerId']===query.customerId)&&(!query.sellerCode||r['sellerCode']===query.sellerCode)&&(!query.from||String(r['date'])>=query.from)&&(!query.to||String(r['date'])<=query.to));
  const group=(source:ERPRow[]):ERPRow[]=>{if(!query.groupBy)return source;const groups=new Map<any,ERPRow[]>();for(const r of source){const code=query.groupBy==='seller'?r['sellerCode']:Number(String(r['customerId']).split(':').at(-1));groups.set(code,[...(groups.get(code)||[]),r]);}return [...groups].map(([code,records])=>({id:`sankhya:sales:${query.groupBy}:${code}`,groupBy:query.groupBy,groupCode:code,name:query.groupBy==='seller'?'Homônimo':`Cliente documental ${code}`,count:records.length,total:sumERPDecimals(records.map(r=>String(r['total'])))}));};
  const totalWithoutSearch=group(filtered).length;
  if(query.search)filtered=filtered.filter(r=>foldERPText([r['number'],r['customerName'],r['sellerName']].join(' ')).includes(foldERPText(query.search)));
  const missing=filtered.filter(r=>r['total']===null).length;
  const summary={documentCount:filtered.length,documentAmount:missing?null:sumERPDecimals(filtered.map(r=>String(r['total']))),missingAmountCount:missing,amountField:'TGFCAB.VLRNOTA',headerCountedOnce:true,atomicSnapshot:false};
  let selected=group(filtered);if(query.sort){const key=query.sort==='customer'?'customerName':query.sort==='seller'?'sellerName':query.sort;selected=[...selected].sort((a,b)=>String(a[key]).localeCompare(String(b[key]),'pt-BR',{numeric:true})*(query.direction==='desc'?-1:1));}
  return{error:null,data:{...observation,items:selected.slice(query.offset,query.offset+query.limit),total:selected.length,totalWithoutSearch,offset:query.offset,summary,salesPolicy:STANDARD_SALES_REPORT_POLICY,companyCodes:[1],groupBy:query.groupBy??null}};
 });
 return{client:createERPClient(transport),transport,rows};
}
function mount(rows?:ERPRow[]){location.hash='#/relatorios/vendas';const f=fakeERP(rows);const state=createAppState({orders:[{id:'manual',number:'MANUAL-NÃO-SOMAR',total:999999,type:'Venda',status:'Concluído',seller:'Homônimo'}]});const persist=vi.fn();const view=render(<SulApp initialState={state} online={f.client} persist={persist} onSignOut={vi.fn()}/>);return{...view,...f,persist,state};}
beforeEach(()=>{HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};});
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals();location.hash='';});
async function selectGroup(label:string){fireEvent.click(screen.getByRole('combobox',{name:'Agrupar por'}));const option=await screen.findByRole('option',{name:label});fireEvent.pointerDown(option,{pointerType:'mouse'});fireEvent.click(option);}
describe('Vendas na interface existente',()=>{
 it('página inicial e KPIs usam o agregado integral de65 pedidos; não os10 visíveis ou manuais',async()=>{
  const f=mount();await screen.findByText('R$ 6,50');expect(screen.getByText('#1')).toBeInTheDocument();expect(screen.queryByText('#11')).not.toBeInTheDocument();expect(screen.queryByText('#MANUAL-NÃO-SOMAR')).not.toBeInTheDocument();expect(screen.getAllByText('R$ 0,10')).toHaveLength(11);expect(f.transport.mock.calls.every(([b])=>b.operation==='sales-report'&&b.query.limit<=50)).toBe(true);expect(f.state['orders']).toHaveLength(1);expect(f.persist).not.toHaveBeenCalled();
 });
 it('agrupa vendedores homônimos por código, sem reduzir o KPI a dois grupos',async()=>{
  const f=mount();await screen.findByText('R$ 6,50');await selectGroup('Vendedor');await waitFor(()=>expect(f.transport.mock.calls.at(-1)?.[0].query.groupBy).toBe('seller'));await waitFor(()=>expect(screen.getAllByText('Homônimo')).toHaveLength(2));expect(screen.getByText('R$ 6,50')).toBeInTheDocument();expect(screen.getByText('33')).toBeInTheDocument();expect(screen.getByText('32')).toBeInTheDocument();expect(f.persist).not.toHaveBeenCalled();
 });
 it('agrupa por cliente e preserva retorno aos detalhes, mesmo após ordenação anterior',async()=>{
  const f=mount();await screen.findByText('R$ 6,50');fireEvent.click(screen.getByRole('button',{name:/Pedido/}));await selectGroup('Cliente');await waitFor(()=>expect(f.transport.mock.calls.at(-1)?.[0].query.groupBy).toBe('customer'));expect(f.transport.mock.calls.at(-1)?.[0].query.sort).not.toBe('number');await selectGroup('Sem agrupamento');await screen.findByText('#1');expect(f.transport.mock.calls.at(-1)?.[0].query.groupBy).toBeUndefined();
 });
 it('busca no servidor, limpa KPIs antigos e mantém o campo para nova busca',async()=>{
  const f=mount();await screen.findByText('R$ 6,50');const input=screen.getByPlaceholderText('Filtrar…');fireEvent.change(input,{target:{value:'Cliente documental 1'}});await screen.findByText('R$ 3,20');expect(input).toBeInTheDocument();expect(screen.queryByText('R$ 6,50')).not.toBeInTheDocument();expect(f.transport.mock.calls.at(-1)?.[0].query.search).toBe('Cliente documental 1');
 });
 it('filtra cliente no controle real e não carrega produtos/pedidos em arrays canônicos',async()=>{
  const f=mount();await screen.findByText('R$ 6,50');fireEvent.click(screen.getByRole('button',{name:'Filtros'}));fireEvent.click(await screen.findByRole('combobox',{name:'Cliente'}));fireEvent.click(await screen.findByRole('option',{name:'Cliente documental 1 (1)'}));fireEvent.click(screen.getByRole('button',{name:'Aplicar filtros'}));await screen.findByText('R$ 3,20');expect(f.transport.mock.calls.at(-1)?.[0].query.customerId).toBe('sankhya:customer:1');expect(f.transport.mock.calls.every(([b])=>b.query.resource!=='products')).toBe(true);expect(f.state['customers']).toEqual([]);expect(f.persist).not.toHaveBeenCalled();
 });
 it('filtra vendedor por código mesmo com nomes idênticos, sem escolher identidade comercial',async()=>{
  const f=mount();await screen.findByText('R$ 6,50');fireEvent.click(screen.getByRole('button',{name:'Filtros'}));fireEvent.click(await screen.findByRole('combobox',{name:'Vendedor'}));const options=await screen.findAllByRole('option',{name:'Homônimo'});fireEvent.click(options[1]!);fireEvent.click(screen.getByRole('button',{name:'Aplicar filtros'}));await waitFor(()=>expect(f.transport.mock.calls.at(-1)?.[0].query.sellerCode).toBe(34));expect(f.persist).not.toHaveBeenCalled();
 });
 it('erro remoto não transforma indicador em zero nem mantém valor antigo',async()=>{
  const f=mount();await screen.findByText('R$ 6,50');f.transport.mockRejectedValue(new Error('falha sintética'));fireEvent.change(screen.getByPlaceholderText('Filtrar…'),{target:{value:'novo'}});await screen.findByText('Consulta ERP indisponível. Tente novamente.');expect(screen.queryByText('R$ 6,50')).not.toBeInTheDocument();expect(screen.queryByText('R$ 0,00')).not.toBeInTheDocument();expect(f.persist).not.toHaveBeenCalled();
 });
 it('CSV pelos controles originais contém65 registros e as sete colunas, não só a página',async()=>{
  const create=vi.fn((_blob:Blob)=> 'blob:csv-vendas');Object.defineProperty(URL,'createObjectURL',{configurable:true,value:create});Object.defineProperty(URL,'revokeObjectURL',{configurable:true,value:vi.fn()});vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(()=>{});
  const f=mount();await screen.findByText('R$ 6,50');fireEvent.click(screen.getByRole('button',{name:'Exportar CSV'}));await waitFor(()=>expect(create).toHaveBeenCalledOnce());const blob=create.mock.calls[0]![0] as Blob;const text=await new Promise<string>(resolve=>{const r=new FileReader();r.onload=()=>resolve(String(r.result));r.readAsText(blob);});expect(text.split('\r\n')).toHaveLength(66);expect(text).toContain('number;date;customer;seller;delivery;total;cargoStatus');expect(text).toContain('"65";"2026-10-25"');expect(text).not.toContain('MANUAL-NÃO-SOMAR');expect(f.persist).not.toHaveBeenCalled();
 });
});
describe('Contrato fixo de vendas e exportação coerente',()=>{
 it('propaga período, situação e códigos; entrada malformada não retira o filtro',()=>{expect(salesReportQuery({customer:'sankhya:customer:1',seller:'sankhya:seller:34',status:'confirmado',from:'2026-10-01',to:'2026-10-25'},'vendedor')).toEqual({customerId:'sankhya:customer:1',sellerCode:34,status:'confirmado',from:'2026-10-01',to:'2026-10-25',groupBy:'seller'});expect(salesReportQuery({seller:'Homônimo'},'nenhum').sellerCode).toBeNaN();});
 it('SDK recusa resumo sem política, notaV, dinheiro binário ou número de documentos incoerente',async()=>{
  const f=fakeERP([order(1)]);const original=await f.client.salesReport({resource:'orders',offset:0,limit:10});
  for(const bad of [{salesPolicy:null},{summary:{...original.summary,documentAmount:0.1}},{summary:{...original.summary,documentCount:2}},{items:[{...order(1),erp:{...(order(1)['erp'] as ERPRow),movement:'V'}}]}]){const c=createERPClient(async()=>({error:null,data:{...original,...bad}}));await expect(c.salesReport({resource:'orders',offset:0,limit:10})).rejects.toMatchObject({code:'INVALID_RESPONSE'});}
 });
 it('exportação recusa mudança financeira com contagem idêntica entre janelas',async()=>{
  const f=fakeERP();const original=f.client.salesReport.bind(f.client);vi.spyOn(f.client,'salesReport').mockImplementation(async q=>{const r=await original(q);return q.offset?{...r,summary:{...r.summary,documentAmount:'999'}}:r;});await expect(exportERPRows({client:f.client,resource:'orders',salesReport:{}},{resource:'orders'},[],()=>{})).rejects.toMatchObject({code:'INVALID_RESPONSE'});
 });
 it('ausência monetária preserva documento/contagem, não produz valor ou ticket0',async()=>{
  const f=mount([{...order(1),total:null}]);await screen.findByText('#1');expect(screen.queryByText('R$ 0,00')).not.toBeInTheDocument();expect(f.persist).not.toHaveBeenCalled();
 });
});
