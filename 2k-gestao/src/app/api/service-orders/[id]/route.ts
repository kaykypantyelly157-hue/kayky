import { NextResponse } from "next/server";
import { fail, fromDbError, getContext } from "@/lib/estoque/http";
import { isUuid, parseMoney, readJson } from "@/lib/estoque/validate";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Context) {
  const { id } = await params;
  if (!isUuid(id)) return fail("OS não encontrada.", 404);
  const ctx = await getContext();
  if ("error" in ctx) return ctx.error;
  const [order, items, history] = await Promise.all([
    ctx.supabase.from("service_orders").select("*").eq("id", id).maybeSingle(),
    ctx.supabase.from("service_order_items").select("*").eq("service_order_id", id).order("created_at"),
    ctx.supabase.from("service_order_history").select("*").eq("service_order_id", id).order("created_at")
  ]);
  if (order.error) return fromDbError(order.error);
  if (items.error) return fromDbError(items.error);
  if (history.error) return fromDbError(history.error);
  if (!order.data) return fail("OS não encontrada ou sem permissão.", 404);
  return NextResponse.json({ order: order.data, items: items.data, history: history.data });
}

export async function PATCH(request: Request, { params }: Context) {
  const { id } = await params;
  if (!isUuid(id)) return fail("OS não encontrada.", 404);
  const ctx = await getContext();
  if ("error" in ctx) return ctx.error;
  const body = await readJson(request);
  if (!body) return fail("Dados inválidos.");
  const labor = parseMoney(body.labor_amount);
  const discount = parseMoney(body.discount);
  const diagnosis = String(body.diagnosis ?? "").trim();
  const service = String(body.service_description ?? "").trim();
  const observations = String(body.observations ?? "").trim();
  if (labor === null || discount === null) return fail("Mão de obra ou desconto inválidos.");
  if (diagnosis.length > 4000 || service.length > 4000 || observations.length > 4000) return fail("Texto excede o limite de 4.000 caracteres.");
  if (body.technician_id !== null && body.technician_id !== undefined && !isUuid(body.technician_id)) return fail("Técnico inválido.");
  const { data, error } = await ctx.supabase.rpc("update_service_order", {
    p_service_order_id: id, p_diagnosis: diagnosis || null, p_service_description: service || null,
    p_observations: observations || null, p_technician_id: (body.technician_id as string | null | undefined) ?? null,
    p_labor_amount: labor, p_discount: discount
  });
  if (error) return fromDbError(error);
  return NextResponse.json(data);
}
