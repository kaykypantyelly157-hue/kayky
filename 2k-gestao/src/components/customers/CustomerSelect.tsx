"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/estoque/client";
import type { Customer } from "@/types/database";

export default function CustomerSelect({
  value,
  onChange,
  required = false,
  includeInactive = false
}: {
  value: string;
  onChange: (customer: Customer | null) => void;
  required?: boolean;
  includeInactive?: boolean;
}) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      const params = new URLSearchParams({ q: query, status: includeInactive ? "all" : "active" });
      api<Customer[]>(`/api/customers?${params}`)
        .then((rows) => { setCustomers(rows); setError(null); })
        .catch((reason) => setError(reason instanceof Error ? reason.message : "Erro ao pesquisar clientes."));
    }, 200);
    return () => clearTimeout(timer);
  }, [query, includeInactive]);

  return (
    <div className="space-y-2">
      <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Pesquisar cliente por nome, telefone ou CPF"
        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" aria-label="Pesquisar cliente" />
      <select value={value} required={required} onChange={(event) => onChange(customers.find((customer) => customer.id === event.target.value) ?? null)}
        className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm">
        <option value="">{required ? "Selecione um cliente" : "Sem cliente"}</option>
        {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name} · {customer.phone}{!customer.active ? " · inativo" : ""}</option>)}
      </select>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    </div>
  );
}
