import { NextResponse } from "next/server";
import { fail, fromDbError, getContext } from "@/lib/estoque/http";
import { isUuid, readJson } from "@/lib/estoque/validate";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) return fail("Venda inválida.", 404);
  const ctx = await getContext();
  if ("error" in ctx) return ctx.error;
  const body = await readJson(request);
  const reason = String(body?.reason ?? "").trim();
  if (!reason || reason.length > 500) return fail("Informe o motivo do cancelamento (até 500 caracteres).");
  const { data, error } = await ctx.supabase.rpc("cancel_sale", { p_sale_id: id, p_reason: reason });
  if (error) return fromDbError(error);
  return NextResponse.json(data);
}
