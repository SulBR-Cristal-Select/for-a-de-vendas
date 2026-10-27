import {purchaseSelection} from './indicator-selection.ts';
import type {IndicatorSelection} from '../../../src/lib/erp-indicator-series.ts';
import {SankhyaError,type SankhyaGateway} from './gateway.ts';
import {STANDARD_SALES_REPORT_POLICY as p} from './policy.ts';
type Row=Record<string,unknown>;
export type WalletDayContext={selection?:IndicatorSelection;cte:string;walletCount:number;nonBuyerCount:number;purchaseCount:number;offset:number;limit:number;month:string;from:string;until:string;companies:number[]};
const incomplete=():never=>{throw new SankhyaError('ERP_CONTEXT_REQUIRED','Compras diárias incompletas ou alteradas durante a leitura.',502);};
function integer(v:unknown):number{if(typeof v!=='number'&&(typeof v!=='string'||!/^\d+$/.test(v)))return incomplete();const n=Number(v);return Number.isSafeInteger(n)&&n>=0?n:incomplete();}
/** Cada ponto tem compradores DISTINTOS do dia sobre a MESMA carteira atual.
 * Não é acumulado. Não somar compradores nem denominadores entre dias.
 * Dias sem compra somente recebem zero após qualificação integral da origem.
 */
export async function walletDays(g:Pick<SankhyaGateway,'select'>,c:WalletDayContext){
 const{cte,walletCount,nonBuyerCount,purchaseCount,offset,limit,month,from,until,companies}=c;
 const valid=`T.TIPMOV='${p.movement}' AND T.BONIFICACAO='${p.bonification}' AND T.GOLDEV=${p.devolution}`;
 const rows=await g.select(`${cte} SELECT TO_CHAR(C.DTNEG,'YYYY-MM-DD') AS DAY_VALUE,COUNT(DISTINCT C.CODPARC) AS BUYER_COUNT,COUNT(*) AS SOURCE_ROWS,COUNT(DISTINCT C.NUNOTA) AS SOURCE_DOCUMENTS FROM Q W JOIN TGFCAB C ON C.CODPARC=W.CODPARC JOIN TGFTOP T ON T.CODTIPOPER=C.CODTIPOPER AND T.DHALTER=C.DHTIPOPER WHERE C.CODEMP IN (${companies.join(',')}) AND C.TIPMOV='${p.movement}' AND C.CODTIPOPER=${p.operationCode} AND C.CODNAT=${p.natureCode} AND C.STATUSNOTA='${p.statusCode}' AND ${valid} AND (${purchaseSelection(c.selection??{})}) AND C.DTNEG>=TO_DATE('${from}','YYYY-MM-DD') AND C.DTNEG<TO_DATE('${until}','YYYY-MM-DD') GROUP BY TO_CHAR(C.DTNEG,'YYYY-MM-DD') ORDER BY DAY_VALUE FETCH FIRST 32 ROWS ONLY`,32);
 const observed=new Map<string,number>();let documents=0,occurrences=0;const monthlyBuyers=walletCount-nonBuyerCount;
 for(const r of rows){const day=r['DAY_VALUE'],buyers=integer(r['BUYER_COUNT']),n=integer(r['SOURCE_DOCUMENTS']);if(typeof day!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(day)||day<from||day>=until||!Number.isFinite(Date.parse(day+'T00:00:00Z'))||new Date(day+'T00:00:00Z').toISOString().slice(0,10)!==day||observed.has(day)||buyers<1||buyers>monthlyBuyers||buyers>n||integer(r['SOURCE_ROWS'])!==n)return incomplete();observed.set(day,buyers);documents+=n;occurrences+=buyers;}
 if(documents!==purchaseCount||occurrences<monthlyBuyers||!Number.isSafeInteger(documents)||!Number.isSafeInteger(occurrences))return incomplete();
 const calendar:string[]=[];for(const day=new Date(from+'T00:00:00Z');day.toISOString().slice(0,10)<until;day.setUTCDate(day.getUTCDate()+1)){calendar.push(day.toISOString().slice(0,10));if(calendar.length>31)return incomplete();}
 if(observed.size>calendar.length||[...observed.keys()].some(day=>!calendar.includes(day)))return incomplete();
 const items:Row[]=calendar.slice(offset,offset+limit).map(day=>{const buyers=observed.get(day)??0;return{id:`sankhya:wallet:day:${day}`,day,dayCode:Number(day.replaceAll('-','')),walletCount,buyerCount:buyers,nonBuyerCount:walletCount-buyers,source:'observado' as const,readOnly:true as const};});
 return{source:'sankhya' as const,readOnly:true as const,readAt:new Date().toISOString(),items,total:calendar.length,totalWithoutSearch:calendar.length,offset,companyCodes:companies,salesPolicy:p,view:'days' as const,summary:{month,from,until,walletCount,buyerCount:monthlyBuyers,nonBuyerCount,currentWallet:true as const,activeField:'TGFPAR.ATIVO' as const,activeValue:'S' as const,sellerAttribution:'current-CODVEND' as const,historyCompanyCodes:companies,beforeSearch:true as const,atomicSnapshot:false as const}};
}
