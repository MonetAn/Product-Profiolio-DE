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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      initiative_history: {
        Row: {
          change_type: string
          changed_at: string | null
          changed_by: string | null
          field_name: string | null
          id: string
          initiative_id: string | null
          new_value: Json | null
          old_value: Json | null
        }
        Insert: {
          change_type: string
          changed_at?: string | null
          changed_by?: string | null
          field_name?: string | null
          id?: string
          initiative_id?: string | null
          new_value?: Json | null
          old_value?: Json | null
        }
        Update: {
          change_type?: string
          changed_at?: string | null
          changed_by?: string | null
          field_name?: string | null
          id?: string
          initiative_id?: string | null
          new_value?: Json | null
          old_value?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "initiative_history_initiative_id_fkey"
            columns: ["initiative_id"]
            isOneToOne: false
            referencedRelation: "initiatives"
            referencedColumns: ["id"]
          },
        ]
      }
      initiatives: {
        Row: {
          created_at: string | null
          created_by: string | null
          description: string | null
          documentation_link: string | null
          geo_cost_split: Json | null
          id: string
          initiative: string
          is_timeline_stub: boolean
          quarterly_data: Json
          stakeholders: string | null
          stakeholders_list: string[] | null
          team: string
          unit: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          documentation_link?: string | null
          geo_cost_split?: Json | null
          id?: string
          initiative: string
          is_timeline_stub?: boolean
          quarterly_data?: Json
          stakeholders?: string | null
          stakeholders_list?: string[] | null
          team: string
          unit: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          documentation_link?: string | null
          geo_cost_split?: Json | null
          id?: string
          initiative?: string
          is_timeline_stub?: boolean
          quarterly_data?: Json
          stakeholders?: string | null
          stakeholders_list?: string[] | null
          team?: string
          unit?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: []
      }
      market_countries: {
        Row: {
          id: string
          cluster_key: string
          label_ru: string
          sort_order: number
          is_active: boolean
          created_at: string
        }
        Insert: {
          id?: string
          cluster_key: string
          label_ru: string
          sort_order?: number
          is_active?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          cluster_key?: string
          label_ru?: string
          sort_order?: number
          is_active?: boolean
          created_at?: string
        }
        Relationships: []
      }
      people: {
        Row: {
          created_at: string
          created_by: string | null
          directory_source: string
          email: string | null
          external_id: string | null
          full_name: string
          hired_at: string | null
          hr_structure: string | null
          id: string
          leader: string | null
          manual_added_by: string | null
          manual_added_by_name: string | null
          manual_resolved_at: string | null
          manual_resolved_by: string | null
          manual_resolved_by_name: string | null
          manual_review_status: string | null
          position: string | null
          team: string | null
          terminated_at: string | null
          unit: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          directory_source?: string
          email?: string | null
          external_id?: string | null
          full_name: string
          hired_at?: string | null
          hr_structure?: string | null
          id?: string
          leader?: string | null
          manual_added_by?: string | null
          manual_added_by_name?: string | null
          manual_resolved_at?: string | null
          manual_resolved_by?: string | null
          manual_resolved_by_name?: string | null
          manual_review_status?: string | null
          position?: string | null
          team?: string | null
          terminated_at?: string | null
          unit?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          directory_source?: string
          email?: string | null
          external_id?: string | null
          full_name?: string
          hired_at?: string | null
          hr_structure?: string | null
          id?: string
          leader?: string | null
          manual_added_by?: string | null
          manual_added_by_name?: string | null
          manual_resolved_at?: string | null
          manual_resolved_by?: string | null
          manual_resolved_by_name?: string | null
          manual_review_status?: string | null
          position?: string | null
          team?: string | null
          terminated_at?: string | null
          unit?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      person_assignment_history: {
        Row: {
          assignment_id: string | null
          change_type: string
          changed_at: string | null
          changed_by: string | null
          field_name: string | null
          id: string
          initiative_id: string | null
          new_value: Json | null
          old_value: Json | null
          person_id: string | null
        }
        Insert: {
          assignment_id?: string | null
          change_type: string
          changed_at?: string | null
          changed_by?: string | null
          field_name?: string | null
          id?: string
          initiative_id?: string | null
          new_value?: Json | null
          old_value?: Json | null
          person_id?: string | null
        }
        Update: {
          assignment_id?: string | null
          change_type?: string
          changed_at?: string | null
          changed_by?: string | null
          field_name?: string | null
          id?: string
          initiative_id?: string | null
          new_value?: Json | null
          old_value?: Json | null
          person_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "person_assignment_history_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "person_initiative_assignments"
            referencedColumns: ["id"]
          },
        ]
      }
      person_initiative_assignments: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          initiative_id: string
          is_auto: boolean
          person_id: string
          quarterly_effort: Json
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          initiative_id: string
          is_auto?: boolean
          person_id: string
          quarterly_effort?: Json
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          initiative_id?: string
          is_auto?: boolean
          person_id?: string
          quarterly_effort?: Json
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "person_initiative_assignments_initiative_id_fkey"
            columns: ["initiative_id"]
            isOneToOne: false
            referencedRelation: "initiatives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "person_initiative_assignments_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          email: string
          full_name: string | null
          id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          email: string
          full_name?: string | null
          id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          email?: string
          full_name?: string | null
          id?: string
        }
        Relationships: []
      }
      team_quarter_snapshots: {
        Row: {
          created_by: string | null
          id: string
          imported_at: string | null
          person_ids: string[]
          quarter: string
          roster_confirmed_at: string | null
          roster_confirmed_by: string | null
          roster_confirmed_by_name: string | null
          source: string
          team: string
          unit: string
        }
        Insert: {
          created_by?: string | null
          id?: string
          imported_at?: string | null
          person_ids?: string[]
          quarter: string
          roster_confirmed_at?: string | null
          roster_confirmed_by?: string | null
          roster_confirmed_by_name?: string | null
          source?: string
          team: string
          unit: string
        }
        Update: {
          created_by?: string | null
          id?: string
          imported_at?: string | null
          person_ids?: string[]
          quarter?: string
          roster_confirmed_at?: string | null
          roster_confirmed_by?: string | null
          roster_confirmed_by_name?: string | null
          source?: string
          team?: string
          unit?: string
        }
        Relationships: []
      }
      team_effort_subgroup_members: {
        Row: {
          subgroup_id: string
          person_id: string
        }
        Insert: {
          subgroup_id: string
          person_id: string
        }
        Update: {
          subgroup_id?: string
          person_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_effort_subgroup_members_subgroup_id_fkey"
            columns: ["subgroup_id"]
            isOneToOne: false
            referencedRelation: "team_effort_subgroups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_effort_subgroup_members_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      team_effort_subgroups: {
        Row: {
          created_at: string
          id: string
          name: string
          sort_order: number
          team: string
          unit: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          sort_order?: number
          team: string
          unit: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          sort_order?: number
          team?: string
          unit?: string
        }
        Relationships: []
      }
      team_subgroup_initiative_effort: {
        Row: {
          id: string
          initiative_id: string
          quarterly_effort: Json
          subgroup_id: string
          updated_at: string
        }
        Insert: {
          id?: string
          initiative_id: string
          quarterly_effort?: Json
          subgroup_id: string
          updated_at?: string
        }
        Update: {
          id?: string
          initiative_id?: string
          quarterly_effort?: Json
          subgroup_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_subgroup_initiative_effort_initiative_id_fkey"
            columns: ["initiative_id"]
            isOneToOne: false
            referencedRelation: "initiatives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_subgroup_initiative_effort_subgroup_id_fkey"
            columns: ["subgroup_id"]
            isOneToOne: false
            referencedRelation: "team_effort_subgroups"
            referencedColumns: ["id"]
          },
        ]
      }
      portfolio_hub_block_acks: {
        Row: {
          block: string
          confirmed_at: string
          confirmed_by: string
          confirmed_by_name: string | null
          id: string
          quarter: string
          team: string
          unit: string
        }
        Insert: {
          block: string
          confirmed_at?: string
          confirmed_by?: string
          confirmed_by_name?: string | null
          id?: string
          quarter: string
          team: string
          unit: string
        }
        Update: {
          block?: string
          confirmed_at?: string
          confirmed_by?: string
          confirmed_by_name?: string | null
          id?: string
          quarter?: string
          team?: string
          unit?: string
        }
        Relationships: [
          {
            foreignKeyName: "portfolio_hub_block_acks_confirmed_by_fkey"
            columns: ["confirmed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      allowed_users: {
        Row: {
          id: string
          email: string
          role: string
          created_at: string
          allowed_units: string[] | null
          allowed_team_pairs: Json | null
          can_view_money: boolean | null
          display_name: string | null
          member_unit: string | null
          member_team: string | null
          member_affiliations: Json | null
        }
        Insert: {
          id?: string
          email: string
          role: string
          created_at?: string
          allowed_units?: string[] | null
          allowed_team_pairs?: Json | null
          can_view_money?: boolean | null
          display_name?: string | null
          member_unit?: string | null
          member_team?: string | null
          member_affiliations?: Json | null
        }
        Update: {
          id?: string
          email?: string
          role?: string
          created_at?: string
          allowed_units?: string[] | null
          allowed_team_pairs?: Json | null
          can_view_money?: boolean | null
          display_name?: string | null
          member_unit?: string | null
          member_team?: string | null
          member_affiliations?: Json | null
        }
        Relationships: []
      }
      sensitive_scopes: {
        Row: {
          id: string
          unit: string
          team: string | null
          created_at: string
        }
        Insert: {
          id?: string
          unit: string
          team?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          unit?: string
          team?: string | null
          created_at?: string
        }
        Relationships: []
      }
      user_presence: {
        Row: {
          id: string
          user_id: string
          user_email: string | null
          surface: string
          day: string
          first_seen_at: string
        }
        Insert: {
          id?: string
          user_id: string
          user_email?: string | null
          surface: string
          day: string
          first_seen_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          user_email?: string | null
          surface?: string
          day?: string
          first_seen_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_presence_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      is_dodo_employee: { Args: never; Returns: boolean }
      get_my_access: { Args: Record<string, never>; Returns: Json }
      record_presence: { Args: { p_surface: string }; Returns: undefined }
      get_presence_timeline: {
        Args: {
          period_start: string
          period_end: string
          filter_user_email?: string | null
        }
        Returns: Json
      }
      get_user_presence_stats: { Args: Record<string, never>; Returns: Json }
      prune_user_presence_by_range: {
        Args: { period_start: string; period_end: string }
        Returns: number
      }
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
