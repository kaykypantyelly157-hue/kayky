import { NextResponse } from "next/server";
import { fail, fromDbError, getContext } from "@/lib/estoque/http";
import { isUuid } from "@/lib/estoque/validate";
import { parseCustomerBody, readCustomerJson } from "@/lib/customers/validate";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  const { id } = await params;
  if (!isUuid(id)) return fail("Cliente não encontrado.", 404);
  const ctx = await getContext();
  if ("error" in ctx) return ctx.error;
  const { data, error } = await ctx.supabase.from("customers").select("*").eq("id", id).maybeSingle();
  if (error) return fromDbError(error);
  if (!data) return fail("Cliente não encontrado.", 404);
  return NextResponse.json(data);
}

export async function PATCH(request: Request, { params }: RouteContext) {
  const { id } = await params;
  if (!isUuid(id)) return fail("Cliente não encontrado.", 404);
  const ctx = await getContext();
  if ("error" in ctx) return ctx.error;
  const body = await readCustomerJson(request);
  if (!body) return fail("Dados inválidos.");
  const parsed = parseCustomerBody(body, true);
  if ("error" in parsed) return fail(parsed.error);
  const { data, error } = await ctx.supabase.from("customers").update(parsed.data).eq("id", id).select("*").maybeSingle();
  if (error) return fromDbError(error);
  if (!data) return fail("Cliente não encontrado ou sem permissão.", 404);
  return NextResponse.json(data);
}
