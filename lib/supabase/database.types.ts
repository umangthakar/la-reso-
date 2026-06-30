// ============================================================
// Le Rasa Bakery — Supabase generated types
// ------------------------------------------------------------
// NOTE: This file was hand-authored from supabase/sql/01_schema.sql
// because DB credentials are not yet available. Once the keys are
// added, regenerate it with the real CLI to guarantee it stays in
// sync with the live schema:
//
//   npm run gen:types
//
// (which runs: supabase gen types typescript --project-id <ref> --schema public)
//
// The shape below matches the CLI output, so regeneration is a
// drop-in replacement — imports do not need to change.
// ============================================================

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      categories: {
        Row: {
          id: string;
          name: string;
          display_order: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          display_order?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          display_order?: number;
          created_at?: string;
        };
        Relationships: [];
      };
      products: {
        Row: {
          id: string;
          category_id: string | null;
          name: string;
          description: string | null;
          price: number;
          allergens: string[] | null;
          images: string[] | null;
          in_stock: boolean;
          hidden: boolean;
          display_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          category_id?: string | null;
          name: string;
          description?: string | null;
          price: number;
          allergens?: string[] | null;
          images?: string[] | null;
          in_stock?: boolean;
          hidden?: boolean;
          display_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          category_id?: string | null;
          name?: string;
          description?: string | null;
          price?: number;
          allergens?: string[] | null;
          images?: string[] | null;
          in_stock?: boolean;
          hidden?: boolean;
          display_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey";
            columns: ["category_id"];
            referencedRelation: "categories";
            referencedColumns: ["id"];
          },
        ];
      };
      delivery_zones: {
        Row: {
          id: string;
          zone_name: string;
          postcode_pattern: string;
          price: number;
          free_delivery_threshold: number | null;
          active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          zone_name: string;
          postcode_pattern: string;
          price: number;
          free_delivery_threshold?: number | null;
          active?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          zone_name?: string;
          postcode_pattern?: string;
          price?: number;
          free_delivery_threshold?: number | null;
          active?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      delivery_settings: {
        Row: {
          id: number;
          lead_time_days: number;
          max_advance_days: number;
          delivery_days: number[];
          daily_cap: number | null;
          updated_at: string;
        };
        Insert: {
          id?: number;
          lead_time_days?: number;
          max_advance_days?: number;
          delivery_days?: number[];
          daily_cap?: number | null;
          updated_at?: string;
        };
        Update: {
          id?: number;
          lead_time_days?: number;
          max_advance_days?: number;
          delivery_days?: number[];
          daily_cap?: number | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      blocked_dates: {
        Row: {
          id: string;
          blocked_date: string;
          reason: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          blocked_date: string;
          reason?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          blocked_date?: string;
          reason?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      customers: {
        Row: {
          id: string;
          auth_user_id: string | null;
          email: string;
          name: string | null;
          phone: string | null;
          saved_addresses: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          auth_user_id?: string | null;
          email: string;
          name?: string | null;
          phone?: string | null;
          saved_addresses?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          auth_user_id?: string | null;
          email?: string;
          name?: string | null;
          phone?: string | null;
          saved_addresses?: Json;
          created_at?: string;
        };
        Relationships: [];
      };
      orders: {
        Row: {
          id: string;
          tracking_token: string;
          customer_id: string | null;
          customer_name: string;
          customer_email: string;
          customer_phone: string;
          delivery_address: Json;
          zone_id: string | null;
          delivery_charge: number;
          subtotal: number;
          total: number;
          delivery_date: string;
          special_instructions: string | null;
          status: Database["public"]["Enums"]["order_status"];
          stripe_payment_intent_id: string | null;
          payment_status: Database["public"]["Enums"]["payment_status"];
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          tracking_token?: string;
          customer_id?: string | null;
          customer_name: string;
          customer_email: string;
          customer_phone: string;
          delivery_address: Json;
          zone_id?: string | null;
          delivery_charge?: number;
          subtotal: number;
          total: number;
          delivery_date: string;
          special_instructions?: string | null;
          status?: Database["public"]["Enums"]["order_status"];
          stripe_payment_intent_id?: string | null;
          payment_status?: Database["public"]["Enums"]["payment_status"];
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          tracking_token?: string;
          customer_id?: string | null;
          customer_name?: string;
          customer_email?: string;
          customer_phone?: string;
          delivery_address?: Json;
          zone_id?: string | null;
          delivery_charge?: number;
          subtotal?: number;
          total?: number;
          delivery_date?: string;
          special_instructions?: string | null;
          status?: Database["public"]["Enums"]["order_status"];
          stripe_payment_intent_id?: string | null;
          payment_status?: Database["public"]["Enums"]["payment_status"];
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "orders_customer_id_fkey";
            columns: ["customer_id"];
            referencedRelation: "customers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "orders_zone_id_fkey";
            columns: ["zone_id"];
            referencedRelation: "delivery_zones";
            referencedColumns: ["id"];
          },
        ];
      };
      order_items: {
        Row: {
          id: string;
          order_id: string;
          product_id: string | null;
          product_name: string;
          unit_price: number;
          quantity: number;
          line_total: number;
        };
        Insert: {
          id?: string;
          order_id: string;
          product_id?: string | null;
          product_name: string;
          unit_price: number;
          quantity: number;
          line_total: number;
        };
        Update: {
          id?: string;
          order_id?: string;
          product_id?: string | null;
          product_name?: string;
          unit_price?: number;
          quantity?: number;
          line_total?: number;
        };
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey";
            columns: ["order_id"];
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "order_items_product_id_fkey";
            columns: ["product_id"];
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      order_status_history: {
        Row: {
          id: string;
          order_id: string;
          status: string;
          note: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          order_id: string;
          status: string;
          note?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          order_id?: string;
          status?: string;
          note?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "order_status_history_order_id_fkey";
            columns: ["order_id"];
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
        ];
      };
      invoices: {
        Row: {
          id: string;
          order_id: string;
          pdf_url: string;
          invoice_number: string;
          generated_at: string;
        };
        Insert: {
          id?: string;
          order_id: string;
          pdf_url: string;
          invoice_number: string;
          generated_at?: string;
        };
        Update: {
          id?: string;
          order_id?: string;
          pdf_url?: string;
          invoice_number?: string;
          generated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "invoices_order_id_fkey";
            columns: ["order_id"];
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
        ];
      };
      cake_inquiries: {
        Row: {
          id: string;
          customer_name: string;
          customer_email: string;
          customer_phone: string;
          occasion: string | null;
          size_portions: string | null;
          flavour_preferences: string | null;
          special_message: string | null;
          preferred_delivery_date: string | null;
          reference_photo_url: string | null;
          status: Database["public"]["Enums"]["inquiry_status"];
          created_at: string;
        };
        Insert: {
          id?: string;
          customer_name: string;
          customer_email: string;
          customer_phone: string;
          occasion?: string | null;
          size_portions?: string | null;
          flavour_preferences?: string | null;
          special_message?: string | null;
          preferred_delivery_date?: string | null;
          reference_photo_url?: string | null;
          status?: Database["public"]["Enums"]["inquiry_status"];
          created_at?: string;
        };
        Update: {
          id?: string;
          customer_name?: string;
          customer_email?: string;
          customer_phone?: string;
          occasion?: string | null;
          size_portions?: string | null;
          flavour_preferences?: string | null;
          special_message?: string | null;
          preferred_delivery_date?: string | null;
          reference_photo_url?: string | null;
          status?: Database["public"]["Enums"]["inquiry_status"];
          created_at?: string;
        };
        Relationships: [];
      };
      site_settings: {
        Row: {
          id: number;
          hero_image_url: string | null;
          hero_tagline: string | null;
          hero_cta_text: string | null;
          about_story: string | null;
          about_photos: string[] | null;
          opening_hours: Json | null;
          address: string | null;
          phone: string | null;
          email: string | null;
          whatsapp_number: string | null;
          social_links: Json;
          announcement_banner_text: string | null;
          announcement_banner_active: boolean | null;
          updated_at: string;
        };
        Insert: {
          id?: number;
          hero_image_url?: string | null;
          hero_tagline?: string | null;
          hero_cta_text?: string | null;
          about_story?: string | null;
          about_photos?: string[] | null;
          opening_hours?: Json | null;
          address?: string | null;
          phone?: string | null;
          email?: string | null;
          whatsapp_number?: string | null;
          social_links?: Json;
          announcement_banner_text?: string | null;
          announcement_banner_active?: boolean | null;
          updated_at?: string;
        };
        Update: {
          id?: number;
          hero_image_url?: string | null;
          hero_tagline?: string | null;
          hero_cta_text?: string | null;
          about_story?: string | null;
          about_photos?: string[] | null;
          opening_hours?: Json | null;
          address?: string | null;
          phone?: string | null;
          email?: string | null;
          whatsapp_number?: string | null;
          social_links?: Json;
          announcement_banner_text?: string | null;
          announcement_banner_active?: boolean | null;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<never, never>;
    Functions: Record<never, never>;
    Enums: {
      // NOTE: these are CHECK-constraint string unions, not native pg enums.
      // The real `supabase gen types` would type these columns as plain
      // `string`. We surface them as unions here for DX; they are referenced
      // via Database["public"]["Enums"][...] above to stay regen-friendly.
      order_status:
        | "received"
        | "preparing"
        | "out_for_delivery"
        | "delivered"
        | "cancelled";
      payment_status: "pending" | "paid" | "failed" | "refunded";
      inquiry_status: "new" | "quoted" | "converted" | "closed";
    };
    CompositeTypes: Record<never, never>;
  };
};

// ------------------------------------------------------------
// Convenience helpers
// ------------------------------------------------------------
type PublicSchema = Database["public"];

export type Tables<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Row"];
export type TablesInsert<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Insert"];
export type TablesUpdate<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Update"];
export type Enums<T extends keyof PublicSchema["Enums"]> =
  PublicSchema["Enums"][T];

// Frequently-used row aliases
export type Product = Tables<"products">;
export type Category = Tables<"categories">;
export type Order = Tables<"orders">;
export type OrderItem = Tables<"order_items">;
export type OrderStatusHistory = Tables<"order_status_history">;
export type DeliveryZone = Tables<"delivery_zones">;
export type OrderStatus = Enums<"order_status">;
export type PaymentStatus = Enums<"payment_status">;
