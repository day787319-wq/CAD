"use client";

import { useEffect, useRef, useState } from "react";
import { Activity, ChevronDown, ChevronUp, RefreshCw, WifiOff } from "lucide-react";
import { ChainIcon } from "@/components/dashboard/chain-icon";
import { buildApiUrl } from "@/lib/api";
import { cn } from "@/lib/utils";

const POLL_INTERVAL_MS = 10_000;
const EMPTY_VALUE = "--";

const CHAIN_META: Record<string, { label: string; token: string; consensus: string; color: string }> = {
  ETH: { label: "Ethereum", token: "ETH", consensus: "PoS", color: "bg-blue-500/10 text-blue-400 border-blue-500/20" },
  BNB: { label: "BNB Chain", token: "BNB", consensus: "PoSA", color: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20" },
  ARB: { label: "Arbitrum", token: "ARB", consensus: "PoS", color: "bg-sky-500/10 text-sky-400 border-sky-500/20" },
  OP: { label: "Optimism", token: "OP", consensus: "PoS", color: "bg-red-500/10 text-red-400 border-red-500/20" },
  BASE: { label: "Base", token: "ETH", consensus: "PoS", color: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20" },
  AVAX: { label: "Avalanche", token: "AVAX", consensus: "PoS", color: "bg-red-600/10 text-red-500 border-red-600/20" },
  XLAYER: { label: "X Layer", token: "OKB", consensus: "PoA", color: "bg-slate-500/10 text-slate-400 border-slate-500/20" },
  POLYGON: { label: "Polygon", token: "POL", consensus: "PoA", color: "bg-purple-500/10 text-purple-400 border-purple-500/20" },
  BTC: { label: "Bitcoin", token: "BTC", consensus: "PoW", color: "bg-orange-500/10 text-orange-400 border-orange-500/20" },
  SOLANA: { label: "Solana", token: "SOL", consensus: "PoH", color: "bg-green-500/10 text-green-400 border-green-500/20" },
  TRON: { label: "Tron", token: "TRX", consensus: "DPoS", color: "bg-rose-500/10 text-rose-400 border-rose-500/20" },
};

interface ChainStatus {
  chain: string;
  type: string;
  status: string;
  error?: string;
  block?: number | null;
  block_hash?: string | null;
  timestamp?: string | null;
  lag?: number | null;
  tx_count?: number | null;
  gas_used_pct?: number | null;
  gas_price_gwei?: number | null;
  base_fee_gwei?: number | null;
  chain_id?: number | null;
  peer_count?: number | null;
  difficulty?: number | null;
  headers?: number | null;
  chain_name?: string | null;
  mempool_tx?: number | null;
  mempool_mb?: number | null;
  version?: string | null;
  pruned?: boolean | null;
  epoch?: number | null;
  slot_index?: number | null;
  slots_in_epoch?: number | null;
  block_height?: number | null;
  transaction_count?: number | null;
  tps?: number | null;
  solana_core?: string | null;
  health?: string | null;
  witness?: string | null;
}

interface StatusResponse {
  status: ChainStatus[];
  checked_at: string;
}

function formatNumber(value: number | null | undefined, suffix = "") {
  if (value === null || value === undefined) return EMPTY_VALUE;
  return `${value.toLocaleString()}${suffix}`;
}

function formatBoolean(value: boolean | null | undefined) {
  if (value === null || value === undefined) return EMPTY_VALUE;
  return value ? "Yes" : "No";
}

function getLagTone(lag: number | null, type: string) {
  if (lag === null) return "text-muted-foreground";
  if (type === "BTC") {
    if (lag >= 99.99) return "text-green-400";
    if (lag >= 95) return "text-yellow-400";
    return "text-red-400";
  }

  const lagSeconds = Math.abs(lag);
  if (lagSeconds <= 5) return "text-green-400";
  if (lagSeconds <= 30) return "text-yellow-400";
  return "text-red-400";
}

function formatLag(lag: number | null, type: string) {
  if (lag === null) return EMPTY_VALUE;
  if (type === "BTC") return `${lag.toFixed(2)}% synced`;
  return `${lag}s`;
}

function Detail({ label, value, mono }: { label: string; value?: string | number | null; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-muted-foreground/70 uppercase tracking-wide" style={{ fontSize: "10px" }}>
        {label}
      </span>
      <span className={cn("truncate text-foreground", mono && "font-mono")}>{value ?? EMPTY_VALUE}</span>
    </div>
  );
}

function Row({ node }: { node: ChainStatus }) {
  const [open, setOpen] = useState(false);
  const meta = CHAIN_META[node.chain] ?? {
    label: node.chain,
    token: node.chain,
    consensus: EMPTY_VALUE,
    color: "bg-secondary text-foreground border-border",
  };
  const online = node.status === "online";

  return (
    <>
      <tr
        className={cn(
          "cursor-pointer border-b border-border transition-colors hover:bg-secondary/40",
          open && "bg-secondary/30",
        )}
        onClick={() => setOpen((current) => !current)}
      >
        <td className="px-4 py-3">
          <div className="flex items-center gap-2.5">
            <ChainIcon chain={node.chain} size={28} />
            <div>
              <p className="text-sm font-semibold leading-none text-foreground">{meta.label}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {node.type} | {meta.consensus}
              </p>
            </div>
          </div>
        </td>
        <td className="px-4 py-3">
          <span className={cn("inline-flex rounded border px-2 py-0.5 text-xs font-mono font-bold", meta.color)}>
            {meta.token}
          </span>
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-1.5">
            <span className={cn("h-2 w-2 rounded-full", online ? "bg-green-400 animate-pulse" : "bg-red-400")} />
            <span className={cn("text-xs font-medium", online ? "text-green-400" : "text-red-400")}>
              {online ? "Online" : "Offline"}
            </span>
          </div>
        </td>
        <td className="px-4 py-3 font-mono text-xs text-foreground">
          {node.block !== null && node.block !== undefined ? node.block.toLocaleString() : EMPTY_VALUE}
        </td>
        <td className={cn("px-4 py-3 font-mono text-xs font-semibold", getLagTone(node.lag ?? null, node.type))}>
          {formatLag(node.lag ?? null, node.type)}
        </td>
        <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">{node.timestamp ?? EMPTY_VALUE}</td>
        <td className="px-4 py-3 text-center text-xs text-foreground">{formatNumber(node.peer_count)}</td>
        <td className="px-4 py-3 text-muted-foreground">
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </td>
      </tr>

      {open && (
        <tr className="border-b border-border bg-secondary/20">
          <td colSpan={8} className="px-6 py-4">
            <div className="grid grid-cols-2 gap-x-10 gap-y-2 text-xs sm:grid-cols-3 lg:grid-cols-5">
              <Detail label="Block Hash" value={node.block_hash} mono />

              {node.type === "EVM" && (
                <>
                  <Detail label="Chain ID" value={formatNumber(node.chain_id)} mono />
                  <Detail label="Tx in Block" value={formatNumber(node.tx_count)} />
                  <Detail
                    label="Gas Used"
                    value={node.gas_used_pct !== null && node.gas_used_pct !== undefined ? `${node.gas_used_pct}%` : EMPTY_VALUE}
                  />
                  <Detail
                    label="Gas Price"
                    value={node.gas_price_gwei !== null && node.gas_price_gwei !== undefined ? `${node.gas_price_gwei} Gwei` : EMPTY_VALUE}
                  />
                  <Detail
                    label="Base Fee"
                    value={node.base_fee_gwei !== null && node.base_fee_gwei !== undefined ? `${node.base_fee_gwei} Gwei` : EMPTY_VALUE}
                  />
                </>
              )}

              {node.type === "BTC" && (
                <>
                  <Detail label="Network" value={node.chain_name} />
                  <Detail label="Headers" value={formatNumber(node.headers)} mono />
                  <Detail
                    label="Difficulty"
                    value={node.difficulty !== null && node.difficulty !== undefined ? node.difficulty.toExponential(3) : EMPTY_VALUE}
                    mono
                  />
                  <Detail label="Mempool Txs" value={formatNumber(node.mempool_tx)} />
                  <Detail
                    label="Mempool Size"
                    value={node.mempool_mb !== null && node.mempool_mb !== undefined ? `${node.mempool_mb} MB` : EMPTY_VALUE}
                  />
                  <Detail label="Pruned" value={formatBoolean(node.pruned)} />
                  <Detail label="Client" value={node.version} mono />
                </>
              )}

              {node.type === "SOLANA" && (
                <>
                  <Detail label="Block Height" value={formatNumber(node.block_height)} mono />
                  <Detail label="Epoch" value={formatNumber(node.epoch)} />
                  <Detail label="Slot Index" value={formatNumber(node.slot_index)} mono />
                  <Detail label="Slots in Epoch" value={formatNumber(node.slots_in_epoch)} />
                  <Detail label="Total Txs" value={formatNumber(node.transaction_count)} />
                  <Detail label="TPS" value={node.tps !== null && node.tps !== undefined ? `${node.tps}/s` : EMPTY_VALUE} />
                  <Detail label="Core Version" value={node.solana_core} mono />
                  <Detail label="Health" value={node.health} />
                </>
              )}

              {node.type === "TRON" && (
                <>
                  <Detail label="Tx in Block" value={formatNumber(node.tx_count)} />
                  <Detail label="Witness" value={node.witness} mono />
                </>
              )}

              {node.error && (
                <div className="col-span-full mt-1">
                  <span className="text-red-400/80">{node.error}</span>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export function PipelineSection() {
  const [data, setData] = useState<StatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [spinning, setSpinning] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const spinResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchStatus = async () => {
    setSpinning(true);

    try {
      const response = await fetch(buildApiUrl("/status"), { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const payload = (await response.json()) as StatusResponse;
      setData(payload);
      setLastUpdated(new Date());
      setError(null);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "Failed to fetch status");
    } finally {
      setLoading(false);
      if (spinResetRef.current) {
        clearTimeout(spinResetRef.current);
      }
      spinResetRef.current = setTimeout(() => setSpinning(false), 600);
    }
  };

  useEffect(() => {
    void fetchStatus();
    timerRef.current = setInterval(() => {
      void fetchStatus();
    }, POLL_INTERVAL_MS);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      if (spinResetRef.current) {
        clearTimeout(spinResetRef.current);
      }
    };
  }, []);

  const online = data?.status.filter((node) => node.status === "online").length ?? 0;
  const total = data?.status.length ?? 0;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Activity className="h-5 w-5 text-accent" />
          <div>
            <p className="text-sm text-muted-foreground">
              {loading ? "Connecting to nodes..." : error ? `Connection error: ${error}` : `${online} / ${total} nodes online`}
            </p>
            {lastUpdated && (
              <p className="text-xs text-muted-foreground/50">
                Last updated {lastUpdated.toLocaleTimeString()} | auto-refresh {POLL_INTERVAL_MS / 1000}s
              </p>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            void fetchStatus();
          }}
          className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <RefreshCw className={cn("h-3.5 w-3.5 transition-transform", spinning && "animate-spin")} />
          Refresh
        </button>
      </div>

      {data && (
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="flex items-center gap-1.5 rounded-full border border-green-500/20 bg-green-500/10 px-3 py-1 font-medium text-green-400">
            <span className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />
            {online} Online
          </span>
          <span className="flex items-center gap-1.5 rounded-full border border-red-500/20 bg-red-500/10 px-3 py-1 font-medium text-red-400">
            <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
            {total - online} Offline
          </span>
          {data.status
            .filter((node) => node.type === "EVM" && node.status === "online")
            .map((node) => (
              <span
                key={node.chain}
                className={cn(
                  "flex items-center gap-1 rounded-full border px-2.5 py-1 font-mono font-semibold",
                  CHAIN_META[node.chain]?.color ?? "",
                )}
              >
                <ChainIcon chain={node.chain} size={14} /> {node.block?.toLocaleString() ?? EMPTY_VALUE}
              </span>
            ))}
        </div>
      )}

      {loading && (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, index) => (
            <div key={index} className="h-14 animate-pulse rounded-lg border border-border bg-card" />
          ))}
        </div>
      )}

      {!loading && data && (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-border bg-secondary/40">
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Chain</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Token</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Status</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Block</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Lag</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Last Block</th>
                <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">Peers</th>
                <th className="w-8 px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {data.status.map((node) => (
                <Row key={node.chain} node={node} />
              ))}
            </tbody>
          </table>

          <div className="border-t border-border px-4 py-2.5 text-xs text-muted-foreground/50">
            Click any row to expand full details | Checked at {data.checked_at}
          </div>
        </div>
      )}

      {!loading && error && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-red-500/20 bg-red-500/5 py-16 text-center">
          <WifiOff className="mb-3 h-10 w-10 text-red-400/60" />
          <p className="text-sm font-medium text-red-400">Cannot reach backend</p>
          <p className="mt-1 text-xs text-muted-foreground">{error}</p>
          <button
            type="button"
            onClick={() => {
              void fetchStatus();
            }}
            className="mt-4 rounded-lg bg-red-500/10 px-4 py-2 text-xs font-medium text-red-400 hover:bg-red-500/20"
          >
            Retry
          </button>
        </div>
      )}
    </div>
  );
}
