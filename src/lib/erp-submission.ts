import { canonicalHash, record, type Canonical, type FreightType, type Row, type SubmissionReceipt, type SubmissionReview, type SubmissionResult } from './erp-submission-contract';
export type SubmissionOperation='order-send-review'|'order-send-submit'|'order-send-status';
export type SubmissionTransport=(body:{operation:SubmissionOperation;query:Row},signal:AbortSignal)=>Promise<{data:unknown;error:unknown}>;
const phases=['inclusao_incerta','incluido','confirmacao_incerta','confirmacao_falhou','confirmado'];
const isUUID=(v:unknown)=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
const isHash=(v:unknown)=>typeof v==='string'&&/^[0-9a-f]{64}$/.test(v);
const isTime=(v:unknown)=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}T/.test(v)&&Number.isFinite(Date.parse(v));
export class SubmissionError extends Error {constructor(public readonly code:string,message:string){super(message);}}
function invalid():never{throw new SubmissionError('INVALID_RESPONSE','Resposta de envio incompatível. Não crie outro pedido para repetir a tentativa.');}
export function decodeSubmissionReceipt(value:unknown):SubmissionReceipt|null {
  if(value===null||value===undefined)return null;
  const r=record(value);
  if(Object.keys(r).length!==9||Object.keys(r).some(k=>!['id','hash','approvedBy','approvedAt','phase','nunota','status','checkedAt','errorCode'].includes(k))||!isUUID(r['id'])||!isHash(r['hash'])||!isUUID(r['approvedBy'])||!isTime(r['approvedAt'])||!phases.includes(String(r['phase']))||r['nunota']!==null&&(typeof r['nunota']!=='number'||!Number.isSafeInteger(r['nunota'])||r['nunota']<1)||r['status']!==null&&(typeof r['status']!=='string'||!/^[A-Z]$/.test(r['status']))||r['checkedAt']!==null&&!isTime(r['checkedAt'])||r['errorCode']!==null&&(typeof r['errorCode']!=='string'||!/^[A-Z][A-Z0-9_]{0,63}$/.test(r['errorCode'])))return invalid();
  if(r['phase']==='confirmado'&&(r['status']!=='L'||r['nunota']===null||r['checkedAt']===null))return invalid();
  if(r['phase']!=='inclusao_incerta'&&r['nunota']===null)return invalid();
  return r as unknown as SubmissionReceipt;
}
export function createSubmissionClient(transport:SubmissionTransport){
  let identity:string|null=null,generation=0;
  const controllers=new Set<AbortController>();
  async function invoke(operation:SubmissionOperation,query:Row):Promise<Row>{
    if(!identity)throw new SubmissionError('AUTH_REQUIRED','Entre na conta do titular para enviar.');
    if(!isUUID(query['orderId']))throw new SubmissionError('INVALID_REQUEST','Pedido inválido.');
    const own=generation,controller=new AbortController();controllers.add(controller);
    try{
      const result=await transport({operation,query},controller.signal);
      if(own!==generation)throw new SubmissionError('REQUEST_CANCELLED','A sessão mudou; confira o recibo na conta correta.');
      if(result.error){
        let data:Row={};
        const error=result.error as {context?:unknown};
        if(error?.context instanceof Response){try{data=record(await error.context.clone().json());}catch{/* Sem resposta confiável: não repetir. */}}
        if(own!==generation)throw new SubmissionError('REQUEST_CANCELLED','A sessão mudou; confira o recibo na conta correta.');
        const code=typeof data['code']==='string'&&/^[A-Z][A-Z0-9_]{0,63}$/.test(data['code'])?data['code']:'ERP_SUBMISSION_UNCERTAIN';
        const messages:Record<string,string>={ERP_IDENTITY_REQUIRED:'Vínculo explícito de vendedor e filial ERP necessário.',FORBIDDEN:'Pedido fora do acesso comercial do titular.',ERP_SCOPE_FORBIDDEN:'Vendedor ou filial fora do acesso do titular.',ERP_PRICE_CHANGED:'Preço ou contexto mudou. Atualize o pedido antes de aprovar.',ERP_ORDER_CONTEXT_CHANGED:'Condição, agenda ou natureza divergem do cadastro. Confira o pedido.',ERP_APPROVAL_CHANGED:'A versão mudou. Confira novamente; não foi autorizada outra versão.',REVISION_CONFLICT:'O pedido foi alterado. Reabra a conferência.',ERP_ORDER_DIVERGED:'Pedido ERP diverge da versão aprovada. Não reincluir nem confirmar.',ERP_ORDER_AMBIGUOUS:'Número externo com mais de um candidato. Não reincluir.',ERP_SUBMISSION_UNAVAILABLE:'Fluxo de envio indisponível no servidor; nada será reenviado automaticamente.',ERP_CONTEXT_REQUIRED:'Preencha o Nº Pedido do Cliente e confira cliente, entrega, agenda, condição e itens.'};
        throw new SubmissionError(code,messages[code]??'Resultado não comprovado. Retome o mesmo pedido para consultar o recibo, sem criar outra inclusão.');
      }
      const data=record(result.data);if(data['orderId']!==query['orderId'])return invalid();return data;
    }finally{controllers.delete(controller);}
  }
  return {
    setIdentity(value:string|null){if(value===identity)return;identity=value;generation++;for(const c of controllers)c.abort();controllers.clear();},
    async review(orderId:string,freightType:FreightType):Promise<SubmissionReview>{
      if(!['C','F'].includes(freightType))throw new SubmissionError('INVALID_REQUEST','Escolha CIF ou FOB.');
      const data=await invoke('order-send-review',{orderId,freightType}),canonical=record(data['canonical']) as unknown as Canonical;
      if(!isHash(data['hash'])||!isHash(data['fingerprint'])||canonical.schema_version!=='1.1'||canonical.modo!=='envio'||canonical.analise_id!==orderId||canonical.estado!=='pronto_para_confirmar'||canonical.aprovacao?.status!=='pendente'||canonical.pedidos_fiscais?.length!==1||canonical.pedidos_fiscais[0]?.pedido_id!==orderId||canonical.pedidos_fiscais[0]?.frete_codigo!==freightType||await canonicalHash(canonical)!==data['hash'])return invalid();
      const receipt=decodeSubmissionReceipt(data['receipt']);if(receipt&&receipt.hash!==data['hash'])return invalid();
      return {orderId,fingerprint:data['fingerprint'] as string,hash:data['hash'] as string,canonical,receipt};
    },
    async submit(review:SubmissionReview,approval:{approved:true;requestId:string}):Promise<SubmissionResult>{
      if(approval.approved!==true||!isUUID(approval.requestId)||await canonicalHash(review.canonical)!==review.hash)return invalid();
      const data=await invoke('order-send-submit',{orderId:review.orderId,freightType:review.canonical.pedidos_fiscais[0].frete_codigo,hash:review.hash,fingerprint:review.fingerprint,requestId:approval.requestId,approved:true});
      const receipt=decodeSubmissionReceipt(data['receipt']);
      if(!receipt||receipt.hash!==review.hash||typeof data['verified']!=='boolean'||data['verified']&&receipt.phase!=='confirmado')return invalid();
      return {orderId:review.orderId,receipt,verified:data['verified']};
    },
    async status(orderId:string){const data=await invoke('order-send-status',{orderId});return{orderId,receipt:decodeSubmissionReceipt(data['receipt'])};},
  };
}
export type SubmissionClient=ReturnType<typeof createSubmissionClient>;
