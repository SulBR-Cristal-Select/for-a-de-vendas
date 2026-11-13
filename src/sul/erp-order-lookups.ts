import { useEffect, useRef, useState } from "react";
import type { ERPClient } from "./erp-hooks";
import type { ERPPageQuery, ERPResource, ERPRow } from "../lib/erp-online";
import type { ERPMatches } from "./erp-combobox";

const recursos = ["customers", "products", "sellers"] as const;
const rotulos = { customers: "Cliente", products: "Produto", sellers: "Vendedor" };
const vazio: ERPRow[] = [];
const mensagem = (erro: unknown) =>
  erro instanceof Error ? erro.message : "Consulta ERP indisponível.";
type Consulta = {
  client?: ERPClient | undefined;
  rows: ERPRow[];
  query?: string;
  context?: string;
  loading: boolean;
  error?: string;
  total?: number;
  hasMore: boolean;
};

/** Só reconhece o popup que contém a busca exata do Combobox do DS. */
function popupDoCampo(input: HTMLInputElement, recurso: ERPResource, label:string = rotulos[recurso]): HTMLElement | null {
  if (
    input.getAttribute("aria-label") !== `Buscar em ${label.toLocaleLowerCase("pt-BR")}`
  )
    return null;
  const popup = input.closest<HTMLElement>(`[aria-label="${label}"]`);
  return popup && popup.tagName !== "BUTTON" ? popup : null;
}
function idDeRegistro(recurso: ERPResource, id: string): string | number | undefined {
  const prefixo =
    recurso === "customers" ? "customer" : recurso === "products" ? "product" : "seller";
  const codigo = new RegExp(`^sankhya:${prefixo}:([0-9]+)$`).exec(id)?.[1];
  if (!codigo || !Number.isSafeInteger(Number(codigo)) || Number(codigo) < 1) return undefined;
  return recurso === "sellers" ? Number(codigo) : id;
}
function unir(linhas: ERPRow[], selecionados: ERPRow[]): ERPRow[] {
  // A identidade é o código, nunca nome/email; preserva o DTO integralmente.
  return [...new Map([...selecionados, ...linhas].map((linha) => [linha["id"], linha])).values()];
}

function useConsulta(client: ERPClient | undefined, recurso: ERPResource, ids: readonly string[], filters?: ERPPageQuery['filters'], label:string = rotulos[recurso]) {
  const context = JSON.stringify(filters ?? {});
  const [estado, definirEstado] = useState<Consulta>({
    rows: [],
    loading: !!client,
    hasMore: false,
  });
  const [fixados, definirFixados] = useState<{
    client?: ERPClient | undefined;
    chave: string;
    rows: ERPRow[];
    error?: string;
    loading: boolean;
  }>();
  const buscaAtual = useRef<(query: string) => void>(() => {});
  const atual = useRef(client);
  atual.current = client;
  const linhas = useRef<ERPRow[]>([]);
  const chave = JSON.stringify(
    [...new Set(ids)].filter((id) => idDeRegistro(recurso, id) !== undefined),
  );
  const selecao = useRef(chave);
  selecao.current = chave;

  useEffect(() => {
    linhas.current = [];
    if (!client) {
      definirEstado({ rows: [], loading: false, hasMore: false });
      return;
    }
    let vivo = true,
      geracao = 0,
      consulta = "",
      offset = 0,
      total = 0,
      ocupado = false;
    let temporizador: ReturnType<typeof setTimeout> | undefined;
    let consultaVigente = new AbortController();
    const vigente = (versao: number) => vivo && atual.current === client && geracao === versao;
    async function carregar(anexar = false) {
      if (ocupado || !vivo) return;
      ocupado = true;
      const versao = geracao;
      definirEstado((anterior) => ({
        client,
        rows: anexar ? anterior.rows : [],
        query: consulta,
        context,
        loading: true,
        hasMore: false,
      }));
      try {
        const pagina = await client!.window({
          resource: recurso,
          ...(filters ? { filters } : {}),
          search: consulta,
          sort: "name",
          direction: "asc",
          offset,
          limit: 50,
        }, consultaVigente.signal);
        if (!vigente(versao)) return;
        linhas.current = anexar ? unir(linhas.current, pagina.items) : pagina.items;
        offset += pagina.items.length;
        total = pagina.total;
        definirEstado({
          client,
          rows: linhas.current,
          query: consulta,
          context,
          loading: false,
          total,
          hasMore: offset < total,
        });
      } catch (erro) {
        if (!vigente(versao)) return;
        linhas.current = [];
        total = 0;
        offset = 0;
        definirEstado({ client, context, rows: [], loading: false, error: mensagem(erro), hasMore: false });
      } finally {
        if (vigente(versao)) ocupado = false;
      }
    }
    function buscar(valor: string) {
      if (valor === consulta) return;
      consulta = valor;
      consultaVigente.abort();
      consultaVigente = new AbortController();
      geracao++;
      ocupado = false;
      offset = 0;
      total = 0;
      linhas.current = [];
      clearTimeout(temporizador);
      definirEstado({ client, context, rows: [], loading: true, hasMore: false });
      temporizador = setTimeout(() => {
        void carregar();
      }, 180);
    }
    function entrada(evento: Event) {
      const alvo = evento.target;
      if (alvo instanceof HTMLInputElement && popupDoCampo(alvo, recurso, label)) buscar(alvo.value);
    }
    function rolagem(evento: Event) {
      const lista = evento.target;
      if (!(lista instanceof HTMLElement) || lista.getAttribute("role") !== "listbox") return;
      const popup = lista.closest<HTMLElement>(`[aria-label="${label}"]`);
      const input = popup?.querySelector<HTMLInputElement>("input");
      if (!input || popupDoCampo(input, recurso, label) !== popup || input.value !== consulta) return;
      if (
        lista.scrollHeight > lista.clientHeight &&
        lista.scrollTop + lista.clientHeight >= lista.scrollHeight - 4 &&
        offset < total
      )
        void carregar(true);
    }
    buscaAtual.current = buscar;
    document.addEventListener("input", entrada, true);
    document.addEventListener("focusin", entrada, true);
    document.addEventListener("scroll", rolagem, true);
    void carregar();
    return () => {
      vivo = false;
      consultaVigente.abort();
      buscaAtual.current = () => {};
      geracao++;
      clearTimeout(temporizador);
      document.removeEventListener("input", entrada, true);
      document.removeEventListener("focusin", entrada, true);
      document.removeEventListener("scroll", rolagem, true);
    };
  }, [client, recurso, JSON.stringify(filters), label]);

  useEffect(() => {
    if (!client) return;
    let vivo = true;
    const escolhidos: string[] = JSON.parse(chave);
    const anteriores = fixados && fixados.client === client ? fixados.rows : [];
    const conhecidos = unir(atual.current === client ? linhas.current : [], anteriores).filter(
      (row) => escolhidos.includes(String(row["id"])),
    );
    definirFixados({ client, chave, rows: conhecidos, loading: true });
    void Promise.all(
      escolhidos
        .filter((id) => !conhecidos.some((row) => row["id"] === id))
        .map(async (id) => {
          const resposta = await client.record({
            resource: recurso,
            id: idDeRegistro(recurso, id)!,
          });
          return resposta.record;
        }),
    )
      .then((registros) => {
        if (vivo && atual.current === client && selecao.current === chave)
          definirFixados({
            client,
            chave,
            rows: unir(
              conhecidos,
              registros.filter((row): row is ERPRow => !!row),
            ),
            loading: false,
          });
      })
      .catch((erro) => {
        if (vivo && atual.current === client && selecao.current === chave)
          definirFixados({ client, chave, rows: [], error: mensagem(erro), loading: false });
      });
    return () => {
      vivo = false;
    };
    // Só os selecionados sobrevivem fora da consulta corrente; não há cache de carteira.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, recurso, chave]);

  const pagina = estado.client === client && estado.context === context ? estado : undefined;
  const registros =
    fixados && fixados.client === client && fixados.chave === chave ? fixados : undefined;
  const rows = client ? unir(pagina?.rows || vazio, registros?.rows || vazio) : vazio;
  const matches: ERPMatches = {
    onSearchChange: query => buscaAtual.current(query),
    query: pagina?.query ?? '',
    ids: new Set((pagina?.rows || vazio).map(row => String(row['id']))),
  };
  return {
    rows,
    matches,
    loading: !!client && (!pagina || pagina.loading || !registros || registros.loading),
    error: pagina?.error || registros?.error,
    total: pagina?.total,
    hasMore: pagina?.hasMore ?? false,
  };
}

/** Filtros do relatório existente: somente os dois cadastros necessários, por código. */
export function useERPCustomerReportLookups(client: ERPClient | undefined, customerId: string, sellerId: string) {
  const customers = useConsulta(client, 'customers', customerId ? [customerId] : [], { active: 'all' });
  const sellers = useConsulta(client, 'sellers', sellerId ? [sellerId] : []);
  return { customers, sellers };
}

/** Cadastros de pedido exclusivamente transitórios; a autenticação permanece no servidor. */
export function useERPOrderLookups(
  client: ERPClient | undefined,
  customerId: string,
  productIds: readonly string[],
  actorSellerId?: string,
  /** null = carteira inteira autorizada pelo servidor (gestor: o vendedor vem do cliente). */
  customerSellerId?: string | null,
) {
  const sellerCode = customerSellerId === null ? undefined : /^sankhya:seller:([1-9]\d*)$/.exec(customerSellerId ?? actorSellerId ?? '')?.[1];
  const customers = useConsulta(client, "customers", customerId ? [customerId] : [], sellerCode ? { sellerCode: Number(sellerCode) } : undefined);
  // Somente produtos da tabela de preço do cliente (cadastro + condição fixa); sem cliente, a lista fica livre.
  const customerCode = /^sankhya:customer:([1-9]\d*)$/.exec(customerId)?.[1];
  const products = useConsulta(client, "products", productIds, customerCode ? { customerCode: Number(customerCode) } : undefined);
  // A carteira do cliente não identifica a pessoa autenticada. Fixar somente o vínculo da sessão.
  const sellerId = typeof actorSellerId === 'string' && /^sankhya:seller:[1-9]\d*$/.test(actorSellerId) ? actorSellerId : '';
  const sellers = useConsulta(client, "sellers", sellerId ? [sellerId] : []);
  const estados = { customers, products, sellers };
  const erro = recursos.map((recurso) => estados[recurso].error).find(Boolean);
  return {
    customers: customers.rows,
    products: products.rows,
    sellers: sellers.rows,
    matches: { customers: customers.matches, products: products.matches, sellers: sellers.matches },
    loading: recursos.some((recurso) => estados[recurso].loading),
    error: erro ? { message: erro } : undefined,
    totals: Object.fromEntries(recursos.map((recurso) => [recurso, estados[recurso].total])),
    hasMore: Object.fromEntries(recursos.map((recurso) => [recurso, estados[recurso].hasMore])),
  };
}

/** Reaproveita busca/paginação de cadastros para filtros transitórios dos indicadores. */
export function useERPIndicatorLookup(client:ERPClient|undefined,resource:'customers'|'products',id:string,label:string){return useConsulta(client,resource,id?[id]:[],resource==='customers'?{active:'all'}:undefined,label);}
