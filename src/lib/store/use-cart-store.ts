import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { z } from "zod";

import { STORAGE_KEYS } from "@/constants/storage-keys";

/**
 * Client cart. The BE has no cart API (the `ordering.cart` tables exist, no controller), and
 * kltn-docs 14 §4.2 describes a quick order by SKU and quantity, so the basket lives in the
 * browser and becomes one POST /orders at checkout. A line holds only what is needed to name it
 * and to ask the BE about it; the price and the stock are always read live (kltn-docs 13 BR-02).
 */

/** Far above any wholesale order; keeps totals exact in a JS number and inside the BE's int. */
export const CART_QUANTITY_MAX = 1_000_000;

export const cartLineSchema = z.object({
  // Upper-case, like every SKU the BE answers with.
  sku: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .transform((sku) => sku.toUpperCase()),
  slug: z.string().min(1),
  title: z.string().min(1),
  // Only to draw the line; the BE never sees it. Absent when the product had no picture.
  imageUrl: z.string().min(1).optional(),
  quantity: z.number().int().min(1).max(CART_QUANTITY_MAX),
});
export type CartLine = z.infer<typeof cartLineSchema>;

const persistedSchema = z.object({
  ownerId: z.string().nullable().catch(null),
  // One bad line (an edited or older entry) is dropped instead of losing the whole cart.
  lines: z.array(z.unknown()).catch([]),
});

/** What survives a reload: valid lines only, one per SKU. */
export function parsePersistedCart(raw: unknown): { ownerId: string | null; lines: CartLine[] } {
  const persisted = persistedSchema.safeParse(raw);
  if (!persisted.success) return { ownerId: null, lines: [] };
  const bySku = new Map<string, CartLine>();
  for (const candidate of persisted.data.lines) {
    const line = cartLineSchema.safeParse(candidate);
    if (line.success && !bySku.has(line.data.sku)) bySku.set(line.data.sku, line.data);
  }
  return { ownerId: persisted.data.ownerId, lines: [...bySku.values()] };
}

const clampQuantity = (quantity: number) =>
  Math.min(Math.max(Math.trunc(quantity) || 1, 1), CART_QUANTITY_MAX);

interface CartState {
  /** The signed-in account the lines were added under; a different account starts empty. */
  ownerId: string | null;
  lines: CartLine[];
  add: (line: Omit<CartLine, "quantity">, quantity: number) => void;
  setQuantity: (sku: string, quantity: number) => void;
  remove: (sku: string) => void;
  clear: () => void;
  bindOwner: (userId: string) => void;
}

const sameSku = (a: string, b: string) => a.toUpperCase() === b.toUpperCase();

const noStorage = { getItem: () => null, setItem: () => undefined, removeItem: () => undefined };

export const useCartStore = create<CartState>()(
  persist(
    (set) => ({
      ownerId: null,
      lines: [],
      add: (line, quantity) =>
        set((state) => {
          const sku = line.sku.toUpperCase();
          const existing = state.lines.find((l) => sameSku(l.sku, sku));
          if (!existing) {
            return { lines: [...state.lines, { ...line, sku, quantity: clampQuantity(quantity) }] };
          }
          return {
            lines: state.lines.map((l) =>
              l === existing ? { ...l, quantity: clampQuantity(l.quantity + quantity) } : l,
            ),
          };
        }),
      setQuantity: (sku, quantity) =>
        set((state) => ({
          lines: state.lines.map((l) =>
            sameSku(l.sku, sku) ? { ...l, quantity: clampQuantity(quantity) } : l,
          ),
        })),
      remove: (sku) => set((state) => ({ lines: state.lines.filter((l) => !sameSku(l.sku, sku)) })),
      clear: () => set({ lines: [] }),
      bindOwner: (userId) =>
        set((state) =>
          state.ownerId === userId
            ? state
            : // Lines of another account must never reach this one's checkout.
              { ownerId: userId, lines: state.ownerId === null ? state.lines : [] },
        ),
    }),
    {
      name: STORAGE_KEYS.storefrontCart,
      version: 1,
      storage: createJSONStorage(() => (typeof window !== "undefined" ? localStorage : noStorage)),
      partialize: (state) => ({ ownerId: state.ownerId, lines: state.lines }),
      merge: (persisted, current) => ({ ...current, ...parsePersistedCart(persisted) }),
    },
  ),
);

export const selectLineCount = (state: Pick<CartState, "lines">) => state.lines.length;
