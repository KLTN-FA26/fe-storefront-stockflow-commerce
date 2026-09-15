"use client";

import {
  createContext,
  useContext,
  useEffect,
  useCallback,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import { useAppStore } from "@/lib/store/use-app-store";

export type ColorTheme = "light" | "dark";
type ThemePreference = ColorTheme | "system";

interface ThemeContextValue {
  theme: ColorTheme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const APP_STORE_KEY = "stockflow-storefront-app";

const DARK_MEDIA_QUERY = "(prefers-color-scheme: dark)";

const THEME_INIT_SCRIPT = `
(function(){
  try{
    var stored = localStorage.getItem('${APP_STORE_KEY}');
    var pref = 'system';
    if (stored) {
      var parsed = JSON.parse(stored);
      pref = (parsed && parsed.state && parsed.state.theme) || 'system';
    }
    var resolved = pref === 'system'
      ? (matchMedia('${DARK_MEDIA_QUERY}').matches ? 'dark' : 'light')
      : pref;
    document.documentElement.setAttribute('data-theme', resolved);
    document.documentElement.classList.toggle('dark', resolved === 'dark');
  }catch(e){}
})();
`;

function disableTransitionsWhile(fn: () => void) {
  const el = document.documentElement;
  el.classList.add("no-transitions");
  fn();
  void el.offsetHeight;
  requestAnimationFrame(() => {
    el.classList.remove("no-transitions");
  });
}

function applyTheme(resolved: ColorTheme) {
  disableTransitionsWhile(() => {
    const el = document.documentElement;
    el.dataset.theme = resolved;
    el.classList.toggle("dark", resolved === "dark");
  });
}

function subscribeToSystemScheme(onChange: () => void) {
  if (typeof window === "undefined") return () => {};
  const media = window.matchMedia(DARK_MEDIA_QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

function getSystemSchemeSnapshot(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia(DARK_MEDIA_QUERY).matches;
}

function getSystemSchemeServerSnapshot(): boolean {
  return false;
}

function resolveTheme(preference: ThemePreference, systemPrefersDark: boolean): ColorTheme {
  if (preference !== "system") return preference;
  return systemPrefersDark ? "dark" : "light";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const preference = useAppStore((state) => state.theme);
  const setPreference = useAppStore((state) => state.setTheme);

  const systemPrefersDark = useSyncExternalStore(
    subscribeToSystemScheme,
    getSystemSchemeSnapshot,
    getSystemSchemeServerSnapshot,
  );

  const theme = resolveTheme(preference, systemPrefersDark);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setPreference(theme === "dark" ? "light" : "dark");
  }, [theme, setPreference]);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within <ThemeProvider>");
  return ctx;
}
