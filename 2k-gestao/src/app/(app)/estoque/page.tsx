"use client";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { api } from "@/lib/estoque/client";
import { authorName, dateTime, movementLabel } from "@/lib/estoque/format";
import ExportButton from "@/components/ExportButton";
import type { Movement, MovementType, Product } from "@/lib/estoque/types";

const field = "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-slate-900 focus:outline-none";
type Tab = "movimentar" | "baixo" | "historico";
type Kind = MovementType;

export default function EstoquePage() {
  const [tab, setTab] = useState<Tab>("movimentar");
  const [products, setProducts] = useState<Product[]>([]);
  const [low, setLow] = useState<Product[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [filter, setFilter] = useState("");
  const [productId, setProductId] = useState("");
  const [histProduct, setHistProduct] = useState("");
  const [kind, setKind] = useState<Kind>("entrada");
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  const loadProducts = useCallback(() => api<Product[]>("/api/products?status=active").then(setProducts), []);
  const loadLow = useCallback(() => api<Product[]>("/api/products?status=active&low=1").then(setLow), []);
  const loadMovements = useCallback(
    () => api<Movement[]>(`/api/stock/movements?limit=100${histProduct ? `&product_id=${histProduct}` : ""}`).then(setMovements),
    [histProduct]);

  const reloadAll = useCallback(() => {
    Promise.all([loadProducts(), loadLow(), loadMovements()]).then(() => setError(null))
      .catch((e) => setError(e instanceof Error ? e.message : "Erro ao carregar."));
  }, [loadProducts, loadLow, loadMovements]);

  useEffect(() => { reloadAll(); }, [reloadAll]);
  useEffect(() => {
    api<{ role: string }>("/api/me")
      .then((profile) => setIsAdmin(profile.role === "admin"))
      .catch((e) => setError(e instanceof Error ? e.message : "Erro ao validar permissões."));
  }, []);

  const visible = useMemo(() => {
    const t = filter.trim().toLowerCase();
    return t ? products.filter((p) => `${p.sku} ${p.name} ${p.brand ?? ""} ${p.compatible_model ?? ""}`.toLowerCase().includes(t)) : products;
  }, [products, filter]);
  const selected = products.find((p) => p.id === productId) ?? null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (submitting) return;
    const n = Number(qty);
    if (!selected) return setMsg({ ok: false, text: "Selecione um produto." });
    if (!Number.isInteger(n) || n <= 0) return setMsg({ ok: false, text: "Informe uma quantidade inteira maior que zero." });
    if (kind !== "entrada" && !reason.trim()) return setMsg({ ok: false, text: "Informe o motivo do ajuste." });
    setSubmitting(true); setMsg(null);
    try {
      const m = kind === "entrada"
        ? await api<Movement>("/api/stock/entry", { method: "POST", body: JSON.stringify({ product_id: selected.id, quantity: n, reason }) })
        : await api<Movement>("/api/stock/adjust", { method: "POST", body: JSON.stringify({ product_id: selected.id, delta: kind === "ajuste_negativo" ? -n : n, reason }) });
      setMsg({ ok: true, text: `${movementLabel[kind]} registrada em ${selected.name}: ${m.stock_before} → ${m.stock_after}.` });
      setQty(""); setReason("");
      reloadAll();
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : "Erro ao registrar." });
    } finally { setSubmitting(false); }
  }

  const tabs: [Tab, string][] = [["movimentar", "Movimentar"], ["baixo", `Estoque baixo (${low.length})`], ["historico", "Histórico"]];

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4 md:p-6">
      <h1 className="text-2xl font-semibold text-slate-900">Estoque</h1>
      <div className="flex flex-wrap gap-2"><ExportButton entity="products" label="Exportar estoque CSV" /><ExportButton entity="stock-movements" label="Exportar movimentos CSV" /></div>
      <div role="tablist" className="flex gap-1 overflow-x-auto border-b border-slate-200">
        {tabs.map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
            className={`whitespace-nowrap border-b-2 px-4 py-2 text-sm ${tab === k ? "border-slate-900 font-medium text-slate-900" : "border-transparent text-slate-500 hover:text-slate-800"}`}>{label}</button>
        ))}
      </div>
      {error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {tab === "movimentar" && !isAdmin && (
        <p className="max-w-xl rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Entrada e ajuste manual de estoque são operações restritas a administradores. Você pode consultar o estoque baixo e o histórico.
        </p>
      )}
      {tab === "movimentar" && isAdmin && (
        <form onSubmit={submit} className="max-w-xl space-y-3">
          <div>
            <label htmlFor="flt" className="mb-1 block text-sm font-medium text-slate-700">Produto</label>
            <input id="flt" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filtrar por nome, SKU ou modelo" className={`${field} mb-2`} />
            <select value={productId} onChange={(e) => setProductId(e.target.value)} size={5} aria-label="Selecionar produto" className={field}>
              {visible.map((p) => <option key={p.id} value={p.id}>{p.sku} — {p.name} (saldo {p.current_stock})</option>)}
            </select>
            {visible.length === 0 && <p className="mt-1 text-xs text-slate-500">Nenhum produto ativo encontrado.</p>}
          </div>
          {selected && <p className="rounded-md bg-slate-100 px-3 py-2 text-sm">Saldo atual de <b>{selected.name}</b>: <b className="tabular-nums">{selected.current_stock}</b></p>}
          <fieldset className="grid grid-cols-3 gap-2">
            <legend className="mb-1 text-sm font-medium text-slate-700">Tipo de movimentação</legend>
            {(Object.keys(movementLabel) as Kind[]).map((k) => (
              <label key={k} className={`cursor-pointer rounded-md border px-2 py-2 text-center text-sm ${kind === k ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white"}`}>
                <input type="radio" name="kind" value={k} checked={kind === k} onChange={() => setKind(k)} className="sr-only" />{movementLabel[k]}
              </label>
            ))}
          </fieldset>
          <div className="grid gap-3 sm:grid-cols-[140px_1fr]">
            <label className="text-sm"><span className="mb-1 block font-medium text-slate-700">Quantidade</span>
              <input value={qty} onChange={(e) => setQty(e.target.value)} inputMode="numeric" className={field} /></label>
            <label className="text-sm"><span className="mb-1 block font-medium text-slate-700">Motivo {kind === "entrada" && <span className="font-normal text-slate-500">(opcional)</span>}</span>
              <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} placeholder={kind === "entrada" ? "Ex.: compra do fornecedor" : "Ex.: peça quebrada, contagem"} className={field} /></label>
          </div>
          {msg && <p role={msg.ok ? "status" : "alert"} className={`rounded-md px-3 py-2 text-sm ${msg.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"}`}>{msg.text}</p>}
          <button disabled={submitting} className="w-full rounded-md bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50 sm:w-auto">
            {submitting ? "Registrando…" : "Registrar movimentação"}
          </button>
        </form>
      )}

      {tab === "baixo" && (low.length === 0
        ? <p className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-600">Nenhum produto abaixo do estoque mínimo.</p>
        : <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
            {low.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 p-3">
                <div className="min-w-0"><div className="truncate font-medium text-slate-900">{p.name}</div><div className="text-xs text-slate-500">{p.sku} • {p.category_name ?? "Sem categoria"}</div></div>
                <div className="flex items-center gap-3 text-sm">
                  <span className="tabular-nums"><b className="text-amber-700">{p.current_stock}</b> / mín. {p.min_stock}</span>
                  {isAdmin && <button onClick={() => { setProductId(p.id); setKind("entrada"); setTab("movimentar"); }} className="rounded-md border border-slate-300 px-3 py-1.5 hover:bg-slate-50">Dar entrada</button>}
                </div>
              </li>))}
          </ul>)}

      {tab === "historico" && (
        <div className="space-y-3">
          <select value={histProduct} onChange={(e) => setHistProduct(e.target.value)} aria-label="Filtrar histórico por produto" className={`${field} sm:max-w-sm`}>
            <option value="">Todos os produtos</option>
            {products.map((p) => <option key={p.id} value={p.id}>{p.sku} — {p.name}</option>)}
          </select>
          {movements.length === 0
            ? <p className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-600">Nenhuma movimentação registrada ainda.</p>
            : <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead className="border-b border-slate-200 bg-slate-50 text-slate-600"><tr>
                    <th className="p-3 font-medium">Data</th><th className="p-3 font-medium">Produto</th><th className="p-3 font-medium">Tipo</th>
                    <th className="p-3 text-right font-medium">Antes → depois</th><th className="p-3 font-medium">Usuário</th><th className="p-3 font-medium">Motivo</th></tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {movements.map((m) => (
                      <tr key={m.id}>
                        <td className="whitespace-nowrap p-3 text-slate-600">{dateTime(m.created_at)}</td>
                        <td className="p-3"><div className="font-medium text-slate-900">{m.product?.name ?? "—"}</div><div className="text-xs text-slate-500">{m.product?.sku}</div></td>
                        <td className="p-3">{movementLabel[m.movement_type]}</td>
                        <td className="whitespace-nowrap p-3 text-right tabular-nums">{m.stock_before} → <b>{m.stock_after}</b> <span className={["ajuste_negativo", "venda", "uso_os"].includes(m.movement_type) ? "text-red-700" : "text-emerald-700"}>({["ajuste_negativo", "venda", "uso_os"].includes(m.movement_type) ? "−" : "+"}{m.quantity})</span></td>
                        <td className="p-3">{authorName(m)}</td>
                        <td className="p-3 text-slate-600">{m.reason ?? "—"}{m.reference_type ? ` (${m.reference_type})` : ""}</td>
                      </tr>))}
                  </tbody>
                </table>
              </div>}
        </div>
      )}
    </div>
  );
}
