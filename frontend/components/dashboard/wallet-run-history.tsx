"use client";

import { MouseEvent, useEffect, useRef, useState } from "react";
import { AlertTriangle, ArrowRightLeft, Boxes, CheckCircle2, CircleDashed, CircleSlash, Copy, Download, Loader2, Rocket, ScrollText, WalletCards } from "lucide-react";
import { useRouter } from "next/navigation";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { API_URL } from "@/lib/api";
import { formatRelativeTimestamp } from "@/lib/template";

type FundingTransaction = {
  tx_hash?: string;
  status?: string;
  amount?: string | null;
};

type ApprovalTransaction = {
  token_symbol?: string;
  token_address?: string;
  spender_address?: string;
  amount?: string | null;
  tx_hash?: string | null;
  status?: string;
  attempts?: number | null;
  confirmation_source?: string | null;
  error?: string | null;
};

type SwapTransaction = {
  token_symbol?: string;
  token_address?: string;
  amount_in?: string | null;
  amount_out?: string | null;
  min_amount_out?: string | null;
  fee_tier?: number | null;
  tx_hash?: string | null;
  status?: string;
  source?: string;
  attempts?: number | null;
  confirmation_source?: string | null;
  error?: string | null;
};

type RunLog = {
  timestamp?: string | null;
  stage?: string;
  event?: string;
  status?: string;
  message?: string;
  tx_hash?: string;
  wallet_id?: string;
  wallet_address?: string;
  movement?: {
    action?: string;
    asset?: string;
    amount?: string | null;
    from_address?: string;
    to_address?: string;
  };
  details?: Record<string, string | number | boolean | null>;
};

type DeployedContract = {
  contract_name?: string;
  wallet_id?: string;
  wallet_address?: string;
  contract_address?: string | null;
  tx_hash?: string | null;
  funding_tx_hash?: string | null;
  funding_status?: string | null;
  status?: string;
  token_symbol?: string;
  token_address?: string;
  amount?: string | null;
  recipient_address?: string | null;
  owner_address?: string | null;
  compiler_version?: string | null;
  deployment_attempts?: number | null;
  error?: string | null;
};

type RunSubWallet = {
  wallet_id: string;
  address: string;
  index?: number | null;
  status?: string;
  expected_funding?: {
    eth?: string | null;
    weth?: string | null;
  };
  expected_local_wrap_weth?: string | null;
  funding_transactions?: {
    eth?: FundingTransaction;
    weth?: FundingTransaction;
  };
  wrap_transaction?: {
    tx_hash?: string;
    status?: string;
    eth_wrapped?: string | null;
  } | null;
  approval_transactions?: ApprovalTransaction[];
  swap_transactions?: SwapTransaction[];
  private_key_access?: {
    wallet_id?: string;
    export_supported?: boolean;
    reveal_supported?: boolean;
  };
  deployed_contract?: DeployedContract | null;
  deployed_contracts?: DeployedContract[];
};

type WalletRun = {
  id: string;
  main_wallet_id: string;
  main_wallet_address: string;
  main_wallet_type?: string;
  template_id: string;
  template_name: string;
  contract_count: number;
  status: string;
  created_at?: string | null;
  error?: string | null;
  preview?: {
    funding?: {
      total_eth_deducted?: string | null;
      weth_sent_to_subwallets?: string | null;
    };
    execution?: {
      total_network_fee_eth?: string | null;
      contract_sync_network_fee_eth?: string | null;
    };
  };
  funding_fee_estimate?: {
    fee_eth?: string | null;
    funding_fee_eth?: string | null;
    contract_sync_fee_eth?: string | null;
    gas_units?: number | null;
    funding_transaction_count?: number | null;
    contract_sync_transaction_count?: number | null;
    total_transaction_count?: number | null;
  };
  wrap_transaction?: {
    tx_hash?: string;
    status?: string;
    eth_wrapped?: string | null;
  } | null;
  contract_execution?: {
    status?: string;
    message?: string;
    error?: string | null;
    expected_action_count?: number | null;
    submitted_transaction_count?: number | null;
    managed_token_distributor?: {
      status?: string;
      message?: string;
      recipient_address?: string | null;
      amount?: string | null;
    };
    records?: Array<{
      contract_name?: string;
      artifact_path?: string | null;
      wallet_id?: string;
      wallet_address?: string;
      main_wallet_address?: string;
      sub_wallet_count?: number | null;
      token_count?: number | null;
      message?: string;
      status?: string;
    }>;
  };
  deployed_contracts?: DeployedContract[];
  run_logs?: RunLog[];
  sub_wallets?: RunSubWallet[];
};

type AutomationStageStatus = "completed" | "running" | "failed" | "skipped" | "pending";
const WETH_TOKEN_ADDRESS = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";

function shortValue(value: string | null | undefined, head = 6, tail = 4) {
  if (!value) return "Unavailable";
  if (value.length <= head + tail + 3) return value;
  return `${value.slice(0, head)}...${value.slice(-tail)}`;
}

function formatAmount(value: string | null | undefined, symbol: string) {
  if (!value || value === "0") return `0 ${symbol}`;
  return `${value} ${symbol}`;
}

function formatTimestamp(value: string | null | undefined) {
  if (!value) return "Unknown";
  return formatRelativeTimestamp(value);
}

function getDisplayTokenSymbol(tokenSymbol: string | null | undefined, tokenAddress: string | null | undefined) {
  if ((tokenAddress ?? "").toLowerCase() === WETH_TOKEN_ADDRESS.toLowerCase()) return "WETH";
  return tokenSymbol ?? "TOKEN";
}

function statusTone(status: string | null | undefined) {
  switch ((status || "").toLowerCase()) {
    case "queued":
    case "running":
    case "started":
    case "ready":
    case "submitted":
    case "funded":
    case "deploying":
    case "swapping":
    case "wrapping":
      return "border-blue-500/30 bg-blue-500/10 text-blue-700";
    case "confirmed":
    case "completed":
    case "deployed":
    case "approved":
    case "wrapped":
    case "swapped":
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700";
    case "partial":
      return "border-amber-500/30 bg-amber-500/10 text-amber-800";
    case "skipped":
      return "border-border/70 bg-secondary/20 text-muted-foreground";
    case "failed":
      return "border-destructive/40 bg-destructive/5 text-destructive";
    case "created":
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700";
    default:
      return "border-border/70 bg-secondary/20 text-foreground";
  }
}

function formatLogDetails(details: RunLog["details"]) {
  if (!details) return null;
  const parts = Object.entries(details)
    .filter(([, value]) => value !== null && value !== undefined && value !== "")
    .map(([key, value]) => `${key.replace(/_/g, " ")}: ${typeof value === "boolean" ? (value ? "yes" : "no") : value}`);
  return parts.length ? parts.join(" • ") : null;
}

function isCompletedStatus(status: string | null | undefined) {
  return ["completed", "confirmed", "deployed", "created"].includes((status ?? "").toLowerCase());
}

function isRunningStatus(status: string | null | undefined) {
  return ["queued", "running", "started", "submitted", "ready", "created"].includes((status ?? "").toLowerCase());
}

function isFailedStatus(status: string | null | undefined) {
  return ["failed", "deployment_failed"].includes((status ?? "").toLowerCase());
}

function deriveStageStatus(entries: RunLog[] | undefined, fallback: AutomationStageStatus = "pending"): AutomationStageStatus {
  if (!entries?.length) return fallback;
  if (entries.some((entry) => isFailedStatus(entry.status))) return "failed";
  if (entries.every((entry) => (entry.status ?? "").toLowerCase() === "skipped")) return "skipped";
  if (entries.some((entry) => isCompletedStatus(entry.status))) return "completed";
  if (entries.some((entry) => isRunningStatus(entry.status))) return "running";
  return fallback;
}

function getRunStageSummaries(run: WalletRun) {
  const walletCreationLogs = run.run_logs?.filter((log) => log.stage === "wallet_creation");
  const fundingLogs = run.run_logs?.filter((log) => log.stage === "funding");
  const wrappingLogs = run.run_logs?.filter((log) => log.stage === "wrapping");
  const routeLogs = run.run_logs?.filter((log) => ["approval", "swap"].includes(log.stage ?? ""));
  const deploymentLogs = run.run_logs?.filter((log) => ["deployment", "distribution"].includes(log.stage ?? ""));
  const fundedWalletCount = countFundedWallets(run);
  const wrappedWalletCount = countWrappedTransactions(run);
  const swapCount = countSwapTransactions(run);
  const deployedContractCount = countDeployedContracts(run);

  return [
    {
      key: "wallet_creation",
      label: "Create wallets",
      status: deriveStageStatus(walletCreationLogs, run.sub_wallets?.length ? "completed" : "pending"),
      note: `${run.sub_wallets?.length ?? 0} sub-wallet${run.sub_wallets?.length === 1 ? "" : "s"} created`,
    },
    {
      key: "funding",
      label: "Fund batch",
      status: deriveStageStatus(
        fundingLogs,
        run.sub_wallets?.some((wallet) => wallet.funding_transactions?.eth?.tx_hash || wallet.funding_transactions?.weth?.tx_hash) ? "completed" : "pending",
      ),
      note: `${fundedWalletCount} wallet${fundedWalletCount === 1 ? "" : "s"} received funding`,
    },
    {
      key: "wrapping",
      label: "Local wrap",
      status: deriveStageStatus(
        wrappingLogs,
        wrappedWalletCount > 0 ? "completed" : "skipped",
      ),
      note: wrappedWalletCount > 0
        ? `${wrappedWalletCount} wallet${wrappedWalletCount === 1 ? "" : "s"} wrapped ETH into WETH locally`
        : "No local WETH wrapping was required because this template had no WETH budget.",
    },
    {
      key: "swap",
      label: "Approve and swap",
      status: deriveStageStatus(
        routeLogs,
        swapCount > 0 ? "completed" : "skipped",
      ),
      note: swapCount > 0
        ? `${swapCount} swap transaction${swapCount === 1 ? "" : "s"} executed`
        : routeLogs?.some((log) => isFailedStatus(log.status))
          ? "One or more approvals or swaps failed"
          : routeLogs?.some((log) => isRunningStatus(log.status))
            ? "Approve and swap are still running"
          : "No positive stablecoin swap routes were configured for this template",
    },
    {
      key: "deployment",
      label: "Deploy distributors",
      status: deriveStageStatus(
        deploymentLogs,
        deployedContractCount > 0 ? "completed" : "skipped",
      ),
      note:
        deployedContractCount > 0
          ? `${deployedContractCount} ManagedTokenDistributor contract${deployedContractCount === 1 ? "" : "s"} deployed`
          : deploymentLogs?.some((log) => isFailedStatus(log.status))
            ? "One or more distributor deployments or token transfers failed"
            : deploymentLogs?.some((log) => isRunningStatus(log.status))
              ? "ManagedTokenDistributor deployment is still running"
          : run.contract_execution?.managed_token_distributor?.message ?? "Deployment was not configured for this template",
    },
  ];
}

function getAutomationHeadline(run: WalletRun) {
  switch ((run.status ?? "").toLowerCase()) {
    case "queued":
      return {
        label: "Automation Queued",
        tone: "border-sky-200 bg-sky-50 text-sky-700",
        bar: "bg-sky-400",
      };
    case "running":
    case "submitted":
    case "created":
      return {
        label: "Automation Running",
        tone: "border-sky-200 bg-sky-50 text-sky-700",
        bar: "bg-sky-500",
      };
    case "completed":
      return {
        label: "Automation Complete",
        tone: "border-emerald-200 bg-emerald-50 text-emerald-700",
        bar: "bg-emerald-500",
      };
    case "partial":
      return {
        label: "Automation Partial",
        tone: "border-amber-200 bg-amber-50 text-amber-800",
        bar: "bg-amber-500",
      };
    case "failed":
      return {
        label: "Automation Failed",
        tone: "border-rose-200 bg-rose-50 text-rose-700",
        bar: "bg-rose-500",
      };
    default:
      return {
        label: "Automation Submitted",
        tone: "border-sky-200 bg-sky-50 text-sky-700",
        bar: "bg-sky-500",
      };
  }
}

function isTerminalRunStatus(status: string | null | undefined) {
  return ["completed", "partial", "failed"].includes((status ?? "").toLowerCase());
}

function getProgressPercent(run: WalletRun, stageSummaries: ReturnType<typeof getRunStageSummaries>) {
  if (["completed", "partial", "failed"].includes((run.status ?? "").toLowerCase())) return 100;

  const weight = stageSummaries.reduce((total, stage) => {
    if (stage.status === "completed" || stage.status === "skipped") return total + 1;
    if (stage.status === "running") return total + 0.5;
    return total;
  }, 0);

  return Math.max(15, Math.round((weight / Math.max(stageSummaries.length, 1)) * 100));
}

function stageBadgeClass(status: AutomationStageStatus) {
  switch (status) {
    case "completed":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "running":
      return "border-sky-200 bg-sky-50 text-sky-700";
    case "failed":
      return "border-rose-200 bg-rose-50 text-rose-700";
    case "skipped":
      return "border-slate-200 bg-slate-100 text-slate-600";
    default:
      return "border-border/70 bg-secondary/20 text-muted-foreground";
  }
}

function countFundedWallets(run: WalletRun) {
  return run.sub_wallets?.filter((wallet) => wallet.funding_transactions?.eth?.tx_hash || wallet.funding_transactions?.weth?.tx_hash).length ?? 0;
}

function countWrappedTransactions(run: WalletRun) {
  const subWalletWraps = run.sub_wallets?.filter((wallet) => wallet.wrap_transaction?.tx_hash).length ?? 0;
  return subWalletWraps || (run.wrap_transaction?.tx_hash ? 1 : 0);
}

function countSwapTransactions(run: WalletRun) {
  return run.sub_wallets?.reduce((total, wallet) => total + (wallet.swap_transactions?.filter((swap) => swap.tx_hash).length ?? 0), 0) ?? 0;
}

function countDeployedContracts(run: WalletRun) {
  return run.deployed_contracts?.filter((contract) => Boolean(contract.contract_address) || (contract.status ?? "").toLowerCase() === "completed").length ?? 0;
}

function subWalletHasDeployedContract(subWallet: RunSubWallet) {
  return Boolean(
    subWallet.deployed_contracts?.some((contract) => contract.contract_address || isCompletedStatus(contract.status))
      || subWallet.deployed_contract?.contract_address
      || isCompletedStatus(subWallet.deployed_contract?.status),
  );
}

function hasRunningStage(run: WalletRun, stages: string[]) {
  return run.run_logs?.some((log) => stages.includes(log.stage ?? "") && isRunningStatus(log.status)) ?? false;
}

function shouldShowDeployingContract(subWallet: RunSubWallet, run: WalletRun) {
  if (!hasRunningStage(run, ["deployment", "distribution"])) return false;
  if (subWalletHasDeployedContract(subWallet)) return false;
  if (subWallet.deployed_contracts?.some((contract) => isFailedStatus(contract.status))) return false;
  return Boolean(
    subWallet.swap_transactions?.some((swap) => swap.tx_hash && !isFailedStatus(swap.status))
      || subWallet.wrap_transaction?.tx_hash
      || subWallet.funding_transactions?.eth?.tx_hash
      || subWallet.funding_transactions?.weth?.tx_hash,
  );
}

function getSubWalletDisplayStatus(subWallet: RunSubWallet, run: WalletRun) {
  if (shouldShowDeployingContract(subWallet, run)) return "deploying";
  const baseStatus = summarizeSubWalletStatus(subWallet);
  if (hasRunningStage(run, ["approval", "swap"]) && (baseStatus ?? "").toLowerCase() === "wrapped") return "swapping";
  if (hasRunningStage(run, ["wrapping"]) && (baseStatus ?? "").toLowerCase() === "funded") return "wrapping";
  return baseStatus;
}

function summarizeSubWalletStatus(subWallet: RunSubWallet) {
  if (isFailedStatus(subWallet.status)) return "failed";
  if ((subWallet.status ?? "").toLowerCase() === "partial") return "partial";
  if (subWallet.deployed_contracts?.some((contract) => contract.contract_address || isCompletedStatus(contract.status)) || subWallet.deployed_contract?.contract_address || isCompletedStatus(subWallet.deployed_contract?.status)) return "deployed";
  if (subWallet.swap_transactions?.some((swap) => swap.tx_hash && !isFailedStatus(swap.status))) return "swapped";
  if (subWallet.wrap_transaction?.tx_hash) return "wrapped";
  if (subWallet.funding_transactions?.eth?.tx_hash || subWallet.funding_transactions?.weth?.tx_hash) return "funded";
  return subWallet.status ?? "created";
}

export function WalletRunHistory({
  mainWalletId,
  refreshKey = 0,
  title = "Run history",
  description = "Every run creates a fresh batch of wallets, funds them with ETH, wraps locally when needed, approves the router, executes swaps, deploys distributor contracts, transfers tokens into them, and stores a full movement log. Open a batch to inspect its subwallets and export encrypted keystores when needed.",
  emptyMessage = "No runs yet. Execute one from a main wallet and it will appear here.",
}: {
  mainWalletId?: string;
  refreshKey?: number;
  title?: string;
  description?: string;
  emptyMessage?: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [runs, setRuns] = useState<WalletRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exportTarget, setExportTarget] = useState<RunSubWallet | null>(null);
  const [accessPassphrase, setAccessPassphrase] = useState("");
  const [exportPassphrase, setExportPassphrase] = useState("");
  const [confirmExportPassphrase, setConfirmExportPassphrase] = useState("");
  const [exportingWalletId, setExportingWalletId] = useState<string | null>(null);
  const [pollTick, setPollTick] = useState(0);
  const [openRunId, setOpenRunId] = useState<string | undefined>(undefined);
  const autoOpenedActiveRunIdRef = useRef<string | null>(null);

  useEffect(() => {
    let active = true;

    const loadRuns = async () => {
      if (pollTick === 0) {
        setLoading(true);
      }
      try {
        const params = mainWalletId ? `?main_wallet_id=${encodeURIComponent(mainWalletId)}` : "";
        const response = await fetch(`${API_URL}/api/wallets/runs${params}`);
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload.detail ?? "Failed to load run history");
        }
        if (active) {
          setRuns(Array.isArray(payload.runs) ? payload.runs : []);
          setError(null);
        }
      } catch (loadError) {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : "Failed to load run history");
        }
      } finally {
        if (active) {
          if (pollTick === 0) {
            setLoading(false);
          }
        }
      }
    };

    loadRuns();
    return () => {
      active = false;
    };
  }, [mainWalletId, refreshKey, pollTick]);

  useEffect(() => {
    if (loading) return;
    if (!runs.some((run) => !isTerminalRunStatus(run.status))) return;
    const timer = window.setTimeout(() => {
      setPollTick((current) => current + 1);
    }, 2000);
    return () => window.clearTimeout(timer);
  }, [runs, loading]);

  useEffect(() => {
    const activeRun = runs.find((run) => !isTerminalRunStatus(run.status));
    if (!activeRun) {
      autoOpenedActiveRunIdRef.current = null;
      return;
    }
    if (autoOpenedActiveRunIdRef.current !== activeRun.id) {
      setOpenRunId(activeRun.id);
      autoOpenedActiveRunIdRef.current = activeRun.id;
    }
  }, [runs]);

  const hasActiveRun = runs.some((run) => !isTerminalRunStatus(run.status));

  const handleCopy = async (event: MouseEvent<HTMLButtonElement>, value: string | undefined, label: string) => {
    event.stopPropagation();
    if (!value || !navigator.clipboard) return;
    await navigator.clipboard.writeText(value);
    toast({ title: `${label} copied`, description: value });
  };

  const handleOpenExport = (event: MouseEvent<HTMLButtonElement>, wallet: RunSubWallet) => {
    event.stopPropagation();
    setExportTarget(wallet);
    setAccessPassphrase("");
    setExportPassphrase("");
    setConfirmExportPassphrase("");
  };

  const handleExportKeystore = async () => {
    if (!exportTarget) return;
    if (exportPassphrase.length < 12) {
      toast({
        title: "Export password too short",
        description: "Use at least 12 characters for the keystore export password.",
        variant: "destructive",
      });
      return;
    }
    if (exportPassphrase !== confirmExportPassphrase) {
      toast({
        title: "Passwords do not match",
        description: "Re-enter the export password so the keystore can be decrypted later.",
        variant: "destructive",
      });
      return;
    }

    setExportingWalletId(exportTarget.wallet_id);
    try {
      const response = await fetch(`${API_URL}/api/wallets/${exportTarget.wallet_id}/keystore`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          access_passphrase: accessPassphrase,
          export_passphrase: exportPassphrase,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.detail ?? "Failed to export keystore");
      }

      const keystoreJson = JSON.stringify(payload.keystore, null, 2);
      const blob = new Blob([keystoreJson], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${exportTarget.wallet_id}.keystore.json`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);

      toast({
        title: "Keystore exported",
        description: "Downloaded an encrypted keystore JSON. The raw private key was not exposed to the browser.",
      });
      setExportTarget(null);
      setAccessPassphrase("");
      setExportPassphrase("");
      setConfirmExportPassphrase("");
    } catch (exportError) {
      toast({
        title: "Keystore export failed",
        description: exportError instanceof Error ? exportError.message : "Failed to export keystore",
        variant: "destructive",
      });
    } finally {
      setExportingWalletId(null);
    }
  };

  return (
    <div className="rounded-2xl border border-border/70 bg-background/70 p-5">
      <div className="mb-4">
        <p className="text-base font-semibold text-foreground">{title}</p>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        {hasActiveRun ? (
          <p className="mt-2 text-xs font-medium text-sky-700">Live automation progress is updating every 2 seconds.</p>
        ) : null}
      </div>

      {loading ? (
        <div className="rounded-2xl border border-border/70 bg-secondary/20 p-6 text-sm text-muted-foreground">Loading run history...</div>
      ) : error ? (
        <div className="rounded-2xl border border-destructive/40 bg-destructive/5 p-6 text-sm text-destructive">{error}</div>
      ) : runs.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-6 text-sm text-muted-foreground">{emptyMessage}</div>
      ) : (
        <Accordion type="single" collapsible value={openRunId} onValueChange={setOpenRunId} className="rounded-2xl border border-border/70 bg-secondary/10 px-4">
          {runs.map((run) => {
            const stageSummaries = getRunStageSummaries(run);
            const automationHeadline = getAutomationHeadline(run);
            const progressPercent = getProgressPercent(run, stageSummaries);
            const fundedWalletCount = countFundedWallets(run);
            const wrappedTransactionCount = countWrappedTransactions(run);
            const swapTransactionCount = countSwapTransactions(run);
            const deployedContractCount = countDeployedContracts(run);
            const latestLog = run.run_logs?.length ? run.run_logs[run.run_logs.length - 1] : null;
            const deploymentLogs = run.run_logs?.filter((log) => ["deployment", "distribution"].includes(log.stage ?? ""));
            const isRunLive = !isTerminalRunStatus(run.status);
            const runningStage = stageSummaries.find((stage) => stage.status === "running");

            return (
              <AccordionItem key={run.id} value={run.id} className="border-border/60">
                <AccordionTrigger className="py-5 hover:no-underline">
                  <div className="flex min-w-0 flex-1 flex-col gap-3 text-left">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${statusTone(run.status)}`}>
                        {run.status}
                      </span>
                      <span className="text-sm font-semibold text-foreground">{run.template_name}</span>
                      <span className="text-xs text-muted-foreground">{formatTimestamp(run.created_at)}</span>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      <div className="rounded-xl border border-border/70 bg-background/80 px-3 py-2">
                        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Main wallet</p>
                        <p className="mt-1 break-all font-mono text-xs text-foreground">{shortValue(run.main_wallet_address, 10, 6)}</p>
                      </div>
                      <div className="rounded-xl border border-border/70 bg-background/80 px-3 py-2">
                        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Wallet count</p>
                        <p className="mt-1 text-sm font-semibold text-foreground">{run.contract_count}</p>
                      </div>
                      <div className="rounded-xl border border-border/70 bg-background/80 px-3 py-2">
                        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">ETH funded</p>
                        <p className="mt-1 text-sm font-semibold text-foreground">
                          {formatAmount(run.preview?.funding?.total_eth_deducted, "ETH")}
                        </p>
                      </div>
                      <div className="rounded-xl border border-border/70 bg-background/80 px-3 py-2">
                        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Contracts deployed</p>
                        <p className="mt-1 text-sm font-semibold text-foreground">{deployedContractCount}</p>
                      </div>
                    </div>
                  </div>
                </AccordionTrigger>

                <AccordionContent className="pb-5">
                  <div className="space-y-5">
                    {run.error ? (
                      <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-900">
                        <div className="flex items-start gap-2">
                          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                          <p>{run.error}</p>
                        </div>
                      </div>
                    ) : null}

                    <div className="rounded-[28px] bg-slate-100/90 p-4 shadow-[0_30px_80px_-42px_rgba(15,23,42,0.35)]">
                      <div className="rounded-[24px] border border-slate-200/80 bg-white p-5 shadow-[0_24px_70px_-40px_rgba(15,23,42,0.3)] sm:p-6">
                        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                          <div className="max-w-3xl">
                        <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium uppercase tracking-[0.16em] ${automationHeadline.tone}`}>
                              {isRunLive ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Rocket className="h-3.5 w-3.5" />}
                              {automationHeadline.label}
                            </div>
                            {isRunLive ? (
                              <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-[11px] font-medium text-sky-700">
                                <span className="relative flex h-2.5 w-2.5">
                                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sky-400 opacity-75" />
                                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-sky-500" />
                                </span>
                                Live automation is running
                              </div>
                            ) : null}
                            <h3 className="mt-4 text-2xl font-semibold tracking-tight text-slate-950">{run.template_name}</h3>
                            <p className="mt-2 text-sm leading-6 text-slate-600">
                              {latestLog?.message ?? run.contract_execution?.message ?? "Automation details were saved for this run."}
                            </p>
                            {run.contract_execution?.managed_token_distributor?.message && !deployedContractCount && !deploymentLogs?.length ? (
                              <p className="mt-2 text-sm text-slate-500">{run.contract_execution.managed_token_distributor.message}</p>
                            ) : null}
                          </div>

                          <div className="grid gap-3 sm:min-w-[280px]">
                            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                              <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">Run ID</p>
                              <p className="mt-1 break-all font-mono text-xs text-slate-700">{run.id}</p>
                            </div>
                            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                              <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">Network fee estimate</p>
                              <p className="mt-1 text-sm font-semibold text-slate-900">
                                {formatAmount(run.preview?.execution?.total_network_fee_eth ?? run.funding_fee_estimate?.fee_eth, "ETH")}
                              </p>
                            </div>
                          </div>
                        </div>

                        <div className="mt-6">
                          <div className="flex items-center justify-between text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
                            <span>Automation progress</span>
                            <div className="flex items-center gap-3">
                              {isRunLive ? (
                                <span className="inline-flex items-center gap-1 text-[11px] font-semibold tracking-normal text-sky-700">
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  {runningStage ? `${runningStage.label} live` : "Polling live"}
                                </span>
                              ) : null}
                              <span>{progressPercent}%</span>
                            </div>
                          </div>
                          <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200">
                            <div className={`relative h-full rounded-full transition-[width] duration-700 ease-out ${automationHeadline.bar}`} style={{ width: `${progressPercent}%` }}>
                              {isRunLive ? <div className="absolute inset-y-0 -right-2 w-14 animate-pulse rounded-full bg-white/45 blur-md" /> : null}
                            </div>
                          </div>
                        </div>

                        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                            <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">Wallets</p>
                            <p className="mt-1 text-sm font-semibold text-slate-900">{run.sub_wallets?.length ?? 0}</p>
                          </div>
                          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                            <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">Funded</p>
                            <p className="mt-1 text-sm font-semibold text-slate-900">{fundedWalletCount}</p>
                          </div>
                          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                            <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">Wrapped</p>
                            <p className="mt-1 text-sm font-semibold text-slate-900">{wrappedTransactionCount}</p>
                          </div>
                          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                            <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">Swaps</p>
                            <p className="mt-1 text-sm font-semibold text-slate-900">{swapTransactionCount}</p>
                          </div>
                          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                            <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">Deployed</p>
                            <p className="mt-1 text-sm font-semibold text-slate-900">{deployedContractCount}</p>
                          </div>
                        </div>

                        <div className="mt-6 grid gap-3 xl:grid-cols-5">
                          {stageSummaries.map((stage) => (
                            <div
                              key={stage.key}
                              className={`rounded-2xl border px-4 py-4 transition-all ${
                                stage.status === "running"
                                  ? "border-sky-300 bg-sky-50/70 shadow-[0_18px_36px_-28px_rgba(14,165,233,0.5)]"
                                  : "border-slate-200 bg-white"
                              }`}
                            >
                              <div className="flex items-start gap-3">
                                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border ${stageBadgeClass(stage.status)} ${stage.status === "running" ? "animate-pulse" : ""}`}>
                                  {stage.status === "completed" ? (
                                    <CheckCircle2 className="h-4 w-4" />
                                  ) : stage.status === "failed" ? (
                                    <CircleSlash className="h-4 w-4" />
                                  ) : stage.status === "running" ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <CircleDashed className="h-4 w-4" />
                                  )}
                                </div>
                                <div className="min-w-0">
                                  <p className="text-sm font-semibold text-slate-900">{stage.label}</p>
                                  <p className="mt-1 text-xs uppercase tracking-[0.16em] text-slate-500">{stage.status}</p>
                                  <p className="mt-2 text-sm leading-6 text-slate-600">{stage.note}</p>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>

                        <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200">
                          <div className="flex items-center gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3">
                            <Boxes className="h-4 w-4 text-slate-500" />
                            <p className="text-sm font-semibold text-slate-900">Automation matrix</p>
                          </div>
                          {run.sub_wallets?.length ? (
                            <div className="overflow-x-auto">
                              <table className="min-w-full divide-y divide-slate-200 text-sm">
                                <thead className="bg-white">
                                  <tr>
                                    <th className="px-4 py-3 text-left font-medium text-slate-500">#</th>
                                    <th className="px-4 py-3 text-left font-medium text-slate-500">Address</th>
                                    <th className="px-4 py-3 text-left font-medium text-slate-500">Funded</th>
                                    <th className="px-4 py-3 text-left font-medium text-slate-500">Wrap</th>
                                    <th className="px-4 py-3 text-left font-medium text-slate-500">Approve</th>
                                    <th className="px-4 py-3 text-left font-medium text-slate-500">Swaps</th>
                                    <th className="px-4 py-3 text-left font-medium text-slate-500">Contract</th>
                                    <th className="px-4 py-3 text-left font-medium text-slate-500">Status</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-200 bg-white">
                                  {run.sub_wallets.map((subWallet, index) => (
                                    <tr key={subWallet.wallet_id}>
                                      <td className="px-4 py-3 text-slate-500">{typeof subWallet.index === "number" ? subWallet.index : index + 1}</td>
                                      <td className="px-4 py-3">
                                        <div className="flex items-center gap-2">
                                          <span className="font-mono text-xs text-slate-700">{shortValue(subWallet.address, 10, 6)}</span>
                                          <button
                                            type="button"
                                            className="text-slate-400 transition hover:text-slate-700"
                                            onClick={(event) => handleCopy(event, subWallet.address, "Address")}
                                          >
                                            <Copy className="h-3.5 w-3.5" />
                                          </button>
                                        </div>
                                      </td>
                                      <td className="px-4 py-3 font-mono text-xs text-slate-700">
                                        {subWallet.funding_transactions?.eth?.tx_hash ? shortValue(subWallet.funding_transactions.eth.tx_hash, 8, 6) : "—"}
                                      </td>
                                      <td className="px-4 py-3 font-mono text-xs text-slate-700">
                                        {subWallet.wrap_transaction?.tx_hash ? shortValue(subWallet.wrap_transaction.tx_hash, 8, 6) : "—"}
                                      </td>
                                      <td className="px-4 py-3 font-mono text-xs text-slate-700">
                                        {subWallet.approval_transactions?.[0]?.tx_hash ? shortValue(subWallet.approval_transactions[0].tx_hash ?? undefined, 8, 6) : "—"}
                                      </td>
                                      <td className="px-4 py-3 text-xs text-slate-700">
                                        {subWallet.swap_transactions?.length ? (
                                          <div className="space-y-1">
                                            {subWallet.swap_transactions.map((swap, swapIndex) => (
                                              <div key={`${subWallet.wallet_id}-swap-${swapIndex}`} className="font-mono">
                                                {swap.token_symbol ?? "Token"} {swap.tx_hash ? shortValue(swap.tx_hash, 8, 6) : "—"}
                                              </div>
                                            ))}
                                          </div>
                                        ) : "—"}
                                      </td>
                                      <td className="px-4 py-3 text-xs text-slate-700">
                                        {subWallet.deployed_contracts?.length ? (
                                          <div className="space-y-1">
                                            {subWallet.deployed_contracts.map((contract, contractIndex) => (
                                              <div key={`${subWallet.wallet_id}-contract-${contractIndex}`} className="font-mono">
                                                {getDisplayTokenSymbol(contract.token_symbol, contract.token_address)} {contract.contract_address
                                                  ? shortValue(contract.contract_address, 8, 6)
                                                  : contract.tx_hash
                                                    ? shortValue(contract.tx_hash, 8, 6)
                                                    : "—"}
                                              </div>
                                            ))}
                                          </div>
                                        ) : shouldShowDeployingContract(subWallet, run) ? (
                                          <div className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-[11px] font-semibold text-sky-700">
                                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                            Deploying...
                                          </div>
                                        ) : subWallet.deployed_contract?.contract_address
                                          ? shortValue(subWallet.deployed_contract.contract_address, 8, 6)
                                          : subWallet.deployed_contract?.tx_hash
                                            ? shortValue(subWallet.deployed_contract.tx_hash, 8, 6)
                                            : "—"}
                                      </td>
                                      <td className="px-4 py-3">
                                        <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${statusTone(getSubWalletDisplayStatus(subWallet, run))}`}>
                                          {["deploying", "swapping", "wrapping"].includes((getSubWalletDisplayStatus(subWallet, run) ?? "").toLowerCase()) ? (
                                            <Loader2 className="h-3 w-3 animate-spin" />
                                          ) : null}
                                          {getSubWalletDisplayStatus(subWallet, run)}
                                        </span>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          ) : (
                            <div className="px-4 py-6 text-sm text-slate-500">No sub-wallet batch was saved for this run.</div>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
                      <div className="rounded-2xl border border-slate-200 bg-white px-5 py-5 shadow-[0_18px_40px_-32px_rgba(15,23,42,0.28)]">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100 text-slate-600">
                            <ScrollText className="h-4 w-4" />
                          </div>
                          <div>
                            <p className="text-lg font-semibold text-slate-950">Logs</p>
                            <p className="text-sm text-slate-500">Every movement saved by the automation flow.</p>
                          </div>
                        </div>

                        {run.run_logs?.length ? (
                          <div className="mt-4 overflow-hidden rounded-2xl border border-slate-800 bg-slate-950">
                            <div className="max-h-[520px] space-y-3 overflow-y-auto px-4 py-4">
                              {run.run_logs.map((log, index) => (
                                <div
                                  key={`${run.id}-log-${index}`}
                                  className={`rounded-xl border px-3 py-3 ${
                                    isRunningStatus(log.status)
                                      ? "border-sky-700/60 bg-slate-900 shadow-[inset_0_0_0_1px_rgba(56,189,248,0.18)]"
                                      : "border-slate-800 bg-slate-900/70"
                                  }`}
                                >
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${statusTone(log.status)} ${isRunningStatus(log.status) ? "animate-pulse" : ""}`}>
                                      {isRunningStatus(log.status) ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                                      {log.status ?? "info"}
                                    </span>
                                    <span className="text-[11px] uppercase tracking-wide text-slate-400">
                                      {(log.stage ?? log.event ?? "run").replace(/_/g, " ")}
                                    </span>
                                    <span className="text-xs text-slate-500">{formatTimestamp(log.timestamp)}</span>
                                  </div>
                                  <p className="mt-2 text-sm font-semibold text-slate-100">{log.message ?? log.event ?? "Run activity"}</p>
                                  {log.movement ? (
                                    <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                                      <ArrowRightLeft className="h-3.5 w-3.5" />
                                      <span>
                                        {(log.movement.action ?? "movement").replace(/_/g, " ")} · {formatAmount(log.movement.amount, log.movement.asset ?? "")}
                                      </span>
                                      {log.movement.from_address ? <span>{shortValue(log.movement.from_address, 10, 6)}</span> : null}
                                      {log.movement.to_address ? <span>{`-> ${shortValue(log.movement.to_address, 10, 6)}`}</span> : null}
                                    </p>
                                  ) : null}
                                  {!log.movement && log.wallet_address ? (
                                    <p className="mt-1 text-xs text-slate-400">{shortValue(log.wallet_address, 10, 6)}</p>
                                  ) : null}
                                  {formatLogDetails(log.details) ? <p className="mt-2 text-xs text-slate-400">{formatLogDetails(log.details)}</p> : null}
                                  {log.tx_hash ? <p className="mt-2 break-all font-mono text-xs text-slate-200">{log.tx_hash}</p> : null}
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                            No movement logs were saved for this run.
                          </div>
                        )}
                      </div>

                      <div className="space-y-4">
                        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-[0_18px_40px_-32px_rgba(15,23,42,0.28)]">
                          <p className="text-[11px] uppercase tracking-wide text-slate-500">Main wallet</p>
                          <p className="mt-1 break-all font-mono text-xs text-slate-700">{run.main_wallet_address}</p>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-[0_18px_40px_-32px_rgba(15,23,42,0.28)]">
                          <p className="text-[11px] uppercase tracking-wide text-slate-500">Movement entries</p>
                          <p className="mt-1 text-sm font-semibold text-slate-900">{run.run_logs?.length ?? 0}</p>
                          {latestLog ? <p className="mt-2 text-xs text-slate-500">{latestLog.message}</p> : null}
                        </div>
                        {wrappedTransactionCount > 0 ? (
                          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-[0_18px_40px_-32px_rgba(15,23,42,0.28)]">
                            <p className="text-[11px] uppercase tracking-wide text-slate-500">Local wrap</p>
                            <p className="mt-1 text-sm font-semibold text-slate-900">
                              {wrappedTransactionCount} wallet{wrappedTransactionCount === 1 ? "" : "s"} wrapped ETH into WETH
                            </p>
                            {run.wrap_transaction?.tx_hash ? (
                              <p className="mt-2 break-all font-mono text-xs text-slate-700">{run.wrap_transaction.tx_hash}</p>
                            ) : null}
                          </div>
                        ) : null}
                        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-[0_18px_40px_-32px_rgba(15,23,42,0.28)]">
                          <p className="text-[11px] uppercase tracking-wide text-slate-500">Contract deployment</p>
                          <p className="mt-1 text-sm font-semibold text-slate-900">
                            {run.contract_execution?.managed_token_distributor?.status?.replace(/_/g, " ") ?? "Unavailable"}
                          </p>
                          {run.contract_execution?.managed_token_distributor?.message ? (
                            <p className="mt-2 text-xs text-slate-500">{run.contract_execution.managed_token_distributor.message}</p>
                          ) : null}
                        </div>
                        {run.deployed_contracts?.length ? (
                          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-[0_18px_40px_-32px_rgba(15,23,42,0.28)]">
                            <p className="text-sm font-semibold text-slate-900">Deployed contracts</p>
                            <div className="mt-3 space-y-3">
                              {run.deployed_contracts.map((contract, index) => (
                                <div key={`${run.id}-contract-${index}`} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${statusTone(contract.status)}`}>
                                      {contract.status ?? "unknown"}
                                    </span>
                                    <p className="text-sm font-semibold text-slate-900">{contract.contract_name ?? "Managed contract"}</p>
                                  </div>
                                  {contract.contract_address ? (
                                    <p className="mt-2 break-all font-mono text-xs text-slate-700">{contract.contract_address}</p>
                                  ) : (
                                    <p className="mt-2 text-xs text-slate-500">Contract address unavailable</p>
                                  )}
                                  <p className="mt-2 text-xs text-slate-500">
                                    {contract.wallet_address ? `Subwallet ${shortValue(contract.wallet_address, 10, 6)}` : "Subwallet unavailable"}
                                    {contract.recipient_address ? ` • Recipient ${shortValue(contract.recipient_address, 10, 6)}` : ""}
                                    {contract.amount ? ` • ${formatAmount(contract.amount, getDisplayTokenSymbol(contract.token_symbol, contract.token_address))}` : ""}
                                    {contract.deployment_attempts ? ` • Attempts ${contract.deployment_attempts}` : ""}
                                  </p>
                                  {contract.tx_hash ? <p className="mt-2 break-all font-mono text-xs text-slate-700">{contract.tx_hash}</p> : null}
                                  {contract.error ? <p className="mt-2 text-xs text-destructive">{contract.error}</p> : null}
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    </div>

                    <div className="space-y-3">
                      <p className="text-sm font-semibold text-foreground">Created wallets</p>
                      {run.sub_wallets?.map((subWallet) => {
                        return (
                          <div key={subWallet.wallet_id} className="rounded-2xl border border-border/70 bg-background px-4 py-4">
                            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                              <div className="flex min-w-0 items-start gap-3">
                                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-accent/10 text-accent">
                                  <WalletCards className="h-5 w-5" />
                                </div>
                                <div className="min-w-0">
                                  <p className="text-sm font-semibold text-foreground">Subwallet {typeof subWallet.index === "number" ? `#${subWallet.index}` : ""}</p>
                                  <p className="mt-1 break-all font-mono text-xs text-muted-foreground">{subWallet.address}</p>
                                  <p className="mt-1 break-all text-xs text-muted-foreground">{subWallet.wallet_id}</p>
                                </div>
                              </div>

                              <div className="flex flex-wrap items-center gap-2">
                                <Button type="button" variant="outline" size="sm" onClick={() => router.push(`/wallets/${subWallet.wallet_id}`)}>
                                  Open wallet
                                </Button>
                                <Button type="button" variant="outline" size="sm" onClick={(event) => handleCopy(event, subWallet.address, "Address")}>
                                  <Copy className="h-4 w-4" />
                                  Copy address
                                </Button>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={(event) => handleOpenExport(event, subWallet)}
                                  disabled={exportingWalletId === subWallet.wallet_id}
                                >
                                  {exportingWalletId === subWallet.wallet_id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                                  Export keystore
                                </Button>
                              </div>
                            </div>

                            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                              <div className="rounded-xl border border-border/70 bg-secondary/10 px-3 py-2">
                                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Status</p>
                                <p className="mt-1 text-sm font-semibold text-foreground">{subWallet.status ?? "created"}</p>
                              </div>
                              <div className="rounded-xl border border-border/70 bg-secondary/10 px-3 py-2">
                                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Expected ETH</p>
                                <p className="mt-1 text-sm font-semibold text-foreground">
                                  {formatAmount(subWallet.expected_funding?.eth, "ETH")}
                                </p>
                              </div>
                              <div className="rounded-xl border border-border/70 bg-secondary/10 px-3 py-2">
                                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Local WETH wrap</p>
                                <p className="mt-1 text-sm font-semibold text-foreground">
                                  {formatAmount(subWallet.expected_local_wrap_weth ?? subWallet.expected_funding?.weth, "WETH")}
                                </p>
                              </div>
                              <div className="rounded-xl border border-border/70 bg-secondary/10 px-3 py-2">
                                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Access</p>
                                <p className="mt-1 text-sm font-semibold text-foreground">
                                  {(subWallet.private_key_access?.export_supported ?? subWallet.private_key_access?.reveal_supported)
                                    ? "Encrypted keystore export"
                                    : "Unavailable"}
                                </p>
                              </div>
                            </div>

                            {subWallet.funding_transactions?.eth?.tx_hash || subWallet.funding_transactions?.weth?.tx_hash || subWallet.wrap_transaction?.tx_hash ? (
                              <div className="mt-4 grid gap-3 md:grid-cols-2">
                                {subWallet.funding_transactions?.eth?.tx_hash ? (
                                  <div className="rounded-xl border border-border/70 bg-secondary/10 px-3 py-3">
                                    <p className="text-sm font-semibold text-foreground">ETH transfer</p>
                                    <p className="mt-1 text-xs text-muted-foreground">
                                      {formatAmount(subWallet.funding_transactions.eth.amount, "ETH")} · {subWallet.funding_transactions.eth.status ?? "submitted"}
                                    </p>
                                    <p className="mt-2 break-all font-mono text-xs text-foreground">{subWallet.funding_transactions.eth.tx_hash}</p>
                                  </div>
                                ) : null}
                                {subWallet.funding_transactions?.weth?.tx_hash ? (
                                  <div className="rounded-xl border border-border/70 bg-secondary/10 px-3 py-3">
                                    <p className="text-sm font-semibold text-foreground">WETH transfer</p>
                                    <p className="mt-1 text-xs text-muted-foreground">
                                      {formatAmount(subWallet.funding_transactions.weth.amount, "WETH")} · {subWallet.funding_transactions.weth.status ?? "submitted"}
                                    </p>
                                    <p className="mt-2 break-all font-mono text-xs text-foreground">{subWallet.funding_transactions.weth.tx_hash}</p>
                                  </div>
                                ) : null}
                                {subWallet.wrap_transaction?.tx_hash ? (
                                  <div className="rounded-xl border border-border/70 bg-secondary/10 px-3 py-3">
                                    <p className="text-sm font-semibold text-foreground">Local ETH wrap</p>
                                    <p className="mt-1 text-xs text-muted-foreground">
                                      {formatAmount(subWallet.wrap_transaction.eth_wrapped, "ETH")} wrapped · {subWallet.wrap_transaction.status ?? "confirmed"}
                                    </p>
                                    <p className="mt-2 break-all font-mono text-xs text-foreground">{subWallet.wrap_transaction.tx_hash}</p>
                                  </div>
                                ) : null}
                              </div>
                            ) : null}

                            {subWallet.approval_transactions?.length ? (
                              <div className="mt-4 grid gap-3 md:grid-cols-2">
                                {subWallet.approval_transactions.map((approval, index) => (
                                  <div key={`${subWallet.wallet_id}-approval-${index}`} className="rounded-xl border border-border/70 bg-secondary/10 px-3 py-3">
                                    <p className="text-sm font-semibold text-foreground">Router approval</p>
                                    <p className="mt-1 text-xs text-muted-foreground">
                                      {formatAmount(approval.amount, approval.token_symbol ?? "WETH")} · {approval.status ?? "submitted"}
                                    </p>
                                    {approval.attempts || approval.confirmation_source ? (
                                      <p className="mt-1 text-[11px] text-muted-foreground">
                                        {approval.attempts ? `attempts ${approval.attempts}` : "attempts 1"}
                                        {approval.confirmation_source ? ` • ${approval.confirmation_source.replace(/_/g, " ")}` : ""}
                                      </p>
                                    ) : null}
                                    {approval.tx_hash ? <p className="mt-2 break-all font-mono text-xs text-foreground">{approval.tx_hash}</p> : null}
                                    {approval.error ? <p className="mt-2 text-xs text-destructive">{approval.error}</p> : null}
                                  </div>
                                ))}
                              </div>
                            ) : null}

                            {subWallet.swap_transactions?.length ? (
                              <div className="mt-4 grid gap-3 md:grid-cols-2">
                                {subWallet.swap_transactions.map((swap, index) => (
                                  <div key={`${subWallet.wallet_id}-swap-card-${index}`} className="rounded-xl border border-border/70 bg-secondary/10 px-3 py-3">
                                    <p className="text-sm font-semibold text-foreground">{swap.token_symbol ?? "Swap"}</p>
                                    <p className="mt-1 text-xs text-muted-foreground">
                                      {formatAmount(swap.amount_in, "WETH")} in
                                      {swap.amount_out ? ` · ${formatAmount(swap.amount_out, swap.token_symbol ?? "TOKEN")} out` : ""}
                                      {swap.status ? ` · ${swap.status}` : ""}
                                    </p>
                                    {swap.attempts || swap.confirmation_source ? (
                                      <p className="mt-1 text-[11px] text-muted-foreground">
                                        {swap.attempts ? `attempts ${swap.attempts}` : "attempts 1"}
                                        {swap.confirmation_source ? ` • ${swap.confirmation_source.replace(/_/g, " ")}` : ""}
                                      </p>
                                    ) : null}
                                    {swap.tx_hash ? <p className="mt-2 break-all font-mono text-xs text-foreground">{swap.tx_hash}</p> : null}
                                    {swap.error ? <p className="mt-2 text-xs text-destructive">{swap.error}</p> : null}
                                  </div>
                                ))}
                              </div>
                            ) : null}

                            {(subWallet.deployed_contracts?.length || subWallet.deployed_contract) ? (
                              <div className="mt-4 space-y-3">
                                {(subWallet.deployed_contracts?.length ? subWallet.deployed_contracts : [subWallet.deployed_contract]).filter(Boolean).map((contract, index) => (
                                  <div key={`${subWallet.wallet_id}-deployed-contract-${index}`} className="rounded-xl border border-border/70 bg-secondary/10 px-3 py-3">
                                    <p className="text-sm font-semibold text-foreground">{contract?.contract_name ?? "ManagedTokenDistributor"}</p>
                                    <p className="mt-1 text-xs text-muted-foreground">
                                      {contract?.amount
                                        ? `${formatAmount(contract.amount, getDisplayTokenSymbol(contract.token_symbol, contract.token_address))} to ${shortValue(contract.recipient_address ?? "", 10, 6)}`
                                        : "Deployment details unavailable"}
                                    </p>
                                    {contract?.contract_address ? (
                                      <p className="mt-2 break-all font-mono text-xs text-foreground">{contract.contract_address}</p>
                                    ) : null}
                                    {contract?.tx_hash ? (
                                      <p className="mt-2 break-all font-mono text-xs text-muted-foreground">deploy: {contract.tx_hash}</p>
                                    ) : null}
                                    {contract?.funding_tx_hash ? (
                                      <p className="mt-1 break-all font-mono text-xs text-muted-foreground">funding: {contract.funding_tx_hash}</p>
                                    ) : null}
                                    {contract?.error ? (
                                      <p className="mt-2 text-xs text-destructive">{contract.error}</p>
                                    ) : null}
                                  </div>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      )}

      <Dialog
        open={Boolean(exportTarget)}
        onOpenChange={(open) => {
          if (!open) {
            setExportTarget(null);
            setAccessPassphrase("");
            setExportPassphrase("");
            setConfirmExportPassphrase("");
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Export encrypted keystore</DialogTitle>
            <DialogDescription>
              This exports an encrypted keystore JSON only. Enter the dedicated wallet access passphrase from the backend, then choose a separate password for the exported keystore file.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-xl border border-border/70 bg-secondary/10 px-4 py-3">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Wallet</p>
              <p className="mt-1 break-all font-mono text-xs text-foreground">{exportTarget?.address ?? "Unavailable"}</p>
            </div>

            <div className="space-y-2">
              <label htmlFor="wallet-access-passphrase" className="text-sm font-medium text-foreground">
                Unlock passphrase
              </label>
              <Input
                id="wallet-access-passphrase"
                type="password"
                value={accessPassphrase}
                onChange={(event) => setAccessPassphrase(event.target.value)}
                placeholder="Dedicated wallet access passphrase"
                autoComplete="off"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="wallet-export-passphrase" className="text-sm font-medium text-foreground">
                Keystore password
              </label>
              <Input
                id="wallet-export-passphrase"
                type="password"
                value={exportPassphrase}
                onChange={(event) => setExportPassphrase(event.target.value)}
                placeholder="At least 12 characters"
                autoComplete="off"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="wallet-export-passphrase-confirm" className="text-sm font-medium text-foreground">
                Confirm keystore password
              </label>
              <Input
                id="wallet-export-passphrase-confirm"
                type="password"
                value={confirmExportPassphrase}
                onChange={(event) => setConfirmExportPassphrase(event.target.value)}
                placeholder="Re-enter the keystore password"
                autoComplete="off"
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setExportTarget(null)} disabled={Boolean(exportingWalletId)}>
              Cancel
            </Button>
            <Button type="button" onClick={handleExportKeystore} disabled={!exportTarget || Boolean(exportingWalletId)}>
              {exportingWalletId ? "Exporting..." : "Download keystore"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
