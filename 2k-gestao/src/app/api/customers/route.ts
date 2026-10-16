import { NextResponse } from "next/server";
import { fail, fromDbError, getContext } from "@/lib/estoque/http";
import { normalizeDigits, parseCustomerBody, readCustomerJson } from "@/lib/customers/validate";
import type { Customer } from "@/types/database";

export async function GET(request: Request) {
  const ctx = await getContext();
  if ("error" in ctx) return ctx.error;
  const search = new URL(request.url).searchParams;
  const queryText = (search.get("q") ?? "").trim().slice(0, 80);
  const status = search.get("status") ?? "active";
  let query = ctx.supabase.from("customers").select("*").order("name").limit(100);
  if (status === "active") query = query.eq("active", true);
  else if (status === "inactive") query = query.eq("active", false);
  if (queryText) {
    const digits = normalizeDigits(queryText);
    const escaped = queryText.replace(/[,()%*\\]/g, " ");
    const clauses = [`name.ilike.%${escaped}%`];
    if (digits.length >= 3) {
      clauses.push(`phone_normalized.ilike.%${digits}%`);
      clauses.push(`cpf_normalized.ilike.%${digits}%`);
    }
    query = query.or(clauses.join(","));
  }
  const { data, error } = await query;
  if (error) return fromDbError(error);
  return NextResponse.json(data);
}

export async function POST(request: Request) {
  const ctx = await getContext();
  if ("error" in ctx) return ctx.error;
  const body = await readCustomerJson(request);
  if (!body) return fail("Dados inválidos.");
  const parsed = parseCustomerBody(body, false);
  if ("error" in parsed) return fail(parsed.error);
  const { data, error } = await ctx.supabase.from("customers").insert(parsed.data).select("*").single();
  if (error) return fromDbError(error);
  return NextResponse.json(data satisfies Customer, { status: 201 });
}
