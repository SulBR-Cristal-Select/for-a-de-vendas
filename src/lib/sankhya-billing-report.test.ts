import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readBillingReport, type BillingReportInput } from '../../supabase/functions/sankhya-online/history';
import type { ReadScope } from '../../supabase/functions/sankhya-online/read-model';
import { sumERPDecimals } from './erp-decimal';
const query: BillingReportInput={resource:'invoices',offset:0,limit:10};
const admin: ReadScope={role:'administrador'};
const opened:DatabaseSync[]=[];
// SQL estrutural executado em SQLite com adaptação explícita, não Oracle nem login comercial.
function fixture() {
  const db = new DatabaseSync(':memory:'); opened.push(db);
  db.exec(`CREATE TABLE USER_TAB_COLUMNS(TABLE_NAME TEXT,COLUMN_NAME TEXT,DATA_TYPE TEXT);
    CREATE TABLE TGFCAB(NUNOTA INTEGER,NUMNOTA INTEGER,CODEMP INTEGER,CODPARC INTEGER,CODVEND INTEGER,TIPMOV TEXT,STATUSNOTA TEXT,DTNEG TEXT,VLRNOTA TEXT,CODTIPOPER INTEGER,DHTIPOPER TEXT,CODTIPVENDA INTEGER,DHTIPVENDA TEXT,CODNAT INTEGER,DTFATUR TEXT,STATUSNFE TEXT);
    CREATE TABLE TGFPAR(CODPARC INTEGER,CODEMP INTEGER,CODVEND INTEGER,CLIENTE TEXT,RAZAOSOCIAL TEXT,ATIVO TEXT);
    CREATE TABLE TGFVEN(CODVEND INTEGER,APELIDO TEXT);
    CREATE TABLE TGFTOP(CODTIPOPER INTEGER,DHALTER TEXT,TIPMOV TEXT,BONIFICACAO TEXT,GOLDEV INTEGER,DESCROPER TEXT,GOLSINAL INTEGER);
    CREATE TABLE TGFTPV(CODTIPVENDA INTEGER,DHALTER TEXT);
    CREATE TABLE TGFVAR(NUNOTA INTEGER,NUNOTAORIG INTEGER,SEQUENCIA INTEGER,SEQUENCIAORIG INTEGER); CREATE TABLE TGFITE(NUNOTA INTEGER,SEQUENCIA INTEGER);
    INSERT INTO TGFTOP VALUES(1001,'2026-01-01','P','N',1,'Venda padrão',-1); INSERT INTO TGFTOP VALUES(1101,'2026-01-01','V','N',1,'Venda fiscal',-1),(1102,'2026-01-01','V','N',1,'Outra TOP fiscal',-1),(1003,'2026-01-01','P','N',1,'Outra venda',-1);
    INSERT INTO TGFVEN VALUES(34,'Homônimo'),(12,'Homônimo'),(99,'Outro');
    INSERT INTO TGFPAR VALUES(1,NULL,34,'S','Cliente homônimo','N'),(2,NULL,12,'S','Cliente homônimo','S'),(3,NULL,99,'S','Fora da equipe','S');`);
  const required: Record<string,Record<string,string>> = {
    TGFCAB:{CODEMP:'NUMBER',NUNOTA:'NUMBER',CODTIPOPER:'NUMBER',DHTIPOPER:'DATE',CODNAT:'NUMBER',DTNEG:'DATE',TIPMOV:'VARCHAR2',STATUSNOTA:'VARCHAR2',VLRNOTA:'FLOAT',CODPARC:'NUMBER',CODVEND:'NUMBER',DTFATUR:'DATE',STATUSNFE:'VARCHAR2'},
    TGFTOP:{CODTIPOPER:'NUMBER',DHALTER:'DATE',TIPMOV:'VARCHAR2',BONIFICACAO:'VARCHAR2',GOLDEV:'NUMBER',GOLSINAL:'NUMBER'},
    TGFVAR:{NUNOTA:'NUMBER',NUNOTAORIG:'NUMBER',SEQUENCIA:'NUMBER',SEQUENCIAORIG:'NUMBER'},TGFITE:{NUNOTA:'NUMBER',SEQUENCIA:'NUMBER'},
    TGFPAR:{CODPARC:'NUMBER',CODVEND:'NUMBER',CODEMP:'NUMBER',CLIENTE:'VARCHAR2'},
  };
  for (const [table, columns] of Object.entries(required)) for(const [name,type] of Object.entries(columns)) db.prepare('INSERT INTO USER_TAB_COLUMNS VALUES(?,?,?)').run(table,name,type);
  db.function('TO_DATE', (v:any,_format:any)=>v);
  db.function('TO_CHAR',{varargs:true},(v:any,format:any)=> v === null ? null : format==='YYYY-MM-DD' ? String(v).slice(0,10) : String(v));
  db.function('TRANSLATE',(v:any,_from:any,_to:any)=>String(v).normalize('NFD').replace(/[\u0300-\u036f]/g,''));
  db.function('ASCIISTR',(v:any)=>v);
  db.aggregate('ERP_SUM',{start:'',step:(a:string,v:any)=>v===null?a:a?sumERPDecimals([a,String(v)]):String(v),result:(a:string)=>a||null});
  function order(id:number, amount:string|null='10', options:Record<string,any>={}) {
    db.prepare('INSERT INTO TGFCAB VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id,id,options['company']??1,options['customer']??1,options['seller']??34,options['movement']??'V',options['status']??'L',Object.hasOwn(options,'date')?options['date']:'2026-10-25',amount,options['operation']??1101,options['version']??'2026-01-01',null,null,options['nature']??10100000,Object.hasOwn(options,'billingDate')?options['billingDate']:'2026-10-25',options['fiscalStatus']??'A');
  }
  const g = {select:vi.fn(async(sql:string,limit:number)=>{
    expect(limit).toBeLessThanOrEqual(50);
    const adapted = sql.replace(/SUM\(C\.VLRNOTA\)/g,'ERP_SUM(C.VLRNOTA)').replace(/<TO_DATE\(('(?:[^']|'')*)','YYYY-MM-DD'\)\+1/g,"<date($1','+1 day')")
      .replace(/OFFSET (\d+) ROWS FETCH NEXT (\d+) ROWS ONLY/g,(_m,o,n)=>`LIMIT ${n} OFFSET ${o}`).replace(/FETCH FIRST (\d+) ROWS ONLY/g,'LIMIT $1');
    return db.prepare(adapted).all() as Record<string,unknown>[];
  })};
  function origin(invoice:number,id=invoice+1000,options:Record<string,any>={}) {
    order(id,'99999',{movement:'P',operation:1001,...options});
    db.prepare('INSERT INTO TGFITE VALUES(?,1)').run(id);
    db.prepare('INSERT INTO TGFITE VALUES(?,1)').run(invoice);
    db.prepare('INSERT INTO TGFVAR VALUES(?,?,1,1)').run(invoice,id);
  }
  return {db,order,origin,g};
}
afterEach(()=>{for(const db of opened.splice(0))db.close();});
describe('listagem fiscal com a mesma qualificação do diagnóstico',()=>{
 it('conta cada nota uma vez, mesmo ligada a vários itens/pedidos padrão; não soma os pedidos',async()=>{
  const f=fixture();f.order(1,'100.01');f.origin(1);f.origin(1,2001);const r=await readBillingReport(f.g,query,admin);expect(r).toMatchObject({total:1,summary:{documentCount:1,documentAmount:'100.01'},billingPolicy:{movement:'V',dateField:'DTFATUR'},linkMode:'direct-item-reference',quantitiesAllocated:false,ordersAdded:false});expect(r.items[0]).toMatchObject({id:'sankhya:invoice:1',total:'100.01',invoiced:'100.01',nf:'1',erp:{movement:'V',fiscalStatusCode:'A',dateField:'DTFATUR'}});
 });
 it('valores acima do inteiro seguro continuam texto exato',async()=>{const f=fixture();f.order(1,'9007199254740993.01');f.origin(1);expect((await readBillingReport(f.g,query,admin)).items[0]?.['total']).toBe('9007199254740993.01');});
 it('KPIs são integrais e janelas de até50; registros não vão para o workspace',async()=>{const f=fixture();for(let i=1;i<=65;i++){f.order(i,'0.1');f.origin(i);}const r=await readBillingReport(f.g,query,admin);expect(r.items).toHaveLength(10);expect(r.summary.documentAmount).toBe('6.5');expect(r.total).toBe(65);expect(f.g.select.mock.calls.every(c=>c[1]<=50)).toBe(true);});
 it.each([{movement:'P'},{status:'P'},{fiscalStatus:'M'},{fiscalStatus:'R'},{fiscalStatus:'D'},{company:3}])('não inclui documento fora da aprovação: %j',async options=>{const f=fixture();f.order(1,'900',options);f.origin(1);expect((await readBillingReport(f.g,query,admin)).total).toBe(0);});
 it('DTFATUR decide o período, sem fallback por DTNEG e sem atribuir data à nota não datada',async()=>{
  const f=fixture();f.order(1,'10',{date:'2026-09-01',billingDate:'2026-10-25'});f.origin(1);f.order(2,'900',{date:'2026-10-25',billingDate:null});f.origin(2);f.order(3,'900',{billingDate:'2026-10-26'});f.origin(3);
  const r=await readBillingReport(f.g,{...query,from:'2026-10-01',to:'2026-10-25'},admin);expect(r.summary.documentAmount).toBe('10');expect(r.items[0]?.['date']).toBe('2026-10-25');expect(r).toMatchObject({undatedTreatment:'excluded-without-date-fallback'});
 });
 it('não presume uma TOPV universal nem usa a versão mais recente',async()=>{const f=fixture();f.order(1,'10',{operation:1102});f.origin(1);f.db.exec("INSERT INTO TGFTOP VALUES(1102,'2027-01-01','V','S',-1,'Futura',1)");expect((await readBillingReport(f.g,query,admin)).summary.documentAmount).toBe('10');});
 it('exclui notas conhecidas como não comerciais',async()=>{const f=fixture();f.order(1);f.origin(1);f.db.exec('UPDATE TGFTOP SET GOLSINAL=0 WHERE CODTIPOPER=1101');expect((await readBillingReport(f.g,query,admin)).total).toBe(0);});
 it('origem não padrão comprovada não vira venda padrão por nome da operação',async()=>{const f=fixture();f.order(1);f.origin(1,1001,{operation:1003});expect((await readBillingReport(f.g,query,admin)).total).toBe(0);});
 it.each(['mista','indireta','semItemOrigem','itemDestinoSolto','entreFiliais','valorAusente'])('não produz zero/total conclusivo em origem incompleta: %s',async kind=>{
  const f=fixture();f.order(1,kind==='valorAusente'?null:'10');f.origin(1);
  if(kind==='mista')f.origin(1,2001,{operation:1003});
  if(kind==='indireta')f.db.exec("UPDATE TGFCAB SET TIPMOV='V' WHERE NUNOTA=1001");
  if(kind==='semItemOrigem')f.db.exec('DELETE FROM TGFITE WHERE NUNOTA=1001');
  if(kind==='itemDestinoSolto')f.db.exec('INSERT INTO TGFITE VALUES(1,2)');
  if(kind==='entreFiliais')f.db.exec('UPDATE TGFCAB SET CODEMP=4 WHERE NUNOTA=1001');
  await expect(readBillingReport(f.g,query,admin)).rejects.toMatchObject({code:'ERP_CONTEXT_REQUIRED'});
 });
 it('TOP fiscal ausente falha fechada antes de classificar',async()=>{const f=fixture();f.order(1,'10',{version:'2000-01-01'});f.origin(1);await expect(readBillingReport(f.g,query,admin)).rejects.toMatchObject({code:'ERP_CONTEXT_REQUIRED'});});
 it.each(['seller','customer'] as const)('agrupa por código %s e mantém resumo de notas, não grupos ou nomes',async groupBy=>{const f=fixture();f.order(1);f.origin(1);f.order(2,'20',{customer:2,seller:12});f.origin(2);const r=await readBillingReport(f.g,{...query,groupBy},admin);expect(r.total).toBe(2);expect(r.summary.documentAmount).toBe('30');expect(new Set(r.items.map(x=>x['id'])).size).toBe(2);});
 it('preserva carteira atual, inativos e equipe explícita; vendedor documental não autentica',async()=>{const f=fixture();f.order(1,'10',{seller:99});f.origin(1);f.order(2,'20',{customer:2,seller:12});f.origin(2);const r=await readBillingReport(f.g,query,{role:'vendedor',sellerCode:34,companyCodes:[1]});expect(r.total).toBe(1);expect(r.items[0]?.['sellerCode']).toBe(99);expect((await readBillingReport(f.g,query,{role:'gestor',sellerCode:34,companyCodes:[1],teamSellerCodes:[12]})).total).toBe(2);});
 it('filtra por códigos/datas/busca e ordena por DTFATUR ou identificação correta',async()=>{const f=fixture();f.order(1);f.origin(1);f.order(2,'20',{customer:2,seller:12});f.origin(2);await readBillingReport(f.g,{...query,customerId:'sankhya:customer:1',sellerCode:34,from:'2026-10-01',to:'2026-10-25',search:'homonimo',sort:'number'},admin);expect(f.g.select.mock.calls.at(-1)![0]).toContain('ORDER BY C.NUNOTA DESC');expect(f.g.select.mock.calls.at(-1)![0]).toContain('C.DTFATUR>=TO_DATE');});
 it.each([{resource:'orders'},{sellerCode:0},{companyCode:3},{groupBy:'fiscal'},{status:'A'},{from:'2026-02-30'},{sort:'__proto__'},{sql:'SELECT 1'},{limit:51}])('recusa entrada inválida antes do ERP: %j',async patch=>{const f=fixture();await expect(readBillingReport(f.g,{...query,...patch} as BillingReportInput,admin)).rejects.toBeDefined();expect(f.g.select).not.toHaveBeenCalled();});
});
