import {walletDays} from './wallet-days.ts';
import { SankhyaError, type SankhyaGateway } from './gateway.ts';
import { currentCustomerWhere, scopeOf, sellerAllowed, type ReadScope } from './read-model.ts';
import { STANDARD_SALES_REPORT_POLICY } from './policy.ts';
import { foldERPText } from '../../../src/lib/erp-order.ts';
type Row=Record<string,unknown>;
type Transport=Pick<SankhyaGateway,'select'>;
const invalid=():never=>{throw new SankhyaError('INVALID_REQUEST','Parâmetros de consulta inválidos.',400);};
const incompatible=():never=>{throw new SankhyaError('ERP_INVALID_RESPONSE','Resposta ERP inválida ou incompleta.',502);};
const incomplete=():never=>{throw new SankhyaError('ERP_CONTEXT_REQUIRED','Contexto comercial ERP incompleto ou não confirmado.',502);};
function integer(v:unknown,min=0,max=Number.MAX_SAFE_INTEGER):number{
 if(typeof v!=='number'&&(typeof v!=='string'||!/^\d+$/.test(v)))return incompatible();
 const n=Number(v);return Number.isSafeInteger(n)&&n>=min&&n<=max?n:incompatible();
}
const literal=(v:string)=>`'${v.replace(/'/g,"''")}'`;
const fold=(v:string)=>`ASCIISTR(TRANSLATE(UPPER(${v}),'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ','AAAAAEEEEIIIIOOOOOUUUUCN'))`;
const text=(v:unknown):string|null=>v===null?null:typeof v==='string'?v:incompatible();
/** Carteira atual ativa, uma linha por CODPARC; compras em todas as filiais autorizadas.
 * Um bloqueio financeiro não muda ATIVO. SQL e escopo nunca vêm do navegador.
 */
export async function readNonBuyers(gateway:Transport,value:unknown,trustedScope:ReadScope){
 return readCurrentWallet(gateway,value,trustedScope,null);
}
/** Reutiliza a mesma qualificação da ausência mensal, sem subtrair carteiras de filiais. */
export async function readWallet(gateway:Transport,value:unknown,trustedScope:ReadScope){
 if(!value||typeof value!=='object'||Array.isArray(value))return invalid();
 const view=(value as Row)['view'];if(view!=='sellers'&&view!=='customers')return invalid();
 return readCurrentWallet(gateway,value,trustedScope,view);
}
export async function readWalletDays(gateway:Transport,value:unknown,trustedScope:ReadScope){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!['resource','month','offset','limit','sellerCode'].includes(k)))return invalid();
 return readCurrentWallet(gateway,value,trustedScope,'days');
}
async function readCurrentWallet(gateway:Transport,value:unknown,trustedScope:ReadScope,view:'sellers'|'customers'|'days'|null){
 if(!value||typeof value!=='object'||Array.isArray(value))return invalid();const q=value as Row;
 if(Object.keys(q).some(k=>![...['resource','month','offset','limit','search','sort','direction','customerId','sellerCode','status'],...(view?['view']:[])].includes(k))||q['resource']!=='customers')return invalid();
 const month=q['month'];if(typeof month!=='string'||!/^\d{4}-(?:0[1-9]|1[0-2])$/.test(month)||Number(month.slice(0,4))<1||Number(month.slice(0,4))>9998)return invalid();
 const y=Number(month.slice(0,4)),m=Number(month.slice(5)),from=month+'-01',until=m===12?`${String(y+1).padStart(4,'0')}-01-01`:`${String(y).padStart(4,'0')}-${String(m+1).padStart(2,'0')}-01`;
 const offset=q['offset'],limit=q['limit'];if(typeof offset!=='number'||!Number.isSafeInteger(offset)||offset<0||typeof limit!=='number'||!Number.isSafeInteger(limit)||limit<1||limit>50||offset>2147483647-limit)return invalid();
 const sort=q['sort']??'name',direction=q['direction']??'asc';if(!(view==='sellers'?['name','code','walletCount','buyerCount','nonBuyerCount']:view==='customers'?['name','code','seller','localStatus']:['name','code','seller','localStatus']).includes(String(sort))||typeof sort!=='string'||!['asc','desc'].includes(String(direction))||typeof direction!=='string'||q['status']!==undefined&&q['status']!=='confirmado')return invalid();
 const search=q['search']??'';if(typeof search!=='string'||search.length>120||/[\x00-\x1f;]|--|\/\*|\*\//.test(search)||/\b(INSERT|UPDATE|DELETE|MERGE|DROP|ALTER|CREATE|GRANT|EXECUTE|CALL|DBMS_|UTL_)\b/i.test(search))return invalid();
 const scope=scopeOf(trustedScope),where=[`(${scope.companies.map(c=>`(${currentCustomerWhere(trustedScope,c,true).join(' AND ')})`).join(' OR ')})`];
 if(q['customerId']!==undefined){const id=q['customerId'];if(typeof id!=='string'||!/^sankhya:customer:[1-9]\d{0,9}$/.test(id)||Number(id.slice(17))>2147483647)return invalid();where.push(`P.CODPARC=${Number(id.slice(17))}`);}
 if(q['sellerCode']!==undefined){const n=q['sellerCode'];if(typeof n!=='number'||!Number.isSafeInteger(n)||n<1||n>2147483647)return invalid();if(!sellerAllowed(scope,n))throw new SankhyaError('ERP_SCOPE_FORBIDDEN','Vendedor fora do escopo autorizado.',403);where.push(`P.CODVEND=${n}`);}
 const required={TGFPAR:{CODPARC:'NUMBER',CODVEND:'NUMBER',CODEMP:'NUMBER',ATIVO:'text',CLIENTE:'text',RAZAOSOCIAL:'text'},TGFCAB:{CODPARC:'NUMBER',CODEMP:'NUMBER',NUNOTA:'NUMBER',CODTIPOPER:'NUMBER',CODNAT:'NUMBER',DTNEG:'DATE',DHTIPOPER:'DATE',TIPMOV:'text',STATUSNOTA:'text'},TGFTOP:{CODTIPOPER:'NUMBER',DHALTER:'DATE',TIPMOV:'text',BONIFICACAO:'text',GOLDEV:'NUMBER'},TGFVEN:{CODVEND:'NUMBER',APELIDO:'text'}} as const;
 const names=[...new Set(Object.values(required).flatMap(fields=>Object.keys(fields)))];
 const columns=await gateway.select(`SELECT TABLE_NAME,COLUMN_NAME,DATA_TYPE FROM USER_TAB_COLUMNS WHERE TABLE_NAME IN ('TGFPAR','TGFCAB','TGFTOP','TGFVEN') AND COLUMN_NAME IN (${names.map(literal).join(',')}) ORDER BY TABLE_NAME,COLUMN_NAME FETCH FIRST 50 ROWS ONLY`,50);
 for(const[table,fields]of Object.entries(required))for(const[name,type]of Object.entries(fields))if(!columns.some(c=>c['TABLE_NAME']===table&&c['COLUMN_NAME']===name&&(type==='text'?['CHAR','NCHAR','VARCHAR2','NVARCHAR2'].includes(String(c['DATA_TYPE'])):c['DATA_TYPE']===type)))return incomplete();
 const p=STANDARD_SALES_REPORT_POLICY,start=`TO_DATE('${from}','YYYY-MM-DD')`,end=`TO_DATE('${until}','YYYY-MM-DD')`;
 const valid=`T.TIPMOV='${p.movement}' AND T.BONIFICACAO='${p.bonification}' AND T.GOLDEV=${p.devolution}`;
 const unknown="T.CODTIPOPER IS NULL OR T.TIPMOV IS NULL OR T.TIPMOV<>'P' OR T.BONIFICACAO IS NULL OR T.BONIFICACAO NOT IN ('N','S') OR T.GOLDEV IS NULL OR T.GOLDEV NOT IN (-1,1)";
 const cte=`WITH W AS (SELECT P.CODPARC,P.RAZAOSOCIAL,P.CODVEND,V.APELIDO FROM TGFPAR P LEFT JOIN TGFVEN V ON V.CODVEND=P.CODVEND WHERE ${where.join(' AND ')}), H AS (SELECT C.CODPARC,COUNT(CASE WHEN ${valid} AND C.DTNEG>=${start} AND C.DTNEG<${end} THEN 1 END) AS BOUGHT,COUNT(CASE WHEN C.NUNOTA IS NOT NULL AND ((${unknown}) OR (C.DTNEG IS NULL AND (${valid}))) THEN 1 END) AS UNKNOWN_COUNT,COUNT(*) AS SOURCE_ROWS,COUNT(DISTINCT C.NUNOTA) AS SOURCE_DOCUMENTS FROM TGFCAB C JOIN (SELECT DISTINCT CODPARC FROM W) X ON X.CODPARC=C.CODPARC LEFT JOIN TGFTOP T ON T.CODTIPOPER=C.CODTIPOPER AND T.DHALTER=C.DHTIPOPER WHERE C.CODEMP IN (${scope.companies.join(',')}) AND C.TIPMOV='${p.movement}' AND C.CODTIPOPER=${p.operationCode} AND C.CODNAT=${p.natureCode} AND C.STATUSNOTA='${p.statusCode}' AND (C.DTNEG IS NULL OR (C.DTNEG>=${start} AND C.DTNEG<${end})) GROUP BY C.CODPARC), Q AS (SELECT W.CODPARC,W.RAZAOSOCIAL,W.CODVEND,W.APELIDO,COALESCE(H.BOUGHT,0) AS BOUGHT,COALESCE(H.UNKNOWN_COUNT,0) AS UNKNOWN_COUNT,COALESCE(H.SOURCE_ROWS,0) AS SOURCE_ROWS,COALESCE(H.SOURCE_DOCUMENTS,0) AS SOURCE_DOCUMENTS FROM W LEFT JOIN H ON H.CODPARC=W.CODPARC)`;
 const stats=await gateway.select(`${cte} SELECT COUNT(*) AS WALLET_COUNT,COUNT(DISTINCT CODPARC) AS UNIQUE_CUSTOMERS,COUNT(CASE WHEN SOURCE_ROWS<>SOURCE_DOCUMENTS THEN 1 END) AS DUPLICATES,COUNT(CASE WHEN ${view==='days'?'UNKNOWN_COUNT>0':'BOUGHT=0 AND UNKNOWN_COUNT>0'} THEN 1 END) AS UNKNOWN_ABSENCE,COUNT(CASE WHEN BOUGHT=0 AND UNKNOWN_COUNT=0 THEN 1 END) AS NON_BUYERS${view==='days'?',COALESCE(SUM(BOUGHT),0) AS PURCHASE_COUNT':''} FROM Q`,1);
 if(stats.length!==1)return incompatible();const st=stats[0]!,walletCount=integer(st['WALLET_COUNT']),unique=integer(st['UNIQUE_CUSTOMERS']),duplicates=integer(st['DUPLICATES']),pending=integer(st['UNKNOWN_ABSENCE']),unfiltered=integer(st['NON_BUYERS']);
 if(walletCount!==unique||duplicates>0||pending>0)return incomplete();if(unfiltered>walletCount)return incompatible();
 if(view==='days')return walletDays(gateway,{cte,walletCount,nonBuyerCount:unfiltered,purchaseCount:integer(st['PURCHASE_COUNT']),offset,limit,month,from,until,companies:scope.companies});
 if(view)return walletWindow(gateway,q,view,{cte,walletCount,nonBuyerCount:unfiltered,offset,limit,sort,direction,search,month,from,until,companies:scope.companies,sellers:scope.sellers});
 const conditions=['Q.BOUGHT=0','Q.UNKNOWN_COUNT=0'],label='Sem compra no mês '+month;
 if(search.trim()){const pattern=literal('%'+foldERPText(search.trim()).replace(/[!%_]/g,c=>'!'+c)+'%');conditions.push(`(${['Q.RAZAOSOCIAL','TO_CHAR(Q.CODPARC)','Q.APELIDO',literal(label)].map(field=>`${fold(field)} LIKE ${pattern} ESCAPE '!'`).join(' OR ')})`);}
 const totalRows=search.trim()?await gateway.select(`${cte} SELECT COUNT(*) AS TOTAL FROM Q WHERE ${conditions.join(' AND ')}`,1):null;
 if(totalRows&&totalRows.length!==1)return incompatible();const total=totalRows?integer(totalRows[0]!['TOTAL']):unfiltered;if(total>unfiltered)return incompatible();
 const field=sort==='code'?'Q.CODPARC':sort==='seller'?fold('Q.APELIDO'):sort==='localStatus'?fold(literal(label)):fold('Q.RAZAOSOCIAL');
 const order=`${sort==='code'?field:`NLSSORT(${field},'NLS_SORT=BINARY')`} ${direction.toUpperCase()} NULLS LAST${sort==='code'?'':`,Q.CODPARC ${direction.toUpperCase()} NULLS LAST`}`;
 const native=await gateway.select(`${cte} SELECT Q.CODPARC,Q.RAZAOSOCIAL,Q.CODVEND,Q.APELIDO FROM Q WHERE ${conditions.join(' AND ')} ORDER BY ${order} OFFSET ${offset} ROWS FETCH NEXT ${limit} ROWS ONLY`,limit);
 if(native.length!==Math.min(limit,Math.max(0,total-offset)))return incompatible();const seen=new Set<number>();
 const items=native.map(row=>{const code=integer(row['CODPARC'],1,2147483647),seller=row['CODVEND']===null?null:integer(row['CODVEND'],0,2147483647);if(seen.has(code)||scope.sellers!==null&&(seller===null||!scope.sellers.includes(seller))||q['customerId']!==undefined&&q['customerId']!==`sankhya:customer:${code}`||q['sellerCode']!==undefined&&q['sellerCode']!==seller)return incompatible();seen.add(code);return{id:`sankhya:customer:${code}`,code:String(code),name:text(row['RAZAOSOCIAL']),seller:text(row['APELIDO']),sellerCode:seller,localStatus:label,source:'observado' as const,readOnly:true as const};});
 return{source:'sankhya' as const,readOnly:true as const,readAt:new Date().toISOString(),items,total,totalWithoutSearch:unfiltered,offset,companyCodes:scope.companies,salesPolicy:p,summary:{month,from,until,customerCount:unfiltered,walletCount,currentWallet:true as const,activeField:'TGFPAR.ATIVO' as const,activeValue:'S' as const,sellerAttribution:'current-CODVEND' as const,historyCompanyCodes:scope.companies,atomicSnapshot:false as const}};
}

type WalletContext={cte:string;walletCount:number;nonBuyerCount:number;offset:number;limit:number;sort:string;direction:string;search:string;month:string;from:string;until:string;companies:number[];sellers:readonly number[]|null};
async function walletWindow(gateway:Transport,q:Row,view:'sellers'|'customers',c:WalletContext){
 const{cte,walletCount,nonBuyerCount,offset,limit,sort,direction,search,month,from,until,companies}=c;
 const grouped=view==='sellers';
 const source=grouped?`${cte}, G AS (SELECT CODVEND,APELIDO,COUNT(*) AS WALLET_COUNT,COUNT(CASE WHEN BOUGHT>0 THEN 1 END) AS BUYER_COUNT,COUNT(CASE WHEN BOUGHT=0 THEN 1 END) AS NON_BUYER_COUNT FROM Q GROUP BY CODVEND,APELIDO)`:cte;
 const alias=grouped?'G':'Q',name=grouped?'G.APELIDO':'Q.RAZAOSOCIAL',code=grouped?'G.CODVEND':'Q.CODPARC';
 const state=`CASE WHEN Q.BOUGHT>0 THEN ${literal('Com compra no mês '+month)} ELSE ${literal('Sem compra no mês '+month)} END`;
 const conditions:string[]=[];
 if(search.trim()){
  const pattern=literal('%'+foldERPText(search.trim()).replace(/[!%_]/g,x=>'!'+x)+'%');
  conditions.push(`(${[name,`TO_CHAR(${code})`,...(grouped?[]:['Q.APELIDO',state])].map(f=>`${fold(f)} LIKE ${pattern} ESCAPE '!'`).join(' OR ')})`);
 }
 const where=conditions.length?' WHERE '+conditions.join(' AND '):'';
 const counts=await gateway.select(`${source} SELECT COUNT(*) AS GROUP_COUNT FROM ${alias}`,1);
 if(counts.length!==1)return incompatible();const unfiltered=integer(counts[0]!['GROUP_COUNT']);
 const filtered=where?await gateway.select(`${source} SELECT COUNT(*) AS GROUP_COUNT FROM ${alias}${where}`,1):counts;
 if(filtered.length!==1)return incompatible();const total=integer(filtered[0]!['GROUP_COUNT']);if(total>unfiltered||!grouped&&unfiltered!==walletCount)return incompatible();
 const field=sort==='code'?code:sort==='seller'?'Q.APELIDO':sort==='localStatus'?state:sort==='walletCount'?'G.WALLET_COUNT':sort==='buyerCount'?'G.BUYER_COUNT':sort==='nonBuyerCount'?'G.NON_BUYER_COUNT':name;
 const numeric=['code','walletCount','buyerCount','nonBuyerCount'].includes(sort),order=`${numeric?field:`NLSSORT(${fold(field)},'NLS_SORT=BINARY')`} ${direction.toUpperCase()} NULLS LAST${sort==='code'?'':`,${code} ${direction.toUpperCase()} NULLS LAST`}`;
 const native=await gateway.select(`${source} SELECT ${grouped?'G.CODVEND,G.APELIDO,G.WALLET_COUNT,G.BUYER_COUNT,G.NON_BUYER_COUNT':'Q.CODPARC,Q.RAZAOSOCIAL,Q.CODVEND,Q.APELIDO,Q.BOUGHT'} FROM ${alias}${where} ORDER BY ${order} OFFSET ${offset} ROWS FETCH NEXT ${limit} ROWS ONLY`,limit);
 if(native.length!==Math.min(limit,Math.max(0,total-offset)))return incompatible();const ids=new Set<string>();
 const items:Row[]=native.map(row=>{
  const sellerCode=row['CODVEND']===null?null:integer(row['CODVEND'],0,2147483647);
  if(c.sellers!==null&&(sellerCode===null||!c.sellers.includes(sellerCode))||q['sellerCode']!==undefined&&sellerCode!==q['sellerCode'])return incompatible();
  const seller=text(row['APELIDO']);let item:Row;
  if(grouped){
   const wallet=integer(row['WALLET_COUNT'],1),buyers=integer(row['BUYER_COUNT']),absent=integer(row['NON_BUYER_COUNT']);
   if(buyers+absent!==wallet||wallet>walletCount||buyers>walletCount-nonBuyerCount||absent>nonBuyerCount)return incompatible();
   item={id:`sankhya:wallet:seller:${sellerCode===null?'unassigned':sellerCode}`,code:sellerCode===null?null:String(sellerCode),name:seller,sellerCode,walletCount:wallet,buyerCount:buyers,nonBuyerCount:absent};
  }else{
   const customer=integer(row['CODPARC'],1,2147483647),bought=integer(row['BOUGHT'])>0;
   if(q['customerId']!==undefined&&q['customerId']!==`sankhya:customer:${customer}`)return incompatible();
   item={id:`sankhya:customer:${customer}`,code:String(customer),name:text(row['RAZAOSOCIAL']),seller,sellerCode,bought,localStatus:(bought?'Com':'Sem')+' compra no mês '+month};
  }
  if(ids.has(String(item['id'])))return incompatible();ids.add(String(item['id']));return{...item,source:'observado' as const,readOnly:true as const};
 });
 if(offset===0&&items.length===unfiltered&&total===unfiltered&&grouped&&(['walletCount','buyerCount','nonBuyerCount'] as const).some((key,i)=>items.reduce((n,r)=>n+Number((r as Row)[key]),0)!==[walletCount,walletCount-nonBuyerCount,nonBuyerCount][i]))return incompatible();
 return{source:'sankhya' as const,readOnly:true as const,readAt:new Date().toISOString(),items,total,totalWithoutSearch:unfiltered,offset,companyCodes:companies,salesPolicy:STANDARD_SALES_REPORT_POLICY,view,summary:{month,from,until,walletCount,buyerCount:walletCount-nonBuyerCount,nonBuyerCount,currentWallet:true as const,activeField:'TGFPAR.ATIVO' as const,activeValue:'S' as const,sellerAttribution:'current-CODVEND' as const,historyCompanyCodes:companies,beforeSearch:true as const,atomicSnapshot:false as const}};
}
