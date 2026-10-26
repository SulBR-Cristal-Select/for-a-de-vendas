# Sul · Força de Vendas

Aplicação SulBR baseada no bundle ajustado e no mapeamento funcional, com componentes oficiais `@g4ai/ds@0.9.0`, TanStack Start, React 19 e Supabase.

## Projetos

- Lovable: https://lovable.dev/projects/0b6c2dc7-eed7-4198-891f-16539f2e61f0
- Supabase: https://supabase.com/dashboard/project/cxurczhmrvxcuvklyiht
- Repositório sincronizado: https://github.com/SulBR-Cristal-Select/for-a-de-vendas

O repositório conectado permanece `for-a-de-vendas`; a renomeação para `forca-vendas` cabe ao proprietário. O repositório anterior permanece em `SulBR-Cristal-Select/forca-vendas-referencia`; não foi excluído.

## Desenvolvimento

```sh
bun install
bun run dev
bun run test
bun run build
```

A URL e a chave **publicável** do projeto estão configuradas no cliente. É possível sobrescrevê-las com `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`, sem trocar o projeto autorizado. Não colocar chaves de serviço ou credenciais privadas no código.

## Primeiro acesso

1. Abrir a aplicação, escolher **Criar acesso** e confirmar o e-mail.
2. Novos cadastros começam como vendedor **inativo**, sem acesso à carteira.
3. O administrador do projeto Supabase deve conferir a conta Auth e ativar explicitamente o primeiro administrador. Não há promoção automática do primeiro cadastro.
4. Configurar no Supabase Auth a URL publicada e os redirecionamentos autorizados antes de liberar e-mails de confirmação para usuários finais.
5. Depois do primeiro administrador, usar **Minha conta → Todos os usuários → Adicionar registro** para vincular uma conta já cadastrada, confirmada e ainda inativa, informando nome, e-mail e papel (Administrador, Gestor ou Vendedor). Somente administrador pode ativar esse vínculo; o ID é resolvido pelo Auth, não pelo formulário. Não é um serviço de convites por e-mail.

A senha é enviada pelo cliente oficial diretamente ao Supabase Auth; não há senha de demonstração nem conta fixa no repositório.

## Persistência e regras

As sete migrações anteriores são preservadas em `supabase/migrations`. A sétima acrescenta o fluxo online; a oitava, `20261024184200_sankhya_actor_identity.sql`, resolve o vendedor pelo usuário Auth, sem reaplicar arquivos anteriores. Treze tabelas públicas, perfis vinculados ao Auth, RLS e RPCs `get_workspace` / `save_workspace` mantêm os dados por empresa e vendedor. Gravações usam revisão e chave de idempotência. Itens e totais de pedidos são validados e calculados no servidor, mantendo preços históricos. A interface aguarda confirmação para navegar ou fechar gravações críticas.

Nenhuma carteira histórica ou simulação é carregada como operação real. Os 25 relatórios e 27 indicadores são catálogos estruturais; os resultados dependem dos registros persistidos. Agenda e Portal não aparecem na lateral. O menu e o layout do bundle são preservados, sem descontos, promoções ou Saldo Flex.

## Verificações realizadas

- TypeScript e build de produção.
- 1.167 testes locais em 41 arquivos; o bloco de envio acrescenta78 casos de contrato, transporte, retomada, concorrência e conferência com os componentes reais do DS.
- 32 verificações SQL da compatibilidade ERP, mais recusa de perfil inativo, em transação revertida: preço exato/versão/unidade/vigência, filial e vínculo, precisão, parcelas, histórico não comercial, adulteração, idempotência, concorrência e regressão manual. A numeração real permaneceu em 8, sem fixtures restantes.
- Vinte e seis verificações transacionais no Supabase: total de R$ 9.008,80 para 974 unidades em três itens, reenvio idempotente, conflito de revisão, duplicidade de documento, rollback, preço histórico, restrições de papel, isolamento de carteira, metas mensais e edição da própria conta/empresa.
- Seis verificações adicionais do papel gestor no banco.
- Trinta verificações de vínculo Auth (três ativações de destino e 27 recusas), incluindo reenvio idempotente, identidade real, ausência de alterações parciais e restauração das contagens originais.
- Formulário de usuários verificado isoladamente em 390 e 1440 px: campos obrigatórios, e-mail semântico, opção Gestor, payload canônico e preservação do formulário em falha.
- Dados fictícios desses testes foram revertidos. Testes transacionais e de componente não substituem o teste interativo de login e operação com a conta ativada.

## Envio explícito ao Sankhya

- **Salvar pedido** continua sendo salvamento local. No detalhe do pedido online pertencente ao titular, **Enviar ao Sankhya** abre a conferência; escolher CIF/FOB não envia nada. Só **Aprovar e enviar** autoriza a inclusão e confirmação daquela versão, sem faturar.
- O backend reconstrói o canônico1.1 a partir do pedido salvo, verifica Auth/owner/vendedor/filial, preço nativo, Sugestão Saída, agenda e natureza. Hash e payload foram comparados com o validador original da skill Pedidos2.0.2, incluindo números fracionados/exponenciais. Os cálculos continuam exatos; números JSON só são aceitos com retorno ao mesmo decimal.
- Persistência adicional fechada: `orders.data.freightType` (`C`/`F`) e `erpSubmission` com `id`, `hash`, `approvedBy`, `approvedAt`, `phase`, `nunota`, `status`, `checkedAt`, `errorCode`. Sem tabela nova, réplica de cadastro, resposta integral da API ou cópia geral adicional do estado.
- A migração `20261026130032_sankhya_order_submission.sql` preserva o número ao editar, restringe o escritor de recibos ao backend e impede alteração/exclusão do pedido após iniciar o envio. Aquisição por comparação de fase, sob a trava da empresa, evita duas inclusões pelo aplicativo — inclusive em registros locais diferentes com mesma filial/cliente/número externo.
- Uma inclusão com resultado incerto é consultada, não repetida. NUNOTA retornado é preservado. Confirmação recusada explicitamente pode ser retomada no mesmo documento; confirmação incerta exige comprovação do ERP, sem repetição automática. Sucesso exige releitura de cabeçalho, itens e `STATUSNOTA=L`. Observações não são enviadas. As chamadas ERP e o recibo Supabase não constituem uma transação distribuída; a trava não cobre outros sistemas escrevendo diretamente no ERP.
- 33 verificações SQL internas e5 finais executadas antes do COMMIT; perfis, vínculos,12 conjuntos de dados e revisão26 preservados. O ensaio inicial descobriu consumo de sequência pelo upsert legado: o número11 foi consumido sem deixar pedido e não foi restaurado/reutilizado. A reaplicação corrigida preservou11. Nenhum pedido foi enviado ao ERP nesses testes.
- **Homologação comercial pendente:** ativação/login dos titulares e pedidos reais das empresas1/4 foram adiados pelo usuário. Testes locais e SQL não equivalem à criação/envio completo pela interface publicada. Empresa1 é a matriz; demais empresas são filiais, sem ampliar o escopo autorizado1/4.

## Compatibilidade comercial Sankhya

A migração adicional `20261022165600_sankhya_commercial_compatibility.sql` acrescenta três catálogos protegidos: `erp_price_tables`, `erp_prices` e `erp_payment_terms`. O tenant `432299` continua separado dos códigos ERP 1 e 4. `products.data.erp` e `customers.data.erp` preservam identidades explícitas, sem criar Auth ou conceder papéis por e-mail/código ERP.

- Fluxo manual preservado; produtos manuais continuam com quantidades inteiras.
- Produtos ERP aceitam frações conforme unidade e precisão explicitamente cadastradas, de 0 a 3 casas. Valores não representáveis são recusados, nunca arredondados silenciosamente ou convertidos por nomes de embalagem.
- Preços exigem tabela/versão/produto/unidade/local/controle e vigência exatos, com contexto de cliente e filial. Não há fallback ao preço base, fator, tabela alheia ou versão futura/inativa. O catálogo serializa preços como texto decimal, sem perda no transporte JSON.
- Condições exigem código/versão e elegibilidade cliente/filial. Parcelas são preservadas; somas de 99,99% não geram rateio presumido. Bloqueio de venda a prazo não é convertido em bloqueio geral.
- Totais são calculados no servidor; pedidos guardam os snapshots comerciais. Edições não comerciais preservam o histórico, mas não autorizam mudar status/tipo ou reutilizar esse preço numa operação nova sem revalidação.
- Metadados ERP e catálogos não podem ser alterados pelo snapshot do navegador. RLS, perfis ativos, revisão otimista, UUID idempotente, ledger e conflito HTTP 409 permanecem.

Na publicação da compatibilidade comercial não houve carga ou consulta automática ao ERP. O fluxo online abaixo substitui a necessidade de carga, sem conversão de unidades ou geração financeira. Adilson e Raul permanecem vendedores inativos, sem confirmação artificial de e-mail.

## Consulta online Sankhya

A função existente `sankhya-online` consulta clientes, produtos, vendedores, preço contextual, condições elegíveis e histórico P/V nas empresas 1 e 4. Usa sessão Auth real e perfil ativo; sem vínculo ERP servidor confiável, gestor/vendedor não recebem acesso comercial. A chave de manutenção não autentica usuário comercial. Segredos `SANKHYA_CLIENT_ID`, `SANKHYA_CLIENT_SECRET` e `SANKHYA_X_TOKEN` ficam somente no servidor.

- Consultas paginadas de até50 registros e dados transitórios, separados do estado canônico. P e V permanecem distintos; nenhum histórico é mesclado a pedidos locais sem vínculo documental.
- O dicionário administrativo oferece diagnósticos fixos e somente leitura de local/controle, cobertura de estoque e metadados/opções/operações agregadas. A cobertura retorna contagens e até dois códigos de produto, sem eleger variante, ler saldo ou consultar preço. Consultas de até50 registros, filiais1/4, período limitado e versão histórica exata da TOP; sem SQL arbitrário ou leitura de senhas.
- Em24/10/2026 às18h42 GMT-3, o usuário definiu somente venda padrão nos relatórios: P confirmado, TOP1001/natureza10100000, sem remessas/bonificação ou modalidades adicionais. O diagnóstico `analytics/operations` aceita `standardSales:true` para aplicar esse recorte no servidor; não usa GOLSINAL de P como classificador. Metadados ou contexto histórico ausentes/inválidos impedem resultado em vez de virar zero. A consulta bruta permanece separada. Isso ainda não conecta as telas de indicadores/relatórios nem homologa contas comerciais.14 novos testes deste delta; suíte daquele recorte530/24 arquivos, com TypeScript do aplicativo/handler e bundle Edge validados. Identidade, preço, UI e banco preservados.
- Os três seletores ERP do pedido aceitam os resultados da consulta vigente mesmo quando a correspondência está em documento, referência ou código não exibido no rótulo. Um adaptador local preserva estrutura, classes, textos e helpers do DS0.9.0; cadastros manuais continuam com o componente original. Seleções fixadas não viram resultados fictícios de uma nova busca.492 testes/23 arquivos aprovados, incluindo14 novos testes de filtragem, seleção real e invariância de estrutura; sem alteração de backend, banco, vendedor ou preço.
- Somente CODEMP explicitamente NULL adota empresa1; campo ausente/vazio não é NULL. Venda usa TOP1001 em1/4. Não há remapeamento da empresa3.
- Quantidades online têm até5 casas, conforme DECQTD, bloqueio de fração e AGRUPMIN reais. Nenhuma conversão deriva do nome da embalagem. Preços transacionais precisam ser representáveis em centavos, sem arredondamento silencioso.
- Preço vem da API nativa contextual com simularInclusao=false. A API não identifica tabela/versão: esses campos ficam explicitamente nulos. Data interna ISO é enviada em DD/MM/AAAA.
- Antes de salvar, o estado, UUID e revisão são congelados. O backend revalida o ERP e atesta uma prova privada de5minutos, vinculada pelo PostgreSQL ao autor real e ao JSONB canônico. Só service_role atesta; o usuário comum grava pelo RPC normal.
- Gravação, consumo da prova, revisão e ledger são atômicos. Replay do mesmo UUID precede validade/consumo da prova e não repete a cotação. Proprietário Auth e vendedor ERP são identidades distintas.
- O vendedor do pedido é o vínculo privado do usuário autenticado, nunca o vendedor do cliente, um nome/e-mail ou um código fixo. A RPC `erp_actor_binding()` não recebe usuário pelo navegador. O mesmo vínculo limita cotação, preparação, atestação e gravação; inclusive administrador não pode indicar outro vendedor para cotar. Sem vínculo, não se inventa vendedor.
- `company.erpSeller` apenas apresenta a seleção no controle existente e não pode ser alterado pelo snapshot. O servidor resolve novamente a identidade. A migração8 prepara os pareamentos já confirmados de Adilson34 e Raul12, mantendo ambos inativos e sem conceder gerência/equipe implicitamente. Na migração8, a leitura não administrativa de pedidos online ficou restrita ao próprio proprietário Auth e ao vínculo/filial permitidos; a leitura de equipe da migração9 está descrita abaixo.
- A correção tem478 testes/22 arquivos e teste SQL reversível com pelo menos35 verificações. Isso não equivale a login real de vendedor/gestor: esses perfis continuam sem homologação enquanto não houver conta ativa autorizada. O conector Sankhya é referência de negócio, não um fluxo replicado; a regra de preço nativa permanece inalterada.
- Snapshots e referências ficam somente nos pedidos locais. Não se criam clientes/produtos ERP para satisfazer FKs. Nomes e totais documentais são preservados; abertura/reabertura de ficha reconsulta o ERP.
- A suíte SQL reversível da migração7 executa pelo menos40 assertivas e confere restauração de esquema, funções, perfis, revisão, numeração e fixtures. Gravação/reenvio/recarga por administrador Auth real também foram comprovados sem réplica de clientes/produtos.

A correção do vendedor autenticado foi publicada no mesmo Lovable pelo merge `c2b9d4f` (implementação `87bd299`), com pacotes públicos comparados byte a byte ao build validado. Backend `e05a42d…`/92.008 bytes conferido após recarga; migração8 aplicada uma vez, revisão24→25, com12 conjuntos protegidos, perfis e sequência preservados. No runtime Auth real, a conta administradora sem vínculo ERP foi corretamente impedida de cotar como vendedor5 (`ERP_IDENTITY_REQUIRED`); o catálogo continuou com148 produtos. Isso não homologa um login comercial positivo: Adilson/Raul continuam inativos. Nenhum pedido operacional novo foi salvo nesta correção.

Na publicação inicial da integração, em 24/10/2026, o frontend correspondia ao commit `9750449`, enviado usando `sette-g4`. Os pacotes públicos de rotas e entrada foram comparados byte a byte ao build local validado. Na sessão administradora existente, as telas comprovaram clientes (1.145), produtos (148), busca/paginação, CSV completo de148 produtos, ficha e histórico separado do cliente141:10 pedidos P e56 notas V. O documento P75367 abriu seus cinco itens e total documental original.

O formulário público retornou R$11,75 para o contexto testado, sem preço-base; o rascunho foi descartado sem criar outro pedido. A criação do pedido temporário9 havia sido comprovada pelo SDK com Auth real; sua edição não comercial e recarga foram comprovadas pela UI publicada. Ao final, somente esse pedido e seu item rastreado foram removidos tecnicamente, em transação guardada: revisão23→24,18 entradas de ledger,11 registros de workspace e sequência10 preservados; zero clientes/produtos replicados. Perfis, auditoria, prova privada e demais conjuntos protegidos permaneceram intactos.

Uma consulta bem-sucedida não homologa todos os contextos comerciais. Empresa4 teve cadastros e histórico documental comprovados, mas não cotação/gravação comercial válida. As três primeiras consultas exploratórias antigas usaram simularInclusao=true, sem garantia documental de ausência de efeitos; esse modo foi removido e não é reutilizado.

## Escopo pessoal e equipe — migração9

O vínculo privado pode preparar até49 códigos de equipe, além do próprio vendedor. Somente um perfil **gestor ativo** utiliza essa lista explicitamente autorizada; o papel vendedor permanece no próprio código. CODGER, nomes, e-mails e histórico não concedem acesso automaticamente. Alterar a equipe exige nova autorização, não sincronização implícita.

- Páginas, janelas, fichas, facetas, histórico e condições usam o mesmo escopo servidor. O filtro administrativo de vendedores por CODGER apenas confere o cadastro; não amplia a lista privada.
- RLS e `get_workspace` limitam clientes, pedidos/itens, atividades, usuários, metas e auditoria aos proprietários Auth autorizados. O catálogo ERP legado/manual também exige carteira e contexto comercial explícitos; não se torna fonte ou fallback do preço online.
- A leitura gerencial de pedido online de integrante não permite editar, transferir ou gravar como essa pessoa. Cotação, preparação, atestação e gravação continuam no CODVEND e proprietário Auth do usuário autenticado. Edição manual também preserva o proprietário do pedido, inclusive para administrador.
- `scope_write_guard` confere o proprietário persistido antes de aceitar alterações, impedindo tomar um ID oculto com proprietário adulterado. A rotina transacional anterior recebe somente essa chamada adicional, depois de lock/replay/PT409 e antes da prova; UUID, revisão, ledger e consumo atômico permanecem.
- Adilson34 tem somente a preparação autorizada dos códigos6/7/35/36/37/38/39/40/42, empresas1/4. Adilson/Raul continuam vendedores inativos; nenhum papel ou perfil é ativado pela migração. Não se cria Auth para os integrantes nem se deduz seu UUID de um nome.
- Validação técnica:569 testes/25 arquivos, incluindo39 novos testes de escopo; TypeScript do aplicativo/handler e builds aprovados. O ensaio SQL reversível completo exige pelo menos45 assertivas, incluindo RLS authenticated, proprietário, catálogo legado, replay após revogação e PT409. A restauração confere sete funções, nove políticas e12 conjuntos de dados, além de revisão/perfis/numeração. O primeiro ensaio recusou uma fixture incompleta pela proteção existente; ela foi corrigida sem relaxar a proteção.
- Não há alteração visual nem novo JavaScript do cliente: os três pacotes do build continuam idênticos à publicação `c2488bd`. Esse delta requer apenas a migração9 uma única vez e a implantação do backend alterado; não exige republicar o frontend.

Testes SQL com membros sintéticos não são login comercial real. Acesso positivo de vendedor/gestor, criação integral pela UI e cotação/pedido da empresa4 continuam dependentes dos titulares com contas ativas legitimamente autorizadas. Nenhuma operação ERP foi enviada.

## Limites atuais

ERP/faturamento fiscal, SMTP/WhatsApp, pagamentos e IA remota não têm provedores configurados. Não são apresentados como transações externas concluídas. O backend permite editar o nome da própria conta, mas rejeita alteração de papéis e de outros perfis pelo snapshot, operações sem provedor e exclusão por simples ausência de registros; bloqueio e cancelamento permanecem disponíveis. Essas funções exigem integração específica antes de serem consideradas concluídas.

O arquivo de referência do usuário tem SHA-256 `ef045c867719a77a3424e1f377aa42c66e3fc8b2e913557518f9d3d5b491b6c7`. Seu conteúdo histórico não é exposto como base operacional da aplicação.

### Faturamento vinculado à venda padrão

Regra confirmada em25/10/2026 às05h57 (America/Sao_Paulo): notas de venda originadas da venda padrão, período por `TGFCAB.DTFATUR`, `STATUSNOTA=L` e `STATUSNFE=A`. `STANDARD_BILLING_REPORT_POLICY` é separada da criação/cotação e de `STANDARD_SALES_REPORT_POLICY`.

O diagnóstico administrativo fixo `analytics/billing` verifica os tipos físicos, a TOP histórica exata e os vínculos de itens `TGFVAR`; soma somente `TGFCAB.VLRNOTA`, uma vez por cabeçalho, sem acrescentar pedidos nem reconstruir preço/desconto/quantidade. Valores decimais são transportados como texto e somados exatamente no servidor. Notas sem vínculo padrão comprovado ficam fora do recorte; origem mista/indireta/incompleta, referência entre filiais ou valor ausente impedem um total conclusivo. Notas sem `DTFATUR` ficam fora do período definido pelo usuário, sem substituir por outra data; o contador histórico sem data é separado e não bloqueia notas datadas. Não há rateio presumido. Contagens/grupos são conferidos, em consultas separadas e janelas de até50; não constituem snapshot atômico.

Este delta não conecta as telas, não migra o banco, não altera UI/identidade/equipe e não homologa login, cotação ou criação comercial. `VLRNOTA` foi confirmado como `FLOAT` Oracle na evidência de metadados já coletada; somente esse campo admite `NUMBER`/`FLOAT`, mantendo `TO_CHAR` no ERP e sem usar ponto flutuante JavaScript. Suíte local:613 testes/26 arquivos, incluindo44 novos casos de faturamento; TypeScript app/handler e bundle backend aprovados.

### Clientes novos, ativos e cobertura

Definições confirmadas em25/10/2026 às07h25: cliente novo é a primeira compra padrão registrada por DTNEG; cliente ativo é ATIVO=S na carteira atual, sem exigir compra; cobertura exige atividade concluída vinculada, contando clientes distintos sobre a carteira ativa.

O diagnóstico administrativo fixo `analytics/customers` reutiliza a carteira de leitura existente, atribui por CODVEND atual e procura a primeira compra em todo o histórico das filiais autorizadas antes de aplicar o período. Não usa DTCAD, nome/e-mail, notaV, pedido local, modalidade adicional ou TOP mais recente como substituto. Datas/contextos históricos capazes de alterar a primeira compra deixam a contagem pendente, sem inventar zero; ATIVO desconhecido também não vira inativo. O escopo1/4 é informado na resposta e não altera a resolução de filial de pedidos novos.

A atividade local existente é registrada com status `Realizada` e `data.date`. Porém `workspace_records.customer_id` referencia clientes locais e o proprietário é validado pelo contrato transacional: não há vínculo ERP persistível comprovado. Por isso a cobertura ERP permanece nula/indisponível, mesmo com denominador ativo conhecido. Nenhum cliente foi clonado, nenhuma FK/guarda de proprietário afrouxada e nenhuma migração aplicada para contornar a limitação.

647 testes/27 arquivos,34 casos novos (incluindo execução da lógica SQL em SQLite local com adaptação explícita de datas/paginação, não Oracle). TypeScript app/handler, builds e invariância dos três pacotes públicos aprovados. As telas e homologações comerciais continuam pendentes; este delta não altera UI, preço, identidade, equipe ou faturamento.

### Relatório de clientes online

O relatório `clientes` usa o cadastro ERP atual, contado uma vez por parceiro no conjunto de filiais autorizado. Não soma carteiras de filiais compartilhadas, não depende de compras no período e não acrescenta dados ERP ao workspace. Catálogo e seletores de pedidos continuam com `ATIVO=S` por padrão; o relatório admite o cadastro inteiro ou os códigos nativos `S`/`N` no controle de situação existente. ATIVO desconhecido permanece nulo no DTO, não inativo.

Busca, ordenação e páginas10/20/50 usam o leitor já existente. Os filtros de cliente/vendedor usam códigos técnicos; homônimos não se fundem, e o filtro nunca amplia o próprio vendedor/equipe privada. Cadastros manuais continuam separados e não ganham vínculo ERP por nome/documento. O CSV percorre apenas o recorte solicitado, em janelas de até50, confirma contagens e preserva as três colunas originais. Nenhum histórico é carregado para calcular a lista.

Delta validado com673 testes/28 arquivos (26 novos), TypeScript do aplicativo/handler e builds. As588 propriedades visuais estáticas, componentes e CSS foram comparados à base08cf251: sem novos controles, textos ou classes. Isso conecta somente o relatório de clientes; não conclui os demais relatórios e os27 indicadores, nem homologação comercial, cobertura ERP ou ativação de perfis.

### Relatório local de tarefas realizadas

O relatório `tarefas` usa exclusivamente tarefas e atividades do workspace já devolvidas sob as regras de acesso existentes. Ambas exigem o status exato `Realizada`; registros pendentes ou sem status não são tratados como concluídos. Os filtros de cliente, responsável e situação consultam essa fonte, não os pedidos. O responsável é comparado pelo `sellerId` recebido; nomes iguais não são fundidos e ausência de identificador não vira a pessoa logada. Isso não autentica usuários nem concede escopo comercial ERP.

A data continua sendo `date`, declarada no registro; não é criado um `completedAt`. Os IDs da tabela são qualificados pela coleção, sem alterar os IDs persistidos. A busca considera também o cliente local identificado por ID. O CSV usa o mesmo conjunto filtrado e ordenado da tabela inteira, antes da paginação, com as cinco colunas já existentes.

Delta validado com693 testes/29 arquivos (20 novos), TypeScript e build.588 propriedades visuais,647 chamadas de componentes e CSS preservados em relação a8fbe52f. Nenhuma alteração de backend, migração, acesso, referência ERP de atividade ou carteira. Casos positivos foram exercitados em componentes/fixtures locais; não representam novos registros reais ou homologação comercial.

### Relatório de vendas padrão online

A operação fixa `sales-report` alimenta somente o relatório `vendas`, com pedidos P/TOP1001/natureza10100000/statusL e versão histórica exata da TOP, sem bonificação/devolução. Reutiliza o escopo de leitura da carteira atual, inclusive clientes hoje inativos, e não mistura notasV ou pedidos locais. Filtros de cliente/vendedor são códigos técnicos; agrupamentos usam os códigos documentais, nunca nomes. Filiais e equipe continuam resolvidas no servidor. TOP/contexto desconhecido não vira venda zero.

Contagem, valor nativo VLRNOTA e agrupamentos são agregados no ERP; os três KPIs não são calculados sobre a página. Dinheiro vem em texto Oracle, com NUMBER/FLOAT explicitamente conferidos; somas/verificações e ticket racional usam BigInt. Duas casas são apenas apresentação, sem arredondar dados persistidos. Ausência de valor deixa o total financeiro/ticket indisponíveis. Cabeçalhos são contados uma vez e duplicação por join é recusada. Entrega/carga continuam desconhecidas; vínculo fiscal não é inferido.

Busca, ordenação, agrupamento, seletores e CSV usam os controles existentes. A exportação percorre janelas de até50 e recusa mudança de contagens ou resumo financeiro entre leituras; não constitui snapshot atômico. Sem período selecionado, mantém-se a consulta sem recorte temporal, sem inserir novos controles ou presumir mês. Nenhum histórico é copiado para o workspace ou para calcular indicadores no navegador.

Delta validado com745 testes/31 arquivos (52 novos), TypeScript app/handler e builds. Auditoria AST compara680 propriedades visuais literais/638 chamadas JSX pelo mesmo critério na base5dc52b8 e no delta, além dos dois CSS: iguais. A métrica usa critério diferente das contagens históricas588/647. Nenhuma migração, perfil, identidade comercial, preço ou escrita ERP é alterado. Clientes/Tarefas permanecem entregues; demais relatórios/27 indicadores e homologação comercial continuam pendentes.

### Faturamento ligado às notas fiscais qualificadas

A operação fixa `billing-report` usa notasV comerciais, STATUSNOTA=L/STATUSNFE=A e DTFATUR, vinculadas por itens à venda padrão. A qualificação de origem foi extraída para `billing-source.ts` e é compartilhada com o diagnóstico existente, sem mudar sua regra. Origem mista/indireta/incompleta, referência entre filiais ou valor ausente impedem total conclusivo; DTFATUR nula fica excluída sem fallback. Não há rateio, soma de pedidos às notas ou inferência de faturamento integral/quantidade atendida.

A tela reutiliza os controles, nove colunas, agrupamentos por códigos, filtros, paginação e exportação. Documento ERP mostra NUNOTA; Nota fiscal preserva NUMNOTA. Os KPIs vêm de agregados de cabeçalhos, em texto Oracle/BigInt, nunca da página. Leituras e exportações separadas não são snapshot atômico. Nada é acrescentado aos arrays canônicos do workspace; identidade, carteira atual e equipe privada continuam no servidor.

Em25/10/2026 às11h42 o usuário autorizou somente corrigir os rótulos/aviso de Faturamento, sem redesenho. Os textos passam a identificar notas/data de faturamento, o status de carga desconhecido permanece explícito e a ficha fiscal existente identifica Nota fiscal. Pedidos faturados e os demais relatórios não são declarados concluídos por este delta.785 testes/33 arquivos (40 novos), TypeScript app/handler, builds e auditoria de componentes/CSS aprovados; somente os textos condicionais autorizados foram normalizados na comparação visual à base254bd27. Nenhuma migração, ativação, mudança de proprietário, cotação, pedido local ou escrita ERP.

### Rastreabilidade do diagnóstico fiscal, sem mudar qualificação

Em25/10/2026 às15h01, o diagnóstico administrativo da filial1/2026 retornou um grupo inconclusivo de uma nota com DTFATUR11/06 e VLRNOTA55,56: origem padrão comprovada e item sem vínculo de origem. Para localizar o documento sem associar por nome/valor, o diagnóstico existente passa a retornar `sampleDocumentCode=MIN(NUNOTA)` por grupo, validado como inteiro positivo no contrato de documentos. Só um grupo com contagem1 identifica univocamente seu cabeçalho; em grupos maiores é explicitamente uma amostra. Nenhum novo parâmetro, endpoint, regra fiscal, controle de interface ou permissão. Totais inconclusivos continuam nulos.791 testes/33 arquivos (6 novos), TypeScript app/handler e bundle backend aprovados; frontend e banco não alterados.

### Relatório local de oportunidades do funil

O relatório `funil` consulta somente `opportunities` já devolvidas pelo workspace sob as regras de proprietário/equipe existentes. Aberta, Ganha, Perdida e situação desconhecida permanecem como declaradas; ganho de oportunidade não cria nem comprova venda ou faturamento ERP. Os filtros existentes de cliente, vendedor e situação usam essa coleção, não os pedidos. Identidades são comparadas por `customerId`/`sellerId`, sem juntar homônimos nem atribuir o responsável desconhecido à pessoa logada. O cliente é identificado exclusivamente pelo ID local visível; não há vínculo por nome/documento ou cópia do ERP.

Abertura permanece `date`, sem fallback para criação ou ganho. O CSV usa todo o recorte filtrado/buscado/ordenado da tabela antes da paginação e mantém as sete colunas originais. Os guardas de filtros/responsáveis reutilizam os helpers já testados de registros locais, sem a seleção `Realizada` exclusiva do relatório de tarefas. Não altera os quadros do funil, formulários, controles, textos, CSS, preço, backend, banco ou permissões.

811 testes/34 arquivos,20 casos novos; TypeScript/build e auditoria comparativa à basec8b29b9 aprovados (680 propriedades visuais,638 chamadas JSX e ambos os CSS preservados). Os casos positivos e exportação de15 linhas além da página10 são componentes/fixtures, não registros reais novos ou homologação comercial.

### Produtos por pedidos: itens nativos da venda padrão

A operação fixa `order-items-report` lê os itens de pedidos P/TOP1001/natureza10100000/statusL, TOP histórica exata e sem bonificação/devolução. Escopo da carteira atual/equipe/filiais permanece no servidor, incluindo compras passadas de clientes hoje inativos. Identidade da linha é NUNOTA+SEQUENCIA, não o produto; repetições e unidades diferentes não são fundidas. Contexto de TOP ou empresa do item não confirmado recusa a consulta, sem omitir silenciosamente nem inventar zero.

Quantidade, preço unitário histórico e subtotal vêm de QTDNEG/VLRUNIT/VLRTOT nativos em texto Oracle e são validados como decimais exatos. FLOAT Oracle desses campos é conferido; BINARY_FLOAT/BINARY_DOUBLE não entram no contrato. VLRTOT não é reconstruído por preço×quantidade, não se somam cabeçalhos e preço histórico não é cotação atual. Ausência fica nula; zero observado continua zero. Unidade é preservada no DTO, sem nova coluna ou agregação de unidades. Nenhum item/histórico é copiado para arrays do workspace.

A tela mantém sete colunas, controles, textos, classes e CSS. Filtros usam códigos técnicos; busca/ordenação/páginas10/20/50 e CSV integral usam o leitor limitado a50 por janela. O CSV recusa mudança de contagem/resumo financeiro entre leituras; não é snapshot atômico. Não altera preço contextual, persistência, perfis, metas, faturamento ou permissões.850 testes/36 arquivos,39 novos (30 SQL estrutural em SQLite adaptado e9 de UI/contrato), TypeScript app/handler e builds aprovados. Auditoria preserva680 propriedades visuais/638 chamadas JSX e dois CSS à base793dce2. Casos simulados não substituem validação runtime Oracle/Auth.

### Resumo de vendas e versão anterior online

As duas vistas reutilizam `sales-report` (P1001/10100000/L, TOP histórica exata, DTNEG), sem período padrão nem comparação temporal presumida. Tabela, filtros por códigos, agrupamentos, CSV e KPIs existentes usam os cabeçalhos e o agregado integral do servidor; pedidos manuais e notas V não são adicionados.

O gráfico lê apenas agregados por código de vendedor em janelas até50, preserva homônimos e confere filial, resumo, contagem e soma BigInt de todos os grupos. Busca e filtros são os da tabela; agrupar a tabela por cliente não transforma a dimensão do gráfico. Falha, fonte trocada ou ausência monetária descartam pontos anteriores/parciais, sem inventar valor zero. Leituras separadas não são snapshot atômico.

O DS0.9.0 aceita somente números para coordenadas. A conversão é exclusiva da apresentação e exige percurso decimal reversível; totais nativos textuais são preservados e nunca somados como ponto flutuante. O zero da escala nativa do gráfico não é um indicador financeiro extraído. Sem controles/textos/classes/CSS novos, mudança no DS, backend, migração, perfil ou registro comercial.

Validação local:878 testes/36 arquivos (28 novos); TypeScript/build/diff aprovados;680 propriedades e638 chamadas JSX/CSS iguais à baseeee23da. Casos positivos reais/publicação têm recibo separado; testes de componente não são login comercial ou operação integral homologada.

### Valores e participação na vista ABC

A tela existente de ABC reutiliza `sales-report`, agrupado no ERP por código de cliente, sobre pedidos da venda padrão (P/1001/10100000/L e versão exata da TOP). Mantém filtros existentes, escopo de carteira/equipe/filiais no servidor e histórico sem período presumido. Não inclui pedidos manuais nem notas V; clientes sem pedidos nesse recorte não recebem linhas ou valores sintéticos.

O valor textual de cada grupo vem do servidor. A participação é a razão entre esse valor e o agregado financeiro **integral do mesmo recorte**, não a soma da página. A divisão usa BigInt; apenas a apresentação preserva as zero casas do DS. Percentuais arredondados não são redistribuídos para somar100%. Denominador zero/ausente ou valor ausente deixa a participação indisponível. A ordenação dessa razão usa o valor nativo; se o denominador for negativo, consulta a janela invertida e recusa mudança de resumo, contagens ou filiais. Isso não constitui snapshot atômico.

O CSV integral mantém as quatro colunas existentes, incluindo a participação de cada janela calculada com seu resumo conferido. A classe continua **Não verificada**: não há limiares A/B/C confirmados, classificação acumulada nem regra80/20 presumida. A ligação dos valores não conclui a classificação ABC ou toda a frente de relatórios. Sem novos controles, mudanças de estilo, migração ou implantação de backend.

### Produtos distintos por cliente online

A rota `relatorios/mix` mantém as três colunas/controles existentes e usa `sales-report` com `groupBy: customer`/`productMix: true`. Base: pedidos P/TOP1001/natureza10100000/L, TOP histórica exata e escopo/carteira/equipe no servidor; sem V/manuais ou mês presumido. O total soma VLRNOTA uma vez por cabeçalho, fora do join de itens. O número de produtos é COUNT(DISTINCT TGFITE.CODPROD) por código de cliente em todo o recorte; SKU repetido entre pedidos/unidades conta uma vez, não há soma ou conversão de quantidades. Sem itens de algum pedido, produto inválido ou filial de item incompatível, esse número permanece indisponível, nunca zero. Histórico de cliente/produto hoje inativo não é removido.

Os valores continuam textuais/BigInt e a ordenação por produtos é integral no servidor, com desconhecidos por último. CSV exporta o recorte integral filtrado/ordenado e verifica contagens/resumo financeiro entre janelas; não é snapshot atômico. Não cria comparação temporal nem indicador de positivação por inferência. Ensaios SQLite adaptados/componente não são execução Oracle, Auth ou homologação comercial.

### Produtos mais vendidos online

A rota `relatorios/produtos` mantém quatro colunas e o BarList do DS. `order-items-report/productReport:true` agrega itens por CODPROD, no mesmo escopo de venda padrão P1001/10100000/L/TOP histórica exata. Valor = SUM(VLRTOT) textual, sem cabeçalhos ou preço×quantidade. Quantidade = SUM(QTDNEG) textual apenas com CODVOL único/legível e todas as quantidades presentes; caso contrário fica indisponível, sem conversão ou zero artificial. Não exclui histórico de produto/cliente hoje inativo. DTO/CSV preservam precisão nativa; apresentação conserva zero casas com BigInt. Não presume mês/período.

O gráfico lê apenas agregados integrais em janelas≤50, com resumo/filiais/contagens/identidades e soma monetária conferidos; Number só em coordenada reversível. Não mostra gráfico parcial nem compara unidades distintas. Ausência, quantidade negativa/incompatível ou rótulos homônimos (BarList usa label como chave) deixam o gráfico indisponível sem alterar o componente/DS. As linhas por código da tabela continuam independentes. A busca desta vista é só por código/descrição do produto, sem cortar itens por unidade, cliente, vendedor ou documento ocultos; cliente/vendedor/período usam os filtros existentes. CSV usa o recorte integral buscado/ordenado, sem snapshot atômico. Ensaios SQLite adaptados/componente não equivalem a execução Oracle ou homologação comercial.

### Gerencial para representada online

A rota `relatorios/gerencial` preserva os dois quadros existentes. O principal usa `sales-report/groupBy=customer`: cabeçalhos P padrão, VLRNOTA uma vez por documento e grupos por código. O secundário usa `order-items-report/productReport:true`: QTDNEG nativo por produto/unidade compatível, sem preço×quantidade ou soma de cabeçalhos por item. Valores/quantidades ausentes permanecem indisponíveis; manuais não são misturados. Filtros existentes de cliente/vendedor/status são compartilhados; limites de data, quando presentes no estado da consulta, seguem o contrato já existente. Não adiciona controle de período nem presume mês. A busca/ordenação/paginação da tabela principal e a paginação/ordenação do quadro secundário continuam independentes, como na estrutura original.

O quadro secundário passa `registerExport:false`, não registrando seu exportador na chave orders do principal. O CSV continua exclusivamente de clientes, integral e com os dois campos originais name/total, mesmo após paginação/ordenação/erro de produtos. Nenhum novo backend, SQL, migração, controle, gráfico, KPI ou vínculo comercial é criado. Ensaios de componentes/SDK não substituem Oracle/UI real ou homologação comercial.

### Clientes sem compra no mês online

A rota `relatorios/nao-compraram` mantém suas quatro colunas e controles. `nonbuyers-report` cruza a carteira atual autorizada, TGFPAR.CLIENTE=S/ATIVO=S e CODVEND atual, com a ausência de venda padrão P1001/10100000/L/TOP histórica exata/DTNEG no mês inteiro. Usa todas as filiais autorizadas para verificar a compra; carteiras compartilhadas não são somadas. Bloqueio financeiro não define inatividade. Compra por vendedor histórico diferente continua sendo compra do cliente atual; nome/e-mail/CODGER não concedem acesso. Não mistura clientes/pedidos manuais, notas V ou outras operações como venda padrão.

O mês vem do estado existente de Emissão ou do mês corrente em America/Sao_Paulo, como já ocorria nesta vista mensal; não adiciona seletor de período. Datas inválidas, invertidas ou atravessando meses são recusadas, sem escolher silenciosamente um deles. TOP/data inconclusiva que possa mudar a ausência, cadastro/join duplicado ou estrutura ausente impedem conclusão: não viram zero nem cliente sem compra. Compra padrão já comprovada no mês basta para excluir um comprador, mesmo havendo outra data incerta. Nunca usa DTCAD/nota/data alternativa para preencher DTNEG.

Paginação/busca/ordenação e total da carteira são integrais no servidor, por códigos de cliente/vendedor, em janelas≤50. CSV usa os quatro campos name/code/seller/localStatus e verifica contagens/resumo entre janelas e no fechamento; não é snapshot atômico. O resumo preserva o mês, escopo histórico e a carteira ativa, sem calcular valor financeiro. Mantém RLS/Auth/equipe e nenhuma escrita no ERP. Ensaios SQLite adaptados/componentes não equivalem a Oracle, UI pública ou homologação comercial positiva.

### Carteira por vendedor, positivação e estoque nativo

Critérios e adaptações visuais autorizados em26/10/2026 às11h33. `wallet-report` reutiliza a qualificação de `nonbuyers-report`, sem duplicar carteiras compartilhadas: carteira atual CLIENTE=S/ATIVO=S, vendedor atual por código, compra padrão em qualquer filial autorizada no mês. Vendedor inativo ou sem atribuição não é apagado da carteira administrativa; isso não concede acesso Auth. Compradores + sem compra = carteira ativa. Positivação é compradores/carteira ativa; denominador zero não vira percentual zero. Totais precedem somente a busca textual, mas respeitam os filtros técnicos de cliente/vendedor. As duas telas usam consulta mensal explícita, paginação/busca/ordenação/CSV no servidor, sem misturar manuais. A tabela autorizada de Carteira por vendedor substitui a indisponibilidade anterior, sem depender de assinatura.

`stock-report` mostra TGFEST.ESTOQUE e RESERVADO textuais por empresa/produto/local/controle/parceiro/tipo, com unidade nativa. Os contextos completos são identidades distintas; não há soma ou conversão de unidades, cálculo ESTOQUE−RESERVADO, preço, reserva, ajuste ou escrita. Disponibilidade continua **não confirmada**. Ausência de linha não significa saldo zero; saldos negativos e nulos são preservados. Contexto/cadastro duplicado, unidade ausente ou precisão incompatível impedem resultado ambíguo. Somente leitura nas filiais do vínculo resolvido no servidor, inclusive para vendedor/gestor; nenhuma identidade do navegador concede escopo.

O backend oferece qualificação fixa de metadados das fontes restantes, somente ao administrador. Existência/descrição de coluna não comprovam apuração, pagamento de comissão ou classificação ABC. Falsos positivos de nomes de campos permanecem apenas metadados; não se consultam valores bancários ou usuários. Sem migração, nova tabela, mudança de perfil/vínculo ou persistência dos resultados. Exportações verificam contagens, identidades e escopo entre janelas; não são snapshot atômico. Estas entregas não concluem os demais relatórios/27 indicadores nem homologam pedidos reais.

### Comissão nativa por beneficiário e pedido

`commission-report` consulta TGFCOM.VLRCOM, pelo beneficiário TGFCOM.CODVEND e pela empresa da origem TGFCAB ligada por NUNOTAORIG. CODEMP direto nulo não vira filial presumida; divergência de empresa impede resultado. Vínculo Auth/filiais/equipe continua privado no servidor. Não usa vendedor atual do cliente, percentuais, valor de item nulo como zero, comissão calculada localmente ou status de pagamento. Preserva inclusive lançamentos negativos de devolução. O período é explicitamente a emissão da origem documental, DTNEG, não REFERENCIA, DHALTER ou baixa; nenhuma data/período geral é preenchida por conveniência.

As duas vistas somam os mesmos lançamentos nativos, sem mesclar manuais. Em Comissões por pedido, identifica um pedido padrão somente se for a própria origem P qualificada ou se a nota V qualificada tiver exatamente um pedido padrão de origem, com vínculos de itens íntegros, mesma empresa e cliente. Nota com dois/três pedidos, devolução, outra operação ou origem incompleta permanece como **Não atribuído (origem NUNOTA)**, com comissão nativa preservada e total de pedido nulo. Não distribui comissão entre pedidos/itens nem repete o total de um pedido por lançamento. Essa ausência de atribuição não é apagamento do lançamento nem prova de que ele não existe no ERP.

SQL fixo, agrupamento/busca/ordenação/paginação no servidor e dinheiro textual. Uma barreira ROWNUM impede expansão repetida da qualificação no plano Oracle. Integridade verifica entradas físicas distintas para impedir multiplicação por joins. Exportação confere contagens, resumo, política e empresas entre janelas e no fechamento; não é snapshot atômico. SQLite adaptado e testes de componente não substituem a verificação real Oracle/UI. Sem migração, mudança de contas ou persistência comercial. TGFGIR/TGFGIR1 e TGFMPE não comprovam classe ABC de cliente: as estruturas observadas incluem produto e contexto de giro/acordo, e não foram reutilizadas como classificação de cliente.
