"use client";

import { useEffect, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  RefreshCw,
  Target,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useI18n } from "@/components/i18n-provider";

const forecastData = [
  { month: 0, actual: 420000, forecast: 400000, target: 450000 },
  { month: 1, actual: 480000, forecast: 460000, target: 450000 },
  { month: 2, actual: 510000, forecast: 500000, target: 500000 },
  { month: 3, actual: 485000, forecast: 520000, target: 500000 },
  { month: 4, actual: 560000, forecast: 550000, target: 550000 },
  { month: 5, actual: 620000, forecast: 600000, target: 550000 },
  { month: 6, actual: null, forecast: 650000, target: 600000 },
  { month: 7, actual: null, forecast: 680000, target: 600000 },
  { month: 8, actual: null, forecast: 720000, target: 650000 },
  { month: 9, actual: null, forecast: 750000, target: 650000 },
  { month: 10, actual: null, forecast: 800000, target: 700000 },
  { month: 11, actual: null, forecast: 850000, target: 700000 },
];

const quarterlyForecast = [
  { quarter: "Q1", committed: 1200000, bestCase: 1450000, pipeline: 1800000 },
  { quarter: "Q2", committed: 1500000, bestCase: 1750000, pipeline: 2100000 },
  { quarter: "Q3", committed: 1800000, bestCase: 2100000, pipeline: 2500000 },
  { quarter: "Q4", committed: 2200000, bestCase: 2600000, pipeline: 3000000 },
];

const riskFactors = [
  {
    id: 1,
    titleKey: "dealSlippageRisk",
    descriptionKey: "dealSlippageDescription",
    impact: -180000,
    severity: "high",
    deals: ["Acme Corp Enterprise", "GlobalTech Phase 2", "DataStream Analytics"],
  },
  {
    id: 2,
    titleKey: "competitorActivity",
    descriptionKey: "competitorActivityDescription",
    impact: -95000,
    severity: "medium",
    deals: ["NextGen Solutions", "CloudFirst Expansion"],
  },
  {
    id: 3,
    titleKey: "budgetFreezeWarning",
    descriptionKey: "budgetFreezeDescription",
    impact: -120000,
    severity: "high",
    deals: ["Innovate Labs", "TechStart Inc"],
  },
] as const;

const scenarios = [
  { nameKey: "conservative", probability: 85, revenue: 6200000, color: "chart-4" },
  { nameKey: "baseCase", probability: 65, revenue: 7400000, color: "accent" },
  { nameKey: "optimistic", probability: 40, revenue: 8600000, color: "chart-1" },
] as const;

const copy = {
  title: { en: "Sales Forecasting", zn: "销售预测", vn: "Du bao ban hang" },
  subtitle: {
    en: "AI-powered predictions based on historical data and pipeline analysis",
    zn: "基于历史数据和销售管道分析的智能预测",
    vn: "Du doan thong minh dua tren du lieu lich su va phan tich pipeline",
  },
  monthly: { en: "Monthly", zn: "月度", vn: "Hang thang" },
  quarterly: { en: "Quarterly", zn: "季度", vn: "Hang quy" },
  annual: { en: "Annual", zn: "年度", vn: "Hang nam" },
  refresh: { en: "Refresh", zn: "刷新", vn: "Lam moi" },
  q2Forecast: { en: "Q2 Forecast", zn: "Q2 预测", vn: "Du bao Q2" },
  targetLabel: { en: "Target: {amount}", zn: "目标：{amount}", vn: "Muc tieu: {amount}" },
  forecastAccuracy: { en: "Forecast Accuracy", zn: "预测准确率", vn: "Do chinh xac du bao" },
  lastSixMonthsAverage: { en: "Last 6 months avg", zn: "近 6 个月平均", vn: "Trung binh 6 thang gan day" },
  pipelineCoverage: { en: "Pipeline Coverage", zn: "管道覆盖率", vn: "Do phu pipeline" },
  versusQuota: { en: "vs quota", zn: "相对配额", vn: "so voi quota" },
  atRiskRevenue: { en: "At-Risk Revenue", zn: "风险营收", vn: "Doanh thu rui ro" },
  dealsFlagged: { en: "3 deals flagged", zn: "已标记 3 笔交易", vn: "3 giao dich da duoc danh dau" },
  revenueForecastVsActual: {
    en: "Revenue Forecast vs Actual",
    zn: "营收预测与实际对比",
    vn: "Du bao doanh thu va thuc te",
  },
  actual: { en: "Actual", zn: "实际", vn: "Thuc te" },
  forecast: { en: "Forecast", zn: "预测", vn: "Du bao" },
  target: { en: "Target", zn: "目标", vn: "Muc tieu" },
  quarterlyBreakdown: { en: "Quarterly Forecast Breakdown", zn: "季度预测拆分", vn: "Chi tiet du bao theo quy" },
  committed: { en: "Committed", zn: "已承诺", vn: "Cam ket" },
  bestCase: { en: "Best Case", zn: "最佳情景", vn: "Kich ban tot nhat" },
  pipeline: { en: "Pipeline", zn: "管道", vn: "Pipeline" },
  scenarioAnalysis: { en: "Scenario Analysis", zn: "情景分析", vn: "Phan tich kich ban" },
  conservative: { en: "Conservative", zn: "保守", vn: "Than trong" },
  baseCase: { en: "Base Case", zn: "基准", vn: "Co so" },
  optimistic: { en: "Optimistic", zn: "乐观", vn: "Lac quan" },
  probability: { en: "{value}% probability", zn: "概率 {value}%", vn: "Xac suat {value}%" },
  riskFactors: { en: "Risk Factors", zn: "风险因素", vn: "Yeu to rui ro" },
  identified: { en: "{count} identified", zn: "已识别 {count} 项", vn: "Da xac dinh {count} muc" },
  viewMitigationPlan: { en: "View mitigation plan", zn: "查看缓解方案", vn: "Xem ke hoach giam thieu" },
  dealSlippageRisk: { en: "Deal Slippage Risk", zn: "交易延期风险", vn: "Rui ro tre giao dich" },
  dealSlippageDescription: {
    en: "3 deals at risk of pushing to next quarter",
    zn: "3 笔交易可能推迟到下个季度",
    vn: "3 giao dich co nguy co day sang quy tiep theo",
  },
  competitorActivity: { en: "Competitor Activity", zn: "竞争对手动态", vn: "Hoat dong doi thu" },
  competitorActivityDescription: {
    en: "Increased competition in mid-market segment",
    zn: "中端市场竞争加剧",
    vn: "Canh tranh tang len o phan khuc tam trung",
  },
  budgetFreezeWarning: { en: "Budget Freeze Warning", zn: "预算冻结预警", vn: "Canh bao dong bang ngan sach" },
  budgetFreezeDescription: {
    en: "2 accounts reported potential budget freezes",
    zn: "2 个账户报告可能冻结预算",
    vn: "2 tai khoan bao nguy co dong bang ngan sach",
  },
} as const;

export function ForecastingSection() {
  const [timeframe, setTimeframe] = useState("quarterly");
  const [isLoading, setIsLoading] = useState(true);
  const { locale, formatCompactCurrency, formatMonth, interpolate } = useI18n();

  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 800);
    return () => clearTimeout(timer);
  }, []);

  const currentQuarterTarget = 1800000;
  const currentQuarterForecast = 2100000;
  const forecastAccuracy = 94;
  const pipelineCoverage = 3.2;

  return (
    <div className="space-y-6">
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-xl font-semibold text-foreground">{copy.title[locale]}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{copy.subtitle[locale]}</p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={timeframe} onValueChange={setTimeframe}>
            <SelectTrigger className="w-[140px] border-border bg-secondary">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="monthly">{copy.monthly[locale]}</SelectItem>
              <SelectItem value="quarterly">{copy.quarterly[locale]}</SelectItem>
              <SelectItem value="annual">{copy.annual[locale]}</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm">
            <RefreshCw className="mr-2 h-4 w-4" />
            {copy.refresh[locale]}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        {[
          {
            label: copy.q2Forecast[locale],
            value: formatCompactCurrency(currentQuarterForecast),
            subtext: interpolate(copy.targetLabel[locale], {
              amount: formatCompactCurrency(currentQuarterTarget),
            }),
            icon: Target,
            trend: "+17%",
            trendUp: true,
          },
          {
            label: copy.forecastAccuracy[locale],
            value: `${forecastAccuracy}%`,
            subtext: copy.lastSixMonthsAverage[locale],
            icon: CheckCircle2,
            trend: "+2.3%",
            trendUp: true,
          },
          {
            label: copy.pipelineCoverage[locale],
            value: `${pipelineCoverage}x`,
            subtext: copy.versusQuota[locale],
            icon: TrendingUp,
            trend: "+0.4x",
            trendUp: true,
          },
          {
            label: copy.atRiskRevenue[locale],
            value: "$395K",
            subtext: copy.dealsFlagged[locale],
            icon: AlertTriangle,
            trend: "-12%",
            trendUp: false,
          },
        ].map((stat, index) => (
          <Card
            key={stat.label}
            className={cn(
              "border-border bg-card transition-all duration-500",
              isLoading ? "translate-y-4 opacity-0" : "translate-y-0 opacity-100"
            )}
            style={{ transitionDelay: `${index * 100}ms` }}
          >
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{stat.label}</p>
                  <p className="mt-1 text-2xl font-semibold text-foreground">{stat.value}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{stat.subtext}</p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <stat.icon
                    className={cn(
                      "h-5 w-5",
                      stat.label === copy.atRiskRevenue[locale] ? "text-chart-3" : "text-accent"
                    )}
                  />
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-xs",
                      stat.trendUp ? "border-accent/30 text-accent" : "border-destructive/30 text-destructive"
                    )}
                  >
                    {stat.trendUp ? <TrendingUp className="mr-1 h-3 w-3" /> : <TrendingDown className="mr-1 h-3 w-3" />}
                    {stat.trend}
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-border bg-card">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-medium">{copy.revenueForecastVsActual[locale]}</CardTitle>
            <div className="flex items-center gap-4 text-xs">
              <div className="flex items-center gap-1.5">
                <div className="h-3 w-3 rounded-full bg-accent" />
                <span className="text-muted-foreground">{copy.actual[locale]}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="h-3 w-3 rounded-full bg-chart-1" />
                <span className="text-muted-foreground">{copy.forecast[locale]}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="h-3 w-3 rounded-full bg-muted-foreground/30" />
                <span className="text-muted-foreground">{copy.target[locale]}</span>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={forecastData}>
                <defs>
                  <linearGradient id="actualGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="oklch(0.7 0.18 145)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="oklch(0.7 0.18 145)" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="forecastGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="oklch(0.7 0.18 220)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="oklch(0.7 0.18 220)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.22 0.005 260)" />
                <XAxis dataKey="month" stroke="oklch(0.65 0 0)" fontSize={12} tickFormatter={(value) => formatMonth(value, "short")} />
                <YAxis stroke="oklch(0.65 0 0)" fontSize={12} tickFormatter={(value) => `$${value / 1000}K`} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "oklch(0.12 0.005 260)",
                    border: "1px solid oklch(0.22 0.005 260)",
                    borderRadius: "8px",
                    color: "oklch(0.95 0 0)",
                  }}
                  labelFormatter={(value) => formatMonth(value as number, "long")}
                  formatter={(value: number) => [`$${value.toLocaleString()}`, ""]}
                />
                <Area type="monotone" dataKey="target" stroke="oklch(0.65 0 0)" strokeDasharray="5 5" fill="none" strokeWidth={1} />
                <Area type="monotone" dataKey="forecast" stroke="oklch(0.7 0.18 220)" fill="url(#forecastGradient)" strokeWidth={2} />
                <Area type="monotone" dataKey="actual" stroke="oklch(0.7 0.18 145)" fill="url(#actualGradient)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-medium">{copy.quarterlyBreakdown[locale]}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={quarterlyForecast} barGap={4}>
                  <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.22 0.005 260)" />
                  <XAxis dataKey="quarter" stroke="oklch(0.65 0 0)" fontSize={12} />
                  <YAxis stroke="oklch(0.65 0 0)" fontSize={12} tickFormatter={(value) => `$${value / 1000000}M`} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "oklch(0.12 0.005 260)",
                      border: "1px solid oklch(0.22 0.005 260)",
                      borderRadius: "8px",
                      color: "oklch(0.95 0 0)",
                    }}
                    formatter={(value: number) => [`$${(value / 1000000).toFixed(2)}M`, ""]}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: "12px" }}
                    formatter={(value) => <span style={{ color: "oklch(0.65 0 0)" }}>{value}</span>}
                  />
                  <Bar dataKey="committed" name={copy.committed[locale]} fill="oklch(0.7 0.18 145)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="bestCase" name={copy.bestCase[locale]} fill="oklch(0.7 0.18 220)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="pipeline" name={copy.pipeline[locale]} fill="oklch(0.22 0.005 260)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-medium">{copy.scenarioAnalysis[locale]}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {scenarios.map((scenario, index) => (
              <div
                key={scenario.nameKey}
                className="rounded-lg border border-border bg-secondary/50 p-4 transition-all duration-300 hover:border-muted-foreground/30 animate-in fade-in slide-in-from-right-2"
                style={{ animationDelay: `${index * 100}ms` }}
              >
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className="h-8 w-2 rounded-full"
                      style={{
                        backgroundColor:
                          scenario.color === "accent"
                            ? "oklch(0.7 0.18 145)"
                            : scenario.color === "chart-1"
                            ? "oklch(0.7 0.18 220)"
                            : "oklch(0.65 0.2 25)",
                      }}
                    />
                    <div>
                      <p className="font-medium text-foreground">{copy[scenario.nameKey][locale]}</p>
                      <p className="text-xs text-muted-foreground">
                        {interpolate(copy.probability[locale], { value: scenario.probability })}
                      </p>
                    </div>
                  </div>
                  <p className="text-xl font-semibold text-foreground">{formatCompactCurrency(scenario.revenue)}</p>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                  <div
                    className="h-full rounded-full transition-all duration-1000 ease-out"
                    style={{
                      width: `${scenario.probability}%`,
                      backgroundColor:
                        scenario.color === "accent"
                          ? "oklch(0.7 0.18 145)"
                          : scenario.color === "chart-1"
                          ? "oklch(0.7 0.18 220)"
                          : "oklch(0.65 0.2 25)",
                    }}
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card className="border-border bg-card">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-medium">{copy.riskFactors[locale]}</CardTitle>
            <Badge variant="outline" className="border-chart-3/30 text-chart-3">
              <AlertTriangle className="mr-1 h-3 w-3" />
              {interpolate(copy.identified[locale], { count: riskFactors.length })}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {riskFactors.map((risk, index) => (
              <div
                key={risk.id}
                className="group rounded-lg border border-border bg-secondary/50 p-4 transition-all duration-300 hover:border-chart-3/30 animate-in fade-in slide-in-from-bottom-2"
                style={{ animationDelay: `${index * 75}ms` }}
              >
                <div className="mb-2 flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <div
                      className={cn(
                        "mt-2 h-2 w-2 rounded-full",
                        risk.severity === "high" ? "bg-destructive" : "bg-chart-3"
                      )}
                    />
                    <div>
                      <p className="font-medium text-foreground">{copy[risk.titleKey][locale]}</p>
                      <p className="text-sm text-muted-foreground">{copy[risk.descriptionKey][locale]}</p>
                    </div>
                  </div>
                  <Badge
                    className={
                      risk.severity === "high"
                        ? "border-destructive/30 bg-destructive/20 text-destructive"
                        : "border-chart-3/30 bg-chart-3/20 text-chart-3"
                    }
                  >
                    {formatCompactCurrency(risk.impact)}
                  </Badge>
                </div>
                <div className="ml-5 flex flex-wrap items-center gap-2">
                  {risk.deals.map((deal) => (
                    <Badge key={deal} variant="outline" className="border-border text-xs text-muted-foreground">
                      {deal}
                    </Badge>
                  ))}
                </div>
                <div className="ml-5 mt-3">
                  <Button variant="ghost" size="sm" className="h-auto p-0 text-xs text-muted-foreground hover:text-foreground">
                    {copy.viewMitigationPlan[locale]}
                    <ArrowRight className="ml-1 h-3 w-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
