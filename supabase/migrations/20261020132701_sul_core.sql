-- SulBR: migração inicial. Não contém histórico, usuários ou credenciais.
-- Aplicar somente no projeto cxurczhmrvxcuvklyiht após revisão.
begin;
create schema if not exists sul_private;
revoke all on schema sul_private from public, anon, authenticated;

create table public.companies (
 id text primary key check (id = '432299'), name text not null,
 revision bigint not null default 0 check (revision >= 0)
);
insert into public.companies(id,name) values ('432299','SulBR');
create table public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 company_id text not null default '432299' references public.companies(id),
 name text not null check (length(btrim(name)) > 0),
 role text not null default 'vendedor' check (role in ('administrador','gestor','vendedor')),
 active boolean not null default false,
 unique(company_id,id), unique(company_id,name)
);
create table public.customers (
 company_id text not null references public.companies(id), id text not null check(length(id) between 1 and 120),
 seller_id uuid not null, name text not null check(length(btrim(name))>0),
 fantasy text not null check(length(btrim(fantasy))>0), document text,
 blocked boolean not null default false, data jsonb not null default '{}' check(jsonb_typeof(data)='object'),
 primary key(company_id,id), foreign key(company_id,seller_id) references public.profiles(company_id,id)
);
create index customers_document on public.customers(company_id,document) where document is not null;
create index customers_seller on public.customers(company_id,seller_id);
create table public.products (
 company_id text not null references public.companies(id), id text not null check(length(id) between 1 and 120),
 name text not null check(length(btrim(name))>0), price numeric(16,2) check(price>=0 and price<=99999999999999.99),
 active boolean not null default true, commission numeric(7,4) check(commission between 0 and 100),
 data jsonb not null default '{}' check(jsonb_typeof(data)='object'), primary key(company_id,id)
);
create table public.orders (
 company_id text not null references public.companies(id), id text not null check(length(id) between 1 and 120),
 number bigint generated always as identity, customer_id text not null, seller_id uuid not null,
 type text not null default 'Venda', status text not null check(status in ('Concluído','Orçamento','Cancelado')),
 date date not null, delivery date not null, agenda text not null check(length(btrim(agenda))>0),
 total numeric(18,2) not null default 0 check(total>=0 and total<=9999999999999999.99),
 data jsonb not null default '{}' check(jsonb_typeof(data)='object'),
 primary key(company_id,id), unique(company_id,number),
 foreign key(company_id,customer_id) references public.customers(company_id,id),
 foreign key(company_id,seller_id) references public.profiles(company_id,id)
);
create index orders_seller on public.orders(company_id,seller_id);
create table public.order_items (
 company_id text not null, order_id text not null, product_id text not null,
 qty numeric(16,3) not null check(qty>0), price numeric(16,2) not null check(price>0),
 total numeric(18,2) generated always as (round(qty*price,2)) stored,
 primary key(company_id,order_id,product_id),
 foreign key(company_id,order_id) references public.orders(company_id,id),
 foreign key(company_id,product_id) references public.products(company_id,id)
);
create table public.workspace_records (
 company_id text not null references public.companies(id), kind text not null,
 id text not null check(length(id) between 1 and 120), owner_id uuid, customer_id text,
 data jsonb not null check(jsonb_typeof(data)='object'),
 primary key(company_id,kind,id),
 check ((kind in ('opportunities','tasks','activities','routes') and owner_id is not null)
   or (kind in ('teams','carriers','policy') or kind like 'collections/%') and owner_id is null),
 foreign key(company_id,owner_id) references public.profiles(company_id,id),
 foreign key(company_id,customer_id) references public.customers(company_id,id)
);
create table public.workspace_settings (
 company_id text not null references public.companies(id), key text not null,
 value jsonb not null, primary key(company_id,key),
 check(key in ('config','stages','payments','reports','indicators','extraIndicators','panels','activePanel','priceTablesBase'))
);
create table public.sales_targets (
 company_id text not null references public.companies(id), seller_id uuid not null,
 period date not null check(extract(day from period)=1), amount numeric(18,2) not null check(amount>=0 and amount<=9999999999999999.99),
 primary key(company_id,seller_id,period), foreign key(company_id,seller_id) references public.profiles(company_id,id)
);
create table public.workspace_ledger (
 company_id text not null references public.companies(id), request_id uuid not null,
 actor_id uuid not null references public.profiles(id), revision bigint not null,
 request_state jsonb not null, created_at timestamptz not null default now(),
 primary key(company_id,request_id), unique(company_id,revision)
);
-- Apenas estruturas, nunca pedidos/clientes/produtos simulados.
insert into public.workspace_settings(company_id,key,value) values
 ('432299','config','{"recentDays":180,"oldDays":365,"checkinDistance":300,"stock":false,"portal":false,"pay":false,"duplicateDocument":true,"zeroPriceBlocked":true,"freightRequired":false}'),
 ('432299','stages','["Lead","Primeiro contato","Negociação","Fechamento"]'),
 ('432299','payments','["35 DIAS PIX","A PRAZO - 21/28 DIAS","A PRAZO - 21/28/35 DIAS","A PRAZO - 28 DIAS","A PRAZO - 28/35/42 DIAS","A PRAZO - 35 DIAS"]'),('432299','panels','["Painel Sul"]'),('432299','activePanel','"Painel Sul"'),
 ('432299','extraIndicators','[]'),('432299','indicators','{"Vendas":["Quantidade ou valor vendido de um produto ou categoria","Valor diário em vendas de produtos","Valor vendido em produtos por vendedor","Quantidade vendida em produtos por categoria","Evolução das vendas de produto ou categoria","Evolução de vendas (antigo)"],"Positivação":["Positivação específica","Positivação diária","Novos clientes por vendedor","Clientes ativos por vendedor","Positivação de categoria ou produto específico","Positivação de categoria ou produto diária","Positivação de categoria ou produto por vendedor","Positivação por categoria de produto","Positivação geral"],"Faturamento":["Faturamento específico","Faturamento diário","Faturamento total","Faturamento por vendedor","Evolução do faturamento"],"Atividades":["Volume de atividades","Atividades por vendedor","Atividades diárias","Cobertura da carteira"],"Outros":["Situação da carteira","Curva ABC de clientes","Conversão do e-commerce"]}'),('432299','priceTablesBase','{}'),
 ('432299','reports','[{"id":"resumo","name":"Resumo de vendas"},{"id":"vendas","name":"Vendas detalhadas"},{"id":"ranking","name":"Ranking de vendedor / Meta"},{"id":"meta-vendedor","name":"Meta por vendedor"},{"id":"nao-compraram","name":"Clientes sem compra no mês"},{"id":"gerencial","name":"Gerencial para representada"},{"id":"funil","name":"Funil de vendas"},{"id":"faturados","name":"Pedidos faturados"},{"id":"faturamento","name":"Faturamento"},{"id":"titulos","name":"Títulos"},{"id":"clientes","name":"Clientes"},{"id":"carteira","name":"Situação da carteira"},{"id":"carteira-vendedor","name":"Carteira por vendedor"},{"id":"positivacao","name":"Positivação de clientes"},{"id":"abc","name":"Curva ABC de clientes"},{"id":"visitas","name":"Visitas com check-in"},{"id":"tarefas","name":"Tarefas realizadas"},{"id":"comissoes","name":"Comissões"},{"id":"comissoes-pedido","name":"Comissões por pedido"},{"id":"produtos","name":"Produtos mais vendidos"},{"id":"mix","name":"Positivação de produtos por cliente"},{"id":"produtos-pedido","name":"Produtos por pedido"},{"id":"estoque","name":"Estoque"},{"id":"emails","name":"E-mails enviados"},{"id":"vendas-anterior","name":"Vendas — versão anterior"}]');
insert into public.workspace_records(company_id,kind,id,data) values
 ('432299','collections/pedidos/campos','data_entrega','{"name":"data_entrega","kind":"Data","required":true}'),
 ('432299','collections/pedidos/campos','agenda','{"name":"Tipo de Agenda","kind":"Lista","required":true}'),
 ('432299','collections/pedidos/tipos','venda','{"name":"Venda","kind":"Padrão"}');

create function sul_private.member() returns public.profiles
language plpgsql stable security definer set search_path = pg_catalog, public as $$
declare p public.profiles;
begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED: Entre na sua conta.' using errcode='28000'; end if;
 select * into p from public.profiles where id=auth.uid();
 if not found or not p.active then raise exception 'MEMBERSHIP_PENDING: Acesso pendente de ativação pelo administrador.' using errcode='42501'; end if;
 if p.company_id <> '432299' then raise exception 'Empresa não autorizada.' using errcode='42501'; end if;
 return p;
end $$;
create function sul_private.is_manager() returns boolean language sql stable security definer
set search_path = pg_catalog, public as $$
 select exists(select 1 from public.profiles where id=auth.uid() and company_id='432299' and active and role in ('administrador','gestor'))
$$;
create function sul_private.is_member() returns boolean language sql stable security definer
set search_path = pg_catalog, public as $$
 select exists(select 1 from public.profiles where id=auth.uid() and company_id='432299' and active)
$$;
create function sul_private.signup() returns trigger language plpgsql security definer
set search_path = pg_catalog, public as $$
begin
 -- Metadados enviados pelo cliente não definem papel, empresa, nome único ou ativação.
 insert into public.profiles(id,company_id,name,role,active)
 values(new.id,'432299',new.id::text,'vendedor',false);
 return new;
end $$;
create trigger sul_profile_after_signup after insert on auth.users for each row execute function sul_private.signup();
-- Cadastros Auth anteriores à instalação permanecem sem acesso até ativação explícita.
insert into public.profiles(id,company_id,name,role,active) select id,'432299',id::text,'vendedor',false from auth.users on conflict(id) do nothing;

alter table public.companies enable row level security;
alter table public.profiles enable row level security;
alter table public.customers enable row level security;
alter table public.products enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.workspace_records enable row level security;
alter table public.workspace_settings enable row level security;
alter table public.sales_targets enable row level security;
alter table public.workspace_ledger enable row level security;
-- Nenhum DML direto para authenticated: todas as mutações passam pela transação validada.
revoke all on public.companies,public.profiles,public.customers,public.products,public.orders,public.order_items,
 public.workspace_records,public.workspace_settings,public.sales_targets,public.workspace_ledger from anon,authenticated;
grant select on public.companies,public.profiles,public.customers,public.products,public.orders,public.order_items,
 public.workspace_records,public.workspace_settings,public.sales_targets to authenticated;
grant usage on schema sul_private to authenticated;
create policy companies_read on public.companies for select to authenticated using(id='432299' and sul_private.is_member());
create policy profiles_read on public.profiles for select to authenticated using(id=auth.uid() or (company_id='432299' and sul_private.is_manager()));
create policy customers_read on public.customers for select to authenticated using(company_id='432299' and sul_private.is_member() and (seller_id=auth.uid() or sul_private.is_manager()));
create policy products_read on public.products for select to authenticated using(company_id='432299' and sul_private.is_member());
create policy orders_read on public.orders for select to authenticated using(company_id='432299' and sul_private.is_member() and (seller_id=auth.uid() or sul_private.is_manager()));
create policy items_read on public.order_items for select to authenticated using(exists(select 1 from public.orders o where o.company_id=order_items.company_id and o.id=order_id));
create policy records_read on public.workspace_records for select to authenticated using(company_id='432299' and sul_private.is_member() and (owner_id=auth.uid() or sul_private.is_manager() or (owner_id is null and kind<>'policy')));
create policy settings_read on public.workspace_settings for select to authenticated using(company_id='432299' and sul_private.is_member());
create policy targets_read on public.sales_targets for select to authenticated using(company_id='432299' and sul_private.is_member() and (seller_id=auth.uid() or sul_private.is_manager()));
-- Ledger sem policy e sem grants: logs não podem ser vistos, escritos ou adulterados pelo cliente.

create function public.get_workspace() returns jsonb language plpgsql volatile security definer
set search_path = pg_catalog, public as $$
declare p public.profiles; s jsonb; k text; mgr boolean; j jsonb;
begin
 p:=sul_private.member(); mgr:=p.role in ('administrador','gestor');
 select coalesce(jsonb_object_agg(key,value),'{}') into s from public.workspace_settings where company_id=p.company_id;
 s:=s || jsonb_build_object('company',jsonb_build_object('id',p.company_id,'name',(select name from public.companies where id=p.company_id),
   'user',p.name,'userId',p.id,'role',case p.role when 'administrador' then 'Administrador' when 'gestor' then 'Gestor' else 'Vendedor' end,
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
 'items',(select coalesce(jsonb_agg(jsonb_build_object('productId',i.product_id,'qty',i.qty,'price',i.price,'total',i.total) order by i.product_id),'[]')
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
 return jsonb_build_object('state',s,'revision',(select revision from public.companies where id=p.company_id));
end $$;

-- Resolve somente perfis ativos da companhia; nome legado é traduzido, nunca usado como autoridade.
create function sul_private.owner(p_row jsonb,p_actor public.profiles) returns uuid
language plpgsql stable security definer set search_path = pg_catalog, public as $$
declare v uuid;
begin
 if nullif(p_row->>'sellerId','') is not null then
  select id into v from public.profiles where company_id=p_actor.company_id and active and id::text=p_row->>'sellerId';
 elsif nullif(p_row->>'seller','') is not null then
  select id into v from public.profiles where company_id=p_actor.company_id and active and name=p_row->>'seller';
 else v:=p_actor.id; end if;
 if v is null or (p_actor.role='vendedor' and v<>p_actor.id) then raise exception 'Vendedor ou carteira não autorizado.' using errcode='42501'; end if;
 return v;
end $$;

create function public.save_workspace(p_state jsonb,p_expected_revision bigint,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
 p public.profiles; mgr boolean; rev bigint; before_state jsonb; rec jsonb; old jsonb;
 k text; subkey text; ident text; owner uuid; cid text; cfg jsonb; doc text; ledger public.workspace_ledger;
 prod public.products; cust public.customers; ord public.orders; item jsonb; n numeric; unit_price numeric; running_total numeric;
 factor numeric; allowed boolean; target_month date; amount numeric; entry record; keyvalue record;
begin
 p:=sul_private.member(); mgr:=p.role in ('administrador','gestor');
 if p_request_id is null or p_expected_revision is null or jsonb_typeof(p_state) is distinct from 'object' then raise exception 'Gravação inválida: informe estado, revisão e identificador.'; end if;
 if octet_length(p_state::text)>10000000 then raise exception 'Estado excede o limite de gravação.'; end if;
 -- O lock da companhia serializa revisão, documento duplicado e idempotência.
 select revision into rev from public.companies where id=p.company_id for update;
 select * into ledger from public.workspace_ledger where company_id=p.company_id and request_id=p_request_id;
 if found then
  if ledger.actor_id<>p.id or ledger.request_state<>p_state then raise exception 'Identificador de gravação já utilizado em outra alteração.'; end if;
  return public.get_workspace();
 end if;
 if rev<>p_expected_revision then raise exception 'REVISION_CONFLICT: Recarregue os dados antes de salvar.' using errcode='40001'; end if;
 before_state:=public.get_workspace()->'state';
 if p_state->'company'->>'id' is distinct from p.company_id or
    p_state->'company'->>'role' is distinct from before_state->'company'->>'role' or
    p_state->'company'->>'user' is distinct from p.name or
    p_state->'company'->>'userId' is distinct from p.id::text then
  raise exception 'Identidade, empresa ou papel não podem ser informados pelo navegador.' using errcode='42501';
 end if;
 if p_state->'users' is distinct from before_state->'users' then raise exception 'Perfis e papéis exigem administração explícita; não podem ser alterados no snapshot.' using errcode='42501'; end if;
 -- Logs do cliente são descartados. Somente a transação abaixo gera auditoria real.
 foreach k in array array['titles','invoices','emails','chats'] loop
  if coalesce(p_state->k,'[]') <> before_state->k then raise exception 'Recurso % sem provedor configurado; nenhuma operação externa foi executada.',k; end if;
 end loop;
 if (p_state->'company' - array['name']) <> (before_state->'company' - array['name']) then
  raise exception 'Perfil, faturamento e integração não podem ser alterados pelo snapshot.' using errcode='42501';
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
  running_total:=0;
  -- O número e campos ERP não são controlados pelo navegador.
  insert into public.orders(company_id,id,customer_id,seller_id,type,status,date,delivery,agenda,data)
  values(p.company_id,rec->>'id',cust.id,owner,rec->>'type',coalesce(rec->>'status','Concluído'),coalesce(nullif(rec->>'date','')::date,(now() at time zone 'America/Sao_Paulo')::date),
   (rec->>'delivery')::date,rec->>'agenda',jsonb_build_object('payment',coalesce(rec->>'payment',''),'notes',coalesce(rec->>'notes',''),
   'internalNotes',coalesce(rec->>'internalNotes',''),'clientOrder',coalesce(rec->>'clientOrder',''),'cargoStatus',coalesce(old->>'cargoStatus','Pendente')))
  on conflict(company_id,id) do update set customer_id=excluded.customer_id,seller_id=excluded.seller_id,type=excluded.type,status=excluded.status,
   date=excluded.date,delivery=excluded.delivery,agenda=excluded.agenda,data=excluded.data;
  -- Substituição dos itens é explícita, limitada ao pedido autorizado, e revertida em qualquer falha.
  delete from public.order_items where company_id=p.company_id and order_id=rec->>'id';
  for item in select value from jsonb_array_elements(rec->'items') loop
   select * into prod from public.products where company_id=p.company_id and id=item->>'productId';
   if not found or not prod.active or prod.price is null or prod.price<=0 then raise exception 'Produto inativo ou sem preço permitido.'; end if;
   n:=(item->>'qty')::numeric; unit_price:=(item->>'price')::numeric;
   if n is null or n<=0 or n>100000000 or n<>trunc(n) or unit_price is null or unit_price<=0 or unit_price<>round(unit_price,2) then raise exception 'Quantidade ou preço inválido.'; end if;
   if prod.data->>'multiple' is not null and mod(n,(prod.data->>'multiple')::numeric)<>0 then raise exception 'Quantidade fora do múltiplo de venda do produto.'; end if;
   allowed:=unit_price=prod.price or exists(select 1 from jsonb_array_elements(coalesce(old->'items','[]')) previous where previous->>'productId'=item->>'productId' and (previous->>'price')::numeric=unit_price);
   -- Tabelas só autorizam valores previamente configurados por gestor e vinculados ao cliente.
   for subkey in select jsonb_array_elements_text(coalesce(cust.data->'priceTables','[]')) loop
    select coalesce(value->subkey->>(prod.data->>'category'),value->subkey->>'*')::numeric into factor
     from public.workspace_settings where company_id=p.company_id and key='priceTablesBase';
    if factor>0 and unit_price=round(prod.price*factor,2) then allowed:=true; end if;
   end loop;
   -- refItems são referências de cadastro, não autorização de desconto/preço.
   if not allowed then raise exception 'Preço não autorizado para o produto e cliente. Não são permitidos descontos ou Saldo Flex.'; end if;
   insert into public.order_items(company_id,order_id,product_id,qty,price) values(p.company_id,rec->>'id',prod.id,n,unit_price);
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
 -- Metas normalizadas por mês/vendedor. targets mantém compatibilidade com a interface legada.
 if p_state->'targets' is distinct from before_state->'targets' or p_state->'targetPeriods' is distinct from before_state->'targetPeriods' then
  if not mgr then raise exception 'Somente gestor ou administrador define metas.' using errcode='42501'; end if;
  if coalesce(p_state->>'targetPeriod',to_char((now() at time zone 'America/Sao_Paulo')::date,'YYYY-MM')) !~ '^\d{4}-(0[1-9]|1[0-2])$' then raise exception 'Período da meta inválido; use AAAA-MM.'; end if;
  for entry in select * from jsonb_each(coalesce(p_state->'targetPeriods','{}') || jsonb_build_object(coalesce(p_state->>'targetPeriod',to_char((now() at time zone 'America/Sao_Paulo')::date,'YYYY-MM')),p_state->'targets')) loop
   if entry.key !~ '^\d{4}-(0[1-9]|1[0-2])$' or jsonb_typeof(entry.value)<>'object' then raise exception 'Período da meta inválido.'; end if;
   target_month:=(entry.key||'-01')::date;
   for keyvalue in select * from jsonb_each_text(entry.value) loop
    owner:=sul_private.owner(jsonb_build_object('seller',keyvalue.key),p); amount:=keyvalue.value::numeric;
    if amount is null or amount<0 or amount<>round(amount,2) then raise exception 'Valor de meta inválido.'; end if;
    insert into public.sales_targets(company_id,seller_id,period,amount) values(p.company_id,owner,target_month,amount)
     on conflict(company_id,seller_id,period) do update set amount=excluded.amount;
   end loop;
  end loop;
 end if;
 update public.companies set revision=revision+1 where id=p.company_id returning revision into rev;
 insert into public.workspace_ledger(company_id,request_id,actor_id,revision,request_state) values(p.company_id,p_request_id,p.id,rev,p_state);
 return public.get_workspace();
end $$;

-- Postgres concede EXECUTE a PUBLIC por padrão: retirar de TODAS as funções novas.
revoke all on all functions in schema sul_private from public,anon,authenticated;
grant execute on function sul_private.is_member(),sul_private.is_manager() to authenticated;
revoke all on function public.get_workspace(),public.save_workspace(jsonb,bigint,uuid) from public,anon;
grant execute on function public.get_workspace(),public.save_workspace(jsonb,bigint,uuid) to authenticated;
commit;

-- ATIVAÇÃO INICIAL: SOMENTE pelo administrador do projeto após verificar o cadastro Auth.
-- Exemplo deliberadamente comentado, nunca executado automaticamente:
-- begin;
-- update public.profiles set role='administrador',active=true,name='NOME VERIFICADO'
-- where id='UUID_AUTH_VERIFICADO' and company_id='432299';
-- commit;
-- Validação transacional com sessão real, sem persistência de alterações:
-- begin;
-- set local role authenticated;
-- select set_config('request.jwt.claim.sub','UUID_ATIVO_VERIFICADO',true);
-- select public.get_workspace();
-- select public.save_workspace(public.get_workspace()->'state',
--   (public.get_workspace()->>'revision')::bigint,gen_random_uuid());
-- rollback;
