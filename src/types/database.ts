/**
 * src/types/database.ts
 *
 * Generated from the schema in supabase/migrations/ via:
 *   supabase gen types typescript --local > src/types/database.ts
 * (with a local stack running: `supabase start`, migrations applied
 * automatically). Never hand-edit this file — if the schema changes,
 * regenerate it from the migration, the same way this copy was produced
 * and verified: `supabase db reset` to apply supabase/migrations/ and
 * supabase/seed.sql fresh, then re-run the gen types command above.
 *
 * The `element_color_overrides` table was originally added by hand (no
 * local stack to run the real generator against at the time) and has
 * since been confirmed correct: regenerated for real via
 * `supabase gen types typescript --linked` against the live project and
 * verified to match. That table's entry below is genuine generated
 * output, not a hand-typed approximation.
 *
 * elements.order_index (alongside supabase/migrations/
 * 20260917000000_elements_order_index.sql) was added by hand the same
 * way element_color_overrides originally was — no local stack available
 * in that environment either. Treat just this one field as unverified
 * against the real CLI output until the migration is applied and this
 * file is regenerated and confirmed to match — everything else here,
 * including the rest of the elements table, is genuine generated output.
 *
 * src/lib/supabase.ts is the only place this file is imported.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      annotation_replies: {
        Row: {
          annotation_id: string
          author: string
          body: string
          created_at: string
          id: string
        }
        Insert: {
          annotation_id: string
          author: string
          body: string
          created_at?: string
          id?: string
        }
        Update: {
          annotation_id?: string
          author?: string
          body?: string
          created_at?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "annotation_replies_annotation_id_fkey"
            columns: ["annotation_id"]
            isOneToOne: false
            referencedRelation: "annotations"
            referencedColumns: ["id"]
          },
        ]
      }
      annotations: {
        Row: {
          author: string
          body: string
          created_at: string
          element_id: string | null
          id: string
          normal_x: number
          normal_y: number
          normal_z: number
          position_x: number
          position_y: number
          position_z: number
          project_id: string
          status: string
        }
        Insert: {
          author: string
          body: string
          created_at?: string
          element_id?: string | null
          id?: string
          normal_x: number
          normal_y: number
          normal_z: number
          position_x: number
          position_y: number
          position_z: number
          project_id: string
          status: string
        }
        Update: {
          author?: string
          body?: string
          created_at?: string
          element_id?: string | null
          id?: string
          normal_x?: number
          normal_y?: number
          normal_z?: number
          position_x?: number
          position_y?: number
          position_z?: number
          project_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "annotations_element_id_fkey"
            columns: ["element_id"]
            isOneToOne: false
            referencedRelation: "elements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "annotations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      element_color_overrides: {
        Row: {
          color: string
          element_id: string
          id: string
          project_id: string
          updated_at: string
        }
        Insert: {
          color: string
          element_id: string
          id?: string
          project_id: string
          updated_at?: string
        }
        Update: {
          color?: string
          element_id?: string
          id?: string
          project_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "element_color_overrides_element_id_fkey"
            columns: ["element_id"]
            isOneToOne: true
            referencedRelation: "elements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "element_color_overrides_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      elements: {
        Row: {
          category: string
          id: string
          mesh_name: string
          name: string
          order_index: number
          project_id: string
          responsible_party: string
          specification: Json
          status: string
          updated_at: string
        }
        Insert: {
          category: string
          id?: string
          mesh_name: string
          name: string
          order_index?: number
          project_id: string
          responsible_party: string
          specification?: Json
          status: string
          updated_at?: string
        }
        Update: {
          category?: string
          id?: string
          mesh_name?: string
          name?: string
          order_index?: number
          project_id?: string
          responsible_party?: string
          specification?: Json
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "elements_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          address: string
          client: string
          code: string
          created_at: string
          id: string
          name: string
          phase: string
          revision: string
        }
        Insert: {
          address: string
          client: string
          code: string
          created_at?: string
          id?: string
          name: string
          phase: string
          revision: string
        }
        Update: {
          address?: string
          client?: string
          code?: string
          created_at?: string
          id?: string
          name?: string
          phase?: string
          revision?: string
        }
        Relationships: []
      }
      revisions: {
        Row: {
          changed_element_ids: string[]
          date: string
          id: string
          label: string
          project_id: string
          summary: string
        }
        Insert: {
          changed_element_ids?: string[]
          date: string
          id?: string
          label: string
          project_id: string
          summary: string
        }
        Update: {
          changed_element_ids?: string[]
          date?: string
          id?: string
          label?: string
          project_id?: string
          summary?: string
        }
        Relationships: [
          {
            foreignKeyName: "revisions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

