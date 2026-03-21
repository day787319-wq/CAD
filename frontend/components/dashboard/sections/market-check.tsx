"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, BarChart3 } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
import { Button } from "@/components/ui/button";
import { TemplateMarketCheckPanel } from "@/components/dashboard/template-market-check";
import {
  TEMPLATE_API_URL,
  Template,
  formatAmount,
  formatFeeTier,
  getStablecoinDistributionRows,
} from "@/lib/template";

const copy = {
  title: {
    en: "Template Live Market Check",
    zn: "模板实时市场检查",
    vn: "Kiem tra thi truong truc tiep cho template",
  },
  subtitle: {
    en: "Run live CoinGecko pricing and route quotes for one-contract templates from the sidebar.",
    zn: "从侧边栏对单合约模板运行 CoinGecko 实时定价和路径报价。",
    vn: "Chay gia CoinGecko va bao gia route truc tiep cho template mot hop dong tu sidebar.",
  },
  back: {
    en: "Back to Template Library",
    zn: "返回模板库",
    vn: "Quay lai thu vien mau",
  },
  loading: {
    en: "Loading templates...",
    zn: "正在加载模板...",
    vn: "Dang tai template...",
  },
  noTemplates: {
    en: "No templates saved yet. Create a one-contract template in Template Library first.",
    zn: "还没有保存的模板。请先在模板库创建一个单合约模板。",
    vn: "Chua co template nao duoc luu. Hay tao template mot hop dong trong Template Library truoc.",
  },
  selectTemplate: {
    en: "Select a template from Template Library to start the live check.",
    zn: "从模板库选择一个模板以开始实时检查。",
    vn: "Chon mot template trong Template Library de bat dau kiem tra truc tiep.",
  },
  templates: {
    en: "Templates",
    zn: "模板",
    vn: "Template",
  },
  chooseTemplate: {
    en: "Choose the one-contract template you want to inspect live.",
    zn: "选择你想实时查看的单合约模板。",
    vn: "Chon template mot hop dong ma ban muon kiem tra truc tiep.",
  },
  oneTemplateDescription: {
    en: "One template equals one contract / one subwallet. The wallet flow multiplies this plan later.",
    zn: "一个模板等于一个合约 / 一个子钱包。钱包流程之后会按数量扩展该方案。",
    vn: "Mot template tuong ung mot hop dong / mot sub-wallet. Luong wallet se nhan ke hoach nay sau.",
  },
  noSwap: {
    en: "No stablecoin swap configured",
    zn: "未配置稳定币交换",
    vn: "Chua cau hinh swap stablecoin",
  },
  gasReserve: {
    en: "Gas reserve",
    zn: "Gas 预留",
    vn: "Du phong gas",
  },
  swapBudget: {
    en: "Swap budget",
    zn: "交换预算",
    vn: "Ngan sach swap",
  },
  directEth: {
    en: "Direct ETH",
    zn: "直接 ETH",
    vn: "ETH truc tiep",
  },
  directWeth: {
    en: "Direct WETH",
    zn: "直接 WETH",
    vn: "WETH truc tiep",
  },
} as const;

function getTemplateRouteSummary(template: Template, locale: "en" | "zn" | "vn") {
  if (template.stablecoin_distribution_mode === "none") {
    return copy.noSwap[locale];
  }

  const routeCount = template.stablecoin_allocations.length;
  if (locale === "zn") return `${routeCount} 条稳定币路径`;
  if (locale === "vn") return `${routeCount} tuyen stablecoin`;
  return `${routeCount} stablecoin route${routeCount === 1 ? "" : "s"}`;
}

function SummaryPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-background/60 px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-semibold text-foreground">{value}</p>
    </div>
  );
}

export function TemplateLiveCheckSection({
  selectedTemplateId,
  onSelectedTemplateChange,
  onOpenTemplateLibrary,
}: {
  selectedTemplateId: string | null;
  onSelectedTemplateChange: (templateId: string | null) => void;
  onOpenTemplateLibrary: () => void;
}) {
  const { locale } = useI18n();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        const response = await fetch(`${TEMPLATE_API_URL}/api/templates`);
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.detail ?? copy.loading[locale]);

        if (active) {
          setTemplates(Array.isArray(payload.templates) ? payload.templates : []);
          setError(null);
        }
      } catch (loadError) {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : copy.loading[locale]);
        }
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [locale]);

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === selectedTemplateId) ?? templates[0] ?? null,
    [selectedTemplateId, templates],
  );

  useEffect(() => {
    if (templates.length === 0) {
      if (selectedTemplateId !== null) onSelectedTemplateChange(null);
      return;
    }

    if (!selectedTemplateId || !templates.some((template) => template.id === selectedTemplateId)) {
      onSelectedTemplateChange(templates[0].id);
    }
  }, [onSelectedTemplateChange, selectedTemplateId, templates]);

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border bg-card p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/10 text-accent">
                <BarChart3 className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-foreground">{copy.title[locale]}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{copy.subtitle[locale]}</p>
              </div>
            </div>
          </div>

          <Button type="button" variant="outline" onClick={onOpenTemplateLibrary}>
            <ArrowLeft className="h-4 w-4" />
            {copy.back[locale]}
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">{copy.loading[locale]}</div>
      ) : error ? (
        <div className="rounded-2xl border border-border bg-card p-6 text-sm text-destructive">{error}</div>
      ) : templates.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-6 text-sm text-muted-foreground">
          {copy.noTemplates[locale]}
        </div>
      ) : !selectedTemplate ? (
        <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
          {copy.selectTemplate[locale]}
        </div>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
          <div className="space-y-3">
            <div className="rounded-2xl border border-border/70 bg-card p-4">
              <p className="text-sm font-semibold text-foreground">{copy.templates[locale]}</p>
              <p className="mt-1 text-xs text-muted-foreground">{copy.chooseTemplate[locale]}</p>
            </div>

            {templates.map((template) => {
              const isActive = template.id === selectedTemplate.id;
              return (
                <button
                  key={template.id}
                  type="button"
                  onClick={() => onSelectedTemplateChange(template.id)}
                  className={`w-full rounded-2xl border p-4 text-left transition-colors ${
                    isActive ? "border-accent/60 bg-accent/5" : "border-border/70 bg-card hover:bg-secondary/20"
                  }`}
                >
                  <p className="text-sm font-semibold text-foreground">{template.name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {getTemplateRouteSummary(template, locale)}
                  </p>
                </button>
              );
            })}
          </div>

          <div className="space-y-4">
            <div className="rounded-2xl border border-border/70 bg-card p-5">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <p className="text-base font-semibold text-foreground">{selectedTemplate.name}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{copy.oneTemplateDescription[locale]}</p>
                </div>
                <p className="text-xs text-muted-foreground">{`${formatAmount(selectedTemplate.slippage_percent, locale)}% · ${formatFeeTier(selectedTemplate.fee_tier, locale)}`}</p>
              </div>

              <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                <SummaryPill label={copy.gasReserve[locale]} value={`${formatAmount(selectedTemplate.gas_reserve_eth_per_contract, locale)} ETH`} />
                <SummaryPill label={copy.swapBudget[locale]} value={`${formatAmount(selectedTemplate.swap_budget_eth_per_contract, locale)} ETH`} />
                <SummaryPill label={copy.directEth[locale]} value={`${formatAmount(selectedTemplate.direct_contract_eth_per_contract, locale)} ETH`} />
                <SummaryPill label={copy.directWeth[locale]} value={`${formatAmount(selectedTemplate.direct_contract_weth_per_contract, locale)} WETH`} />
              </div>

              {selectedTemplate.stablecoin_allocations.length > 0 ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  {getStablecoinDistributionRows(selectedTemplate).map((allocation) => (
                    <div key={allocation.token_address} className="rounded-xl border border-border/60 bg-secondary/10 px-3 py-2 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">{allocation.token_symbol}</span>
                      {` ${formatAmount(allocation.weth_amount_per_contract, locale)} WETH · ${formatAmount(allocation.percent, locale)}%`}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>

            <TemplateMarketCheckPanel template={selectedTemplate} />
          </div>
        </div>
      )}
    </div>
  );
}
