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
          id: string
          initiative: string
          initiative_type: string | null
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
          id?: string
          initiative: string
          initiative_type?: string | null
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
          id?: string
          initiative?: string
          initiative_type?: string | null
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
      people: {
        Row: {
          created_at: string
          created_by: string | null
          email: string | null
          external_id: string | null
          full_name: string
          hired_at: string | null
          hr_structure: string | null
          id: string
          leader: string | null
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
          email?: string | null
          external_id?: string | null
          full_name: string
          hired_at?: string | null
          hr_structure?: string | null
          id?: string
          leader?: string | null
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
          email?: string | null
          external_id?: string | null
          full_name?: string
          hired_at?: string | null
          hr_structure?: string | null
          id?: string
          leader?: string | null
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
          source?: string
          team?: string
          unit?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      is_dodo_employee: { Args: never; Returns: boolean }
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
