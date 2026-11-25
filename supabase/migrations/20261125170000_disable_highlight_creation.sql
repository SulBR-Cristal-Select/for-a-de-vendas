-- Desativa novos destaques SulBR sem excluir registros existentes.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';
create function sul_private.reject_sulbr_highlight_creation() returns trigger
language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  if new.company_id = '432299' and new.kind = 'collections/destaques'
     and not exists (select 1 from public.workspace_records r where r.company_id = new.company_id and r.kind = new.kind and r.id = new.id) then
    raise exception 'Criação de destaques desativada.' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger workspace_records_sulbr_no_highlight_creation before insert on public.workspace_records
for each row execute function sul_private.reject_sulbr_highlight_creation();
revoke all on function sul_private.reject_sulbr_highlight_creation() from public, anon, authenticated;
commit;
