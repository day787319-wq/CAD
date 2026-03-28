"use client";

import type { TemplateChain } from "@/lib/template";

export type StatusChainKey =
  | "ETH"
  | "BNB"
  | "ARB"
  | "OP"
  | "BASE"
  | "AVAX"
  | "XLAYER"
  | "POLYGON"
  | "BTC"
  | "SOLANA"
  | "TRON";

export type RuntimeChainStatus = {
  chain: StatusChainKey | string;
  type: string;
  status: string;
  rpc_env_name?: string | null;
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
};

export type RuntimeStatusResponse = {
  status: RuntimeChainStatus[];
  checked_at: string;
};

export type RuntimeSingleStatusResponse = {
  status: RuntimeChainStatus;
  checked_at: string;
};

const TEMPLATE_CHAIN_STATUS_KEY: Record<TemplateChain, StatusChainKey> = {
  ethereum_mainnet: "ETH",
  bnb: "BNB",
  arbitrum: "ARB",
  avalanche: "AVAX",
  base: "BASE",
  optimism: "OP",
  polygon: "POLYGON",
  xlayer: "XLAYER",
};

export function getTemplateStatusChainKey(chain: TemplateChain): StatusChainKey {
  return TEMPLATE_CHAIN_STATUS_KEY[chain];
}

export function isRpcOnline(node: RuntimeChainStatus | null | undefined) {
  return node?.status === "online";
}

export function isStableEnoughToAutomate(node: RuntimeChainStatus | null | undefined) {
  if (!node || node.status !== "online") return false;

  if (node.type === "BTC") {
    return typeof node.lag === "number" && node.lag >= 99.99;
  }

  if (node.type === "SOLANA") {
    return `${node.health ?? ""}`.toLowerCase() === "ok";
  }

  return typeof node.lag === "number" && Math.abs(node.lag) <= 60;
}

function formatDurationFromSeconds(totalSeconds: number) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  if (seconds < 60) return `${seconds}s`;

  const minutes = Math.floor(seconds / 60);
  const remSeconds = seconds % 60;
  if (minutes < 60) return remSeconds > 0 ? `${minutes}m ${remSeconds}s` : `${minutes}m`;

  const hours = Math.floor(minutes / 60);
  const remMinutes = minutes % 60;
  if (hours < 24) return remMinutes > 0 ? `${hours}h ${remMinutes}m` : `${hours}h`;

  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  return remHours > 0 ? `${days}d ${remHours}h` : `${days}d`;
}

export function formatChainLag(node: RuntimeChainStatus | null | undefined) {
  if (!node) return "Unknown";
  if (node.status !== "online") return "Unavailable";
  if (node.type === "BTC") {
    return typeof node.lag === "number" ? `${node.lag.toFixed(2)}% synced` : "Unknown";
  }
  if (node.type === "SOLANA") {
    return node.health ? `Health: ${node.health}` : "Unknown";
  }
  if (typeof node.lag !== "number") return "Unknown";
  return `${node.lag.toLocaleString()}s behind (${formatDurationFromSeconds(node.lag)})`;
}

export function getChainLagTone(node: RuntimeChainStatus | null | undefined) {
  if (!node || node.status !== "online") return "text-rose-700";

  if (node.type === "BTC") {
    if (typeof node.lag !== "number") return "text-slate-700";
    if (node.lag >= 99.99) return "text-emerald-700";
    if (node.lag >= 95) return "text-amber-700";
    return "text-rose-700";
  }

  if (node.type === "SOLANA") {
    const health = `${node.health ?? ""}`.toLowerCase();
    if (health === "ok") return "text-emerald-700";
    if (health) return "text-amber-700";
    return "text-slate-700";
  }

  if (typeof node.lag !== "number") return "text-slate-700";
  if (Math.abs(node.lag) <= 60) return "text-emerald-700";
  if (Math.abs(node.lag) <= 300) return "text-amber-700";
  return "text-rose-700";
}

export function getAutomationStabilitySummary(node: RuntimeChainStatus | null | undefined) {
  if (!node) {
    return {
      label: "Unknown",
      tone: "text-slate-700",
      hint: "Chain status has not loaded yet.",
    };
  }

  if (node.status === "unconfigured") {
    return {
      label: "No",
      tone: "text-rose-700",
      hint: "RPC is not configured for this chain.",
    };
  }

  if (node.status !== "online") {
    return {
      label: "No",
      tone: "text-rose-700",
      hint: node.error ? `RPC offline: ${node.error}` : "RPC is offline.",
    };
  }

  if (isStableEnoughToAutomate(node)) {
    return {
      label: "Yes",
      tone: "text-emerald-700",
      hint:
        node.type === "SOLANA"
          ? "Health check looks good for automation."
          : node.type === "BTC"
            ? "Sync level looks healthy for automation."
            : "Lag is within the safe automation window.",
    };
  }

  if (node.type === "BTC") {
    return {
      label: "No",
      tone: "text-rose-700",
      hint: "BTC node is not synced enough yet.",
    };
  }

  if (node.type === "SOLANA") {
    return {
      label: "No",
      tone: "text-rose-700",
      hint: node.health ? `Health check returned ${node.health}.` : "Health check is unavailable.",
    };
  }

  return {
    label: "No",
    tone: "text-rose-700",
    hint:
      typeof node.lag === "number"
        ? `Chain is too far behind for safe automation (${formatDurationFromSeconds(node.lag)} lag).`
        : "Chain lag is unavailable.",
  };
}
