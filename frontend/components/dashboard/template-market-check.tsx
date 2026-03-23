"use client";

import { MouseEvent, useEffect, useRef, useState } from "react";
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
  stablePricing: { en: "Stablecoin route pricing", zn: "稳定币路由定价", vn: "Định giá tuyến stablecoin" },
  noRoutes: {
    en: "This template does not include a stablecoin swap route, so the preview focuses on sub-wallet ETH, local WETH wrap requirements, and any direct contract ETH/WETH funding.",
    zn: "此模板不包含稳定币兑换路由，因此预览重点展示子钱包 ETH、本地 WETH 包装需求以及任何直接的合约 ETH/WETH 资金。",
    vn: "Mẫu này không bao gồm tuyến hoán đổi stablecoin, nên phần xem trước tập trung vào ETH ví con, nhu cầu wrap WETH cục bộ và mọi khoản cấp vốn ETH/WETH trực tiếp cho hợp đồng.",
  },
} as const;

function formatTokenAmount(value: string | null | undefined, symbol: string) {
  if (value === null || value === undefined) return "--";
  return `${formatAmount(value)} ${symbol}`;
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
                <MetricCard label={locale === "en" ? "Per-contract ETH" : locale === "zn" ? "每合约 ETH" : "ETH mỗi hợp đồng"} value={formatTokenAmount(marketCheck.per_contract.required_eth, "ETH")} hint={formatUsd(marketCheck.totals.required_eth_total_usd)} />
                <MetricCard label={locale === "en" ? "Per-contract WETH" : locale === "zn" ? "每合约 WETH" : "WETH mỗi hợp đồng"} value={formatTokenAmount(marketCheck.per_contract.required_weth, "WETH")} hint={formatUsd(marketCheck.totals.required_weth_total_usd)} />
                <MetricCard label={locale === "en" ? "Funding total" : locale === "zn" ? "资金总额" : "Tổng cấp vốn"} value={formatTokenAmount(marketCheck.totals.required_eth_total, "ETH")} hint={formatUsd(marketCheck.totals.required_eth_total_usd)} />
                <MetricCard label={locale === "en" ? "Network fees" : locale === "zn" ? "网络费用" : "Phí mạng"} value={formatTokenAmount(marketCheck.totals.total_network_fee_eth, "ETH")} hint={formatUsd(marketCheck.totals.total_network_fee_eth_usd)} />
                <MetricCard label={locale === "en" ? "All-in live total" : locale === "zn" ? "实时总成本" : "Tổng chi phí trực tiếp"} value={formatUsd(marketCheck.totals.total_eth_required_with_fees_usd ?? marketCheck.totals.combined_cost_usd)} hint={`${formatTokenAmount(marketCheck.totals.total_eth_required_with_fees, "ETH")} ${locale === "en" ? "incl. funding, projected top-ups, and fees" : locale === "zn" ? "含资金、预计补充和费用" : "bao gồm cấp vốn, dự phòng nạp thêm và phí"}`} />
                <MetricCard label={locale === "en" ? "Stable output USD" : locale === "zn" ? "稳定币输出 USD" : "USD đầu ra stablecoin"} value={formatUsd(marketCheck.totals.stablecoin_output_total_usd)} hint={locale === "en" ? "Estimated current value of routed stable outputs" : locale === "zn" ? "路由稳定币输出的当前估算价值" : "Giá trị ước tính hiện tại của đầu ra stablecoin theo tuyến"} />
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-7">
                <MetricCard label={locale === "en" ? "Sub-wallet ETH" : locale === "zn" ? "子钱包 ETH" : "ETH ví con"} value={formatTokenAmount(marketCheck.per_contract.direct_subwallet_eth ?? marketCheck.per_contract.direct_contract_eth, "ETH")} />
                <MetricCard label={locale === "en" ? "Contract ETH" : locale === "zn" ? "合约 ETH" : "ETH hợp đồng"} value={formatTokenAmount(marketCheck.per_contract.direct_contract_native_eth ?? "0", "ETH")} />
                <MetricCard label={locale === "en" ? "Contract WETH" : locale === "zn" ? "合约 WETH" : "WETH hợp đồng"} value={formatTokenAmount(marketCheck.per_contract.direct_contract_weth, "WETH")} />
                <MetricCard label={locale === "en" ? "Projected top-up reserve" : locale === "zn" ? "预计补充预留" : "Dự phòng nạp thêm"} value={formatTokenAmount(marketCheck.totals.projected_auto_top_up_eth_total ?? "0", "ETH")} hint={formatUsd(marketCheck.totals.projected_auto_top_up_eth_total_usd)} />
                <MetricCard label="ETH spot" value={formatUsd(marketCheck.price_snapshot.eth_usd)} />
                <MetricCard label="WETH spot" value={formatUsd(marketCheck.price_snapshot.weth_usd)} />
                <MetricCard label={locale === "en" ? "Slippage" : locale === "zn" ? "滑点" : "Trượt giá"} value={`${formatAmount(marketCheck.slippage_percent)}%`} />
                <MetricCard label={locale === "en" ? "Fee tier" : locale === "zn" ? "费率层级" : "Mức phí"} value={formatFeeTier(marketCheck.fee_tier)} />
                <MetricCard label={locale === "en" ? "Checked at" : locale === "zn" ? "检查时间" : "Thời điểm kiểm tra"} value={formatRelativeTimestamp(marketCheck.price_snapshot.fetched_at)} />
              </div>

              {marketCheck.price_snapshot.error ? (
                <div className="cad-panel-soft px-4 py-3 text-sm text-muted-foreground">
                  {locale === "en" ? "Market data warning" : locale === "zn" ? "市场数据警告" : "Cảnh báo dữ liệu thị trường"}: {marketCheck.price_snapshot.error}
                </div>
              ) : null}

              {marketCheck.stablecoin_quotes.length > 0 ? (
                <div className="space-y-3">
                  <p className="text-sm font-semibold text-foreground">{copy.stablePricing[locale]}</p>
                  {marketCheck.stablecoin_quotes.map((quote) => (
                    <div key={quote.token_address} className="cad-panel-soft p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-foreground">{quote.token_symbol}</p>
                          <p className="mt-1 text-xs text-muted-foreground">{shortAddress(quote.token_address)}</p>
                        </div>
                        <p className="text-xs text-muted-foreground">{formatAmount(quote.percent)}%</p>
                      </div>

                      <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
                        <MetricCard label={locale === "en" ? "WETH allocated" : locale === "zn" ? "已分配 WETH" : "WETH phân bổ"} value={`${formatAmount(quote.per_contract_weth_amount)} WETH`} />
                        <MetricCard label={locale === "en" ? "Stable spot" : locale === "zn" ? "稳定币现价" : "Giá stable hiện tại"} value={formatUsd(quote.token_usd)} />
                        <MetricCard label={locale === "en" ? "Est. output" : locale === "zn" ? "预计输出" : "Đầu ra ước tính"} value={quote.per_contract_output ? `${formatAmount(quote.per_contract_output)} ${quote.token_symbol}` : "--"} hint={formatUsd(quote.per_contract_output_usd)} />
                        <MetricCard label={locale === "en" ? "Minimum received" : locale === "zn" ? "最低接收量" : "Nhận tối thiểu"} value={quote.per_contract_min_output ? `${formatAmount(quote.per_contract_min_output)} ${quote.token_symbol}` : "--"} hint={formatUsd(quote.per_contract_min_output_usd)} />
                        <MetricCard label={locale === "en" ? "Route fee" : locale === "zn" ? "路由费用" : "Phí tuyến"} value={formatFeeTier(quote.quote.fee_tier)} />
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
