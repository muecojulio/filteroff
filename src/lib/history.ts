export type HistoryItem = {
  id: string;
  at: number;
  kind: "photo" | "video";
  label: string;
  engine: "local" | "free" | "cloud";
  thumb: string;
};

const KEY = "filteroff.history.v1";
const MAX = 8;

export function readHistory(): HistoryItem[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isItem).slice(0, MAX);
  } catch {
    return [];
  }
}

export function writeHistory(items: HistoryItem[]) {
  const next = items.slice(0, MAX);
  localStorage.setItem(KEY, JSON.stringify(next));
  return next;
}

export function clearHistory() {
  localStorage.removeItem(KEY);
}

function isItem(value: unknown): value is HistoryItem {
  if (!value || typeof value !== "object") return false;
  const row = value as HistoryItem;
  return (
    typeof row.id === "string" &&
    typeof row.at === "number" &&
    (row.kind === "photo" || row.kind === "video") &&
    typeof row.label === "string" &&
    (row.engine === "local" || row.engine === "free" || row.engine === "cloud") &&
    typeof row.thumb === "string" &&
    row.thumb.startsWith("data:image/")
  );
}
