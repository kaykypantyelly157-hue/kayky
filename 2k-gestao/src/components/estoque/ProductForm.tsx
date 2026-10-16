"use client";
import { useState, type FormEvent } from "react";
import { api } from "@/lib/estoque/client";
import { moneyInput } from "@/lib/estoque/format";
import type { Category, Product } from "@/lib/estoque/types";

const input = "w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900";

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-slate-700">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

export default function ProductForm({ product, categories, onSaved, onCancel }: {
  product: Product | null; categories: Category[]; onSaved: () => void; onCancel: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (saving) return;
    const f = new FormData(e.currentTarget);
    const get = (k: string) => String(f.get(k) ?? "").trim();
    const body = {
      sku: get("sku"), name: get("name"),
      category_id: get("category_id") || null,
      brand: get("brand") || null, compatible_model: get("compatible_model") || null,
      description: get("description") || null,
      cost_price: get("cost_price") || "0", sale_price: get("sale_price") || "0",
      min_stock: get("min_stock") || "0",
    };
    setSaving(true); setError(null);
    try {
      await api(product ? `/api/products/${product.id}` : "/api/products", {
        method: product ? "PATCH" : "POST", body: JSON.stringify(body) });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar.");
    } finally { setSaving(false); }
  }

  const activeCats = categories.filter((c) => c.active || c.id === product?.category_id);

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="SKU"><input name="sku" required maxLength={40} defaultValue={product?.sku} className={input} /></Field>
        <Field label="Categoria">
          <select name="category_id" defaultValue={product?.category_id ?? ""} className={input}>
            <option value="">Sem categoria</option>
            {activeCats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Nome"><input name="name" required maxLength={120} defaultValue={product?.name} className={input} /></Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Marca"><input name="brand" maxLength={60} defaultValue={product?.brand ?? ""} className={input} /></Field>
        <Field label="Modelo compatível"><input name="compatible_model" maxLength={120} defaultValue={product?.compatible_model ?? ""} className={input} /></Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Custo (R$)"><input name="cost_price" inputMode="decimal" defaultValue={moneyInput(product?.cost_price ?? 0)} className={input} /></Field>
        <Field label="Preço de venda (R$)"><input name="sale_price" inputMode="decimal" defaultValue={moneyInput(product?.sale_price ?? 0)} className={input} /></Field>
        <Field label="Estoque mínimo"><input name="min_stock" inputMode="numeric" defaultValue={product?.min_stock ?? 0} className={input} /></Field>
      </div>
      <Field label="Descrição"><textarea name="description" rows={2} maxLength={1000} defaultValue={product?.description ?? ""} className={input} /></Field>
      <p className="text-xs text-slate-500">
        {product ? `Saldo atual: ${product.current_stock}. ` : "O produto começa com estoque 0. "}
        Para alterar o saldo, use a página Estoque.
      </p>
      {error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <div className="flex justify-end gap-2 pt-1">
        <button type="button" onClick={onCancel} className="rounded-md px-4 py-2 text-sm text-slate-700 hover:bg-slate-100">Cancelar</button>
        <button type="submit" disabled={saving}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50">
          {saving ? "Salvando…" : product ? "Salvar alterações" : "Cadastrar produto"}
        </button>
      </div>
    </form>
  );
}
