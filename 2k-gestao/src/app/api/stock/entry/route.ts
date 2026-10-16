import { NextResponse } from "next/server";
import { fail, fromDbError, getContext } from "@/lib/estoque/http";
import { isUuid, parsePositiveInt, readJson } from "@/lib/estoque/validate";

export async function POST(req: Request) {
  const ctx = await getContext();
  if ("error" in ctx) return ctx.error;
  const body = await readJson(req);
  const quantity = parsePositiveInt(body?.quantity);
  if (!body || !isUuid(body.product_id)) return fail("Selecione um produto.");
  if (quantity === null) return fail("Informe uma quantidade inteira maior que zero.");
  const reason = body.reason == null ? null : String(body.reason).trim().slice(0, 300) || null;
  const { data, error } = await ctx.supabase.rpc("add_stock", {
    p_product_id: body.product_id, p_quantity: quantity, p_reason: reason });
  if (error) return fromDbError(error);
  return NextResponse.json(data, { status: 201 });
}
