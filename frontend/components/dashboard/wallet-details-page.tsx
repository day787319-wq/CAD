"use client";

import Link from "next/link";
import { MouseEvent, ReactNode, useEffect, useMemo, useState } from "react";
import { ArrowLeft, CheckCircle2, Copy, Pencil, PlusCircle, RefreshCw, Trash2, WalletCards } from "lucide-react";
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

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border/50 py-2 last:border-b-0">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="max-w-[65%] break-words text-right text-sm font-medium text-foreground">{value}</p>
    </div>
  );
}

function ReviewStat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-border/70 bg-background px-4 py-3">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-semibold text-foreground">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
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

  const selectedTemplateDistribution = useMemo(
    () => (selectedTemplate ? getStablecoinDistributionRows(selectedTemplate) : []),
    [selectedTemplate],
  );

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

      await fetchWalletDetails();
      setRunReviewOpen(false);
      setWalletViewTab("runs");
      setRunHistoryRefreshKey((current) => current + 1);
      setReviewPreview(null);
      toast({
        title:
          payload.status === "partial"
            ? "Run partially submitted"
            : payload.status === "failed"
              ? "Run failed"
              : "Run submitted",
        description:
          payload.status === "failed"
            ? "The run was saved to history, but funding could not be submitted."
            : `Created ${payload.sub_wallets?.length ?? activePreview.contract_count} fresh wallet(s). Open Run history to inspect the batch.`,
        variant: payload.status === "failed" ? "destructive" : payload.status === "partial" ? "destructive" : undefined,
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

  const reviewStablecoinRoutes = (reviewPreview ?? preview)?.stablecoin_routes ?? [];

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
                  description="Each selected contract creates one new subwallet. This page checks whether the main wallet can fund all of them before anything is created."
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
                        title={selectedTemplate.name}
                        description="This is the selected one-contract template. Adjust the contract count below and the wallet support preview updates without calling any quote APIs."
                      >
                        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                          <InfoCard label="Gas reserve" value={`${formatAmount(selectedTemplate.gas_reserve_eth_per_contract)} ETH`} />
                          <InfoCard label="Swap budget" value={`${formatAmount(selectedTemplate.swap_budget_eth_per_contract)} ETH`} />
                          <InfoCard label="Direct ETH" value={`${formatAmount(selectedTemplate.direct_contract_eth_per_contract)} ETH`} />
                          <InfoCard label="Direct WETH" value={`${formatAmount(selectedTemplate.direct_contract_weth_per_contract)} WETH`} />
                          <InfoCard label="Slippage" value={`${formatAmount(selectedTemplate.slippage_percent)}%`} />
                          <InfoCard label="Fee tier" value={formatFeeTier(selectedTemplate.fee_tier)} />
                        </div>

                        <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(320px,0.7fr)]">
                          <div className="space-y-4">
                            <div className="rounded-xl border border-border/70 bg-secondary/10 p-4">
                              <p className="text-sm font-semibold text-foreground">Stablecoin routing</p>
                              <p className="mt-1 text-xs text-muted-foreground">
                                This shows the one-contract split saved in the template. Totals for the selected contract count are shown in the support preview below.
                              </p>

                              {selectedTemplateDistribution.length > 0 ? (
                                <div className="mt-3 space-y-3">
                                  {selectedTemplateDistribution.map((allocation) => (
                                    <div
                                      key={allocation.token_address}
                                      className="rounded-xl border border-border/70 bg-background/70 px-4 py-3"
                                    >
                                      <div className="min-w-0">
                                        <p className="text-sm font-semibold text-foreground">{allocation.token_symbol}</p>
                                        <p className="mt-1 font-mono text-[11px] text-muted-foreground">{shortAddress(allocation.token_address)}</p>
                                      </div>
                                      <div className="mt-3 grid gap-3 md:grid-cols-2">
                                        <InfoCard label="Share" value={`${formatAmount(allocation.percent)}%`} />
                                        <InfoCard
                                          label="WETH per contract"
                                          value={`${formatAmount(allocation.weth_amount_per_contract)} WETH`}
                                        />
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div className="mt-3 rounded-xl border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">
                                  No stablecoin swap route is included in this template.
                                </div>
                              )}
                            </div>

                            {selectedTemplate.notes ? (
                              <div className="rounded-xl border border-border/70 bg-background/70 px-4 py-3 text-sm text-muted-foreground">
                                {selectedTemplate.notes}
                              </div>
                            ) : null}
                          </div>

                          <div className="rounded-xl border border-border/70 bg-secondary/10 p-4">
                            <label htmlFor="contract-count" className="text-sm font-medium text-foreground">
                              Contracts / subwallets
                            </label>
                            <Input
                              id="contract-count"
                              type="number"
                              min={1}
                              max={100}
                              value={contractCount}
                              onChange={(event) => setContractCount(event.target.value)}
                              className="mt-2"
                            />
                            <p className="mt-2 text-xs text-muted-foreground">
                              This preview is now local math only. It should update immediately while you type.
                            </p>

                            {!wallet.balances_live ? (
                              <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-800">
                                {wallet.balance_error ?? "Live wallet balances are unavailable, so the support preview is paused."}
                              </div>
                            ) : null}

                            {contractCountError ? (
                              <div className="mt-4 rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                                {contractCountError}
                              </div>
                            ) : null}

                            {preview ? (
                              <div className="mt-4 space-y-3">
                                <div
                                  className={`rounded-xl border px-4 py-3 text-sm ${
                                    preview.can_proceed
                                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700"
                                      : "border-destructive/40 bg-destructive/5 text-destructive"
                                  }`}
                                >
                                  {preview.can_proceed
                                    ? `Main wallet can fund ${preview.contract_count} new subwallet${preview.contract_count === 1 ? "" : "s"} for this template.`
                                    : preview.shortfall_reason ?? "This wallet cannot support the selected template right now."}
                                </div>

                                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                                  <InfoCard label="New subwallets" value={`${preview.contract_count}`} />
                                  <InfoCard label="ETH sent from main" value={`${formatAmount(preview.funding.eth_sent_to_subwallets)} ETH`} />
                                  <InfoCard label="WETH sent from main" value={`${formatAmount(preview.funding.weth_sent_to_subwallets)} WETH`} />
                                  <InfoCard label="Total ETH deducted" value={`${formatAmount(preview.funding.total_eth_deducted)} ETH`} />
                                  <InfoCard label="Funding network fee" value={`${formatAmount(preview.execution.funding_network_fee_eth)} ETH`} />
                                  <InfoCard label="ETH wrapped into WETH" value={`${formatAmount(preview.funding.weth_from_wrapped_eth)} ETH`} />
                                  <InfoCard label="Main ETH after run" value={`${formatAmount(preview.execution.remaining_eth_after_run)} ETH`} />
                                </div>
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </SectionBlock>

                      {preview ? (
                        <div className="grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                          <SectionBlock
                            title="Main wallet funding plan"
                            description="Every selected contract becomes one new subwallet. These numbers show what leaves the main wallet and what remains after funding."
                          >
                            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                              <InfoCard label="Main wallet ETH now" value={`${formatAmount(preview.balances.available_eth)} ETH`} />
                              <InfoCard label="Main wallet WETH now" value={`${formatAmount(preview.balances.available_weth)} WETH`} />
                              <InfoCard
                                label="ETH sent to subwallets"
                                value={`${formatAmount(preview.funding.eth_sent_to_subwallets)} ETH`}
                                hint="Gas reserve plus direct ETH across all new subwallets"
                              />
                              <InfoCard
                                label="WETH sent to subwallets"
                                value={`${formatAmount(preview.funding.weth_sent_to_subwallets)} WETH`}
                                hint="Swap budget plus direct WETH across all new subwallets"
                              />
                              <InfoCard
                                label="Existing WETH used"
                                value={`${formatAmount(preview.funding.weth_from_main_wallet)} WETH`}
                                hint="Taken from the main wallet's current WETH balance"
                              />
                              <InfoCard
                                label="ETH wrapped into WETH"
                                value={`${formatAmount(preview.funding.weth_from_wrapped_eth)} ETH`}
                                hint="Additional ETH converted from the main wallet when auto-wrap is enabled"
                              />
                              <InfoCard
                                label="Main wallet ETH after funding"
                                value={`${formatAmount(preview.balances.remaining_eth_after_funding)} ETH`}
                                hint="Projected remaining ETH after funding the new subwallets"
                              />
                              <InfoCard
                                label="Funding network fee"
                                value={`${formatAmount(preview.execution.funding_network_fee_eth)} ETH`}
                                hint="Estimated ETH needed to broadcast wrap and funding transfers"
                              />
                              <InfoCard
                                label="Main wallet ETH after run"
                                value={`${formatAmount(preview.execution.remaining_eth_after_run)} ETH`}
                                hint="Projected remaining ETH after funding and network fees"
                              />
                              <InfoCard
                                label="Main wallet WETH after funding"
                                value={`${formatAmount(preview.balances.remaining_weth_after_funding)} WETH`}
                                hint="Projected remaining WETH after funding the new subwallets"
                              />
                            </div>

                            <div className="mt-5">
                              <p className="text-sm font-semibold text-foreground">Per new subwallet</p>
                              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                                <InfoCard label="Required ETH" value={`${formatAmount(preview.per_contract.required_eth)} ETH`} />
                                <InfoCard label="Required WETH" value={`${formatAmount(preview.per_contract.required_weth)} WETH`} />
                                <InfoCard label="Gas reserve" value={`${formatAmount(preview.per_contract.gas_reserve_eth)} ETH`} />
                                <InfoCard label="Swap budget" value={`${formatAmount(preview.per_contract.swap_budget_eth)} ETH`} />
                                <InfoCard label="Direct ETH" value={`${formatAmount(preview.per_contract.direct_contract_eth)} ETH`} />
                                <InfoCard label="Direct WETH" value={`${formatAmount(preview.per_contract.direct_contract_weth)} WETH`} />
                              </div>
                            </div>
                          </SectionBlock>

                          <SectionBlock
                            title="Selected count routing totals"
                            description="These are the stablecoin route amounts after multiplying the one-contract template by the selected count."
                          >
                            {preview.stablecoin_routes.length > 0 ? (
                              <div className="space-y-3">
                                {preview.stablecoin_routes.map((route) => (
                                  <div
                                    key={route.token_address}
                                    className="rounded-xl border border-border/70 bg-background/70 px-4 py-3"
                                  >
                                    <div className="min-w-0">
                                      <p className="text-sm font-semibold text-foreground">{route.token_symbol}</p>
                                      <p className="mt-1 font-mono text-[11px] text-muted-foreground">{shortAddress(route.token_address)}</p>
                                    </div>
                                    <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                                      <InfoCard label="Share" value={`${formatAmount(route.percent)}%`} />
                                      <InfoCard label="Per contract" value={`${formatAmount(route.per_contract_weth_amount)} WETH`} />
                                      <InfoCard label="Selected total" value={`${formatAmount(route.total_weth_amount)} WETH`} />
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="rounded-xl border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">
                                No stablecoin routing is needed for this template.
                              </div>
                            )}

                            <div className="mt-5 grid gap-3 sm:grid-cols-2">
                              <InfoCard label="Gas reserve total" value={`${formatAmount(preview.totals.gas_reserve_eth_total)} ETH`} />
                              <InfoCard label="Swap budget total" value={`${formatAmount(preview.totals.swap_budget_eth_total)} ETH`} />
                              <InfoCard label="Direct ETH total" value={`${formatAmount(preview.totals.direct_contract_eth_total)} ETH`} />
                              <InfoCard label="Direct WETH total" value={`${formatAmount(preview.totals.direct_contract_weth_total)} WETH`} />
                            </div>
                          </SectionBlock>
                        </div>
                      ) : null}

                      <TemplateMarketCheckPanel template={selectedTemplate} />

                      <Button
                        type="button"
                        className="w-full"
                        variant={preview?.can_proceed ? "default" : "destructive"}
                        onClick={handleProceed}
                        disabled={!preview?.can_proceed || creatingSubWallets || preparingRun}
                      >
                        {creatingSubWallets ? "Running..." : preparingRun ? "Checking..." : "Create wallets and run contracts"}
                      </Button>
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
                      description="Each run creates a fresh batch of wallets, submits the funding transactions, and keeps subwallet access available here."
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
        <DialogContent className="flex max-h-[85vh] w-[calc(100vw-1.5rem)] flex-col overflow-hidden p-0 sm:max-w-2xl">
          <DialogHeader className="shrink-0 border-b border-border/70 px-4 pt-5 pb-4 sm:px-6 sm:pt-6">
            <DialogTitle>Review run</DialogTitle>
            <DialogDescription>
              Confirm the final action before submitting.
            </DialogDescription>
          </DialogHeader>

          {wallet && selectedTemplate && (reviewPreview ?? preview) ? (
            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
              <div className="rounded-2xl border border-accent/20 bg-accent/5 px-4 py-4">
                <p className="text-sm font-semibold text-foreground">
                  This run will create {(reviewPreview ?? preview)?.contract_count} wallet{(reviewPreview ?? preview)?.contract_count === 1 ? "" : "s"} and submit the funding transactions for the <span className="font-mono">{selectedTemplate.name}</span> template.
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Source wallet: {shortAddress(wallet.address)} • Mode: {wallet.type === "imported_private_key" ? "linked wallets from private key" : "derived wallets from seed"}
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <ReviewStat label="Wallets to create" value={`${(reviewPreview ?? preview)?.contract_count ?? 0}`} />
                <ReviewStat label="ETH deducted" value={`${formatAmount((reviewPreview ?? preview)?.funding.total_eth_deducted)} ETH`} />
                <ReviewStat label="WETH sent" value={`${formatAmount((reviewPreview ?? preview)?.funding.weth_sent_to_subwallets)} WETH`} />
                <ReviewStat label="Main ETH after run" value={`${formatAmount((reviewPreview ?? preview)?.execution.remaining_eth_after_run)} ETH`} />
              </div>

              <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_240px]">
                <div className="rounded-2xl border border-border/70 bg-secondary/10 p-4">
                  <p className="text-sm font-semibold text-foreground">Execution summary</p>
                  <div className="mt-3">
                    <ReviewRow label="Template" value={selectedTemplate.name} />
                    <ReviewRow label="Per-wallet gas reserve" value={`${formatAmount((reviewPreview ?? preview)?.per_contract.gas_reserve_eth)} ETH`} />
                    <ReviewRow label="Per-wallet direct ETH" value={`${formatAmount((reviewPreview ?? preview)?.per_contract.direct_contract_eth)} ETH`} />
                    <ReviewRow label="Per-wallet swap budget" value={`${formatAmount((reviewPreview ?? preview)?.per_contract.swap_budget_eth)} ETH`} />
                    <ReviewRow label="Per-wallet direct WETH" value={`${formatAmount((reviewPreview ?? preview)?.per_contract.direct_contract_weth)} WETH`} />
                    <ReviewRow label="ETH sent from main" value={`${formatAmount((reviewPreview ?? preview)?.funding.eth_sent_to_subwallets)} ETH`} />
                    <ReviewRow label="WETH sent from main" value={`${formatAmount((reviewPreview ?? preview)?.funding.weth_sent_to_subwallets)} WETH`} />
                    <ReviewRow label="ETH wrapped into WETH" value={`${formatAmount((reviewPreview ?? preview)?.funding.weth_from_wrapped_eth)} ETH`} />
                    <ReviewRow label="Funding network fee" value={`${formatAmount((reviewPreview ?? preview)?.execution.funding_network_fee_eth)} ETH`} />
                    <ReviewRow label="Main WETH after run" value={`${formatAmount((reviewPreview ?? preview)?.balances.remaining_weth_after_funding)} WETH`} />
                  </div>
                </div>

                <div className="rounded-2xl border border-border/70 bg-secondary/10 p-4">
                  <p className="text-sm font-semibold text-foreground">Stablecoin routing</p>
                  {reviewStablecoinRoutes.length ? (
                    <div className="mt-3 space-y-3">
                      {reviewStablecoinRoutes.map((route) => (
                        <div key={route.token_address} className="rounded-xl border border-border/70 bg-background px-3 py-3">
                          <p className="text-sm font-semibold text-foreground">{route.token_symbol}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {formatAmount(route.total_weth_amount)} WETH total
                            {route.percent ? ` • ${formatAmount(route.percent)}%` : ""}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-3 text-sm text-muted-foreground">No stablecoin routing in this template.</p>
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-900">
                Running this flow now creates fresh wallets, stores them securely, and submits the funding transfers. Contract execution is still blocked until a real contract address and calldata are added to the template model.
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
              Cancel
            </Button>
            <Button type="button" onClick={handleRun} disabled={creatingSubWallets}>
              {creatingSubWallets ? "Running..." : "Run"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
