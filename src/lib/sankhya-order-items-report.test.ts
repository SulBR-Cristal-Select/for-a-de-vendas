import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readOrderItemsReport, type OrderItemsReportInput } from '../../supabase/functions/sankhya-online/history';
import type { ReadScope } from '../../supabase/functions/sankhya-online/read-model';
import { erpDecimal, formatERPAmount, sumERPDecimals } from './erp-decimal';
const query: OrderItemsReportInput = { resource:'orders',offset:0,limit:10 };
const admin: ReadScope = { role:'administrador' };
const opened: DatabaseSync[] = [];
// Ensaio estrutural SQLite adaptado. Não é execução Oracle nem homologação Auth/ERP.
function fixture() {
  const db = new DatabaseSync(':memory:'); opened.push(db);
  db.exec(`CREATE TABLE USER_TAB_COLUMNS(TABLE_NAME TEXT,COLUMN_NAME TEXT,DATA_TYPE TEXT);
    CREATE TABLE TGFCAB(NUNOTA INTEGER,NUMNOTA INTEGER,CODEMP INTEGER,CODPARC INTEGER,CODVEND INTEGER,TIPMOV TEXT,STATUSNOTA TEXT,DTNEG TEXT,VLRNOTA TEXT,CODTIPOPER INTEGER,DHTIPOPER TEXT,CODTIPVENDA INTEGER,DHTIPVENDA TEXT,CODNAT INTEGER);
    CREATE TABLE TGFPAR(CODPARC INTEGER,CODEMP INTEGER,CODVEND INTEGER,CLIENTE TEXT,RAZAOSOCIAL TEXT,ATIVO TEXT);
    CREATE TABLE TGFVEN(CODVEND INTEGER,APELIDO TEXT);
    CREATE TABLE TGFTOP(CODTIPOPER INTEGER,DHALTER TEXT,TIPMOV TEXT,BONIFICACAO TEXT,GOLDEV INTEGER,DESCROPER TEXT);
    CREATE TABLE TGFTPV(CODTIPVENDA INTEGER,DHALTER TEXT);
    CREATE TABLE TGFVAR(NUNOTA INTEGER,NUNOTAORIG INTEGER);
    CREATE TABLE TGFITE(NUNOTA INTEGER,SEQUENCIA INTEGER,CODEMP INTEGER,CODPROD INTEGER,CODVOL TEXT,QTDNEG TEXT,VLRUNIT TEXT,VLRTOT TEXT);
    CREATE TABLE TGFPRO(CODPROD INTEGER,DESCRPROD TEXT);
    INSERT INTO TGFPRO VALUES(11240,'Produto histórico');
    INSERT INTO TGFTOP VALUES(1001,'2026-01-01','P','N',1,'Venda padrão');
    INSERT INTO TGFVEN VALUES(34,'Homônimo'),(12,'Homônimo'),(99,'Outro');
    INSERT INTO TGFPAR VALUES(1,NULL,34,'S','Cliente homônimo','N'),(2,NULL,12,'S','Cliente homônimo','S'),(3,NULL,99,'S','Fora da equipe','S');`);
  const required: Record<string,Record<string,string>> = {
    TGFCAB:{NUMNOTA:'NUMBER',CODEMP:'NUMBER',NUNOTA:'NUMBER',CODTIPOPER:'NUMBER',DHTIPOPER:'DATE',CODNAT:'NUMBER',DTNEG:'DATE',TIPMOV:'VARCHAR2',STATUSNOTA:'VARCHAR2',VLRNOTA:'FLOAT',CODPARC:'NUMBER',CODVEND:'NUMBER'},
    TGFITE:{NUNOTA:'NUMBER',SEQUENCIA:'NUMBER',CODEMP:'NUMBER',CODPROD:'NUMBER',CODVOL:'VARCHAR2',QTDNEG:'FLOAT',VLRUNIT:'FLOAT',VLRTOT:'FLOAT'},
    TGFPRO:{CODPROD:'NUMBER',DESCRPROD:'VARCHAR2'},TGFVEN:{CODVEND:'NUMBER',APELIDO:'VARCHAR2'},
    TGFTOP:{CODTIPOPER:'NUMBER',DHALTER:'DATE',TIPMOV:'VARCHAR2',BONIFICACAO:'VARCHAR2',GOLDEV:'NUMBER'},
    TGFPAR:{RAZAOSOCIAL:'VARCHAR2',CODPARC:'NUMBER',CODVEND:'NUMBER',CODEMP:'NUMBER',CLIENTE:'VARCHAR2'},
  };
  for (const [table, columns] of Object.entries(required)) for(const [name,type] of Object.entries(columns)) db.prepare('INSERT INTO USER_TAB_COLUMNS VALUES(?,?,?)').run(table,name,type);
  db.function('TO_DATE', (v:any,_format:any)=>v);
  db.function('TO_CHAR',{varargs:true},(v:any,format:any)=> v === null ? null : format==='YYYY-MM-DD' ? String(v).slice(0,10) : String(v));
  db.function('TRANSLATE',(v:any,_from:any,_to:any)=>String(v).normalize('NFD').replace(/[\u0300-\u036f]/g,''));
  db.function('ASCIISTR',(v:any)=>v);
  db.aggregate('ERP_SUM',{start:'',step:(a:string,v:any)=>v===null?a:a?sumERPDecimals([a,String(v)]):String(v),result:(a:string)=>a||null});
  function order(id:number, amount:string|null='10', options:Record<string,any>={}) {
    db.prepare('INSERT INTO TGFCAB VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id,id,options['company']??1,options['customer']??1,options['seller']??34,options['movement']??'P',options['status']??'L',Object.hasOwn(options,'date')?options['date']:'2026-10-25',amount,options['operation']??1001,options['version']??'2026-01-01',null,null,options['nature']??10100000);
  }
  const g = {select:vi.fn(async(sql:string,limit:number)=>{
    expect(limit).toBeLessThanOrEqual(50);
    const adapted = sql.replace(/SUM\(I\.VLRTOT\)/g,'ERP_SUM(I.VLRTOT)').replace(/SUM\(C\.VLRNOTA\)/g,'ERP_SUM(C.VLRNOTA)').replace(/<TO_DATE\(('(?:[^']|'')*)','YYYY-MM-DD'\)\+1/g,"<date($1','+1 day')")
      .replace(/OFFSET (\d+) ROWS FETCH NEXT (\d+) ROWS ONLY/g,(_m,o,n)=>`LIMIT ${n} OFFSET ${o}`).replace(/FETCH FIRST (\d+) ROWS ONLY/g,'LIMIT $1');
    return db.prepare(adapted).all() as Record<string,unknown>[];
  })};
  function item(id:number,sequence=1,o:Record<string,any>={}){db.prepare('INSERT INTO TGFITE VALUES(?,?,?,?,?,?,?,?)').run(id,sequence,o['company']??1,o['product']??11240,Object.hasOwn(o,'unit')?o['unit']:'PC',Object.hasOwn(o,'qty')?o['qty']:'2',Object.hasOwn(o,'price')?o['price']:'0.1',Object.hasOwn(o,'total')?o['total']:'0.99');}
  return {db,order,item,g};
}
afterEach(()=>{for(const db of opened.splice(0))db.close();});
describe('Produtos por pedidos: linhas nativas e venda padrão',()=>{
 it('preserva subtotal nativo diferente de preço×quantidade e não soma cabeçalho',async()=>{const f=fixture();f.order(1,'999');for(let n=1;n<=65;n++)f.item(1,n);const r=await readOrderItemsReport(f.g,query,admin);expect(r).toMatchObject({total:65,totalWithoutSearch:65,summary:{lineCount:65,subtotal:'64.35',subtotalField:'TGFITE.VLRTOT',quantityField:'TGFITE.QTDNEG',unitPriceField:'TGFITE.VLRUNIT',calculatedSubtotal:false,headerAmountsAdded:false}});expect(r.items).toHaveLength(10);expect(r.items[0]).toMatchObject({id:'sankhya:order:1:item:65',price:'0.1',qty:'2',total:'0.99',unit:'PC',productId:'sankhya:product:11240'});expect(f.g.select.mock.calls.every(c=>c[1]<=50)).toBe(true);expect(f.g.select.mock.calls.at(-1)![0]).not.toContain('I.VLRUNIT*');});
 it('não funde duas sequências do mesmo produto, nem unidades diferentes',async()=>{const f=fixture();f.order(1);f.item(1,1);f.item(1,3,{unit:'CX',qty:'0.12345',price:'1.123456789',total:'7.005'});const r=await readOrderItemsReport(f.g,query,admin);expect(new Set(r.items.map(i=>i.id)).size).toBe(2);expect(r.items[0]).toMatchObject({qty:'0.12345',price:'1.123456789',total:'7.005',unit:'CX'});expect(r.summary.subtotal).toBe('7.995');});
 it.each([{movement:'V'},{operation:1003},{nature:60300000},{status:'P'},{company:3}])('exclui documento fora da venda padrão: %j',async options=>{const f=fixture();f.order(1);f.item(1);f.order(2,'900',options);f.item(2,1,{company:options['company']??1});expect((await readOrderItemsReport(f.g,query,admin)).total).toBe(1);});
 it('TOP histórica exata: bonificação/devolução não entram, nem bloqueiam por item de outro escopo',async()=>{const f=fixture();f.db.exec("INSERT INTO TGFTOP VALUES(1001,'2025-01-01','P','S',1,'Bonificação');INSERT INTO TGFTOP VALUES(1001,'2024-01-01','P','N',-1,'Devolução')");f.order(1);f.item(1);f.order(2,'800',{version:'2025-01-01'});f.item(2,1,{company:4});f.order(3,'700',{version:'2024-01-01'});f.item(3);expect((await readOrderItemsReport(f.g,query,admin)).total).toBe(1);});
 it('TOP ausente ou empresa do item cruzada impedem conclusão, não retornam zero',async()=>{for(const broken of ['top','company']){const f=fixture();f.order(1,'10',broken==='top'?{version:'2020-01-01'}:{});f.item(1,1,broken==='company'?{company:4}:{});await expect(readOrderItemsReport(f.g,query,admin)).rejects.toMatchObject({code:'ERP_CONTEXT_REQUIRED'});}});
 it('carteira é atual; compra de cadastro hoje inativo permanece, vendedor documental não autentica',async()=>{const f=fixture();f.order(1,'10',{customer:1,seller:99});f.item(1);f.order(2,'20',{customer:2,seller:12});f.item(2);expect((await readOrderItemsReport(f.g,query,{role:'vendedor',sellerCode:34,companyCodes:[1]})).items[0]).toMatchObject({sellerCode:99});expect((await readOrderItemsReport(f.g,query,{role:'gestor',sellerCode:34,companyCodes:[1],teamSellerCodes:[12]})).total).toBe(2);});
 it('filtra data/cliente/vendedor e busca por produto sem retirar o escopo',async()=>{const f=fixture();f.order(1,'10',{date:'2026-10-01'});f.item(1);f.order(2,'10',{date:'2026-10-25'});f.item(2);f.order(3,'10',{date:'2026-10-26'});f.item(3);const r=await readOrderItemsReport(f.g,{...query,from:'2026-10-01',to:'2026-10-25',customerId:'sankhya:customer:1',sellerCode:34,search:'histórico'},admin);expect(r.total).toBe(2);expect(r.totalWithoutSearch).toBe(2);for(const [sql]of f.g.select.mock.calls.slice(1)){expect(sql).toContain('P.CODPARC=1');expect(sql).toContain('C.CODVEND=34');}});
 it('separa filial4 e desempata por NUNOTA/sequência sem produto ativo obrigatório',async()=>{const f=fixture();f.order(1);f.item(1);f.order(2,'20',{company:4});f.item(2,1,{company:4});const r=await readOrderItemsReport(f.g,{...query,companyCode:4,sort:'qty',direction:'asc'},admin);expect(r.total).toBe(1);expect(r.companyCodes).toEqual([4]);const sql=f.g.select.mock.calls.at(-1)![0];expect(sql).toContain('C.NUNOTA ASC NULLS LAST,I.SEQUENCIA ASC NULLS LAST');expect(sql).not.toContain('PR.ATIVO');});
 it('zero observado é zero; subtotal ausente e preço/quantidade ausentes não são recalculados',async()=>{const f=fixture();expect((await readOrderItemsReport(f.g,query,admin)).summary.subtotal).toBe('0');f.order(1);f.item(1,1,{price:null,qty:null,total:null,unit:null});const r=await readOrderItemsReport(f.g,query,admin);expect(r.items[0]).toMatchObject({price:null,qty:null,total:null,unit:null});expect(r.summary).toMatchObject({missingSubtotalCount:1,subtotal:null});});
 it('recusa multiplicação de linhas causada por join',async()=>{const f=fixture();f.order(1);f.item(1);f.db.exec("INSERT INTO TGFPRO VALUES(11240,'Duplicado')");await expect(readOrderItemsReport(f.g,query,admin)).rejects.toMatchObject({code:'ERP_INVALID_RESPONSE'});});
 it.each(['QTDNEG','VLRUNIT','VLRTOT'])('não aceita tipo binário sem contrato em %s',async col=>{const f=fixture();f.db.prepare("UPDATE USER_TAB_COLUMNS SET DATA_TYPE='BINARY_FLOAT' WHERE TABLE_NAME='TGFITE' AND COLUMN_NAME=?").run(col);await expect(readOrderItemsReport(f.g,query,admin)).rejects.toMatchObject({code:'ERP_CONTEXT_REQUIRED'});});
 it.each([{resource:'invoices'},{groupBy:'seller'},{sellerCode:0},{customerId:'manual'},{status:'Concluído'},{from:'2026-02-30'},{sort:'__proto__'},{offset:-1},{limit:51},{sql:'SELECT 1'},{search:'a;DROP'},{from:'2026-10-26',to:'2026-10-25'}])('rejeita entrada antes do ERP: %j',async bad=>{const f=fixture();await expect(readOrderItemsReport(f.g,{...query,...bad} as OrderItemsReportInput,admin)).rejects.toBeDefined();expect(f.g.select).not.toHaveBeenCalled();});
 it('selecionar vendedor/filial não amplia a autorização',async()=>{const f=fixture(),scope:ReadScope={role:'vendedor',sellerCode:34,companyCodes:[1]};await expect(readOrderItemsReport(f.g,{...query,sellerCode:12},scope)).rejects.toMatchObject({code:'ERP_SCOPE_FORBIDDEN'});await expect(readOrderItemsReport(f.g,{...query,companyCode:4},scope)).rejects.toMatchObject({code:'ERP_SCOPE_FORBIDDEN'});expect(f.g.select).not.toHaveBeenCalled();});
});
