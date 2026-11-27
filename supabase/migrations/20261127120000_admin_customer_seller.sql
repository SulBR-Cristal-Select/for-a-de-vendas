-- Diretoria opera com vendedor do cliente revalidado pela Edge Function.
-- Não cria vínculo fictício, não transfere autoria e mantém a filial 1.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
create or replace function sul_private.erp_actor_allowed(actor uuid,e jsonb) returns boolean
language sql stable security definer set search_path=pg_catalog,public as $$
 select coalesce(p.active and p.company_id='432299' and p.role in ('administrador','gestor','vendedor')
 and e->>'mode'='online' and e->>'source'='sankhya'
 and case when p.role='administrador' then
   e->'companyCode'='1'::jsonb and jsonb_typeof(e->'sellerCode')='number'
   and (e->>'sellerCode') ~ '^[1-9][0-9]{0,9}$'
   and (e->>'sellerCode')::numeric <= 2147483647
 else
   (e->'sellerCode'=to_jsonb(b.seller_code) or (p.role='gestor' and to_jsonb(b.team_seller_codes) @> jsonb_build_array(e->'sellerCode')))
   and to_jsonb(b.company_codes) @> jsonb_build_array(e->'companyCode')
 end,false)
 from public.profiles p left join sul_private.erp_actor_bindings b on b.actor_id=p.id and b.company_id=p.company_id
 where p.id=actor
$$;
revoke all on function sul_private.erp_actor_allowed(uuid,jsonb) from public,anon,authenticated,service_role;
do $$
declare body text; old_clause text := 'binding:=sul_private.erp_actor_binding(p.id);';
begin
 select prosrc into body from pg_proc where oid='sul_private.online_required(jsonb,jsonb,public.profiles)'::regprocedure;
 if body is null or length(body)-length(replace(body,old_clause,''))<>length(old_clause) then
  raise exception 'Pré-validação incompatível; nenhuma alteração aplicada.';
 end if;
 body:=replace(body,old_clause,'binding:=case when p.role=''administrador'' then ''{"companyCodes":[1]}''::jsonb else sul_private.erp_actor_binding(p.id) end;');
 execute 'create or replace function sul_private.online_required(s jsonb,b jsonb,p public.profiles) returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as '||quote_literal(body);
end $$;
commit;
