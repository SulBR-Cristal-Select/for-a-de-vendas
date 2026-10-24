import { useEffect, useRef, useState } from "react";
import type { ERPClient } from "./erp-hooks";
import type { ERPResource, ERPRow } from "../lib/erp-online";

const recursos = ["customers", "products", "sellers"] as const;
const rotulos = { customers: "Cliente", products: "Produto", sellers: "Vendedor" };
const vazio: ERPRow[] = [];
const mensagem = (erro: unknown) =>
  erro instanceof Error ? erro.message : "Consulta ERP indisponível.";
type Consulta = {
  client?: ERPClient | undefined;
  rows: ERPRow[];
  loading: boolean;
  error?: string;
  total?: number;
  hasMore: boolean;
};

/** Só reconhece o popup que contém a busca exata do Combobox do DS. */
function popupDoCampo(input: HTMLInputElement, recurso: ERPResource): HTMLElement | null {
  if (
    input.getAttribute("aria-label") !== `Buscar em ${rotulos[recurso].toLocaleLowerCase("pt-BR")}`
  )
    return null;
  const popup = input.closest<HTMLElement>(`[aria-label="${rotulos[recurso]}"]`);
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

function useConsulta(client: ERPClient | undefined, recurso: ERPResource, ids: readonly string[]) {
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
    const vigente = (versao: number) => vivo && atual.current === client && geracao === versao;
    async function carregar(anexar = false) {
      if (ocupado || !vivo) return;
      ocupado = true;
      const versao = geracao;
      definirEstado((anterior) => ({
        client,
        rows: anexar ? anterior.rows : [],
        loading: true,
        hasMore: false,
      }));
      try {
        const pagina = await client!.window({
          resource: recurso,
          search: consulta,
          sort: "name",
          direction: "asc",
          offset,
          limit: 50,
        });
        if (!vigente(versao)) return;
        linhas.current = anexar ? unir(linhas.current, pagina.items) : pagina.items;
        offset += pagina.items.length;
        total = pagina.total;
        definirEstado({
          client,
          rows: linhas.current,
          loading: false,
          total,
          hasMore: offset < total,
        });
      } catch (erro) {
        if (!vigente(versao)) return;
        linhas.current = [];
        total = 0;
        offset = 0;
        definirEstado({ client, rows: [], loading: false, error: mensagem(erro), hasMore: false });
      } finally {
        if (vigente(versao)) ocupado = false;
      }
    }
    function buscar(valor: string) {
      if (valor === consulta) return;
      consulta = valor;
      geracao++;
      ocupado = false;
      offset = 0;
      total = 0;
      linhas.current = [];
      clearTimeout(temporizador);
      definirEstado({ client, rows: [], loading: true, hasMore: false });
      temporizador = setTimeout(() => {
        void carregar();
      }, 180);
    }
    function entrada(evento: Event) {
      const alvo = evento.target;
      if (alvo instanceof HTMLInputElement && popupDoCampo(alvo, recurso)) buscar(alvo.value);
    }
    function rolagem(evento: Event) {
      const lista = evento.target;
      if (!(lista instanceof HTMLElement) || lista.getAttribute("role") !== "listbox") return;
      const popup = lista.closest<HTMLElement>(`[aria-label="${rotulos[recurso]}"]`);
      const input = popup?.querySelector<HTMLInputElement>("input");
      if (!input || popupDoCampo(input, recurso) !== popup || input.value !== consulta) return;
      if (
        lista.scrollHeight > lista.clientHeight &&
        lista.scrollTop + lista.clientHeight >= lista.scrollHeight - 4 &&
        offset < total
      )
        void carregar(true);
    }
    document.addEventListener("input", entrada, true);
    document.addEventListener("focusin", entrada, true);
    document.addEventListener("scroll", rolagem, true);
    void carregar();
    return () => {
      vivo = false;
      geracao++;
      clearTimeout(temporizador);
      document.removeEventListener("input", entrada, true);
      document.removeEventListener("focusin", entrada, true);
      document.removeEventListener("scroll", rolagem, true);
    };
  }, [client, recurso]);

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

  const pagina = estado.client === client ? estado : undefined;
  const registros =
    fixados && fixados.client === client && fixados.chave === chave ? fixados : undefined;
  const rows = client ? unir(pagina?.rows || vazio, registros?.rows || vazio) : vazio;
  return {
    rows,
    loading: !!client && (!pagina || pagina.loading || !registros || registros.loading),
    error: pagina?.error || registros?.error,
    total: pagina?.total,
    hasMore: pagina?.hasMore ?? false,
  };
}

/** Cadastros de pedido exclusivamente transitórios; a autenticação permanece no servidor. */
export function useERPOrderLookups(
  client: ERPClient | undefined,
  customerId: string,
  productIds: readonly string[],
  actorSellerId?: string,
) {
  const customers = useConsulta(client, "customers", customerId ? [customerId] : []);
  const products = useConsulta(client, "products", productIds);
  // A carteira do cliente não identifica a pessoa autenticada. Fixar somente o vínculo da sessão.
  const sellerId = typeof actorSellerId === 'string' && /^sankhya:seller:[1-9]\d*$/.test(actorSellerId) ? actorSellerId : '';
  const sellers = useConsulta(client, "sellers", sellerId ? [sellerId] : []);
  const estados = { customers, products, sellers };
  const erro = recursos.map((recurso) => estados[recurso].error).find(Boolean);
  return {
    customers: customers.rows,
    products: products.rows,
    sellers: sellers.rows,
    loading: recursos.some((recurso) => estados[recurso].loading),
    error: erro ? { message: erro } : undefined,
    totals: Object.fromEntries(recursos.map((recurso) => [recurso, estados[recurso].total])),
    hasMore: Object.fromEntries(recursos.map((recurso) => [recurso, estados[recurso].hasMore])),
  };
}
