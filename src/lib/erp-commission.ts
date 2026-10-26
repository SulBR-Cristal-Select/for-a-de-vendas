type ERPRow=Record<string,unknown>;
import { erpDecimal, sumERPDecimals } from './erp-decimal';
export type ERPCommissionQuery={resource:'orders';view:'sellers'|'orders';offset:number;limit:number;search?:string;sort?:string;direction?:'asc'|'desc';customerId?:string;sellerCode?:number;from?:string;to?:string;status?:'confirmado'};
export const COMMISSION_POLICY={amountField:'TGFCOM.VLRCOM',sellerField:'TGFCOM.CODVEND',originField:'TGFCOM.NUNOTAORIG',dateField:'TGFCAB.DTNEG',period:'origin-emission',allocation:'unique-standard-order-or-unassigned',returnsPreserved:true,calculatedCommission:false,paid:false,atomicSnapshot:false} as const;
export type ERPCommissionSummary={entryCount:number;missingAmountCount:number;amount:string|null;unassignedEntryCount:number;unassignedAmount:string|null};
export type ERPCommissionWindow={source:'sankhya';readOnly:true;readAt:string;items:ERPRow[];offset:number;total:number;totalWithoutSearch:number;view:'sellers'|'orders';companyCodes:(1|4)[];commissionPolicy:typeof COMMISSION_POLICY;summary:ERPCommissionSummary};
const obj=(v:unknown):v is ERPRow=>!!v&&typeof v==='object'&&!Array.isArray(v);
const count=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0;
const code=(v:unknown):v is number=>count(v)&&v>=1&&v<=2147483647;
const day=(v:unknown):v is string=>typeof v==='string'&&/^[1-9]\d{3}-\d\d-\d\d$/.test(v)&&Number(v.slice(0,4))<=9998&&Number.isFinite(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
export function validCommissionQuery(q:ERPCommissionQuery):boolean{
 return !!q&&Object.keys(q).every(k=>['resource','view','offset','limit','search','sort','direction','customerId','sellerCode','from','to','status'].includes(k))&&q.resource==='orders'&&['sellers','orders'].includes(q.view)&&count(q.offset)&&count(q.limit)&&q.limit>=1&&q.limit<=50&&q.offset<=2147483647-q.limit&&(q.customerId===undefined||typeof q.customerId==='string'&&/^sankhya:customer:[1-9]\d{0,9}$/.test(q.customerId)&&code(Number(q.customerId.slice(17))))&&(q.sellerCode===undefined||code(q.sellerCode))&&(q.status===undefined||q.status==='confirmado')&&(q.from===undefined||day(q.from))&&(q.to===undefined||day(q.to))&&!(q.from&&q.to&&q.from>q.to)&&(q.sort===undefined||(q.view==='sellers'?['name','value']:['date','number','customer','total','commission']).includes(q.sort))&&(q.direction===undefined||['asc','desc'].includes(q.direction))&&(q.search===undefined||typeof q.search==='string'&&q.search.length<=120&&!/[\x00-\x1f;]|--|\/\*|\*\//.test(q.search)&&!/\b(INSERT|UPDATE|DELETE|MERGE|DROP|ALTER|CREATE|GRANT|EXECUTE|CALL|DBMS_|UTL_)\b/i.test(q.search));
}
export function decodeCommission(d:ERPRow,q:ERPCommissionQuery,fail:()=>never):void{
 const cs=d['companyCodes'],p=d['commissionPolicy'],s=d['summary'],items=d['items'];
 if(!Array.isArray(cs)||cs.length<1||cs.length>2||cs.some(c=>c!==1&&c!==4)||new Set(cs).size!==cs.length||!obj(p)||Object.entries(COMMISSION_POLICY).some(([k,v])=>p[k]!==v)||d['view']!==q.view||!obj(s)||!Array.isArray(items)||!count(s['entryCount'])||!count(s['missingAmountCount'])||s['missingAmountCount']>s['entryCount']||!count(s['unassignedEntryCount'])||s['unassignedEntryCount']>s['entryCount'])return fail();
 const amount=(v:unknown)=>v===null||typeof v==='string'&&erpDecimal(v)===v;
 if(!amount(s['amount'])||!amount(s['unassignedAmount'])||s['missingAmountCount']>0&&s['amount']!==null||s['entryCount']===0&&s['amount']!==null||s['entryCount']>0&&s['missingAmountCount']===0&&s['amount']===null||s['unassignedEntryCount']===0&&s['unassignedAmount']!==null||Number(d['total'])>s['entryCount'])return fail();
 const ids=new Set<string>();
 for(const r of items){
  if(!obj(r)||typeof r['id']!=='string'||ids.has(r['id'])||r['source']!=='observado'||r['readOnly']!==true||!count(r['entryCount'])||r['entryCount']<1||r['entryCount']>s['entryCount']||!count(r['missingAmountCount'])||r['missingAmountCount']>r['entryCount']||!amount(r['commission'])||r['missingAmountCount']>0&&r['commission']!==null||r['missingAmountCount']===0&&r['commission']===null)return fail();ids.add(r['id']);
  if(q.view==='sellers'){
   if(!count(r['sellerCode'])||r['sellerCode']>2147483647||r['id']!==`sankhya:commission:seller:${r['sellerCode']}`||r['name']!==null&&typeof r['name']!=='string'||r['value']!==r['commission']||q.sellerCode!==undefined&&r['sellerCode']!==q.sellerCode)return fail();
  }else{
   if(typeof r['assigned']!=='boolean'||!code(r['documentCode'])||!cs.includes(r['companyCode'])||r['id']!==`sankhya:commission:${r['assigned']?'order':'unassigned-origin'}:${r['documentCode']}`||r['date']!==null&&!day(r['date'])||r['customerName']!==null&&typeof r['customerName']!=='string'||typeof r['customerId']!=='string'||!/^sankhya:customer:[1-9]\d{0,9}$/.test(r['customerId'])||!code(Number(r['customerId'].slice(17)))||q.customerId!==undefined&&r['customerId']!==q.customerId||!amount(r['total'])||r['number']!==(r['assigned']?String(r['documentCode']):`Não atribuído (origem ${r['documentCode']})`)||!r['assigned']&&r['total']!==null)return fail();
  }
 }
 if(q.offset===0&&items.length===d['total']){
  if(items.reduce((n,r)=>n+Number(r['entryCount']),0)!==s['entryCount']||items.reduce((n,r)=>n+Number(r['missingAmountCount']),0)!==s['missingAmountCount']||s['amount']!==null&&sumERPDecimals(items.map(r=>r['commission'] as string))!==sumERPDecimals([s['amount'] as string]))return fail();
 }
}
