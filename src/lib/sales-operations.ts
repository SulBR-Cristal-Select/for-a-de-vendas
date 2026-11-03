/** TOPs de leitura confirmadas pelo usuário em 03/11/2026. Não altera a TOP de criação. */
export const SALES_OPERATION_CODES = Object.freeze([1001, 1107, 1108, 1162, 1102, 1101, 1134, 1130, 1125, 1171, 1122] as const);
export function isSalesOperation(value: unknown): boolean {
  return typeof value === 'number' && (SALES_OPERATION_CODES as readonly number[]).includes(value);
}
/** Coluna fixa definida pelo backend, nunca enviada pelo navegador. */
export function salesOperationSQL(column: string): string {
  if (!/^[A-Z]+\.CODTIPOPER$/.test(column)) throw new Error('Coluna de TOP inválida.');
  return `${column} IN (${SALES_OPERATION_CODES.join(',')})`;
}
