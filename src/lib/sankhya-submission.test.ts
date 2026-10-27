import { beforeEach, describe, expect, it, vi } from 'vitest';
import { canonicalHash, inclusionPayload, makeCanonical, type Row, type SubmissionReceipt } from './erp-submission-contract';
import { SankhyaError } from '../../supabase/functions/sankhya-online/gateway';
import { reviewSubmission, submitOrder, submissionStatus, type SubmissionDeps } from '../../supabase/functions/sankhya-online/submission';
import { fixtureActorId as actorId, fixtureOrderId as orderId, fixtureRequestId as requestId, fixtureFingerprint as fingerprint, submissionFixture } from '../test/submission-fixture';
const mocks=vi.hoisted(()=>({price:vi.fn(),record:vi.fn()}));
vi.mock('../../supabase/functions/sankhya-online/price-context',()=>({readPrice:mocks.price}));
vi.mock('../../supabase/functions/sankhya-online/read-model',()=>({readRecord:mocks.record}));
function rig(company:1|4=1){
  const order=submissionFixture(company);let receipt:SubmissionReceipt|null=null,exists=false,status='A';
  const cab=()=>({NUNOTA:101,CODEMP:company,CODPARC:141,CODVEND:12,CODTIPOPER:1001,CODTIPVENDA:29,CODNAT:10100000,AD_STATUS_PEDIDO:'1',TIPMOV:'P',DTNEG:'26/10/2026',DTPREVENT:'27/10/2026',NUMPEDIDO2:'FIXTURE-SEM-ENV',CIF_FOB:'C',STATUSNOTA:status,VLRNOTA:'11.75',OBSERVACAO_VAZIA:'S'});
  const item=()=>({CODPROD:11240,CODVOL:'PC',CODLOCALORIG:108,CONTROLE:' ',QTDNEG:'1',VLRUNIT:'11.75',VLRTOT:'11.75',PERCDESC:'0'});
  const select=vi.fn(async(sql:string,_limit:number):Promise<Row[]>=>{
    if(sql.includes('FROM TGFPAR P LEFT JOIN'))return[{CODPARC:141,CLIENTE:'S',ATIVO:'S',AD_STATUS_PEDIDO:'1',SUGTIPNEGSAID:29,CONDICAO_VALIDADA:29,CODNAT:10100000,ATIVA:'S',ANALITICA:'S'}];
    if(sql.includes('FROM TGFCAB C'))return exists?[cab()]:[];
    if(sql.includes('FROM TGFITE I'))return[item()];
    throw new Error('Consulta não prevista na fixture');
  });
  const includeOrder=vi.fn(async()=>{exists=true;return 101;});
  const confirmOrder=vi.fn(async()=>{status='L';});
  const rpc=vi.fn(async()=>({data:{order:{...order,receipt,freightType:receipt?'C':null},fingerprint},error:null}));
  const write=vi.fn(async(args:Row)=>{
    const next=args['p_receipt'] as SubmissionReceipt,expected=args['p_expected_phase'];
    if(receipt&&(expected===null||receipt.phase!==expected))return{acquired:false,receipt};
    receipt=structuredClone(next);return{acquired:true,receipt};
  });
  const deps:SubmissionDeps={actor:{id:actorId,company_id:'432299',role:'vendedor',active:true,binding:{userId:actorId,sellerId:'sankhya:seller:12',sellerCode:12,companyCodes:[company]}},rpc,write,gateway:{select,contextPrices:vi.fn(),includeOrder,confirmOrder},now:()=> '2026-10-26T11:56:00.000Z'};
  mocks.price.mockResolvedValue({customer:{cnpj:'00000000000000',state:'PR'},companyCode:company,operationCode:1001,operationVersion:'2026-01-01T00:00:00',payment:{version:'2026-01-01T00:00:00'},price:{amount:11.75,localCode:108,control:' '}});
  mocks.record.mockResolvedValue({record:{cnpj:'00000000000000',state:'PR'}});
  return{deps,order,select,rpc,write,includeOrder,confirmOrder,cab,item,setExists:(v=true)=>{exists=v;},setStatus:(v:string)=>{status=v;},getReceipt:()=>receipt,setReceipt:(v:SubmissionReceipt)=>{receipt=v;}};
}
async function approved(r:ReturnType<typeof rig>){const review=await reviewSubmission(r.deps,{orderId,freightType:'C'});return{orderId,freightType:'C',hash:review.hash,fingerprint,requestId,approved:true};}
beforeEach(()=>vi.clearAllMocks());
describe('canônico e contexto de envio',()=>{
  it('confere sem escrever e mantém todas as chamadas limitadas',async()=>{const r=rig();const view=await reviewSubmission(r.deps,{orderId,freightType:'C'});expect(view.canonical.pedidos_fiscais[0].total).toBe(11.75);expect(r.write).not.toHaveBeenCalled();expect(r.includeOrder).not.toHaveBeenCalled();expect(r.select.mock.calls.every(c=>c[1]<=50)).toBe(true);});
  it.each([null,'','X'])('não presume CIF/FOB: %s',async(freightType)=>{const r=rig();await expect(reviewSubmission(r.deps,{orderId,freightType})).rejects.toMatchObject({code:'INVALID_REQUEST'});expect(r.rpc).not.toHaveBeenCalled();});
  it('administrador sem vínculo não aprova como outro vendedor',async()=>{const r=rig();r.deps.actor={...r.deps.actor,role:'administrador',binding:null};await expect(approved(r)).rejects.toMatchObject({code:'ERP_IDENTITY_REQUIRED'});expect(r.rpc).not.toHaveBeenCalled();});
  it('perfil inativo não consulta nem envia',async()=>{const r=rig();r.deps.actor.active=false;await expect(approved(r)).rejects.toMatchObject({code:'MEMBERSHIP_PENDING'});});
  it('equipe não substitui o vendedor titular',async()=>{const r=rig();r.deps.actor.binding!.sellerCode=34;r.deps.actor.binding!.sellerId='sankhya:seller:34';await expect(approved(r)).rejects.toMatchObject({code:'ERP_SCOPE_FORBIDDEN'});});
  it('owner recebido diferente é recusado',async()=>{const r=rig();r.order['sellerId']=requestId;await expect(approved(r)).rejects.toMatchObject({code:'ERP_INVALID_RESPONSE'});});
  it('empresa4 permanece4',async()=>{const r=rig(4);const result=await submitOrder(r.deps,await approved(r));expect(result.verified).toBe(true);expect(r.includeOrder.mock.calls).toHaveLength(1);});
  it('a natureza e a condição precisam estar vigentes no cadastro',async()=>{const r=rig();r.select.mockImplementationOnce(async()=>[{CODPARC:141,CLIENTE:'S',ATIVO:'S',AD_STATUS_PEDIDO:'1',SUGTIPNEGSAID:93,CONDICAO_VALIDADA:93,CODNAT:10100000,ATIVA:'S',ANALITICA:'S'}]);await expect(approved(r)).rejects.toMatchObject({code:'ERP_ORDER_CONTEXT_CHANGED'});expect(r.write).not.toHaveBeenCalled();});
  it('preço alterado não é aprovado silenciosamente',async()=>{const r=rig();mocks.price.mockResolvedValue({companyCode:1,operationCode:1001,operationVersion:'2026-01-01T00:00:00',payment:{version:'2026-01-01T00:00:00'},price:{amount:12,localCode:108,control:' '}});await expect(approved(r)).rejects.toMatchObject({code:'ERP_PRICE_CHANGED'});});
  it('sem aprovação explícita não há leitura nem escrita',async()=>{const r=rig();await expect(submitOrder(r.deps,{orderId,freightType:'C',hash:'a'.repeat(64),fingerprint,requestId,approved:false})).rejects.toMatchObject({code:'INVALID_REQUEST'});expect(r.rpc).not.toHaveBeenCalled();});
  it('hash ou versão do pedido alterado não adquire recibo',async()=>{const r=rig();const q=await approved(r);await expect(submitOrder(r.deps,{...q,hash:'b'.repeat(64)})).rejects.toMatchObject({code:'ERP_APPROVAL_CHANGED'});await expect(submitOrder(r.deps,{...q,fingerprint:'c'.repeat(64)})).rejects.toMatchObject({code:'REVISION_CONFLICT'});expect(r.write).not.toHaveBeenCalled();});
  it('consulta de recibo não executa consulta de preço ou envio',async()=>{const r=rig();expect(await submissionStatus(r.deps,{orderId})).toEqual({orderId,receipt:null});expect(mocks.price).not.toHaveBeenCalled();expect(r.includeOrder).not.toHaveBeenCalled();});
});
describe('inclusão, confirmação e recuperação',()=>{
  it('recibo precede a inclusão e sucesso exige releitura L',async()=>{const r=rig(),q=await approved(r);const result=await submitOrder(r.deps,q);expect(result).toMatchObject({verified:true,receipt:{phase:'confirmado',nunota:101,status:'L'}});expect(r.write.mock.invocationCallOrder[0]).toBeLessThan(r.includeOrder.mock.invocationCallOrder[0]!);expect(r.includeOrder).toHaveBeenCalledTimes(1);expect(r.confirmOrder).toHaveBeenCalledTimes(1);expect(r.getReceipt()&&Object.keys(r.getReceipt()!)).toHaveLength(9);});
  it('duas chamadas concorrentes não incluem nem confirmam duas vezes',async()=>{const r=rig(),q=await approved(r);await Promise.all([submitOrder(r.deps,q),submitOrder(r.deps,q)]);expect(r.includeOrder).toHaveBeenCalledTimes(1);expect(r.confirmOrder).toHaveBeenCalledTimes(1);});
  it('nova chamada após sucesso recupera o mesmo NUNOTA',async()=>{const r=rig(),q=await approved(r);await submitOrder(r.deps,q);const result=await submitOrder(r.deps,q);expect(result.verified).toBe(true);expect(r.includeOrder).toHaveBeenCalledTimes(1);expect(r.confirmOrder).toHaveBeenCalledTimes(1);});
  it('timeout de inclusão sem documento não repete inclusão',async()=>{const r=rig(),q=await approved(r);r.includeOrder.mockRejectedValue(new SankhyaError('ERP_INCLUSION_UNCERTAIN','incerto'));expect((await submitOrder(r.deps,q)).verified).toBe(false);expect((await submitOrder(r.deps,q)).receipt.phase).toBe('inclusao_incerta');expect(r.includeOrder).toHaveBeenCalledTimes(1);expect(r.confirmOrder).not.toHaveBeenCalled();});
  it('timeout depois de incluir concilia antes de confirmar',async()=>{const r=rig(),q=await approved(r);r.includeOrder.mockImplementation(async()=>{r.setExists();throw new SankhyaError('ERP_INCLUSION_UNCERTAIN','incerto');});await submitOrder(r.deps,q);const result=await submitOrder(r.deps,q);expect(result).toMatchObject({verified:true,receipt:{nunota:101}});expect(r.includeOrder).toHaveBeenCalledTimes(1);expect(r.confirmOrder).toHaveBeenCalledTimes(1);});
  it('timeout de confirmação não repete chamada se status não comprovado',async()=>{const r=rig(),q=await approved(r);r.confirmOrder.mockRejectedValue(new SankhyaError('ERP_CONFIRMATION_UNCERTAIN','incerto'));await submitOrder(r.deps,q);const result=await submitOrder(r.deps,q);expect(result.receipt).toMatchObject({nunota:101,phase:'confirmacao_incerta'});expect(result.verified).toBe(false);expect(r.confirmOrder).toHaveBeenCalledTimes(1);expect(r.includeOrder).toHaveBeenCalledTimes(1);});
  it('confirmação perdida mas statusL é recuperada sem repetir',async()=>{const r=rig(),q=await approved(r);r.confirmOrder.mockImplementation(async()=>{r.setStatus('L');throw new SankhyaError('ERP_CONFIRMATION_UNCERTAIN','incerto');});await submitOrder(r.deps,q);expect((await submitOrder(r.deps,q)).verified).toBe(true);expect(r.confirmOrder).toHaveBeenCalledTimes(1);});
  it('recusa explícita de confirmação retoma o mesmo NUNOTA',async()=>{const r=rig(),q=await approved(r);r.confirmOrder.mockRejectedValueOnce(new SankhyaError('ERP_CONFIRMATION_REJECTED','recusado'));const first=await submitOrder(r.deps,q);expect(first.receipt.phase).toBe('confirmacao_falhou');expect((await submitOrder(r.deps,q)).verified).toBe(true);expect(r.includeOrder).toHaveBeenCalledTimes(1);expect(r.confirmOrder).toHaveBeenCalledTimes(2);});
  it('documento já incluído é conferido e não reincluído',async()=>{const r=rig(),q=await approved(r);r.setExists();expect((await submitOrder(r.deps,q)).verified).toBe(true);expect(r.includeOrder).not.toHaveBeenCalled();expect(r.confirmOrder).toHaveBeenCalledTimes(1);});
  it('documento já confirmado é somente lido',async()=>{const r=rig(),q=await approved(r);r.setExists();r.setStatus('L');expect((await submitOrder(r.deps,q)).verified).toBe(true);expect(r.includeOrder).not.toHaveBeenCalled();expect(r.confirmOrder).not.toHaveBeenCalled();});
  it('dois candidatos impedem qualquer aquisição/inclusão',async()=>{const r=rig(),q=await approved(r);r.select.mockImplementation(async sql=>sql.includes('TGFCAB')?[r.cab(),{...r.cab(),NUNOTA:102}]:[{CODPARC:141,CLIENTE:'S',ATIVO:'S',AD_STATUS_PEDIDO:'1',SUGTIPNEGSAID:29,CONDICAO_VALIDADA:29,CODNAT:10100000,ATIVA:'S',ANALITICA:'S'}]);await expect(submitOrder(r.deps,q)).rejects.toMatchObject({code:'ERP_ORDER_AMBIGUOUS'});expect(r.write).not.toHaveBeenCalled();});
  it.each(['CODEMP','CODPARC','CODVEND','CODTIPOPER','CODTIPVENDA','CODNAT','VLRNOTA','CIF_FOB','AD_STATUS_PEDIDO','OBSERVACAO_VAZIA'])('divergência em %s impede confirmação',async field=>{const r=rig(),q=await approved(r),original=r.select.getMockImplementation()!;r.select.mockImplementation(async(s,l)=>s.includes('FROM TGFCAB')?[{...r.cab(),[field]:'DIVERGENTE'}]:original(s,l));await expect(submitOrder(r.deps,q)).rejects.toMatchObject({code:'ERP_ORDER_DIVERGED'});expect(r.write).not.toHaveBeenCalled();});
  it.each(['QTDNEG','VLRUNIT','VLRTOT','CODPROD','CODLOCALORIG','CONTROLE','CODVOL','PERCDESC'])('divergência no item %s impede confirmação',async field=>{const r=rig(),q=await approved(r),original=r.select.getMockImplementation()!;r.setExists();r.select.mockImplementation(async(s,l)=>s.includes('FROM TGFITE')?[{...r.item(),[field]:'DIVERGENTE'}]:original(s,l));await expect(submitOrder(r.deps,q)).rejects.toMatchObject({code:'ERP_ORDER_DIVERGED'});expect(r.confirmOrder).not.toHaveBeenCalled();});
  it('STATUSNOTA diferente deL não vira sucesso',async()=>{const r=rig(),q=await approved(r);r.confirmOrder.mockImplementation(async()=>{});expect((await submitOrder(r.deps,q)).verified).toBe(false);});
});
describe('transformação pura',()=>{
  it('não envia observações, faturamento ou preço recalculado',async()=>{const s=submissionFixture();s['notes']='não transportar';s['internalNotes']='não transportar';const c=makeCanonical(s,{cnpj:'00000000000000',uf:'PR'},'F');c.estado='aprovado';c.aprovacao={...c.aprovacao,status:'aprovado',hash_conteudo:await canonicalHash(c),aprovado_por:actorId,aprovado_em:'2026-10-26T11:56:00Z'};const payload=await inclusionPayload(c);expect(payload.nota.cabecalho['CIF_FOB']).toEqual({$:'F'});expect(payload.nota.itens.INFORMARPRECO).toBe('True');expect(JSON.stringify(payload)).not.toMatch(/OBSERVACAO|não transportar|faturar/);expect(payload.nota.itens.item[0]).not.toHaveProperty('CONTROLE');});
  it('canônico sem aprovação não produz payload',async()=>{await expect(inclusionPayload(makeCanonical(submissionFixture(),{cnpj:'00000000000000',uf:'PR'},'C'))).rejects.toThrow('Aprovação');});
  it.each(['','   '])('número externo ausente recusa: %s',external=>{const s=submissionFixture();s['clientOrder']=external;expect(()=>makeCanonical(s,{cnpj:'00000000000000',uf:'PR'},'C')).toThrow();});
  it('não converte null de empresa para1 em um pedido já salvo',()=>{const s=submissionFixture();(s['erp'] as Row)['companyCode']=null;expect(()=>makeCanonical(s,{cnpj:'00000000000000',uf:'PR'},'C')).toThrow();});
  it('não arredonda precisão incompatível',()=>{const s=submissionFixture();(s['items'] as Row[])[0]!['qty']='0.000001';expect(()=>makeCanonical(s,{cnpj:'00000000000000',uf:'PR'},'C')).toThrow();});
});
