import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readSalesReport, type SalesReportInput } from '../../supabase/functions/sankhya-online/history';
import type { ReadScope } from '../../supabase/functions/sankhya-online/read-model';
import { erpDecimal, formatERPAmount, sumERPDecimals } from './erp-decimal';
const query: SalesReportInput = { resource:'orders',offset:0,limit:10 };
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
    CREATE TABLE TGFITE(NUNOTA INTEGER,CODEMP INTEGER,CODPROD INTEGER,CODVOL TEXT);
    INSERT INTO TGFTOP VALUES(1001,'2026-01-01','P','N',1,'Venda padrão');
    INSERT INTO TGFVEN VALUES(34,'Homônimo'),(12,'Homônimo'),(99,'Outro');
    INSERT INTO TGFPAR VALUES(1,NULL,34,'S','Cliente homônimo','N'),(2,NULL,12,'S','Cliente homônimo','S'),(3,NULL,99,'S','Fora da equipe','S');`);
  const required: Record<string,Record<string,string>> = {
    TGFCAB:{CODEMP:'NUMBER',NUNOTA:'NUMBER',CODTIPOPER:'NUMBER',DHTIPOPER:'DATE',CODNAT:'NUMBER',DTNEG:'DATE',TIPMOV:'VARCHAR2',STATUSNOTA:'VARCHAR2',VLRNOTA:'FLOAT',CODPARC:'NUMBER',CODVEND:'NUMBER'},
    TGFTOP:{CODTIPOPER:'NUMBER',DHALTER:'DATE',TIPMOV:'VARCHAR2',BONIFICACAO:'VARCHAR2',GOLDEV:'NUMBER'},
    TGFPAR:{CODPARC:'NUMBER',CODVEND:'NUMBER',CODEMP:'NUMBER',CLIENTE:'VARCHAR2',RAZAOSOCIAL:'VARCHAR2'},
    TGFITE:{NUNOTA:'NUMBER',CODEMP:'NUMBER',CODPROD:'NUMBER'},
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
    const adapted = sql.replace(/SUM\(C\.VLRNOTA\)/g,'ERP_SUM(C.VLRNOTA)').replace(/<TO_DATE\(('(?:[^']|'')*)','YYYY-MM-DD'\)\+1/g,"<date($1','+1 day')")
      .replace(/OFFSET (\d+) ROWS FETCH NEXT (\d+) ROWS ONLY/g,(_m,o,n)=>`LIMIT ${n} OFFSET ${o}`).replace(/FETCH FIRST (\d+) ROWS ONLY/g,'LIMIT $1');
    return db.prepare(adapted).all() as Record<string,unknown>[];
  })};
  const item=(id:number,product:number|null,company=1,unit='PC')=>db.prepare('INSERT INTO TGFITE VALUES(?,?,?,?)').run(id,company,product,unit);
  return {db,order,item,g};
}
afterEach(()=>{for(const db of opened.splice(0))db.close();});
describe('venda padrão em relatório, sem somar P/V/local',()=>{
  it('consulta agregados no servidor, não a página, e mantém preço/entrega desconhecidos',async()=>{
    const f=fixture(); for(let id=1;id<=65;id++)f.order(id,'0.1');
    const r=await readSalesReport(f.g,query,admin);
    expect(r).toMatchObject({total:65,totalWithoutSearch:65,summary:{documentCount:65,documentAmount:'6.5',headerCountedOnce:true,atomicSnapshot:false},salesPolicy:{movement:'P',operationCode:1001,natureCode:10100000,dateField:'DTNEG'}});
    expect(r.items).toHaveLength(10);expect(r.items[0]).toMatchObject({total:'0.1',readOnly:true,status:'confirmado',customerName:'Cliente homônimo',erp:{movement:'P',hasDestinations:false}});
    expect(r.items[0]).not.toHaveProperty('delivery');
    expect(f.g.select.mock.calls.map(c=>c[1])).toEqual([50,1,1,10]);
    const sql=f.g.select.mock.calls.at(-1)![0];expect(sql).toContain('C.DHTIPOPER=T.DHALTER');expect(sql).toContain('C.DHTIPVENDA=TPV.DHALTER');expect(sql).not.toContain('JOIN TGFVAR');
  });
  it.each([{movement:'V'},{operation:1003},{nature:60300000},{status:'P'},{company:3}])('exclui modalidade não autorizada: %j',async options=>{
    const f=fixture();f.order(1,'10');f.order(2,'900',options);expect((await readSalesReport(f.g,query,admin)).summary.documentAmount).toBe('10');
  });
  it('preserva a versão exata da TOP e exclui bonificação/devolução',async()=>{
    const f=fixture();f.db.exec("INSERT INTO TGFTOP VALUES(1001,'2025-01-01','P','S',1,'Não padrão'); INSERT INTO TGFTOP VALUES(1001,'2024-01-01','P','N',-1,'Devolução')");f.order(1);f.order(2,'900',{version:'2025-01-01'});f.order(3,'800',{version:'2024-01-01'});
    expect((await readSalesReport(f.g,query,admin)).summary.documentCount).toBe(1);
  });
  it('TOP não resolvida falha fechada, não vira venda zero',async()=>{
    const f=fixture();f.order(1,'10',{version:'2020-01-01'});await expect(readSalesReport(f.g,query,admin)).rejects.toMatchObject({code:'ERP_CONTEXT_REQUIRED'});
  });
  it('não exclui cliente hoje inativo; carteira é CODVEND atual, vendedor documental não autentica',async()=>{
    const f=fixture();f.order(1,'10',{customer:1,seller:99});f.order(2,'20',{customer:2,seller:12});
    const r=await readSalesReport(f.g,query,{role:'vendedor',sellerCode:34,companyCodes:[1]});expect(r.summary.documentCount).toBe(1);expect(r.items[0]?.['sellerCode']).toBe(99);
  });
  it('gestor lê somente própria carteira e equipe privada, mesmo com nomes idênticos',async()=>{
    const f=fixture();f.order(1);f.order(2,'20',{customer:2,seller:12});f.order(3,'900',{customer:3,seller:99});
    expect((await readSalesReport(f.g,query,{role:'gestor',sellerCode:34,companyCodes:[1],teamSellerCodes:[12]})).summary.documentCount).toBe(2);
    expect((await readSalesReport(f.g,query,{role:'vendedor',sellerCode:34,companyCodes:[1]})).summary.documentCount).toBe(1);
    await expect(readSalesReport(f.g,query,{role:'vendedor',sellerCode:34,companyCodes:[1],teamSellerCodes:[12]})).rejects.toMatchObject({code:'ERP_IDENTITY_REQUIRED'});
  });
  it.each(['seller','customer'] as const)('agrupa por código %s, sem fundir homônimos ou confundir grupos/pedidos',async groupBy=>{
    const f=fixture();f.order(1,'0.1');f.order(2,'0.2');f.order(3,'0.3',{seller:12,customer:2});
    const r=await readSalesReport(f.g,{...query,groupBy},admin);expect(r.total).toBe(2);expect(r.summary).toMatchObject({documentCount:3,documentAmount:'0.6'});expect(new Set(r.items.map(x=>x['id'])).size).toBe(2);expect(r.items.map(x=>x['count']).sort()).toEqual([1,2]);
  });
  it('responsável desconhecido fica grupo desconhecido, sem substituição pela pessoa logada',async()=>{
    const f=fixture();f.order(1);f.db.exec('UPDATE TGFCAB SET CODVEND=NULL');const r=await readSalesReport(f.g,{...query,groupBy:'seller'},admin);expect(r.items[0]).toMatchObject({id:'sankhya:sales:seller:unknown',name:null,groupCode:null});
  });
  it('filtra datas inclusivas, cliente e vendedor por código; busca e contagem não retiram filtros',async()=>{
    const f=fixture();f.order(1,'10',{date:'2026-10-01'});f.order(2,'20',{date:'2026-10-25'});f.order(3,'900',{date:'2026-09-30'});f.order(4,'900',{date:'2026-10-26'});f.order(5,'900',{customer:2,seller:12});
    const r=await readSalesReport(f.g,{...query,from:'2026-10-01',to:'2026-10-25',customerId:'sankhya:customer:1',sellerCode:34,search:'homonimo'},admin);expect(r.summary.documentAmount).toBe('30');expect(r.total).toBe(2);expect(r.totalWithoutSearch).toBe(2);
    for(const [sql] of f.g.select.mock.calls.slice(1)){expect(sql).toContain('P.CODPARC=1');expect(sql).toContain('C.CODVEND=34');}
  });
  it('separa filial4 e ordena com desempate técnico, sem carteira replicada',async()=>{
    const f=fixture();f.order(1);f.order(2,'20',{company:4});await expect(readSalesReport(f.g,{...query,companyCode:4},admin)).rejects.toMatchObject({code:'ERP_SCOPE_FORBIDDEN'});const r=await readSalesReport(f.g,{...query,companyCode:1,sort:'date',direction:'asc'},admin);expect(r.summary.documentAmount).toBe('10');expect(r.companyCodes).toEqual([1]);expect(f.g.select.mock.calls.at(-1)![0]).toContain(',C.NUNOTA ASC NULLS LAST');
  });
  it('contagem zero observada é zero, sem fabricar ticket; valor ausente preserva total financeiro null',async()=>{
    const f=fixture();expect((await readSalesReport(f.g,query,admin)).summary).toMatchObject({documentCount:0,documentAmount:'0'});f.order(1,null);f.order(2,'12');expect((await readSalesReport(f.g,query,admin)).summary).toMatchObject({documentCount:2,missingAmountCount:1,documentAmount:null});
  });
  it('recusa duplicação de cabeçalho por join, em vez de multiplicar valores',async()=>{
    const f=fixture();f.order(1);f.db.exec("INSERT INTO TGFVEN VALUES(34,'Duplicado')");await expect(readSalesReport(f.g,query,admin)).rejects.toMatchObject({code:'ERP_INVALID_RESPONSE'});
  });
  it.each(['BINARY_FLOAT','BINARY_DOUBLE','VARCHAR2'])('recusa tipo monetário sem contrato: %s',async type=>{
    const f=fixture();f.order(1);f.db.prepare("UPDATE USER_TAB_COLUMNS SET DATA_TYPE=? WHERE COLUMN_NAME='VLRNOTA'").run(type);await expect(readSalesReport(f.g,query,admin)).rejects.toMatchObject({code:'ERP_CONTEXT_REQUIRED'});
  });
  it.each([{resource:'invoices'},{groupBy:'nome'},{sellerCode:0},{customerId:'manual'},{status:'Concluído'},{from:'2026-02-30'},{sort:'__proto__'},{offset:-1},{limit:51},{sql:'SELECT 1'},{search:'a;DROP'},{from:'2026-10-26',to:'2026-10-25'}])('recusa entrada inválida antes do ERP: %j',async bad=>{
    const f=fixture();await expect(readSalesReport(f.g,{...query,...bad} as SalesReportInput,admin)).rejects.toBeDefined();expect(f.g.select).not.toHaveBeenCalled();
  });
  it('filtro vendedor não amplia a equipe; código da filial não autoriza acesso',async()=>{
    const f=fixture(),scope:ReadScope={role:'vendedor',sellerCode:34,companyCodes:[1]};await expect(readSalesReport(f.g,{...query,sellerCode:12},scope)).rejects.toMatchObject({code:'ERP_SCOPE_FORBIDDEN'});await expect(readSalesReport(f.g,{...query,companyCode:4},scope)).rejects.toMatchObject({code:'ERP_SCOPE_FORBIDDEN'});expect(f.g.select).not.toHaveBeenCalled();
  });
});
describe('decimais financeiros e ticket sem ponto flutuante',()=>{
  it('soma exata e ticket racional; arredonda somente apresentação',()=>{
    expect(sumERPDecimals(['0.1','0.2'])).toBe('0.3');expect(formatERPAmount('10',3)).toBe('R$ 3,33');expect(formatERPAmount('0.015')).toBe('R$ 0,02');expect(formatERPAmount('-0.015')).toBe('-R$ 0,02');expect(formatERPAmount('9007199254740993.19')).toBe('R$ 9.007.199.254.740.993,19');expect(formatERPAmount('0',0)).toBeNull();expect(erpDecimal('-.1')).toBe('-0.1');
  });
  it.each([1.2,'1e3','1,00','1.1234567890',null,'NaN'])('não converte valor incompatível em zero: %s',v=>{expect(erpDecimal(v)).toBeNull();expect(formatERPAmount(v)).toBeNull();});
});

describe('Produtos distintos por cliente, sem multiplicar cabeçalhos',()=>{
 const mix:SalesReportInput={...query,groupBy:'customer',productMix:true};
 it('conta SKU distintos entre pedidos/unidades e soma cada cabeçalho uma vez',async()=>{const f=fixture();f.order(1,'0.1');f.order(2,'0.2');f.item(1,500);f.item(1,500,1,'UN');f.item(1,600);f.item(2,500);const r=await readSalesReport(f.g,mix,admin);expect(r.items[0]).toMatchObject({qty:2,count:2,total:'0.3',groupCode:1});expect(r.summary.documentAmount).toBe('0.3');expect(r).toHaveProperty('productCountPolicy',{field:'TGFITE.CODPROD',distinctPerCustomer:true,quantitiesAdded:false,missingItems:'unavailable'});const sql=f.g.select.mock.calls.at(-1)![0];expect(sql).toContain('COUNT(DISTINCT I.CODPROD)');expect(sql).not.toContain('SUM(I.');expect(sql).toContain('FROM MIX_SOURCE C GROUP BY');expect(sql).toContain('I.CODEMP<>H.CODEMP');});
 it('não funde clientes homônimos nem soma seus produtos distintos',async()=>{const f=fixture();f.order(1,'10');f.order(2,'20',{customer:2,seller:12});f.item(1,500);f.item(2,500);const r=await readSalesReport(f.g,mix,admin);expect(r.items.map(x=>[x['groupCode'],x['qty'],x['total']])).toEqual([[1,1,'10'],[2,1,'20']]);});
 it('mantém carteira atual, equipe explícita, filial e cliente hoje inativo',async()=>{const f=fixture();f.order(1,'10');f.order(2,'20',{customer:2,seller:12});f.order(3,'900',{customer:3,seller:99});f.order(4,'30',{company:4});f.item(1,500);f.item(2,600);f.item(3,700);f.item(4,500,4);const own=await readSalesReport(f.g,mix,{role:'vendedor',sellerCode:34,companyCodes:[1]});expect(own.items).toHaveLength(1);expect(own.summary.documentAmount).toBe('10');const team=await readSalesReport(f.g,mix,{role:'gestor',sellerCode:34,companyCodes:[1,4],teamSellerCodes:[12]});expect(team.items.map(x=>x['qty'])).toEqual([1,1]);expect(team.summary.documentAmount).toBe('30');await expect(readSalesReport(f.g,{...mix,companyCode:4},admin)).rejects.toMatchObject({code:'ERP_SCOPE_FORBIDDEN'});});
 it('mesmo recorte de datas/códigos/busca rege valor e produtos, sem puxar outro pedido',async()=>{const f=fixture();f.order(1,'10',{date:'2026-10-01'});f.order(2,'900',{date:'2026-09-30'});f.order(3,'800',{seller:12});f.order(4,'700',{customer:2});f.item(1,500);f.item(2,600);f.item(3,700);f.item(4,800);const r=await readSalesReport(f.g,{...mix,from:'2026-10-01',to:'2026-10-25',sellerCode:34,customerId:'sankhya:customer:1',search:'homonimo'},admin);expect(r.items[0]).toMatchObject({qty:1,total:'10',count:1});expect(r.summary.documentCount).toBe(1);});
 it.each(['sem_itens','produto_null','produto_zero','produto_fracionado','filial_divergente','filial_null'] as const)('origem de itens %s mantém produtos indisponíveis, não zero',async scenario=>{const f=fixture();f.order(1,'12');if(scenario!=='sem_itens')f.item(1,scenario==='produto_null'?null:scenario==='produto_zero'?0:scenario==='produto_fracionado'?1.2:500,scenario==='filial_divergente'?4:1);if(scenario==='filial_null')f.db.exec('UPDATE TGFITE SET CODEMP=NULL');const r=await readSalesReport(f.g,mix,admin);expect(r.items[0]).toMatchObject({qty:null,total:'12',count:1});});
 it('um pedido sem itens torna o conjunto desconhecido, mesmo com outro pedido legível',async()=>{const f=fixture();f.order(1);f.order(2);f.item(1,500);expect((await readSalesReport(f.g,mix,admin)).items[0]?.['qty']).toBeNull();});
 it('quantidade distinta conhecida sobrevive a valor ausente, sem dinheiro zero',async()=>{const f=fixture();f.order(1,null);f.item(1,500);const r=await readSalesReport(f.g,mix,admin);expect(r.items[0]).toMatchObject({qty:1,total:null});expect(r.summary.documentAmount).toBeNull();});
 it.each(['asc','desc'] as const)('ordena qty %s no servidor, com desconhecido por último e desempate pelo código',async direction=>{const f=fixture();for(let n=1;n<=3;n++)f.order(n,'10',{customer:n});f.item(1,500);f.item(1,600);f.item(2,500);const r=await readSalesReport(f.g,{...mix,sort:'qty',direction},admin);expect(r.items.map(x=>x['groupCode'])).toEqual(direction==='asc'?[2,1,3]:[1,2,3]);expect(f.g.select.mock.calls.at(-1)![0]).toContain(`ORDER BY PRODUCT_COUNT ${direction.toUpperCase()} NULLS LAST,C.CODPARC ${direction.toUpperCase()}`);});
 it('pagina65 grupos sem importar históricos e preserva6,5 financeiros exatos',async()=>{const f=fixture();for(let n=1;n<=65;n++){if(n>3)f.db.prepare('INSERT INTO TGFPAR VALUES(?,NULL,34,\'S\',?,\'S\')').run(n,'Cliente '+n);f.order(n,'0.1',{customer:n});for(let p=1;p<=n%3+1;p++)f.item(n,500+p);}const r=await readSalesReport(f.g,{...mix,offset:50,limit:15,sort:'qty',direction:'asc'},admin);expect(r.items).toHaveLength(15);expect(r.total).toBe(65);expect(r.summary).toMatchObject({documentCount:65,documentAmount:'6.5'});expect(r.items.every(x=>x['qty']===3)).toBe(true);expect(f.g.select.mock.calls.every(c=>c[1]<=50)).toBe(true);});
 it('nova dependência de metadados é exclusiva do mix e falha fechada quando ausente',async()=>{const f=fixture();f.order(1);f.item(1,500);f.db.exec("DELETE FROM USER_TAB_COLUMNS WHERE TABLE_NAME='TGFITE'");await expect(readSalesReport(f.g,mix,admin)).rejects.toMatchObject({code:'ERP_CONTEXT_REQUIRED'});expect((await readSalesReport(f.g,{...query,groupBy:'customer'},admin)).items[0]).not.toHaveProperty('qty');});
 it.each([{productMix:false},{groupBy:'seller'},{groupBy:undefined},{sort:'count'}])('recusa modo inválido sem executar consulta: %j',async bad=>{const f=fixture();await expect(readSalesReport(f.g,{...mix,...bad} as SalesReportInput,admin)).rejects.toMatchObject({code:'INVALID_REQUEST'});expect(f.g.select).not.toHaveBeenCalled();});
});
