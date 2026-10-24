// Transporte somente leitura. Segredos permanecem exclusivamente no ambiente do servidor.
export class SankhyaError extends Error {
  constructor(public readonly code: string, message: string, public readonly status = 502,
    public readonly upstreamStatus?: number, public readonly nativeFormat?: { kind: string; fields: string[]; httpStatus?: number; responseBodyPrices?: boolean; dataPrices?: boolean; providerCode?: number | null; providerType?: string | null; hint?: string; collectionName?: string; rowFields?: string[]; valueTypes?: string[]; context?: { candidates: number; productMatches: number; unitMatches: number; localMatches: number; controlMatches: number; units: (string | null)[]; localTypes: string[]; controlTypes: string[]; controlLengths: number[]; distinctMatches?: number; candidateFields?: string[]; priceValuesEqual?: boolean } }) { super(message); }
}
type ObjectValue = Record<string, unknown>;
const object = (value: unknown): ObjectValue => value && typeof value === 'object' && !Array.isArray(value) ? value as ObjectValue : {};
export const EXPECTED_COMPANIES: Readonly<Record<string, string>> = { '1': '13374270000104', '4': '13374270000457' };
export type NativePriceInput = {
  codigoEmpresa: 1 | 4; codigoCliente: number; codigoVendedor: number;
  codigoTipoOperacao: number; codigoTipoNegociacao: number; dataNegociacao: string;
  produtos: { codigoProduto: number; unidade: string; quantidade: number; codigoLocalEstoque: number; controle: string }[];
};
export class SankhyaGateway {
  private token: string | null = null;
  private expiresAt = 0;
  private authenticating: Promise<string> | null = null;
  private verifiedForToken: string | null = null;
  private verifyingScope: Promise<number[]> | null = null;
  constructor(private readonly env: (key: string) => string | undefined, private readonly request: typeof fetch = fetch) {}
  async authenticate(): Promise<string> {
    if (this.token && Date.now() < this.expiresAt) return this.token;
    if (this.authenticating) return this.authenticating;
    this.authenticating = this.obtainToken();
    try { return await this.authenticating; } finally { this.authenticating = null; }
  }
  private async obtainToken(): Promise<string> {
    const clientId = this.env('SANKHYA_CLIENT_ID'), clientSecret = this.env('SANKHYA_CLIENT_SECRET'), xToken = this.env('SANKHYA_X_TOKEN');
    if (!clientId || !clientSecret || !xToken) throw new SankhyaError('ERP_NOT_CONFIGURED', 'A conexão com o Sankhya não foi configurada no servidor.', 503);
    let response: Response;
    try {
      response = await this.request('https://api.sankhya.com.br/authenticate', {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Token': xToken },
        body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, grant_type: 'client_credentials' }),
        signal: AbortSignal.timeout(12000), redirect: 'error',
      });
    } catch { throw new SankhyaError('ERP_UNAVAILABLE', 'Não foi possível acessar a autenticação do Sankhya.', 503); }
    if (!response.ok) throw new SankhyaError('ERP_AUTHENTICATION_FAILED', 'O Sankhya não aceitou a autenticação da integração.', 502, response.status);
    let value: ObjectValue;
    try { value = object(await response.json()); } catch { throw new SankhyaError('ERP_INVALID_RESPONSE', 'A autenticação do Sankhya retornou uma resposta incompatível.'); }
    const token = value['access_token'] ?? value['bearerToken'];
    if (typeof token !== 'string' || !token || /[\r\n]/.test(token)) throw new SankhyaError('ERP_INVALID_RESPONSE', 'O Sankhya não retornou um token de acesso válido.');
    this.token = token;
    const duration = Number(value['expires_in']);
    this.expiresAt = Number.isFinite(duration) && duration > 30 ? Date.now() + (duration - 30) * 1000 : 0;
    return token;
  }
  // O chamador é código servidor confiável; nenhuma consulta recebida do navegador é encaminhada.
  async select(sql: string, limit: number): Promise<ObjectValue[]> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 50 || !/^\s*(SELECT|WITH)\b/i.test(sql) || /;|--|\/\*|\b(INSERT|UPDATE|DELETE|MERGE|DROP|ALTER|CREATE|GRANT|EXECUTE|CALL|DBMS_|UTL_)\b/i.test(sql)) {
      throw new SankhyaError('ERP_INVALID_QUERY', 'Consulta de integração recusada.', 500);
    }
    const token = await this.authenticate();
    let response: Response;
    try {
      response = await this.request('https://api.sankhya.com.br/gateway/v1/mge/service.sbr?serviceName=DbExplorerSP.executeQuery&outputType=json', {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ serviceName: 'DbExplorerSP.executeQuery', requestBody: { sql } }),
        signal: AbortSignal.timeout(20000), redirect: 'error',
      });
    } catch { throw new SankhyaError('ERP_UNAVAILABLE', 'O Sankhya está indisponível para consulta.', 503); }
    if (!response.ok) throw new SankhyaError('ERP_QUERY_FAILED', 'Não foi possível consultar o Sankhya.', 502, response.status);
    let value: ObjectValue;
    try { value = object(await response.json()); } catch { throw new SankhyaError('ERP_INVALID_RESPONSE', 'O Sankhya retornou uma consulta incompatível.'); }
    if (String(value['status']) !== '1') throw new SankhyaError('ERP_QUERY_REJECTED', 'O Sankhya recusou a consulta da integração.');
    const body = object(value['responseBody']);
    const fields = body['fieldsMetadata'], rows = body['rows'];
    if (!Array.isArray(fields) || !Array.isArray(rows) || rows.length > limit) throw new SankhyaError('ERP_INVALID_RESPONSE', 'A consulta do Sankhya não respeitou o contrato de campos e limite.');
    const names = fields.map(field => object(field)['name']);
    if (!names.length || names.some(name => typeof name !== 'string') || new Set(names).size !== names.length) throw new SankhyaError('ERP_INVALID_RESPONSE', 'Os campos retornados pelo Sankhya são incompatíveis.');
    return rows.map(row => {
      if (!Array.isArray(row) || row.length !== names.length) throw new SankhyaError('ERP_INVALID_RESPONSE', 'Os registros retornados pelo Sankhya são incompatíveis.');
      return Object.fromEntries(names.map((name, index) => [name as string, row[index]]));
    });
  }
  // Consulta de preço com simulação explicitamente desativada. Não há rota de envio ou confirmação aqui.
  async contextPrices(input: NativePriceInput): Promise<ObjectValue> {
    const positive = (v: unknown) => typeof v === 'number' && Number.isSafeInteger(v) && v > 0 && v <= 9999999999;
    if (![1, 4].includes(input.codigoEmpresa) || !positive(input.codigoCliente) || !positive(input.codigoVendedor) || !positive(input.codigoTipoOperacao) || !positive(input.codigoTipoNegociacao) || !Array.isArray(input.produtos) || !input.produtos.length || input.produtos.length > 50 || input.produtos.some(p => !positive(p.codigoProduto) || typeof p.unidade !== 'string' || !p.unidade.trim() || p.unidade.length > 12 || typeof p.quantidade !== 'number' || !Number.isFinite(p.quantidade) || p.quantidade <= 0 || p.quantidade > 100000000 || (!Number.isSafeInteger(p.codigoLocalEstoque) || p.codigoLocalEstoque < 0) || (typeof p.controle !== 'string' || p.controle.length > 17))) {
      throw new SankhyaError('ERP_INVALID_QUERY', 'Contexto de preço recusado.', 400);
    }
    if (typeof input.dataNegociacao !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(input.dataNegociacao) || !Number.isFinite(Date.parse(input.dataNegociacao + 'T00:00:00Z')) || new Date(input.dataNegociacao + 'T00:00:00Z').toISOString().slice(0, 10) !== input.dataNegociacao) throw new SankhyaError('ERP_INVALID_QUERY', 'Data comercial inválida.', 400);
    await this.ensureCompanyScope();
    const token = await this.authenticate();
    let response: Response;
    try {
      response = await this.request('https://api.sankhya.com.br/v1/precos/contextualizado', {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...input, dataNegociacao: `${input.dataNegociacao.slice(8, 10)}/${input.dataNegociacao.slice(5, 7)}/${input.dataNegociacao.slice(0, 4)}`, simularInclusao: false }),
        signal: AbortSignal.timeout(30000), redirect: 'error',
      });
    } catch { throw new SankhyaError('ERP_UNAVAILABLE', 'O Sankhya está indisponível para consulta de preço.', 503); }
    if (!response.ok) throw new SankhyaError('ERP_PRICE_QUERY_FAILED', 'Não foi possível confirmar o preço no Sankhya.', 502, response.status);
    let value: ObjectValue;
    const diagnostic: NonNullable<SankhyaError['nativeFormat']> = { kind: 'non_json', fields: [], httpStatus: response.status };
    try {
      const raw = (await response.text()).replace(/^\uFEFF/, '');
      if (raw.length > 1000000) throw new Error('Limite de resposta.');
      value = object(JSON.parse(raw));
      diagnostic.kind = 'missing_prices';
      diagnostic.fields = Object.keys(value).filter(k => /^[A-Za-z_][A-Za-z0-9_]{0,60}$/.test(k) && !/^(sb_|eyJ)/.test(k)).slice(0, 30);
      diagnostic.providerType = typeof value['tipo'] === 'string' && ['success','error','sucesso','erro','s','e','info','warning','aviso'].includes(value['tipo'].toLowerCase()) ? value['tipo'].toLowerCase() : null;
      diagnostic.responseBodyPrices = Array.isArray(object(value['responseBody'])['precos']);
      diagnostic.dataPrices = Array.isArray(object(value['data'])['precos']);
      const providerCode = Number(value['codigo']);
      diagnostic.providerCode = value['codigo'] != null && Number.isSafeInteger(providerCode) && providerCode >= 0 && providerCode <= 599 ? providerCode : null;
      const message = [value['mensagem'],value['statusMessage'],value['message']].filter(v => typeof v === 'string').join(' ');
      diagnostic.hint = /cr[eé]dito|limite|bloquead/i.test(message) ? 'credit_rule' : /local.*estoque|codigoLocalEstoque|controle/i.test(message) ? 'stock_context' : /vendedor/i.test(message) ? 'seller_context' : /negocia|parcela|prazo|pagamento/i.test(message) ? 'payment_context' : /data.*inv[aá]lid|dataNegociacao/i.test(message) ? 'date_context' : /n[aã]o.*implement|m[oó]dulo|licen[cç]|permiss[aã]o|habilitad/i.test(message) ? 'capability' : 'not_classified';
      // O ERP real retornou `produtos`, divergindo do nome `precos` no OpenAPI.
      // A compatibilidade limita-se ao nome da coleção; campos/valores não são inventados.
      const collectionName = Array.isArray(value['precos']) ? 'precos' : Array.isArray(value['produtos']) ? 'produtos' : null;
      if (!collectionName) throw new Error('Coleção de preços não comprovada.');
      const entries = value[collectionName] as unknown[];
      diagnostic.collectionName = collectionName;
      diagnostic.rowFields = [...new Set(entries.slice(0, 3).flatMap(p => Object.keys(object(p))))].filter(k => /^[A-Za-z_][A-Za-z0-9_]{0,60}$/.test(k)).slice(0, 30);
      diagnostic.valueTypes = [...new Set(entries.map(p => typeof object(p)['valor']))];
      if (entries.length > 50 || entries.some(p => !p || typeof p !== 'object' || Array.isArray(p) || !['number','string'].includes(typeof object(p)['valor']))) throw new Error('Itens de preço não comprovados.');
      if ((diagnostic.providerCode !== null && diagnostic.providerCode! >= 400) || ['error','erro','e'].includes(diagnostic.providerType || '')) throw new Error('Preço não confirmado pelo provedor.');
      value = { ...value, precos: entries };
      diagnostic.kind = 'exact_value_mismatch';
      // Retém o literal monetário original: JSON.parse sozinho poderia perder centavos.
      const tokens = [...raw.matchAll(/"valor"\s*:\s*(-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)(?=\s*[,}])/g)].map(m => m[1]!);
      const numbers = entries.map(object).filter(p => typeof p['valor'] === 'number');
      if (tokens.length !== numbers.length) throw new Error('Valores sem correspondência.');
      numbers.forEach((p, i) => { if (Number(tokens[i]) !== p['valor']) throw new Error('Valor sem correspondência.'); p['valor'] = tokens[i]; });
    } catch { throw new SankhyaError('ERP_INVALID_RESPONSE', 'O Sankhya retornou um preço incompatível.', 502, undefined, diagnostic); }
    return value;
  }
  async ensureCompanyScope(): Promise<number[]> {
    const token = await this.authenticate();
    if (this.verifiedForToken === token) return [1, 4];
    if (this.verifyingScope) return this.verifyingScope;
    this.verifyingScope = this.verifyCompanies();
    try { return await this.verifyingScope; } finally { this.verifyingScope = null; }
  }
  async verifyCompanies(): Promise<number[]> {
    const rows = await this.select('SELECT CODEMP, CGC FROM TSIEMP WHERE CODEMP IN (1,4) AND ROWNUM <= 2 ORDER BY CODEMP', 2);
    if (rows.length !== 2 || new Set(rows.map(row => String(row['CODEMP']))).size !== 2 || rows.some(row => EXPECTED_COMPANIES[String(row['CODEMP'])] !== String(row['CGC']).replace(/\D/g, ''))) {
      throw new SankhyaError('ERP_COMPANY_MISMATCH', 'A integração não confirmou as duas empresas SulBR autorizadas.', 403);
    }
    this.verifiedForToken = this.token;
    return rows.map(row => Number(row['CODEMP'])).sort((a, b) => a - b);
  }
}
