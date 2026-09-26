export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: {
          extensions?: Json;
          operationName?: string;
          query?: string;
          variables?: Json;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      assignment_items: {
        Row: {
          activity_contract_version: number;
          activity_key: string;
          assignment_id: string;
          created_at: string;
          id: string;
          position: number;
          problem_count: number;
          updated_at: string;
        };
        Insert: {
          activity_contract_version?: number;
          activity_key: string;
          assignment_id: string;
          created_at?: string;
          id?: string;
          position: number;
          problem_count: number;
          updated_at?: string;
        };
        Update: {
          activity_contract_version?: number;
          activity_key?: string;
          assignment_id?: string;
          created_at?: string;
          id?: string;
          position?: number;
          problem_count?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'assignment_items_assignment_id_fkey';
            columns: ['assignment_id'];
            isOneToOne: false;
            referencedRelation: 'assignments';
            referencedColumns: ['id'];
          },
        ];
      };
      assignment_problem_results: {
        Row: {
          assignment_item_id: string;
          attempts: number;
          client_result_id: string;
          client_timestamp_ms: number;
          created_at: string;
          family: string;
          grade_points: number | null;
          id: string;
          outcome: string;
          problem_ordinal: number;
          schema_version: number;
          skill_id: string;
          source_difficulty: string;
          student_user_id: string;
          surrenders: number;
          technique: string;
          tier: number;
          time_seconds: number;
          variant: string;
        };
        Insert: {
          assignment_item_id: string;
          attempts: number;
          client_result_id: string;
          client_timestamp_ms: number;
          created_at?: string;
          family: string;
          grade_points?: number | null;
          id?: string;
          outcome: string;
          problem_ordinal: number;
          schema_version?: number;
          skill_id: string;
          source_difficulty: string;
          student_user_id: string;
          surrenders: number;
          technique: string;
          tier: number;
          time_seconds: number;
          variant: string;
        };
        Update: {
          assignment_item_id?: string;
          attempts?: number;
          client_result_id?: string;
          client_timestamp_ms?: number;
          created_at?: string;
          family?: string;
          grade_points?: number | null;
          id?: string;
          outcome?: string;
          problem_ordinal?: number;
          schema_version?: number;
          skill_id?: string;
          source_difficulty?: string;
          student_user_id?: string;
          surrenders?: number;
          technique?: string;
          tier?: number;
          time_seconds?: number;
          variant?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'assignment_problem_results_assignment_item_id_fkey';
            columns: ['assignment_item_id'];
            isOneToOne: false;
            referencedRelation: 'assignment_items';
            referencedColumns: ['id'];
          },
        ];
      };
      assignments: {
        Row: {
          class_id: string;
          created_at: string;
          created_by: string | null;
          due_at: string | null;
          id: string;
          published_at: string | null;
          status: string;
          title: string;
          updated_at: string;
        };
        Insert: {
          class_id: string;
          created_at?: string;
          created_by?: string | null;
          due_at?: string | null;
          id?: string;
          published_at?: string | null;
          status?: string;
          title: string;
          updated_at?: string;
        };
        Update: {
          class_id?: string;
          created_at?: string;
          created_by?: string | null;
          due_at?: string | null;
          id?: string;
          published_at?: string | null;
          status?: string;
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'assignments_class_id_fkey';
            columns: ['class_id'];
            isOneToOne: false;
            referencedRelation: 'classes';
            referencedColumns: ['id'];
          },
        ];
      };
      class_enrollments: {
        Row: {
          class_id: string;
          joined_at: string;
          status: string;
          student_user_id: string;
          updated_at: string;
        };
        Insert: {
          class_id: string;
          joined_at?: string;
          status?: string;
          student_user_id: string;
          updated_at?: string;
        };
        Update: {
          class_id?: string;
          joined_at?: string;
          status?: string;
          student_user_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'class_enrollments_class_id_fkey';
            columns: ['class_id'];
            isOneToOne: false;
            referencedRelation: 'classes';
            referencedColumns: ['id'];
          },
        ];
      };
      classes: {
        Row: {
          created_at: string;
          created_by: string | null;
          id: string;
          join_code: string;
          name: string;
          status: string;
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          join_code?: string;
          name: string;
          status?: string;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          join_code?: string;
          name?: string;
          status?: string;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'classes_workspace_id_fkey';
            columns: ['workspace_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      workspace_members: {
        Row: {
          created_at: string;
          role: string;
          user_id: string;
          workspace_id: string;
        };
        Insert: {
          created_at?: string;
          role: string;
          user_id: string;
          workspace_id: string;
        };
        Update: {
          created_at?: string;
          role?: string;
          user_id?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'workspace_members_workspace_id_fkey';
            columns: ['workspace_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      workspaces: {
        Row: {
          created_at: string;
          created_by: string | null;
          id: string;
          name: string;
          personal_owner_user_id: string | null;
          status: string;
          updated_at: string;
          workspace_type: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          name: string;
          personal_owner_user_id?: string | null;
          status?: string;
          updated_at?: string;
          workspace_type: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          name?: string;
          personal_owner_user_id?: string | null;
          status?: string;
          updated_at?: string;
          workspace_type?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      archive_assignment: {
        Args: { p_assignment_id: string };
        Returns: {
          class_id: string;
          created_at: string;
          due_at: string;
          id: string;
          published_at: string;
          status: string;
          title: string;
          updated_at: string;
        }[];
      };
      discard_assignment: {
        Args: { p_assignment_id: string };
        Returns: undefined;
      };
      ensure_personal_workspace: {
        Args: never;
        Returns: {
          name: string;
          status: string;
          workspace_id: string;
          workspace_type: string;
        }[];
      };
      get_assignment_student_progress: {
        Args: { p_assignment_id: string };
        Returns: {
          completed_problem_count: number;
          last_activity_at: string;
          progress_status: string;
          student_email: string;
          student_user_id: string;
          total_problem_count: number;
        }[];
      };
      get_assignment_analytics: {
        Args: { p_assignment_id: string };
        Returns: Json;
      };
      get_class_join_code: { Args: { p_class_id: string }; Returns: string };
      join_class_by_code: {
        Args: { p_code: string };
        Returns: {
          class_id: string;
          class_name: string;
          enrollment_status: string;
          workspace_id: string;
        }[];
      };
      publish_assignment: {
        Args: { p_assignment_id: string };
        Returns: {
          class_id: string;
          created_at: string;
          due_at: string;
          id: string;
          published_at: string;
          status: string;
          title: string;
          updated_at: string;
        }[];
      };
      reactivate_assignment: {
        Args: { p_assignment_id: string };
        Returns: {
          class_id: string;
          created_at: string;
          due_at: string;
          id: string;
          published_at: string;
          status: string;
          title: string;
          updated_at: string;
        }[];
      };
      record_assignment_problem_result: {
        Args: {
          p_assignment_item_id: string;
          p_attempts: number;
          p_client_result_id: string;
          p_client_timestamp_ms: number;
          p_family: string;
          p_grade_points: number;
          p_outcome: string;
          p_problem_ordinal: number;
          p_schema_version?: number;
          p_skill_id: string;
          p_source_difficulty: string;
          p_surrenders: number;
          p_technique: string;
          p_tier: number;
          p_time_seconds: number;
          p_variant: string;
        };
        Returns: string;
      };
      reorder_assignment_items: {
        Args: { p_assignment_id: string; p_item_ids: string[] };
        Returns: undefined;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  'public'
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] &
        DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] &
        DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema['Enums'] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema['CompositeTypes']
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const;
