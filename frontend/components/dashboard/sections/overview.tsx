"use client";

import { DollarSign, Target, TrendingUp, Users } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
import { MetricCard } from "@/components/dashboard/metric-card";
import { RevenueChart } from "@/components/dashboard/charts/revenue-chart";
import { PipelineOverview } from "@/components/dashboard/charts/pipeline-overview";
import { RecentDeals } from "@/components/dashboard/recent-deals";
import { TemplateLibraryStarter } from "@/components/dashboard/template-library-starter";
import { TopPerformers } from "@/components/dashboard/top-performers";

const copy = {
  totalRevenue: { en: "Total Revenue", zn: "总营收", vn: "Tong doanh thu" },
  conversionRate: { en: "Conversion Rate", zn: "转化率", vn: "Ti le chuyen doi" },
  activeDeals: { en: "Active Deals", zn: "活跃交易", vn: "Giao dich dang mo" },
  newLeads: { en: "New Leads", zn: "新增线索", vn: "Lead moi" },
} as const;

export function OverviewSection() {
  const { locale } = useI18n();

  return (
    <div className="space-y-6">
      {/* <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title={copy.totalRevenue[locale]}
          value="$2.4M"
          change="+12.5%"
          changeType="positive"
          icon={DollarSign}
          delay={0}
        />
        <MetricCard
          title={copy.conversionRate[locale]}
          value="24.8%"
          change="+3.2%"
          changeType="positive"
          icon={TrendingUp}
          delay={1}
        />
        <MetricCard
          title={copy.activeDeals[locale]}
          value="147"
          change="-5"
          changeType="negative"
          icon={Target}
          delay={2}
        />
        <MetricCard
          title={copy.newLeads[locale]}
          value="892"
          change="+18.3%"
          changeType="positive"
          icon={Users}
          delay={3}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <RevenueChart />
        </div>
        <PipelineOverview />
      </div> */}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(340px,0.85fr)]">
        <RecentDeals />
        <TemplateLibraryStarter />
      </div>
    </div>
  );
}
