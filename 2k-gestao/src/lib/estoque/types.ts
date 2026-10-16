export type Category = { id: string; name: string; active: boolean };

export type Product = {
  id: string; sku: string; name: string;
  category_id: string | null; category_name: string | null;
  brand: string | null; compatible_model: string | null; description: string | null;
  cost_price: number | string; sale_price: number | string;
  current_stock: number; min_stock: number; active: boolean; is_low: boolean;
};

export type MovementType = "entrada" | "ajuste_positivo" | "ajuste_negativo" | "venda" | "cancelamento_venda" | "uso_os" | "estorno_os";

export type Movement = {
  id: string; product_id: string; movement_type: MovementType; quantity: number;
  stock_before: number; stock_after: number; reason: string | null;
  reference_type: string | null; reference_id: string | null;
  created_by: string; created_at: string;
  product: { sku: string; name: string } | null;
  author: Record<string, unknown> | null;
};
