export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type Relationship<
  ForeignKeyName extends string,
  Columns extends string[],
  ReferencedRelation extends string,
  ReferencedColumns extends string[]
> = {
  foreignKeyName: ForeignKeyName;
  columns: Columns;
  isOneToOne: false;
  referencedRelation: ReferencedRelation;
  referencedColumns: ReferencedColumns;
};

export type Profile = {
  id: string;
  name: string;
  role: "admin" | "technician";
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type ProductCategory = {
  id: string;
  name: string;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type Product = {
  id: string;
  sku: string;
  name: string;
  category_id: string | null;
  brand: string | null;
  compatible_model: string | null;
  description: string | null;
  cost_price: number;
  sale_price: number;
  current_stock: number;
  min_stock: number;
  active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type StockMovement = {
  id: string;
  product_id: string;
  movement_type: "entrada" | "ajuste_positivo" | "ajuste_negativo" | "venda" | "cancelamento_venda" | "uso_os" | "estorno_os";
  quantity: number;
  stock_before: number;
  stock_after: number;
  reason: string | null;
  reference_type: string | null;
  reference_id: string | null;
  created_by: string;
  created_at: string;
};

export type CashSession = {
  id: string;
  status: "open" | "closed";
  opening_balance: number;
  opened_by: string;
  opened_at: string;
  opening_note: string | null;
  closing_expected: number | null;
  closing_counted: number | null;
  closing_difference: number | null;
  closed_by: string | null;
  closed_at: string | null;
  closing_note: string | null;
};

export type Sale = {
  id: string;
  sale_number: number;
  cash_session_id: string;
  customer_id: string | null;
  status: "completed" | "cancelled";
  subtotal: number;
  discount: number;
  total: number;
  total_cost: number;
  estimated_profit: number;
  created_by: string;
  created_at: string;
  cancelled_by: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
};

export type CashMovement = {
  id: string;
  cash_session_id: string;
  movement_type: "entrada" | "saida" | "despesa" | "retirada" | "reversao_venda";
  amount: number;
  reason: string;
  payment_method: "dinheiro";
  sale_id: string | null;
  reference_type: "sale" | "service_order" | null;
  reference_id: string | null;
  created_by: string;
  created_at: string;
};

export type ServiceOrderStatus =
  | "recebido" | "em_analise" | "aguardando_aprovacao" | "aguardando_peca"
  | "em_manutencao" | "pronto" | "entregue" | "cancelado";

export type ServiceOrder = {
  id: string;
  order_number: number;
  customer_id: string;
  device: string;
  brand_model: string | null;
  reported_issue: string;
  diagnosis: string | null;
  service_description: string | null;
  observations: string | null;
  technician_id: string | null;
  labor_amount: number;
  parts_total: number;
  discount: number;
  total: number;
  status: ServiceOrderStatus;
  created_by: string;
  created_at: string;
  updated_at: string;
  ready_at: string | null;
  delivered_at: string | null;
  cancelled_at: string | null;
};

export type ServiceOrderItem = {
  id: string;
  service_order_id: string;
  product_id: string;
  product_name: string;
  sku: string;
  quantity: number;
  unit_price: number;
  unit_cost: number;
  line_total: number;
  created_by: string;
  created_at: string;
  reversed_by: string | null;
  reversed_at: string | null;
};

export type Customer = {
  id: string;
  name: string;
  phone: string;
  phone_normalized: string;
  cpf: string | null;
  cpf_normalized: string | null;
  email: string | null;
  notes: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type ProductListRow = Product & {
  category_name: string | null;
  is_low: boolean | null;
};

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: { id: string; name: string; role?: Profile["role"]; active?: boolean; created_at?: string; updated_at?: string };
        Update: { name?: string; role?: Profile["role"]; active?: boolean; updated_at?: string };
        Relationships: [];
      };
      product_categories: {
        Row: ProductCategory;
        Insert: { id?: string; name: string; active?: boolean; created_at?: string; updated_at?: string };
        Update: { name?: string; active?: boolean; updated_at?: string };
        Relationships: [];
      };
      products: {
        Row: Product;
        Insert: {
          id?: string; sku: string; name: string; category_id?: string | null;
          brand?: string | null; compatible_model?: string | null; description?: string | null;
          cost_price?: number | string; sale_price?: number | string; min_stock?: number; active?: boolean;
          created_by?: string | null; created_at?: string; updated_at?: string;
        };
        Update: {
          sku?: string; name?: string; category_id?: string | null; brand?: string | null;
          compatible_model?: string | null; description?: string | null; cost_price?: number | string;
          sale_price?: number | string; min_stock?: number; active?: boolean; updated_at?: string;
        };
        Relationships: [
          Relationship<"products_category_id_fkey", ["category_id"], "product_categories", ["id"]>
        ];
      };
      stock_movements: {
        Row: StockMovement;
        Insert: {
          id?: string; product_id: string; movement_type: StockMovement["movement_type"];
          quantity: number; stock_before: number; stock_after: number; reason?: string | null;
          reference_type?: string | null; reference_id?: string | null; created_by: string; created_at?: string;
        };
        Update: never;
        Relationships: [
          Relationship<"stock_movements_product_id_fkey", ["product_id"], "products", ["id"]>,
          Relationship<"stock_movements_created_by_fkey", ["created_by"], "profiles", ["id"]>
        ];
      };
      customers: {
        Row: Customer;
        Insert: {
          id?: string; name: string; phone: string; cpf?: string | null; email?: string | null;
          notes?: string | null; active?: boolean; created_at?: string; updated_at?: string;
        };
        Update: {
          name?: string; phone?: string; cpf?: string | null; email?: string | null;
          notes?: string | null; active?: boolean; updated_at?: string;
        };
        Relationships: [];
      };
      cash_sessions: {
        Row: CashSession;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      sales: {
        Row: Sale;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      sale_items: {
        Row: {
          id: string; sale_id: string; product_id: string; product_name: string; sku: string;
          quantity: number; unit_price: number; unit_cost: number; line_total: number; created_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      sale_payments: {
        Row: { id: string; sale_id: string; method: "dinheiro" | "pix" | "debito" | "credito"; amount: number; created_at: string };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      cash_movements: {
        Row: CashMovement;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      sales_history: {
        Row: { id: string; sale_id: string; event: "finalized" | "cancelled"; details: string | null; created_by: string; created_at: string };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      service_orders: {
        Row: ServiceOrder;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      service_order_items: {
        Row: ServiceOrderItem;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      service_order_history: {
        Row: {
          id: string; service_order_id: string; previous_status: ServiceOrderStatus | null;
          new_status: ServiceOrderStatus; event: string; details: string | null; created_by: string; created_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
    };
    Views: {
      products_list: {
        Row: ProductListRow;
        Relationships: [
          Relationship<"products_category_id_fkey", ["category_id"], "product_categories", ["id"]>
        ];
      };
    };
    Functions: {
      is_active_user: { Args: Record<PropertyKey, never>; Returns: boolean };
      is_admin: { Args: Record<PropertyKey, never>; Returns: boolean };
      get_my_profile: { Args: Record<PropertyKey, never>; Returns: Profile[] };
      add_stock: {
        Args: { p_product_id: string; p_quantity: number; p_reason?: string | null };
        Returns: StockMovement;
      };
      adjust_stock: {
        Args: { p_product_id: string; p_delta: number; p_reason: string };
        Returns: StockMovement;
      };
      apply_stock_change: {
        Args: {
          p_product_id: string; p_signed_qty: number; p_type: string; p_reason: string;
          p_ref_type?: string | null; p_ref_id?: string | null;
        };
        Returns: StockMovement;
      };
      finalize_sale: {
        Args: { p_customer_id?: string | null; p_discount: number | string; p_items: Json; p_payments: Json };
        Returns: Json;
      };
      cancel_sale: { Args: { p_sale_id: string; p_reason: string }; Returns: Json };
      open_cash_session: { Args: { p_opening_balance: number | string; p_note?: string | null }; Returns: Json };
      close_cash_session: { Args: { p_counted_cash: number | string; p_note?: string | null }; Returns: Json };
      add_cash_movement: {
        Args: { p_movement_type: string; p_amount: number | string; p_reason: string };
        Returns: Json;
      };
      create_service_order: {
        Args: {
          p_customer_id: string; p_device: string; p_brand_model: string | null; p_reported_issue: string;
          p_technician_id?: string | null; p_labor_amount?: number | string; p_observations?: string | null;
        };
        Returns: Json;
      };
      update_service_order: {
        Args: {
          p_service_order_id: string; p_diagnosis: string | null; p_service_description: string | null;
          p_observations: string | null; p_technician_id: string | null;
          p_labor_amount: number | string; p_discount: number | string;
        };
        Returns: Json;
      };
      change_service_order_status: {
        Args: { p_service_order_id: string; p_new_status: string; p_details?: string | null };
        Returns: Json;
      };
      add_service_order_item: {
        Args: { p_service_order_id: string; p_product_id: string; p_quantity: number };
        Returns: Json;
      };
      remove_service_order_item: { Args: { p_service_order_id: string; p_item_id: string }; Returns: Json };
      get_open_cash_summary: { Args: Record<PropertyKey, never>; Returns: { session: Json; expected: number }[] };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
