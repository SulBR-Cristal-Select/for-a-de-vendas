import type {CustomerGroup} from '../../../src/lib/customer-groups.ts';
import { salesOperationSQL } from '../../../src/lib/sales-operations.ts';
import { SankhyaError, type SankhyaGateway } from './gateway.ts';
import { currentCustomerWhere, scopeOf, sellerAllowed, type ReadScope } from './read-model.ts';
import { CUSTOMER_INDICATOR_POLICY } from './policy.ts';
type Row = Record<string, unknown>;
type Transport = Pick<SankhyaGateway, 'select'>;
const invalid = (): never => { throw new SankhyaError('INVALID_REQUEST', 'Consulta de indicadores de clientes inválida.', 400); };
const incompatible = (): never => { throw new SankhyaError('ERP_INVALID_RESPONSE', 'Indicadores de clientes incompletos ou incompatíveis.', 502); };
function day(value: unknown): string {
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||value.startsWith('0000-'))return invalid();
 const d=new Date(value+'T00:00:00Z');return Number.isFinite(d.valueOf())&&d.toISOString().slice(0,10)===value?value:invalid();
}
function count(value: unknown): number {
 if(typeof value!=='number'&&(typeof value!=='string'||!/^(?:0|[1-9]\d*)$/.test(value)))return incompatible();
 const n=Number(value);return Number.isSafeInteger(n)&&n>=0?n:incompatible();
}
function counts(row: Row) {
 const customerCount=count(row['CUSTOMER_COUNT']),activeKnown=count(row['ACTIVE_COUNT']),activeUnknown=count(row['UNKNOWN_ACTIVE_COUNT']),newKnown=count(row['NEW_COUNT']),newUnknown=count(row['UNKNOWN_NEW_COUNT']);
 if(activeKnown>customerCount-activeUnknown||newKnown>customerCount-newUnknown)return incompatible();
 return{customerCount,activeKnown,activeUnknown,newKnown,newUnknown,activeCustomerCount:activeUnknown===0?activeKnown:null,newCustomerCount:newUnknown===0?newKnown:null};
}
/** Agregados fixos; o escopo vem do Auth servidor, nunca do corpo do navegador. */
export async function readCustomerMetrics(gateway:Transport,value:unknown,trustedScope:ReadScope,combined=false,groups:readonly CustomerGroup[]=[]){
 if(!value||typeof value!=='object'||Array.isArray(value))return invalid();const input=value as Row;
 if(Object.keys(input).some(k=>!['kind','section','companyCode','from','to','offset',...(combined?['sellerCode']:[])].includes(k))||input['kind']!=='analytics'||input['section']!=='customers')return invalid();
 const companyCode=input['companyCode'];if(!(combined&&companyCode===undefined)&&companyCode!==1&&companyCode!==4)throw new SankhyaError('ERP_SCOPE_FORBIDDEN','Filial fora do escopo autorizado.',403);
 const scope=scopeOf(trustedScope),companies=companyCode===undefined?scope.companies:[companyCode as number],where=companyCode===undefined?[`(${companies.map(c=>'('+currentCustomerWhere(trustedScope,c,false).join(' AND ')+')').join(' OR ')})`]:currentCustomerWhere(trustedScope,companyCode as number,false);
 if(combined&&input['sellerCode']!==undefined){const v=input['sellerCode'];if(typeof v!=='number'||!Number.isSafeInteger(v)||v<1||v>2147483647)return invalid();if(!sellerAllowed(scope,v))throw new SankhyaError('ERP_SCOPE_FORBIDDEN','Vendedor fora do escopo autorizado.',403);where.push(`P.CODVEND=${v}`);}
 const from=day(input['from']),to=day(input['to']),offset=input['offset']??0,span=Date.parse(to+'T00:00:00Z')-Date.parse(from+'T00:00:00Z');
 if(span<0||span>366*86400000||typeof offset!=='number'||!Number.isSafeInteger(offset)||offset<0||offset>2147483597)return invalid();
 const required={
  TGFPAR:{CODPARC:'NUMBER',CODVEND:'NUMBER',CODEMP:'NUMBER',ATIVO:'text',CLIENTE:'text'},
  TGFCAB:{CODPARC:'NUMBER',CODEMP:'NUMBER',CODTIPOPER:'NUMBER',CODNAT:'NUMBER',NUNOTA:'NUMBER',DTNEG:'DATE',DHTIPOPER:'DATE',TIPMOV:'text',STATUSNOTA:'text'},
  TGFTOP:{CODTIPOPER:'NUMBER',DHALTER:'DATE',TIPMOV:'text',BONIFICACAO:'text',GOLDEV:'NUMBER'},
 } as const;
 const names=[...new Set(Object.values(required).flatMap(fields=>Object.keys(fields)))];
 const columns=await gateway.select(`SELECT TABLE_NAME,COLUMN_NAME,DATA_TYPE FROM USER_TAB_COLUMNS WHERE TABLE_NAME IN ('TGFPAR','TGFCAB','TGFTOP') AND COLUMN_NAME IN (${names.map(n=>`'${n}'`).join(',')}) ORDER BY TABLE_NAME,COLUMN_NAME FETCH FIRST 50 ROWS ONLY`,50);
 for(const[table,fields]of Object.entries(required))for(const[name,type]of Object.entries(fields))if(!columns.some(c=>c['TABLE_NAME']===table&&c['COLUMN_NAME']===name&&(type==='text'?['CHAR','NCHAR','VARCHAR2','NVARCHAR2'].includes(String(c['DATA_TYPE'])):c['DATA_TYPE']===type)))throw new SankhyaError('ERP_CONTEXT_REQUIRED','Estrutura dos indicadores de clientes não confirmada.',502);
 const p=CUSTOMER_INDICATOR_POLICY.newCustomer.origin;
 const start=`TO_DATE('${from}','YYYY-MM-DD')`,end=`TO_DATE('${to}','YYYY-MM-DD')+1`;
 const valid=`T.TIPMOV='P' AND T.BONIFICACAO='${p.bonification}' AND T.GOLDEV=${p.devolution}`;
 const unknown="H.NUNOTA IS NOT NULL AND (T.CODTIPOPER IS NULL OR T.TIPMOV IS NULL OR T.TIPMOV<>'P' OR T.BONIFICACAO IS NULL OR T.BONIFICACAO NOT IN ('N','S') OR T.GOLDEV IS NULL OR T.GOLDEV NOT IN (-1,1))";
 // O filtro do período NÃO antecede MIN: uma recompra não pode virar primeira compra.
 const key=groups.length?`CASE ${groups.map((g,i)=>`WHEN P.CODPARC IN (${g.memberIds.map(id=>Number(id.slice(17))).join(',')}) THEN 'group:${i}'`).join(' ')} ELSE 'customer:'||TO_CHAR(P.CODPARC) END`:'P.CODPARC';
 const identity=groups.length?`${key} AS CODPARC,CASE WHEN COUNT(DISTINCT P.CODVEND)=1 AND COUNT(P.CODVEND)=COUNT(*) THEN MIN(P.CODVEND) END AS CODVEND,CASE WHEN COUNT(CASE WHEN P.ATIVO='S' THEN 1 END)>0 THEN 'S' WHEN COUNT(CASE WHEN P.ATIVO='N' THEN 1 END)=COUNT(*) THEN 'N' END AS ATIVO`:'P.CODPARC,P.CODVEND,P.ATIVO';
 const history=`SELECT ${identity},MIN(CASE WHEN ${valid} THEN H.DTNEG END) AS FIRST_STANDARD_DATE,MIN(CASE WHEN ${unknown} THEN H.DTNEG END) AS FIRST_UNKNOWN_DATE,COUNT(CASE WHEN H.NUNOTA IS NOT NULL AND H.DTNEG IS NULL AND ((${valid}) OR (${unknown})) THEN 1 END) AS UNDATED_COUNT,COUNT(CASE WHEN (${unknown}) AND H.DTNEG>=${start} AND H.DTNEG<${end} THEN 1 END) AS UNKNOWN_PERIOD_COUNT FROM TGFPAR P LEFT JOIN TGFCAB H ON H.CODPARC=P.CODPARC AND H.CODEMP IN (${scope.companies.join(',')}) AND H.TIPMOV='${p.movement}' AND ${salesOperationSQL('H.CODTIPOPER')} AND H.CODNAT=${p.natureCode} AND H.STATUSNOTA='${p.statusCode}' LEFT JOIN TGFTOP T ON T.CODTIPOPER=H.CODTIPOPER AND T.DHALTER=H.DHTIPOPER WHERE ${where.join(' AND ')} GROUP BY ${groups.length?key:'P.CODPARC,P.CODVEND,P.ATIVO'}`;
 const inPeriod=`C.FIRST_STANDARD_DATE>=${start} AND C.FIRST_STANDARD_DATE<${end}`;
 // Compra válida anterior ao período já prova que o cliente não é novo. Nos demais casos,
 // contexto/datas históricos incompletos não autorizam declarar primeira compra ou zero.
 const pending=`CASE WHEN C.FIRST_STANDARD_DATE<${start} THEN 0 WHEN C.UNDATED_COUNT>0 THEN 1 WHEN (${inPeriod}) AND C.FIRST_UNKNOWN_DATE<${start} THEN 1 WHEN (C.FIRST_STANDARD_DATE IS NULL OR C.FIRST_STANDARD_DATE>=${end}) AND C.UNKNOWN_PERIOD_COUNT>0 THEN 1 ELSE 0 END`;
 const qualified=`SELECT C.CODVEND,C.ATIVO,CASE WHEN ${inPeriod} THEN 1 ELSE 0 END AS NEW_IN_PERIOD,${pending} AS PENDING_NEW FROM (${history}) C`;
 const measures="COUNT(*) AS CUSTOMER_COUNT,COUNT(CASE WHEN Q.ATIVO='S' THEN 1 END) AS ACTIVE_COUNT,COUNT(CASE WHEN Q.ATIVO IS NULL OR Q.ATIVO NOT IN ('S','N') THEN 1 END) AS UNKNOWN_ACTIVE_COUNT,COUNT(CASE WHEN Q.NEW_IN_PERIOD=1 AND Q.PENDING_NEW=0 THEN 1 END) AS NEW_COUNT,COUNT(CASE WHEN Q.PENDING_NEW=1 THEN 1 END) AS UNKNOWN_NEW_COUNT";
 const totalRows=await gateway.select(`SELECT ${measures} FROM (${qualified}) Q`,1);if(totalRows.length!==1)return incompatible();const totals=counts(totalRows[0]!);
 const native=await gateway.select(`SELECT Q.CODVEND,${measures} FROM (${qualified}) Q GROUP BY Q.CODVEND ORDER BY Q.CODVEND NULLS LAST OFFSET ${offset} ROWS FETCH NEXT 50 ROWS ONLY`,50);
 const seen=new Set<number|null>();
 const rows=native.map(row=>{const raw=row['CODVEND'];if(raw===undefined)return incompatible();const sellerCode=raw===null?null:count(raw);if(sellerCode!==null&&sellerCode>2147483647||seen.has(sellerCode))return incompatible();seen.add(sellerCode);return{sellerCode,...counts(row)};});
 let groupCount:number|undefined;if(combined){const groups=await gateway.select(`SELECT COUNT(*) AS GROUP_COUNT FROM (SELECT Q.CODVEND FROM (${qualified}) Q GROUP BY Q.CODVEND) G`,1);if(groups.length!==1)return incompatible();groupCount=count(groups[0]!['GROUP_COUNT']);if(rows.length!==Math.min(50,Math.max(0,groupCount-offset)))return incompatible();}
 const hasMore=combined?offset+rows.length<groupCount!:rows.length===50;
 for(const key of ['customerCount','activeKnown','activeUnknown','newKnown','newUnknown']as const){const sum=rows.reduce((n,r)=>n+r[key],0);if(!Number.isSafeInteger(sum)||sum>totals[key]||offset===0&&!hasMore&&sum!==totals[key])return incompatible();}
 return{source:'sankhya' as const,readOnly:true,supported:true,readAt:new Date().toISOString(),companyCode:companyCode??null,...(combined?{companyCodes:companies,groupCount}:{}),from,to,offset,hasMore,historyCompanyCodes:scope.companies,currentWallet:true,sellerAttribution:'current-CODVEND' as const,newCustomerPolicy:CUSTOMER_INDICATOR_POLICY.newCustomer,activeCustomerPolicy:CUSTOMER_INDICATOR_POLICY.activeCustomer,totals,rows,atomicSnapshot:false,
  coverage:{policy:CUSTOMER_INDICATOR_POLICY.coverage,available:false,value:null,numerator:null,denominator:totals.activeCustomerCount,reason:'ERP_ACTIVITY_REFERENCE_UNAVAILABLE' as const},
  ordersAdded:false,identityChanged:false};
}
