-- Conflito de domínio não deve usar serialization_failure (40001).
-- Preserva a definição vigente e muda somente o retorno HTTP do conflito.
do $migration$
declare definition text;
begin
 definition:=pg_get_functiondef('public.save_workspace(jsonb,bigint,uuid)'::regprocedure);
 if cardinality(string_to_array(definition,'errcode=''40001'''))<>2 or position('REVISION_CONFLICT' in definition)=0 then
  raise exception 'Contrato anterior de conflito nao encontrado de forma unica.';
 end if;
 execute replace(definition,'errcode=''40001''','errcode=''PT409''');
end;
$migration$;
