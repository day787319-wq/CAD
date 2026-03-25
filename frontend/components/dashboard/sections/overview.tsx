"use client";

import { RecentDeals } from "@/components/dashboard/recent-deals";

export function OverviewSection() {
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

      <div className="grid grid-cols-1 gap-6">
        <RecentDeals />
      </div>
    </div>
  );
}
