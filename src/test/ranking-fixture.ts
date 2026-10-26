import {vi} from 'vitest';
import {billedFixture} from './billed-orders-fixture';
import {readRanking} from '../../supabase/functions/sankhya-online/ranking';
import {createERPClient} from '../lib/erp-online';
export function rankingFixture(many=false){const f=billedFixture();
 const targets=vi.fn(async(month:string,companyCodes:number[])=>({month,companyCodes,source:'local-canonical-targets',identity:'private-Auth-UUID-to-CODVEND',readOnly:true,targets:many?[]:[{sellerCode:34,amount:'100.00',reason:null}]}));
 if(many){for(let code=1;code<=65;code++){if(![12,34,99].includes(code))f.db.prepare('INSERT INTO TGFVEN VALUES(?,?)').run(code,'Vendedor ERP '+code);f.order(code,'10',{movement:'P',operation:1001,seller:code});}}
 else{f.order(1,'30',{movement:'P',operation:1001});f.order(2,'20',{movement:'P',operation:1001});}
 const transport=vi.fn(async({operation,query}:any)=>{if(operation!=='ranking-report')throw Error('Operação inesperada');try{return{data:await readRanking(f.g,query,{role:'administrador'},targets),error:null};}catch(e:any){return{data:null,error:{code:e.code??'ERP_UNAVAILABLE'}};}});
 return{...f,targets,transport,client:createERPClient(transport)};
}
