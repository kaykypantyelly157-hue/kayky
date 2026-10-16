import { NextResponse } from "next/server";
import { fail, fromDbError, getContext } from "@/lib/estoque/http";
import { isUuid, parseMoney, parsePositiveInt, readJson } from "@/lib/estoque/validate";
import type { Json, Sale } from "@/types/database";

const paymentMethods = new Set(["dinheiro", "pix", "debito", "credito"]);

export async function GET() {
  const ctx = await getContext();
  if ("error" in ctx) return ctx.error;
  const { data: isAdmin, error: roleError } = await ctx.supabase.rpc("is_admin");
  if (roleError) return fromDbError(roleError);
  if (!isAdmin) return fail("Acesso ao módulo de vendas restrito a administradores.", 403);
  const { data, error } = await ctx.supabase.from("sales").select("*").order("created_at", { ascending: false }).limit(100);
  if (error) return fromDbError(error);
  return NextResponse.json(data);
}

export async function POST(request: Request) {
  const ctx = await getContext();
  if ("error" in ctx) return ctx.error;
  const body = await readJson(request);
  if (!body) return fail("Dados inválidos.");
  if (body.customer_id !== null && body.customer_id !== undefined && !isUuid(body.customer_id)) return fail("Cliente inválido.");
  const discount = parseMoney(body.discount ?? "0");
  if (discount === null) return fail("Desconto inválido.");
  if (!Array.isArray(body.items) || body.items.length === 0 || body.items.length > 50) return fail("Inclua de 1 a 50 itens.");
  const items: { product_id: string; quantity: number }[] = [];
  for (const item of body.items) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return fail("Item inválido.");
    const row = item as Record<string, unknown>;
    const quantity = parsePositiveInt(row.quantity);
    if (!isUuid(row.product_id) || quantity === null) return fail("Produto ou quantidade inválidos.");
    items.push({ product_id: row.product_id, quantity });
  }
  if (!Array.isArray(body.payments) || body.payments.length === 0 || body.payments.length > 4) return fail("Informe uma forma de pagamento.");
  const payments: { method: string; amount: string }[] = [];
  for (const payment of body.payments) {
    if (!payment || typeof payment !== "object" || Array.isArray(payment)) return fail("Pagamento inválido.");
    const row = payment as Record<string, unknown>;
    const amount = parseMoney(row.amount);
    if (typeof row.method !== "string" || !paymentMethods.has(row.method) || amount === null || Number(amount) <= 0) {
      return fail("Método ou valor de pagamento inválido.");
    }
    payments.push({ method: row.method, amount });
  }

  const { data, error } = await ctx.supabase.rpc("finalize_sale", {
    p_customer_id: (body.customer_id as string | null | undefined) ?? null,
    p_discount: discount,
    p_items: items satisfies Json,
    p_payments: payments satisfies Json
  });
  if (error) return fromDbError(error);
  return NextResponse.json(data, { status: 201 });
}
