import { useEffect, useState } from 'react';
import { Button, TextField, Checkbox, Callout, Card, Page, PageHeading, notify } from '@g4ai/ds';
import type { ERPClient } from './erp-hooks';
import type { CustomerGroup } from '../lib/customer-groups';
import { groupLabel,groupMatches } from '../lib/customer-groups';
export default function CustomerGroups({client,role,id,confirm}:{client?:ERPClient;role:string;id?:string;confirm:(title:string,run:()=>Promise<void>,description:string)=>void}) {
  const [groups,setGroups]=useState<CustomerGroup[]>([]),[groupSearch,setGroupSearch]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[editing,setEditing]=useState<CustomerGroup|null>(null),[creating,setCreating]=useState(false),[name,setName]=useState(''),[search,setSearch]=useState(''),[results,setResults]=useState<Record<string,any>[]>([]),[members,setMembers]=useState<Record<string,any>[]>([]);
  const editable=['administrador','gestor'].includes(role.toLowerCase());
  async function reload(){if(!client)return;const r=await client.customerGroups();setGroups(r.groups);}
  useEffect(()=>{let active=true;client?.customerGroups().then(r=>{if(active)setGroups(r.groups);}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[client]);
  useEffect(()=>{let active=true;setResults([]);if(!client||!creating&&!editing)return;const timer=setTimeout(()=>{client.page({resource:'customers',search,pageSize:50,filters:{active:'all'}}).then(r=>{if(active)setResults(r.items);}).catch(e=>{if(active)setError(e.message);});},250);return()=>{active=false;clearTimeout(timer);};},[client,search,creating,editing]);
  const selected=id?groups.find(g=>g.id===id):undefined;
  function edit(group?:CustomerGroup){setEditing(group??null);setCreating(!group);setName(group?.name??'');setMembers(group?.members??[]);setSearch('');setError('');}
  async function save(active=true){if(!client)return;setBusy(true);setError('');try{const result=await client.saveCustomerGroup({id:editing?.id??crypto.randomUUID(),name,memberIds:members.map(m=>String(m['id'])),version:editing?.version??0,active});if(!result.result.saved)throw new Error('Gravação não confirmada.');await reload();setCreating(false);setEditing(null);notify('Agrupamento salvo.');}catch(e){setError((e as Error).message);throw e;}finally{setBusy(false);}}
  if(!client)return <Callout title="Agrupamentos exigem uma sessão ERP autenticada."/>;
  return <Page width="wide"><PageHeading title={selected?groupLabel(selected):'Agrupamentos de clientes'}/><div className="flex gap-3"><a className="ds-link" href="#/clientes">Clientes</a><a className="ds-link" href="#/clientes/agrupamentos">Agrupamentos</a></div>
    <Callout title="Agrupamento manual" >Nas visões consolidadas, o agrupamento substitui os integrantes. Pedidos continuam vinculados ao cliente e CNPJ reais. Alterar a composição recalcula os períodos históricos; cada usuário vê somente sua carteira autorizada.</Callout>
    {error&&<Callout title={error}/>}
    {!id&&!creating&&!editing&&<TextField label="Pesquisar agrupamentos" value={groupSearch} onChange={setGroupSearch}/>}
    {!id&&editable&&!creating&&!editing&&<Button onClick={()=>edit()}>Criar agrupamento</Button>}
    {(creating||editing)?<Card><div className="space-y-4"><TextField label="Nome do agrupamento" value={name} onChange={setName}/><TextField label="Pesquisar clientes" placeholder="Nome, razão social, código ou CNPJ" value={search} onChange={setSearch}/>
      <p>{members.length} clientes selecionados</p>{members.map(m=><div key={String(m['id'])}><Checkbox checked onCheckedChange={()=>setMembers(ms=>ms.filter(x=>x['id']!==m['id']))} label={`${m['name']} · ${m['code']} · ${m['cnpj']??''}`}/></div>)}
      {results.filter(m=>!members.some(x=>x['id']===m['id'])).map(m=>{const elsewhere=groups.find(g=>g.id!==editing?.id&&g.memberIds.includes(String(m['id'])));return <div key={String(m['id'])}><Checkbox checked={false} disabled={!!elsewhere} onCheckedChange={()=>setMembers(ms=>[...ms,m])} label={`${m['name']} · ${m['code']} · ${m['cnpj']??''}${elsewhere?' · Já pertence a '+elsewhere.name:''}`}/></div>;})}
      <div className="flex gap-3"><Button disabled={busy||!name.trim()||members.length<2||members.length>50} onClick={()=>void save().catch(()=>{})}>Salvar agrupamento</Button><Button variant="ghost" disabled={busy} onClick={()=>{setCreating(false);setEditing(null);}}>Cancelar</Button>{editing&&<Button variant="ghost" disabled={busy} onClick={()=>confirm('Desfazer agrupamento',()=>save(false),'Os clientes não serão apagados. O agrupamento deixa de consolidar também os períodos anteriores.')}>Desfazer agrupamento</Button>}</div>
    </div></Card>: (id?selected?[selected]:[]:groups.filter(g=>groupMatches(g,groupSearch))).map(g=><Card key={g.id}><div className="space-y-3"><a className="ds-link" href={`#/clientes/agrupamentos/${g.id}`}>{groupLabel(g)}</a>{g.members.map(m=><div key={String(m['id'])}><span>{String(m['name'])} · {String(m['code'])} · {String(m['cnpj']??'')} · Integrante do agrupamento {g.name}</span><a className="ds-link ml-3" href={`#/clientes/${m['id']}`}>Consultar cliente real</a></div>)}{g.editable&&editable&&<Button variant="ghost" onClick={()=>edit(g)}>Editar agrupamento</Button>}</div></Card>)}
  </Page>;
}
