export const WORKSPACES = ["learning", "manage", "legacy", "journal", "body", "emotion", "intention", "spirit", "context", "grammar", "topic", "rhythm", "vocabulary", "logs", "atlas"] as const;
export function legacyPracticeTarget(params: Record<string, string | string[] | undefined>) {
  const workspace = params.journal ? "journal" : params.manifestation ? "intention" : params.vision ? "spirit" : params.learningItem ? "learning" : null;
  if (!workspace) return null;
  const query = new URLSearchParams();
  for (const [key,value] of Object.entries(params)) for (const v of Array.isArray(value) ? value : value === undefined ? [] : [value]) query.append(key,v);
  return `/practice/${workspace}?${query}`;
}
export function canLeavePractice() {
  return window.dispatchEvent(new Event("practice-before-leave", {cancelable:true}));
}
