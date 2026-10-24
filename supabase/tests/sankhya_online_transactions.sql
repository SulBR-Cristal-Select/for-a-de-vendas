-- Suite reversível: executar somente no banco de testes com as sete migrações.
-- Nenhum acesso ERP, cadastro/ativação Auth ou instalação. Fixtures NÃO são dados do ERP.
-- RESTART de sequence é transacional: rollback também restaura a numeração original.
-- O executor deve interromper no primeiro erro. O marcador é emitido apenas após todas as asserções.
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

do $testes$
declare actor uuid; original_role text; b jsonb; s jsonb; o jsonb; v jsonb; req uuid:=gen_random_uuid(); rev bigint;
 r jsonb; altered jsonb; idx integer; count_before bigint; manual jsonb; rejected boolean; proof jsonb;
begin
 select id into actor from public.profiles where company_id='432299' and active and role='administrador'
 and exists(select 1 from auth.users where auth.users.id=profiles.id) order by id limit 1;
 if actor is null then raise exception 'PREREQUISITO: administrador Auth ativo existente; não criar ou ativar contas.'; end if;
 if exists(select 1 from public.orders where company_id='432299' and id like 'QA-ONLINE-%')
 or exists(select 1 from public.customers where company_id='432299' and id='QA-ONLINE-MANUAL-C')
 or exists(select 1 from public.products where company_id='432299' and id='QA-ONLINE-MANUAL-P') then raise exception 'IDs de fixture já existentes; não sobrescrever.'; end if;
 execute format('alter sequence %s restart with 8100000000000000',pg_get_serial_sequence('public.orders','number')::regclass);
 perform pg_temp.claim(actor);
 b:=public.get_workspace();s:=b->'state';rev:=(b->>'revision')::bigint;o:=pg_temp.fixture(actor)-'sellerId';
 s:=jsonb_set(s,'{orders}',jsonb_build_array(o)||(s->'orders'));v:=pg_temp.verified(o);
 r:=public.erp_order_preflight(s,rev,req);
 perform pg_temp.check_ok('preflight_exige_prova',r->'replay'='false'::jsonb and r->'proofReady'='false'::jsonb and r->'requiredOrders'=jsonb_build_array(o->>'id'));
 perform pg_temp.reject_save('navegador_nao_forja_prova',s,rev,req,'42501','Atestação privada');
 altered:=jsonb_set(s,'{orders,0,sellerId}',to_jsonb(gen_random_uuid()::text));
 perform pg_temp.reject_save('proprietario_auth_fraudado',altered,rev,req,'42501','Proprietário Auth');
 -- O grant e a guarda interna são independentes.
 perform pg_temp.check_ok('grant_atestacao_service_role',has_function_privilege('service_role','public.attest_erp_order_request(uuid,jsonb,bigint,uuid,jsonb)','EXECUTE'));
 perform pg_temp.check_ok('sem_grant_authenticated',not has_function_privilege('authenticated','public.attest_erp_order_request(uuid,jsonb,bigint,uuid,jsonb)','EXECUTE'));
 perform pg_temp.check_ok('sem_grant_anon',not has_function_privilege('anon','public.attest_erp_order_request(uuid,jsonb,bigint,uuid,jsonb)','EXECUTE'));
 perform pg_temp.check_ok('sem_escrita_direta_prova',not has_table_privilege('authenticated','public.workspace_records','INSERT') and not has_table_privilege('authenticated','public.workspace_records','UPDATE'));
 perform pg_temp.reject_attest('guarda_service_role',actor,s,rev,req,jsonb_build_array(v),'service_role');
 perform pg_temp.claim(actor,'service_role');
 perform pg_temp.reject_attest('autor_inexistente',gen_random_uuid(),s,rev,req,jsonb_build_array(v),'Autor Auth');
 perform pg_temp.reject_attest('autor_snapshot_fraudado',actor,jsonb_set(s,'{company,userId}',to_jsonb(gen_random_uuid()::text)),rev,req,jsonb_build_array(v),'Autor/empresa divergentes');
 altered:=jsonb_set(v,'{requested,total}','10');
 perform pg_temp.reject_attest('requested_integral',actor,s,rev,req,jsonb_build_array(altered),'Prova online inválida');
 altered:=jsonb_set(v,'{erp,tableCode}','68');
 perform pg_temp.reject_attest('tabela_nao_fabricada',actor,s,rev,req,jsonb_build_array(altered),'Prova online inválida');
 altered:=jsonb_set(v,'{erp,creditBlocked}','true');
 perform pg_temp.reject_attest('bloqueio_credito_sem_inferencia',actor,s,rev,req,jsonb_build_array(altered),'Prova online inválida');
 altered:=jsonb_set(v,'{items,0,erp,quantityDecimals}','3');
 perform pg_temp.reject_attest('decqtd3_nao_trunca_5',actor,s,rev,req,jsonb_build_array(altered),'Prova online inválida');
 -- Precisão maior deve ser recusada ANTES de qualquer cast numeric(18,5)/numeric(16,2).
 altered:=jsonb_set(o,'{items,0,qty}','0.123456');
 perform pg_temp.check_ok('rejeita_seis_decimais',not sul_private.online_verified_valid(pg_temp.verified(altered)));
 altered:=jsonb_set(o,'{items,0,price}','10.561');
 perform pg_temp.check_ok('rejeita_preco_fracionario_centavo',not sul_private.online_verified_valid(pg_temp.verified(altered)));
 altered:=jsonb_set(o,'{items,0,qty}','9999999999999.12345');
 perform pg_temp.check_ok('preserva_13_digitos_inteiros',sul_private.online_verified_valid(pg_temp.verified(altered)));
 altered:=jsonb_set(v,'{items,0,erp,multiple}','0.25');
 perform pg_temp.check_ok('multiplo_real_obrigatorio',not sul_private.online_verified_valid(altered));
 altered:=jsonb_set(v,'{items,0,erp,control}','" "');
 perform pg_temp.check_ok('controle_espaco_preservado',sul_private.online_verified_valid(altered));
 perform public.attest_erp_order_request(actor,s,rev,req,jsonb_build_array(v));
 proof:=(select data from public.workspace_records where company_id='432299' and kind='erp/order-proof' and id=req::text);
 perform pg_temp.check_ok('hash_sql_canonico',proof->>'hash'=encode(sha256(convert_to(s::text,'UTF8')),'hex'));
 perform pg_temp.check_ok('prazo_5_minutos',((proof->>'expiresAt')::timestamptz-(proof->>'createdAt')::timestamptz) between interval '5 minutes' and interval '5 minutes 1 second');
 perform public.attest_erp_order_request(actor,s,rev,req,jsonb_build_array(v));
 perform pg_temp.check_ok('mesma_prova_nao_estende_validade',proof=(select data from public.workspace_records where company_id='432299' and kind='erp/order-proof' and id=req::text));
 perform public.attest_erp_order_request(actor,s,rev,req,jsonb_build_array(jsonb_set(v,'{erp,sellerName}','"ALTERADO"')));
 perform pg_temp.check_ok('reenvio_preserva_prova_original_sem_sobrescrever',proof=(select data from public.workspace_records where company_id='432299' and kind='erp/order-proof' and id=req::text));
 perform pg_temp.claim(actor);
 r:=public.erp_order_preflight(s,rev,req);
 perform pg_temp.check_ok('prova_pronta_preflight',r->'proofReady'='true'::jsonb);
 altered:=s||'{"notes":"outro estado"}'::jsonb;
 perform pg_temp.reject_save('hash_diferente_bloqueado',altered,rev,req,'42501','Atestação privada');
 -- Expiração antes do consumo bloqueia; restaurar somente a fixture privada para prosseguir.
 update public.workspace_records set data=jsonb_set(data,'{expiresAt}',to_jsonb(clock_timestamp()-interval '1 second')) where company_id='432299' and kind='erp/order-proof' and id=req::text;
 perform pg_temp.reject_preflight('preflight_expirado_identificado_antes_do_erp',s,rev,req,'ERP_PROOF_EXPIRED');
 perform pg_temp.reject_save('prova_expirada_bloqueada',s,rev,req,'42501','Atestação privada');
 update public.workspace_records set data=proof where company_id='432299' and kind='erp/order-proof' and id=req::text;
 perform public.save_workspace(s,rev,req);
 perform pg_temp.check_ok('pedido_sem_catalogo_replicado',not exists(select 1 from public.customers where company_id='432299' and id=o->>'customerId') and not exists(select 1 from public.products where company_id='432299' and id=o#>>'{items,0,productId}'));
 perform pg_temp.check_ok('referencias_locais_condicionais',(select local_customer_id is null and seller_id=actor from public.orders where company_id='432299' and id=o->>'id') and (select local_product_id is null from public.order_items where company_id='432299' and order_id=o->>'id'));
 perform pg_temp.check_ok('decqtd5_persistido',(select qty=0.12345 and price=10.56 and total=1.30 and erp->>'control'=' ' from public.order_items where company_id='432299' and order_id=o->>'id'));
 perform pg_temp.check_ok('totais_numericos_servidor',(select total=1.30 from public.orders where company_id='432299' and id=o->>'id'));
 perform pg_temp.check_ok('metadados_browser_substituidos',(select data->'erp'=v->'erp' from public.orders where company_id='432299' and id=o->>'id'));
 perform pg_temp.check_ok('parcelas_99_99_sem_completar',(select data#>'{erp,payment,installments}'=v#>'{erp,payment,installments}' from public.orders where company_id='432299' and id=o->>'id'));
 perform pg_temp.check_ok('prova_consumida_atomica',(select data->'consumed'='true'::jsonb from public.workspace_records where company_id='432299' and kind='erp/order-proof' and id=req::text));
 update public.workspace_records set data=jsonb_set(data,'{expiresAt}',to_jsonb(clock_timestamp()-interval '1 second')) where company_id='432299' and kind='erp/order-proof' and id=req::text;
 r:=public.erp_order_preflight(s,rev,req);
 perform pg_temp.check_ok('replay_antes_validade_consumo_revisao',r->'replay'='true'::jsonb);
 perform public.save_workspace(s,rev,req);
 perform pg_temp.check_ok('ledger_idempotente',(select count(*)=1 from public.workspace_ledger where company_id='432299' and request_id=req));
 perform pg_temp.reject_save('uuid_outro_conteudo',s||'{"notes":"fraude"}'::jsonb,rev,req,'P0001','Identificador de gravação');
 perform pg_temp.reject_save('conflito_http_PT409',public.get_workspace()->'state',rev,gen_random_uuid(),'PT409','REVISION_CONFLICT');
 rejected:=false;
 begin perform public.erp_order_preflight(public.get_workspace()->'state',rev,gen_random_uuid()); exception when sqlstate 'PT409' then rejected:=true; end;
 perform pg_temp.check_ok('preflight_conflito_PT409',rejected);
 perform pg_temp.claim(actor,'service_role');
 r:=public.attest_erp_order_request(actor,s,rev,req,'null'::jsonb);
 perform pg_temp.check_ok('atestacao_replay_antes_envelope_erp',r->'replay'='true'::jsonb);
 perform pg_temp.claim(actor);
 b:=public.get_workspace();altered:=b->'state';
 select (ordinality-1)::integer into idx from jsonb_array_elements(altered->'orders') with ordinality x where x.value->>'id'=o->>'id';
 perform pg_temp.check_ok('nomes_vem_snapshot',altered#>>array['orders',idx::text,'customerName']='FIXTURE PARCEIRO' and altered#>>array['orders',idx::text,'seller']='FIXTURE VENDEDOR ERP' and altered#>>array['orders',idx::text,'items','0','name']='FIXTURE PRODUTO');
 altered:=jsonb_set(altered,array['orders',idx::text,'notes'],'"NOTA NAO COMERCIAL"');
 r:=public.erp_order_preflight(altered,(b->>'revision')::bigint,gen_random_uuid());
 perform pg_temp.check_ok('nota_nao_exige_reconsulta',r->'requiredOrders'='[]'::jsonb);
 perform public.save_workspace(altered,(b->>'revision')::bigint,gen_random_uuid());
 perform pg_temp.check_ok('historico_5_casas_preservado',(select qty=0.12345 from public.order_items where company_id='432299' and order_id=o->>'id'));
 b:=public.get_workspace();altered:=b->'state';
 altered:=jsonb_set(altered,array['orders',idx::text,'status'],'"Cancelado"');
 perform pg_temp.reject_save('mudanca_comercial_exige_prova',altered,(b->>'revision')::bigint,gen_random_uuid(),'42501','Atestação privada');
 altered:=jsonb_set(b->'state',array['orders',idx::text],(b#>array['state','orders',idx::text])-'erp'||'{"customerId":"QA-ONLINE-MANUAL-C","items":[]}'::jsonb);
 perform pg_temp.reject_save('online_nao_vira_manual',altered,(b->>'revision')::bigint,gen_random_uuid(),'P0001','convertido em manual');
 -- Nenhuma prova em get_workspace; RLS nega inclusive ao seu proprietário administrador.
 perform pg_temp.check_ok('prova_fora_workspace',position('verifiedOrders' in (public.get_workspace()::text))=0);
 execute 'set local role authenticated';
 if exists(select 1 from public.workspace_records where kind='erp/order-proof') then raise exception 'TESTE FALHOU: prova vazou por RLS'; end if;
 execute 'reset role';
 perform pg_temp.check_ok('prova_privada_RLS_administrador',true);
 -- Sem criar pessoas: rebaixamento da fixture de perfil existente é local e revertido na própria suite.
 update public.profiles set role='gestor' where id=actor;
 b:=public.get_workspace();
 perform pg_temp.check_ok('gestor_nao_recebe_online',not exists(select 1 from jsonb_array_elements(b#>'{state,orders}') x where x->>'id'=o->>'id'));
 execute 'set local role authenticated';
 if exists(select 1 from public.orders where id='QA-ONLINE-PEDIDO') or exists(select 1 from public.order_items where order_id='QA-ONLINE-PEDIDO') then raise exception 'TESTE FALHOU: snapshot online vazou por RLS'; end if;
 execute 'reset role';
 perform pg_temp.check_ok('gestor_sem_online_RLS_itens_pedido',true);
 update public.profiles set role='vendedor' where id=actor;
 b:=public.get_workspace();
 perform pg_temp.check_ok('vendedor_nao_recebe_online',not exists(select 1 from jsonb_array_elements(b#>'{state,orders}') x where x->>'id'=o->>'id'));
 execute 'set local role authenticated';
 if exists(select 1 from public.orders where id='QA-ONLINE-PEDIDO') or exists(select 1 from public.order_items where order_id='QA-ONLINE-PEDIDO') or exists(select 1 from public.workspace_records where kind='erp/order-proof') then raise exception 'TESTE FALHOU: vendedor recebeu snapshot/prova'; end if;
 execute 'reset role';
 perform pg_temp.check_ok('vendedor_sem_online_e_prova_RLS',true);
 update public.profiles set role='administrador' where id=actor;
 -- Fluxo manual permanece com FK de catálogo, preços e quantidades inteiras.
 insert into public.products(company_id,id,name,price,active,data) values('432299','QA-ONLINE-MANUAL-P','FIXTURE MANUAL',12.34,true,'{"unit":"PC"}');
 insert into public.customers(company_id,id,seller_id,name,fantasy,data) values('432299','QA-ONLINE-MANUAL-C',actor,'FIXTURE MANUAL','FIXTURE MANUAL','{}');
 b:=public.get_workspace();manual:=jsonb_build_object('id','QA-ONLINE-MANUAL-O','customerId','QA-ONLINE-MANUAL-C','sellerId',actor,'type','Venda','status','Concluído','date','2026-10-23','delivery','2026-10-24','agenda','FIXTURE','payment','FIXTURE MANUAL','items',jsonb_build_array(jsonb_build_object('productId','QA-ONLINE-MANUAL-P','qty',2,'price',12.34,'unit','PC')));
 altered:=jsonb_set(b->'state','{orders}',jsonb_build_array(manual)||(b#>'{state,orders}'));
 perform public.save_workspace(altered,(b->>'revision')::bigint,gen_random_uuid());
 perform pg_temp.check_ok('manual_preservado',(select total=24.68 and local_customer_id=customer_id from public.orders where company_id='432299' and id='QA-ONLINE-MANUAL-O') and (select local_product_id=product_id from public.order_items where company_id='432299' and order_id='QA-ONLINE-MANUAL-O'));
 b:=public.get_workspace();
 altered:=jsonb_set(manual,'{id}','"QA-ONLINE-MANUAL-FRACAO"');
 altered:=jsonb_set(altered,'{items,0,qty}','0.5');
 altered:=jsonb_set(b->'state','{orders}',jsonb_build_array(altered)||(b#>'{state,orders}'));
 perform pg_temp.reject_save('manual_continua_inteiro',altered,(b->>'revision')::bigint,gen_random_uuid(),'P0001','precisão');
 -- Mesmo snapshot source=sankhya nunca remove a necessidade de FK local.
 b:=public.get_workspace();manual:=manual||'{"id":"QA-ONLINE-FRAUDE-MANUAL","customerId":"CLIENTE-INEXISTENTE","erp":{"source":"sankhya"}}'::jsonb;
 altered:=jsonb_set(b->'state','{orders}',jsonb_build_array(manual)||(b#>'{state,orders}'));
 perform pg_temp.reject_save('source_so_nao_libera_fk',altered,(b->>'revision')::bigint,gen_random_uuid(),'P0001','Origem ERP');
 altered:=jsonb_set(b->'state','{products}',jsonb_build_array(jsonb_build_object('id','sankhya:product:990000099','name','FRAUDE','price',1))||(b#>'{state,products}'));
 perform pg_temp.reject_save('namespace_cadastro_reservado',altered,(b->>'revision')::bigint,gen_random_uuid(),'P0001','ID reservado ERP');
 perform pg_temp.check_ok('fonte_online_sem_catalogo_precos',(select data#>'{erp,tableCode}'='null'::jsonb and data#>'{erp,tableVersion}'='null'::jsonb and data#>>'{erp,provider}'='native-context-api' from public.orders where company_id='432299' and id=o->>'id'));
 if (select count(*) from online_test_results)<40 then raise exception 'Suite incompleta'; end if;
 raise notice 'SANKHYA_ONLINE_TRANSACOES_ASSERTIVAS_OK: % verificacoes; rollback obrigatório a seguir.',(select count(*) from online_test_results);
end $testes$;
select name as verificacao from online_test_results order by name;
-- O marcador é resultado transacional: o executor só deve reportar sucesso junto ao ROLLBACK abaixo.
select 'SANKHYA_ONLINE_TRANSACOES_OK_ROLLBACK_OBRIGATORIO' as marcador;
rollback;
