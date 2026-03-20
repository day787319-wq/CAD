"use client";

import { MouseEvent, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
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
      if (!response.ok) throw new Error(payload.detail ?? "Failed to load live market check");
      setMarketCheck(payload);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load live market check");
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
          <p className="text-sm font-semibold text-foreground">Optional live market check</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Uses live CoinGecko pricing and route quotes. This is slower than the wallet support preview above.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {open ? (
            <Button type="button" variant="outline" size="sm" onClick={handleRefresh} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Refresh prices
            </Button>
          ) : null}
          <Button type="button" variant={open ? "outline" : "default"} size="sm" onClick={handleToggle}>
            {open ? "Hide live check" : "View live check"}
          </Button>
        </div>
      </div>

      {open ? (
        <div className="mt-4 space-y-4">
          {loading && !marketCheck ? (
            <div className="flex items-center gap-2 rounded-xl border border-border/70 bg-background/70 px-4 py-3 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading current market pricing...
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
                <MetricCard label="Per-contract ETH" value={`${formatAmount(marketCheck.per_contract.required_eth)} ETH`} hint={formatUsd(marketCheck.totals.required_eth_total_usd)} />
                <MetricCard label="Per-contract WETH" value={`${formatAmount(marketCheck.per_contract.required_weth)} WETH`} hint={formatUsd(marketCheck.totals.required_weth_total_usd)} />
                <MetricCard label="Live total cost" value={formatUsd(marketCheck.totals.combined_cost_usd)} hint="Current ETH + WETH cost for one contract" />
                <MetricCard label="Stable output USD" value={formatUsd(marketCheck.totals.stablecoin_output_total_usd)} hint="Estimated current value of routed stable outputs" />
                <MetricCard label="Slippage" value={`${formatAmount(marketCheck.slippage_percent)}%`} />
                <MetricCard label="Fee tier" value={formatFeeTier(marketCheck.fee_tier)} />
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                <MetricCard label="ETH spot" value={formatUsd(marketCheck.price_snapshot.eth_usd)} />
                <MetricCard label="WETH spot" value={formatUsd(marketCheck.price_snapshot.weth_usd)} />
                <MetricCard label="Checked at" value={formatRelativeTimestamp(marketCheck.price_snapshot.fetched_at)} />
              </div>

              {marketCheck.price_snapshot.error ? (
                <div className="rounded-xl border border-border/70 bg-background/70 px-4 py-3 text-sm text-muted-foreground">
                  Market data warning: {marketCheck.price_snapshot.error}
                </div>
              ) : null}

              {marketCheck.stablecoin_quotes.length > 0 ? (
                <div className="space-y-3">
                  <p className="text-sm font-semibold text-foreground">Stablecoin route pricing</p>
                  {marketCheck.stablecoin_quotes.map((quote) => (
                    <div key={quote.token_address} className="rounded-xl border border-border/70 bg-background/70 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-foreground">{quote.token_symbol}</p>
                          <p className="mt-1 text-xs text-muted-foreground">{shortAddress(quote.token_address)}</p>
                        </div>
                        <p className="text-xs text-muted-foreground">{formatAmount(quote.percent)}%</p>
                      </div>

                      <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
                        <MetricCard label="WETH allocated" value={`${formatAmount(quote.per_contract_weth_amount)} WETH`} />
                        <MetricCard label="Stable spot" value={formatUsd(quote.token_usd)} />
                        <MetricCard label="Est. output" value={quote.per_contract_output ? `${formatAmount(quote.per_contract_output)} ${quote.token_symbol}` : "--"} hint={formatUsd(quote.per_contract_output_usd)} />
                        <MetricCard label="Minimum received" value={quote.per_contract_min_output ? `${formatAmount(quote.per_contract_min_output)} ${quote.token_symbol}` : "--"} hint={formatUsd(quote.per_contract_min_output_usd)} />
                        <MetricCard label="Route fee" value={formatFeeTier(quote.quote.fee_tier)} />
                        <MetricCard label="Swap value" value={formatUsd(quote.per_contract_weth_usd)} hint={`${formatAmount(quote.quote.slippage_percent ?? marketCheck.slippage_percent)}% slippage`} />
                      </div>

                      {!quote.quote.available && quote.quote.error ? (
                        <p className="mt-3 text-xs text-muted-foreground">{quote.quote.error}</p>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">
                  This template does not include a stablecoin swap route, so only ETH and WETH funding costs are shown.
                </div>
              )}
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
