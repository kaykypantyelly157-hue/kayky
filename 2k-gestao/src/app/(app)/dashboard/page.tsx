"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/estoque/client";
import { brl, dateTime } from "@/lib/estoque/format";
import type { CashMovement, CashSession, Sale, ServiceOrder } from "@/types/database";

type DashboardData = {
  today: { salesCount: number; revenue: number; estimatedProfit: number } | null;
  cash: { session: CashSession | null; expected: number | null } | null;
  orders: { open: number; ready: number };
  lowStock: { id: string; name: string; sku: string; current_stock: number; min_stock: number }[];
  recentSales: Sale[];
  recentCashMovements: CashMovement[];
};

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [name, setName] = useState("usuário");
  const [isAdmin, setIsAdmin] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<DashboardData>("/api/dashboard").then(setData)
      .catch((reason) => setError(reason instanceof Error ? reason.message : "Erro ao carregar dashboard."));
    api<{ name: string; role: string }>("/api/me").then((profile) => { setName(profile.name); setIsAdmin(profile.role === "admin"); })
      .catch((reason) => setError(reason instanceof Error ? reason.message : "Erro ao carregar perfil."));
  }, []);

  const metrics = data ? [
    ["OS abertas", String(data.orders.open)],
    ["OS prontas", String(data.orders.ready)],
    ...(isAdmin ? [
      ["Vendas hoje", String(data.today?.salesCount ?? 0)],
      ["Faturamento hoje", brl(data.today?.revenue)],
      ["Lucro estimado", brl(data.today?.estimatedProfit)],
      ["Saldo esperado do caixa", data.cash?.expected === null || data.cash?.expected === undefined ? "Fechado" : brl(data.cash.expected)]
    ] : [])
  ] : [];

  return (
    <section className="mx-auto max-w-6xl space-y-6 p-4 md:p-8">
      <div><p className="text-sm text-slate-600">Visão geral</p><h1 className="mt-1 text-2xl font-semibold">Olá, {name}</h1>
        <p className="mt-1 text-sm text-slate-500">Indicadores de hoje em America/Sao_Paulo. Faturamento e lucro são valores distintos.</p></div>
      {error && <p role="alert" className="rounded bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {(data ? metrics : [["Carregando indicadores", "…"]]).map(([label, value]) => <article key={label} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm text-slate-600">{label}</h2><p className="mt-3 text-2xl font-semibold">{value}</p>
        </article>)}
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <section className="rounded-xl border bg-white p-4"><h2 className="mb-3 font-semibold">Estoque baixo</h2>
          <ul className="divide-y">{data?.lowStock.map((product) => <li key={product.id} className="flex justify-between gap-3 py-2 text-sm"><span>{product.name} <span className="text-slate-500">({product.sku})</span></span><strong>{product.current_stock} / mín. {product.min_stock}</strong></li>)}
            {data && data.lowStock.length === 0 && <li className="py-3 text-sm text-slate-500">Nenhum produto abaixo do mínimo.</li>}
          </ul>
        </section>
        {isAdmin && <section className="rounded-xl border bg-white p-4"><h2 className="mb-3 font-semibold">Vendas recentes</h2>
          <ul className="divide-y">{data?.recentSales.map((sale) => <li key={sale.id} className="flex justify-between gap-3 py-2 text-sm">
            <span>#{String(sale.sale_number).padStart(6, "0")} · {dateTime(sale.created_at)}{sale.status === "cancelled" ? " · cancelada" : ""}</span><strong>{brl(sale.total)}</strong>
          </li>)}{data && data.recentSales.length === 0 && <li className="py-3 text-sm text-slate-500">Nenhuma venda registrada.</li>}</ul>
        </section>}
        {isAdmin && <section className="rounded-xl border bg-white p-4 lg:col-span-2"><h2 className="mb-3 font-semibold">Movimentos recentes do caixa aberto</h2>
          <ul className="divide-y">{data?.recentCashMovements.map((movement) => <li key={movement.id} className="flex justify-between gap-3 py-2 text-sm">
            <span>{movement.reason} · {dateTime(movement.created_at)}</span><strong>{brl(movement.amount)}</strong>
          </li>)}{data && data.recentCashMovements.length === 0 && <li className="py-3 text-sm text-slate-500">Sem movimentos recentes.</li>}</ul>
        </section>}
      </div>
    </section>
  );
}
