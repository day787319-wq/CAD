"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";

interface ThemeToggleProps {
  className?: string;
  lightLabel?: string;
  darkLabel?: string;
  toggleToLightLabel?: string;
  toggleToDarkLabel?: string;
}

export function ThemeToggle({
  className,
  lightLabel = "Light",
  darkLabel = "Dark",
  toggleToLightLabel = "Switch to light mode",
  toggleToDarkLabel = "Switch to dark mode",
}: ThemeToggleProps) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const activeTheme = mounted && resolvedTheme === "light" ? "light" : "dark";
  const isLight = activeTheme === "light";

  return (
    <button
      type="button"
      onClick={() => setTheme(isLight ? "dark" : "light")}
      className={cn(
        "inline-flex h-10 items-center gap-2 rounded-md border border-border/80 bg-card px-3 text-[13px] text-muted-foreground transition-colors hover:bg-secondary/70 hover:text-foreground",
        className
      )}
      aria-label={isLight ? toggleToDarkLabel : toggleToLightLabel}
      title={isLight ? toggleToDarkLabel : toggleToLightLabel}
    >
      {isLight ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
      <span className="hidden sm:inline">{isLight ? darkLabel : lightLabel}</span>
    </button>
  );
}
