import { redirect } from "next/navigation";
import AppShell from "@/components/navigation/AppShell";
import { createClient } from "@/lib/supabase/server";

export default async function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data, error } = await supabase.rpc("get_my_profile");
  const profile = data?.[0];
  if (error || !profile) {
    return <main className="grid min-h-screen place-items-center p-6"><p role="alert">Perfil não encontrado. Contate um administrador.</p></main>;
  }
  if (!profile.active) {
    return <main className="grid min-h-screen place-items-center p-6"><p role="alert">Seu usuário está inativo. Contate um administrador.</p></main>;
  }

  return <AppShell name={profile.name} role={profile.role}>{children}</AppShell>;
}
