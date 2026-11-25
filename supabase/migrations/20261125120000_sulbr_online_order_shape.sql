-- Defesa exclusiva da empresa SulBR. Não modifica contratos nem documentos de outras empresas.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
create function sul_private.sulbr_online_shape_valid(o jsonb) returns boolean
language plpgsql immutable set search_path=pg_catalog as $$
declare i jsonb; d date; n integer; unique_n integer; q numeric; p numeric;
begin
 if o#>>'{erp,source}' is distinct from 'sankhya' or o#>>'{erp,mode}' is distinct from 'online' or o#>'{erp,companyCode}' is distinct from '1'::jsonb then return false; end if;
 if jsonb_typeof(o->'items') is distinct from 'array' or jsonb_array_length(o->'items') not between 1 and 50 then return false; end if;
 if coalesce(o->>'date','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then return false; end if;
 d:=(o->>'date')::date;
 if to_char(d,'YYYY-MM-DD')<>o->>'date' then return false; end if;
 select count(*),count(distinct x->>'productId') into n,unique_n from jsonb_array_elements(o->'items') x;
 if n<>unique_n then return false; end if;
 for i in select value from jsonb_array_elements(o->'items') loop
  if coalesce(i->>'productId','') !~ '^sankhya:product:[1-9][0-9]*$' or jsonb_typeof(i->'qty') is distinct from 'number' or jsonb_typeof(i->'price') is distinct from 'number' or length(btrim(coalesce(i->>'unit',''))) not between 1 and 6 then return false; end if;
  q:=(i->>'qty')::numeric; p:=(i->>'price')::numeric;
  if q<=0 or q>100000000 or q<>round(q,5) or p<=0 or p>10000000000 or p<>round(p,2) then return false; end if;
 end loop;
 return true;
exception when others then return false;
end $$;
revoke all on function sul_private.sulbr_online_shape_valid(jsonb) from public,anon,authenticated,service_role;
-- Ponto de pré-validação já existente: não revalida pedidos antigos e inalterados.
do $$
declare body text; anchor text:='if old=o then continue; end if;';
begin
 select prosrc into body from pg_proc where oid='sul_private.online_required(jsonb,jsonb,public.profiles)'::regprocedure;
 if body is null or length(body)-length(replace(body,anchor,''))<>length(anchor) then raise exception 'Pré-validação incompatível; nenhuma alteração aplicada.'; end if;
 body:=replace(body,anchor,anchor||E'\n if p.company_id=''432299'' and not sul_private.sulbr_online_shape_valid(o) then raise exception ''Pedido online SulBR inválido: filial, data ou itens fora do contrato.''; end if;');
 execute 'create or replace function sul_private.online_required(s jsonb,b jsonb,p public.profiles) returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as '||quote_literal(body);
end $$;
-- As tabelas finais também recusam snapshots de filial4, independentemente do preflight.
alter table public.orders add constraint orders_sulbr_company_one check(company_id<>'432299' or data#>>'{erp,mode}' is distinct from 'online' or coalesce(data#>'{erp,companyCode}'='1'::jsonb,false));
alter table public.order_items add constraint items_sulbr_company_one check(company_id<>'432299' or erp->>'mode' is distinct from 'online' or coalesce(erp->'companyCode'='1'::jsonb,false));
commit;
