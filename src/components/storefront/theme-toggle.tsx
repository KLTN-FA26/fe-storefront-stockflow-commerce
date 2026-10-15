"use client";

import { Moon, Sun } from "lucide-react";

import { useTheme } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <Button
      type="button"
      size="icon"
      variant="ghost"
      className="size-11 rounded-full"
      onClick={toggleTheme}
      aria-label={isDark ? "Chuyển sang sáng" : "Chuyển sang tối"}
    >
      {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
  );
}
