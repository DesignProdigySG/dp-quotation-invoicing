export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      client_billing_addresses: {
        Row: {
          address: string
          client_id: string
          created_at: string
          id: string
          label: string
          owner_id: string
          updated_at: string
        }
        Insert: {
          address: string
          client_id: string
          created_at?: string
          id?: string
          label: string
          owner_id: string
          updated_at?: string
        }
        Update: {
          address?: string
          client_id?: string
          created_at?: string
          id?: string
          label?: string
          owner_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_billing_addresses_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          ai_instructions: string | null
          billing_address: string | null
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string
          default_currency: string
          default_gst_rate: number
          display_currency_preference: string
          id: string
          name: string
          owner_id: string
          updated_at: string
          xero_contact_id: string | null
        }
        Insert: {
          ai_instructions?: string | null
          billing_address?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          default_currency?: string
          default_gst_rate?: number
          display_currency_preference?: string
          id?: string
          name: string
          owner_id: string
          updated_at?: string
          xero_contact_id?: string | null
        }
        Update: {
          ai_instructions?: string | null
          billing_address?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          default_currency?: string
          default_gst_rate?: number
          display_currency_preference?: string
          id?: string
          name?: string
          owner_id?: string
          updated_at?: string
          xero_contact_id?: string | null
        }
        Relationships: []
      }
      gmail_connections: {
        Row: {
          created_at: string
          email: string
          last_checked_at: string | null
          owner_id: string
          po_last_checked_at: string | null
          po_watched_label_id: string | null
          po_watched_label_name: string | null
          processed_label_id: string | null
          refresh_token_encrypted: string
          updated_at: string
          watched_label_id: string | null
          watched_label_name: string | null
        }
        Insert: {
          created_at?: string
          email: string
          last_checked_at?: string | null
          owner_id: string
          po_last_checked_at?: string | null
          po_watched_label_id?: string | null
          po_watched_label_name?: string | null
          processed_label_id?: string | null
          refresh_token_encrypted: string
          updated_at?: string
          watched_label_id?: string | null
          watched_label_name?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          last_checked_at?: string | null
          owner_id?: string
          po_last_checked_at?: string | null
          po_watched_label_id?: string | null
          po_watched_label_name?: string | null
          processed_label_id?: string | null
          refresh_token_encrypted?: string
          updated_at?: string
          watched_label_id?: string | null
          watched_label_name?: string | null
        }
        Relationships: []
      }
      invoice_line_items: {
        Row: {
          description: string
          id: string
          invoice_id: string
          quantity: number
          sort_order: number
          unit_price: number
        }
        Insert: {
          description: string
          id?: string
          invoice_id: string
          quantity?: number
          sort_order?: number
          unit_price?: number
        }
        Update: {
          description?: string
          id?: string
          invoice_id?: string
          quantity?: number
          sort_order?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_line_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          billing_address: string | null
          billing_address_id: string | null
          client_id: string
          created_at: string
          currency: string
          display_currency: string
          due_date: string | null
          exchange_rate: number | null
          gst_applicable: boolean
          gst_rate: number
          id: string
          invoice_date: string
          invoice_number: string | null
          notes: string | null
          owner_id: string
          quotation_id: string | null
          reference: string | null
          status: string
          updated_at: string
          xero_idempotency_key: string | null
          xero_invoice_id: string | null
          xero_push_error: string | null
          xero_pushed_at: string | null
          xero_status: string | null
        }
        Insert: {
          billing_address?: string | null
          billing_address_id?: string | null
          client_id: string
          created_at?: string
          currency?: string
          display_currency?: string
          due_date?: string | null
          exchange_rate?: number | null
          gst_applicable?: boolean
          gst_rate?: number
          id?: string
          invoice_date?: string
          invoice_number?: string | null
          notes?: string | null
          owner_id: string
          quotation_id?: string | null
          reference?: string | null
          status?: string
          updated_at?: string
          xero_idempotency_key?: string | null
          xero_invoice_id?: string | null
          xero_push_error?: string | null
          xero_pushed_at?: string | null
          xero_status?: string | null
        }
        Update: {
          billing_address?: string | null
          billing_address_id?: string | null
          client_id?: string
          created_at?: string
          currency?: string
          display_currency?: string
          due_date?: string | null
          exchange_rate?: number | null
          gst_applicable?: boolean
          gst_rate?: number
          id?: string
          invoice_date?: string
          invoice_number?: string | null
          notes?: string | null
          owner_id?: string
          quotation_id?: string | null
          reference?: string | null
          status?: string
          updated_at?: string
          xero_idempotency_key?: string | null
          xero_invoice_id?: string | null
          xero_push_error?: string | null
          xero_pushed_at?: string | null
          xero_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_billing_address_id_fkey"
            columns: ["billing_address_id"]
            isOneToOne: false
            referencedRelation: "client_billing_addresses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_quotation_id_fkey"
            columns: ["quotation_id"]
            isOneToOne: false
            referencedRelation: "quotations"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string | null
          owner_id: string
          signature_path: string | null
          title: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          full_name?: string | null
          owner_id: string
          signature_path?: string | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          full_name?: string | null
          owner_id?: string
          signature_path?: string | null
          title?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      quotation_line_items: {
        Row: {
          description: string
          id: string
          quantity: number
          quotation_id: string
          sort_order: number
          unit_price: number
        }
        Insert: {
          description: string
          id?: string
          quantity?: number
          quotation_id: string
          sort_order?: number
          unit_price?: number
        }
        Update: {
          description?: string
          id?: string
          quantity?: number
          quotation_id?: string
          sort_order?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "quotation_line_items_quotation_id_fkey"
            columns: ["quotation_id"]
            isOneToOne: false
            referencedRelation: "quotations"
            referencedColumns: ["id"]
          },
        ]
      }
      quotations: {
        Row: {
          billing_address: string | null
          billing_address_id: string | null
          client_id: string
          created_at: string
          currency: string
          display_currency: string
          exchange_rate: number | null
          gst_applicable: boolean
          gst_rate: number
          id: string
          notes: string | null
          owner_id: string
          quote_date: string
          quote_number: string | null
          status: string
          updated_at: string
          valid_until: string | null
        }
        Insert: {
          billing_address?: string | null
          billing_address_id?: string | null
          client_id: string
          created_at?: string
          currency?: string
          display_currency?: string
          exchange_rate?: number | null
          gst_applicable?: boolean
          gst_rate?: number
          id?: string
          notes?: string | null
          owner_id: string
          quote_date?: string
          quote_number?: string | null
          status?: string
          updated_at?: string
          valid_until?: string | null
        }
        Update: {
          billing_address?: string | null
          billing_address_id?: string | null
          client_id?: string
          created_at?: string
          currency?: string
          display_currency?: string
          exchange_rate?: number | null
          gst_applicable?: boolean
          gst_rate?: number
          id?: string
          notes?: string | null
          owner_id?: string
          quote_date?: string
          quote_number?: string | null
          status?: string
          updated_at?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quotations_billing_address_id_fkey"
            columns: ["billing_address_id"]
            isOneToOne: false
            referencedRelation: "client_billing_addresses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      unmatched_email_pos: {
        Row: {
          created_at: string
          id: string
          owner_id: string
          parsed_data: Json
          resolved_at: string | null
          resolved_invoice_id: string | null
          sender_email: string
          sender_name: string | null
          status: string
          subject: string | null
          suggested_client_id: string | null
          suggested_client_source: string | null
          suggested_invoice_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          owner_id: string
          parsed_data: Json
          resolved_at?: string | null
          resolved_invoice_id?: string | null
          sender_email: string
          sender_name?: string | null
          status?: string
          subject?: string | null
          suggested_client_id?: string | null
          suggested_client_source?: string | null
          suggested_invoice_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          owner_id?: string
          parsed_data?: Json
          resolved_at?: string | null
          resolved_invoice_id?: string | null
          sender_email?: string
          sender_name?: string | null
          status?: string
          subject?: string | null
          suggested_client_id?: string | null
          suggested_client_source?: string | null
          suggested_invoice_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "unmatched_email_pos_resolved_invoice_id_fkey"
            columns: ["resolved_invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "unmatched_email_pos_suggested_client_id_fkey"
            columns: ["suggested_client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "unmatched_email_pos_suggested_invoice_id_fkey"
            columns: ["suggested_invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      unmatched_email_quotes: {
        Row: {
          created_at: string
          id: string
          owner_id: string
          parsed_data: Json
          resolved_at: string | null
          resolved_quotation_id: string | null
          sender_email: string
          sender_name: string | null
          status: string
          subject: string | null
          suggested_client_id: string | null
          suggested_client_source: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          owner_id: string
          parsed_data: Json
          resolved_at?: string | null
          resolved_quotation_id?: string | null
          sender_email: string
          sender_name?: string | null
          status?: string
          subject?: string | null
          suggested_client_id?: string | null
          suggested_client_source?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          owner_id?: string
          parsed_data?: Json
          resolved_at?: string | null
          resolved_quotation_id?: string | null
          sender_email?: string
          sender_name?: string | null
          status?: string
          subject?: string | null
          suggested_client_id?: string | null
          suggested_client_source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "unmatched_email_quotes_resolved_quotation_id_fkey"
            columns: ["resolved_quotation_id"]
            isOneToOne: false
            referencedRelation: "quotations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "unmatched_email_quotes_suggested_client_id_fkey"
            columns: ["suggested_client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      xero_connections: {
        Row: {
          connected_at: string | null
          connected_by: string | null
          default_account_code: string | null
          gst_tax_rate: number | null
          gst_tax_type: string | null
          id: number
          no_gst_tax_type: string | null
          refresh_token_encrypted: string | null
          tenant_id: string | null
          tenant_name: string | null
          updated_at: string
        }
        Insert: {
          connected_at?: string | null
          connected_by?: string | null
          default_account_code?: string | null
          gst_tax_rate?: number | null
          gst_tax_type?: string | null
          id?: number
          no_gst_tax_type?: string | null
          refresh_token_encrypted?: string | null
          tenant_id?: string | null
          tenant_name?: string | null
          updated_at?: string
        }
        Update: {
          connected_at?: string | null
          connected_by?: string | null
          default_account_code?: string | null
          gst_tax_rate?: number | null
          gst_tax_type?: string | null
          id?: number
          no_gst_tax_type?: string | null
          refresh_token_encrypted?: string | null
          tenant_id?: string | null
          tenant_name?: string | null
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
