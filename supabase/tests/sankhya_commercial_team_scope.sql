-- Teste SQL reversível9; não autentica titulares, não modifica perfis e não chama ERP.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
create temporary table qa9_results(name text primary key);
create temporary table qa9_context(actor uuid,team_actor uuid,outside_actor uuid,request_id uuid,request_state jsonb,request_revision bigint);
create function pg_temp.qa9_check(label text,ok boolean) returns void language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
begin if ok is distinct from true then raise exception 'TESTE9 FALHOU: %',label; end if; insert into qa9_results values(label); end $$;
create function pg_temp.qa9_reject(label text,s jsonb,rev bigint,req uuid,code text) returns void language plpgsql as $$
declare rejected boolean:=false; actual text;
begin
 begin perform public.save_workspace(s,rev,req); exception when others then rejected:=true; actual:=sqlstate; end;
 perform pg_temp.qa9_check(label,rejected and actual=code);
end $$;
-- Mock de membro SOMENTE nesta transação. O registro de perfil/Auth não é alterado.
create or replace function sul_private.member() returns public.profiles
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare p public.profiles; test_role text;
begin
 select pr.* into p from public.profiles pr where pr.id=auth.uid() and pr.company_id='432299' and pr.active;
 if not found then raise exception 'Membro ativo necessário.' using errcode='42501'; end if;
 test_role:=nullif(current_setting('qa9.member_role',true),'');
 if test_role is not null then
  if test_role not in ('administrador','gestor','vendedor') then raise exception 'Mock inválido.'; end if;
  p.role:=test_role;
 end if;
 return p;
end $$;
do $fixtures$
declare a uuid:='a46afcc5-14fd-4dd9-bd00-759e91b946ca'; t uuid; x uuid;
begin
 perform 1 from public.companies where id='432299' for update;
 if not exists(select 1 from public.profiles where id=a and company_id='432299' and active and role='administrador') then raise exception 'Administrador de referência indisponível.'; end if;
 select id into t from public.profiles where company_id='432299' and active and role='administrador' and id<>a order by id limit 1;
 select id into x from public.profiles where company_id='432299' and active and role='administrador' and id not in(a,t) order by id limit 1;
 if t is null or x is null or exists(select 1 from sul_private.erp_actor_bindings where actor_id in(a,t,x)) then raise exception 'Não sobrescrever vínculos reais.'; end if;
 if exists(select 1 from public.customers where company_id='432299' and id like 'QA9-%') or exists(select 1 from public.orders where company_id='432299' and id like 'QA9-%') or exists(select 1 from public.products where company_id='432299' and id like 'QA9-%') or exists(select 1 from public.workspace_records where company_id='432299' and id like 'QA9-%') then raise exception 'IDs de fixture já existem.'; end if;
 insert into qa9_context(actor,team_actor,outside_actor) values(a,t,x);
 insert into sul_private.erp_actor_bindings(actor_id,company_id,seller_code,company_codes,team_seller_codes) values
 (a,'432299',34,'{1,4}','{6}'),(t,'432299',6,'{1}','{}'),(x,'432299',12,'{4}','{}');
 insert into public.products(company_id,id,name,price,data) values('432299','QA9-PRODUTO','Produto SQL reversível',10,'{"unit":"UN"}');
 insert into public.customers(company_id,id,seller_id,name,fantasy) values
 ('432299','QA9-CLIENTE-PROPRIO',a,'Cliente próprio SQL','Cliente próprio SQL'),('432299','QA9-CLIENTE-EQUIPE',t,'Cliente equipe SQL','Cliente equipe SQL'),('432299','QA9-CLIENTE-FORA',x,'Cliente fora SQL','Cliente fora SQL');
 -- Contextos locais fictícios para testar as ACLs do catálogo legado.
 update public.customers set data=jsonb_build_object('erp',jsonb_build_object('source','sankhya','partnerCode',case id when 'QA9-CLIENTE-PROPRIO' then 990000081 when 'QA9-CLIENTE-EQUIPE' then 990000082 else 990000083 end,'sellerCode',case id when 'QA9-CLIENTE-PROPRIO' then 34 when 'QA9-CLIENTE-EQUIPE' then 6 else 12 end,'contexts',jsonb_build_array(jsonb_build_object('companyCode',case when id='QA9-CLIENTE-FORA' then 4 else 1 end,'tableCode',case id when 'QA9-CLIENTE-PROPRIO' then 99001 when 'QA9-CLIENTE-EQUIPE' then 99002 else 99003 end,'localCode',990000099,'control','QA9','paymentCodes',jsonb_build_array(case id when 'QA9-CLIENTE-PROPRIO' then 49991 when 'QA9-CLIENTE-EQUIPE' then 49992 else 49993 end),'creditBlocked',false)))) where company_id='432299' and id in('QA9-CLIENTE-PROPRIO','QA9-CLIENTE-EQUIPE','QA9-CLIENTE-FORA');
 insert into public.erp_price_tables(company_id,erp_company,table_code,version_code,valid_from,name,active) values
 ('432299',1,99001,990000081,'2026-10-24','FIXTURE QA9 PROPRIA',true),('432299',1,99002,990000082,'2026-10-24','FIXTURE QA9 EQUIPE',true),('432299',4,99003,990000083,'2026-10-24','FIXTURE QA9 FORA',true);
 insert into public.erp_prices(company_id,erp_company,version_code,product_id,unit,local_code,control,amount) select '432299',erp_company,version_code,'QA9-PRODUTO','UN',990000099,'QA9',10 from public.erp_price_tables where company_id='432299' and version_code in(990000081,990000082,990000083);
 insert into public.erp_payment_terms(company_id,erp_company,code,changed_at,label,active,is_credit,installments,rules) values
 ('432299',1,49991,'2026-10-24','FIXTURE QA9 PROPRIA',true,null,'[{"sequence":1,"days":0,"percentage":100}]','{"hasFormula":false}'),
 ('432299',1,49992,'2026-10-24','FIXTURE QA9 EQUIPE',true,null,'[{"sequence":1,"days":0,"percentage":100}]','{"hasFormula":false}'),
 ('432299',4,49993,'2026-10-24','FIXTURE QA9 FORA',true,null,'[{"sequence":1,"days":0,"percentage":100}]','{"hasFormula":false}');
 -- Numeração sintética explícita: não chama nem altera a sequência operacional.
 insert into public.orders(company_id,id,number,customer_id,seller_id,type,status,date,delivery,agenda,data) overriding system value values
 ('432299','QA9-PEDIDO-PROPRIO',810000000901,'QA9-CLIENTE-PROPRIO',a,'Venda','Orçamento','2026-10-24','2026-10-24','SQL REVERSIVEL','{"payment":"SQL"}'),
 ('432299','QA9-PEDIDO-EQUIPE',810000000902,'QA9-CLIENTE-EQUIPE',t,'Venda','Orçamento','2026-10-24','2026-10-24','SQL REVERSIVEL','{"payment":"SQL"}'),
 ('432299','QA9-PEDIDO-FORA',810000000903,'QA9-CLIENTE-FORA',x,'Venda','Orçamento','2026-10-24','2026-10-24','SQL REVERSIVEL','{"payment":"SQL"}'),
 ('432299','QA9-PEDIDO-ONLINE-EQUIPE',810000000904,'sankhya:customer:990000091',t,'Venda','Orçamento','2026-10-24','2026-10-24','SQL REVERSIVEL','{"erp":{"source":"sankhya","mode":"online","companyCode":1,"provider":"native-context-api","tableCode":null,"tableVersion":null,"readAt":"2026-10-24T00:00:00Z","operationCode":1001,"operationVersion":"FIXTURE-OPERACAO","sellerCode":6,"sellerName":"FIXTURE ERP6","customer":{"id":"sankhya:customer:990000091","partnerCode":990000091,"name":"FIXTURE CLIENTE SQL","fantasy":null},"creditBlocked":false,"date":"2026-10-24","payment":{"code":49996,"label":"FIXTURE CONDICAO SQL","version":"FIXTURE-CONDICAO","isCredit":null,"installments":[{"sequence":1,"days":0,"percentage":100}],"rules":{"hasFormula":false}}}}');
 insert into public.order_items(company_id,order_id,product_id,qty,price,unit) select '432299',id,'QA9-PRODUTO',1,10,'UN' from public.orders where company_id='432299' and id like 'QA9-%' and id<>'QA9-PEDIDO-ONLINE-EQUIPE';
 insert into public.order_items(company_id,order_id,product_id,qty,price,unit,erp) values('432299','QA9-PEDIDO-ONLINE-EQUIPE','sankhya:product:990000092',1,10,'UN','{"source":"sankhya","mode":"online","companyCode":1,"provider":"native-context-api","tableCode":null,"tableVersion":null,"readAt":"2026-10-24T00:00:00Z","product":{"id":"sankhya:product:990000092","productCode":990000092,"name":"FIXTURE PRODUTO SQL"},"quantityDecimals":5,"multiple":null,"localCode":990000099,"control":"QA9"}');
 insert into public.workspace_records(company_id,kind,id,owner_id,data) values
 ('432299','tasks','QA9-TAREFA-PROPRIA',a,'{"name":"Tarefa própria SQL","date":"2026-10-24"}'),('432299','tasks','QA9-TAREFA-EQUIPE',t,'{"name":"Tarefa equipe SQL","date":"2026-10-24"}'),('432299','tasks','QA9-TAREFA-FORA',x,'{"name":"Tarefa fora SQL","date":"2026-10-24"}');
 insert into public.sales_targets(company_id,seller_id,period,amount) values('432299',a,'2026-10-01',100),('432299',t,'2026-10-01',200),('432299',x,'2026-10-01',300);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',a,'role','authenticated')::text,true);
 perform set_config('qa9.member_role','gestor',true);
end $fixtures$;
do $checks$
declare c qa9_context; p public.profiles; e jsonb; b jsonb; s jsonb; changed jsonb; rev bigint; req uuid:=gen_random_uuid(); failed boolean; msg text;
begin
 select * into c from qa9_context; p:=sul_private.member(); b:=public.get_workspace(); s:=b->'state'; rev:=(b->>'revision')::bigint;
 perform pg_temp.qa9_check('mock_nao_altera_perfil',(select role='administrador' and active from public.profiles where id=c.actor));
 perform pg_temp.qa9_check('inativos_continuam_sem_vinculo',sul_private.erp_actor_binding('7c85e6c0-768c-488b-8d7e-8fa5c65016b3') is null and sul_private.erp_actor_binding('82c846b0-17a1-4d1e-855d-3a1fdcb7226c') is null);
 perform pg_temp.qa9_check('preparacao_nao_ativa',(select count(*)=2 from public.profiles where company_id='432299' and id in('7c85e6c0-768c-488b-8d7e-8fa5c65016b3','82c846b0-17a1-4d1e-855d-3a1fdcb7226c') and not active and role='vendedor'));
 perform pg_temp.qa9_check('equipe_preparada_nove',(select team_seller_codes='{6,7,35,36,37,38,39,40,42}'::integer[] from sul_private.erp_actor_bindings where actor_id='7c85e6c0-768c-488b-8d7e-8fa5c65016b3'));
 perform pg_temp.qa9_check('vinculos_sem_select_authenticated',not has_table_privilege('authenticated','sul_private.erp_actor_bindings','SELECT'));
 perform pg_temp.qa9_check('vinculos_sem_service_role',not has_table_privilege('service_role','sul_private.erp_actor_bindings','SELECT'));
 perform pg_temp.qa9_check('guard_privado',not has_function_privilege('authenticated','sul_private.scope_write_guard(jsonb,public.profiles)','EXECUTE'));
 perform pg_temp.qa9_check('owner_privado',not has_function_privilege('authenticated','sul_private.actor_owner_allowed(public.profiles,uuid)','EXECUTE'));
 perform pg_temp.qa9_check('prova_so_backend',not has_function_privilege('authenticated','public.attest_erp_order_request(uuid,jsonb,bigint,uuid,jsonb)','EXECUTE') and has_function_privilege('service_role','public.attest_erp_order_request(uuid,jsonb,bigint,uuid,jsonb)','EXECUTE'));
 perform pg_temp.qa9_check('equipe_valida',sul_private.valid_erp_team('{6,7}',34));
 perform pg_temp.qa9_check('equipe_sem_duplicata',not sul_private.valid_erp_team('{6,6}',34));
 perform pg_temp.qa9_check('equipe_sem_proprio_codigo',not sul_private.valid_erp_team('{34}',34));
 perform pg_temp.qa9_check('equipe_sem_zero_null',not sul_private.valid_erp_team('{0}',34) and not sul_private.valid_erp_team('{NULL}',34));
 perform pg_temp.qa9_check('gestor_proprio',sul_private.actor_owner_allowed(p,c.actor));
 perform pg_temp.qa9_check('gestor_equipe',sul_private.actor_owner_allowed(p,c.team_actor));
 perform pg_temp.qa9_check('gestor_sem_empresa_inteira',not sul_private.actor_owner_allowed(p,c.outside_actor));
 perform pg_temp.qa9_check('rpc_clientes_2',(select count(*)=2 from jsonb_array_elements(s->'customers') v where v->>'id' like 'QA9-%'));
 perform pg_temp.qa9_check('rpc_pedidos_3',(select count(*)=3 from jsonb_array_elements(s->'orders') v where v->>'id' like 'QA9-%'));
 perform pg_temp.qa9_check('rpc_tarefas_2',(select count(*)=2 from jsonb_array_elements(s->'tasks') v where v->>'id' like 'QA9-%'));
 perform pg_temp.qa9_check('rpc_usuarios_sem_fora',not exists(select 1 from jsonb_array_elements(s->'users') v where v->>'id'=c.outside_actor::text));
 perform pg_temp.qa9_check('rpc_meta_sem_fora',not(s#>'{targetPeriods,2026-10}' ? (select name from public.profiles where id=c.outside_actor)));
 perform pg_temp.qa9_check('rpc_catalogo_equipe_2',jsonb_array_length(s#>'{erpCommercial,priceTables}')=2 and jsonb_array_length(s#>'{erpCommercial,prices}')=2 and jsonb_array_length(s#>'{erpCommercial,paymentTerms}')=2);
 perform pg_temp.qa9_check('rpc_prova_nao_exposta',not exists(select 1 from jsonb_array_elements(s->'tasks') v where v->>'id' in(select id from public.workspace_records where kind='erp/order-proof')));
 e:='{"source":"sankhya","mode":"online","sellerCode":6,"companyCode":1}';
 perform pg_temp.qa9_check('online_equipe_leitura',sul_private.online_visible(c.team_actor,e));
 perform pg_temp.qa9_check('online_sem_filial_do_integrante',not sul_private.online_visible(c.team_actor,jsonb_set(e,'{companyCode}','4')));
 perform pg_temp.qa9_check('online_sem_codigo_falso',not sul_private.online_visible(c.team_actor,jsonb_set(e,'{sellerCode}','12')));
 perform pg_temp.qa9_check('owner_equipe_expresso',sul_private.owner(jsonb_build_object('sellerId',c.team_actor),p)=c.team_actor);
 failed:=false; begin perform sul_private.owner(jsonb_build_object('sellerId',c.outside_actor),p); exception when insufficient_privilege then failed:=true; end;
 perform pg_temp.qa9_check('owner_fora_recusado',failed);
 changed:=jsonb_set(s,'{customers}',(s->'customers')||jsonb_build_array(jsonb_build_object('id','QA9-CLIENTE-FORA','sellerId',c.actor,'name','Não tomar proprietário')));
 perform pg_temp.qa9_reject('nao_toma_cliente_oculto',changed,rev,gen_random_uuid(),'42501');
 changed:=jsonb_set(s,'{orders}',(s->'orders')||jsonb_build_array(jsonb_build_object('id','QA9-PEDIDO-FORA','sellerId',c.actor)));
 perform pg_temp.qa9_reject('nao_toma_pedido_oculto',changed,rev,gen_random_uuid(),'42501');
 changed:=jsonb_set(s,'{tasks}',(s->'tasks')||jsonb_build_array(jsonb_build_object('id','QA9-TAREFA-FORA','sellerId',c.actor)));
 perform pg_temp.qa9_reject('nao_toma_tarefa_oculta',changed,rev,gen_random_uuid(),'42501');
 changed:=jsonb_set(s,'{targetPeriods,2026-10}',(s#>'{targetPeriods,2026-10}')||jsonb_build_object((select name from public.profiles where id=c.outside_actor),400));
 perform pg_temp.qa9_reject('nao_altera_meta_fora',changed,rev,gen_random_uuid(),'42501');
 changed:=jsonb_set(s,'{orders}',(select jsonb_agg(case when v->>'id'='QA9-PEDIDO-EQUIPE' then v||jsonb_build_object('sellerId',c.actor) else v end) from jsonb_array_elements(s->'orders') v));
 perform pg_temp.qa9_reject('nao_transfere_pedido_manual_da_equipe',changed,rev,gen_random_uuid(),'42501');
 -- Um pedido de integrante continua somente leitura: vínculo pessoal não vira procuração comercial.
 changed:=jsonb_set(s,'{orders}',(select jsonb_agg(case when v->>'id'='QA9-PEDIDO-ONLINE-EQUIPE' then v||'{"notes":"Não editar outra pessoa"}'::jsonb else v end) from jsonb_array_elements(s->'orders') v));
 perform pg_temp.qa9_reject('online_equipe_nao_edita',changed,rev,gen_random_uuid(),'42501');
 -- No-op autorizado, revisão e ledger. É fixture SQL, não criação comercial/UI real.
 perform public.save_workspace(s,rev,req);
 perform pg_temp.qa9_check('no_op_revisao_unica',(select revision=rev+1 from public.companies where id='432299'));
 perform pg_temp.qa9_check('ledger_um_uuid',(select count(*)=1 from public.workspace_ledger where company_id='432299' and request_id=req));
 update qa9_context set request_id=req,request_state=s,request_revision=rev where actor=c.actor;
 update sul_private.erp_actor_bindings set team_seller_codes='{}' where actor_id=c.actor;
 perform pg_temp.qa9_check('replay_antes_da_revogacao',(public.save_workspace(s,rev,req)->>'revision')::bigint=rev+1);
 perform pg_temp.qa9_reject('uuid_novo_nao_contorna_revogacao',s,rev+1,gen_random_uuid(),'42501');
 perform pg_temp.qa9_reject('pt409_antes_guarda',s,rev,gen_random_uuid(),'PT409');
 update sul_private.erp_actor_bindings set team_seller_codes='{6}' where actor_id=c.actor;
end $checks$;
-- RLS exercida com o papel PostgreSQL authenticated; não é login de vendedor.
set local role authenticated;
select pg_temp.qa9_check('rls_clientes_2',(select count(*)=2 from public.customers where company_id='432299' and id like 'QA9-%'));
select pg_temp.qa9_check('rls_pedidos_3',(select count(*)=3 from public.orders where company_id='432299' and id like 'QA9-%'));
select pg_temp.qa9_check('rls_itens_3',(select count(*)=3 from public.order_items where company_id='432299' and order_id like 'QA9-%'));
select pg_temp.qa9_check('rls_tarefas_2',(select count(*)=2 from public.workspace_records where company_id='432299' and kind='tasks' and id like 'QA9-%'));
select pg_temp.qa9_check('rls_prova_privada',(select count(*)=0 from public.workspace_records where company_id='432299' and kind='erp/order-proof'));
select pg_temp.qa9_check('rls_metas_2',(select count(*)=2 from public.sales_targets where company_id='432299' and period='2026-10-01'));
select pg_temp.qa9_check('rls_catalogo_tabelas_2',(select count(*)=2 from public.erp_price_tables where company_id='432299' and version_code in(990000081,990000082,990000083)));
select pg_temp.qa9_check('rls_catalogo_precos_2',(select count(*)=2 from public.erp_prices where company_id='432299' and version_code in(990000081,990000082,990000083)));
select pg_temp.qa9_check('rls_catalogo_condicoes_2',(select count(*)=2 from public.erp_payment_terms where company_id='432299' and code in(49991,49992,49993)));
reset role;
select set_config('qa9.member_role','vendedor',true);
set local role authenticated;
select pg_temp.qa9_check('rls_vendedor_cliente_proprio',(select count(*)=1 from public.customers where company_id='432299' and id like 'QA9-%'));
select pg_temp.qa9_check('rls_vendedor_pedido_proprio',(select count(*)=1 from public.orders where company_id='432299' and id like 'QA9-%'));
select pg_temp.qa9_check('rls_vendedor_catalogo_proprio',(select count(*)=1 from public.erp_price_tables where company_id='432299' and version_code in(990000081,990000082,990000083)));
reset role;
select set_config('qa9.member_role','administrador',true);
set local role authenticated;
select pg_temp.qa9_check('rls_admin_todos_4',(select count(*)=4 from public.orders where company_id='432299' and id like 'QA9-%'));
reset role;
do $$ begin if (select count(*) from qa9_results)<45 then raise exception 'Cobertura SQL9 incompleta.'; end if; end $$;
select jsonb_build_object('marker','SUL_EQUIPE9_TESTES_OK','assertivas',(select count(*) from qa9_results),'loginReal',false,'erpChamado',false) as testes;
rollback;
