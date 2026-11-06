export interface WhisperDraft { text: string; version: number; label: string }
export type WhisperDrafts = Record<string, WhisperDraft>;
export function editDraft(drafts: WhisperDrafts, id: string, text: string, label: string): WhisperDrafts {
  return { ...drafts, [id]: { text, label, version: (drafts[id]?.version ?? 0) + 1 } };
}
export function acknowledgeDraft(drafts: WhisperDrafts, id: string, version: number): WhisperDrafts {
  const draft = drafts[id];
  return draft?.version === version ? { ...drafts, [id]: { ...draft, text: "", version: version + 1 } } : drafts;
}
