"use client";

import type { Section } from "@/app/page";
import { Calendar } from "lucide-react";
import { sectionDescriptions, sectionLabels } from "@/lib/i18n";
import { useI18n } from "@/components/i18n-provider";
import { LanguageSwitcher } from "@/components/language-switcher";
import { ThemeToggle } from "@/components/theme-toggle";

interface HeaderProps {
  activeSection: Section;
}

export function Header({ activeSection }: HeaderProps) {
  const { locale, formatDate, t } = useI18n();

  const title = sectionLabels[activeSection][locale];
  const description = sectionDescriptions[activeSection][locale];

  return (
    <header className="sticky top-0 z-30 border-b border-border/80 bg-background/88 backdrop-blur-md">
      <div className="flex min-h-[76px] items-center justify-between gap-4 px-5 py-4 lg:px-6">
        <div className="min-w-0">
          <p className="truncate text-[13px] font-medium text-muted-foreground">
            {t("Contract Management System")}
          </p>
          <h1 className="mt-1 truncate text-[20px] font-semibold tracking-[-0.01em] text-foreground">
            {title}
          </h1>
          <p className="mt-1 max-w-2xl text-[13px] text-muted-foreground">{description}</p>
        </div>

        <div className="flex items-center gap-2.5">
          <div className="hidden h-10 items-center gap-2 rounded-md border border-border/80 bg-card px-3 text-[13px] text-muted-foreground md:flex">
            <Calendar className="h-4 w-4" />
            <span>{t("Today")}</span>
            <span className="font-medium text-foreground">
              {formatDate(new Date(), { month: "short", day: "numeric", year: "numeric" })}
            </span>
          </div>

          <LanguageSwitcher className="hidden sm:inline-flex" />

          <ThemeToggle
            lightLabel={t("Light")}
            darkLabel={t("Dark")}
            toggleToLightLabel={t("Switch to light mode")}
            toggleToDarkLabel={t("Switch to dark mode")}
          />

        </div>
      </div>
    </header>
  );
}
