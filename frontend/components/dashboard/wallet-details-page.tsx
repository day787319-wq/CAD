"use client";

import Link from "next/link";
import { MouseEvent, ReactNode, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowLeft, CheckCircle2, Coins, Copy, Fuel, Loader2, Pencil, PlusCircle, RefreshCw, Rocket, Trash2, WalletCards } from "lucide-react";
import { useRouter } from "next/navigation";
import type { Section } from "@/app/page";
import { Header } from "@/components/dashboard/header";
import { TemplateMarketCheckPanel } from "@/components/dashboard/template-market-check";
import { WalletRunHistory } from "@/components/dashboard/wallet-run-history";
import { Sidebar } from "@/components/dashboard/sidebar";
import { TemplateEditor } from "@/components/dashboard/template-editor";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  TEMPLATE_API_URL,
  Template,
  TemplateOptions,
  TemplateWalletSupportPreview,
  buildTemplateWalletSupportPreview,
  formatAmount,
  formatFeeTier,
  formatRelativeTimestamp,
  getStablecoinDistributionRows,
  shortAddress,
} from "@/lib/template";

type BalanceWallet = {
  id: string;
  type: string;
  address: string;
  parent_id?: string | null;
  eth_balance: number | null;
  weth_balance: number | null;
  balances_live: boolean;
  funding_gas_price_gwei?: number | null;
  balance_error?: string | null;
  balance_refreshed_at?: string | null;
  index?: number;
};

type WalletDetails = BalanceWallet & {
  sub_wallets: BalanceWallet[];
};

function formatTokenBalance(value: number | null | undefined, symbol: string) {
  return value === null || value === undefined ? "Unavailable" : `${formatAmount(value)} ${symbol}`;
}

function InfoCard({
  label,
  value,
  hint,
  valueClassName,
  className,
}: {
  label: string;
  value: string;
  hint?: string;
  valueClassName?: string;
  className?: string;
}) {
  return (
    <div className={`min-w-0 rounded-xl border border-border/70 bg-background/70 px-4 py-3 ${className ?? ""}`}>
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-1 break-words text-sm font-semibold text-foreground ${valueClassName ?? ""}`}>{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function SectionBlock({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border/70 bg-background/70 p-5">
      <div className="mb-4">
        <p className="text-base font-semibold text-foreground">{title}</p>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {children}
    </div>
  );
}

function TemplateMetric({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-secondary/10 px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-semibold text-foreground">{value}</p>
    </div>
  );
}

const WRAP_GAS_UNITS = 120_000;
const ETH_TRANSFER_GAS_UNITS = 21_000;
const APPROVE_GAS_UNITS = 70_000;
const SWAP_GAS_UNITS = 350_000;
const TOKEN_TRANSFER_GAS_UNITS = 90_000;
const DISTRIBUTOR_DEPLOY_GAS_UNITS = 900_000;

type AutomationStepTone = "ready" | "planned" | "attention" | "optional";

function toNumericValue(value: string | number | null | undefined) {
  const numeric = typeof value === "number" ? value : Number.parseFloat(value ?? "");
  return Number.isFinite(numeric) ? numeric : null;
}

function formatCryptoMetric(
  value: string | number | null | undefined,
  symbol?: string,
  options?: { maxDecimals?: number; fallback?: string },
) {
  const maxDecimals = options?.maxDecimals ?? 12;
  const fallback = options?.fallback ?? "0";
  const source = typeof value === "number" ? `${value}` : `${value ?? ""}`.trim();
  if (!source) return symbol ? `${fallback} ${symbol}` : fallback;

  const numeric = Number.parseFloat(source);
  if (!Number.isFinite(numeric)) {
    return symbol ? `${fallback} ${symbol}` : fallback;
  }

  const normalized = numeric.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: maxDecimals,
  });
  return symbol ? `${normalized} ${symbol}` : normalized;
}

function estimateGasFeeDisplay(gasUnits: number, gasPriceGwei: string | number | null | undefined) {
  if (gasUnits <= 0) return "0 ETH";
  const gasPrice = toNumericValue(gasPriceGwei);
  if (gasPrice === null) return "Pending RPC";
  return formatCryptoMetric((gasUnits * gasPrice) / 1_000_000_000, "ETH");
}

function getDistributorAutomationSummary(template: Template) {
  const recipientConfigured = Boolean(template.recipient_address);
  const distributorAmount = toNumericValue(template.direct_contract_weth_per_contract) ?? 0;
  const hasSwapRoutes = getStablecoinDistributionRows(template).some((route) => (toNumericValue(route.weth_amount_per_contract) ?? 0) > 0);
  const hasDistributorFlow = hasSwapRoutes || distributorAmount > 0;

  if (recipientConfigured && hasDistributorFlow) {
    return {
      enabled: true,
      title: "Auto deploy ready",
      description: hasSwapRoutes && distributorAmount > 0
        ? "Deploy ManagedTokenDistributor after each successful swap output and for the direct WETH allocation."
        : hasSwapRoutes
          ? "Deploy one ManagedTokenDistributor per successful swap output after local wrap and swaps."
          : `Deploy ManagedTokenDistributor for the direct ${formatCryptoMetric(template.direct_contract_weth_per_contract, "WETH")} allocation after local wrap.`,
    };
  }

  if (hasDistributorFlow && !recipientConfigured) {
    return {
      enabled: false,
      title: "Auto deploy needs recipient",
      description: "Set a recipient address in the template editor to enable ManagedTokenDistributor deployment after swaps.",
    };
  }

  return {
    enabled: false,
    title: "Auto deploy disabled",
    description: "This template only funds ETH right now. Add a positive stablecoin swap budget with allocations or direct WETH funding to enable ManagedTokenDistributor deployment.",
  };
}

function buildBudgetPreviewRows(wallet: WalletDetails, preview: TemplateWalletSupportPreview) {
  return [
    { label: "Chain", value: "Ethereum Mainnet" },
    { label: "Sub-Wallets", value: `${preview.contract_count}` },
    {
      label: "Main Wallet Balance",
      value: `${formatCryptoMetric(wallet.eth_balance, "ETH")} / ${formatCryptoMetric(wallet.weth_balance, "WETH")}`,
    },
    {
      label: "Total ETH Needed",
      value: formatCryptoMetric(preview.execution.total_eth_required_with_fees, "ETH"),
    },
  ];
}

function buildSwapPreviewRows(preview: TemplateWalletSupportPreview) {
  const gasPerRoute = estimateGasFeeDisplay(SWAP_GAS_UNITS, preview.execution.estimated_gas_price_gwei);

  return preview.stablecoin_routes.map((route) => ({
    token: route.token_symbol,
    budgetPerWallet: formatCryptoMetric(route.per_contract_weth_amount, "WETH"),
    estimatedOutput: route.percent ? `${formatCryptoMetric(route.percent)}% allocation` : "Template route",
    gasPerRoute,
  }));
}

function buildGasEstimateRows(preview: TemplateWalletSupportPreview, template: Template) {
  const distributorAutomation = getDistributorAutomationSummary(template);
  const gasPrice = preview.execution.estimated_gas_price_gwei;
  const totalGasUnits = preview.execution.estimated_gas_units ?? 0;

  return [
    {
      label: "funding gas",
      value: estimateGasFeeDisplay(preview.execution.funding_transaction_count * ETH_TRANSFER_GAS_UNITS, gasPrice),
      hint: preview.execution.funding_transaction_count > 0 ? "ETH transfers from the main wallet into each sub-wallet" : "No ETH funding transfers in this plan",
    },
    {
      label: "wrap gas",
      value: estimateGasFeeDisplay(preview.execution.wrap_transaction_count * WRAP_GAS_UNITS, gasPrice),
      hint: preview.execution.wrap_transaction_count > 0 ? "Each sub-wallet wraps only the WETH amount it needs locally" : "No local WETH wrapping is required",
    },
    {
      label: "approve gas",
      value: estimateGasFeeDisplay(preview.execution.approval_transaction_count * APPROVE_GAS_UNITS, gasPrice),
      hint: preview.execution.approval_transaction_count > 0 ? "Approve WETH to the router before swaps" : "No router approvals are required",
    },
    {
      label: "swap gas",
      value: estimateGasFeeDisplay(preview.execution.swap_transaction_count * SWAP_GAS_UNITS, gasPrice),
      hint: preview.execution.swap_transaction_count > 0 ? "Swap WETH into the configured stablecoin routes" : "No stablecoin swap routes are configured",
    },
    {
      label: "deploy gas",
      value: estimateGasFeeDisplay(preview.execution.deployment_transaction_count * DISTRIBUTOR_DEPLOY_GAS_UNITS, gasPrice),
      hint: preview.execution.deployment_transaction_count > 0 ? "Deploy ManagedTokenDistributor from each sub-wallet target" : distributorAutomation.description,
    },
    {
      label: "contract transfer gas",
      value: estimateGasFeeDisplay(preview.execution.contract_funding_transaction_count * TOKEN_TRANSFER_GAS_UNITS, gasPrice),
      hint: preview.execution.contract_funding_transaction_count > 0 ? "Transfer swapped tokens or direct WETH into each deployed distributor" : "No post-deploy token transfers are required",
    },
    {
      label: "total gas",
      value: estimateGasFeeDisplay(totalGasUnits, gasPrice),
      hint: "Funding, local wrap, approval, swap, deployment, and distributor transfer estimate",
    },
  ];
}

function buildAutomationSteps(
  preview: TemplateWalletSupportPreview,
  template: Template,
  walletType: WalletDetails["type"],
): Array<{ title: string; description: string; tone: AutomationStepTone }> {
  const distributorAutomation = getDistributorAutomationSummary(template);
  const autoAddedGasBuffer = toNumericValue(preview.per_contract.auto_added_gas_buffer_eth);
  const minimumUnwrappedEth = preview.per_contract.minimum_unwrapped_eth ?? preview.per_contract.gas_reserve_eth;

  return [
    {
      title: "Budget validation",
      description: preview.can_proceed
        ? autoAddedGasBuffer && autoAddedGasBuffer > 0
          ? `The main wallet can cover the selected run size, including ${formatCryptoMetric(preview.per_contract.auto_added_gas_buffer_eth, "ETH")} of automatic per-wallet gas headroom for local execution.`
          : "The main wallet can cover the selected run size and the estimated network fee."
        : preview.shortfall_reason ?? "The current balances do not satisfy the automation budget.",
      tone: preview.can_proceed ? "ready" : "attention",
    },
    {
      title: "Sub-wallet creation",
      description:
        walletType === "imported_private_key"
          ? `Create ${preview.contract_count} linked sub-wallet${preview.contract_count === 1 ? "" : "s"} from the imported main wallet.`
          : `Derive ${preview.contract_count} fresh sub-wallet${preview.contract_count === 1 ? "" : "s"} from the main wallet seed.`,
      tone: "planned",
    },
    {
      title: "ETH funding",
      description: `Send ${formatCryptoMetric(preview.funding.eth_sent_to_subwallets, "ETH")} from the main wallet so each sub-wallet keeps gas in ETH and funds its own wrap budget.`,
      tone: "planned",
    },
    {
      title: "Local WETH wrap",
      description: preview.execution.wrap_transaction_count > 0
        ? `Each sub-wallet wraps ${formatCryptoMetric(preview.per_contract.required_weth, "WETH")} locally and keeps ${formatCryptoMetric(minimumUnwrappedEth, "ETH")} unwrapped for gas and any direct ETH-side actions.`
        : "This template does not require any local WETH wrapping.",
      tone: preview.execution.wrap_transaction_count > 0 ? "planned" : "optional",
    },
    {
      title: "Approve and swap",
      description: preview.execution.swap_transaction_count > 0
        ? `Approve the router once per sub-wallet and execute ${preview.execution.swap_transaction_count} WETH-to-stablecoin swap${preview.execution.swap_transaction_count === 1 ? "" : "s"} across the configured routes.`
        : "No stablecoin swaps are configured for this template.",
      tone: preview.execution.swap_transaction_count > 0 ? "planned" : "optional",
    },
    {
      title: distributorAutomation.enabled ? "Deploy distributors" : distributorAutomation.title,
      description: distributorAutomation.enabled
        ? `Deploy up to ${preview.execution.deployment_transaction_count} ManagedTokenDistributor contract${preview.execution.deployment_transaction_count === 1 ? "" : "s"}, transfer the resulting token balances in, and record every tx hash.`
        : distributorAutomation.description,
      tone: distributorAutomation.enabled ? "planned" : "optional",
    },
    {
      title: "Movement log",
      description: "Persist the run record, funding hashes, local wrap txs, approvals, swaps, deployments, distributor transfers, and the automation timeline into Run history.",
      tone: "ready",
    },
  ];
}

function automationToneClass(tone: AutomationStepTone) {
  switch (tone) {
    case "ready":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "attention":
      return "border-rose-200 bg-rose-50 text-rose-700";
    case "optional":
      return "border-slate-200 bg-slate-100 text-slate-600";
    default:
      return "border-sky-200 bg-sky-50 text-sky-700";
  }
}

function BudgetPreviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 border-b border-slate-200/80 py-3 last:border-b-0 sm:grid-cols-[160px_minmax(0,1fr)] sm:items-center">
      <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="text-sm font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function AutomationStepCard({
  step,
  index,
}: {
  step: { title: string; description: string; tone: AutomationStepTone };
  index: number;
}) {
  return (
    <div className="relative rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-[0_12px_30px_-24px_rgba(15,23,42,0.35)]">
      <div className="flex items-start gap-3">
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-sm font-semibold ${automationToneClass(step.tone)}`}>
          {index + 1}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900">{step.title}</p>
          <p className="mt-1 text-sm leading-6 text-slate-600">{step.description}</p>
        </div>
      </div>
    </div>
  );
}

function buildTemplateSummary(template: Template) {
  if (template.stablecoin_distribution_mode === "none") {
    return "Gas and direct funding only";
  }

  const routeCount = template.stablecoin_allocations.length;
  return `${routeCount} stablecoin route${routeCount === 1 ? "" : "s"} · ${formatFeeTier(template.fee_tier)}`;
}

export function WalletDetailsPage({ walletId }: { walletId: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [activeSection, setActiveSection] = useState<Section>("overview");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [wallet, setWallet] = useState<WalletDetails | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [options, setOptions] = useState<TemplateOptions | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [contractCount, setContractCount] = useState("1");
  const [loadingWallet, setLoadingWallet] = useState(true);
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [templatesError, setTemplatesError] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [refreshingWallet, setRefreshingWallet] = useState(false);
  const [creatingSubWallets, setCreatingSubWallets] = useState(false);
  const [deletingWallet, setDeletingWallet] = useState(false);
  const [runReviewOpen, setRunReviewOpen] = useState(false);
  const [walletViewTab, setWalletViewTab] = useState("plan");
  const [runHistoryRefreshKey, setRunHistoryRefreshKey] = useState(0);
  const [reviewPreview, setReviewPreview] = useState<TemplateWalletSupportPreview | null>(null);
  const [preparingRun, setPreparingRun] = useState(false);

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === selectedTemplateId) ?? null,
    [selectedTemplateId, templates],
  );

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        const [walletResponse, templateResponse, optionsResponse] = await Promise.all([
          fetch(`${TEMPLATE_API_URL}/api/wallets/${walletId}/details`),
          fetch(`${TEMPLATE_API_URL}/api/templates`),
          fetch(`${TEMPLATE_API_URL}/api/templates/options`),
        ]);
        const [walletPayload, templatePayload, optionsPayload] = await Promise.all([
          walletResponse.json(),
          templateResponse.json(),
          optionsResponse.json(),
        ]);

        if (!walletResponse.ok) throw new Error(walletPayload.detail ?? "Failed to load wallet");
        if (!templateResponse.ok) throw new Error(templatePayload.detail ?? "Failed to load templates");
        if (!optionsResponse.ok) throw new Error(optionsPayload.detail ?? "Failed to load template options");

        if (active) {
          const nextTemplates = Array.isArray(templatePayload.templates) ? templatePayload.templates : [];
          setWallet(walletPayload);
          setTemplates(nextTemplates);
          setOptions(optionsPayload);
          setSelectedTemplateId((current) => current || nextTemplates[0]?.id || "");
          setLoadError(null);
          setTemplatesError(null);
        }
      } catch (error) {
        if (active) {
          const message = error instanceof Error ? error.message : "Failed to load wallet details";
          setLoadError(message);
          setTemplatesError(message);
        }
      } finally {
        if (active) {
          setLoadingWallet(false);
          setLoadingTemplates(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [walletId]);

  const contractCountValue = useMemo(() => Number.parseInt(contractCount, 10), [contractCount]);
  const contractCountError = useMemo(() => {
    if (!contractCount.trim()) return "Enter a contract count between 1 and 100";
    if (!Number.isFinite(contractCountValue) || contractCountValue < 1 || contractCountValue > 100) {
      return "Contract count must be between 1 and 100";
    }
    return null;
  }, [contractCount, contractCountValue]);

  const preview = useMemo<TemplateWalletSupportPreview | null>(() => {
    if (
      !wallet ||
      wallet.type === "sub" ||
      !selectedTemplate ||
      contractCountError ||
      wallet.eth_balance === null ||
      wallet.weth_balance === null
    ) {
      return null;
    }
    return buildTemplateWalletSupportPreview({
      wallet,
      template: selectedTemplate,
      contractCount: contractCountValue,
    });
  }, [wallet, selectedTemplate, contractCountError, contractCountValue]);

  useEffect(() => {
    setReviewPreview(null);
  }, [wallet?.id, selectedTemplateId, contractCount]);

  const walletBalanceStatusMessage = useMemo(() => {
    if (!wallet) return null;
    if (wallet.balances_live) {
      return wallet.balance_refreshed_at
        ? `Live balances refreshed ${formatRelativeTimestamp(wallet.balance_refreshed_at)}`
        : "Live balances fetched from the RPC.";
    }
    return wallet.balance_error ?? "Live wallet balances are unavailable.";
  }, [wallet]);

  const handleCopyAddress = async () => {
    if (!wallet?.address || !navigator.clipboard) return;
    await navigator.clipboard.writeText(wallet.address);
    toast({ title: "Address copied", description: wallet.address });
  };

  const handleRefreshWallet = async () => {
    setRefreshingWallet(true);
    try {
      const payload = await fetchWalletDetails();
      toast({
        title: "Balances refreshed",
        description: payload.balance_refreshed_at
          ? `Updated ${formatRelativeTimestamp(payload.balance_refreshed_at)}`
          : "Wallet balances were refreshed from the backend.",
      });
    } catch (error) {
      toast({
        title: "Refresh failed",
        description: error instanceof Error ? error.message : "Failed to refresh wallet balances",
        variant: "destructive",
      });
    } finally {
      setRefreshingWallet(false);
    }
  };

  const fetchWalletDetails = async () => {
    const response = await fetch(`${TEMPLATE_API_URL}/api/wallets/${walletId}/details`);
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.detail ?? "Failed to refresh wallet balances");
    setWallet(payload);
    return payload as WalletDetails;
  };

  const handleDeleteWallet = async () => {
    if (!wallet) return;
    if (!window.confirm(`Delete wallet ${wallet.address}?`)) {
      return;
    }

    setDeletingWallet(true);
    try {
      const response = await fetch(`${TEMPLATE_API_URL}/api/wallets/${wallet.id}`, {
        method: "DELETE",
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.detail ?? "Failed to delete wallet");
      toast({
        title: "Wallet deleted",
        description:
          payload.deleted_subwallet_count > 0
            ? `Deleted wallet and ${payload.deleted_subwallet_count} linked subwallet(s).`
            : "Deleted wallet.",
      });
      router.push("/");
    } catch (error) {
      toast({
        title: "Delete failed",
        description: error instanceof Error ? error.message : "Failed to delete wallet",
        variant: "destructive",
      });
    } finally {
      setDeletingWallet(false);
    }
  };

  const upsertTemplate = (template: Template) => {
    setTemplates((current) => [template, ...current.filter((item) => item.id !== template.id)]);
    setSelectedTemplateId(template.id);
  };

  const openCreate = () => {
    setEditingTemplate(null);
    setEditorOpen(true);
  };

  const openEdit = (event: MouseEvent<HTMLButtonElement>, template: Template) => {
    event.stopPropagation();
    setEditingTemplate(template);
    setEditorOpen(true);
  };

  const handleDelete = async (event: MouseEvent<HTMLButtonElement>, template: Template) => {
    event.stopPropagation();
    try {
      const response = await fetch(`${TEMPLATE_API_URL}/api/templates/${template.id}`, {
        method: "DELETE",
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.detail ?? "Failed to delete template");

      const nextTemplates = templates.filter((item) => item.id !== template.id);
      setTemplates(nextTemplates);
      if (selectedTemplateId === template.id) {
        setSelectedTemplateId(nextTemplates[0]?.id ?? "");
      }
      toast({ title: "Template deleted", description: "The template was removed from the active library." });
    } catch (deleteError) {
      toast({
        title: "Delete failed",
        description: deleteError instanceof Error ? deleteError.message : "Failed to delete template",
        variant: "destructive",
      });
    }
  };

  const handleProceed = async () => {
    if (!wallet || !selectedTemplate || !preview) {
      toast({
        title: "Preview required",
        description: "Pick a template and enter a contract count first so we can verify wallet support.",
        variant: "destructive",
      });
      return;
    }

    if (!preview.can_proceed) {
      toast({
        title: "Cannot create subwallets",
        description: preview.shortfall_reason ?? "This main wallet cannot support the selected template and contract count.",
        variant: "destructive",
      });
      return;
    }

    setPreparingRun(true);
    try {
      const response = await fetch(`${TEMPLATE_API_URL}/api/templates/preview`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          wallet_id: wallet.id,
          template_id: selectedTemplate.id,
          contract_count: contractCountValue,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.detail ?? "Failed to prepare run preview");
      }
      if (!payload.can_proceed) {
        throw new Error(payload.shortfall_reason ?? "This main wallet cannot support the selected template right now.");
      }
      setReviewPreview(payload);
      setRunReviewOpen(true);
    } catch (error) {
      toast({
        title: "Cannot create subwallets",
        description: error instanceof Error ? error.message : "Failed to prepare run preview",
        variant: "destructive",
      });
    } finally {
      setPreparingRun(false);
    }
  };

  const handleRun = async () => {
    const activePreview = reviewPreview ?? preview;
    if (!wallet || !selectedTemplate || !activePreview) {
      setRunReviewOpen(false);
      return;
    }

    setCreatingSubWallets(true);
    try {
      const response = await fetch(`${TEMPLATE_API_URL}/api/wallets/runs`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          main_id: wallet.id,
          template_id: selectedTemplate.id,
          count: activePreview.contract_count,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.detail ?? "Failed to execute run");
      }

      setRunReviewOpen(false);
      setWalletViewTab("runs");
      setRunHistoryRefreshKey((current) => current + 1);
      setReviewPreview(null);

      const runStatus = `${payload.status ?? ""}`.toLowerCase();
      toast({
        title:
          runStatus === "queued" || runStatus === "running"
            ? "Automation started"
            : runStatus === "completed"
              ? "Automation completed"
              : runStatus === "partial"
                ? "Automation partially completed"
                : runStatus === "failed"
                  ? "Automation failed"
                  : "Automation submitted",
        description:
          runStatus === "queued" || runStatus === "running"
            ? "Run history is now polling live progress, logs, and movement updates for this automation."
            : runStatus === "failed"
              ? "The run was saved to history, but the automation did not finish cleanly."
              : "The run was saved to history with its full funding, wrap, swap, and deployment log.",
        variant: runStatus === "failed" || runStatus === "partial" ? "destructive" : undefined,
      });
    } catch (error) {
      toast({
        title: "Run failed",
        description: error instanceof Error ? error.message : "Failed to execute run",
        variant: "destructive",
      });
    } finally {
      setCreatingSubWallets(false);
    }
  };

  const activeRunPreview = reviewPreview ?? preview;
  const selectedDistributorAutomation = selectedTemplate ? getDistributorAutomationSummary(selectedTemplate) : null;
  const previewBudgetRows = wallet && preview ? buildBudgetPreviewRows(wallet, preview) : [];
  const previewSwapRows = preview ? buildSwapPreviewRows(preview) : [];
  const previewGasRows = preview && selectedTemplate ? buildGasEstimateRows(preview, selectedTemplate) : [];
  const previewAutomationSteps = preview && selectedTemplate ? buildAutomationSteps(preview, selectedTemplate, wallet?.type ?? "main") : [];
  const reviewBudgetRows = wallet && activeRunPreview ? buildBudgetPreviewRows(wallet, activeRunPreview) : [];
  const reviewGasRows = activeRunPreview && selectedTemplate ? buildGasEstimateRows(activeRunPreview, selectedTemplate) : [];
  const reviewAutomationSteps =
    activeRunPreview && selectedTemplate ? buildAutomationSteps(activeRunPreview, selectedTemplate, wallet?.type ?? "main") : [];
  const reviewStablecoinRoutes = activeRunPreview?.stablecoin_routes ?? [];

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar
        activeSection={activeSection}
        onSectionChange={(section) => {
          setActiveSection(section);
          router.push("/");
        }}
        collapsed={sidebarCollapsed}
        onCollapsedChange={setSidebarCollapsed}
      />

      <div className={`flex min-h-screen flex-1 flex-col transition-all duration-300 ease-out ${sidebarCollapsed ? "ml-[72px]" : "ml-[260px]"}`}>
        <Header activeSection={activeSection} />

        <main className="flex-1 overflow-auto p-6">
          <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
            <Link href="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground transition hover:text-foreground">
              <ArrowLeft className="h-4 w-4" />
              Back to dashboard
            </Link>

            {loadingWallet ? (
              <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">Loading wallet details...</div>
            ) : loadError || !wallet ? (
              <div className="rounded-2xl border border-border bg-card p-6 text-sm text-destructive">{loadError ?? "Wallet not found."}</div>
            ) : (
              <>
                <SectionBlock
                  title="Main wallet"
                  description="Each selected contract creates one new subwallet. This page checks local funding first, then the review step confirms the funding plan before submission."
                >
                  <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                    <div className="flex min-w-0 items-start gap-4">
                      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-accent/10 text-accent">
                        <WalletCards className="h-6 w-6" />
                      </div>
                      <div className="min-w-0">
                        <p className="break-all font-mono text-base font-semibold text-foreground">{wallet.address}</p>
                        <p className="mt-1 break-all text-xs text-muted-foreground">Wallet ID {wallet.id}</p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <Button type="button" variant="outline" onClick={handleRefreshWallet} disabled={refreshingWallet}>
                        <RefreshCw className={`h-4 w-4 ${refreshingWallet ? "animate-spin" : ""}`} />
                        Refresh balances
                      </Button>
                      <Button type="button" variant="outline" onClick={handleCopyAddress}>
                        <Copy className="h-4 w-4" />
                        Copy address
                      </Button>
                      <Button type="button" variant="outline" onClick={handleDeleteWallet} disabled={deletingWallet}>
                        <Trash2 className="h-4 w-4" />
                        {deletingWallet ? "Deleting..." : "Delete wallet"}
                      </Button>
                    </div>
                  </div>

                  <div
                    className={`mt-5 rounded-xl border px-4 py-3 text-sm ${
                      wallet.balances_live
                        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700"
                        : "border-amber-500/30 bg-amber-500/10 text-amber-800"
                    }`}
                  >
                    {walletBalanceStatusMessage}
                  </div>

                  <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <InfoCard
                      label="Creation mode"
                      value={wallet.type === "imported_private_key" ? "Linked wallets from private key" : "Derived subwallets from seed"}
                      className="sm:col-span-2"
                      hint={
                        wallet.type === "imported_private_key"
                          ? "No seed phrase is required. Each new wallet is generated independently and linked to this imported wallet."
                          : "New wallets are derived deterministically from the main wallet seed."
                      }
                    />
                    <InfoCard
                      label="Wallet address"
                      value={wallet.address}
                      className="sm:col-span-2 xl:col-span-2"
                      valueClassName="break-all font-mono text-xs leading-5"
                    />
                    <InfoCard
                      label="Wallet ID"
                      value={wallet.id}
                      className="sm:col-span-2 xl:col-span-2"
                      valueClassName="break-all font-mono text-xs leading-5"
                    />
                    <InfoCard label="ETH balance" value={formatTokenBalance(wallet.eth_balance, "ETH")} />
                    <InfoCard label="WETH balance" value={formatTokenBalance(wallet.weth_balance, "WETH")} />
                  </div>
                </SectionBlock>

                {wallet.type === "sub" ? (
                  <SectionBlock
                    title="Subwallet details"
                    description="This page is read-only. Subwallets cannot create additional runs or fund child wallets."
                  >
                    <div className="grid gap-3 sm:grid-cols-2">
                      <InfoCard label="Wallet type" value="Subwallet" />
                      <InfoCard label="Parent wallet ID" value={wallet.parent_id ?? "Unavailable"} valueClassName="break-all font-mono text-xs leading-5" />
                    </div>
                    {wallet.parent_id ? (
                      <div className="mt-5">
                        <Button type="button" variant="outline" onClick={() => router.push(`/wallets/${wallet.parent_id}`)}>
                          Open parent wallet
                        </Button>
                      </div>
                    ) : null}
                  </SectionBlock>
                ) : (
                <Tabs value={walletViewTab} onValueChange={setWalletViewTab} className="space-y-5">
                  <TabsList className="grid w-full grid-cols-2 sm:w-[320px]">
                    <TabsTrigger value="plan">Plan run</TabsTrigger>
                    <TabsTrigger value="runs">Run history</TabsTrigger>
                  </TabsList>

                  <TabsContent value="plan" className="space-y-0">
                    <div className="grid gap-6 xl:grid-cols-[340px_minmax(0,1fr)]">
                  <SectionBlock
                    title="Template library"
                    description="Keep this side focused on selection. The full breakdown for the selected template appears on the right."
                  >
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <p className="text-sm text-muted-foreground">
                        {loadingTemplates ? "Loading..." : `${templates.length} active template${templates.length === 1 ? "" : "s"}`}
                      </p>
                      <Button type="button" onClick={openCreate}>
                        <PlusCircle className="h-4 w-4" />
                        Create
                      </Button>
                    </div>

                    {templatesError ? <p className="mb-4 text-sm text-destructive">{templatesError}</p> : null}

                    {loadingTemplates ? (
                      <div className="rounded-2xl border border-border/70 bg-secondary/20 p-4 text-sm text-muted-foreground">Loading templates...</div>
                    ) : templates.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-border bg-secondary/20 p-6 text-center text-sm text-muted-foreground">
                        No active v2 templates yet. Create one first, then return here to check wallet support.
                      </div>
                    ) : (
                      <div className="space-y-3 xl:max-h-[calc(100vh-260px)] xl:overflow-y-auto xl:pr-1">
                        {templates.map((template) => {
                          const active = template.id === selectedTemplateId;
                          return (
                            <div
                              key={template.id}
                              role="button"
                              tabIndex={0}
                              onClick={() => setSelectedTemplateId(template.id)}
                              onKeyDown={(event) => {
                                if (event.key === "Enter" || event.key === " ") {
                                  event.preventDefault();
                                  setSelectedTemplateId(template.id);
                                }
                              }}
                              className={`rounded-2xl border p-4 text-left transition ${
                                active ? "border-accent bg-accent/10 shadow-sm" : "border-border bg-background/70 hover:bg-secondary/20"
                              }`}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2">
                                    <p className="truncate text-base font-semibold text-foreground">{template.name}</p>
                                    {active ? <CheckCircle2 className="h-4 w-4 shrink-0 text-accent" /> : null}
                                  </div>
                                  <p className="mt-1 text-xs text-muted-foreground">{buildTemplateSummary(template)}</p>
                                  <p className="mt-1 text-xs text-muted-foreground">
                                    {`${formatAmount(template.slippage_percent)}% slippage`}
                                  </p>
                                </div>

                                <div className="flex items-center gap-2">
                                  <Button type="button" size="icon-sm" variant="outline" onClick={(event) => openEdit(event, template)}>
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                  <Button type="button" size="icon-sm" variant="outline" onClick={(event) => handleDelete(event, template)}>
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>

                              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                                <TemplateMetric label="Gas" value={`${formatAmount(template.gas_reserve_eth_per_contract)} ETH`} />
                                <TemplateMetric label="Swap" value={`${formatAmount(template.swap_budget_eth_per_contract)} ETH`} />
                                <TemplateMetric label="Direct ETH" value={`${formatAmount(template.direct_contract_eth_per_contract)} ETH`} />
                                <TemplateMetric label="Direct WETH" value={`${formatAmount(template.direct_contract_weth_per_contract)} WETH`} />
                              </div>

                              {template.notes ? (
                                <p className="mt-3 line-clamp-2 text-xs text-muted-foreground">{template.notes}</p>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </SectionBlock>

                  {selectedTemplate ? (
                    <div className="space-y-6">
                      <SectionBlock
                        title="Automation console"
                        description="Review the live budget, route sizing, and deployment path before launching the automation."
                      >
                        <div className="rounded-[28px] bg-slate-100/90 p-4 shadow-[0_30px_80px_-40px_rgba(15,23,42,0.45)] sm:p-5">
                          <div className="rounded-[24px] border border-slate-200/80 bg-white p-5 shadow-[0_24px_70px_-40px_rgba(15,23,42,0.35)] sm:p-6">
                            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                              <div className="max-w-2xl">
                                <div className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-3 py-1 text-xs font-medium uppercase tracking-[0.16em] text-white">
                                  <Rocket className="h-3.5 w-3.5" />
                                  Contract Auto Deploy
                                </div>
                                <h2 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950">Fund, wrap, swap, and deploy in one click</h2>
                                <p className="mt-2 text-sm leading-6 text-slate-600">
                                  The preview below uses your saved template and the main wallet&apos;s live balances. It shows the real automation budget, the funding path, and the contract management steps before submission.
                                </p>
                              </div>

                              <div className="grid gap-3 sm:min-w-[280px]">
                                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                                  <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">Template</p>
                                  <p className="mt-1 text-sm font-semibold text-slate-900">{selectedTemplate.name}</p>
                                  <p className="mt-1 text-xs text-slate-500">{buildTemplateSummary(selectedTemplate)}</p>
                                </div>
                                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                                  <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">Recipient</p>
                                  <p className="mt-1 break-all font-mono text-xs text-slate-700">{selectedTemplate.recipient_address ?? "Not set"}</p>
                                  {selectedDistributorAutomation ? (
                                    <p className="mt-2 text-xs text-slate-500">{selectedDistributorAutomation.description}</p>
                                  ) : null}
                                </div>
                              </div>
                            </div>

                            <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_320px]">
                              <div className="space-y-5">
                                <div className="rounded-2xl border border-slate-200 bg-white px-5 py-5 shadow-[0_18px_40px_-32px_rgba(15,23,42,0.4)]">
                                  <div className="flex items-center gap-3">
                                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
                                      <WalletCards className="h-5 w-5" />
                                    </div>
                                    <div>
                                      <p className="text-lg font-semibold text-slate-950">Budget Preview</p>
                                      <p className="text-sm text-slate-500">Real values from the selected template and the connected wallet.</p>
                                    </div>
                                  </div>

                                  <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2">
                                    {preview ? (
                                      previewBudgetRows.map((row) => <BudgetPreviewRow key={row.label} label={row.label} value={row.value} />)
                                    ) : (
                                      <div className="py-6 text-sm text-slate-500">
                                        Enter a valid sub-wallet count and make sure live balances are available to build the preview.
                                      </div>
                                    )}
                                  </div>
                                </div>

                                <div className="rounded-2xl border border-slate-200 bg-white px-5 py-5 shadow-[0_18px_40px_-32px_rgba(15,23,42,0.4)]">
                                  <div className="flex items-center gap-3">
                                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
                                      <Coins className="h-5 w-5" />
                                    </div>
                                    <div>
                                      <p className="text-lg font-semibold text-slate-950">Swaps per Wallet (ETH -&gt; local WETH -&gt; Token)</p>
                                      <p className="text-sm text-slate-500">Route sizing per wallet using the template allocation.</p>
                                    </div>
                                  </div>

                                  <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200">
                                    <div className="overflow-x-auto">
                                      <table className="min-w-full divide-y divide-slate-200 text-sm">
                                        <thead className="bg-slate-50">
                                          <tr>
                                            <th className="px-4 py-3 text-left font-medium text-slate-500">Token</th>
                                            <th className="px-4 py-3 text-left font-medium text-slate-500">Budget / wallet</th>
                                            <th className="px-4 py-3 text-left font-medium text-slate-500">Est. output / wallet</th>
                                            <th className="px-4 py-3 text-left font-medium text-slate-500">Gas / route</th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-200 bg-white">
                                          {previewSwapRows.length > 0 ? (
                                            previewSwapRows.map((row) => (
                                              <tr key={row.token}>
                                                <td className="px-4 py-3 font-semibold text-slate-900">{row.token}</td>
                                                <td className="px-4 py-3 text-slate-700">{row.budgetPerWallet}</td>
                                                <td className="px-4 py-3 text-slate-700">{row.estimatedOutput}</td>
                                                <td className="px-4 py-3 text-slate-700">{row.gasPerRoute}</td>
                                              </tr>
                                            ))
                                          ) : (
                                            <tr>
                                              <td colSpan={4} className="px-4 py-6 text-center text-sm text-slate-500">
                                                No stablecoin swap routes are configured. The run will keep the funding flow ETH-first and only deploy distributors if direct WETH funding is configured.
                                              </td>
                                            </tr>
                                          )}
                                        </tbody>
                                      </table>
                                    </div>
                                  </div>
                                </div>

                                <div className="rounded-2xl border border-slate-200 bg-white px-5 py-5 shadow-[0_18px_40px_-32px_rgba(15,23,42,0.4)]">
                                  <div className="flex items-center gap-3">
                                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
                                      <Fuel className="h-5 w-5" />
                                    </div>
                                    <div>
                                      <p className="text-lg font-semibold text-slate-950">Gas Estimates</p>
                                      <p className="text-sm text-slate-500">Funding, local wrap, swap, deploy, and distributor transfer costs for the selected wallet count.</p>
                                    </div>
                                  </div>

                                  <div className="mt-5 space-y-3">
                                    {preview ? (
                                      previewGasRows.map((row) => (
                                        <div key={row.label} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                                          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                                            <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">{row.label}</p>
                                            <p className="text-sm font-semibold text-slate-900">{row.value}</p>
                                          </div>
                                          <p className="mt-1 text-xs text-slate-500">{row.hint}</p>
                                        </div>
                                      ))
                                    ) : (
                                      <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                                        Gas estimates appear once the live preview is available.
                                      </div>
                                    )}
                                  </div>
                                </div>

                                {!wallet.balances_live ? (
                                  <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-800">
                                    {wallet.balance_error ?? "Live wallet balances are unavailable, so the support preview is paused."}
                                  </div>
                                ) : null}

                                {contractCountError ? (
                                  <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-700">
                                    {contractCountError}
                                  </div>
                                ) : null}

                                {preview ? (
                                  <div
                                    className={`rounded-2xl border px-4 py-4 text-sm ${
                                      preview.can_proceed ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-700"
                                    }`}
                                  >
                                    <div className="flex items-start gap-3">
                                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                                      <div>
                                        <p className="font-semibold">
                                          {preview.can_proceed
                                            ? "Budget looks good. The main wallet can support this automation run."
                                            : "Automation cannot proceed with the current balances."}
                                        </p>
                                        <p className="mt-1">
                                          {preview.can_proceed
                                            ? `Estimated remaining balance after run: ${formatCryptoMetric(preview.execution.remaining_eth_after_run, "ETH")}.`
                                            : preview.shortfall_reason ?? "Insufficient funds for this run size."}
                                        </p>
                                      </div>
                                    </div>
                                  </div>
                                ) : null}
                              </div>

                              <div className="space-y-5">
                                <div className="rounded-2xl border border-slate-200 bg-white px-5 py-5 shadow-[0_18px_40px_-32px_rgba(15,23,42,0.4)]">
                                  <p className="text-lg font-semibold text-slate-950">Run settings</p>
                                  <div className="mt-4 space-y-4">
                                    <div>
                                      <label htmlFor="contract-count" className="text-sm font-medium text-slate-900">
                                        Sub-wallet count
                                      </label>
                                      <Input
                                        id="contract-count"
                                        type="number"
                                        min={1}
                                        max={100}
                                        value={contractCount}
                                        onChange={(event) => setContractCount(event.target.value)}
                                        className="mt-2 border-slate-200 bg-slate-50"
                                      />
                                    </div>

                                    <div className="grid gap-3">
                                      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                                        <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">One-template budget</p>
                                        <p className="mt-1 text-sm font-semibold text-slate-900">
                                          {formatCryptoMetric(selectedTemplate.gas_reserve_eth_per_contract, "ETH")} gas reserve • {formatCryptoMetric(selectedTemplate.swap_budget_eth_per_contract, "ETH")} swap budget
                                        </p>
                                      </div>
                                      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                                        <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">Direct funding</p>
                                        <p className="mt-1 text-sm font-semibold text-slate-900">
                                          {formatCryptoMetric(selectedTemplate.direct_contract_eth_per_contract, "ETH")} ETH • {formatCryptoMetric(selectedTemplate.direct_contract_weth_per_contract, "WETH")} WETH
                                        </p>
                                      </div>
                                      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                                        <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">Protection</p>
                                        <p className="mt-1 text-sm font-semibold text-slate-900">
                                          {formatCryptoMetric(selectedTemplate.slippage_percent)}% slippage • {formatFeeTier(selectedTemplate.fee_tier)}
                                        </p>
                                      </div>
                                      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                                        <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">Local wrap</p>
                                        <p className="mt-1 text-sm font-semibold text-slate-900">
                                          {(toNumericValue(selectedTemplate.swap_budget_eth_per_contract) ?? 0) > 0 || (toNumericValue(selectedTemplate.direct_contract_weth_per_contract) ?? 0) > 0
                                            ? "Required by flow"
                                            : "Not needed"}
                                        </p>
                                      </div>
                                      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                                        <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">Distributor flow</p>
                                        <p className="mt-1 text-sm font-semibold text-slate-900">
                                          {selectedDistributorAutomation?.title ?? "Auto deploy disabled"}
                                        </p>
                                        {selectedDistributorAutomation ? (
                                          <p className="mt-1 text-xs text-slate-500">{selectedDistributorAutomation.description}</p>
                                        ) : null}
                                      </div>
                                    </div>
                                  </div>
                                </div>

                                <div className="rounded-2xl border border-slate-200 bg-white px-5 py-5 shadow-[0_18px_40px_-32px_rgba(15,23,42,0.4)]">
                                  <p className="text-lg font-semibold text-slate-950">Automation flow</p>
                                  <p className="mt-1 text-sm text-slate-500">Run history will log every movement in this order once the automation starts.</p>
                                  <div className="mt-4 space-y-3">
                                    {previewAutomationSteps.length > 0 ? (
                                      previewAutomationSteps.map((step, index) => <AutomationStepCard key={step.title} step={step} index={index} />)
                                    ) : (
                                      <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                                        The automation flow appears once the preview is available.
                                      </div>
                                    )}
                                  </div>
                                </div>

                                {selectedTemplate.notes ? (
                                  <div className="rounded-2xl border border-slate-200 bg-white px-5 py-5 text-sm leading-6 text-slate-600 shadow-[0_18px_40px_-32px_rgba(15,23,42,0.4)]">
                                    {selectedTemplate.notes}
                                  </div>
                                ) : null}
                              </div>
                            </div>

                            <div className="mt-6 flex flex-col gap-3 border-t border-slate-200 pt-5 sm:flex-row sm:items-center sm:justify-between">
                              <Button type="button" variant="outline" onClick={() => setSelectedTemplateId("")}>
                                Back
                              </Button>
                              <Button
                                type="button"
                                className="sm:min-w-[220px]"
                                onClick={handleProceed}
                                disabled={!preview?.can_proceed || creatingSubWallets || preparingRun}
                              >
                                <Rocket className="h-4 w-4" />
                                {creatingSubWallets ? "Running..." : preparingRun ? "Checking..." : "Run Automation"}
                              </Button>
                            </div>
                          </div>
                        </div>
                      </SectionBlock>

                      <TemplateMarketCheckPanel template={selectedTemplate} />
                    </div>
                  ) : (
                    <SectionBlock
                      title="Template details"
                      description="Select a template from the library to see its plan, routing split, and wallet support preview."
                    >
                      <div className="rounded-xl border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
                        Select a template to preview wallet support and per-route totals.
                      </div>
                    </SectionBlock>
                  )}
                    </div>
                  </TabsContent>

                  <TabsContent value="runs" className="space-y-0">
                    <WalletRunHistory
                      mainWalletId={wallet.id}
                      refreshKey={runHistoryRefreshKey}
                      title="Run history"
                      description="Each run creates a fresh batch of wallets, funds them with ETH, wraps locally, approves and swaps when configured, deploys distributor contracts, transfers tokens into them, and stores a detailed movement log here."
                      emptyMessage="No runs for this main wallet yet. Execute one from the Plan run tab and it will appear here."
                    />
                  </TabsContent>
                </Tabs>
                )}
              </>
            )}
          </div>
        </main>
      </div>

      <TemplateEditor
        open={editorOpen}
        onOpenChange={setEditorOpen}
        options={options}
        template={editingTemplate}
        onSaved={upsertTemplate}
      />

      <Dialog
        open={runReviewOpen}
        onOpenChange={(open) => {
          if (creatingSubWallets) return;
          setRunReviewOpen(open);
          if (!open) {
            setReviewPreview(null);
          }
        }}
      >
        <DialogContent className="flex max-h-[88vh] w-[calc(100vw-1.5rem)] flex-col overflow-hidden p-0 sm:max-w-5xl">
          <DialogHeader className="shrink-0 border-b border-border/70 px-4 pt-5 pb-4 sm:px-6 sm:pt-6">
            <DialogTitle>Automation review</DialogTitle>
            <DialogDescription>
              Confirm the budget and automation sequence before submitting the run.
            </DialogDescription>
          </DialogHeader>

          {wallet && selectedTemplate && activeRunPreview ? (
            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
              <div className="rounded-[28px] bg-slate-100/90 p-4 shadow-[0_30px_80px_-42px_rgba(15,23,42,0.45)]">
                <div className="rounded-[24px] border border-slate-200/80 bg-white p-5 shadow-[0_24px_70px_-40px_rgba(15,23,42,0.35)] sm:p-6">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div className="max-w-2xl">
                      <div className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-3 py-1 text-xs font-medium uppercase tracking-[0.16em] text-white">
                        <Rocket className="h-3.5 w-3.5" />
                        Contract Auto Deploy
                      </div>
                      <h3 className="mt-4 text-2xl font-semibold tracking-tight text-slate-950">Final automation check</h3>
                      <p className="mt-2 text-sm leading-6 text-slate-600">
                        This run will create {activeRunPreview.contract_count} sub-wallet{activeRunPreview.contract_count === 1 ? "" : "s"}, submit the funding transactions, and follow the automation sequence below for <span className="font-medium text-slate-900">{selectedTemplate.name}</span>.
                      </p>
                    </div>

                    <div className="grid gap-3 sm:min-w-[280px]">
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                        <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">Source wallet</p>
                        <p className="mt-1 text-sm font-semibold text-slate-900">{shortAddress(wallet.address)}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {wallet.type === "imported_private_key" ? "Linked wallets from private key" : "Derived wallets from seed"}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                        <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">Recipient</p>
                        <p className="mt-1 break-all font-mono text-xs text-slate-700">{selectedTemplate.recipient_address ?? "Not set"}</p>
                        {selectedDistributorAutomation ? (
                          <p className="mt-2 text-xs text-slate-500">{selectedDistributorAutomation.description}</p>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {creatingSubWallets ? (
                <div className="rounded-2xl border border-sky-200 bg-sky-50 px-5 py-5 shadow-[0_18px_40px_-32px_rgba(15,23,42,0.4)]">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-[0.18em] text-sky-700">Automation running</p>
                      <p className="mt-2 text-xl font-semibold text-slate-950">Running funding, wrap, swap, and deployment steps</p>
                      <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                        The backend is creating the wallet batch, funding each sub-wallet with ETH, wrapping locally, approving the router, swapping into the configured tokens, deploying ManagedTokenDistributor contracts, and saving each tx hash. Full movement logs appear in Run history as soon as the run record is saved.
                      </p>
                    </div>
                    <div className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-white px-3 py-1.5 text-sm font-medium text-sky-700">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      In progress
                    </div>
                  </div>

                  <div className="mt-5 h-2 overflow-hidden rounded-full bg-sky-100">
                    <div className="h-full w-2/3 animate-pulse rounded-full bg-sky-500" />
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-3">
                    <div className="rounded-2xl border border-sky-100 bg-white px-4 py-3">
                      <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">Step 1</p>
                      <p className="mt-1 text-sm font-semibold text-slate-900">Create {activeRunPreview.contract_count} sub-wallet{activeRunPreview.contract_count === 1 ? "" : "s"}</p>
                    </div>
                    <div className="rounded-2xl border border-sky-100 bg-white px-4 py-3">
                      <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">Step 2</p>
                      <p className="mt-1 text-sm font-semibold text-slate-900">Fund ETH and preserve gas locally</p>
                    </div>
                    <div className="rounded-2xl border border-sky-100 bg-white px-4 py-3">
                      <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">Step 3</p>
                      <p className="mt-1 text-sm font-semibold text-slate-900">
                        Local wrap, approve, swap, and deploy
                      </p>
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="grid gap-5 xl:grid-cols-[minmax(0,1.05fr)_320px]">
                <div className="space-y-5">
                  <div className="rounded-2xl border border-slate-200 bg-white px-5 py-5 shadow-[0_18px_40px_-32px_rgba(15,23,42,0.4)]">
                    <p className="text-lg font-semibold text-slate-950">Budget preview</p>
                    <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2">
                      {reviewBudgetRows.map((row) => (
                        <BudgetPreviewRow key={row.label} label={row.label} value={row.value} />
                      ))}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white px-5 py-5 shadow-[0_18px_40px_-32px_rgba(15,23,42,0.4)]">
                    <p className="text-lg font-semibold text-slate-950">Gas estimates</p>
                    <div className="mt-4 space-y-3">
                      {reviewGasRows.map((row) => (
                        <div key={row.label} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                            <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">{row.label}</p>
                            <p className="text-sm font-semibold text-slate-900">{row.value}</p>
                          </div>
                          <p className="mt-1 text-xs text-slate-500">{row.hint}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white px-5 py-5 shadow-[0_18px_40px_-32px_rgba(15,23,42,0.4)]">
                    <p className="text-lg font-semibold text-slate-950">Route summary</p>
                    {reviewStablecoinRoutes.length ? (
                      <div className="mt-4 grid gap-3 md:grid-cols-2">
                        {reviewStablecoinRoutes.map((route) => (
                          <div key={route.token_address} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                            <p className="text-sm font-semibold text-slate-900">{route.token_symbol}</p>
                            <p className="mt-1 text-xs text-slate-500">
                              {formatCryptoMetric(route.per_contract_weth_amount, "WETH")} per wallet
                              {route.percent ? ` • ${formatCryptoMetric(route.percent)}% allocation` : ""}
                            </p>
                            <p className="mt-2 text-sm text-slate-700">{formatCryptoMetric(route.total_weth_amount, "WETH")} total route size</p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-4 text-sm text-slate-500">No stablecoin routing is attached to this template. This run will stay ETH-first and only deploy a distributor if direct WETH funding is configured.</p>
                    )}
                  </div>
                </div>

                <div className="space-y-5">
                  <div className="rounded-2xl border border-slate-200 bg-white px-5 py-5 shadow-[0_18px_40px_-32px_rgba(15,23,42,0.4)]">
                    <p className="text-lg font-semibold text-slate-950">Automation flow</p>
                    <div className="mt-4 space-y-3">
                      {reviewAutomationSteps.map((step, index) => (
                        <AutomationStepCard key={step.title} step={step} index={index} />
                      ))}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white px-5 py-5 shadow-[0_18px_40px_-32px_rgba(15,23,42,0.4)]">
                    <p className="text-lg font-semibold text-slate-950">Key numbers</p>
                    <div className="mt-4 grid gap-3">
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                        <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">Wallets to create</p>
                        <p className="mt-1 text-sm font-semibold text-slate-900">{activeRunPreview.contract_count}</p>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                        <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">ETH deducted</p>
                        <p className="mt-1 text-sm font-semibold text-slate-900">{formatCryptoMetric(activeRunPreview.funding.total_eth_deducted, "ETH")}</p>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                        <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">Local WETH wrap</p>
                        <p className="mt-1 text-sm font-semibold text-slate-900">{formatCryptoMetric(activeRunPreview.funding.weth_from_wrapped_eth, "WETH")}</p>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                        <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">Estimated remaining ETH</p>
                        <p className="mt-1 text-sm font-semibold text-slate-900">{formatCryptoMetric(activeRunPreview.execution.remaining_eth_after_run, "ETH")}</p>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900">
                    Detailed logs are saved for wallet creation, ETH funding, local wrap steps, approvals, swaps, distributor transfers, and each ManagedTokenDistributor deployment in Run history.
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          <DialogFooter className="shrink-0 border-t border-border/70 px-4 py-4 sm:px-6">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setRunReviewOpen(false);
                setReviewPreview(null);
              }}
              disabled={creatingSubWallets}
            >
              Back
            </Button>
            <Button type="button" onClick={handleRun} disabled={creatingSubWallets}>
              <Rocket className="h-4 w-4" />
              {creatingSubWallets ? "Running..." : "Run Automation"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
