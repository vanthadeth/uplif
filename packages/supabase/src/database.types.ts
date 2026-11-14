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
      leave_types: {
        Row: {
          active: boolean
          annual_days: number | null
          code: string
          company_id: string
          created_at: string
          id: string
          name: string
          name_local: string | null
          paid: boolean
          updated_at: string
        }
        Insert: {
          active?: boolean
          annual_days?: number | null
          code: string
          company_id: string
          created_at?: string
          id?: string
          name: string
          name_local?: string | null
          paid?: boolean
          updated_at?: string
        }
        Update: {
          active?: boolean
          annual_days?: number | null
          code?: string
          company_id?: string
          created_at?: string
          id?: string
          name?: string
          name_local?: string | null
          paid?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      learn_tests: {
        Row: {
          id: string
          company_id: string
          title: string
          title_local: string | null
          pass_percent: number
          retake_days: number
          archived: boolean
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          company_id?: string
          title?: string
          title_local?: string | null
          pass_percent?: number
          retake_days?: number
          archived?: boolean
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          company_id?: string
          title?: string
          title_local?: string | null
          pass_percent?: number
          retake_days?: number
          archived?: boolean
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      learn_questions: {
        Row: {
          id: string
          company_id: string
          test_id: string
          position: number
          prompt: string
          prompt_local: string | null
        }
        Insert: {
          id?: string
          company_id?: string
          test_id?: string
          position?: number
          prompt?: string
          prompt_local?: string | null
        }
        Update: {
          id?: string
          company_id?: string
          test_id?: string
          position?: number
          prompt?: string
          prompt_local?: string | null
        }
        Relationships: []
      }
      learn_options: {
        Row: {
          id: string
          company_id: string
          question_id: string
          position: number
          label: string
          label_local: string | null
          is_correct: boolean
        }
        Insert: {
          id?: string
          company_id?: string
          question_id?: string
          position?: number
          label?: string
          label_local?: string | null
          is_correct?: boolean
        }
        Update: {
          id?: string
          company_id?: string
          question_id?: string
          position?: number
          label?: string
          label_local?: string | null
          is_correct?: boolean
        }
        Relationships: []
      }
      learn_attempts: {
        Row: {
          id: string
          company_id: string
          test_id: string
          employee_id: string
          correct: number
          total: number
          score_percent: number
          passed: boolean
          is_retake: boolean
          taken_at: string
        }
        Insert: {
          id?: string
          company_id?: string
          test_id?: string
          employee_id?: string
          correct?: number
          total?: number
          score_percent?: number
          passed?: boolean
          is_retake?: boolean
          taken_at?: string
        }
        Update: {
          id?: string
          company_id?: string
          test_id?: string
          employee_id?: string
          correct?: number
          total?: number
          score_percent?: number
          passed?: boolean
          is_retake?: boolean
          taken_at?: string
        }
        Relationships: []
      }
      kpis: {
        Row: {
          id: string
          company_id: string
          position_id: string
          name: string
          name_local: string | null
          weight: number
          active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          company_id?: string
          position_id?: string
          name?: string
          name_local?: string | null
          weight?: number
          active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          company_id?: string
          position_id?: string
          name?: string
          name_local?: string | null
          weight?: number
          active?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      position_descriptions: {
        Row: {
          company_id: string
          position_id: string
          summary: string | null
          summary_local: string | null
          duties: string | null
          duties_local: string | null
          updated_at: string
        }
        Insert: Record<string, never>
        Update: Record<string, never>
        Relationships: []
      }
      career_events: {
        Row: {
          id: string
          company_id: string
          employee_id: string
          kind: Database["public"]["Enums"]["career_event_kind"]
          event_date: string
          from_name: string | null
          from_name_local: string | null
          to_name: string
          to_name_local: string | null
          note: string | null
          created_at: string
        }
        Insert: Record<string, never>
        Update: Record<string, never>
        Relationships: []
      }
      notifications: {
        Row: { id: string; company_id: string; employee_id: string; kind: string; data: Record<string, unknown>; created_at: string; read_at: string | null }
        Insert: Record<string, never>
        Update: Record<string, never>
        Relationships: []
      }
      notification_settings: {
        Row: { company_id: string; employee_id: string; in_app: boolean; updated_at: string }
        Insert: Record<string, never>
        Update: Record<string, never>
        Relationships: []
      }
      performance_reviews: {
        Row: {
          id: string
          company_id: string
          employee_id: string
          period: string
          overall_percent: number
          comment: string | null
          reviewed_by: string | null
          reviewed_at: string
        }
        Insert: {
          id?: string
          company_id?: string
          employee_id?: string
          period?: string
          overall_percent?: number
          comment?: string | null
          reviewed_by?: string | null
          reviewed_at?: string
        }
        Update: {
          id?: string
          company_id?: string
          employee_id?: string
          period?: string
          overall_percent?: number
          comment?: string | null
          reviewed_by?: string | null
          reviewed_at?: string
        }
        Relationships: []
      }
      performance_scores: {
        Row: {
          company_id: string
          review_id: string
          position: number
          kpi_name: string
          kpi_name_local: string | null
          weight: number
          score: number
        }
        Insert: {
          company_id?: string
          review_id?: string
          position?: number
          kpi_name?: string
          kpi_name_local?: string | null
          weight?: number
          score?: number
        }
        Update: {
          company_id?: string
          review_id?: string
          position?: number
          kpi_name?: string
          kpi_name_local?: string | null
          weight?: number
          score?: number
        }
        Relationships: []
      }
      leave_requests: {
        Row: {
          company_id: string
          created_at: string
          days: number
          decided_at: string | null
          decided_by: string | null
          decision_note: string | null
          employee_id: string
          end_date: string
          half: string
          id: string
          reason: string | null
          start_date: string
          status: string
          type_id: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          days: number
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          employee_id: string
          end_date: string
          half?: string
          id?: string
          reason?: string | null
          start_date: string
          status?: string
          type_id: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          days?: number
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          employee_id?: string
          end_date?: string
          half?: string
          id?: string
          reason?: string | null
          start_date?: string
          status?: string
          type_id?: string
          updated_at?: string
        }
        Relationships: []
      }
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
      attendance_settings: {
        Row: {
          company_id: string
          geofence_mode: Database["public"]["Enums"]["geofence_mode"]
          default_radius_m: number
          day_start_hour: number
          selfie_required: boolean
          allow_without_selfie: boolean
          created_at: string
          updated_at: string
        }
        Insert: never
        Update: never
        Relationships: []
      }
      attendance_events: {
        Row: {
          id: string
          company_id: string
          employee_id: string
          branch_id: string | null
          kind: Database["public"]["Enums"]["attendance_kind"]
          client_event_id: string
          device_time: string
          server_time: string
          occurred_at: string
          latitude: number | null
          longitude: number | null
          accuracy_m: number | null
          distance_m: number | null
          inside_geofence: boolean | null
          selfie_path: string | null
          device_id: string | null
          flags: string[]
        }
        Insert: never
        Update: never
        Relationships: []
      }
      brands: {
        Row: {
          company_id: string
          created_at: string
          id: string
          image_path: string | null
          is_active: boolean
          name: string
          name_local: string | null
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          image_path?: string | null
          is_active?: boolean
          name: string
          name_local?: string | null
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          image_path?: string | null
          is_active?: boolean
          name?: string
          name_local?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      categories: {
        Row: {
          company_id: string
          created_at: string
          id: string
          image_path: string | null
          is_active: boolean
          name: string
          name_local: string | null
          parent_id: string | null
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          image_path?: string | null
          is_active?: boolean
          name: string
          name_local?: string | null
          parent_id?: string | null
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          image_path?: string | null
          is_active?: boolean
          name?: string
          name_local?: string | null
          parent_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      stock_movements: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          kind: string
          location_id: string
          note: string | null
          reason: string | null
          reference: string | null
          request_id: string
          supplier_id: string | null
        }
        Insert: never
        Update: never
        Relationships: []
      }
      stock_ledger: {
        Row: {
          company_id: string
          created_at: string
          id: string
          location_id: string
          movement_id: string
          qty_delta: number
          variant_id: string
        }
        Insert: never
        Update: never
        Relationships: []
      }
      stock_balances: {
        Row: {
          company_id: string
          location_id: string
          qty: number
          updated_at: string
          variant_id: string
        }
        Insert: never
        Update: never
        Relationships: []
      }
      suppliers: {
        Row: {
          address: string | null
          company_id: string
          contact_name: string | null
          created_at: string
          email: string | null
          id: string
          is_active: boolean
          name: string
          name_local: string | null
          note: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          company_id: string
          contact_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          name: string
          name_local?: string | null
          note?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          company_id?: string
          contact_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          name?: string
          name_local?: string | null
          note?: string | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      item_costs: {
        Row: {
          company_id: string
          cost: number
          item_id: string
          updated_at: string
        }
        Insert: {
          company_id: string
          cost: number
          item_id: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          cost?: number
          item_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      item_images: {
        Row: {
          company_id: string
          created_at: string
          id: string
          image_path: string
          is_main: boolean
          item_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          image_path: string
          is_main?: boolean
          item_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          image_path?: string
          is_main?: boolean
          item_id?: string
        }
        Relationships: []
      }
      item_variants: {
        Row: {
          barcode: string | null
          company_id: string
          created_at: string
          id: string
          image_id: string | null
          is_active: boolean
          is_default: boolean
          item_id: string
          name: string
          name_local: string | null
          price: number | null
          sku: string | null
          updated_at: string
        }
        Insert: {
          barcode?: string | null
          company_id: string
          created_at?: string
          id?: string
          image_id?: string | null
          is_active?: boolean
          is_default?: boolean
          item_id: string
          name: string
          name_local?: string | null
          price?: number | null
          sku?: string | null
          updated_at?: string
        }
        Update: {
          barcode?: string | null
          company_id?: string
          created_at?: string
          id?: string
          image_id?: string | null
          is_active?: boolean
          is_default?: boolean
          item_id?: string
          name?: string
          name_local?: string | null
          price?: number | null
          sku?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      locations: {
        Row: {
          address: string | null
          company_id: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          name_local: string | null
          note: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          company_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          name_local?: string | null
          note?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          company_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          name_local?: string | null
          note?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      items: {
        Row: {
          base_uom: string
          brand_id: string | null
          category_id: string | null
          company_id: string
          created_at: string
          currency_code: string
          description: string | null
          description_local: string | null
          id: string
          is_active: boolean
          kind: string
          name: string
          name_local: string | null
          packs: Json
          properties: Json
          price: number
          sku: string | null
          updated_at: string
        }
        Insert: {
          base_uom?: string
          brand_id?: string | null
          category_id?: string | null
          company_id: string
          created_at?: string
          currency_code: string
          description?: string | null
          description_local?: string | null
          id?: string
          is_active?: boolean
          kind?: string
          name: string
          name_local?: string | null
          packs?: Json
          properties?: Json
          price?: number
          sku?: string | null
          updated_at?: string
        }
        Update: {
          base_uom?: string
          brand_id?: string | null
          category_id?: string | null
          company_id?: string
          created_at?: string
          currency_code?: string
          description?: string | null
          description_local?: string | null
          id?: string
          is_active?: boolean
          kind?: string
          name?: string
          name_local?: string | null
          packs?: Json
          properties?: Json
          price?: number
          sku?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      branches: {
        Row: {
          timezone: string | null
          latitude: number | null
          longitude: number | null
          geofence_radius_m: number | null
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
          latitude?: number | null
          longitude?: number | null
          geofence_radius_m?: number | null
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
          latitude?: number | null
          longitude?: number | null
          geofence_radius_m?: number | null
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
          deleted_at: string | null
          deleted_by: string | null
          id: string
          name: string
          name_local: string | null
          purge_after: string | null
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
          picture_path: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          full_name: string
          full_name_local?: string | null
          locale?: string
          picture_path?: string | null
          user_id: string
        }
        Update: {
          full_name?: string
          full_name_local?: string | null
          locale?: string
          picture_path?: string | null
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
      company_holidays: {
        Row: {
          branch_id: string | null
          company_id: string
          created_at: string
          created_by: string | null
          holiday_date: string
          id: string
          name: string
          name_local: string | null
          observed_date: string | null
          provisional: boolean
          repeats_yearly: boolean
          source: "manual" | "preset"
          updated_at: string
        }
        Insert: {
          branch_id?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          holiday_date?: string
          id?: string
          name?: string
          name_local?: string | null
          observed_date?: string | null
          provisional?: boolean
          repeats_yearly?: boolean
          source?: "manual" | "preset"
          updated_at?: string
        }
        Update: {
          branch_id?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          holiday_date?: string
          id?: string
          name?: string
          name_local?: string | null
          observed_date?: string | null
          provisional?: boolean
          repeats_yearly?: boolean
          source?: "manual" | "preset"
          updated_at?: string
        }
        Relationships: []
      }
      company_holiday_imports: {
        Row: {
          added_count: number
          company_id: string
          decided_at: string
          decided_by: string | null
          status: "imported" | "dismissed"
          year: number
        }
        Insert: {
          added_count?: number
          company_id?: string
          decided_at?: string
          decided_by?: string | null
          status?: "imported" | "dismissed"
          year?: number
        }
        Update: {
          added_count?: number
          company_id?: string
          decided_at?: string
          decided_by?: string | null
          status?: "imported" | "dismissed"
          year?: number
        }
        Relationships: []
      }
      holiday_presets: {
        Row: {
          country_code: string
          fetched_at: string
          holiday_date: string
          id: string
          name: string
          name_local: string | null
          provisional: boolean
          source: "nager" | "manual"
        }
        Insert: {
          country_code?: string
          fetched_at?: string
          holiday_date?: string
          id?: string
          name?: string
          name_local?: string | null
          provisional?: boolean
          source?: "nager" | "manual"
        }
        Update: {
          country_code?: string
          fetched_at?: string
          holiday_date?: string
          id?: string
          name?: string
          name_local?: string | null
          provisional?: boolean
          source?: "nager" | "manual"
        }
        Relationships: []
      }
      company_policies: {
        Row: { archived: boolean; kind: "policy" | "conduct"; company_id: string; created_at: string; created_by: string | null; id: string; title: string; title_local: string | null; updated_at: string }
        Insert: { archived?: boolean; kind?: "policy" | "conduct"; company_id?: string; created_at?: string; created_by?: string | null; id?: string; title?: string; title_local?: string | null; updated_at?: string }
        Update: { archived?: boolean; kind?: "policy" | "conduct"; company_id?: string; created_at?: string; created_by?: string | null; id?: string; title?: string; title_local?: string | null; updated_at?: string }
        Relationships: []
      }
      playbook_guides: {
        Row: { archived: boolean; company_id: string; created_at: string; created_by: string | null; id: string; read_minutes: number | null; title: string; title_local: string | null; topic: string | null; updated_at: string }
        Insert: { archived?: boolean; company_id?: string; created_at?: string; created_by?: string | null; id?: string; read_minutes?: number | null; title?: string; title_local?: string | null; topic?: string | null; updated_at?: string }
        Update: { archived?: boolean; company_id?: string; created_at?: string; created_by?: string | null; id?: string; read_minutes?: number | null; title?: string; title_local?: string | null; topic?: string | null; updated_at?: string }
        Relationships: []
      }
      playbook_steps: {
        Row: { body: string; body_local: string | null; company_id: string; guide_id: string; id: string; image_path: string | null; position: number; skip_condition: string | null; skip_condition_local: string | null; skip_if: boolean; title: string; title_local: string | null }
        Insert: { body?: string; body_local?: string | null; company_id?: string; guide_id?: string; id?: string; image_path?: string | null; position?: number; skip_condition?: string | null; skip_condition_local?: string | null; skip_if?: boolean; title?: string; title_local?: string | null }
        Update: { body?: string; body_local?: string | null; company_id?: string; guide_id?: string; id?: string; image_path?: string | null; position?: number; skip_condition?: string | null; skip_condition_local?: string | null; skip_if?: boolean; title?: string; title_local?: string | null }
        Relationships: []
      }
      playbook_guide_positions: {
        Row: { company_id: string; guide_id: string; position_id: string }
        Insert: { company_id?: string; guide_id?: string; position_id?: string }
        Update: { company_id?: string; guide_id?: string; position_id?: string }
        Relationships: []
      }
      playbook_progress: {
        Row: { company_id: string; done_at: string; employee_id: string; guide_id: string }
        Insert: { company_id?: string; done_at?: string; employee_id?: string; guide_id?: string }
        Update: { company_id?: string; done_at?: string; employee_id?: string; guide_id?: string }
        Relationships: []
      }
      policy_versions: {
        Row: { body: string; body_local: string | null; company_id: string; id: string; policy_id: string; published_at: string; published_by: string | null; version: number }
        Insert: { body?: string; body_local?: string | null; company_id?: string; id?: string; policy_id?: string; published_at?: string; published_by?: string | null; version?: number }
        Update: { body?: string; body_local?: string | null; company_id?: string; id?: string; policy_id?: string; published_at?: string; published_by?: string | null; version?: number }
        Relationships: []
      }
      policy_acknowledgements: {
        Row: { acknowledged_at: string; company_id: string; employee_id: string; version_id: string }
        Insert: { acknowledged_at?: string; company_id?: string; employee_id?: string; version_id?: string }
        Update: { acknowledged_at?: string; company_id?: string; employee_id?: string; version_id?: string }
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
      adjust_stock: {
        Args: { p_request_id: string; p_location_id: string; p_reason: string; p_note: string | null; p_lines: Json }
        Returns: string
      }
      receive_stock: {
        Args: { p_request_id: string; p_location_id: string; p_supplier_id: string | null; p_reference: string | null; p_note: string | null; p_lines: Json }
        Returns: string
      }
      set_item_main_image: { Args: { p_image_id: string }; Returns: undefined }
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
      get_attendance_settings: {
        Args: Record<string, never>
        Returns: { geofence_mode: Database["public"]["Enums"]["geofence_mode"]; default_radius_m: number; day_start_hour: number; selfie_required: boolean; allow_without_selfie: boolean; selfie_retention_days: number; plan_retention_days: number }
      }
      save_attendance_settings: {
        Args: { p_geofence_mode: Database["public"]["Enums"]["geofence_mode"]; p_default_radius_m: number; p_day_start_hour: number; p_allow_without_selfie: boolean }
        Returns: undefined
      }
      attendance_my_state: {
        Args: Record<string, never>
        Returns: {
          linked: boolean; module?: boolean; employee_id?: string; employee_name?: string; employee_name_local?: string | null; active?: boolean; company_id?: string; now?: string
          branch?: { id: string; name: string; name_local: string | null; latitude: number | null; longitude: number | null; radius_m: number } | null
          geofence_mode?: Database["public"]["Enums"]["geofence_mode"]; selfie_required?: boolean; allow_without_selfie?: boolean
          last?: { kind: Database["public"]["Enums"]["attendance_kind"]; occurred_at: string; flags: string[] } | null
        }
      }
      request_leave: {
        Args: { p_type_id: string; p_start: string; p_end: string; p_half: string; p_reason: string | null }
        Returns: string
      }
      cancel_leave: { Args: { p_id: string }; Returns: undefined }
      my_leave: {
        Args: Record<string, never>
        Returns: {
          year: number
          types: { id: string; code: string; name: string; name_local: string | null; paid: boolean; annual_days: number | null; used: number; pending: number }[]
          requests: { id: string; type_id: string; code: string; name: string; name_local: string | null; start_date: string; end_date: string; half: "full" | "start" | "end"; days: number; reason: string | null; status: "pending" | "approved" | "rejected" | "cancelled"; decision_note: string | null; created_at: string }[]
        }
      }
      leave_review_list: {
        Args: { p_status?: string }
        Returns: { id: string; employee_id: string; employee_name: string; employee_name_local: string | null; type_code: string; type_name: string; type_name_local: string | null; start_date: string; end_date: string; half: string; days: number; reason: string | null; status: string; decision_note: string | null; created_at: string }[]
      }
      decide_leave: { Args: { p_id: string; p_approve: boolean; p_note: string | null }; Returns: undefined }
      save_leave_type: {
        Args: { p_id: string | null; p_code: string; p_name: string; p_name_local: string | null; p_paid: boolean; p_annual_days: number | null; p_active: boolean }
        Returns: string
      }
      my_profile: {
        Args: Record<string, never>
        Returns: {
          linked: boolean
          company?: { name: string; name_local: string | null }
          position?: { name: string; name_local: string | null } | null
          department?: { name: string; name_local: string | null } | null
          reports_to?: { name: string; name_local: string | null } | null
          employment_date?: string | null
          role?: { name: string; name_local: string | null } | null
          manager?: { name: string; name_local: string | null; position: { name: string; name_local: string | null } | null; phone: string | null; telegram: string | null } | null
        }
      }
      my_personal: {
        Args: Record<string, never>
        Returns: { nickname: string | null; date_of_birth: string | null; address: string | null; phones: string[]; emergency: { name: string | null; relation: string | null; phone: string | null }[] }
      }
      my_save_personal: { Args: { p: Json }; Returns: undefined }
      attendance_clock: {
        Args: { p_kind: Database["public"]["Enums"]["attendance_kind"]; p_client_event_id: string; p_device_time: string; p_latitude: number | null; p_longitude: number | null; p_accuracy_m: number | null; p_selfie_path: string | null; p_device_id: string | null; p_offline?: boolean }
        Returns: { id: string; kind: Database["public"]["Enums"]["attendance_kind"]; occurred_at: string; flags: string[]; repeat: boolean }
      }
      employee_work_days: {
        Args: { p_employee_id: string; p_from: string; p_days?: number }
        Returns: { day: string; day_kind: string; schedule_id: string | null; source: Database["public"]["Enums"]["assignment_scope"] | null; start_time: string | null; end_time: string | null; break_min: number | null; hours: number; holiday_name: string | null; holiday_name_local: string | null }[]
      }
      save_company_holiday: {
        Args: { p_id: string | null; p_name: string; p_name_local: string | null; p_date: string; p_repeats_yearly: boolean; p_observed_date: string | null; p_branch_id: string | null }
        Returns: string
      }
      delete_company_holiday: {
        Args: { p_id: string }
        Returns: undefined
      }
      import_holiday_presets: {
        Args: { p_year: number }
        Returns: number
      }
      dismiss_holiday_notice: {
        Args: { p_year: number }
        Returns: undefined
      }
      holiday_notice: {
        Args: Record<string, never>
        Returns: { year: number; holiday_count: number; provisional: boolean }[]
      }
      save_policy: {
        Args: { p_id: string | null; p_title: string; p_title_local: string | null; p_body: string; p_body_local: string | null; p_kind?: "policy" | "conduct" }
        Returns: string
      }
      save_playbook: {
        Args: { p_id: string | null; p_title: string; p_title_local: string | null; p_topic: string | null; p_read_minutes: number | null; p_position_ids: string[] | null; p_steps: Json }
        Returns: string
      }
      archive_playbook: {
        Args: { p_id: string; p_archived: boolean }
        Returns: undefined
      }
      playbook_progress_status: {
        Args: { p_guide_id: string }
        Returns: { employee_id: string; name: string; name_local: string | null; done_at: string | null }[]
      }
      my_playbooks: {
        Args: Record<string, never>
        Returns: { guide_id: string; title: string; title_local: string | null; topic: string | null; read_minutes: number | null; step_count: number; done_at: string | null }[]
      }
      my_playbook_steps: {
        Args: { p_guide_id: string }
        Returns: { step_position: number; title: string; title_local: string | null; skip_if: boolean; skip_condition: string | null; skip_condition_local: string | null; body: string; body_local: string | null; image_path: string | null }[]
      }
      set_playbook_done: {
        Args: { p_guide_id: string; p_done: boolean }
        Returns: undefined
      }
      archive_policy: {
        Args: { p_id: string; p_archived: boolean }
        Returns: undefined
      }
      save_learn_test: {
        Args: { p_id: string | null; p_title: string; p_title_local: string | null; p_pass_percent: number; p_retake_days: number; p_questions: unknown }
        Returns: string
      }
      archive_learn_test: {
        Args: { p_id: string; p_archived: boolean }
        Returns: undefined
      }
      my_learn_tests: {
        Args: Record<string, never>
        Returns: { test_id: string; title: string; title_local: string | null; question_count: number; pass_percent: number; retake_days: number; status: "new" | "failed" | "passed" | "due_soon" | "overdue"; last_score: number | null; last_taken_at: string | null; passed_on: string | null; due_on: string | null }[]
      }
      learn_questions_for: {
        Args: { p_test_id: string }
        Returns: { question_id: string; position: number; prompt: string; prompt_local: string | null; options: { id: string; label: string; label_local: string | null }[] }[]
      }
      submit_learn_attempt: {
        Args: { p_test_id: string; p_answers: unknown }
        Returns: { score_percent: number; correct: number; total: number; passed: boolean }[]
      }
      learn_results: {
        Args: { p_test_id?: string | null }
        Returns: { attempt_id: string; employee_id: string; name: string; name_local: string | null; test_id: string; title: string; score_percent: number; passed: boolean; is_retake: boolean; failed_retake: boolean; taken_at: string }[]
      }
      save_kpi: {
        Args: { p_id: string | null; p_position_id: string; p_name: string; p_name_local: string | null; p_weight: number; p_active: boolean }
        Returns: string
      }
      performance_review_list: {
        Args: { p_period: string }
        Returns: { employee_id: string; name: string; name_local: string | null; position_name: string | null; position_name_local: string | null; kpi_count: number; overall_percent: number | null; reviewed_at: string | null }[]
      }
      performance_review_form: {
        Args: { p_employee_id: string; p_period: string }
        Returns: { kpi_id: string; name: string; name_local: string | null; weight: number; score: number | null; comment: string | null }[]
      }
      submit_performance_review: {
        Args: { p_employee_id: string; p_period: string; p_scores: unknown; p_comment: string | null }
        Returns: number
      }
      save_position_description: {
        Args: { p_position_id: string; p_summary: string | null; p_summary_local: string | null; p_duties: string | null; p_duties_local: string | null }
        Returns: undefined
      }
      my_job_description: {
        Args: Record<string, never>
        Returns: { position_name: string; position_name_local: string | null; summary: string | null; summary_local: string | null; duties: string | null; duties_local: string | null }[]
      }
      record_career_event: {
        Args: { p_employee_id: string; p_kind: Database["public"]["Enums"]["career_event_kind"]; p_position_id: string; p_date: string; p_note: string | null }
        Returns: string
      }
      my_career: {
        Args: Record<string, never>
        Returns: { id: string; kind: Database["public"]["Enums"]["career_event_kind"]; event_date: string; from_name: string | null; from_name_local: string | null; to_name: string; to_name_local: string | null; note: string | null }[]
      }
      my_notifications: {
        Args: { p_limit?: number }
        Returns: { id: string; kind: string; data: Record<string, unknown>; created_at: string; read_at: string | null }[]
      }
      my_unread_notifications: { Args: Record<string, never>; Returns: number }
      mark_notifications_read: { Args: { p_ids?: string[] | null }; Returns: undefined }
      my_notification_setting: { Args: Record<string, never>; Returns: boolean }
      set_my_notification_setting: { Args: { p_on: boolean }; Returns: undefined }
      save_push_subscription: { Args: { p_endpoint: string; p_p256dh: string; p_auth: string; p_user_agent?: string | null }; Returns: undefined }
      remove_push_subscription: { Args: { p_endpoint: string }; Returns: undefined }
      my_push_registered: { Args: { p_endpoint: string }; Returns: boolean }
      my_kpis: {
        Args: Record<string, never>
        Returns: { name: string; name_local: string | null; weight: number; last_score: number | null; last_period: string | null }[]
      }
      my_reviews: {
        Args: Record<string, never>
        Returns: { period: string; overall_percent: number; comment: string | null; reviewed_at: string }[]
      }
      request_amendment: {
        Args: { p_date: string; p_in: string | null; p_out: string | null; p_reason: string }
        Returns: string
      }
      cancel_amendment: {
        Args: { p_id: string }
        Returns: undefined
      }
      my_amendments: {
        Args: Record<string, never>
        Returns: { id: string; work_date: string; in_time: string | null; out_time: string | null; reason: string; status: string; decision_note: string | null; created_at: string }[]
      }
      amendment_review_list: {
        Args: { p_status?: string }
        Returns: { id: string; employee_id: string; employee_name: string; employee_name_local: string | null; work_date: string; in_time: string | null; out_time: string | null; reason: string; status: string; decision_note: string | null; created_at: string }[]
      }
      decide_amendment: {
        Args: { p_id: string; p_approve: boolean; p_note: string | null }
        Returns: undefined
      }
      my_policies: {
        Args: Record<string, never>
        Returns: { policy_id: string; kind: "policy" | "conduct"; version_id: string; version: number; title: string; title_local: string | null; body: string; body_local: string | null; published_at: string; acknowledged_at: string | null; confirmed_earlier: boolean }[]
      }
      acknowledge_policy: {
        Args: { p_version_id: string }
        Returns: undefined
      }
      policy_ack_status: {
        Args: { p_policy_id: string }
        Returns: { employee_id: string; name: string; name_local: string | null; acknowledged_at: string | null }[]
      }
      employee_attendance_days: {
        Args: { p_employee_id: string; p_from: string; p_days?: number }
        Returns: { day: string; status: string; first_in: string | null; last_out: string | null; late_min: number; early_min: number; worked_min: number; overtime_min: number; half_day: boolean; flagged: boolean }[]
      }
      my_achievements: {
        Args: Record<string, never>
        Returns: { kind: "green_month" | "progress" | "tenure"; period: string; n: number; total: number | null }[]
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
      platform_holiday_overview: { Args: Record<PropertyKey, never>; Returns: Json }
      platform_ack_holiday_alert: { Args: { p_country: string; p_year: number }; Returns: undefined }
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
      my_enabled_modules: {
        Args: Record<PropertyKey, never>
        Returns: string[]
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
          deleted_at: string | null
          is_active: boolean
          is_owner: boolean
          membership_id: string
          name: string
          name_local: string | null
          purge_after: string | null
        }[]
      }
      delete_company: {
        Args: { p_company: string; p_confirm_name: string }
        Returns: string
      }
      restore_company: {
        Args: { p_company: string }
        Returns: undefined
      }
      switch_company: {
        Args: { p_membership_id: string }
        Returns: undefined
      }
    }
    Enums: {
      career_event_kind: "promotion" | "transfer"
      geofence_mode: "off" | "flag" | "block"
      attendance_kind: "in" | "out"
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
