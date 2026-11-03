import { describe, expect, it } from 'vitest';
import { businessDate, elapsedBusinessDays, monthBusinessDays, proratedMonthlyTarget, remainingBusinessDays } from './business-month';
describe('Meta acumulada em dias úteis, sem feriados presumidos', () => {
  const now = new Date('2026-11-03T15:00:00Z');
  it('inclui hoje uma única vez no acumulado', () => {
    expect(monthBusinessDays('2026-11')).toBe(21);
    expect(elapsedBusinessDays('2026-11', now)).toBe(2);
    expect(remainingBusinessDays('2026-11', now)).toBe(20);
    expect(proratedMonthlyTarget(21000, '2026-11', now)).toBe(2000);
  });
  it('sábado e domingo não aumentam a meta', () => {
    expect(proratedMonthlyTarget(21000, '2026-11', new Date('2026-11-06T15:00:00Z'))).toBe(5000);
    expect(proratedMonthlyTarget(21000, '2026-11', new Date('2026-11-08T15:00:00Z'))).toBe(5000);
  });
  it('mês fechado integral, futuro sem atingimento e ausente desconhecida', () => {
    expect(proratedMonthlyTarget(12345.67, '2026-10', now)).toBe(12345.67);
    expect(proratedMonthlyTarget(12345.67, '2026-12', now)).toBe(0);
    expect(proratedMonthlyTarget(null, '2026-11', now)).toBeNull();
    expect(proratedMonthlyTarget(0, '2026-11', now)).toBe(0);
    expect(proratedMonthlyTarget(10, '2026-13', now)).toBeNull();
  });
  it('respeita São Paulo na virada da data e ano bissexto', () => {
    expect(businessDate(new Date('2026-11-03T02:59:59Z'))).toBe('2026-11-02');
    expect(elapsedBusinessDays('2026-11', new Date('2026-11-03T02:59:59Z'))).toBe(1);
    expect(monthBusinessDays('2028-02')).toBe(21);
  });
});
