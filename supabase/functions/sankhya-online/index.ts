import { createClient } from 'npm:@supabase/supabase-js@2.118.0';
import { SankhyaError, SankhyaGateway } from './gateway.ts';
import { metadataQuery } from './metadata.ts';
import { readOperationOptions } from './operations.ts';
import { readPrice } from './price-context.ts';
import { readCommercialDictionary } from './dictionary.ts';
import { readPaymentOptions } from './payments.ts';
import { revalidateOrderRequest } from './transactions.ts';
import { readHistory, readDocument, readSalesReport } from './history.ts';
import { readWindow, readPage, readRecord, readFacets } from './read-model.ts';
import { actorScope } from './identity.ts';

// A chave de manutenção não substitui uma identidade de usuário para consultas comerciais.
const gateway = new SankhyaGateway(key => Deno.env.get(key));
const commercialGateway = { select: async (sql: string, limit: number) => {
  await gateway.ensureCompanyScope();
  return gateway.select(sql, limit);
} };
const site = 'https://sales-spark-crew.lovable.app';
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
async function attestOrder(args: Record<string, unknown>) {
  const url = Deno.env.get('SUPABASE_URL');
  const key = jsonKeys('SUPABASE_SECRET_KEYS')['default'] || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (url !== 'https://cxurczhmrvxcuvklyiht.supabase.co' || !key) throw new SankhyaError('ERP_REVALIDATION_UNAVAILABLE', 'Escritor de prova comercial não configurado.', 503);
  // A chave técnica só registra prova privada. O autor Auth real é revalidado pelo SQL.
  const response = await fetch(url + '/rest/v1/rpc/attest_erp_order_request', { method: 'POST', headers: { apikey: key, 'Content-Type': 'application/json', ...(!key.startsWith('sb_secret_') ? { Authorization: `Bearer ${key}` } : {}) }, body: JSON.stringify(args), signal: AbortSignal.timeout(15000), redirect: 'error' });
  const data = await response.json();
  if (!response.ok) {
    if (data?.code === 'PT409') throw new SankhyaError('REVISION_CONFLICT', 'Recarregue os dados antes de salvar.', 409);
    if (String(data?.message || '').includes('ERP_PROOF_EXPIRED')) throw new SankhyaError('ERP_PROOF_EXPIRED', 'Revalidação expirada. Confira o pedido antes de tentar novamente.', 409);
    throw new SankhyaError('ERP_REVALIDATION_UNAVAILABLE', 'Não foi possível registrar a prova comercial.', 503);
  }
  return data;
}
Deno.serve(async (request: Request) => {
  const started = performance.now();
  const origin = request.headers.get('Origin');
  const allowed = !origin || origin === site || origin === 'https://supabase.com' || /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin);
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
    if (input.operation === 'prepare-order-save') return reply(await revalidateOrderRequest({ ...commercialGateway, contextPrices: q => gateway.contextPrices(q) }, input.query, profile, async (name, args) => await profile.client.rpc(name, args), attestOrder));
    if (input.operation === 'payment-options') return reply(await readPaymentOptions(commercialGateway, input.query, scope));
    if (input.operation === 'history') return reply(await readHistory(commercialGateway, input.query, scope));
    if (input.operation === 'sales-report') return reply(await readSalesReport(commercialGateway, input.query, scope));
    if (input.operation === 'document') return reply(await readDocument(commercialGateway, input.query, scope));
    if (input.operation === 'commercial-options') return reply(await readOperationOptions(commercialGateway, input.query, scope));
    if (input.operation === 'commercial-dictionary') return reply(await readCommercialDictionary(commercialGateway, input.query, scope));
    if (input.operation === 'price-query') return reply(await readPrice({ ...commercialGateway, contextPrices: q => gateway.contextPrices(q) }, input.query, scope));
    if (input.operation === 'window') return reply(await readWindow(commercialGateway, input.query, scope));
    if (input.operation === 'page') return reply(await readPage(commercialGateway, input.query, scope));
    if (input.operation === 'record') return reply(await readRecord(commercialGateway, input.query, scope));
    if (input.operation === 'facets') return reply(await readFacets(commercialGateway, input.query, scope));
    return reply({ code: 'OPERATION_NOT_AVAILABLE', message: 'Operação de consulta ainda não disponível.' }, 400);
  } catch (error) {
    if (error instanceof SyntaxError) return reply({ code: 'INVALID_REQUEST', message: 'Consulta inválida.' }, 400);
    if (error instanceof SankhyaError) return reply({ code: error.code, message: error.message, ...(error.upstreamStatus ? { upstreamStatus: error.upstreamStatus } : {}), ...(error.nativeFormat ? { nativeFormat: error.nativeFormat } : {}) }, error.status);
    return reply({ code: 'SERVER_ERROR', message: 'Não foi possível executar a consulta da integração.' }, 500);
  }
});
