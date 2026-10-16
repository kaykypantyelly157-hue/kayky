import { NextResponse } from "next/server";
import { fail, fromDbError, getContext } from "@/lib/estoque/http";
import { isUuid, readJson } from "@/lib/estoque/validate";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) return fail("Categoria inválida.", 404);
  const ctx = await getContext();
  if ("error" in ctx) return ctx.error;
  const body = await readJson(req);
  if (!body) return fail("Dados inválidos.");
  const patch: Record<string, unknown> = {};
  if ("name" in body) {
    const name = String(body.name ?? "").trim();
    if (!name || name.length > 60) return fail("Informe o nome da categoria (até 60 caracteres).");
    patch.name = name;
  }
  if ("active" in body) {
    if (typeof body.active !== "boolean") return fail("Status inválido.");
    patch.active = body.active;
  }
  if (!Object.keys(patch).length) return fail("Nenhum campo para atualizar.");
  const { data, error } = await ctx.supabase.from("product_categories").update(patch).eq("id", id).select("id, name, active").maybeSingle();
  if (error) return fromDbError(error);
  if (!data) return fail("Categoria não encontrada ou sem permissão.", 404);
  return NextResponse.json(data);
}
