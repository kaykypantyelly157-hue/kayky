"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import CustomerSelect from "@/components/customers/CustomerSelect";
import ExportButton from "@/components/ExportButton";
import { api } from "@/lib/estoque/client";
import { brl, dateTime } from "@/lib/estoque/format";
import type { Product } from "@/lib/estoque/types";
import type { Customer, Sale } from "@/types/database";

type CartItem = { product: Product; quantity: number };
type PaymentMethod = "dinheiro" | "pix" | "debito" | "credito";
const input = "rounded-md border border-slate-300 bg-white px-3 py-2 text-sm";

export default function SalesPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [search, setSearch] = useState("");
  const [discount, setDiscount] = useState("0,00");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("dinheiro");
  const [isAdmin, setIsAdmin] = useState(false);
  const [roleLoaded, setRoleLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const loadSales = useCallback(() => {
    api<Sale[]>("/api/sales").then(setSales).catch((reason) => setError(reason instanceof Error ? reason.message : "Erro ao carregar vendas."));
  }, []);
  const findProducts = useCallback(() => {
    const params = new URLSearchParams({ q: search, status: "active", limit: "30" });
    api<Product[]>(`/api/products?${params}`).then(setProducts).catch((reason) => setError(reason instanceof Error ? reason.message : "Erro ao pesquisar produtos."));
  }, [search]);

  useEffect(() => { if (isAdmin) loadSales(); }, [isAdmin, loadSales]);
  useEffect(() => { if (isAdmin) findProducts(); }, [isAdmin, findProducts]);
  useEffect(() => {
    api<{ role: string }>("/api/me").then((profile) => { setIsAdmin(profile.role === "admin"); setRoleLoaded(true); })
      .catch((reason) => { setError(reason instanceof Error ? reason.message : "Erro ao validar permissões."); setRoleLoaded(true); });
  }, []);

  function add(product: Product) {
    setCart((current) => {
      const existing = current.find((item) => item.product.id === product.id);
      if (existing) return current.map((item) => item.product.id === product.id ? { ...item, quantity: item.quantity + 1 } : item);
      return [...current, { product, quantity: 1 }];
    });
  }

  async function finalize(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaving(true); setError(null); setNotice(null);
    const discountAmount = discount.trim().replace(",", ".");
    const base = cart.reduce((sum, item) => sum + Number(item.product.sale_price) * item.quantity, 0);
    const total = Math.max(0, base - Number(discountAmount || 0));
    try {
      const result = await api<{ number?: string }>("/api/sales", {
        method: "POST",
        body: JSON.stringify({
          customer_id: customer?.id ?? null,
          discount: discountAmount,
          items: cart.map(({ product, quantity }) => ({ product_id: product.id, quantity })),
          payments: [{ method: paymentMethod, amount: total.toFixed(2) }]
        })
      });
      setNotice(`Venda #${result.number ?? ""} finalizada.`);
      setCart([]); setCustomer(null); setDiscount("0,00");
      loadSales(); findProducts();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível finalizar a venda.");
    } finally {
      setSaving(false);
    }
  }

  async function cancel(sale: Sale) {
    const reason = window.prompt(`Motivo para cancelar a venda #${String(sale.sale_number).padStart(6, "0")}:`);
    if (!reason?.trim()) return;
    try {
      await api(`/api/sales/${sale.id}/cancel`, { method: "POST", body: JSON.stringify({ reason: reason.trim() }) });
      loadSales();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível cancelar.");
    }
  }

  const subtotal = cart.reduce((sum, item) => sum + Number(item.product.sale_price) * item.quantity, 0);
  const total = Math.max(0, subtotal - Number(discount.trim().replace(",", ".") || 0));

  if (!roleLoaded) return <section className="p-6 text-sm text-slate-600">Validando permissões…</section>;
  if (!isAdmin) return <section className="mx-auto max-w-3xl space-y-3 p-6"><h1 className="text-2xl font-semibold">Vendas</h1><p role="alert" className="rounded bg-amber-50 p-4 text-sm text-amber-900">Acesso ao módulo de vendas restrito a administradores.</p></section>;

  return (
    <section className="mx-auto max-w-7xl space-y-5 p-4 md:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-sm text-slate-600">Operação de vendas</p><h1 className="text-2xl font-semibold">Vendas</h1></div><ExportButton entity="sales" /></header>
      {error && <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {notice && <p role="status" className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
      {!isAdmin && <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">Somente administradores podem finalizar ou cancelar vendas.</p>}
      <div className="grid gap-5 lg:grid-cols-[1fr_1fr]">
        <div className="space-y-3">
          <h2 className="font-semibold">Adicionar produtos</h2>
          <input className={`${input} w-full`} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por nome, SKU ou modelo" aria-label="Buscar produtos para venda" />
          <ul className="max-h-72 space-y-2 overflow-y-auto">
            {products.filter((product) => product.current_stock > 0).map((product) => <li key={product.id} className="flex items-center justify-between gap-3 rounded-md border bg-white p-3">
              <div className="min-w-0"><p className="truncate font-medium">{product.name}</p><p className="text-xs text-slate-600">{product.sku} · estoque {product.current_stock} · {brl(product.sale_price)}</p></div>
              <button disabled={!isAdmin} onClick={() => add(product)} className="shrink-0 rounded bg-slate-900 px-3 py-2 text-sm text-white disabled:opacity-40">Adicionar</button>
            </li>)}
          </ul>
        </div>
        <form onSubmit={finalize} className="space-y-3 rounded-lg border bg-white p-4">
          <h2 className="font-semibold">Carrinho</h2>
          {cart.length === 0 ? <p className="text-sm text-slate-500">Adicione produtos para iniciar uma venda.</p> : <ul className="divide-y">
            {cart.map(({ product, quantity }) => <li key={product.id} className="flex items-center justify-between gap-3 py-2">
              <div className="min-w-0"><p className="truncate text-sm font-medium">{product.name}</p><p className="text-xs text-slate-600">{brl(product.sale_price)} × {quantity}</p></div>
              <div className="flex items-center gap-2"><input className="w-16 rounded border px-2 py-1 text-sm" type="number" min="1" max={product.current_stock} value={quantity} aria-label={`Quantidade de ${product.name}`} onChange={(event) => {
                const next = Number(event.target.value);
                if (Number.isInteger(next) && next > 0 && next <= product.current_stock) setCart((items) => items.map((item) => item.product.id === product.id ? { ...item, quantity: next } : item));
              }} /><button type="button" onClick={() => setCart((items) => items.filter((item) => item.product.id !== product.id))} className="text-sm text-red-700">Remover</button></div>
            </li>)}
          </ul>}
          <label className="block space-y-1 text-sm">Cliente (opcional)<CustomerSelect value={customer?.id ?? ""} onChange={setCustomer} /></label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block space-y-1 text-sm">Desconto (R$)<input className={`${input} w-full`} inputMode="decimal" value={discount} onChange={(event) => setDiscount(event.target.value)} /></label>
            <label className="block space-y-1 text-sm">Pagamento<select className={`${input} w-full`} value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value as PaymentMethod)}>
              <option value="dinheiro">Dinheiro</option><option value="pix">PIX</option><option value="debito">Débito</option><option value="credito">Crédito</option>
            </select></label>
          </div>
          <div className="space-y-1 border-t pt-3 text-sm"><p className="flex justify-between"><span>Subtotal estimado</span><span>{brl(subtotal)}</span></p><p className="flex justify-between text-lg font-semibold"><span>Total estimado</span><span>{brl(total)}</span></p></div>
          <button disabled={!isAdmin || saving || cart.length === 0} className="w-full rounded-md bg-emerald-700 px-4 py-3 font-medium text-white disabled:opacity-40">{saving ? "Finalizando…" : "Finalizar venda"}</button>
          <p className="text-xs text-slate-500">Preços, descontos, pagamentos e saldo são recalculados e validados pelo banco. É necessário caixa aberto.</p>
        </form>
      </div>
      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Vendas recentes</h2>
        <ul className="space-y-2">
          {sales.map((sale) => <li key={sale.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-white p-3">
            <div><p className="font-medium">Venda #{String(sale.sale_number).padStart(6, "0")} · {brl(sale.total)} {sale.status === "cancelled" && <span className="text-red-700">(cancelada)</span>}</p><p className="text-xs text-slate-600">{dateTime(sale.created_at)} · faturamento registrado</p></div>
            {isAdmin && sale.status === "completed" && <button onClick={() => cancel(sale)} className="rounded border border-red-300 px-3 py-2 text-sm text-red-700">Cancelar</button>}
          </li>)}
          {sales.length === 0 && <li className="rounded border border-dashed p-5 text-center text-sm text-slate-500">Nenhuma venda registrada.</li>}
        </ul>
      </div>
    </section>
  );
}
