import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export function fail(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

/** Cliente Supabase da sessao (cookies) + usuario. Nunca usa service_role. */
export async function getContext() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error) {
    console.error("[estoque] falha ao validar sessão:", error.message);
    return { error: fail("Não foi possível validar sua sessão.", 500) } as const;
  }
  if (!data.user) return { error: fail("Faça login para continuar.", 401) } as const;
  const { data: active, error: profileError } = await supabase.rpc("is_active_user");
  if (profileError) {
    console.error("[estoque] falha ao validar perfil:", profileError.message);
    return { error: fail("Não foi possível validar seu acesso.", 500) } as const;
  }
  if (!active) return { error: fail("Seu usuário está inativo.", 403) } as const;
  return { supabase, user: data.user } as const;
}

type DbError = { code?: string; message: string };

export function fromDbError(err: DbError) {
  const msg = err.message ?? "";
  if (err.code === "23505") return fail("Já existe um registro com os mesmos dados únicos.", 409);
  if (err.code === "23514") return fail("Valor inválido. Confira preços e quantidades.", 400);
  if (err.code === "42501" || /row-level security|permission denied/i.test(msg)) {
    const known = /^[A-Z_]+:\s*(.+)$/.exec(msg);
    return fail(known ? known[1] : "Sem permissão para esta ação.", 403);
  }
  if (err.code === "P0001") return fail(msg.replace(/^[A-Z_]+:\s*/, ""), 400);
  console.error("[estoque] erro de banco:", err.code, msg);
  return fail("Erro inesperado. Tente novamente.", 500);
}
