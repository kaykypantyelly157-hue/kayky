import { NextResponse } from "next/server";
import { fail, fromDbError, getContext } from "@/lib/estoque/http";
import { isUuid, parsePositiveInt, readJson } from "@/lib/estoque/validate";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) return fail("OS inválida.", 404);
  const ctx = await getContext();
  if ("error" in ctx) return ctx.error;
  const body = await readJson(request);
  const quantity = parsePositiveInt(body?.quantity);
  if (!body || !isUuid(body.product_id) || quantity === null) return fail("Produto ou quantidade inválidos.");
  const { data, error } = await ctx.supabase.rpc("add_service_order_item", {
    p_service_order_id: id, p_product_id: body.product_id, p_quantity: quantity
  });
  if (error) return fromDbError(error);
  return NextResponse.json(data, { status: 201 });
}
