import { describe, expect, it, vi } from "vitest";
import { SankhyaGateway } from "../../supabase/functions/sankhya-online/gateway";
import { metadataQuery } from "../../supabase/functions/sankhya-online/metadata";
const env = (key: string) => key; // Identificadores sintéticos, não credenciais.
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
const token = () => json({ access_token: "TOKEN_SINTETICO_DE_TESTE", expires_in: 300 });
const companies = (
  rows: unknown[][] = [
    [1, "13374270000104"],
    [4, "13374270000457"],
  ],
) =>
  json({
    status: "1",
    responseBody: { fieldsMetadata: [{ name: "CODEMP" }, { name: "CGC" }], rows },
  });
const query = "SELECT CODEMP, CGC FROM TSIEMP WHERE CODEMP IN (1,4) AND ROWNUM <= 2";
describe("dicionário técnico restrito", () => {
  it("pagina somente campos de tabela explicitamente autorizada", () => {
    const sql = metadataQuery("TGFCPL", "CODPARC");
    expect(sql).toContain("TABLE_NAME='TGFCPL'");
    expect(sql).toContain("COLUMN_NAME>'CODPARC'");
    expect(sql).toContain("ROWNUM<=50");
  });
  it("não compara string vazia com NULL no primeiro recorte Oracle", () => {
    expect(metadataQuery("TGFCPL")).not.toContain("COLUMN_NAME>");
    expect(metadataQuery("TGFCPL")).toContain("TABLE_NAME='TGFCPL' ORDER BY");
  });
  it.each(["TSIUSU", "AUTH.USERS", "TGFCPL;DELETE", "TGFCPL'", "tgfcpl"])(
    "recusa tabela fora da lista: %s",
    (table) => {
      expect(() => metadataQuery(table)).toThrow("Consulta de campos não autorizada.");
    },
  );
  it("recusa cursor executável e nomes excessivos", () => {
    expect(() => metadataQuery("TGFCPL", "X' OR 1=1")).toThrow();
    expect(() => metadataQuery("TGFCPL", "A".repeat(41))).toThrow();
  });
});
describe("transporte Sankhya somente leitura", () => {
  it("confirma os dois CNPJs autorizados usando OAuth2 e consulta limitada", async () => {
    const request = vi.fn().mockResolvedValueOnce(token()).mockResolvedValueOnce(companies());
    expect(await new SankhyaGateway(env, request).verifyCompanies()).toEqual([1, 4]);
    expect(request.mock.calls[0]?.[0]).toBe("https://api.sankhya.com.br/authenticate");
    const auth = request.mock.calls[0]?.[1] as RequestInit;
    expect(auth.headers).toEqual({
      "Content-Type": "application/x-www-form-urlencoded",
      "X-Token": "SANKHYA_X_TOKEN",
    });
    expect(String(auth.body)).toBe(
      "client_id=SANKHYA_CLIENT_ID&client_secret=SANKHYA_CLIENT_SECRET&grant_type=client_credentials",
    );
    const read = request.mock.calls[1]?.[1] as RequestInit;
    expect((read.headers as Record<string, string>)["Authorization"]).toBe(
      "Bearer TOKEN_SINTETICO_DE_TESTE",
    );
    expect(JSON.parse(String(read.body)).requestBody.sql).toContain("ROWNUM <= 2");
    expect(read.redirect).toBe("error");
  });
  it("não chama a rede quando falta uma variável privada", async () => {
    const request = vi.fn();
    await expect(
      new SankhyaGateway(() => undefined, request).verifyCompanies(),
    ).rejects.toMatchObject({ code: "ERP_NOT_CONFIGURED", status: 503 });
    expect(request).not.toHaveBeenCalled();
  });
  it("não devolve corpo de erro ou dados privados na falha de autenticação", async () => {
    const request = vi.fn().mockResolvedValue(json({ detalhe: "NAO_DEVOLVER_ESTE_CONTEUDO" }, 401));
    const result = new SankhyaGateway(env, request).authenticate();
    await expect(result).rejects.toMatchObject({
      code: "ERP_AUTHENTICATION_FAILED",
      upstreamStatus: 401,
    });
    await expect(result).rejects.not.toHaveProperty(
      "message",
      expect.stringContaining("NAO_DEVOLVER"),
    );
    expect(request).toHaveBeenCalledTimes(1);
  });
  it("recusa resposta de autenticação sem token", async () => {
    await expect(
      new SankhyaGateway(env, vi.fn().mockResolvedValue(json({}))).authenticate(),
    ).rejects.toMatchObject({ code: "ERP_INVALID_RESPONSE" });
  });
  it("não permite quebra de cabeçalho no token", async () => {
    await expect(
      new SankhyaGateway(
        env,
        vi.fn().mockResolvedValue(json({ access_token: "teste\r\ninvalido" })),
      ).authenticate(),
    ).rejects.toMatchObject({ code: "ERP_INVALID_RESPONSE" });
  });
  it("compartilha somente o token válido, não uma carteira ou resultado comercial", async () => {
    const request = vi
      .fn()
      .mockImplementation(async (url: string) =>
        url.endsWith("/authenticate") ? token() : companies(),
      );
    const gateway = new SankhyaGateway(env, request);
    await gateway.verifyCompanies();
    await gateway.verifyCompanies();
    expect(request).toHaveBeenCalledTimes(3);
  });
  it("reaproveita só a validação de empresas do mesmo token, sem repetir a prova básica a cada página", async () => {
    const request = vi
      .fn()
      .mockImplementation(async (url: string) =>
        url.endsWith("/authenticate") ? token() : companies(),
      );
    const gateway = new SankhyaGateway(env, request);
    expect(await gateway.ensureCompanyScope()).toEqual([1, 4]);
    expect(await gateway.ensureCompanyScope()).toEqual([1, 4]);
    expect(request).toHaveBeenCalledTimes(2);
  });
  it("não memoriza escopo de empresas divergentes", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(token())
      .mockImplementation(async () =>
        companies([
          [1, "00000000000000"],
          [4, "13374270000457"],
        ]),
      );
    const gateway = new SankhyaGateway(env, request);
    await expect(gateway.ensureCompanyScope()).rejects.toMatchObject({
      code: "ERP_COMPANY_MISMATCH",
    });
    await expect(gateway.ensureCompanyScope()).rejects.toMatchObject({
      code: "ERP_COMPANY_MISMATCH",
    });
    expect(request).toHaveBeenCalledTimes(3);
  });
  it("não presume validade de token sem expiração informada", async () => {
    const request = vi
      .fn()
      .mockImplementation(async (url: string) =>
        url.endsWith("/authenticate") ? json({ access_token: "TOKEN_SINTETICO" }) : companies(),
      );
    const gateway = new SankhyaGateway(env, request);
    await gateway.verifyCompanies();
    await gateway.verifyCompanies();
    expect(request).toHaveBeenCalledTimes(4);
  });
  it.each([
    "DELETE FROM TSIEMP",
    "SELECT CODEMP FROM TSIEMP; DELETE FROM TSIEMP",
    "SELECT CODEMP FROM TSIEMP -- teste",
  ])("recusa escrita, múltiplas instruções e comentários: %s", async (sql) => {
    const request = vi.fn();
    await expect(new SankhyaGateway(env, request).select(sql, 2)).rejects.toMatchObject({
      code: "ERP_INVALID_QUERY",
    });
    expect(request).not.toHaveBeenCalled();
  });
  it.each([0, 51, 1.5])("recusa limite de saída inválido: %s", async (limit) => {
    await expect(new SankhyaGateway(env, vi.fn()).select(query, limit)).rejects.toMatchObject({
      code: "ERP_INVALID_QUERY",
    });
  });
  it.each([
    ["authentication", "TimeoutError", "authentication:timeout"],
    ["authentication", "TypeError", "authentication:network"],
    ["query", "TimeoutError", "query:timeout"],
    ["query", "TypeError", "query:network"],
    ["query", "Error", "query:unclassified"],
  ])("identifica falha de transporte %s/%s sem repetir leitura", async (stage, name, hint) => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const error = Object.assign(new Error("CONTEUDO_PRIVADO SQL token senha"), { name });
      const request = vi.fn();
      if (stage === "query") request.mockResolvedValueOnce(token());
      request.mockRejectedValueOnce(error);
      const gateway = new SankhyaGateway(env, request);
      const result = stage === "query" ? gateway.select(query, 2) : gateway.authenticate();
      await expect(result).rejects.toMatchObject({
        code: "ERP_UNAVAILABLE",
        status: 503,
        nativeFormat: { kind: "transport-failure", fields: [], hint },
      });
      expect(log).toHaveBeenCalledWith("ERP_TRANSPORT_FAILURE_CLASS", hint);
      expect(JSON.stringify(log.mock.calls)).not.toContain("CONTEUDO_PRIVADO");
      expect(request).toHaveBeenCalledTimes(stage === "query" ? 2 : 1);
    } finally {
      log.mockRestore();
    }
  });
  it("não aceita lista vazia como comprovação das empresas", async () => {
    const request = vi.fn().mockResolvedValueOnce(token()).mockResolvedValueOnce(companies([]));
    await expect(new SankhyaGateway(env, request).verifyCompanies()).rejects.toMatchObject({
      code: "ERP_COMPANY_MISMATCH",
    });
  });
  it("recusa outro CNPJ mesmo quando o CODEMP coincide", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(token())
      .mockResolvedValueOnce(
        companies([
          [1, "00000000000000"],
          [4, "13374270000457"],
        ]),
      );
    await expect(new SankhyaGateway(env, request).verifyCompanies()).rejects.toMatchObject({
      code: "ERP_COMPANY_MISMATCH",
    });
  });
  it("recusa empresas duplicadas", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(token())
      .mockResolvedValueOnce(
        companies([
          [1, "13374270000104"],
          [1, "13374270000104"],
        ]),
      );
    await expect(new SankhyaGateway(env, request).verifyCompanies()).rejects.toMatchObject({
      code: "ERP_COMPANY_MISMATCH",
    });
  });
  it("recusa mais registros que o limite e linhas incompatíveis", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(token())
      .mockResolvedValueOnce(
        companies([
          [1, "13374270000104"],
          [4, "13374270000457"],
          [4, "13374270000457"],
        ]),
      );
    await expect(new SankhyaGateway(env, request).verifyCompanies()).rejects.toMatchObject({
      code: "ERP_INVALID_RESPONSE",
    });
    const malformed = vi
      .fn()
      .mockResolvedValueOnce(token())
      .mockResolvedValueOnce(companies([[1]]));
    await expect(new SankhyaGateway(env, malformed).verifyCompanies()).rejects.toMatchObject({
      code: "ERP_INVALID_RESPONSE",
    });
  });
  it.each([
    ["ORA-00904: CONTEUDO_PRIVADO", "oracle-00904"],
    ["Sessão inválida CONTEUDO_PRIVADO", "session"],
    ["Sem permissão CONTEUDO_PRIVADO", "permission"],
    ["Query timed out CONTEUDO_PRIVADO", "timeout"],
    ["CONTEUDO_PRIVADO", "unclassified"],
  ])("classifica rejeição sem expor conteúdo nativo: %s", async (message, hint) => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const request = vi
        .fn()
        .mockResolvedValueOnce(token())
        .mockResolvedValueOnce(json({ status: "0", statusMessage: message }));
      const result = new SankhyaGateway(env, request).select(query, 2);
      await expect(result).rejects.toMatchObject({
        code: "ERP_QUERY_REJECTED",
        nativeFormat: { kind: "query-rejection", fields: [], hint },
      });
      await expect(result).rejects.not.toHaveProperty(
        "message",
        expect.stringContaining("CONTEUDO_PRIVADO"),
      );
      expect(log).toHaveBeenCalledWith("ERP_QUERY_REJECTION_CLASS", hint);
      expect(JSON.stringify(log.mock.calls)).not.toContain("CONTEUDO_PRIVADO");
    } finally {
      log.mockRestore();
    }
  });
  it("repete somente leitura explicitamente recusada por concorrência e recupera os dados", async () => {
    vi.useFakeTimers();
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const request = vi
        .fn()
        .mockResolvedValueOnce(token())
        .mockResolvedValueOnce(
          json({ status: "0", statusMessage: "Limite de consultas simultâneas CONTEUDO_PRIVADO" }),
        )
        .mockResolvedValueOnce(companies());
      const result = new SankhyaGateway(env, request).select(query, 2);
      await vi.advanceTimersByTimeAsync(399);
      expect(request).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(1);
      expect(await result).toHaveLength(2);
      expect(request).toHaveBeenCalledTimes(3);
      expect(JSON.stringify(log.mock.calls)).not.toContain("CONTEUDO_PRIVADO");
    } finally {
      log.mockRestore();
      vi.useRealTimers();
    }
  });
  it("encerra após quatro recusas de concorrência sem transformar erro em lista vazia", async () => {
    vi.useFakeTimers();
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const request = vi
        .fn()
        .mockResolvedValueOnce(token())
        .mockImplementation(() =>
          Promise.resolve(
            json({
              status: "0",
              statusMessage: "Limite de consultas simultâneas CONTEUDO_PRIVADO",
            }),
          ),
        );
      const result = new SankhyaGateway(env, request).select(query, 2);
      const assertion = expect(result).rejects.toMatchObject({
        code: "ERP_QUERY_REJECTED",
        nativeFormat: { hint: "concurrency-limit" },
      });
      await vi.advanceTimersByTimeAsync(2800);
      await assertion;
      expect(request).toHaveBeenCalledTimes(5);
      expect(JSON.stringify(log.mock.calls)).not.toContain("CONTEUDO_PRIVADO");
    } finally {
      log.mockRestore();
      vi.useRealTimers();
    }
  });
  it("não trata HTTP 200 com rejeição do ERP como consulta válida", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(token())
      .mockResolvedValueOnce(json({ status: "0", statusMessage: "CONTEUDO_NAO_PUBLICAVEL" }));
    await expect(new SankhyaGateway(env, request).verifyCompanies()).rejects.toMatchObject({
      code: "ERP_QUERY_REJECTED",
    });
  });
});
