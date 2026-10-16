"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type LoginState = { error: string | null };

export async function loginAction(_previous: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "Informe e-mail e senha." };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: "E-mail ou senha inválidos." };

  const { data, error: profileError } = await supabase.rpc("get_my_profile");
  const profile = data?.[0];
  if (profileError || !profile) {
    await supabase.auth.signOut();
    return { error: "Perfil não encontrado. Contate um administrador." };
  }
  if (!profile.active) {
    await supabase.auth.signOut();
    return { error: "Seu usuário está inativo. Contate um administrador." };
  }

  redirect("/dashboard");
}

export async function logoutAction() {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut();
  if (error) throw new Error("Não foi possível encerrar a sessão.");
  redirect("/login");
}
