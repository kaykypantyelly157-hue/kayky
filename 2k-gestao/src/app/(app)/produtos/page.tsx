"use client";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/estoque/client";
import { brl } from "@/lib/estoque/format";
import type { Category, Product } from "@/lib/estoque/types";
import Modal from "@/components/estoque/Modal";
import ProductForm from "@/components/estoque/ProductForm";
import CategoryManager from "@/components/estoque/CategoryManager";
import ExportButton from "@/components/ExportButton";

const field = "rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-slate-900 focus:outline-none";

function StockBadge({ p }: { p: Product }) {
  if (!p.active) return <span className="rounded bg-slate-200 px-2 py-0.5 text-xs text-slate-600">Inativo</span>;
  if (p.is_low) return <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">Estoque baixo</span>;
  return null;
}

export default function ProdutosPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("active");
  const [onlyLow, setOnlyLow] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Product | "new" | null>(null);
  const [showCats, setShowCats] = useState(false);
  const [version, setVersion] = useState(0);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => { const t = setTimeout(() => setDebouncedQ(q), 250); return () => clearTimeout(t); }, [q]);

  const loadCategories = useCallback(() => api<Category[]>("/api/categories")
    .then(setCategories)
    .catch((e) => setError(e instanceof Error ? e.message : "Erro ao carregar categorias.")), []);
  useEffect(() => { loadCategories(); }, [loadCategories]);
  useEffect(() => {
    api<{ role: string }>("/api/me")
      .then((profile) => setIsAdmin(profile.role === "admin"))
      .catch((e) => setError(e instanceof Error ? e.message : "Erro ao validar permissões."));
  }, []);

  useEffect(() => {
    let cancelled = false;
    const sp = new URLSearchParams({ status });
    if (debouncedQ) sp.set("q", debouncedQ);
    if (category) sp.set("category", category);
    if (onlyLow) sp.set("low", "1");
    setLoading(true);
    api<Product[]>(`/api/products?${sp}`)
      .then((d) => { if (!cancelled) { setProducts(d); setError(null); } })
      .catch((e) => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [debouncedQ, category, status, onlyLow, version]);

  const refresh = () => setVersion((v) => v + 1);

  async function toggleActive(p: Product) {
    if (p.active && !window.confirm(`Inativar "${p.name}"? Ele deixa de aceitar movimentações, mas o histórico é mantido.`)) return;
    try {
      await api(`/api/products/${p.id}`, { method: "PATCH", body: JSON.stringify({ active: !p.active }) });
      refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Erro ao atualizar."); }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold text-slate-900">Produtos</h1>
        <div className="flex gap-2">
          <ExportButton entity="products" />
          <button onClick={() => setShowCats(true)} className="rounded-md border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50">Categorias</button>
          {isAdmin && <button onClick={() => setEditing("new")} className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700">Novo produto</button>}
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[1fr_200px_160px_auto]">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nome, SKU, marca ou modelo" aria-label="Buscar produtos" className={`${field} sm:col-span-2 lg:col-span-1`} />
        <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Categoria" className={field}>
          <option value="">Todas as categorias</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status" className={field}>
          <option value="active">Ativos</option><option value="inactive">Inativos</option><option value="all">Todos</option>
        </select>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={onlyLow} onChange={(e) => setOnlyLow(e.target.checked)} className="size-4" /> Só estoque baixo
        </label>
      </div>

      {error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {!loading && products.length === 0 && !error ? (
        <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-600">
          Nenhum produto encontrado. {isAdmin && <button className="font-medium text-slate-900 underline" onClick={() => setEditing("new")}>Cadastrar produto</button>}
        </div>
      ) : (
        <>
          {/* Desktop */}
          <div className={`hidden overflow-x-auto rounded-lg border border-slate-200 bg-white md:block ${loading ? "opacity-60" : ""}`}>
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
                <tr><th className="p-3 font-medium">Produto</th><th className="p-3 font-medium">Categoria</th>
                  <th className="p-3 text-right font-medium">Custo</th><th className="p-3 text-right font-medium">Venda</th>
                  <th className="p-3 text-right font-medium">Estoque</th><th className="p-3" /></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {products.map((p) => (
                  <tr key={p.id} className={p.active ? "" : "text-slate-400"}>
                    <td className="p-3"><div className="font-medium text-slate-900">{p.name}</div>
                      <div className="text-xs text-slate-500">{p.sku}{p.brand ? ` • ${p.brand}` : ""}{p.compatible_model ? ` • ${p.compatible_model}` : ""}</div></td>
                    <td className="p-3">{p.category_name ?? "—"}</td>
                    <td className="p-3 text-right tabular-nums">{brl(p.cost_price)}</td>
                    <td className="p-3 text-right tabular-nums">{brl(p.sale_price)}</td>
                    <td className="p-3 text-right"><span className="tabular-nums font-medium">{p.current_stock}</span>
                      <span className="text-xs text-slate-500"> / mín. {p.min_stock}</span> <StockBadge p={p} /></td>
                    <td className="whitespace-nowrap p-3 text-right">
                      {isAdmin && <>
                      <button onClick={() => setEditing(p)} className="rounded px-2 py-1 text-slate-700 hover:bg-slate-100">Editar</button>
                      <button onClick={() => toggleActive(p)} className="rounded px-2 py-1 text-slate-700 hover:bg-slate-100">{p.active ? "Inativar" : "Reativar"}</button>
                      </>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile */}
          <ul className={`space-y-2 md:hidden ${loading ? "opacity-60" : ""}`}>
            {products.map((p) => (
              <li key={p.id} className="rounded-lg border border-slate-200 bg-white p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0"><div className="font-medium text-slate-900">{p.name}</div>
                    <div className="text-xs text-slate-500">{p.sku} • {p.category_name ?? "Sem categoria"}</div></div>
                  <div className="text-right"><div className="text-lg font-semibold tabular-nums">{p.current_stock}</div>
                    <div className="text-xs text-slate-500">mín. {p.min_stock}</div></div>
                </div>
                <div className="mt-2 flex items-center justify-between text-sm">
                  <span className="tabular-nums text-slate-700">{brl(p.sale_price)} <span className="text-xs text-slate-500">(custo {brl(p.cost_price)})</span></span>
                  <StockBadge p={p} />
                </div>
                {isAdmin && <div className="mt-2 flex gap-2">
                  <button onClick={() => setEditing(p)} className="flex-1 rounded-md border border-slate-300 py-2 text-sm">Editar</button>
                  <button onClick={() => toggleActive(p)} className="flex-1 rounded-md border border-slate-300 py-2 text-sm">{p.active ? "Inativar" : "Reativar"}</button>
                </div>}
              </li>
            ))}
          </ul>
        </>
      )}

      <Modal open={isAdmin && editing !== null} onClose={() => setEditing(null)} title={editing === "new" ? "Novo produto" : "Editar produto"}>
        <ProductForm product={editing === "new" ? null : editing} categories={categories}
          onCancel={() => setEditing(null)} onSaved={() => { setEditing(null); refresh(); }} />
      </Modal>
      <Modal open={showCats} onClose={() => setShowCats(false)} title="Categorias">
        <CategoryManager categories={categories} readOnly={!isAdmin} onChanged={() => { loadCategories(); refresh(); }} />
      </Modal>
    </div>
  );
}
