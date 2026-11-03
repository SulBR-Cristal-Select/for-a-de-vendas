-- Delegação comercial não transfere autoria nem autoriza edição de pedidos alheios.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
create or replace function sul_private.erp_actor_allowed(actor uuid,e jsonb) returns boolean
language sql stable security definer set search_path=pg_catalog,public as $$
 select coalesce(p.active and p.company_id='432299' and p.role in ('administrador','gestor','vendedor')
 and e->>'mode'='online' and e->>'source'='sankhya'
 and (e->'sellerCode'=to_jsonb(b.seller_code) or (p.role='gestor' and to_jsonb(b.team_seller_codes) @> jsonb_build_array(e->'sellerCode')))
 and to_jsonb(b.company_codes) @> jsonb_build_array(e->'companyCode'),false)
 from sul_private.erp_actor_bindings b join public.profiles p on p.id=b.actor_id where b.actor_id=actor and b.company_id=p.company_id
$$;
revoke all on function sul_private.erp_actor_allowed(uuid,jsonb) from public,anon,authenticated,service_role;
-- Compatibilidade verificada antes de substituir apenas a antiga restrição ao próprio CODVEND.
do $$
declare body text; old_clause text := 'if o#>''{erp,sellerCode}'' is not null and o#>''{erp,sellerCode}'' is distinct from binding->''sellerCode''';
begin
 select prosrc into body from pg_proc where oid='sul_private.online_required(jsonb,jsonb,public.profiles)'::regprocedure;
 if body is null or length(body)-length(replace(body,old_clause,''))<>length(old_clause) then raise exception 'Pré-validação comercial incompatível; nenhuma alteração aplicada.'; end if;
 body:=replace(body,old_clause,'if o#>''{erp,sellerCode}'' is not null and not sul_private.erp_actor_allowed(p.id,o->''erp'')');
 execute 'create or replace function sul_private.online_required(s jsonb,b jsonb,p public.profiles) returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as '||quote_literal(body);
end $$;
commit;
