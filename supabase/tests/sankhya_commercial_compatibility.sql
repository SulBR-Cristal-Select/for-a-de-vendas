-- Testes no banco do aplicativo, sem escrita no ERP ou criação/ativação de Auth.
-- Todas as alterações são revertidas, inclusive a numeração via RESTART transacional.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
do $$ begin
 if not exists(select 1 from public.profiles where id='a46afcc5-14fd-4dd9-bd00-759e91b946ca' and company_id='432299' and active and role='administrador') then raise exception 'Administrador real esperado indisponível; não criar ou ativar contas para executar o teste.'; end if;
 if exists(select 1 from public.customers where company_id='432299' and id like 'QA-COMPAT-%') or exists(select 1 from public.products where company_id='432299' and id like 'QA-COMPAT-%') then raise exception 'IDs de teste já existentes; investigar sem sobrescrever.'; end if;
 execute format('alter sequence %s restart with 8000000000000000',pg_get_serial_sequence('public.orders','number')::regclass);
end $$;
select set_config('request.jwt.claims','{"sub":"a46afcc5-14fd-4dd9-bd00-759e91b946ca","role":"authenticated"}',true);
create temporary table erp_test_results(name text primary key);
insert into public.products(company_id,id,name,price,active,data) values
 ('432299','QA-COMPAT-ERP-PRODUTO','FIXTURE TRANSACIONAL ERP',999,true,'{"unit":"PC","erp":{"source":"sankhya","productCode":99000001,"quantityDecimals":2,"units":{"PC":2,"UN":0}}}'),
 ('432299','QA-COMPAT-MANUAL-PRODUTO','FIXTURE TRANSACIONAL MANUAL',12.34,true,'{"unit":"PC"}');
insert into public.customers(company_id,id,seller_id,name,fantasy,data) values
 ('432299','QA-COMPAT-ERP-CLIENTE','a46afcc5-14fd-4dd9-bd00-759e91b946ca','FIXTURE ERP','FIXTURE ERP','{"erp":{"source":"sankhya","partnerCode":99000001,"sellerCode":12,"contexts":[{"companyCode":1,"tableCode":19999,"localCode":0,"control":" ","paymentCodes":[49998,49999],"creditBlocked":false}]}}'),
 ('432299','QA-COMPAT-MANUAL-CLIENTE','a46afcc5-14fd-4dd9-bd00-759e91b946ca','FIXTURE MANUAL','FIXTURE MANUAL','{}');
insert into public.erp_price_tables(company_id,erp_company,table_code,version_code,valid_from,name,active) values
 ('432299',1,19999,99000001,'2026-06-01','FIXTURE',true),('432299',1,19999,99000002,'2026-09-23','FIXTURE',true),('432299',1,19999,99000003,'2026-10-23','FIXTURE FUTURA',true);
insert into public.erp_prices(company_id,erp_company,version_code,product_id,unit,local_code,control,amount) values
 ('432299',1,99000001,'QA-COMPAT-ERP-PRODUTO','PC',0,' ',8.4),('432299',1,99000002,'QA-COMPAT-ERP-PRODUTO','PC',0,' ',10.56),('432299',1,99000003,'QA-COMPAT-ERP-PRODUTO','PC',0,' ',99);
insert into public.erp_payment_terms(company_id,erp_company,code,changed_at,label,active,is_credit,installments,rules) values
 ('432299',1,49999,'2026-06-10 11:47:42','FIXTURE A PRAZO',true,true,'[{"sequence":1,"days":21,"percentage":50},{"sequence":2,"days":28,"percentage":50}]','{"basePrazo":-1,"hasFormula":false}'),
 ('432299',1,49998,'2026-06-10 11:47:42','FIXTURE A VISTA',true,false,'[{"sequence":1,"days":0,"percentage":100}]','{"basePrazo":-1,"hasFormula":false}');
create function pg_temp.payload(price numeric,qty numeric,payment text default 'FIXTURE A PRAZO',unit_code text default 'PC') returns jsonb language sql as $$
 select jsonb_build_object('id',gen_random_uuid()::text,'customerId','QA-COMPAT-ERP-CLIENTE','sellerId','a46afcc5-14fd-4dd9-bd00-759e91b946ca','type','Venda','status','Concluído','date','2026-10-22','delivery','2026-10-22','agenda','1 - IMEDIATO','payment',payment,'total',999999,'items',jsonb_build_array(jsonb_build_object('productId','QA-COMPAT-ERP-PRODUTO','qty',qty,'price',price,'unit',unit_code)))
$$;
create function pg_temp.save_order(o jsonb) returns jsonb language plpgsql as $$
declare b jsonb:=public.get_workspace(); s jsonb;
begin s:=b->'state';s:=jsonb_set(s,'{orders}',jsonb_build_array(o)||(s->'orders'));return public.save_workspace(s,(b->>'revision')::bigint,gen_random_uuid());end $$;
create function pg_temp.reject_order(test_name text,o jsonb,expected text) returns void language plpgsql as $$
declare rejected boolean:=false;msg text;
begin
 begin perform pg_temp.save_order(o);exception when others then rejected:=true;msg:=sqlerrm;end;
 if not rejected or position(expected in coalesce(msg,''))=0 then raise exception 'Falha em %: esperado %, observado %',test_name,expected,coalesce(msg,'aceito indevidamente');end if;
 insert into erp_test_results values(test_name);
end $$;
create function pg_temp.reject_state(test_name text,s jsonb,expected text) returns void language plpgsql as $$
declare rejected boolean:=false;msg text;b jsonb:=public.get_workspace();
begin
 begin perform public.save_workspace(s,(b->>'revision')::bigint,gen_random_uuid());exception when others then rejected:=true;msg:=sqlerrm;end;
 if not rejected or position(expected in coalesce(msg,''))=0 then raise exception 'Falha em %: esperado %, observado %',test_name,expected,coalesce(msg,'aceito indevidamente');end if;
 insert into erp_test_results values(test_name);
end $$;
do $$
declare o jsonb;r jsonb;s jsonb;req_uuid uuid;rev bigint;idx integer;before_count bigint;
begin
 o:=pg_temp.payload(10.56,0.23)||'{"id":"QA-COMPAT-ERP-PEDIDO-VALIDO"}'::jsonb;
 r:=pg_temp.save_order(o);
 if (select total from public.orders where company_id='432299' and id=o->>'id')<>2.43 or (select qty from public.order_items where company_id='432299' and order_id=o->>'id')<>0.23 then raise exception 'Fração ou total divergente.';end if;
 insert into erp_test_results values('fracao_e_total_servidor');
 if (select data#>>'{erp,paymentCode}' from public.orders where company_id='432299' and id=o->>'id')<>'49999' or (select erp->>'versionCode' from public.order_items where company_id='432299' and order_id=o->>'id')<>'99000002' then raise exception 'Código/versão ERP não preservados.';end if;
 insert into erp_test_results values('origem_preco_pagamento_preservada');
 perform pg_temp.reject_order('base_global_nao_substitui_tabela',pg_temp.payload(999,1),'Preço exato');
 perform pg_temp.reject_order('preco_antigo_nao_copiado',pg_temp.payload(8.4,1),'Preço exato');
 perform pg_temp.reject_order('preco_futuro_nao_antecipado',pg_temp.payload(99,1),'Preço exato');
 perform pg_temp.reject_order('precisao_sem_arredondar',pg_temp.payload(10.56,0.231),'precisão');
 perform pg_temp.reject_order('quantidade_zero',pg_temp.payload(10.56,0),'Quantidade ou preço');
 perform pg_temp.reject_order('quantidade_negativa',pg_temp.payload(10.56,-1),'Quantidade ou preço');
 perform pg_temp.reject_order('preco_sem_centavos_exatos',pg_temp.payload(10.561,1),'Quantidade ou preço');
 perform pg_temp.reject_order('unidade_sem_linha_exata',pg_temp.payload(10.56,1,'FIXTURE A PRAZO','UN'),'Preço exato');
 perform pg_temp.reject_order('unidade_desconhecida',pg_temp.payload(10.56,1,'FIXTURE A PRAZO','KG'),'Unidade ou precisão');
 perform pg_temp.reject_order('pagamento_nao_vinculado',pg_temp.payload(10.56,1,'CONDIÇÃO NÃO VINCULADA'),'Condição de pagamento');
 perform pg_temp.reject_order('filial_nao_vinculada',pg_temp.payload(10.56,1)||'{"erp":{"companyCode":4}}'::jsonb,'Filial comercial');
 perform pg_temp.reject_order('empresa_3_fora_escopo',pg_temp.payload(10.56,1)||'{"erp":{"companyCode":3}}'::jsonb,'Filial comercial');
 s:=public.get_workspace()->'state';
 select (ordinality-1)::integer into idx from jsonb_array_elements(s->'products') with ordinality x where x.value->>'id'='QA-COMPAT-ERP-PRODUTO';
 perform pg_temp.reject_state('metadados_produto_imutaveis',jsonb_set(s,array['products',idx::text,'erp','quantityDecimals'],'3'),'canal administrativo');
 s:=public.get_workspace()->'state';
 select (ordinality-1)::integer into idx from jsonb_array_elements(s->'customers') with ordinality x where x.value->>'id'='QA-COMPAT-ERP-CLIENTE';
 perform pg_temp.reject_state('vinculo_cliente_imutavel',jsonb_set(s,array['customers',idx::text,'erp','contexts','0','tableCode'],'68'),'canal administrativo');
 s:=public.get_workspace()->'state';
 perform pg_temp.reject_state('catalogo_imutavel',jsonb_set(s,'{erpCommercial,priceTables,0,active}','false'),'Catálogo ERP');
 -- Reenvio com o mesmo UUID/revisão não duplica pedido nem evento de auditoria.
 r:=public.get_workspace();s:=r->'state';rev:=(r->>'revision')::bigint;req_uuid:=gen_random_uuid();
 o:=pg_temp.payload(10.56,1)||'{"id":"QA-COMPAT-ERP-IDEMPOTENTE"}'::jsonb;
 s:=jsonb_set(s,'{orders}',jsonb_build_array(o)||(s->'orders'));
 perform public.save_workspace(s,rev,req_uuid);perform public.save_workspace(s,rev,req_uuid);
 if (select count(*) from public.orders where company_id='432299' and id=o->>'id')<>1 or (select count(*) from public.workspace_ledger where company_id='432299' and workspace_ledger.request_id=req_uuid)<>1 then raise exception 'Reenvio duplicado.';end if;
 insert into erp_test_results values('idempotencia_preservada');
 -- Uma edição não comercial preserva o snapshot histórico exato.
 r:=public.get_workspace();s:=r->'state';
 select (ordinality-1)::integer into idx from jsonb_array_elements(s->'orders') with ordinality x where x.value->>'id'='QA-COMPAT-ERP-PEDIDO-VALIDO';
 s:=jsonb_set(s,array['orders',idx::text,'notes'],'"TESTE NOTA SEM REPRECIFICAÇÃO"');
 perform public.save_workspace(s,(r->>'revision')::bigint,gen_random_uuid());
 if (select total from public.orders where company_id='432299' and id='QA-COMPAT-ERP-PEDIDO-VALIDO')<>2.43 then raise exception 'Preço histórico alterado.';end if;
 insert into erp_test_results values('edicao_historica_nao_comercial');
 -- Múltiplo cadastrado continua obrigatório.
 update public.products set data=data||'{"multiple":0.25}'::jsonb where company_id='432299' and id='QA-COMPAT-ERP-PRODUTO';
 perform pg_temp.reject_order('multiplo_explicito',pg_temp.payload(10.56,0.23),'múltiplo');
 update public.products set data=data-'multiple' where company_id='432299' and id='QA-COMPAT-ERP-PRODUTO';
 -- Bloqueio de crédito não se converte em bloqueio de todas as vendas.
 update public.customers set data=jsonb_set(data,'{erp,contexts,0,creditBlocked}','true') where company_id='432299' and id='QA-COMPAT-ERP-CLIENTE';
 perform pg_temp.reject_order('credito_bloqueado',pg_temp.payload(10.56,1),'venda a prazo bloqueada');
 perform pg_temp.save_order(pg_temp.payload(10.56,1,'FIXTURE A VISTA'));
 insert into erp_test_results values('avista_nao_bloqueada');
 update public.customers set data=jsonb_set(data,'{erp,contexts,0,creditBlocked}','false') where company_id='432299' and id='QA-COMPAT-ERP-CLIENTE';
 -- Última versão inativa e empate não autorizam fallback para versão antiga.
 update public.erp_price_tables set active=false where company_id='432299' and erp_company=1 and version_code=99000002;
 perform pg_temp.reject_order('tabela_inativa_sem_fallback',pg_temp.payload(10.56,1),'Tabela de preço inativa');
 update public.erp_price_tables set active=true where company_id='432299' and erp_company=1 and version_code=99000002;
 insert into public.erp_price_tables values('432299',1,19999,99000004,'2026-09-23','FIXTURE EMPATE',true);
 perform pg_temp.reject_order('vigencia_ambigua',pg_temp.payload(10.56,1),'versão vigente única');
 update public.erp_price_tables set valid_from='2026-10-24' where company_id='432299' and erp_company=1 and version_code=99000004;
 insert into public.erp_payment_terms values('432299',1,49999,'2026-10-21','FIXTURE A PRAZO',false,true,'[{"sequence":1,"days":21,"percentage":100}]','{}');
 perform pg_temp.reject_order('pagamento_inativo_sem_fallback',pg_temp.payload(10.56,1),'Condição de pagamento');
 r:=public.get_workspace();s:=r->'state';
 select (ordinality-1)::integer into idx from jsonb_array_elements(s->'orders') with ordinality x where x.value->>'id'='QA-COMPAT-ERP-PEDIDO-VALIDO';
 s:=jsonb_set(s,array['orders',idx::text,'notes'],'"NOTA HISTÓRICA APÓS ALTERAÇÃO DO CATÁLOGO"');
 perform public.save_workspace(s,(r->>'revision')::bigint,gen_random_uuid());
 insert into erp_test_results values('historico_preservado_apos_catalogo_inativo');
 s:=public.get_workspace()->'state';
 select (ordinality-1)::integer into idx from jsonb_array_elements(s->'orders') with ordinality x where x.value->>'id'='QA-COMPAT-ERP-PEDIDO-VALIDO';
 perform pg_temp.reject_state('historico_nao_burla_alteracao_comercial',jsonb_set(s,array['orders',idx::text,'status'],'"Orçamento"'),'Condição de pagamento');
 -- Cadastros manuais mantêm o contrato anterior.
 o:=pg_temp.payload(12.34,2,'MANUAL')||'{"customerId":"QA-COMPAT-MANUAL-CLIENTE","items":[{"productId":"QA-COMPAT-MANUAL-PRODUTO","qty":2,"price":12.34}]}'::jsonb;
 perform pg_temp.save_order(o);insert into erp_test_results values('manual_inteiro_preservado');
 o:=jsonb_set(o,'{id}',to_jsonb(gen_random_uuid()::text));o:=jsonb_set(o,'{items,0,qty}','0.23');
 perform pg_temp.reject_order('manual_fracionado_continua_recusado',o,'precisão');
 -- Unicidade do código ERP e validação estrutural, sem identidade Auth fictícia.
 if sul_private.erp_metadata_valid('customer','{"erp":{"source":"sankhya","partnerCode":1,"sellerCode":1,"contexts":[{"companyCode":3}]}}') then raise exception 'Empresa 3 aceita.';end if;
 insert into erp_test_results values('metadados_escopo_validado');
 if not sul_private.erp_installments_valid('[{"sequence":1,"days":21,"percentage":33.33},{"sequence":2,"days":28,"percentage":33.33},{"sequence":3,"days":35,"percentage":33.33}]') then raise exception 'Percentuais observados foram alterados ou recusados.';end if;
 insert into erp_test_results values('parcelas_9999_preservadas');
 if has_table_privilege('authenticated','public.erp_prices','INSERT') or has_table_privilege('anon','public.erp_prices','SELECT') or has_function_privilege('authenticated','sul_private.erp_price(text,jsonb,text,text,date)','EXECUTE') then raise exception 'Privilégio administrativo exposto.';end if;
 insert into erp_test_results values('acls_catalogo_privado');
 if (select count(*) from erp_test_results)<>32 then raise exception 'Contagem de verificações inesperada: %',(select count(*) from erp_test_results);end if;
end $$;
-- A conta real de Raul continua INATIVA: somente testa a negativa, não a ativa.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"82c846b0-17a1-4d1e-855d-3a1fdcb7226c","role":"authenticated"}',true);
do $$ declare rejected boolean:=false;begin
 if exists(select 1 from public.erp_prices) or exists(select 1 from public.erp_payment_terms) then raise exception 'Perfil inativo leu catálogo ERP.';end if;
 begin perform public.get_workspace();exception when others then if position('MEMBERSHIP_PENDING' in sqlerrm)=0 then raise;end if;rejected:=true;end;
 if not rejected then raise exception 'Perfil inativo recebeu workspace.';end if;
end $$;
reset role;
rollback;
select 'SUL_ERP_32_VERIFICACOES_E_PERFIL_INATIVO_OK' as resultado,
 (select count(*) from public.products where company_id='432299' and id like 'QA-COMPAT-%') as produtos_teste_restantes,
 (select count(*) from public.customers where company_id='432299' and id like 'QA-COMPAT-%') as clientes_teste_restantes,
 (select count(*) from public.orders where company_id='432299' and id like 'QA-COMPAT-%') as pedidos_teste_restantes,
 (select last_value from public.orders_number_seq) as numeracao_apos_teste;
