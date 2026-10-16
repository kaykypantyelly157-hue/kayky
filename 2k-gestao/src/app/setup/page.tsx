export default function SetupPage() {
  return (
    <main className="grid min-h-screen place-items-center p-6">
      <section className="max-w-lg rounded-xl border border-amber-300 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold">Configuração necessária</h1>
        <p className="mt-3 text-slate-700">
          Copie <code>.env.example</code> para <code>.env.local</code> e configure as credenciais públicas do projeto Supabase.
        </p>
      </section>
    </main>
  );
}
