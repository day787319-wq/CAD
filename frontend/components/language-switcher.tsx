"use client";

import { cn } from "@/lib/utils";
import { supportedLocales } from "@/lib/i18n";
import { useI18n } from "@/components/i18n-provider";

interface LanguageSwitcherProps {
  className?: string;
}

export function LanguageSwitcher({ className }: LanguageSwitcherProps) {
  const { locale, setLocale, localeLabels } = useI18n();

  return (
    <div
      className={cn(
        "inline-flex items-center rounded-lg border border-border bg-card p-1",
        className
      )}
      aria-label="Language"
    >
      {supportedLocales.map((item) => (
        <button
          key={item}
          type="button"
          onClick={() => setLocale(item)}
          className={cn(
            "rounded-md px-2.5 py-1 text-xs font-semibold transition-colors duration-200",
            locale === item
              ? "bg-accent text-accent-foreground"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {localeLabels[item]}
        </button>
      ))}
    </div>
  );
}
