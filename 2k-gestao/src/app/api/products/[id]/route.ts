import { NextResponse } from "next/server";
import { fail, fromDbError, getContext } from "@/lib/estoque/http";
import { isUuid, parseProductBody, readJson } from "@/lib/estoque/validate";

type P = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: P) {
  const { id } = await params;
  if (!isUuid(id)) return fail("Produto não encontrado.", 404);
  const ctx = await getContext();
  if ("error" in ctx) return ctx.error;
  const { data, error } = await ctx.supabase.from("products_list").select("*").eq("id", id).maybeSingle();
  if (error) return fromDbError(error);
  if (!data) return fail("Produto não encontrado.", 404);
  return NextResponse.json(data);
}

/** Edita dados cadastrais e inativa/reativa (active). Nao existe DELETE. */
export async function PATCH(req: Request, { params }: P) {
  const { id } = await params;
  if (!isUuid(id)) return fail("Produto não encontrado.", 404);
  const ctx = await getContext();
  if ("error" in ctx) return ctx.error;
  const body = await readJson(req);
  if (!body) return fail("Dados inválidos.");
  if ("current_stock" in body) return fail("O saldo só pode mudar por entrada ou ajuste de estoque.", 400);
  const parsed = parseProductBody(body, true);
  if ("error" in parsed) return fail(parsed.error);
  const { data, error } = await ctx.supabase.from("products").update(parsed.data).eq("id", id).select("id").maybeSingle();
  if (error) return fromDbError(error);
  if (!data) return fail("Produto não encontrado ou sem permissão.", 404);
  return NextResponse.json(data);
}
