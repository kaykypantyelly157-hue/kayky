import { NextResponse } from "next/server";
import { fail, fromDbError, getContext } from "@/lib/estoque/http";
import { parseMoney, readJson } from "@/lib/estoque/validate";

const movementTypes = new Set(["entrada", "saida", "despesa", "retirada"]);

export async function POST(request: Request) {
  const ctx = await getContext();
  if ("error" in ctx) return ctx.error;
  const body = await readJson(request);
  if (!body) return fail("Dados inválidos.");
  const amount = parseMoney(body.amount);
  const reason = String(body.reason ?? "").trim();
  if (typeof body.movement_type !== "string" || !movementTypes.has(body.movement_type)) return fail("Tipo de movimentação inválido.");
  if (amount === null || Number(amount) <= 0) return fail("Informe um valor maior que zero.");
  if (!reason || reason.length > 300) return fail("Informe um motivo de até 300 caracteres.");
  const { data, error } = await ctx.supabase.rpc("add_cash_movement", {
    p_movement_type: body.movement_type, p_amount: amount, p_reason: reason
  });
  if (error) return fromDbError(error);
  return NextResponse.json(data, { status: 201 });
}
