# Sul · Força de Vendas

Aplicação SulBR baseada no bundle ajustado e no mapeamento funcional, com componentes oficiais `@g4ai/ds@0.9.0`, TanStack Start, React 19 e Supabase.

## Projetos

- Lovable: https://lovable.dev/projects/0b6c2dc7-eed7-4198-891f-16539f2e61f0
- Supabase: https://supabase.com/dashboard/project/cxurczhmrvxcuvklyiht
- Repositório sincronizado: https://github.com/SulBR-Cristal-Select/for-a-de-vendas

O nome final solicitado, `forca-vendas`, depende de renomeação por um administrador do GitHub. A conta de desenvolvimento tem escrita, mas não administração neste repositório. O README anterior permanece em `SulBR-Cristal-Select/forca-vendas-referencia`; não foi excluído.

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

A senha é enviada pelo cliente oficial diretamente ao Supabase Auth; não há senha de demonstração nem conta fixa no repositório.

## Persistência e regras

As migrações em `supabase/migrations` correspondem às versões instaladas. Dez tabelas públicas, perfis vinculados ao Auth, RLS e RPCs `get_workspace` / `save_workspace` mantêm os dados por empresa e vendedor. Gravações usam revisão e chave de idempotência. Itens e totais de pedidos são validados e calculados no servidor, mantendo preços históricos. A interface aguarda confirmação para navegar ou fechar gravações críticas.

Nenhuma carteira histórica ou simulação é carregada como operação real. Os 25 relatórios e 27 indicadores são catálogos estruturais; os resultados dependem dos registros persistidos. Agenda e Portal não aparecem na lateral. O menu e o layout do bundle são preservados, sem descontos, promoções ou Saldo Flex.

## Verificações realizadas

- TypeScript e build de produção.
- Vinte testes locais do adaptador, da fila de gravação, dos catálogos e dos contratos de identificação, metas e responsáveis.
- Vinte e seis verificações transacionais no Supabase: total de R$ 9.008,80 para 974 unidades em três itens, reenvio idempotente, conflito de revisão, duplicidade de documento, rollback, preço histórico, restrições de papel, isolamento de carteira, metas mensais e edição da própria conta/empresa.
- Dados fictícios desses testes foram revertidos. Testes transacionais não substituem o teste interativo de login e operação com a conta ativada.

## Limites atuais

ERP/faturamento fiscal, SMTP/WhatsApp, pagamentos e IA remota não têm provedores configurados. Não são apresentados como transações externas concluídas. O backend permite editar o nome da própria conta, mas rejeita alteração de papéis e de outros perfis pelo snapshot, operações sem provedor e exclusão por simples ausência de registros; bloqueio e cancelamento permanecem disponíveis. Essas funções exigem integração específica antes de serem consideradas concluídas.

O arquivo de referência do usuário tem SHA-256 `ef045c867719a77a3424e1f377aa42c66e3fc8b2e913557518f9d3d5b491b6c7`. Seu conteúdo histórico não é exposto como base operacional da aplicação.
