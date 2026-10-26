import { useEffect, useRef, useState } from 'react';
import { Button, Callout, DataTable, Modal, PropertyList, Select } from '@g4ai/ds';
import { Send } from 'lucide-react';
import { decodeSubmissionReceipt, type SubmissionClient } from '../lib/erp-submission';
import type { FreightType, Row, SubmissionReceipt, SubmissionReview } from '../lib/erp-submission-contract';
import { formatERPAmount } from '../lib/erp-decimal';

const phaseLabel:Record<SubmissionReceipt['phase'],string>={inclusao_incerta:'Inclusão ainda não comprovada',incluido:'Incluído; confirmação pendente',confirmacao_incerta:'Confirmação ainda não comprovada',confirmacao_falhou:'Confirmação recusada pelo ERP',confirmado:'Confirmado no ERP'};
export function submissionLabel(receipt:SubmissionReceipt):string{return `${receipt.nunota===null?'':'NUNOTA '+receipt.nunota+' · '}${phaseLabel[receipt.phase]}${receipt.status?' · STATUSNOTA='+receipt.status:''}`;}
export default function OrderSubmission({order,client,refresh}:{order:Row;client:SubmissionClient;refresh:()=>Promise<unknown>}){
  const [open,setOpen]=useState(false),[freight,setFreight]=useState<string>(typeof order['freightType']==='string'?order['freightType']:''),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const [review,setReview]=useState<{value:SubmissionReview;key:string}>(),[result,setResult]=useState<SubmissionReceipt>();
  const requestId=useRef(crypto.randomUUID()),locked=useRef(false),alive=useRef(true);
  const key=JSON.stringify([order,freight]),current=useRef(key);current.current=key;
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
  let stored:SubmissionReceipt|null=null,receiptInvalid=false;
  try{stored=decodeSubmissionReceipt(order['erpSubmission']);}catch{receiptInvalid=true;}
  const receipt=result??stored,ready=review?.key===key?review.value:undefined,p=ready?.canonical.pedidos_fiscais[0];
  async function confer(){
    if(locked.current||!['C','F'].includes(freight))return;
    const start=key;locked.current=true;setBusy(true);setError('');setReview(undefined);
    try{const value=await client.review(String(order['id']),freight as FreightType);if(alive.current&&current.current===start)setReview({value,key:start});}
    catch(e){if(alive.current&&current.current===start)setError(e instanceof Error?e.message:'Não foi possível conferir o pedido.');}
    finally{locked.current=false;if(alive.current)setBusy(false);}
  }
  async function approve(){
    if(locked.current||!ready)return;
    const start=key;locked.current=true;setBusy(true);setError('');
    try{
      const response=await client.submit(ready,{approved:true,requestId:requestId.current});
      if(alive.current&&current.current===start){setResult(response.receipt);setReview(undefined);}
      await refresh();
    }catch(e){if(alive.current)setError(e instanceof Error?e.message:'Resultado não comprovado. Consulte o mesmo pedido antes de repetir.');}
    finally{locked.current=false;if(alive.current)setBusy(false);}
  }
  return <>
    <Button onClick={()=>setOpen(true)} disabled={receiptInvalid} disabledReason="Recibo incompatível; não repetir o envio."><Send/>Enviar ao Sankhya</Button>
    {receipt&&<span className="text-caption text-muted" role="status">{submissionLabel(receipt)}</span>}
    <Modal open={open} onClose={()=>{if(!locked.current){setOpen(false);setReview(undefined);setError('');}}} title="Conferir envio ao Sankhya" description="Incluir e confirmar este pedido, sem faturar." size="lg" footer={<>
      <Button variant="ghost" onClick={()=>setOpen(false)} disabled={busy}>Fechar</Button>
      {ready?<Button onClick={()=>void approve()} disabled={busy||receipt?.phase==='confirmado'} disabledReason={busy?'Aguarde a resposta do mesmo envio.':'Pedido já confirmado.'}>{ready.receipt?'Consultar e retomar o mesmo pedido':'Aprovar e enviar'}</Button>:<Button onClick={()=>void confer()} disabled={busy||!['C','F'].includes(freight)} disabledReason={busy?'Aguarde a conferência.':'Escolha CIF ou FOB.'}>Conferir pedido</Button>}
    </>}>
      <div className="space-y-5">
        <Select label="Tipo de frete" value={freight} onValueChange={value=>{setFreight(value);setReview(undefined);}} options={[{value:'C',label:'CIF'},{value:'F',label:'FOB'}]} required disabled={busy||!!receipt}/>
        {error&&<Callout tone="bad">{error}</Callout>}
        {receipt&&<Callout tone={receipt.phase==='confirmado'?'ok':'warn'}>{submissionLabel(receipt)}{receipt.phase!=='confirmado'?' Não crie outro pedido para repetir esta inclusão.':''}</Callout>}
        {ready&&p&&<>
          <PropertyList items={[
            {label:'Cliente',value:`${ready.canonical.cliente.codigo_sankhya} · ${ready.canonical.cliente.nome}`},
            {label:'CNPJ / UF',value:`${ready.canonical.cliente.cnpj} · ${ready.canonical.cliente.uf}`},
            {label:'Empresa ERP',value:`${p.codigo_empresa}${p.codigo_empresa===1?' · Matriz':' · Filial'}`},
            {label:'Vendedor ERP',value:p.codigo_vendedor},{label:'Pedido do cliente',value:p.numero_externo},
            {label:'Emissão / entrega',value:`${p.data_negociacao} / ${p.data_prevista}`},
            {label:'Condição do cadastro',value:p.codigo_condicao},{label:'Tipo de Agenda',value:p.tipo_agenda},
            {label:'TOP / natureza',value:`${p.codigo_top} / ${p.codigo_natureza}`},{label:'Frete',value:p.frete_codigo==='C'?'CIF':'FOB'},
            {label:'Total aprovado',value:formatERPAmount(String(p.total))??p.total},
          ]}/>
          <DataTable rows={p.itens} rowKey={item=>String(item.sequencia)} label="Itens da conferência de envio" columns={[
            {key:'produto',header:'Produto',primary:true,cell:i=>`${i.codigo_produto} · ${i.descricao}`},
            {key:'quantidade',header:'Quantidade',cell:i=>`${i.quantidade} ${i.unidade}`},
            {key:'preco',header:'Preço',cell:i=>i.valor_unitario},{key:'total',header:'Total',cell:i=>formatERPAmount(String(i.valor_total))??i.valor_total},
            {key:'estoque',header:'Local / controle',cell:i=>`${i.codigo_estoque} / ${JSON.stringify(i.controle)}`},
          ]}/>
          <p className="text-caption text-muted">Os preços conferidos serão preservados. A condição e a agenda seguem o cadastro. Observação e Observação Interna não serão enviadas. Esta aprovação vale somente para esta versão.</p>
        </>}
      </div>
    </Modal>
  </>;
}
