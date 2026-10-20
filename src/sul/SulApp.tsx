import {FileText as $s} from 'lucide-react';
import { ArrowLeft as gm, Download as vm, ArrowRight as Jr, Plus as Sa, Printer as td, Trash as Ws, Check as ka, FileCheck as Cm, Pencil as tl, Link2 as Jc, Package as du, ChevronRight as so, Target as od, Lock as Im, ListFilter as ed, Layers as Xl, Settings as ad, Users as Wl, ClipboardList as ym, Building2 as qs, Mail as Lm, Globe as Qc, CreditCard as Kc, ShieldCheck as Mm, ChartNoAxesCombined as Yc, Truck as nd, Sparkles as al, Send as Nm, ChartColumn as zs, Handshake as Sm, Search as tr } from 'lucide-react';
import { Pagination as GI } from '@g4ai/ds';
import React, { useRef } from 'react';
import * as runtime from 'react/jsx-runtime';
import { Badge as bi, Button as Ft, PageHeading as Hp, PageToolbar as nv, TableToolbar as cv, DataTable as s1, Empty as hn, Drawer as xb, Combobox as Sl, Select as ho, Tabs as of, Page as fa, ActionMenu as Il, KpiGrid as _i, ChartCard as cs, DatePicker as Jd, Callout as Gu, Card as Vt, Section as Ot, FieldGrid as Vi, IconButton as wR, NumberField as Hr, TextField as vr, TextareaField as $u, PropertyList as _o, KpiCard as Ha, Checkbox as Yy, CurrencyField as Up, KanbanBoard as c1, KanbanColumn as i1, KanbanCard as u1, BarChart as Qy, Modal as gb, SettingsLayout as uv, SettingsSection as nf, Switch as zu, AppShell as l1, Sidebar as t1, ThemeToggle as n0, ConfirmDialog as HR, formatCurrency as Vd, formatDate as oI, formatNumber as na, normalize as ol, notify as go, useSort as UI, usePagination as zI, BarList as Zy, ProductMark as rv } from '@g4ai/ds';
import catalogo from './catalogo.json';
import './sul.css';
const He: any = React;
const b: any = runtime;
export function businessDate(now = new Date()): string { return new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now); }
export function createAppState(remote: Record<string, any> = {}): Record<string, any> { const base: Record<string, any> = structuredClone(catalogo); return { ...base, ...remote, company: { ...base['company'], ...remote['company'] }, config: { ...base['config'], ...remote['config'] }, collections: { ...base['collections'], ...remote['collections'] } }; }
export function createMutationQueue(current: {
    current: Record<string, any>;
}, persist: SulAppProps['persist'], commit: (confirmed: Record<string, any>) => void) {
    let tail: Promise<unknown> = Promise.resolve();
    return (mutator: (draft: Record<string, any>) => unknown): Promise<Record<string, any>> => {
        const pending = tail.then(async () => {
            const before = current.current;
            const next = structuredClone(before);
            mutator(next);
            const mark = (value: any, previous: any): void => { if (!value || typeof value !== 'object')
                return; if (Array.isArray(value)) {
                for (const row of value) {
                    const prior = previous?.find?.((item: any) => item.id === row?.id);
                    if (row && typeof row === 'object' && row.id && JSON.stringify(row) !== JSON.stringify(prior))
                        row.source = 'registrado';
                    mark(row, prior);
                }
            }
            else {
                for (const key of Object.keys(value))
                    mark(value[key], previous?.[key]);
            } };
            mark(next, before);
            try {
                const confirmed = createAppState(await persist(next));
                current.current = confirmed;
                commit(confirmed);
                return confirmed;
            }
            catch (error) {
                go(error instanceof Error ? error.message : 'Não foi possível salvar. Tente novamente.');
                throw error;
            }
        });
        tail = pending.catch(() => undefined);
        return pending;
    };
}
var bo: any = businessDate(), pa: any = "N\xE3o extra\xEDdo", Xu: any = (e: any) => JSON.parse(JSON.stringify(e)), rt: any = (e: any) => (e == null ? pa : Vd(e)), xo: any = (e: any) => (e ? oI(e) : pa), La: any = (e: any) => e.map((t: any) => typeof t == "string" ? { value: t, label: t || "Todos" } : t), zp: any = (e: any, t: any) => e.customers.find((a: any) => a.id === t), Un: any = (e: any, t: any) => zp(e, t)?.name || "Cliente indispon\xEDvel", Ur: any = (e: any, t: any) => e.products.find((a: any) => a.id === t), Zo: any = (e: any, t: any) => e.reduce((a: any, o: any) => a + (Number(o[t]) || 0), 0), y5: any = (e: any) => Math.round(e * 100), d1: any = (e: any, t: any = 0) => (e.reduce((a: any, o: any) => a + y5(o.price) * o.qty, 0) + y5(t)) / 100, Jo: any = (e: any, t: any = "SIM") => `${t}-${String(1 + Math.max(0, ...e.filter((a: any) => String(a.id).startsWith(t + "-")).map((a: any) => Number(String(a.id).split("-").pop()) || 0))).padStart(3, "0")}`, I5: any = (0, He.createContext)(null), qa: any = () => (0, He.useContext)(I5);
function sellerNames(db: any): string[] { return [...new Set<string>([db.company.user, ...(db.users || []).filter((u: any) => u.active !== false).map((u: any) => u.name)].filter(Boolean))]; }
function qr({ row: e }: any): any {
    const source = e?.source;
    return b.jsx(bi, { tone: source === 'simulado' ? 'warn' : 'neutral', children: source === 'simulado' ? 'Simulado' : source === 'observado' ? 'Observado' : source === 'servidor' ? 'Registrado' : 'Cadastrado' });
}
function qn({ value: e }: any): any {
    return (0, b.jsx)(bi, {
        tone: ["Conclu\xEDdo", "Realizada", "Ganha", "Integrado", "Ativo"].includes(e)
            ? "ok"
            : ["Cancelado", "Perdida", "Bloqueado"].includes(e)
                ? "bad"
                : "neutral",
        children: e || pa,
    });
}
function xt({ children: e, ...t }: any): any {
    return (0, b.jsx)(Ft, { variant: "ghost", ...t, children: e });
}
function oz({ to: e, label: t = "Voltar" }: any): any {
    return (0, b.jsxs)(xt, { href: "#" + e, children: [(0, b.jsx)(gm, {}), t] });
}
function Xt({ children: e }: any): any {
    return (0, b.jsx)("p", {
        className: "text-caption text-muted leading-relaxed",
        children: e,
    });
}
function Ua({ title: e, description: t, actions: a, back: o }: any): any {
    return (0, b.jsx)(Hp, {
        title: e,
        description: t,
        crumbs: o ? [{ label: o.label, href: "#" + o.to }] : void 0,
        actions: a,
    });
}
function bn(e: any): any {
    location.hash = e;
}
function L5(e: any, t: any): any {
    return e.filter((a: any) => ol(Object.values(a)
        .filter((o: any) => typeof o != "object")
        .join(" ")).includes(ol(t)));
}
function ya({ rows: e, columns: t, label: a, onRowClick: o, empty: n, toolbar: r = !0, actions: l, q: s, onQuery: i, }: any): any {
    let [u, c] = (0, He.useState)(""), f: any = s ?? u, d: any = L5(e, f), m: any = (0, He.useMemo)(() => Object.fromEntries(t.map((x: any) => [x.key, x.get || ((v: any) => v[x.key] ?? "")])), [t]), p: any = UI(d, m), y: any = zI(p.rows, 10, { resetKey: f }), C: any = t.map((x: any) => ({
        ...x,
        sortKey: x.action || x.selection ? void 0 : x.key,
    }));
    return (0, b.jsxs)("div", {
        className: "space-y-3",
        children: [
            r &&
                (0, b.jsx)(nv, {
                    children: (0, b.jsx)(cv, {
                        query: f,
                        onQuery: i || c,
                        shown: d.length,
                        total: e.length,
                        noun: "registro",
                        hideSearch: !1,
                        dirty: !!f,
                        onClear: () => (i ? i("") : c("")),
                        children: l,
                    }),
                }),
            (0, b.jsx)(s1, {
                label: a || "Registros",
                columns: C,
                rows: y.rows,
                rowKey: (x: any) => String(x.id),
                rowLabel: (x: any) => String(x.name || x.number || x.id),
                onRowClick: o,
                sort: p,
                loading: !1,
                error: void 0,
                empty: (0, b.jsx)(hn, {
                    framed: !1,
                    title: n || "Nenhum registro neste recorte",
                    hint: f
                        ? "Tente outro termo de busca."
                        : "O arquivo cont\xE9m somente os dados recuperados da inspe\xE7\xE3o.",
                    action: f
                        ? (0, b.jsx)(xt, {
                            onClick: () => (i ? i("") : c("")),
                            children: "Limpar busca",
                        })
                        : void 0,
                }),
            }),
            (0, b.jsx)(GI, {
                page: y.page,
                pageCount: y.pageCount,
                onPage: y.setPage,
                total: y.total,
                pageSize: y.pageSize,
                pageSizeOptions: [10, 20, 50],
                onPageSizeChange: y.setPageSize,
            }),
        ],
    });
}
function z(e: any, t: any, a: any = undefined, o: any = {}): any {
    return { key: e, header: t, cell: a || ((n: any) => n[e] ?? pa), ...o };
}
function Gp({ rows: e, name: t, columns: a }: any): any {
    return (0, b.jsxs)(xt, {
        onClick: () => {
            let o: any = a ||
                Object.keys(e[0] || {}).filter((s: any) => !["items", "variants"].includes(s)), n: any = (s: any) => '"' + String(s ?? "").replaceAll('"', '""') + '"', r: any = "\uFEFF" +
                [
                    o.join(";"),
                    ...e.map((s: any) => o
                        .map((i: any) => n(typeof s[i] == "object" ? JSON.stringify(s[i]) : s[i]))
                        .join(";")),
                ].join(`\r
`), l: any = document.createElement("a");
            ((l.href = URL.createObjectURL(new Blob([r], { type: "text/csv;charset=utf-8" }))),
                (l.download = (t || "recorte") + ".csv"),
                l.click(),
                setTimeout(() => URL.revokeObjectURL(l.href), 2e3),
                go("Recorte exportado em CSV"));
        },
        children: [(0, b.jsx)(vm, {}), "Exportar CSV"],
    });
}
function w5(e: any): any {
    let [t, a] = (0, He.useState)(!1), [o, n] = (0, He.useState)({ seller: "", status: "", customer: "", from: "", to: "" }), r: any = e.filter((l: any) => (!o.seller || l.seller === o.seller) &&
        (!o.status || l.status === o.status) && (!o.customer || l.customerId === o.customer) &&
        (!l.date ||
            ((!o.from || l.date >= o.from) && (!o.to || l.date <= o.to))));
    return { open: t, setOpen: a, f: o, setF: n, rows: r };
}
function E5({ filter: e, rows: t }: any): any {
    let { db: a } = qa(), [o, n] = (0, He.useState)(e.f);
    (0, He.useEffect)(() => {
        e.open && n(e.f);
    }, [e.open]);
    let r: any = (l: any, s: any) => n((i: any) => ({ ...i, [l]: s }));
    return (0, b.jsx)(xb, {
        open: e.open,
        onClose: () => e.setOpen(!1),
        title: "Filtros",
        kicker: "Consulta local",
        footer: (0, b.jsxs)(b.Fragment, {
            children: [
                (0, b.jsx)(xt, {
                    onClick: () => {
                        (e.setF({ seller: "", status: "", from: "", to: "" }),
                            e.setOpen(!1));
                    },
                    children: "Limpar filtros",
                }),
                (0, b.jsx)(Ft, {
                    onClick: () => {
                        (e.setF(o), e.setOpen(!1));
                    },
                    children: "Aplicar filtros",
                }),
            ],
        }),
        children: (0, b.jsxs)("div", {
            className: "space-y-5",
            children: [
                (0, b.jsx)(Sl, {
                    label: "Cliente",
                    placeholder: "Todos os clientes",
                    value: o.customer,
                    onValueChange: (l: any) => r("customer", l),
                    options: a.customers.map((l: any) => ({
                        value: l.id,
                        label: l.name + " (" + l.code + ")",
                    })),
                }),
                (0, b.jsx)(Sl, {
                    label: "Vendedor",
                    placeholder: "Todos os vendedores",
                    value: o.seller,
                    onValueChange: (l: any) => r("seller", l),
                    options: La([
                        "",
                        ...new Set(a.orders.map((l: any) => l.seller)),
                        a.company.user,
                    ]),
                }),
                (0, b.jsx)(ho, {
                    label: "Situa\xE7\xE3o",
                    value: o.status,
                    onValueChange: (l: any) => r("status", l),
                    options: La(["", ...new Set(t.map((l: any) => l.status).filter(Boolean))]),
                }),
                (0, b.jsx)(Xt, {
                    children: "Os filtros consultam os registros salvos na SulBR.",
                }),
            ],
        }),
    });
}
function jp(e: any): any {
    return [
        z("number", "Pedido", (t: any) => (0, b.jsxs)("div", {
            className: "space-y-1",
            children: [
                (0, b.jsxs)("a", {
                    className: "font-medium ds-link",
                    href: "#/pedidos/" + t.id,
                    children: ["#", t.number],
                }),
                (0, b.jsx)("div", { children: (0, b.jsx)(qr, { row: t }) }),
            ],
        }), { primary: !0 }),
        z("date", "Emiss\xE3o", (t: any) => xo(t.date)),
        z("customer", "Cliente", (t: any) => Un(e, t.customerId), {
            wide: !0,
            get: (t: any) => Un(e, t.customerId),
        }),
        z("seller", "Vendedor"),
        z("delivery", "data_entrega", (t: any) => xo(t.delivery)),
        z("total", "Total", (t: any) => (0, b.jsx)("strong", {
            className: "tabular-nums",
            children: rt(t.total),
        }), { align: "right" }),
        z("cargoStatus", "Status", (t: any) => t.cargoStatus ? (0, b.jsx)(qn, { value: t.cargoStatus }) : pa),
    ];
}
function Ui({ area: e, items: t }: any): any {
    let { path: a } = qa();
    return (0, b.jsx)(of, {
        label: "Se\xE7\xF5es de " + e,
        items: t.map(([o, n]: any) => ({ id: o, label: n, href: "#" + o })),
        value: t.find(([o]: any) => a === o || a.startsWith(o + "/"))?.[0] || t[0][0],
    });
}
function nz(): any {
    let { db: e, update: t, editor: a } = qa(), [o, n] = (0, He.useState)(businessDate().slice(0, 7)), [r, l] = (0, He.useState)(""), [s, i] = (0, He.useState)(e.activePanel || "Painel Sul");
    let ano: any = o.slice(0, 4), mes: any = o.slice(5, 7);
    let mesAnt: any = String(Number(ano) - 1) + "-" + mes;
    let u: any = e.orders.filter((p: any) => p.date && p.date.startsWith(o) && (!r || p.seller === r));
    let c: any = u.filter((p: any) => p.type === "Venda" && p.status === "Conclu\xEDdo");
    let uAnt: any = e.orders.filter((p: any) => p.date && p.date.startsWith(mesAnt) && (!r || p.seller === r));
    let cAnt: any = uAnt.filter((p: any) => p.type === "Venda" && p.status === "Conclu\xEDdo");
    let f: any = Zo(c, "total"), fAnt: any = Zo(cAnt, "total");
    let meta: any = Object.values((e.targets || {})[o] || {}).reduce((p: any, y: any) => p + (Number(y) || 0), 0);
    let ating: any = meta > 0 ? (f / meta) * 100 : null;
    let base: any = e.customers.filter((p: any) => !p.blocked).length;
    let compraram: any = new Set(c.map((p: any) => p.customerId));
    let atendidos: any = compraram.size;
    let naoCompraram: any = e.customers
        .filter((p: any) => !p.blocked && !compraram.has(p.id))
        .sort((p: any, y: any) => String(p.name).localeCompare(String(y.name)));
    let novos: any = e.customers.filter((p: any) => p.createdAt && String(p.createdAt).startsWith(ano));
    let novosFat: any = Zo(e.orders.filter((p: any) => p.date?.startsWith(ano) && novos.some((y: any) => y.id === p.customerId) &&
        p.type === "Venda" &&
        p.status === "Conclu\xEDdo"), "total");
    let comissaoMes: any = c.reduce((p: any, y: any) => p +
        (y.items || []).reduce((S: any, L: any) => {
            let prod: any = Ur(e, L.productId);
            let base: any = L.qty * L.price;
            let pct: any = prod && prod.commission != null ? prod.commission : 0;
            return S + (base * pct) / 100;
        }, 0), 0);
    let temComissao: any = (e.products || []).some((p: any) => p.commission != null);
    let acumCliente: any = e.customers
        .filter((p: any) => !p.blocked)
        .map((p: any) => ({
        label: Un(e, p.id),
        value: Zo(e.orders.filter((y: any) => y.customerId === p.id &&
            y.type === "Venda" &&
            y.status === "Conclu\xEDdo"), "total"),
    }))
        .filter((p: any) => p.value > 0)
        .sort((p: any, y: any) => y.value - p.value);
    let clientesPerf: any = e.customers
        .filter((p: any) => !p.blocked)
        .map((p: any) => {
        let atual: any = Zo(c.filter((y: any) => y.customerId === p.id), "total"), ant: any = Zo(cAnt.filter((y: any) => y.customerId === p.id), "total");
        return {
            id: p.id,
            name: p.name,
            atual,
            ant,
            pct: ant > 0 ? ((atual - ant) / ant) * 100 : atual > 0 ? 100 : null,
        };
    })
        .filter((p: any) => p.atual > 0 || p.ant > 0)
        .sort((p: any, y: any) => y.atual - p.atual);
    const MESES: any = {
        "01": "janeiro",
        "02": "fevereiro",
        "03": "mar\xE7o",
        "04": "abril",
        "05": "maio",
        "06": "junho",
        "07": "julho",
        "08": "agosto",
        "09": "setembro",
        10: "outubro",
        11: "novembro",
        12: "dezembro",
    };
    let nomeMes: any = MESES[mes] || mes;
    return (0, b.jsxs)(fa, {
        width: "wide",
        children: [
            (0, b.jsx)(Ua, {
                title: "Indicadores",
                description: "Radar de vendas \xB7 " + nomeMes + " de " + ano,
                actions: (0, b.jsxs)(Ft, {
                    href: "#/relatorios",
                    children: ["Ver relat\xF3rios", (0, b.jsx)(Jr, {})],
                }),
            }),
            (0, b.jsx)(Ui, {
                area: "indicadores",
                items: [
                    ["/indicadores", "Pain\xE9is"],
                    ["/relatorios", "Relat\xF3rios"],
                ],
            }),
            (0, b.jsxs)("div", {
                className: "dashboard-filters flex flex-wrap items-end gap-4",
                children: [
                    (0, b.jsx)(ho, {
                        label: "Painel",
                        value: s,
                        options: La(e.panels),
                        onValueChange: i,
                    }),
                    (0, b.jsx)(ho, {
                        label: "M\xEAs",
                        value: o,
                        options: monthOptions(e.orders),
                        onValueChange: n,
                    }),
                    (0, b.jsx)(Sl, {
                        label: "Vendedor",
                        value: r,
                        placeholder: "Todos os vendedores",
                        options: La(["", ...new Set(e.orders.map((p: any) => p.seller))]),
                        onValueChange: (p: any) => l(String(p)),
                    }),
                    (0, b.jsx)(Il, {
                        label: "Op\xE7\xF5es do painel",
                        actions: [
                            {
                                label: "Definir metas",
                                onSelect: () => a({
                                    title: "Definir meta local",
                                    fields: [
                                        {
                                            key: "seller",
                                            label: "Vendedor",
                                            required: !0,
                                            options: sellerNames(e),
                                        },
                                        {
                                            key: "target",
                                            label: "Meta do m\xEAs (R$)",
                                            kind: "currency",
                                            required: !0,
                                        },
                                    ],
                                    save: async (p: any) => await t((y: any) => {
                                        y.targets[o] ||= {};
                                        y.targets[o][p.seller] = Number(p.target);
                                    }),
                                }),
                            },
                        ],
                    }),
                ],
            }),
            (0, b.jsxs)(_i, {
                children: [
                    (0, b.jsx)(Ha, {
                        label: "Meta do m\u00EAs",
                        value: meta > 0 ? rt(meta) : "\u2014",
                        hint: "Soma das metas dos vendedores",
                    }),
                    (0, b.jsx)(Ha, {
                        label: "Vendido",
                        value: rt(f),
                        hint: "Pedidos conclu\xEDdos do tipo Venda",
                    }),
                    (0, b.jsx)(Ha, {
                        label: "Atingimento",
                        value: ating != null ? na(ating) + "%" : "\u2014",
                        hint: meta > 0
                            ? rt(Math.max(0, meta - f)) + " restantes"
                            : "Defina metas por vendedor",
                    }),
                    (0, b.jsx)(Ha, {
                        label: "Clientes atendidos",
                        value: na(atendidos) + " de " + na(base),
                        hint: base > 0 ? na((atendidos / base) * 100) + "% da base" : "",
                    }),
                    (0, b.jsx)(Ha, {
                        label: "Sem compra no m\u00EAs",
                        value: na(naoCompraram.length),
                        hint: "Clientes da base sem pedido no m\u00EAs",
                    }),
                    (0, b.jsx)(Ha, {
                        label: "Comiss\u00E3o do m\u00EAs",
                        value: temComissao ? rt(comissaoMes) : "\u2014",
                        hint: temComissao
                            ? "Comiss\xE3o dos itens com % definida no produto"
                            : "Defina Comiss\xE3o (%) na ficha dos produtos",
                    }),
                    (0, b.jsx)(Ha, {
                        label: "Novos clientes " + ano,
                        value: na(novos.length),
                        hint: "Faturamento no ano: " + rt(novosFat),
                    }),
                ],
            }),
            meta > 0 &&
                (0, b.jsx)(cs, {
                    title: "Acompanhamento da meta",
                    description: na(ating) +
                        "% de " +
                        rt(meta) +
                        " \xB7 " +
                        (ating >= 100
                            ? "meta batida"
                            : rt(Math.max(0, meta - f)) + " restantes"),
                    children: (0, b.jsx)("div", {
                        style: {
                            height: 14,
                            background: "rgba(0,0,0,.08)",
                            borderRadius: 7,
                            overflow: "hidden",
                        },
                        children: (0, b.jsx)("div", {
                            style: {
                                height: 14,
                                width: Math.min(100, ating || 0) + "%",
                                background: ating >= 100 ? "var(--ds-ok)" : "var(--ds-accent)",
                                borderRadius: 7,
                            },
                        }),
                    }),
                }),
            (0, b.jsx)(cs, {
                title: "Performance de clientes",
                description: "Comparativo com " +
                    (MESES[mesAnt.slice(5, 7)] || mesAnt) +
                    " de " +
                    mesAnt.slice(0, 4) +
                    " \xB7 seta verde = cresceu, vermelha = caiu",
                children: clientesPerf.length
                    ? (0, b.jsx)(ya, {
                        toolbar: !1,
                        rows: clientesPerf,
                        columns: [
                            z("name", "Cliente", void 0, { primary: !0, wide: !0 }),
                            z("ant", MESES[mesAnt.slice(5, 7)] + " de " + mesAnt.slice(0, 4), (p: any) => (p.ant > 0 ? rt(p.ant) : "\u2014"), { align: "right" }),
                            z("atual", nomeMes, (p: any) => (p.atual > 0 ? rt(p.atual) : "\u2014"), { align: "right" }),
                            z("pct", "Varia\xE7\xE3o", (p: any) => {
                                if (p.pct == null)
                                    return pa;
                                let subiu: any = p.pct >= 0;
                                return (0, b.jsxs)("span", {
                                    style: {
                                        fontWeight: 600,
                                        color: subiu ? "var(--ds-ok)" : "var(--ds-rose)",
                                    },
                                    children: [
                                        na(Math.abs(p.pct)) + "% ",
                                        subiu ? "\u2191" : "\u2193",
                                    ],
                                });
                            }, { align: "right" }),
                        ],
                    })
                    : (0, b.jsx)(hn, {
                        title: "Nenhum cliente comprou neste m\u00EAs",
                        framed: !1,
                    }),
            }),
            (0, b.jsxs)("div", {
                className: "grid gap-6 lg:grid-cols-2",
                children: [
                    (0, b.jsx)(cs, {
                        title: "Acumulado por cliente",
                        description: "Total hist\xF3rico de vendas conclu\xEDdas por cliente",
                        action: (0, b.jsx)(xt, {
                            href: "#/relatorios/gerencial",
                            children: "Detalhar",
                        }),
                        children: acumCliente.length
                            ? (0, b.jsx)(Zy, { items: acumCliente, format: Vd })
                            : (0, b.jsx)(hn, {
                                title: "Sem vendas neste recorte",
                                framed: !1,
                            }),
                    }),
                    (0, b.jsx)(cs, {
                        title: "Novos clientes de " + ano,
                        description: "Cadastrados neste ano \xB7 faturamento alcan\xE7ado no ano",
                        action: (0, b.jsx)(xt, {
                            href: "#/clientes",
                            children: "Ver clientes",
                        }),
                        children: novos.length
                            ? (0, b.jsxs)(b.Fragment, {
                                children: [
                                    (0, b.jsx)(Xt, {
                                        children: novos.length +
                                            " novo(s) cliente(s) \xB7 faturamento no ano: " +
                                            rt(novosFat),
                                    }),
                                    (0, b.jsx)(ya, {
                                        toolbar: !1,
                                        rows: novos.map((p: any) => {
                                            let fat: any = Zo(e.orders.filter((y: any) => y.date?.startsWith(ano) && y.customerId === p.id &&
                                                y.type === "Venda" &&
                                                y.status === "Conclu\xEDdo"), "total");
                                            return {
                                                id: p.id,
                                                name: p.name,
                                                code: p.code,
                                                createdAt: p.createdAt,
                                                fat,
                                            };
                                        }),
                                        columns: [
                                            z("name", "Cliente", void 0, { primary: !0, wide: !0 }),
                                            z("code", "C\u00F3digo"),
                                            z("createdAt", "Cadastro", (p: any) => xo(p.createdAt)),
                                            z("fat", "Faturamento no ano", (p: any) => rt(p.fat), {
                                                align: "right",
                                            }),
                                        ],
                                    }),
                                ],
                            })
                            : (0, b.jsx)(hn, {
                                title: "Nenhum cliente cadastrado em " + ano,
                                framed: !1,
                            }),
                    }),
                    (0, b.jsx)(cs, {
                        title: "Clientes que n\xE3o compraram em " + nomeMes,
                        action: (0, b.jsx)(xt, {
                            href: "#/relatorios/nao-compraram",
                            children: "Detalhar",
                        }),
                        children: naoCompraram.length
                            ? (0, b.jsx)(ya, {
                                toolbar: !1,
                                rows: naoCompraram.map((p: any) => ({
                                    id: p.id,
                                    name: p.name,
                                    code: p.code,
                                    seller: p.seller,
                                })),
                                columns: [
                                    z("name", "Cliente", void 0, { primary: !0, wide: !0 }),
                                    z("code", "C\u00F3digo"),
                                    z("seller", "Vendedor"),
                                ],
                            })
                            : (0, b.jsx)(hn, {
                                title: "Todos os clientes compraram neste m\u00EAs",
                                framed: !1,
                            }),
                    }),
                ],
            }),
        ],
    });
}
function rz(): any {
    let { db: e, update: t } = qa(), [a, o] = (0, He.useState)(""), n: any = Object.entries(e.indicators).flatMap(([r, l]: any) => l.map((s: any) => ({ id: s, name: s, group: r })));
    return (0, b.jsxs)(fa, {
        width: "wide",
        children: [
            (0, b.jsx)(Ua, {
                title: "Cat\xE1logo de indicadores",
                description: "27 indicadores observados na interface",
                back: { label: "Pain\xE9is", to: "/indicadores" },
            }),
            (0, b.jsx)(ya, {
                rows: n,
                q: a,
                onQuery: o,
                columns: [
                    z("name", "Indicador", void 0, { primary: !0, wide: !0 }),
                    z("group", "Grupo"),
                    z("add", "Adicionar", (r: any) => (0, b.jsxs)(xt, {
                        disabled: e.extraIndicators.includes(r.name),
                        disabledReason: "O indicador j\xE1 est\xE1 neste painel",
                        onClick: async () => {
                            (await t((l: any) => l.extraIndicators.push(r.name)),
                                go("Indicador adicionado \xE0 simula\xE7\xE3o"));
                        },
                        children: [(0, b.jsx)(Sa, {}), "Adicionar"],
                    }), { action: !0 }),
                ],
            }),
        ],
    });
}
function lz(): any {
    let { db: e } = qa(), t: any = w5(e.orders);
    return (0, b.jsxs)(fa, {
        width: "wide",
        children: [
            (0, b.jsx)(Ua, {
                title: "Pedidos",
                description: "Pedidos e or\xE7amentos \xB7 somente o recorte recuperado",
                actions: (0, b.jsxs)(Ft, {
                    href: "#/pedidos/novo",
                    children: [(0, b.jsx)(Sa, {}), "Criar Pedido"],
                }),
            }),
            (0, b.jsx)(Ui, {
                area: "pedidos",
                items: [
                    ["/pedidos", "Pedidos"],
                    ["/config/pedidos/campos", "Configura\xE7\xF5es"],
                ],
            }),
            (0, b.jsx)(ya, {
                rows: t.rows,
                columns: jp(e),
                label: "Pedidos",
                onRowClick: (a: any) => bn("/pedidos/" + a.id),
                actions: (0, b.jsxs)(b.Fragment, {
                    children: [
                        (0, b.jsx)(Jd, {
                            label: "Emiss\xE3o de",
                            value: t.f.from,
                            onValueChange: (a: any) => t.setF({ ...t.f, from: a }),
                            now: bo,
                            clearable: !0,
                        }),
                        (0, b.jsx)(Jd, {
                            label: "Emiss\xE3o at\xE9",
                            value: t.f.to,
                            onValueChange: (a: any) => t.setF({ ...t.f, to: a }),
                            now: bo,
                            clearable: !0,
                        }),
                        (0, b.jsx)(ho, {
                            label: "Vendedor",
                            size: "compact",
                            value: t.f.seller,
                            onValueChange: (a: any) => t.setF({ ...t.f, seller: a }),
                            options: La([
                                "",
                                ...new Set(e.orders.map((a: any) => a.seller)),
                                e.company.user,
                            ]),
                        }),
                        (0, b.jsx)(ho, {
                            label: "Status",
                            size: "compact",
                            value: t.f.status,
                            onValueChange: (a: any) => t.setF({ ...t.f, status: a }),
                            options: La([
                                "",
                                ...new Set(e.orders.map((a: any) => a.status).filter(Boolean)),
                            ]),
                        }),
                        (0, b.jsx)(Gp, {
                            rows: t.rows,
                            name: "pedidos-sulbr",
                            columns: [
                                "number",
                                "date",
                                "customerId",
                                "seller",
                                "payment",
                                "total",
                                "status",
                                "cargoStatus",
                                "source",
                            ],
                        }),
                        (0, b.jsxs)(xt, {
                            onClick: () => {
                                if (t.rows[0]) {
                                    bn("/pedidos/" + t.rows[0].id);
                                }
                            },
                            children: [(0, b.jsx)(td, {}), "Visualizar pedido"],
                        }),
                    ],
                }),
            }),
        ],
    });
}
function sz(): any {
    const savingOrder=useRef(false);
    let { db: e, update: t, path: a } = qa(), o: any = new URLSearchParams(location.hash.split("?")[1] || ""), [n, r] = (0, He.useState)(o.get("cliente") || ""), [l, s] = (0, He.useState)(e.company.user), [i, u] = (0, He.useState)(""), [c, f] = (0, He.useState)("Venda"), [d, m] = (0, He.useState)(bo), [p, y] = (0, He.useState)("1 - IMEDIATO"), [C, x] = (0, He.useState)("Conclu\xEDdo"), [v, g] = (0, He.useState)(""), [h, S] = (0, He.useState)([]), [L, I] = (0, He.useState)(0), [R, E] = (0, He.useState)(""), [OBS, OBSs] = (0, He.useState)(""), [k, M] = (0, He.useState)(""), [A, N] = (0, He.useState)(""), O: any = () => {
        let D: any = Ur(e, v);
        if (D) {
            if (D.price == null || (D.price <= 0 && e.config.zeroPriceBlocked)) {
                N("Defina um preço positivo na ficha do produto antes de usá-lo.");
                return;
            }
            if (h.find((j: any) => j.productId === v)) {
                N("O produto j\xE1 est\xE1 no pedido. Ajuste a quantidade no item.");
                return;
            }
            (S([...h, { productId: v, qty: 1, price: D.price }]), g(""), N(""));
        }
    };
    async function B(): Promise<any> {
        if (savingOrder.current) return;
        if (!n ||
            !i ||
            !d ||
            !p ||
            !h.length ||
            h.some((F: any) => !Number.isInteger(F.qty) || F.qty < 1)) {
            N("Informe cliente, pagamento, entrega, tipo de agenda e pelo menos um item com quantidade inteira positiva.");
            return;
        }
        let D: any = Jo(e.orders), j: any = {
            id: D,
            number: D,
            customerId: n,
            seller: l,
            type: c,
            date: businessDate(),
            payment: i,
            total: d1(h, L || 0),
            status: C,
            integration: "Sem envio ao ERP \xB7 simulado",
            items: h,
            delivery: d,
            agenda: p,
            notes: R,
            internalNotes: OBS,
            freight: L || 0,
            clientOrder: k,
            cargoStatus: "Pendente",
            source: "simulado",
        };
        savingOrder.current=true;
        try { await t((F: any) => F.orders.unshift(j)); go('Pedido criado'); bn('/pedidos/'+D) } catch(error) {N(error instanceof Error ? error.message : 'Não foi possível salvar o pedido.')} finally {savingOrder.current=false}
    }
    return (0, b.jsxs)(fa, {
        width: "wide",
        children: [
            (0, b.jsx)(Ua, {
                title: "Criar pedido / or\xE7amento",
                description: "Preços e condições do cadastro",
                back: { label: "Pedidos", to: "/pedidos" },
                actions: (0, b.jsx)(xt, { href: "#/pedidos", children: "Cancelar" }),
            }),
            A && (0, b.jsx)(Gu, { tone: "bad", children: A }),
            (0, b.jsxs)("div", {
                className: "grid gap-6 lg:grid-cols-[1fr_300px]",
                children: [
                    (0, b.jsxs)("div", {
                        className: "space-y-6",
                        children: [
                            (0, b.jsx)(Vt, {
                                children: (0, b.jsx)(Ot, {
                                    title: "Cliente e emiss\xE3o",
                                    children: (0, b.jsxs)(Vi, {
                                        children: [
                                            (0, b.jsx)(Sl, {
                                                label: "Cliente",
                                                value: n,
                                                onValueChange: (D: any) => r(String(D)),
                                                options: e.customers
                                                    .filter((D: any) => !D.blocked)
                                                    .map((D: any) => ({
                                                    value: D.id,
                                                    label: D.name + " (" + D.code + ")",
                                                })),
                                                required: !0,
                                            }),
                                            (0, b.jsx)(Sl, {
                                                label: "Vendedor",
                                                value: l,
                                                onValueChange: (D: any) => s(String(D)),
                                                options: La(sellerNames(e)),
                                            }),
                                            (0, b.jsx)(ho, {
                                                label: "Tipo de pedido",
                                                value: c,
                                                onValueChange: f,
                                                options: La([
                                                    "Venda",
                                                    "Bonifica\xE7\xE3o",
                                                    "Venda - Raslog",
                                                    "Venda - Cupom Fiscal",
                                                    "Bonifica\xE7\xE3o - Raslog",
                                                    "Venda - Faturamento Antecipado",
                                                ]),
                                            }),
                                        ],
                                    }),
                                }),
                            }),
                            (0, b.jsx)(Vt, {
                                children: (0, b.jsxs)(Ot, {
                                    title: "Produtos",
                                    children: [
                                        (0, b.jsxs)("div", {
                                            className: "flex flex-wrap items-end gap-3",
                                            children: [
                                                (0, b.jsx)("div", {
                                                    className: "flex-1 min-w-0",
                                                    children: (0, b.jsx)(Sl, {
                                                        label: "Produto",
                                                        value: v,
                                                        onValueChange: (D: any) => g(String(D)),
                                                        options: e.products
                                                            .filter((D: any) => D.active !== !1)
                                                            .map((D: any) => ({
                                                            value: D.id,
                                                            label: (D.code || "C\xF3digo n\xE3o extra\xEDdo") +
                                                                " \xB7 " +
                                                                D.name,
                                                        })),
                                                    }),
                                                }),
                                                (0, b.jsxs)(xt, {
                                                    disabled: !v,
                                                    disabledReason: "Selecione um produto",
                                                    onClick: O,
                                                    children: [(0, b.jsx)(Sa, {}), "Adicionar produto"],
                                                }),
                                            ],
                                        }),
                                        (0, b.jsxs)("div", {
                                            className: "mt-5 space-y-4",
                                            children: [
                                                h.map((D: any, j: any) => (0, b.jsxs)("div", {
                                                    className: "cart-item",
                                                    children: [
                                                        (0, b.jsxs)("div", {
                                                            className: "flex items-start justify-between gap-3",
                                                            children: [
                                                                (0, b.jsxs)("div", {
                                                                    children: [
                                                                        (0, b.jsx)("strong", {
                                                                            className: "text-body",
                                                                            children: Ur(e, D.productId)?.name,
                                                                        }),
                                                                        (0, b.jsxs)(Xt, {
                                                                            children: [
                                                                                Ur(e, D.productId)?.code,
                                                                                " \xB7 pre\xE7o unit\xE1rio ",
                                                                                rt(D.price),
                                                                            ],
                                                                        }),
                                                                    ],
                                                                }),
                                                                (0, b.jsx)(wR, {
                                                                    label: "Remover item",
                                                                    onClick: () => S(h.filter((F: any, G: any) => G !== j)),
                                                                    children: (0, b.jsx)(Ws, {}),
                                                                }),
                                                            ],
                                                        }),
                                                        (0, b.jsxs)("div", {
                                                            className: "flex items-end justify-between gap-4 mt-3",
                                                            children: [
                                                                (0, b.jsx)("div", {
                                                                    className: "w-44",
                                                                    children: (0, b.jsx)(Hr, {
                                                                        label: "Quantidade",
                                                                        min: 1,
                                                                        value: D.qty,
                                                                        onChange: (F: any) => S(h.map((G: any, X: any) => X === j ? { ...G, qty: F } : G)),
                                                                    }),
                                                                }),
                                                                (0, b.jsx)("strong", {
                                                                    className: "tabular-nums",
                                                                    children: rt((D.qty || 0) * D.price),
                                                                }),
                                                            ],
                                                        }),
                                                    ],
                                                }, D.productId)),
                                                !h.length &&
                                                    (0, b.jsx)(hn, {
                                                        framed: !1,
                                                        title: "Nenhum produto adicionado",
                                                        hint: "Escolha um produto com pre\xE7o conhecido.",
                                                    }),
                                            ],
                                        }),
                                    ],
                                }),
                            }),
                            (0, b.jsx)(Vt, {
                                children: (0, b.jsxs)(Ot, {
                                    title: "Detalhes do pedido",
                                    children: [
                                        (0, b.jsxs)(Vi, {
                                            children: [
                                                (0, b.jsx)(Sl, {
                                                    label: "Condi\xE7\xE3o de pagamento",
                                                    value: i,
                                                    options: La(e.payments),
                                                    onValueChange: (D: any) => u(String(D)),
                                                    required: !0,
                                                }),
                                                (0, b.jsx)(Jd, {
                                                    label: "data_entrega",
                                                    value: d,
                                                    onValueChange: m,
                                                    now: bo,
                                                }),
                                                (0, b.jsx)(ho, {
                                                    label: "Tipo de Agenda",
                                                    value: p,
                                                    options: La([
                                                        "1 - IMEDIATO",
                                                        "2 - AGENDADO",
                                                        "3 - FOB",
                                                        "4 - ANTECIPADO",
                                                    ]),
                                                    onValueChange: y,
                                                }),
                                                (0, b.jsx)(vr, {
                                                    label: "N\xBA Pedido do Cliente",
                                                    value: k,
                                                    onChange: M,
                                                }),
                                            ],
                                        }),
                                        (0, b.jsx)("div", {
                                            className: "mt-4",
                                            children: (0, b.jsxs)(b.Fragment, {
                                                children: [
                                                    (0, b.jsx)($u, {
                                                        label: "Observa\xE7\xE3o Interna",
                                                        value: OBS,
                                                        onChange: OBSs,
                                                    }),
                                                    (0, b.jsx)($u, {
                                                        label: "Observa\xE7\xE3o da Nota / informa\xE7\xF5es adicionais",
                                                        value: R,
                                                        onChange: E,
                                                    }),
                                                ],
                                            }),
                                        }),
                                    ],
                                }),
                            }),
                        ],
                    }),
                    (0, b.jsx)("div", {
                        children: (0, b.jsxs)(Vt, {
                            className: "space-y-5 lg:sticky lg:top-6",
                            children: [
                                (0, b.jsx)(Ot, {
                                    title: "Resumo",
                                    children: (0, b.jsx)(_o, {
                                        items: [
                                            { label: "Itens", value: h.length },
                                            { label: "Quantidade total", value: Zo(h, "qty") },
                                            { label: "Produtos", value: rt(d1(h)) },
                                            {
                                                label: "Valor total",
                                                value: (0, b.jsx)("strong", {
                                                    children: rt(d1(h, L || 0)),
                                                }),
                                            },
                                        ],
                                    }),
                                }),
                                (0, b.jsxs)(Ft, {
                                    className: "w-full",
                                    onClick: B,
                                    children: [(0, b.jsx)(ka, {}), "Salvar pedido"],
                                }),
                                (0, b.jsx)(Xt, {
                                    children: "O pedido recebe um identificador SIM. Nenhuma integra\xE7\xE3o, envio ou pagamento \xE9 executado.",
                                }),
                            ],
                        }),
                    }),
                ],
            }),
        ],
    });
}
function iz({ id: e }: any): any {
    let { db: t, update: a, editor: o, confirm: n } = qa(), r: any = t.orders.find((f: any) => f.id === e);
    if (!r)
        return (0, b.jsx)(Wu, {});
    let l: any = zp(t, r.customerId);
    async function s(): Promise<any> {
        let f: any = Jo(t.orders);
        try { await a((d: any) => d.orders.unshift({
            ...Xu(r),
            id: f,
            number: f,
            date: bo,
            status: "Or\xE7amento",
            integration: "Sem envio ao ERP \xB7 simulado",
            source: "simulado",
        })); go("Pedido duplicado"); bn("/pedidos/" + f); } catch { /* A fila já informa o erro; a tela atual permanece aberta. */ }
    }
    let i: any = () => o({
        title: "Alterar detalhes do pedido",
        values: r,
        fields: [
            {
                key: "delivery",
                label: "data_entrega",
                kind: "date",
                required: !0,
            },
            {
                key: "agenda",
                label: "Tipo de Agenda",
                options: [
                    "1 - IMEDIATO",
                    "2 - AGENDADO",
                    "3 - FOB",
                    "4 - ANTECIPADO",
                ],
                required: !0,
            },
            {
                key: "payment",
                label: "Condi\xE7\xE3o de pagamento",
                options: t.payments,
                required: !0,
            },
            { key: "notes", label: "Informa\xE7\xF5es adicionais", kind: "area" },
        ],
        save: async (f: any) => await a((d: any) => {
            Object.assign(d.orders.find((m: any) => m.id === e), f, { source: "simulado" });
        }),
    }), u: any = () => o({
        title: "Faturar pedido \u2014 simula\xE7\xE3o",
        fields: [
            { key: "number", label: "N\xFAmero da nota fiscal", required: !0 },
            {
                key: "date",
                label: "Data de faturamento",
                kind: "date",
                required: !0,
            },
            {
                key: "value",
                label: "Valor faturado",
                kind: "currency",
                required: !0,
            },
        ],
        values: { date: bo, value: r.total },
        save: async (f: any) => await a((d: any) => {
            (d.invoices.push({
                ...f,
                id: Jo(d.invoices, "NF-SIM"),
                orderId: e,
                customerId: r.customerId,
                source: "simulado",
            }),
                (d.orders.find((m: any) => m.id === e).invoiced = f.value));
        }),
    }), c: any = (f: any) => o({
        title: "Simular envio por " + f,
        fields: [
            {
                key: "recipient",
                label: f === "e-mail"
                    ? "E-mail do destinat\xE1rio"
                    : "N\xFAmero do destinat\xE1rio",
                required: !0,
            },
            { key: "message", label: "Mensagem", kind: "area", required: !0 },
        ],
        values: { message: `Pedido #${r.number} \xB7 ${rt(r.total)}` },
        save: async (d: any) => {
            (await a((m: any) => m.emails.push({
                ...d,
                id: Jo(m.emails, "ENVIO-SIM"),
                channel: f,
                orderId: e,
                date: bo,
                status: "Simulado \xB7 n\xE3o enviado",
                source: "simulado",
            })),
                go("Simula\xE7\xE3o registrada; nada foi enviado"));
        },
    });
    return (0, b.jsxs)(fa, {
        width: "wide",
        children: [
            (0, b.jsx)(Ua, {
                title: "Pedido #" + r.number,
                description: r.integration,
                back: { label: "Pedidos", to: "/pedidos" },
                actions: (0, b.jsxs)(b.Fragment, {
                    children: [
                        (0, b.jsxs)(xt, {
                            onClick: () => window.print(),
                            children: [(0, b.jsx)(td, {}), "Visualizar"],
                        }),
                        (0, b.jsxs)(Ft, {
                            onClick: u, disabled:true, disabledReason:"Integração fiscal não configurada",
                            children: [(0, b.jsx)(Cm, {}), "Faturar pedido"],
                        }),
                        (0, b.jsx)(Il, {
                            label: "Mais op\xE7\xF5es do pedido",
                            actions: [
                                {
                                    label: "Alterar detalhes",
                                    onSelect: i,
                                    icon: (0, b.jsx)(tl, {}),
                                },
                                { label: "Duplicar pedido", onSelect: s },
                                {
                                    label: "Simular envio por e-mail",
                                    onSelect: () => go("Envio de e-mail indisponível: provedor não configurado"),
                                },
                                {
                                    label: "Simular envio por WhatsApp",
                                    onSelect: () => go("Envio de WhatsApp indisponível: provedor não configurado"),
                                },
                                {
                                    label: "Cancelar pedido",
                                    tone: "danger",
                                    onSelect: () => n("Cancelar pedido neste prot\xF3tipo?", async () => await a((f: any) => {
                                        ((f.orders.find((d: any) => d.id === e).status =
                                            "Cancelado"),
                                            (f.orders.find((d: any) => d.id === e).source =
                                                "simulado"));
                                    })),
                                },
                            ],
                        }),
                    ],
                }),
            }),
            (0, b.jsxs)("div", {
                className: "flex gap-2",
                children: [
                    (0, b.jsx)(qn, { value: r.status }),
                    (0, b.jsx)(qr, { row: r }),
                ],
            }),
            (0, b.jsxs)("div", {
                className: "grid gap-6 lg:grid-cols-2",
                children: [
                    (0, b.jsx)(Vt, {
                        children: (0, b.jsxs)(Ot, {
                            title: "Cliente",
                            children: [
                                (0, b.jsx)("a", {
                                    className: "font-medium ds-link",
                                    href: "#/clientes/" + r.customerId,
                                    children: l?.name || "Cliente indispon\xEDvel",
                                }),
                                (0, b.jsx)("p", {
                                    className: "text-body text-muted mt-2",
                                    children: l?.fantasy,
                                }),
                                (0, b.jsxs)(Xt, {
                                    children: [
                                        l?.cnpj || "CNPJ n\xE3o extra\xEDdo",
                                        " \xB7 ",
                                        l?.city || "Cidade n\xE3o extra\xEDda",
                                        l?.state ? " / " + l.state : "",
                                    ],
                                }),
                                (0, b.jsx)(xt, {
                                    href: "#/pedidos/novo?cliente=" + r.customerId,
                                    children: "Criar outro pedido",
                                }),
                            ],
                        }),
                    }),
                    (0, b.jsx)(Vt, {
                        children: (0, b.jsx)(Ot, {
                            title: "Representada",
                            children: (0, b.jsx)(_o, {
                                items: [
                                    { label: "Empresa", value: "Sulbr" },
                                    { label: "Vendedor", value: r.seller },
                                    { label: "Emiss\xE3o", value: xo(r.date) },
                                    { label: "data_entrega", value: xo(r.delivery) },
                                ],
                            }),
                        }),
                    }),
                ],
            }),
            (0, b.jsx)(Ot, {
                title: "Produtos do pedido",
                children: r.items
                    ? (0, b.jsx)(ya, {
                        toolbar: !1,
                        rows: r.items.map((f: any) => ({
                            ...f,
                            id: f.productId,
                            name: Ur(t, f.productId)?.name,
                            code: Ur(t, f.productId)?.code,
                            subtotal: f.qty * f.price,
                        })),
                        columns: [
                            z("code", "C\xF3digo"),
                            z("name", "Produto", void 0, { primary: !0, wide: !0 }),
                            z("qty", "Quantidade", (f: any) => na(f.qty) + " " + (Ur(t, f.productId)?.unit || ""), { align: "right" }),
                            z("price", "Pre\xE7o unit\xE1rio", (f: any) => rt(f.price), {
                                align: "right",
                            }),
                            z("subtotal", "Subtotal", (f: any) => rt(f.subtotal), {
                                align: "right",
                            }),
                        ],
                    })
                    : (0, b.jsx)(hn, {
                        title: "Itens deste pedido n\xE3o foram extra\xEDdos",
                        hint: "O cabe\xE7alho e o total foram observados. O arquivo n\xE3o inventa a composi\xE7\xE3o.",
                    }),
            }),
            (0, b.jsxs)(_i, {
                cols: 3,
                children: [
                    (0, b.jsx)(Ha, {
                        label: "Itens",
                        value: r.items?.length ?? "\u2014",
                    }),
                    (0, b.jsx)(Ha, {
                        label: "Quantidade",
                        value: r.items ? na(Zo(r.items, "qty")) : "\u2014",
                    }),
                    (0, b.jsx)(Ha, { label: "Valor total", value: rt(r.total) }),
                ],
            }),
            (0, b.jsx)(Vt, {
                children: (0, b.jsx)(Ot, {
                    title: "Detalhes do pedido",
                    action: (0, b.jsxs)(xt, {
                        onClick: i,
                        children: [(0, b.jsx)(tl, {}), "Alterar detalhes"],
                    }),
                    children: (0, b.jsx)(_o, {
                        items: [
                            { label: "Tipo", value: r.type },
                            { label: "Tipo de Agenda", value: r.agenda || pa },
                            { label: "pedido_erp", value: r.erp || pa },
                            {
                                label: "Peso bruto",
                                value: r.grossWeight != null ? na(r.grossWeight) + " kg" : pa,
                            },
                            {
                                label: "Frete",
                                value: r.id === "2351"
                                    ? "N\xE3o informado na origem"
                                    : rt(r.freight),
                            },
                            { label: "Informa\xE7\xF5es adicionais", value: r.notes || pa },
                        ],
                    }),
                }),
            }),
        ],
    });
}
function uz(): any {
    let { db: e, editor: t, update: a } = qa();
    return (0, b.jsxs)(fa, {
        width: "wide",
        children: [
            (0, b.jsx)(Ua, {
                title: "Clientes",
                description: "Carteira recuperada dos pedidos observados \xB7 15 clientes no recorte inicial",
                actions: (0, b.jsxs)(Ft, {
                    onClick: () => k5(t, a, e),
                    children: [(0, b.jsx)(Sa, {}), "Cadastrar cliente"],
                }),
            }),
            (0, b.jsx)(Ui, {
                area: "clientes",
                items: [
                    ["/clientes", "Clientes"],
                    ["/clientes/vinculos", "V\xEDnculos e permiss\xF5es"],
                    ["/config/clientes/campos", "Configura\xE7\xF5es"],
                ],
            }),
            (0, b.jsx)(ya, {
                rows: e.customers,
                label: "Clientes",
                onRowClick: (o: any) => bn("/clientes/" + o.id),
                columns: [
                    z("name", "Raz\xE3o social", (o: any) => (0, b.jsxs)("div", {
                        className: "space-y-1",
                        children: [
                            (0, b.jsx)("a", {
                                className: "font-medium ds-link",
                                href: "#/clientes/" + o.id,
                                children: o.name,
                            }),
                            (0, b.jsxs)(Xt, { children: [o.fantasy, " \xB7 ", o.code] }),
                        ],
                    }), { primary: !0, wide: !0 }),
                    z("city", "Cidade"),
                    z("state", "UF"),
                    z("seller", "Vendedor observado"),
                    z("blocked", "Situa\xE7\xE3o", (o: any) => (0, b.jsx)(qn, {
                        value: o.blocked
                            ? "Bloqueado"
                            : o.source === "simulado"
                                ? "Ativo"
                                : "Cadastro observado",
                    })),
                    z("source", "Origem", (o: any) => (0, b.jsx)(qr, { row: o })),
                ],
                actions: (0, b.jsx)(Gp, {
                    rows: e.customers,
                    name: "clientes-sulbr",
                    columns: [
                        "code",
                        "name",
                        "fantasy",
                        "cnpj",
                        "city",
                        "state",
                        "seller",
                        "source",
                    ],
                }),
            }),
        ],
    });
}
function cz(): any {
    return [
        { key: "name", label: "Raz\xE3o Social", required: !0 },
        { key: "fantasy", label: "Nome Fantasia", required: !0 },
        { key: "cnpj", label: "CNPJ" },
        {
            key: "profile",
            label: "Caracter\xEDstica do cliente",
            options: [
                "Supermercado",
                "Mercearia",
                "Distribuidora",
                "Bar / Restaurante",
                "Padaria",
                "Conveni\xEAncia",
                "Atacado",
                "Outro",
            ],
        },
        { key: "ie", label: "Inscri\xE7\xE3o Estadual" },
        { key: "state", label: "Estado" },
        { key: "district", label: "Bairro" },
        { key: "complement", label: "Complemento" },
        { key: "city", label: "Cidade/Munic\xEDpio" },
        { key: "cep", label: "CEP (Receita Federal)" },
        { key: "address", label: "Endere\xE7o (Receita Federal)" },
        { key: "number", label: "N\xFAmero (Receita Federal)" },
        {
            key: "deliveryCepSame",
            label: "CEP de entrega \u2014 mesmo do cadastro?",
        },
        {
            key: "deliveryAddressSame",
            label: "Endere\xE7o de entrega \u2014 mesmo do cadastro?",
        },
        {
            key: "deliveryNumberSame",
            label: "N\xFAmero de entrega \u2014 mesmo do cadastro?",
        },
        {
            key: "deliveryContact",
            label: "Contato do setor de log\xEDstica/recebimento",
        },
        { key: "phone1", label: "Telefone fixo 1" },
        { key: "cell1", label: "Telefone celular 1" },
        { key: "email", label: "E-mail para cadastro" },
        { key: "emailNfe", label: "E-mail para envio da nota fiscal" },
        { key: "paymentTerm", label: "Prazo de pagamento" },
        {
            key: "paymentMethod",
            label: "Forma de pagamento (selecione apenas 1)",
            options: [
                "Boleto",
                "PIX",
                "Dinheiro",
                "Cart\xE3o",
                "35 DD",
                "28 DD",
                "21 DD",
            ],
        },
        {
            key: "discountContract",
            label: "Possui contrato de desconto? (indicar %)",
        },
        {
            key: "firstOrderBonus",
            label: "Possui bonifica\xE7\xE3o de primeiro pedido? (indicar % ou quantidade)",
        },
        {
            key: "__priceList",
            label: "Produtos e pre\xE7os do cliente",
            kind: "priceList",
            required: !0,
        },
        { key: "priceTableMatch", label: "Tabela identificada" },
        { key: "notes", label: "Observa\xE7\xF5es do cliente", kind: "area" },
    ];
}
function k5(e: any, t: any, a: any, o: any = undefined): any {
    e({
        title: o ? "Alterar cliente" : "Cadastrar cliente",
        values: o ? {...o, __priceList:o.refItems || o.__priceList || []} : {},
        fields: cz(),
        validate: (n: any) => a.config.duplicateDocument &&
            n.cnpj &&
            a.customers.some((r: any) => r.id !== o?.id &&
                r.cnpj?.replace(/\D/g, "") === n.cnpj.replace(/\D/g, ""))
            ? "CPF/CNPJ já cadastrado na SulBR."
            : "",
        save: async (n: any) => {
            n={...n,priceTableMatch:identifyPriceTable(a,n.__priceList || []),refItems:n.__priceList || []};
            await t((r: any) => {
                if (o)
                    Object.assign(r.customers.find((l: any) => l.id === o.id), n, {
                        priceTables: n.priceTableMatch ? [n.priceTableMatch] : [],
                        source: "simulado",
                    });
                else {
                    let l: any = Jo(r.customers, "CLI-SIM");
                    r.customers.push({
                        ...n,
                        id: l,
                        code: l,
                        blocked: !1,
                        tags: [],
                        priceTables: n.priceTableMatch ? [n.priceTableMatch] : [],
                        refItems: n.__priceList || [],
                        refProduct: n.refProductId,
                        refPrice: n.refPrice,
                        createdAt: businessDate(),
                        source: "simulado",
                    });
                }
            });
        },
    });
}
function dz({ id: e }: any): any {
    let { db: t, editor: a, update: o, confirm: n } = qa(), r: any = zp(t, e), [l, s] = (0, He.useState)("resumo"), [i, u] = (0, He.useState)(!1);
    if (!r)
        return (0, b.jsx)(Wu, {});
    let c: any = t.orders.filter((p: any) => p.customerId === e), f: any = t.tasks.filter((p: any) => p.customerId === e), d: any = c.filter((p: any) => p.type === "Venda" && p.status === "Conclu\xEDdo"), m: any = Zo(d, "total");
    return (0, b.jsxs)(fa, {
        width: "wide",
        children: [
            (0, b.jsx)(Ua, {
                title: r.fantasy || r.name,
                description: r.name + " \xB7 " + r.code,
                back: { label: "Clientes", to: "/clientes" },
                actions: (0, b.jsxs)(b.Fragment, {
                    children: [
                        (0, b.jsxs)(xt, {
                            href: "#/clientes/vinculos?cliente=" + e,
                            children: [(0, b.jsx)(Jc, {}), "V\xEDnculos e permiss\xF5es"],
                        }),
                        (0, b.jsxs)(Ft, {
                            onClick: () => k5(a, o, t, r),
                            children: [(0, b.jsx)(tl, {}), "Alterar"],
                        }),
                        (0, b.jsx)(Il, {
                            label: "Mais op\xE7\xF5es do cliente",
                            actions: [
                                {
                                    label: r.blocked ? "Desbloquear cliente" : "Bloquear cliente",
                                    onSelect: () => n((r.blocked ? "Desbloquear" : "Bloquear") +
                                        " cliente no sistema?", async () => await o((p: any) => {
                                        let y: any = zp(p, e);
                                        ((y.blocked = !y.blocked), (y.source = "simulado"));
                                    })),
                                },
                                {
                                    label: "Excluir cliente",
                                    tone: "danger",
                                    onSelect: () => n("Excluir cliente deste prot\xF3tipo?", async () => {
                                        (await o((p: any) => {
                                            p.customers = p.customers.filter((y: any) => y.id !== e);
                                        }),
                                            bn("/clientes"));
                                    }, "Os pedidos preservam seu identificador. Nada ser\xE1 exclu\xEDdo do Sul."),
                                },
                            ],
                        }),
                    ],
                }),
            }),
            (0, b.jsxs)("div", {
                className: "flex flex-wrap gap-2",
                children: [
                    (0, b.jsx)(qr, { row: r }),
                    r.blocked && (0, b.jsx)(qn, { value: "Bloqueado" }),
                    r.portal &&
                        (0, b.jsx)(bi, {
                            tone: "ok",
                            children: "Portal liberado na ficha observada",
                        }),
                ],
            }),
            (0, b.jsx)(of, {
                label: "Se\xE7\xF5es do cliente",
                items: La(["resumo", "pedidos", "tarefas", "titulos"]).map((p: any) => ({
                    id: p.value,
                    label: ({
                        resumo: "Resumo",
                        pedidos: "Pedidos e atividades",
                        tarefas: "Tarefas e oportunidades",
                        titulos: "T\xEDtulos e notas fiscais",
                    } as Record<string, string>)[p.value],
                })),
                value: l,
                onChange: s,
            }),
            l === "resumo" &&
                (0, b.jsxs)(b.Fragment, {
                    children: [
                        (0, b.jsxs)("div", {
                            className: "grid gap-6 lg:grid-cols-2",
                            children: [
                                (0, b.jsx)(Vt, {
                                    children: (0, b.jsx)(Ot, {
                                        title: "Cadastro",
                                        action: (0, b.jsx)(xt, {
                                            onClick: () => u(!i),
                                            children: i
                                                ? "Recolher cadastro"
                                                : "Ver cadastro completo",
                                        }),
                                        children: (0, b.jsx)(_o, {
                                            items: [
                                                { label: "Endere\xE7o", value: r.address || pa },
                                                {
                                                    label: "Cidade / UF",
                                                    value: r.city ? r.city + " / " + r.state : pa,
                                                },
                                                { label: "CEP", value: r.cep || pa },
                                                ...(i
                                                    ? [
                                                        { label: "Raz\xE3o social", value: r.name },
                                                        { label: "Fantasia", value: r.fantasy },
                                                        { label: "CPF/CNPJ", value: r.cnpj || pa },
                                                        {
                                                            label: "Vendedor observado",
                                                            value: r.seller || pa,
                                                        },
                                                        {
                                                            label: "Tabelas de pre\xE7o vinculadas",
                                                            value: r.priceTables?.join(", ") ||
                                                                "V\xEDnculos n\xE3o extra\xEDdos",
                                                        },
                                                        { label: "E-mail", value: r.email || pa },
                                                    ]
                                                    : []),
                                            ],
                                        }),
                                    }),
                                }),
                                (0, b.jsx)(Vt, {
                                    children: (0, b.jsx)(Ot, {
                                        title: "Limite de cr\xE9dito",
                                        action: (0, b.jsxs)(xt, {
                                            onClick: () => a({
                                                title: "Editar limite de cr\xE9dito local",
                                                values: { credit: r.credit ?? null },
                                                fields: [
                                                    {
                                                        key: "credit",
                                                        label: "Limite total",
                                                        kind: "currency",
                                                        required: !0,
                                                    },
                                                ],
                                                save: async (p: any) => await o((y: any) => Object.assign(zp(y, e), p, {
                                                    source: "simulado",
                                                })),
                                            }),
                                            children: [(0, b.jsx)(tl, {}), "Editar"],
                                        }),
                                        children: (0, b.jsx)(_o, {
                                            items: [
                                                {
                                                    label: "Limite total",
                                                    value: r.credit != null
                                                        ? rt(r.credit)
                                                        : e === "66840911"
                                                            ? "N\xE3o definido na origem"
                                                            : pa,
                                                },
                                                {
                                                    label: "Limite dispon\xEDvel",
                                                    value: r.credit != null
                                                        ? rt(r.credit)
                                                        : "N\xE3o calculado",
                                                },
                                                {
                                                    label: "Portal global",
                                                    value: t.config.portal
                                                        ? "Ativa\xE7\xE3o simulada"
                                                        : "A tela original oferecia criar portal",
                                                },
                                            ],
                                        }),
                                    }),
                                }),
                            ],
                        }),
                        (0, b.jsxs)(_i, {
                            cols: 3,
                            children: [
                                (0, b.jsx)(Ha, { label: "Compras no arquivo", value: rt(m) }),
                                (0, b.jsx)(Ha, { label: "Pedidos de venda", value: d.length }),
                                (0, b.jsx)(Ha, {
                                    label: "Ticket m\xE9dio",
                                    value: d.length ? rt(m / d.length) : "\u2014",
                                }),
                            ],
                        }),
                        (0, b.jsx)(Ot, {
                            title: "Produtos encontrados nos pedidos deste cliente",
                            children: (0, b.jsx)(ya, {
                                toolbar: !1,
                                rows: dv(t, c),
                                columns: [
                                    z("name", "Produto", void 0, { primary: !0, wide: !0 }),
                                    z("qty", "Quantidade", (p: any) => na(p.qty), { align: "right" }),
                                    z("total", "Valor", (p: any) => rt(p.total), { align: "right" }),
                                ],
                            }),
                        }),
                        (0, b.jsx)(Xt, {
                            children: e === "66840911"
                                ? "Na inspe\xE7\xE3o, o cliente aparecia na posi\xE7\xE3o 261\xBA e tinha R$ 9.008,80 em um pedido nos \xFAltimos seis meses."
                                : "Os indicadores são calculados sobre os pedidos salvos e os filtros selecionados.",
                        }),
                    ],
                }),
            l === "pedidos" &&
                (0, b.jsxs)(b.Fragment, {
                    children: [
                        (0, b.jsxs)("div", {
                            className: "flex flex-wrap gap-2",
                            children: [
                                (0, b.jsxs)(Ft, {
                                    href: "#/pedidos/novo?cliente=" + e,
                                    children: [(0, b.jsx)(Sa, {}), "Criar pedido"],
                                }),
                                (0, b.jsx)(xt, {
                                    onClick: () => M5(a, o, t, e),
                                    children: "Registrar atividade",
                                }),
                            ],
                        }),
                        (0, b.jsx)(ya, {
                            rows: c,
                            columns: jp(t),
                            onRowClick: (p: any) => bn("/pedidos/" + p.id),
                        }),
                    ],
                }),
            l === "tarefas" &&
                (0, b.jsxs)(b.Fragment, {
                    children: [
                        (0, b.jsxs)("div", {
                            className: "flex flex-wrap gap-2",
                            children: [
                                (0, b.jsxs)(Ft, {
                                    onClick: () => N5(a, o, t, e),
                                    children: [(0, b.jsx)(Sa, {}), "Criar tarefa"],
                                }),
                                (0, b.jsx)(xt, {
                                    onClick: () => A5(a, o, t, e),
                                    children: "Criar oportunidade",
                                }),
                            ],
                        }),
                        (0, b.jsx)(ya, { rows: f, columns: T5(t) }),
                        (0, b.jsx)(Ot, {
                            title: "Oportunidades abertas",
                            children: (0, b.jsx)(ya, {
                                toolbar: !1,
                                rows: t.opportunities.filter((p: any) => p.customerId === e && p.status === "Aberta"),
                                columns: [
                                    z("name", "Oportunidade", void 0, { primary: !0 }),
                                    z("stage", "Etapa"),
                                    z("value", "Valor", (p: any) => rt(p.value)),
                                ],
                            }),
                        }),
                    ],
                }),
            l === "titulos" &&
                (0, b.jsxs)(b.Fragment, {
                    children: [
                        (0, b.jsx)(Ot, {
                            title: "T\xEDtulos",
                            action: (0, b.jsxs)(Ft, {
                                onClick: () => a({
                                    title: "Adicionar t\xEDtulo local",
                                    values: { customerId: e, due: bo, status: "A vencer" },
                                    fields: [
                                        { key: "document", label: "Documento", required: !0 },
                                        {
                                            key: "due",
                                            label: "Vencimento",
                                            kind: "date",
                                            required: !0,
                                        },
                                        {
                                            key: "value",
                                            label: "Valor",
                                            kind: "currency",
                                            required: !0,
                                        },
                                    ],
                                    save: async (p: any) => await o((y: any) => y.titles.push({
                                        ...p,
                                        id: Jo(y.titles, "TIT-SIM"),
                                        customerId: e,
                                        status: "A vencer",
                                        source: "simulado",
                                    })),
                                }),
                                children: [(0, b.jsx)(Sa, {}), "Adicionar t\xEDtulo"],
                            }),
                            children: (0, b.jsx)(ya, {
                                rows: t.titles.filter((p: any) => p.customerId === e),
                                columns: [
                                    z("document", "Documento", void 0, { primary: !0 }),
                                    z("due", "Vencimento", (p: any) => xo(p.due)),
                                    z("value", "Valor", (p: any) => rt(p.value)),
                                    z("status", "Situa\xE7\xE3o", (p: any) => (0, b.jsx)(qn, { value: p.status })),
                                ],
                            }),
                        }),
                        (0, b.jsx)(Ot, {
                            title: "Notas fiscais",
                            children: (0, b.jsx)(ya, {
                                rows: t.invoices.filter((p: any) => p.customerId === e),
                                columns: [
                                    z("number", "Nota", void 0, { primary: !0 }),
                                    z("date", "Data", (p: any) => xo(p.date)),
                                    z("value", "Valor", (p: any) => rt(p.value)),
                                ],
                                empty: "N\xE3o h\xE1 notas fiscais extra\xEDdas para este cliente",
                            }),
                        }),
                    ],
                }),
        ],
    });
}
function fz(): any {
    let { db: e, update: t } = qa(), [a, o] = (0, He.useState)(() => {
        let d: any = new URLSearchParams(location.hash.split("?")[1]).get("cliente");
        return d ? [d] : [];
    }), [n, r] = (0, He.useState)("Tabelas de pre\xE7o"), [l, s] = (0, He.useState)(""), [i, u] = (0, He.useState)("Adicionar"), c: any = n === "Condi\xE7\xF5es de pagamento"
        ? e.payments
        : n === "Tabelas de pre\xE7o"
            ? ["PADR\xC3O SP", "BAFFA", "PROEN\xC7A", "TESTE"]
            : n === "Categorias"
                ? Array.from(new Set(e.products.map((d: any) => d.category).filter(Boolean)))
                : (e.collections["clientes/tags"] || []).map((d: any) => d.name);
    async function f(): Promise<any> {
        if (!a.length || !l)
            return;
        let d: any = n === "Tabelas de pre\xE7o"
            ? "priceTables"
            : n === "Tags"
                ? "tags"
                : n === "Categorias"
                    ? "categories"
                    : "payments";
        (await t((m: any) => m.customers.forEach((p: any) => {
            if (a.includes(p.id)) {
                let y: any = p[d] || [];
                ((p[d] =
                    i === "Substituir"
                        ? [l]
                        : i === "Remover"
                            ? y.filter((C: any) => C !== l)
                            : [...new Set([...y, l])]),
                    (p.source = "simulado"));
            }
        })),
            go("V\xEDnculos alterados somente no prot\xF3tipo"));
    }
    return (0, b.jsxs)(fa, {
        width: "wide",
        children: [
            (0, b.jsx)(Ua, {
                title: "V\xEDnculos e permiss\xF5es de cliente",
                description: "Adicionar, substituir ou remover v\xEDnculos em sele\xE7\xE3o local",
                back: { label: "Clientes", to: "/clientes" },
            }),
            (0, b.jsxs)(Vt, {
                children: [
                    (0, b.jsxs)("div", {
                        className: "grid gap-4 sm:grid-cols-3",
                        children: [
                            (0, b.jsx)(ho, {
                                label: "Tipo de v\xEDnculo",
                                value: n,
                                onValueChange: (d: any) => {
                                    (r(d), s(""));
                                },
                                options: La([
                                    "Categorias",
                                    "Condi\xE7\xF5es de pagamento",
                                    "Tabelas de pre\xE7o",
                                    "Tags",
                                ]),
                            }),
                            (0, b.jsx)(Sl, {
                                label: "Valor",
                                value: l,
                                onValueChange: (d: any) => s(String(d)),
                                options: La(c),
                            }),
                            (0, b.jsx)(ho, {
                                label: "Opera\xE7\xE3o",
                                value: i,
                                onValueChange: u,
                                options: La(["Adicionar", "Substituir", "Remover"]),
                            }),
                        ],
                    }),
                    (0, b.jsxs)("div", {
                        className: "mt-4 flex items-center justify-between gap-4",
                        children: [
                            (0, b.jsxs)(Xt, {
                                children: [
                                    a.length,
                                    " cliente(s) selecionado(s). Os v\xEDnculos n\xE3o alteram pre\xE7os n\xE3o extra\xEDdos.",
                                ],
                            }),
                            (0, b.jsxs)(Ft, {
                                onClick: f,
                                disabled: !a.length || !l,
                                disabledReason: "Selecione clientes e um valor",
                                children: [(0, b.jsx)(Jc, {}), "Aplicar v\xEDnculo local"],
                            }),
                        ],
                    }),
                ],
            }),
            (0, b.jsx)(ya, {
                rows: e.customers,
                columns: [
                    z("select", "Selecionar", (d: any) => (0, b.jsx)(Yy, {
                        label: "Selecionar " + d.name,
                        hideLabel: !0,
                        checked: a.includes(d.id),
                        onCheckedChange: (m: any) => o(m ? [...a, d.id] : a.filter((p: any) => p !== d.id)),
                    }), { selection: !0 }),
                    z("name", "Raz\xE3o social", void 0, { primary: !0, wide: !0 }),
                    z("city", "Cidade"),
                    z("state", "UF"),
                    z("priceTables", "Tabelas de pre\xE7o", (d: any) => d.priceTables?.join(", ") || "N\xE3o extra\xEDdo"),
                    z("tags", "Tags", (d: any) => d.tags?.join(", ") || "\u2014"),
                ],
            }),
        ],
    });
}
function mz(): any {
    let { db: e, update: t, editor: a, confirm: o } = qa(), [n, r] = (0, He.useState)(""), l: any = e.products.filter((s: any) => !n || s.category === n);
    return (0, b.jsxs)(fa, {
        width: "wide",
        children: [
            (0, b.jsx)(Ua, {
                title: "Produtos",
                description: "Cat\xE1logo do recorte \xB7 integra\xE7\xE3o observada: 65099-CorpCloud Solu\xE7\xF5es",
                actions: (0, b.jsxs)(Ft, {
                    onClick: () => a({
                        title: "Cadastrar produto local",
                        fields: pz(),
                        values: { unit: "PC", price: null },
                        save: async (s: any) => await t((i: any) => {
                            i.products.push({
                                ...s,
                                id: Jo(i.products, "PRD-SIM"),
                                active: !0,
                                variants: [],
                                source: "simulado",
                                priceSource: "Pre\xE7o definido no prot\xF3tipo",
                            });
                        }),
                    }),
                    children: [(0, b.jsx)(Sa, {}), "Cadastrar produto"],
                }),
            }),
            (0, b.jsx)(Ui, {
                area: "produtos",
                items: [
                    ["/produtos", "Produtos"],
                    ["/produtos/destaques", "Destaques"],
                    ["/config/produtos/categorias", "Configura\xE7\xF5es"],
                ],
            }),
            (0, b.jsxs)("div", {
                className: "flex flex-wrap items-end gap-3",
                children: [
                    (0, b.jsx)(ho, {
                        label: "Categoria",
                        value: n,
                        onValueChange: r,
                        options: La([
                            { value: "", label: "Todas as categorias" },
                            ...Array.from(new Set(e.products.map((s: any) => s.category).filter(Boolean))).map((s: any) => ({ value: String(s), label: String(s) })),
                        ]),
                    }),
                    (0, b.jsxs)(xt, {
                        onClick: () => {
                            e.config.stock
                                ? bn("/relatorios/estoque")
                                : o("Habilitar controle de estoque local?", async () => await t((s: any) => {
                                    s.config.stock = !0;
                                }), "O Sul real permanece com controle desabilitado.");
                        },
                        children: [(0, b.jsx)(du, {}), "Gerenciar estoque"],
                    }),
                    (0, b.jsx)(Gp, {
                        rows: l,
                        name: "produtos-sulbr",
                        columns: [
                            "code",
                            "name",
                            "unit",
                            "category",
                            "price",
                            "priceSource",
                            "source",
                        ],
                    }),
                ],
            }),
            (0, b.jsx)(ya, {
                rows: l,
                label: "Produtos",
                onRowClick: (s: any) => bn("/produtos/" + s.id),
                columns: [
                    z("icon", "", () => (0, b.jsx)("div", {
                        className: "product-mark",
                        children: (0, b.jsx)(du, { size: 22 }),
                    })),
                    z("code", "C\xF3digo"),
                    z("name", "Produto", (s: any) => (0, b.jsxs)("div", {
                        children: [
                            (0, b.jsx)("a", {
                                className: "font-medium ds-link",
                                href: "#/produtos/" + s.id,
                                children: s.name,
                            }),
                            (0, b.jsx)(Xt, { children: s.priceSource }),
                        ],
                    }), { primary: !0, wide: !0 }),
                    z("category", "Categoria", (s: any) => (0, b.jsxs)("div", {
                        children: [
                            s.category || pa,
                            s.categorySource &&
                                (0, b.jsx)(Xt, { children: "Inferida da descri\xE7\xE3o" }),
                        ],
                    })),
                    z("unit", "Unidade"),
                    z("price", "Pre\xE7o unit\xE1rio observado", (s: any) => rt(s.price), {
                        align: "right",
                    }),
                    z("source", "Origem", (s: any) => (0, b.jsx)(qr, { row: s })),
                ],
            }),
            (0, b.jsx)(Xt, {
                children: "Os tr\xEAs pre\xE7os conhecidos vieram dos itens do pedido #2351. As centenas de tabelas de pre\xE7o n\xE3o foram reconstru\xEDdas.",
            }),
        ],
    });
}
function pz(): any {
    return [
        { key: "name", label: "Nome", required: !0 },
        { key: "code", label: "C\xF3digo" },
        { key: "unit", label: "Unidade de medida" },
        { key: "multiple", label: "Venda em m\xFAltiplos de", kind: "number" },
        { key: "category", label: "Categoria" },
        {
            key: "price",
            label: "Pre\xE7o unit\xE1rio",
            kind: "currency",
            required: !0,
        },
    ];
}
function hz({ id: e }: any): any {
    let { db: t, update: a, confirm: o } = qa(), n: any = Ur(t, e), [r, l] = (0, He.useState)(() => Xu(n || {})), [s, i] = (0, He.useState)("precos"), u: any = (f: any, d: any) => l((m: any) => ({ ...m, [f]: d }));
    if (!n)
        return (0, b.jsx)(Wu, {});
    let c: any = async () => {
        if (!r.name || (r.price ?? 0) < 0) {
            go("Informe nome e pre\xE7o v\xE1lido", void 0, "bad");
            return;
        }
        (await a((f: any) => Object.assign(Ur(f, e), r, {
            source: "simulado",
            priceSource: "Pre\xE7o definido no prot\xF3tipo",
        })),
            go("Produto alterado no sistema"));
    };
    return (0, b.jsxs)(fa, {
        width: "wide",
        children: [
            (0, b.jsx)(Ua, {
                title: "Ficha do produto",
                description: n.name,
                back: { label: "Produtos", to: "/produtos" },
                actions: (0, b.jsxs)(b.Fragment, {
                    children: [
                        (0, b.jsx)(xt, {
                            onClick: () => {
                                (l(Xu(n)), go("Edi\xE7\xE3o local descartada"));
                            },
                            children: "Cancelar",
                        }),
                        (0, b.jsxs)(Ft, {
                            onClick: c,
                            children: [(0, b.jsx)(ka, {}), "Salvar altera\xE7\xF5es"],
                        }),
                        (0, b.jsx)(Il, {
                            label: "Op\xE7\xF5es do produto",
                            actions: [
                                {
                                    label: "Excluir produto",
                                    tone: "danger",
                                    onSelect: () => o("Excluir produto no sistema?", async () => {
                                        (await a((f: any) => {
                                            f.products = f.products.filter((d: any) => d.id !== e);
                                        }),
                                            bn("/produtos"));
                                    }, "Os pedidos preservam os seus itens. Nenhum registro real ser\xE1 exclu\xEDdo."),
                                },
                            ],
                        }),
                    ],
                }),
            }),
            (0, b.jsx)(qr, { row: n }),
            (0, b.jsx)(Vt, {
                children: (0, b.jsxs)(Vi, {
                    children: [
                        (0, b.jsx)(vr, {
                            label: "Nome",
                            value: r.name || "",
                            onChange: (f: any) => u("name", f),
                        }),
                        (0, b.jsx)(vr, {
                            label: "C\xF3digo",
                            value: r.code || "",
                            onChange: (f: any) => u("code", f),
                        }),
                        (0, b.jsx)(vr, {
                            label: "Unidade de medida",
                            value: r.unit || "",
                            onChange: (f: any) => u("unit", f),
                        }),
                        (0, b.jsx)(Hr, {
                            label: "Venda em m\xFAltiplos de",
                            min: 1,
                            value: r.multiple ?? null,
                            onChange: (f: any) => u("multiple", f),
                            hint: "Valor n\xE3o extra\xEDdo quando vazio",
                        }),
                        (0, b.jsx)(vr, {
                            label: "Categoria",
                            value: r.category || "",
                            onChange: (f: any) => u("category", f),
                        }),
                    ],
                }),
            }),
            (0, b.jsx)(of, {
                label: "Abas do produto",
                items: [
                    { id: "precos", label: "Tabelas de pre\xE7o" },
                    { id: "gerais", label: "Informa\xE7\xF5es gerais" },
                    { id: "variacoes", label: "Varia\xE7\xF5es" },
                    { id: "peso", label: "Peso e dimens\xF5es" },
                ],
                value: s,
                onChange: i,
            }),
            s === "precos" &&
                (0, b.jsx)(Vt, {
                    children: (0, b.jsxs)(Ot, {
                        title: "Pre\xE7o unit\xE1rio",
                        children: [
                            (0, b.jsx)(Up, {
                                label: "Pre\xE7o unit\xE1rio",
                                value: r.price ?? null,
                                onChange: (f: any) => u("price", f),
                                hint: n.priceSource,
                            }),
                            (0, b.jsx)("div", {
                                className: "mt-5",
                                children: (0, b.jsx)(hn, {
                                    framed: !1,
                                    title: "Pre\xE7os espec\xEDficos por tabela n\xE3o extra\xEDdos",
                                    hint: "Nomes de tabelas observados incluem PADR\xC3O SP, BAFFA, PROEN\xC7A e TESTE. O mock n\xE3o replica seus valores.",
                                }),
                            }),
                        ],
                    }),
                }),
            s === "gerais" &&
                (0, b.jsx)(Vt, {
                    children: (0, b.jsxs)(Ot, {
                        title: "Informa\xE7\xF5es gerais",
                        children: [
                            (0, b.jsxs)(Vi, {
                                children: [
                                    (0, b.jsx)(Hr, {
                                        label: "IPI (%)",
                                        value: r.ipi ?? null,
                                        min: 0,
                                        max: 100,
                                        digits: 2,
                                        onChange: (f: any) => u("ipi", f),
                                    }),
                                    (0, b.jsx)(vr, {
                                        label: "NCM",
                                        value: r.ncm || "",
                                        onChange: (f: any) => u("ncm", f),
                                    }),
                                    (0, b.jsx)(Hr, {
                                        label: "Comiss\xE3o (%)",
                                        min: 0,
                                        max: 100,
                                        digits: 2,
                                        value: r.commission ?? null,
                                        onChange: (f: any) => u("commission", f),
                                    }),
                                ],
                            }),
                            (0, b.jsx)("div", {
                                className: "mt-4",
                                children: (0, b.jsx)($u, {
                                    label: "Informa\xE7\xF5es adicionais",
                                    value: r.notes || "",
                                    onChange: (f: any) => u("notes", f),
                                }),
                            }),
                            (0, b.jsx)(Xt, {
                                children: "Campos vazios correspondem a valores n\xE3o extra\xEDdos, n\xE3o a al\xEDquotas zero.",
                            }),
                        ],
                    }),
                }),
            s === "variacoes" &&
                (0, b.jsx)(Vt, {
                    children: (0, b.jsxs)(Ot, {
                        title: "Varia\xE7\xF5es",
                        children: [
                            (0, b.jsx)(vr, {
                                label: "Atributo de varia\xE7\xE3o",
                                value: r.variantLabel || "",
                                onChange: (f: any) => u("variantLabel", f),
                                hint: "Ex.: tamanho. Qualquer preenchimento \xE9 simulado.",
                            }),
                            (0, b.jsx)("div", {
                                className: "mt-4",
                                children: (0, b.jsx)(vr, {
                                    label: "Valores separados por v\xEDrgula",
                                    value: (r.variants || []).join(", "),
                                    onChange: (f: any) => u("variants", f
                                        .split(",")
                                        .map((d: any) => d.trim())
                                        .filter(Boolean)),
                                }),
                            }),
                            !r.variants?.length &&
                                (0, b.jsx)(hn, {
                                    framed: !1,
                                    title: e === "11240"
                                        ? "Produto sem varia\xE7\xF5es na ficha observada"
                                        : "Varia\xE7\xF5es n\xE3o extra\xEDdas",
                                    hint: "Defina atributos somente para experimentar o formul\xE1rio local.",
                                }),
                        ],
                    }),
                }),
            s === "peso" &&
                (0, b.jsx)(Vt, {
                    children: (0, b.jsxs)(Ot, {
                        title: "Peso e dimens\xF5es",
                        children: [
                            (0, b.jsx)(ho, {
                                label: "Forma de cadastro",
                                value: r.dimensionMode || "unitario",
                                onValueChange: (f: any) => u("dimensionMode", f),
                                options: La([
                                    {
                                        value: "unitario",
                                        label: "Peso e dimens\xF5es unit\xE1rias",
                                    },
                                    {
                                        value: "caixa",
                                        label: "Peso e dimens\xF5es da caixa master",
                                    },
                                ]),
                            }),
                            (0, b.jsx)("div", {
                                className: "mt-4",
                                children: (0, b.jsxs)(Vi, {
                                    children: [
                                        (0, b.jsx)(Hr, {
                                            label: "Peso bruto (kg)",
                                            value: r.weight ?? null,
                                            digits: 3,
                                            min: 0,
                                            onChange: (f: any) => u("weight", f),
                                        }),
                                        (0, b.jsx)(Hr, {
                                            label: "Largura (cm)",
                                            value: r.width ?? null,
                                            digits: 2,
                                            min: 0,
                                            onChange: (f: any) => u("width", f),
                                        }),
                                        (0, b.jsx)(Hr, {
                                            label: "Altura (cm)",
                                            value: r.height ?? null,
                                            digits: 2,
                                            min: 0,
                                            onChange: (f: any) => u("height", f),
                                        }),
                                        (0, b.jsx)(Hr, {
                                            label: "Comprimento (cm)",
                                            value: r.length ?? null,
                                            digits: 2,
                                            min: 0,
                                            onChange: (f: any) => u("length", f),
                                        }),
                                    ],
                                }),
                            }),
                            (0, b.jsx)(Xt, {
                                children: "As unidades foram observadas. Medidas n\xE3o extra\xEDdas permanecem vazias.",
                            }),
                        ],
                    }),
                }),
        ],
    });
}
function dv(e: any, t: any): any {
    let a: any = {};
    return (t.forEach((o: any) => (o.items || []).forEach((n: any) => {
        let r: any = Ur(e, n.productId), l: any = (a[n.productId] ||= {
            id: n.productId,
            code: r?.code,
            name: r?.name || "Produto n\xE3o dispon\xEDvel",
            qty: 0,
            total: 0,
        });
        ((l.qty += n.qty), (l.total += n.qty * n.price));
    })),
        Object.values(a));
}
function N5(e: any, t: any, a: any, o: any = ""): any {
    e({
        title: "Criar tarefa local",
        values: {
            customerId: o,
            date: bo,
            seller: a.company.user,
            status: "N\xE3o realizada",
        },
        fields: [
            { key: "name", label: "Descri\xE7\xE3o da tarefa", required: !0 },
            {
                key: "customerId",
                label: "Cliente",
                options: a.customers.map((n: any) => ({ value: n.id, label: n.name })),
            },
            { key: "date", label: "Data", kind: "date", required: !0 },
            {
                key: "seller",
                label: "Vendedor",
                options: sellerNames(a),
            },
        ],
        save: async (n: any) => await t((r: any) => r.tasks.push({
            ...n,
            id: Jo(r.tasks, "TAR-SIM"),
            status: "N\xE3o realizada",
            source: "simulado",
        })),
    });
}
function M5(e: any, t: any, a: any, o: any = ""): any {
    e({
        title: "Registrar atividade local",
        values: { customerId: o, date: bo },
        fields: [
            { key: "name", label: "Descri\xE7\xE3o", required: !0 },
            {
                key: "customerId",
                label: "Cliente",
                options: a.customers.map((n: any) => ({ value: n.id, label: n.name })),
            },
            { key: "date", label: "Data", kind: "date", required: !0 },
            {
                key: "result",
                label: "Resultado",
                options: ["Relacionamento", "Venda convertida"],
                required: !0,
            },
        ],
        save: async (n: any) => await t((r: any) => r.activities.push({
            ...n,
            id: Jo(r.activities, "ATV-SIM"),
            status: "Realizada",
            source: "simulado",
        })),
    });
}
function T5(e: any): any {
    return [
        z("name", "Descri\xE7\xE3o", void 0, { primary: !0, wide: !0 }),
        z("customer", "Cliente", (t: any) => (t.customerId ? Un(e, t.customerId) : "\u2014"), { get: (t: any) => Un(e, t.customerId) }),
        z("date", "Data", (t: any) => xo(t.date)),
        z("seller", "Vendedor"),
    ];
}
function v5({ routes: e = !1 }: any): any {
    let { db: t, update: a, editor: o, confirm: n } = qa(), [r, l] = (0, He.useState)("tarefas"), s: any = e ? t.routes : r === "tarefas" ? t.tasks : t.activities;
    return (0, b.jsxs)(fa, {
        width: "wide",
        children: [
            (0, b.jsx)(Ua, {
                title: e ? "Roteiros planejados" : "Agenda",
                description: e
                    ? "Na inspe\xE7\xE3o, n\xE3o havia roteiros criados."
                    : "O recorte observado estava vazio com filtros de G4 e atividades n\xE3o realizadas.",
                actions: (0, b.jsxs)(Ft, {
                    onClick: e
                        ? () => o({
                            title: "Criar roteiro local",
                            values: { date: bo },
                            fields: [
                                { key: "name", label: "Nome do roteiro", required: !0 },
                                {
                                    key: "seller",
                                    label: "Vendedor",
                                    options: sellerNames(t),
                                    required: !0,
                                },
                                { key: "date", label: "Data", kind: "date", required: !0 },
                                {
                                    key: "repeat",
                                    label: "Repete",
                                    options: ["N\xE3o repete", "Semanal", "Mensal"],
                                },
                                {
                                    key: "clients",
                                    label: "Clientes / observa\xE7\xF5es",
                                    kind: "area",
                                },
                            ],
                            save: async (u: any) => await a((c: any) => c.routes.push({
                                ...u,
                                id: Jo(c.routes, "ROT-SIM"),
                                status: "Planejado",
                                source: "simulado",
                            })),
                        })
                        : () => N5(o, a, t),
                    children: [(0, b.jsx)(Sa, {}), e ? "Criar roteiro" : "Criar tarefa"],
                }),
            }),
            (0, b.jsx)(Ui, {
                area: "agenda",
                items: [
                    ["/agenda", "Tarefas e atividades"],
                    ["/agenda/roteiros", "Roteiros"],
                ],
            }),
            !e &&
                (0, b.jsxs)("div", {
                    className: "flex flex-wrap justify-between gap-3",
                    children: [
                        (0, b.jsx)(ho, {
                            label: "Mostrar",
                            value: r,
                            onValueChange: l,
                            options: La([
                                { value: "tarefas", label: "Tarefas agendadas" },
                                { value: "atividades", label: "Atividades realizadas" },
                            ]),
                        }),
                        (0, b.jsx)(xt, {
                            onClick: () => M5(o, a, t),
                            children: "Registrar atividade",
                        }),
                    ],
                }),
            (0, b.jsx)(ya, {
                rows: s,
                columns: e
                    ? [
                        z("name", "Roteiro", void 0, { primary: !0 }),
                        z("seller", "Vendedor"),
                        z("date", "Data", (u: any) => xo(u.date)),
                        z("repeat", "Repete"),
                        z("clients", "Clientes / observa\xE7\xF5es"),
                        z("status", "Situa\xE7\xE3o", (u: any) => (0, b.jsx)(qn, { value: u.status })),
                        z("actions", "A\xE7\xF5es", (u: any) => (0, b.jsx)(Il, {
                            label: "Op\xE7\xF5es do roteiro",
                            actions: [
                                {
                                    label: "Excluir roteiro local",
                                    tone: "danger",
                                    onSelect: () => n("Excluir roteiro no sistema?", async () => await a((c: any) => {
                                        c.routes = c.routes.filter((f: any) => f.id !== u.id);
                                    })),
                                },
                            ],
                        }), { action: !0 }),
                    ]
                    : [
                        ...T5(t),
                        z("actions", "A\xE7\xF5es", (u: any) => (0, b.jsx)(Il, {
                            label: "Op\xE7\xF5es da tarefa",
                            actions: [
                                {
                                    label: "Concluir tarefa",
                                    onSelect: async () => {
                                        (await a((c: any) => {
                                            let f: any = c.tasks.find((d: any) => d.id === u.id);
                                            f && (f.status = "Realizada");
                                        }),
                                            go("Tarefa conclu\xEDda no sistema"));
                                    },
                                },
                                {
                                    label: "Excluir registro local",
                                    tone: "danger",
                                    onSelect: () => n("Excluir registro no sistema?", async () => await a((c: any) => {
                                        c[r === "tarefas" ? "tasks" : "activities"] = c[r === "tarefas" ? "tasks" : "activities"].filter((f: any) => f.id !== u.id);
                                    })),
                                },
                            ],
                        }), { action: !0 }),
                    ],
                actions: (0, b.jsx)(Gp, { rows: s, name: e ? "roteiros" : "agenda" }),
            }),
        ],
    });
}
function A5(e: any, t: any, a: any, o: any = ""): any {
    e({
        title: "Criar oportunidade local",
        values: {
            customerId: o,
            stage: a.stages[0],
            seller: a.company.user,
            date: bo,
            value: null,
        },
        fields: [
            { key: "name", label: "Nome da oportunidade", required: !0 },
            { key: "value", label: "Valor estimado", kind: "currency", required: !0 },
            {
                key: "seller",
                label: "Vendedor",
                options: sellerNames(a),
            },
            { key: "stage", label: "Etapa", options: a.stages, required: !0 },
            { key: "date", label: "Data de abertura", kind: "date", required: !0 },
        ],
        save: async (n: any) => await t((r: any) => r.opportunities.push({
            ...n,
            id: Jo(r.opportunities, "OP-SIM"),
            status: "Aberta",
            source: "simulado",
        })),
    });
}
function gz(): any {
    let { db: e, update: t, editor: a, confirm: o } = qa(), [n, r] = (0, He.useState)(""), [l, s] = (0, He.useState)("Aberta"), i: any = L5(e.opportunities, n).filter((c: any) => !l || c.status === l), u: any = async (c: any, f: any) => {
        (await t((d: any) => {
            d.opportunities.find((m: any) => m.id === c).stage = f;
        }),
            go("Etapa alterada no sistema"));
    };
    return (0, b.jsxs)(fa, {
        width: "wide",
        children: [
            (0, b.jsx)(Ua, {
                title: "Funil de Vendas",
                description: "Vendas SulBR \xB7 Lead \u2192 Primeiro contato \u2192 Negocia\xE7\xE3o \u2192 Fechamento",
                actions: (0, b.jsxs)(Ft, {
                    onClick: () => A5(a, t, e),
                    children: [(0, b.jsx)(Sa, {}), "Criar oportunidade"],
                }),
            }),
            (0, b.jsx)(Ui, {
                area: "oportunidades",
                items: [
                    ["/oportunidades", "Funil de vendas"],
                    ["/config/crm/funis", "Configura\xE7\xE3o"],
                ],
            }),
            (0, b.jsx)(nv, {
                children: (0, b.jsx)(cv, {
                    query: n,
                    onQuery: r,
                    shown: i.length,
                    total: e.opportunities.length,
                    noun: "oportunidade",
                    hideSearch: !1,
                    dirty: !!n,
                    onClear: () => r(""),
                    children: (0, b.jsx)(ho, {
                        label: "Situa\xE7\xE3o",
                        size: "compact",
                        value: l,
                        options: La([
                            { value: "Aberta", label: "Abertas" },
                            { value: "Ganha", label: "Ganhas" },
                            { value: "Perdida", label: "Perdidas" },
                            { value: "", label: "Todas" },
                        ]),
                        onValueChange: s,
                    }),
                }),
            }),
            (0, b.jsx)(c1, {
                label: "Funil Vendas SulBR",
                children: e.stages.map((c: any) => {
                    let f: any = i.filter((d: any) => d.stage === c);
                    return (0, b.jsxs)(i1, {
                        title: c,
                        count: f.length,
                        meta: rt(Zo(f, "value")),
                        width: 240,
                        onDrop: (d: any) => {
                            d.preventDefault();
                            let m: any = d.dataTransfer.getData("text/plain");
                            e.opportunities.some((p: any) => p.id === m) && u(m, c);
                        },
                        children: [
                            f.map((d: any) => (0, b.jsx)(u1, {
                                title: d.name,
                                owner: {
                                    name: d.seller,
                                    initials: d.seller?.slice(0, 2) || "G4",
                                },
                                onDragStart: (m: any) => m.dataTransfer.setData("text/plain", d.id),
                                flag: (0, b.jsxs)("div", {
                                    className: "space-y-2",
                                    children: [
                                        (0, b.jsx)("div", {
                                            className: "text-body",
                                            children: rt(d.value),
                                        }),
                                        (0, b.jsx)(Xt, { children: Un(e, d.customerId) }),
                                        (0, b.jsx)(qr, { row: d }),
                                    ],
                                }),
                                onOpen: () => a({
                                    title: d.name,
                                    values: d,
                                    fields: [
                                        { key: "name", label: "Nome", required: !0 },
                                        { key: "stage", label: "Etapa", options: e.stages },
                                        {
                                            key: "status",
                                            label: "Situa\xE7\xE3o",
                                            options: ["Aberta", "Ganha", "Perdida"],
                                        },
                                        {
                                            key: "value",
                                            label: "Valor estimado",
                                            kind: "currency",
                                        },
                                    ],
                                    save: async (m: any) => await t((p: any) => Object.assign(p.opportunities.find((y: any) => y.id === d.id), m)),
                                }),
                                actions: (0, b.jsx)(Il, {
                                    label: "A\xE7\xF5es da oportunidade",
                                    actions: [
                                        ...e.stages.map((m: any) => ({
                                            label: "Mover para " + m,
                                            onSelect: () => u(d.id, m),
                                        })),
                                        {
                                            label: "Marcar como ganha",
                                            onSelect: async () => await t((m: any) => {
                                                m.opportunities.find((p: any) => p.id === d.id).status = "Ganha";
                                            }),
                                        },
                                        {
                                            label: "Criar pedido",
                                            onSelect: () => bn("/pedidos/novo?cliente=" + d.customerId),
                                        },
                                        {
                                            label: "Excluir oportunidade local",
                                            tone: "danger",
                                            onSelect: () => o("Excluir oportunidade no sistema?", async () => await t((m: any) => {
                                                m.opportunities = m.opportunities.filter((p: any) => p.id !== d.id);
                                            })),
                                        },
                                    ],
                                }),
                            }, d.id)),
                            !f.length &&
                                (0, b.jsx)("div", {
                                    className: "p-3",
                                    children: (0, b.jsx)(Xt, {
                                        children: "Nenhuma oportunidade neste recorte.",
                                    }),
                                }),
                        ],
                    }, c);
                }),
            }),
            (0, b.jsx)(Xt, {
                children: "O quadro observado estava vazio sob filtros de G4 e Abertas. Arrastar cart\xF5es ou usar seu menu altera apenas a simula\xE7\xE3o.",
            }),
        ],
    });
}
function xz(): any {
    let { db: e } = qa();
    return (0, b.jsxs)(fa, {
        width: "wide",
        children: [
            (0, b.jsx)(Ua, {
                title: "Relat\xF3rios",
                description: "Consultas sobre o recorte do arquivo \xB7 estados n\xE3o observados permanecem identificados",
            }),
            (0, b.jsx)(Ui, {
                area: "indicadores",
                items: [
                    ["/indicadores", "Pain\xE9is"],
                    ["/relatorios", "Relat\xF3rios"],
                ],
            }),
            (0, b.jsx)(ya, {
                rows: e.reports,
                label: "Relat\xF3rios",
                columns: [
                    z("name", "Relat\xF3rio", (t: any) => (0, b.jsx)("a", {
                        className: "font-medium ds-link",
                        href: "#/relatorios/" + t.id,
                        children: t.name,
                    }), { primary: !0, wide: !0 }),
                    z("state", "Cobertura", (t: any) => (0, b.jsx)(bi, {
                        tone: t.id === "carteira-vendedor" ? "warn" : "neutral",
                        children: t.id === "carteira-vendedor"
                            ? "Bloqueio de plano observado"
                            : "Estrutura observada",
                    })),
                    z("open", "Abrir", (t: any) => (0, b.jsxs)(xt, {
                        href: "#/relatorios/" + t.id,
                        children: ["Abrir", (0, b.jsx)(so, {})],
                    }), { action: !0 }),
                ],
                onRowClick: (t: any) => bn("/relatorios/" + t.id),
            }),
        ],
    });
}
function bz({ id: e }: any): any {
    let { db: t, editor: a, update: o } = qa(), n: any = t.reports.find((h: any) => h.id === e), r: any = w5(t.orders), [l, s] = (0, He.useState)("nenhum"), [i, u] = (0, He.useState)(!1), [c, f] = (0, He.useState)([]);
    if (!n)
        return (0, b.jsx)(Wu, {});
    const reportMonth=r.f.from?.slice(0,7) || r.f.to?.slice(0,7) || businessDate().slice(0,7);
    let d: any = r.rows, m: any = [], p: any = [], y: any = "Somente registros recuperados na varredura e altera\xE7\xF5es da simula\xE7\xE3o local.", C: any = null, x: any = null, v: any = d.filter((h: any) => h.type === "Venda" && h.status === "Conclu\xEDdo");
    if ([
        "resumo",
        "vendas",
        "vendas-anterior",
        "faturados",
        "faturamento",
    ].includes(e)) {
        if (((m = d),
            (p = jp(t)),
            (e === "faturados" || e === "faturamento") &&
                ((p = [
                    ...p,
                    z("invoiced", "Valor faturado", (h: any) => (h.invoiced != null ? rt(h.invoiced) : pa), { align: "right" }),
                    z("nf", "Nota fiscal", (h: any) => t.invoices
                        .filter((S: any) => S.orderId === h.id)
                        .map((S: any) => S.number)
                        .join(", ") || pa),
                ]),
                    (y =
                        "Os totais de faturamento e n\xFAmeros de notas n\xE3o foram extra\xEDdos. Preenchimentos novos s\xE3o exclusivamente simulados.")),
            l !== "nenhum")) {
            let h: any = {};
            (d.forEach((S: any) => {
                let L: any = l === "vendedor" ? S.seller : Un(t, S.customerId), I: any = (h[L] ||= { id: L, name: L, count: 0, total: 0 });
                (I.count++, (I.total += S.total));
            }),
                (m = Object.values(h)),
                (p = [
                    z("name", l === "vendedor" ? "Vendedor" : "Cliente", void 0, {
                        primary: !0,
                        wide: !0,
                    }),
                    z("count", "Pedidos"),
                    z("total", "Valor", (S: any) => rt(S.total), { align: "right" }),
                ]));
        }
        ((e === "resumo" || e === "vendas-anterior") &&
            (C = (0, b.jsx)(cs, {
                title: "Valor em pedidos no recorte",
                description: "Totais agrupados por vendedor",
                children: (0, b.jsx)(Qy, {
                    label: "Valor em pedidos por vendedor",
                    data: Array.from(new Set(d.map((h: any) => h.seller))).map((h: any) => ({
                        vendedor: h,
                        total: Zo(d.filter((S: any) => S.seller === h), "total"),
                    })),
                    index: "vendedor",
                    series: [{ key: "total", label: "Pedidos" }],
                    format: Vd,
                    height: 260,
                }),
            })),
            (x = (0, b.jsx)(ho, {
                label: "Agrupar por",
                size: "compact",
                value: l,
                onValueChange: s,
                options: La([
                    { value: "nenhum", label: "Sem agrupamento" },
                    { value: "vendedor", label: "Vendedor" },
                    { value: "cliente", label: "Cliente" },
                ]),
            })));
    }
    else if (e === "ranking")
        ((m = Array.from(new Set(v.map((h: any) => h.seller)))
            .map((h: any) => {
            let S: any = v.filter((L: any) => L.seller === h);
            return {
                id: h,
                name: h,
                total: Zo(S, "total"),
                count: S.length,
                clients: new Set(S.map((L: any) => L.customerId)).size,
                target: t.targets[reportMonth]?.[String(h)] ?? null,
            };
        })
            .sort((h: any, S: any) => S.total - h.total)),
            (p = [
                z("rank", "Posi\xE7\xE3o", (h: any) => m.indexOf(h) + 1),
                z("name", "Vendedor", void 0, { primary: !0 }),
                z("total", "Vendido", (h: any) => rt(h.total), { align: "right" }),
                z("count", "Pedidos"),
                z("clients", "Clientes atendidos"),
                z("target", "Meta local", (h: any) => rt(h.target), { align: "right" }),
                z("hit", "Atingimento", (h: any) => h.target > 0
                    ? na((100 * h.total) / h.target) + "%"
                    : "N\xE3o definida"),
            ]),
            (x = (0, b.jsxs)(xt, {
                onClick: () => a({
                    title: "Definir meta local",
                    fields: [
                        {
                            key: "seller",
                            label: "Vendedor",
                            required: !0,
                            options: sellerNames(t),
                        },
                        {
                            key: "target",
                            label: "Meta para outubro de 2026",
                            kind: "currency",
                            required: !0,
                        },
                    ],
                    save: async (h: any) => await o((S: any) => {
                        S.targets[reportMonth] ||= {}; S.targets[reportMonth][h.seller] = h.target;
                    }),
                }),
                children: [(0, b.jsx)(od, {}), "Definir metas"],
            })),
            (y =
                "N\xE3o havia meta definida no painel observado. Metas inseridas aqui pertencem apenas \xE0 simula\xE7\xE3o de outubro de 2026."));
    else if (e === "nao-compraram") {
        let h: any = new Set(v.filter((S:any)=>S.date?.startsWith(reportMonth)).map((S: any) => S.customerId)), mes: any = reportMonth;
        ((m = t.customers
            .filter((S: any) => !S.blocked && (!r.f.seller || S.seller===r.f.seller) && (!r.f.customer || S.id===r.f.customer) && !h.has(S.id))
            .map((S: any) => ({
            id: S.id,
            name: S.name,
            code: S.code,
            seller: S.seller,
            last: null,
            days: null,
            localStatus: "Sem compra no m\u00EAs " + mes,
        }))),
            m.sort((S: any, L: any) => S.name.localeCompare(L.name)),
            (p = [
                z("name", "Raz\xE3o social", void 0, { primary: !0, wide: !0 }),
                z("code", "C\u00F3digo"),
                z("seller", "Vendedor"),
                z("localStatus", "Situa\u00E7\u00E3o", (S: any) => (0, b.jsx)(qn, { value: S.localStatus })),
            ]),
            (y =
                "Clientes da carteira sem pedidos conclu\u00EDdos de venda no m\u00EAs selecionado (use os filtros de Emiss\u00E3o para escolher o m\u00EAs). Total: " +
                    m.length +
                    " cliente(s)."));
    }
    else if (e === "meta-vendedor") {
        ((m = Array.from(new Set(v.map((h: any) => h.seller)))
            .map((h: any) => {
            let S: any = v.filter((L: any) => L.seller === h);
            return {
                id: h,
                name: h,
                total: Zo(S, "total"),
                count: S.length,
                clients: new Set(S.map((L: any) => L.customerId)).size,
                target: t.targets[String(h)] ?? null,
            };
        })
            .sort((h: any, S: any) => S.total - h.total)),
            (p = [
                z("name", "Vendedor", void 0, { primary: !0 }),
                z("total", "Vendido", (h: any) => rt(h.total), { align: "right" }),
                z("target", "Meta", (h: any) => (h.target != null ? rt(h.target) : pa), {
                    align: "right",
                }),
                z("hit", "Atingido", (h: any) => (h.target > 0 ? na((h.total / h.target) * 100) + "%" : pa), { align: "right" }),
                z("progress", "Atingimento", (h: any) => h.target > 0
                    ? (0, b.jsx)("div", {
                        style: { minWidth: 120 },
                        children: (0, b.jsx)("div", {
                            style: {
                                height: 8,
                                background: "rgba(0,0,0,.08)",
                                borderRadius: 4,
                                overflow: "hidden",
                            },
                            children: (0, b.jsx)("div", {
                                style: {
                                    height: 8,
                                    width: Math.min(100, (h.total / h.target) * 100) + "%",
                                    background: h.total / h.target >= 1
                                        ? "var(--ds-ok)"
                                        : "var(--ds-accent)",
                                    borderRadius: 4,
                                },
                            }),
                        }),
                    })
                    : pa),
            ]),
            (C = (0, b.jsx)(cs, {
                title: "Meta x Vendido por vendedor",
                description: "Barras = vendido no recorte \xB7 linha tracejada = meta",
                children: (0, b.jsx)(Qy, {
                    label: "Meta por vendedor",
                    data: m.map((h: any) => ({
                        vendedor: h.name,
                        Vendido: h.total,
                        Meta: h.target ?? 0,
                    })),
                    index: "vendedor",
                    series: [{ key: "Vendido", label: "Vendido" }],
                    format: Vd,
                    height: 300,
                    reference: m.length === 1 && m[0].target > 0
                        ? { value: m[0].target, label: "Meta " + rt(m[0].target) }
                        : null,
                }),
            })),
            (y =
                "Use a op\xE7\xE3o Definir metas para simular metas locais por vendedor. Metas v\xE1lidas para outubro de 2026."));
    }
    else if (e === "gerencial") {
        let h: any = {};
        (d.forEach((S: any) => {
            let L: any = (h[S.customerId] ||= {
                id: S.customerId,
                name: Un(t, S.customerId),
                total: 0,
            });
            L.total += S.total;
        }),
            (m = Object.values(h)),
            (p = [
                z("name", "Raz\xE3o social", void 0, { primary: !0, wide: !0 }),
                z("total", "Valor em pedidos", (S: any) => rt(S.total), { align: "right" }),
            ]),
            (C = (0, b.jsx)(cs, {
                title: "Produtos com itens extra\xEDdos",
                children: (0, b.jsx)(ya, {
                    rows: dv(t, d),
                    toolbar: !1,
                    columns: [
                        z("name", "Produto", void 0, { primary: !0 }),
                        z("qty", "Quantidade"),
                    ],
                }),
            })));
    }
    else
        e === "funil"
            ? ((m = t.opportunities),
                (p = [
                    z("name", "Oportunidade", void 0, { primary: !0 }),
                    z("customer", "Cliente", (h: any) => Un(t, h.customerId)),
                    z("value", "Valor", (h: any) => rt(h.value)),
                    z("status", "Situa\xE7\xE3o", (h: any) => (0, b.jsx)(qn, { value: h.status })),
                    z("seller", "Vendedor"),
                    z("stage", "Etapa"),
                    z("date", "Abertura", (h: any) => xo(h.date)),
                ]),
                (y =
                    "O quadro estava vazio sob os filtros consultados. Novas oportunidades s\xE3o locais."))
            : e === "titulos"
                ? ((m = t.titles),
                    (p = [
                        z("customer", "Raz\xE3o social", (h: any) => Un(t, h.customerId), {
                            primary: !0,
                            wide: !0,
                        }),
                        z("due", "Vencimento", (h: any) => xo(h.due)),
                        z("value", "Valor do t\xEDtulo", (h: any) => rt(h.value), {
                            align: "right",
                        }),
                        z("status", "Situa\xE7\xE3o", (h: any) => (0, b.jsx)(qn, { value: h.status })),
                        z("document", "Documento"),
                    ]))
                : ["clientes", "carteira", "positivacao", "abc", "mix"].includes(e)
                    ? ((m = t.customers.map((h: any) => {
                        let S: any = d
                            .filter((R: any) => R.customerId === h.id && R.type === "Venda")
                            .sort((R: any, E: any) => E.date.localeCompare(R.date)), L: any = S[0], I: any = L
                            ? Math.floor((Date.parse(bo + "T12:00:00Z") -
                                Date.parse(L.date + "T12:00:00Z")) /
                                864e5)
                            : null;
                        return {
                            ...h,
                            total: Zo(S, "total"),
                            count: S.length,
                            last: L?.date,
                            days: I,
                            localStatus: I == null
                                ? "Sem venda neste recorte"
                                : I >= t.config.oldDays
                                    ? "Inativo antigo"
                                    : I >= t.config.recentDays
                                        ? "Inativo recente"
                                        : "Ativo no recorte",
                        };
                    })),
                        (p = [
                            z("name", "Raz\xE3o social", void 0, { primary: !0, wide: !0 }),
                            z("city", "Cidade"),
                            z("state", "UF"),
                        ]),
                        (e === "carteira" || e === "positivacao") &&
                            (p = [
                                z("name", "Raz\xE3o social", void 0, { primary: !0, wide: !0 }),
                                z("last", "\xDAltimo pedido no arquivo", (h: any) => xo(h.last)),
                                z("days", "Dias sem comprar no recorte", (h: any) => h.days ?? pa),
                                z("localStatus", "Situa\xE7\xE3o local", (h: any) => (0, b.jsx)(qn, { value: h.localStatus })),
                            ]),
                        e === "abc" &&
                            ((p = [
                                z("name", "Raz\xE3o social", void 0, { primary: !0, wide: !0 }),
                                z("curve", "Curva", () => "N\xE3o verificada"),
                                z("total", "Valor no recorte", (h: any) => rt(h.total), {
                                    align: "right",
                                }),
                                z("share", "Participa\xE7\xE3o no recorte", (h: any) => Zo(m, "total")
                                    ? na((100 * h.total) / Zo(m, "total")) + "%"
                                    : "\u2014"),
                            ]),
                                (y =
                                    "Limiares A/B/C n\xE3o foram confirmados. O mock n\xE3o atribui curvas arbitr\xE1rias; s\xF3 soma os valores do recorte.")),
                        e === "mix" &&
                            ((p = [
                                z("name", "Raz\xE3o social", void 0, { primary: !0, wide: !0 }),
                                z("qty", "Produtos diferentes com itens extra\xEDdos", (h: any) => new Set(d
                                    .filter((S: any) => S.customerId === h.id)
                                    .flatMap((S: any) => (S.items || []).map((L: any) => L.productId))).size),
                                z("total", "Valor em pedidos", (h: any) => rt(h.total), {
                                    align: "right",
                                }),
                            ]),
                                (y =
                                    "N\xE3o foram extra\xEDdas duas s\xE9ries compar\xE1veis. A compara\xE7\xE3o de per\xEDodos n\xE3o \xE9 preenchida com n\xFAmeros sint\xE9ticos.")),
                        (e === "carteira" || e === "positivacao") &&
                            ((y =
                                "Classifica\xE7\xE3o local calculada pelos pedidos deste arquivo, n\xE3o pela carteira completa. Refer\xEAncia: 08/10/2026; recentes a partir de 180 dias e antigos a partir de 365."),
                                (x = (0, b.jsx)(xt, {
                                    onClick: () => a({
                                        title: "Configurar per\xEDodo de inatividade local",
                                        values: {
                                            recentDays: t.config.recentDays,
                                            oldDays: t.config.oldDays,
                                        },
                                        fields: [
                                            {
                                                key: "recentDays",
                                                label: "Inativos recentes (dias)",
                                                kind: "number",
                                                required: !0,
                                            },
                                            {
                                                key: "oldDays",
                                                label: "Inativos antigos (dias)",
                                                kind: "number",
                                                required: !0,
                                            },
                                        ],
                                        validate: (h: any) => h.recentDays < 1 || h.oldDays <= h.recentDays
                                            ? "O limite antigo deve ser maior que o recente."
                                            : "",
                                        save: async (h: any) => await o((S: any) => Object.assign(S.config, h)),
                                    }),
                                    children: "Per\xEDodo de inatividade",
                                }))))
                    : e === "tarefas"
                        ? ((m = t.activities.concat(t.tasks.filter((h: any) => h.status === "Realizada"))),
                            (p = [
                                z("date", "Data de in\xEDcio", (h: any) => xo(h.date)),
                                z("customer", "Raz\xE3o social", (h: any) => (h.customerId ? Un(t, h.customerId) : "\u2014"), { primary: !0 }),
                                z("result", "Resultado"),
                                z("name", "Descri\xE7\xE3o", void 0, { wide: !0 }),
                                z("status", "Situa\xE7\xE3o", (h: any) => (0, b.jsx)(qn, { value: h.status })),
                            ]))
                        : e === "visitas"
                            ? ((m = []),
                                (p = [
                                    z("seller", "Vendedor"),
                                    z("customer", "Raz\xE3o social", void 0, { primary: !0 }),
                                    z("checkin", "Check-in"),
                                    z("checkout", "Check-out"),
                                    z("duration", "Dura\xE7\xE3o"),
                                    z("status", "Status"),
                                ]),
                                (y =
                                    "Nenhuma visita foi extra\xEDda. A configura\xE7\xE3o de relat\xF3rio observada era 300 m (faixa 0\u20133.000 m); n\xE3o demonstra trava de GPS."),
                                (x = (0, b.jsx)(xt, {
                                    onClick: () => a({
                                        title: "Dist\xE2ncia de check-in no relat\xF3rio local",
                                        values: { checkinDistance: t.config.checkinDistance },
                                        fields: [
                                            {
                                                key: "checkinDistance",
                                                label: "Dist\xE2ncia (m)",
                                                kind: "number",
                                                required: !0,
                                            },
                                        ],
                                        validate: (h: any) => h.checkinDistance < 0 || h.checkinDistance > 3e3
                                            ? "Informe entre 0 e 3.000 metros."
                                            : "",
                                        save: async (h: any) => await o((S: any) => Object.assign(S.config, h)),
                                    }),
                                    children: "Configurar dist\xE2ncia",
                                })))
                            : e === "comissoes" || e === "comissoes-pedido"
                                ? ((m = e === "comissoes" ? [] : d),
                                    (p =
                                        e === "comissoes"
                                            ? [
                                                z("name", "Vendedor", void 0, { primary: !0 }),
                                                z("value", "Comiss\xE3o", (h: any) => rt(h.value)),
                                            ]
                                            : [
                                                z("date", "Emiss\xE3o", (h: any) => xo(h.date)),
                                                z("number", "Pedido", void 0, { primary: !0 }),
                                                z("customer", "Raz\xE3o social", (h: any) => Un(t, h.customerId), { wide: !0 }),
                                                z("total", "Total do pedido", (h: any) => rt(h.total)),
                                                z("commission", "Comiss\xE3o (R$)", () => pa),
                                            ]),
                                    (y =
                                        "N\xE3o foram extra\xEDdos valores de comiss\xE3o. O detalhe de Adilson C\xE9sar dos Reis Souza abriu sem informa\xE7\xF5es para 01/08/2026 a 31/12/2026."))
                                : e === "produtos"
                                    ? ((m = dv(t, d)),
                                        (p = [
                                            z("code", "C\xF3digo"),
                                            z("name", "Categorias e produtos", void 0, {
                                                primary: !0,
                                                wide: !0,
                                            }),
                                            z("qty", "Quantidade vendida", (h: any) => na(h.qty), {
                                                align: "right",
                                            }),
                                            z("total", "Valor vendido", (h: any) => rt(h.total), {
                                                align: "right",
                                            }),
                                        ]),
                                        (C = (0, b.jsx)(cs, {
                                            title: "Quantidade nos itens recuperados",
                                            description: "Os itens do pedido #2351 foram extra\xEDdos integralmente",
                                            children: (0, b.jsx)(Zy, {
                                                items: m.map((h: any) => ({ label: h.name, value: h.qty })),
                                            }),
                                        })),
                                        (y =
                                            "O cat\xE1logo e o relat\xF3rio foram observados. Esta soma considera apenas pedidos cujos itens constam no arquivo."))
                                    : e === "produtos-pedido"
                                        ? ((m = d.flatMap((h: any) => (h.items || []).map((S: any) => ({
                                            id: h.id + "-" + S.productId,
                                            date: h.date,
                                            number: h.number,
                                            name: Ur(t, S.productId)?.name,
                                            customer: Un(t, h.customerId),
                                            price: S.price,
                                            qty: S.qty,
                                            total: S.price * S.qty,
                                        })))),
                                            (p = [
                                                z("name", "Produto", void 0, { primary: !0, wide: !0 }),
                                                z("date", "Emiss\xE3o", (h: any) => xo(h.date)),
                                                z("number", "Pedido"),
                                                z("customer", "Cliente"),
                                                z("price", "Pre\xE7o unit\xE1rio", (h: any) => rt(h.price)),
                                                z("qty", "Quantidade"),
                                                z("total", "Subtotal", (h: any) => rt(h.total), {
                                                    align: "right",
                                                }),
                                            ]))
                                        : e === "estoque"
                                            ? ((m = t.config.stock
                                                ? t.products.map((h: any) => ({
                                                    ...h,
                                                    stock: h.stock ?? null,
                                                }))
                                                : []),
                                                (p = [
                                                    z("code", "C\xF3digo"),
                                                    z("name", "Produto", void 0, {
                                                        primary: !0,
                                                        wide: !0,
                                                    }),
                                                    z("stock", "Saldo local", (h: any) => h.stock ?? pa),
                                                    z("edit", "Ajustar", (h: any) => (0, b.jsx)(xt, {
                                                        onClick: () => a({
                                                            title: "Ajustar saldo local",
                                                            values: { stock: h.stock },
                                                            fields: [
                                                                {
                                                                    key: "stock",
                                                                    label: "Saldo",
                                                                    kind: "number",
                                                                    required: !0,
                                                                },
                                                            ],
                                                            save: async (S: any) => await o((L: any) => Object.assign(Ur(L, h.id), S, {
                                                                source: "simulado",
                                                            })),
                                                        }),
                                                        children: "Ajustar saldo",
                                                    }), { action: !0 }),
                                                ]),
                                                (y =
                                                    "O controle de estoque real estava desabilitado. Habilita\xE7\xE3o e saldos no prot\xF3tipo n\xE3o alteram o Sul."))
                                            : e === "emails" &&
                                                ((m = t.emails),
                                                    (p = [
                                                        z("date", "Data", (h: any) => xo(h.date)),
                                                        z("orderId", "Pedido", void 0, { primary: !0 }),
                                                        z("recipient", "Destinat\xE1rio"),
                                                        z("channel", "Canal"),
                                                        z("status", "Situa\xE7\xE3o"),
                                                    ]),
                                                    (y =
                                                        "O relat\xF3rio original estava sem informa\xE7\xE3o no recorte. Registros deste arquivo s\xE3o simula\xE7\xF5es; nenhuma mensagem \xE9 enviada."));
    if (e === "carteira-vendedor")
        return (0, b.jsxs)(fa, {
            width: "wide",
            children: [
                (0, b.jsx)(Ua, {
                    title: n.name,
                    back: { label: "Relat\xF3rios", to: "/relatorios" },
                }),
                (0, b.jsx)(hn, {
                    icon: (0, b.jsx)(Im, {}),
                    title: "Este recurso n\xE3o est\xE1 dispon\xEDvel no seu plano",
                    hint: "Bloqueio explicitamente observado. Colunas e c\xE1lculos da tela protegida n\xE3o foram inventados.",
                    action: (0, b.jsx)(xt, {
                        href: "#/conta/plano",
                        children: "Ver plano observado",
                    }),
                }),
            ],
        });
    let g: any = p.filter((h: any) => !c.includes(h.key));
    return (0, b.jsxs)(fa, {
        width: "wide",
        children: [
            (0, b.jsx)(Ua, {
                title: n.name,
                description: "Consulta local \xB7 recorte observado e registros simulados",
                back: { label: "Relat\xF3rios", to: "/relatorios" },
                actions: (0, b.jsx)(Gp, {
                    rows: m,
                    name: "relatorio-" + e,
                    columns: p.filter((h: any) => !h.action).map((h: any) => h.key),
                }),
            }),
            (0, b.jsx)(Xt, { children: y }),
            ["resumo", "vendas", "ranking", "faturados", "faturamento"].includes(e) &&
                (0, b.jsxs)(_i, {
                    cols: 3,
                    children: [
                        (0, b.jsx)(Ha, {
                            label: "Pedidos no recorte filtrado",
                            value: d.length,
                        }),
                        (0, b.jsx)(Ha, {
                            label: "Valor em pedidos",
                            value: rt(Zo(d, "total")),
                        }),
                        (0, b.jsx)(Ha, {
                            label: "Ticket m\xE9dio em pedidos",
                            value: d.length ? rt(Zo(d, "total") / d.length) : "\u2014",
                        }),
                    ],
                }),
            C,
            (0, b.jsx)(ya, {
                rows: m,
                label: n.name,
                columns: g,
                actions: (0, b.jsxs)(b.Fragment, {
                    children: [
                        (0, b.jsxs)(xt, {
                            onClick: () => r.setOpen(!0),
                            children: [(0, b.jsx)(ed, {}), "Filtros"],
                        }),
                        (0, b.jsxs)(xt, {
                            onClick: () => u(!0),
                            children: [(0, b.jsx)(Xl, {}), "Colunas"],
                        }),
                        x,
                    ],
                }),
            }),
            (0, b.jsx)(E5, { filter: r, rows: t.orders }),
            (0, b.jsx)(gb, {
                open: i,
                onClose: () => u(!1),
                title: "Colunas do relat\xF3rio",
                description: "Escolha as colunas desta simula\xE7\xE3o",
                children: (0, b.jsx)("div", {
                    className: "space-y-3",
                    children: p
                        .filter((h: any) => !h.action)
                        .map((h: any) => (0, b.jsx)(zu, {
                        label: String(h.header),
                        checked: !c.includes(h.key),
                        onCheckedChange: (S: any) => f(S
                            ? c.filter((L: any) => L !== h.key)
                            : c.length < p.length - 1
                                ? [...c, h.key]
                                : c),
                    }, h.key)),
                }),
            }),
        ],
    });
}
var yz: any = {
    pedidos: [
        {
            id: "campos",
            label: "Campos extras",
            description: "Quatro campos observados; data_entrega e Tipo de Agenda s\xE3o obrigat\xF3rios.",
        },
        {
            id: "status",
            label: "Status de pedido",
            description: "R\xF3tulos de integra\xE7\xE3o e libera\xE7\xE3o observados.",
        },
        {
            id: "tipos",
            label: "Tipo de pedido",
            description: "Venda \xE9 o tipo padr\xE3o. Tipos personalizados n\xE3o geram positiva\xE7\xE3o, meta ou comiss\xE3o segundo a interface.",
        },
        {
            id: "geral",
            label: "Geral",
            description: "Regras de emiss\xE3o online, B2B e aplicativos.",
        },
    ],
    clientes: [
        { id: "campos", label: "Campos extras" },
        { id: "tags", label: "Tags" },
        { id: "segmentos", label: "Segmentos" },
        { id: "redes", label: "Redes" },
        { id: "fiscais", label: "Exce\xE7\xF5es fiscais" },
        { id: "resultados", label: "Resultados dos atendimentos" },
        { id: "bloqueios", label: "Motivos de bloqueio" },
        { id: "geral", label: "Geral" },
    ],
    produtos: [
        { id: "categorias", label: "Categorias" },
        { id: "variacoes", label: "Varia\xE7\xF5es de produto" },
        { id: "tributacoes", label: "Tributa\xE7\xF5es" },
    ],
    crm: [
        {
            id: "funis",
            label: "Gerenciar funis",
            description: "Vendas SulBR: no m\xE1ximo um funil ativo; no m\xEDnimo duas etapas.",
        },
        { id: "perda", label: "Motivos de perda" },
        { id: "etiquetas", label: "Etiquetas" },
    ],
};
function Cz({ area: e, section: t }: any): any {
    let { db: a, update: o, editor: n, confirm: r } = qa(), [l, s] = (0, He.useState)(a.stages.join(`
`)), i: any = yz[e] || [], u: any = i.find((p: any) => p.id === t);
    if (!u)
        return (0, b.jsx)(Wu, {});
    let c: any = ({
        pedidos: "Pedidos",
        clientes: "Clientes",
        produtos: "Produtos",
        crm: "CRM",
    } as Record<string, string>)[e], f: any = e + "/" + t, d: any = a.collections[f] || [], m: any = () => n({
        title: "Adicionar " + u.label.toLowerCase(),
        fields: [
            { key: "name", label: "Nome / descri\xE7\xE3o", required: !0 },
            ...(t === "campos"
                ? [
                    {
                        key: "kind",
                        label: "Tipo de campo",
                        options: ["Livre", "Data", "Num\xE9rico", "Lista"],
                        required: !0,
                    },
                ]
                : []),
        ],
        save: async (p: any) => await o((y: any) => {
            (y.collections[f] ||= []).push({
                ...p,
                id: Jo(y.collections[f], "CFG-SIM"),
                source: "simulado",
            });
        }),
    });
    return (0, b.jsx)(fa, {
        width: "wide",
        children: (0, b.jsx)(uv, {
            heading: "Configura\xE7\xF5es de " + c,
            headingDescription: "Estruturas observadas \xB7 altera\xE7\xF5es locais",
            nav: i.map((p: any) => ({
                href: "#/config/" + e + "/" + p.id,
                label: p.label,
                icon: ad,
            })),
            current: "#/config/" + f,
            title: u.label,
            description: u.description || "A lista original estava vazia no recorte consultado.",
            actions: t !== "geral" && t !== "funis"
                ? (0, b.jsxs)(Ft, {
                    onClick: m,
                    children: [(0, b.jsx)(Sa, {}), "Adicionar registro"],
                })
                : (0, b.jsx)(oz, { to: e === "crm" ? "/oportunidades" : "/" + e }),
            children: t === "geral"
                ? (0, b.jsx)("div", {
                    className: "space-y-6",
                    children: e === "pedidos"
                        ? (0, b.jsxs)(b.Fragment, {
                            children: [
                                (0, b.jsx)(nf, {
                                    title: "Pre\xE7o zero",
                                    description: "Restri\xE7\xE3o marcada na interface observada.",
                                    children: (0, b.jsx)(zu, {
                                        label: "Impedir produtos com pre\xE7o zero",
                                        checked: a.config.zeroPriceBlocked,
                                        onCheckedChange: async (p: any) => await o((y: any) => {
                                            y.config.zeroPriceBlocked = p;
                                        }),
                                    }),
                                }),
                                (0, b.jsx)(nf, {
                                    title: "Frete e entrega",
                                    description: "Obrigatoriedade sem marca\xE7\xE3o no recorte original.",
                                    children: (0, b.jsx)(zu, {
                                        label: "Frete obrigat\xF3rio no prot\xF3tipo",
                                        checked: a.config.freightRequired,
                                        onCheckedChange: async (p: any) => await o((y: any) => {
                                            y.config.freightRequired = p;
                                        }),
                                    }),
                                }),
                                (0, b.jsx)(Gu, {
                                    title: "Duplicidade de itens",
                                    children: "A interface original oferecia permitir ou impedir itens duplicados, mas a op\xE7\xE3o ativa n\xE3o foi confirmada. No prot\xF3tipo, ajuste a quantidade de um item j\xE1 adicionado.",
                                }),
                            ],
                        })
                        : (0, b.jsxs)(b.Fragment, {
                            children: [
                                (0, b.jsx)(nf, {
                                    title: "Documento duplicado",
                                    description: "Bloqueio marcado na interface.",
                                    children: (0, b.jsx)(zu, {
                                        label: "Bloquear CPF/CNPJ duplicado",
                                        checked: a.config.duplicateDocument,
                                        onCheckedChange: async (p: any) => await o((y: any) => {
                                            y.config.duplicateDocument = p;
                                        }),
                                    }),
                                }),
                                (0, b.jsx)(nf, {
                                    title: "Campos obrigat\xF3rios",
                                    description: "Raz\xE3o social e fantasia eram obrigat\xF3rias.",
                                    children: (0, b.jsx)(_o, {
                                        items: [
                                            {
                                                label: "Raz\xE3o social / Nome",
                                                value: "Obrigat\xF3rio",
                                            },
                                            {
                                                label: "Fantasia / Apelido",
                                                value: "Obrigat\xF3rio",
                                            },
                                            {
                                                label: "Inativos recentes",
                                                value: a.config.recentDays + " dias",
                                            },
                                            {
                                                label: "Inativos antigos",
                                                value: a.config.oldDays + " dias",
                                            },
                                        ],
                                    }),
                                }),
                            ],
                        }),
                })
                : t === "funis"
                    ? (0, b.jsx)(Vt, {
                        children: (0, b.jsxs)(Ot, {
                            title: "Vendas SulBR",
                            children: [
                                (0, b.jsx)(Xt, {
                                    children: "Todos os vendedores \xB7 limite observado: 1 funil ativo.",
                                }),
                                (0, b.jsx)("div", {
                                    className: "my-5",
                                    children: (0, b.jsx)($u, {
                                        label: "Etapas do funil (uma por linha)",
                                        value: l,
                                        onChange: s,
                                        minRows: 5,
                                    }),
                                }),
                                (0, b.jsx)(Ft, {
                                    onClick: async () => {
                                        let p: any = l
                                            .split(`
`)
                                            .map((y: any) => y.trim())
                                            .filter(Boolean);
                                        if (p.length < 2 || new Set(p).size !== p.length) {
                                            go("Informe pelo menos duas etapas diferentes", void 0, "bad");
                                            return;
                                        }
                                        if (a.opportunities.some((y: any) => !p.includes(y.stage))) {
                                            go("Mova os cart\xF5es antes de remover uma etapa usada", void 0, "bad");
                                            return;
                                        }
                                        (await o((y: any) => {
                                            y.stages = p;
                                        }),
                                            go("Etapas alteradas no sistema"));
                                    },
                                    children: "Salvar funil local",
                                }),
                            ],
                        }),
                    })
                    : (0, b.jsxs)(b.Fragment, {
                        children: [
                            (0, b.jsx)(ya, {
                                rows: d,
                                columns: [
                                    z("name", "Nome / descri\xE7\xE3o", void 0, {
                                        primary: !0,
                                        wide: !0,
                                    }),
                                    ...(t === "campos" || t === "tipos"
                                        ? [z("kind", "Tipo")]
                                        : []),
                                    ...(t === "campos"
                                        ? [
                                            z("required", "Obrigat\xF3rio", (p: any) => p.required ? "Sim" : "N\xE3o"),
                                        ]
                                        : []),
                                    z("source", "Origem", (p: any) => (0, b.jsx)(qr, { row: p })),
                                    z("actions", "A\xE7\xF5es", (p: any) => (0, b.jsx)(Il, {
                                        label: "Op\xE7\xF5es do registro",
                                        actions: [
                                            {
                                                label: "Alterar no sistema",
                                                onSelect: () => n({
                                                    title: "Alterar registro local",
                                                    values: p,
                                                    fields: [
                                                        {
                                                            key: "name",
                                                            label: "Nome",
                                                            required: !0,
                                                        },
                                                    ],
                                                    save: async (y: any) => await o((C: any) => Object.assign(C.collections[f].find((x: any) => x.id === p.id), y, { source: "simulado" })),
                                                }),
                                            },
                                            {
                                                label: "Excluir registro local",
                                                tone: "danger",
                                                onSelect: () => r("Excluir registro no sistema?", async () => await o((y: any) => {
                                                    y.collections[f] = y.collections[f].filter((C: any) => C.id !== p.id);
                                                })),
                                            },
                                        ],
                                    }), { action: !0 }),
                                ],
                            }),
                            e === "produtos" &&
                                t === "categorias" &&
                                (0, b.jsx)(Xt, {
                                    children: "Havia seis categorias no cat\xE1logo original. S\xF3 o nome 500ML COM GAS foi extra\xEDdo como categoria expl\xEDcita; as demais n\xE3o foram inventadas.",
                                }),
                            e === "produtos" &&
                                t === "tributacoes" &&
                                (0, b.jsx)(Xt, {
                                    children: "N\xE3o havia regras de ICMS-ST no recorte. Foram observadas orienta\xE7\xF5es de NCM, UF de destino e m\xE9todos MVA/PMC; nenhuma al\xEDquota foi reproduzida.",
                                }),
                        ],
                    }),
        }),
    });
}
var C5: any = [
    { id: "perfil", label: "Meu perfil", icon: Wl },
    { id: "usuarios", label: "Todos os usu\xE1rios", icon: Wl },
    { id: "equipes", label: "Equipes", icon: Wl },
    { id: "atividades", label: "Atividades", icon: ym },
    { id: "logs", label: "Logs", icon: $s },
    { id: "empresa", label: "Minha empresa", icon: qs },
    { id: "email", label: "Envio de e-mail", icon: Lm },
    { id: "apps", label: "Aplicativos", icon: Qc },
    { id: "pagamento", label: "Condi\xE7\xF5es de pagamento", icon: Kc },
    { id: "politicas", label: "Pol\xEDticas comerciais", icon: Mm },
    { id: "rentabilidade", label: "Rentabilidade", icon: Yc },
    { id: "frete", label: "Op\xE7\xF5es de frete", icon: nd },
    { id: "transportadoras", label: "Transportadoras", icon: nd },
    { id: "pay", label: "Sul Pay", icon: Kc },
    { id: "plano", label: "Meu plano", icon: Xl },
    { id: "creditos", label: "Cr\xE9ditos IA", icon: al },
];
function Sz({ section: e = "perfil" }: any): any {
    let { db: t, editor: a, update: o, onSignOut } = qa(), n: any = C5.find((s: any) => s.id === e);
    if (!n)
        return (0, b.jsx)(Wu, {});
    let r: any, l: any = null;
    if (e === "perfil")
        r = (0, b.jsxs)(Vt, {
            children: [
                (0, b.jsx)(_o, {
                    items: [
                        { label: "Nome", value: t.company.user },
                        { label: "Papel", value: t.company.role },
                        { label: "E-mail", value: t.company.email || pa },
                        { label: "Empresa", value: t.company.name },
                        { label: "ID da empresa", value: t.company.id },
                    ],
                }),
                (0, b.jsx)("div", {
                    className: "mt-5",
                    children: (0, b.jsxs)(Ft, {
                        onClick: () => a({
                            title: "Alterar meus dados no sistema",
                            values: { user: t.company.user, email: t.company.email || "" },
                            fields: [
                                { key: "user", label: "Nome", required: !0 },
                                { key: "email", label: "E-mail" },
                            ],
                            save: async (s: any) => await o((i: any) => Object.assign(i.company, s)),
                        }),
                        children: [(0, b.jsx)(tl, {}), "Alterar meus dados"],
                    }),
                }),
                (0, b.jsx)(xt, { onClick: () => onSignOut().catch((error: unknown) => go(error instanceof Error ? error.message : 'Não foi possível sair.')), children: 'Sair' }),
            ],
        });
    else if (e === "empresa")
        r = (0, b.jsxs)(Vt, {
            children: [
                (0, b.jsx)(_o, {
                    items: [
                        { label: "Empresa", value: t.company.name },
                        { label: "Fantasia", value: "Sulbr" },
                        { label: "CNPJ", value: t.company.cnpj || pa },
                        {
                            label: "Integra\xE7\xE3o rotulada",
                            value: t.company.integration,
                        },
                        { label: "ERP de retaguarda", value: "N\xE3o confirmado" },
                    ],
                }),
                (0, b.jsx)("div", {
                    className: "mt-5",
                    children: (0, b.jsx)(Ft, {
                        onClick: () => a({
                            title: "Alterar empresa no sistema",
                            values: { name: t.company.name, cnpj: t.company.cnpj || "" },
                            fields: [
                                { key: "name", label: "Nome da empresa", required: !0 },
                                { key: "cnpj", label: "CNPJ" },
                            ],
                            save: async (s: any) => await o((i: any) => Object.assign(i.company, s)),
                        }),
                        children: "Alterar empresa local",
                    }),
                }),
            ],
        });
    else if (e === "plano")
        r = (0, b.jsxs)(b.Fragment, {
            children: [
                (0, b.jsxs)(_i, {
                    cols: 3,
                    children: [
                        (0, b.jsx)(Ha, { label: "Plano observado", value: "Ouro" }),
                        (0, b.jsx)(Ha, { label: "Cr\xE9ditos IA gratuitos", value: "100" }),
                        (0, b.jsx)(Ha, { label: "Saldo observado", value: "100" }),
                    ],
                }),
                (0, b.jsx)(Vt, {
                    children: (0, b.jsx)(Ot, {
                        title: "Plano e conta",
                        children: (0, b.jsx)(_o, {
                            items: [
                                {
                                    label: "Suporte",
                                    value: "Chat dispon\xEDvel na origem; n\xE3o acionado",
                                },
                                {
                                    label: "Boletos e notas fiscais",
                                    value: "A\xE7\xF5es observadas; valores n\xE3o reproduzidos",
                                },
                                { label: "Funis ativos", value: "Limite observado: 1" },
                                {
                                    label: "Carteira por vendedor",
                                    value: "Indispon\xEDvel no plano",
                                },
                                {
                                    label: "Planos p\xFAblicos do fornecedor",
                                    value: "N\xE3o foi confirmada equival\xEAncia com Ouro",
                                },
                            ],
                        }),
                    }),
                }),
            ],
        });
    else if (e === "creditos")
        r = (0, b.jsxs)(b.Fragment, {
            children: [
                (0, b.jsxs)(_i, {
                    cols: 3,
                    children: [
                        (0, b.jsx)(Ha, { label: "Cr\xE9ditos gratuitos", value: "100" }),
                        (0, b.jsx)(Ha, {
                            label: "Consumidos no recorte observado",
                            value: "0",
                        }),
                        (0, b.jsx)(Ha, { label: "Saldo observado", value: "100" }),
                    ],
                }),
                (0, b.jsx)(Xt, {
                    children: "Per\xEDodo observado: outubro de 2026. As respostas locais n\xE3o consomem cr\xE9ditos reais.",
                }),
                (0, b.jsx)(ya, {
                    rows: [
                        {
                            id: "G4",
                            name: "G4",
                            credits: 100,
                            consumed: 0,
                            source: "observado",
                        },
                    ],
                    columns: [
                        z("name", "Usu\xE1rio", void 0, { primary: !0 }),
                        z("credits", "Gratuitos"),
                        z("consumed", "Consumidos"),
                        z("mcp", "MCP", () => "Categoria observada; conex\xE3o n\xE3o confirmada"),
                    ],
                }),
            ],
        });
    else if (e === "email")
        r = (0, b.jsx)(Vt, {
            children: (0, b.jsxs)(Ot, {
                title: "Envio de e-mail",
                children: [
                    (0, b.jsx)(_o, {
                        items: [
                            {
                                label: "Op\xE7\xF5es observadas",
                                value: "E-mail padr\xE3o ou servidor pr\xF3prio",
                            },
                            {
                                label: "Campos do servidor",
                                value: "E-mail, servidor, porta e TLS",
                            },
                            { label: "Credenciais", value: "N\xE3o lidas nem reproduzidas" },
                        ],
                    }),
                    (0, b.jsx)("div", {
                        className: "mt-5",
                        children: (0, b.jsx)(Ft, {
                            disabled: !0,
                            disabledReason: "Este arquivo n\xE3o conecta a SMTP nem envia e-mails",
                            children: "Configurar envio real",
                        }),
                    }),
                    (0, b.jsx)(Xt, {
                        children: "Voc\xEA pode simular mensagens na ficha de um pedido. Elas ficam apenas no hist\xF3rico local.",
                    }),
                ],
            }),
        });
    else if (e === "apps")
        r = (0, b.jsx)(Vt, {
            children: (0, b.jsxs)(Ot, {
                title: "Sincroniza\xE7\xE3o de aplicativos",
                children: [
                    (0, b.jsx)(ho, {
                        label: "Periodicidade local",
                        value: t.config.sync || "",
                        onValueChange: async (s: any) => await o((i: any) => {
                            i.config.sync = s;
                        }),
                        options: La([
                            { value: "", label: "Sele\xE7\xE3o original n\xE3o extra\xEDda" },
                            "Di\xE1ria",
                            "Semanal",
                            "Quinzenal",
                            "Mensal",
                        ]),
                    }),
                    (0, b.jsx)(Xt, {
                        children: "A orienta\xE7\xE3o original pede sincroniza\xE7\xE3o na primeira conex\xE3o di\xE1ria. O prot\xF3tipo n\xE3o emula aplicativo m\xF3vel ou sincroniza\xE7\xE3o de ERP.",
                    }),
                ],
            }),
        });
    else if (e === "frete")
        r = (0, b.jsxs)(b.Fragment, {
            children: [
                (0, b.jsx)(Vt, {
                    children: (0, b.jsxs)(Ot, {
                        title: "Regras manuais",
                        children: [
                            (0, b.jsx)(qn, {
                                value: t.config.manualFreight
                                    ? "Ativo na simula\xE7\xE3o"
                                    : "Inativo na origem",
                            }),
                            (0, b.jsx)("div", {
                                className: "mt-4",
                                children: (0, b.jsx)(zu, {
                                    label: "Ativar regras manuais no sistema",
                                    checked: !!t.config.manualFreight,
                                    onCheckedChange: async (s: any) => await o((i: any) => {
                                        i.config.manualFreight = s;
                                    }),
                                }),
                            }),
                        ],
                    }),
                }),
                (0, b.jsx)(Vt, {
                    children: (0, b.jsxs)(Ot, {
                        title: "FRENET",
                        children: [
                            (0, b.jsx)(qn, { value: "Inativo na origem" }),
                            (0, b.jsx)(Xt, {
                                children: "Nenhuma credencial, cota\xE7\xE3o ou chamada externa \xE9 utilizada.",
                            }),
                        ],
                    }),
                }),
            ],
        });
    else if (e === "rentabilidade")
        r = (0, b.jsx)(Vt, {
            children: (0, b.jsxs)(Ot, {
                title: "Pre\xE7o m\xEDnimo do produto",
                children: [
                    (0, b.jsx)(_o, {
                        items: [
                            {
                                label: "Refer\xEAncia permitida",
                                value: "Pre\xE7o m\xEDnimo unit\xE1rio",
                            },
                            {
                                label: "Faixas observadas",
                                value: "\xD3timo / Bom / Regular / Ruim",
                            },
                            { label: "Valores das faixas", value: pa },
                        ],
                    }),
                    (0, b.jsx)(Xt, {
                        children: "N\xE3o h\xE1 percentuais reconstru\xEDdos nem ajustes autom\xE1ticos de pre\xE7o neste arquivo.",
                    }),
                ],
            }),
        });
    else if (e === "pay")
        r = (0, b.jsx)(D5, { type: "pay" });
    else if (e === "pagamento")
        ((r = (0, b.jsx)(ya, {
            rows: t.payments.map((s: any, i: any) => ({
                id: String(i),
                name: s,
                source: "observado",
            })),
            columns: [
                z("name", "Condi\xE7\xE3o de pagamento", void 0, {
                    primary: !0,
                    wide: !0,
                }),
                z("min", "Valor m\xEDnimo", () => pa),
            ],
        })),
            (l = (0, b.jsxs)(Ft, {
                onClick: () => a({
                    title: "Nova condi\xE7\xE3o local",
                    fields: [{ key: "name", label: "Descri\xE7\xE3o", required: !0 }],
                    save: async (s: any) => await o((i: any) => {
                        i.payments.includes(s.name) || i.payments.push(s.name);
                    }),
                }),
                children: [(0, b.jsx)(Sa, {}), "Nova condi\xE7\xE3o"],
            })));
    else if (e === "logs" || e === "atividades")
        r = (0, b.jsx)(ya, {
            rows: t.logs,
            columns: [
                z("date", "Data", (s: any) => xo(s.date)),
                z("name", "Opera\xE7\xE3o local", void 0, { primary: !0, wide: !0 }),
                z("user", "Usu\xE1rio"),
                z("source", "Origem", (s: any) => (0, b.jsx)(qr, { row: s })),
            ],
            empty: "Nenhum evento local registrado",
        });
    else {
        const sections: Record<string, string> = { usuarios: "users", equipes: "teams", transportadoras: "carriers", politicas: "policy" };
        let s: any = sections[String(e)], i: any = t[s] || [];
        ((r = (0, b.jsx)(ya, {
            rows: i,
            columns: [
                z("name", "Nome / descri\xE7\xE3o", void 0, { primary: !0, wide: !0 }),
                ...(e === "usuarios" ? [z("role", "Papel")] : []),
                z("source", "Origem", (u: any) => (0, b.jsx)(qr, { row: u })),
            ],
        })),
            (l = (0, b.jsxs)(Ft, {
                onClick: () => a({
                    title: "Adicionar registro local",
                    fields: [
                        { key: "name", label: "Nome / descri\xE7\xE3o", required: !0 },
                        ...(e === "usuarios"
                            ? [
                                {
                                    key: "role",
                                    label: "Papel",
                                    options: ["Administrador", "Vendedor"],
                                },
                            ]
                            : []),
                    ],
                    save: async (u: any) => await o((c: any) => c[s].push({
                        ...u,
                        id: Jo(c[s], "ADM-SIM"),
                        source: "simulado",
                    })),
                }),
                children: [(0, b.jsx)(Sa, {}), "Adicionar registro"],
            })),
            e === "transportadoras" &&
                (r = (0, b.jsxs)(b.Fragment, {
                    children: [
                        r,
                        (0, b.jsx)(Xt, {
                            children: "Uma transportadora foi observada na origem, mas seu cadastro n\xE3o foi extra\xEDdo para este prot\xF3tipo.",
                        }),
                    ],
                })));
    }
    return (0, b.jsx)(fa, {
        width: "wide",
        children: (0, b.jsx)(uv, {
            heading: "Minha conta",
            headingDescription: "G4 / Administrador \xB7 ambiente Sulbr",
            nav: C5.map((s: any) => ({
                href: "#/conta/" + s.id,
                label: s.label,
                icon: s.icon,
            })),
            current: "#/conta/" + e,
            title: n.label,
            actions: l,
            children: r,
        }),
    });
}
function D5({ type: e = "portal" }: any): any {
    let { db: t, update: a, editor: o } = qa(), n: any = t.config[e];
    return (0, b.jsxs)("div", {
        className: "space-y-5",
        children: [
            (0, b.jsx)(Vt, {
                children: (0, b.jsxs)(Ot, {
                    title: e === "portal" ? "Portal do cliente e e-commerce B2B" : "Sul Pay",
                    children: [
                        (0, b.jsx)(_o, {
                            items: [
                                {
                                    label: "Estado na inspe\xE7\xE3o",
                                    value: "Tela de cria\xE7\xE3o / ativa\xE7\xE3o",
                                },
                                {
                                    label: "Estado no arquivo",
                                    value: n ? "Ativa\xE7\xE3o simulada" : "N\xE3o ativado",
                                },
                                { label: "Conex\xE3o com o sistema real", value: "Nenhuma" },
                                {
                                    label: "Recursos apresentados",
                                    value: e === "portal"
                                        ? "Hist\xF3rico de compras, boletos, notas fiscais e atendimento"
                                        : "Pix, boleto, cart\xE3o, links e checkout",
                                },
                            ],
                        }),
                        (0, b.jsx)("div", {
                            className: "mt-5",
                            children: (0, b.jsx)(Ft, {
                                disabled:true, disabledReason:"Provedor não configurado",
                                onClick: () => o({
                                    title: (e === "portal" ? "Criar portal" : "Ativar Sul Pay") +
                                        " \u2014 simula\xE7\xE3o",
                                    values: { name: t.company.name },
                                    fields: [
                                        {
                                            key: "name",
                                            label: e === "portal" ? "Nome do portal" : "Nome da empresa",
                                            required: !0,
                                        },
                                    ],
                                    save: async (r: any) => await a((l: any) => {
                                        ((l.config[e] = !0), (l.config[e + "Name"] = r.name));
                                    }),
                                }),
                                children: n
                                    ? "Alterar configura\xE7\xE3o local"
                                    : e === "portal"
                                        ? "Criar portal local"
                                        : "Ativar no sistema",
                            }),
                        }),
                    ],
                }),
            }),
            n &&
                (0, b.jsx)(Gu, {
                    tone: "ok",
                    title: "Ativa\xE7\xE3o apenas simulada",
                    children: "Nenhum canal p\xFAblico, servi\xE7o financeiro ou pagamento foi ativado. O cliente n\xE3o recebe comunica\xE7\xE3o.",
                }),
            e === "portal" &&
                n &&
                (0, b.jsx)(Ot, {
                    title: "Pedidos dispon\xEDveis no arquivo",
                    children: (0, b.jsx)(ya, {
                        rows: t.orders.slice(0, 5),
                        toolbar: !1,
                        columns: jp(t),
                        onRowClick: (r: any) => bn("/pedidos/" + r.id),
                    }),
                }),
        ],
    });
}
function Rz(): any {
    return (0, b.jsxs)(fa, {
        width: "wide",
        children: [
            (0, b.jsx)(Ua, {
                title: "Portal e e-commerce",
                description: "A tela global original oferecia criar o portal. Uma ficha de cliente mostrava Portal liberado; isso n\xE3o comprovava publica\xE7\xE3o.",
            }),
            (0, b.jsx)(D5, {}),
        ],
    });
}
function Iz(): any {
    let { db: e, update: t, editor: a } = qa();
    return (0, b.jsxs)(fa, {
        width: "wide",
        children: [
            (0, b.jsx)(Ua, {
                title: "Destaques",
                description: "Um destaque finalizado foi observado; seus dados n\xE3o foram integralmente extra\xEDdos.",
                actions: (0, b.jsxs)(Ft, {
                    onClick: () => a({
                        title: "Criar destaque de cat\xE1logo local",
                        fields: [
                            { key: "name", label: "Nome", required: !0 },
                            {
                                key: "start",
                                label: "In\xEDcio",
                                kind: "date",
                                required: !0,
                            },
                            { key: "end", label: "T\xE9rmino", kind: "date", required: !0 },
                        ],
                        values: { start: bo },
                        save: async (o: any) => await t((n: any) => {
                            (n.collections.destaques ||= []).push({
                                ...o,
                                id: Jo(n.collections.destaques, "DST-SIM"),
                                source: "simulado",
                            });
                        }),
                    }),
                    children: [(0, b.jsx)(Sa, {}), "Novo destaque"],
                }),
            }),
            (0, b.jsx)(Ui, {
                area: "produtos",
                items: [
                    ["/produtos", "Produtos"],
                    ["/produtos/destaques", "Destaques"],
                    ["/config/produtos/categorias", "Configura\xE7\xF5es"],
                ],
            }),
            (0, b.jsx)(ya, {
                rows: e.collections.destaques || [],
                columns: [
                    z("name", "Destaque", void 0, { primary: !0 }),
                    z("start", "In\xEDcio", (o: any) => xo(o.start)),
                    z("end", "T\xE9rmino", (o: any) => xo(o.end)),
                    z("source", "Origem", (o: any) => (0, b.jsx)(qr, { row: o })),
                ],
            }),
            (0, b.jsx)(Xt, {
                children: "O destaque organiza a exposi\xE7\xE3o do cat\xE1logo. N\xE3o altera pre\xE7os.",
            }),
        ],
    });
}
function Lz(e: any, t: any): any {
    let a: any = ol(t), o: any = e.orders.filter((r: any) => r.type === "Venda" && r.status === "Conclu\xEDdo"), n: any = Zo(o, "total");
    return a.includes("ticket")
        ? `O ticket m\xE9dio dos ${o.length} pedidos de venda neste arquivo \xE9 ${o.length ? rt(n / o.length) : "indispon\xEDvel"}. Este recorte n\xE3o representa o total da conta.`
        : a.includes("produto") || a.includes("reposi")
            ? `Nos itens recuperados:
` +
                dv(e, o)
                    .sort((l: any, s: any) => s.qty - l.qty)
                    .map((l: any) => `${l.name}: ${na(l.qty)} unidades, ${rt(l.total)}.`)
                    .join(`
`) +
                `
Os pedidos sem itens extra\xEDdos n\xE3o entram neste c\xE1lculo.`
            : a.includes("cliente") || a.includes("reativa")
                ? `O arquivo cont\xE9m ${e.customers.length} clientes e ${e.orders.length} pedidos. Os limiares observados s\xE3o ${e.config.recentDays} e ${e.config.oldDays} dias. N\xE3o \xE9 poss\xEDvel afirmar a carteira completa ou recomendar reativa\xE7\xE3o sem o hist\xF3rico ausente.`
                : a.includes("venda") || a.includes("pedido")
                    ? `H\xE1 ${e.orders.length} pedidos neste arquivo. Os pedidos conclu\xEDdos do tipo Venda somam ${rt(n)}. Use Pedidos ou Relat\xF3rios para detalhar o recorte.`
                    : "Esta \xE9 uma resposta determin\xEDstica local, n\xE3o uma chamada de IA. Posso resumir os pedidos do arquivo, calcular ticket m\xE9dio, listar produtos com itens extra\xEDdos e explicar os limites dos dados.";
}
function wz(): any {
    let { db: e, update: t } = qa(), [a, o] = (0, He.useState)(""), [n, r] = (0, He.useState)(!1), l: any = (s: any) => {
        go("IA indisponível: provedor não configurado."); return;
        !s.trim() ||
            n ||
            (r(!0),
                o(""),
                setTimeout(async () => {
                    (await t((i: any) => i.chats.push({
                        id: Jo(i.chats, "CHAT-SIM"),
                        question: s,
                        answer: Lz(i, s),
                        date: bo,
                        source: "simulado",
                    })),
                        r(!1));
                }, 180));
    };
    return (0, b.jsxs)(fa, {
        width: "reading",
        children: [
            (0, b.jsx)(Ua, {
                title: "Sul IA",
                description: "Conversa simulada e determin\xEDstica \xB7 sem modelo, servi\xE7os externos ou consumo de cr\xE9ditos",
            }),
            (0, b.jsxs)("div", {
                className: "space-y-4",
                children: [
                    !e.chats.length &&
                        (0, b.jsxs)(b.Fragment, {
                            children: [
                                (0, b.jsx)(hn, {
                                    icon: (0, b.jsx)(al, {}),
                                    title: "O que voc\xEA quer consultar no recorte?",
                                    hint: "As respostas usam somente os dados deste arquivo.",
                                }),
                                (0, b.jsx)("div", {
                                    className: "flex flex-wrap gap-2",
                                    children: [
                                        "Produtos mais vendidos",
                                        "Ticket m\xE9dio",
                                        "Clientes para reativar",
                                    ].map((s: any) => (0, b.jsx)(xt, { onClick: () => l(s), children: s }, s)),
                                }),
                            ],
                        }),
                    e.chats.map((s: any) => (0, b.jsxs)("div", {
                        className: "space-y-3",
                        children: [
                            (0, b.jsx)("div", {
                                className: "chat-question",
                                children: (0, b.jsx)("p", {
                                    className: "text-body",
                                    children: s.question,
                                }),
                            }),
                            (0, b.jsxs)(Vt, {
                                className: "space-y-3",
                                children: [
                                    (0, b.jsx)(bi, {
                                        tone: "warn",
                                        children: "Resposta simulada",
                                    }),
                                    (0, b.jsx)("p", {
                                        className: "text-body whitespace-pre-line leading-relaxed",
                                        children: s.answer,
                                    }),
                                ],
                            }),
                        ],
                    }, s.id)),
                    (0, b.jsxs)(Vt, {
                        className: "space-y-4",
                        children: [
                            (0, b.jsx)($u, {
                                label: "Mensagem",
                                value: a,
                                onChange: o,
                                placeholder: "Pergunte sobre os dados recuperados\u2026",
                                minRows: 3,
                            }),
                            (0, b.jsxs)("div", {
                                className: "flex justify-between items-center gap-3",
                                children: [
                                    (0, b.jsx)(Xt, {
                                        children: n
                                            ? "Calculando resposta local\u2026"
                                            : "Nenhuma mensagem sai deste arquivo.",
                                    }),
                                    (0, b.jsxs)(Ft, {
                                        onClick: () => l(a),
                                        disabled: !a.trim() || n,
                                        disabledReason: "Digite uma mensagem e aguarde a resposta anterior",
                                        children: [(0, b.jsx)(Nm, {}), "Enviar"],
                                    }),
                                ],
                            }),
                        ],
                    }),
                ],
            }),
        ],
    });
}
var Ez: any = [
    [
        "Cadastro de Produto",
        "Consulte o cat\xE1logo, as tabelas, informa\xE7\xF5es gerais, varia\xE7\xF5es e medidas.",
        "/produtos",
    ],
    [
        "Cadastro de Clientes",
        "Confira a carteira, o cadastro e os v\xEDnculos.",
        "/clientes",
    ],
    [
        "Pol\xEDticas Comerciais",
        "Confira as condi\xE7\xF5es comerciais locais, sem alterar pre\xE7os automaticamente.",
        "/conta/politicas",
    ],
    [
        "Emiss\xE3o de Pedidos",
        "Crie pedidos locais com cliente, itens, pagamento e entrega.",
        "/pedidos/novo",
    ],
    [
        "Usu\xE1rios e Roteiro de Visitas",
        "Gerencie registros locais e experimente a agenda.",
        "/agenda/roteiros",
    ],
    [
        "Indicadores e Relat\xF3rios",
        "Use consultas e filtros sobre o recorte recuperado.",
        "/relatorios",
    ],
    [
        "E-commerce B2B",
        "A tela original oferecia cria\xE7\xE3o; a ativa\xE7\xE3o do arquivo \xE9 simulada.",
        "/portal",
    ],
    [
        "Sul Pay",
        "Conhe\xE7a o estado de ativa\xE7\xE3o sem executar transa\xE7\xF5es.",
        "/conta/pay",
    ],
    [
        "Atendimento",
        "Consulte os limites e a origem dos dados do arquivo.",
        "/ajuda",
    ],
];
function kz(): any {
    return (0, b.jsxs)(fa, {
        width: "narrow",
        children: [
            (0, b.jsx)(Ua, {
                title: "Guia inicial",
                description: "Nove t\xF3picos observados \xB7 atalhos adaptados para o prot\xF3tipo local",
            }),
            Ez.map(([e, t, a]: any, o: any) => (0, b.jsx)(Vt, {
                children: (0, b.jsx)(Ot, {
                    title: o + 1 + ". " + e,
                    action: (0, b.jsxs)(xt, {
                        href: "#" + a,
                        children: ["Ver recurso", (0, b.jsx)(Jr, {})],
                    }),
                    children: (0, b.jsx)("p", {
                        className: "text-body text-muted",
                        children: t,
                    }),
                }),
            }, e)),
        ],
    });
}
function Nz(): any {
    return (0, b.jsxs)(fa, {
        width: "reading",
        children: [
            (0, b.jsx)(Ua, {
                title: "Sobre este sistema",
                description: "Sul Sulbr \xB7 empresa 432299 \xB7 G4 DS 0.9.0",
            }),
            (0, b.jsx)(Vt, {
                children: (0, b.jsx)(Ot, {
                    title: "Origem dos dados",
                    children: (0, b.jsx)(_o, {
                        items: [
                            {
                                label: "Recorte inicial",
                                value: "20 pedidos, 15 clientes e 4 produtos",
                            },
                            {
                                label: "Itens completos",
                                value: "Pedido #2351: 3 itens, 974 unidades, R$ 9.008,80",
                            },
                            { label: "Inspe\xE7\xE3o original", value: "07/10/2026" },
                            {
                                label: "Data de referência do mapeamento",
                                value: "08/10/2026",
                            },
                            {
                                label: "Observado",
                                value: "Extra\xEDdo da interface ou dos artefatos da varredura",
                            },
                            {
                                label: "Simulado",
                                value: "Criado ou alterado no prot\xF3tipo",
                            },
                            {
                                label: "N\xE3o extra\xEDdo",
                                value: "Campo sem evid\xEAncia dispon\xEDvel; n\xE3o substitu\xEDdo por um valor inventado",
                            },
                        ],
                    }),
                }),
            }),
            (0, b.jsx)(Vt, {
                children: (0, b.jsx)(Ot, {
                    title: "Limites",
                    children: (0, b.jsx)("p", {
                        className: "text-body leading-relaxed",
                        children: "O sistema usa componentes oficiais do G4 Design System, autenticação e persistência no Supabase. ERP, emissão fiscal, envio externo, pagamentos e IA remota ainda dependem de provedores não configurados.",
                    }),
                }),
            }),
            (0, b.jsx)(Vt, {
                children: (0, b.jsx)(Ot, {
                    title: "Funcionamento local",
                    children: (0, b.jsx)("p", {
                        className: "text-body leading-relaxed",
                        children: "As gravações são confirmadas pelo servidor antes da atualização da interface. Dados de negócio ficam no Supabase; exportações CSV e impressão são executadas no navegador.",
                    }),
                }),
            }),
        ],
    });
}
function Wu(): any {
    return (0, b.jsxs)(fa, {
        width: "reading",
        children: [
            (0, b.jsx)(Ua, { title: "P\xE1gina n\xE3o encontrada" }),
            (0, b.jsx)(hn, {
                title: "Registro não encontrado",
                action: (0, b.jsx)(xt, {
                    href: "#/indicadores",
                    children: "Voltar aos indicadores",
                }),
            }),
        ],
    });
}
function PriceListEditor({ db: e, value: t, onChange: a }: any): any {
    let [o, n] = (0, He.useState)(""), [r, l] = (0, He.useState)(null);
    let i: any = () => {
        if (!o || !(r > 0)) {
            return;
        }
        if (t.some((u: any) => u.productId === o)) {
            (n(""), l(null));
            return;
        }
        (a([...t, { productId: o, price: r }]), n(""), l(null));
    };
    return (0, b.jsxs)("div", {
        className: "space-y-3",
        children: [
            (0, b.jsxs)("div", {
                className: "flex flex-wrap items-end gap-3",
                children: [
                    (0, b.jsx)("div", {
                        className: "flex-1 min-w-0",
                        children: (0, b.jsx)(Sl, {
                            label: "Produto",
                            value: o,
                            onValueChange: (u: any) => n(String(u)),
                            options: e.products
                                .filter((u: any) => u.price > 0)
                                .map((u: any) => ({
                                value: u.id,
                                label: (u.code || "") +
                                    " \xB7 " +
                                    u.name +
                                    " (base " +
                                    rt(u.price) +
                                    ")",
                            })),
                        }),
                    }),
                    (0, b.jsx)("div", {
                        className: "w-44",
                        children: (0, b.jsx)(Up, {
                            label: "Pre\xE7o praticado (R$)",
                            value: r,
                            onChange: (u: any) => l(u),
                        }),
                    }),
                    (0, b.jsx)(xt, {
                        disabled: !o || !(r > 0),
                        onClick: i,
                        children: "Adicionar",
                    }),
                ],
            }),
            t.length > 0 &&
                (0, b.jsx)(ya, {
                    toolbar: !1,
                    rows: t.map((u: any, x: any) => ({
                        id: u.productId + "-" + x,
                        name: Ur(e, u.productId)?.name || u.productId,
                        base: Ur(e, u.productId)?.price,
                        price: u.price,
                    })),
                    columns: [
                        z("name", "Produto", void 0, { primary: !0, wide: !0 }),
                        z("base", "Pre\xE7o base", (u: any) => rt(u.base), { align: "right" }),
                        z("price", "Pre\xE7o praticado", (u: any) => rt(u.price), {
                            align: "right",
                        }),
                        z("actions", "A\xE7\xF5es", (u: any) => (0, b.jsx)(wR, {
                            label: "Remover",
                            onClick: () => a(t.filter((x2: any, G: any) => x2.productId !== u.id.split("-").slice(0,-1).join("-"))),
                            children: (0, b.jsx)(Ws, {}),
                        })),
                    ],
                }),
        ],
    });
}
function Mz({ spec: e, close: closePanel, dbRef: dbR }: any): any {
    const saving=useRef(false); const t=()=>{if(!saving.current) closePanel()};
    let [a, o] = (0, He.useState)(Xu(e.values || {})), [n, r] = (0, He.useState)(""), l: any = (i: any, u: any) => o((c: any) => ({ ...c, [i]: u }));
    async function s(): Promise<void> {
        if(saving.current) return;
        let i: any = e.fields.find((c: any) => c.required && (a[c.key] == null || a[c.key] === "" || (c.kind === "priceList" && !a[c.key]?.length)));
        if (i) {
            r("Preencha " + i.label.toLowerCase() + ".");
            return;
        }
        if (e.fields.some((c: any) => ["number", "currency"].includes(c.kind) &&
            a[c.key] != null &&
            (!Number.isFinite(a[c.key]) || a[c.key] < 0))) {
            r("Informe valores num\xE9ricos n\xE3o negativos.");
            return;
        }
        let u: any = e.validate?.(a);
        if (u) {
            r(u);
            return;
        }
        saving.current=true; r('');
        try { await e.save(a); saving.current=false; closePanel(); go('Alterações salvas'); } catch(error) {r(error instanceof Error ? error.message : 'Não foi possível salvar. Tente novamente.')} finally {saving.current=false}
    }
    return (0, b.jsx)(xb, {
        open: !0,
        onClose: t,
        title: e.title,
        kicker: "Simula\xE7\xE3o local \xB7 sem grava\xE7\xE3o no Sul",
        footer: (0, b.jsxs)(b.Fragment, {
            children: [
                (0, b.jsx)(xt, { onClick: t, children: "Cancelar" }),
                (0, b.jsxs)(Ft, {
                    onClick: s,
                    children: [(0, b.jsx)(ka, {}), "Salvar no sistema"],
                }),
            ],
        }),
        children: (0, b.jsxs)("div", {
            className: "space-y-5",
            children: [
                n && (0, b.jsx)(Gu, { tone: "bad", children: n }),
                a.__priceList &&
                    a.__priceList.length > 0 &&
                    (0, b.jsx)(Gu, {
                        tone: "info",
                        title: "Tabela identificada",
                        children: (() => {
                            let rates: any = dbR?.priceTablesBase || {};
                            let names: any = Object.keys(rates);
                            if (!names.length)
                                return "Nenhuma tabela conhecida.";
                            let scores: any = names.map((name: any) => {
                                let diffs: any = [], ok: any = 0;
                                for (let it of a.__priceList) {
                                    let prod: any = Ur(dbR, it.productId);
                                    if (!prod || prod.price == null)
                                        continue;
                                    let cat: any = prod.category || "?";
                                    let factor: any = rates[name][cat] ?? rates[name]["*"] ?? null;
                                    if (factor == null)
                                        continue;
                                    let expected: any = prod.price * factor;
                                    diffs.push((Math.abs(it.price - expected) / expected) * 100);
                                    if ((Math.abs(it.price - expected) / expected) * 100 < 2)
                                        ok++;
                                }
                                return {
                                    name,
                                    diff: diffs.length
                                        ? diffs.reduce((S: any, x2: any) => S + x2, 0) / diffs.length
                                        : 1e9,
                                    ok,
                                    covered: diffs.length,
                                };
                            });
                            if (!scores.length)
                                return "N\xE3o foi poss\xEDvel comparar (sem pre\xE7os base).";
                            scores.sort((S: any, L: any) => S.diff - L.diff || L.ok - S.ok);
                            let b2: any = scores[0];
                            if (b2.covered === 0)
                                return "Nenhum produto com pre\xE7o base conhecido \u2014 verifique as escolhas.";
                            return ("Melhor tabela: " +
                                b2.name +
                                " \u2014 diferen\xE7a m\xE9dia de " +
                                na(b2.diff) +
                                "% nos " +
                                b2.covered +
                                " produto(s) comparados" +
                                (b2.ok > 0 ? ", " + b2.ok + " exatamente na tabela" : "") +
                                ". " +
                                (scores[1]
                                    ? "Pr\xF3xima mais pr\xF3xima: " +
                                        scores[1].name +
                                        " (" +
                                        na(scores[1].diff) +
                                        "%)."
                                    : ""));
                        })(),
                    }),
                e.fields.map((i: any) => {
                    let u: any = i.label + (i.required ? " *" : ""), c: any = a[i.key];
                    if (i.key === "priceTableMatch")
                        return null;
                    if (i.kind === "priceList")
                        return (0, b.jsx)(PriceListEditor, {
                            db: dbR,
                            value: a.__priceList || [],
                            onChange: (v: any) => o({ ...a, __priceList: v }),
                        });
                    let fi: any = i.options === "PRODUCTS"
                        ? {
                            ...i,
                            options: dbR.products
                                .filter((p: any) => p.price > 0)
                                .map((p: any) => ({
                                value: p.id,
                                label: (p.code || "") +
                                    " \xB7 " +
                                    p.name +
                                    " (base " +
                                    rt(p.price) +
                                    ")",
                            })),
                        }
                        : i;
                    if (fi.options === "PRODUCTS")
                        return null;
                    return (0, b.jsx)("div", {
                        children: fi.options
                            ? fi.options.length > 7
                                ? (0, b.jsx)(Sl, {
                                    label: u,
                                    options: La(fi.options),
                                    value: c || "",
                                    onValueChange: (f: any) => l(fi.key, f),
                                })
                                : (0, b.jsx)(ho, {
                                    label: u,
                                    options: La(fi.options),
                                    value: c || "",
                                    onValueChange: (f: any) => l(fi.key, f),
                                })
                            : fi.kind === "currency"
                                ? (0, b.jsx)(Up, {
                                    label: u,
                                    value: c ?? null,
                                    onChange: (f: any) => l(fi.key, f),
                                })
                                : fi.kind === "number"
                                    ? (0, b.jsx)(Hr, {
                                        label: u,
                                        min: 0,
                                        value: c ?? null,
                                        onChange: (f: any) => l(fi.key, f),
                                    })
                                    : fi.kind === "date"
                                        ? (0, b.jsx)(Jd, {
                                            label: u,
                                            value: c || "",
                                            onValueChange: (f: any) => l(fi.key, f),
                                            now: bo,
                                        })
                                        : fi.kind === "area"
                                            ? (0, b.jsx)($u, {
                                                label: u,
                                                value: c || "",
                                                onChange: (f: any) => l(fi.key, f),
                                            })
                                            : (0, b.jsx)(vr, {
                                                label: u,
                                                value: c || "",
                                                onChange: (f: any) => l(fi.key, f),
                                            }),
                    }, i.key);
                }),
            ],
        }),
    });
}
var Az: any = [
    {
        label: "Opera\xE7\xE3o",
        items: [
            { label: "Indicadores", href: "#/indicadores", icon: zs },
            { label: "Funil de Vendas", href: "#/oportunidades", icon: Sm },
            { label: "Pedidos", href: "#/pedidos", icon: $s },
            { label: "Clientes", href: "#/clientes", icon: Wl },
            { label: "Produtos", href: "#/produtos", icon: du },
            { label: "Sul IA", href: "#/ia", icon: al },
            { label: "Minha conta", href: "#/conta/perfil", icon: ad },
        ],
    },
];
export interface SulAppProps {
    initialState: Record<string, any>;
    persist: (nextState: Record<string, any>) => Promise<Record<string, any>>;
    onSignOut: () => Promise<void>;
}
export default function SulApp({ initialState, persist, onSignOut }: SulAppProps): React.ReactElement {
    let [e, t] = (0, He.useState)(location.hash || "#/indicadores"), a: any = e.replace(/^#/, "").split("?")[0], [o, n] = (0, He.useState)(() => createAppState(initialState)), [r, l] = (0, He.useState)(null), [s, i] = (0, He.useState)(null), [u, c] = (0, He.useState)(!1), [f, d] = (0, He.useState)("");
    ((0, He.useEffect)(() => {
        location.hash || (location.hash = "/indicadores");
        let g: any = () => {
            (t(location.hash), l(null), c(!1));
        };
        return (addEventListener("hashchange", g),
            () => removeEventListener("hashchange", g));
    }, []),
        (0, He.useEffect)(() => {
            let g: any = (h: any) => {
                (h.metaKey || h.ctrlKey) &&
                    h.key === "k" &&
                    (h.preventDefault(), c((S: any) => !S));
            };
            return (addEventListener("keydown", g),
                () => removeEventListener("keydown", g));
        }, []));
    const current = useRef<Record<string, any>>(o);
    const persistRef = useRef(persist);
    persistRef.current = persist;
    const queueRef = useRef<ReturnType<typeof createMutationQueue> | null>(null);
    if (!queueRef.current)
        queueRef.current = createMutationQueue(current, (next) => persistRef.current(next), (confirmed) => { n(confirmed); });
    const update = (mutator: (draft: Record<string, any>) => unknown) => queueRef.current!(mutator);
    let y: any = {
        db: o,
        update,
        editor: l,
        confirm: (g: any, h: any, S: any = "A alteração será salva no banco da SulBR.") => i({ title: g, run: h, description: S }),
        onSignOut,
        path: a,
    };
    let C: any, x: any = a.split("/").filter(Boolean);
    a === "/indicadores"
        ? (C = (0, b.jsx)(nz, {}))
        : a === "/indicadores/catalogo"
            ? (C = (0, b.jsx)(rz, {}))
            : a === "/relatorios"
                ? (C = (0, b.jsx)(xz, {}))
                : x[0] === "relatorios"
                    ? (C = (0, b.jsx)(bz, { id: x[1] }))
                    : a === "/pedidos"
                        ? (C = (0, b.jsx)(lz, {}))
                        : a === "/pedidos/novo"
                            ? (C = (0, b.jsx)(sz, {}))
                            : x[0] === "pedidos"
                                ? (C = (0, b.jsx)(iz, { id: x[1] }))
                                : a === "/clientes"
                                    ? (C = (0, b.jsx)(uz, {}))
                                    : a === "/clientes/vinculos"
                                        ? (C = (0, b.jsx)(fz, {}))
                                        : x[0] === "clientes"
                                            ? (C = (0, b.jsx)(dz, { id: x[1] }))
                                            : a === "/produtos"
                                                ? (C = (0, b.jsx)(mz, {}))
                                                : a === "/produtos/destaques"
                                                    ? (C = (0, b.jsx)(Iz, {}))
                                                    : x[0] === "produtos"
                                                        ? (C = (0, b.jsx)(hz, { id: x[1] }))
                                                        : a === "/oportunidades"
                                                            ? (C = (0, b.jsx)(gz, {}))
                                                            : a === "/agenda"
                                                                ? (C = (0, b.jsx)(v5, {}))
                                                                : a === "/agenda/roteiros"
                                                                    ? (C = (0, b.jsx)(v5, { routes: !0 }))
                                                                    : a === "/portal"
                                                                        ? (C = (0, b.jsx)(Rz, {}))
                                                                        : a === "/ia"
                                                                            ? (C = (0, b.jsx)(wz, {}))
                                                                            : x[0] === "config"
                                                                                ? (C = (0, b.jsx)(Cz, {
                                                                                    area: x[1],
                                                                                    section: x[2],
                                                                                }))
                                                                                : x[0] === "conta"
                                                                                    ? (C = (0, b.jsx)(Sz, {
                                                                                        section: x[1],
                                                                                    }))
                                                                                    : a === "/guia"
                                                                                        ? (C = (0, b.jsx)(kz, {}))
                                                                                        : a === "/ajuda"
                                                                                            ? (C = (0, b.jsx)(Nz, {}))
                                                                                            : (C = (0, b.jsx)(Wu, {}));
    let v: any = f.trim()
        ? [
            ...o.orders.map((g: any) => ({
                id: "o" + g.id,
                name: "Pedido #" + g.number + " \xB7 " + Un(o, g.customerId),
                to: "/pedidos/" + g.id,
            })),
            ...o.customers.map((g: any) => ({
                id: "c" + g.id,
                name: g.name + " \xB7 " + g.code,
                to: "/clientes/" + g.id,
            })),
            ...o.products.map((g: any) => ({
                id: "p" + g.id,
                name: g.name,
                to: "/produtos/" + g.id,
            })),
            ...o.reports.map((g: any) => ({
                id: "r" + g.id,
                name: g.name,
                to: "/relatorios/" + g.id,
            })),
        ]
            .filter((g: any) => ol(g.name).includes(ol(f)))
            .slice(0, 20)
        : [];
    return (0, b.jsxs)(I5.Provider, {
        value: y,
        children: [
            (0, b.jsxs)(l1, {
                product: "Sul \xB7 Sulbr",
                workspace: "Empresa 432299",
                currentPath: "#" + a,
                sidebar: ({ mobileOpen: g, close: h }: any) => (0, b.jsx)(t1, {
                    product: "Sul",
                    workspace: "Sulbr \xB7 432299",
                    mark: (0, b.jsx)(rv, {}),
                    groups: Az,
                    currentPath: a.startsWith("/relatorios")
                        ? "#/indicadores"
                        : "#" + a,
                    mobileOpen: g,
                    onNavigate: h,
                    storageKey: "sulbr-mock-sidebar",
                    onSearch: () => c(!0),
                    user: {
                        name: o.company.user,
                        initials: String(o.company.user || "Sul").trim().split(/\s+/).map((part: string) => part[0]).slice(0,2).join(""),
                        role: o.company.role,
                        href: "#/conta/perfil",
                    },
                    footer: (0, b.jsxs)("div", {
                        className: "space-y-3",
                        children: [
                            (0, b.jsx)(bi, { children: "Dados persistidos" }),
                            (0, b.jsx)("div", {
                                children: (0, b.jsx)(n0, {
                                    compact: !0,
                                    className: "max-w-full flex-wrap",
                                }),
                            }),
                            (0, b.jsx)(Xt, {
                                children: "G4 DS 0.9.0 · Supabase",
                            }),
                        ],
                    }),
                }),
                children: [
                    (0, b.jsx)("div", {
                        className: "mock-topbar page-gutter",
                        children: (0, b.jsxs)("div", {
                            className: "flex items-center gap-2 min-w-0",
                            children: [
                                (0, b.jsx)("strong", { children: o.company.name }),
                                (0, b.jsx)("span", {
                                    className: "text-muted text-caption hidden sm:inline",
                                    children: "Dados da empresa",
                                }),
                            ],
                        }),
                    }),
                    (0, b.jsx)("div", { className: "screen-root", children: C }, a),
                    (0, b.jsx)("div", {
                        className: "mock-footer page-gutter",
                        children: "SulBR · dados persistidos no Supabase",
                    }),
                ],
            }),
            r && (0, b.jsx)(Mz, { spec: r, close: () => l(null), dbRef: o }, r.title),
            (0, b.jsx)(HR, {
                open: !!s,
                onClose: () => i(null),
                title: s?.title || "Confirmar alteração",
                description: s?.description,
                confirmLabel: "Confirmar no sistema",
                onConfirm: async () => {
                    try { await s.run(); i(null); go('Alteração confirmada') } catch { /* Manter a confirmação aberta para nova tentativa. */ }
                },
                tone: "danger",
            }),
            (0, b.jsx)(gb, {
                open: u,
                onClose: () => c(!1),
                title: "Busca global",
                description: "Clientes, pedidos, produtos e relat\xF3rios deste arquivo",
                children: (0, b.jsxs)("div", {
                    className: "space-y-4",
                    children: [
                        (0, b.jsx)(vr, {
                            label: "Buscar no recorte",
                            value: f,
                            onChange: d,
                            placeholder: "Nome, c\xF3digo ou n\xFAmero do pedido\u2026",
                            icon: (0, b.jsx)(tr, {}),
                        }),
                        v.map((g: any) => (0, b.jsxs)(xt, {
                            className: "w-full justify-between",
                            href: "#" + g.to,
                            onClick: () => c(!1),
                            children: [g.name, (0, b.jsx)(so, {})],
                        }, g.id)),
                        f &&
                            !v.length &&
                            (0, b.jsx)(hn, {
                                framed: !1,
                                title: "Nenhum resultado",
                            }),
                    ],
                }),
            }),
        ],
    });
}

export function monthOptions(orders: any[]): {value:string;label:string}[] { const now=businessDate(); const months=new Set<string>(orders.filter(r=>r.date).map(r=>String(r.date).slice(0,7))); for(let i=-12;i<=3;i++){const d=new Date(Number(now.slice(0,4)),Number(now.slice(5,7))-1+i,1);months.add(d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'))} return [...months].sort().map(value=>({value,label:new Intl.DateTimeFormat('pt-BR',{month:'long',year:'numeric',timeZone:'America/Sao_Paulo'}).format(new Date(value+'-15T12:00:00Z'))})); }
export function identifyPriceTable(db:any, items:any[]):string {const scores=Object.entries(db.priceTablesBase || {}).map(([name,rates]:[string,any])=>{const diffs=items.flatMap(it=>{const prod=Ur(db,it.productId); const factor=rates[prod?.category] ?? rates['*'];const expected=prod?.price*factor;return expected>0?[Math.abs(it.price-expected)/expected]:[]}); return {name,score:diffs.length?diffs.reduce((a,b)=>a+b,0)/diffs.length:Infinity}}).filter(s=>Number.isFinite(s.score)).sort((a,b)=>a.score-b.score);return scores[0]?.name || '';}
