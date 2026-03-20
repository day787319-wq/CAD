"use client";

import type { Section } from "@/app/page";
import { useState } from "react";
import { Bell, Calendar, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { sectionDescriptions, sectionLabels } from "@/lib/i18n";
import { useI18n } from "@/components/i18n-provider";
import { LanguageSwitcher } from "@/components/language-switcher";
import { ThemeToggle } from "@/components/theme-toggle";

interface HeaderProps {
  activeSection: Section;
}

const headerCopy = {
  workspace: {
    en: "Sales Operations Workspace",
    zn: "销售运营工作台",
    vn: "Khong gian Van hanh Ban hang",
  },
  searchPlaceholder: {
    en: "Search dashboard...",
    zn: "搜索仪表盘...",
    vn: "Tim kiem bang dieu khien...",
  },
  notifications: {
    en: "Notifications",
    zn: "通知",
    vn: "Thong bao",
  },
  today: {
    en: "Today",
    zn: "今天",
    vn: "Hom nay",
  },
  light: {
    en: "Light",
    zn: "浅色",
    vn: "Sang",
  },
  dark: {
    en: "Dark",
    zn: "深色",
    vn: "Toi",
  },
  toggleToLight: {
    en: "Switch to light mode",
    zn: "切换到浅色模式",
    vn: "Chuyen sang che do sang",
  },
  toggleToDark: {
    en: "Switch to dark mode",
    zn: "切换到深色模式",
    vn: "Chuyen sang che do toi",
  },
} as const;

export function Header({ activeSection }: HeaderProps) {
  const [searchFocused, setSearchFocused] = useState(false);
  const { locale, formatDate } = useI18n();

  const title = sectionLabels[activeSection][locale];
  const description = sectionDescriptions[activeSection][locale];

  return (
    <header className="sticky top-0 z-30 flex min-h-16 items-center justify-between gap-4 border-b border-border bg-background/80 px-6 backdrop-blur-sm">
      <div className="min-w-0">
      </div>

      <div className="flex items-center gap-3">
        <div className="hidden h-10 items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm text-muted-foreground md:flex">
          <Calendar className="h-4 w-4" />
          <span>{headerCopy.today[locale]}</span>
          <span className="text-foreground">
            {formatDate(new Date(), { month: "short", day: "numeric", year: "numeric" })}
          </span>
        </div>

        <LanguageSwitcher className="hidden sm:inline-flex" />

        <ThemeToggle
          lightLabel={headerCopy.light[locale]}
          darkLabel={headerCopy.dark[locale]}
          toggleToLightLabel={headerCopy.toggleToLight[locale]}
          toggleToDarkLabel={headerCopy.toggleToDark[locale]}
        />

        <button
          type="button"
          className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:text-foreground"
          aria-label={headerCopy.notifications[locale]}
          title={headerCopy.notifications[locale]}
        >
          <Bell className="h-4 w-4" />
        </button>
      </div>
    </header>
  );
}
