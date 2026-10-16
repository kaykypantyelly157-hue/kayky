import { NextResponse } from "next/server";
import { fail, fromDbError, getContext } from "@/lib/estoque/http";
import { parseMoney, readJson } from "@/lib/estoque/validate";

export async function POST(request: Request) {
  const ctx = await getContext();
  if ("error" in ctx) return ctx.error;
  const body = await readJson(request);
  if (!body) return fail("Dados inválidos.");
  const action = body.action;
  const note = String(body.note ?? "").trim();
  if (note.length > 500) return fail("Observação muito longa.");
  if (action === "open") {
    const opening = parseMoney(body.opening_balance);
    if (opening === null) return fail("Saldo inicial inválido.");
    const { data, error } = await ctx.supabase.rpc("open_cash_session", { p_opening_balance: opening, p_note: note || null });
    if (error) return fromDbError(error);
    return NextResponse.json(data, { status: 201 });
  }
  if (action === "close") {
    const counted = parseMoney(body.counted_cash);
    if (counted === null) return fail("Valor contado inválido.");
    const { data, error } = await ctx.supabase.rpc("close_cash_session", { p_counted_cash: counted, p_note: note || null });
    if (error) return fromDbError(error);
    return NextResponse.json(data);
  }
  return fail("Ação de caixa inválida.");
}
