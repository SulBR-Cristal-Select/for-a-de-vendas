import type { ERPNonBuyersQuery, ERPRow, ERPWindow } from './erp-online';
export type ERPWalletQuery=ERPNonBuyersQuery & {view:'sellers'|'customers'};
export type ERPWalletSummary={month:string;from:string;until:string;walletCount:number;buyerCount:number;nonBuyerCount:number;currentWallet:true;activeField:'TGFPAR.ATIVO';activeValue:'S';sellerAttribution:'current-CODVEND';historyCompanyCodes:(1|4)[];beforeSearch:true;atomicSnapshot:false};
export type ERPWalletWindow=ERPWindow & {view:'sellers'|'customers';summary:ERPWalletSummary;companyCodes:(1|4)[]};
const obj=(v:unknown):v is ERPRow=>!!v&&typeof v==='object'&&!Array.isArray(v);
const count=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0;
const text=(v:unknown)=>v===null||typeof v==='string';
export function validWalletQuery(q:ERPWalletQuery):boolean{
 return Object.keys(q).every(k=>['resource','view','month','offset','limit','search','sort','direction','customerId','sellerCode','status'].includes(k))&&q.resource==='customers'&&['sellers','customers'].includes(q.view)&&typeof q.month==='string'&&/^\d{4}-(?:0[1-9]|1[0-2])$/.test(q.month)&&Number(q.month.slice(0,4))>=1&&Number(q.month.slice(0,4))<=9998&&count(q.offset)&&count(q.limit)&&q.limit>=1&&q.limit<=50&&q.offset<=2147483647-q.limit&&(q.customerId===undefined||typeof q.customerId==='string'&&/^sankhya:customer:[1-9]\d{0,9}$/.test(q.customerId)&&Number(q.customerId.slice(17))<=2147483647)&&(q.sellerCode===undefined||count(q.sellerCode)&&q.sellerCode>=1&&q.sellerCode<=2147483647)&&(q.status===undefined||q.status==='confirmado')&&(q.sort===undefined||(q.view==='sellers'?['code','name','walletCount','buyerCount','nonBuyerCount']:['code','name','seller','localStatus']).includes(q.sort))&&(q.direction===undefined||['asc','desc'].includes(q.direction))&&(q.search===undefined||typeof q.search==='string'&&q.search.length<=120&&!/[\x00-\x1f;]|--|\/\*|\*\//.test(q.search));
}
/** A observação, tamanho da janela e contagens gerais são validados pelo SDK comum. */
export function decodeWallet(data:ERPRow,q:ERPWalletQuery,fail:()=>never):void{
 const s=data['summary'],cs=data['companyCodes'],policy=data['salesPolicy'],items=data['items'];
 if(!obj(s)||!Array.isArray(cs)||cs.length<1||cs.length>2||new Set(cs).size!==cs.length||cs.some(c=>c!==1&&c!==4)||!Array.isArray(items)||data['view']!==q.view||!obj(policy))return fail();
 const y=Number(q.month.slice(0,4)),m=Number(q.month.slice(5)),until=m===12?`${String(y+1).padStart(4,'0')}-01-01`:`${String(y).padStart(4,'0')}-${String(m+1).padStart(2,'0')}-01`;
 if(s['month']!==q.month||s['from']!==q.month+'-01'||s['until']!==until||s['currentWallet']!==true||s['activeField']!=='TGFPAR.ATIVO'||s['activeValue']!=='S'||s['sellerAttribution']!=='current-CODVEND'||s['beforeSearch']!==true||s['atomicSnapshot']!==false||JSON.stringify(s['historyCompanyCodes'])!==JSON.stringify(cs))return fail();
 const wallet=s['walletCount'],buyers=s['buyerCount'],absent=s['nonBuyerCount'];
 if(!count(wallet)||!count(buyers)||!count(absent)||buyers+absent!==wallet||q.view==='customers'&&data['totalWithoutSearch']!==wallet||q.view==='sellers'&&Number(data['totalWithoutSearch'])>wallet)return fail();
 for(const[k,v]of Object.entries({movement:'P',operationCode:1001,natureCode:10100000,statusCode:'L',bonification:'N',devolution:1,dateField:'DTNEG'}))if(policy[k]!==v)return fail();
 const ids=new Set<string>();
 for(const r of items){
  if(!obj(r)||typeof r['id']!=='string'||ids.has(r['id'])||r['source']!=='observado'||r['readOnly']!==true||!text(r['name']))return fail();ids.add(r['id']);
  const seller=r['sellerCode'];if(seller!==null&&(!count(seller)||seller>2147483647)||q.sellerCode!==undefined&&seller!==q.sellerCode)return fail();
  if(q.view==='sellers'){
   const w=r['walletCount'],b=r['buyerCount'],a=r['nonBuyerCount'];
   if(r['id']!==`sankhya:wallet:seller:${seller===null?'unassigned':seller}`||r['code']!==(seller===null?null:String(seller))||!count(w)||w<1||!count(b)||!count(a)||a+b!==w||w>wallet||b>buyers||a>absent)return fail();
  }else{
   const code=r['code'];if(typeof code!=='string'||!/^([1-9]\d{0,9})$/.test(code)||Number(code)>2147483647||r['id']!==`sankhya:customer:${code}`||!text(r['seller'])||typeof r['bought']!=='boolean'||r['localStatus']!==(r['bought']?'Com':'Sem')+' compra no mês '+q.month||q.customerId!==undefined&&r['id']!==q.customerId)return fail();
  }
 }
 if(q.offset===0&&items.length===data['totalWithoutSearch']&&data['total']===data['totalWithoutSearch']){
  if(q.view==='sellers'&&(['walletCount','buyerCount','nonBuyerCount'] as const).some((k,i)=>items.reduce((n,r)=>n+Number(r[k]),0)!==[wallet,buyers,absent][i]))return fail();
  if(q.view==='customers'&&items.filter(r=>r['bought']).length!==buyers)return fail();
 }
}
