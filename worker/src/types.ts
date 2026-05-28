export interface ProgressFile {
  github_username: string;
  display_name?: string;
  created_at: string;
  updated_at: string;
  tasks: Record<string, { done: boolean; at?: string }>;
}
