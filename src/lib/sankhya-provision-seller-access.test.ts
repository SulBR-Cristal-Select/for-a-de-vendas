import { describe, it, expect, vi } from "vitest";
import {
  provisionSellerAccess,
  sellerAccessBatch,
} from "../../supabase/functions/sankhya-online/provision-seller-access";
import { sellerProvisioningTargets } from "../../supabase/functions/sankhya-online/seller-provisioning-targets";
const actor = {
  id: "a46afcc5-14fd-4dd9-bd00-759e91b946ca",
  role: "administrador",
  company_id: "432299",
};
const target = sellerProvisioningTargets[0];
const query = { code: target.code, password: "a".repeat(8) };
const user = {
  id: "11111111-1111-4111-8111-111111111111",
  email: target.email,
  email_confirmed_at: "2026-10-27T11:27:00Z",
  app_metadata: { sulbr_access_batch: sellerAccessBatch, sulbr_seller_code: target.code },
};
function deps() {
  return {
    users: vi.fn(async () => ({ users: [] as (typeof user)[], complete: true })),
    profile: vi.fn(async () => ({
      id: user.id,
      company_id: "432299",
      role: "vendedor",
      active: false,
    })),
    createUser: vi.fn(async () => user as typeof user | null),
    now: () => Date.parse("2026-10-27T11:27:00Z"),
  };
}
describe("Provisionamento finito sem pedidos ou redefinição de terceiros", () => {
  it("contem somente28 códigos V/G novos, sem os dois acessos já verificados ou tipos C", () => {
    expect(sellerProvisioningTargets).toHaveLength(28);
    expect(new Set(sellerProvisioningTargets.map((x) => x.email)).size).toBe(28);
    for (const code of [9, 10, 11, 12, 34])
      expect(sellerProvisioningTargets.some((x) => Number(x.code) === code)).toBe(false);
    expect(sellerProvisioningTargets.filter((x) => x.email.endsWith("@sulbr.test"))).toHaveLength(
      12,
    );
    expect(sellerProvisioningTargets.filter((x) => x.role === "gestor").map((x) => x.code)).toEqual(
      [13, 41],
    );
  });
  it.each([
    { ...actor, id: "outra-identidade" },
    { ...actor, role: "gestor" },
    { ...actor, company_id: "outra" },
  ])("recusa outro operador antes de ler/escrever", async (a) => {
    const d = deps();
    await expect(provisionSellerAccess(d, a, query)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(d.users).not.toHaveBeenCalled();
    expect(d.createUser).not.toHaveBeenCalled();
  });
  it("expira antes de qualquer efeito", async () => {
    const d = deps();
    d.now = () => Date.parse("2026-10-27T13:00:00Z");
    await expect(provisionSellerAccess(d, actor, query)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(d.users).not.toHaveBeenCalled();
  });
  it.each([
    null,
    [],
    {},
    { ...query, email: "fora@outro.test" },
    { ...query, companyCodes: [1, 4] },
    { ...query, code: "1" },
    { ...query, password: "a".repeat(5) },
    { ...query, password: "á".repeat(37) },
  ])("recusa argumentos não aprovados %j", async (q) => {
    const d = deps();
    await expect(provisionSellerAccess(d, actor, q)).rejects.toMatchObject({
      code: "INVALID_REQUEST",
    });
    expect(d.createUser).not.toHaveBeenCalled();
  });
  it.each([9, 10, 11, 12, 34, 0, 999])("recusa código fora da coorte %i", async (code) => {
    const d = deps();
    await expect(provisionSellerAccess(d, actor, { ...query, code })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(d.users).not.toHaveBeenCalled();
  });
  it("bloqueia inventário incompleto", async () => {
    const d = deps();
    d.users.mockResolvedValue({ users: [], complete: false });
    await expect(provisionSellerAccess(d, actor, query)).rejects.toMatchObject({
      code: "ERP_CONTEXT_REQUIRED",
    });
    expect(d.createUser).not.toHaveBeenCalled();
  });
  it("cria apenas pelo SDK Auth oficial, sem ativar perfil, enviar email ou pedido", async () => {
    const d = deps();
    const r = await provisionSellerAccess(d, actor, query);
    expect(d.createUser).toHaveBeenCalledExactlyOnceWith({
      email: target.email,
      password: query.password,
      email_confirm: true,
      app_metadata: user.app_metadata,
    });
    expect(r).toMatchObject({
      ok: true,
      created: true,
      userId: user.id,
      passwordReset: false,
      profileActivated: false,
      scopeChanged: false,
      orderSent: false,
    });
    expect(r).not.toHaveProperty("password");
  });
  it("retoma conta da própria coorte sem criar ou redefinir senha", async () => {
    const d = deps();
    d.users.mockResolvedValue({ users: [user], complete: true });
    expect(await provisionSellerAccess(d, actor, query)).toMatchObject({
      ok: true,
      created: false,
    });
    expect(d.createUser).not.toHaveBeenCalled();
  });
  it("não assume propriedade por coincidência de email", async () => {
    const d = deps();
    d.users.mockResolvedValue({
      users: [{ ...user, app_metadata: { ...user.app_metadata, sulbr_access_batch: "outro" } }],
      complete: true,
    });
    await expect(provisionSellerAccess(d, actor, query)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(d.createUser).not.toHaveBeenCalled();
  });
  it("recusa perfil administrador mesmo em conta com email da coorte", async () => {
    const d = deps();
    d.users.mockResolvedValue({ users: [user], complete: true });
    d.profile.mockResolvedValue({
      id: user.id,
      company_id: "432299",
      role: "administrador",
      active: true,
    });
    await expect(provisionSellerAccess(d, actor, query)).rejects.toMatchObject({
      code: "ERP_CONTEXT_REQUIRED",
    });
    expect(d.createUser).not.toHaveBeenCalled();
  });
  it("não repete uma criação de resultado incerto", async () => {
    const d = deps();
    d.createUser.mockResolvedValue(null);
    await expect(provisionSellerAccess(d, actor, query)).rejects.toMatchObject({
      code: "ERP_CONTEXT_REQUIRED",
    });
    expect(d.createUser).toHaveBeenCalledTimes(1);
  });
  it("recusa duplicidade Auth sem escrever", async () => {
    const d = deps();
    d.users.mockResolvedValue({ users: [user, user], complete: true });
    await expect(provisionSellerAccess(d, actor, query)).rejects.toMatchObject({
      code: "ERP_CONTEXT_REQUIRED",
    });
    expect(d.createUser).not.toHaveBeenCalled();
  });
});
