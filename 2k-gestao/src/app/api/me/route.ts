import { NextResponse } from "next/server";
import { fail, fromDbError, getContext } from "@/lib/estoque/http";

export async function GET() {
  const ctx = await getContext();
  if ("error" in ctx) return ctx.error;
  const { data, error } = await ctx.supabase.rpc("get_my_profile");
  if (error) return fromDbError(error);
  const profile = data?.[0];
  if (!profile) return fail("Perfil não encontrado.", 403);
  return NextResponse.json({ id: profile.id, name: profile.name, role: profile.role });
}
