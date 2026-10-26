import React from 'react';
import {BarChart,ChartCard,DataTable,Empty,KpiCard,formatCurrency,formatNumber} from '@g4ai/ds';
import {formatERPAmount,formatERPShare} from '../lib/erp-decimal';
import {INDICATOR_SERIES,indicatorPeriod} from '../lib/erp-indicator-series';
import {salesChartCoordinate} from './erp-sales-chart';
import {completionRecords,filterCompletions} from './completion-report';
import {INDICATOR_BINDINGS} from './indicator-bindings';
import type {OnlineIndicators} from './online-indicators';
const absent='Não extraído';
const note=(name:string,text:string)=><ChartCard title={name}><p className="text-caption text-muted leading-relaxed">{text}</p></ChartCard>;
export function SelectedIndicators({names,data,db,month,seller}: {names:string[];data:OnlineIndicators|undefined;db:any;month:string;seller:string}){
 return <>{names.map((name,index)=>{const b=INDICATOR_BINDINGS[name];let node:React.ReactNode;
 if(!b||'reason'in b)node=note(name,b&&'reason'in b?b.reason:'Indicador sem leitor comprovado.');
 else if('local'in b){
  if(seller)node=note(name,'Filtro ERP não identifica o responsável local: cruzamento privado não comprovado.');
  else{const period=indicatorPeriod({month,series:'wallet-seller'}),rows=filterCompletions(completionRecords(db),period),hint='Fonte local: atividades e tarefas Realizada, por data declarada; não comprova visita/check-in ERP.';
   if(b.local==='total')node=<KpiCard label={name} value={formatNumber(rows.length)} hint={hint}/>;
   else{const users=new Map<string,string>((db.users??[]).map((u:any)=>[String(u.id),String(u.name)])),groups=new Map<string,number>();for(const r of rows){const key=b.local==='day'?String(r['date']):typeof r['sellerId']==='string'?r['sellerId']:'Responsável não informado';groups.set(key,(groups.get(key)??0)+1);}const points=[...groups].sort(([a],[b])=>a.localeCompare(b)).map(([key,value])=>({label:b.local==='day'?key.split('-').reverse().join('/'):users.has(key)?users.get(key)+' ['+key+']':key,value}));node=<ChartCard title={name} description={hint}>{points.length?<BarChart label={name} data={points} index="label" series={[{key:'value',label:'Realizadas'}]} format={formatNumber} height={300}/>:<Empty title="Nenhuma atividade Realizada com data válida no período" framed={false}/>}</ChartCard>;}
  }
 }else{const r=data?.series[b.series],spec=INDICATOR_SERIES[b.series],error=data?.errors[b.series];
  if(!r)node=note(name,error??'Consulta nativa ainda não disponível neste recorte.');
  else if(b.view==='money-total')node=<KpiCard label={name} value={formatERPAmount(r.summary.value)??absent} hint="Notas fiscais qualificadas; DTFATUR, cabeçalho uma vez. Não somar com pedidos ou itens."/>;
  else if(b.view==='positivation')node=<KpiCard label={name} value={`${formatNumber(r.summary.buyerCount!)} de ${formatNumber(r.summary.recordCount)}`} hint={`${formatERPShare(String(r.summary.buyerCount),String(r.summary.recordCount))??absent} da carteira atual ativa; compras padrão no mês, sem somar filiais.`}/>;
  else if(b.view==='wallet')node=<ChartCard title={name} description="Carteira atual ATIVO=S; comprador/sem compra no mês. Não é situação financeira de bloqueio."><DataTable label={name} rows={r.items} rowKey={x=>x.id} columns={[{key:'label',header:'Vendedor',cell:x=>`${x.label??absent} [${x.groupCode??absent}]`},{key:'count',header:'Ativos',cell:x=>formatNumber(x.count)},{key:'buyerCount',header:'Compradores',cell:x=>formatNumber(x.buyerCount!)},{key:'nonBuyerCount',header:'Sem compra',cell:x=>formatNumber(x.count-x.buyerCount!)}]}/></ChartCard>;
  else if(b.view==='quantity')node=<ChartCard title={name} description="Quantidade nativa QTDNEG por categoria; unidades heterogêneas ou ausentes não são somadas nem convertidas."><DataTable label={name} rows={r.items} rowKey={x=>x.id} columns={[{key:'label',header:'Categoria',cell:x=>`${x.label??absent} [${x.groupCode??absent}]`},{key:'quantity',header:'Quantidade',cell:x=>x.quantity===null?absent:x.quantity.replace('.',',')},{key:'unit',header:'Unidade',cell:x=>x.unit??absent}]}/></ChartCard>;
  else{const field=b.view==='new-customers'?'newCount':b.view==='active-customers'?'activeCount':'value';
   if(r.summary[field]===null||r.items.some(x=>x[field]===null))node=note(name,field==='newCount'?'Primeira compra histórica incompleta; não substituir por data de cadastro.':field==='activeCount'?'Situação ATIVO incompleta; não substituir por compra ou bloqueio financeiro.':'Valor nativo incompleto; não exibir soma parcial ou zero.');
   else{try{const points=r.items.map(x=>({label:spec.dimension==='day'?String(x.label).split('-').reverse().join('/'):`${x.label??absent} [${x.groupCode??absent}]`,value:field==='value'?salesChartCoordinate(x.value!):Number(x[field])})),description=spec.family==='items'?'Itens de venda padrão: VLRTOT, não preço × quantidade ou total do pedido.':spec.family==='customers'?'Cadastro atual por CODVEND; novo = primeira compra padrão histórica, ativo = ATIVO=S.':spec.family==='sales'?'Pedidos padrão por DTNEG no mês selecionado; não representa faturamento.':'Faturamento qualificado por DTFATUR; cada cabeçalho conta uma vez.';node=<ChartCard title={name} description={description}>{points.length?<BarChart label={name} data={points} index="label" series={[{key:'value',label:field==='value'?'Valor nativo':field==='newCount'?'Novos clientes':'Ativos'}]} format={field==='value'?formatCurrency:formatNumber} height={300}/>:<Empty title="Nenhum registro no período consultado" framed={false}/>}</ChartCard>;}catch{node=note(name,'Valor fora da precisão de apresentação do gráfico; nenhum arredondamento silencioso foi aplicado.');}}
  }
 }
 return <React.Fragment key={name+':'+index}>{node}</React.Fragment>;})}</>;
}
