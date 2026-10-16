import type { Movement, MovementType } from "./types";

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
export const brl = (v: number | string | null | undefined) => money.format(Number(v ?? 0));
export const moneyInput = (v: number | string | null | undefined) =>
  v == null ? "" : Number(v).toFixed(2).replace(".", ",");

const dt = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });
export const dateTime = (iso: string) => dt.format(new Date(iso));

export const movementLabel: Record<MovementType, string> = {
  entrada: "Entrada",
  ajuste_positivo: "Ajuste (+)",
  ajuste_negativo: "Ajuste (−)",
  venda: "Venda",
  cancelamento_venda: "Estorno de venda",
  uso_os: "Uso em OS",
  estorno_os: "Estorno de OS",
};

export function authorName(m: Movement): string {
  const a = m.author ?? {};
  const pick = (k: string) => (typeof a[k] === "string" && a[k] ? (a[k] as string) : null);
  return pick("full_name") ?? pick("name") ?? pick("display_name") ?? pick("email") ?? "Usuário";
}
