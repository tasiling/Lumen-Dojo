export type Depth = "light" | "moderate" | "deep";
export type Question = { id: string; text: string };
export type ReflectionTool = { id: string; name: string; version: number; hint: string; questions: Question[]; modes: Record<Depth, string[]> };
export type RoleSnapshot = { id: string; title: string; traits: string[]; updatedAt: string };
export type DailySource = { id: string; date: string; field: "highlight" | "block" | "insight"; revision: string; excerpt: string };
export type ReflectionNote = {
  version: 1; id: string; owner: string; revision: number; requestFingerprint: string;
  toolId: string; toolName: string; toolVersion: number; questions: Question[]; modes: Record<Depth, string[]>;
  title: string; date: string; depth: Depth; status: "draft" | "pending" | "completed";
  answers: Record<string, string>; topicGroup: string; source: DailySource | null; sourceNote: string;
  roleSnapshot: RoleSnapshot | null; emotionChoices: string[]; needChoices: string[]; lightTags: string[];
  createdAt: string; updatedAt: string;
};
export type ReflectionMetadata = Pick<ReflectionNote, "id" | "title" | "date" | "toolId" | "toolName" | "toolVersion" | "status" | "topicGroup" | "updatedAt">;
export interface ReflectionRepository {
  get(id: string): Promise<ReflectionNote | null>;
  list(): Promise<ReflectionNote[]>;
  write(note: ReflectionNote): Promise<void>;
  exclusive<T>(fn: () => Promise<T>): Promise<T>;
}
