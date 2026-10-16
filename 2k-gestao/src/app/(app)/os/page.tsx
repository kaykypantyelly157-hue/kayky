"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import CustomerSelect from "@/components/customers/CustomerSelect";
import ExportButton from "@/components/ExportButton";
import { api } from "@/lib/estoque/client";
import { brl, dateTime } from "@/lib/estoque/format";
import type { Product } from "@/lib/estoque/types";
import type { Customer, ServiceOrder, ServiceOrderItem, ServiceOrderStatus } from "@/types/database";

type Technician = { id: string; name: string };
type OrderDetail = {
  order: ServiceOrder;
  items: ServiceOrderItem[];
  history: { id: string; previous_status: ServiceOrderStatus | null; new_status: ServiceOrderStatus; event: string; details: string | null; created_at: string }[];
};
type CreateResult = { order: ServiceOrder; number: string };
const statusLabel: Record<ServiceOrderStatus, string> = {
  recebido: "Recebido", em_analise: "Em análise", aguardando_aprovacao: "Aguardando aprovação",
  aguardando_peca: "Aguardando peça", em_manutencao: "Em manutenção", pronto: "Pronto",
  entregue: "Entregue", cancelado: "Cancelado"
};
const transitions: Record<ServiceOrderStatus, ServiceOrderStatus[]> = {
  recebido: ["em_analise", "cancelado"],
  em_analise: ["aguardando_aprovacao", "aguardando_peca", "em_manutencao", "cancelado"],
  aguardando_aprovacao: ["aguardando_peca", "em_manutencao", "cancelado"],
  aguardando_peca: ["em_manutencao", "cancelado"],
  em_manutencao: ["aguardando_peca", "pronto", "cancelado"],
  pronto: ["em_manutencao", "entregue", "cancelado"],
  entregue: [],
  cancelado: []
};
const input = "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm";

export default function ServiceOrdersPage() {
  const [orders, setOrders] = useState<ServiceOrder[]>([]);
  const [detail, setDetail] = useState<OrderDetail | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [query, setQuery] = useState("");
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [role, setRole] = useState("");
  const [userId, setUserId] = useState("");
  const [creating, setCreating] = useState(false);
  const [productSearch, setProductSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const loadOrders = useCallback(() => {
    const params = new URLSearchParams({ q: query });
    api<ServiceOrder[]>(`/api/service-orders?${params}`).then(setOrders)
      .catch((reason) => setError(reason instanceof Error ? reason.message : "Erro ao carregar OS."));
  }, [query]);
  const loadDetail = useCallback((id: string) => {
    api<OrderDetail>(`/api/service-orders/${id}`).then(setDetail)
      .catch((reason) => setError(reason instanceof Error ? reason.message : "Erro ao carregar OS."));
  }, []);

  useEffect(loadOrders, [loadOrders]);
  useEffect(() => {
    api<{ id: string; role: string }>("/api/me").then((profile) => { setRole(profile.role); setUserId(profile.id); })
      .catch((reason) => setError(reason instanceof Error ? reason.message : "Erro ao validar permissões."));
    api<Technician[]>("/api/technicians").then(setTechnicians)
      .catch((reason) => setError(reason instanceof Error ? reason.message : "Erro ao carregar técnicos."));
  }, []);
  useEffect(() => {
    const params = new URLSearchParams({ q: productSearch, status: "active", limit: "30" });
    api<Product[]>(`/api/products?${params}`).then(setProducts)
      .catch((reason) => setError(reason instanceof Error ? reason.message : "Erro ao pesquisar peças."));
  }, [productSearch]);
  useEffect(() => {
    api<Customer[]>("/api/customers?status=active").then(setCustomers)
      .catch((reason) => setError(reason instanceof Error ? reason.message : "Erro ao carregar clientes."));
  }, []);

  async function createOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!customer || saving) return;
    setSaving(true); setError(null); setNotice(null);
    const form = new FormData(event.currentTarget);
    const get = (key: string) => String(form.get(key) ?? "").trim();
    try {
      const result = await api<CreateResult>("/api/service-orders", {
        method: "POST",
        body: JSON.stringify({
          customer_id: customer.id,
          device: get("device"),
          brand_model: get("brand_model"),
          reported_issue: get("reported_issue"),
          technician_id: get("technician_id") || null,
          labor_amount: get("labor_amount") || "0",
          observations: get("observations")
        })
      });
      setNotice(`OS #${result.number} criada.`);
      setCreating(false); setCustomer(null); loadOrders(); loadDetail(result.order.id);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível criar a OS.");
    } finally {
      setSaving(false);
    }
  }

  async function saveOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!detail || saving) return;
    setSaving(true); setError(null);
    const form = new FormData(event.currentTarget);
    const get = (key: string) => String(form.get(key) ?? "").trim();
    try {
      await api(`/api/service-orders/${detail.order.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          diagnosis: get("diagnosis"),
          service_description: get("service_description"),
          observations: get("observations"),
          technician_id: role === "admin" ? get("technician_id") || null : detail.order.technician_id,
          labor_amount: role === "admin" ? get("labor_amount") : String(detail.order.labor_amount),
          discount: role === "admin" ? get("discount") : String(detail.order.discount)
        })
      });
      loadDetail(detail.order.id); loadOrders(); setNotice("OS atualizada.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível atualizar a OS.");
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(status: ServiceOrderStatus) {
    if (!detail) return;
    const details = window.prompt(`Observação para ${statusLabel[status]} (opcional):`) ?? "";
    try {
      await api(`/api/service-orders/${detail.order.id}/status`, { method: "POST", body: JSON.stringify({ status, details }) });
      loadDetail(detail.order.id); loadOrders();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível alterar o status.");
    }
  }

  async function addPart(product: Product) {
    if (!detail) return;
    const raw = window.prompt(`Quantidade de ${product.name}:`, "1");
    if (raw === null) return;
    try {
      await api(`/api/service-orders/${detail.order.id}/items`, {
        method: "POST", body: JSON.stringify({ product_id: product.id, quantity: Number(raw) })
      });
      loadDetail(detail.order.id); loadOrders(); setNotice("Peça adicionada e estoque atualizado.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível adicionar a peça.");
    }
  }

  async function removePart(item: ServiceOrderItem) {
    if (!detail || !window.confirm(`Estornar ${item.quantity} × ${item.product_name} ao estoque?`)) return;
    try {
      await api(`/api/service-orders/${detail.order.id}/items/remove`, { method: "POST", body: JSON.stringify({ item_id: item.id }) });
      loadDetail(detail.order.id); loadOrders();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível estornar a peça.");
    }
  }

  const order = detail?.order;
  const canOperate = Boolean(order && (role === "admin" || order.technician_id === userId) && !["entregue", "cancelado"].includes(order.status));

  return (
    <section className="mx-auto max-w-7xl space-y-5 p-4 md:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div><p className="text-sm text-slate-600">Ordens e reparos</p><h1 className="text-2xl font-semibold">Ordens de serviço</h1></div>
        <div className="flex gap-2"><ExportButton entity="service-orders" />{role === "admin" && <button onClick={() => { setCreating(true); setDetail(null); }} className="rounded bg-slate-950 px-4 py-2 text-sm text-white">Nova OS</button>}</div>
      </header>
      {error && <p role="alert" className="rounded bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {notice && <p role="status" className="rounded bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
      <div className="grid gap-5 lg:grid-cols-[minmax(260px,0.8fr)_minmax(0,1.5fr)]">
        <aside className="space-y-3">
          <input className={input} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar aparelho, modelo ou defeito" aria-label="Buscar ordens de serviço" />
          <ul className="space-y-2">{orders.map((row) => <li key={row.id}>
            <button onClick={() => { setCreating(false); loadDetail(row.id); setError(null); }} className={`w-full rounded-lg border bg-white p-3 text-left ${detail?.order.id === row.id ? "border-slate-900 ring-1 ring-slate-900" : "border-slate-200"}`}>
              <div className="flex justify-between gap-2"><span className="font-semibold">OS #{String(row.order_number).padStart(6, "0")}</span><span className="text-xs text-slate-600">{statusLabel[row.status]}</span></div>
              <p className="truncate text-sm">{row.device}{row.brand_model ? ` · ${row.brand_model}` : ""}</p><p className="text-xs text-slate-500">{dateTime(row.updated_at)} · {brl(row.total)}</p>
            </button>
          </li>)}
            {orders.length === 0 && <li className="rounded border border-dashed p-5 text-center text-sm text-slate-500">Nenhuma OS disponível.</li>}
          </ul>
        </aside>
        {creating ? <form onSubmit={createOrder} className="space-y-3 rounded-lg border bg-white p-4">
          <h2 className="text-lg font-semibold">Abrir ordem de serviço</h2>
          <label className="block space-y-1 text-sm">Cliente obrigatório<CustomerSelect value={customer?.id ?? ""} onChange={setCustomer} required /></label>
          <label className="block text-sm">Aparelho<input className={`${input} mt-1`} name="device" required maxLength={120} /></label>
          <label className="block text-sm">Marca e modelo<input className={`${input} mt-1`} name="brand_model" maxLength={160} /></label>
          <label className="block text-sm">Defeito relatado<textarea className={`${input} mt-1`} name="reported_issue" required rows={3} maxLength={2000} /></label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">Técnico<select className={`${input} mt-1`} name="technician_id"><option value="">Não atribuído</option>{technicians.map((technician) => <option key={technician.id} value={technician.id}>{technician.name}</option>)}</select></label>
            <label className="block text-sm">Mão de obra (R$)<input className={`${input} mt-1`} name="labor_amount" inputMode="decimal" defaultValue="0,00" /></label>
          </div>
          <label className="block text-sm">Observações<textarea className={`${input} mt-1`} name="observations" rows={2} maxLength={4000} /></label>
          <p className="text-xs text-slate-500">A senha do aparelho não é armazenada. Combine uma forma segura de desbloqueio diretamente com o cliente.</p>
          <div className="flex justify-end gap-2"><button type="button" onClick={() => setCreating(false)} className="rounded border px-4 py-2">Cancelar</button><button disabled={saving || !customer} className="rounded bg-slate-950 px-4 py-2 text-white disabled:opacity-40">{saving ? "Criando…" : "Criar OS"}</button></div>
        </form> : order ? <div className="space-y-4 rounded-lg border bg-white p-4">
          <header className="flex flex-wrap items-center justify-between gap-3">
            <div><h2 className="text-xl font-semibold">OS #{String(order.order_number).padStart(6, "0")}</h2><p className="text-sm text-slate-600">{statusLabel[order.status]} · criada {dateTime(order.created_at)}</p></div>
            <button onClick={() => window.print()} className="no-print rounded border px-3 py-2 text-sm">Imprimir / PDF</button>
          </header>
          <section className="grid gap-3 border-b pb-4 text-sm sm:grid-cols-2">
            <p><strong>Aparelho:</strong> {order.device}{order.brand_model ? ` · ${order.brand_model}` : ""}</p>
            <p><strong>Cliente:</strong> {customers.find((entry) => entry.id === order.customer_id)?.name ?? "Cliente vinculado"}</p>
            <p className="sm:col-span-2"><strong>Defeito relatado:</strong> {order.reported_issue}</p>
          </section>
          <form onSubmit={saveOrder} className="no-print grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">Diagnóstico<textarea className={`${input} mt-1`} name="diagnosis" rows={3} maxLength={4000} defaultValue={order.diagnosis ?? ""} disabled={!canOperate} /></label>
            <label className="block text-sm">Serviço realizado<textarea className={`${input} mt-1`} name="service_description" rows={3} maxLength={4000} defaultValue={order.service_description ?? ""} disabled={!canOperate} /></label>
            <label className="block text-sm">Observações<textarea className={`${input} mt-1`} name="observations" rows={2} maxLength={4000} defaultValue={order.observations ?? ""} disabled={!canOperate} /></label>
            <div className="space-y-3">
              {role === "admin" && <label className="block text-sm">Técnico<select className={`${input} mt-1`} name="technician_id" defaultValue={order.technician_id ?? ""} disabled={!canOperate}><option value="">Não atribuído</option>{technicians.map((technician) => <option key={technician.id} value={technician.id}>{technician.name}</option>)}</select></label>}
              <label className="block text-sm">Mão de obra (R$)<input className={`${input} mt-1`} name="labor_amount" inputMode="decimal" defaultValue={String(order.labor_amount).replace(".", ",")} disabled={!canOperate} /></label>
              <label className="block text-sm">Desconto (R$)<input className={`${input} mt-1`} name="discount" inputMode="decimal" defaultValue={String(order.discount).replace(".", ",")} disabled={!canOperate} /></label>
            </div>
            {canOperate && <button className="rounded bg-slate-900 px-4 py-2 text-white sm:col-span-2">Salvar alterações</button>}
          </form>
          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">Peças e estoque</h3>
              {canOperate && <label className="no-print"><span className="sr-only">Buscar peça para OS</span><input className={`${input} w-64`} value={productSearch} onChange={(event) => setProductSearch(event.target.value)} placeholder="Buscar produto para adicionar" /></label>}
            </div>
            {canOperate && productSearch && <ul className="no-print max-h-36 overflow-y-auto rounded border">{products.filter((product) => product.current_stock > 0).map((product) => <li key={product.id}>
              <button onClick={() => addPart(product)} className="flex w-full justify-between gap-2 p-2 text-left text-sm hover:bg-slate-50">{product.name}<span>{product.current_stock} em estoque · {brl(product.sale_price)}</span></button>
            </li>)}</ul>}
            <ul className="divide-y">{detail.items.filter((item) => !item.reversed_at).map((item) => <li key={item.id} className="flex items-center justify-between gap-2 py-2 text-sm">
              <span>{item.product_name} × {item.quantity}</span><span className="flex items-center gap-2">{brl(item.line_total)}{canOperate && <button onClick={() => removePart(item)} className="no-print text-red-700">Estornar</button>}</span>
            </li>)}
              {detail.items.every((item) => item.reversed_at) && <li className="py-2 text-sm text-slate-500">Nenhuma peça ativa.</li>}
            </ul>
            <div className="border-t pt-3 text-right text-sm"><p>Mão de obra: {brl(order.labor_amount)} · Peças: {brl(order.parts_total)} · Desconto: {brl(order.discount)}</p><p className="text-lg font-semibold">Total: {brl(order.total)}</p></div>
          </section>
          {canOperate && <div className="no-print flex flex-wrap gap-2 border-t pt-4"><span className="self-center text-sm font-medium">Avançar status:</span>
            {transitions[order.status].filter((status) => status !== "cancelado" || role === "admin").map((status) => <button key={status} onClick={() => changeStatus(status)} className="rounded border px-3 py-2 text-sm">{statusLabel[status]}</button>)}
          </div>}
          <section className="border-t pt-4"><h3 className="mb-2 font-semibold">Histórico</h3><ol className="space-y-2 text-sm">{detail.history.map((event) => <li key={event.id}><span className="font-medium">{statusLabel[event.new_status]}</span> · {dateTime(event.created_at)}{event.details && ` · ${event.details}`}</li>)}</ol></section>
        </div> : <div className="grid min-h-64 place-items-center rounded-lg border border-dashed bg-white p-6 text-center text-sm text-slate-500">{role === "admin" ? "Selecione uma OS ou crie uma nova." : "Selecione uma OS atribuída a você."}</div>}
      </div>
    </section>
  );
}
