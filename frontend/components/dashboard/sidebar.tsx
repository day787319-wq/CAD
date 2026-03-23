"use client";

import Image from "next/image";
import React from "react";
import { cn } from "@/lib/utils";
import type { Section } from "@/app/page";
import { sectionLabels } from "@/lib/i18n";
import { useI18n } from "@/components/i18n-provider";
import {
  LayoutDashboard,
  GitBranch,
  Layers3,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

interface SidebarProps {
  activeSection: Section;
  onSectionChange: (section: Section) => void;
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
}

const navItems: { id: Section; icon: React.ElementType }[] = [
  { id: "overview", icon: LayoutDashboard },
  { id: "templates", icon: Layers3 },
  { id: "pipeline", icon: GitBranch },
  // { id: "deals", icon: Handshake },
  // { id: "customers", icon: Building2 },
  // { id: "team", icon: Users },
  // { id: "forecasting", icon: TrendingUp },
  // { id: "reports", icon: BarChart3 },
  // { id: "settings", icon: Settings },
];

export function Sidebar({
  activeSection,
  onSectionChange,
  collapsed,
  onCollapsedChange,
}: SidebarProps) {
  const { locale, t } = useI18n();

  return (
    <aside
      className={cn(
        "fixed left-0 top-0 z-40 flex h-screen flex-col border-r border-sidebar-border bg-sidebar/96 backdrop-blur transition-all duration-300 ease-out",
        collapsed ? "w-[72px]" : "w-[260px]"
      )}
    >
      <div className="flex h-[76px] items-center border-b border-sidebar-border px-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border/70 bg-card text-primary shadow-[0_1px_2px_rgba(15,23,42,0.05)]">
            <Image
              src="/contract-management-logo.png"
              alt={t("Contract Management System")}
              width={24}
              height={24}
              className="h-6 w-6 object-contain"
              priority
            />
          </div>
          <div
            className={cn(
              "min-w-0 transition-all duration-300",
              collapsed ? "w-0 overflow-hidden opacity-0" : "opacity-100"
            )}
          >
            <p className="max-w-[168px] text-[15px] font-semibold leading-[1.15] text-sidebar-foreground">
              {t("Contract Management System")}
            </p>
          </div>
        </div>
      </div>

      <nav className="flex-1 space-y-1.5 overflow-hidden px-3 py-4">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeSection === item.id;

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSectionChange(item.id)}
              className={cn(
                "group relative flex w-full items-center gap-3 rounded-md border px-3 py-2.5 text-[13px] font-medium transition-all duration-200",
                isActive
                  ? "border-primary/15 bg-accent text-sidebar-foreground shadow-[0_8px_22px_-18px_rgba(37,99,235,0.45)]"
                  : "border-transparent text-muted-foreground hover:border-border/70 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground"
              )}
              title={collapsed ? sectionLabels[item.id][locale] : undefined}
            >
              <span
                className={cn(
                  "absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-primary transition-opacity duration-300",
                  isActive ? "opacity-100" : "opacity-0"
                )}
              />
              <Icon
                className={cn(
                  "h-5 w-5 shrink-0 transition-transform duration-200",
                  isActive ? "text-primary" : "group-hover:scale-110"
                )}
              />
              <span
                className={cn(
                  "whitespace-nowrap transition-all duration-300",
                  collapsed ? "w-0 overflow-hidden opacity-0" : "opacity-100"
                )}
              >
                {sectionLabels[item.id][locale]}
              </span>
            </button>
          );
        })}
      </nav>

      <div className="border-t border-sidebar-border p-3">
        <button
          type="button"
          onClick={() => onCollapsedChange(!collapsed)}
          className="flex w-full items-center justify-center gap-2 rounded-md border border-transparent px-3 py-2 text-[13px] text-muted-foreground transition-all duration-200 hover:border-border/70 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground"
        >
          {collapsed ? (
            <ChevronRight className="h-5 w-5" />
          ) : (
            <>
              <ChevronLeft className="h-5 w-5" />
              <span>{t("Collapse")}</span>
            </>
          )}
        </button>
      </div>
    </aside>
  );
}
