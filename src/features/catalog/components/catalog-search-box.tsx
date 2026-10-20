"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";

import { STORE_ROUTES } from "@/constants";
import { cn } from "@/lib/cn";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { hasErrorCode } from "@/lib/api/describe-error";
import { useSignedIn } from "@/lib/auth/use-signed-in";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { CATALOG_QUERY_MAX, suggestionQueryOf } from "../schemas";
import { useSearchSuggestions } from "../queries";
import type { SearchSuggestion } from "../types";

const NO_SUGGESTIONS: SearchSuggestion[] = [];

/**
 * The header search box with title completions (GET /catalog/search/suggestions). Without a
 * session the box still searches (the search page asks to sign in), it just has no
 * completions: the BE answers them to signed-in callers only. Results open on /search?q=; without
 * JS it is a plain GET form to the same page.
 */
export function CatalogSearchBox({ className }: { className?: string | undefined }) {
  const router = useRouter();
  const listId = useId();
  const signedIn = useSignedIn();
  const [value, setValue] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const text = useDebouncedValue(value, 250).trim();
  const { data, error, isPlaceholderData } = useSearchSuggestions(text, signedIn === true && open);
  // Past 30 calls per 10 s the BE answers 429 RATE_LIMITED: keep the last list it answered
  // (SCRUM-469; contract in the SCRUM-170 comment). Any other failure shows none.
  const [held, setHeld] = useState<SearchSuggestion[]>(NO_SUGGESTIONS);
  if (data && !isPlaceholderData && data !== held) setHeld(data);
  const found = data ?? (hasErrorCode(error, "RATE_LIMITED") ? held : NO_SUGGESTIONS);
  const suggestions = suggestionQueryOf(text) && value.trim() === text ? found : [];
  const expanded = open && suggestions.length > 0;

  const go = (href: string) => {
    setOpen(false);
    setActive(-1);
    router.push(href);
  };
  const search = () => {
    const q = [...value.trim()].slice(0, CATALOG_QUERY_MAX).join("");
    go(q ? `${STORE_ROUTES.catalog.search}?q=${encodeURIComponent(q)}` : STORE_ROUTES.catalog.list);
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
        onFocus={() => setOpen(true)}
        onKeyDown={(event) => {
          if (event.key === "Escape") setOpen(false);
          else if (event.key === "ArrowDown" && suggestions.length > 0) {
            event.preventDefault();
            setOpen(true);
            setActive((i) => (i + 1) % suggestions.length);
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
            key={`${suggestion.slug}-${suggestion.sku}`}
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
            <span className="text-ink-tertiary shrink-0 font-mono text-xs">{suggestion.sku}</span>
          </li>
        ))}
      </ul>
    </form>
  );
}
