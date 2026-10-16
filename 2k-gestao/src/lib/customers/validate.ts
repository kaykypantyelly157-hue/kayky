import type { Customer } from "@/types/database";

type CustomerFields = Pick<Customer, "name" | "phone"> &
  Partial<Pick<Customer, "cpf" | "email" | "notes" | "active">>;
type CustomerPatch = Partial<CustomerFields>;
type Result<T> = { data: T } | { error: string };

export function normalizeDigits(value: string) {
  return value.replace(/\D/g, "");
}

export function parseCustomerBody(body: Record<string, unknown>, partial: false): Result<CustomerFields>;
export function parseCustomerBody(body: Record<string, unknown>, partial: true): Result<CustomerPatch>;
export function parseCustomerBody(
  body: Record<string, unknown>,
  partial: boolean
): Result<CustomerFields | CustomerPatch> {
  const out: CustomerPatch = {};
  const has = (key: string) => Object.hasOwn(body, key);
  if (!partial || has("name")) {
    const name = String(body.name ?? "").trim();
    if (!name || name.length > 160) return { error: "Informe o nome (até 160 caracteres)." };
    out.name = name;
  }
  if (!partial || has("phone")) {
    const phone = String(body.phone ?? "").trim();
    const digits = normalizeDigits(phone);
    if (digits.length < 8 || digits.length > 15 || phone.length > 40) return { error: "Informe um telefone válido." };
    out.phone = phone;
  }
  if (has("cpf")) {
    const cpf = String(body.cpf ?? "").trim();
    const digits = normalizeDigits(cpf);
    if (cpf && digits.length !== 11) return { error: "CPF deve conter 11 dígitos." };
    out.cpf = cpf || null;
  }
  if (has("email")) {
    const email = String(body.email ?? "").trim();
    if (email && (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) return { error: "E-mail inválido." };
    out.email = email || null;
  }
  if (has("notes")) {
    const notes = String(body.notes ?? "").trim();
    if (notes.length > 2000) return { error: "Observações excedem 2.000 caracteres." };
    out.notes = notes || null;
  }
  if (has("active")) {
    if (typeof body.active !== "boolean") return { error: "Status inválido." };
    out.active = body.active;
  }
  if (partial && !Object.keys(body).some((key) => ["name", "phone", "cpf", "email", "notes", "active"].includes(key))) {
    return { error: "Nenhum campo para atualizar." };
  }
  if (partial) return { data: out };
  if (!out.name || !out.phone) return { error: "Informe nome e telefone." };
  return { data: { ...out, name: out.name, phone: out.phone } };
}

export async function readCustomerJson(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const value: unknown = await request.json();
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
  } catch {
    return null;
  }
}
