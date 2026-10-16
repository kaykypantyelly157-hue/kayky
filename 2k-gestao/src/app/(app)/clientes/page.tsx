"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api } from "@/lib/estoque/client";
import ExportButton from "@/components/ExportButton";
import type { Customer } from "@/types/database";

const input = "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm";
type Draft = Pick<Customer, "name" | "phone"> & { cpf: string; email: string; notes: string };
const emptyDraft: Draft = { name: "", phone: "", cpf: "", email: "", notes: "" };

export default function CustomersPage() {
  const [rows, setRows] = useState<Customer[]>([]);
  const [query, setQuery] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [editing, setEditing] = useState<Customer | "new" | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    const params = new URLSearchParams({ q: query });
    api<Customer[]>(`/api/customers?${params}`).then(setRows).catch((reason) => setError(reason instanceof Error ? reason.message : "Erro ao carregar clientes."));
  }, [query]);

  useEffect(load, [load]);
  useEffect(() => {
    api<{ role: string }>("/api/me").then((profile) => setIsAdmin(profile.role === "admin"))
      .catch((reason) => setError(reason instanceof Error ? reason.message : "Erro ao validar permissões."));
  }, []);

  function begin(customer: Customer | "new") {
    setEditing(customer);
    setError(null);
    setDraft(customer === "new" ? emptyDraft : {
      name: customer.name, phone: customer.phone, cpf: customer.cpf ?? "", email: customer.email ?? "", notes: customer.notes ?? ""
    });
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!editing || saving) return;
    setSaving(true);
    setError(null);
    try {
      await api(editing === "new" ? "/api/customers" : `/api/customers/${editing.id}`, {
        method: editing === "new" ? "POST" : "PATCH",
        body: JSON.stringify(draft)
      });
      setEditing(null);
      load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Erro ao salvar cliente.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(customer: Customer) {
    try {
      await api(`/api/customers/${customer.id}`, { method: "PATCH", body: JSON.stringify({ active: !customer.active }) });
      load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Erro ao atualizar cliente.");
    }
  }

  return (
    <section className="mx-auto max-w-6xl space-y-4 p-4 md:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div><p className="text-sm text-slate-600">Cadastro e consulta</p><h1 className="text-2xl font-semibold">Clientes</h1></div>
        <div className="flex gap-2">{isAdmin && <><ExportButton entity="customers" /><button onClick={() => begin("new")} className="rounded-md bg-slate-950 px-4 py-2 text-sm font-medium text-white">Novo cliente</button></>}</div>
      </header>
      <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por nome, telefone ou CPF" className={input} aria-label="Buscar clientes" />
      {error && <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      <ul className="space-y-2 md:hidden">
        {rows.map((customer) => <li key={customer.id} className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="flex justify-between gap-2"><div><h2 className="font-semibold">{customer.name}</h2><p className="text-sm text-slate-600">{customer.phone}</p></div><span className="text-xs text-slate-500">{customer.active ? "Ativo" : "Inativo"}</span></div>
          <p className="mt-1 text-sm text-slate-600">{customer.email ?? "Sem e-mail"} · {customer.cpf ?? "Sem CPF"}</p>
          {isAdmin && <div className="mt-3 flex gap-2"><button onClick={() => begin(customer)} className="flex-1 rounded border px-3 py-2 text-sm">Editar</button><button onClick={() => toggleActive(customer)} className="flex-1 rounded border px-3 py-2 text-sm">{customer.active ? "Inativar" : "Reativar"}</button></div>}
        </li>)}
      </ul>
      <div className="hidden overflow-x-auto rounded-lg border bg-white md:block"><table className="w-full text-left text-sm">
        <thead className="border-b bg-slate-50"><tr>{["Nome", "Telefone", "CPF", "E-mail", "Status", ...(isAdmin ? ["Ações"] : [])].map((heading) => <th key={heading} className="p-3 font-medium">{heading}</th>)}</tr></thead>
        <tbody>{rows.map((customer) => <tr key={customer.id} className="border-b last:border-0">
          <td className="p-3 font-medium">{customer.name}</td><td className="p-3">{customer.phone}</td><td className="p-3">{customer.cpf ?? "—"}</td><td className="p-3">{customer.email ?? "—"}</td><td className="p-3">{customer.active ? "Ativo" : "Inativo"}</td>
          {isAdmin && <td className="space-x-2 p-3"><button onClick={() => begin(customer)} className="underline">Editar</button><button onClick={() => toggleActive(customer)} className="underline">{customer.active ? "Inativar" : "Reativar"}</button></td>}
        </tr>)}</tbody>
      </table></div>
      {rows.length === 0 && <p className="rounded border border-dashed p-6 text-center text-sm text-slate-600">Nenhum cliente encontrado.</p>}

      {editing && <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" role="presentation" onClick={(event) => { if (event.target === event.currentTarget) setEditing(null); }}>
        <form onSubmit={save} className="max-h-[90vh] w-full max-w-xl space-y-3 overflow-y-auto rounded-xl bg-white p-5" aria-label="Formulário de cliente">
          <h2 className="text-xl font-semibold">{editing === "new" ? "Novo cliente" : "Editar cliente"}</h2>
          <label className="block text-sm">Nome<input className={`${input} mt-1`} required maxLength={160} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
          <label className="block text-sm">Telefone / WhatsApp<input className={`${input} mt-1`} required maxLength={40} value={draft.phone} onChange={(event) => setDraft({ ...draft, phone: event.target.value })} /></label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">CPF (opcional)<input className={`${input} mt-1`} inputMode="numeric" maxLength={14} value={draft.cpf} onChange={(event) => setDraft({ ...draft, cpf: event.target.value })} /></label>
            <label className="block text-sm">E-mail<input className={`${input} mt-1`} type="email" maxLength={254} value={draft.email} onChange={(event) => setDraft({ ...draft, email: event.target.value })} /></label>
          </div>
          <label className="block text-sm">Observações<textarea className={`${input} mt-1`} rows={3} maxLength={2000} value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} /></label>
          {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
          <div className="flex justify-end gap-2"><button type="button" onClick={() => setEditing(null)} className="rounded border px-4 py-2">Cancelar</button><button disabled={saving} className="rounded bg-slate-950 px-4 py-2 text-white disabled:opacity-50">{saving ? "Salvando…" : "Salvar"}</button></div>
        </form>
      </div>}
    </section>
  );
}
