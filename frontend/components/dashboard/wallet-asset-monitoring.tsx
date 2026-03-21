"use client";

import { useEffect, useState } from "react";
import { Activity, AlertTriangle, Blocks, Coins, Loader2, RefreshCw, WalletCards } from "lucide-react";

import { Button } from "@/components/ui/button";
import { buildApiUrl } from "@/lib/api";
import { formatRelativeTimestamp } from "@/lib/template";

type AssetMonitorTrackedToken = {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
};

type AssetMonitorBalance = {
  symbol: string;
  name?: string | null;
  token_address?: string | null;
  decimals?: number | null;
  raw_balance?: string | null;
  balance?: string | null;
  error?: string | null;
};

type AssetMonitorTarget = {
  address: string;
  address_type: "wallet" | "contract";
  label: string;
  roles: string[];
  wallet_ids: string[];
  parent_wallet_ids: string[];
  source_run_ids: string[];
  token_symbols: string[];
  wallet_type?: string | null;
  index?: number | null;
};

type AssetMonitorSnapshot = AssetMonitorTarget & {
  updated_at?: string | null;
  chain?: string | null;
  chain_id?: number | null;
  block_number?: number | null;
  status?: string | null;
  error?: string | null;
  native_balance?: AssetMonitorBalance | null;
  tracked_tokens?: AssetMonitorBalance[];
};

type AssetMonitorChange = {
  asset_type: "native" | "token";
  symbol: string;
  token_address?: string | null;
  before_raw_balance?: string | null;
  after_raw_balance?: string | null;
  before_balance?: string | null;
  after_balance?: string | null;
};

type AssetMonitorEvent = AssetMonitorTarget & {
  id: string;
  observed_at?: string | null;
  event_type?: string | null;
  block_number?: number | null;
  changes?: AssetMonitorChange[];
};

type WalletAssetMonitoring = {
  status: string;
  error?: string | null;
  synced_at?: string | null;
  latest_block?: number | null;
  chain?: string | null;
  chain_id?: number | null;
  poll_interval_seconds?: number | null;
  target_count: number;
  tracked_token_count: number;
  tracked_tokens: AssetMonitorTrackedToken[];
  targets: AssetMonitorTarget[];
  snapshots: AssetMonitorSnapshot[];
  events: AssetMonitorEvent[];
  worker?: {
    status?: string | null;
    last_synced_at?: string | null;
    latest_block?: number | null;
    last_error?: string | null;
  } | null;
};

const DEFAULT_POLL_INTERVAL_SECONDS = 15;

function formatBalance(value: string | null | undefined, symbol: string) {
  if (!value) return `0 ${symbol}`;
  const numeric = Number.parseFloat(value);
  if (!Number.isFinite(numeric)) return `${value} ${symbol}`;
  return `${numeric.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: numeric < 1 ? 8 : 6,
  })} ${symbol}`;
}

function shortAddress(value: string | null | undefined) {
  if (!value) return "Unavailable";
  if (value.length <= 14) return value;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function prettyRole(role: string) {
  return role.replace(/_/g, " ");
}

function statusTone(status: string | null | undefined) {
  switch ((status || "").toLowerCase()) {
    case "online":
    case "ok":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "partial":
    case "degraded":
      return "border-amber-200 bg-amber-50 text-amber-800";
    case "offline":
    case "error":
    case "failed":
      return "border-rose-200 bg-rose-50 text-rose-700";
    default:
      return "border-slate-200 bg-slate-100 text-slate-600";
  }
}

function eventTypeLabel(eventType: string | null | undefined) {
  switch ((eventType || "").toLowerCase()) {
    case "first_observed":
      return "First observed";
    case "balance_change":
      return "Balance change";
    default:
      return "Activity";
  }
}

function eventChangeSummary(change: AssetMonitorChange) {
  const beforeValue = change.before_balance ?? "0";
  const afterValue = change.after_balance ?? "0";
  return `${change.symbol}: ${beforeValue} -> ${afterValue}`;
}

function SummaryCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl border border-border/70 bg-background/70 px-4 py-3">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-semibold text-foreground">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function WalletAssetMonitoring({ walletId, enabled = true }: { walletId: string; enabled?: boolean }) {
  const [monitoring, setMonitoring] = useState<WalletAssetMonitoring | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchMonitoring = async (background = false) => {
    if (!enabled) return;

    if (background) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const response = await fetch(buildApiUrl(`/api/monitoring/wallet/${walletId}?sync=true&limit=20`), {
        cache: "no-store",
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.detail ?? "Failed to load asset monitoring");
      }
      setMonitoring(payload);
      setError(null);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "Failed to load asset monitoring");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (!enabled) return;
    setLoading(true);
    void fetchMonitoring(false);
  }, [walletId, enabled]);

  useEffect(() => {
    if (!enabled) return;
    const intervalSeconds = monitoring?.poll_interval_seconds ?? DEFAULT_POLL_INTERVAL_SECONDS;
    const intervalId = window.setInterval(() => {
      void fetchMonitoring(true);
    }, intervalSeconds * 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [walletId, enabled, monitoring?.poll_interval_seconds]);

  if (!enabled) return null;

  const snapshots = monitoring?.snapshots ?? [];
  const events = monitoring?.events ?? [];
  const workerStatus = monitoring?.worker?.status ?? monitoring?.status ?? "idle";
  const trackedAssetList = monitoring?.tracked_tokens?.map((token) => token.symbol).join(", ") || "WETH, USDC, USDT, DAI";

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-2xl border border-border/70 bg-background/70 p-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-2xl">
          <div className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.16em] text-white">
            <Activity className="h-3.5 w-3.5" />
            Asset Monitoring
          </div>
          <p className="mt-4 text-base font-semibold text-foreground">Near-real-time address tracking for wallets and deployed contracts</p>
          <p className="mt-2 text-sm text-muted-foreground">
            The backend watches wallet, return, recipient, and ManagedTokenDistributor addresses block-by-block, stores balance snapshots, and records asset deltas in the database.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" onClick={() => void fetchMonitoring(true)} disabled={loading || refreshing}>
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
          <div className="flex items-center gap-3">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading asset monitoring...
          </div>
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-sm text-destructive">{error}</div>
      ) : monitoring ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryCard
              label="Monitor status"
              value={workerStatus}
              hint={monitoring.synced_at ? `Last sync ${formatRelativeTimestamp(monitoring.synced_at)}` : "Awaiting first sync"}
            />
            <SummaryCard
              label="Latest block"
              value={monitoring.latest_block ? monitoring.latest_block.toLocaleString() : "Unavailable"}
              hint={monitoring.chain_id ? `Chain ID ${monitoring.chain_id}` : "Ethereum mainnet"}
            />
            <SummaryCard label="Watched addresses" value={`${monitoring.target_count}`} hint="Main, sub, contract, return, and recipient scope" />
            <SummaryCard label="Tracked assets" value={`${monitoring.tracked_token_count + 1}`} hint={trackedAssetList} />
          </div>

          <div className={`rounded-2xl border px-4 py-4 text-sm ${statusTone(monitoring.status)}`}>
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p className="font-semibold">
                  {monitoring.status === "online"
                    ? "Monitoring is active."
                    : monitoring.status === "degraded"
                      ? "Monitoring is active with partial RPC coverage."
                      : "Monitoring is currently degraded or offline."}
                </p>
                <p className="mt-1">
                  {monitoring.error ??
                    monitoring.worker?.last_error ??
                    "Snapshots and balance-change events are persisted in the backend store as new blocks arrive."}
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-border/70 bg-background/70 p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-secondary/20 text-foreground">
                <WalletCards className="h-5 w-5" />
              </div>
              <div>
                <p className="text-base font-semibold text-foreground">Watched addresses</p>
                <p className="text-sm text-muted-foreground">Stored balance snapshots for every address in this wallet scope.</p>
              </div>
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              {snapshots.length > 0 ? (
                snapshots.map((snapshot) => {
                  const visibleTokens = (snapshot.tracked_tokens ?? []).filter((token) => token.balance && token.balance !== "0");
                  return (
                    <div key={snapshot.address} className="rounded-2xl border border-border/70 bg-card p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-foreground">{snapshot.label}</p>
                          <p className="mt-1 break-all font-mono text-xs text-muted-foreground">{snapshot.address}</p>
                        </div>
                        <div className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium capitalize ${statusTone(snapshot.status)}`}>
                          {snapshot.status ?? "pending"}
                        </div>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2">
                        {snapshot.roles.map((role) => (
                          <span key={`${snapshot.address}-${role}`} className="rounded-full border border-border/70 bg-secondary/20 px-2.5 py-1 text-[11px] text-muted-foreground">
                            {prettyRole(role)}
                          </span>
                        ))}
                        <span className="rounded-full border border-border/70 bg-secondary/20 px-2.5 py-1 text-[11px] text-muted-foreground">
                          {snapshot.address_type}
                        </span>
                      </div>

                      <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        <div className="rounded-xl border border-border/70 bg-background/70 px-3 py-3">
                          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Native</p>
                          <p className="mt-1 text-sm font-semibold text-foreground">
                            {formatBalance(snapshot.native_balance?.balance, snapshot.native_balance?.symbol ?? "ETH")}
                          </p>
                        </div>
                        <div className="rounded-xl border border-border/70 bg-background/70 px-3 py-3">
                          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Tracked tokens</p>
                          {visibleTokens.length > 0 ? (
                            <div className="mt-1 space-y-1 text-sm font-semibold text-foreground">
                              {visibleTokens.slice(0, 4).map((token) => (
                                <p key={`${snapshot.address}-${token.token_address ?? token.symbol}`}>{formatBalance(token.balance, token.symbol)}</p>
                              ))}
                            </div>
                          ) : (
                            <p className="mt-1 text-sm text-muted-foreground">No tracked token balance</p>
                          )}
                        </div>
                      </div>

                      <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                        <span>{snapshot.updated_at ? `Updated ${formatRelativeTimestamp(snapshot.updated_at)}` : "Awaiting first snapshot"}</span>
                        {snapshot.block_number ? <span>Block {snapshot.block_number.toLocaleString()}</span> : null}
                        {snapshot.error ? <span className="text-destructive">{snapshot.error}</span> : null}
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="rounded-2xl border border-dashed border-border bg-secondary/20 px-4 py-6 text-sm text-muted-foreground">
                  No watched addresses have been discovered for this wallet yet.
                </div>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-border/70 bg-background/70 p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-secondary/20 text-foreground">
                <Coins className="h-5 w-5" />
              </div>
              <div>
                <p className="text-base font-semibold text-foreground">Recent balance changes</p>
                <p className="text-sm text-muted-foreground">Every recorded asset delta for this wallet scope, newest first.</p>
              </div>
            </div>

            <div className="mt-5 space-y-3">
              {events.length > 0 ? (
                events.map((event) => (
                  <div key={event.id} className="rounded-2xl border border-border/70 bg-card px-4 py-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground">{event.label}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {eventTypeLabel(event.event_type)} · {shortAddress(event.address)}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        {event.block_number ? (
                          <span className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-secondary/20 px-2.5 py-1">
                            <Blocks className="h-3.5 w-3.5" />
                            Block {event.block_number.toLocaleString()}
                          </span>
                        ) : null}
                        <span>{event.observed_at ? formatRelativeTimestamp(event.observed_at) : "Unknown time"}</span>
                      </div>
                    </div>

                    <div className="mt-3 space-y-1">
                      {(event.changes ?? []).map((change, index) => (
                        <p key={`${event.id}-${change.symbol}-${index}`} className="text-sm text-foreground">
                          {eventChangeSummary(change)}
                        </p>
                      ))}
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-dashed border-border bg-secondary/20 px-4 py-6 text-sm text-muted-foreground">
                  No balance changes have been recorded for this wallet scope yet.
                </div>
              )}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
