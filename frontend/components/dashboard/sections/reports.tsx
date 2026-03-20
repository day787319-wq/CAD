"use client";

import React, { useEffect, useState } from "react";
import {
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  BarChart3,
  Calendar,
  ChevronRight,
  Clock,
  Download,
  FileText,
  PieChart as PieChartIcon,
  TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/components/i18n-provider";

const conversionData = [
  { month: 0, rate: 18 },
  { month: 1, rate: 22 },
  { month: 2, rate: 19 },
  { month: 3, rate: 25 },
  { month: 4, rate: 23 },
  { month: 5, rate: 28 },
  { month: 6, rate: 26 },
  { month: 7, rate: 31 },
  { month: 8, rate: 29 },
  { month: 9, rate: 32 },
  { month: 10, rate: 35 },
  { month: 11, rate: 38 },
];

type SourceId = "direct" | "referral" | "organic" | "paidAds" | "social";

const sourceData: { id: SourceId; value: number; color: string }[] = [
  { id: "direct", value: 35, color: "oklch(0.7 0.18 220)" },
  { id: "referral", value: 25, color: "oklch(0.7 0.18 145)" },
  { id: "organic", value: 20, color: "oklch(0.75 0.18 55)" },
  { id: "paidAds", value: 15, color: "oklch(0.65 0.2 25)" },
  { id: "social", value: 5, color: "oklch(0.7 0.15 300)" },
];

const reports = [
  { id: "1", nameKey: "monthlySalesSummary", typeKey: "sales", date: "2024-01-20", status: "ready" },
  { id: "2", nameKey: "q4PerformanceAnalysis", typeKey: "performance", date: "2024-01-18", status: "ready" },
  { id: "3", nameKey: "pipelineForecast", typeKey: "forecast", date: "2024-01-15", status: "ready" },
  { id: "4", nameKey: "teamProductivityReport", typeKey: "team", date: "2024-01-12", status: "generating" },
  { id: "5", nameKey: "leadSourceAnalysis", typeKey: "marketing", date: "2024-01-10", status: "ready" },
] as const;

const copy = {
  salesSummary: { en: "Sales Summary", zn: "销售摘要", vn: "Tong hop ban hang" },
  salesSummaryDescription: { en: "Monthly revenue and deal metrics", zn: "月度营收和交易指标", vn: "Chi so doanh thu va giao dich theo thang" },
  conversionRates: { en: "Conversion Rates", zn: "转化率", vn: "Ti le chuyen doi" },
  conversionRatesDescription: { en: "Funnel performance analysis", zn: "漏斗表现分析", vn: "Phan tich hieu suat pheu" },
  leadSources: { en: "Lead Sources", zn: "线索来源", vn: "Nguon lead" },
  leadSourcesDescription: { en: "Channel attribution breakdown", zn: "渠道归因拆解", vn: "Phan bo theo kenh" },
  forecastCard: { en: "Forecast", zn: "预测", vn: "Du bao" },
  forecastCardDescription: { en: "Revenue predictions and targets", zn: "营收预测与目标", vn: "Du doan doanh thu va muc tieu" },
  viewReport: { en: "View Report", zn: "查看报表", vn: "Xem bao cao" },
  conversionTrend: { en: "Conversion Rate Trend", zn: "转化率趋势", vn: "Xu huong ti le chuyen doi" },
  conversionTrendDescription: {
    en: "Monthly lead to deal conversion",
    zn: "月度线索到交易转化",
    vn: "Ty le chuyen doi lead thanh giao dich theo thang",
  },
  conversionRateLabel: { en: "Conversion Rate", zn: "转化率", vn: "Ti le chuyen doi" },
  leadSourcesSubtitle: { en: "Where your leads come from", zn: "线索来自哪些渠道", vn: "Lead den tu dau" },
  direct: { en: "Direct", zn: "直接访问", vn: "Truc tiep" },
  referral: { en: "Referral", zn: "推荐", vn: "Gioi thieu" },
  organic: { en: "Organic", zn: "自然流量", vn: "Tu nhien" },
  paidAds: { en: "Paid Ads", zn: "付费广告", vn: "Quang cao tra phi" },
  social: { en: "Social", zn: "社交媒体", vn: "Mang xa hoi" },
  recentReports: { en: "Recent Reports", zn: "最近报表", vn: "Bao cao gan day" },
  generatedReports: { en: "Your generated reports", zn: "你生成的报表", vn: "Cac bao cao da tao" },
  generateNew: { en: "Generate New", zn: "生成新报表", vn: "Tao moi" },
  monthlySalesSummary: { en: "Monthly Sales Summary", zn: "月度销售摘要", vn: "Tong ket ban hang hang thang" },
  q4PerformanceAnalysis: { en: "Q4 Performance Analysis", zn: "Q4 绩效分析", vn: "Phan tich hieu suat Q4" },
  pipelineForecast: { en: "Pipeline Forecast", zn: "销售管道预测", vn: "Du bao pipeline" },
  teamProductivityReport: { en: "Team Productivity Report", zn: "团队效率报表", vn: "Bao cao nang suat doi ngu" },
  leadSourceAnalysis: { en: "Lead Source Analysis", zn: "线索来源分析", vn: "Phan tich nguon lead" },
  sales: { en: "Sales", zn: "销售", vn: "Ban hang" },
  performance: { en: "Performance", zn: "绩效", vn: "Hieu suat" },
  forecast: { en: "Forecast", zn: "预测", vn: "Du bao" },
  team: { en: "Team", zn: "团队", vn: "Doi ngu" },
  marketing: { en: "Marketing", zn: "营销", vn: "Tiep thi" },
  generating: { en: "Generating...", zn: "生成中...", vn: "Dang tao..." },
  download: { en: "Download", zn: "下载", vn: "Tai xuong" },
} as const;

function ReportCard({
  title,
  description,
  icon: Icon,
  color,
  actionLabel,
  index,
}: {
  title: string;
  description: string;
  icon: React.ElementType;
  color: string;
  actionLabel: string;
  index: number;
}) {
  return (
    <div
      className="group cursor-pointer rounded-xl border border-border bg-card p-5 transition-all duration-300 hover:border-accent/50 animate-in fade-in slide-in-from-bottom-4"
      style={{ animationDelay: `${index * 100}ms`, animationFillMode: "both" }}
    >
      <div className={cn("mb-4 flex h-10 w-10 items-center justify-center rounded-lg", color)}>
        <Icon className="h-5 w-5" />
      </div>
      <h3 className="mb-1 text-sm font-semibold text-foreground">{title}</h3>
      <p className="mb-4 text-xs text-muted-foreground">{description}</p>
      <button className="flex items-center gap-1 text-xs font-medium text-accent transition-all duration-200 group-hover:gap-2">
        {actionLabel}
        <ChevronRight className="h-3 w-3" />
      </button>
    </div>
  );
}

export function ReportsSection() {
  const [chartsLoaded, setChartsLoaded] = useState(false);
  const { locale, formatDate, formatMonth } = useI18n();

  useEffect(() => {
    const timer = setTimeout(() => setChartsLoaded(true), 400);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <ReportCard
          title={copy.salesSummary[locale]}
          description={copy.salesSummaryDescription[locale]}
          icon={BarChart3}
          color="bg-chart-1/10 text-chart-1"
          actionLabel={copy.viewReport[locale]}
          index={0}
        />
        <ReportCard
          title={copy.conversionRates[locale]}
          description={copy.conversionRatesDescription[locale]}
          icon={TrendingUp}
          color="bg-accent/10 text-accent"
          actionLabel={copy.viewReport[locale]}
          index={1}
        />
        <ReportCard
          title={copy.leadSources[locale]}
          description={copy.leadSourcesDescription[locale]}
          icon={PieChartIcon}
          color="bg-chart-3/10 text-chart-3"
          actionLabel={copy.viewReport[locale]}
          index={2}
        />
        <ReportCard
          title={copy.forecastCard[locale]}
          description={copy.forecastCardDescription[locale]}
          icon={Calendar}
          color="bg-chart-5/10 text-chart-5"
          actionLabel={copy.viewReport[locale]}
          index={3}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-5 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-200">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h3 className="text-base font-semibold text-foreground">{copy.conversionTrend[locale]}</h3>
              <p className="mt-0.5 text-sm text-muted-foreground">{copy.conversionTrendDescription[locale]}</p>
            </div>
            <div className="flex items-center gap-2 text-sm font-medium text-success">
              <TrendingUp className="h-4 w-4" />
              +111% YoY
            </div>
          </div>
          <div className={`h-[250px] transition-opacity duration-700 ${chartsLoaded ? "opacity-100" : "opacity-0"}`}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={conversionData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
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
                  tickFormatter={(value) => `${value}%`}
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
                  formatter={(value: number) => [`${value}%`, copy.conversionRateLabel[locale]]}
                  labelFormatter={(value) => formatMonth(value as number, "long")}
                />
                <Line
                  type="monotone"
                  dataKey="rate"
                  stroke="oklch(0.7 0.18 145)"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 2 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-5 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-300">
          <div className="mb-6">
            <h3 className="text-base font-semibold text-foreground">{copy.leadSources[locale]}</h3>
            <p className="mt-0.5 text-sm text-muted-foreground">{copy.leadSourcesSubtitle[locale]}</p>
          </div>
          <div className="flex items-center gap-8">
            <div className={`h-[180px] w-[180px] transition-opacity duration-700 ${chartsLoaded ? "opacity-100" : "opacity-0"}`}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={sourceData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={2} dataKey="value">
                    {sourceData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex-1 space-y-3">
              {sourceData.map((source, index) => (
                <div
                  key={source.id}
                  className="flex items-center justify-between animate-in fade-in slide-in-from-right-2"
                  style={{ animationDelay: `${(index + 5) * 100}ms`, animationFillMode: "both" }}
                >
                  <div className="flex items-center gap-2">
                    <div className="h-3 w-3 rounded-full" style={{ backgroundColor: source.color }} />
                    <span className="text-sm text-foreground">{copy[source.id][locale]}</span>
                  </div>
                  <span className="text-sm font-semibold text-foreground">{source.value}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card animate-in fade-in slide-in-from-bottom-4 duration-500 delay-400">
        <div className="flex items-center justify-between border-b border-border p-5">
          <div>
            <h3 className="text-base font-semibold text-foreground">{copy.recentReports[locale]}</h3>
            <p className="mt-0.5 text-sm text-muted-foreground">{copy.generatedReports[locale]}</p>
          </div>
          <button className="flex items-center gap-2 rounded-lg bg-secondary px-3 py-1.5 text-sm text-muted-foreground transition-colors duration-200 hover:text-foreground">
            <FileText className="h-4 w-4" />
            {copy.generateNew[locale]}
          </button>
        </div>
        <div className="divide-y divide-border">
          {reports.map((report, index) => (
            <div
              key={report.id}
              className="flex cursor-pointer items-center justify-between px-5 py-4 transition-colors duration-150 hover:bg-secondary/30 animate-in fade-in slide-in-from-left-2"
              style={{ animationDelay: `${(index + 6) * 50}ms`, animationFillMode: "both" }}
            >
              <div className="flex items-center gap-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary">
                  <FileText className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">{copy[report.nameKey][locale]}</p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="rounded bg-secondary px-1.5 py-0.5">{copy[report.typeKey][locale]}</span>
                    <span>/</span>
                    <span>{formatDate(report.date, { month: "short", day: "numeric", year: "numeric" })}</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {report.status === "generating" ? (
                  <div className="flex items-center gap-2 text-xs text-warning">
                    <Clock className="h-4 w-4 animate-pulse" />
                    {copy.generating[locale]}
                  </div>
                ) : (
                  <button className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm text-muted-foreground transition-all duration-200 hover:bg-secondary hover:text-foreground">
                    <Download className="h-4 w-4" />
                    {copy.download[locale]}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
