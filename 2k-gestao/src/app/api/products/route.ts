import { NextResponse } from "next/server";
import { fail, fromDbError, getContext } from "@/lib/estoque/http";
import { isUuid, parseProductBody, readJson } from "@/lib/estoque/validate";

export async function GET(req: Request) {
  const ctx = await getContext();
  if ("error" in ctx) return ctx.error;
  const sp = new URL(req.url).searchParams;

  let query = ctx.supabase.from("products_list").select("*").order("name").limit(
    Math.min(Number(sp.get("limit")) || 500, 1000));

  const status = sp.get("status") ?? "active";
  if (status === "active") query = query.eq("active", true);
  else if (status === "inactive") query = query.eq("active", false);

  const category = sp.get("category");
  if (category) {
    if (!isUuid(category)) return fail("Categoria inválida.");
    query = query.eq("category_id", category);
  }
  if (sp.get("low") === "1") query = query.eq("is_low", true);

  const q = (sp.get("q") ?? "").replace(/[,()%*\\]/g, " ").trim().slice(0, 60);
  if (q) query = query.or(`name.ilike.%${q}%,sku.ilike.%${q}%,brand.ilike.%${q}%,compatible_model.ilike.%${q}%`);

  const { data, error } = await query;
  if (error) return fromDbError(error);
  return NextResponse.json(data);
}

export async function POST(req: Request) {
  const ctx = await getContext();
  if ("error" in ctx) return ctx.error;
  const body = await readJson(req);
  if (!body) return fail("Dados inválidos.");
  const parsed = parseProductBody(body, false);
  if ("error" in parsed) return fail(parsed.error);
  const { sku, name, ...optionalFields } = parsed.data;
  if (typeof sku !== "string" || typeof name !== "string") return fail("SKU e nome são obrigatórios.");
  // current_stock nunca vem do cliente: produto nasce com 0 e recebe saldo via entrada
  const { data, error } = await ctx.supabase.from("products").insert({ sku, name, ...optionalFields }).select("id").single();
  if (error) return fromDbError(error);
  return NextResponse.json(data, { status: 201 });
}
