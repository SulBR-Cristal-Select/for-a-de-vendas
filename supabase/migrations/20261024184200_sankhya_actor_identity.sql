-- SulBR: vendedor da sessão Auth, sem inferência por cliente, nome ou e-mail.
-- Migração aditiva8. Preserva preço nativo, interface, perfis, Auth e sete migrações anteriores.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
create table sul_private.erp_actor_bindings (
 actor_id uuid primary key references public.profiles(id),
 company_id text not null references public.companies(id) check(company_id='432299'),
 seller_code integer not null check(seller_code between 1 and 2147483647),
 company_codes smallint[] not null check(company_codes in ('{1}'::smallint[],'{4}'::smallint[],'{1,4}'::smallint[],'{4,1}'::smallint[]))
);
alter table sul_private.erp_actor_bindings enable row level security;
revoke all on table sul_private.erp_actor_bindings from public,anon,authenticated,service_role;
create function sul_private.erp_actor_binding(actor uuid) returns jsonb
language sql stable security definer set search_path=pg_catalog,public as $$
 select jsonb_build_object('userId',p.id,'sellerId','sankhya:seller:'||b.seller_code,'sellerCode',b.seller_code,'companyCodes',to_jsonb(b.company_codes))
 from sul_private.erp_actor_bindings b join public.profiles p on p.id=b.actor_id and p.company_id=b.company_id
 join auth.users u on u.id=p.id
 where p.id=actor and p.company_id='432299' and p.active and p.role in ('administrador','gestor','vendedor')
$$;
create function public.erp_actor_binding() returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare p public.profiles;
begin p:=sul_private.member(); return sul_private.erp_actor_binding(p.id); end $$;
revoke all on function public.erp_actor_binding() from public,anon,authenticated;
grant execute on function public.erp_actor_binding() to authenticated;
create function sul_private.erp_actor_allowed(actor uuid,e jsonb) returns boolean
language sql stable security definer set search_path=pg_catalog,public as $$
 select coalesce(e->>'mode'='online' and e->>'source'='sankhya' and e->'sellerCode'=b->'sellerCode'
 and b->'companyCodes' @> jsonb_build_array(e->'companyCode'),false)
 from (select sul_private.erp_actor_binding(actor) b) x
$$;
create function sul_private.online_visible(owner uuid,e jsonb) returns boolean
language sql stable security definer set search_path=pg_catalog,public as $$
 select exists(select 1 from public.profiles p join auth.users u on u.id=p.id
 where p.id=auth.uid() and p.company_id='432299' and p.active and p.role in ('administrador','gestor','vendedor')
 and (e->>'mode' is distinct from 'online' or p.role='administrador' or (owner=p.id and sul_private.erp_actor_allowed(p.id,e))))
$$;
revoke all on function sul_private.erp_actor_binding(uuid),sul_private.erp_actor_allowed(uuid,jsonb),sul_private.online_visible(uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function sul_private.online_visible(uuid,jsonb) to authenticated;
drop policy orders_read on public.orders;
create policy orders_read on public.orders for select to authenticated using(
 company_id='432299' and sul_private.is_member() and (seller_id=auth.uid() or sul_private.is_manager())
 and sul_private.online_visible(seller_id,data->'erp'));
-- Somente os dois pareamentos já confirmados. Não cria/ativa usuários nem muda papéis.
do $$
begin
 if (select count(*) from public.profiles p join auth.users u on u.id=p.id where p.company_id='432299' and p.role='vendedor' and not p.active
 and p.id in ('7c85e6c0-768c-488b-8d7e-8fa5c65016b3','82c846b0-17a1-4d1e-855d-3a1fdcb7226c'))<>2 then
 raise exception 'Pareamentos de preparação não correspondem aos perfis inativos confirmados.'; end if;
end $$;
insert into sul_private.erp_actor_bindings(actor_id,company_id,seller_code,company_codes) values
 ('7c85e6c0-768c-488b-8d7e-8fa5c65016b3','432299',34,'{1,4}'),
 ('82c846b0-17a1-4d1e-855d-3a1fdcb7226c','432299',12,'{1}');
-- Acesso a equipe/gerência continua sem liberação implícita. Esta correção identifica o próprio vendedor.
create or replace function sul_private.online_required(s jsonb,b jsonb,p public.profiles) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare o jsonb; old jsonb; required jsonb:='[]'::jsonb; saved public.orders; binding jsonb;
begin
 if jsonb_typeof(s->'orders') is distinct from 'array' then raise exception 'Coleção orders inválida.'; end if;
 if exists(select 1 from jsonb_array_elements(s->'orders') x group by x->>'id' having count(*)>1) then raise exception 'Identificadores duplicados em orders.'; end if;
 for o in select value from jsonb_array_elements(s->'orders') loop
  select value into old from jsonb_array_elements(b->'orders') where value->>'id'=o->>'id';
  select * into saved from public.orders where company_id=p.company_id and id=o->>'id';
  if saved.data#>>'{erp,mode}'='online' and not sul_private.online_order(o) then raise exception 'Pedido online não pode ser convertido em manual.'; end if;
  if not sul_private.online_order(o) then continue; end if;
  if old=o then continue; end if;
  binding:=sul_private.erp_actor_binding(p.id);
  if binding is null then raise exception 'ERP_IDENTITY_REQUIRED: vínculo ERP do usuário autenticado necessário.' using errcode='42501'; end if;
  if saved.id is not null and saved.seller_id<>p.id then raise exception 'Pedido online fora da propriedade Auth do usuário logado.' using errcode='42501'; end if;
  if o#>'{erp,sellerCode}' is not null and o#>'{erp,sellerCode}' is distinct from binding->'sellerCode' then raise exception 'Vendedor ERP não corresponde ao usuário logado.' using errcode='42501'; end if;
  if o#>'{erp,companyCode}' is not null and not (binding->'companyCodes' @> jsonb_build_array(o#>'{erp,companyCode}')) then raise exception 'Filial ERP fora do vínculo do usuário logado.' using errcode='42501'; end if;
  if nullif(btrim(o->>'id'),'') is null then raise exception 'Pedido online sem ID local.'; end if;
  if (o ? 'sellerId') and o->>'sellerId' is distinct from coalesce(saved.seller_id,p.id)::text then raise exception 'Proprietário Auth do pedido online não pode ser atribuído pelo navegador.' using errcode='42501'; end if;
  if old is null or sul_private.online_commercial(o) is distinct from sul_private.online_commercial(old) then
   required:=required||jsonb_build_array(o->>'id');
  end if;
 end loop;
 return required;
end $$;

create or replace function public.attest_erp_order_request(p_actor_id uuid,p_state jsonb,p_expected_revision bigint,p_request_id uuid,p_verified_orders jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare p public.profiles; rev bigint; l public.workspace_ledger; proof public.workspace_records; v jsonb; requested jsonb; h text;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Atestação exige service_role.' using errcode='42501'; end if;
 select pr.* into p from public.profiles pr join auth.users u on u.id=pr.id
 where pr.id=p_actor_id and pr.company_id='432299' and pr.active and pr.role in ('administrador','gestor','vendedor');
 if not found then raise exception 'Autor Auth ativo não encontrado.' using errcode='42501'; end if;
 if p_request_id is null or p_expected_revision is null or jsonb_typeof(p_state) is distinct from 'object' or octet_length(p_state::text)>10000000 then raise exception 'Atestação inválida.'; end if;
 select revision into rev from public.companies where id=p.company_id for update;
 -- Ledger vem antes de validade/consumo e de validação do retorno ERP, para retry não consultar novamente o ERP.
 select * into l from public.workspace_ledger where company_id=p.company_id and request_id=p_request_id;
 if found then
  if l.actor_id<>p.id or l.request_state<>p_state then raise exception 'Identificador de gravação já utilizado em outra alteração.'; end if;
  return jsonb_build_object('ready',true,'replay',true);
 end if;
 if rev<>p_expected_revision then raise exception 'REVISION_CONFLICT: Recarregue os dados antes de salvar.' using errcode='PT409'; end if;
 if p_state#>>'{company,userId}' is distinct from p.id::text or p_state#>>'{company,id}' is distinct from p.company_id then raise exception 'Autor/empresa divergentes.' using errcode='42501'; end if;
 h:=encode(sha256(convert_to(p_state::text,'UTF8')),'hex');
 select * into proof from public.workspace_records where company_id=p.company_id and kind='erp/order-proof' and id=p_request_id::text;
 if found then
  if proof.owner_id<>p.id or proof.data->>'hash' is distinct from h or proof.data->'expectedRevision' is distinct from to_jsonb(p_expected_revision) then raise exception 'UUID já vinculado a outra prova; sobrescrita proibida.'; end if;
  if not sul_private.online_proof_ready(proof.data,p_state,p_expected_revision) then raise exception 'ERP_PROOF_EXPIRED: Prova expirada ou consumida; inicie nova solicitação.'; end if;
  return jsonb_build_object('ready',true);
 end if;
 if jsonb_typeof(p_verified_orders) is distinct from 'array' or jsonb_typeof(p_state->'orders') is distinct from 'array' then raise exception 'Pedidos verificados inválidos.'; end if;
 if jsonb_array_length(p_verified_orders)=0 or exists(select 1 from jsonb_array_elements(p_verified_orders) x group by x->>'id' having count(*)>1) then raise exception 'Pedidos verificados vazios ou duplicados.'; end if;
 for v in select value from jsonb_array_elements(p_verified_orders) loop
  if (select count(*) from jsonb_array_elements(p_state->'orders') x where x->>'id'=v->>'id')<>1 then raise exception 'Pedido verificado não corresponde ao estado.'; end if;
  select value into requested from jsonb_array_elements(p_state->'orders') x where x->>'id'=v->>'id';
  if requested is distinct from v->'requested' or not sul_private.online_verified_valid(v) then raise exception 'Prova online inválida: referências, quantidade DECQTD5 ou preço em centavos sem arredondamento.'; end if;
  if not sul_private.erp_actor_allowed(p.id,v->'erp') then raise exception 'Vendedor/filial da prova diverge do usuário Auth logado.' using errcode='42501'; end if;
  if exists(select 1 from public.orders where company_id=p.company_id and id=v->>'id' and seller_id<>p.id) then raise exception 'Pedido online fora da propriedade Auth do usuário logado.' using errcode='42501'; end if;
  if (requested ? 'sellerId') and requested->>'sellerId' is distinct from coalesce((select seller_id from public.orders where company_id=p.company_id and id=v->>'id'),p.id)::text then raise exception 'Proprietário Auth divergente.' using errcode='42501'; end if;
 end loop;
 insert into public.workspace_records(company_id,kind,id,owner_id,customer_id,data)
 values(p.company_id,'erp/order-proof',p_request_id::text,p.id,null,jsonb_build_object('hash',h,'expectedRevision',p_expected_revision,
 'createdAt',clock_timestamp(),'expiresAt',clock_timestamp()+interval '5 minutes','consumed',false,'verifiedOrders',p_verified_orders));
 return jsonb_build_object('ready',true);
end $$;

create or replace function sul_private.save_online_order(p public.profiles,o jsonb,old jsonb,v jsonb) returns void
language plpgsql security definer set search_path=pg_catalog,public as $$
declare i jsonb; total_value numeric:=0; owner uuid; e jsonb:=v->'erp';
begin
 if p.role not in ('administrador','gestor','vendedor') or not p.active or p.company_id<>'432299' or not sul_private.erp_actor_allowed(p.id,e)
 then raise exception 'Pedido online exige vínculo ERP do usuário Auth ativo.' using errcode='42501'; end if;
 if not sul_private.online_verified_valid(v) or v->'requested' is distinct from o then raise exception 'Snapshot online verificado inválido.'; end if;
 select seller_id into owner from public.orders where company_id=p.company_id and id=o->>'id';
 owner:=coalesce(owner,p.id);
 if owner<>p.id then raise exception 'Pedido online fora da propriedade Auth do usuário logado.' using errcode='42501'; end if;
 if (o ? 'sellerId') and o->>'sellerId' is distinct from owner::text then raise exception 'Proprietário Auth divergente.' using errcode='42501'; end if;
 if nullif(o->>'delivery','') is null or nullif(btrim(o->>'agenda'),'') is null then raise exception 'data_entrega e Tipo de Agenda são obrigatórios.'; end if;
 if not exists(select 1 from public.workspace_records where company_id=p.company_id and kind='collections/pedidos/tipos' and data->>'name'=o->>'type') then raise exception 'Tipo de pedido não cadastrado.'; end if;
 if coalesce((o->>'freight')::numeric,0)<>0 then raise exception 'Frete não está habilitado neste contrato.'; end if;
 insert into public.orders(company_id,id,customer_id,seller_id,type,status,date,delivery,agenda,data)
 values(p.company_id,o->>'id',e#>>'{customer,id}',owner,o->>'type',coalesce(o->>'status','Concluído'),(e->>'date')::date,
 (o->>'delivery')::date,o->>'agenda',jsonb_build_object('payment',e#>>'{payment,label}',
 'notes',coalesce(o->>'notes',''),'internalNotes',coalesce(o->>'internalNotes',''),'clientOrder',coalesce(o->>'clientOrder',''),
 'cargoStatus',coalesce(old->>'cargoStatus','Pendente'),'erp',e))
 on conflict(company_id,id) do update set customer_id=excluded.customer_id,seller_id=excluded.seller_id,
 type=excluded.type,status=excluded.status,date=excluded.date,delivery=excluded.delivery,agenda=excluded.agenda,data=excluded.data;
 delete from public.order_items where company_id=p.company_id and order_id=o->>'id';
 for i in select value from jsonb_array_elements(v->'items') loop
  -- Numeric sem cast de escala antes da validação: nenhuma precisão é perdida silenciosamente.
  insert into public.order_items(company_id,order_id,product_id,qty,price,unit,erp)
  values(p.company_id,o->>'id',i->>'productId',(i->>'qty')::numeric,(i->>'price')::numeric,i->>'unit',i->'erp');
  total_value:=total_value+round((i->>'qty')::numeric*(i->>'price')::numeric,2);
 end loop;
 update public.orders set total=total_value where company_id=p.company_id and id=o->>'id';
end $$;

create or replace function public.get_workspace() returns jsonb language plpgsql volatile security definer
set search_path = pg_catalog, public as $$
declare p public.profiles; s jsonb; k text; mgr boolean; j jsonb;
begin
 p:=sul_private.member(); mgr:=p.role in ('administrador','gestor');
 select coalesce(jsonb_object_agg(key,value),'{}') into s from public.workspace_settings where company_id=p.company_id;
 s:=s || jsonb_build_object('company',jsonb_build_object('id',p.company_id,'name',(select name from public.companies where id=p.company_id),
   'cnpj',(select tax_id from public.companies where id=p.company_id),'user',p.name,'userId',p.id,'role',case p.role when 'administrador' then 'Administrador' when 'gestor' then 'Gestor' else 'Vendedor' end,
   'erpSeller',sul_private.erp_actor_binding(p.id),'email',auth.jwt()->>'email','integration','Não configurada','credits',0,'plan','Não configurado'),
 'customers','[]'::jsonb,'products','[]'::jsonb,'orders','[]'::jsonb,'collections','{}'::jsonb,
 'titles','[]'::jsonb,'invoices','[]'::jsonb,'emails','[]'::jsonb,'chats','[]'::jsonb,'logs','[]'::jsonb,
 'users','[]'::jsonb,'targets','{}'::jsonb,'targetPeriods','{}'::jsonb,'targetPeriod',to_char((now() at time zone 'America/Sao_Paulo')::date,'YYYY-MM'));
 select coalesce(jsonb_agg(c.data || jsonb_build_object('id',c.id,'name',c.name,'fantasy',c.fantasy,'cnpj',c.document,
   'blocked',c.blocked,'sellerId',c.seller_id,'seller',u.name,'source','persistido') order by c.id),'[]') into j
 from public.customers c join public.profiles u on u.id=c.seller_id where c.company_id=p.company_id and (mgr or c.seller_id=p.id);
 s:=jsonb_set(s,'{customers}',j);
 select coalesce(jsonb_agg(data || jsonb_build_object('id',id,'name',name,'price',price,'active',active,'commission',commission,'source','persistido') order by id),'[]') into j
 from public.products where company_id=p.company_id; s:=jsonb_set(s,'{products}',j);
 select coalesce(jsonb_agg(o.data || case when o.data#>>'{erp,mode}'='online' then jsonb_build_object('customerName',o.data#>>'{erp,customer,name}') else '{}'::jsonb end || jsonb_build_object('id',o.id,'number',o.number,'customerId',o.customer_id,
 'sellerId',o.seller_id,'seller',case when o.data#>>'{erp,mode}'='online' then o.data#>>'{erp,sellerName}' else u.name end,'type',o.type,'status',o.status,'date',o.date,'delivery',o.delivery,'agenda',o.agenda,
 'total',o.total,'freight',0,'source','persistido','integration','Não configurada','countsAsSale',o.type='Venda',
 'items',(select coalesce(jsonb_agg(jsonb_build_object('productId',i.product_id,'qty',i.qty,'price',i.price,'total',i.total,'unit',i.unit,'erp',i.erp)||case when i.erp->>'mode'='online' then jsonb_build_object('name',i.erp#>>'{product,name}') else '{}'::jsonb end order by i.product_id),'[]')
   from public.order_items i where i.company_id=o.company_id and i.order_id=o.id)) order by o.number desc),'[]') into j
 from public.orders o join public.profiles u on u.id=o.seller_id where o.company_id=p.company_id and (mgr or o.seller_id=p.id) and sul_private.online_visible(o.seller_id,o.data->'erp');
 s:=jsonb_set(s,'{orders}',j);
 foreach k in array array['opportunities','tasks','activities','routes','teams','carriers','policy'] loop
 select coalesce(jsonb_agg(r.data || jsonb_build_object('id',r.id,'source','persistido') ||
   case when r.owner_id is null then '{}'::jsonb else jsonb_build_object('sellerId',r.owner_id,'seller',(select name from public.profiles where id=r.owner_id),'customerId',r.customer_id) end order by r.id),'[]') into j
 from public.workspace_records r where r.company_id=p.company_id and r.kind=k
 and (mgr or r.owner_id=p.id or (r.owner_id is null and k<>'policy'));
 s:=jsonb_set(s,array[k],j);
 end loop;
 for k in select distinct substr(kind,13) from public.workspace_records where company_id=p.company_id and kind like 'collections/%' loop
 select coalesce(jsonb_agg(data || jsonb_build_object('id',id,'source','persistido') order by id),'[]') into j
 from public.workspace_records where company_id=p.company_id and kind='collections/'||k;
 s:=jsonb_set(s,array['collections',k],j);
 end loop;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'role',case role when 'administrador' then 'Administrador' when 'gestor' then 'Gestor' else 'Vendedor' end,'active',active,'source','persistido') order by name),'[]') into j
 from public.profiles where company_id=p.company_id and (mgr or id=p.id); s:=jsonb_set(s,'{users}',j);
 select coalesce(jsonb_object_agg(u.name,t.amount),'{}') into j from public.sales_targets t join public.profiles u on u.id=t.seller_id
 where t.company_id=p.company_id and (mgr or t.seller_id=p.id) and t.period=date_trunc('month',(now() at time zone 'America/Sao_Paulo')::date)::date;
 s:=jsonb_set(s,'{targets}',j);
 select coalesce(jsonb_object_agg(x.period,x.targets),'{}') into j from (
 select to_char(t.period,'YYYY-MM') period,jsonb_object_agg(u.name,t.amount) targets from public.sales_targets t join public.profiles u on u.id=t.seller_id
 where t.company_id=p.company_id and (mgr or t.seller_id=p.id) group by t.period) x;
 s:=jsonb_set(s,'{targetPeriods}',j);
 if mgr then
 select coalesce(jsonb_agg(jsonb_build_object('id',request_id,'date',created_at,'name','Gravação confirmada · revisão '||revision,'user',(select name from public.profiles where id=actor_id),'source','servidor') order by revision desc),'[]') into j
 from (select * from public.workspace_ledger where company_id=p.company_id order by revision desc limit 100) l;
 s:=jsonb_set(s,'{logs}',j);
 end if;
 s:=s||jsonb_build_object('erpCommercial',sul_private.erp_catalog());
 return jsonb_build_object('state',s,'revision',(select revision from public.companies where id=p.company_id));
end $$;
-- ACLs das funções substituídas permanecem; prova privada continua exclusiva de service_role.
revoke all on function sul_private.online_required(jsonb,jsonb,public.profiles),sul_private.save_online_order(public.profiles,jsonb,jsonb,jsonb) from public,anon,authenticated;
update public.companies set revision=revision+1 where id='432299';
commit;
