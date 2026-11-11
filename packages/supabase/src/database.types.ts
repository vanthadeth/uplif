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
      invitations: {
        Row: {
          accepted_at: string | null
          branch_id: string | null
          company_id: string
          created_at: string
          created_by: string
          expires_at: string
          id: string
          label: string | null
          role_id: string
          status: Database["public"]["Enums"]["invitation_status"]
        }
        Insert: never
        Update: never
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
          description_local: string | null
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
      audit_log: {
        Row: {
          action: string
          actor_user_id: string | null
          company_id: string
          created_at: string
          details: Json
          entity_id: string | null
          entity_type: string
          id: string
          membership_id: string | null
        }
        Insert: never
        Update: never
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string
          full_name_local: string | null
          locale: string
          updated_at: string
          user_id: string
        }
        Insert: {
          full_name: string
          full_name_local?: string | null
          locale?: string
          user_id: string
        }
        Update: {
          full_name?: string
          full_name_local?: string | null
          locale?: string
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
      accept_invitation: {
        Args: { p_token: string }
        Returns: Json
      }
      create_invitation: {
        Args: { p_branch_id: string | null; p_label: string; p_role_id: string }
        Returns: Json
      }
      preview_invitation: {
        Args: { p_token: string }
        Returns: {
          company_name: string
          company_name_local: string | null
          expires_at: string
          role_name: string
        }[]
      }
      revoke_invitation: {
        Args: { p_id: string }
        Returns: undefined
      }
      create_company: {
        Args: {
          p_branch_name: string
          p_country_code: string
          p_home_currency: string
          p_name: string
          p_name_local: string
        }
        Returns: Json
      }
      is_platform_admin: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
      my_permissions: {
        Args: Record<PropertyKey, never>
        Returns: {
          data_scope: Database["public"]["Enums"]["data_scope"]
          permission_key: string
        }[]
      }
      list_my_companies: {
        Args: Record<PropertyKey, never>
        Returns: {
          company_id: string
          is_active: boolean
          membership_id: string
          name: string
          name_local: string | null
        }[]
      }
      switch_company: {
        Args: { p_membership_id: string }
        Returns: undefined
      }
    }
    Enums: {
      data_scope: "own" | "branch" | "company"
      invitation_status: "pending" | "accepted" | "revoked"
      membership_status: "active" | "suspended" | "removed"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}
