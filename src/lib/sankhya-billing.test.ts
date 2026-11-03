import { describe, expect, it, vi } from 'vitest';
import { readCommercialDictionary } from '../../supabase/functions/sankhya-online/dictionary';
import { COMMERCIAL_POLICY, STANDARD_BILLING_REPORT_POLICY } from '../../supabase/functions/sankhya-online/policy';
const query={kind:'analytics',section:'billing',companyCode:1,from:'2026-10-01',to:'2026-10-25'};
const required={
 TGFCAB:{CODEMP:'NUMBER',NUNOTA:'NUMBER',CODTIPOPER:'NUMBER',DHTIPOPER:'DATE',CODNAT:'NUMBER',DTFATUR:'DATE',TIPMOV:'VARCHAR2',STATUSNOTA:'VARCHAR2',STATUSNFE:'VARCHAR2',VLRNOTA:'NUMBER'},
 TGFTOP:{CODTIPOPER:'NUMBER',DHALTER:'DATE',TIPMOV:'VARCHAR2',GOLSINAL:'NUMBER',GOLDEV:'NUMBER',BONIFICACAO:'VARCHAR2'},
 TGFVAR:{NUNOTA:'NUMBER',NUNOTAORIG:'NUMBER',SEQUENCIA:'NUMBER',SEQUENCIAORIG:'NUMBER'},
 TGFITE:{NUNOTA:'NUMBER',SEQUENCIA:'NUMBER'},
};
const columns=Object.entries(required).flatMap(([TABLE_NAME,fields])=>Object.entries(fields).map(([COLUMN_NAME,DATA_TYPE])=>({TABLE_NAME,COLUMN_NAME,DATA_TYPE})));
const admin={role:'administrador' as const};
const row={SAMPLE_DOCUMENT_CODE:123,CODTIPOPER:1101,OPERATION_VERSION:'2026-01-01T10:11:12',CODNAT:10100000,HAS_STANDARD_ORIGIN:1,HAS_OTHER_ORIGIN:0,HAS_UNRESOLVED_ORIGIN:0,HAS_UNLINKED_ITEM:0,HAS_ITEMS:1,HAS_CROSS_COMPANY_ORIGIN:0,DOCUMENT_COUNT:2,MISSING_AMOUNT_COUNT:0,DOCUMENT_AMOUNT:'9007199254740993.01',FIRST_DATE:'2026-10-01',LAST_DATE:'2026-10-25'};
function transport(rows:Record<string,unknown>[]=[row],commercial=2,undated=0){
 return{select:vi.fn().mockResolvedValueOnce(columns).mockResolvedValueOnce([{APPROVED_DOCUMENT_COUNT:commercial+3,COMMERCIAL_DOCUMENT_COUNT:commercial,MISSING_CONTEXT_COUNT:0}]).mockResolvedValueOnce([{UNDATED_DOCUMENT_COUNT:undated}]).mockResolvedValueOnce(rows)};
}
describe('faturamento aprovado e vinculado à venda padrão, sem somar P/V',()=>{
 it('mantém vendas, novos pedidos e preço separados da política de faturamento',()=>{
  expect(STANDARD_BILLING_REPORT_POLICY).toMatchObject({movement:'V',dateField:'DTFATUR',statusCode:'L',fiscalStatusCode:'A',origin:{movement:'P',operationCode:1001,natureCode:10100000,statusCode:'L',dateField:'DTNEG'}});
  expect(COMMERCIAL_POLICY.saleOperationByCompany).toEqual({1:1001,4:1001});
 });
 it('qualifica no ERP e preserva total textual além do inteiro seguro, uma vez por nota',async()=>{
  const g=transport(),result=await readCommercialDictionary(g,query,admin);
  expect(result).toMatchObject({source:'sankhya',readOnly:true,supported:true,dateField:'DTFATUR',headerCountedOnce:true,ordersAdded:false,qualificationComplete:true,totals:{documentCount:2,documentAmount:'9007199254740993.01',amountField:'TGFCAB.VLRNOTA'}});
  const sql=g.select.mock.calls[3]![0];
  for(const clause of ["H.TIPMOV='V'","H.STATUSNOTA='L'","H.STATUSNFE='A'","H.DTFATUR>=TO_DATE('2026-10-01'","H.DTFATUR<TO_DATE('2026-10-25'","T.GOLSINAL=-1","T.GOLDEV=1","T.BONIFICACAO='N'","P.TIPMOV='P'",'P.CODTIPOPER IN (1001,1107,1108,1162,1102,1101,1134,1130,1125,1171,1122)','P.CODNAT=10100000',"P.STATUSNOTA='L'",'R.NUNOTAORIG','R.SEQUENCIAORIG','O.DHALTER=P.DHTIPOPER','T.DHALTER=H.DHTIPOPER'])expect(sql).toContain(clause);
  expect(sql).not.toMatch(/H\.DTNEG|P\.DTNEG|SUM\(DISTINCT|SUM\(P\.|VLRDESC|PRECO|QTDATENDIDA|T\.ATIVO=/);
  expect(sql).toContain('TO_CHAR(SUM(VLRNOTA)');expect(sql).toContain('OFFSET 0 ROWS FETCH NEXT 50 ROWS ONLY');
  expect(g.select.mock.calls.every(([,limit])=>limit<=50)).toBe(true);
 });
 it.each(['gestor','vendedor'] as const)('não abre o diagnóstico administrativo para %s',async role=>{
  const g=transport();await expect(readCommercialDictionary(g,query,{role,sellerCode:34,companyCodes:[1,4]})).rejects.toMatchObject({code:'ERP_IDENTITY_REQUIRED'});expect(g.select).not.toHaveBeenCalled();
 });
 it.each([{companyCode:3},{from:'2026-02-30'},{to:'2026-09-30'},{from:'2024-01-01'},{offset:-1},{offset:0.5},{dateField:'DTNEG'},{statusCode:'P'},{sql:'SELECT 1'},{sellerCode:5}])('recusa substituição de política/parâmetro antes do ERP: %j',async patch=>{
  const g=transport();await expect(readCommercialDictionary(g,{...query,...patch},admin)).rejects.toBeDefined();expect(g.select).not.toHaveBeenCalled();
 });
 it('não converte metadado ausente em valor zero',async()=>{
  const g={select:vi.fn().mockResolvedValue(columns.filter(c=>c.TABLE_NAME!=='TGFVAR'||c.COLUMN_NAME!=='SEQUENCIAORIG'))};
  await expect(readCommercialDictionary(g,query,admin)).rejects.toMatchObject({code:'ERP_CONTEXT_REQUIRED'});expect(g.select).toHaveBeenCalledTimes(1);
 });
 it('aceita FLOAT Oracle somente no valor nativo da nota, mantendo transporte textual',async()=>{
  const g=transport();g.select.mockReset().mockResolvedValueOnce(columns.map(c=>c.TABLE_NAME==='TGFCAB'&&c.COLUMN_NAME==='VLRNOTA'?{...c,DATA_TYPE:'FLOAT'}:c)).mockResolvedValueOnce([{APPROVED_DOCUMENT_COUNT:2,COMMERCIAL_DOCUMENT_COUNT:2,MISSING_CONTEXT_COUNT:0}]).mockResolvedValueOnce([{UNDATED_DOCUMENT_COUNT:0}]).mockResolvedValueOnce([row]);
  expect(await readCommercialDictionary(g,query,admin)).toMatchObject({qualificationComplete:true,totals:{documentAmount:'9007199254740993.01'}});
 });
 it.each(['BINARY_FLOAT','BINARY_DOUBLE','VARCHAR2'])('não generaliza o campo monetário para %s',async DATA_TYPE=>{
  const g={select:vi.fn().mockResolvedValue(columns.map(c=>c.TABLE_NAME==='TGFCAB'&&c.COLUMN_NAME==='VLRNOTA'?{...c,DATA_TYPE}:c))};
  await expect(readCommercialDictionary(g,query,admin)).rejects.toMatchObject({code:'ERP_CONTEXT_REQUIRED'});expect(g.select).toHaveBeenCalledTimes(1);
 });
 it('rejeita TOP histórica ausente ou inválida antes de classificar notas',async()=>{
  const g={select:vi.fn().mockResolvedValueOnce(columns).mockResolvedValueOnce([{APPROVED_DOCUMENT_COUNT:5,COMMERCIAL_DOCUMENT_COUNT:2,MISSING_CONTEXT_COUNT:1}])};
  await expect(readCommercialDictionary(g,query,admin)).rejects.toMatchObject({code:'ERP_CONTEXT_REQUIRED'});expect(g.select).toHaveBeenCalledTimes(2);
 });
 it.each([{HAS_OTHER_ORIGIN:1},{HAS_UNRESOLVED_ORIGIN:1},{HAS_UNLINKED_ITEM:1},{HAS_ITEMS:0},{HAS_CROSS_COMPANY_ORIGIN:1},{MISSING_AMOUNT_COUNT:1},{HAS_STANDARD_ORIGIN:0,HAS_UNRESOLVED_ORIGIN:1}])('não exclui uma ambiguidade silenciosamente nem a chama de faturamento zero: %j',async patch=>{
  const result=await readCommercialDictionary(transport([{...row,...patch}]),query,admin);
  expect(result).toMatchObject({qualificationComplete:false,totals:null});
 });
 it('nota conhecida sem origem padrão não entra na soma aprovada',async()=>{
  const result=await readCommercialDictionary(transport([{...row,HAS_STANDARD_ORIGIN:0,HAS_OTHER_ORIGIN:1}]),query,admin);
  expect(result).toMatchObject({qualificationComplete:true,totals:{documentCount:0,documentAmount:'0'}});
 });
 it('zero só é devolvido após contagem comercial zero e consulta de grupos vazia',async()=>{
  const result=await readCommercialDictionary(transport([],0),query,admin);
  expect(result).toMatchObject({commercialDocumentCount:0,qualificationComplete:true,rows:[],totals:{documentCount:0,documentAmount:'0'}});
 });
 it('resposta agrupada vazia não substitui documentos que a contagem comprovou',async()=>{
  await expect(readCommercialDictionary(transport([],2),query,admin)).rejects.toMatchObject({code:'ERP_INVALID_RESPONSE'});
 });
 it('valor totalmente ausente continua nulo, não zero',async()=>{
  const result=await readCommercialDictionary(transport([{...row,MISSING_AMOUNT_COUNT:2,DOCUMENT_AMOUNT:null}]),query,admin);
  expect(result).toMatchObject({totals:null,rows:[{documentAmount:null,eligible:false}]});
 });
 it.each([10.55,'1e6','NaN','1,50',undefined,'1.1234567891'])('recusa decimal já binário ou incompatível: %s',async DOCUMENT_AMOUNT=>{
  await expect(readCommercialDictionary(transport([{...row,DOCUMENT_AMOUNT}]),query,admin)).rejects.toMatchObject({code:'ERP_INVALID_RESPONSE'});
 });
 it('soma apenas agregados elegíveis com aritmética exata no servidor',async()=>{
  const g=transport([{...row,DOCUMENT_COUNT:1,DOCUMENT_AMOUNT:'0.1'},{...row,CODTIPOPER:1102,DOCUMENT_COUNT:1,DOCUMENT_AMOUNT:'0.2'}]);
  expect(await readCommercialDictionary(g,query,admin)).toMatchObject({totals:{documentCount:2,documentAmount:'0.3'}});
 });
 it('documento histórico sem data fica fora do período, sem bloquear notas datadas ou substituir DTFATUR',async()=>{
  const g=transport([row],2,1);expect(await readCommercialDictionary(g,query,admin)).toMatchObject({qualificationComplete:true,totals:{documentCount:2,documentAmount:'9007199254740993.01'},undatedDocumentCount:1,undatedScope:'all-dates',undatedTreatment:'excluded-without-date-fallback'});
  const sql=g.select.mock.calls[2]![0];expect(sql).toContain('H.DTFATUR IS NULL');expect(sql).not.toContain('TO_DATE');
 });
 it('preserva fração Oracle sem zero à esquerda por normalização exata, mantendo o valor nativo',async()=>{
  expect(await readCommercialDictionary(transport([{...row,DOCUMENT_AMOUNT:'.1'}]),query,admin)).toMatchObject({rows:[{DOCUMENT_AMOUNT:'.1',documentAmount:'0.1'}],totals:{documentAmount:'0.1'}});
 });
 it.each(['2026-09-30','2026-02-30',null])('recusa data observada incompatível: %s',async FIRST_DATE=>{
  await expect(readCommercialDictionary(transport([{...row,FIRST_DATE}]),query,admin)).rejects.toMatchObject({code:'ERP_INVALID_RESPONSE'});
 });
 it('página intermediária não publica subtotal como total do período',async()=>{
  expect(await readCommercialDictionary(transport(),{...query,offset:50},admin)).toMatchObject({offset:50,qualificationComplete:false,totals:null});
 });
 it('rastreia o cabeçalho por MIN de NUNOTA no diagnóstico, sem associar por valor ou nome',async()=>{
  const g=transport([{...row,SAMPLE_DOCUMENT_CODE:76543,DOCUMENT_COUNT:1,DOCUMENT_AMOUNT:'55.56',HAS_UNLINKED_ITEM:1}],1);
  expect(await readCommercialDictionary(g,query,admin)).toMatchObject({qualificationComplete:false,totals:null,rows:[{sampleDocumentCode:76543,documentCount:1,unlinkedItem:true}]});
  expect(g.select.mock.calls[3]![0]).toContain('MIN(NUNOTA) AS SAMPLE_DOCUMENT_CODE');
 });
 it.each([undefined,null,0,1.5,2147483648])('recusa código de amostra inválido sem inventar identificador: %s',async SAMPLE_DOCUMENT_CODE=>{
  await expect(readCommercialDictionary(transport([{...row,SAMPLE_DOCUMENT_CODE}]),query,admin)).rejects.toMatchObject({code:'ERP_INVALID_RESPONSE'});
 });

});
