export interface ProgressFile {
  github_username: string;
  display_name?: string;
  created_at: string;
  updated_at: string;
  tasks: Record<string, { done: boolean; at?: string }>;
  competency?: string;                // single competency id from the curriculum taxonomy
  competency_set_by?: string;         // github_username of last writer (audit / override trail)
  competency_updated_at?: string;
}
