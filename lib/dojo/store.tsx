"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  SPACES,
  type DojoEntry,
  type GuangfaKey,
  type GuangxingKey,
  type SpaceKey,
} from "./constants";
import { taipeiTodayISO } from "./formal";

type NewEntry = Omit<DojoEntry, "id" | "date" | "createdAt" | "updatedAt"> & { date?: string };

export type QuickAddOptions = {
  editId?: string;
  presetSpace?: SpaceKey;
  presetKind?: string;
  presetDate?: string;
  mode?: "record" | "calendar";
};

export type TimerConfig = {
  space: SpaceKey;
  kind: string;
  title: string;
  guangxing: GuangxingKey | null;
  guangfa: GuangfaKey | null;
};

const DEFAULT_TIMER_CONFIG: TimerConfig = {
  space: "practice",
  kind: "修行計時",
  title: "一段修行",
  guangxing: null,
  guangfa: null,
};

export type StartTimerParams = {
  space: SpaceKey;
  title: string;
  kind: string;
  guangxing?: GuangxingKey | null;
  guangfa?: GuangfaKey | null;
};

type DojoStore = {
  entries: DojoEntry[];
  entriesLoading: boolean;
  entriesError: string | null;
  refreshEntries: () => Promise<void>;
  addEntry: (entry: NewEntry) => Promise<DojoEntry>;
  updateEntry: (id: string, entry: NewEntry) => Promise<DojoEntry>;
  removeEntry: (id: string) => Promise<void>;
  setEntryFreq: (id: string, freq: number | null) => Promise<void>;
  setEntryIntensity: (id: string, intensity: number | null) => Promise<void>;
  modalOpen: boolean;
  modalOptions: QuickAddOptions;
  openQuickAdd: (opts?: QuickAddOptions) => void;
  closeQuickAdd: () => void;
  timerConfig: TimerConfig;
  setTimerConfig: (config: TimerConfig) => void;
  startTimerFromSpace: (space: SpaceKey) => void;
  startTimerWith: (params: StartTimerParams) => void;
};

const DojoContext = createContext<DojoStore | null>(null);

function editablePayload(entry: DojoEntry): NewEntry {
  return {
    title: entry.title,
    space: entry.space,
    kind: entry.kind,
    privacy: entry.privacy,
    note: entry.note,
    date: entry.date,
    guangxing: entry.guangxing,
    guangfa: entry.guangfa,
    freq: entry.freq,
    intensity: entry.intensity,
    sourceType: entry.sourceType,
    traceLevel: entry.traceLevel,
    traceStatus: entry.traceStatus,
    viewCount: entry.viewCount,
    traceId: entry.traceId,
  };
}

async function responseJson<T>(response: Response): Promise<T> {
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((json as { error?: string }).error ?? `儲存失敗（${response.status}）`);
  }
  return json as T;
}

export function DojoProvider({ children }: { children: ReactNode }) {
  const [entries, setEntries] = useState<DojoEntry[]>([]);
  const [entriesLoading, setEntriesLoading] = useState(true);
  const [entriesError, setEntriesError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalOptions, setModalOptions] = useState<QuickAddOptions>({});
  const [timerConfig, setTimerConfig] = useState<TimerConfig>(DEFAULT_TIMER_CONFIG);

  const refreshEntries = useCallback(async () => {
    setEntriesLoading(true);
    setEntriesError(null);
    try {
      const response = await fetch("/api/dojo/entries", { cache: "no-store" });
      const json = await responseJson<{ entries: DojoEntry[] }>(response);
      setEntries(json.entries ?? []);
    } catch (error) {
      setEntriesError(error instanceof Error ? error.message : String(error));
    } finally {
      setEntriesLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void refreshEntries(), 0);
    return () => window.clearTimeout(timer);
  }, [refreshEntries]);

  const addEntry = useCallback(async (entry: NewEntry) => {
    const response = await fetch("/api/dojo/entries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...entry, date: entry.date ?? taipeiTodayISO() }),
    });
    const json = await responseJson<{ entry: DojoEntry }>(response);
    setEntries((previous) => [json.entry, ...previous.filter((item) => item.id !== json.entry.id)]);
    return json.entry;
  }, []);

  const updateEntry = useCallback(async (id: string, entry: NewEntry) => {
    const response = await fetch("/api/dojo/entries", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, entry }),
    });
    const json = await responseJson<{ entry: DojoEntry }>(response);
    setEntries((previous) => previous.map((item) => (item.id === id ? json.entry : item)));
    return json.entry;
  }, []);

  const removeEntry = useCallback(async (id: string) => {
    const response = await fetch(`/api/dojo/entries?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    await responseJson<{ ok: true }>(response);
    setEntries((previous) => previous.filter((item) => item.id !== id));
  }, []);

  const setEntryFreq = useCallback(
    async (id: string, freq: number | null) => {
      const target = entries.find((entry) => entry.id === id);
      if (!target || id.startsWith("trace:")) return;
      await updateEntry(id, { ...editablePayload(target), freq: freq ?? undefined });
    },
    [entries, updateEntry]
  );

  const setEntryIntensity = useCallback(
    async (id: string, intensity: number | null) => {
      const target = entries.find((entry) => entry.id === id);
      if (!target || id.startsWith("trace:")) return;
      await updateEntry(id, { ...editablePayload(target), intensity: intensity ?? undefined });
    },
    [entries, updateEntry]
  );

  const openQuickAdd = useCallback((options: QuickAddOptions = {}) => {
    setModalOptions(options);
    setModalOpen(true);
  }, []);

  const closeQuickAdd = useCallback(() => setModalOpen(false), []);

  const startTimerFromSpace = useCallback((space: SpaceKey) => {
    setTimerConfig((previous) => ({
      ...previous,
      space,
      title: previous.title === "一段修行" ? `${SPACES[space][0]}：一段修行` : previous.title,
    }));
  }, []);

  const startTimerWith = useCallback((params: StartTimerParams) => {
    setTimerConfig({
      space: params.space,
      title: params.title,
      kind: params.kind,
      guangxing: params.guangxing ?? null,
      guangfa: params.guangfa ?? null,
    });
  }, []);

  const value = useMemo(
    () => ({
      entries,
      entriesLoading,
      entriesError,
      refreshEntries,
      addEntry,
      updateEntry,
      removeEntry,
      setEntryFreq,
      setEntryIntensity,
      modalOpen,
      modalOptions,
      openQuickAdd,
      closeQuickAdd,
      timerConfig,
      setTimerConfig,
      startTimerFromSpace,
      startTimerWith,
    }),
    [
      entries,
      entriesLoading,
      entriesError,
      refreshEntries,
      addEntry,
      updateEntry,
      removeEntry,
      setEntryFreq,
      setEntryIntensity,
      modalOpen,
      modalOptions,
      openQuickAdd,
      closeQuickAdd,
      timerConfig,
      startTimerFromSpace,
      startTimerWith,
    ]
  );

  return <DojoContext.Provider value={value}>{children}</DojoContext.Provider>;
}

export function useDojo(): DojoStore {
  const context = useContext(DojoContext);
  if (!context) throw new Error("useDojo() 必須在 <DojoProvider> 內使用");
  return context;
}
