import { NextResponse } from "next/server";
import { fail, fromDbError, getContext } from "@/lib/estoque/http";

export async function GET() {
  const ctx = await getContext();
  if ("error" in ctx) return ctx.error;
  const { data: isAdmin, error: roleError } = await ctx.supabase.rpc("is_admin");
  if (roleError) return fromDbError(roleError);
  if (!isAdmin) return fail("Acesso ao caixa restrito a administradores.", 403);
  const { data: session, error: sessionError } = await ctx.supabase.from("cash_sessions")
    .select("*").eq("status", "open").maybeSingle();
  if (sessionError) return fromDbError(sessionError);
  if (!session) return NextResponse.json({ session: null, movements: [] });
  const { data: movements, error } = await ctx.supabase.from("cash_movements")
    .select("*").eq("cash_session_id", session.id).order("created_at", { ascending: false }).limit(100);
  if (error) return fromDbError(error);
  return NextResponse.json({ session, movements });
}
