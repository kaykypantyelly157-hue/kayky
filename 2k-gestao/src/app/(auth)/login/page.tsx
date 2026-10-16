"use client";

import { useActionState } from "react";
import { loginAction, type LoginState } from "@/features/auth/actions";

const initialState: LoginState = { error: null };

export default function LoginPage() {
  const [state, action, pending] = useActionState(loginAction, initialState);

  return (
    <main className="grid min-h-screen place-items-center bg-slate-100 p-4">
      <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-7 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-wider text-blue-700">2K Celulares</p>
        <h1 className="mt-2 text-3xl font-bold text-slate-950">2K Gestão</h1>
        <p className="mt-2 text-sm text-slate-600">Entre com seu usuário autorizado.</p>
        <form action={action} className="mt-7 space-y-4">
          <label className="block text-sm font-medium text-slate-700">
            E-mail
            <input name="email" type="email" autoComplete="username" required className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Senha
            <input name="password" type="password" autoComplete="current-password" required className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" />
          </label>
          {state.error && <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700">{state.error}</p>}
          <button disabled={pending} className="w-full rounded-lg bg-slate-950 px-4 py-3 font-semibold text-white disabled:cursor-wait disabled:opacity-60">
            {pending ? "Entrando..." : "Entrar"}
          </button>
        </form>
      </section>
    </main>
  );
}
