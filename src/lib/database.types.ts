
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "ai_usage_counters": {
                  Row: {
                    "calls": number,"tokens": number,"updated_at": string,"user_id": string,"window_kind": string,"window_start": string
                  }
                  ComputedFields: never
                  Insert: {
                    "calls"?: number,"tokens"?: number,"updated_at"?: string,"user_id": string,"window_kind": string,"window_start": string
                  }
                  Update: {
                    "calls"?: number,"tokens"?: number,"updated_at"?: string,"user_id"?: string,"window_kind"?: string,"window_start"?: string
                  }
                  Relationships: [
                    
                  ]
                },"ai_usage_ledger": {
                  Row: {
                    "cost_usd": number,"created_at": string,"id": string,"input_tokens": number,"model": string,"outcome": string,"output_tokens": number,"request_id": string,"route": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "cost_usd": number,"created_at"?: string,"id"?: string,"input_tokens": number,"model": string,"outcome": string,"output_tokens": number,"request_id": string,"route": string,"user_id": string
                  }
                  Update: {
                    "cost_usd"?: number,"created_at"?: string,"id"?: string,"input_tokens"?: number,"model"?: string,"outcome"?: string,"output_tokens"?: number,"request_id"?: string,"route"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"lists": {
                  Row: {
                    "color": string | null,"created_at": number,"deleted_at": number | null,"id": string,"name": string,"server_updated_at": string,"sort_order": number,"updated_at": number,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "color"?: string | null,"created_at": number,"deleted_at"?: number | null,"id": string,"name": string,"server_updated_at"?: string,"sort_order"?: number,"updated_at": number,"user_id": string
                  }
                  Update: {
                    "color"?: string | null,"created_at"?: number,"deleted_at"?: number | null,"id"?: string,"name"?: string,"server_updated_at"?: string,"sort_order"?: number,"updated_at"?: number,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"profiles": {
                  Row: {
                    "created_at": string,"deleted_at": string | null,"display_name": string | null,"id": string,"timezone": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"deleted_at"?: string | null,"display_name"?: string | null,"id": string,"timezone"?: string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"deleted_at"?: string | null,"display_name"?: string | null,"id"?: string,"timezone"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"subtasks": {
                  Row: {
                    "created_at": number,"deleted_at": number | null,"id": string,"is_done": boolean,"server_updated_at": string,"sort_order": number,"task_id": string,"title": string,"updated_at": number,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at": number,"deleted_at"?: number | null,"id": string,"is_done"?: boolean,"server_updated_at"?: string,"sort_order"?: number,"task_id": string,"title": string,"updated_at": number,"user_id": string
                  }
                  Update: {
                    "created_at"?: number,"deleted_at"?: number | null,"id"?: string,"is_done"?: boolean,"server_updated_at"?: string,"sort_order"?: number,"task_id"?: string,"title"?: string,"updated_at"?: number,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "subtasks_task_id_user_id_fkey"
      columns: ["task_id","user_id"]
isOneToOne: false
      referencedRelation: "tasks"
      referencedColumns: ["id","user_id"]
    }
                  ]
                },"tasks": {
                  Row: {
                    "completed_at": number | null,"created_at": number,"deleted_at": number | null,"due_at": number | null,"id": string,"list_id": string | null,"notes": string | null,"priority": number,"server_updated_at": string,"sort_order": number,"status": string,"title": string,"updated_at": number,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "completed_at"?: number | null,"created_at": number,"deleted_at"?: number | null,"due_at"?: number | null,"id": string,"list_id"?: string | null,"notes"?: string | null,"priority"?: number,"server_updated_at"?: string,"sort_order"?: number,"status"?: string,"title": string,"updated_at": number,"user_id": string
                  }
                  Update: {
                    "completed_at"?: number | null,"created_at"?: number,"deleted_at"?: number | null,"due_at"?: number | null,"id"?: string,"list_id"?: string | null,"notes"?: string | null,"priority"?: number,"server_updated_at"?: string,"sort_order"?: number,"status"?: string,"title"?: string,"updated_at"?: number,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "tasks_list_id_user_id_fkey"
      columns: ["list_id","user_id"]
isOneToOne: false
      referencedRelation: "lists"
      referencedColumns: ["id","user_id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "ai_consume_call":
{ Args: { "p_calls_per_hour": number,"p_now"?: string,"p_tokens_per_day": number,"p_user_id": string }; Returns: {
              "allowed": boolean,"calls_this_hour": number,"reason": string,"retry_after_seconds": number,"tokens_today": number
            }[]
                           },
"ai_record_usage":
{ Args: { "p_cost_usd": number,"p_input_tokens": number,"p_model": string,"p_now"?: string,"p_outcome": string,"p_output_tokens": number,"p_request_id": string,"p_route": string,"p_user_id": string }; Returns: undefined
                           },
"sync_purge_tombstones":
{ Args: { "p_cutoff"?: string }; Returns: {
              "lists_purged": number,"subtasks_purged": number,"tasks_purged": number
            }[]
                           },
"sync_push":
{ Args: { "p_client_now": number,"p_rows": Json,"p_table": string }; Returns: Json
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

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {
            
          }
        }
} as const
