import { NextResponse } from "next/server";
import { fromDbError, getContext } from "@/lib/estoque/http";

export async function GET() {
  const ctx = await getContext();
  if ("error" in ctx) return ctx.error;
  const { data, error } = await ctx.supabase.from("profiles").select("id, name").eq("active", true).eq("role", "technician").order("name");
  if (error) return fromDbError(error);
  return NextResponse.json(data);
}
