"use client";

import { cn } from "@/lib/utils";
import { supportedLocales } from "@/lib/i18n";
import { useI18n } from "@/components/i18n-provider";

interface LanguageSwitcherProps {
  className?: string;
}

export function LanguageSwitcher({ className }: LanguageSwitcherProps) {
  const { locale, setLocale, localeLabels, t } = useI18n();

  return (
    <div
      className={cn(
        "inline-flex items-center rounded-md border border-border/80 bg-card p-1 shadow-[0_1px_2px_rgba(15,23,42,0.04)]",
        className
      )}
      aria-label={t("Language")}
    >
      {supportedLocales.map((item) => (
        <button
          key={item}
          type="button"
          onClick={() => setLocale(item)}
          className={cn(
            "rounded-sm px-2.5 py-1 text-[11px] font-semibold transition-colors duration-200",
            locale === item
              ? "bg-accent text-accent-foreground"
              : "text-muted-foreground hover:bg-secondary/70 hover:text-foreground"
          )}
        >
          {localeLabels[item]}
        </button>
      ))}
    </div>
  );
}
