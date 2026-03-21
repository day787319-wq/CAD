"use client";

import { MouseEvent, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
import { Button } from "@/components/ui/button";
import {
  TEMPLATE_API_URL,
  Template,
  TemplateMarketCheck,
  formatAmount,
  formatFeeTier,
  formatRelativeTimestamp,
  formatUsd,
  shortAddress,
} from "@/lib/template";

const copy = {
  title: {
    en: "Optional live market check",
    zn: "可选实时市场检查",
    vn: "Kiem tra thi truong truc tiep tuy chon",
  },
  subtitle: {
    en: "Uses live CoinGecko pricing and route quotes. This is slower than the wallet support preview above.",
    zn: "使用 CoinGecko 实时价格和路径报价。速度会比上方的钱包支持预览更慢。",
    vn: "Su dung gia CoinGecko va bao gia route truc tiep. Cham hon so voi preview ho tro wallet ben tren.",
  },
  refresh: {
    en: "Refresh prices",
    zn: "刷新价格",
    vn: "Lam moi gia",
  },
  hide: {
    en: "Hide live check",
    zn: "隐藏实时检查",
    vn: "An kiem tra truc tiep",
  },
  view: {
    en: "View live check",
    zn: "查看实时检查",
    vn: "Xem kiem tra truc tiep",
  },
  loading: {
    en: "Loading current market pricing...",
    zn: "正在加载当前市场价格...",
    vn: "Dang tai gia thi truong hien tai...",
  },
  loadFailed: {
    en: "Failed to load live market check",
    zn: "加载实时市场检查失败",
    vn: "Tai kiem tra thi truong truc tiep that bai",
  },
  perContractEth: {
    en: "Per-contract ETH",
    zn: "每合约 ETH",
    vn: "ETH moi hop dong",
  },
  perContractWeth: {
    en: "Per-contract WETH",
    zn: "每合约 WETH",
    vn: "WETH moi hop dong",
  },
  liveTotalCost: {
    en: "Live total cost",
    zn: "实时总成本",
    vn: "Tong chi phi truc tiep",
  },
  liveTotalCostHint: {
    en: "Current ETH funding cost for one contract",
    zn: "单个合约当前的 ETH 资金成本",
    vn: "Chi phi cap von ETH hien tai cho mot hop dong",
  },
  stableOutputUsd: {
    en: "Stable output USD",
    zn: "稳定币输出 USD",
    vn: "Gia tri stable dau ra",
  },
  stableOutputUsdHint: {
    en: "Estimated current value of routed stable outputs",
    zn: "按路径分配后的稳定币输出当前估值",
    vn: "Gia tri hien tai uoc tinh cua stablecoin dau ra theo route",
  },
  slippage: {
    en: "Slippage",
    zn: "滑点",
    vn: "Do truot gia",
  },
  feeTier: {
    en: "Fee tier",
    zn: "费率层级",
    vn: "Muc phi",
  },
  ethSpot: {
    en: "ETH spot",
    zn: "ETH 现价",
    vn: "Gia giao ngay ETH",
  },
  wethSpot: {
    en: "WETH spot",
    zn: "WETH 现价",
    vn: "Gia giao ngay WETH",
  },
  checkedAt: {
    en: "Checked at",
    zn: "检查时间",
    vn: "Thoi diem kiem tra",
  },
  warning: {
    en: "Market data warning",
    zn: "市场数据警告",
    vn: "Canh bao du lieu thi truong",
  },
  routePricing: {
    en: "Stablecoin route pricing",
    zn: "稳定币路径定价",
    vn: "Dinh gia route stablecoin",
  },
  wethAllocated: {
    en: "WETH allocated",
    zn: "分配的 WETH",
    vn: "WETH duoc cap",
  },
  stableSpot: {
    en: "Stable spot",
    zn: "稳定币现价",
    vn: "Gia giao ngay stable",
  },
  estimatedOutput: {
    en: "Est. output",
    zn: "预估输出",
    vn: "Dau ra uoc tinh",
  },
  minimumReceived: {
    en: "Minimum received",
    zn: "最少收到",
    vn: "Nhan toi thieu",
  },
  routeFee: {
    en: "Route fee",
    zn: "路径费率",
    vn: "Phi route",
  },
  swapValue: {
    en: "Swap value",
    zn: "交换价值",
    vn: "Gia tri swap",
  },
  noRouteMessage: {
    en: "This template does not include a stablecoin swap route, so the preview focuses on ETH funding, local WETH wrap requirements, and any direct distributor funding.",
    zn: "该模板不包含稳定币交换路径，因此预览将聚焦于 ETH 资金、本地 WETH 包装需求以及任何直接分发资金。",
    vn: "Template nay khong co route swap stablecoin, vi vay preview se tap trung vao cap von ETH, nhu cau wrap WETH noi bo va phan cap von distributor truc tiep.",
  },
} as const;

function MetricCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-border/70 bg-background/70 px-4 py-3">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-semibold text-foreground">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

type TemplateMarketCheckProps = {
  template: Template;
  stopPropagation?: boolean;
};

export function TemplateMarketCheckPanel({ template, stopPropagation = false }: TemplateMarketCheckProps) {
  const { locale } = useI18n();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [marketCheck, setMarketCheck] = useState<TemplateMarketCheck | null>(null);

  const loadMarketCheck = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${TEMPLATE_API_URL}/api/templates/${template.id}/market-check`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.detail ?? copy.loadFailed[locale]);
      setMarketCheck(payload);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : copy.loadFailed[locale]);
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = (event: MouseEvent<HTMLButtonElement>) => {
    if (stopPropagation) event.stopPropagation();
    const nextOpen = !open;
    setOpen(nextOpen);
    if (nextOpen && !marketCheck && !loading) {
      void loadMarketCheck();
    }
  };

  const handleRefresh = (event: MouseEvent<HTMLButtonElement>) => {
    if (stopPropagation) event.stopPropagation();
    void loadMarketCheck();
  };

  return (
    <div className="mt-4 rounded-2xl border border-border/70 bg-secondary/10 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-foreground">{copy.title[locale]}</p>
          <p className="mt-1 text-xs text-muted-foreground">{copy.subtitle[locale]}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {open ? (
            <Button type="button" variant="outline" size="sm" onClick={handleRefresh} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              {copy.refresh[locale]}
            </Button>
          ) : null}
          <Button type="button" variant={open ? "outline" : "default"} size="sm" onClick={handleToggle}>
            {open ? copy.hide[locale] : copy.view[locale]}
          </Button>
        </div>
      </div>

      {open ? (
        <div className="mt-4 space-y-4">
          {loading && !marketCheck ? (
            <div className="flex items-center gap-2 rounded-xl border border-border/70 bg-background/70 px-4 py-3 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {copy.loading[locale]}
            </div>
          ) : null}

          {error ? (
            <div className="rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          ) : null}

          {marketCheck ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
                <MetricCard label={copy.perContractEth[locale]} value={`${formatAmount(marketCheck.per_contract.required_eth, locale)} ETH`} hint={formatUsd(marketCheck.totals.required_eth_total_usd, locale)} />
                <MetricCard label={copy.perContractWeth[locale]} value={`${formatAmount(marketCheck.per_contract.required_weth, locale)} WETH`} hint={formatUsd(marketCheck.totals.required_weth_total_usd, locale)} />
                <MetricCard label={copy.liveTotalCost[locale]} value={formatUsd(marketCheck.totals.combined_cost_usd, locale)} hint={copy.liveTotalCostHint[locale]} />
                <MetricCard label={copy.stableOutputUsd[locale]} value={formatUsd(marketCheck.totals.stablecoin_output_total_usd, locale)} hint={copy.stableOutputUsdHint[locale]} />
                <MetricCard label={copy.slippage[locale]} value={`${formatAmount(marketCheck.slippage_percent, locale)}%`} />
                <MetricCard label={copy.feeTier[locale]} value={formatFeeTier(marketCheck.fee_tier, locale)} />
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                <MetricCard label={copy.ethSpot[locale]} value={formatUsd(marketCheck.price_snapshot.eth_usd, locale)} />
                <MetricCard label={copy.wethSpot[locale]} value={formatUsd(marketCheck.price_snapshot.weth_usd, locale)} />
                <MetricCard label={copy.checkedAt[locale]} value={formatRelativeTimestamp(marketCheck.price_snapshot.fetched_at, locale)} />
              </div>

              {marketCheck.price_snapshot.error ? (
                <div className="rounded-xl border border-border/70 bg-background/70 px-4 py-3 text-sm text-muted-foreground">
                  {copy.warning[locale]}: {marketCheck.price_snapshot.error}
                </div>
              ) : null}

              {marketCheck.stablecoin_quotes.length > 0 ? (
                <div className="space-y-3">
                  <p className="text-sm font-semibold text-foreground">{copy.routePricing[locale]}</p>
                  {marketCheck.stablecoin_quotes.map((quote) => (
                    <div key={quote.token_address} className="rounded-xl border border-border/70 bg-background/70 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-foreground">{quote.token_symbol}</p>
                          <p className="mt-1 text-xs text-muted-foreground">{shortAddress(quote.token_address)}</p>
                        </div>
                        <p className="text-xs text-muted-foreground">{formatAmount(quote.percent, locale)}%</p>
                      </div>

                      <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
                        <MetricCard label={copy.wethAllocated[locale]} value={`${formatAmount(quote.per_contract_weth_amount, locale)} WETH`} />
                        <MetricCard label={copy.stableSpot[locale]} value={formatUsd(quote.token_usd, locale)} />
                        <MetricCard label={copy.estimatedOutput[locale]} value={quote.per_contract_output ? `${formatAmount(quote.per_contract_output, locale)} ${quote.token_symbol}` : "--"} hint={formatUsd(quote.per_contract_output_usd, locale)} />
                        <MetricCard label={copy.minimumReceived[locale]} value={quote.per_contract_min_output ? `${formatAmount(quote.per_contract_min_output, locale)} ${quote.token_symbol}` : "--"} hint={formatUsd(quote.per_contract_min_output_usd, locale)} />
                        <MetricCard label={copy.routeFee[locale]} value={formatFeeTier(quote.quote.fee_tier, locale)} />
                        <MetricCard label={copy.swapValue[locale]} value={formatUsd(quote.per_contract_weth_usd, locale)} hint={`${formatAmount(quote.quote.slippage_percent ?? marketCheck.slippage_percent, locale)}% ${copy.slippage[locale].toLowerCase()}`} />
                      </div>

                      {!quote.quote.available && quote.quote.error ? (
                        <p className="mt-3 text-xs text-muted-foreground">{quote.quote.error}</p>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">
                  {copy.noRouteMessage[locale]}
                </div>
              )}
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
