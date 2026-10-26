"use client";

import { Command as CommandPrimitive } from "cmdk";
import { ChevronsUpDown, Search } from "lucide-react";
import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

import type { FontOption } from "./text-actions";
import { useFontStatus } from "./use-font-status";

const STATUS_NOTES = { loading: "Đang tải…", error: "Không tải được" } as const;
const ERROR_HINT = "Không tải được phông này, chữ có thể hiện bằng phông khác.";

/**
 * The font picker: a searchable list (shadcn Command in a Popover) of `options` with each name
 * drawn in its own family. Opening it asks the browser for the regular face of every font listed
 * (`useFontStatus`), and a font still loading or failed says so beside its name; closed, it only
 * watches the selected one. Its name for assistive technology is the label and the chosen font.
 */
export function FontCombobox({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly FontOption[];
  onChange: (code: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const labelId = useId();
  const valueId = useId();
  const status = useFontStatus(open ? options.map((option) => option.code) : [value]);
  const selected = options.find((option) => option.code === value);

  return (
    <div className="flex flex-col gap-1.5">
      <span id={labelId} className="text-ink-secondary text-xs">
        {label}
      </span>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            aria-labelledby={`${labelId} ${valueId}`}
            className="border-border-default bg-bg-surface text-ink-primary hover:bg-bg-subtle h-11 w-full justify-between rounded-[var(--r-md)] px-3 font-normal"
          >
            <span id={valueId} className="truncate" style={{ fontFamily: selected?.family }}>
              {selected?.label ?? value}
            </span>
            <ChevronsUpDown aria-hidden className="text-ink-tertiary ml-2 size-4 shrink-0" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="border-border-default bg-bg-surface text-ink-primary w-(--radix-popover-trigger-width) p-1 shadow-md"
        >
          <Command className="bg-bg-surface text-ink-primary">
            {/* The kit's search field is 32 px tall: this one is a 44 px touch target. */}
            <div className="border-border-default focus-within:ring-accent flex min-h-11 items-center gap-2 rounded-[var(--r-md)] border px-3 focus-within:ring-2">
              <Search aria-hidden className="text-ink-tertiary size-4 shrink-0" />
              <CommandPrimitive.Input
                placeholder="Tìm phông chữ…"
                className="text-ink-primary placeholder:text-ink-tertiary h-11 w-full bg-transparent text-sm outline-none"
              />
            </div>
            <CommandList>
              <CommandEmpty className="text-ink-secondary">Không tìm thấy.</CommandEmpty>
              <CommandGroup>
                {options.map((option) => {
                  const note = status[option.code];
                  return (
                    <CommandItem
                      key={option.code}
                      value={option.code}
                      keywords={[option.label]}
                      data-checked={option.code === value}
                      onSelect={() => {
                        onChange(option.code);
                        setOpen(false);
                      }}
                      className="text-ink-primary data-selected:bg-bg-muted min-h-11"
                    >
                      <span className="truncate" style={{ fontFamily: option.family }}>
                        {option.label}
                      </span>
                      {note && note !== "ready" ? (
                        <span className="text-ink-tertiary ml-auto text-xs">
                          {STATUS_NOTES[note]}
                        </span>
                      ) : null}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {!open && status[value] === "error" ? (
        <p className="text-danger text-xs">{ERROR_HINT}</p>
      ) : null}
    </div>
  );
}
