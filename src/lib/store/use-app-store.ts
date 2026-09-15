// Ported from stockflow-ui — storefront uses same app store (no sidebar in storefront but keep flag for compatibility)

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export type WarehouseId = string;

export interface AppState {
  warehouseId: WarehouseId | null;
  setWarehouseId: (id: WarehouseId | null) => void;
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  theme: "light" | "dark" | "system";
  setTheme: (t: "light" | "dark" | "system") => void;
  locale: "vi" | "en";
  setLocale: (l: "vi" | "en") => void;
  muted: boolean;
  toggleMuted: () => void;
}

const storageEmpty = { getItem: () => null, setItem: () => {}, removeItem: () => {} } as unknown as Storage;

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      warehouseId: null,
      setWarehouseId: (id) => set({ warehouseId: id }),
      sidebarCollapsed: false,
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      theme: "system",
      setTheme: (theme) => set({ theme }),
      locale: "vi",
      setLocale: (locale) => set({ locale }),
      muted: false,
      toggleMuted: () => set((s) => ({ muted: !s.muted })),
    }),
    {
      name: "stockflow-storefront-app",
      storage: createJSONStorage(() =>
        typeof window !== "undefined" ? localStorage : (storageEmpty as unknown as Storage),
      ),
      partialize: (state) => ({
        warehouseId: state.warehouseId,
        sidebarCollapsed: state.sidebarCollapsed,
        theme: state.theme,
        locale: state.locale,
        muted: state.muted,
      }),
    },
  ),
);
