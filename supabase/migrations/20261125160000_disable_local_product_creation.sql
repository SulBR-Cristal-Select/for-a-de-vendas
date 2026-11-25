-- Desativa criação local de produtos somente na SulBR; preserva registros existentes.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';
create function sul_private.reject_sulbr_local_product_creation() returns trigger
language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  if new.company_id = '432299'
     and new.id not like 'sankhya:%'
     and not exists (select 1 from public.products p where p.company_id = new.company_id and p.id = new.id) then
    raise exception 'Criação local de produtos desativada. Utilize o catálogo ERP.' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger products_sulbr_no_local_creation before insert on public.products
for each row execute function sul_private.reject_sulbr_local_product_creation();
revoke all on function sul_private.reject_sulbr_local_product_creation() from public, anon, authenticated;
commit;
