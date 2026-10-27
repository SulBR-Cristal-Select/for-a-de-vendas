import {SankhyaError,type SankhyaGateway} from './gateway.ts';
import type {ReadScope} from './read-model.ts';
/** Leitura administrativa pontual: CODVEND da carteira não é identidade do parceiro. Sem CPF, senha ou alteração. */
export async function readPartnerIdentity(g:Pick<SankhyaGateway,'select'>,value:unknown,scope:ReadScope){
 if(scope.role!=='administrador')throw new SankhyaError('FORBIDDEN','Consulta reservada ao administrador.',403);
 if(!value||typeof value!=='object'||Array.isArray(value))throw new SankhyaError('INVALID_REQUEST','Consulta inválida.',400);
 const q=value as Record<string,unknown>;
 if(Object.keys(q).some(k=>!['kind','partnerCode'].includes(k))||q['kind']!=='partner-identity'||typeof q['partnerCode']!=='number'||!Number.isSafeInteger(q['partnerCode'])||q['partnerCode']<1||q['partnerCode']>2147483647)throw new SankhyaError('INVALID_REQUEST','Código de parceiro inválido.',400);
 const code=q['partnerCode'];const columns=await g.select("SELECT TABLE_NAME,COLUMN_NAME,DATA_TYPE FROM USER_TAB_COLUMNS WHERE (TABLE_NAME='TGFPAR' AND COLUMN_NAME IN ('CODPARC','NOMEPARC','RAZAOSOCIAL','ATIVO','CLIENTE','VENDEDOR','CODVEND')) OR (TABLE_NAME='TGFVEN' AND COLUMN_NAME IN ('CODVEND','CODPARC','APELIDO','ATIVO','TIPVEND','CODEMP')) ORDER BY TABLE_NAME,COLUMN_NAME FETCH FIRST 13 ROWS ONLY",13);
 const has=(table:string,field:string)=>columns.some(x=>x['TABLE_NAME']===table&&x['COLUMN_NAME']===field);
 if(!['CODPARC','NOMEPARC','RAZAOSOCIAL','ATIVO','CLIENTE','CODVEND'].every(x=>has('TGFPAR',x))||!['CODVEND','CODPARC','APELIDO','ATIVO','TIPVEND','CODEMP'].every(x=>has('TGFVEN',x)))throw new SankhyaError('ERP_CONTEXT_REQUIRED','Esquema de identidade não confirmado.',502);
 const partner=await g.select(`SELECT P.CODPARC,P.NOMEPARC,P.RAZAOSOCIAL,P.ATIVO,P.CLIENTE,${has('TGFPAR','VENDEDOR')?'P.VENDEDOR':'CAST(NULL AS VARCHAR2(1)) AS VENDEDOR'},P.CODVEND AS ASSIGNED_SELLER_CODE FROM TGFPAR P WHERE P.CODPARC=${code} FETCH FIRST 1 ROWS ONLY`,1);
 const sellers=await g.select(`SELECT V.CODVEND,V.CODPARC,V.APELIDO,V.ATIVO,V.TIPVEND,V.CODEMP FROM TGFVEN V WHERE V.CODPARC=${code} ORDER BY V.CODVEND FETCH FIRST 50 ROWS ONLY`,50);
 return {source:'sankhya',readOnly:true,readAt:new Date().toISOString(),partnerCode:code,partner:partner[0]??null,sellerLinks:sellers,hasMore:sellers.length===50,identityRelation:'TGFVEN.CODPARC = TGFPAR.CODPARC',assignedSellerIsIdentity:false};
}
