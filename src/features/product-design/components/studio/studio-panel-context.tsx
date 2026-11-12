"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";

/** What the panel beside the rail can show: the current tool's options, or one of the lists. */
export type StudioPanelId = "tool" | "layers" | "check" | "history";

export type StudioPanelApi = {
  /** The panel that is open, `null` while it is closed. */
  active: StudioPanelId | null;
  /**
   * Opens `id`. `opener`, a control outside the rail (the header's check chip), gets the focus
   * back when the panel closes; without it, the rail item does.
   */
  open(id: StudioPanelId, opener?: HTMLElement | null): void;
  /** Opens `id`, or closes the panel when `id` is the one that is open (a rail item). */
  toggle(id: StudioPanelId): void;
  close(): void;
};

type PanelContext = {
  api: StudioPanelApi;
  railRef: RefObject<HTMLDivElement | null>;
  openerRef: RefObject<HTMLElement | null>;
};

const Context = createContext<PanelContext | null>(null);

/** Holds which panel is open; mounted above the header and the rail, so both can open a panel. */
export function StudioPanelProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState<StudioPanelId | null>(null);
  const railRef = useRef<HTMLDivElement | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const open = useCallback((id: StudioPanelId, opener?: HTMLElement | null) => {
    openerRef.current = opener ?? null;
    setActive(id);
  }, []);
  const toggle = useCallback((id: StudioPanelId) => {
    openerRef.current = null;
    setActive((current) => (current === id ? null : id));
  }, []);
  const close = useCallback(() => setActive(null), []);
  const value = useMemo(
    () => ({ api: { active, open, toggle, close }, railRef, openerRef }),
    [active, open, toggle, close],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

function useContextValue(): PanelContext {
  const value = useContext(Context);
  if (!value) throw new Error("useStudioPanel needs a StudioPanelProvider above it");
  return value;
}

export const useStudioPanel = (): StudioPanelApi => useContextValue().api;

/** The rail's element, which the panel returns focus to when it closes. */
export const useRailRef = (): RefObject<HTMLDivElement | null> => useContextValue().railRef;

/** The control outside the rail that opened the panel (`open(id, opener)`), if one did. */
export const usePanelOpener = (): RefObject<HTMLElement | null> => useContextValue().openerRef;

/** Controls that use Esc themselves (leaving a field, closing a list): it is theirs, not ours. */
const OWNS_ESCAPE =
  "input, textarea, select, [contenteditable]:not([contenteditable='false']), [role='combobox'], [role='textbox'], [role='spinbutton']";

/**
 * `Esc` closes the open panel, unless a field or a popup of its own took the key. Answers whether
 * it closed it, so the caller can put focus back.
 */
export function useEscapeClose(): (event: KeyboardEvent<HTMLElement>) => boolean {
  const { active, close } = useStudioPanel();
  return (event) => {
    if (event.key !== "Escape" || event.defaultPrevented || active === null) return false;
    if (event.target instanceof Element && event.target.closest(OWNS_ESCAPE)) return false;
    event.preventDefault();
    close();
    return true;
  };
}
