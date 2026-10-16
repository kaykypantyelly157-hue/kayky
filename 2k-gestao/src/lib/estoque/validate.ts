export const isUuid = (v: unknown): v is string =>
  typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

/** Dinheiro trafega como string ("12.50"), nunca como float. */
export function parseMoney(v: unknown): string | null {
  const s = String(v ?? "").trim().replace(",", ".");
  return /^\d{1,10}(\.\d{1,2})?$/.test(s) ? s : null;
}

export function parseInt0(v: unknown, max = 1_000_000): number | null {
  const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
  return typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= max ? n : null;
}

export const parsePositiveInt = (v: unknown, max = 1_000_000) => {
  const n = parseInt0(v, max);
  return n !== null && n > 0 ? n : null;
};

const optText = (v: unknown, max: number) => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" ? null : s.length > max ? undefined : s;
};

type ProductWrite = {
  sku?: string;
  name?: string;
  category_id?: string | null;
  brand?: string | null;
  compatible_model?: string | null;
  description?: string | null;
  cost_price?: number | string;
  sale_price?: number | string;
  min_stock?: number;
  active?: boolean;
};

type Parsed = { data: ProductWrite } | { error: string };

/** Valida corpo de produto. partial=true (PATCH) aceita so os campos enviados. */
export function parseProductBody(b: Record<string, unknown>, partial: boolean): Parsed {
  const out: ProductWrite = {};
  const has = (k: string) => k in b;

  if (!partial || has("sku")) {
    const sku = String(b.sku ?? "").trim().toUpperCase();
    if (!sku || sku.length > 40) return { error: "Informe um SKU de até 40 caracteres." };
    out.sku = sku;
  }
  if (!partial || has("name")) {
    const name = String(b.name ?? "").trim();
    if (!name || name.length > 120) return { error: "Informe o nome do produto (até 120 caracteres)." };
    out.name = name;
  }
  if (has("category_id")) {
    if (b.category_id === null || b.category_id === "") {
      out.category_id = null;
    } else if (isUuid(b.category_id)) {
      out.category_id = b.category_id;
    } else {
      return { error: "Categoria inválida." };
    }
  }
  for (const [k, max, label] of [["brand", 60, "Marca"], ["compatible_model", 120, "Modelo compatível"], ["description", 1000, "Descrição"]] as const) {
    if (has(k)) {
      const t = optText(b[k], max);
      if (t === undefined) return { error: `${label} muito longa (máx. ${max} caracteres).` };
      out[k] = t;
    }
  }
  for (const [k, label] of [["cost_price", "Custo"], ["sale_price", "Preço de venda"]] as const) {
    if (!partial || has(k)) {
      const m = parseMoney(b[k] ?? "0");
      if (m === null) return { error: `${label} inválido. Use valores como 12,50.` };
      out[k] = m;
    }
  }
  if (!partial || has("min_stock")) {
    const n = parseInt0(b.min_stock ?? 0);
    if (n === null) return { error: "Estoque mínimo deve ser um número inteiro maior ou igual a zero." };
    out.min_stock = n;
  }
  if (has("active")) {
    if (typeof b.active !== "boolean") return { error: "Status inválido." };
    out.active = b.active;
  }
  if (partial && Object.keys(out).length === 0) return { error: "Nenhum campo para atualizar." };
  return { data: out };
}

export async function readJson(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const b = await req.json();
    return b && typeof b === "object" && !Array.isArray(b) ? (b as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
