import {SankhyaError,type SankhyaGateway} from './gateway.ts';
import {readRecord,type ReadScope} from './read-model.ts';
/** Contexto do cadastro para conferência, sem seleção automática nem alteração de tela. */
export async function readOrderRegistry(g:Pick<SankhyaGateway,'select'>,value:unknown,scope:ReadScope):Promise<{source:string;readOnly:boolean;readAt:string;customerId:string;paymentCode:number;paymentLabel:string;agenda:string;conditionSource:string;agendaSource:string}>{
 if(!value||typeof value!=='object'||Array.isArray(value))throw new SankhyaError('INVALID_REQUEST','Contexto inválido.',400);
 const q=value as Record<string,unknown>;
 if(q['chooseFromWallet']===true&&Object.keys(q).length===1){
  const seller=scope.sellerCode,companies=scope.companyCodes;
  if(!Number.isSafeInteger(seller)||!seller||seller<1||seller>2147483647||!Array.isArray(companies)||!companies.length||companies.some(x=>x!==1&&x!==4))throw new SankhyaError('ERP_IDENTITY_REQUIRED','Vínculo de vendedor necessário para escolher caso.',403);
  const companyPredicate=`(P.CODEMP IN (${companies.join(',')})${companies.includes(1)?' OR P.CODEMP IS NULL':''})`;
  const candidates=await g.select(`SELECT P.CODPARC FROM TGFPAR P WHERE P.CODVEND=${seller} AND P.CODPARC>1 AND P.ATIVO='S' AND P.CLIENTE='S' AND ${companyPredicate} AND P.AD_STATUS_PEDIDO IN ('1','2','3','4') AND EXISTS(SELECT 1 FROM TGFCPL C JOIN TGFTPV T ON T.CODTIPVENDA=C.SUGTIPNEGSAID WHERE C.CODPARC=P.CODPARC AND C.SUGTIPNEGSAID>0 AND T.ATIVO='S' AND T.DHALTER=(SELECT MAX(X.DHALTER) FROM TGFTPV X WHERE X.CODTIPVENDA=T.CODTIPVENDA AND X.DHALTER<=SYSDATE)) ORDER BY P.CODPARC FETCH FIRST 5 ROWS ONLY`,5);
  for(const row of candidates){const code=Number(row['CODPARC']);if(!Number.isSafeInteger(code)||code<1||code>2147483647)throw new SankhyaError('ERP_INVALID_RESPONSE','Candidato inválido.',502);try{return await readOrderRegistry(g,{customerId:'sankhya:customer:'+code},scope);}catch(error){if(!(error instanceof SankhyaError)||error.code!=='ERP_CONTEXT_REQUIRED')throw error;}}
  throw new SankhyaError('ERP_CONTEXT_REQUIRED','Nenhum caso completo encontrado na seleção limitada da carteira; não alterar cadastros.',502);
 }
 if(Object.keys(q).some(k=>k!=='customerId')||typeof q['customerId']!=='string'||!/^sankhya:customer:[1-9]\d*$/.test(q['customerId']))throw new SankhyaError('INVALID_REQUEST','Cliente inválido.',400);
 const customer=(await readRecord(g,{resource:'customers',id:q['customerId']},scope)).record;
 if(!customer||customer['active']!==true)throw new SankhyaError('ERP_CONTEXT_REQUIRED','Cliente ativo no escopo necessário.',403);
 const code=Number(q['customerId'].split(':')[2]);if(!Number.isSafeInteger(code)||code>2147483647)throw new SankhyaError('INVALID_REQUEST','Cliente inválido.',400);
 const rows=await g.select(`SELECT P.CODPARC,P.AD_STATUS_PEDIDO,C.SUGTIPNEGSAID,T.DESCRTIPVENDA,T.ATIVO AS PAYMENT_ACTIVE FROM TGFPAR P LEFT JOIN TGFCPL C ON C.CODPARC=P.CODPARC LEFT JOIN TGFTPV T ON T.CODTIPVENDA=C.SUGTIPNEGSAID AND T.DHALTER=(SELECT MAX(X.DHALTER) FROM TGFTPV X WHERE X.CODTIPVENDA=T.CODTIPVENDA AND X.DHALTER<=SYSDATE) WHERE P.CODPARC=${code} AND P.ATIVO='S' AND P.CLIENTE='S' FETCH FIRST 2 ROWS ONLY`,2);
 const r=rows[0],paymentCode=Number(r?.['SUGTIPNEGSAID']),agenda=String(r?.['AD_STATUS_PEDIDO']??'');
 if(rows.length!==1||Number(r?.['CODPARC'])!==code||!Number.isSafeInteger(paymentCode)||paymentCode<1||!['1','2','3','4'].includes(agenda)||r?.['PAYMENT_ACTIVE']!=='S'||typeof r?.['DESCRTIPVENDA']!=='string')throw new SankhyaError('ERP_CONTEXT_REQUIRED','Sugestão Saída ou agenda ausente/ambígua; não presumir condição.',502);
 return {source:'sankhya',readOnly:true,readAt:new Date().toISOString(),customerId:q['customerId'],paymentCode,paymentLabel:r['DESCRTIPVENDA'],agenda,conditionSource:'TGFCPL.SUGTIPNEGSAID',agendaSource:'TGFPAR.AD_STATUS_PEDIDO'};
}
