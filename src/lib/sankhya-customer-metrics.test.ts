import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readCustomerMetrics } from '../../supabase/functions/sankhya-online/customer-metrics';
import { readCommercialDictionary } from '../../supabase/functions/sankhya-online/dictionary';
import { CUSTOMER_INDICATOR_POLICY } from '../../supabase/functions/sankhya-online/policy';
const query={kind:'analytics',section:'customers',companyCode:1,from:'2026-10-01',to:'2026-10-25'};
const admin={role:'administrador' as const};
const day=(s:string)=>Date.parse(s+'T00:00:00Z')/86400000;
const required={TGFPAR:{CODPARC:'NUMBER',CODVEND:'NUMBER',CODEMP:'NUMBER',ATIVO:'VARCHAR2',CLIENTE:'VARCHAR2'},TGFCAB:{CODPARC:'NUMBER',CODEMP:'NUMBER',CODTIPOPER:'NUMBER',CODNAT:'NUMBER',NUNOTA:'NUMBER',DTNEG:'DATE',DHTIPOPER:'DATE',TIPMOV:'VARCHAR2',STATUSNOTA:'VARCHAR2'},TGFTOP:{CODTIPOPER:'NUMBER',DHALTER:'DATE',TIPMOV:'VARCHAR2',BONIFICACAO:'VARCHAR2',GOLDEV:'NUMBER'}};
const opened:DatabaseSync[]=[];
function fixture(){
 const db=new DatabaseSync(':memory:');opened.push(db);
 db.function('TO_DATE',{deterministic:true},(value,_format)=>day(String(value)));
 db.exec('CREATE TABLE USER_TAB_COLUMNS(TABLE_NAME TEXT,COLUMN_NAME TEXT,DATA_TYPE TEXT); CREATE TABLE TGFPAR(CODPARC INTEGER PRIMARY KEY,CODVEND INTEGER,CODEMP INTEGER,ATIVO TEXT,CLIENTE TEXT); CREATE TABLE TGFCAB(NUNOTA INTEGER PRIMARY KEY,CODPARC INTEGER,CODEMP INTEGER,CODTIPOPER INTEGER,CODNAT INTEGER,DTNEG REAL,DHTIPOPER REAL,TIPMOV TEXT,STATUSNOTA TEXT); CREATE TABLE TGFTOP(CODTIPOPER INTEGER,DHALTER REAL,TIPMOV TEXT,BONIFICACAO TEXT,GOLDEV INTEGER);');
 for(const[table,fields]of Object.entries(required))for(const[field,type]of Object.entries(fields))db.prepare('INSERT INTO USER_TAB_COLUMNS VALUES(?,?,?)').run(table,field,type);
 db.prepare("INSERT INTO TGFTOP VALUES(1001,?,'P','N',1)").run(day('2026-07-01'));
 let next=1;
 const customer=(id:number,seller=34,active:string|null='S',company:number|null=1)=>db.prepare("INSERT INTO TGFPAR VALUES(?,?,?,?,'S')").run(id,seller,company,active);
 const order=(id:number,date:string|null,options:{company?:number;version?:string;type?:string;operation?:number;nature?:number;status?:string}={})=>db.prepare('INSERT INTO TGFCAB VALUES(?,?,?,?,?,?,?,?,?)').run(next++,id,options.company??1,options.operation??1001,options.nature??10100000,date===null?null:day(date),day(options.version??'2026-07-01'),options.type??'P',options.status??'L');
 const g={select:vi.fn(async(sql:string,limit:number)=>{
  expect(limit).toBeLessThanOrEqual(50);
  const converted=sql.replace(/OFFSET (\d+) ROWS FETCH NEXT (\d+) ROWS ONLY/g,(_m,o,n)=>`LIMIT ${n} OFFSET ${o}`).replace(/FETCH FIRST (\d+) ROWS ONLY/g,'LIMIT $1');
  return db.prepare(converted).all() as Record<string,unknown>[];
 })};return{db,customer,order,g};
}
afterEach(()=>{for(const db of opened.splice(0))db.close();});
describe('clientes novos, ativos e cobertura definidos pelo usuário',()=>{
 it('não confunde primeira compra, cadastro ativo e atividade concluída',()=>{
  expect(CUSTOMER_INDICATOR_POLICY).toMatchObject({newCustomer:{event:'first-recorded-standard-purchase',dateField:'DTNEG'},activeCustomer:{field:'TGFPAR.ATIVO',value:'S',purchaseRequired:false},coverage:{kind:'activities',status:'Realizada',dateField:'data.date',distinctCustomers:true}});
 });
 it('calcula a primeira compra antes do período; recompra não vira novo cliente',async()=>{
  const f=fixture();f.customer(1);f.order(1,'2026-09-30');f.order(1,'2026-10-05');f.customer(2);f.order(2,'2026-10-07');
  expect(await readCustomerMetrics(f.g,query,admin)).toMatchObject({totals:{customerCount:2,activeCustomerCount:2,newCustomerCount:1},sellerAttribution:'current-CODVEND'});
 });
 it('cadastro ativo sem qualquer pedido conta como ativo, mas não como novo',async()=>{
  const f=fixture();f.customer(1);expect(await readCustomerMetrics(f.g,query,admin)).toMatchObject({totals:{customerCount:1,activeCustomerCount:1,newCustomerCount:0}});
 });
 it('cliente hoje inativo pode ter sua primeira compra no período sem virar ativo',async()=>{
  const f=fixture();f.customer(1,34,'N');f.order(1,'2026-10-08');expect(await readCustomerMetrics(f.g,query,admin)).toMatchObject({totals:{activeCustomerCount:0,newCustomerCount:1}});
 });
 it.each([{type:'V'},{operation:1003},{nature:60300000},{status:'P'}])('não usa movimento fora da venda padrão: %j',async options=>{
  const f=fixture();f.customer(1);f.order(1,'2026-10-05',options);expect(await readCustomerMetrics(f.g,query,admin)).toMatchObject({totals:{newCustomerCount:0}});
 });
 it('confere a versão exata da TOP, não a configuração mais recente',async()=>{
  const f=fixture();f.db.prepare("INSERT INTO TGFTOP VALUES(1001,?,'P','S',1)").run(day('2026-01-01'));f.customer(1);f.order(1,'2026-09-01',{version:'2026-01-01'});f.order(1,'2026-10-10');
  expect(await readCustomerMetrics(f.g,query,admin)).toMatchObject({totals:{newCustomerCount:1}});
 });
 it('contexto histórico desconhecido anterior não autoriza primeira compra ou zero',async()=>{
  const f=fixture();f.customer(1);f.order(1,'2026-09-01',{version:'2025-01-01'});f.order(1,'2026-10-10');expect(await readCustomerMetrics(f.g,query,admin)).toMatchObject({totals:{newKnown:0,newUnknown:1,newCustomerCount:null}});
 });
 it('compra válida anterior já prova que não é novo, mesmo com outra data ausente',async()=>{
  const f=fixture();f.customer(1);f.order(1,'2026-09-01');f.order(1,null);expect(await readCustomerMetrics(f.g,query,admin)).toMatchObject({totals:{newUnknown:0,newCustomerCount:0}});
 });
 it('histórico sem data não vira aquisição datada por cadastro ou zero',async()=>{
  const f=fixture();f.customer(1);f.order(1,null);expect(await readCustomerMetrics(f.g,query,admin)).toMatchObject({totals:{activeCustomerCount:1,newUnknown:1,newCustomerCount:null}});
 });
 it('TOP desconhecida somente no período mantém a aquisição pendente',async()=>{
  const f=fixture();f.customer(1);f.order(1,'2026-10-10',{version:'2025-01-01'});expect(await readCustomerMetrics(f.g,query,admin)).toMatchObject({totals:{newCustomerCount:null}});
 });
 it('incerteza dentro do mesmo período não altera a primeira compra do período já comprovada',async()=>{
  const f=fixture();f.customer(1);f.order(1,'2026-10-02',{version:'2025-01-01'});f.order(1,'2026-10-10');expect(await readCustomerMetrics(f.g,query,admin)).toMatchObject({totals:{newUnknown:0,newCustomerCount:1}});
 });
 it('considera o histórico1/4 autorizado antes de filtrar o período da carteira selecionada',async()=>{
  const f=fixture();f.customer(1,34,'S',null);f.order(1,'2026-10-05',{company:4});f.order(1,'2026-10-09');expect(await readCustomerMetrics(f.g,{...query,from:'2026-10-08'},admin)).toMatchObject({historyCompanyCodes:[1,4],totals:{newCustomerCount:0}});
 });
 it('não amplia a filial ou a carteira de um vendedor pelo histórico',async()=>{
  const f=fixture();f.customer(1,12);f.order(1,'2026-10-09');f.customer(2,34);f.order(2,'2026-10-10');f.customer(3,12,'S',4);f.order(3,'2026-10-11',{company:4});
  expect(await readCustomerMetrics(f.g,query,{role:'vendedor',sellerCode:12,companyCodes:[1]})).toMatchObject({historyCompanyCodes:[1],totals:{customerCount:1,newCustomerCount:1}});
 });
 it('gestor vê somente o próprio código e a equipe privada explícita',async()=>{
  const f=fixture();for(const id of[34,6,7,12]){f.customer(id,id);f.order(id,'2026-10-10');}expect(await readCustomerMetrics(f.g,query,{role:'gestor',sellerCode:34,companyCodes:[1],teamSellerCodes:[6,7]})).toMatchObject({totals:{customerCount:3},rows:[{sellerCode:6},{sellerCode:7},{sellerCode:34}]});
 });
 it('atribui o indicador ao CODVEND atual sem criar vínculo Auth por nome',async()=>{
  const f=fixture();f.customer(1,7);f.order(1,'2026-10-01');expect(await readCustomerMetrics(f.g,query,admin)).toMatchObject({rows:[{sellerCode:7,newCustomerCount:1}]});
 });
 it.each([null,'X'])('ATIVO desconhecido não é inativo nem zero: %s',async active=>{
  const f=fixture();f.customer(1,34,active);expect(await readCustomerMetrics(f.g,query,admin)).toMatchObject({totals:{activeKnown:0,activeUnknown:1,activeCustomerCount:null}});
 });
 it('cobertura ERP fica nula sem vínculo persistível; não transforma falta de fonte em zero',async()=>{
  const f=fixture();f.customer(1);expect(await readCustomerMetrics(f.g,query,admin)).toMatchObject({coverage:{available:false,value:null,numerator:null,denominator:1,reason:'ERP_ACTIVITY_REFERENCE_UNAVAILABLE'}});
 });
 it('carteira realmente vazia tem contagens observadas zero',async()=>{
  const f=fixture();expect(await readCustomerMetrics(f.g,query,admin)).toMatchObject({totals:{customerCount:0,activeCustomerCount:0,newCustomerCount:0},rows:[],hasMore:false});
 });
 it.each([{companyCode:3},{from:'2026-02-30'},{to:'2026-09-30'},{from:'2024-01-01'},{offset:-1},{sellerCode:12},{role:'administrador'},{activities:[]},{sql:'SELECT 1'}])('recusa parâmetros e escopo fornecidos pelo navegador: %j',async patch=>{
  const f=fixture();await expect(readCustomerMetrics(f.g,{...query,...patch},admin)).rejects.toBeDefined();expect(f.g.select).not.toHaveBeenCalled();
 });
 it.each(['vendedor','gestor'] as const)('o diagnóstico administrativo não é liberado ao papel %s',async role=>{
  const f=fixture();await expect(readCommercialDictionary(f.g,query,{role,sellerCode:34,companyCodes:[1]})).rejects.toMatchObject({code:'ERP_IDENTITY_REQUIRED'});expect(f.g.select).not.toHaveBeenCalled();
 });
 it('falta de estrutura não vira carteira vazia',async()=>{
  const f=fixture();f.db.exec("DELETE FROM USER_TAB_COLUMNS WHERE TABLE_NAME='TGFCAB' AND COLUMN_NAME='DTNEG'");await expect(readCustomerMetrics(f.g,query,admin)).rejects.toMatchObject({code:'ERP_CONTEXT_REQUIRED'});expect(f.g.select).toHaveBeenCalledTimes(1);
 });
});
