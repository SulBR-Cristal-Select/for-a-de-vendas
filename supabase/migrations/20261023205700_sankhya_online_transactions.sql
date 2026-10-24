-- SulBR · pedidos ERP online locais. Não grava no ERP nem replica cadastros.
-- Aplicar somente após as seis migrações anteriores; funções manuais preservadas abaixo.
begin;

create function sul_private.online_order(o jsonb) returns boolean
language sql immutable set search_path=pg_catalog,public as $$
 select coalesce(o#>>'{erp,mode}'='online',false)
 or coalesce(o->>'customerId' like 'sankhya:%',false)
 or exists(select 1 from jsonb_array_elements(case when jsonb_typeof(o->'items')='array' then o->'items' else '[]'::jsonb end) i
 where i->>'productId' like 'sankhya:%' or i#>>'{erp,mode}'='online')
$$;
create function sul_private.online_commercial(o jsonb) returns jsonb
language sql immutable set search_path=pg_catalog,public as $$
 select jsonb_build_object('customerId',o->'customerId','date',o->'date','payment',o->'payment',
 'items',o->'items','erp',o->'erp','type',o->'type','status',o->'status','delivery',o->'delivery',
 'agenda',o->'agenda','sellerId',o->'sellerId')
$$;
create function sul_private.online_admin() returns boolean
language sql stable security definer set search_path=pg_catalog,public as $$
 select exists(select 1 from public.profiles p join auth.users u on u.id=p.id
 where p.id=auth.uid() and p.company_id='432299' and p.active and p.role='administrador')
$$;
create function sul_private.online_erp_valid(e jsonb,kind text) returns boolean
language plpgsql immutable set search_path=pg_catalog,public as $$
begin
 if jsonb_typeof(e) is distinct from 'object' or e->>'source' is distinct from 'sankhya'
 or e->>'mode' is distinct from 'online' or e->>'provider' is distinct from 'native-context-api'
 or e->'companyCode' not in ('1'::jsonb,'4'::jsonb)
 or not (e ? 'companyCode') or e->'tableCode' is distinct from 'null'::jsonb
 or e->'tableVersion' is distinct from 'null'::jsonb
 or jsonb_typeof(e->'readAt') is distinct from 'string'
 or (e->>'readAt')!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}[Tt][0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]+)?([Zz]|[+-][0-9]{2}:[0-9]{2})$' then return false; end if;
 perform (e->>'readAt')::timestamptz;
 if kind='order' then
  if e->'operationCode' is distinct from '1001'::jsonb
   or jsonb_typeof(e->'operationVersion') is distinct from 'string' or nullif(btrim(e->>'operationVersion'),'') is null
   or jsonb_typeof(e->'sellerCode') is distinct from 'number' or (e->>'sellerCode')!~'^[1-9][0-9]{0,9}$'
   or jsonb_typeof(e->'sellerName') is distinct from 'string' or nullif(btrim(e->>'sellerName'),'') is null
   or jsonb_typeof(e#>'{customer,partnerCode}') is distinct from 'number' or (e#>>'{customer,partnerCode}')!~'^[1-9][0-9]{0,9}$'
   or e#>>'{customer,id}' is distinct from 'sankhya:customer:'||(e#>>'{customer,partnerCode}')
   or jsonb_typeof(e#>'{customer,name}') is distinct from 'string' or nullif(btrim(e#>>'{customer,name}'),'') is null
   or not (e->'customer' ? 'fantasy') or jsonb_typeof(e#>'{customer,fantasy}') not in ('string','null')
   or jsonb_typeof(e->'creditBlocked') is distinct from 'boolean'
   or jsonb_typeof(e#>'{payment,code}') is distinct from 'number' or (e#>>'{payment,code}')!~'^[1-9][0-9]{0,4}$'
   or jsonb_typeof(e#>'{payment,label}') is distinct from 'string' or nullif(btrim(e#>>'{payment,label}'),'') is null
   or jsonb_typeof(e#>'{payment,version}') is distinct from 'string' or nullif(btrim(e#>>'{payment,version}'),'') is null
   or not (e->'payment' ? 'isCredit') or jsonb_typeof(e#>'{payment,isCredit}') not in ('boolean','null')
   or not sul_private.erp_installments_valid(e#>'{payment,installments}')
   or jsonb_typeof(e#>'{payment,rules}') is distinct from 'object'
   or jsonb_typeof(e->'date') is distinct from 'string' or (e->>'date')!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
   then return false; end if;
  perform (e->>'date')::date;
  if (e->>'creditBlocked')::boolean and e#>'{payment,isCredit}' is distinct from 'false'::jsonb then return false; end if;
 elsif kind='item' then
  if jsonb_typeof(e#>'{product,productCode}') is distinct from 'number' or (e#>>'{product,productCode}')!~'^[1-9][0-9]{0,9}$'
   or e#>>'{product,id}' is distinct from 'sankhya:product:'||(e#>>'{product,productCode}')
   or jsonb_typeof(e#>'{product,name}') is distinct from 'string' or nullif(btrim(e#>>'{product,name}'),'') is null
   or jsonb_typeof(e->'quantityDecimals') is distinct from 'number' or (e->>'quantityDecimals')!~'^[0-5]$'
   or not (e ? 'multiple') or jsonb_typeof(e->'multiple') not in ('number','null')
   or jsonb_typeof(e->'localCode') is distinct from 'number' or (e->>'localCode')!~'^[0-9]{1,10}$'
   or jsonb_typeof(e->'control') is distinct from 'string' or length(e->>'control')>17 then return false; end if;
  if e->>'multiple' is not null and (e->>'multiple')::numeric<=0 then return false; end if;
 else return false;
 end if;
 return true;
exception when others then return false;
end $$;

-- Quantidades DECQTD5: 13 dígitos inteiros preservados; só a validação aceita precisão, nunca arredonda.
-- O total gerado depende de qty; recriar somente a expressão, não os itens.
alter table public.order_items drop column total;
alter table public.order_items alter column qty type numeric(18,5);
alter table public.order_items add column total numeric(18,2) generated always as (round(qty*price,2)) stored;
alter table public.orders add column local_customer_id text generated always as
 (case when data#>>'{erp,mode}'='online' then null else customer_id end) stored;
alter table public.order_items add column local_product_id text generated always as
 (case when erp->>'mode'='online' then null else product_id end) stored;
alter table public.orders drop constraint orders_company_id_customer_id_fkey,
 add constraint orders_local_customer_fkey foreign key(company_id,local_customer_id) references public.customers(company_id,id),
 add constraint orders_online_snapshot check(data#>>'{erp,mode}' is distinct from 'online' or
 (sul_private.online_erp_valid(data->'erp','order') and customer_id=data#>>'{erp,customer,id}'));
alter table public.order_items drop constraint order_items_company_id_product_id_fkey,
 add constraint items_local_product_fkey foreign key(company_id,local_product_id) references public.products(company_id,id),
 add constraint items_online_snapshot check(erp->>'mode' is distinct from 'online' or
 (sul_private.online_erp_valid(erp,'item') and product_id=erp#>>'{product,id}' and unit is not null and length(btrim(unit))>0
 and qty=round(qty,(erp->>'quantityDecimals')::integer)));
-- O kind privado tem dono Auth, nunca customer_id nem alternativas de leitura de gestor.
alter table public.workspace_records drop constraint workspace_records_check,
 add constraint workspace_records_owner_kind check(
 (kind in ('opportunities','tasks','activities','routes') and owner_id is not null)
 or ((kind in ('teams','carriers','policy') or kind like 'collections/%') and owner_id is null)
 or (kind='erp/order-proof' and owner_id is not null and customer_id is null));
drop policy records_read on public.workspace_records;
create policy records_read on public.workspace_records for select to authenticated using(
 kind<>'erp/order-proof' and company_id='432299' and sul_private.is_member()
 and (owner_id=auth.uid() or sul_private.is_manager() or (owner_id is null and kind<>'policy')));
drop policy orders_read on public.orders;
create policy orders_read on public.orders for select to authenticated using(
 company_id='432299' and sul_private.is_member() and (seller_id=auth.uid() or sul_private.is_manager())
 and (data#>>'{erp,mode}' is distinct from 'online' or sul_private.online_admin()));
-- items_read já depende da visibilidade RLS do pedido; mantém o FK item→pedido.

create function sul_private.online_required(s jsonb,b jsonb,p public.profiles) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare o jsonb; old jsonb; required jsonb:='[]'::jsonb; saved public.orders;
begin
 if jsonb_typeof(s->'orders') is distinct from 'array' then raise exception 'Coleção orders inválida.'; end if;
 if exists(select 1 from jsonb_array_elements(s->'orders') x group by x->>'id' having count(*)>1) then raise exception 'Identificadores duplicados em orders.'; end if;
 for o in select value from jsonb_array_elements(s->'orders') loop
  select value into old from jsonb_array_elements(b->'orders') where value->>'id'=o->>'id';
  select * into saved from public.orders where company_id=p.company_id and id=o->>'id';
  if saved.data#>>'{erp,mode}'='online' and not sul_private.online_order(o) then raise exception 'Pedido online não pode ser convertido em manual.'; end if;
  if not sul_private.online_order(o) then continue; end if;
  if p.role<>'administrador' or not exists(select 1 from auth.users where id=p.id) then raise exception 'Somente administrador Auth ativo pode acessar pedidos online.' using errcode='42501'; end if;
  if nullif(btrim(o->>'id'),'') is null then raise exception 'Pedido online sem ID local.'; end if;
  if (o ? 'sellerId') and o->>'sellerId' is distinct from coalesce(saved.seller_id,p.id)::text then raise exception 'Proprietário Auth do pedido online não pode ser atribuído pelo navegador.' using errcode='42501'; end if;
  if old is null or sul_private.online_commercial(o) is distinct from sul_private.online_commercial(old) then
   required:=required||jsonb_build_array(o->>'id');
  end if;
 end loop;
 return required;
end $$;
create function sul_private.online_proof_ready(d jsonb,s jsonb,rev bigint) returns boolean
language sql volatile set search_path=pg_catalog,public as $$
 select coalesce(d->>'hash'=encode(sha256(convert_to(s::text,'UTF8')),'hex')
 and d->'expectedRevision'=to_jsonb(rev) and d->'consumed'='false'::jsonb
 and (d->>'expiresAt')::timestamptz>clock_timestamp(),false)
$$;

create function public.erp_order_preflight(p_state jsonb,p_expected_revision bigint,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare p public.profiles; rev bigint; l public.workspace_ledger; proof public.workspace_records; required jsonb;
begin
 p:=sul_private.member();
 if p_request_id is null or p_expected_revision is null or jsonb_typeof(p_state) is distinct from 'object' or octet_length(p_state::text)>10000000 then raise exception 'Preflight inválido.'; end if;
 select revision into rev from public.companies where id=p.company_id for update;
 select * into l from public.workspace_ledger where company_id=p.company_id and request_id=p_request_id;
 if found then
  if l.actor_id<>p.id or l.request_state<>p_state then raise exception 'Identificador de gravação já utilizado em outra alteração.'; end if;
  return jsonb_build_object('replay',true,'proofReady',true,'requiredOrders','[]'::jsonb);
 end if;
 if rev<>p_expected_revision then raise exception 'REVISION_CONFLICT: Recarregue os dados antes de salvar.' using errcode='PT409'; end if;
 if p_state#>>'{company,id}' is distinct from p.company_id or p_state#>>'{company,userId}' is distinct from p.id::text then raise exception 'Identidade inválida no preflight.' using errcode='42501'; end if;
 required:=sul_private.online_required(p_state,public.get_workspace()->'state',p);
 select * into proof from public.workspace_records where company_id=p.company_id and kind='erp/order-proof' and id=p_request_id::text;
 if found and jsonb_array_length(required)>0 and proof.owner_id=p.id and proof.data->>'hash'=encode(sha256(convert_to(p_state::text,'UTF8')),'hex') and proof.data->'expectedRevision'=to_jsonb(p_expected_revision) and not sul_private.online_proof_ready(proof.data,p_state,p_expected_revision) then
  raise exception 'ERP_PROOF_EXPIRED: Prova expirada ou consumida; inicie nova solicitação.';
 end if;
 if found and (proof.owner_id<>p.id or proof.data->>'hash'<>encode(sha256(convert_to(p_state::text,'UTF8')),'hex') or proof.data->'expectedRevision'<>to_jsonb(p_expected_revision)) then raise exception 'UUID já vinculado a outra prova.'; end if;
 return jsonb_build_object('replay',false,'proofReady',jsonb_array_length(required)=0 or coalesce((proof.owner_id=p.id and sul_private.online_proof_ready(proof.data,p_state,p_expected_revision) and not exists(select 1 from jsonb_array_elements_text(required) rid where not exists(select 1 from jsonb_array_elements(proof.data->'verifiedOrders') v where v->>'id'=rid))),false), 'requiredOrders',required);
end $$;

-- Valida o envelope oriundo exclusivamente do backend. Requested é integral; metadados do browser não têm autoridade.
create function sul_private.online_verified_valid(v jsonb) returns boolean
language plpgsql immutable set search_path=pg_catalog,public as $$
declare o jsonb:=v->'requested'; e jsonb:=v->'erp'; i jsonb; asked jsonb; n numeric; price numeric;
begin
 if v->>'id' is distinct from o->>'id' or not sul_private.online_order(o)
 or not sul_private.online_erp_valid(e,'order') or o->>'customerId' is distinct from e#>>'{customer,id}'
 or o->>'payment' is distinct from e#>>'{payment,label}' or o->>'date' is distinct from e->>'date'
 or jsonb_typeof(v->'items') is distinct from 'array' or jsonb_typeof(o->'items') is distinct from 'array' then return false; end if;
 if jsonb_array_length(v->'items')=0 or jsonb_array_length(v->'items')<>jsonb_array_length(o->'items')
 or exists(select 1 from jsonb_array_elements(v->'items') x group by x->>'productId' having count(*)>1)
 or exists(select 1 from jsonb_array_elements(o->'items') x group by x->>'productId' having count(*)>1) then return false; end if;
 for i in select value from jsonb_array_elements(v->'items') loop
  select value into asked from jsonb_array_elements(o->'items') x where x->>'productId'=i->>'productId';
  if asked is null or not sul_private.online_erp_valid(i->'erp','item')
   or i->>'productId' is distinct from i#>>'{erp,product,id}' or i#>'{erp,companyCode}' is distinct from e->'companyCode'
   or jsonb_typeof(i->'unit') is distinct from 'string' or length(btrim(i->>'unit')) not between 1 and 6
   or jsonb_typeof(i->'qty') is distinct from 'number' or jsonb_typeof(i->'price') is distinct from 'number'
   or asked->'qty' is distinct from i->'qty' or asked->'price' is distinct from i->'price' or asked->'unit' is distinct from i->'unit' then return false; end if;
  n:=(i->>'qty')::numeric;price:=(i->>'price')::numeric;
  if n<=0 or n>=10000000000000 or n<>round(n,(i#>>'{erp,quantityDecimals}')::integer)
   or price<=0 or price>99999999999999.99 or price<>round(price,2) then return false; end if;
  if i#>>'{erp,multiple}' is not null and mod(n,(i#>>'{erp,multiple}')::numeric)<>0 then return false; end if;
 end loop;
 return true;
exception when others then return false;
end $$;
create function public.attest_erp_order_request(p_actor_id uuid,p_state jsonb,p_expected_revision bigint,p_request_id uuid,p_verified_orders jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare p public.profiles; rev bigint; l public.workspace_ledger; proof public.workspace_records; v jsonb; requested jsonb; h text;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Atestação exige service_role.' using errcode='42501'; end if;
 select pr.* into p from public.profiles pr join auth.users u on u.id=pr.id
 where pr.id=p_actor_id and pr.company_id='432299' and pr.active and pr.role='administrador';
 if not found then raise exception 'Autor Auth administrador ativo não encontrado.' using errcode='42501'; end if;
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
  if (requested ? 'sellerId') and requested->>'sellerId' is distinct from coalesce((select seller_id from public.orders where company_id=p.company_id and id=v->>'id'),p.id)::text then raise exception 'Proprietário Auth divergente.' using errcode='42501'; end if;
 end loop;
 insert into public.workspace_records(company_id,kind,id,owner_id,customer_id,data)
 values(p.company_id,'erp/order-proof',p_request_id::text,p.id,null,jsonb_build_object('hash',h,'expectedRevision',p_expected_revision,
 'createdAt',clock_timestamp(),'expiresAt',clock_timestamp()+interval '5 minutes','consumed',false,'verifiedOrders',p_verified_orders));
 return jsonb_build_object('ready',true);
end $$;

revoke all on function sul_private.online_order(jsonb),sul_private.online_commercial(jsonb),sul_private.online_admin(),
 sul_private.online_erp_valid(jsonb,text),sul_private.online_required(jsonb,jsonb,public.profiles),
 sul_private.online_proof_ready(jsonb,jsonb,bigint),sul_private.online_verified_valid(jsonb) from public,anon,authenticated;
grant execute on function sul_private.online_admin() to authenticated;
revoke all on function public.erp_order_preflight(jsonb,bigint,uuid),public.attest_erp_order_request(uuid,jsonb,bigint,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.erp_order_preflight(jsonb,bigint,uuid) to authenticated;
grant execute on function public.attest_erp_order_request(uuid,jsonb,bigint,uuid,jsonb) to service_role;

-- Definições completas a seguir preservam o contrato anterior, sem renomear RPCs.
create or replace function sul_private.erp_quantity_decimals(data jsonb,unit_code text) returns integer language plpgsql immutable set search_path=pg_catalog,public as $$
declare result jsonb;
begin
 if data#>>'{erp,source}' is distinct from 'sankhya' then return 0; end if;
 result:=coalesce(data#>'{erp,units}'->unit_code,case when unit_code=data->>'unit' then data#>'{erp,quantityDecimals}' end);
 if result is null or result::text!~'^[0-5]$' then raise exception 'Unidade ou precisão da quantidade não representável neste contrato.'; end if;
 return result::text::integer;
end $$;
create or replace function sul_private.erp_metadata_valid(kind text, data jsonb) returns boolean
language plpgsql immutable set search_path=pg_catalog,public as $$
declare m jsonb:=data->'erp'; c jsonb; v jsonb; u text; d integer;
begin
 if m is null or m='null'::jsonb then return true; end if;
 if jsonb_typeof(m)<>'object' or m->>'source' is distinct from 'sankhya' then return false; end if;
 if kind='product' then
  if jsonb_typeof(m->'productCode') is distinct from 'number' or (m->>'productCode')!~'^[1-9][0-9]{0,9}$' or nullif(btrim(data->>'unit'),'') is null then return false; end if;
  v:=coalesce(m->'units'->(data->>'unit'),m->'quantityDecimals');
  if jsonb_typeof(v) is distinct from 'number' or v::text!~'^[0-5]$' then return false; end if;
  if m ? 'units' then
   if jsonb_typeof(m->'units')<>'object' then return false; end if;
   for u,v in select * from jsonb_each(m->'units') loop
    if nullif(btrim(u),'') is null or jsonb_typeof(v)<>'number' or v::text!~'^[0-5]$' then return false; end if;
   end loop;
  end if;
 elsif kind='customer' then
  if jsonb_typeof(m->'partnerCode') is distinct from 'number' or (m->>'partnerCode')!~'^[1-9][0-9]{0,9}$' or jsonb_typeof(m->'sellerCode') is distinct from 'number' or (m->>'sellerCode')!~'^[1-9][0-9]{0,9}$' or jsonb_typeof(m->'contexts') is distinct from 'array' then return false; end if;
  if jsonb_array_length(m->'contexts')=0 then return false; end if;
  for c in select value from jsonb_array_elements(m->'contexts') loop
   if jsonb_typeof(c)<>'object' or (c->'companyCode')::text not in ('1','4') or jsonb_typeof(c->'companyCode') is distinct from 'number'
    or jsonb_typeof(c->'tableCode') is distinct from 'number' or (c->>'tableCode')!~'^[0-9]{1,5}$'
    or jsonb_typeof(c->'localCode') is distinct from 'number' or (c->>'localCode')!~'^[0-9]{1,10}$'
    or jsonb_typeof(c->'control') is distinct from 'string' or length(c->>'control')>17
    or jsonb_typeof(c->'paymentCodes') is distinct from 'array' or jsonb_typeof(coalesce(c->'creditBlocked',m->'creditBlocked')) is distinct from 'boolean' then return false; end if;
   for v in select value from jsonb_array_elements(c->'paymentCodes') loop
    if jsonb_typeof(v)<>'number' or v::text!~'^[1-9][0-9]{0,4}$' then return false; end if;
   end loop;
  end loop;
  if exists(select 1 from jsonb_array_elements(m->'contexts') as ctx_entry(value) group by ctx_entry.value->>'companyCode' having count(*)>1) then return false; end if;
  if m ? 'defaultCompanyCode' and not exists(select 1 from jsonb_array_elements(m->'contexts') as ctx_entry(value) where ctx_entry.value->'companyCode'=m->'defaultCompanyCode') then return false; end if;
 else return false;
 end if;
 return true;
exception when others then return false;
end $$;

create function sul_private.save_online_order(p public.profiles,o jsonb,old jsonb,v jsonb) returns void
language plpgsql security definer set search_path=pg_catalog,public as $$
declare i jsonb; total_value numeric:=0; owner uuid; e jsonb:=v->'erp';
begin
 if p.role<>'administrador' or not p.active or p.company_id<>'432299' or not exists(select 1 from auth.users where id=p.id)
 then raise exception 'Pedido online exige administrador Auth ativo.' using errcode='42501'; end if;
 if not sul_private.online_verified_valid(v) or v->'requested' is distinct from o then raise exception 'Snapshot online verificado inválido.'; end if;
 select seller_id into owner from public.orders where company_id=p.company_id and id=o->>'id';
 owner:=coalesce(owner,p.id);
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
revoke all on function sul_private.save_online_order(public.profiles,jsonb,jsonb,jsonb) from public,anon,authenticated;
create or replace function public.get_workspace() returns jsonb language plpgsql volatile security definer
set search_path = pg_catalog, public as $$
declare p public.profiles; s jsonb; k text; mgr boolean; j jsonb;
begin
 p:=sul_private.member(); mgr:=p.role in ('administrador','gestor');
 select coalesce(jsonb_object_agg(key,value),'{}') into s from public.workspace_settings where company_id=p.company_id;
 s:=s || jsonb_build_object('company',jsonb_build_object('id',p.company_id,'name',(select name from public.companies where id=p.company_id),
   'cnpj',(select tax_id from public.companies where id=p.company_id),'user',p.name,'userId',p.id,'role',case p.role when 'administrador' then 'Administrador' when 'gestor' then 'Gestor' else 'Vendedor' end,
   'email',auth.jwt()->>'email','integration','Não configurada','credits',0,'plan','Não configurado'),
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
 from public.orders o join public.profiles u on u.id=o.seller_id where o.company_id=p.company_id and (mgr or o.seller_id=p.id) and (o.data#>>'{erp,mode}' is distinct from 'online' or p.role='administrador');
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

create or replace function public.save_workspace(p_state jsonb,p_expected_revision bigint,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
 p public.profiles; mgr boolean; rev bigint; before_state jsonb; rec jsonb; old jsonb;
 k text; subkey text; ident text; owner uuid; cid text; cfg jsonb; doc text; ledger public.workspace_ledger;
 prod public.products; cust public.customers; ord public.orders; item jsonb; n numeric; unit_price numeric; running_total numeric;
 factor numeric; allowed boolean; target_month date; amount numeric; entry record; keyvalue record; target_changes jsonb; self_name text; company_doc text;
 binding jsonb; binding_profile public.profiles; binding_name text; binding_email text; binding_role text; binding_form_id uuid;
 erp_ctx jsonb; erp_order jsonb; price_meta jsonb; price_result jsonb; erp_mode boolean; historical boolean; chosen_unit text; q_decimals integer; online_required jsonb; online_proof public.workspace_records; online_verified jsonb;
begin
 p:=sul_private.member(); mgr:=p.role in ('administrador','gestor');
 if p_request_id is null or p_expected_revision is null or jsonb_typeof(p_state) is distinct from 'object' then raise exception 'Gravação inválida: informe estado, revisão e identificador.'; end if;
 if octet_length(p_state::text)>10000000 then raise exception 'Estado excede o limite de gravação.'; end if;
 -- Comando separado do snapshot: somente administrador ativo, nunca autoridade do cliente.
 if p_state ? 'userBindings' then
  if p.role<>'administrador' then raise exception 'Somente administrador vincula contas cadastradas.' using errcode='42501'; end if;
  if jsonb_typeof(p_state->'userBindings') is distinct from 'array' then raise exception 'Vínculo de usuário inválido.'; end if;
  if jsonb_array_length(p_state->'userBindings')<>1 then raise exception 'Informe exatamente um vínculo por gravação.'; end if;
  binding:=p_state->'userBindings'->0;
  if jsonb_typeof(binding) is distinct from 'object' then raise exception 'Vínculo de usuário inválido.'; end if;
  if (binding-array['id','name','email','role'])<>'{}'::jsonb
     or jsonb_typeof(binding->'id') is distinct from 'string'
     or jsonb_typeof(binding->'name') is distinct from 'string'
     or jsonb_typeof(binding->'email') is distinct from 'string'
     or jsonb_typeof(binding->'role') is distinct from 'string' then
   raise exception 'Informe identificador, nome, e-mail e papel explícitos para o vínculo.';
  end if;
  -- UUID do formulário serve apenas à forma do comando e à idempotência; não identifica Auth.
  begin
   binding_form_id:=(binding->>'id')::uuid;
  exception when invalid_text_representation then
   raise exception 'Identificador do formulário deve ser UUID.';
  end;
  binding_name:=nullif(btrim(binding->>'name'),'');
  binding_email:=nullif(lower(btrim(binding->>'email')),'');
  binding_role:=case binding->>'role' when 'Administrador' then 'administrador' when 'Gestor' then 'gestor' when 'Vendedor' then 'vendedor' end;
  if binding_name is null then raise exception 'Informe o nome do usuário a vincular.'; end if;
  if binding_email is null then raise exception 'Informe o e-mail da conta cadastrada.'; end if;
  if binding_role is null then raise exception 'Papel do vínculo inválido.'; end if;
 end if;
 -- O lock da companhia serializa revisão, documento duplicado e idempotência.
 select revision into rev from public.companies where id=p.company_id for update;
 select * into ledger from public.workspace_ledger where company_id=p.company_id and request_id=p_request_id;
 if found then
  if ledger.actor_id<>p.id or ledger.request_state<>p_state then raise exception 'Identificador de gravação já utilizado em outra alteração.'; end if;
  return public.get_workspace();
 end if;
 if rev<>p_expected_revision then raise exception 'REVISION_CONFLICT: Recarregue os dados antes de salvar.' using errcode='PT409'; end if;
 before_state:=public.get_workspace()->'state';
 -- Mesmo lock/ledger/revisão do contrato manual; nunca exigir prova antes de reconhecer replay.
 online_required:=sul_private.online_required(p_state,before_state,p);
 if jsonb_array_length(online_required)>0 then
  select * into online_proof from public.workspace_records where company_id=p.company_id and kind='erp/order-proof' and id=p_request_id::text;
  if not found or online_proof.owner_id<>p.id or not sul_private.online_proof_ready(online_proof.data,p_state,p_expected_revision) then
   raise exception 'Atestação privada online ausente, expirada, consumida ou divergente.' using errcode='42501';
  end if;
 end if;
 if p_state->'company'->>'id' is distinct from p.company_id or
    p_state->'company'->>'role' is distinct from before_state->'company'->>'role' or
    p_state->'company'->>'userId' is distinct from p.id::text then
  raise exception 'Identidade, empresa ou papel não podem ser informados pelo navegador.' using errcode='42501';
 end if;
 if p_state->'users' is distinct from before_state->'users' then raise exception 'Perfis e papéis exigem administração explícita; não podem ser alterados no snapshot.' using errcode='42501'; end if;
 if coalesce(p_state->'erpCommercial',before_state->'erpCommercial') is distinct from before_state->'erpCommercial' then raise exception 'Catálogo ERP não pode ser alterado pelo snapshot.' using errcode='42501'; end if;
 -- Logs do cliente são descartados. Somente a transação abaixo gera auditoria real.
 foreach k in array array['titles','invoices','emails','chats'] loop
  if coalesce(p_state->k,'[]') <> before_state->k then raise exception 'Recurso % sem provedor configurado; nenhuma operação externa foi executada.',k; end if;
 end loop;
 if ((p_state->'company') - array['name','user','cnpj']) <> ((before_state->'company') - array['name','user','cnpj']) then
  raise exception 'Perfil, faturamento e integração não podem ser alterados pelo snapshot.' using errcode='42501';
 end if;
 self_name:=nullif(btrim(p_state->'company'->>'user'),'');
 if self_name is null then raise exception 'Informe seu nome.'; end if;
 if self_name<>p.name and exists(select 1 from public.profiles where company_id=p.company_id and id<>p.id and name=self_name) then raise exception 'Já existe um usuário com esse nome na empresa.'; end if;
 company_doc:=nullif(regexp_replace(coalesce(p_state->'company'->>'cnpj',''),'[^0-9]','','g'),'');
 if company_doc is not null and length(company_doc)<>14 then raise exception 'CNPJ da empresa deve conter 14 dígitos.'; end if;
 if company_doc is distinct from nullif(regexp_replace(coalesce(before_state->'company'->>'cnpj',''),'[^0-9]','','g'),'') then
  if p.role<>'administrador' then raise exception 'Somente administrador altera a empresa.' using errcode='42501'; end if;
  update public.companies set tax_id=company_doc where id=p.company_id;
 end if;
 if p_state->'company'->>'name' is distinct from before_state->'company'->>'name' then
  if p.role<>'administrador' then raise exception 'Somente administrador altera a empresa.' using errcode='42501'; end if;
  if length(btrim(coalesce(p_state->'company'->>'name','')))=0 then raise exception 'Informe o nome da empresa.'; end if;
  update public.companies set name=p_state->'company'->>'name' where id=p.company_id;
 end if;
 -- Remoção por ausência é rejeitada: nunca apaga dados invisíveis ou presume confirmação destrutiva.
 foreach k in array array['customers','products','orders','opportunities','tasks','activities','routes','teams','carriers','policy'] loop
  if jsonb_typeof(p_state->k) is distinct from 'array' then raise exception 'Coleção % inválida ou ausente.',k; end if;
  if exists(select 1 from jsonb_array_elements(before_state->k) x where not exists(select 1 from jsonb_array_elements(p_state->k) y where y->>'id'=x->>'id')) then
   raise exception 'Exclusão de % não realizada: remoção por snapshot não é permitida. Use bloqueio ou cancelamento.',k;
  end if;
  if exists(select 1 from jsonb_array_elements(p_state->k) x group by x->>'id' having count(*)>1) then raise exception 'Identificadores duplicados em %.',k; end if;
 end loop;
 -- Configuração geral é administrativa; catálogos e metas são também de gestão.
 for k in select key from public.workspace_settings where company_id=p.company_id loop
  if p_state->k is distinct from before_state->k then
   if not mgr or (k='config' and p.role<>'administrador') then raise exception 'Sem permissão para configurar %.',k using errcode='42501'; end if;
   if k in ('config','indicators','priceTablesBase') and jsonb_typeof(p_state->k) is distinct from 'object' then raise exception 'Configuração % inválida.',k; end if;
   if k in ('stages','payments','reports','extraIndicators','panels') and jsonb_typeof(p_state->k) is distinct from 'array' then raise exception 'Catálogo % inválido.',k; end if;
   if k='config' and (coalesce((p_state->k->>'portal')::boolean,false) or coalesce((p_state->k->>'pay')::boolean,false)) then raise exception 'Portal e pagamentos exigem provedores reais ainda não configurados.'; end if;
   if k='stages' and (jsonb_array_length(p_state->k)<2 or (select count(distinct v) from jsonb_array_elements_text(p_state->k) v)<>jsonb_array_length(p_state->k)) then raise exception 'Informe ao menos duas etapas diferentes.'; end if;
   update public.workspace_settings set value=p_state->k where company_id=p.company_id and key=k;
  end if;
 end loop;
 select value into cfg from public.workspace_settings where company_id=p.company_id and key='config';
 for rec in select value from jsonb_array_elements(p_state->'products') loop
  if rec->>'id' like 'sankhya:%' or rec#>>'{erp,mode}'='online' then raise exception 'ID reservado ERP não pode ser cadastro manual.'; end if;
  select value into old from jsonb_array_elements(before_state->'products') where value->>'id'=rec->>'id';
  if old=rec then continue; end if;
  if not mgr then raise exception 'Vendedor não altera produtos ou preços.' using errcode='42501'; end if;
  if coalesce(rec->'erp','null'::jsonb) is distinct from coalesce(old->'erp','null'::jsonb) then raise exception 'Identidade e regras de origem ERP exigem o canal administrativo, não o snapshot.' using errcode='42501'; end if;
  if jsonb_typeof(rec) is distinct from 'object' or nullif(btrim(rec->>'name'),'') is null then raise exception 'Informe o nome do produto.'; end if;
  if rec->>'price' is not null and ((rec->>'price')::numeric<0 or (rec->>'price')::numeric<>round((rec->>'price')::numeric,2)) then raise exception 'Preço deve ser não negativo, em centavos.'; end if;
  if rec->>'multiple' is not null and (rec->>'multiple')::numeric<=0 then raise exception 'Múltiplo de venda deve ser positivo.'; end if;
  insert into public.products(company_id,id,name,price,active,commission,data)
  values(p.company_id,rec->>'id',rec->>'name',(rec->>'price')::numeric,coalesce((rec->>'active')::boolean,true),(rec->>'commission')::numeric,
   rec - array['id','name','price','active','commission','source','company_id','companyId'])
  on conflict(company_id,id) do update set name=excluded.name,price=excluded.price,active=excluded.active,commission=excluded.commission,data=excluded.data;
 end loop;
 for rec in select value from jsonb_array_elements(p_state->'customers') loop
  if rec->>'id' like 'sankhya:%' or rec#>>'{erp,mode}'='online' then raise exception 'ID reservado ERP não pode ser cadastro manual.'; end if;
  select value into old from jsonb_array_elements(before_state->'customers') where value->>'id'=rec->>'id';
  if old=rec then continue; end if;
  if exists(select 1 from public.customers where company_id=p.company_id and id=rec->>'id' and not (mgr or seller_id=p.id)) then raise exception 'Cliente fora da sua carteira.' using errcode='42501'; end if;
  owner:=sul_private.owner(rec,p);
  if coalesce(rec->'erp','null'::jsonb) is distinct from coalesce(old->'erp','null'::jsonb) then raise exception 'Identidade e regras de origem ERP exigem o canal administrativo, não o snapshot.' using errcode='42501'; end if;
  if old#>>'{erp,source}'='sankhya' and owner is distinct from (old->>'sellerId')::uuid then raise exception 'Carteira ERP exige vínculo explícito de origem; não será reatribuída pelo snapshot.'; end if;
  if nullif(btrim(rec->>'name'),'') is null or nullif(btrim(rec->>'fantasy'),'') is null then raise exception 'Razão social e nome fantasia são obrigatórios.'; end if;
  if not mgr and (coalesce(rec->'blocked','false')<>coalesce(old->'blocked','false') or coalesce(rec->'priceTables','[]')<>coalesce(old->'priceTables','[]') or coalesce(rec->'payments','[]')<>coalesce(old->'payments','[]') or coalesce(rec->'categories','[]')<>coalesce(old->'categories','[]') or coalesce(rec->'portal','false')<>coalesce(old->'portal','false')) then
   raise exception 'Bloqueio, vínculos comerciais e permissões do cliente exigem gestor ou administrador.' using errcode='42501';
  end if;
  if coalesce((rec->>'portal')::boolean,false) then raise exception 'Portal do cliente não está configurado.'; end if;
  doc:=nullif(regexp_replace(coalesce(rec->>'cnpj',''),'[^0-9]','','g'),'');
  if doc is not null and length(doc) not in (11,14) then raise exception 'CPF/CNPJ deve conter 11 ou 14 dígitos.'; end if;
  if coalesce((cfg->>'duplicateDocument')::boolean,true) and doc is not null and exists(select 1 from public.customers where company_id=p.company_id and document=doc and id<>rec->>'id') then raise exception 'CPF/CNPJ já cadastrado na empresa.'; end if;
  for item in select value from jsonb_array_elements(coalesce(rec->'refItems',rec->'__priceList','[]')) loop
   if not exists(select 1 from public.products where company_id=p.company_id and id=item->>'productId' and price>0 and active) or coalesce((item->>'price')::numeric,0)<=0 or (item->>'price')::numeric>99999999999999.99 then raise exception 'Item de referência exige produto com preço permitido e valor positivo.'; end if;
  end loop;
  insert into public.customers(company_id,id,seller_id,name,fantasy,document,blocked,data)
  values(p.company_id,rec->>'id',owner,rec->>'name',rec->>'fantasy',doc,coalesce((rec->>'blocked')::boolean,false),
   (rec - array['id','seller','sellerId','name','fantasy','cnpj','blocked','source','companyId','company_id']) ||
   jsonb_build_object('refItems',coalesce(rec->'refItems',rec->'__priceList','[]'),'tags',coalesce(rec->'tags','[]'),'priceTables',coalesce(rec->'priceTables','[]'), 'createdAt',coalesce(old->'createdAt',to_jsonb((now() at time zone 'America/Sao_Paulo')::date))))
  on conflict(company_id,id) do update set seller_id=excluded.seller_id,name=excluded.name,fantasy=excluded.fantasy,document=excluded.document,blocked=excluded.blocked,data=excluded.data;
 end loop;
 -- Revalidar duplicidade ao ativar a configuração, inclusive sem edição dos clientes.
 if coalesce((cfg->>'duplicateDocument')::boolean,true) and exists(select 1 from public.customers where company_id=p.company_id and document is not null group by document having count(*)>1) then raise exception 'Existem CPF/CNPJ duplicados; regularize antes de ativar o bloqueio.'; end if;
 for rec in select value from jsonb_array_elements(p_state->'orders') loop
  select value into old from jsonb_array_elements(before_state->'orders') where value->>'id'=rec->>'id';
  if old=rec then continue; end if;
  if sul_private.online_order(rec) then
   if online_required ? (rec->>'id') then
    select value into online_verified from jsonb_array_elements(online_proof.data->'verifiedOrders') v where v->>'id'=rec->>'id';
    if online_verified is null or online_verified->'requested' is distinct from rec then raise exception 'Pedido sem prova privada integral correspondente.'; end if;
   else
    -- Só notas e campos não comerciais: reutilizar exatamente snapshots já persistidos.
    online_verified:=jsonb_build_object('id',rec->>'id','requested',rec,'erp',old->'erp','items',old->'items');
   end if;
   perform sul_private.save_online_order(p,rec,old,online_verified);
   continue;
  end if;
  select * into ord from public.orders where company_id=p.company_id and id=rec->>'id';
  if found and not (mgr or ord.seller_id=p.id) then raise exception 'Pedido fora da sua carteira.' using errcode='42501'; end if;
  if rec#>>'{erp,source}'='sankhya' and coalesce(rec->'erp','{}'::jsonb) is distinct from coalesce(old->'erp','{}'::jsonb) then raise exception 'Origem ERP não autoriza referência sem prova.'; end if;
  owner:=sul_private.owner(rec,p);
  select * into cust from public.customers where company_id=p.company_id and id=rec->>'customerId';
  if not found or (not mgr and cust.seller_id<>p.id) then raise exception 'Cliente não autorizado para este pedido.' using errcode='42501'; end if;
  if cust.blocked then raise exception 'Cliente bloqueado não pode emitir ou alterar pedido.'; end if;
  if owner<>cust.seller_id then raise exception 'O vendedor do pedido deve corresponder à carteira do cliente.'; end if;
  if nullif(rec->>'delivery','') is null or nullif(btrim(rec->>'agenda'),'') is null then raise exception 'data_entrega e Tipo de Agenda são obrigatórios.'; end if;
  if not exists(select 1 from public.workspace_records where company_id=p.company_id and kind='collections/pedidos/tipos' and data->>'name'=rec->>'type') then raise exception 'Tipo de pedido não cadastrado.'; end if;
  if nullif(btrim(rec->>'payment'),'') is null then raise exception 'Informe a condição de pagamento.'; end if;
  if coalesce((rec->>'freight')::numeric,0)<>0 then raise exception 'Frete não está habilitado neste contrato.'; end if;
  if jsonb_typeof(rec->'items') is distinct from 'array' or jsonb_array_length(rec->'items')=0 then raise exception 'Pedido exige ao menos um item válido.'; end if;
  if exists(select 1 from jsonb_array_elements(rec->'items') x group by x->>'productId' having count(*)>1) then raise exception 'Produtos duplicados no pedido. Ajuste a quantidade.'; end if;
  erp_mode:=coalesce(cust.data#>>'{erp,source}'='sankhya',false);
  historical:=erp_mode and old->'erp' is not null and old->'customerId'=rec->'customerId' and old->'date'=rec->'date' and old->'payment'=rec->'payment' and old->'items'=rec->'items' and old->'erp'=rec->'erp' and old->'type'=rec->'type' and old->'status'=rec->'status' and old->'delivery'=rec->'delivery' and old->'agenda'=rec->'agenda';
  erp_order:='{}'::jsonb;
  if erp_mode then
   erp_ctx:=sul_private.erp_context(cust.data,rec->'erp');
   if historical then erp_order:=old->'erp';
   else
    if nullif(rec->>'date','') is null then raise exception 'Data comercial ERP obrigatória.'; end if;
    erp_order:=sul_private.erp_payment(p.company_id,erp_ctx,rec->>'payment',(rec->>'date')::date);
   end if;
  elsif old->'erp' is not null and old->'erp'<>'{}'::jsonb then raise exception 'Pedido ERP não pode perder sua identidade de origem.';
  end if;
  running_total:=0;
  -- O número e campos ERP não são controlados pelo navegador.
  insert into public.orders(company_id,id,customer_id,seller_id,type,status,date,delivery,agenda,data)
  values(p.company_id,rec->>'id',cust.id,owner,rec->>'type',coalesce(rec->>'status','Concluído'),coalesce(nullif(rec->>'date','')::date,(now() at time zone 'America/Sao_Paulo')::date),
   (rec->>'delivery')::date,rec->>'agenda',jsonb_build_object('payment',coalesce(rec->>'payment',''),'notes',coalesce(rec->>'notes',''),
   'internalNotes',coalesce(rec->>'internalNotes',''),'clientOrder',coalesce(rec->>'clientOrder',''),'cargoStatus',coalesce(old->>'cargoStatus','Pendente'))||case when erp_mode then jsonb_build_object('erp',erp_order) else '{}'::jsonb end)
  on conflict(company_id,id) do update set customer_id=excluded.customer_id,seller_id=excluded.seller_id,type=excluded.type,status=excluded.status,
   date=excluded.date,delivery=excluded.delivery,agenda=excluded.agenda,data=excluded.data;
  -- Substituição dos itens é explícita, limitada ao pedido autorizado, e revertida em qualquer falha.
  delete from public.order_items where company_id=p.company_id and order_id=rec->>'id';
  for item in select value from jsonb_array_elements(rec->'items') loop
   select * into prod from public.products where company_id=p.company_id and id=item->>'productId';
   if not found or not prod.active then raise exception 'Produto inativo ou sem preço permitido.'; end if;
   chosen_unit:=coalesce(nullif(item->>'unit',''),nullif(prod.data->>'unit',''));
   n:=(item->>'qty')::numeric; unit_price:=(item->>'price')::numeric;
   if n is null or n<=0 or n>100000000 or unit_price is null or unit_price<=0 or unit_price>99999999999999.99 or unit_price<>round(unit_price,2) then raise exception 'Quantidade ou preço inválido.'; end if;
   price_meta:='{}'::jsonb;
   if erp_mode then
    if prod.data#>>'{erp,source}' is distinct from 'sankhya' then raise exception 'Cliente e produto exigem vínculos ERP compatíveis.'; end if;
    if historical then
     select previous->'erp' into price_meta from jsonb_array_elements(old->'items') previous where previous->>'productId'=prod.id;
     q_decimals:=3;
    else
     q_decimals:=sul_private.erp_quantity_decimals(prod.data,chosen_unit);
     price_result:=sul_private.erp_price(p.company_id,erp_ctx,prod.id,chosen_unit,(rec->>'date')::date);
     if unit_price<>(price_result->>'price')::numeric then raise exception 'Preço exato não autorizado para produto, unidade e vínculo do cliente.'; end if;
     price_meta:=price_result->'erp';
    end if;
   else
    if prod.data#>>'{erp,source}'='sankhya' then raise exception 'Cliente sem vínculo ERP para os produtos selecionados.'; end if;
    if prod.price is null or prod.price<=0 then raise exception 'Produto inativo ou sem preço permitido.'; end if;
    if item->>'unit' is not null and item->>'unit' is distinct from prod.data->>'unit' then raise exception 'Conversão de unidade não configurada.'; end if;
    q_decimals:=0;
    allowed:=unit_price=prod.price or exists(select 1 from jsonb_array_elements(coalesce(old->'items','[]')) previous where previous->>'productId'=item->>'productId' and (previous->>'price')::numeric=unit_price);
    for subkey in select jsonb_array_elements_text(coalesce(cust.data->'priceTables','[]')) loop
     select coalesce(value->subkey->>(prod.data->>'category'),value->subkey->>'*')::numeric into factor from public.workspace_settings where company_id=p.company_id and key='priceTablesBase';
     if factor>0 and unit_price=round(prod.price*factor,2) then allowed:=true; end if;
    end loop;
    if not allowed then raise exception 'Preço não autorizado para o produto e cliente. Não são permitidos descontos ou Saldo Flex.'; end if;
   end if;
   if n<>round(n,q_decimals) then raise exception 'Quantidade fora da precisão configurada; não será arredondada.'; end if;
   if not coalesce(historical,false) and prod.data->>'multiple' is not null and mod(n,(prod.data->>'multiple')::numeric)<>0 then raise exception 'Quantidade fora do múltiplo de venda do produto.'; end if;
   insert into public.order_items(company_id,order_id,product_id,qty,price,unit,erp) values(p.company_id,rec->>'id',prod.id,n,unit_price,chosen_unit,coalesce(price_meta,'{}'::jsonb));
   running_total:=running_total+round(n*unit_price,2);
  end loop;
  update public.orders set total=running_total where company_id=p.company_id and id=rec->>'id';
 end loop;
 -- CRM/agenda têm proprietário e referência de cliente próprios, nunca um blob global.
 foreach k in array array['opportunities','tasks','activities','routes','teams','carriers','policy'] loop
 for rec in select value from jsonb_array_elements(p_state->k) loop
  select value into old from jsonb_array_elements(before_state->k) where value->>'id'=rec->>'id';
  if old=rec then continue; end if;
  if exists(select 1 from public.workspace_records where company_id=p.company_id and kind=k and id=rec->>'id' and owner_id is not null and not (mgr or owner_id=p.id)) then raise exception 'Registro fora do seu acesso.' using errcode='42501'; end if;
  if k in ('teams','carriers','policy') then
   if not mgr or (k='policy' and p.role<>'administrador') then raise exception 'Sem permissão para alterar %.',k using errcode='42501'; end if;
   owner:=null; cid:=null;
  else
   owner:=sul_private.owner(rec,p); cid:=nullif(rec->>'customerId','');
   if cid is not null and not exists(select 1 from public.customers where company_id=p.company_id and id=cid and seller_id=owner) then raise exception 'Cliente não pertence à carteira do responsável.'; end if;
   if k='opportunities' then
    if not exists(select 1 from jsonb_array_elements_text(p_state->'stages') st where st=rec->>'stage') then raise exception 'Etapa de oportunidade inválida.'; end if;
    if coalesce((rec->>'value')::numeric,-1)<0 then raise exception 'Valor da oportunidade deve ser não negativo.'; end if;
   end if;
   if nullif(rec->>'date','') is null then raise exception 'Data obrigatória em %.',k; end if;
   perform (rec->>'date')::date;
  end if;
  if nullif(btrim(rec->>'name'),'') is null then raise exception 'Nome ou descrição obrigatória em %.',k; end if;
  insert into public.workspace_records(company_id,kind,id,owner_id,customer_id,data)
   values(p.company_id,k,rec->>'id',owner,cid,rec-array['id','seller','sellerId','customerId','source','company_id','companyId'])
   on conflict(company_id,kind,id) do update set owner_id=excluded.owner_id,customer_id=excluded.customer_id,data=excluded.data;
 end loop;
 end loop;
 if jsonb_typeof(p_state->'collections') is distinct from 'object' then raise exception 'Catálogos inválidos.'; end if;
 if p_state->'collections' is distinct from before_state->'collections' then
  if not mgr then raise exception 'Vendedor não altera catálogos.' using errcode='42501'; end if;
  if exists(select 1 from jsonb_each(before_state->'collections') x,
    lateral jsonb_array_elements(x.value) r
    where not exists(select 1 from jsonb_array_elements(coalesce(p_state->'collections'->x.key,'[]')) y where y->>'id'=r->>'id')) then
   raise exception 'Exclusão de catálogo não realizada: remoção por snapshot não é permitida.';
  end if;
  for entry in select * from jsonb_each(p_state->'collections') loop
   k:='collections/'||entry.key;
   if jsonb_typeof(entry.value)<>'array' then raise exception 'Catálogo inválido.'; end if;
   for rec in select value from jsonb_array_elements(entry.value) loop
    if nullif(btrim(rec->>'name'),'') is null then raise exception 'Nome do catálogo obrigatório.'; end if;
    insert into public.workspace_records(company_id,kind,id,data) values(p.company_id,k,rec->>'id',rec-array['id','source','company_id','companyId','owner_id','sellerId','role'])
    on conflict(company_id,kind,id) do update set data=excluded.data;
   end loop;
  end loop;
 end if;
 -- Não permitir etapas órfãs após alteração de configuração.
 if exists(select 1 from public.workspace_records r where company_id=p.company_id and kind='opportunities' and not exists(select 1 from jsonb_array_elements_text(p_state->'stages') st where st=r.data->>'stage')) then raise exception 'Mova as oportunidades antes de remover uma etapa utilizada.'; end if;
 -- Metas mensais são canônicas; targets é apenas a compatibilidade do mês indicado.
 -- Um mapa legado inalterado nunca pode sobrescrever uma alteração mensal.
 if p_state->'targets' is distinct from before_state->'targets' or p_state->'targetPeriods' is distinct from before_state->'targetPeriods' then
  if not mgr then raise exception 'Somente gestor ou administrador define metas.' using errcode='42501'; end if;
  target_changes:='{}'::jsonb;
  if p_state->'targetPeriods' is distinct from before_state->'targetPeriods' then
   if jsonb_typeof(p_state->'targetPeriods') is distinct from 'object' then raise exception 'Mapa mensal de metas inválido.'; end if;
   for entry in select * from jsonb_each(p_state->'targetPeriods') loop
    if entry.value is distinct from before_state->'targetPeriods'->entry.key then target_changes:=target_changes||jsonb_build_object(entry.key,entry.value); end if;
   end loop;
  end if;
  if p_state->'targets' is distinct from before_state->'targets' then
   if jsonb_typeof(p_state->'targets') is distinct from 'object' then raise exception 'Mapa de metas inválido.'; end if;
   subkey:=coalesce(p_state->>'targetPeriod',to_char((now() at time zone 'America/Sao_Paulo')::date,'YYYY-MM'));
   if target_changes ? subkey and target_changes->subkey is distinct from p_state->'targets' then raise exception 'Mapas de metas divergentes para o mesmo mês.'; end if;
   target_changes:=target_changes||jsonb_build_object(subkey,p_state->'targets');
  end if;
  for entry in select * from jsonb_each(target_changes) loop
   if entry.key !~ '^\d{4}-(0[1-9]|1[0-2])$' or jsonb_typeof(entry.value)<>'object' then raise exception 'Período da meta inválido.'; end if;
   target_month:=(entry.key||'-01')::date;
   for keyvalue in select * from jsonb_each_text(entry.value) loop
    amount:=keyvalue.value::numeric;
    if amount is null or amount<0 or amount<>round(amount,2) then raise exception 'Valor de meta inválido.'; end if;
    if to_jsonb(amount) is not distinct from before_state->'targetPeriods'->entry.key->keyvalue.key then continue; end if;
    owner:=sul_private.owner(jsonb_build_object('seller',keyvalue.key),p);
    insert into public.sales_targets(company_id,seller_id,period,amount) values(p.company_id,owner,target_month,amount)
     on conflict(company_id,seller_id,period) do update set amount=excluded.amount;
   end loop;
  end loop;
 end if;
 -- Nome de exibição é editável apenas para a própria conta; papel, ID e e-mail continuam protegidos.
 if self_name<>p.name then update public.profiles set name=self_name where id=p.id; end if;
 -- Aplicado por último: nomes usados por carteiras, CRM e metas já foram resolvidos.
 -- Perfil e conta Auth são bloqueados juntos para não vincular um e-mail alterado em paralelo.
 if binding is not null then
  begin
   select pr.* into strict binding_profile
    from auth.users au join public.profiles pr on pr.id=au.id
    where lower(btrim(au.email))=binding_email and pr.company_id=p.company_id
      and au.email_confirmed_at is not null
    for update of au,pr;
  exception when no_data_found or too_many_rows then
   raise exception 'Conta confirmada com perfil da empresa não encontrada de forma única.';
  end;
  if binding_profile.id=p.id then raise exception 'Não é permitido vincular a própria conta.' using errcode='42501'; end if;
  if binding_profile.active then raise exception 'Conta já ativa; o formulário permite somente adição.'; end if;
  if exists(select 1 from public.profiles where company_id=p.company_id and id<>binding_profile.id and name=binding_name) then
   raise exception 'Já existe um usuário com esse nome na empresa.';
  end if;
  update public.profiles set name=binding_name,role=binding_role,active=true
   where id=binding_profile.id and company_id=p.company_id and not active;
  if not found then raise exception 'Conta não disponível para ativação.'; end if;
 end if;
 if jsonb_array_length(online_required)>0 then
  update public.workspace_records set data=data||jsonb_build_object('consumed',true,'consumedAt',clock_timestamp())
   where company_id=p.company_id and kind='erp/order-proof' and id=p_request_id::text and owner_id=p.id;
 end if;
 update public.companies set revision=revision+1 where id=p.company_id returning revision into rev;
 insert into public.workspace_ledger(company_id,request_id,actor_id,revision,request_state) values(p.company_id,p_request_id,p.id,rev,p_state);
 return public.get_workspace();
end $$;


-- Invalida snapshots anteriores sem criar cadastros ou pedidos.
update public.companies set revision=revision+1 where id='432299';
commit;
