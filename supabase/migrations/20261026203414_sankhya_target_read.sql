-- Leitura de metas existentes. Nenhuma tabela, coluna, meta, perfil ou vínculo criado/alterado.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
create function public.erp_sales_targets_read(p_month text,p_company_codes smallint[]) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare p public.profiles; binding jsonb; allowed smallint[]; selected smallint[]; sellers integer[]; result jsonb;
begin
 p:=sul_private.member();
 if p.company_id<>'432299' or not p.active or p.role not in ('administrador','gestor','vendedor') then raise exception 'FORBIDDEN'; end if;
 if p_month is null or p_month !~ '^\d{4}-(0[1-9]|1[0-2])$' or left(p_month,4)='0000' then raise exception 'INVALID_REQUEST'; end if;
 binding:=sul_private.erp_actor_binding(p.id);
 if p.role='administrador' then allowed:=array[1,4]::smallint[];
 else
  if binding is null then raise exception 'ERP_IDENTITY_REQUIRED'; end if;
  select array_agg(value::smallint order by value::smallint) into allowed from jsonb_array_elements_text(binding->'companyCodes');
  sellers:=array[(binding->>'sellerCode')::integer];
  if p.role='gestor' then select sellers||coalesce(array_agg(value::integer),'{}'::integer[]) into sellers from jsonb_array_elements_text(coalesce(binding->'teamSellerCodes','[]'::jsonb)); end if;
 end if;
 if p_company_codes is null or cardinality(p_company_codes) not between 1 and 2 or array_position(p_company_codes,null) is not null or not(p_company_codes<@allowed) then raise exception 'ERP_SCOPE_FORBIDDEN'; end if;
 select array_agg(distinct x order by x) into selected from unnest(p_company_codes) x;
 if cardinality(selected)<>cardinality(p_company_codes) then raise exception 'INVALID_REQUEST'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('sellerCode',x.seller_code,'amount',case when x.actors=1 and x.same_scope then x.amount::text else null end,'reason',case when x.actors<>1 then 'AMBIGUOUS_ACTIVE_BINDING' when not x.same_scope then 'TARGET_SCOPE_MISMATCH' when x.amount is null then 'TARGET_NOT_DEFINED' else null end) order by x.seller_code),'[]'::jsonb) into result
 from (select b.seller_code,count(*) actors,bool_and(b.company_codes@>selected and selected@>b.company_codes) same_scope,max(t.amount) amount
 from sul_private.erp_actor_bindings b join public.profiles u on u.id=b.actor_id and u.company_id=b.company_id
 join auth.users a on a.id=u.id
 left join public.sales_targets t on t.seller_id=u.id and t.company_id=u.company_id and t.period=to_date(p_month||'-01','YYYY-MM-DD')
 where b.company_id=p.company_id and u.active and u.role in ('administrador','gestor','vendedor') and b.company_codes&&selected and (p.role='administrador' or b.seller_code=any(sellers))
 group by b.seller_code) x;
 return jsonb_build_object('month',p_month,'companyCodes',to_jsonb(selected),'targets',result,'source','local-canonical-targets','identity','private-Auth-UUID-to-CODVEND','readOnly',true);
end $$;
revoke all on function public.erp_sales_targets_read(text,smallint[]) from public,anon,authenticated;
grant execute on function public.erp_sales_targets_read(text,smallint[]) to authenticated;
commit;
