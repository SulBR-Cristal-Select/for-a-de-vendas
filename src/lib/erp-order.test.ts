import { describe, expect, it } from 'vitest';
import { compareERP, foldERPText } from './erp-order';
import { ERPOnlineError } from './erp-online';

const erp = (code: number, _sortValue: string | number | null) => ({ id: `sankhya:customer:${code}`, code: String(code), _sortValue });
describe('ordenação binária compartilhada ERP/local', () => {
  it('reproduz mapeamento explícito sem normalização adicional e escapa UTF-16', () => {
    expect(foldERPText('áàâãäéèêëíìîïóòôõöúùûüçñ')).toBe('AAAAAEEEEIIIIOOOOOUUUUCN');
    expect(foldERPText("d'água_%\\")).toBe("D'AGUA_%\\");
    expect(foldERPText('漢😀')).toBe('\\6F22\\D83D\\DE00');
    expect(foldERPText('a\u0301')).toBe('A\\0301');
  });
  it('usa valor primário exato retornado pelo SQL, sem refazer fold', () => {
    const compare = compareERP('name');
    expect(compare({ name: 'ZZZ' }, { ...erp(1, 'AAA'), name: 'ZZZZ' })).toBeGreaterThan(0);
    expect(compare({ name: 'AAA' }, { ...erp(1, null), name: 'AAA' })).toBeLessThan(0);
    expect(compare(erp(1, '\\6F22'), { name: '漢' })).toBeGreaterThan(0);
  });
  it.each(['asc', 'desc'] as const)('nulos ficam no final em %s, inclusive blocked e preço sem contexto', dir => {
    for (const key of ['name', 'code', 'price', 'blocked'] as const) {
      const compare = compareERP(key, dir);
      expect(compare(erp(1, null), erp(2, key === 'name' ? 'A' : 0))).toBeGreaterThan(0);
      expect(compare({ [key]: null }, { [key]: key === 'name' ? 'A' : false })).toBeGreaterThan(0);
    }
  });
  it('códigos numéricos são números e alfanuméricos vêm após números em asc', () => {
    const rows = [{ code: 'A2' }, { code: '10' }, { code: '2' }, erp(4, 4), { code: null }];
    expect([...rows].sort(compareERP('code')).map(r => r.code)).toEqual(['2', '4', '10', 'A2', null]);
    expect([...rows].sort(compareERP('code', 'desc')).map(r => r.code)).toEqual(['A2', '10', '4', '2', null]);
  });
  it('empate mantém locais estáveis antes de ERP; ERP desempata código na mesma direção', () => {
    const a = { code: '90', name: 'Água' }, b = { code: '1', name: 'agua' };
    const rows = [erp(2, 'AGUA'), a, erp(9, 'AGUA'), b];
    expect([...rows].sort(compareERP('name'))).toEqual([a, b, rows[0], rows[2]]);
    expect([...rows].sort(compareERP('name', 'desc'))).toEqual([a, b, rows[2], rows[0]]);
    expect(compareERP('name')(a, b)).toBe(0);
  });
  it('não depende de locale para pontuação e Unicode', () => {
    const rows = [{ name: '漢' }, { name: 'z' }, { name: 'ábaco' }, { name: 'A_' }];
    expect(rows.sort(compareERP('name')).map(r => r.name)).toEqual(['ábaco', 'A_', 'z', '漢']);
  });
  it('erros de autenticação têm mensagens controladas, sem propagar mensagem arbitrária', () => {
    for (const code of ['AUTH_REQUIRED', 'MEMBERSHIP_PENDING', 'PROFILE_UNAVAILABLE']) expect(new ERPOnlineError(code).code).toBe(code);
    const error = new ERPOnlineError('segredo arbitrário');
    expect(error.code).toBe('ERP_UNAVAILABLE'); expect(error.message).not.toContain('segredo');
  });
});
