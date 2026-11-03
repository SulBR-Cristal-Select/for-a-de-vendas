import {describe,it,expect,vi} from 'vitest';
import {customerPerformancePeriods,compareCustomerSales,collectCustomerSales} from './customer-performance';
import type {ERPClient} from './erp-hooks';
import {operationSeller,actorScope} from '../../supabase/functions/sankhya-online/identity';
describe('Comparativo e acumulado de clientes',()=>{
 it('compara meses completos e acumula apenas o ano selecionado, com fevereiro bissexto',()=>{expect(customerPerformancePeriods('2024-02')).toEqual({current:{from:'2024-02-01',to:'2024-02-29'},previous:{from:'2023-02-01',to:'2023-02-28'},year:{from:'2024-01-01',to:'2024-02-29'}});});
 it('inclui clientes que pararam de comprar, preserva valor desconhecido e não divide por zero',()=>{const r=compareCustomerSales([{id:'a',name:'A',total:'15'},{id:'c',name:'C',total:null},{id:'d',name:'D',total:'10'}],[{id:'a',name:'A',total:'10'},{id:'b',name:'B',total:'20'}]);expect(r.find(x=>x.id==='a')).toMatchObject({pct:50});expect(r.find(x=>x.id==='b')).toMatchObject({atual:'0',pct:-100});expect(r.find(x=>x.id==='c')).toMatchObject({atual:null,pct:null});expect(r.find(x=>x.id==='d')).toMatchObject({pct:null});});
 it('consulta base integral agrupada antes de comparar e rejeita paginação vazia',async()=>{const groupedWindow=vi.fn(async()=>({items:[],total:1,summary:{},companyCodes:[1]}));const client={customerGroupingEnabled:true,groupedWindow,salesReport:vi.fn()} as unknown as ERPClient;await expect(collectCustomerSales(client,{resource:'orders',groupBy:'customer',from:'2026-01-01',to:'2026-11-30'})).rejects.toMatchObject({code:'INVALID_RESPONSE'});expect(groupedWindow).toHaveBeenCalledTimes(1);expect(client.salesReport).not.toHaveBeenCalled();});
});
describe('Operação do gestor com autoria preservada',()=>{
 const id='00000000-0000-4000-8000-000000000001',binding={userId:id,sellerId:'sankhya:seller:34',sellerCode:34,companyCodes:[1] as const,teamSellerCodes:[12]};
 it('aceita somente o próprio vendedor ou equipe explicitamente vinculada do gestor',()=>{const scope=actorScope({id,company_id:'432299',active:true,role:'gestor',binding});expect(operationSeller(scope,12)).toBe(12);expect(operationSeller(scope,34)).toBe(34);for(const invalid of [99,'12',null,0])expect(()=>operationSeller(scope,invalid)).toThrow();});
 it('administrador não ganha delegação implícita e vendedor não ganha equipe',()=>{for(const role of ['administrador','vendedor'])expect(()=>operationSeller(actorScope({id,company_id:'432299',active:true,role,binding}),12)).toThrow();});
});
