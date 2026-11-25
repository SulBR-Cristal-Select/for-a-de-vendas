import { supabase } from "./supabase";

type State = Record<string, unknown>;
type Envelope = { state: State; revision: number };
export class WorkspaceError extends Error {
  constructor(
    message: string,
    public readonly code = "WORKSPACE_ERROR",
  ) {
    super(message);
    this.name = "WorkspaceError";
  }
}
let revision: number | null = null;
let identity: string | null = null;
let pending: { json: string; id: string; revision: number; submitted: boolean } | null = null;
let busy = false;
let generation = 0;
supabase.auth.onAuthStateChange((event, session) => {
  const next = session?.user.id ?? null;
  if (event === "SIGNED_OUT" || identity !== next) {
    identity = next;
    revision = null;
    pending = null;
    generation++;
  }
});
function decode(data: unknown): Envelope {
  const value = data as Envelope | null;
  if (
    !value ||
    typeof value.state !== "object" ||
    value.state === null ||
    Array.isArray(value.state) ||
    !Number.isSafeInteger(value.revision) ||
    value.revision < 0
  ) {
    throw new WorkspaceError("O servidor retornou um estado inválido. Recarregue antes de salvar.");
  }
  return value;
}
function failure(error: { message?: string; code?: string }): WorkspaceError {
  const message = error.message || "";
  if (message.includes("MEMBERSHIP_PENDING") || error.code === "MEMBERSHIP_PENDING")
    return new WorkspaceError(
      "Cadastro recebido. Seu acesso à SulBR está pendente de ativação pelo administrador.",
      "MEMBERSHIP_PENDING",
    );
  if (
    message.includes("REVISION_CONFLICT") ||
    error.code === "PT409" ||
    error.code === "REVISION_CONFLICT"
  )
    return new WorkspaceError(
      "Os dados foram alterados por outra pessoa. Recarregue antes de tentar novamente; sua alteração não foi gravada.",
      "REVISION_CONFLICT",
    );
  if (
    message.includes("AUTH_REQUIRED") ||
    error.code === "PGRST301" ||
    error.code === "AUTH_REQUIRED"
  )
    return new WorkspaceError("Entre na sua conta para acessar a SulBR.", "AUTH_REQUIRED");
  return new WorkspaceError(
    message ||
      "Não foi possível confirmar a gravação. Verifique sua conexão e tente novamente com a mesma alteração.",
    error.code,
  );
}
function onlineOrders(state: State): boolean {
  return (
    Array.isArray(state["orders"]) &&
    state["orders"].some(
      (o: State) =>
        o &&
        (String(o["customerId"] || "").startsWith("sankhya:customer:") ||
          (o["erp"] as { mode?: unknown } | undefined)?.mode === "online" ||
          (Array.isArray(o["items"]) &&
            o["items"].some((i: State) =>
              String(i?.["productId"] || "").startsWith("sankhya:product:"),
            ))),
    )
  );
}
async function preparationFailure(data: unknown, error: unknown): Promise<WorkspaceError> {
  let detail = data;
  if (
    error &&
    typeof error === "object" &&
    "context" in error &&
    error.context instanceof Response
  ) {
    try {
      detail = await error.context.clone().json();
    } catch {
      /* Sem conteúdo confiável: manter UUID. */
    }
  }
  if (
    detail &&
    typeof detail === "object" &&
    "code" in detail &&
    "message" in detail &&
    typeof detail.code === "string" &&
    typeof detail.message === "string"
  )
    return failure({ code: detail.code, message: detail.message });
  return new WorkspaceError(
    "Não foi possível confirmar a revalidação. Tente novamente com a mesma alteração.",
    "ERP_REVALIDATION_UNAVAILABLE",
  );
}
export async function loadWorkspace(): Promise<State> {
  if (busy) throw new WorkspaceError("Aguarde a gravação em andamento antes de recarregar.");
  const ownGeneration = generation;
  const { data, error } = await supabase.rpc("get_workspace");
  if (ownGeneration !== generation)
    throw new WorkspaceError("A sessão mudou. Carregue os dados novamente.");
  if (error) throw failure(error);
  const result = decode(data);
  revision = result.revision;
  pending = null;
  return result.state;
}
export async function saveWorkspace(nextState: State): Promise<State> {
  if (revision === null)
    throw new WorkspaceError("Carregue os dados autenticados antes de salvar.");
  if (busy)
    throw new WorkspaceError("Aguarde a gravação anterior antes de salvar outra alteração.");
  const json = JSON.stringify(nextState);
  // Uma resposta de rede perdida mantém o mesmo UUID/revisão para reenvio seguro.
  if (pending && pending.json !== json)
    throw new WorkspaceError(
      "Há uma gravação sem confirmação. Reenvie a mesma alteração ou recarregue antes de continuar.",
    );
  pending ??= { json, id: crypto.randomUUID(), revision, submitted: false };
  const request = pending;
  const ownGeneration = generation;
  busy = true;
  try {
    const state = JSON.parse(request.json);
    if (onlineOrders(state)) {
      const prepared = await supabase.functions.invoke("sankhya-online", {
        body: {
          operation: "prepare-order-save",
          query: { state, expectedRevision: request.revision, requestId: request.id },
        },
      });
      if (ownGeneration !== generation)
        throw new WorkspaceError("A sessão mudou. Carregue os dados novamente.");
      if (prepared.error || prepared.data?.ready !== true) {
        const error = await preparationFailure(prepared.data, prepared.error);
        if (ownGeneration !== generation)
          throw new WorkspaceError("A sessão mudou. Carregue os dados novamente.");
        const definitive = [
          "INVALID_REQUEST",
          "ERP_CONTEXT_REQUIRED",
          "ERP_PRICE_CHANGED",
          "ERP_PRICE_PRECISION_UNSUPPORTED",
          "ERP_PRICE_TABLE_MISSING",
          "ERP_PRODUCT_PRICE_UNAVAILABLE",
          "ERP_CUSTOMER_SELLER_MISMATCH",
          "ERP_ORDER_CONTEXT_CHANGED",
          "ERP_ORDER_PAYMENT_CHANGED",
          "ERP_ORDER_AGENDA_CHANGED",
          "ERP_PAYMENT_SCOPE_UNAVAILABLE",
          "ERP_PROOF_EXPIRED",
          "REVISION_CONFLICT",
          "FORBIDDEN",
          "AUTH_REQUIRED",
          "MEMBERSHIP_PENDING",
        ].includes(error.code);
        if (
          definitive &&
          (!request.submitted || ["ERP_PROOF_EXPIRED", "REVISION_CONFLICT"].includes(error.code))
        )
          pending = null;
        if (error.code === "REVISION_CONFLICT") revision = null;
        throw error;
      }
    }
    request.submitted = true;
    const { data, error } = await supabase.rpc("save_workspace", {
      p_state: state,
      p_expected_revision: request.revision,
      p_request_id: request.id,
    });
    if (ownGeneration !== generation)
      throw new WorkspaceError("A sessão mudou. Carregue os dados novamente.");
    if (error) {
      // Erros SQL garantem rollback; erros de transporte preservam o UUID.
      if (error.code && /^(P\d|PT\d{3}|[0-9]{2})/.test(error.code)) pending = null;
      if (error.message.includes("REVISION_CONFLICT") || error.code === "PT409") revision = null;
      throw failure(error);
    }
    const result = decode(data);
    revision = result.revision;
    pending = null;
    return result.state;
  } finally {
    busy = false;
  }
}
