"use client";

import { MouseEvent, useEffect, useRef, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
import { Button } from "@/components/ui/button";
import {
  TEMPLATE_API_URL,
  Template,
  TemplateMarketCheck,
  getTemplateChainMeta,
  formatAmount,
  formatFeeTier,
  formatRouteFeeTiers,
  formatRoutePath,
  formatRelativeTimestamp,
  formatSwapBackendLabel,
  formatUsd,
  shortAddress,
} from "@/lib/template";


function MetricCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="cad-panel-muted px-4 py-3">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-semibold text-foreground">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

type TemplateMarketCheckProps = {
  template: Template;
  contractCount?: number;
  defaultOpen?: boolean;
  showToggle?: boolean;
  stopPropagation?: boolean;
};

const AUTO_REFRESH_INTERVAL_SECONDS = 60;
const AUTO_REFRESH_INTERVAL_MS = AUTO_REFRESH_INTERVAL_SECONDS * 1000;

const copy = {
  optionalTitle: { en: "Optional live market check", zn: "可选实时市场检查", vn: "Kiểm tra thị trường trực tiếp tùy chọn" },
  title: { en: "Live market check", zn: "实时市场检查", vn: "Kiểm tra thị trường trực tiếp" },
  subtitle: {
    en: "Uses live CoinGecko pricing and route quotes for {count} contract{suffix}. This is slower than the wallet support preview above.",
    zn: "使用 CoinGecko 实时价格和 {count} 个合约{suffix}的路由报价。该检查比上方的钱包支持预览更慢。",
    vn: "Sử dụng giá CoinGecko trực tiếp và báo giá tuyến cho {count} hợp đồng{suffix}. Tính năng này chậm hơn phần xem trước hỗ trợ ví phía trên.",
  },
  refreshing: { en: "Refreshing live market pricing...", zn: "正在刷新实时市场价格...", vn: "Đang làm mới giá thị trường trực tiếp..." },
  paused: { en: "Auto-refresh paused while this tab is hidden.", zn: "当前标签页隐藏时自动刷新已暂停。", vn: "Tự làm mới tạm dừng khi tab này bị ẩn." },
  every: { en: "Auto-refresh every {seconds}s while this panel is open.", zn: "面板打开时每 {seconds} 秒自动刷新。", vn: "Tự làm mới mỗi {seconds} giây khi bảng này mở." },
  in: { en: "Auto-refresh in {seconds}s", zn: "{seconds} 秒后自动刷新", vn: "Tự làm mới sau {seconds} giây" },
  refreshPrices: { en: "Refresh prices", zn: "刷新价格", vn: "Làm mới giá" },
  hide: { en: "Hide live check", zn: "隐藏实时检查", vn: "Ẩn kiểm tra trực tiếp" },
  view: { en: "View live check", zn: "查看实时检查", vn: "Xem kiểm tra trực tiếp" },
  loading: { en: "Loading current market pricing...", zn: "正在加载当前市场价格...", vn: "Đang tải giá thị trường hiện tại..." },
  stablePricing: { en: "Swap route pricing", zn: "兑换路由定价", vn: "Định giá tuyến swap" },
  noRoutes: {
    en: "This template does not include a token swap route, so the preview focuses on sub-wallet native funding, local wrapped-token needs, and any direct contract native / wrapped funding from the main wallet.",
    zn: "此模板不包含代币兑换路由，因此预览重点展示子钱包原生资产注资、本地包装代币需求，以及由主钱包提供的任何直接合约原生资产 / 包装资产注资。",
    vn: "Mẫu này không bao gồm tuyến swap token, nên phần xem trước tập trung vào cấp vốn tài sản gốc cho ví con, nhu cầu token wrap cục bộ và mọi khoản cấp vốn trực tiếp native / wrapped cho hợp đồng từ ví chính.",
  },
} as const;

function formatTokenAmount(value: string | null | undefined, symbol: string) {
  if (value === null || value === undefined) return "--";
  return `${formatAmount(value)} ${symbol}`;
}

function toFiniteNumber(value: string | number | null | undefined) {
  const numeric = typeof value === "number" ? value : Number.parseFloat(value ?? "");
  return Number.isFinite(numeric) ? numeric : null;
}

export function TemplateMarketCheckPanel({
  template,
  contractCount = 1,
  defaultOpen = false,
  showToggle = true,
  stopPropagation = false,
}: TemplateMarketCheckProps) {
  const { locale, interpolate } = useI18n();
  const [open, setOpen] = useState(defaultOpen);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [marketCheck, setMarketCheck] = useState<TemplateMarketCheck | null>(null);
  const [isPageVisible, setIsPageVisible] = useState(true);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [nextRefreshAt, setNextRefreshAt] = useState<number | null>(null);
  const requestIdRef = useRef(0);
  const chainMeta = getTemplateChainMeta(template.chain);
  const fundedQuotes = (marketCheck?.stablecoin_quotes ?? []).filter(
    (quote) => (toFiniteNumber(quote.per_contract_weth_amount) ?? 0) > 0,
  );

  const normalizedContractCount = Number.isFinite(contractCount) && contractCount > 0 ? Math.floor(contractCount) : 1;

  useEffect(() => {
    const handleVisibilityChange = () => {
      const visible = !document.hidden;
      setIsPageVisible(visible);
      setNowMs(Date.now());
    };

    handleVisibilityChange();
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  useEffect(() => {
    setOpen(defaultOpen);
    setLoading(false);
    setError(null);
    setMarketCheck(null);
    setNextRefreshAt(null);
    requestIdRef.current += 1;
  }, [template.id, defaultOpen]);

  const loadMarketCheck = async () => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        contract_count: `${normalizedContractCount}`,
      });
      const response = await fetch(`${TEMPLATE_API_URL}/api/templates/${template.id}/market-check?${params.toString()}`, {
        cache: "no-store",
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.detail ?? "Failed to load live market check");
      if (requestId === requestIdRef.current) {
        setMarketCheck(payload);
      }
    } catch (loadError) {
      if (requestId === requestIdRef.current) {
        setError(loadError instanceof Error ? loadError.message : "Failed to load live market check");
      }
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
        setNowMs(Date.now());
        setNextRefreshAt(Date.now() + AUTO_REFRESH_INTERVAL_MS);
      }
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

  useEffect(() => {
    if (!open) {
      setNextRefreshAt(null);
      return;
    }

    if (!marketCheck || marketCheck.contract_count !== normalizedContractCount) {
      void loadMarketCheck();
      return;
    }

    if (nextRefreshAt === null) {
      setNowMs(Date.now());
      setNextRefreshAt(Date.now() + AUTO_REFRESH_INTERVAL_MS);
    }
  }, [open, normalizedContractCount]);

  useEffect(() => {
    if (!open || !isPageVisible) return;

    setNowMs(Date.now());
    const intervalId = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [open, isPageVisible]);

  useEffect(() => {
    if (!open || !isPageVisible || loading || nextRefreshAt === null) return;
    if (nowMs >= nextRefreshAt) {
      void loadMarketCheck();
    }
  }, [open, isPageVisible, loading, nextRefreshAt, nowMs]);

  const secondsUntilRefresh = nextRefreshAt === null ? null : Math.max(0, Math.ceil((nextRefreshAt - nowMs) / 1000));
  const autoRefreshStatus = loading
    ? copy.refreshing[locale]
    : !isPageVisible
      ? copy.paused[locale]
      : secondsUntilRefresh === null
        ? interpolate(copy.every[locale], { seconds: AUTO_REFRESH_INTERVAL_SECONDS })
        : interpolate(copy.in[locale], { seconds: secondsUntilRefresh });

  return (
    <div className="cad-panel mt-4 px-4 py-4 sm:px-5 sm:py-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-foreground">{showToggle ? copy.optionalTitle[locale] : copy.title[locale]}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {interpolate(copy.subtitle[locale], {
              count: normalizedContractCount,
              suffix: normalizedContractCount === 1 ? "" : locale === "zn" ? "的" : "s",
            })}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{autoRefreshStatus}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {open ? (
            <Button type="button" variant="outline" size="sm" onClick={handleRefresh} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              {copy.refreshPrices[locale]}
            </Button>
          ) : null}
          {showToggle ? (
            <Button type="button" variant={open ? "outline" : "default"} size="sm" onClick={handleToggle}>
              {open ? copy.hide[locale] : copy.view[locale]}
            </Button>
          ) : null}
        </div>
      </div>

      {open ? (
        <div className="mt-4 space-y-4">
          {loading && !marketCheck ? (
            <div className="cad-panel-muted flex items-center gap-2 px-4 py-3 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {copy.loading[locale]}
            </div>
          ) : null}

          {error ? (
            <div className="rounded-2xl bg-destructive/8 px-4 py-3 text-sm text-destructive ring-1 ring-destructive/15">
              {error}
            </div>
          ) : null}

          {marketCheck ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
                <MetricCard label={locale === "en" ? `Per-contract ${chainMeta.nativeSymbol}` : locale === "zn" ? `每合约 ${chainMeta.nativeSymbol}` : `${chainMeta.nativeSymbol} mỗi hợp đồng`} value={formatTokenAmount(marketCheck.per_contract.required_eth, chainMeta.nativeSymbol)} hint={formatUsd(marketCheck.totals.required_eth_total_usd)} />
                <MetricCard label={locale === "en" ? `Per-contract ${chainMeta.wrappedNativeSymbol}` : locale === "zn" ? `每合约 ${chainMeta.wrappedNativeSymbol}` : `${chainMeta.wrappedNativeSymbol} mỗi hợp đồng`} value={formatTokenAmount(marketCheck.per_contract.required_weth, chainMeta.wrappedNativeSymbol)} hint={formatUsd(marketCheck.totals.required_weth_total_usd)} />
                <MetricCard label={locale === "en" ? "Funding total" : locale === "zn" ? "资金总额" : "Tổng cấp vốn"} value={formatTokenAmount(marketCheck.totals.required_eth_total, chainMeta.nativeSymbol)} hint={formatUsd(marketCheck.totals.required_eth_total_usd)} />
                <MetricCard label={locale === "en" ? "Network fees" : locale === "zn" ? "网络费用" : "Phí mạng"} value={formatTokenAmount(marketCheck.totals.total_network_fee_eth, chainMeta.nativeSymbol)} hint={formatUsd(marketCheck.totals.total_network_fee_eth_usd)} />
                <MetricCard label={locale === "en" ? "All-in live total" : locale === "zn" ? "实时总成本" : "Tổng chi phí trực tiếp"} value={formatUsd(marketCheck.totals.total_eth_required_with_fees_usd ?? marketCheck.totals.combined_cost_usd)} hint={`${formatTokenAmount(marketCheck.totals.total_eth_required_with_fees, chainMeta.nativeSymbol)} ${locale === "en" ? "incl. funding, projected top-ups, and fees" : locale === "zn" ? "含资金、预计补充和费用" : "bao gồm cấp vốn, dự phòng nạp thêm và phí"}`} />
                <MetricCard label={locale === "en" ? "Token output USD" : locale === "zn" ? "代币输出 USD" : "USD đầu ra token"} value={formatUsd(marketCheck.totals.stablecoin_output_total_usd)} hint={locale === "en" ? "Estimated current value of routed token outputs" : locale === "zn" ? "路由代币输出的当前估算价值" : "Giá trị ước tính hiện tại của đầu ra token theo tuyến"} />
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
                <MetricCard label={locale === "en" ? `Contract ${chainMeta.nativeSymbol}` : locale === "zn" ? `合约 ${chainMeta.nativeSymbol}` : `${chainMeta.nativeSymbol} hợp đồng`} value={formatTokenAmount(marketCheck.per_contract.direct_contract_native_eth ?? "0", chainMeta.nativeSymbol)} />
                <MetricCard label={locale === "en" ? `Contract ${chainMeta.wrappedNativeSymbol}` : locale === "zn" ? `合约 ${chainMeta.wrappedNativeSymbol}` : `${chainMeta.wrappedNativeSymbol} hợp đồng`} value={formatTokenAmount(marketCheck.per_contract.direct_contract_weth, chainMeta.wrappedNativeSymbol)} />
                <MetricCard label={locale === "en" ? "Projected top-up reserve" : locale === "zn" ? "预计补充预留" : "Dự phòng nạp thêm"} value={formatTokenAmount(marketCheck.totals.projected_auto_top_up_eth_total ?? "0", chainMeta.nativeSymbol)} hint={formatUsd(marketCheck.totals.projected_auto_top_up_eth_total_usd)} />
                <MetricCard label={`${chainMeta.nativeSymbol} spot`} value={formatUsd(marketCheck.price_snapshot.eth_usd)} />
                <MetricCard label={`${chainMeta.wrappedNativeSymbol} spot`} value={formatUsd(marketCheck.price_snapshot.weth_usd)} />
                <MetricCard label={locale === "en" ? "Slippage" : locale === "zn" ? "滑点" : "Trượt giá"} value={`${formatAmount(marketCheck.slippage_percent)}%`} />
                <MetricCard label={locale === "en" ? "Fee tier" : locale === "zn" ? "费率层级" : "Mức phí"} value={formatFeeTier(marketCheck.fee_tier, template.chain)} />
                <MetricCard label={locale === "en" ? "Checked at" : locale === "zn" ? "检查时间" : "Thời điểm kiểm tra"} value={formatRelativeTimestamp(marketCheck.price_snapshot.fetched_at)} />
              </div>

              {marketCheck.price_snapshot.error ? (
                <div className="cad-panel-soft px-4 py-3 text-sm text-muted-foreground">
                  {locale === "en" ? "Market data warning" : locale === "zn" ? "市场数据警告" : "Cảnh báo dữ liệu thị trường"}: {marketCheck.price_snapshot.error}
                </div>
              ) : null}

              {fundedQuotes.length > 0 ? (
                <div className="space-y-3">
                  <p className="text-sm font-semibold text-foreground">{copy.stablePricing[locale]}</p>
                  {fundedQuotes.map((quote) => (
                    <div key={quote.token_address} className="cad-panel-soft p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-foreground">{quote.token_symbol}</p>
                          <p className="mt-1 text-xs text-muted-foreground">{shortAddress(quote.token_address)}</p>
                        </div>
                        <p className="text-xs text-muted-foreground">{formatAmount(quote.percent)}%</p>
                      </div>

                      <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-8">
                        <MetricCard label={locale === "en" ? `${chainMeta.wrappedNativeSymbol} allocated` : locale === "zn" ? `已分配 ${chainMeta.wrappedNativeSymbol}` : `${chainMeta.wrappedNativeSymbol} phân bổ`} value={`${formatAmount(quote.per_contract_weth_amount)} ${chainMeta.wrappedNativeSymbol}`} />
                        <MetricCard label={locale === "en" ? "Token spot" : locale === "zn" ? "代币现价" : "Giá token hiện tại"} value={formatUsd(quote.token_usd)} />
                        <MetricCard label={locale === "en" ? "Est. output" : locale === "zn" ? "预计输出" : "Đầu ra ước tính"} value={quote.per_contract_output ? `${formatAmount(quote.per_contract_output)} ${quote.token_symbol}` : "--"} hint={formatUsd(quote.per_contract_output_usd)} />
                        <MetricCard label={locale === "en" ? "Minimum received" : locale === "zn" ? "最低接收量" : "Nhận tối thiểu"} value={quote.per_contract_min_output ? `${formatAmount(quote.per_contract_min_output)} ${quote.token_symbol}` : "--"} hint={formatUsd(quote.per_contract_min_output_usd)} />
                        <MetricCard label={locale === "en" ? "Backend" : locale === "zn" ? "路由后端" : "Backend"} value={formatSwapBackendLabel(quote.quote.backend)} />
                        <MetricCard label={locale === "en" ? "Route fee" : locale === "zn" ? "路由费用" : "Phí tuyến"} value={formatRouteFeeTiers(quote.quote.fee_tier, quote.quote.path_fee_tiers, quote.quote.backend, template.chain)} />
                        <MetricCard label={locale === "en" ? "Route path" : locale === "zn" ? "路由路径" : "Đường đi"} value={formatRoutePath(quote.quote.path_symbols, quote.quote.token_in, quote.quote.token_out)} />
                        <MetricCard label={locale === "en" ? "Swap value" : locale === "zn" ? "兑换价值" : "Giá trị swap"} value={formatUsd(quote.per_contract_weth_usd)} hint={`${formatAmount(quote.quote.slippage_percent ?? marketCheck.slippage_percent)}% ${locale === "en" ? "slippage" : locale === "zn" ? "滑点" : "trượt giá"}`} />
                      </div>

                      {!quote.quote.available && quote.quote.error ? (
                        <p className="mt-3 text-xs text-muted-foreground">{quote.quote.error}</p>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="cad-panel-soft px-4 py-3 text-sm text-muted-foreground">
                  {copy.noRoutes[locale]}
                </div>
              )}
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
