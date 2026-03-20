"use client";

import { Trophy, TrendingUp } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";

const performers = [
  { name: "Sarah Chen", deals: 24, revenue: 487500, change: "+15%", rank: 1 },
  { name: "Mike Johnson", deals: 19, revenue: 356200, change: "+8%", rank: 2 },
  { name: "Emily Davis", deals: 17, revenue: 312800, change: "+12%", rank: 3 },
  { name: "James Wilson", deals: 15, revenue: 289400, change: "+5%", rank: 4 },
  { name: "Lisa Park", deals: 14, revenue: 267100, change: "+9%", rank: 5 },
];

const copy = {
  title: { en: "Top Performers", zn: "最佳表现者", vn: "Thanh vien noi bat" },
  subtitle: { en: "This month's leaders", zn: "本月领先成员", vn: "Nguoi dan dau thang nay" },
  dealsClosed: {
    en: "{count} deals closed",
    zn: "已成交 {count} 单",
    vn: "Dong {count} giao dich",
  },
} as const;

export function TopPerformers() {
  const { locale, formatCurrency, interpolate } = useI18n();

  return (
    <div className="rounded-xl border border-border bg-card p-5 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-300">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-foreground">{copy.title[locale]}</h3>
          <p className="mt-0.5 text-sm text-muted-foreground">{copy.subtitle[locale]}</p>
        </div>
        <div className="flex items-center gap-1 text-warning">
          <Trophy className="h-5 w-5" />
        </div>
      </div>

      <div className="space-y-3">
        {performers.map((person, index) => (
          <div
            key={person.name}
            className="group flex cursor-pointer items-center justify-between rounded-lg p-3 transition-all duration-200 hover:bg-secondary/50 animate-in fade-in slide-in-from-right-2"
            style={{ animationDelay: `${(index + 4) * 100}ms`, animationFillMode: "both" }}
          >
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-accent/80 to-chart-1 text-sm font-semibold text-accent-foreground">
                  {person.name
                    .split(" ")
                    .map((part) => part[0])
                    .join("")}
                </div>
                {person.rank <= 3 && (
                  <div className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-warning text-[10px] font-bold text-background">
                    {person.rank}
                  </div>
                )}
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">{person.name}</p>
                <p className="text-xs text-muted-foreground">
                  {interpolate(copy.dealsClosed[locale], { count: person.deals })}
                </p>
              </div>
            </div>

            <div className="text-right">
              <p className="text-sm font-semibold text-foreground">{formatCurrency(person.revenue)}</p>
              <div className="flex items-center justify-end gap-1 text-xs text-success">
                <TrendingUp className="h-3 w-3" />
                {person.change}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
