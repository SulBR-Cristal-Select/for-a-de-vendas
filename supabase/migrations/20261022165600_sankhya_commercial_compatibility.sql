-- Compatibilidade comercial; sem carga, ativação de contas ou escrita no ERP.
begin;
do $$ begin
 if not exists(select 1 from public.companies where id='432299') or position('PT409' in pg_get_functiondef('public.save_workspace(jsonb,bigint,uuid)'::regprocedure))=0 then
  raise exception 'Projeto ou contrato anterior não corresponde à SulBR.';
 end if;
 perform 1 from public.companies where id='432299' for update;
end $$;

create function sul_private.erp_metadata_valid(kind text, data jsonb) returns boolean
language plpgsql immutable set search_path=pg_catalog,public as $$
declare m jsonb:=data->'erp'; c jsonb; v jsonb; u text; d integer;
begin
 if m is null or m='null'::jsonb then return true; end if;
 if jsonb_typeof(m)<>'object' or m->>'source' is distinct from 'sankhya' then return false; end if;
 if kind='product' then
  if jsonb_typeof(m->'productCode') is distinct from 'number' or (m->>'productCode')!~'^[1-9][0-9]{0,9}$' or nullif(btrim(data->>'unit'),'') is null then return false; end if;
  v:=coalesce(m->'units'->(data->>'unit'),m->'quantityDecimals');
  if jsonb_typeof(v) is distinct from 'number' or v::text!~'^[0-3]$' then return false; end if;
  if m ? 'units' then
   if jsonb_typeof(m->'units')<>'object' then return false; end if;
   for u,v in select * from jsonb_each(m->'units') loop
    if nullif(btrim(u),'') is null or jsonb_typeof(v)<>'number' or v::text!~'^[0-3]$' then return false; end if;
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
create function sul_private.erp_installments_valid(a jsonb) returns boolean language plpgsql immutable set search_path=pg_catalog,public as $$
declare x jsonb; total numeric:=0;
begin
 if jsonb_typeof(a) is distinct from 'array' then return false; end if;
 if jsonb_array_length(a) not between 1 and 60 then return false; end if;
 for x in select value from jsonb_array_elements(a) loop
  if jsonb_typeof(x->'sequence') is distinct from 'number' or (x->>'sequence')!~'^[1-9][0-9]?$' or jsonb_typeof(x->'days') is distinct from 'number' or (x->>'days')!~'^[0-9]{1,5}$' or jsonb_typeof(x->'percentage') is distinct from 'number' then return false; end if;
  if (x->>'percentage')::numeric<=0 or (x->>'percentage')::numeric>100 then return false; end if;
  total:=total+(x->>'percentage')::numeric;
 end loop;
 return total between 99.99 and 100 and not exists(select 1 from jsonb_array_elements(a) as parcel_entry(value) group by parcel_entry.value->>'sequence' having count(*)>1);
exception when others then return false;
end $$;
alter table public.products add constraint products_erp_metadata check(sul_private.erp_metadata_valid('product',data));
alter table public.customers add constraint customers_erp_metadata check(sul_private.erp_metadata_valid('customer',data));
create unique index products_erp_code on public.products(company_id,((data#>>'{erp,productCode}')::bigint)) where data#>>'{erp,source}'='sankhya';
create unique index customers_erp_code on public.customers(company_id,((data#>>'{erp,partnerCode}')::bigint)) where data#>>'{erp,source}'='sankhya';
alter table public.order_items add column unit text, add column erp jsonb not null default '{}'::jsonb check(jsonb_typeof(erp)='object');
create table public.erp_price_tables(
 company_id text not null references public.companies(id) check(company_id='432299'),
 erp_company integer not null check(erp_company in (1,4)), table_code integer not null check(table_code between 0 and 99999),
 version_code bigint not null check(version_code between 1 and 9999999999), valid_from date not null, name text not null check(length(btrim(name))>0), active boolean not null,
 primary key(company_id,erp_company,version_code)
);
create index erp_table_validity on public.erp_price_tables(company_id,erp_company,table_code,valid_from desc);
create table public.erp_prices(
 company_id text not null,erp_company integer not null,version_code bigint not null,product_id text not null,
 unit text not null check(length(btrim(unit)) between 1 and 6),local_code bigint not null check(local_code between 0 and 9999999999),control text not null check(length(control)<=17),
 amount numeric not null check(amount>0 and amount<=99999999999999.99 and amount=round(amount,2)),source_type text not null default 'V' check(source_type='V'),
 primary key(company_id,erp_company,version_code,product_id,unit,local_code,control),
 foreign key(company_id,erp_company,version_code) references public.erp_price_tables(company_id,erp_company,version_code),
 foreign key(company_id,product_id) references public.products(company_id,id)
);
create table public.erp_payment_terms(
 company_id text not null references public.companies(id) check(company_id='432299'),erp_company integer not null check(erp_company in (1,4)),
 code integer not null check(code between 1 and 99999),changed_at timestamp without time zone not null,label text not null check(length(btrim(label))>0),active boolean not null,is_credit boolean,
 installments jsonb not null check(sul_private.erp_installments_valid(installments)),rules jsonb not null check(jsonb_typeof(rules)='object' and coalesce(rules->'hasFormula','false'::jsonb)='false'::jsonb),
 primary key(company_id,erp_company,code,changed_at)
);

create function sul_private.erp_visible(tenant text,branch integer,price_table integer,payment_code integer) returns boolean language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare p public.profiles;
begin
 select * into p from public.profiles where id=auth.uid() and active and company_id=tenant;
 if not found or tenant<>'432299' then return false; end if;
 if p.role in ('administrador','gestor') then return true; end if;
 return exists(select 1 from public.customers c cross join lateral jsonb_array_elements(coalesce(c.data#>'{erp,contexts}','[]'::jsonb)) x
  where c.company_id=tenant and c.seller_id=p.id and c.data#>>'{erp,source}'='sankhya' and (x->>'companyCode')::integer=branch
   and (price_table is null or (x->>'tableCode')::integer=price_table)
   and (payment_code is null or x->'paymentCodes' @> to_jsonb(array[payment_code])));
end $$;
alter table public.erp_price_tables enable row level security;
alter table public.erp_prices enable row level security;
alter table public.erp_payment_terms enable row level security;
revoke all on public.erp_price_tables,public.erp_prices,public.erp_payment_terms from public,anon,authenticated;
grant select on public.erp_price_tables,public.erp_prices,public.erp_payment_terms to authenticated;
-- As escritas do catálogo ficam no canal administrativo do banco, não no snapshot do navegador.
create policy erp_tables_read on public.erp_price_tables for select to authenticated using(sul_private.erp_visible(company_id,erp_company,table_code,null));
create policy erp_prices_read on public.erp_prices for select to authenticated using(exists(select 1 from public.erp_price_tables t where t.company_id=erp_prices.company_id and t.erp_company=erp_prices.erp_company and t.version_code=erp_prices.version_code));
create policy erp_payments_read on public.erp_payment_terms for select to authenticated using(sul_private.erp_visible(company_id,erp_company,null,code));
create function sul_private.erp_catalog() returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare p public.profiles; tables jsonb;prices jsonb;payments jsonb;
begin
 p:=sul_private.member();
 select coalesce(jsonb_agg(to_jsonb(t) order by t.erp_company,t.table_code,t.valid_from,t.version_code),'[]'::jsonb) into tables from public.erp_price_tables t where t.company_id=p.company_id and sul_private.erp_visible(t.company_id,t.erp_company,t.table_code,null);
 select coalesce(jsonb_agg(to_jsonb(e)||jsonb_build_object('amount',e.amount::text) order by e.erp_company,e.version_code,e.product_id,e.unit,e.local_code,e.control),'[]'::jsonb) into prices from public.erp_prices e join public.erp_price_tables t using(company_id,erp_company,version_code) where e.company_id=p.company_id and sul_private.erp_visible(t.company_id,t.erp_company,t.table_code,null);
 select coalesce(jsonb_agg(to_jsonb(t) order by t.erp_company,t.code,t.changed_at),'[]'::jsonb) into payments from public.erp_payment_terms t where t.company_id=p.company_id and sul_private.erp_visible(t.company_id,t.erp_company,null,t.code);
 return jsonb_build_object('priceTables',tables,'prices',prices,'paymentTerms',payments);
end $$;
create function sul_private.erp_context(data jsonb,requested jsonb) returns jsonb language plpgsql immutable set search_path=pg_catalog,public as $$
declare code jsonb:=coalesce(requested->'companyCode',data#>'{erp,defaultCompanyCode}'); result jsonb; n integer;
begin
 if not sul_private.erp_metadata_valid('customer',data) or data#>>'{erp,source}' is distinct from 'sankhya' then raise exception 'Cadastro ERP sem vínculos comerciais comprovados.'; end if;
 select count(*) into n from jsonb_array_elements(data#>'{erp,contexts}') x where code is null or x->'companyCode'=code;
 if n<>1 then raise exception 'Filial comercial ausente ou ambígua; não será escolhida automaticamente.'; end if;
 select x into result from jsonb_array_elements(data#>'{erp,contexts}') x where code is null or x->'companyCode'=code;
 return result||jsonb_build_object('creditBlocked',coalesce(result->'creditBlocked',data#>'{erp,creditBlocked}'));
end $$;
create function sul_private.erp_quantity_decimals(data jsonb,unit_code text) returns integer language plpgsql immutable set search_path=pg_catalog,public as $$
declare result jsonb;
begin
 if data#>>'{erp,source}' is distinct from 'sankhya' then return 0; end if;
 result:=coalesce(data#>'{erp,units}'->unit_code,case when unit_code=data->>'unit' then data#>'{erp,quantityDecimals}' end);
 if result is null or result::text!~'^[0-3]$' then raise exception 'Unidade ou precisão da quantidade não representável neste contrato.'; end if;
 return result::text::integer;
end $$;
create function sul_private.erp_price(tenant text,context jsonb,product text,unit_code text,at_date date) returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare last_day date; n integer; t public.erp_price_tables;e public.erp_prices;
begin
 select max(valid_from) into last_day from public.erp_price_tables where company_id=tenant and erp_company=(context->>'companyCode')::integer and table_code=(context->>'tableCode')::integer and valid_from<=at_date;
 select count(*) into n from public.erp_price_tables where company_id=tenant and erp_company=(context->>'companyCode')::integer and table_code=(context->>'tableCode')::integer and valid_from=last_day;
 if n<>1 then raise exception 'Tabela de preço sem versão vigente única e ativa.'; end if;
 select * into t from public.erp_price_tables where company_id=tenant and erp_company=(context->>'companyCode')::integer and table_code=(context->>'tableCode')::integer and valid_from=last_day;
 if not t.active then raise exception 'Tabela de preço inativa.'; end if;
 select * into e from public.erp_prices where company_id=tenant and erp_company=t.erp_company and version_code=t.version_code and product_id=product and unit=unit_code and local_code=(context->>'localCode')::bigint and control=context->>'control' and source_type='V';
 if not found then raise exception 'Preço exato não configurado para produto, unidade e vínculo do cliente.'; end if;
 return jsonb_build_object('price',e.amount,'erp',jsonb_build_object('companyCode',t.erp_company,'tableCode',t.table_code,'versionCode',t.version_code,'validFrom',t.valid_from,'localCode',e.local_code,'control',e.control));
end $$;
create function sul_private.erp_payment(tenant text,context jsonb,payment_label text,at_date date) returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare t public.erp_payment_terms; n integer;
begin
 select count(*) into n from public.erp_payment_terms a where a.company_id=tenant and a.erp_company=(context->>'companyCode')::integer and a.label=payment_label and a.active and a.changed_at<(at_date+1)::timestamp
  and context->'paymentCodes' @> to_jsonb(array[a.code]) and not exists(select 1 from public.erp_payment_terms x where x.company_id=a.company_id and x.erp_company=a.erp_company and x.code=a.code and x.changed_at>a.changed_at and x.changed_at<(at_date+1)::timestamp);
 if n<>1 then raise exception 'Condição de pagamento ERP não autorizada ou ambígua para cliente e filial.'; end if;
 select * into t from public.erp_payment_terms a where a.company_id=tenant and a.erp_company=(context->>'companyCode')::integer and a.label=payment_label and a.active and a.changed_at<(at_date+1)::timestamp
  and context->'paymentCodes' @> to_jsonb(array[a.code]) and not exists(select 1 from public.erp_payment_terms x where x.company_id=a.company_id and x.erp_company=a.erp_company and x.code=a.code and x.changed_at>a.changed_at and x.changed_at<(at_date+1)::timestamp);
 if coalesce((context->>'creditBlocked')::boolean,false) and t.is_credit is distinct from false then raise exception 'Cliente com venda a prazo bloqueada; a condição deve ser comprovadamente à vista.'; end if;
 return jsonb_build_object('companyCode',t.erp_company,'tableCode',(context->>'tableCode')::integer,'paymentCode',t.code,'paymentVersion',t.changed_at,'installments',t.installments,'paymentRules',t.rules);
end $$;
create function sul_private.erp_catalog_changed() returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
begin update public.companies set revision=revision+1 where id='432299';return null;end $$;
create trigger erp_table_revision after insert or update or delete on public.erp_price_tables for each statement execute function sul_private.erp_catalog_changed();
create trigger erp_price_revision after insert or update or delete on public.erp_prices for each statement execute function sul_private.erp_catalog_changed();
create trigger erp_payment_revision after insert or update or delete on public.erp_payment_terms for each statement execute function sul_private.erp_catalog_changed();
revoke all on function sul_private.erp_metadata_valid(text,jsonb),sul_private.erp_installments_valid(jsonb),sul_private.erp_visible(text,integer,integer,integer),sul_private.erp_catalog(),sul_private.erp_context(jsonb,jsonb),sul_private.erp_quantity_decimals(jsonb,text),sul_private.erp_price(text,jsonb,text,text,date),sul_private.erp_payment(text,jsonb,text,date),sul_private.erp_catalog_changed() from public,anon,authenticated;
grant execute on function sul_private.erp_visible(text,integer,integer,integer) to authenticated;

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
 select coalesce(jsonb_agg(o.data || jsonb_build_object('id',o.id,'number',o.number,'customerId',o.customer_id,
 'sellerId',o.seller_id,'seller',u.name,'type',o.type,'status',o.status,'date',o.date,'delivery',o.delivery,'agenda',o.agenda,
 'total',o.total,'freight',0,'source','persistido','integration','Não configurada','countsAsSale',o.type='Venda',
 'items',(select coalesce(jsonb_agg(jsonb_build_object('productId',i.product_id,'qty',i.qty,'price',i.price,'total',i.total,'unit',i.unit,'erp',i.erp) order by i.product_id),'[]')
   from public.order_items i where i.company_id=o.company_id and i.order_id=o.id)) order by o.number desc),'[]') into j
 from public.orders o join public.profiles u on u.id=o.seller_id where o.company_id=p.company_id and (mgr or o.seller_id=p.id);
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
 erp_ctx jsonb; erp_order jsonb; price_meta jsonb; price_result jsonb; erp_mode boolean; historical boolean; chosen_unit text; q_decimals integer;
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
  select * into ord from public.orders where company_id=p.company_id and id=rec->>'id';
  if found and not (mgr or ord.seller_id=p.id) then raise exception 'Pedido fora da sua carteira.' using errcode='42501'; end if;
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
 update public.companies set revision=revision+1 where id=p.company_id returning revision into rev;
 insert into public.workspace_ledger(company_id,request_id,actor_id,revision,request_state) values(p.company_id,p_request_id,p.id,rev,p_state);
 return public.get_workspace();
end $$;

-- Invalida snapshots anteriores à mudança de contrato; não cria dados comerciais.
update public.companies set revision=revision+1 where id='432299';
commit;
