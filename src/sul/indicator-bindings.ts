import catalogo from './catalogo.json';
import type {IndicatorSeries} from '../lib/erp-indicator-series';
export type IndicatorBinding={series:IndicatorSeries;view:'money-series'|'quantity'|'new-customers'|'active-customers'|'positivation'|'wallet'|'money-total'}|{local:'total'|'seller'|'day'}|{reason:string};
const v=catalogo.indicators.Vendas,p=catalogo.indicators['Positivação'],f=catalogo.indicators.Faturamento,a=catalogo.indicators.Atividades,o=catalogo.indicators.Outros;
const specific={reason:'Recorte específico não configurado; não presumir produto, categoria ou população.'};
export const INDICATOR_BINDINGS:Record<string,IndicatorBinding>={
 [v[0]!]:specific,[v[1]!]:{series:'items-day',view:'money-series'},[v[2]!]:{series:'items-seller',view:'money-series'},[v[3]!]:{series:'items-category',view:'quantity'},[v[4]!]:specific,[v[5]!]:{series:'sales-day',view:'money-series'},
 [p[0]!]:specific,[p[1]!]:{reason:'Agregado diário de compradores únicos ainda não conectado; não distribuir o total mensal pelos dias.'},[p[2]!]:{series:'customers-seller',view:'new-customers'},[p[3]!]:{series:'customers-seller',view:'active-customers'},[p[4]!]:specific,[p[5]!]:specific,[p[6]!]:specific,[p[7]!]:specific,[p[8]!]:{series:'wallet-seller',view:'positivation'},
 [f[0]!]:specific,[f[1]!]:{series:'billing-day',view:'money-series'},[f[2]!]:{series:'billing-seller',view:'money-total'},[f[3]!]:{series:'billing-seller',view:'money-series'},[f[4]!]:{series:'billing-day',view:'money-series'},
 [a[0]!]:{local:'total'},[a[1]!]:{local:'seller'},[a[2]!]:{local:'day'},[a[3]!]:{reason:'Cobertura indisponível: referência atividade→cliente ERP compatível com FK, responsável e RLS não comprovada.'},
 [o[0]!]:{series:'wallet-seller',view:'wallet'},[o[1]!]:{reason:'Classes ABC de clientes ainda não comprovadas no ERP; participação em vendas não define classe.'},[o[2]!]:{reason:'Fonte de conversão do e-commerce não conectada.'},
};
export function requiredIndicatorSeries(names:readonly string[]):IndicatorSeries[]{return [...new Set<IndicatorSeries>(['wallet-seller','commissions-seller','customers-seller-year',...names.flatMap(n=>{const s=INDICATOR_BINDINGS[n];return s&&'series'in s?[s.series]:[];})])];}
