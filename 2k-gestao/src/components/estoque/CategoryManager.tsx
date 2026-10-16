"use client";
import { useState, type FormEvent } from "react";
import { api } from "@/lib/estoque/client";
import type { Category } from "@/lib/estoque/types";

export default function CategoryManager({
  categories,
  onChanged,
  readOnly = false
}: {
  categories: Category[];
  onChanged: () => void;
  readOnly?: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true); setError(null);
    try { await fn(); onChanged(); } catch (e) { setError(e instanceof Error ? e.message : "Erro."); } finally { setBusy(false); }
  }

  function add(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const name = String(new FormData(form).get("name") ?? "").trim();
    if (!name) return;
    run(async () => { await api("/api/categories", { method: "POST", body: JSON.stringify({ name }) }); form.reset(); });
  }

  function rename(c: Category, name: string) {
    if (readOnly) return;
    const n = name.trim();
    if (!n || n === c.name) return;
    run(() => api(`/api/categories/${c.id}`, { method: "PATCH", body: JSON.stringify({ name: n }) }));
  }

  return (
    <div className="space-y-3">
      {!readOnly && <form onSubmit={add} className="flex gap-2">
        <input name="name" required maxLength={60} placeholder="Nova categoria"
          className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-900 focus:outline-none" />
        <button disabled={busy} className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">Adicionar</button>
      </form>}
      {error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <ul className="divide-y divide-slate-200 rounded-md border border-slate-200">
        {categories.map((c) => (
          <li key={c.id} className="flex items-center gap-2 p-2">
            <input defaultValue={c.name} maxLength={60} readOnly={readOnly} aria-label={`Nome da categoria ${c.name}`}
              onBlur={(e) => rename(c, e.target.value)}
              className={`min-w-0 flex-1 rounded border border-transparent px-2 py-1 text-sm hover:border-slate-300 focus:border-slate-900 focus:outline-none ${c.active ? "" : "text-slate-400 line-through"}`} />
            {!readOnly && <button disabled={busy} onClick={() => run(() => api(`/api/categories/${c.id}`, { method: "PATCH", body: JSON.stringify({ active: !c.active }) }))}
              className="rounded px-2 py-1 text-xs text-slate-600 hover:bg-slate-100">{c.active ? "Inativar" : "Reativar"}</button>
            }
          </li>
        ))}
      </ul>
      {!readOnly && <p className="text-xs text-slate-500">Edite o nome direto na lista; a alteração é salva ao sair do campo.</p>}
    </div>
  );
}
