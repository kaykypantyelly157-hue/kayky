"use client";

export default function ExportButton({ entity, label = "Exportar CSV" }: { entity: string; label?: string }) {
  return <a href={`/api/exports/${entity}`} download className="inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50">{label}</a>;
}
