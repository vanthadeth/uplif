// Generated from the Supabase project schema (Relationships omitted). Regenerate after migrations.
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      branches: {
        Row: {
          company_id: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          name_local: string | null
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          name_local?: string | null
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          name_local?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      companies: {
        Row: {
          country_code: string
          created_at: string
          id: string
          name: string
          name_local: string | null
          updated_at: string
        }
        Insert: {
          country_code: string
          created_at?: string
          id?: string
          name: string
          name_local?: string | null
          updated_at?: string
        }
        Update: {
          country_code?: string
          created_at?: string
          id?: string
          name?: string
          name_local?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      company_currencies: {
        Row: {
          code: string
          company_id: string
          is_home: boolean
        }
        Insert: {
          code: string
          company_id: string
          is_home?: boolean
        }
        Update: {
          code?: string
          company_id?: string
          is_home?: boolean
        }
        Relationships: []
      }
      company_settings: {
        Row: {
          attendance_selfie_retention_days: number
          company_id: string
          cross_branch_stock_visibility: boolean
          updated_at: string
        }
        Insert: {
          attendance_selfie_retention_days?: number
          company_id: string
          cross_branch_stock_visibility?: boolean
          updated_at?: string
        }
        Update: {
          attendance_selfie_retention_days?: number
          company_id?: string
          cross_branch_stock_visibility?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      membership_roles: {
        Row: {
          branch_id: string | null
          company_id: string
          created_at: string
          id: string
          membership_id: string
          role_id: string
        }
        Insert: {
          branch_id?: string | null
          company_id: string
          created_at?: string
          id?: string
          membership_id: string
          role_id: string
        }
        Update: {
          branch_id?: string | null
          company_id?: string
          created_at?: string
          id?: string
          membership_id?: string
          role_id?: string
        }
        Relationships: []
      }
      memberships: {
        Row: {
          company_id: string
          created_at: string
          display_name: string | null
          id: string
          status: Database["public"]["Enums"]["membership_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          display_name?: string | null
          id?: string
          status?: Database["public"]["Enums"]["membership_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          display_name?: string | null
          id?: string
          status?: Database["public"]["Enums"]["membership_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      payment_terms: {
        Row: {
          company_id: string
          days: number
          id: string
          name: string
          name_local: string | null
        }
        Insert: {
          company_id: string
          days: number
          id?: string
          name: string
          name_local?: string | null
        }
        Update: {
          company_id?: string
          days?: number
          id?: string
          name?: string
          name_local?: string | null
        }
        Relationships: []
      }
      permissions: {
        Row: {
          description: string
          key: string
        }
        Insert: {
          description: string
          key: string
        }
        Update: {
          description?: string
          key?: string
        }
        Relationships: []
      }
      platform_admins: {
        Row: {
          created_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          user_id?: string
        }
        Relationships: []
      }
      role_permissions: {
        Row: {
          company_id: string
          data_scope: Database["public"]["Enums"]["data_scope"]
          permission_key: string
          role_id: string
        }
        Insert: {
          company_id: string
          data_scope?: Database["public"]["Enums"]["data_scope"]
          permission_key: string
          role_id: string
        }
        Update: {
          company_id?: string
          data_scope?: Database["public"]["Enums"]["data_scope"]
          permission_key?: string
          role_id?: string
        }
        Relationships: []
      }
      roles: {
        Row: {
          company_id: string
          created_at: string
          id: string
          is_system: boolean
          name: string
          name_local: string | null
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          is_system?: boolean
          name: string
          name_local?: string | null
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          is_system?: boolean
          name?: string
          name_local?: string | null
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
      data_scope: "own" | "branch" | "company"
      membership_status: "active" | "suspended" | "removed"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}
