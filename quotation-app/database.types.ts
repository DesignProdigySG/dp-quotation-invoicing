export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      clients: {
        Row: {
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string
          default_currency: string
          default_gst_rate: number
          id: string
          name: string
          owner_id: string
          updated_at: string
        }
        Insert: {
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          default_currency?: string
          default_gst_rate?: number
          id?: string
          name: string
          owner_id: string
          updated_at?: string
        }
        Update: {
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          default_currency?: string
          default_gst_rate?: number
          id?: string
          name?: string
          owner_id?: string
          updated_at?: string
        }
      }
      quotations: {
        Row: {
          client_id: string
          created_at: string
          currency: string
          gst_rate: number
          id: string
          notes: string | null
          owner_id: string
          quote_date: string
          quote_number: string | null
          status: string
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          currency?: string
          gst_rate?: number
          id?: string
          notes?: string | null
          owner_id: string
          quote_date?: string
          quote_number?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          currency?: string
          gst_rate?: number
          id?: string
          notes?: string | null
          owner_id?: string
          quote_date?: string
          quote_number?: string | null
          status?: string
          updated_at?: string
        }
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
      }
      invoices: {
        Row: {
          client_id: string
          created_at: string
          currency: string
          due_date: string | null
          gst_rate: number
          id: string
          invoice_date: string
          invoice_number: string | null
          notes: string | null
          owner_id: string
          quotation_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          currency?: string
          due_date?: string | null
          gst_rate?: number
          id?: string
          invoice_date?: string
          invoice_number?: string | null
          notes?: string | null
          owner_id: string
          quotation_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          currency?: string
          due_date?: string | null
          gst_rate?: number
          id?: string
          invoice_date?: string
          invoice_number?: string | null
          notes?: string | null
          owner_id?: string
          quotation_id?: string | null
          status?: string
          updated_at?: string
        }
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
      }
    }
  }
}
