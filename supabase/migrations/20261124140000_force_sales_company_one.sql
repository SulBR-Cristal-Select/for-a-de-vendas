-- Restrição solicitada para o Força de Vendas: apenas filial 1.
-- Preserva usuários, equipes, autoria e pedidos históricos.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
update sul_private.erp_actor_bindings set company_codes='{1}'::smallint[]
where company_id='432299' and company_codes is distinct from '{1}'::smallint[];
alter table sul_private.erp_actor_bindings add constraint erp_actor_company_one
check (company_id<>'432299' or company_codes='{1}'::smallint[]);
commit;
