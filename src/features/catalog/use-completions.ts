"use client";

import { useState } from "react";

import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { hasErrorCode } from "@/lib/api/describe-error";

import { useSearchSuggestions } from "./queries";
import { suggestionQueryOf } from "./schemas";
import type { SearchSuggestion } from "./types";

const NO_SUGGESTIONS: SearchSuggestion[] = [];

/**
 * The completions the search box shows for what is typed, and the highlighted one. Client-only
 * (state), so it stays out of the feature barrel, which Server Components import.
 *
 * - Asked 250 ms after typing stops (SCRUM-469).
 * - Past 30 calls per 10 s the BE answers 429 RATE_LIMITED: the last list it answered stays on
 *   screen (SCRUM-469; contract in the SCRUM-170 comment). Any other failure shows none.
 * - A new list drops the highlight, so Enter never opens an option the customer did not see.
 */
export function useCompletions(value: string, enabled: boolean) {
  const text = useDebouncedValue(value, 250).trim();
  const { data, error, isPlaceholderData } = useSearchSuggestions(text, enabled);

  const [held, setHeld] = useState<SearchSuggestion[]>(NO_SUGGESTIONS);
  if (data && !isPlaceholderData && data !== held) setHeld(data);
  const found = data ?? (hasErrorCode(error, "RATE_LIMITED") ? held : NO_SUGGESTIONS);

  const [active, setActive] = useState(-1);
  const [highlightedIn, setHighlightedIn] = useState(found);
  if (found !== highlightedIn) {
    setHighlightedIn(found);
    setActive(-1);
  }

  // Nothing while the typed text is still settling, or when the BE would refuse it.
  const suggestions = suggestionQueryOf(text) && value.trim() === text ? found : NO_SUGGESTIONS;
  return { suggestions, active: active < suggestions.length ? active : -1, setActive };
}
