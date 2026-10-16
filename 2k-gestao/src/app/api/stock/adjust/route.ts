import { NextResponse } from "next/server";
import { fail, fromDbError, getContext } from "@/lib/estoque/http";
import { isUuid, readJson } from "@/lib/estoque/validate";

export async function POST(req: Request) {
  const ctx = await getContext();
  if ("error" in ctx) return ctx.error;
  const body = await readJson(req);
  if (!body || !isUuid(body.product_id)) return fail("Selecione um produto.");
  const delta = body.delta;
  if (typeof delta !== "number" || !Number.isInteger(delta) || delta === 0 || Math.abs(delta) > 1_000_000)
    return fail("Informe um ajuste inteiro diferente de zero.");
  const reason = String(body.reason ?? "").trim().slice(0, 300);
  if (!reason) return fail("Informe o motivo do ajuste.");
  const { data, error } = await ctx.supabase.rpc("adjust_stock", {
    p_product_id: body.product_id, p_delta: delta, p_reason: reason });
  if (error) return fromDbError(error);
  return NextResponse.json(data, { status: 201 });
}
