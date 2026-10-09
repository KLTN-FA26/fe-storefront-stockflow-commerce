"use client";

import { useId, useState } from "react";
import { ChevronsUpDown } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export interface ComboboxOption {
  value: string;
  label: string;
}

interface SearchableComboboxProps {
  label: string;
  value: string;
  /** Shown when the saved value is not (yet) in `options`. */
  displayValue?: string;
  options: readonly ComboboxOption[];
  loading?: boolean;
  disabled?: boolean;
  error?: string | undefined;
  onSelect: (option: ComboboxOption) => void;
}

/** Labelled, keyboard-searchable select built on Popover + Command. Data comes in via props. */
export function SearchableCombobox({
  label,
  value,
  displayValue,
  options,
  loading = false,
  disabled = false,
  error,
  onSelect,
}: SearchableComboboxProps) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const errorId = `${id}-error`;
  const selectedLabel = options.find((option) => option.value === value)?.label ?? displayValue;
  const placeholder = loading ? "Đang tải..." : `Chọn ${label.toLowerCase()}`;

  return (
    <div className="space-y-2">
      <Label htmlFor={id} className={cn(error && "text-danger")}>
        {label}
      </Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            aria-invalid={!!error}
            aria-describedby={error ? errorId : undefined}
            disabled={disabled}
            className={cn(
              "border-border-default bg-bg-surface text-ink-primary hover:bg-bg-subtle h-11 w-full justify-between rounded-[var(--r-md)] px-3 font-normal shadow-sm",
              error && "border-danger",
            )}
          >
            <span className={cn("truncate", !selectedLabel && "text-ink-tertiary")}>
              {selectedLabel || placeholder}
            </span>
            <ChevronsUpDown className="text-ink-tertiary ml-2 size-4 shrink-0" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="border-border-default bg-bg-surface text-ink-primary w-(--radix-popover-trigger-width) p-1 shadow-md"
          align="start"
        >
          <Command className="bg-bg-surface text-ink-primary">
            <CommandInput placeholder={`Tìm ${label.toLowerCase()}...`} />
            <CommandList>
              <CommandEmpty className="text-ink-secondary">Không tìm thấy.</CommandEmpty>
              <CommandGroup>
                {options.map((option) => (
                  <CommandItem
                    key={option.value}
                    // value must be unique (two wards can share a name); search by label via keywords.
                    value={option.value}
                    keywords={[option.label]}
                    data-checked={option.value === value}
                    className="text-ink-primary data-selected:bg-bg-muted min-h-11"
                    onSelect={() => {
                      onSelect(option);
                      setOpen(false);
                    }}
                  >
                    {option.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {error && (
        <p id={errorId} className="text-danger text-xs">
          {error}
        </p>
      )}
    </div>
  );
}
