import { NextResponse } from "next/server";
import { fromDbError, getContext } from "@/lib/estoque/http";
import { businessDayRange } from "@/lib/timezone";
import type { CashMovement, CashSession, Sale } from "@/types/database";
import type { Product } from "@/lib/estoque/types";

export async function GET() {
  const ctx = await getContext();
  if ("error" in ctx) return ctx.error;
  const { data: profiles, error: profileError } = await ctx.supabase.rpc("get_my_profile");
  if (profileError) return fromDbError(profileError);
  const profile = profiles?.[0];
  if (!profile) return NextResponse.json({ error: "Perfil não encontrado." }, { status: 403 });
  const isAdmin = profile.role === "admin";

  const [openOrders, readyOrders, lowStock] = await Promise.all([
    ctx.supabase.from("service_orders").select("id", { count: "exact", head: true })
      .in("status", ["recebido", "em_analise", "aguardando_aprovacao", "aguardando_peca", "em_manutencao", "pronto"]),
    ctx.supabase.from("service_orders").select("id", { count: "exact", head: true }).eq("status", "pronto"),
    ctx.supabase.from("products_list").select("id,name,sku,current_stock,min_stock").eq("active", true).eq("is_low", true)
      .order("current_stock").limit(10)
  ]);
  for (const result of [openOrders, readyOrders, lowStock]) {
    if (result.error) return fromDbError(result.error);
  }

  let todayMetrics: { salesCount: number; revenue: number; estimatedProfit: number } | null = null;
  let cash: { session: CashSession | null; expected: number | null } | null = null;
  let movements: CashMovement[] = [];
  let recentSales: Sale[] = [];
  if (isAdmin) {
    const { start, end } = businessDayRange();
    const [today, cashSummary, salesResult] = await Promise.all([
      ctx.supabase.from("sales").select("id,total,estimated_profit").eq("status", "completed")
        .gte("created_at", start).lt("created_at", end),
      ctx.supabase.rpc("get_open_cash_summary"),
      ctx.supabase.from("sales").select("*").order("created_at", { ascending: false }).limit(8)
    ]);
    for (const result of [today, cashSummary, salesResult]) {
      if (result.error) return fromDbError(result.error);
    }
    const salesToday = today.data as Pick<Sale, "id" | "total" | "estimated_profit">[];
    todayMetrics = {
      salesCount: salesToday.length,
      revenue: salesToday.reduce((sum, sale) => sum + Number(sale.total), 0),
      estimatedProfit: salesToday.reduce((sum, sale) => sum + Number(sale.estimated_profit), 0)
    };
    recentSales = salesResult.data as Sale[];
    const openCash = cashSummary.data?.[0] ?? null;
    const session = openCash ? openCash.session as CashSession : null;
    cash = { session, expected: openCash ? Number(openCash.expected) : null };
    if (session) {
      const result = await ctx.supabase.from("cash_movements").select("*")
        .eq("cash_session_id", session.id).order("created_at", { ascending: false }).limit(8);
      if (result.error) return fromDbError(result.error);
      movements = result.data;
    }
  }

  return NextResponse.json({
    today: todayMetrics,
    cash,
    orders: {
      open: openOrders.count ?? 0,
      ready: readyOrders.count ?? 0
    },
    lowStock: lowStock.data as Pick<Product, "id" | "name" | "sku" | "current_stock" | "min_stock">[],
    recentSales,
    recentCashMovements: movements
  }, { headers: { "Cache-Control": "no-store" } });
}
