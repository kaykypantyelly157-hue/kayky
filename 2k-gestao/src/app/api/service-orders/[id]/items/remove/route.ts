import { NextResponse } from "next/server";
import { fail, fromDbError, getContext } from "@/lib/estoque/http";
import { isUuid, readJson } from "@/lib/estoque/validate";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) return fail("OS inválida.", 404);
  const ctx = await getContext();
  if ("error" in ctx) return ctx.error;
  const body = await readJson(request);
  if (!body || !isUuid(body.item_id)) return fail("Peça inválida.");
  const { data, error } = await ctx.supabase.rpc("remove_service_order_item", {
    p_service_order_id: id, p_item_id: body.item_id
  });
  if (error) return fromDbError(error);
  return NextResponse.json(data);
}
