import { useEffect, useRef, useState } from 'react';
import type { ERPClient } from './erp-hooks';
import type { ERPPriceQuery, ERPRow } from '../lib/erp-online';

/** Preço indicativo para uma unidade base; o item continua sendo recotado ao adicionar/salvar. */
export function useERPCatalogPrices(client: ERPClient | undefined, context: Omit<ERPPriceQuery, 'productId'>, rows: ERPRow[], enabled: boolean) {
  const key = JSON.stringify([context, rows.map(row => [row['id'], row['unit']])]);
  const current = useRef({client, key}); current.current = {client, key};
  const [state, setState] = useState<{client: ERPClient; key: string; labels: Record<string,string>}>();
  useEffect(() => {
    if (!enabled || !client || !context.customerId.startsWith('sankhya:customer:') || !Number.isSafeInteger(context.paymentCode) || context.paymentCode < 1 || !context.sellerCode) return;
    let alive = true;
    const labels: Record<string,string> = {};
    setState({client, key, labels:{}});
    // Sequencial: respeita a coordenação de leituras ERP existente e evita rajada de cotações.
    void (async () => {
      for (const row of rows) {
        if (!alive || current.current.client !== client || current.current.key !== key) break;
        const id = String(row['id']), unit = row['unit'];
        if (!id.startsWith('sankhya:product:') || typeof unit !== 'string' || !unit) continue;
        try {
          const quote = await client.price({...context, productId:id, quantity:1, unit});
          labels[id] = `${quote.price.amount.toLocaleString('pt-BR', {style:'currency',currency:'BRL',maximumFractionDigits:9})} / ${unit} · quantidade 1`;
        } catch (error) {
          labels[id] = error instanceof Error ? error.message : 'Preço indisponível.';
        }
        if (alive && current.current.client === client && current.current.key === key) setState({client,key,labels:{...labels}});
      }
    })();
    return () => { alive=false; };
  }, [client, key, enabled]);
  return state && state.client===client && state.key===key ? state.labels : {};
}
