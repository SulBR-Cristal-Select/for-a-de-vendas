import {sulAI,aiModels} from './sul-ai.ts';
import {readCustomerMetrics} from './customer-metrics.ts';
import { readCustomerGroups, saveCustomerGroup, GROUP_KIND } from './customer-groups.ts';
import { groupedWindow } from './group-window.ts';
import {readIndicatorSeries} from './indicator-series.ts';
import {readOrderRegistry} from './order-registry.ts';
import {prepareSellerAccess} from './prepare-seller-access.ts';
import {provisionSellerAccess} from './provision-seller-access.ts';
import {readRanking} from './ranking.ts';
import {readReceivables} from './receivables.ts';
import {readBilledOrdersReport} from './history.ts';
import {readCommissions} from './commissions.ts';
import {readStock} from './stock.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';
import { SankhyaError, SankhyaGateway } from './gateway.ts';
import { metadataQuery } from './metadata.ts';
import { readOperationOptions } from './operations.ts';
import { readPrice } from './price-context.ts';
import { readCommercialDictionary } from './dictionary.ts';
import { readPaymentOptions } from './payments.ts';
import { revalidateOrderRequest } from './transactions.ts';
import { readHistory, readDocument, readSalesReport, readBillingReport, readOrderItemsReport, readGroupedMix } from './history.ts';
import { readWindow, readPage, readRecord, readFacets } from './read-model.ts';
import { readNonBuyers, readWallet } from './nonbuyers.ts';
import { actorScope } from './identity.ts';
import { reviewSubmission, submitOrder, submissionStatus, type ReceiptWriter } from './submission.ts';
import type { SubmissionReceipt } from '../../../src/lib/erp-submission-contract.ts';

// A chave de manutenção não substitui uma identidade de usuário para consultas comerciais.
const gateway = new SankhyaGateway(key => Deno.env.get(key));
const commercialGateway = { select: async (sql: string, limit: number) => {
  await gateway.ensureCompanyScope();
  return gateway.select(sql, limit);
} };
const sites = ['https://sales-spark-crew.lovable.app', 'https://forca-de-vendas-tau.vercel.app'];
const jsonKeys = (name: string): Record<string, string> => {
  try { const value = JSON.parse(Deno.env.get(name) || '{}'); return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; } catch { return {}; }
};
async function equalSecret(a: string | null, b: string | undefined): Promise<boolean> {
  if (!a || !b) return false;
  const digest = async (s: string) => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
  const x = await digest(a), y = await digest(b);
  let difference = 0; for (let i = 0; i < x.length; i++) difference |= x[i]! ^ y[i]!;
  return difference === 0;
}
async function maintenance(request: Request): Promise<boolean> {
  const authorization = request.headers.get('Authorization');
  const apikey = request.headers.get('apikey');
  for (const key of Object.values(jsonKeys('SUPABASE_SECRET_KEYS'))) if (typeof key === 'string' && await equalSecret(apikey, key)) return true;
  const legacy = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  return !!legacy && (await equalSecret(authorization, `Bearer ${legacy}`) || await equalSecret(apikey, legacy));
}
async function actor(request: Request) {
  const authorization = request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) throw new SankhyaError('AUTH_REQUIRED', 'Entre na sua conta para acessar a SulBR.', 401);
  const key = jsonKeys('SUPABASE_PUBLISHABLE_KEYS')['default'] || Deno.env.get('SUPABASE_ANON_KEY');
  if (!key) throw new SankhyaError('SERVER_CONFIGURATION', 'A autenticação do servidor não está configurada.', 503);
  const client = createClient(Deno.env.get('SUPABASE_URL')!, key, {
    global: { headers: { Authorization: authorization } }, auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: { user }, error } = await client.auth.getUser(authorization.slice(7));
  if (error || !user) throw new SankhyaError('AUTH_REQUIRED', 'Entre na sua conta para acessar a SulBR.', 401);
  const result = await client.from('profiles').select('id,company_id,role,active').eq('id', user.id).eq('company_id', '432299').limit(1).maybeSingle();
  if (result.error) throw new SankhyaError('PROFILE_UNAVAILABLE', 'Não foi possível validar o acesso da conta.', 503);
  if (!result.data?.active || !['administrador', 'gestor', 'vendedor'].includes(result.data.role)) throw new SankhyaError('MEMBERSHIP_PENDING', 'Seu acesso à SulBR está pendente de ativação pelo administrador.', 403);
  const linked = await client.rpc('erp_actor_binding');
  if (linked.error) throw new SankhyaError('PROFILE_UNAVAILABLE', 'Não foi possível validar o acesso da conta.', 503);
  const profile = { ...result.data, client, binding: linked.data };
  actorScope(profile, linked.data); // Valida somente o vínculo obtido pelo Auth no servidor.
  return profile;
}
async function serverOrderRPC(args: Record<string, unknown>, name: 'attest_erp_order_request' | 'erp_submission_write') {
  const url = Deno.env.get('SUPABASE_URL');
  const key = jsonKeys('SUPABASE_SECRET_KEYS')['default'] || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (url !== 'https://cxurczhmrvxcuvklyiht.supabase.co' || !key) throw new SankhyaError('ERP_REVALIDATION_UNAVAILABLE', 'Escritor de prova comercial não configurado.', 503);
  // A chave técnica só registra prova privada. O autor Auth real é revalidado pelo SQL.
  const response = await fetch(url + '/rest/v1/rpc/' + name, { method: 'POST', headers: { apikey: key, 'Content-Type': 'application/json', ...(!key.startsWith('sb_secret_') ? { Authorization: `Bearer ${key}` } : {}) }, body: JSON.stringify(args), signal: AbortSignal.timeout(15000), redirect: 'error' });
  const data = await response.json();
  if (!response.ok) {
    if (data?.code === 'PT409') throw new SankhyaError('REVISION_CONFLICT', 'Recarregue os dados antes de salvar.', 409);
    if (String(data?.message || '').includes('ERP_PROOF_EXPIRED')) throw new SankhyaError('ERP_PROOF_EXPIRED', 'Revalidação expirada. Confira o pedido antes de tentar novamente.', 409);
    throw new SankhyaError('ERP_REVALIDATION_UNAVAILABLE', 'Não foi possível registrar a prova comercial.', 503);
  }
  return data;
}
const attestOrder = (args: Record<string, unknown>) => serverOrderRPC(args, 'attest_erp_order_request');
const writeSubmission: ReceiptWriter = async args => {
  const result = await serverOrderRPC(args, 'erp_submission_write');
  if (!result || typeof result.acquired !== 'boolean' || !result.receipt || typeof result.receipt.id !== 'string') throw new SankhyaError('ERP_SUBMISSION_UNAVAILABLE', 'Não foi possível conferir o recibo de envio.', 503);
  return { acquired: result.acquired, receipt: result.receipt as SubmissionReceipt };
};
Deno.serve(async (request: Request) => {
  const started = performance.now();
  const origin = request.headers.get('Origin');
  const allowed = !origin || sites.includes(origin) || origin === 'https://supabase.com' || /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', Vary: 'Origin',
    'Access-Control-Allow-Headers': 'authorization,apikey,content-type,x-client-info',
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
  };
  if (origin && allowed) headers['Access-Control-Allow-Origin'] = origin;
  const reply = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers });
  if (!allowed) return reply({ code: 'ORIGIN_NOT_ALLOWED', message: 'Origem não autorizada.' }, 403);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (request.method !== 'POST') return reply({ code: 'METHOD_NOT_ALLOWED', message: 'Método não autorizado.' }, 405);
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > 10000000) return reply({ code: 'INVALID_REQUEST', message: 'Consulta excessivamente grande.' }, 413);
    const input = JSON.parse(raw);
    if (!input || typeof input !== 'object' || Array.isArray(input) || typeof input.operation !== 'string') return reply({ code: 'INVALID_REQUEST', message: 'Consulta inválida.' }, 400);
    if (input.operation !== 'prepare-order-save' && raw.length > 16384) return reply({ code: 'INVALID_REQUEST', message: 'Consulta excessivamente grande.' }, 413);
    if (input.operation === 'probe') {
      if (!await maintenance(request)) {
        const profile = await actor(request);
        if (profile.role !== 'administrador') throw new SankhyaError('FORBIDDEN', 'Operação reservada ao administrador.', 403);
      }
      // A chave técnica não representa usuário nem autoriza leitura comercial.
      if (input.check !== undefined && input.check !== 'schema') {
        throw new SankhyaError('INVALID_REQUEST', 'Diagnóstico técnico inválido.', 400);
      }
      if (input.check === 'schema') {
        const columns = await gateway.select(metadataQuery(input.table, input.after ?? ''), 50);
        return reply({ ok: true, source: 'sankhya', table: input.table, columns, next: columns.length === 50 ? columns.at(-1)?.['COLUMN_NAME'] : null, readAt: new Date().toISOString() });
      }
      if (input.check !== undefined) throw new SankhyaError('INVALID_REQUEST', 'Diagnóstico não autorizado.', 400);
      const companies = await gateway.verifyCompanies();
      return reply({ ok: true, source: 'sankhya', authenticationVerified: true, companiesVerified: companies, latencyMs: Math.round(performance.now() - started), readAt: new Date().toISOString() });
    }
    const profile = await actor(request);
    // Mesmo usuário Auth e vínculo privado em catálogo, cotação e preparação.
    // Nenhum vendedor/filial do corpo HTTP se transforma em autoridade.
    const scope = actorScope(profile);
    const groupStore = () => {
      const url=Deno.env.get('SUPABASE_URL'),key=jsonKeys('SUPABASE_SECRET_KEYS')['default']||Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
      if(url!=='https://cxurczhmrvxcuvklyiht.supabase.co'||!key)throw new SankhyaError('ERP_CONTEXT_REQUIRED','Cadastro de agrupamentos indisponível.',503);
      const admin=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
      return {
        list:async()=>{const r=await admin.from('workspace_records').select('id,data',{count:'exact'}).eq('company_id',profile.company_id).eq('kind',GROUP_KIND).limit(1001);if(r.error||!r.data||r.count===null||r.count>1000||r.data.length!==r.count)throw new SankhyaError('ERP_CONTEXT_REQUIRED','Não foi possível ler integralmente os agrupamentos.',502);return r.data;},
        save:async(value:Record<string,unknown>)=>{const r=await admin.rpc('customer_group_write',{p_actor_id:profile.id,p_group:value});if(r.error)throw new SankhyaError(r.error.code==='PT409'?'REVISION_CONFLICT':'INVALID_REQUEST',r.error.code==='PT409'?'Agrupamento alterado; recarregue antes de salvar.':r.error.message, r.error.code==='PT409'?409:400);return r.data;}
      };
    };
    const observation=()=>({source:'sankhya',readOnly:true,readAt:new Date().toISOString()});
    let groupsPromise:ReturnType<typeof readCustomerGroups>|undefined;
    const currentGroups=()=>groupsPromise??=readCustomerGroups(commercialGateway,scope,groupStore());
    const identifyMembers=async(result:any)=>{
      const groups=await currentGroups();
      const mark=(row:any)=>{if(!row||typeof row!=='object')return row;const customerId=String(row.customerId??(String(row.id).startsWith('sankhya:customer:')?row.id:''));const group=groups.find(g=>g.memberIds.includes(customerId));if(!group)return row;const label='Integrante do agrupamento '+group.name;return {...row,customerGroup:{id:group.id,name:group.name,label},...(String(row.id).startsWith('sankhya:customer:')?{name:row.name+' · '+label}:{}),...(row.customerName?{customerName:row.customerName+' · '+label}:{}),...(row.customer?{customer:row.customer+' · '+label}:{})};};
      return {...result,...('record'in result?{record:mark(result.record)}:{}),...(Array.isArray(result.items)?{items:result.items.map(mark)}:{})};
    };

    if(input.operation==='ai-models') {
      if(profile.role!=='administrador')throw new SankhyaError('FORBIDDEN','Consulta reservada ao administrador.',403);
      return reply({models:await aiModels(Deno.env.get('SUL_AI_API_KEY'))});
    }
    if(input.operation==='sul-ai') return reply(await sulAI(input.query,{key:Deno.env.get('SUL_AI_API_KEY'),model:Deno.env.get('SUL_AI_MODEL'),read:async(operation,query)=>{
      if(!query.customerId&&((operation==='window'&&query.resource==='customers')||['wallet-report','nonbuyers-report'].includes(operation)||(['sales-report','billing-report'].includes(operation)&&query.groupBy==='customer')))return groupedWindow({operation,query},await currentGroups(),async(op,q)=>{
        if(op==='window')return readWindow(commercialGateway,q as any,scope);
        if(op==='wallet-report')return readWallet(commercialGateway,q,scope);
        if(op==='nonbuyers-report')return readNonBuyers(commercialGateway,q,scope);
        if(op==='sales-report')return readSalesReport(commercialGateway,q,scope);
        if(op==='billing-report')return readBillingReport(commercialGateway,q,scope);
        if(op==='group-mix'){const {memberIds,...input}=q;return readGroupedMix(commercialGateway,input as any,scope,memberIds);}
        throw new SankhyaError('INVALID_REQUEST','Consulta inválida.',400);
      });
      if(operation==='window')return readWindow(commercialGateway,query as any,scope);
      if(operation==='sales-report')return identifyMembers(await readSalesReport(commercialGateway,query,scope));
      if(operation==='billing-report')return identifyMembers(await readBillingReport(commercialGateway,query,scope));
      if(operation==='wallet-report')return readWallet(commercialGateway,query,scope);
      if(operation==='nonbuyers-report')return readNonBuyers(commercialGateway,query,scope);
      if(operation==='stock-report')return readStock(commercialGateway,query,scope);
      if(operation==='order-items-report')return identifyMembers(await readOrderItemsReport(commercialGateway,query,scope));
      if(operation==='history')return identifyMembers(await readHistory(commercialGateway,query,scope));
      if(operation==='document')return identifyMembers(await readDocument(commercialGateway,query,scope));
      throw new SankhyaError('INVALID_REQUEST','Consulta não autorizada.',400);
    }}));
    if(input.operation==='customer-groups') {
      if(!input.query||Object.keys(input.query).length)throw new SankhyaError('INVALID_REQUEST','Consulta inválida.',400);
      return reply({...observation(),groups:await readCustomerGroups(commercialGateway,scope,groupStore())});
    }
    if(input.operation==='customer-group-save') return reply({...observation(),result:await saveCustomerGroup(commercialGateway,scope,input.query,groupStore())});
    if(input.operation==='grouped-window') {
      const groups=await readCustomerGroups(commercialGateway,scope,groupStore());
      return reply(await groupedWindow(input.query,groups,async(operation,query)=>{
        if(operation==='window')return readWindow(commercialGateway,query as any,scope);
        if(operation==='wallet-report')return readWallet(commercialGateway,query,scope);
        if(operation==='nonbuyers-report')return readNonBuyers(commercialGateway,query,scope);
        if(operation==='group-mix'){const {memberIds,...input}=query;return readGroupedMix(commercialGateway,input as any,scope,memberIds);}
        if(operation==='sales-report')return readSalesReport(commercialGateway,query,scope);
        if(operation==='billing-report')return readBillingReport(commercialGateway,query,scope);
        throw new SankhyaError('INVALID_REQUEST','Consulta inválida.',400);
      }));
    }
    if(input.operation==='seller-access-provision'){
      if(profile.id!=='a46afcc5-14fd-4dd9-bd00-759e91b946ca'||profile.role!=='administrador')throw new SankhyaError('FORBIDDEN','Provisionamento reservado ao administrador autorizado.',403);
      const url=Deno.env.get('SUPABASE_URL'),key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||jsonKeys('SUPABASE_SECRET_KEYS')['default'];
      if(url!=='https://cxurczhmrvxcuvklyiht.supabase.co'||!key)throw new SankhyaError('SERVER_CONFIGURATION','Administração Auth indisponível.',503);
      const admin=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
      return reply(await provisionSellerAccess({users:async()=>{const r=await admin.auth.admin.listUsers({page:1,perPage:50});return r.error?null:{users:r.data.users,complete:(r.data.total??r.data.users.length)<=50&&!r.data.nextPage};},profile:async id=>{const r=await admin.from('profiles').select('id,company_id,role,active').eq('id',id).eq('company_id','432299').maybeSingle();return r.error?null:r.data;},createUser:async attributes=>{const r=await admin.auth.admin.createUser(attributes);return r.error?null:r.data.user;}},profile,input.query));
    }
    if(input.operation==='seller-access-prepare'){
      if(profile.id!=='a46afcc5-14fd-4dd9-bd00-759e91b946ca'||profile.role!=='administrador')throw new SankhyaError('FORBIDDEN','Preparação reservada ao administrador autorizado.',403);
      const url=Deno.env.get('SUPABASE_URL'),key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||jsonKeys('SUPABASE_SECRET_KEYS')['default'];
      if(url!=='https://cxurczhmrvxcuvklyiht.supabase.co'||!key)throw new SankhyaError('SERVER_CONFIGURATION','Administração Auth indisponível.',503);
      const admin=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
      return reply(await prepareSellerAccess({profile:async id=>{const r=await admin.from('profiles').select('id,company_id,role,active').eq('id',id).eq('company_id','432299').maybeSingle();return r.error?null:r.data;},getUser:async id=>{const r=await admin.auth.admin.getUserById(id);return r.error?null:r.data.user;},updateUser:async(id,attributes)=>{const r=await admin.auth.admin.updateUserById(id,attributes);return r.error?null:r.data.user;}},profile,input.query));
    }
    if (['order-send-review','order-send-submit','order-send-status'].includes(input.operation)) {
      const deps = { gateway: { ...commercialGateway, contextPrices: gateway.contextPrices.bind(gateway), includeOrder: gateway.includeOrder.bind(gateway), confirmOrder: gateway.confirmOrder.bind(gateway) }, actor: profile, rpc: async (name: string, args: Record<string, unknown>) => await profile.client.rpc(name, args), write: writeSubmission };
      if (input.operation === 'order-send-review') return reply(await reviewSubmission(deps, input.query));
      if (input.operation === 'order-send-status') return reply(await submissionStatus(deps, input.query));
      return reply(await submitOrder(deps, input.query));
    }
    if (input.operation === 'prepare-order-save') return reply(await revalidateOrderRequest({ ...commercialGateway, contextPrices: q => gateway.contextPrices(q) }, input.query, profile, async (name, args) => await profile.client.rpc(name, args), attestOrder));
    if (input.operation === 'payment-options') return reply(await readPaymentOptions(commercialGateway, input.query, scope));
    if (input.operation === 'history') return reply(await identifyMembers(await readHistory(commercialGateway, input.query, scope)));
    if(input.operation==='indicator-series')return reply(await readIndicatorSeries(commercialGateway,input.query,scope,await currentGroups()));
    if(input.operation==='ranking-report')return reply(await readRanking(commercialGateway,input.query,scope,async(month,companies)=>{const r=await profile.client.rpc('erp_sales_targets_read',{p_month:month,p_company_codes:companies});if(r.error)throw new SankhyaError('ERP_CONTEXT_REQUIRED','Metas locais indisponíveis para conferência.',502);return r.data;}));
    if (input.operation === 'sales-report') return reply(await identifyMembers(await readSalesReport(commercialGateway, input.query, scope)));
    if (input.operation === 'receivables-report') return reply(await identifyMembers(await readReceivables(commercialGateway,input.query,scope)));
    if (input.operation === 'commission-report') return reply(await identifyMembers(await readCommissions(commercialGateway, input.query, scope)));
    if (input.operation === 'stock-report') return reply(await readStock(commercialGateway, input.query, scope));
    if (input.operation === 'wallet-report') return reply(await readWallet(commercialGateway, input.query, scope));
    if (input.operation === 'nonbuyers-report') return reply(await readNonBuyers(commercialGateway, input.query, scope));
    if (input.operation === 'order-items-report') return reply(await identifyMembers(await readOrderItemsReport(commercialGateway, input.query, scope)));
    if (input.operation === 'billed-orders-report') return reply(await identifyMembers(await readBilledOrdersReport(commercialGateway, input.query, scope)));
    if (input.operation === 'billing-report') return reply(await identifyMembers(await readBillingReport(commercialGateway, input.query, scope)));
    if (input.operation === 'document') return reply(await identifyMembers(await readDocument(commercialGateway, input.query, scope)));
    if (input.operation === 'commercial-options') return reply(await readOperationOptions(commercialGateway, input.query, scope));
    if (input.operation === 'order-registry') return reply(await readOrderRegistry(commercialGateway,input.query,scope));
    if (input.operation === 'commercial-dictionary') return reply(input.query?.kind==='analytics'&&input.query?.section==='customers'?await readCustomerMetrics(commercialGateway,input.query,scope,false,await currentGroups()):await readCommercialDictionary(commercialGateway, input.query, scope));
    if (input.operation === 'price-query') return reply(await readPrice({ ...commercialGateway, contextPrices: q => gateway.contextPrices(q) }, input.query, scope));
    if (input.operation === 'window') return reply(await (input.query.resource==='customers'?identifyMembers(await readWindow(commercialGateway, input.query, scope)):readWindow(commercialGateway, input.query, scope)));
    if (input.operation === 'page') return reply(await (input.query.resource==='customers'?identifyMembers(await readPage(commercialGateway,input.query,scope)):readPage(commercialGateway,input.query,scope)));
    if (input.operation === 'record') return reply(await (input.query.resource==='customers'?identifyMembers(await readRecord(commercialGateway,input.query,scope)):readRecord(commercialGateway,input.query,scope)));
    if (input.operation === 'facets') return reply(await readFacets(commercialGateway, input.query, scope));
    return reply({ code: 'OPERATION_NOT_AVAILABLE', message: 'Operação de consulta ainda não disponível.' }, 400);
  } catch (error) {
    if (error instanceof SyntaxError) return reply({ code: 'INVALID_REQUEST', message: 'Consulta inválida.' }, 400);
    if (error instanceof SankhyaError) return reply({ code: error.code, message: error.message, ...(error.upstreamStatus ? { upstreamStatus: error.upstreamStatus } : {}), ...(error.nativeFormat ? { nativeFormat: error.nativeFormat } : {}) }, error.status);
    return reply({ code: 'SERVER_ERROR', message: 'Não foi possível executar a consulta da integração.' }, 500);
  }
});
