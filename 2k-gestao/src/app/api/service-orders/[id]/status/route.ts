import { NextResponse } from "next/server";
import { fail, fromDbError, getContext } from "@/lib/estoque/http";
import { readJson } from "@/lib/estoque/validate";
import { isUuid } from "@/lib/estoque/validate";
import type { ServiceOrderStatus } from "@/types/database";

const statuses = new Set<ServiceOrderStatus>(["recebido", "em_analise", "aguardando_aprovacao", "aguardando_peca", "em_manutencao", "pronto", "entregue", "cancelado"]);

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) return fail("OS inválida.", 404);
  const ctx = await getContext();
  if ("error" in ctx) return ctx.error;
  const body = await readJson(request);
  if (!body || typeof body.status !== "string" || !statuses.has(body.status as ServiceOrderStatus)) return fail("Status inválido.");
  const details = String(body.details ?? "").trim();
  if (details.length > 1000) return fail("Observação excede 1.000 caracteres.");
  const { data, error } = await ctx.supabase.rpc("change_service_order_status", {
    p_service_order_id: id, p_new_status: body.status, p_details: details || null
  });
  if (error) return fromDbError(error);
  return NextResponse.json(data);
}
