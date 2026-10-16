import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/types/database";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    if (request.nextUrl.pathname === "/setup") return response;
    return NextResponse.redirect(new URL("/setup", request.url));
  }

  const supabase = createServerClient<Database>(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      }
    }
  });

  const { data: { user } } = await supabase.auth.getUser();
  const pathname = request.nextUrl.pathname;
  const isLogin = pathname === "/login";
  const isProtected = pathname === "/dashboard" || pathname.startsWith("/dashboard/")
    || ["/produtos", "/estoque", "/vendas", "/caixa", "/clientes", "/os", "/configuracoes"].some(
      (route) => pathname === route || pathname.startsWith(`${route}/`)
    )
    || pathname.startsWith("/api/");

  if (!user && isProtected) {
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Faça login para continuar." }, { status: 401 });
    return NextResponse.redirect(new URL("/login", request.url));
  }
  if (user && isLogin) return NextResponse.redirect(new URL("/dashboard", request.url));
  return response;
}
