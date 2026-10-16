import { NextResponse } from "next/server";
import { fail, fromDbError, getContext } from "@/lib/estoque/http";
import { isUuid } from "@/lib/estoque/validate";

export async function GET(req: Request) {
  const ctx = await getContext();
  if ("error" in ctx) return ctx.error;
  const sp = new URL(req.url).searchParams;
  let query = ctx.supabase
    .from("stock_movements")
    .select("*, product:products(sku, name), author:profiles(id, name)")
    .order("created_at", { ascending: false })
    .limit(Math.min(Number(sp.get("limit")) || 50, 200));
  const pid = sp.get("product_id");
  if (pid) {
    if (!isUuid(pid)) return fail("Produto inválido.");
    query = query.eq("product_id", pid);
  }
  const { data, error } = await query;
  if (error) return fromDbError(error);
  return NextResponse.json(data);
}
