"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";

import { STORE_ROUTES } from "@/constants";
import { cn } from "@/lib/cn";
import { useSignedIn } from "@/lib/auth/use-signed-in";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { useCurrentSearch } from "../current-search-store";
import { CATALOG_QUERY_MAX } from "../schemas";
import { useCompletions } from "../use-completions";

/**
 * The header search box with title completions (GET /catalog/search/suggestions). Without a
 * session the box still searches (the search page asks to sign in), it just has no
 * completions: the BE answers them to signed-in callers only. Results open on /search?q=; without
 * JS it is a plain GET form to the same page. On /search it shows the text searched (the page
 * tells it, see current-search-store), and a new text keeps the chosen sort.
 */
export function CatalogSearchBox({ className }: { className?: string | undefined }) {
  const router = useRouter();
  const listId = useId();
  const signedIn = useSignedIn();
  const current = useCurrentSearch();
  const seed = current?.q ?? "";
  const [value, setValue] = useState(seed);
  const [seededWith, setSeededWith] = useState(seed);
  if (seed !== seededWith) {
    // The page shows another search (a submit, a link, Back): show its text. Leaving /search or
    // clearing the text only empties the box if the customer had not typed something else.
    setSeededWith(seed);
    if (seed || value === seededWith) setValue(seed);
  }
  const [open, setOpen] = useState(false);
  const { suggestions, active, setActive } = useCompletions(value, signedIn === true && open);
  const expanded = open && suggestions.length > 0;

  const go = (href: string) => {
    setOpen(false);
    setActive(-1);
    router.push(href);
  };
  const search = () => {
    const q = [...value.trim()].slice(0, CATALOG_QUERY_MAX).join("");
    if (!q) return go(current ? STORE_ROUTES.catalog.search : STORE_ROUTES.catalog.list);
    const sort = current?.sort ? `&sort=${encodeURIComponent(current.sort)}` : "";
    go(`${STORE_ROUTES.catalog.search}?q=${encodeURIComponent(q)}${sort}`);
  };

  return (
    <form
      role="search"
      method="get"
      action={STORE_ROUTES.catalog.search}
      onSubmit={(event) => {
        event.preventDefault();
        const chosen = suggestions[active];
        if (chosen) go(STORE_ROUTES.catalog.detail(chosen.slug));
        else search();
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
      className={cn(
        "bg-bg-subtle ring-border-default focus-within:ring-accent relative flex h-11 w-full items-center rounded-[var(--r-md)] ring-1 ring-inset focus-within:ring-2",
        className,
      )}
    >
      <Input
        type="search"
        name="q"
        role="combobox"
        aria-label="Tìm sản phẩm"
        aria-expanded={expanded}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={expanded && active >= 0 ? `${listId}-${active}` : undefined}
        autoComplete="off"
        maxLength={CATALOG_QUERY_MAX}
        placeholder="Tìm sản phẩm theo tên…"
        value={value}
        onChange={(event) => {
          setValue(event.target.value);
          setOpen(true);
          setActive(-1);
        }}
        // The text already searched needs no completions: they open once it is edited.
        onFocus={() => setOpen(value.trim() !== seed.trim())}
        onKeyDown={(event) => {
          if (event.key === "Escape") setOpen(false);
          else if (event.key === "ArrowDown" && (!open || suggestions.length > 0)) {
            // A closed box opens first (e.g. the text shown on /search), then moves down the list.
            event.preventDefault();
            if (!open) setOpen(true);
            else setActive((i) => (i + 1) % suggestions.length);
          } else if (event.key === "ArrowUp" && suggestions.length > 0) {
            event.preventDefault();
            setActive((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
          }
        }}
        className="text-ink-primary placeholder:text-ink-tertiary h-full flex-1 rounded-[var(--r-md)] border-0 bg-transparent pl-3 shadow-none focus-visible:ring-0 dark:bg-transparent"
      />
      <Button
        type="submit"
        variant="ghost"
        aria-label="Tìm kiếm"
        className="text-ink-secondary hover:text-ink-primary focus-visible:ring-accent size-11 shrink-0 rounded-[var(--r-md)] focus-visible:ring-2"
      >
        <Search className="size-5" aria-hidden="true" />
      </Button>
      <ul
        id={listId}
        role="listbox"
        aria-label="Gợi ý sản phẩm"
        hidden={!expanded}
        className="bg-bg-surface border-border-default absolute top-full right-0 left-0 z-50 mt-1 overflow-hidden rounded-[var(--r-md)] border shadow-[var(--sh-md)]"
      >
        {suggestions.map((suggestion, index) => (
          <li
            key={`${suggestion.slug}-${suggestion.sku ?? ""}`}
            id={`${listId}-${index}`}
            role="option"
            aria-selected={index === active}
            className={cn(
              "flex min-h-11 cursor-pointer items-center justify-between gap-3 px-3 text-sm",
              index === active ? "bg-bg-muted" : "hover:bg-bg-subtle",
            )}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => go(STORE_ROUTES.catalog.detail(suggestion.slug))}
          >
            <span className="text-ink-primary truncate">{suggestion.title}</span>
            {suggestion.sku ? (
              <span className="text-ink-tertiary shrink-0 font-mono text-xs">{suggestion.sku}</span>
            ) : null}
          </li>
        ))}
      </ul>
    </form>
  );
}
