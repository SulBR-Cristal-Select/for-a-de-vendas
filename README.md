# Sul · Força de Vendas

Aplicação SulBR baseada no bundle ajustado e no mapeamento funcional, com componentes oficiais `@g4ai/ds@0.9.0`, TanStack Start, React 19 e Supabase.

## Projetos

- Lovable: https://lovable.dev/projects/0b6c2dc7-eed7-4198-891f-16539f2e61f0
- Supabase: https://supabase.com/dashboard/project/cxurczhmrvxcuvklyiht
- Repositório sincronizado: https://github.com/SulBR-Cristal-Select/for-a-de-vendas

O nome `for-a-de-vendas` foi aceito pelo usuário em 22/10/2026; não há renomeação pendente. O repositório anterior permanece em `SulBR-Cristal-Select/forca-vendas-referencia`; não foi excluído.

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
- 431 testes locais em 21 arquivos: adaptadores, fila, catálogos, identidade, metas, responsáveis, vínculo Auth, paginação, histórico documental, preços, precisão, condições e revalidação transacional.
- 32 verificações SQL da compatibilidade ERP, mais recusa de perfil inativo, em transação revertida: preço exato/versão/unidade/vigência, filial e vínculo, precisão, parcelas, histórico não comercial, adulteração, idempotência, concorrência e regressão manual. A numeração real permaneceu em 8, sem fixtures restantes.
- Vinte e seis verificações transacionais no Supabase: total de R$ 9.008,80 para 974 unidades em três itens, reenvio idempotente, conflito de revisão, duplicidade de documento, rollback, preço histórico, restrições de papel, isolamento de carteira, metas mensais e edição da própria conta/empresa.
- Seis verificações adicionais do papel gestor no banco.
- Trinta verificações de vínculo Auth (três ativações de destino e 27 recusas), incluindo reenvio idempotente, identidade real, ausência de alterações parciais e restauração das contagens originais.
- Formulário de usuários verificado isoladamente em 390 e 1440 px: campos obrigatórios, e-mail semântico, opção Gestor, payload canônico e preservação do formulário em falha.
- Dados fictícios desses testes foram revertidos. Testes transacionais e de componente não substituem o teste interativo de login e operação com a conta ativada.

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
- O dicionário administrativo oferece diagnósticos fixos e somente leitura de local/controle e de metadados/opções/operações comerciais agregadas. Consultas de até50 registros, filiais1/4, período limitado e versão histórica exata da TOP; sem SQL arbitrário, preço alternativo ou leitura de senhas. O diagnóstico apenas mostra a fonte e não inventa a regra de classificação.24 novos testes; suíte total516/24 arquivos.
- Os três seletores ERP do pedido aceitam os resultados da consulta vigente mesmo quando a correspondência está em documento, referência ou código não exibido no rótulo. Um adaptador local preserva estrutura, classes, textos e helpers do DS0.9.0; cadastros manuais continuam com o componente original. Seleções fixadas não viram resultados fictícios de uma nova busca.492 testes/23 arquivos aprovados, incluindo14 novos testes de filtragem, seleção real e invariância de estrutura; sem alteração de backend, banco, vendedor ou preço.
- Somente CODEMP explicitamente NULL adota empresa1; campo ausente/vazio não é NULL. Venda usa TOP1001 em1/4. Não há remapeamento da empresa3.
- Quantidades online têm até5 casas, conforme DECQTD, bloqueio de fração e AGRUPMIN reais. Nenhuma conversão deriva do nome da embalagem. Preços transacionais precisam ser representáveis em centavos, sem arredondamento silencioso.
- Preço vem da API nativa contextual com simularInclusao=false. A API não identifica tabela/versão: esses campos ficam explicitamente nulos. Data interna ISO é enviada em DD/MM/AAAA.
- Antes de salvar, o estado, UUID e revisão são congelados. O backend revalida o ERP e atesta uma prova privada de5minutos, vinculada pelo PostgreSQL ao autor real e ao JSONB canônico. Só service_role atesta; o usuário comum grava pelo RPC normal.
- Gravação, consumo da prova, revisão e ledger são atômicos. Replay do mesmo UUID precede validade/consumo da prova e não repete a cotação. Proprietário Auth e vendedor ERP são identidades distintas.
- O vendedor do pedido é o vínculo privado do usuário autenticado, nunca o vendedor do cliente, um nome/e-mail ou um código fixo. A RPC `erp_actor_binding()` não recebe usuário pelo navegador. O mesmo vínculo limita cotação, preparação, atestação e gravação; inclusive administrador não pode indicar outro vendedor para cotar. Sem vínculo, não se inventa vendedor.
- `company.erpSeller` apenas apresenta a seleção no controle existente e não pode ser alterado pelo snapshot. O servidor resolve novamente a identidade. A migração8 prepara os pareamentos já confirmados de Adilson34 e Raul12, mantendo ambos inativos e sem conceder gerência/equipe implicitamente. Leitura não administrativa de pedidos online fica restrita ao próprio proprietário Auth e ao vínculo/filial permitidos.
- A correção tem478 testes/22 arquivos e teste SQL reversível com pelo menos35 verificações. Isso não equivale a login real de vendedor/gestor: esses perfis continuam sem homologação enquanto não houver conta ativa autorizada. O conector Sankhya é referência de negócio, não um fluxo replicado; a regra de preço nativa permanece inalterada.
- Snapshots e referências ficam somente nos pedidos locais. Não se criam clientes/produtos ERP para satisfazer FKs. Nomes e totais documentais são preservados; abertura/reabertura de ficha reconsulta o ERP.
- A suíte SQL reversível da migração7 executa pelo menos40 assertivas e confere restauração de esquema, funções, perfis, revisão, numeração e fixtures. Gravação/reenvio/recarga por administrador Auth real também foram comprovados sem réplica de clientes/produtos.

A correção do vendedor autenticado foi publicada no mesmo Lovable pelo merge `c2b9d4f` (implementação `87bd299`), com pacotes públicos comparados byte a byte ao build validado. Backend `e05a42d…`/92.008 bytes conferido após recarga; migração8 aplicada uma vez, revisão24→25, com12 conjuntos protegidos, perfis e sequência preservados. No runtime Auth real, a conta administradora sem vínculo ERP foi corretamente impedida de cotar como vendedor5 (`ERP_IDENTITY_REQUIRED`); o catálogo continuou com148 produtos. Isso não homologa um login comercial positivo: Adilson/Raul continuam inativos. Nenhum pedido operacional novo foi salvo nesta correção.

Na publicação inicial da integração, em 24/10/2026, o frontend correspondia ao commit `9750449`, enviado usando `sette-g4`. Os pacotes públicos de rotas e entrada foram comparados byte a byte ao build local validado. Na sessão administradora existente, as telas comprovaram clientes (1.145), produtos (148), busca/paginação, CSV completo de148 produtos, ficha e histórico separado do cliente141:10 pedidos P e56 notas V. O documento P75367 abriu seus cinco itens e total documental original.

O formulário público retornou R$11,75 para o contexto testado, sem preço-base; o rascunho foi descartado sem criar outro pedido. A criação do pedido temporário9 havia sido comprovada pelo SDK com Auth real; sua edição não comercial e recarga foram comprovadas pela UI publicada. Ao final, somente esse pedido e seu item rastreado foram removidos tecnicamente, em transação guardada: revisão23→24,18 entradas de ledger,11 registros de workspace e sequência10 preservados; zero clientes/produtos replicados. Perfis, auditoria, prova privada e demais conjuntos protegidos permaneceram intactos.

Uma consulta bem-sucedida não homologa todos os contextos comerciais. Empresa4 teve cadastros e histórico documental comprovados, mas não cotação/gravação comercial válida. As três primeiras consultas exploratórias antigas usaram simularInclusao=true, sem garantia documental de ausência de efeitos; esse modo foi removido e não é reutilizado.

## Limites atuais

ERP/faturamento fiscal, SMTP/WhatsApp, pagamentos e IA remota não têm provedores configurados. Não são apresentados como transações externas concluídas. O backend permite editar o nome da própria conta, mas rejeita alteração de papéis e de outros perfis pelo snapshot, operações sem provedor e exclusão por simples ausência de registros; bloqueio e cancelamento permanecem disponíveis. Essas funções exigem integração específica antes de serem consideradas concluídas.

O arquivo de referência do usuário tem SHA-256 `ef045c867719a77a3424e1f377aa42c66e3fc8b2e913557518f9d3d5b491b6c7`. Seu conteúdo histórico não é exposto como base operacional da aplicação.
