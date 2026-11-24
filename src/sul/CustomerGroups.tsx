import { useEffect, useState } from "react";
import {
  Badge,
  Button,
  TextField,
  Checkbox,
  Callout,
  Page,
  PageHeading,
  Tabs,
  DataTable,
  Empty,
  Drawer,
  notify,
} from "@g4ai/ds";
import type { ERPClient } from "./erp-hooks";
import type { CustomerGroup } from "../lib/customer-groups";
import { groupLabel, groupMatches } from "../lib/customer-groups";
type Customer = Record<string, unknown>;
const sections = [
  { id: "/clientes", label: "Clientes", href: "#/clientes" },
  { id: "/clientes/agrupamentos", label: "Agrupamentos", href: "#/clientes/agrupamentos" },
  { id: "/clientes/vinculos", label: "Vínculos e permissões", href: "#/clientes/vinculos" },
  { id: "/config/clientes/campos", label: "Configurações", href: "#/config/clientes/campos" },
];
export default function CustomerGroups({
  client,
  role,
  id,
  confirm,
}: {
  client?: ERPClient;
  role: string;
  id?: string;
  confirm: (title: string, run: () => Promise<void>, description: string) => void;
}) {
  const [groups, setGroups] = useState<CustomerGroup[]>([]);
  const [groupSearch, setGroupSearch] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<CustomerGroup | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<Customer[]>([]);
  const [members, setMembers] = useState<Customer[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [formError, setFormError] = useState("");
  const editable = ["administrador", "gestor"].includes(role.toLowerCase());
  const open = creating || !!editing;
  async function reload() {
    if (!client) return;
    setLoading(true);
    setError("");
    try {
      const r = await client.customerGroups();
      setGroups(r.groups);
    } catch (e) {
      setError((e as Error).message);
      throw e;
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    let active = true;
    setLoading(true);
    setGroups([]);
    setError("");
    client
      ?.customerGroups()
      .then((r) => {
        if (active) setGroups(r.groups);
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [client]);
  useEffect(() => {
    let active = true;
    setResults([]);
    setSearchError("");
    if (!client || !open) return;
    setSearching(true);
    const timer = setTimeout(() => {
      client
        .page({ resource: "customers", search, pageSize: 50, filters: { active: "all" } })
        .then((r) => {
          if (active) setResults(r.items);
        })
        .catch((e) => {
          if (active) setSearchError(e.message);
        })
        .finally(() => {
          if (active) setSearching(false);
        });
    }, 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [client, search, open]);
  const selected = id ? groups.find((g) => g.id === id) : undefined;
  const filtered = groups.filter((g) => groupMatches(g, groupSearch));
  function edit(group?: CustomerGroup) {
    setEditing(group ?? null);
    setCreating(!group);
    setName(group?.name ?? "");
    setMembers(group?.members ?? []);
    setSearch("");
    setFormError("");
  }
  function close() {
    if (!busy) {
      setCreating(false);
      setEditing(null);
    }
  }
  async function save(active = true) {
    if (!client) return;
    setBusy(true);
    setFormError("");
    try {
      const result = await client.saveCustomerGroup({
        id: editing?.id ?? crypto.randomUUID(),
        name,
        memberIds: members.map((m) => String(m["id"])),
        version: editing?.version ?? 0,
        active,
      });
      if (!result.result.saved) throw new Error("Gravação não confirmada.");
      await reload();
      setCreating(false);
      setEditing(null);
      if (!active && id) location.hash = "/clientes/agrupamentos";
      notify(active ? "Agrupamento salvo." : "Agrupamento desfeito.");
    } catch (e) {
      setFormError((e as Error).message);
      throw e;
    } finally {
      setBusy(false);
    }
  }
  const memberColumns = [
    {
      key: "name",
      header: "Cliente real",
      primary: true,
      cell: (m: Customer) => (
        <a className="ds-link" href={`#/clientes/${m["id"]}`}>
          {m["name"] as string}
        </a>
      ),
    },
    { key: "code", header: "Código", cell: (m: Customer) => m["code"] as string },
    {
      key: "cnpj",
      header: "CNPJ",
      cell: (m: Customer) => (m["cnpj"] as string | null) ?? "Não informado",
    },
  ];
  if (!client) return <Callout title="Agrupamentos exigem uma sessão ERP autenticada." />;
  return (
    <Page width="wide">
      <PageHeading
        title={selected ? selected.name : "Clientes"}
        description={
          id
            ? "Agrupamento manual · composição atual"
            : "Agrupamentos manuais da carteira de clientes"
        }
        {...(id ? { crumbs: [{ label: "Agrupamentos", href: "#/clientes/agrupamentos" }] } : {})}
        actions={
          editable && !id ? (
            <Button disabled={loading || !!error} onClick={() => edit()}>
              Criar agrupamento
            </Button>
          ) : selected?.editable && editable ? (
            <Button onClick={() => edit(selected)}>Editar agrupamento</Button>
          ) : undefined
        }
      />
      {!id && <Tabs label="Seções de clientes" items={sections} value="/clientes/agrupamentos" />}
      {id ? (
        <div className="space-y-6">
          {loading ? (
            <DataTable
              label="Integrantes do agrupamento"
              rows={[]}
              columns={memberColumns}
              rowKey={(m) => String(m["id"])}
              loading
            />
          ) : error ? (
            <Callout title={error}>
              <Button variant="ghost" onClick={() => void reload().catch(() => {})}>
                Tentar novamente
              </Button>
            </Callout>
          ) : selected ? (
            <>
              <div className="flex flex-wrap items-center gap-3">
                <Badge>Agrupamento</Badge>
                <span className="text-caption text-muted">
                  {selected.memberIds.length} clientes integrantes
                </span>
              </div>
              <Callout title="Clientes e CNPJs preservados">
                Pedidos devem ser feitos para um integrante real. Alterações na composição
                recalculam também os períodos históricos.
              </Callout>
              <DataTable
                label="Integrantes do agrupamento"
                rows={selected.members}
                columns={memberColumns}
                rowKey={(m) => String(m["id"])}
                rowLabel={(m) => String(m["name"] as string)}
              />
            </>
          ) : (
            <Empty
              title="Agrupamento não encontrado"
              hint="Ele pode ter sido desfeito ou estar fora da sua carteira autorizada."
              action={
                <a className="ds-link" href="#/clientes/agrupamentos">
                  Voltar aos agrupamentos
                </a>
              }
            />
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="w-full sm:w-80">
              <TextField
                label="Pesquisar agrupamentos"
                placeholder="Nome do agrupamento ou integrante"
                value={groupSearch}
                onChange={setGroupSearch}
              />
            </div>
            <p className="pb-5 text-caption text-muted" aria-live="polite">
              {loading
                ? "Carregando agrupamentos…"
                : `${filtered.length} de ${groups.length} agrupamentos`}
            </p>
          </div>
          <DataTable
            label="Agrupamentos cadastrados"
            rows={filtered}
            rowKey={(g) => g.id}
            rowLabel={(g) => groupLabel(g)}
            loading={loading}
            {...(error
              ? { error: { message: error, onRetry: () => void reload().catch(() => {}) } }
              : {})}
            columns={[
              {
                key: "name",
                header: "Agrupamento",
                primary: true,
                cell: (g) => (
                  <div className="space-y-1">
                    <a className="ds-link font-medium" href={`#/clientes/agrupamentos/${g.id}`}>
                      {groupLabel(g)}
                    </a>
                    <div className="text-caption text-muted">Agrupamento manual</div>
                  </div>
                ),
              },
              {
                key: "members",
                header: "Integrantes",
                cell: (g) => (
                  <span className="text-caption">
                    {g.members
                      .map((m) => `${m["name"] as string} (${m["code"] as string})`)
                      .join(" · ")}
                  </span>
                ),
              },
              { key: "count", header: "Clientes", align: "right", cell: (g) => g.memberIds.length },
              {
                key: "actions",
                header: "Ações",
                action: true,
                cell: (g) =>
                  g.editable && editable ? (
                    <Button variant="ghost" onClick={() => edit(g)}>
                      Editar agrupamento
                    </Button>
                  ) : (
                    <a className="ds-link" href={`#/clientes/agrupamentos/${g.id}`}>
                      Consultar agrupamento
                    </a>
                  ),
              },
            ]}
            empty={
              <Empty
                framed={false}
                title={
                  groupSearch ? "Nenhum agrupamento encontrado" : "Nenhum agrupamento cadastrado"
                }
                hint={
                  groupSearch
                    ? "Pesquise pelo nome do agrupamento ou de um integrante."
                    : editable
                      ? "Use Criar agrupamento para escolher o nome e selecionar os clientes."
                      : "Os agrupamentos da sua carteira aparecerão nesta lista."
                }
              />
            }
          />
          <p className="text-caption text-muted">
            Nas visões consolidadas, cada agrupamento substitui seus integrantes. Pedidos preservam
            o cliente e CNPJ reais.
          </p>
        </div>
      )}
      <Drawer
        open={open}
        onClose={close}
        title={editing ? "Editar agrupamento" : "Criar agrupamento"}
        kicker="Clientes · Agrupamento manual"
        width={640}
        footer={
          <>
            <Button variant="ghost" disabled={busy} onClick={close}>
              Cancelar
            </Button>
            <Button
              disabled={busy || !name.trim() || members.length < 2 || members.length > 50}
              onClick={() => void save().catch(() => {})}
            >
              {busy ? "Salvando…" : "Salvar agrupamento"}
            </Button>
          </>
        }
      >
        <div className="space-y-5">
          {formError && <Callout title={formError} />}
          <TextField label="Nome do agrupamento" value={name} onChange={setName} />
          <Callout title="Composição atual">
            Selecione de 2 a 50 clientes. Alterar ou desfazer o agrupamento recalcula os períodos
            históricos; não apaga clientes.
          </Callout>
          <section aria-label="Clientes selecionados" className="space-y-3">
            <h3 className="text-label font-medium">{members.length} clientes selecionados</h3>
            {members.length ? (
              <div className="max-h-48 overflow-y-auto rounded-lg border border-line divide-y divide-line">
                {members.map((m) => (
                  <div key={String(m["id"])} className="px-3 py-3">
                    <Checkbox
                      checked
                      disabled={busy}
                      onCheckedChange={() =>
                        setMembers((ms) => ms.filter((x) => x["id"] !== m["id"]))
                      }
                      label={`${m["name"] as string} · ${m["code"] as string} · ${(m["cnpj"] as string | null) ?? ""}`}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-caption text-muted">Pesquise e selecione os integrantes abaixo.</p>
            )}
          </section>
          <TextField
            label="Pesquisar clientes"
            placeholder="Nome, razão social, código ou CNPJ"
            value={search}
            onChange={setSearch}
          />
          <section aria-label="Resultados da pesquisa de clientes" className="space-y-3">
            {searchError ? (
              <Callout title={searchError} />
            ) : searching ? (
              <p role="status" className="text-caption text-muted">
                Carregando clientes…
              </p>
            ) : (
              <>
                <p className="text-caption text-muted">
                  {results.length} clientes neste resultado
                  {results.length === 50
                    ? " · Refine a pesquisa para encontrar outros clientes."
                    : ""}
                </p>
                <div className="max-h-80 overflow-y-auto rounded-lg border border-line divide-y divide-line">
                  {results
                    .filter((m) => !members.some((x) => x["id"] === m["id"]))
                    .map((m) => {
                      const elsewhere = groups.find(
                        (g) => g.id !== editing?.id && g.memberIds.includes(String(m["id"])),
                      );
                      return (
                        <div key={String(m["id"])} className="px-3 py-3">
                          <Checkbox
                            checked={false}
                            disabled={busy || !!elsewhere || members.length >= 50}
                            onCheckedChange={() => setMembers((ms) => [...ms, m])}
                            label={`${m["name"] as string} · ${m["code"] as string} · ${(m["cnpj"] as string | null) ?? ""}${elsewhere ? " · Já pertence a " + elsewhere.name : ""}`}
                          />
                        </div>
                      );
                    })}
                  {!results.length && (
                    <p className="px-3 py-4 text-caption text-muted">
                      Nenhum cliente encontrado para esta pesquisa.
                    </p>
                  )}
                </div>
              </>
            )}
          </section>
          {editing && (
            <div className="border-t border-line pt-4">
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() =>
                  confirm(
                    "Desfazer agrupamento",
                    () => save(false),
                    "Os clientes não serão apagados. O agrupamento deixa de consolidar também os períodos anteriores.",
                  )
                }
              >
                Desfazer agrupamento
              </Button>
            </div>
          )}
        </div>
      </Drawer>
    </Page>
  );
}
