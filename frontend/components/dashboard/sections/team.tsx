"use client";

import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Mail,
  MoreHorizontal,
  Phone,
  Target,
  TrendingDown,
  TrendingUp,
  Trophy,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { teamRoleLabels } from "@/lib/i18n";
import { useI18n } from "@/components/i18n-provider";

type Role = keyof typeof teamRoleLabels;

interface TeamMember {
  id: string;
  name: string;
  role: Role;
  email: string;
  avatar: string;
  deals: number;
  revenue: number;
  quota: number;
  change: number;
  rank: number;
}

const teamMembers: TeamMember[] = [
  { id: "1", name: "Sarah Chen", role: "seniorAe", email: "sarah@company.com", avatar: "SC", deals: 24, revenue: 487500, quota: 450000, change: 15, rank: 1 },
  { id: "2", name: "Mike Johnson", role: "accountExecutive", email: "mike@company.com", avatar: "MJ", deals: 19, revenue: 356200, quota: 400000, change: 8, rank: 2 },
  { id: "3", name: "Emily Davis", role: "seniorAe", email: "emily@company.com", avatar: "ED", deals: 17, revenue: 312800, quota: 350000, change: 12, rank: 3 },
  { id: "4", name: "James Wilson", role: "accountExecutive", email: "james@company.com", avatar: "JW", deals: 15, revenue: 289400, quota: 350000, change: -5, rank: 4 },
  { id: "5", name: "Lisa Park", role: "accountExecutive", email: "lisa@company.com", avatar: "LP", deals: 14, revenue: 267100, quota: 300000, change: 9, rank: 5 },
];

const performanceData = [
  { name: "Sarah", revenue: 487, quota: 450 },
  { name: "Mike", revenue: 356, quota: 400 },
  { name: "Emily", revenue: 312, quota: 350 },
  { name: "James", revenue: 289, quota: 350 },
  { name: "Lisa", revenue: 267, quota: 300 },
];

const copy = {
  teamRevenue: { en: "Team Revenue", zn: "团队营收", vn: "Doanh thu doi ngu" },
  totalDeals: { en: "Total Deals", zn: "总交易数", vn: "Tong giao dich" },
  averageQuotaAttainment: { en: "Avg Quota Attainment", zn: "平均配额达成率", vn: "Ty le dat quota TB" },
  revenueVsQuota: { en: "Revenue vs Quota", zn: "营收与配额对比", vn: "Doanh thu so voi quota" },
  individualPerformance: {
    en: "Individual performance comparison",
    zn: "个人业绩对比",
    vn: "So sanh hieu suat tung nguoi",
  },
  revenueLegend: { en: "Revenue (k)", zn: "营收 (k)", vn: "Doanh thu (k)" },
  quotaLegend: { en: "Quota (k)", zn: "配额 (k)", vn: "Quota (k)" },
  teamMembers: { en: "Team Members", zn: "团队成员", vn: "Thanh vien doi ngu" },
  revenue: { en: "Revenue", zn: "营收", vn: "Doanh thu" },
  dealsClosed: { en: "Deals Closed", zn: "已成交交易", vn: "Giao dich da dong" },
  quotaAttainment: { en: "Quota Attainment", zn: "配额达成率", vn: "Ty le dat quota" },
} as const;

function TeamMemberCard({ member, index }: { member: TeamMember; index: number }) {
  const quotaPercentage = (member.revenue / member.quota) * 100;
  const isAboveQuota = quotaPercentage >= 100;
  const { locale, formatCompactCurrency } = useI18n();

  return (
    <div
      className="group rounded-xl border border-border bg-card p-5 transition-all duration-300 hover:border-accent/50 animate-in fade-in slide-in-from-bottom-4"
      style={{ animationDelay: `${index * 100}ms`, animationFillMode: "both" }}
    >
      <div className="mb-4 flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-accent/80 to-chart-1 text-sm font-bold text-accent-foreground">
              {member.avatar}
            </div>
            {member.rank <= 3 && (
              <div className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-warning">
                <Trophy className="h-3 w-3 text-background" />
              </div>
            )}
          </div>
          <div>
            <h4 className="text-sm font-semibold text-foreground">{member.name}</h4>
            <p className="text-xs text-muted-foreground">{teamRoleLabels[member.role][locale]}</p>
          </div>
        </div>
        <button className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground opacity-0 transition-all duration-200 hover:bg-secondary hover:text-foreground group-hover:opacity-100">
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-4">
        <div>
          <p className="mb-1 text-xs text-muted-foreground">{copy.revenue[locale]}</p>
          <p className="text-lg font-bold text-foreground">
            {formatCompactCurrency(member.revenue, { maximumFractionDigits: 0 })}
          </p>
        </div>
        <div>
          <p className="mb-1 text-xs text-muted-foreground">{copy.dealsClosed[locale]}</p>
          <p className="text-lg font-bold text-foreground">{member.deals}</p>
        </div>
      </div>

      <div className="mb-4">
        <div className="mb-1.5 flex items-center justify-between text-xs">
          <span className="text-muted-foreground">{copy.quotaAttainment[locale]}</span>
          <span className={cn("font-medium", isAboveQuota ? "text-success" : "text-foreground")}>
            {quotaPercentage.toFixed(0)}%
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-secondary">
          <div
            className={cn(
              "h-full rounded-full transition-all duration-700",
              isAboveQuota ? "bg-success" : "bg-accent"
            )}
            style={{ width: `${Math.min(quotaPercentage, 100)}%` }}
          />
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-border pt-4">
        <div className="flex items-center gap-2">
          <button className="flex h-8 w-8 items-center justify-center rounded-lg bg-secondary text-muted-foreground transition-colors hover:bg-secondary/80 hover:text-foreground">
            <Mail className="h-4 w-4" />
          </button>
          <button className="flex h-8 w-8 items-center justify-center rounded-lg bg-secondary text-muted-foreground transition-colors hover:bg-secondary/80 hover:text-foreground">
            <Phone className="h-4 w-4" />
          </button>
        </div>
        <div
          className={cn(
            "flex items-center gap-1 text-sm font-medium",
            member.change >= 0 ? "text-success" : "text-destructive"
          )}
        >
          {member.change >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
          {member.change >= 0 ? "+" : ""}
          {member.change}%
        </div>
      </div>
    </div>
  );
}

export function TeamSection() {
  const [chartLoaded, setChartLoaded] = useState(false);
  const { locale, formatCompactCurrency } = useI18n();

  useEffect(() => {
    const timer = setTimeout(() => setChartLoaded(true), 400);
    return () => clearTimeout(timer);
  }, []);

  const totalRevenue = teamMembers.reduce((accumulator, member) => accumulator + member.revenue, 0);
  const totalDeals = teamMembers.reduce((accumulator, member) => accumulator + member.deals, 0);
  const averageQuotaAttainment =
    teamMembers.reduce((accumulator, member) => accumulator + (member.revenue / member.quota) * 100, 0) /
    teamMembers.length;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-5 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="mb-2 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10">
              <Target className="h-5 w-5 text-accent" />
            </div>
            <span className="text-sm text-muted-foreground">{copy.teamRevenue[locale]}</span>
          </div>
          <p className="text-2xl font-bold text-foreground">{formatCompactCurrency(totalRevenue)}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-5 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-100">
          <div className="mb-2 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-chart-1/10">
              <TrendingUp className="h-5 w-5 text-chart-1" />
            </div>
            <span className="text-sm text-muted-foreground">{copy.totalDeals[locale]}</span>
          </div>
          <p className="text-2xl font-bold text-foreground">{totalDeals}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-5 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-200">
          <div className="mb-2 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-success/10">
              <Trophy className="h-5 w-5 text-success" />
            </div>
            <span className="text-sm text-muted-foreground">{copy.averageQuotaAttainment[locale]}</span>
          </div>
          <p className="text-2xl font-bold text-foreground">{averageQuotaAttainment.toFixed(0)}%</p>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-5 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-150">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-foreground">{copy.revenueVsQuota[locale]}</h3>
            <p className="mt-0.5 text-sm text-muted-foreground">{copy.individualPerformance[locale]}</p>
          </div>
          <div className="flex items-center gap-4 text-xs">
            <div className="flex items-center gap-1.5">
              <div className="h-2.5 w-2.5 rounded-full bg-chart-1" />
              <span className="text-muted-foreground">{copy.revenueLegend[locale]}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-2.5 w-2.5 rounded-full bg-muted-foreground/30" />
              <span className="text-muted-foreground">{copy.quotaLegend[locale]}</span>
            </div>
          </div>
        </div>
        <div className={`h-[250px] transition-opacity duration-700 ${chartLoaded ? "opacity-100" : "opacity-0"}`}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={performanceData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.22 0.005 260)" vertical={false} />
              <XAxis
                dataKey="name"
                axisLine={false}
                tickLine={false}
                tick={{ fill: "oklch(0.65 0 0)", fontSize: 12 }}
                dy={10}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fill: "oklch(0.65 0 0)", fontSize: 12 }}
                tickFormatter={(value) => `$${value}k`}
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
                formatter={(value: number) => [`$${value}k`, ""]}
              />
              <Bar dataKey="quota" fill="oklch(0.65 0 0 / 0.2)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="revenue" fill="oklch(0.7 0.18 220)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div>
        <h3 className="mb-4 text-base font-semibold text-foreground">{copy.teamMembers[locale]}</h3>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {teamMembers.map((member, index) => (
            <TeamMemberCard key={member.id} member={member} index={index} />
          ))}
        </div>
      </div>
    </div>
  );
}
