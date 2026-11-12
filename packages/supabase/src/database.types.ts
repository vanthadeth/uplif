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
      departments: {
        Row: {
          company_id: string
          created_at: string
          head_employee_id: string | null
          id: string
          is_active: boolean
          name: string
          name_local: string | null
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          head_employee_id?: string | null
          id?: string
          is_active?: boolean
          name: string
          name_local?: string | null
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          head_employee_id?: string | null
          id?: string
          is_active?: boolean
          name?: string
          name_local?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      positions: {
        Row: {
          company_id: string
          created_at: string
          default_role_id: string | null
          department_id: string | null
          id: string
          is_active: boolean
          name: string
          name_local: string | null
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          default_role_id?: string | null
          department_id?: string | null
          id?: string
          is_active?: boolean
          name: string
          name_local?: string | null
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          default_role_id?: string | null
          department_id?: string | null
          id?: string
          is_active?: boolean
          name?: string
          name_local?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      employees: {
        Row: {
          branch_id: string | null
          company_id: string
          created_at: string
          department_id: string | null
          employee_no: string | null
          employment_date: string | null
          end_date: string | null
          id: string
          membership_id: string | null
          name: string
          name_local: string | null
          position_id: string | null
          reports_to_id: string | null
          status: Database["public"]["Enums"]["employee_status"]
          updated_at: string
        }
        Insert: {
          branch_id?: string | null
          company_id: string
          created_at?: string
          department_id?: string | null
          employee_no?: string | null
          employment_date?: string | null
          end_date?: string | null
          id?: string
          membership_id?: string | null
          name: string
          name_local?: string | null
          position_id?: string | null
          reports_to_id?: string | null
          status?: Database["public"]["Enums"]["employee_status"]
          updated_at?: string
        }
        Update: {
          branch_id?: string | null
          company_id?: string
          created_at?: string
          department_id?: string | null
          employee_no?: string | null
          employment_date?: string | null
          end_date?: string | null
          id?: string
          membership_id?: string | null
          name?: string
          name_local?: string | null
          position_id?: string | null
          reports_to_id?: string | null
          status?: Database["public"]["Enums"]["employee_status"]
          updated_at?: string
        }
        Relationships: []
      }
      membership_permission_overrides: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          data_scope: Database["public"]["Enums"]["data_scope"] | null
          effect: Database["public"]["Enums"]["override_effect"]
          expires_at: string | null
          id: string
          membership_id: string
          permission_key: string
          reason: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          data_scope?: Database["public"]["Enums"]["data_scope"] | null
          effect: Database["public"]["Enums"]["override_effect"]
          expires_at?: string | null
          id?: string
          membership_id: string
          permission_key: string
          reason: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          data_scope?: Database["public"]["Enums"]["data_scope"] | null
          effect?: Database["public"]["Enums"]["override_effect"]
          expires_at?: string | null
          id?: string
          membership_id?: string
          permission_key?: string
          reason?: string
          updated_at?: string
        }
        Relationships: []
      }
      branches: {
        Row: {
          timezone: string | null
          company_id: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          name_local: string | null
          updated_at: string
        }
        Insert: {
          timezone?: string | null
          company_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          name_local?: string | null
          updated_at?: string
        }
        Update: {
          timezone?: string | null
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
          timezone: string
          work_setup_done: boolean
          attendance_selfie_retention_days: number
          company_id: string
          cross_branch_stock_visibility: boolean
          updated_at: string
        }
        Insert: {
          timezone?: string
          work_setup_done?: boolean
          attendance_selfie_retention_days?: number
          company_id: string
          cross_branch_stock_visibility?: boolean
          updated_at?: string
        }
        Update: {
          timezone?: string
          work_setup_done?: boolean
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
          employee_record_id: string | null
          expires_at: string
          id: string
          label: string | null
          note: string | null
          overrides: Json
          role_id: string
          roles: Json
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
      work_schedules: {
        Row: { company_id: string; created_at: string; id: string; is_active: boolean; name: string; name_local: string | null; updated_at: string }
        Insert: { company_id: string; created_at?: string; id?: string; is_active?: boolean; name: string; name_local?: string | null; updated_at?: string }
        Update: { company_id?: string; created_at?: string; id?: string; is_active?: boolean; name?: string; name_local?: string | null; updated_at?: string }
        Relationships: []
      }
      work_schedule_versions: {
        Row: { company_id: string; created_at: string; earliest_clock_in_min: number; grace_early_min: number; grace_late_min: number; half_day_late_min: number; id: string; overtime_after_min: number; overtime_needs_approval: boolean; schedule_id: string; updated_at: string; valid_from: string }
        Insert: { company_id: string; created_at?: string; earliest_clock_in_min?: number; grace_early_min?: number; grace_late_min?: number; half_day_late_min?: number; id?: string; overtime_after_min?: number; overtime_needs_approval?: boolean; schedule_id: string; updated_at?: string; valid_from: string }
        Update: { company_id?: string; created_at?: string; earliest_clock_in_min?: number; grace_early_min?: number; grace_late_min?: number; half_day_late_min?: number; id?: string; overtime_after_min?: number; overtime_needs_approval?: boolean; schedule_id?: string; updated_at?: string; valid_from?: string }
        Relationships: []
      }
      work_schedule_days: {
        Row: { break_min: number; company_id: string; day_kind: Database["public"]["Enums"]["schedule_day_kind"]; end_time: string | null; start_time: string | null; version_id: string; weekday: number }
        Insert: { break_min?: number; company_id: string; day_kind: Database["public"]["Enums"]["schedule_day_kind"]; end_time?: string | null; start_time?: string | null; version_id: string; weekday: number }
        Update: { break_min?: number; company_id?: string; day_kind?: Database["public"]["Enums"]["schedule_day_kind"]; end_time?: string | null; start_time?: string | null; version_id?: string; weekday?: number }
        Relationships: []
      }
      work_schedule_assignments: {
        Row: { company_id: string; created_at: string; created_by: string | null; effective_from: string; id: string; schedule_id: string | null; scope: Database["public"]["Enums"]["assignment_scope"]; target_id: string | null; updated_at: string }
        Insert: { company_id: string; created_at?: string; created_by?: string | null; effective_from: string; id?: string; schedule_id?: string | null; scope: Database["public"]["Enums"]["assignment_scope"]; target_id?: string | null; updated_at?: string }
        Update: { company_id?: string; created_at?: string; created_by?: string | null; effective_from?: string; id?: string; schedule_id?: string | null; scope?: Database["public"]["Enums"]["assignment_scope"]; target_id?: string | null; updated_at?: string }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      save_work_schedule: {
        Args: { p_schedule_id: string | null; p_name: string; p_name_local: string | null; p_effective_from: string | null; p_rules: Json; p_days: Json }
        Returns: string
      }
      set_work_schedule_active: {
        Args: { p_schedule_id: string; p_active: boolean }
        Returns: undefined
      }
      assign_work_schedule: {
        Args: { p_scope: Database["public"]["Enums"]["assignment_scope"]; p_target_id: string | null; p_schedule_id: string | null; p_effective_from: string }
        Returns: string
      }
      remove_work_assignment: {
        Args: { p_assignment_id: string }
        Returns: undefined
      }
      setup_working_time: {
        Args: { p_pattern: string }
        Returns: string
      }
      employee_work_days: {
        Args: { p_employee_id: string; p_from: string; p_days?: number }
        Returns: { day: string; day_kind: string; schedule_id: string | null; source: Database["public"]["Enums"]["assignment_scope"] | null; start_time: string | null; end_time: string | null; break_min: number | null; hours: number }[]
      }
      work_schedule_week_hours: {
        Args: Record<string, never>
        Returns: { version_id: string; hours: number }[]
      }
      link_employee: {
        Args: { p_employee_id: string; p_membership_id: string | null }
        Returns: undefined
      }
      set_permission_override: {
        Args: { p_expires_at?: string | null; p_membership_id: string; p_permission_key: string; p_effect: string; p_reason: string; p_scope: Database["public"]["Enums"]["data_scope"] | null }
        Returns: string
      }
      clear_permission_override: {
        Args: { p_membership_id: string; p_permission_key: string }
        Returns: undefined
      }
      accept_invitation: {
        Args: { p_token: string }
        Returns: Json
      }
      create_invite: {
        Args: { p_days?: number; p_employee_id: string; p_note?: string | null; p_overrides?: Json; p_roles: Json }
        Returns: Json
      }
      replace_invite: {
        Args: { p_days?: number; p_id: string }
        Returns: Json
      }
      invite_seats: {
        Args: Record<PropertyKey, never>
        Returns: Json
      }
      preview_invitation: {
        Args: { p_token: string }
        Returns: {
          state: string
          company_name: string
          company_name_local: string | null
          employee_name: string | null
          employee_name_local: string | null
          position_name: string | null
          position_name_local: string | null
          access: Json | null
          invited_by: string | null
          note: string | null
          expires_at: string | null
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
      my_sign_in_methods: {
        Args: Record<PropertyKey, never>
        Returns: Json
      }
      start_telegram_link: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      unlink_telegram: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      my_account_lock: {
        Args: Record<PropertyKey, never>
        Returns: {
          locked: boolean
          reason: string | null
          is_owner: boolean
          status: string
          trial_ends_at: string | null
          requested_plan: string | null
          requested_cycle: string | null
          requested_at: string | null
        }[]
      }
      list_available_plans: {
        Args: Record<PropertyKey, never>
        Returns: {
          id: string
          name: string
          price_month_cents: number | null
          price_year_cents: number
          max_companies: number
          max_branches: number | null
          max_users: number
          modules: string[]
        }[]
      }
      request_plan: { Args: { p_plan: string; p_cycle: string }; Returns: undefined }
      platform_extend_trial: { Args: { p_owner: string; p_days: number }; Returns: undefined }
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
      data_scope: "own" | "team" | "branch" | "company"
      employee_status: "active" | "on_leave" | "left"
      override_effect: "grant" | "deny"
      schedule_day_kind: "full" | "half" | "off"
      assignment_scope: "company" | "branch" | "department" | "employee"
      invitation_status: "pending" | "accepted" | "revoked"
      membership_status: "active" | "suspended" | "removed"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}
