import {billedFixture} from './billed-orders-fixture';
import {createERPClient} from '../lib/erp-online';
import {readReceivables} from '../../supabase/functions/sankhya-online/receivables';
import {vi} from 'vitest';
export function receivablesFixture(){
 const f=billedFixture();f.db.exec('CREATE TABLE TGFFIN(NUFIN INTEGER,CODEMP INTEGER,CODPARC INTEGER,CODVEND INTEGER,RECDESP INTEGER,PROVISAO TEXT,DTVENC TEXT,DHBAIXA TEXT,VLRDESDOB TEXT,NUMNOTA INTEGER)');
 const required={NUFIN:'NUMBER',CODEMP:'NUMBER',CODPARC:'NUMBER',CODVEND:'NUMBER',RECDESP:'NUMBER',PROVISAO:'VARCHAR2',DTVENC:'DATE',DHBAIXA:'DATE',VLRDESDOB:'FLOAT',NUMNOTA:'NUMBER'};
 for(const[n,t]of Object.entries(required))f.db.prepare('INSERT INTO USER_TAB_COLUMNS VALUES(?,?,?)').run('TGFFIN',n,t);
 f.db.exec("INSERT INTO USER_TAB_COLUMNS VALUES('TGFPAR','RAZAOSOCIAL','VARCHAR2')");
 f.order(999997,'99999',{customer:1});f.order(999998,'99999',{customer:2,seller:12});
 const title=(id:number,amount:string|null='10.12',options:Record<string,any>={})=>f.db.prepare('INSERT INTO TGFFIN VALUES(?,?,?,?,?,?,?,?,?,?)').run(id,options['company']??1,options['customer']??1,Object.hasOwn(options,'seller')?options['seller']:34,options['kind']??1,options['provision']??'N',Object.hasOwn(options,'due')?options['due']:'2026-10-26',options['settled']??null,amount,Object.hasOwn(options,'document')?options['document']:100);
 const transport=vi.fn(async({operation,query}:any)=>{if(operation!=='receivables-report')throw Error('Operação inesperada');try{return{data:await readReceivables(f.g,query,{role:'administrador'}),error:null};}catch(e:any){return{data:null,error:{code:e.code??'ERP_UNAVAILABLE'}};}});
 return{...f,title,transport,client:createERPClient(transport)};
}
