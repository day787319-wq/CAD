"use client";

import { useEffect, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useI18n } from "@/components/i18n-provider";

const data = [
  { month: 0, revenue: 186000, target: 180000 },
  { month: 1, revenue: 205000, target: 190000 },
  { month: 2, revenue: 237000, target: 200000 },
  { month: 3, revenue: 273000, target: 220000 },
  { month: 4, revenue: 209000, target: 230000 },
  { month: 5, revenue: 314000, target: 250000 },
  { month: 6, revenue: 352000, target: 270000 },
  { month: 7, revenue: 389000, target: 290000 },
  { month: 8, revenue: 421000, target: 310000 },
  { month: 9, revenue: 458000, target: 330000 },
  { month: 10, revenue: 492000, target: 350000 },
  { month: 11, revenue: 547000, target: 380000 },
];

const copy = {
  title: { en: "Revenue Trend", zn: "营收趋势", vn: "Xu huong doanh thu" },
  subtitle: {
    en: "Monthly performance vs target",
    zn: "月度表现与目标对比",
    vn: "Hieu suat hang thang so voi muc tieu",
  },
  revenue: { en: "Revenue", zn: "营收", vn: "Doanh thu" },
  target: { en: "Target", zn: "目标", vn: "Muc tieu" },
} as const;

export function RevenueChart() {
  const [isLoaded, setIsLoaded] = useState(false);
  const { locale, formatMonth } = useI18n();

  useEffect(() => {
    const timer = setTimeout(() => setIsLoaded(true), 300);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="h-[380px] rounded-xl border border-border bg-card p-5 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-foreground">{copy.title[locale]}</h3>
          <p className="mt-0.5 text-sm text-muted-foreground">{copy.subtitle[locale]}</p>
        </div>
        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-1.5">
            <div className="h-2.5 w-2.5 rounded-full bg-chart-1" />
            <span className="text-muted-foreground">{copy.revenue[locale]}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-2.5 w-2.5 rounded-full bg-chart-2" />
            <span className="text-muted-foreground">{copy.target[locale]}</span>
          </div>
        </div>
      </div>

      <div className={`h-[280px] transition-opacity duration-700 ${isLoaded ? "opacity-100" : "opacity-0"}`}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="oklch(0.7 0.18 220)" stopOpacity={0.4} />
                <stop offset="100%" stopColor="oklch(0.7 0.18 220)" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="targetGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="oklch(0.7 0.18 145)" stopOpacity={0.3} />
                <stop offset="100%" stopColor="oklch(0.7 0.18 145)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.22 0.005 260)" vertical={false} />
            <XAxis
              dataKey="month"
              axisLine={false}
              tickLine={false}
              tickFormatter={(value) => formatMonth(value, "short")}
              tick={{ fill: "oklch(0.65 0 0)", fontSize: 12 }}
              dy={10}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fill: "oklch(0.65 0 0)", fontSize: 12 }}
              tickFormatter={(value) => `$${value / 1000}k`}
              dx={-10}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "oklch(0.12 0.005 260)",
                border: "1px solid oklch(0.22 0.005 260)",
                borderRadius: "8px",
                fontSize: "12px",
              }}
              labelStyle={{ color: "oklch(0.95 0 0)", fontWeight: 600 }}
              itemStyle={{ color: "oklch(0.65 0 0)" }}
              formatter={(value: number) => [`$${(value / 1000).toFixed(0)}k`, ""]}
              labelFormatter={(value) => formatMonth(value as number, "long")}
            />
            <Area
              type="monotone"
              dataKey="target"
              stroke="oklch(0.7 0.18 145)"
              strokeWidth={2}
              fill="url(#targetGradient)"
              dot={false}
            />
            <Area
              type="monotone"
              dataKey="revenue"
              stroke="oklch(0.7 0.18 220)"
              strokeWidth={2}
              fill="url(#revenueGradient)"
              dot={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
