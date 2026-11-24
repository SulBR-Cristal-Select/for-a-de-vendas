import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readNonBuyers, readWallet } from "../../supabase/functions/sankhya-online/nonbuyers";
const admin = { role: "administrador" as const },
  query = { resource: "customers", month: "2026-10", offset: 0, limit: 10 };
const day = (s: string) => Date.parse(s + "T00:00:00Z") / 86400000,
  opened: DatabaseSync[] = [];
const required = {
  TGFPAR: {
    CODPARC: "NUMBER",
    CODVEND: "NUMBER",
    CODEMP: "NUMBER",
    ATIVO: "VARCHAR2",
    CLIENTE: "VARCHAR2",
    RAZAOSOCIAL: "VARCHAR2",
    AD_CLASSE: "NUMBER",
  },
  AD_CLASSES: { ID: "NUMBER", DESCRCLASSE: "VARCHAR2" },
  TGFCAB: {
    CODPARC: "NUMBER",
    CODEMP: "NUMBER",
    NUNOTA: "NUMBER",
    CODTIPOPER: "NUMBER",
    CODNAT: "NUMBER",
    DTNEG: "DATE",
    DHTIPOPER: "DATE",
    TIPMOV: "VARCHAR2",
    STATUSNOTA: "VARCHAR2",
  },
  TGFTOP: {
    CODTIPOPER: "NUMBER",
    DHALTER: "DATE",
    TIPMOV: "VARCHAR2",
    BONIFICACAO: "VARCHAR2",
    GOLDEV: "NUMBER",
  },
  TGFVEN: { CODVEND: "NUMBER", APELIDO: "VARCHAR2" },
};
function fixture() {
  const db = new DatabaseSync(":memory:");
  opened.push(db);
  db.function("TO_DATE", { deterministic: true }, (v, _format) => day(String(v)));
  db.function("TO_CHAR", { deterministic: true }, (v) => (v === null ? null : String(v)));
  db.function("ASCIISTR", { deterministic: true }, (v) => v);
  db.function("TRANSLATE", { deterministic: true }, (v, _a, _b) =>
    v === null
      ? null
      : String(v)
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, ""),
  );
  db.function("NLSSORT", { deterministic: true }, (v, _s) => v);
  db.exec(
    "CREATE TABLE USER_TAB_COLUMNS(TABLE_NAME TEXT,COLUMN_NAME TEXT,DATA_TYPE TEXT);CREATE TABLE TGFPAR(CODPARC INTEGER,CODVEND INTEGER,CODEMP INTEGER,ATIVO TEXT,CLIENTE TEXT,RAZAOSOCIAL TEXT,BLOQUEAR TEXT,AD_CLASSE INTEGER);CREATE TABLE AD_CLASSES(ID INTEGER,DESCRCLASSE TEXT);CREATE TABLE TGFVEN(CODVEND INTEGER,APELIDO TEXT);CREATE TABLE TGFCAB(NUNOTA INTEGER,CODPARC INTEGER,CODEMP INTEGER,CODTIPOPER INTEGER,CODNAT INTEGER,DTNEG REAL,DHTIPOPER REAL,TIPMOV TEXT,STATUSNOTA TEXT,CODVEND INTEGER);CREATE TABLE TGFTOP(CODTIPOPER INTEGER,DHALTER REAL,TIPMOV TEXT,BONIFICACAO TEXT,GOLDEV INTEGER);",
  );
  for (const [t, fs] of Object.entries(required))
    for (const [n, type] of Object.entries(fs))
      db.prepare("INSERT INTO USER_TAB_COLUMNS VALUES(?,?,?)").run(t, n, type);
  db.prepare("INSERT INTO TGFTOP VALUES(1001,?,'P','N',1)").run(day("2026-07-01"));
  for (const n of [12, 34, 6, 7]) db.prepare("INSERT INTO TGFVEN VALUES(?,?)").run(n, "Nome igual");
  let seq = 1;
  const customer = (
    id: number,
    opts: {
      seller?: number | null;
      active?: string | null;
      company?: number | null;
      name?: string;
      blocked?: string;
    } = {},
  ) =>
    db
      .prepare("INSERT INTO TGFPAR VALUES(?,?,?,?,'S',?,?,?)")
      .run(
        id,
        opts.seller === undefined ? 12 : opts.seller,
        opts.company === undefined ? 1 : opts.company,
        opts.active === undefined ? "S" : opts.active,
        opts.name ?? `Cliente ${String(id).padStart(3, "0")}`,
        opts.blocked ?? "N",
      );
  const order = (
    id: number,
    date: string | null,
    opts: {
      company?: number;
      version?: string;
      type?: string;
      operation?: number;
      nature?: number;
      status?: string;
      seller?: number;
      number?: number | null;
    } = {},
  ) =>
    db
      .prepare("INSERT INTO TGFCAB VALUES(?,?,?,?,?,?,?,?,?,?)")
      .run(
        opts.number === undefined ? seq++ : opts.number,
        id,
        opts.company ?? 1,
        opts.operation ?? 1001,
        opts.nature ?? 10100000,
        date === null ? null : day(date),
        day(opts.version ?? "2026-07-01"),
        opts.type ?? "P",
        opts.status ?? "L",
        opts.seller ?? 12,
      );
  const g = {
    select: vi.fn(async (sql: string, limit: number) => {
      expect(limit).toBeGreaterThan(0);
      expect(limit).toBeLessThanOrEqual(50);
      expect(sql).toMatch(/^(SELECT|WITH) /);
      const converted = sql
        .replace(
          /OFFSET (\d+) ROWS FETCH NEXT (\d+) ROWS ONLY/g,
          (_m, o, n) => `LIMIT ${n} OFFSET ${o}`,
        )
        .replace(/FETCH FIRST (\d+) ROWS ONLY/g, "LIMIT $1");
      return db.prepare(converted).all() as Record<string, unknown>[];
    }),
  };
  return { db, g, customer, order };
}
afterEach(() => {
  for (const d of opened.splice(0)) d.close();
});
describe("ausência de compra padrão na carteira ativa atual — SQL adaptado, não Oracle", () => {
  it("inclui ativo sem compra e exclui comprador do mês, sem criar total monetário", async () => {
    const f = fixture();
    f.customer(1);
    f.customer(2);
    f.order(2, "2026-10-05");
    const r = await readNonBuyers(f.g, query, admin);
    expect(r).toMatchObject({
      total: 1,
      totalWithoutSearch: 1,
      items: [{ id: "sankhya:customer:1", localStatus: "Sem compra no mês 2026-10" }],
      summary: { walletCount: 2, customerCount: 1, currentWallet: true, activeValue: "S" },
    });
    expect(r.summary).not.toHaveProperty("documentAmount");
  });
  it.each([1107, 1108, 1162, 1102, 1101, 1134, 1130, 1125, 1171, 1122])(
    "TOP adicional %s comprova compra sem alterar criação",
    async (operation) => {
      const f = fixture();
      f.customer(1);
      f.db.prepare("INSERT INTO TGFTOP VALUES(?,?,'P','N',1)").run(operation, day("2026-07-01"));
      f.order(1, "2026-10-05", { operation });
      expect((await readNonBuyers(f.g, query, admin)).total).toBe(0);
    },
  );
  it("bloqueio financeiro não determina ATIVO; N/desconhecido não viram S", async () => {
    const f = fixture();
    f.customer(1, { blocked: "S" });
    f.customer(2, { active: "N" });
    f.customer(3, { active: null });
    expect(await readNonBuyers(f.g, query, admin)).toMatchObject({
      total: 1,
      items: [{ code: "1" }],
    });
  });
  it("limites mensais são inclusivo no início/exclusivo no mês seguinte", async () => {
    const f = fixture();
    for (const n of [1, 2, 3, 4]) f.customer(n);
    f.order(1, "2026-09-30");
    f.order(2, "2026-10-01");
    f.order(3, "2026-10-31");
    f.order(4, "2026-11-01");
    expect((await readNonBuyers(f.g, query, admin)).items.map((x) => x.code)).toEqual(["1", "4"]);
  });
  it.each([{ type: "V" }, { operation: 1003 }, { nature: 60300000 }, { status: "P" }])(
    "documento fora da venda padrão não vira compra: %j",
    async (opts) => {
      const f = fixture();
      f.customer(1);
      f.order(1, "2026-10-05", opts);
      expect((await readNonBuyers(f.g, query, admin)).total).toBe(1);
    },
  );
  it.each([
    ["S", 1],
    ["N", -1],
  ] as const)("bonificação/devolução não positiva: %s/%s", async (b, g) => {
    const f = fixture();
    f.customer(1);
    f.db.prepare("UPDATE TGFTOP SET BONIFICACAO=?,GOLDEV=?").run(b, g);
    f.order(1, "2026-10-05");
    expect((await readNonBuyers(f.g, query, admin)).total).toBe(1);
  });
  it("versão histórica exata da TOP, não a mais recente", async () => {
    const f = fixture();
    f.customer(1);
    f.db.prepare("INSERT INTO TGFTOP VALUES(1001,?,'P','S',1)").run(day("2026-01-01"));
    f.order(1, "2026-10-10", { version: "2026-01-01" });
    expect((await readNonBuyers(f.g, query, admin)).total).toBe(1);
  });
  it.each([null, "2026-10-01"])(
    "ausência não comprovada por data/TOP faltante falha fechada: %s",
    async (date) => {
      const f = fixture();
      f.customer(1);
      f.order(1, date, { version: "2025-01-01" });
      await expect(readNonBuyers(f.g, query, admin)).rejects.toMatchObject({
        code: "ERP_CONTEXT_REQUIRED",
      });
    },
  );
  it("venda padrão sem DTNEG impede concluir ausência; não usa outra data", async () => {
    const f = fixture();
    f.customer(1);
    f.order(1, null);
    await expect(readNonBuyers(f.g, query, admin)).rejects.toMatchObject({
      code: "ERP_CONTEXT_REQUIRED",
    });
  });
  it("compra válida no mês já prova comprador, apesar de outra origem incerta", async () => {
    const f = fixture();
    f.customer(1);
    f.order(1, null);
    f.order(1, "2026-10-05");
    expect((await readNonBuyers(f.g, query, admin)).total).toBe(0);
  });
  it("TOP desconhecida fora do mês não impede conclusão mensal", async () => {
    const f = fixture();
    f.customer(1);
    f.order(1, "2026-09-01", { version: "2025-01-01" });
    expect((await readNonBuyers(f.g, query, admin)).total).toBe(1);
  });
  it("TOP duplicada não positiva ou exclui cliente silenciosamente", async () => {
    const f = fixture();
    f.customer(1);
    f.db.exec("INSERT INTO TGFTOP SELECT * FROM TGFTOP");
    f.order(1, "2026-10-05");
    await expect(readNonBuyers(f.g, query, admin)).rejects.toMatchObject({
      code: "ERP_CONTEXT_REQUIRED",
    });
  });
  it("join/cadastro duplicado não multiplica carteira", async () => {
    const f = fixture();
    f.customer(1);
    f.db.prepare("INSERT INTO TGFVEN VALUES(12,'Outro nome')").run();
    await expect(readNonBuyers(f.g, query, admin)).rejects.toMatchObject({
      code: "ERP_CONTEXT_REQUIRED",
    });
  });
  it("documento sem identidade não vira ausência comprovada", async () => {
    const f = fixture();
    f.customer(1);
    f.order(1, "2026-10-05", { number: null });
    await expect(readNonBuyers(f.g, query, admin)).rejects.toMatchObject({
      code: "ERP_CONTEXT_REQUIRED",
    });
  });
  it("compra em4 não positiva a carteira da filial1", async () => {
    const f = fixture();
    f.customer(1, { company: null });
    f.order(1, "2026-09-05");
    f.order(1, "2026-10-05", { company: 4 });
    f.customer(2, { company: null });
    f.order(2, "2026-09-05", { company: 4 });
    expect(await readNonBuyers(f.g, query, admin)).toMatchObject({
      companyCodes: [1],
      total: 1,
      summary: { walletCount: 1 },
      items: [{ code: "1" }],
    });
  });
  it("NULL sem histórico permitido e empresa3 não criam carteira", async () => {
    const f = fixture();
    f.customer(1, { company: null });
    f.customer(2, { company: 3 });
    f.order(2, "2026-09-10", { company: 3 });
    expect((await readNonBuyers(f.g, query, admin)).total).toBe(0);
  });
  it("vendedor usa CODVEND atual; histórico por outro vendedor não muda identidade", async () => {
    const f = fixture();
    f.customer(1);
    f.customer(2, { seller: 34 });
    f.customer(3, { company: 4 });
    f.customer(4);
    f.order(4, "2026-10-05", { seller: 34 });
    expect(
      (
        await readNonBuyers(f.g, query, { role: "vendedor", sellerCode: 12, companyCodes: [1] })
      ).items.map((x) => x.code),
    ).toEqual(["1"]);
  });
  it("gestor só acessa o próprio código e equipe privada explícita, não nome igual", async () => {
    const f = fixture();
    for (const n of [12, 34, 6, 7]) f.customer(n, { seller: n });
    expect(
      (
        await readNonBuyers(f.g, query, {
          role: "gestor",
          sellerCode: 34,
          companyCodes: [1],
          teamSellerCodes: [6, 7],
        })
      ).items.map((x) => x.code),
    ).toEqual(["6", "7", "34"]);
  });
  it("filtra por código de cliente/vendedor, nunca por nome como identidade", async () => {
    const f = fixture();
    f.customer(1, { name: "Mesmo nome" });
    f.customer(2, { name: "Mesmo nome", seller: 34 });
    expect(
      (
        await readNonBuyers(
          f.g,
          { ...query, customerId: "sankhya:customer:2", sellerCode: 34 },
          admin,
        )
      ).items.map((x) => x.code),
    ).toEqual(["2"]);
  });
  it("65 clientes: paginação50/15, busca integral, ordenação numérica e homônimos distintos", async () => {
    const f = fixture();
    for (let n = 1; n <= 65; n++) f.customer(n, { name: "Mesmo nome" });
    const a = await readNonBuyers(f.g, { ...query, limit: 50, sort: "code" }, admin),
      b = await readNonBuyers(f.g, { ...query, offset: 50, limit: 50, sort: "code" }, admin);
    expect(a.total).toBe(65);
    expect(a.items).toHaveLength(50);
    expect(b.items).toHaveLength(15);
    expect(new Set([...a.items, ...b.items].map((x) => x.id)).size).toBe(65);
    expect(await readNonBuyers(f.g, { ...query, search: "65" }, admin)).toMatchObject({
      total: 1,
      totalWithoutSearch: 65,
      items: [{ code: "65" }],
    });
    expect(
      (await readNonBuyers(f.g, { ...query, sort: "code", direction: "desc" }, admin)).items[0]
        ?.code,
    ).toBe("65");
  });
  it("busca escapada não transforma percentual/coringa em todos os clientes", async () => {
    const f = fixture();
    f.customer(1, { name: "Cliente 100%" });
    f.customer(2);
    expect((await readNonBuyers(f.g, { ...query, search: "100%" }, admin)).total).toBe(1);
  });
  it.each(["2026-12", "2028-02"])("fronteira de calendário correta em %s", async (month) => {
    const f = fixture();
    const r = await readNonBuyers(f.g, { ...query, month }, admin);
    expect(r.summary.until).toBe(month === "2026-12" ? "2027-01-01" : "2028-03-01");
    expect(r).toMatchObject({ total: 0, summary: { walletCount: 0, customerCount: 0 } });
  });
  it.each([
    { month: "2026-13" },
    { month: "0000-01" },
    { month: "9999-12" },
    { offset: -1 },
    { limit: 51 },
    { resource: "products" },
    { sql: "SELECT 1" },
    { role: "administrador" },
    { companyCodes: [1, 4] },
    { sellerCode: 0 },
    { customerId: "manual-id" },
    { status: "Pendente" },
    { sort: "total" },
    { search: "x';DROP" },
  ])("recusa entrada antes do ERP: %j", async (patch) => {
    const f = fixture();
    await expect(readNonBuyers(f.g, { ...query, ...patch }, admin)).rejects.toBeDefined();
    expect(f.g.select).not.toHaveBeenCalled();
  });
  it("recusa vendedor fora do escopo antes de consultar", async () => {
    const f = fixture();
    await expect(
      readNonBuyers(
        f.g,
        { ...query, sellerCode: 34 },
        { role: "vendedor", sellerCode: 12, companyCodes: [1] },
      ),
    ).rejects.toMatchObject({ code: "ERP_SCOPE_FORBIDDEN" });
    expect(f.g.select).not.toHaveBeenCalled();
  });
  it("estrutura ausente não vira carteira vazia", async () => {
    const f = fixture();
    f.db.exec("DELETE FROM USER_TAB_COLUMNS WHERE COLUMN_NAME='DTNEG'");
    await expect(readNonBuyers(f.g, query, admin)).rejects.toMatchObject({
      code: "ERP_CONTEXT_REQUIRED",
    });
    expect(f.g.select).toHaveBeenCalledTimes(1);
  });
});

describe("carteira/positivação: mesma qualificação mensal, agregação por código atual", () => {
  const q = { ...query, view: "sellers" };
  it("agrupa homônimos separadamente e inclui vendedor sem código como não atribuído", async () => {
    const f = fixture();
    f.customer(1);
    f.customer(2);
    f.customer(3, { seller: 34 });
    f.customer(4, { seller: null });
    f.order(1, "2026-10-10");
    const r = await readWallet(f.g, q, admin);
    expect(r).toMatchObject({
      total: 3,
      summary: { walletCount: 4, buyerCount: 1, nonBuyerCount: 3, beforeSearch: true },
    });
    expect(r.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "12", walletCount: 2, buyerCount: 1, nonBuyerCount: 1 }),
        expect.objectContaining({ code: "34", walletCount: 1 }),
        expect.objectContaining({ code: null, name: null, walletCount: 1 }),
      ]),
    );
  });
  it("não positiva compra da filial4 mesmo com carteira compartilhada", async () => {
    const f = fixture();
    f.customer(1, { company: null });
    f.order(1, "2026-09-05");
    f.order(1, "2026-10-05", { company: 4, seller: 34 });
    expect(await readWallet(f.g, q, admin)).toMatchObject({
      summary: { walletCount: 1, buyerCount: 0, nonBuyerCount: 1 },
      items: [{ code: "12", walletCount: 1, buyerCount: 0 }],
    });
  });
  it("vendedor inativo com carteira/histórico não é apagado; bloqueio não define ativo", async () => {
    const f = fixture();
    f.customer(1, { blocked: "S" });
    f.customer(2, { active: "N" });
    expect(await readWallet(f.g, q, admin)).toMatchObject({
      summary: { walletCount: 1 },
      items: [{ code: "12" }],
    });
  });
  it("positivação contém compradores e não compradores, sem data/categoria inferidas", async () => {
    const f = fixture();
    f.customer(1);
    f.customer(2);
    f.order(2, "2026-10-02");
    const r = await readWallet(f.g, { ...q, view: "customers" }, admin);
    expect(r).toMatchObject({
      total: 2,
      summary: { walletCount: 2, buyerCount: 1, nonBuyerCount: 1 },
    });
    expect(r.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "1",
          bought: false,
          localStatus: "Sem compra no mês 2026-10",
        }),
        expect.objectContaining({
          code: "2",
          bought: true,
          localStatus: "Com compra no mês 2026-10",
        }),
      ]),
    );
  });
  it("busca filtra grupos sem transformar total da página em denominador", async () => {
    const f = fixture();
    f.customer(1);
    f.customer(2, { seller: 34 });
    const r = await readWallet(f.g, { ...q, search: "34" }, admin);
    expect(r).toMatchObject({
      total: 1,
      totalWithoutSearch: 2,
      summary: { walletCount: 2, buyerCount: 0, nonBuyerCount: 2 },
      items: [{ code: "34" }],
    });
  });
  it("ordena contagens numericamente e pagina no servidor", async () => {
    const f = fixture();
    for (let n = 1; n <= 12; n++) f.customer(n);
    f.customer(13, { seller: 34 });
    const r = await readWallet(
      f.g,
      { ...q, sort: "walletCount", direction: "desc", offset: 1, limit: 1 },
      admin,
    );
    expect(r).toMatchObject({ total: 2, items: [{ code: "34", walletCount: 1 }] });
  });
  it("janela de65 grupos não repete ou funde vendedores com mesmo nome", async () => {
    const f = fixture();
    for (let n = 1; n <= 65; n++) {
      f.db.prepare("INSERT INTO TGFVEN VALUES(?,?)").run(n + 100, "Mesmo nome");
      f.customer(n, { seller: n + 100 });
    }
    const a = await readWallet(f.g, { ...q, limit: 50, sort: "code" }, admin),
      b = await readWallet(f.g, { ...q, offset: 50, limit: 50, sort: "code" }, admin);
    expect(a.total).toBe(65);
    expect(a.items).toHaveLength(50);
    expect(b.items).toHaveLength(15);
    expect(new Set([...a.items, ...b.items].map((r) => r["id"])).size).toBe(65);
  });
  it("gestor aplica apenas a equipe privada; não usa CODGER ou nome", async () => {
    const f = fixture();
    for (const n of [12, 34, 6, 7]) f.customer(n, { seller: n });
    expect(
      (
        await readWallet(f.g, q, {
          role: "gestor",
          sellerCode: 34,
          companyCodes: [1],
          teamSellerCodes: [6],
        })
      ).items.map((r) => r["code"]),
    ).toEqual(["6", "34"]);
  });
  it("cliente e vendedor filtram o denominador antes do texto", async () => {
    const f = fixture();
    f.customer(1);
    f.customer(2);
    f.customer(3, { seller: 34 });
    expect(
      await readWallet(
        f.g,
        { ...q, view: "customers", customerId: "sankhya:customer:1", sellerCode: 12 },
        admin,
      ),
    ).toMatchObject({ total: 1, summary: { walletCount: 1 }, items: [{ code: "1" }] });
  });
  it.each([
    { sql: "SELECT 1" },
    { view: "all" },
    { month: "0000-01" },
    { sort: "total" },
    { companyCodes: [1, 4] },
  ])("recusa entrada sem consulta: %j", async (patch) => {
    const f = fixture();
    await expect(readWallet(f.g, { ...q, ...patch }, admin)).rejects.toBeDefined();
    expect(f.g.select).not.toHaveBeenCalled();
  });
  it("origem inconclusiva nunca é comprador/ausência zero", async () => {
    const f = fixture();
    f.customer(1);
    f.order(1, null);
    await expect(readWallet(f.g, q, admin)).rejects.toMatchObject({ code: "ERP_CONTEXT_REQUIRED" });
  });
  it("zero observado tem carteira0 e grupos0; não cria um vendedor fictício", async () => {
    const f = fixture();
    expect(await readWallet(f.g, q, admin)).toMatchObject({
      total: 0,
      items: [],
      summary: { walletCount: 0, buyerCount: 0, nonBuyerCount: 0 },
    });
  });
});
