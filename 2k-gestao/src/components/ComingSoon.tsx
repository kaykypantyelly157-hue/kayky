export default function ComingSoon({ title }: { title: string }) {
  return (
    <section className="mx-auto max-w-4xl p-6">
      <p className="text-sm font-semibold uppercase tracking-wide text-blue-700">2K Gestão</p>
      <h1 className="mt-2 text-2xl font-semibold text-slate-950">{title}</h1>
      <div className="mt-6 rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-600">
        Módulo em construção — disponível na próxima fase.
      </div>
    </section>
  );
}
