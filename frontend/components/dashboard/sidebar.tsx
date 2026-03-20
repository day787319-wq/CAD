"use client";

import React from "react";
import { cn } from "@/lib/utils";
import type { Section } from "@/app/page";
import { sectionLabels } from "@/lib/i18n";
import { useI18n } from "@/components/i18n-provider";
import {
  LayoutDashboard,
  GitBranch,
  Handshake,
  Users,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Building2,
  TrendingUp,
  Settings,
} from "lucide-react";

interface SidebarProps {
  activeSection: Section;
  onSectionChange: (section: Section) => void;
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
}

const navItems: { id: Section; icon: React.ElementType }[] = [
  { id: "overview", icon: LayoutDashboard },
  { id: "pipeline", icon: GitBranch },
  // { id: "deals", icon: Handshake },
  // { id: "customers", icon: Building2 },
  // { id: "team", icon: Users },
  // { id: "forecasting", icon: TrendingUp },
  // { id: "reports", icon: BarChart3 },
  // { id: "settings", icon: Settings },
];

const sidebarCopy = {
  collapse: {
    en: "Collapse",
    zn: "收起",
    vn: "Thu gon",
  },
} as const;

export function Sidebar({
  activeSection,
  onSectionChange,
  collapsed,
  onCollapsedChange,
}: SidebarProps) {
  const { locale } = useI18n();

  return (
    <aside
      className={cn(
        "fixed left-0 top-0 z-40 flex h-screen flex-col border-r border-sidebar-border bg-sidebar transition-all duration-300 ease-out",
        collapsed ? "w-[72px]" : "w-[260px]"
      )}
    >
      <div className="flex h-16 items-center border-b border-sidebar-border px-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-accent-foreground shadow-sm dark:bg-card">
            <CircleDollarSign className="h-5 w-5" />
          </div>
          <span
            className={cn(
              "whitespace-nowrap text-lg font-semibold text-sidebar-foreground transition-all duration-300",
              collapsed ? "w-0 opacity-0" : "w-auto opacity-100"
            )}
          >
            DashBoard
          </span>
        </div>
      </div>

      <nav className="flex-1 space-y-1 overflow-hidden px-3 py-4">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeSection === item.id;

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSectionChange(item.id)}
              className={cn(
                "group relative flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200",
                isActive
                  ? "bg-sidebar-accent text-sidebar-foreground"
                  : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
              )}
              title={collapsed ? sectionLabels[item.id][locale] : undefined}
            >
              <span
                className={cn(
                  "absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-accent transition-opacity duration-300",
                  isActive ? "opacity-100" : "opacity-0"
                )}
              />
              <Icon
                className={cn(
                  "h-5 w-5 shrink-0 transition-transform duration-200",
                  isActive ? "text-accent" : "group-hover:scale-110"
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
          className="flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-all duration-200 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
        >
          {collapsed ? (
            <ChevronRight className="h-5 w-5" />
          ) : (
            <>
              <ChevronLeft className="h-5 w-5" />
              <span>{sidebarCopy.collapse[locale]}</span>
            </>
          )}
        </button>
      </div>
    </aside>
  );
}
