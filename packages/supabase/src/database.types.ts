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
      platform_list_plans: {
        Args: Record<PropertyKey, never>
        Returns: {
          archived: boolean
          code: string
          id: string
          kind: string
          max_branches: number | null
          max_companies: number
          max_users: number
          modules: string[]
          name: string
          price_month_cents: number | null
          price_year_cents: number
          subscribers: number
        }[]
      }
      platform_save_plan: {
        Args: {
          p_id: string | null
          p_max_branches: number | null
          p_max_companies: number
          p_max_users: number
          p_modules: string[]
          p_name: string
          p_price_month_cents: number | null
          p_price_year_cents: number
        }
        Returns: string
      }
      platform_archive_plan: { Args: { p_id: string }; Returns: undefined }
      platform_assign_plan: { Args: { p_cycle: string; p_owner: string; p_plan: string }; Returns: undefined }
      platform_get_subscriber: { Args: { p_owner: string }; Returns: Json }
      platform_list_subscribers: {
        Args: Record<PropertyKey, never>
        Returns: {
          billing_email: string | null
          branches_max: number
          companies: number
          country_codes: string[]
          cycle: string
          next_invoice_at: string | null
          owner_email: string | null
          owner_name: string | null
          owner_user_id: string
          plan_id: string
          plan_name: string
          started_at: string
          status: string
          trial_ends_at: string | null
          users_active: number
          users_pending: number
        }[]
      }
      platform_list_invoices: {
        Args: Record<PropertyKey, never>
        Returns: {
          amount_cents: number
          cycle: string
          due_date: string
          id: string
          issued_at: string
          number: string
          owner_email: string | null
          owner_name: string | null
          owner_user_id: string
          paid_at: string | null
          payment_method: string | null
          payment_ref: string | null
          period_end: string
          period_start: string
          plan_name: string
          status: string
        }[]
      }
      platform_run_billing: { Args: Record<PropertyKey, never>; Returns: Json }
      platform_issue_invoice: { Args: { p_due_days?: number; p_owner: string }; Returns: string }
      platform_mark_invoice_paid: {
        Args: { p_id: string; p_method: string; p_paid_on?: string | null; p_ref?: string | null }
        Returns: undefined
      }
      platform_void_invoice: { Args: { p_id: string }; Returns: undefined }
      platform_request_support_access: { Args: { p_company: string; p_hours: number; p_reason: string }; Returns: string }
      platform_cancel_support_request: { Args: { p_id: string }; Returns: undefined }
      platform_end_support_access: { Args: { p_id: string }; Returns: undefined }
      platform_support_view: { Args: { p_grant: string }; Returns: Json }
      platform_list_support_grants: {
        Args: Record<PropertyKey, never>
        Returns: {
          company_id: string
          company_name: string
          company_name_local: string | null
          decided_at: string | null
          expires_at: string | null
          hours: number
          id: string
          owner_name: string | null
          reason: string
          requested_at: string
          requested_by_name: string | null
          status: string
        }[]
      }
      platform_list_log: {
        Args: { p_before?: number | null; p_limit?: number }
        Returns: {
          action: string
          admin_name: string | null
          created_at: string
          details: Json
          id: number
          subject_name: string | null
          subject_user_id: string | null
        }[]
      }
      my_support_grants: {
        Args: Record<PropertyKey, never>
        Returns: {
          decided_at: string | null
          expires_at: string | null
          hours: number
          id: string
          reason: string
          requested_at: string
          status: string
        }[]
      }
      respond_support_access: { Args: { p_approve: boolean; p_id: string }; Returns: undefined }
      end_support_access: { Args: { p_id: string }; Returns: undefined }
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
