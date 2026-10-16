import { NextResponse } from "next/server";
import { fail, fromDbError, getContext } from "@/lib/estoque/http";
import type { Customer, Product, Sale, ServiceOrder, StockMovement } from "@/types/database";

type Cell = string | number | boolean | null | undefined;
type ExportData = { headers: string[]; rows: Cell[][] };

function csvCell(value: Cell) {
  let text = value === null || value === undefined ? "" : String(value);
  if (/^\s*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

function csv(data: ExportData) {
  return `\uFEFF${[data.headers, ...data.rows].map((row) => row.map(csvCell).join(";")).join("\r\n")}\r\n`;
}

export async function GET(_request: Request, { params }: { params: Promise<{ entity: string }> }) {
  const { entity } = await params;
  const ctx = await getContext();
  if ("error" in ctx) return ctx.error;
  const { data: profile, error: profileError } = await ctx.supabase.rpc("get_my_profile");
  if (profileError) return fromDbError(profileError);
  const isAdmin = profile?.[0]?.role === "admin";
  let result: ExportData;

  switch (entity) {
    case "products": {
      const response = await ctx.supabase.from("products").select("*").order("name").limit(10000);
      if (response.error) return fromDbError(response.error);
      const rows = response.data;
      result = { headers: ["SKU", "Nome", "Categoria", "Marca", "Modelo compatível", "Custo", "Preço de venda", "Estoque", "Estoque mínimo", "Ativo"], rows: rows.map((item) => [
        item.sku, item.name, item.category_id, item.brand, item.compatible_model, item.cost_price, item.sale_price, item.current_stock, item.min_stock, item.active
      ]) };
      break;
    }
    case "customers": {
      if (!isAdmin) return fail("Exportação de dados pessoais restrita a administradores.", 403);
      const response = await ctx.supabase.from("customers").select("*").order("name").limit(10000);
      if (response.error) return fromDbError(response.error);
      const rows = response.data as Customer[];
      result = { headers: ["Nome", "Telefone", "CPF", "E-mail", "Observações", "Ativo", "Criado em"], rows: rows.map((item) => [
        item.name, item.phone, item.cpf, item.email, item.notes, item.active, item.created_at
      ]) };
      break;
    }
    case "sales": {
      if (!isAdmin) return fail("Exportação financeira restrita a administradores.", 403);
      const response = await ctx.supabase.from("sales").select("*").order("created_at", { ascending: false }).limit(10000);
      if (response.error) return fromDbError(response.error);
      const rows = response.data as Sale[];
      result = { headers: ["Venda", "Status", "Cliente ID", "Subtotal", "Desconto", "Total", "Custo", "Lucro estimado", "Criado em"], rows: rows.map((item) => [
        item.sale_number, item.status, item.customer_id, item.subtotal, item.discount, item.total, item.total_cost, item.estimated_profit, item.created_at
      ]) };
      break;
    }
    case "service-orders": {
      const response = await ctx.supabase.from("service_orders").select("*").order("created_at", { ascending: false }).limit(10000);
      if (response.error) return fromDbError(response.error);
      const rows = response.data as ServiceOrder[];
      result = { headers: ["OS", "Cliente ID", "Aparelho", "Marca/modelo", "Defeito relatado", "Diagnóstico", "Serviço", "Status", "Técnico ID", "Mão de obra", "Peças", "Desconto", "Total", "Criado em"], rows: rows.map((item) => [
        item.order_number, item.customer_id, item.device, item.brand_model, item.reported_issue, item.diagnosis, item.service_description,
        item.status, item.technician_id, item.labor_amount, item.parts_total, item.discount, item.total, item.created_at
      ]) };
      break;
    }
    case "stock-movements": {
      const response = await ctx.supabase.from("stock_movements").select("*").order("created_at", { ascending: false }).limit(10000);
      if (response.error) return fromDbError(response.error);
      const rows = response.data as StockMovement[];
      result = { headers: ["Produto ID", "Tipo", "Quantidade", "Saldo anterior", "Saldo posterior", "Motivo", "Referência", "Data"], rows: rows.map((item) => [
        item.product_id, item.movement_type, item.quantity, item.stock_before, item.stock_after, item.reason, item.reference_type, item.created_at
      ]) };
      break;
    }
    case "cash-movements": {
      if (!isAdmin) return fail("Exportação financeira restrita a administradores.", 403);
      const response = await ctx.supabase.from("cash_movements").select("*").order("created_at", { ascending: false }).limit(10000);
      if (response.error) return fromDbError(response.error);
      result = { headers: ["Caixa ID", "Tipo", "Valor", "Motivo", "Referência", "Referência ID", "Data"], rows: response.data.map((item) => [
        item.cash_session_id, item.movement_type, item.amount, item.reason, item.reference_type, item.reference_id, item.created_at
      ]) };
      break;
    }
    default:
      return fail("Tipo de exportação não encontrado.", 404);
  }

  const filename = `2k-gestao-${entity}-${new Date().toISOString().slice(0, 10)}.csv`;
  return new NextResponse(csv(result), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store"
    }
  });
}
