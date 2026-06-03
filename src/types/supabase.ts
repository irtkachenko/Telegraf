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
      chats: {
        Row: {
          created_at: string
          id: string
          recipient_id: string | null
          recipient_last_read_id: string | null
          title: string
          updated_at: string | null
          user_id: string
          user_last_read_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          recipient_id?: string | null
          recipient_last_read_id?: string | null
          title?: string
          updated_at?: string | null
          user_id: string
          user_last_read_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          recipient_id?: string | null
          recipient_last_read_id?: string | null
          title?: string
          updated_at?: string | null
          user_id?: string
          user_last_read_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chats_recipient_id_user_id_fk"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chats_recipient_last_read_id_fkey"
            columns: ["recipient_last_read_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chats_user_id_user_id_fk"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chats_user_last_read_id_fkey"
            columns: ["user_last_read_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          attachments: Json
          chat_id: string
          client_id: string | null
          content: string | null
          created_at: string
          id: string
          reply_to_id: string | null
          sender_id: string
          updated_at: string | null
        }
        Insert: {
          attachments?: Json
          chat_id: string
          client_id?: string | null
          content?: string | null
          created_at?: string
          id?: string
          reply_to_id?: string | null
          sender_id: string
          updated_at?: string | null
        }
        Update: {
          attachments?: Json
          chat_id?: string
          client_id?: string | null
          content?: string | null
          created_at?: string
          id?: string
          reply_to_id?: string | null
          sender_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_chat_id_chats_id_fk"
            columns: ["chat_id"]
            isOneToOne: false
            referencedRelation: "chats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_reply_to_id_messages_id_fk"
            columns: ["reply_to_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_user_id_fk"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_limit_config: {
        Row: {
          action: string
          enabled: boolean
          max_count: number
          window_seconds: number
        }
        Insert: {
          action: string
          enabled?: boolean
          max_count: number
          window_seconds: number
        }
        Update: {
          action?: string
          enabled?: boolean
          max_count?: number
          window_seconds?: number
        }
        Relationships: []
      }
      rate_limits: {
        Row: {
          action: string
          count: number
          user_id: string
          window_seconds: number
          window_start: string
        }
        Insert: {
          action: string
          count?: number
          user_id: string
          window_seconds: number
          window_start: string
        }
        Update: {
          action?: string
          count?: number
          user_id?: string
          window_seconds?: number
          window_start?: string
        }
        Relationships: []
      }
      users: {
        Row: {
          created_at: string | null
          email: string
          emailVerified: string | null
          id: string
          image: string | null
          is_online: boolean | null
          last_seen: string | null
          name: string | null
          preferences: Json | null
          provider: string | null
          provider_id: string | null
          status: string | null
          status_message: string | null
          theme: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          email: string
          emailVerified?: string | null
          id: string
          image?: string | null
          is_online?: boolean | null
          last_seen?: string | null
          name?: string | null
          preferences?: Json | null
          provider?: string | null
          provider_id?: string | null
          status?: string | null
          status_message?: string | null
          theme?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string
          emailVerified?: string | null
          id?: string
          image?: string | null
          is_online?: boolean | null
          last_seen?: string | null
          name?: string | null
          preferences?: Json | null
          provider?: string | null
          provider_id?: string | null
          status?: string | null
          status_message?: string | null
          theme?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      check_action_limit: {
        Args: {
          p_action: string
          p_max_count?: number
          p_seconds?: number
          p_u_id?: string
        }
        Returns: boolean
      }
      cleanup_rate_limits: { Args: never; Returns: undefined }
      delete_expired_assets: { Args: never; Returns: undefined }
      rpc_create_chat: {
        Args: { p_recipient_id: string }
        Returns: {
          created_at: string
          id: string
          recipient_id: string | null
          recipient_last_read_id: string | null
          title: string
          updated_at: string | null
          user_id: string
          user_last_read_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "chats"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rpc_delete_message: { Args: { p_message_id: string }; Returns: string }
      rpc_edit_message: {
        Args: { p_content: string; p_message_id: string }
        Returns: {
          attachments: Json
          chat_id: string
          client_id: string | null
          content: string | null
          created_at: string
          id: string
          reply_to_id: string | null
          sender_id: string
          updated_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "messages"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rpc_mark_chat_as_read: {
        Args: { p_chat_id: string; p_message_id: string }
        Returns: undefined
      }
      rpc_send_message: {
        Args: {
          p_attachments?: Json
          p_chat_id: string
          p_client_id?: string
          p_content: string
          p_reply_to_id?: string
        }
        Returns: {
          attachments: Json
          chat_id: string
          client_id: string | null
          content: string | null
          created_at: string
          id: string
          reply_to_id: string | null
          sender_id: string
          updated_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "messages"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      search_users: {
        Args: { p_query: string }
        Returns: {
          email: string
          id: string
          image: string
          last_seen: string
          name: string
        }[]
      }
      update_last_seen: { Args: never; Returns: undefined }
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
