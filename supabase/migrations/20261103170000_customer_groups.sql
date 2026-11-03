-- Agrupamentos manuais nas estruturas existentes; sem novas tabelas.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
create function sul_private.customer_group_guard() returns trigger
language plpgsql set search_path=pg_catalog,public as $$
begin
 if ((tg_op<>'INSERT' and old.kind='collections/customer-groups') or (tg_op<>'DELETE' and new.kind='collections/customer-groups'))
 and current_setting('sul.customer_group_writer',true) is distinct from 'authorized' then
  raise exception 'Agrupamentos exigem gravação dedicada.' using errcode='42501';
 end if;
 return case when tg_op='DELETE' then old else new end;
end $$;
create trigger customer_group_guard before insert or update or delete on public.workspace_records
for each row execute function sul_private.customer_group_guard();
-- Códigos brutos não são catálogo público de membros. Somente o backend lê e filtra no ERP.
create policy customer_groups_private on public.workspace_records as restrictive for select to authenticated
using(kind<>'collections/customer-groups');
-- get_workspace é SECURITY DEFINER: retirar o catálogo bruto também do snapshot.
do $$
declare body text;
begin
 select prosrc into body from pg_proc where oid='public.get_workspace()'::regprocedure;
 if position('and kind like ''collections/%'' loop' in body)=0 then raise exception 'Snapshot incompatível; nenhuma alteração aplicada.'; end if;
 body:=replace(body,'and kind like ''collections/%'' loop','and kind like ''collections/%'' and kind<>''collections/customer-groups'' loop');
 execute 'create or replace function public.get_workspace() returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,public as '||quote_literal(body);
end $$;
create function public.customer_group_write(p_actor_id uuid,p_group jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare p public.profiles; current_record public.workspace_records; gid text; ids jsonb; version bigint; result jsonb;
begin
 select * into p from public.profiles where id=p_actor_id and company_id='432299' and active and role in ('administrador','gestor');
 if not found then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 if p_group is null or jsonb_typeof(p_group) is distinct from 'object' or nullif(btrim(p_group->>'name'),'') is null or length(btrim(p_group->>'name'))>120
 or p_group->>'id' is null or (p_group->>'id') !~* '^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$'
 or jsonb_typeof(p_group->'memberIds') is distinct from 'array' or jsonb_typeof(p_group->'active') is distinct from 'boolean'
 or p_group->>'version' is null or (p_group->>'version') !~ '^\d+$' then raise exception 'INVALID_REQUEST'; end if;
 gid:=p_group->>'id';ids:=p_group->'memberIds';version:=(p_group->>'version')::bigint;
 if jsonb_array_length(ids) not between 2 and 50 or exists(select 1 from jsonb_array_elements_text(ids) x where x is null or x !~ '^sankhya:customer:[1-9]\d{0,9}$' or substr(x,18)::bigint>2147483647)
 or (select count(distinct x) from jsonb_array_elements_text(ids) x)<>jsonb_array_length(ids) then raise exception 'INVALID_REQUEST'; end if;
 -- Trava serializa criação, transferência e desfazimento sem dupla associação.
 perform pg_advisory_xact_lock(432299,1700);
 select * into current_record from public.workspace_records where company_id=p.company_id and kind='collections/customer-groups' and id=gid for update;
 if (not found and version<>0) or (found and (current_record.data->>'version')::bigint<>version) then raise exception 'REVISION_CONFLICT' using errcode='PT409'; end if;
 if (p_group->>'active')::boolean and exists(select 1 from public.workspace_records r where r.company_id=p.company_id and r.kind='collections/customer-groups' and r.id<>gid and (r.data->>'active')::boolean and exists(select 1 from jsonb_array_elements_text(ids) x where r.data->'memberIds' ? x)) then raise exception 'Cliente já pertence a outro agrupamento; remova-o explicitamente antes de transferir.'; end if;
 result:=jsonb_build_object('name',btrim(p_group->>'name'),'memberIds',ids,'active',p_group->'active','version',version+1,'updatedBy',p.id,'updatedAt',clock_timestamp());
 perform set_config('sul.customer_group_writer','authorized',true);
 insert into public.workspace_records(company_id,kind,id,data) values(p.company_id,'collections/customer-groups',gid,result)
 on conflict(company_id,kind,id) do update set data=excluded.data;
 perform set_config('sul.customer_group_writer','',true);
 return jsonb_build_object('id',gid,'version',version+1,'saved',true);
end $$;
revoke all on function sul_private.customer_group_guard(),public.customer_group_write(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.customer_group_write(uuid,jsonb) to service_role;
commit;
