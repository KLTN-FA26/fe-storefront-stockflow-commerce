// Ported — same pattern, key prefix differs

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export type TableDensity = "compact" | "normal" | "comfortable";

export interface TablePrefs {
  hiddenColumns: string[];
  density: TableDensity;
}

interface TablePrefsState {
  prefs: Record<string, TablePrefs>;
  getPrefs: (tableId: string) => TablePrefs;
  setHiddenColumns: (tableId: string, cols: string[]) => void;
  toggleColumn: (tableId: string, colKey: string) => void;
  setDensity: (tableId: string, density: TableDensity) => void;
  resetPrefs: (tableId: string) => void;
}

const DEFAULT_PREFS: TablePrefs = { hiddenColumns: [], density: "normal" };
const storageEmpty = { getItem: () => null, setItem: () => {}, removeItem: () => {} } as unknown as Storage;

export const useTablePrefs = create<TablePrefsState>()(
  persist(
    (set, get) => ({
      prefs: {},
      getPrefs: (tableId) => get().prefs[tableId] ?? DEFAULT_PREFS,
      setHiddenColumns: (tableId, cols) =>
        set((s) => ({
          prefs: { ...s.prefs, [tableId]: { ...(s.prefs[tableId] ?? DEFAULT_PREFS), hiddenColumns: cols } },
        })),
      toggleColumn: (tableId, colKey) =>
        set((s) => {
          const current = s.prefs[tableId] ?? DEFAULT_PREFS;
          const hidden = current.hiddenColumns.includes(colKey)
            ? current.hiddenColumns.filter((c) => c !== colKey)
            : [...current.hiddenColumns, colKey];
          return { prefs: { ...s.prefs, [tableId]: { ...current, hiddenColumns: hidden } } };
        }),
      setDensity: (tableId, density) =>
        set((s) => ({
          prefs: { ...s.prefs, [tableId]: { ...(s.prefs[tableId] ?? DEFAULT_PREFS), density } },
        })),
      resetPrefs: (tableId) =>
        set((s) => {
          const rest = { ...s.prefs };
          delete rest[tableId];
          return { prefs: rest };
        }),
    }),
    {
      name: "stockflow-storefront-table-prefs",
      storage: createJSONStorage(() =>
        typeof window !== "undefined" ? localStorage : (storageEmpty as unknown as Storage),
      ),
    },
  ),
);
