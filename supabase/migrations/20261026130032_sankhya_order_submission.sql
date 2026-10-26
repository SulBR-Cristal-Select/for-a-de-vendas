-- SulBR: recibo mínimo de envio + CIF/FOB, aprovados em26/10/2026.
-- Sem tabela nova, réplica ERP ou cópia adicional do estado.
begin;
do $base$
begin
 perform 1 from public.companies where id='432299' for update;
 if (select revision from public.companies where id='432299') is distinct from 26
 or (select count(*) from supabase_migrations.schema_migrations where version='20261024222600')<>1
 or to_regprocedure('public.erp_submission_read(text)') is not null
 or (select encode(sha256(convert_to(prosrc,'UTF8')),'hex') from pg_proc where oid='public.get_workspace()'::regprocedure)<>'7dff610239445f5fe29970d4d326abfa957670d1af6d79876d9e5fa627a20360'
 or (select encode(sha256(convert_to(prosrc,'UTF8')),'hex') from pg_proc where oid='public.save_workspace(jsonb,bigint,uuid)'::regprocedure)<>'b8e24d16f30ee4c1f31baee65dfcc56cad37edf5db4fe3924a951100bcc2759f'
 or (select encode(sha256(convert_to(prosrc,'UTF8')),'hex') from pg_proc where oid='sul_private.save_online_order(public.profiles,jsonb,jsonb,jsonb)'::regprocedure)<>'714f87f43794d08797a7b041798171f73bf172c2fe6c583ca663f530d1a0bd9f'
 then raise exception 'Base mudou desde o preflight; não aplicar sobre outra revisão.'; end if;
end $base$;

create or replace function sul_private.save_online_order(p public.profiles,o jsonb,old jsonb,v jsonb) returns void
language plpgsql security definer set search_path=pg_catalog,public as $$
declare i jsonb; total_value numeric:=0; owner uuid; order_number bigint; e jsonb:=v->'erp'; receipt jsonb;
begin
 if p.role not in ('administrador','gestor','vendedor') or not p.active or p.company_id<>'432299' or not sul_private.erp_actor_allowed(p.id,e)
 then raise exception 'Pedido online exige vínculo ERP do usuário Auth ativo.' using errcode='42501'; end if;
 if not sul_private.online_verified_valid(v) or v->'requested' is distinct from o then raise exception 'Snapshot online verificado inválido.'; end if;
 select seller_id,number,data->'erpSubmission' into owner,order_number,receipt from public.orders where company_id=p.company_id and id=o->>'id';
 if o->'erpSubmission' is distinct from old->'erpSubmission' then raise exception 'Recibo ERP só pode ser alterado pelo servidor.' using errcode='42501'; end if;
 if receipt is not null then
  if (o-'source') is distinct from (old-'source') then raise exception 'Pedido com envio iniciado não pode ser alterado ou reutilizado.' using errcode='PT409'; end if;
  return;
 end if;
 if o ? 'freightType' and (jsonb_typeof(o->'freightType') is distinct from 'string' or o->>'freightType' not in ('C','F')) then raise exception 'Frete deve ser CIF ou FOB.'; end if;
 owner:=coalesce(owner,p.id);
 if owner<>p.id then raise exception 'Pedido online fora da propriedade Auth do usuário logado.' using errcode='42501'; end if;
 if (o ? 'sellerId') and o->>'sellerId' is distinct from owner::text then raise exception 'Proprietário Auth divergente.' using errcode='42501'; end if;
 if nullif(o->>'delivery','') is null or nullif(btrim(o->>'agenda'),'') is null then raise exception 'data_entrega e Tipo de Agenda são obrigatórios.'; end if;
 if not exists(select 1 from public.workspace_records where company_id=p.company_id and kind='collections/pedidos/tipos' and data->>'name'=o->>'type') then raise exception 'Tipo de pedido não cadastrado.'; end if;
 if coalesce((o->>'freight')::numeric,0)<>0 then raise exception 'Frete não está habilitado neste contrato.'; end if;
 -- Reusar o número existente evita nextval durante ON CONFLICT; novo pedido consome uma única vez.
 insert into public.orders(company_id,id,number,customer_id,seller_id,type,status,date,delivery,agenda,data) overriding system value
 values(p.company_id,o->>'id',coalesce(order_number,nextval('public.orders_number_seq'::regclass)),e#>>'{customer,id}',owner,o->>'type',coalesce(o->>'status','Concluído'),(e->>'date')::date,
 (o->>'delivery')::date,o->>'agenda',jsonb_build_object('payment',e#>>'{payment,label}',
 'notes',coalesce(o->>'notes',''),'internalNotes',coalesce(o->>'internalNotes',''),'clientOrder',coalesce(o->>'clientOrder',''),
 'cargoStatus',coalesce(old->>'cargoStatus','Pendente'),'erp',e) || case when o ? 'freightType' then jsonb_build_object('freightType',o->>'freightType') else '{}'::jsonb end)
 on conflict(company_id,id) do update set customer_id=excluded.customer_id,seller_id=excluded.seller_id,
 type=excluded.type,status=excluded.status,date=excluded.date,delivery=excluded.delivery,agenda=excluded.agenda,data=excluded.data;
 delete from public.order_items where company_id=p.company_id and order_id=o->>'id';
 for i in select value from jsonb_array_elements(v->'items') loop
  -- Numeric sem cast de escala antes da validação: nenhuma precisão é perdida silenciosamente.
  insert into public.order_items(company_id,order_id,product_id,qty,price,unit,erp)
  values(p.company_id,o->>'id',i->>'productId',(i->>'qty')::numeric,(i->>'price')::numeric,i->>'unit',i->'erp');
  total_value:=total_value+round((i->>'qty')::numeric*(i->>'price')::numeric,2);
 end loop;
 update public.orders set total=total_value where company_id=p.company_id and id=o->>'id';
end $$;

-- Uma fotografia transitória do pedido existente, não uma nova persistência.
create function sul_private.submission_order(company text, order_id text) returns jsonb
language sql stable security definer set search_path=pg_catalog,public as $$
 select jsonb_build_object('id',o.id,'number',o.number,'customerId',o.customer_id,'sellerId',o.seller_id,
 'type',o.type,'status',o.status,'date',o.date,'delivery',o.delivery,'agenda',o.agenda,'total',o.total::text,
 'clientOrder',o.data->>'clientOrder','freightType',o.data->>'freightType','erp',o.data->'erp',
 'receipt',o.data->'erpSubmission','items',(select coalesce(jsonb_agg(jsonb_build_object(
 'productId',i.product_id,'qty',i.qty::text,'price',i.price::text,'total',i.total::text,'unit',i.unit,'erp',i.erp)
 order by i.product_id),'[]'::jsonb) from public.order_items i where i.company_id=o.company_id and i.order_id=o.id))
 from public.orders o where o.company_id=company and o.id=order_id
$$;
create function sul_private.submission_fingerprint(o jsonb) returns text
language sql immutable set search_path=pg_catalog,public as $$
 select encode(sha256(convert_to((o-'receipt'-'freightType')::text,'UTF8')),'hex')
$$;
create function public.erp_submission_read(p_order_id text) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare p public.profiles; o jsonb;
begin
 p:=sul_private.member();
 if p.company_id<>'432299' or p_order_id is null or length(p_order_id)>120 then raise exception 'Pedido inválido.' using errcode='42501'; end if;
 o:=sul_private.submission_order(p.company_id,p_order_id);
 if o is null or o->>'sellerId'<>p.id::text or not sul_private.erp_actor_allowed(p.id,o->'erp') then raise exception 'Pedido fora do vínculo comercial do titular.' using errcode='42501'; end if;
 if o#>>'{erp,mode}' is distinct from 'online' or jsonb_array_length(o->'items') not between 1 and 50 then raise exception 'Pedido online incompatível.'; end if;
 return jsonb_build_object('order',o,'fingerprint',sul_private.submission_fingerprint(o));
end $$;

-- CAS no recibo e trava da mesma empresa usada por save_workspace. Não mantém transação aberta no ERP.
create function public.erp_submission_write(p_actor_id uuid,p_order_id text,p_fingerprint text,p_freight_type text,p_expected_phase text,p_receipt jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare p public.profiles; o jsonb; previous jsonb; prior_flag text; phase text:=p_receipt->>'phase';
begin
 select * into p from public.profiles where id=p_actor_id and company_id='432299' and active and role in ('administrador','gestor','vendedor');
 if not found or not exists(select 1 from auth.users where id=p_actor_id) then raise exception 'Autor Auth não ativo.' using errcode='42501'; end if;
 perform 1 from public.companies where id=p.company_id for update;
 o:=sul_private.submission_order(p.company_id,p_order_id);
 if o is null or o->>'sellerId'<>p.id::text or not sul_private.erp_actor_allowed(p.id,o->'erp') then raise exception 'Pedido fora do vínculo comercial do titular.' using errcode='42501'; end if;
 if o#>>'{erp,mode}' is distinct from 'online' or o->>'type'<>'Venda' or o->>'status'='Cancelado' or jsonb_array_length(o->'items') not between 1 and 50 then raise exception 'Pedido online incompatível.'; end if;
 if p_fingerprint is distinct from sul_private.submission_fingerprint(o) then raise exception 'Pedido mudou; confira novamente.' using errcode='PT409'; end if;
 if p_freight_type is null or p_freight_type not in ('C','F') then raise exception 'Frete inválido.'; end if;
 if jsonb_typeof(p_receipt) is distinct from 'object' or (select count(*) from jsonb_object_keys(p_receipt))<>9
 or not(p_receipt ?& array['id','hash','approvedBy','approvedAt','phase','nunota','status','checkedAt','errorCode'])
 or coalesce(p_receipt->>'id','')!~'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 or coalesce(p_receipt->>'hash','')!~'^[0-9a-f]{64}$' or p_receipt->>'approvedBy' is distinct from p.id::text
 or coalesce(p_receipt->>'approvedAt','')!~'^\d{4}-\d{2}-\d{2}T' or phase is null or phase not in ('inclusao_incerta','incluido','confirmacao_incerta','confirmacao_falhou','confirmado')
 or (p_receipt->>'nunota' is not null and (jsonb_typeof(p_receipt->'nunota')<>'number' or (p_receipt->>'nunota')!~'^[1-9][0-9]{0,9}$'))
 or (p_receipt->>'status' is not null and (p_receipt->>'status')!~'^[A-Z]$')
 or (p_receipt->>'errorCode' is not null and (p_receipt->>'errorCode')!~'^[A-Z][A-Z0-9_]{0,63}$')
 or (p_receipt->>'checkedAt' is not null and (p_receipt->>'checkedAt')!~'^\d{4}-\d{2}-\d{2}T') then raise exception 'Recibo inválido.'; end if;
 previous:=nullif(o->'receipt','null'::jsonb);
 if previous is null then
  if exists(select 1 from public.orders other where other.company_id=p.company_id and other.id<>p_order_id
   and other.customer_id=o->>'customerId' and other.data#>'{erp,companyCode}'=o#>'{erp,companyCode}'
   and other.data->>'clientOrder'=o->>'clientOrder' and other.data ? 'erpSubmission')
  then raise exception 'Outro pedido local já iniciou o envio deste número externo. Não duplicar.' using errcode='PT409'; end if;
  if p_expected_phase is not null or phase<>'inclusao_incerta' or p_receipt->>'nunota' is not null or p_receipt->>'status' is not null or p_receipt->>'checkedAt' is not null or p_receipt->>'errorCode' is not null
  or abs(extract(epoch from clock_timestamp()-(p_receipt->>'approvedAt')::timestamptz))>300 then raise exception 'Aprovação inicial inválida.'; end if;
 else
  if p_expected_phase is null then return jsonb_build_object('acquired',false,'receipt',previous); end if;
  if previous->>'id' is distinct from p_receipt->>'id' or previous->>'hash' is distinct from p_receipt->>'hash'
  or previous->>'approvedBy' is distinct from p_receipt->>'approvedBy' or previous->>'approvedAt' is distinct from p_receipt->>'approvedAt'
  or o->>'freightType' is distinct from p_freight_type then raise exception 'Aprovação não pode ser substituída.' using errcode='PT409'; end if;
  if previous->>'phase' is distinct from p_expected_phase then return jsonb_build_object('acquired',false,'receipt',previous); end if;
  if previous->>'nunota' is not null and previous->>'nunota' is distinct from p_receipt->>'nunota' then raise exception 'NUNOTA não pode ser substituído.'; end if;
  if not ((p_expected_phase='inclusao_incerta' and phase in ('inclusao_incerta','incluido','confirmado'))
   or (p_expected_phase='incluido' and phase in ('incluido','confirmacao_incerta','confirmado'))
   or (p_expected_phase='confirmacao_incerta' and phase in ('confirmacao_incerta','confirmacao_falhou','confirmado'))
   or (p_expected_phase='confirmacao_falhou' and phase in ('confirmacao_falhou','confirmacao_incerta','confirmado'))
   or (p_expected_phase='confirmado' and phase='confirmado')) then raise exception 'Transição de envio inválida.'; end if;
  if previous=p_receipt then return jsonb_build_object('acquired',false,'receipt',previous); end if;
 end if;
 if phase<>'inclusao_incerta' and p_receipt->>'nunota' is null then raise exception 'Fase exige NUNOTA.'; end if;
 if phase='confirmado' and (p_receipt->>'status' is distinct from 'L' or p_receipt->>'checkedAt' is null) then raise exception 'Confirmação exige leitura STATUSNOTA=L.'; end if;
 prior_flag:=current_setting('sul_private.submission_write',true);
 perform set_config('sul_private.submission_write','on',true);
 update public.orders set data=data||jsonb_build_object('freightType',p_freight_type,'erpSubmission',p_receipt) where company_id=p.company_id and id=p_order_id;
 perform set_config('sul_private.submission_write',coalesce(prior_flag,''),true);
 update public.companies set revision=revision+1 where id=p.company_id;
 return jsonb_build_object('acquired',true,'receipt',p_receipt);
end $$;

-- O salvamento geral não apaga recibos nem modifica documentos com envio iniciado.
create function sul_private.submission_guard() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 if TG_TABLE_NAME='orders' then
  if current_setting('sul_private.submission_write',true)='on' and TG_OP='UPDATE' then return NEW; end if;
  if TG_OP='INSERT' then
   if NEW.data ? 'erpSubmission' then raise exception 'Recibo reservado ao envio servidor.' using errcode='42501'; end if;
  elsif OLD.data ? 'erpSubmission' then raise exception 'Pedido com envio iniciado não pode ser alterado ou excluído.' using errcode='PT409';
  elsif TG_OP='UPDATE' and NEW.data ? 'erpSubmission' then raise exception 'Recibo reservado ao envio servidor.' using errcode='42501'; end if;
 else
  if exists(select 1 from public.orders o where o.company_id=coalesce(NEW.company_id,OLD.company_id) and o.id=coalesce(NEW.order_id,OLD.order_id) and o.data ? 'erpSubmission') then raise exception 'Itens de pedido com envio iniciado são imutáveis.' using errcode='PT409'; end if;
 end if;
 if TG_OP='DELETE' then return OLD; end if;
 return NEW;
end $$;
create trigger orders_submission_guard before insert or update or delete on public.orders for each row execute function sul_private.submission_guard();
create trigger items_submission_guard before insert or update or delete on public.order_items for each row execute function sul_private.submission_guard();
revoke all on function sul_private.submission_order(text,text),sul_private.submission_fingerprint(jsonb),sul_private.submission_guard() from public,anon,authenticated,service_role;
revoke all on function public.erp_submission_read(text),public.erp_submission_write(uuid,text,text,text,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.erp_submission_read(text) to authenticated;
grant execute on function public.erp_submission_write(uuid,text,text,text,text,jsonb) to service_role;
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

commit;
