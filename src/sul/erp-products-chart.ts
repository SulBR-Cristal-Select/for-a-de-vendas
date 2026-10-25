import {useEffect,useState} from 'react';
import {ERPOnlineError,type ERPItemSummary} from '../lib/erp-online';
import {decimalUnits,erpDecimal,sumERPDecimals} from '../lib/erp-decimal';
import type {ERPClient,ERPReportSource} from './erp-hooks';
import {salesChartCoordinate} from './erp-sales-chart';
export type ProductsChartContext={summary:ERPItemSummary|undefined;source?:ERPReportSource};
export type ProductsChartPoint={id:string;label:string;value:number;nativeQuantity:string;nativeTotal:string};
const invalid=()=>new ERPOnlineError('INVALID_RESPONSE');
/** Só agregados; não usa página da tabela, não copia históricos e não soma unidades distintas. */
export async function readERPProductsChart(client:ERPClient,context:ProductsChartContext,assertCurrent:()=>void=()=>{}):Promise<ProductsChartPoint[]>{
 const {summary,source}=context;if(!summary||!source||source.query.resource!=='orders'||!('productReport' in source.query)||source.query.productReport!==true)throw invalid();
 if(summary.lineCount===0||summary.subtotal===null||summary.missingSubtotalCount>0)return[];
 const points:ProductsChartPoint[]=[],ids=new Set<unknown>(),labels=new Set<string>(),units=new Set<string>();let total:number|undefined,unfiltered:number|undefined,count=0n,unavailable=false;
 for(let offset=0;;offset+=50){
  assertCurrent();const w=await client.orderItemsReport({...source.query,resource:'orders',productReport:true,sort:'name',direction:'asc',offset,limit:50});assertCurrent();
  if(JSON.stringify(w.summary)!==JSON.stringify(summary)||[...w.companyCodes].sort().join(',')!==[...source.companyCodes].sort().join(',')||total!==undefined&&(total!==w.total||unfiltered!==w.totalWithoutSearch))throw invalid();
  total=w.total;unfiltered=w.totalWithoutSearch;if(total>summary.lineCount||!w.items.length)throw invalid();
  for(const r of w.items){const id=r['id'],qty=r['qty'],value=r['total'],name=r['name'],unit=r['unit'],n=r['lineCount'];
   if(typeof id!=='string'||ids.has(id)||erpDecimal(value)===null||!Number.isSafeInteger(n)||(n as number)<1)throw invalid();
   ids.add(id);count+=BigInt(n as number);
   // BarList usa rótulo como chave e números como coordenadas. Não inventar rótulo/unidade/zero.
   if(erpDecimal(qty)===null||typeof name!=='string'||name.trim()===''||labels.has(name)||typeof unit!=='string'||decimalUnits(qty as string)<0n){unavailable=true;continue;}
   labels.add(name);units.add(unit);points.push({id,label:name,value:salesChartCoordinate(qty as string),nativeQuantity:qty as string,nativeTotal:value as string});
  }
  if(ids.size>=total)break;
 }
 if(ids.size!==total||count!==BigInt(summary.lineCount))throw invalid();
 // Valores e quantidades nunca são somados em Number. Recusa parcial antes de renderizar.
 if(unavailable||units.size!==1)return[];
 if(decimalUnits(sumERPDecimals(points.map(p=>p.nativeTotal)))!==decimalUnits(summary.subtotal))throw invalid();
 return points;
}
export function useERPProductsChart(client:ERPClient|undefined,context:ProductsChartContext|undefined):ProductsChartPoint[]{
 const[result,setResult]=useState<{client:ERPClient;context:ProductsChartContext;rows:ProductsChartPoint[]}>();
 useEffect(()=>{if(!client||!context?.source||!context.summary)return;let alive=true;const assertCurrent=()=>{if(!alive)throw new ERPOnlineError('REQUEST_CANCELLED');};
  void readERPProductsChart(client,context,assertCurrent).then(rows=>{if(alive)setResult({client,context,rows});}).catch(()=>{if(alive)setResult({client,context,rows:[]});});return()=>{alive=false;};
 },[client,context]);
 return result&&result.client===client&&result.context===context?result.rows:[];
}
