import { NextResponse } from "next/server";
import { fail, fromDbError, getContext } from "@/lib/estoque/http";
import { readJson } from "@/lib/estoque/validate";

export async function GET() {
  const ctx = await getContext();
  if ("error" in ctx) return ctx.error;
  const { data, error } = await ctx.supabase.from("product_categories").select("id, name, active").order("name");
  if (error) return fromDbError(error);
  return NextResponse.json(data);
}

export async function POST(req: Request) {
  const ctx = await getContext();
  if ("error" in ctx) return ctx.error;
  const body = await readJson(req);
  const name = String(body?.name ?? "").trim();
  if (!name || name.length > 60) return fail("Informe o nome da categoria (até 60 caracteres).");
  const { data, error } = await ctx.supabase.from("product_categories").insert({ name }).select("id, name, active").single();
  if (error) return fromDbError(error);
  return NextResponse.json(data, { status: 201 });
}
