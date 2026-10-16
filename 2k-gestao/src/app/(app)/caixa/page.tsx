"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api } from "@/lib/estoque/client";
import ExportButton from "@/components/ExportButton";
import { brl, dateTime } from "@/lib/estoque/format";
import type { CashMovement, CashSession } from "@/types/database";

type CashData = { session: CashSession | null; movements: CashMovement[] };
const input = "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm";

export default function CashPage() {
  const [data, setData] = useState<CashData>({ session: null, movements: [] });
  const [role, setRole] = useState("");
  const [opening, setOpening] = useState("0,00");
  const [counted, setCounted] = useState("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [movementType, setMovementType] = useState("entrada");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    api<CashData>("/api/cash").then(setData).catch((reason) => setError(reason instanceof Error ? reason.message : "Erro ao carregar caixa."));
  }, []);
  useEffect(() => {
    api<{ role: string }>("/api/me").then((profile) => setRole(profile.role))
      .catch((reason) => setError(reason instanceof Error ? reason.message : "Erro ao validar permissões."));
  }, []);
  useEffect(() => { if (role === "admin") load(); }, [role, load]);

  async function submit(event: FormEvent<HTMLFormElement>, action: "open" | "close" | "movement") {
    event.preventDefault();
    if (saving) return;
    setSaving(true); setError(null); setNotice(null);
    try {
      if (action === "open") {
        await api("/api/cash/session", { method: "POST", body: JSON.stringify({ action: "open", opening_balance: opening }) });
        setNotice("Caixa aberto.");
      } else if (action === "close") {
        const result = await api<CashSession>("/api/cash/session", { method: "POST", body: JSON.stringify({ action: "close", counted_cash: counted }) });
        setNotice(`Caixa fechado. Diferença: ${brl(result.closing_difference)}.`);
      } else {
        await api("/api/cash/movements", { method: "POST", body: JSON.stringify({ movement_type: movementType, amount, reason }) });
        setNotice("Movimentação registrada."); setAmount(""); setReason("");
      }
      load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível concluir a operação.");
    } finally {
      setSaving(false);
    }
  }

  const cashIn = data.movements.filter((movement) => movement.movement_type === "entrada").reduce((sum, item) => sum + Number(item.amount), 0);
  const cashOut = data.movements.filter((movement) => movement.movement_type !== "entrada").reduce((sum, item) => sum + Number(item.amount), 0);
  const expected = Number(data.session?.opening_balance ?? 0) + cashIn - cashOut;

  if (!role) return <section className="p-6 text-sm text-slate-600">Validando permissões…</section>;
  if (role !== "admin") return <section className="mx-auto max-w-3xl space-y-3 p-6"><h1 className="text-2xl font-semibold">Caixa</h1><p role="alert" className="rounded bg-amber-50 p-4 text-sm text-amber-900">Acesso ao caixa restrito a administradores.</p></section>;

  return (
    <section className="mx-auto max-w-5xl space-y-5 p-4 md:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-sm text-slate-600">Abertura, movimentos e fechamento</p><h1 className="text-2xl font-semibold">Caixa</h1></div><ExportButton entity="cash-movements" /></header>
      {error && <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {notice && <p role="status" className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
      {!data.session ? <div className="rounded-lg border bg-white p-5">
        <p className="mb-3 font-medium">Nenhum caixa aberto.</p>
        {role === "admin" ? <form onSubmit={(event) => submit(event, "open")} className="flex flex-col gap-3 sm:flex-row">
          <label className="flex-1 text-sm">Saldo inicial (R$)<input className={`${input} mt-1`} inputMode="decimal" required value={opening} onChange={(event) => setOpening(event.target.value)} /></label>
          <button disabled={saving} className="self-end rounded bg-slate-950 px-4 py-2 text-white disabled:opacity-50">{saving ? "Abrindo…" : "Abrir caixa"}</button>
        </form> : <p className="text-sm text-slate-600">A abertura do caixa é restrita a administradores.</p>}
      </div> : <>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border bg-white p-4"><p className="text-sm text-slate-600">Saldo inicial</p><p className="text-xl font-semibold">{brl(data.session.opening_balance)}</p></div>
          <div className="rounded-lg border bg-white p-4"><p className="text-sm text-slate-600">Esperado no caixa</p><p className="text-xl font-semibold">{brl(expected)}</p><p className="text-xs text-slate-500">O fechamento calcula o valor novamente no banco.</p></div>
          <div className="rounded-lg border bg-white p-4"><p className="text-sm text-slate-600">Aberto desde</p><p className="text-lg font-semibold">{dateTime(data.session.opened_at)}</p></div>
        </div>
        {role === "admin" ? <div className="grid gap-4 md:grid-cols-2">
          <form onSubmit={(event) => submit(event, "movement")} className="space-y-3 rounded-lg border bg-white p-4">
            <h2 className="font-semibold">Movimentação manual</h2>
            <label className="block text-sm">Tipo<select className={`${input} mt-1`} value={movementType} onChange={(event) => setMovementType(event.target.value)}>
              <option value="entrada">Entrada</option><option value="saida">Saída</option><option value="despesa">Despesa</option><option value="retirada">Retirada</option>
            </select></label>
            <label className="block text-sm">Valor<input className={`${input} mt-1`} required inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} /></label>
            <label className="block text-sm">Motivo<input className={`${input} mt-1`} required maxLength={300} value={reason} onChange={(event) => setReason(event.target.value)} /></label>
            <button disabled={saving} className="rounded bg-slate-900 px-4 py-2 text-white disabled:opacity-50">Registrar</button>
          </form>
          <form onSubmit={(event) => submit(event, "close")} className="space-y-3 rounded-lg border bg-white p-4">
            <h2 className="font-semibold">Fechar caixa</h2>
            <p className="text-sm text-slate-600">Esperado: {brl(expected)}. Informe o dinheiro contado para registrar a diferença.</p>
            <label className="block text-sm">Valor contado (R$)<input className={`${input} mt-1`} required inputMode="decimal" value={counted} onChange={(event) => setCounted(event.target.value)} /></label>
            <button disabled={saving} className="rounded bg-red-700 px-4 py-2 text-white disabled:opacity-50">Fechar caixa</button>
          </form>
        </div> : <p className="rounded bg-amber-50 p-3 text-sm text-amber-900">Somente administradores podem movimentar ou fechar o caixa.</p>}
        <div className="space-y-3"><h2 className="text-lg font-semibold">Movimentos do caixa</h2>
          <ul className="space-y-2">{data.movements.map((movement) => <li key={movement.id} className="flex justify-between gap-3 rounded border bg-white p-3">
            <div><p className="font-medium capitalize">{movement.movement_type.replaceAll("_", " ")}</p><p className="text-xs text-slate-600">{movement.reason} · {dateTime(movement.created_at)}</p></div><span className="font-semibold">{brl(movement.amount)}</span>
          </li>)}
            {data.movements.length === 0 && <li className="rounded border border-dashed p-5 text-center text-sm text-slate-500">Sem movimentos registrados.</li>}
          </ul>
        </div>
      </>}
    </section>
  );
}
