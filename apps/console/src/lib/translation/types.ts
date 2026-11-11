export type ShownKind = "pin" | "top" | "mac";

export interface LanguageRow {
  code: string; native_name: string; english_name: string; date_tag: string; featured: boolean; is_source: boolean;
  machine_status: "none" | "pending" | "done" | "unavailable";
  total: number; pinned: number; voted: number; machine: number; reviewer_name: string | null; is_reviewer: boolean;
}
export interface WorkspaceRow { string_key: string; source_text: string; shown_text: string | null; kind: ShownKind | null; suggestion_count: number; position: number }
export interface SuggestionRow {
  id: string; text: string; origin: "machine" | "user"; author_name: string | null; i_voted: boolean; is_mine: boolean;
  /** Only reviewers get vote counts; everyone else gets null. */
  votes: number | null; is_pinned: boolean; is_shown: boolean; kind: ShownKind | null;
}
export interface QueueRow { string_key: string; source_text: string; shown_text: string | null; kind: ShownKind | null; suggestion_count: number; tied: boolean; differs: boolean }
export interface MyStats { suggestions: number; votes: number; shown: number }

/** The {tokens} of a text, sorted and distinct. Mirrors the database check so people see the problem before sending. */
export const tokensOf = (s: string) => [...new Set(s.match(/\{[A-Za-z0-9_]+\}/g) ?? [])].sort();
export const sameTokens = (a: string, b: string) => tokensOf(a).join() === tokensOf(b).join();
