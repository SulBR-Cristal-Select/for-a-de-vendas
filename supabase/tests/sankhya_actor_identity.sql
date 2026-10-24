-- Teste reversível da identidade. Exige migração8; não modifica perfis nem chama ERP.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
create temporary table online_test_results(name text primary key);
create function pg_temp.check_ok(label text,ok boolean) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'TESTE FALHOU: %',label; end if; insert into online_test_results values(label); end $$;
create function pg_temp.reject_save(label text,s jsonb,rev bigint,req uuid,code text,fragment text) returns void language plpgsql as $$
declare rejected boolean:=false; actual_code text; msg text;
begin
 begin perform public.save_workspace(s,rev,req);
 exception when others then rejected:=true; actual_code:=sqlstate; msg:=sqlerrm; end;
 perform pg_temp.check_ok(label,rejected and actual_code=code and position(fragment in msg)>0);
end $$;
create function pg_temp.reject_attest(label text,actor uuid,s jsonb,rev bigint,req uuid,v jsonb,fragment text) returns void language plpgsql as $$
declare rejected boolean:=false; msg text;
begin
 begin perform public.attest_erp_order_request(actor,s,rev,req,v);
 exception when others then rejected:=true; msg:=sqlerrm; end;
 perform pg_temp.check_ok(label,rejected and position(fragment in msg)>0);
end $$;
create function pg_temp.claim(actor uuid,role_name text default 'authenticated') returns void language plpgsql as $$
begin perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role',role_name)::text,true); end $$;
create function pg_temp.reject_preflight(label text,s jsonb,rev bigint,req uuid,fragment text) returns void language plpgsql as $$
declare rejected boolean:=false; msg text;
begin
 begin perform public.erp_order_preflight(s,rev,req);
 exception when others then rejected:=true; msg:=sqlerrm; end;
 perform pg_temp.check_ok(label,rejected and position(fragment in msg)>0);
end $$;
-- Fixtures mínimas: referência ERP transitória, DECQTD5, controle com espaço, tabela desconhecida null.
create function pg_temp.fixture(actor uuid,ident text default 'QA-ONLINE-PEDIDO') returns jsonb language sql as $$
 select jsonb_build_object('id',ident,'sellerId',actor,'customerId','sankhya:customer:990000021',
 'type','Venda','status','Concluído','date','2026-10-23','delivery','2026-10-24','agenda','FIXTURE AGENDA','payment','FIXTURE PAGAMENTO',
 'total',999999,'erp',jsonb_build_object('mode','online','sellerName','FRAUDE DO NAVEGADOR'),
 'items',jsonb_build_array(jsonb_build_object('productId','sankhya:product:990000022','qty',0.12345,'price',10.56,'unit','KG',
 'erp',jsonb_build_object('sellerCode',999,'tableCode',999))))
$$;
create function pg_temp.verified(o jsonb) returns jsonb language sql as $$
 select jsonb_build_object('id',o->>'id','requested',o,'erp',jsonb_build_object(
 'source','sankhya','mode','online','companyCode',1,'operationCode',1001,'operationVersion','FIXTURE-V1',
 'sellerCode',12,'sellerName','FIXTURE VENDEDOR ERP','customer',jsonb_build_object('id',o->>'customerId','partnerCode',990000021,'name','FIXTURE PARCEIRO','fantasy',null),
 'payment',jsonb_build_object('code',49997,'label','FIXTURE PAGAMENTO','version','FIXTURE-P1','isCredit',null,
 'installments','[{"sequence":1,"days":21,"percentage":33.33},{"sequence":2,"days":28,"percentage":33.33},{"sequence":3,"days":35,"percentage":33.33}]'::jsonb,
 'rules','{"hasFormula":true,"expression":"FIXTURE NAO EXECUTAR"}'::jsonb),
 'creditBlocked',false,'readAt',clock_timestamp(),'date',o->>'date','provider','native-context-api','tableCode',null,'tableVersion',null),
 'items',jsonb_build_array((o->'items'->0)-'erp'||jsonb_build_object('erp',jsonb_build_object(
 'source','sankhya','mode','online','product',jsonb_build_object('id',o#>>'{items,0,productId}','productCode',990000022,'name','FIXTURE PRODUTO'),
 'quantityDecimals',5,'multiple',null,'companyCode',1,'localCode',0,'control',' ','readAt',clock_timestamp(),'provider','native-context-api','tableCode',null,'tableVersion',null))))
$$;

-- Somente fixtures SQL reversíveis. Não autentica vendedores nem consulta o ERP.
do $identidade$
declare actor uuid; other_actor uuid; before_envelope jsonb; state jsonb; order_value jsonb; verified jsonb; result jsonb; changed jsonb;
 req uuid:=gen_random_uuid(); rev bigint; old_revision bigint;
begin
 select id into actor from public.profiles where company_id='432299' and active and role='administrador' order by id limit 1;
 select id into other_actor from public.profiles where company_id='432299' and active and role='administrador' and id<>actor order by id limit 1;
 if actor is null or other_actor is null then raise exception 'Pré-requisito: administradores existentes; não criar/ativar contas.'; end if;
 if exists(select 1 from sul_private.erp_actor_bindings where actor_id in (actor,other_actor)) then raise exception 'Não sobrescrever vínculo real do administrador.'; end if;
 if exists(select 1 from public.orders where company_id='432299' and id='QA-IDENTIDADE8-SQL') then raise exception 'Fixture já existente; não sobrescrever.'; end if;
 execute format('alter sequence %s restart with 8100000000000100',pg_get_serial_sequence('public.orders','number')::regclass);
 perform pg_temp.check_ok('rpc_identidade_sem_anon',not has_function_privilege('anon','public.erp_actor_binding()','EXECUTE'));
 perform pg_temp.check_ok('rpc_identidade_authenticated',has_function_privilege('authenticated','public.erp_actor_binding()','EXECUTE'));
 perform pg_temp.check_ok('vinculo_sem_select_direto',not has_table_privilege('authenticated','sul_private.erp_actor_bindings','SELECT'));
 perform pg_temp.check_ok('vinculo_sem_insert_direto',not has_table_privilege('authenticated','sul_private.erp_actor_bindings','INSERT'));
 perform pg_temp.check_ok('vinculo_sem_update_direto',not has_table_privilege('authenticated','sul_private.erp_actor_bindings','UPDATE'));
 perform pg_temp.check_ok('resolvedor_privado_sem_grant',not has_function_privilege('authenticated','sul_private.erp_actor_binding(uuid)','EXECUTE'));
 perform pg_temp.check_ok('atestar_sem_authenticated',not has_function_privilege('authenticated','public.attest_erp_order_request(uuid,jsonb,bigint,uuid,jsonb)','EXECUTE'));
 perform pg_temp.check_ok('atestar_service_role_preservado',has_function_privilege('service_role','public.attest_erp_order_request(uuid,jsonb,bigint,uuid,jsonb)','EXECUTE'));
 perform pg_temp.check_ok('preparados_dois_sem_ativacao',(select count(*)=2 from sul_private.erp_actor_bindings b join public.profiles p on p.id=b.actor_id where not p.active and p.role='vendedor'));
 perform pg_temp.check_ok('inativo_nao_resolve',sul_private.erp_actor_binding('7c85e6c0-768c-488b-8d7e-8fa5c65016b3') is null and sul_private.erp_actor_binding('82c846b0-17a1-4d1e-855d-3a1fdcb7226c') is null);
 perform pg_temp.claim(actor);
 before_envelope:=public.get_workspace(); state:=before_envelope->'state'; rev:=(before_envelope->>'revision')::bigint; old_revision:=rev;
 perform pg_temp.check_ok('admin_sem_vinculo_nao_vira_vendedor',public.erp_actor_binding() is null and state#>'{company,erpSeller}'='null'::jsonb);
 order_value:=pg_temp.fixture(actor,'QA-IDENTIDADE8-SQL');
 state:=jsonb_set(state,'{orders}',jsonb_build_array(order_value)||(state->'orders'));
 perform pg_temp.reject_preflight('sem_vinculo_nao_prepara',state,rev,req,'ERP_IDENTITY_REQUIRED');
 -- Pareamento SINTÉTICO restrito a esta transação, sem mudar perfil/papel/ativação.
 insert into sul_private.erp_actor_bindings values(actor,'432299',12,'{1}');
 perform pg_temp.check_ok('resolvedor_usa_uid',public.erp_actor_binding()->>'userId'=actor::text and public.erp_actor_binding()->'sellerCode'='12'::jsonb);
 perform pg_temp.check_ok('outra_pessoa_sem_vinculo',sul_private.erp_actor_binding(other_actor) is null);
 state:=jsonb_set(state,'{company,erpSeller}',public.erp_actor_binding());
 order_value:=jsonb_set(order_value,'{erp,sellerCode}','12'::jsonb);
 state:=jsonb_set(state,'{orders,0}',order_value); verified:=pg_temp.verified(order_value);
 perform pg_temp.check_ok('snapshot_erp_nao_replica_cadastros',jsonb_array_length(state->'customers')=jsonb_array_length(before_envelope#>'{state,customers}') and jsonb_array_length(state->'products')=jsonb_array_length(before_envelope#>'{state,products}'));
 changed:=jsonb_set(state,'{orders,0,erp,sellerCode}','5'::jsonb);
 perform pg_temp.reject_preflight('body_nao_escolhe_vendedor',changed,rev,gen_random_uuid(),'Vendedor ERP não corresponde');
 changed:=jsonb_set(state,'{orders,0,erp,companyCode}','4'::jsonb);
 perform pg_temp.reject_preflight('filial_fora_do_vinculo',changed,rev,gen_random_uuid(),'Filial ERP fora');
 changed:=jsonb_set(state,'{orders,0,sellerId}',to_jsonb(other_actor::text));
 perform pg_temp.reject_preflight('owner_auth_separado',changed,rev,gen_random_uuid(),'Proprietário Auth');
 result:=public.erp_order_preflight(state,rev,req);
 perform pg_temp.check_ok('preflight_exige_prova',result->'replay'='false'::jsonb and result->'proofReady'='false'::jsonb);
 perform pg_temp.reject_save('direto_sem_prova_negado',state,rev,req,'42501','Atestação privada');
 perform pg_temp.reject_attest('authenticated_nao_atesta',actor,state,rev,req,jsonb_build_array(verified),'service_role');
 perform pg_temp.claim(actor,'service_role');
 changed:=jsonb_set(verified,'{erp,sellerCode}','5'::jsonb);
 perform pg_temp.reject_attest('prova_vendedor_divergente',actor,state,rev,req,jsonb_build_array(changed),'Vendedor/filial da prova');
 changed:=jsonb_set(verified,'{erp,companyCode}','4'::jsonb);
 changed:=jsonb_set(changed,'{items,0,erp,companyCode}','4'::jsonb);
 perform pg_temp.reject_attest('prova_filial_divergente',actor,state,rev,req,jsonb_build_array(changed),'Vendedor/filial da prova');
 perform pg_temp.check_ok('private_scope_vendedor',not sul_private.erp_actor_allowed(actor,jsonb_set(verified->'erp','{sellerCode}','34'::jsonb)));
 perform pg_temp.check_ok('private_scope_filial',not sul_private.erp_actor_allowed(actor,jsonb_set(verified->'erp','{companyCode}','4'::jsonb)));
 result:=public.attest_erp_order_request(actor,state,rev,req,jsonb_build_array(verified));
 perform pg_temp.check_ok('atesta_proprio_vendedor',result->'ready'='true'::jsonb);
 -- Uma mudança de vínculo entre prova e save não pode autorizar snapshot antigo.
 update sul_private.erp_actor_bindings set seller_code=34 where actor_id=actor;
 perform pg_temp.claim(actor);
 perform pg_temp.reject_save('vinculo_alterado_apos_prova',state,rev,req,'42501','Vendedor ERP não corresponde');
 update sul_private.erp_actor_bindings set seller_code=12 where actor_id=actor;
 result:=public.save_workspace(state,rev,req);
 perform pg_temp.check_ok('salva_com_owner_auth',(select seller_id=actor and data#>'{erp,sellerCode}'='12'::jsonb and total=1.30 from public.orders where company_id='432299' and id='QA-IDENTIDADE8-SQL'));
 perform pg_temp.check_ok('preco_e_quantidade_preservados',(select qty=0.12345 and price=10.56 and unit='KG' and erp->>'provider'='native-context-api' from public.order_items where company_id='432299' and order_id='QA-IDENTIDADE8-SQL'));
 perform pg_temp.check_ok('consumo_atomico',(select data->'consumed'='true'::jsonb from public.workspace_records where company_id='432299' and kind='erp/order-proof' and id=req::text));
 perform pg_temp.check_ok('revisao_unica',(result->>'revision')::bigint=old_revision+1);
 perform pg_temp.check_ok('ledger_um_uuid',(select count(*)=1 from public.workspace_ledger where company_id='432299' and request_id=req));
 -- O ledger precede revalidação até se o vínculo foi modificado depois do sucesso.
 update sul_private.erp_actor_bindings set seller_code=34 where actor_id=actor;
 perform pg_temp.check_ok('replay_preflight_antes_vinculo',public.erp_order_preflight(state,rev,req)->'replay'='true'::jsonb);
 result:=public.save_workspace(state,rev,req);
 perform pg_temp.check_ok('replay_sem_revisao_nova',(result->>'revision')::bigint=old_revision+1);
 perform pg_temp.check_ok('replay_nao_troca_snapshot',(select data#>'{erp,sellerCode}'='12'::jsonb from public.orders where company_id='432299' and id='QA-IDENTIDADE8-SQL'));
 update sul_private.erp_actor_bindings set seller_code=12 where actor_id=actor;
 perform pg_temp.claim(other_actor);
 changed:=public.get_workspace()->'state';
 changed:=jsonb_set(changed,'{orders,0,notes}','"tentativa de edição alheia"'::jsonb);
 perform pg_temp.reject_preflight('nao_reaproveita_owner_alheio',changed,old_revision+1,gen_random_uuid(),'ERP_IDENTITY_REQUIRED');
 perform pg_temp.claim(actor);
 perform pg_temp.reject_preflight('conflito_PT409_preservado',state,rev,gen_random_uuid(),'REVISION_CONFLICT');
 perform pg_temp.check_ok('sem_ativar_preparados',(select count(*)=2 from public.profiles where id in ('7c85e6c0-768c-488b-8d7e-8fa5c65016b3','82c846b0-17a1-4d1e-855d-3a1fdcb7226c') and not active and role='vendedor'));
if (select count(*) from online_test_results)<35 then raise exception 'Suite identidade incompleta'; end if;
end $identidade$;
select jsonb_build_object('marcador','SUL_IDENTIDADE_8_TESTES_OK','assertivas',(select count(*) from online_test_results),'nomes',(select jsonb_agg(name order by name) from online_test_results),'loginRealVendedor',false,'envioERP',false) as testes_identidade8;
rollback;
