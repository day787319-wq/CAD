"use client";

import { useState } from "react";
import {
  ArrowUpDown,
  CheckCircle2,
  ChevronDown,
  Clock,
  Filter,
  MoreHorizontal,
  Search,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { stageLabels, statusLabels } from "@/lib/i18n";
import { useI18n } from "@/components/i18n-provider";

interface Deal {
  id: string;
  company: string;
  contact: string;
  email: string;
  value: number;
  stage: keyof typeof stageLabels;
  status: "won" | "pending" | "lost";
  closeDate: string;
  rep: string;
}

const deals: Deal[] = [
  { id: "1", company: "Acme Corporation", contact: "John Smith", email: "john@acme.com", value: 125000, stage: "negotiation", status: "won", closeDate: "2024-01-15", rep: "Sarah Chen" },
  { id: "2", company: "TechStart Inc", contact: "Lisa Wong", email: "lisa@techstart.io", value: 89500, stage: "proposal", status: "pending", closeDate: "2024-01-22", rep: "Mike Johnson" },
  { id: "3", company: "GlobalFin Partners", contact: "Robert Davis", email: "rdavis@globalfin.com", value: 245000, stage: "qualified", status: "pending", closeDate: "2024-02-01", rep: "Emily Davis" },
  { id: "4", company: "DataSync Solutions", contact: "Emma Wilson", email: "emma@datasync.net", value: 67800, stage: "lead", status: "lost", closeDate: "2024-01-10", rep: "James Wilson" },
  { id: "5", company: "CloudBase Ltd", contact: "Michael Chen", email: "m.chen@cloudbase.io", value: 178000, stage: "negotiation", status: "won", closeDate: "2024-01-18", rep: "Sarah Chen" },
  { id: "6", company: "Innovate Labs", contact: "Jennifer Park", email: "jpark@innovate.co", value: 156000, stage: "proposal", status: "pending", closeDate: "2024-01-28", rep: "Lisa Park" },
  { id: "7", company: "NextGen Systems", contact: "David Lee", email: "david@nextgen.tech", value: 203000, stage: "qualified", status: "pending", closeDate: "2024-02-05", rep: "Mike Johnson" },
  { id: "8", company: "Prime Analytics", contact: "Sarah Johnson", email: "sj@primeanalytics.com", value: 94500, stage: "lead", status: "pending", closeDate: "2024-02-10", rep: "Emily Davis" },
];

const statusConfig = {
  won: { icon: CheckCircle2, color: "text-success", bg: "bg-success/10" },
  pending: { icon: Clock, color: "text-warning", bg: "bg-warning/10" },
  lost: { icon: XCircle, color: "text-destructive", bg: "bg-destructive/10" },
} as const;

const copy = {
  subtitle: {
    en: "View and manage all your deals in one place",
    zn: "在一个地方查看并管理全部交易",
    vn: "Xem va quan ly tat ca giao dich tai mot noi",
  },
  searchDeals: {
    en: "Search deals...",
    zn: "搜索交易...",
    vn: "Tim giao dich...",
  },
  moreFilters: {
    en: "More filters",
    zn: "更多筛选",
    vn: "Them bo loc",
  },
  company: { en: "Company", zn: "公司", vn: "Cong ty" },
  contact: { en: "Contact", zn: "联系人", vn: "Lien he" },
  value: { en: "Value", zn: "金额", vn: "Gia tri" },
  stage: { en: "Stage", zn: "阶段", vn: "Giai doan" },
  status: { en: "Status", zn: "状态", vn: "Trang thai" },
  rep: { en: "Rep", zn: "负责人", vn: "Phu trach" },
  closeDate: { en: "Close Date", zn: "关闭日期", vn: "Ngay dong" },
  showing: {
    en: "Showing {shown} of {total} deals",
    zn: "显示 {total} 笔中的 {shown} 笔交易",
    vn: "Dang hien thi {shown} / {total} giao dich",
  },
  previous: { en: "Previous", zn: "上一页", vn: "Truoc" },
  next: { en: "Next", zn: "下一页", vn: "Tiep" },
} as const;

const filters = ["all", "won", "pending", "lost"] as const;

export function DealsSection() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFilter, setSelectedFilter] = useState<(typeof filters)[number]>("all");
  const { locale, formatCurrency, formatDate, interpolate } = useI18n();

  const filteredDeals = deals.filter((deal) => {
    const matchesSearch =
      deal.company.toLowerCase().includes(searchQuery.toLowerCase()) ||
      deal.contact.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter = selectedFilter === "all" || deal.status === selectedFilter;
    return matchesSearch && matchesFilter;
  });

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">{copy.subtitle[locale]}</p>
      </div>

      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder={copy.searchDeals[locale]}
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              className="h-9 w-64 rounded-lg border border-border bg-secondary pl-9 pr-4 text-sm text-foreground transition-all duration-200 placeholder:text-muted-foreground focus:border-accent focus:outline-none focus:ring-2 focus:ring-ring/20"
            />
          </div>
          <div className="flex items-center gap-2">
            {filters.map((filter) => (
              <button
                key={filter}
                type="button"
                onClick={() => setSelectedFilter(filter)}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-xs font-medium transition-all duration-200",
                  selectedFilter === filter
                    ? "bg-accent text-accent-foreground"
                    : "bg-secondary text-muted-foreground hover:text-foreground"
                )}
              >
                {statusLabels[filter][locale]}
              </button>
            ))}
          </div>
        </div>
        <button className="flex items-center gap-2 rounded-lg bg-secondary px-3 py-1.5 text-sm text-muted-foreground transition-colors duration-200 hover:text-foreground">
          <Filter className="h-4 w-4" />
          {copy.moreFilters[locale]}
          <ChevronDown className="h-3 w-3" />
        </button>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-secondary/50">
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <button className="flex items-center gap-1 transition-colors hover:text-foreground">
                    {copy.company[locale]}
                    <ArrowUpDown className="h-3 w-3" />
                  </button>
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {copy.contact[locale]}
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <button className="flex items-center gap-1 transition-colors hover:text-foreground">
                    {copy.value[locale]}
                    <ArrowUpDown className="h-3 w-3" />
                  </button>
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {copy.stage[locale]}
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {copy.status[locale]}
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {copy.rep[locale]}
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {copy.closeDate[locale]}
                </th>
                <th className="w-12" />
              </tr>
            </thead>
            <tbody>
              {filteredDeals.map((deal, index) => {
                const status = statusConfig[deal.status];
                const StatusIcon = status.icon;

                return (
                  <tr
                    key={deal.id}
                    className="cursor-pointer border-b border-border transition-colors duration-150 hover:bg-secondary/30 last:border-0 animate-in fade-in slide-in-from-left-2"
                    style={{ animationDelay: `${index * 50}ms`, animationFillMode: "both" }}
                  >
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-secondary text-xs font-semibold text-muted-foreground">
                          {deal.company.charAt(0)}
                        </div>
                        <span className="text-sm font-medium text-foreground">{deal.company}</span>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div>
                        <p className="text-sm text-foreground">{deal.contact}</p>
                        <p className="text-xs text-muted-foreground">{deal.email}</p>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <span className="text-sm font-semibold text-foreground">
                        {formatCurrency(deal.value)}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <span className="rounded-md bg-secondary px-2 py-1 text-xs font-medium text-foreground">
                        {stageLabels[deal.stage][locale]}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <div
                        className={cn(
                          "inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium",
                          status.bg,
                          status.color
                        )}
                      >
                        <StatusIcon className="h-3 w-3" />
                        {statusLabels[deal.status][locale]}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <span className="text-sm text-muted-foreground">{deal.rep}</span>
                    </td>
                    <td className="px-4 py-4">
                      <span className="text-sm text-muted-foreground">
                        {formatDate(deal.closeDate, { year: "numeric", month: "short", day: "numeric" })}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <button className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-all duration-200 hover:bg-secondary hover:text-foreground">
                        <MoreHorizontal className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between border-t border-border bg-secondary/30 px-4 py-3">
          <span className="text-sm text-muted-foreground">
            {interpolate(copy.showing[locale], {
              shown: filteredDeals.length,
              total: deals.length,
            })}
          </span>
          <div className="flex items-center gap-2">
            <button className="rounded-lg px-3 py-1.5 text-sm text-muted-foreground transition-colors duration-200 hover:bg-secondary hover:text-foreground">
              {copy.previous[locale]}
            </button>
            <button className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground">
              1
            </button>
            <button className="rounded-lg px-3 py-1.5 text-sm text-muted-foreground transition-colors duration-200 hover:bg-secondary hover:text-foreground">
              2
            </button>
            <button className="rounded-lg px-3 py-1.5 text-sm text-muted-foreground transition-colors duration-200 hover:bg-secondary hover:text-foreground">
              {copy.next[locale]}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
