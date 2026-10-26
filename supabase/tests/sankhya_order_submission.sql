-- Ensaio SQL sintético. Todas as linhas são revertidas em subtransação, inclusive revisão/ledger/vínculo.
-- Não cria Auth, não ativa perfis, não chama ERP e não consome a sequência de pedidos.
-- Pode executar antes do COMMIT da migração: qualquer falha inesperada aborta toda a aplicação.
do $qa10$
declare a uuid; other_actor uuid; oid text:=gen_random_uuid()::text; oid2 text:=gen_random_uuid()::text;
 req uuid:=gen_random_uuid(); original_revision bigint; seq_before bigint; seq_called boolean;
 snapshot jsonb; item_snapshot jsonb; readback jsonb; fp text; r jsonb; next_r jsonb; result jsonb; b jsonb; s jsonb;
 refused boolean; checks integer:=0; baseline jsonb; after_hashes jsonb;
begin
 perform 1 from public.companies where id='432299' for update;
 select revision into original_revision from public.companies where id='432299';
 select last_value,is_called into seq_before,seq_called from public.orders_number_seq;
 select id into a from public.profiles p where company_id='432299' and active and role='administrador'
  and not exists(select 1 from sul_private.erp_actor_bindings b where b.actor_id=p.id) order by id limit 1;
 select id into other_actor from public.profiles where company_id='432299' and active and id<>a order by id limit 1;
 if a is null or other_actor is null then raise exception 'Fixture exige contas existentes sem alterar perfis.'; end if;
 select jsonb_build_object('profiles',encode(sha256(convert_to((select coalesce(jsonb_agg(to_jsonb(t) order by id),'[]')::text from public.profiles t where company_id='432299'),'UTF8')),'hex'),
 'bindings',encode(sha256(convert_to((select coalesce(jsonb_agg(to_jsonb(t) order by actor_id),'[]')::text from sul_private.erp_actor_bindings t where company_id='432299'),'UTF8')),'hex')) into baseline;
 begin
  assert has_function_privilege('authenticated','public.erp_submission_read(text)','EXECUTE'),'leitura_auth'; checks:=checks+1;
  assert not has_function_privilege('anon','public.erp_submission_read(text)','EXECUTE'),'anon_sem_leitura'; checks:=checks+1;
  assert not has_function_privilege('authenticated','public.erp_submission_write(uuid,text,text,text,text,jsonb)','EXECUTE'),'auth_sem_recibo'; checks:=checks+1;
  assert not has_function_privilege('anon','public.erp_submission_write(uuid,text,text,text,text,jsonb)','EXECUTE'),'anon_sem_recibo'; checks:=checks+1;
  assert has_function_privilege('service_role','public.erp_submission_write(uuid,text,text,text,text,jsonb)','EXECUTE'),'backend_recibo'; checks:=checks+1;
  assert not has_function_privilege('authenticated','sul_private.submission_order(text,text)','EXECUTE'),'helper_privado'; checks:=checks+1;
  -- O vínculo só existe nesta subtransação SQL. É invisível às sessões reais e será revertido abaixo.
  insert into sul_private.erp_actor_bindings(actor_id,company_id,seller_code,company_codes,team_seller_codes) values(a,'432299',990000010,'{1,4}','{}');
  snapshot:='{"source":"sankhya","mode":"online","companyCode":1,"provider":"native-context-api","tableCode":null,"tableVersion":null,"readAt":"2026-10-26T11:56:00Z","operationCode":1001,"operationVersion":"FIXTURE-OPERACAO","sellerCode":990000010,"sellerName":"FIXTURE SQL","customer":{"id":"sankhya:customer:990000091","partnerCode":990000091,"name":"FIXTURE CLIENTE SQL","fantasy":null},"creditBlocked":false,"date":"2026-10-26","payment":{"code":49996,"label":"FIXTURE CONDICAO SQL","version":"FIXTURE-CONDICAO","isCredit":null,"installments":[{"sequence":1,"days":0,"percentage":100}],"rules":{"hasFormula":false}}}';
  item_snapshot:='{"source":"sankhya","mode":"online","companyCode":1,"provider":"native-context-api","tableCode":null,"tableVersion":null,"readAt":"2026-10-26T11:56:00Z","product":{"id":"sankhya:product:990000092","productCode":990000092,"name":"FIXTURE PRODUTO SQL"},"quantityDecimals":5,"multiple":null,"localCode":990000099,"control":"QA10"}';
  if exists(select 1 from public.orders where company_id='432299' and number in(810000001010,810000001011)) then raise exception 'Numeração de fixture já ocupada.'; end if;
  insert into public.orders(company_id,id,number,customer_id,seller_id,type,status,date,delivery,agenda,total,data) overriding system value values
   ('432299',oid,810000001010,'sankhya:customer:990000091',a,'Venda','Orçamento','2026-10-26','2026-10-27','1 - IMEDIATO',10,jsonb_build_object('erp',snapshot,'payment','FIXTURE CONDICAO SQL','clientOrder','QA10-'||oid)),
   ('432299',oid2,810000001011,'sankhya:customer:990000091',a,'Venda','Orçamento','2026-10-26','2026-10-27','1 - IMEDIATO',10,jsonb_build_object('erp',snapshot,'payment','FIXTURE CONDICAO SQL','clientOrder','QA10-'||oid));
  insert into public.order_items(company_id,order_id,product_id,qty,price,unit,erp) values
   ('432299',oid,'sankhya:product:990000092',1,10,'UN',item_snapshot),('432299',oid2,'sankhya:product:990000092',1,10,'UN',item_snapshot);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',a,'role','authenticated')::text,true);
  readback:=public.erp_submission_read(oid);
  assert readback#>>'{order,id}'=oid and readback#>>'{order,items,0,qty}'='1.00000','snapshot_selecionado_textual'; checks:=checks+1;
  assert readback#>>'{order,receipt}' is null,'sem_recibo_inicial'; checks:=checks+1;
  -- CIF/FOB autorizado é preservado pelo salvamento local já existente.
  b:=public.get_workspace();s:=jsonb_set(b->'state','{orders}',(select jsonb_agg(case when v->>'id'=oid then v||'{"freightType":"C"}'::jsonb else v end) from jsonb_array_elements(b#>'{state,orders}') v));
  perform public.save_workspace(s,(b->>'revision')::bigint,gen_random_uuid());
  assert (select data->>'freightType'='C' from public.orders where company_id='432299' and id=oid),'frete_persistido_local'; checks:=checks+1;
  readback:=public.erp_submission_read(oid);fp:=readback->>'fingerprint';
  r:=jsonb_build_object('id',req,'hash',repeat('a',64),'approvedBy',a,'approvedAt',clock_timestamp(),'phase','inclusao_incerta','nunota',null,'status',null,'checkedAt',null,'errorCode',null);
  refused:=false;begin perform public.erp_submission_write(other_actor,oid,fp,'C',null,r);exception when insufficient_privilege then refused:=true;end;assert refused,'owner_diferente_recusado';checks:=checks+1;
  refused:=false;begin perform public.erp_submission_write(a,oid,repeat('b',64),'C',null,r);exception when sqlstate 'PT409' then refused:=true;end;assert refused,'revisao_do_pedido_guardada';checks:=checks+1;
  refused:=false;begin perform public.erp_submission_write(a,oid,fp,'C',null,r||'{"respostaERP":{}}'::jsonb);exception when others then refused:=true;end;assert refused,'recibo_nao_aceita_resposta_inteira';checks:=checks+1;
  result:=public.erp_submission_write(a,oid,fp,'C',null,r);assert result->>'acquired'='true','primeira_aquisicao';checks:=checks+1;
  result:=public.erp_submission_write(a,oid,fp,'C',null,r);assert result->>'acquired'='false','segunda_aquisicao_nao_envia';checks:=checks+1;
  assert (select data->'erpSubmission'=r and data->>'freightType'='C' from public.orders where company_id='432299' and id=oid),'recibo_persistido';checks:=checks+1;
  assert public.erp_submission_read(oid)->>'fingerprint'=fp,'recibo_nao_altera_hash_comercial';checks:=checks+1;
  refused:=false;begin perform public.erp_submission_write(a,oid2,public.erp_submission_read(oid2)->>'fingerprint','C',null,r||jsonb_build_object('id',gen_random_uuid()));exception when sqlstate 'PT409' then refused:=true;end;assert refused,'duas_linhas_mesmo_numero_externo_nao_enviam';checks:=checks+1;
  refused:=false;begin update public.orders set status='Cancelado' where company_id='432299' and id=oid;exception when sqlstate 'PT409' then refused:=true;end;assert refused,'cabecalho_congelado';checks:=checks+1;
  refused:=false;begin delete from public.orders where company_id='432299' and id=oid;exception when sqlstate 'PT409' then refused:=true;end;assert refused,'pedido_preservado';checks:=checks+1;
  refused:=false;begin update public.order_items set qty=2 where company_id='432299' and order_id=oid;exception when sqlstate 'PT409' then refused:=true;end;assert refused,'itens_congelados';checks:=checks+1;
  refused:=false;begin update public.orders set data=data||jsonb_build_object('erpSubmission',r) where company_id='432299' and id=oid2;exception when insufficient_privilege then refused:=true;end;assert refused,'recibo_nao_falsificavel_por_save';checks:=checks+1;
  refused:=false;begin perform public.erp_submission_write(a,oid,fp,'F','inclusao_incerta',r);exception when sqlstate 'PT409' then refused:=true;end;assert refused,'frete_aprovado_imutavel';checks:=checks+1;
  next_r:=r||'{"phase":"incluido","nunota":101}'::jsonb;
  result:=public.erp_submission_write(a,oid,fp,'C','inclusao_incerta',next_r);assert result->>'acquired'='true','nunota_preservado';checks:=checks+1;r:=next_r;
  result:=public.erp_submission_write(a,oid,fp,'C','inclusao_incerta',next_r);assert result->>'acquired'='false','CAS_de_fase';checks:=checks+1;
  refused:=false;begin perform public.erp_submission_write(a,oid,fp,'C','incluido',r||'{"nunota":102}'::jsonb);exception when others then refused:=true;end;assert refused,'nunota_nao_substituivel';checks:=checks+1;
  next_r:=r||jsonb_build_object('phase','confirmacao_incerta','status','A','checkedAt',clock_timestamp());
  result:=public.erp_submission_write(a,oid,fp,'C','incluido',next_r);assert result->>'acquired'='true','confirmacao_aquisicao';checks:=checks+1;r:=next_r;
  refused:=false;begin perform public.erp_submission_write(a,oid,fp,'C','confirmacao_incerta',r||'{"phase":"confirmado"}'::jsonb);exception when others then refused:=true;end;assert refused,'confirmacao_exige_L';checks:=checks+1;
  next_r:=r||'{"phase":"confirmacao_falhou","errorCode":"ERP_CONFIRMATION_REJECTED"}'::jsonb;
  result:=public.erp_submission_write(a,oid,fp,'C','confirmacao_incerta',next_r);assert result->>'acquired'='true','recusa_explicita';checks:=checks+1;r:=next_r;
  next_r:=r||'{"phase":"confirmacao_incerta","errorCode":null}'::jsonb;
  result:=public.erp_submission_write(a,oid,fp,'C','confirmacao_falhou',next_r);assert result->>'acquired'='true','retoma_mesmo_documento';checks:=checks+1;r:=next_r;
  next_r:=r||jsonb_build_object('phase','confirmado','status','L','checkedAt',clock_timestamp());
  result:=public.erp_submission_write(a,oid,fp,'C','confirmacao_incerta',next_r);assert result->>'acquired'='true','confirmado_com_leitura';checks:=checks+1;r:=next_r;
  b:=public.get_workspace();assert exists(select 1 from jsonb_array_elements(b#>'{state,orders}') o where o->>'id'=oid and o->'erpSubmission'=r),'reabertura_le_recibo';checks:=checks+1;
  perform public.save_workspace(b->'state',(b->>'revision')::bigint,gen_random_uuid());
  assert (public.erp_submission_read(oid))#>'{order,receipt}'=r,'save_nao_apaga_recibo';checks:=checks+1;
  assert (select last_value=seq_before and is_called=seq_called from public.orders_number_seq),'sequencia_nao_consumida';checks:=checks+1;
  raise exception 'Reverter exclusivamente as fixtures desta subtransação.' using errcode='QA010';
 exception when sqlstate 'QA010' then null;
 end;
 assert checks=33,'quantidade_de_assertivas';
 assert not exists(select 1 from public.orders where company_id='432299' and id in(oid,oid2)),'fixtures_revertidas';
 assert (select revision=original_revision from public.companies where id='432299'),'revisao_revertida';
 assert (select last_value=seq_before and is_called=seq_called from public.orders_number_seq),'sequencia_preservada';
 select jsonb_build_object('profiles',encode(sha256(convert_to((select coalesce(jsonb_agg(to_jsonb(t) order by id),'[]')::text from public.profiles t where company_id='432299'),'UTF8')),'hex'),
 'bindings',encode(sha256(convert_to((select coalesce(jsonb_agg(to_jsonb(t) order by actor_id),'[]')::text from sul_private.erp_actor_bindings t where company_id='432299'),'UTF8')),'hex')) into after_hashes;
 assert baseline=after_hashes,'perfis_e_vinculos_preservados';
 raise notice 'QA10: % verificações internas e5 de reversão aprovadas; nenhum pedido enviado.',checks;
end $qa10$;
