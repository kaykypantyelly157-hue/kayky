export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const method = (init?.method ?? "GET").toUpperCase();
  if (method !== "GET" && typeof navigator !== "undefined" && !navigator.onLine) {
    throw new Error("Sem conexão. Operações de venda, estoque e caixa não podem ser feitas offline.");
  }
  const res = await fetch(url, {
    ...init,
    cache: "no-store",
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && typeof window !== "undefined") window.location.href = "/login";
  if (!res.ok) throw new Error((data as { error?: string }).error ?? "Não foi possível concluir a ação.");
  return data as T;
}
