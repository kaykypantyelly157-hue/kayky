import { NextResponse } from "next/server";
import { fail, fromDbError, getContext } from "@/lib/estoque/http";
import { isUuid, parseMoney, readJson } from "@/lib/estoque/validate";
import type { ServiceOrderStatus } from "@/types/database";

const statuses = new Set<ServiceOrderStatus>(["recebido", "em_analise", "aguardando_aprovacao", "aguardando_peca", "em_manutencao", "pronto", "entregue", "cancelado"]);

export async function GET(request: Request) {
  const ctx = await getContext();
  if ("error" in ctx) return ctx.error;
  const params = new URL(request.url).searchParams;
  const search = (params.get("q") ?? "").trim().replace(/[,()%*\\]/g, " ").slice(0, 80);
  const requestedStatus = params.get("status");
  if (requestedStatus && requestedStatus !== "all" && !statuses.has(requestedStatus as ServiceOrderStatus)) return fail("Status inválido.");
  let query = ctx.supabase.from("service_orders").select("*").order("updated_at", { ascending: false }).limit(100);
  if (requestedStatus && requestedStatus !== "all") query = query.eq("status", requestedStatus as ServiceOrderStatus);
  if (search) query = query.or(`device.ilike.%${search}%,brand_model.ilike.%${search}%,reported_issue.ilike.%${search}%`);
  const { data, error } = await query;
  if (error) return fromDbError(error);
  return NextResponse.json(data);
}

export async function POST(request: Request) {
  const ctx = await getContext();
  if ("error" in ctx) return ctx.error;
  const body = await readJson(request);
  if (!body) return fail("Dados inválidos.");
  const device = String(body.device ?? "").trim();
  const brandModel = String(body.brand_model ?? "").trim();
  const issue = String(body.reported_issue ?? "").trim();
  const observations = String(body.observations ?? "").trim();
  const labor = parseMoney(body.labor_amount ?? "0");
  if (!isUuid(body.customer_id)) return fail("Selecione um cliente.");
  if (!device || device.length > 120 || brandModel.length > 160) return fail("Aparelho ou marca/modelo inválidos.");
  if (!issue || issue.length > 2000) return fail("Informe o defeito relatado.");
  if (observations.length > 4000 || labor === null) return fail("Observações ou mão de obra inválidas.");
  if (body.technician_id !== null && body.technician_id !== undefined && !isUuid(body.technician_id)) return fail("Técnico inválido.");
  const { data, error } = await ctx.supabase.rpc("create_service_order", {
    p_customer_id: body.customer_id,
    p_device: device,
    p_brand_model: brandModel || null,
    p_reported_issue: issue,
    p_technician_id: (body.technician_id as string | null | undefined) ?? null,
    p_labor_amount: labor,
    p_observations: observations || null
  });
  if (error) return fromDbError(error);
  return NextResponse.json(data, { status: 201 });
}
