"use client";

import { useEffect, useState } from "react";
import { stageLabels } from "@/lib/i18n";
import { useI18n } from "@/components/i18n-provider";

const stages = [
  { id: "lead", value: 45, count: 892, color: "bg-chart-1" },
  { id: "qualified", value: 28, count: 556, color: "bg-chart-2" },
  { id: "proposal", value: 18, count: 357, color: "bg-chart-3" },
  { id: "negotiation", value: 9, count: 179, color: "bg-accent" },
] as const;

const copy = {
  title: { en: "Pipeline Stages", zn: "销售管道阶段", vn: "Cac giai doan pipeline" },
  subtitle: { en: "Distribution by stage", zn: "按阶段分布", vn: "Phan bo theo giai doan" },
  totalPipelineValue: { en: "Total Pipeline Value", zn: "总管道金额", vn: "Tong gia tri pipeline" },
} as const;

export function PipelineOverview() {
  const [isLoaded, setIsLoaded] = useState(false);
  const { locale, formatCompactCurrency } = useI18n();

  useEffect(() => {
    const timer = setTimeout(() => setIsLoaded(true), 400);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="h-[380px] rounded-xl border border-border bg-card p-5 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-100">
      <div className="mb-6">
        <h3 className="text-base font-semibold text-foreground">{copy.title[locale]}</h3>
        <p className="mt-0.5 text-sm text-muted-foreground">{copy.subtitle[locale]}</p>
      </div>

      <div className="space-y-5">
        {stages.map((stage, index) => (
          <div key={stage.id} className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-foreground">
                {stageLabels[stage.id][locale]}
              </span>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">{stage.count}</span>
                <span className="text-sm font-semibold text-foreground">{stage.value}%</span>
              </div>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-secondary">
              <div
                className={`h-full rounded-full ${stage.color} transition-all duration-1000 ease-out`}
                style={{
                  width: isLoaded ? `${stage.value}%` : "0%",
                  transitionDelay: `${index * 150}ms`,
                }}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 border-t border-border pt-5">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">{copy.totalPipelineValue[locale]}</span>
          <span className="text-xl font-bold text-foreground">{formatCompactCurrency(4_800_000)}</span>
        </div>
      </div>
    </div>
  );
}
