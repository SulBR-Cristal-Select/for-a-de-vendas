import {DatabaseSync} from 'node:sqlite';
import {expect,vi} from 'vitest';
import {readBilledOrdersReport} from '../../supabase/functions/sankhya-online/history';
import {createERPClient} from '../lib/erp-online';
import {sumERPDecimals} from '../lib/erp-decimal';
const opened:DatabaseSync[]=[];
export function closeBilledFixtures(){for(const db of opened.splice(0))db.close();}
// Adaptação explícita de agregados/datas/LISTAGG para SQLite. Não é Oracle.
export function billedFixture() {
  const db = new DatabaseSync(':memory:'); opened.push(db);
  db.exec(`CREATE TABLE USER_TAB_COLUMNS(TABLE_NAME TEXT,COLUMN_NAME TEXT,DATA_TYPE TEXT);
    CREATE TABLE TGFCAB(NUNOTA INTEGER,NUMNOTA INTEGER,CODEMP INTEGER,CODPARC INTEGER,CODVEND INTEGER,TIPMOV TEXT,STATUSNOTA TEXT,DTNEG TEXT,VLRNOTA TEXT,CODTIPOPER INTEGER,DHTIPOPER TEXT,CODTIPVENDA INTEGER,DHTIPVENDA TEXT,CODNAT INTEGER,DTFATUR TEXT,STATUSNFE TEXT);
    CREATE TABLE TGFPAR(CODPARC INTEGER,CODEMP INTEGER,CODVEND INTEGER,CLIENTE TEXT,RAZAOSOCIAL TEXT,ATIVO TEXT,AD_CLASSE INTEGER);CREATE TABLE AD_CLASSES(ID INTEGER,DESCRCLASSE TEXT);
    CREATE TABLE TGFVEN(CODVEND INTEGER,APELIDO TEXT);
    CREATE TABLE TGFTOP(CODTIPOPER INTEGER,DHALTER TEXT,TIPMOV TEXT,BONIFICACAO TEXT,GOLDEV INTEGER,DESCROPER TEXT,GOLSINAL INTEGER);
    CREATE TABLE TGFTPV(CODTIPVENDA INTEGER,DHALTER TEXT);
    CREATE TABLE TGFVAR(NUNOTA INTEGER,NUNOTAORIG INTEGER,SEQUENCIA INTEGER,SEQUENCIAORIG INTEGER); CREATE TABLE TGFITE(NUNOTA INTEGER,SEQUENCIA INTEGER);
    INSERT INTO TGFTOP VALUES(1001,'2026-01-01','P','N',1,'Venda padrão',-1); INSERT INTO TGFTOP VALUES(1101,'2026-01-01','V','N',1,'Venda fiscal',-1),(1102,'2026-01-01','V','N',1,'Outra TOP fiscal',-1),(1003,'2026-01-01','P','N',1,'Outra venda',-1);
    INSERT INTO TGFVEN VALUES(34,'Homônimo'),(12,'Homônimo'),(99,'Outro');
    INSERT INTO TGFPAR VALUES(1,NULL,34,'S','Cliente homônimo','N',NULL),(2,NULL,12,'S','Cliente homônimo','S',NULL),(3,NULL,99,'S','Fora da equipe','S',NULL);`);
  const required: Record<string,Record<string,string>> = {
    TGFCAB:{NUMNOTA:'NUMBER',CODEMP:'NUMBER',NUNOTA:'NUMBER',CODTIPOPER:'NUMBER',DHTIPOPER:'DATE',CODNAT:'NUMBER',DTNEG:'DATE',TIPMOV:'VARCHAR2',STATUSNOTA:'VARCHAR2',VLRNOTA:'FLOAT',CODPARC:'NUMBER',CODVEND:'NUMBER',DTFATUR:'DATE',STATUSNFE:'VARCHAR2'},
    TGFTOP:{CODTIPOPER:'NUMBER',DHALTER:'DATE',TIPMOV:'VARCHAR2',BONIFICACAO:'VARCHAR2',GOLDEV:'NUMBER',GOLSINAL:'NUMBER'},
    TGFVAR:{NUNOTA:'NUMBER',NUNOTAORIG:'NUMBER',SEQUENCIA:'NUMBER',SEQUENCIAORIG:'NUMBER'},TGFITE:{NUNOTA:'NUMBER',SEQUENCIA:'NUMBER'},
    TGFPAR:{CODPARC:'NUMBER',CODVEND:'NUMBER',CODEMP:'NUMBER',CLIENTE:'VARCHAR2',AD_CLASSE:'NUMBER'},AD_CLASSES:{ID:'NUMBER',DESCRCLASSE:'VARCHAR2'},
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
    const adapted = sql.replace(/\bSUM\(/g,'ERP_SUM(').replace(/\bROWNUM AS QUERY_BARRIER/g,'1 AS QUERY_BARRIER')
      .replace("LISTAGG(CASE WHEN N.QUALIFIED=1 THEN TO_CHAR(N.NUMNOTA) END,', ') WITHIN GROUP (ORDER BY N.NUMNOTA,N.NUNOTA)","GROUP_CONCAT(CASE WHEN N.QUALIFIED=1 THEN TO_CHAR(N.NUMNOTA) END,', ')")
      .replace(/<TO_DATE\(('(?:[^']|'')*)','YYYY-MM-DD'\)\+1/g,"<date($1','+1 day')")
      .replace(/OFFSET (\d+) ROWS FETCH NEXT (\d+) ROWS ONLY/g,(_m,o,n)=>`LIMIT ${n} OFFSET ${o}`).replace(/FETCH FIRST (\d+) ROWS ONLY/g,'LIMIT $1');
    return db.prepare(adapted).all() as Record<string,unknown>[];
  })};
  function origin(invoice:number,id=invoice+1000,options:Record<string,any>={}) {
    order(id,'99999',{movement:'P',operation:1001,...options});
    db.prepare('INSERT INTO TGFITE VALUES(?,1)').run(id);
    db.prepare('INSERT INTO TGFITE VALUES(?,1)').run(invoice);
    db.prepare('INSERT INTO TGFVAR VALUES(?,?,1,1)').run(invoice,id);
  }
  const link=(invoice:number,po:number,sequence=1)=>{if(!db.prepare('SELECT 1 FROM TGFITE WHERE NUNOTA=? AND SEQUENCIA=?').get(invoice,sequence))db.prepare('INSERT INTO TGFITE VALUES(?,?)').run(invoice,sequence);db.prepare('INSERT INTO TGFVAR VALUES(?,?,?,1)').run(invoice,po,sequence);};
  const transport=vi.fn(async({operation,query}:any)=>{if(operation!=='billed-orders-report')throw Error('Operação inesperada');return{data:await readBilledOrdersReport(g,query,{role:'administrador'}),error:null};});
  return {db,order,origin,g,link,transport,client:createERPClient(transport)};
}
