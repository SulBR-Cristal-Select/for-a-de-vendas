import { describe, expect, it, vi } from 'vitest';
import handlerSource from '../../supabase/functions/sankhya-online/index.ts?raw';
import { SankhyaGateway, type NativePriceInput } from '../../supabase/functions/sankhya-online/gateway';
const input: NativePriceInput = { codigoEmpresa: 1, codigoCliente: 141, codigoVendedor: 14, codigoTipoOperacao: 1001, codigoTipoNegociacao: 29, dataNegociacao: '2026-10-23', produtos: [{ codigoProduto: 11240, unidade: 'PC', quantidade: 1.23456, codigoLocalEstoque: 0, controle: ' ' }] };
const json = (value: unknown) => new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } });
function transport(raw = '{"precos":[{"codigoProduto":11240,"unidade":"PC","valor":10.56}]}') {
  return vi.fn<typeof fetch>().mockImplementation(async url => String(url).endsWith('/authenticate') ? json({ access_token: 'TOKEN_SINTETICO', expires_in: 300 }) : String(url).includes('/gateway/') ? json({ status: '1', responseBody: { fieldsMetadata: [{ name: 'CODEMP' }, { name: 'CGC' }], rows: [[1, '13374270000104'], [4, '13374270000457']] } }) : new Response(raw));
}
describe('Serviço oficial de preços, sem endpoint de gravação ERP', () => {
  it('usa operação nova para nunca alcançar o modo antigo por propagação de deploy', () => {
    expect(handlerSource).toContain("input.operation === 'price-query'");
    expect(handlerSource).not.toContain("input.operation === 'price'");
  });
  it('verifica empresas, envia data DD/MM/AAAA e desativa a simulação de preço', async () => {
    const request = transport(), result = await new SankhyaGateway(key => key, request).contextPrices(input);
    expect(result['precos']).toMatchObject([{ valor: '10.56' }]);
    const call = request.mock.calls.at(-1)!;
    expect(call[0]).toBe('https://api.sankhya.com.br/v1/precos/contextualizado');
    const options = call[1] as RequestInit;
    expect(JSON.parse(String(options.body))).toEqual({ ...input, dataNegociacao: '23/10/2026', simularInclusao: false });
    expect(options.redirect).toBe('error');
    expect(request.mock.calls).toHaveLength(3);
  });
  it('aceita o nome real produtos somente com os campos de preço completos', async () => {
    const result = await new SankhyaGateway(key => key, transport('{"codigo":200,"produtos":[{"codigoProduto":11240,"unidade":"PC","valor":10.56}]}')).contextPrices(input);
    expect(result['precos']).toMatchObject([{ codigoProduto: 11240, unidade: 'PC', valor: '10.56' }]);
    const incomplete = new SankhyaGateway(key => key, transport('{"codigo":200,"produtos":[{"codigoProduto":11240,"precoBase":10.56}]}'));
    await expect(incomplete.contextPrices(input)).rejects.toMatchObject({ nativeFormat: { collectionName: 'produtos', rowFields: ['codigoProduto', 'precoBase'] } });
  });
  it('retém o literal original que JSON.parse arredondaria', async () => {
    const result = await new SankhyaGateway(key => key, transport('{"precos":[{"codigoProduto":11240,"valor":90071992547409.91}]}')).contextPrices(input);
    expect(result['precos']).toMatchObject([{ valor: '90071992547409.91' }]);
  });
  it('não guarda preço entre consultas e não aceita um contrato de resposta inexistente', async () => {
    const request = transport(), gateway = new SankhyaGateway(key => key, request);
    await gateway.contextPrices(input); await gateway.contextPrices(input);
    expect(request.mock.calls.filter(([url]) => String(url).includes('/precos/'))).toHaveLength(2);
    await expect(new SankhyaGateway(key => key, transport('{"codigo":200}')).contextPrices(input)).rejects.toMatchObject({ code: 'ERP_INVALID_RESPONSE' });
  });
  it('diagnostica somente formato, sem devolver mensagem bruta, preços não comprovados ou conteúdo privado', async () => {
    const gateway = new SankhyaGateway(key => key, transport('{"codigo":400,"mensagem":"CONTEUDO_PRIVADO: limite de crédito","status":"0"}'));
    const failure = await gateway.contextPrices(input).catch(error => error);
    expect(failure.nativeFormat).toMatchObject({ kind: 'missing_prices', providerCode: 400, hint: 'credit_rule', fields: ['codigo', 'mensagem', 'status'] });
    expect(JSON.stringify(failure)).not.toContain('CONTEUDO_PRIVADO');
    const wrapped = new SankhyaGateway(key => key, transport('{"status":"1","responseBody":{"precos":[{"codigoProduto":11240,"valor":10.56}]}}'));
    await expect(wrapped.contextPrices(input)).rejects.toMatchObject({ nativeFormat: { kind: 'missing_prices', responseBodyPrices: true } });
  });
  it('recusa empresa alheia e data impossível antes da rede', async () => {
    const request = transport(), gateway = new SankhyaGateway(key => key, request);
    await expect(gateway.contextPrices({ ...input, codigoEmpresa: 3 as 1 })).rejects.toMatchObject({ code: 'ERP_INVALID_QUERY' });
    await expect(gateway.contextPrices({ ...input, dataNegociacao: '2026-02-30' })).rejects.toMatchObject({ code: 'ERP_INVALID_QUERY' });
    expect(request).not.toHaveBeenCalled();
  });
});
