"use client";

import { FormEvent, ReactNode, useEffect, useMemo, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  TEMPLATE_API_URL,
  Template,
  TemplateEditorForm,
  TemplateOptions,
  defaultTemplateForm,
  formatAmount,
  getStablecoinDistributionRows,
  shortAddress,
  templateToForm,
} from "@/lib/template";


type TemplateEditorProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  options: TemplateOptions | null;
  template?: Template | null;
  onSaved: (template: Template) => void;
};

function splitMicroUnits(total: number, parts: number) {
  if (parts <= 0) return [];
  const safeTotal = Number.isFinite(total) ? total : 0;
  const totalUnits = Math.max(0, Math.round(safeTotal * 1_000_000));
  const base = Math.floor(totalUnits / parts);
  let remainder = totalUnits - base * parts;
  return Array.from({ length: parts }, () => {
    const next = base + (remainder > 0 ? 1 : 0);
    remainder = Math.max(0, remainder - 1);
    return (next / 1_000_000).toFixed(6);
  });
}

function SectionCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border/70 bg-secondary/10 p-4">
      <div className="mb-4">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      </div>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

export function TemplateEditor({ open, onOpenChange, options, template, onSaved }: TemplateEditorProps) {
  const { toast } = useToast();
  const [form, setForm] = useState<TemplateEditorForm>(defaultTemplateForm(options));
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const stablecoins = options?.stablecoins ?? [];
  const selectedStablecoinAddresses = useMemo(
    () => new Set(form.stablecoin_allocations.map((allocation) => allocation.token_address.toLowerCase())),
    [form.stablecoin_allocations],
  );
  const hasStablecoinSwap = form.stablecoin_distribution_mode !== "none";
  const needsWeth = Number(form.swap_budget_eth_per_contract || "0") > 0 || Number(form.direct_contract_weth_per_contract || "0") > 0;
  const totalEthIfNoWeth =
    Number(form.gas_reserve_eth_per_contract || "0") +
    Number(form.swap_budget_eth_per_contract || "0") +
    Number(form.direct_contract_eth_per_contract || "0") +
    Number(form.direct_contract_weth_per_contract || "0");

  useEffect(() => {
    if (!open) return;
    setSaveError(null);
    setForm(template ? templateToForm(template) : defaultTemplateForm(options));
  }, [open, template, options]);

  const selectedStablecoins = useMemo(
    () => stablecoins.filter((coin) => selectedStablecoinAddresses.has(coin.address.toLowerCase())),
    [selectedStablecoinAddresses, stablecoins],
  );
  const distributionPreviewRows = useMemo(
    () => getStablecoinDistributionRows(form),
    [form],
  );

  const toggleStablecoin = (tokenAddress: string, tokenSymbol: string) => {
    const normalized = tokenAddress.toLowerCase();
    setForm((current) => {
      const exists = current.stablecoin_allocations.some((allocation) => allocation.token_address.toLowerCase() === normalized);
      const stablecoin_allocations = exists
        ? current.stablecoin_allocations.filter((allocation) => allocation.token_address.toLowerCase() !== normalized)
        : [
            ...current.stablecoin_allocations,
            {
              token_address: tokenAddress,
              token_symbol: tokenSymbol,
              percent: null,
              weth_amount_per_contract: null,
            },
          ];
      return { ...current, stablecoin_allocations };
    });
  };

  const updateAllocation = (tokenAddress: string, field: "percent" | "weth_amount_per_contract", value: string) => {
    setForm((current) => ({
      ...current,
      stablecoin_allocations: current.stablecoin_allocations.map((allocation) =>
        allocation.token_address.toLowerCase() === tokenAddress.toLowerCase()
          ? { ...allocation, [field]: value }
          : allocation,
      ),
    }));
  };

  const distributeEqually = () => {
    if (selectedStablecoins.length === 0) return;

    if (form.stablecoin_distribution_mode === "manual_percent") {
      const values = splitMicroUnits(100, selectedStablecoins.length);
      setForm((current) => ({
        ...current,
        stablecoin_allocations: current.stablecoin_allocations.map((allocation, index) => ({
          ...allocation,
          percent: values[index],
        })),
      }));
      return;
    }

    if (form.stablecoin_distribution_mode === "manual_weth_amount") {
      const values = splitMicroUnits(Number(form.swap_budget_eth_per_contract || "0"), selectedStablecoins.length);
      setForm((current) => ({
        ...current,
        stablecoin_allocations: current.stablecoin_allocations.map((allocation, index) => ({
          ...allocation,
          weth_amount_per_contract: values[index],
        })),
      }));
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setSaveError(null);

    try {
      const payload = {
        name: form.name,
        template_version: "v2",
        recipient_address: form.recipient_address || null,
        gas_reserve_eth_per_contract: form.gas_reserve_eth_per_contract,
        swap_budget_eth_per_contract: form.swap_budget_eth_per_contract,
        direct_contract_eth_per_contract: form.direct_contract_eth_per_contract,
        direct_contract_weth_per_contract: form.direct_contract_weth_per_contract,
        slippage_percent: form.slippage_percent,
        fee_tier: form.fee_tier,
        auto_wrap_eth_to_weth: form.auto_wrap_eth_to_weth,
        stablecoin_distribution_mode: form.stablecoin_distribution_mode,
        stablecoin_allocations: form.stablecoin_allocations,
        notes: form.notes,
      };

      const response = await fetch(
        template ? `${TEMPLATE_API_URL}/api/templates/${template.id}` : `${TEMPLATE_API_URL}/api/templates`,
        {
          method: template ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.detail ?? "Failed to save template");

      onSaved(result);
      onOpenChange(false);
      toast({
        title: template ? "Template updated" : "Template saved",
        description: "This template now defines one contract / one subwallet.",
      });
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Failed to save template");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        onOpenChange(nextOpen);
        if (!nextOpen) setSaveError(null);
      }}
    >
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{template ? "Edit template" : "Create template"}</DialogTitle>
          <DialogDescription>
            {options?.hints.summary ?? "This template defines one contract / one subwallet."}
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-5" onSubmit={handleSubmit}>
          <SectionCard
            title="Basics"
            description="Set the identity and overall intent for one contract / one subwallet."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <label htmlFor="template-name" className="text-sm font-medium text-foreground">
                  Template name
                </label>
                <Input
                  id="template-name"
                  value={form.name}
                  placeholder="Example: Stablecoin distribution contract"
                  onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                  required
                />
              </div>

              <div className="space-y-2 sm:col-span-2">
                <label htmlFor="recipient-address" className="text-sm font-medium text-foreground">
                  Recipient address
                </label>
                <Input
                  id="recipient-address"
                  value={form.recipient_address}
                  placeholder="0x..."
                  onChange={(event) => setForm((current) => ({ ...current, recipient_address: event.target.value }))}
                />
                <p className="text-xs text-muted-foreground">
                  Required when stablecoin swaps or direct WETH funding should auto-deploy ManagedTokenDistributor from each sub-wallet.
                </p>
              </div>

              <div className="space-y-2 sm:col-span-2">
                <label htmlFor="template-notes" className="text-sm font-medium text-foreground">
                  Notes
                </label>
                <Textarea
                  id="template-notes"
                  value={form.notes}
                  placeholder="Optional notes about funding intent or distribution strategy."
                  onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
                />
              </div>
            </div>
          </SectionCard>

          <SectionCard
            title="ETH Budget"
            description="These values apply to one contract. The wallet flow multiplies them by the contract count later."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label htmlFor="gas-reserve" className="text-sm font-medium text-foreground">
                  Gas reserve ETH
                </label>
                <Input
                  id="gas-reserve"
                  type="number"
                  min="0"
                  step="0.0001"
                  value={form.gas_reserve_eth_per_contract}
                  onChange={(event) => setForm((current) => ({ ...current, gas_reserve_eth_per_contract: event.target.value }))}
                />
                <p className="text-xs text-muted-foreground">
                  Optional baseline. Preview will automatically add extra unwrapped ETH when local wrap, swap, deploy, or token-transfer gas needs more headroom.
                </p>
              </div>

              <div className="space-y-2">
                <label htmlFor="swap-budget" className="text-sm font-medium text-foreground">
                  Stablecoin swap budget
                </label>
                <Input
                  id="swap-budget"
                  type="number"
                  min="0"
                  step="0.0001"
                  value={form.swap_budget_eth_per_contract}
                  onChange={(event) => setForm((current) => ({ ...current, swap_budget_eth_per_contract: event.target.value }))}
                />
                <p className="text-xs text-muted-foreground">{options?.hints.swap_budget_note}</p>
              </div>
            </div>

            <label className="flex items-start gap-3 rounded-xl border border-border/70 bg-background/70 px-4 py-3">
              <input
                type="checkbox"
                checked={form.auto_wrap_eth_to_weth}
                onChange={(event) => setForm((current) => ({ ...current, auto_wrap_eth_to_weth: event.target.checked }))}
                className="mt-1 h-4 w-4 rounded border-border"
              />
              <span>
                <span className="block text-sm font-medium text-foreground">Use local sub-wallet wrapping when WETH is needed</span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  The safer production flow funds ETH first, keeps gas unwrapped, then wraps only the WETH budget inside each sub-wallet.
                </span>
              </span>
            </label>
          </SectionCard>

          <SectionCard
            title="Stablecoin Distribution"
            description="Pick one or many stablecoins for one contract, then decide how the swap budget is split across them."
          >
            <div className="flex flex-wrap gap-2">
              {options?.distribution_modes.map((mode) => (
                <Button
                  key={mode.value}
                  type="button"
                  variant={form.stablecoin_distribution_mode === mode.value ? "default" : "outline"}
                  onClick={() =>
                    setForm((current) => ({
                      ...current,
                      stablecoin_distribution_mode: mode.value,
                      stablecoin_allocations: mode.value === "none" ? [] : current.stablecoin_allocations,
                    }))
                  }
                >
                  {mode.label}
                </Button>
              ))}
            </div>

            {form.stablecoin_distribution_mode !== "none" ? (
              <>
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {stablecoins.map((coin) => {
                    const active = selectedStablecoinAddresses.has(coin.address.toLowerCase());
                    return (
                      <button
                        key={coin.address}
                        type="button"
                        onClick={() => toggleStablecoin(coin.address, coin.symbol)}
                        className={`rounded-xl border px-3 py-3 text-left transition ${
                          active ? "border-accent bg-accent/10" : "border-border bg-background/70 hover:bg-secondary/20"
                        }`}
                      >
                        <p className="text-sm font-semibold text-foreground">{coin.symbol}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{coin.name}</p>
                        <p className="mt-2 font-mono text-[11px] text-muted-foreground">{shortAddress(coin.address)}</p>
                        <p className="mt-2 text-[11px] text-muted-foreground">
                          {coin.official_source ? "Verified from official issuer docs" : "Ethereum mainnet stablecoin"}
                        </p>
                      </button>
                    );
                  })}
                </div>

                {(form.stablecoin_distribution_mode === "manual_percent" ||
                  form.stablecoin_distribution_mode === "manual_weth_amount") &&
                selectedStablecoins.length > 0 ? (
                  <div className="rounded-xl border border-border/70 bg-background/70 p-4">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-foreground">Manual distribution</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {form.stablecoin_distribution_mode === "manual_percent"
                            ? "Percentages must total exactly 100."
                            : "Exact WETH amounts must total the swap budget for one contract."}
                        </p>
                      </div>
                      <Button type="button" variant="outline" onClick={distributeEqually}>
                        <RefreshCw className="h-4 w-4" />
                        Auto distribute
                      </Button>
                    </div>

                    <div className="space-y-3">
                      {selectedStablecoins.map((coin) => {
                        const allocation = form.stablecoin_allocations.find((item) => item.token_address.toLowerCase() === coin.address.toLowerCase());
                        if (!allocation) return null;
                        return (
                          <div key={coin.address} className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_180px] sm:items-center">
                            <div>
                              <p className="text-sm font-semibold text-foreground">{coin.symbol}</p>
                              <p className="text-xs text-muted-foreground">{coin.name}</p>
                            </div>
                            <Input
                              type="number"
                              min="0"
                              step="0.000001"
                              value={
                                form.stablecoin_distribution_mode === "manual_percent"
                                  ? allocation.percent ?? ""
                                  : allocation.weth_amount_per_contract ?? ""
                              }
                              onChange={(event) =>
                                updateAllocation(
                                  coin.address,
                                  form.stablecoin_distribution_mode === "manual_percent"
                                    ? "percent"
                                    : "weth_amount_per_contract",
                                  event.target.value,
                                )
                              }
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : null}

                {distributionPreviewRows.length > 0 ? (
                  <div className="rounded-xl border border-border/70 bg-secondary/10 p-4">
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-foreground">
                          {form.stablecoin_distribution_mode === "equal" ? "Equal split preview" : "Per-contract distribution preview"}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          This is what one future subwallet would have allocated from the stablecoin swap budget before contract creation.
                        </p>
                      </div>
                      <p className="text-xs text-muted-foreground">{distributionPreviewRows.length} coin{distributionPreviewRows.length === 1 ? "" : "s"}</p>
                    </div>

                    <div className="space-y-3">
                      {distributionPreviewRows.map((allocation) => (
                        <div key={allocation.token_address} className="grid gap-2 rounded-xl border border-border/70 bg-background/70 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_140px_110px] sm:items-center">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-foreground">{allocation.token_symbol}</p>
                            <p className="mt-1 font-mono text-[11px] text-muted-foreground">{shortAddress(allocation.token_address)}</p>
                          </div>
                          <div>
                            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">WETH per contract</p>
                            <p className="mt-1 text-sm font-semibold text-foreground">
                              {formatAmount(allocation.weth_amount_per_contract)} WETH
                            </p>
                          </div>
                          <div>
                            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Share</p>
                            <p className="mt-1 text-sm font-semibold text-foreground">
                              {formatAmount(allocation.percent)}%
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </>
            ) : (
              <div className="rounded-xl border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">
                No stablecoin swap is included in this template.
              </div>
            )}
          </SectionCard>

          <SectionCard
            title="Swap Protection"
            description={options?.hints.swap_settings_note ?? "Set the slippage guardrail and optional Uniswap fee tier for this template."}
          >
            {hasStablecoinSwap ? (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <label htmlFor="slippage-percent" className="text-sm font-medium text-foreground">
                      Slippage tolerance
                    </label>
                    <Input
                      id="slippage-percent"
                      type="number"
                      min="0"
                      max="100"
                      step="0.1"
                      value={form.slippage_percent}
                      onChange={(event) => setForm((current) => ({ ...current, slippage_percent: event.target.value }))}
                    />
                    <p className="text-xs text-muted-foreground">
                      Used to calculate the minimum received amount for each stablecoin route.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <p className="text-sm font-medium text-foreground">Uniswap fee tier</p>
                    <div className="flex flex-wrap gap-2">
                      {options?.fee_tiers.map((option) => (
                        <Button
                          key={option.label}
                          type="button"
                          variant={form.fee_tier === option.value ? "default" : "outline"}
                          onClick={() => setForm((current) => ({ ...current, fee_tier: option.value }))}
                        >
                          {option.label}
                        </Button>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Leave this on auto unless you know you want to force a specific V3 pool fee.
                    </p>
                  </div>
                </div>
              </>
            ) : (
              <div className="rounded-xl border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">
                Swap protection becomes active when this template includes a stablecoin swap route.
              </div>
            )}
          </SectionCard>

          <SectionCard
            title="Direct Contract Funding"
            description="Set the exact ETH and optional WETH that each future subwallet should place into the contract."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label htmlFor="direct-eth" className="text-sm font-medium text-foreground">
                  Direct ETH kept in sub-wallet
                </label>
                <Input
                  id="direct-eth"
                  type="number"
                  min="0"
                  step="0.0001"
                  value={form.direct_contract_eth_per_contract}
                  onChange={(event) => setForm((current) => ({ ...current, direct_contract_eth_per_contract: event.target.value }))}
                />
                <p className="text-xs text-muted-foreground">
                  This ETH stays unwrapped in the sub-wallet after funding. Use it for gas headroom or any ETH-side action in the run.
                </p>
              </div>

              <div className="space-y-2">
                <label htmlFor="direct-weth" className="text-sm font-medium text-foreground">
                  Direct WETH distributor funding
                </label>
                <Input
                  id="direct-weth"
                  type="number"
                  min="0"
                  step="0.0001"
                  value={form.direct_contract_weth_per_contract}
                  onChange={(event) => setForm((current) => ({ ...current, direct_contract_weth_per_contract: event.target.value }))}
                />
                <p className="text-xs text-muted-foreground">
                  Optional. The sub-wallet wraps this amount locally after funding, then transfers it into a deployed ManagedTokenDistributor.
                </p>
              </div>
            </div>
          </SectionCard>

          <SectionCard
            title="Review"
            description="This summary is per contract. The wallet flow will multiply these numbers by the selected contract count."
          >
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
              <div className="rounded-xl border border-border/70 bg-background/70 px-4 py-3">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Gas reserve</p>
                <p className="mt-1 text-sm font-semibold text-foreground">{formatAmount(form.gas_reserve_eth_per_contract)} ETH</p>
              </div>
              <div className="rounded-xl border border-border/70 bg-background/70 px-4 py-3">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Swap budget</p>
                <p className="mt-1 text-sm font-semibold text-foreground">{formatAmount(form.swap_budget_eth_per_contract)} ETH</p>
              </div>
              <div className="rounded-xl border border-border/70 bg-background/70 px-4 py-3">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Direct ETH</p>
                <p className="mt-1 text-sm font-semibold text-foreground">{formatAmount(form.direct_contract_eth_per_contract)} ETH</p>
              </div>
              <div className="rounded-xl border border-border/70 bg-background/70 px-4 py-3">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Direct WETH</p>
                <p className="mt-1 text-sm font-semibold text-foreground">{formatAmount(form.direct_contract_weth_per_contract)} WETH</p>
              </div>
              <div className="rounded-xl border border-border/70 bg-background/70 px-4 py-3">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Slippage</p>
                <p className="mt-1 text-sm font-semibold text-foreground">{formatAmount(form.slippage_percent)}%</p>
              </div>
              <div className="rounded-xl border border-accent/40 bg-accent/10 px-4 py-3">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">If starting with only ETH</p>
                <p className="mt-1 text-sm font-semibold text-foreground">{formatAmount(totalEthIfNoWeth)} ETH</p>
              </div>
            </div>

            <div className="rounded-xl border border-border/70 bg-background/70 px-4 py-3 text-sm text-muted-foreground">
              {needsWeth
                ? "This template needs WETH. The run will fund ETH first, leave gas unwrapped, and wrap only the required WETH budget inside each sub-wallet."
                : "This template does not require WETH unless you add swap budget or direct WETH funding."}
            </div>

            <div className="rounded-xl border border-border/70 bg-background/70 px-4 py-3 text-sm text-muted-foreground">
              Fee tier: {options?.fee_tiers.find((option) => option.value === form.fee_tier)?.label ?? "Auto best route"}
            </div>

            <div className="rounded-xl border border-border/70 bg-background/70 px-4 py-3 text-sm text-muted-foreground">
              Recipient: {form.recipient_address || "Not set"}
            </div>

            <div className="rounded-xl border border-border/70 bg-secondary/10 px-4 py-3 text-sm text-muted-foreground">
              We will later compare these per-template ETH requirements against the selected main wallet before any subwallets are created. WETH is produced locally inside each sub-wallet when the flow needs it.
            </div>
          </SectionCard>

          {saveError ? <p className="text-sm text-destructive">{saveError}</p> : null}

          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving || !options}>
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : template ? (
                "Save changes"
              ) : (
                "Save template"
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
