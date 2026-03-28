"use client";

import { FormEvent, ReactNode, useEffect, useMemo, useState } from "react";
import { ChevronDown, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useI18n } from "@/components/i18n-provider";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { readApiPayload } from "@/lib/api";
import {
  TEMPLATE_API_URL,
  Template,
  TemplateChain,
  getTemplateChainCaveats,
  TemplateEditorForm,
  TemplateOptions,
  TemplatePriceSnapshot,
  StablecoinOption,
  defaultTemplateForm,
  formatAmount,
  formatRelativeTimestamp,
  formatSwapBackendLabel,
  formatUsd,
  getStablecoinDistributionRows,
  getTemplateSwapSourceUi,
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
    <div className="cad-panel px-5 py-5 sm:px-6 sm:py-6">
      <div className="mb-5">
        <p className="text-sm font-semibold tracking-[0.01em] text-foreground">{title}</p>
        <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">{description}</p>
      </div>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

const MARKET_REFRESH_INTERVAL_MS = 60_000;

function toFiniteNumber(value: string | number | null | undefined) {
  const numeric = typeof value === "number" ? value : Number.parseFloat(value ?? "");
  return Number.isFinite(numeric) ? numeric : null;
}

function toAmountString(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "0";
  const normalized = Number(value.toFixed(6));
  return normalized === 0 ? "0" : `${normalized}`;
}

function getUsdValue(amount: string | number | null | undefined, priceValue: string | null | undefined) {
  const numericAmount = toFiniteNumber(amount);
  const numericPrice = toFiniteNumber(priceValue);
  if (numericAmount === null || numericPrice === null) return null;
  return `${numericAmount * numericPrice}`;
}

function LiveValueHint({
  label,
  value,
}: {
  label: string;
  value: string | null;
}) {
  if (value === null) return null;
  return <p className="text-xs font-medium text-sky-700">{label}: {formatUsd(value)}</p>;
}

function NoRouteBadge() {
  return (
    <span className="inline-flex rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-rose-700 ring-1 ring-rose-200">
      No route found
    </span>
  );
}

export function TemplateEditor({ open, onOpenChange, options, template, onSaved }: TemplateEditorProps) {
  const { toast } = useToast();
  const { locale } = useI18n();
  const [form, setForm] = useState<TemplateEditorForm>(defaultTemplateForm(options));
  const [editorOptions, setEditorOptions] = useState<TemplateOptions | null>(options);
  const [manualTokenAddress, setManualTokenAddress] = useState("");
  const [resolvingManualToken, setResolvingManualToken] = useState(false);
  const [checkingListTokenAddress, setCheckingListTokenAddress] = useState<string | null>(null);
  const [tokenPickerOpen, setTokenPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [marketSnapshot, setMarketSnapshot] = useState<TemplatePriceSnapshot | null>(null);
  const [marketError, setMarketError] = useState<string | null>(null);
  const [tokenRouteStatusByAddress, setTokenRouteStatusByAddress] = useState<
    Record<string, Pick<StablecoinOption, "tested" | "route_status" | "route_error">>
  >({});

  const currentOptions = editorOptions ?? options;
  const stablecoins = useMemo(() => currentOptions?.stablecoins ?? [], [currentOptions]);
  const chainOptions = currentOptions?.available_chains ?? options?.available_chains ?? [];
  const selectedChainValue = currentOptions?.selected_chain ?? options?.selected_chain ?? ("ethereum_mainnet" as TemplateChain);
  const currentChain =
    chainOptions.find((option) => option.value === form.chain) ??
    chainOptions.find((option) => option.value === selectedChainValue) ??
    options?.available_chains?.[0] ??
    {
      value: "ethereum_mainnet" as TemplateChain,
      label: "Ethereum mainnet",
      native_symbol: "ETH",
      wrapped_native_symbol: "WETH",
      quote_supported: true,
      primary_swap_backend: "uniswap_v3",
      primary_swap_backend_label: "Uniswap V3",
      fallback_swap_backends: [],
      fallback_swap_backend_labels: [],
    };
  const nativeSymbol = currentOptions?.native_symbol ?? currentChain.native_symbol;
  const wrappedNativeSymbol = currentOptions?.wrapped_native_symbol ?? currentChain.wrapped_native_symbol;
  const swapSource = getTemplateSwapSourceUi({
    chain: form.chain,
    swap_source_mode: form.swap_source_mode,
    swap_source_token_symbol: form.swap_source_token_symbol,
    swap_source_token_address: form.swap_source_token_address,
    runtimeSwapSource: currentOptions?.swap_source ?? null,
  });
  const swapSourceMode = form.swap_source_mode;
  const swapSourceTokenOptions = currentOptions?.swap_source_token_options ?? [];
  const swapSourceRecommendation = currentOptions?.swap_source_recommendation ?? null;
  const swapBudgetAssetSymbol = swapSource.sourceTokenSymbol ?? wrappedNativeSymbol;
  const primaryBackendLabel =
    currentOptions?.primary_swap_backend_label ??
    currentChain.primary_swap_backend_label ??
    formatSwapBackendLabel(currentOptions?.primary_swap_backend ?? currentChain.primary_swap_backend);
  const fallbackBackendLabels =
    currentOptions?.fallback_swap_backend_labels ??
    currentChain.fallback_swap_backend_labels ??
    [];
  const chainCaveats = getTemplateChainCaveats(form.chain);
  const selectedStablecoinAddresses = useMemo(
    () => new Set(form.stablecoin_allocations.map((allocation) => allocation.token_address.toLowerCase())),
    [form.stablecoin_allocations],
  );
  const hasStablecoinSwap = form.stablecoin_distribution_mode !== "none";
  const topUpEnabled = form.auto_top_up_enabled;
  const topUpThresholdValue = toFiniteNumber(form.auto_top_up_threshold_eth) ?? 0;
  const topUpTargetValue = toFiniteNumber(form.auto_top_up_target_eth) ?? 0;
  const topUpHasSingleValue = topUpEnabled && topUpThresholdValue === topUpTargetValue;
  const topUpTargetMustExceedThreshold = form.chain !== "bnb";
  const topUpThresholdRuleViolated =
    topUpEnabled &&
    (topUpTargetMustExceedThreshold
      ? topUpTargetValue <= topUpThresholdValue
      : topUpTargetValue < topUpThresholdValue);
  const directContractNativeValue = toFiniteNumber(form.direct_contract_native_eth_per_contract) ?? 0;
  const directContractWrappedValue = toFiniteNumber(form.direct_contract_weth_per_contract) ?? 0;

  const loadChainOptions = async (
    chain: TemplateChain,
    sourceOverrides?: {
      swap_source_mode?: string;
      swap_source_token_symbol?: string;
      swap_source_token_address?: string;
    },
  ) => {
    const params = new URLSearchParams({ chain });
    if (sourceOverrides?.swap_source_mode) params.set("swap_source_mode", sourceOverrides.swap_source_mode);
    if (sourceOverrides?.swap_source_token_symbol) params.set("swap_source_token_symbol", sourceOverrides.swap_source_token_symbol);
    if (sourceOverrides?.swap_source_token_address) params.set("swap_source_token_address", sourceOverrides.swap_source_token_address);
    const response = await fetch(`${TEMPLATE_API_URL}/api/templates/options?${params.toString()}`, {
      cache: "no-store",
    });
    const payload = await readApiPayload(response);
    if (!response.ok) throw new Error((payload as { detail?: string } | null)?.detail ?? "Failed to load template options");
    setEditorOptions(payload as TemplateOptions);
    return payload as TemplateOptions;
  };

  useEffect(() => {
    if (!open) return;

    let active = true;
    setSaveError(null);
    setManualTokenAddress("");
    setCheckingListTokenAddress(null);
    setTokenPickerOpen(false);
    setTokenRouteStatusByAddress({});
    const nextForm = template ? templateToForm(template) : defaultTemplateForm(options);
    setForm(nextForm);
    setEditorOptions(options);

    void (async () => {
      try {
        const nextOptions = await loadChainOptions(nextForm.chain, {
          swap_source_mode: nextForm.swap_source_mode,
          swap_source_token_symbol: nextForm.swap_source_token_symbol,
          swap_source_token_address: nextForm.swap_source_token_address,
        });
        if (!active) return;
        setEditorOptions(nextOptions);
      } catch (error) {
        if (!active) return;
        setSaveError(error instanceof Error ? error.message : "Failed to load template options");
      }
    })();

    return () => {
      active = false;
    };
  }, [open, template, options]);

  const selectedCustomStablecoins = useMemo(
    () =>
      form.stablecoin_allocations
        .filter((allocation) => !stablecoins.some((coin) => coin.address.toLowerCase() === allocation.token_address.toLowerCase()))
        .map((allocation) => ({
          symbol: allocation.token_symbol,
          name: allocation.token_symbol,
          address: allocation.token_address,
          decimals: null,
          official_source: null,
          tested: undefined,
          route_status: allocation.route_status ?? null,
          route_error: allocation.route_error ?? null,
          is_custom: true,
        })),
    [form.stablecoin_allocations, stablecoins],
  );
  const displayStablecoins = useMemo(() => {
    const merged = [...stablecoins];
    const seen = new Set(merged.map((coin) => coin.address.toLowerCase()));

    for (const coin of selectedCustomStablecoins) {
      const normalized = coin.address.toLowerCase();
      if (seen.has(normalized)) continue;
      seen.add(normalized);
      merged.push(coin);
    }

    return merged.map((coin) => {
      const normalizedAddress = coin.address.toLowerCase();
      const allocation = form.stablecoin_allocations.find((item) => item.token_address.toLowerCase() === normalizedAddress);
      return {
        ...coin,
        ...(allocation
          ? {
              route_status: allocation.route_status ?? null,
              route_error: allocation.route_error ?? null,
            }
          : {}),
        ...(tokenRouteStatusByAddress[normalizedAddress] ?? {}),
      };
    });
  }, [form.stablecoin_allocations, selectedCustomStablecoins, stablecoins, tokenRouteStatusByAddress]);

  const selectedStablecoins = useMemo(
    () => displayStablecoins.filter((coin) => selectedStablecoinAddresses.has(coin.address.toLowerCase())),
    [displayStablecoins, selectedStablecoinAddresses],
  );
  const manualExactSwapBudgetValue = useMemo(
    () => form.stablecoin_allocations.reduce((sum, allocation) => sum + (toFiniteNumber(allocation.weth_amount_per_contract) ?? 0), 0),
    [form.stablecoin_allocations],
  );
  const effectiveSwapBudgetString =
    form.stablecoin_distribution_mode === "manual_weth_amount"
      ? toAmountString(manualExactSwapBudgetValue)
      : form.swap_budget_eth_per_contract;
  const distributionPreviewRows = useMemo(
    () => getStablecoinDistributionRows({ ...form, swap_budget_eth_per_contract: effectiveSwapBudgetString }),
    [effectiveSwapBudgetString, form],
  );
  const sourceTokenSpotUsd = useMemo(() => {
    if (!marketSnapshot) return null;
    const sourceAddress = swapSource.sourceTokenAddress?.toLowerCase();
    if (!sourceAddress) {
      return swapSource.mode === "native" || swapSource.mode === "wrapped_native" ? marketSnapshot.weth_usd : null;
    }
    if (sourceAddress === currentOptions?.swap_source?.source_token_address?.toLowerCase() && currentOptions?.swap_source?.mode !== "stablecoin") {
      return marketSnapshot.weth_usd;
    }
    if (sourceAddress === form.swap_source_token_address.toLowerCase() && swapSource.mode !== "stablecoin") {
      return marketSnapshot.weth_usd;
    }
    return marketSnapshot.token_prices?.[sourceAddress] ?? (
      swapSource.mode === "native" || swapSource.mode === "wrapped_native" ? marketSnapshot.weth_usd : null
    );
  }, [
    currentOptions?.swap_source?.mode,
    currentOptions?.swap_source?.source_token_address,
    form.swap_source_token_address,
    marketSnapshot,
    swapSource.mode,
    swapSource.sourceTokenAddress,
  ]);
  const ethUsdLabel = useMemo(
    () => getUsdValue(form.gas_reserve_eth_per_contract, marketSnapshot?.eth_usd),
    [form.gas_reserve_eth_per_contract, marketSnapshot?.eth_usd],
  );
  const swapBudgetUsdLabel = useMemo(
    () => getUsdValue(effectiveSwapBudgetString, sourceTokenSpotUsd),
    [effectiveSwapBudgetString, sourceTokenSpotUsd],
  );
  const swapBudgetValue = toFiniteNumber(effectiveSwapBudgetString) ?? 0;
  const fundedTreasuryEnabled =
    (hasStablecoinSwap && swapBudgetValue > 0) ||
    directContractNativeValue > 0 ||
    directContractWrappedValue > 0;
  const manualDistributionAssignedValue = useMemo(() => {
    if (form.stablecoin_distribution_mode === "manual_weth_amount") {
      return manualExactSwapBudgetValue;
    }
    if (form.stablecoin_distribution_mode === "manual_percent") {
      const percentTotal = form.stablecoin_allocations.reduce((sum, allocation) => sum + (toFiniteNumber(allocation.percent) ?? 0), 0);
      return (swapBudgetValue * percentTotal) / 100;
    }
    return 0;
  }, [form.stablecoin_allocations, form.stablecoin_distribution_mode, manualExactSwapBudgetValue, swapBudgetValue]);
  const manualDistributionAssignedUsdLabel = useMemo(
    () => getUsdValue(manualDistributionAssignedValue, sourceTokenSpotUsd),
    [manualDistributionAssignedValue, sourceTokenSpotUsd],
  );
  const manualDistributionDeltaValue = swapBudgetValue - manualDistributionAssignedValue;
  const manualDistributionRemainingValue = Math.max(manualDistributionDeltaValue, 0);
  const manualDistributionOverValue = Math.max(-manualDistributionDeltaValue, 0);
  const manualDistributionHasBudget = swapBudgetValue > 0.0000005;
  const manualDistributionOverBudget = manualDistributionOverValue > 0.0000005;
  const manualDistributionHasRemaining = !manualDistributionOverBudget && manualDistributionRemainingValue > 0.0000005;
  const manualDistributionRemainingUsdLabel = useMemo(
    () => getUsdValue(manualDistributionRemainingValue, sourceTokenSpotUsd),
    [manualDistributionRemainingValue, sourceTokenSpotUsd],
  );
  const manualDistributionOverUsdLabel = useMemo(
    () => getUsdValue(manualDistributionOverValue, sourceTokenSpotUsd),
    [manualDistributionOverValue, sourceTokenSpotUsd],
  );
  const directContractNativeEthUsdLabel = useMemo(
    () => getUsdValue(form.direct_contract_native_eth_per_contract, marketSnapshot?.eth_usd),
    [form.direct_contract_native_eth_per_contract, marketSnapshot?.eth_usd],
  );
  const directWethUsdLabel = useMemo(
    () => getUsdValue(form.direct_contract_weth_per_contract, marketSnapshot?.weth_usd),
    [form.direct_contract_weth_per_contract, marketSnapshot?.weth_usd],
  );
  const topUpThresholdUsdLabel = useMemo(
    () => getUsdValue(form.auto_top_up_threshold_eth, marketSnapshot?.eth_usd),
    [form.auto_top_up_threshold_eth, marketSnapshot?.eth_usd],
  );
  const topUpTargetUsdLabel = useMemo(
    () => getUsdValue(form.auto_top_up_target_eth, marketSnapshot?.eth_usd),
    [form.auto_top_up_target_eth, marketSnapshot?.eth_usd],
  );
  useEffect(() => {
    if (!open) return;

    let active = true;

    const loadChainMarketSnapshot = async () => {
      try {
        const response = await fetch(`${TEMPLATE_API_URL}/api/templates/market-snapshot?chain=${encodeURIComponent(form.chain)}`, {
          cache: "no-store",
        });
        const payload = await readApiPayload(response);
        if (!response.ok) throw new Error((payload as { detail?: string } | null)?.detail ?? "Failed to load live market snapshot");
        if (!active) return;
        setMarketSnapshot(payload as TemplatePriceSnapshot);
        setMarketError((payload as TemplatePriceSnapshot).error ?? null);
      } catch (loadError) {
        if (!active) return;
        setMarketError(loadError instanceof Error ? loadError.message : "Failed to load live market snapshot");
      }
    };

    void loadChainMarketSnapshot();
    const intervalId = window.setInterval(() => {
      if (!document.hidden) {
        void loadChainMarketSnapshot();
      }
    }, MARKET_REFRESH_INTERVAL_MS);

    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, [open, form.chain]);

  const handleChainChange = async (nextChain: TemplateChain) => {
    if (template || nextChain === form.chain) return;

    try {
      const nextOptions = await loadChainOptions(nextChain, {
        swap_source_mode: form.swap_source_mode,
        swap_source_token_symbol: form.swap_source_token_symbol,
        swap_source_token_address: form.swap_source_token_address,
      });
      setSaveError(null);
      setForm((current) => ({
        ...current,
        chain: nextChain,
        fee_tier: nextOptions.defaults.fee_tier ?? null,
        auto_wrap_eth_to_weth: nextOptions.defaults.auto_wrap_eth_to_weth ?? true,
        swap_source_mode: nextOptions.defaults.swap_source_mode ?? "native",
        swap_source_token_symbol: nextOptions.defaults.swap_source_token_symbol ?? "",
        swap_source_token_address: nextOptions.defaults.swap_source_token_address ?? "",
        stablecoin_distribution_mode: nextOptions.defaults.stablecoin_distribution_mode ?? "none",
        stablecoin_allocations: [],
      }));
      setManualTokenAddress("");
      setCheckingListTokenAddress(null);
      setTokenPickerOpen(false);
      setTokenRouteStatusByAddress({});
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Failed to load template options");
    }
  };

  const getTokenRouteMessage = (token: Pick<StablecoinOption, "route_status" | "route_error">) =>
    token.route_status ?? token.route_error ?? null;

  const clearAllocationRouteMetadata = () => {
    setTokenRouteStatusByAddress({});
    setForm((current) => ({
      ...current,
      stablecoin_allocations: current.stablecoin_allocations.map((allocation) => ({
        ...allocation,
        route_status: null,
        route_error: null,
      })),
    }));
  };

  const handleSwapSourceModeChange = async (nextMode: TemplateEditorForm["swap_source_mode"]) => {
    const preservedSourceToken =
      nextMode === "stablecoin"
        ? {
            swap_source_mode: nextMode,
            swap_source_token_symbol: form.swap_source_token_symbol,
            swap_source_token_address: form.swap_source_token_address,
          }
        : {
            swap_source_mode: nextMode,
            swap_source_token_symbol: "",
            swap_source_token_address: "",
          };
    setForm((current) => ({
      ...current,
      swap_source_mode: nextMode,
      swap_source_token_symbol: preservedSourceToken.swap_source_token_symbol,
      swap_source_token_address: preservedSourceToken.swap_source_token_address,
      auto_wrap_eth_to_weth: nextMode === "native",
    }));
    clearAllocationRouteMetadata();
    try {
      const nextOptions = await loadChainOptions(form.chain, preservedSourceToken);
      setEditorOptions(nextOptions);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Failed to load swap source options");
    }
  };

  const handleSwapSourceTokenChange = async (tokenAddress: string) => {
    const selectedToken =
      swapSourceTokenOptions.find((option) => option.address.toLowerCase() === tokenAddress.toLowerCase()) ?? null;
    setForm((current) => ({
      ...current,
      swap_source_mode: "stablecoin",
      swap_source_token_symbol: selectedToken?.symbol ?? "",
      swap_source_token_address: selectedToken?.address ?? tokenAddress,
      auto_wrap_eth_to_weth: false,
    }));
    clearAllocationRouteMetadata();
    try {
      const nextOptions = await loadChainOptions(form.chain, {
        swap_source_mode: "stablecoin",
        swap_source_token_symbol: selectedToken?.symbol ?? "",
        swap_source_token_address: selectedToken?.address ?? tokenAddress,
      });
      setEditorOptions(nextOptions);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Failed to load source token options");
    }
  };

  const removeStablecoin = (tokenAddress: string) => {
    const normalized = tokenAddress.toLowerCase();
    setForm((current) => ({
      ...current,
      stablecoin_allocations: current.stablecoin_allocations.filter((allocation) => allocation.token_address.toLowerCase() !== normalized),
    }));
  };

  const upsertEditorStablecoin = (token: StablecoinOption) => {
    setEditorOptions((current) => {
      if (!current) return current;
      const normalizedAddress = token.address.toLowerCase();
      const nextStablecoins = current.stablecoins.some((coin) => coin.address.toLowerCase() === normalizedAddress)
        ? current.stablecoins.map((coin) =>
            coin.address.toLowerCase() === normalizedAddress
              ? {
                  ...coin,
                  ...token,
                }
              : coin,
          )
        : [...current.stablecoins, token];
      return {
        ...current,
        stablecoins: nextStablecoins,
      };
    });
  };

  const removeEditorStablecoin = (tokenAddress: string) => {
    const normalized = tokenAddress.toLowerCase();
    setEditorOptions((current) => {
      if (!current) return current;
      return {
        ...current,
        stablecoins: current.stablecoins.filter((coin) => coin.address.toLowerCase() !== normalized),
      };
    });
  };

  const cacheResolvedToken = (resolved: StablecoinOption) => {
    const normalizedAddress = resolved.address.toLowerCase();
    setTokenRouteStatusByAddress((current) => ({
      ...current,
      [normalizedAddress]: {
        tested: resolved.tested,
        route_status: resolved.route_status ?? null,
        route_error: resolved.route_error ?? null,
      },
    }));
    setForm((current) => ({
      ...current,
      stablecoin_allocations: current.stablecoin_allocations.map((allocation) =>
        allocation.token_address.toLowerCase() === normalizedAddress
          ? {
              ...allocation,
              token_symbol: resolved.symbol,
              route_status: resolved.route_status ?? null,
              route_error: resolved.route_error ?? null,
            }
          : allocation,
      ),
    }));
    upsertEditorStablecoin(resolved);
  };

  const resolveTokenForTemplate = async (
    address: string,
    options?: {
      persist?: boolean;
      custom?: boolean;
    },
  ) => {
    const params = new URLSearchParams({
      chain: form.chain,
      address,
    });
    params.set("swap_source_mode", form.swap_source_mode);
    if (form.swap_source_token_symbol) params.set("swap_source_token_symbol", form.swap_source_token_symbol);
    if (form.swap_source_token_address) params.set("swap_source_token_address", form.swap_source_token_address);
    if (options?.persist) params.set("persist", "true");
    if (options?.custom) params.set("custom", "true");
    const response = await fetch(
      `${TEMPLATE_API_URL}/api/templates/token/resolve?${params.toString()}`,
      { cache: "no-store" },
    );
    const payload = await readApiPayload(response);
    if (!response.ok) {
      throw new Error((payload as { detail?: string } | null)?.detail ?? "Failed to resolve token");
    }
    const resolved = payload as StablecoinOption;
    cacheResolvedToken(resolved);
    return resolved;
  };

  const addStablecoin = async (token: StablecoinOption) => {
    const normalizedAddress = token.address.toLowerCase();
    setCheckingListTokenAddress(normalizedAddress);
    setSaveError(null);
    try {
      const resolved = await resolveTokenForTemplate(token.address, {
        persist: true,
        custom: Boolean(token.is_custom),
      });
      if (resolved.route_status === "No route found") {
        setSaveError(resolved.route_status);
        return;
      }
      setForm((current) => {
        const exists = current.stablecoin_allocations.some((allocation) => allocation.token_address.toLowerCase() === normalizedAddress);
        if (exists) return current;
        return {
          ...current,
          stablecoin_allocations: [
            ...current.stablecoin_allocations,
            {
              token_address: resolved.address,
              token_symbol: resolved.symbol,
              percent: null,
              weth_amount_per_contract: null,
              route_status: resolved.route_status ?? null,
              route_error: resolved.route_error ?? null,
            },
          ],
        };
      });
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Failed to resolve token");
    } finally {
      setCheckingListTokenAddress((current) => (current === normalizedAddress ? null : current));
    }
  };

  const toggleStablecoin = async (token: StablecoinOption) => {
    const exists = form.stablecoin_allocations.some((allocation) => allocation.token_address.toLowerCase() === token.address.toLowerCase());
    if (exists) {
      removeStablecoin(token.address);
      return;
    }
    await addStablecoin(token);
  };

  const recheckStablecoin = async (token: StablecoinOption) => {
    const normalizedAddress = token.address.toLowerCase();
    setCheckingListTokenAddress(normalizedAddress);
    setSaveError(null);
    try {
      await resolveTokenForTemplate(token.address, {
        persist: true,
        custom: Boolean(token.is_custom),
      });
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Failed to recheck token");
    } finally {
      setCheckingListTokenAddress((current) => (current === normalizedAddress ? null : current));
    }
  };

  const updateAllocation = (tokenAddress: string, field: "percent" | "weth_amount_per_contract", value: string) => {
    setForm((current) => {
      return {
        ...current,
        stablecoin_allocations: current.stablecoin_allocations.map((allocation) =>
          allocation.token_address.toLowerCase() === tokenAddress.toLowerCase()
            ? { ...allocation, [field]: value }
            : allocation,
        ),
      };
    });
  };

  const resetDistributionValues = () => {
    if (selectedStablecoins.length === 0) return;

    setForm((current) => ({
      ...current,
      stablecoin_allocations: current.stablecoin_allocations.map((allocation) => ({
        ...allocation,
        percent: null,
        weth_amount_per_contract: null,
      })),
    }));
  };

  const addManualStablecoin = async () => {
    const normalizedAddress = manualTokenAddress.trim();
    if (!normalizedAddress) return;

    setResolvingManualToken(true);
    setSaveError(null);
    try {
      const resolved = await resolveTokenForTemplate(normalizedAddress, {
        persist: true,
        custom: true,
      });
      if (resolved.route_status === "No route found") {
        throw new Error(resolved.route_status);
      }

      setForm((current) => {
        const exists = current.stablecoin_allocations.some((allocation) => allocation.token_address.toLowerCase() === resolved.address.toLowerCase());
        if (exists) return current;
        return {
          ...current,
          stablecoin_allocations: [
            ...current.stablecoin_allocations,
            {
              token_address: resolved.address,
              token_symbol: resolved.symbol,
              percent: null,
              weth_amount_per_contract: null,
              route_status: resolved.route_status ?? null,
              route_error: resolved.route_error ?? null,
            },
          ],
        };
      });

      setManualTokenAddress("");
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Failed to resolve token");
    } finally {
      setResolvingManualToken(false);
    }
  };

  const deleteSwapToken = async (tokenAddress: string) => {
    const normalized = tokenAddress.toLowerCase();
    setSaveError(null);
    try {
      const response = await fetch(
        `${TEMPLATE_API_URL}/api/templates/token?chain=${encodeURIComponent(form.chain)}&address=${encodeURIComponent(tokenAddress)}`,
        { method: "DELETE" },
      );
      const payload = await readApiPayload(response);
      if (!response.ok) {
        throw new Error((payload as { detail?: string } | null)?.detail ?? "Failed to delete token");
      }
      removeEditorStablecoin(tokenAddress);
      setTokenRouteStatusByAddress((current) => {
        if (!(normalized in current)) return current;
        const next = { ...current };
        delete next[normalized];
        return next;
      });
      setForm((current) => ({
        ...current,
        stablecoin_allocations: current.stablecoin_allocations.filter((allocation) => allocation.token_address.toLowerCase() !== normalized),
      }));
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Failed to delete token");
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setSaveError(null);

    try {
      const payload = {
        name: form.name,
        chain: form.chain,
        template_version: "v2",
        recipient_address: form.recipient_address || null,
        testing_recipient_address: form.recipient_address || null,
        return_wallet_address: form.return_wallet_address || null,
        test_auto_execute_after_funding: form.test_auto_execute_after_funding,
        test_auto_batch_send_after_funding: form.test_auto_execute_after_funding,
        gas_reserve_eth_per_contract: form.gas_reserve_eth_per_contract,
        swap_budget_eth_per_contract: effectiveSwapBudgetString,
        direct_contract_eth_per_contract: "0",
        direct_contract_native_eth_per_contract: form.direct_contract_native_eth_per_contract,
        direct_contract_weth_per_contract: form.direct_contract_weth_per_contract,
        auto_top_up_enabled: form.auto_top_up_enabled,
        auto_top_up_threshold_eth: form.auto_top_up_threshold_eth,
        auto_top_up_target_eth: form.auto_top_up_target_eth,
        slippage_percent: form.slippage_percent,
        fee_tier: form.fee_tier,
        auto_wrap_eth_to_weth: form.auto_wrap_eth_to_weth,
        swap_source_mode: form.swap_source_mode,
        swap_source_token_symbol: form.swap_source_token_symbol || null,
        swap_source_token_address: form.swap_source_token_address || null,
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
      const result = await readApiPayload(response);
      if (!response.ok) throw new Error((result as { detail?: string } | null)?.detail ?? "Failed to save template");

      onSaved(result as Template);
      onOpenChange(false);
      toast({
        title: template
          ? locale === "en"
            ? "Template updated"
            : locale === "zn"
              ? "模板已更新"
              : "Mẫu đã được cập nhật"
          : locale === "en"
            ? "Template saved"
            : locale === "zn"
              ? "模板已保存"
              : "Mẫu đã được lưu",
        description: locale === "en"
          ? "This template now defines one contract / one subwallet."
          : locale === "zn"
            ? "此模板现在定义一个合约 / 一个子钱包。"
            : "Mẫu này hiện xác định một hợp đồng / một ví con.",
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
          <DialogTitle>
            {template
              ? locale === "en"
                ? "Edit template"
                : locale === "zn"
                  ? "编辑模板"
                  : "Chỉnh sửa mẫu"
              : locale === "en"
                ? "Create template"
                : locale === "zn"
                  ? "创建模板"
                  : "Tạo mẫu"}
          </DialogTitle>
          <DialogDescription>
            {currentOptions?.hints.summary ?? (locale === "en" ? "This template defines one contract / one subwallet." : locale === "zn" ? "此模板定义一个合约 / 一个子钱包。" : "Mẫu này định nghĩa một hợp đồng / một ví con.")}
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-5" onSubmit={handleSubmit}>
          <div className="cad-panel-accent px-4 py-4">
            <p className="text-sm font-semibold text-foreground">{locale === "en" ? "Live USD labels" : locale === "zn" ? "实时 USD 标签" : "Nhãn USD trực tiếp"}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {locale === "en"
                ? `${nativeSymbol}, ${swapBudgetAssetSymbol}, and selected token spot prices refresh every 60 seconds while this editor is open. These are reference labels only and do not change execution logic.`
                : locale === "zn"
                  ? `当此编辑器打开时，${nativeSymbol}、${swapBudgetAssetSymbol} 和所选代币现货价格每 60 秒刷新一次。这些仅作参考，不会改变执行逻辑。`
                  : `Giá spot của ${nativeSymbol}, ${swapBudgetAssetSymbol} và token đã chọn sẽ làm mới mỗi 60 giây khi trình chỉnh sửa đang mở. Đây chỉ là nhãn tham chiếu và không thay đổi logic thực thi.`}
            </p>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span>{nativeSymbol} {formatUsd(marketSnapshot?.eth_usd)}</span>
              <span>{swapBudgetAssetSymbol} {formatUsd(sourceTokenSpotUsd)}</span>
              <span>{locale === "en" ? "Updated" : locale === "zn" ? "更新时间" : "Cập nhật"} {formatRelativeTimestamp(marketSnapshot?.fetched_at)}</span>
            </div>
            {marketError ? <p className="mt-2 text-xs text-amber-800">{locale === "en" ? "Market data warning" : locale === "zn" ? "市场数据警告" : "Cảnh báo dữ liệu thị trường"}: {marketError}</p> : null}
            <p className="mt-2 text-xs text-muted-foreground">
              {locale === "en"
                ? `Primary routing: ${primaryBackendLabel}${fallbackBackendLabels.length > 0 ? ` · Fallback: ${fallbackBackendLabels.join(" -> ")}` : ""}.`
                : locale === "zn"
                  ? `主路由：${primaryBackendLabel}${fallbackBackendLabels.length > 0 ? ` · 回退：${fallbackBackendLabels.join(" -> ")}` : ""}。`
                  : `Định tuyến chính: ${primaryBackendLabel}${fallbackBackendLabels.length > 0 ? ` · Dự phòng: ${fallbackBackendLabels.join(" -> ")}` : ""}.`}
            </p>
          </div>

          <SectionCard
            title={locale === "en" ? "Basics" : locale === "zn" ? "基础信息" : "Cơ bản"}
            description={locale === "en" ? "Set the identity and overall intent for one contract / one subwallet." : locale === "zn" ? "设置一个合约 / 一个子钱包的标识和整体用途。" : "Thiết lập định danh và mục đích tổng thể cho một hợp đồng / một ví con."}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <label className="text-sm font-medium text-foreground">
                  {locale === "en" ? "Chain" : locale === "zn" ? "链" : "Chain"}
                </label>
                <Select value={form.chain} onValueChange={(value) => void handleChainChange(value as TemplateChain)} disabled={Boolean(template)}>
                  <SelectTrigger className="w-full border-border bg-card">
                    <div className="flex min-w-0 flex-1 items-center justify-between gap-3">
                      <span className="truncate text-sm font-medium text-foreground">{currentChain.label}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {currentChain.native_symbol} / {currentChain.wrapped_native_symbol}
                      </span>
                    </div>
                  </SelectTrigger>
                  <SelectContent>
                    {chainOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        <span className="flex w-full min-w-0 items-center justify-between gap-3">
                          <span className="truncate text-sm font-medium text-foreground">{option.label}</span>
                          <span className="shrink-0 text-xs text-muted-foreground">
                            {option.native_symbol} / {option.wrapped_native_symbol}
                          </span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {template
                    ? locale === "en"
                      ? "Chain is fixed for existing templates."
                      : locale === "zn"
                        ? "现有模板的链已固定。"
                        : "Chain của mẫu đã lưu sẽ được giữ cố định."
                    : locale === "en"
                      ? "Choose the network first, then select the swap tokens for that chain."
                      : locale === "zn"
                      ? "先选择网络，再选择该链上的兑换代币。"
                      : "Chọn mạng trước, rồi chọn token swap của chain đó."}
                </p>
                {chainCaveats.length > 0 ? (
                  <div className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
                    <p className="font-semibold">
                      {locale === "en" ? "Chain caveats" : locale === "zn" ? "链上注意事项" : "Lưu ý theo chain"}
                    </p>
                    <div className="mt-2 space-y-1 text-xs">
                      {chainCaveats.map((caveat) => (
                        <p key={caveat}>• {caveat}</p>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="cad-panel-soft space-y-3 px-4 py-3 sm:col-span-2">
                <p className="text-sm font-medium text-foreground">
                  {locale === "en" ? "Chain asset guide" : locale === "zn" ? "链资产说明" : "Hướng dẫn tài sản của chain"}
                </p>
                <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
                  <p>
                    {locale === "en"
                      ? `Gas token for reserve and top-up: ${nativeSymbol}`
                      : locale === "zn"
                        ? `用于 gas 预留和补充的代币：${nativeSymbol}`
                        : `Token gas cho dự trữ và nạp thêm: ${nativeSymbol}`}
                  </p>
                  <p>
                    {locale === "en"
                      ? `Swap source for token routes: ${swapBudgetAssetSymbol}`
                      : locale === "zn"
                        ? `用于代币路由的兑换来源资产：${swapBudgetAssetSymbol}`
                        : `Tài sản nguồn cho các tuyến swap: ${swapBudgetAssetSymbol}`}
                  </p>
                  <p>
                    {locale === "en"
                      ? swapSourceMode === "native"
                        ? `Sub-wallet gas stays in ${nativeSymbol}. Local wrapping only creates ${wrappedNativeSymbol} when the plan needs it.`
                        : `Sub-wallet gas still stays in ${nativeSymbol}. Swap funding is provided directly as ${swapBudgetAssetSymbol}.`
                      : locale === "zn"
                        ? swapSourceMode === "native"
                          ? `子钱包 gas 保持为 ${nativeSymbol}。只有在流程需要时才会在本地包装成 ${wrappedNativeSymbol}。`
                          : `子钱包 gas 仍保持为 ${nativeSymbol}。兑换来源资产会直接以 ${swapBudgetAssetSymbol} 注资。`
                        : swapSourceMode === "native"
                          ? `Gas của ví con giữ ở dạng ${nativeSymbol}. Chỉ wrap cục bộ sang ${wrappedNativeSymbol} khi kế hoạch thực sự cần.`
                          : `Gas của ví con vẫn giữ ở dạng ${nativeSymbol}. Tài sản nguồn cho swap sẽ được cấp trực tiếp dưới dạng ${swapBudgetAssetSymbol}.`}
                  </p>
                  <p>
                    {locale === "en"
                      ? `Primary swap backend: ${primaryBackendLabel}${fallbackBackendLabels.length > 0 ? ` · Fallback order: ${fallbackBackendLabels.join(" -> ")}` : ""}. Route checks and swap sizing apply to ${swapBudgetAssetSymbol}.`
                      : locale === "zn"
                        ? `主兑换后端：${primaryBackendLabel}${fallbackBackendLabels.length > 0 ? ` · 回退顺序：${fallbackBackendLabels.join(" -> ")}` : ""}。路由检查和兑换预算针对的是 ${swapBudgetAssetSymbol}。`
                        : `Backend swap chính: ${primaryBackendLabel}${fallbackBackendLabels.length > 0 ? ` · Thứ tự dự phòng: ${fallbackBackendLabels.join(" -> ")}` : ""}. Kiểm tra tuyến và ngân sách swap áp dụng cho ${swapBudgetAssetSymbol}.`}
                  </p>
                </div>
              </div>

              <div className="cad-panel-soft space-y-3 px-4 py-3 sm:col-span-2">
                <p className="text-sm font-medium text-foreground">
                  {locale === "en" ? "Swap Source" : locale === "zn" ? "兑换来源资产" : "Nguồn tài sản swap"}
                </p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">
                      {locale === "en" ? "Funding mode" : locale === "zn" ? "资金模式" : "Chế độ cấp vốn"}
                    </label>
                    <Select value={form.swap_source_mode} onValueChange={(value) => void handleSwapSourceModeChange(value as TemplateEditorForm["swap_source_mode"])}>
                      <SelectTrigger className="w-full border-border bg-card">
                        <span className="truncate text-sm font-medium text-foreground">
                          {currentOptions?.swap_source_modes.find((mode) => mode.value === form.swap_source_mode)?.label ?? form.swap_source_mode}
                        </span>
                      </SelectTrigger>
                      <SelectContent>
                        {currentOptions?.swap_source_modes.map((mode) => (
                          <SelectItem key={mode.value} value={mode.value}>
                            <span className="flex flex-col">
                              <span className="text-sm font-medium text-foreground">{mode.label}</span>
                              <span className="text-xs text-muted-foreground">{mode.description}</span>
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {form.swap_source_mode === "stablecoin" ? (
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground">
                        {locale === "en" ? "Stablecoin source token" : locale === "zn" ? "稳定币来源代币" : "Stablecoin nguồn"}
                      </label>
                      <Select value={form.swap_source_token_address} onValueChange={(value) => void handleSwapSourceTokenChange(value)}>
                        <SelectTrigger className="w-full border-border bg-card">
                          <span className="truncate text-sm font-medium text-foreground">
                            {swapSourceTokenOptions.find((token) => token.address.toLowerCase() === form.swap_source_token_address.toLowerCase())?.symbol ??
                              (locale === "en" ? "Select a stablecoin source" : locale === "zn" ? "选择稳定币来源" : "Chọn stablecoin nguồn")}
                          </span>
                        </SelectTrigger>
                        <SelectContent>
                          {swapSourceTokenOptions.map((token) => (
                            <SelectItem key={token.address} value={token.address}>
                              <span className="flex items-center justify-between gap-3">
                                <span className="text-sm font-medium text-foreground">{token.symbol}</span>
                                <span className="text-xs text-muted-foreground">{shortAddress(token.address)}</span>
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ) : null}
                </div>
                <p className="text-xs text-muted-foreground">
                  {currentOptions?.hints.swap_source_note ?? currentOptions?.hints.swap_budget_note}
                </p>
                {swapSourceRecommendation ? (
                  <div className="rounded-2xl bg-sky-50 px-4 py-3 text-sm text-sky-950">
                    <p className="font-semibold">{swapSourceRecommendation.title}</p>
                    <p className="mt-1 text-xs text-sky-900">{swapSourceRecommendation.summary}</p>
                    {swapSourceRecommendation.details?.length ? (
                      <div className="mt-2 space-y-1 text-xs text-sky-900">
                        {swapSourceRecommendation.details.map((detail) => (
                          <p key={detail}>• {detail}</p>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>

              <div className="space-y-2 sm:col-span-2">
                <label htmlFor="template-name" className="text-sm font-medium text-foreground">
                  {locale === "en" ? "Template name" : locale === "zn" ? "模板名称" : "Tên mẫu"}
                </label>
                <Input
                  id="template-name"
                  value={form.name}
                  placeholder={locale === "en" ? "Example: BNB token distribution contract" : locale === "zn" ? "例如：BNB 代币分发合约" : "Ví dụ: Hợp đồng phân phối token BNB"}
                  onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                  required
                />
              </div>

              <div className="space-y-2 sm:col-span-2">
                <label htmlFor="recipient-address" className="text-sm font-medium text-foreground">
                  {locale === "en" ? "Testing recipient address" : locale === "zn" ? "测试接收地址" : "Địa chỉ nhận thử nghiệm"}
                </label>
                <Input
                  id="recipient-address"
                  value={form.recipient_address}
                  placeholder="0x..."
                  onChange={(event) => setForm((current) => ({ ...current, recipient_address: event.target.value }))}
                />
                <p className="text-xs text-muted-foreground">
                  {locale === "en"
                    ? `Testing only. Required when token swaps or direct contract ${nativeSymbol}/${wrappedNativeSymbol} funding should auto-deploy one BatchTreasuryDistributor from each sub-wallet and send its test payout to this address.`
                    : locale === "zn"
                      ? `仅测试用途。当代币兑换或直接合约 ${nativeSymbol}/${wrappedNativeSymbol} 注资需要从每个子钱包自动部署一个 BatchTreasuryDistributor 并把测试分发发送到该地址时，此项为必填。`
                      : `Chỉ để thử nghiệm. Bắt buộc khi swap token hoặc cấp ${nativeSymbol}/${wrappedNativeSymbol} trực tiếp cho hợp đồng cần tự động triển khai một BatchTreasuryDistributor từ mỗi ví con và gửi payout thử nghiệm đến địa chỉ này.`}
                </p>
              </div>

              <div className="space-y-2 sm:col-span-2">
                <label htmlFor="return-wallet-address" className="text-sm font-medium text-foreground">
                  {locale === "en" ? "Return wallet address" : locale === "zn" ? "回收钱包地址" : "Địa chỉ ví nhận lại"}
                </label>
                <Input
                  id="return-wallet-address"
                  value={form.return_wallet_address}
                  placeholder="0x..."
                  onChange={(event) => setForm((current) => ({ ...current, return_wallet_address: event.target.value }))}
                />
                <p className="text-xs text-muted-foreground">
                  {currentOptions?.hints.return_wallet_note ??
                    (locale === "en"
                      ? `Optional. After the run, leftover ${nativeSymbol}, ${wrappedNativeSymbol}, and supported token balances still sitting in a sub-wallet will be swept here.`
                      : locale === "zn"
                        ? `可选。运行结束后，子钱包中剩余的 ${nativeSymbol}、${wrappedNativeSymbol} 和受支持代币余额会被归集到这里。`
                        : `Tùy chọn. Sau khi chạy xong, ${nativeSymbol}, ${wrappedNativeSymbol} và số dư token được hỗ trợ còn lại trong ví con sẽ được gom về đây.`)}
                </p>
              </div>

              <div className="space-y-2 sm:col-span-2">
                <label htmlFor="template-notes" className="text-sm font-medium text-foreground">
                  {locale === "en" ? "Notes" : locale === "zn" ? "备注" : "Ghi chú"}
                </label>
                <Textarea
                  id="template-notes"
                  value={form.notes}
                  placeholder={locale === "en" ? "Optional notes about funding intent or distribution strategy." : locale === "zn" ? "关于注资目的或分发策略的可选备注。" : "Ghi chú tùy chọn về mục đích cấp vốn hoặc chiến lược phân phối."}
                  onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
                />
              </div>
            </div>
          </SectionCard>

          <SectionCard
            title={locale === "en" ? "Testing Execute" : locale === "zn" ? "测试执行" : "Chạy thử"}
            description={locale === "en" ? "Optional testing mode to prove the full deploy-and-send path on-chain." : locale === "zn" ? "可选测试模式，用于验证完整的链上部署与发送流程。" : "Chế độ thử nghiệm tùy chọn để xác minh toàn bộ luồng triển khai và gửi trên chain."}
          >
            <label className="cad-panel-soft flex items-start gap-3 px-4 py-3">
              <input
                type="checkbox"
                checked={form.test_auto_execute_after_funding}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    test_auto_execute_after_funding: event.target.checked,
                  }))
                }
                className="mt-1 h-4 w-4 rounded border-border"
              />
                <span>
                <span className="block text-sm font-medium text-foreground">{locale === "en" ? "Testing only: auto batch send after funding" : locale === "zn" ? "仅测试：注资后自动批量发送" : "Chỉ để thử nghiệm: tự động batch send sau khi cấp vốn"}</span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  {currentOptions?.hints.test_auto_execute_note ??
                    (locale === "en"
                      ? "After BatchTreasuryDistributor is deployed and funded, the sub-wallet will call batchSend() right away and send every funded asset entry to the testing recipient address."
                      : locale === "zn"
                        ? "BatchTreasuryDistributor 部署并注资后，子钱包会立即调用 batchSend()，并把每个已注资资产条目发送到测试接收地址。"
                        : "Sau khi BatchTreasuryDistributor được triển khai và cấp vốn, ví con sẽ gọi batchSend() ngay và gửi từng tài sản đã cấp vốn đến địa chỉ nhận thử nghiệm.")}
                </span>
              </span>
            </label>

            {form.test_auto_execute_after_funding ? (
              <div className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
                {locale === "en" ? "Testing only. This bypasses the normal hold-in-contract behavior by calling `batchSend()` to the testing recipient address after funding." : locale === "zn" ? "仅测试用途。该模式会在注资后调用 `batchSend()` 把资产发送到测试接收地址，从而绕过常规的合约持仓行为。" : "Chỉ để thử nghiệm. Chế độ này bỏ qua cơ chế giữ tiền trong hợp đồng bình thường bằng cách gọi `batchSend()` đến địa chỉ nhận thử nghiệm sau khi cấp vốn."}
              </div>
            ) : fundedTreasuryEnabled ? (
              <div className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {locale === "en"
                  ? "This template funds BatchTreasuryDistributor. Keep testing auto batch send enabled until the product has a real later release path, or assets can remain parked in the contract."
                  : locale === "zn"
                    ? "此模板会为 BatchTreasuryDistributor 注资。在产品具备真实的后续释放路径之前，请保持启用自动批量发送，否则资产可能会停留在合约中。"
                    : "Mẫu này sẽ cấp vốn cho BatchTreasuryDistributor. Hãy giữ bật tự động batch send cho đến khi sản phẩm có luồng giải phóng tài sản thực sự về sau, nếu không tài sản có thể bị giữ lại trong hợp đồng."}
              </div>
            ) : null}
          </SectionCard>

          <SectionCard
            title={locale === "en" ? `${nativeSymbol} Budget` : locale === "zn" ? `${nativeSymbol} 预算` : `Ngân sách ${nativeSymbol}`}
            description={locale === "en" ? "These values apply to one contract. The wallet flow multiplies them by the contract count later." : locale === "zn" ? "这些数值适用于单个合约，后续钱包流程会按合约数量进行倍增。" : "Các giá trị này áp dụng cho một hợp đồng. Luồng ví sẽ nhân chúng theo số lượng hợp đồng ở bước sau."}
          >
            <div className="space-y-2">
              <label htmlFor="gas-reserve" className="text-sm font-medium text-foreground">
                {locale === "en" ? `Gas reserve ${nativeSymbol}` : locale === "zn" ? `Gas 预留 ${nativeSymbol}` : `Dự phòng gas ${nativeSymbol}`}
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
                {locale === "en"
                  ? `Optional baseline. Preview will automatically add extra unwrapped ${nativeSymbol} when local wrap, swap, deploy, or token-transfer gas needs more headroom.`
                  : locale === "zn"
                    ? `可选基础值。当本地包装、兑换、部署或代币转账 gas 需要更多余量时，预览会自动增加未包装的 ${nativeSymbol}。`
                    : `Mức cơ sở tùy chọn. Bản xem trước sẽ tự động cộng thêm ${nativeSymbol} chưa wrap khi local wrap, swap, triển khai hoặc gas chuyển token cần thêm vùng đệm.`}
              </p>
              <LiveValueHint label="Live value" value={ethUsdLabel} />
            </div>

            <label className="cad-panel-muted flex items-start gap-3 px-4 py-3">
              <input
                type="checkbox"
                checked={swapSourceMode === "native"}
                disabled
                readOnly
                className="mt-1 h-4 w-4 rounded border-border"
              />
              <span>
                <span className="block text-sm font-medium text-foreground">
                  {locale === "en"
                    ? swapSourceMode === "native"
                      ? `Local sub-wallet wrapping is used when swap routes need ${wrappedNativeSymbol}`
                      : swapSourceMode === "wrapped_native"
                        ? `${wrappedNativeSymbol} is funded directly into each sub-wallet`
                        : `${swapBudgetAssetSymbol} is funded directly into each sub-wallet`
                    : locale === "zn"
                      ? swapSourceMode === "native"
                        ? `当兑换路由需要 ${wrappedNativeSymbol} 时，会在子钱包内本地包装`
                        : swapSourceMode === "wrapped_native"
                          ? `${wrappedNativeSymbol} 会直接注入每个子钱包`
                          : `${swapBudgetAssetSymbol} 会直接注入每个子钱包`
                      : swapSourceMode === "native"
                        ? `Wrap cục bộ trong ví con được dùng khi tuyến swap cần ${wrappedNativeSymbol}`
                        : swapSourceMode === "wrapped_native"
                          ? `${wrappedNativeSymbol} được cấp trực tiếp vào từng ví con`
                          : `${swapBudgetAssetSymbol} được cấp trực tiếp vào từng ví con`}
                </span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  {currentOptions?.hints.swap_budget_note}
                </span>
              </span>
            </label>
          </SectionCard>

          <SectionCard
            title={locale === "en" ? "Auto Top-Up" : locale === "zn" ? "自动补充" : "Nạp thêm tự động"}
            description={locale === "en" ? `Let the main wallet refill a sub-wallet before approvals, swaps, or deployments continue when its native ${nativeSymbol} balance gets too low.` : locale === "zn" ? `当子钱包的原生 ${nativeSymbol} 余额过低时，让主钱包在继续授权、兑换或部署之前为其补充余额。` : `Cho phép ví chính nạp lại ví con trước khi tiếp tục phê duyệt, swap hoặc triển khai khi số dư ${nativeSymbol} gốc xuống quá thấp.`}
          >
            <label className="cad-panel-muted flex items-start gap-3 px-4 py-3">
              <input
                type="checkbox"
                checked={form.auto_top_up_enabled}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    auto_top_up_enabled: event.target.checked,
                  }))
                }
                className="mt-1 h-4 w-4 rounded border-border"
              />
              <span>
                <span className="block text-sm font-medium text-foreground">
                  {locale === "en" ? "Enable auto top-up from the main wallet" : locale === "zn" ? "启用主钱包自动补充" : "Bật tự động nạp thêm từ ví chính"}
                </span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  {currentOptions?.hints.auto_top_up_note ??
                    `When a sub-wallet reaches the trigger threshold after local execution starts, the main wallet can send another ${nativeSymbol} transfer to refill it to the target.`}
                </span>
              </span>
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label htmlFor="auto-top-up-threshold" className="text-sm font-medium text-foreground">
                  {locale === "en" ? `Trigger threshold ${nativeSymbol}` : locale === "zn" ? `触发阈值 ${nativeSymbol}` : `Ngưỡng kích hoạt ${nativeSymbol}`}
                </label>
                <Input
                  id="auto-top-up-threshold"
                  type="number"
                  min="0"
                  step="0.0001"
                  value={form.auto_top_up_threshold_eth}
                  disabled={!topUpEnabled}
                  onChange={(event) => setForm((current) => ({ ...current, auto_top_up_threshold_eth: event.target.value }))}
                />
                <p className="text-xs text-muted-foreground">
                  {locale === "en"
                    ? `If the sub-wallet balance falls to or below this value during the run, the executor will try to refill it before continuing.`
                    : locale === "zn"
                      ? "如果子钱包余额在运行中降到该值或更低，执行器会在继续前尝试补充。"
                      : "Nếu số dư ví con giảm xuống hoặc thấp hơn mức này trong lúc chạy, bộ thực thi sẽ thử nạp lại trước khi tiếp tục."}
                </p>
                <LiveValueHint label="Live value" value={topUpThresholdUsdLabel} />
              </div>

              <div className="space-y-2">
                <label htmlFor="auto-top-up-target" className="text-sm font-medium text-foreground">
                  {locale === "en" ? `Refill target ${nativeSymbol}` : locale === "zn" ? `补充目标 ${nativeSymbol}` : `Mục tiêu nạp lại ${nativeSymbol}`}
                </label>
                <Input
                  id="auto-top-up-target"
                  type="number"
                  min="0"
                  step="0.0001"
                  value={form.auto_top_up_target_eth}
                  disabled={!topUpEnabled}
                  onChange={(event) => setForm((current) => ({ ...current, auto_top_up_target_eth: event.target.value }))}
                />
                <p className="text-xs text-muted-foreground">
                  {locale === "en"
                    ? form.chain === "bnb"
                      ? `The main wallet will top the sub-wallet back up to this native ${nativeSymbol} target. Set it equal to or higher than the trigger.`
                      : `The main wallet will top the sub-wallet back up to this native ${nativeSymbol} target. Set it higher than the trigger.`
                    : locale === "zn"
                      ? form.chain === "bnb"
                        ? `主钱包会把子钱包补回到这个原生 ${nativeSymbol} 目标值。请将其设为等于或高于触发阈值。`
                        : `主钱包会把子钱包补回到这个原生 ${nativeSymbol} 目标值。请将其设为高于触发阈值。`
                      : form.chain === "bnb"
                        ? `Ví chính sẽ nạp lại ví con về mức ${nativeSymbol} gốc này. Hãy đặt nó bằng hoặc cao hơn ngưỡng kích hoạt.`
                        : `Ví chính sẽ nạp lại ví con về mức ${nativeSymbol} gốc này. Hãy đặt nó cao hơn ngưỡng kích hoạt.`}
                </p>
                <LiveValueHint label="Live value" value={topUpTargetUsdLabel} />
              </div>
            </div>

            <div className={topUpThresholdRuleViolated ? "rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700" : "cad-panel-soft px-4 py-3 text-sm text-muted-foreground"}>
              {locale === "en"
                ? topUpTargetMustExceedThreshold
                  ? `Note: Refill target ${nativeSymbol} > Trigger threshold ${nativeSymbol}.`
                  : `Note: Refill target ${nativeSymbol} >= Trigger threshold ${nativeSymbol}.`
                : locale === "zn"
                  ? topUpTargetMustExceedThreshold
                    ? `说明：补充目标 ${nativeSymbol} 必须大于触发阈值 ${nativeSymbol}。`
                    : `说明：补充目标 ${nativeSymbol} 必须等于或高于触发阈值 ${nativeSymbol}。`
                  : topUpTargetMustExceedThreshold
                    ? `Lưu ý: Mục tiêu nạp lại ${nativeSymbol} phải lớn hơn ngưỡng kích hoạt ${nativeSymbol}.`
                    : `Lưu ý: Mục tiêu nạp lại ${nativeSymbol} phải bằng hoặc lớn hơn ngưỡng kích hoạt ${nativeSymbol}.`}
            </div>
          </SectionCard>

          <SectionCard
            title={locale === "en" ? "Swap Token Distribution" : locale === "zn" ? "兑换代币分配" : "Phân bổ token swap"}
            description={locale === "en" ? "Pick one or many tokens for one contract, then decide how the swap budget is split across them." : locale === "zn" ? "为一个合约选择一个或多个代币，然后决定兑换预算如何分配。" : "Chọn một hoặc nhiều token cho một hợp đồng, rồi quyết định cách chia ngân sách swap giữa chúng."}
          >
            <div className="flex flex-wrap gap-2">
              {currentOptions?.distribution_modes.map((mode) => (
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
                {form.stablecoin_distribution_mode !== "manual_weth_amount" ? (
                  <div className="cad-panel-soft p-4">
                    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px] lg:items-end">
                      <div className="space-y-2">
                        <label htmlFor="swap-budget" className="text-sm font-medium text-foreground">
                          {locale === "en" ? `Swap token budget (${swapBudgetAssetSymbol})` : locale === "zn" ? `兑换代币预算 (${swapBudgetAssetSymbol})` : `Ngân sách swap token (${swapBudgetAssetSymbol})`}
                        </label>
                        <Input
                          id="swap-budget"
                          type="number"
                          min="0"
                          step="0.0001"
                          value={form.swap_budget_eth_per_contract}
                          onChange={(event) => setForm((current) => ({ ...current, swap_budget_eth_per_contract: event.target.value }))}
                        />
                        <p className="text-xs text-muted-foreground">{currentOptions?.hints.swap_budget_note}</p>
                      </div>
                      <div className="cad-panel-muted px-4 py-3">
                        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{`Live ${swapBudgetAssetSymbol} spend`}</p>
                        <p className="mt-1 text-sm font-semibold text-foreground">{formatAmount(swapBudgetValue)} {swapBudgetAssetSymbol}</p>
                        <p className="mt-1 text-[11px] font-medium text-sky-700">{formatUsd(swapBudgetUsdLabel)}</p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="cad-panel-soft p-4">
                    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px] lg:items-end">
                      <div className="space-y-2">
                        <p className="text-sm font-medium text-foreground">
                          {locale === "en" ? `Swap token budget (${swapBudgetAssetSymbol})` : locale === "zn" ? `兑换代币预算 (${swapBudgetAssetSymbol})` : `Ngân sách swap token (${swapBudgetAssetSymbol})`}
                        </p>
                        <div className="cad-panel-muted px-4 py-3">
                          <p className="text-sm font-semibold text-foreground">{formatAmount(swapBudgetValue)} {swapBudgetAssetSymbol}</p>
                          <p className="mt-1 text-xs text-muted-foreground">{currentOptions?.hints.swap_budget_note}</p>
                        </div>
                      </div>
                      <div className="cad-panel-muted px-4 py-3">
                        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{`Live ${swapBudgetAssetSymbol} spend`}</p>
                        <p className="mt-1 text-sm font-semibold text-foreground">{formatAmount(swapBudgetValue)} {swapBudgetAssetSymbol}</p>
                        <p className="mt-1 text-[11px] font-medium text-sky-700">{formatUsd(swapBudgetUsdLabel)}</p>
                      </div>
                    </div>
                  </div>
                )}

                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">
                      {locale === "en" ? "Add token manually" : locale === "zn" ? "手动添加代币" : "Thêm token thủ công"}
                    </label>
                    <Input
                      value={manualTokenAddress}
                      onChange={(event) => setManualTokenAddress(event.target.value)}
                      placeholder={locale === "en" ? "Paste token address" : locale === "zn" ? "粘贴代币地址" : "Dán địa chỉ token"}
                      spellCheck={false}
                    />
                  </div>
                  <Button type="button" variant="outline" onClick={addManualStablecoin} disabled={resolvingManualToken || !manualTokenAddress.trim()}>
                    {resolvingManualToken ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    {locale === "en" ? "Add token" : locale === "zn" ? "添加代币" : "Thêm token"}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {locale === "en"
                    ? swapSourceMode === "stablecoin"
                      ? `${swapBudgetAssetSymbol} is the current swap source. If you also select ${swapBudgetAssetSymbol} as a basket token, that allocation can be funded directly without a swap route.`
                      : `${wrappedNativeSymbol} is the wrapped input asset for this chain. It is used internally for swaps and is not selectable as a basket token.`
                    : locale === "zn"
                      ? swapSourceMode === "stablecoin"
                        ? `${swapBudgetAssetSymbol} 是当前的兑换来源资产。如果你也把 ${swapBudgetAssetSymbol} 选作篮子代币，该分配可以直接注资而无需兑换路由。`
                        : `${wrappedNativeSymbol} 是此链上的包装输入资产。它会在兑换中内部使用，不能作为篮子代币选择。`
                      : swapSourceMode === "stablecoin"
                        ? `${swapBudgetAssetSymbol} là tài sản nguồn hiện tại cho swap. Nếu bạn cũng chọn ${swapBudgetAssetSymbol} làm token trong rổ, phần đó có thể được cấp trực tiếp mà không cần tuyến swap.`
                        : `${wrappedNativeSymbol} là tài sản bọc dùng làm đầu vào trên chain này. Nó được dùng nội bộ cho swap và không thể chọn làm token trong rổ.`}
                </p>

                <Collapsible open={tokenPickerOpen} onOpenChange={setTokenPickerOpen} className="space-y-3">
                  <CollapsibleTrigger asChild>
                    <button
                      type="button"
                      className="cad-panel-soft flex w-full items-center justify-between gap-4 px-4 py-3 text-left"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground">
                          {locale === "en" ? "Token list" : locale === "zn" ? "代币列表" : "Danh sách token"}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {locale === "en"
                            ? `${displayStablecoins.length} available • ${selectedStablecoins.length} selected`
                            : locale === "zn"
                              ? `${displayStablecoins.length} 个可选 • 已选 ${selectedStablecoins.length} 个`
                              : `${displayStablecoins.length} token • đã chọn ${selectedStablecoins.length}`}
                        </p>
                      </div>
                      <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${tokenPickerOpen ? "rotate-180" : ""}`} />
                    </button>
                  </CollapsibleTrigger>

                  <CollapsibleContent className="space-y-2">
                    {displayStablecoins.map((coin) => {
                      const active = selectedStablecoinAddresses.has(coin.address.toLowerCase());
                      const isCustomToken = Boolean(coin.is_custom);
                      const routeMessage = getTokenRouteMessage(coin);
                      const blockedForNoRoute = coin.route_status === "No route found";
                      const checkingThisToken = checkingListTokenAddress === coin.address.toLowerCase();
                      return (
                        <div
                          key={coin.address}
                          className={`relative rounded-2xl px-4 py-4 transition ${
                            active
                              ? "bg-accent/85 shadow-[0_18px_36px_-26px_rgba(56,189,248,0.35)] ring-1 ring-sky-200"
                              : "bg-card ring-1 ring-border/70 hover:bg-secondary/35"
                          }`}
                        >
                          <button
                            type="button"
                            className="block w-full pr-24 text-left"
                            disabled={checkingThisToken}
                            onClick={() => void toggleStablecoin(coin)}
                          >
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-sm font-semibold text-foreground">{coin.symbol}</p>
                              {blockedForNoRoute ? <NoRouteBadge /> : null}
                              {active ? (
                                <span className="inline-flex rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-700 ring-1 ring-sky-200">
                                  {locale === "en" ? "Selected" : locale === "zn" ? "已选择" : "Đã chọn"}
                                </span>
                              ) : null}
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground">{coin.name}</p>
                            <p className="mt-2 break-all font-mono text-[11px] font-semibold text-foreground">{coin.address}</p>
                            {routeMessage && !blockedForNoRoute ? (
                              <p className="mt-2 text-[11px] font-medium text-amber-700">
                                {routeMessage}
                              </p>
                            ) : null}
                            <div className="mt-3 flex items-center justify-between gap-3">
                              <p className="text-[11px] text-muted-foreground">
                                {isCustomToken ? (locale === "en" ? "Manual token" : locale === "zn" ? "手动添加代币" : "Token thêm thủ công") : `${currentChain.label} token`}
                              </p>
                              <div className="flex items-center gap-2 text-[11px]">
                                {checkingThisToken ? (
                                  <>
                                    <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                                    <span className="text-muted-foreground">
                                      {locale === "en" ? "Checking route..." : locale === "zn" ? "正在检查路由..." : "Đang kiểm tra tuyến..."}
                                    </span>
                                  </>
                                ) : (
                                  <span className="font-medium text-muted-foreground">
                                    {active
                                      ? locale === "en"
                                        ? "Click to remove"
                                        : locale === "zn"
                                          ? "点击移除"
                                          : "Bấm để gỡ"
                                      : locale === "en"
                                        ? "Click to add"
                                        : locale === "zn"
                                          ? "点击添加"
                                          : "Bấm để thêm"}
                                  </span>
                                )}
                                <span className="font-medium text-sky-700">
                                  Spot {formatUsd(marketSnapshot?.token_prices?.[coin.address.toLowerCase()])}
                                </span>
                              </div>
                            </div>
                          </button>

                          <div className="absolute right-3 top-3 flex items-center gap-1">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 rounded-xl"
                              disabled={checkingThisToken}
                              onClick={(event) => {
                                event.stopPropagation();
                                void recheckStablecoin(coin);
                              }}
                            >
                              <RefreshCw className={`h-4 w-4 ${checkingThisToken ? "animate-spin" : ""}`} />
                            </Button>
                            {isCustomToken ? (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 rounded-xl"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  void deleteSwapToken(coin.address);
                                }}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </CollapsibleContent>
                </Collapsible>

                {(form.stablecoin_distribution_mode === "manual_percent" ||
                  form.stablecoin_distribution_mode === "manual_weth_amount") &&
                selectedStablecoins.length > 0 ? (
                  <div className="cad-panel-soft p-4">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-foreground">Manual distribution</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {form.stablecoin_distribution_mode === "manual_percent"
                            ? "Percentages must total exactly 100."
                            : `Exact ${swapBudgetAssetSymbol} amounts define the per-contract swap total automatically.`}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <Button type="button" variant="outline" onClick={resetDistributionValues}>
                          <RefreshCw className="h-4 w-4" />
                          {locale === "en" ? "Reset all token values" : locale === "zn" ? "重置所有代币数值" : "Đặt lại toàn bộ giá trị token"}
                        </Button>
                      </div>
                    </div>

                    {form.stablecoin_distribution_mode === "manual_percent" ? (
                      <>
                        <div className="mb-4 grid gap-2 sm:grid-cols-3">
                          <div className="cad-panel-muted px-4 py-3">
                            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Swap budget</p>
                            <p className="mt-1 text-sm font-semibold text-foreground">{formatAmount(swapBudgetValue)} {swapBudgetAssetSymbol}</p>
                            <p className="mt-1 text-[11px] font-medium text-sky-700">{formatUsd(swapBudgetUsdLabel)}</p>
                          </div>
                          <div className="cad-panel-muted px-4 py-3">
                            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Assigned</p>
                            <p className="mt-1 text-sm font-semibold text-foreground">{formatAmount(manualDistributionAssignedValue)} {swapBudgetAssetSymbol}</p>
                            <p className="mt-1 text-[11px] font-medium text-sky-700">{formatUsd(manualDistributionAssignedUsdLabel)}</p>
                          </div>
                          <div className="cad-panel-muted px-4 py-3">
                            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                              {manualDistributionOverValue > 0 ? "Over budget" : "Remaining"}
                            </p>
                            <p className="mt-1 text-sm font-semibold text-foreground">
                              {formatAmount(manualDistributionOverValue > 0 ? manualDistributionOverValue : manualDistributionRemainingValue)} {swapBudgetAssetSymbol}
                            </p>
                            <p className="mt-1 text-[11px] font-medium text-sky-700">
                              {formatUsd(manualDistributionOverValue > 0 ? manualDistributionOverUsdLabel : manualDistributionRemainingUsdLabel)}
                            </p>
                          </div>
                        </div>

                        <div
                          className={`mb-4 rounded-xl px-4 py-3 text-sm ${
                            !manualDistributionHasBudget
                              ? "bg-slate-50 text-slate-700 ring-1 ring-slate-200"
                              : manualDistributionOverBudget
                              ? "bg-rose-50 text-rose-700 ring-1 ring-rose-100"
                              : manualDistributionHasRemaining
                                ? "bg-amber-50 text-amber-800 ring-1 ring-amber-100"
                                : "bg-sky-50 text-sky-900 ring-1 ring-sky-100"
                          }`}
                        >
                          <p className="font-semibold">
                            {!manualDistributionHasBudget
                              ? `Swap budget is 0 ${swapBudgetAssetSymbol}.`
                              : manualDistributionOverBudget
                              ? `Over budget by ${formatAmount(manualDistributionOverValue)} ${swapBudgetAssetSymbol}.`
                              : manualDistributionHasRemaining
                                ? `${formatAmount(manualDistributionRemainingValue)} ${swapBudgetAssetSymbol} is still unassigned.`
                                : `Swap budget matched. ${swapBudgetAssetSymbol} allocation is ready.`}
                          </p>
                          <p className="mt-1 text-xs">
                            {!manualDistributionHasBudget
                              ? `Set the swap budget above 0 ${swapBudgetAssetSymbol} before the token allocation can be ready.`
                              : manualDistributionOverBudget
                              ? "Lower one or more token amounts before saving."
                              : manualDistributionHasRemaining
                                ? "Add the remaining amount to one or more token rows, or use Auto distribute."
                                : `Assigned token amounts now match the per-contract swap budget. Live value: ${formatUsd(manualDistributionAssignedUsdLabel)}`}
                          </p>
                        </div>
                      </>
                    ) : null}

                    <div className="space-y-3">
                      {selectedStablecoins.map((coin) => {
                        const allocation = form.stablecoin_allocations.find((item) => item.token_address.toLowerCase() === coin.address.toLowerCase());
                        if (!allocation) return null;
                        const blockedForNoRoute = allocation.route_status === "No route found";
                        return (
                          <div key={coin.address} className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_180px] sm:items-center">
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="text-sm font-semibold text-foreground">{coin.symbol}</p>
                                {blockedForNoRoute ? <NoRouteBadge /> : null}
                              </div>
                              <p className="text-xs text-muted-foreground">{coin.name}</p>
                              <p className="mt-1 text-[11px] font-medium text-sky-700">
                                Spot {formatUsd(marketSnapshot?.token_prices?.[coin.address.toLowerCase()])}
                              </p>
                              {allocation.route_status && !blockedForNoRoute ? (
                                <p className="mt-1 text-[11px] font-medium text-amber-700">{allocation.route_status}</p>
                              ) : null}
                              {!allocation.route_status && allocation.route_error ? (
                                <p className="mt-1 text-[11px] font-medium text-amber-700">{allocation.route_error}</p>
                              ) : null}
                            </div>
                            <div className="space-y-2">
                              <Input
                                type="number"
                                min="0"
                                step="0.000001"
                                placeholder={
                                  form.stablecoin_distribution_mode === "manual_percent"
                                    ? "Percent share"
                                    : `${swapBudgetAssetSymbol} per contract`
                                }
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
                              {form.stablecoin_distribution_mode === "manual_percent" ? (
                                <>
                                  <p className="text-[11px] text-muted-foreground">Percent input.</p>
                                  <LiveValueHint
                                    label="Live budget slice"
                                    value={getUsdValue(
                                      ((toFiniteNumber(form.swap_budget_eth_per_contract) ?? 0) * (toFiniteNumber(allocation.percent) ?? 0)) / 100,
                                      sourceTokenSpotUsd,
                                    )}
                                  />
                                  {!manualDistributionHasBudget && (toFiniteNumber(allocation.percent) ?? 0) > 0 ? (
                                    <p className="text-[11px] text-amber-700">
                                      {`Budget is 0. Set swap budget > 0 ${swapBudgetAssetSymbol}.`}
                                    </p>
                                  ) : null}
                                </>
                              ) : (
                                <LiveValueHint
                                  label="Live budget slice"
                                  value={getUsdValue(allocation.weth_amount_per_contract, sourceTokenSpotUsd)}
                                />
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : null}

                {distributionPreviewRows.length > 0 ? (
                  <div className="cad-panel-soft p-4">
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-foreground">
                          {form.stablecoin_distribution_mode === "equal" ? "Equal split preview" : "Per-contract distribution preview"}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          This is what one future subwallet would have allocated from the token swap budget before contract creation.
                        </p>
                      </div>
                      <p className="text-xs text-muted-foreground">{distributionPreviewRows.length} token{distributionPreviewRows.length === 1 ? "" : "s"}</p>
                    </div>

                    <div className="space-y-3">
                      {distributionPreviewRows.map((allocation) => (
                        <div key={allocation.token_address} className="cad-panel-muted grid gap-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_140px_110px] sm:items-center">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-sm font-semibold text-foreground">{allocation.token_symbol}</p>
                              {allocation.route_status === "No route found" ? <NoRouteBadge /> : null}
                            </div>
                            <p className="mt-1 font-mono text-[11px] text-muted-foreground">{shortAddress(allocation.token_address)}</p>
                            {allocation.route_status && allocation.route_status !== "No route found" ? (
                              <p className="mt-1 text-[11px] font-medium text-amber-700">{allocation.route_status}</p>
                            ) : null}
                            {!allocation.route_status && allocation.route_error ? (
                              <p className="mt-1 text-[11px] font-medium text-amber-700">{allocation.route_error}</p>
                            ) : null}
                          </div>
                          <div>
                            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{swapBudgetAssetSymbol} per contract</p>
                            <p className="mt-1 text-sm font-semibold text-foreground">
                              {formatAmount(allocation.weth_amount_per_contract)} {swapBudgetAssetSymbol}
                            </p>
                            <p className="mt-1 text-[11px] font-medium text-sky-700">
                              {formatUsd(getUsdValue(allocation.weth_amount_per_contract, sourceTokenSpotUsd))}
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
              <div className="cad-panel-soft px-4 py-3 text-sm text-muted-foreground">
                {locale === "en" ? "No token swap is included in this template." : locale === "zn" ? "此模板未包含代币兑换。" : "Mẫu này chưa bao gồm swap token."}
              </div>
            )}
          </SectionCard>

          <SectionCard
            title="Swap Protection"
            description={currentOptions?.hints.swap_settings_note ?? "Set the slippage guardrail and optional swap fee tier for this template."}
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
                      Used to calculate the minimum received amount for each swap route.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <p className="text-sm font-medium text-foreground">Swap fee tier</p>
                    <div className="flex flex-wrap gap-2">
                      {currentOptions?.fee_tiers.map((option) => (
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
                      {`Primary routing uses ${primaryBackendLabel}${fallbackBackendLabels.length > 0 ? ` with fallback ${fallbackBackendLabels.join(" -> ")}` : ""}. Leave this on auto unless you know you want to force a specific V3 pool fee.`}
                    </p>
                  </div>
                </div>
              </>
            ) : (
              <div className="cad-panel-soft px-4 py-3 text-sm text-muted-foreground">
                Swap protection becomes active when this template includes a token swap route.
              </div>
            )}
          </SectionCard>

          <SectionCard
            title="Direct Funding"
            description={`Fund BatchTreasuryDistributor directly with ${nativeSymbol} and ${wrappedNativeSymbol}.`}
          >
            <div className="cad-panel-soft px-4 py-3 text-sm text-foreground/80">
              {`The main wallet sends direct contract ${nativeSymbol} and direct contract ${wrappedNativeSymbol} into BatchTreasuryDistributor after deployment.`}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label htmlFor="direct-contract-eth" className="text-sm font-medium text-foreground">
                  {`Direct ${nativeSymbol} distributor funding`}
                </label>
                <Input
                  id="direct-contract-eth"
                  type="number"
                  min="0"
                  step="0.0001"
                  value={form.direct_contract_native_eth_per_contract}
                  onChange={(event) => setForm((current) => ({ ...current, direct_contract_native_eth_per_contract: event.target.value }))}
                />
                <p className="text-xs text-muted-foreground">
                  {`Optional. After deployment, the main wallet sends this ${nativeSymbol} directly into BatchTreasuryDistributor as one of the funded treasury assets.`}
                </p>
                <LiveValueHint label="Live value" value={directContractNativeEthUsdLabel} />
              </div>

              <div className="space-y-2">
                <label htmlFor="direct-weth" className="text-sm font-medium text-foreground">
                  {`Direct ${wrappedNativeSymbol} distributor funding`}
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
                  {`Optional. After deployment, the main wallet provides this ${wrappedNativeSymbol} to BatchTreasuryDistributor. Existing main-wallet ${wrappedNativeSymbol} is used first, and any shortfall is wrapped on the main wallet.`}
                </p>
                <LiveValueHint label="Live value" value={directWethUsdLabel} />
              </div>
            </div>
          </SectionCard>

          <SectionCard
            title={locale === "en" ? "Summary" : locale === "zn" ? "摘要" : "Tóm tắt"}
            description={locale === "en" ? "Per contract." : locale === "zn" ? "按单个合约计算。" : "Theo từng hợp đồng."}
          >
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
              <div className="cad-panel-muted px-4 py-3">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Gas</p>
                <p className="mt-1 text-sm font-semibold text-foreground">{formatAmount(form.gas_reserve_eth_per_contract)} {nativeSymbol}</p>
                <p className="mt-1 text-[11px] font-medium text-sky-700">{formatUsd(ethUsdLabel)}</p>
              </div>
              <div className="cad-panel-muted px-4 py-3">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Swap</p>
                <p className="mt-1 text-sm font-semibold text-foreground">{formatAmount(swapBudgetValue)} {swapBudgetAssetSymbol}</p>
                <p className="mt-1 text-[11px] font-medium text-sky-700">{formatUsd(swapBudgetUsdLabel)}</p>
              </div>
              <div className="cad-panel-muted px-4 py-3">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{`Contract ${nativeSymbol}`}</p>
                <p className="mt-1 text-sm font-semibold text-foreground">{formatAmount(form.direct_contract_native_eth_per_contract)} {nativeSymbol}</p>
                <p className="mt-1 text-[11px] font-medium text-sky-700">{formatUsd(directContractNativeEthUsdLabel)}</p>
              </div>
              <div className="cad-panel-muted px-4 py-3">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{`Contract ${wrappedNativeSymbol}`}</p>
                <p className="mt-1 text-sm font-semibold text-foreground">{formatAmount(form.direct_contract_weth_per_contract)} {wrappedNativeSymbol}</p>
                <p className="mt-1 text-[11px] font-medium text-sky-700">{formatUsd(directWethUsdLabel)}</p>
              </div>
              <div className="cad-panel-muted px-4 py-3">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Top-up</p>
                <p className="mt-1 text-sm font-semibold text-foreground">
                  {topUpEnabled
                    ? topUpHasSingleValue
                      ? `${formatAmount(form.auto_top_up_target_eth)} ${nativeSymbol}`
                      : `${formatAmount(form.auto_top_up_threshold_eth)} -> ${formatAmount(form.auto_top_up_target_eth)} ${nativeSymbol}`
                    : "Off"}
                </p>
                <p className="mt-1 text-[11px] font-medium text-sky-700">
                  {topUpEnabled
                    ? topUpHasSingleValue
                      ? `${formatUsd(topUpTargetUsdLabel)}`
                      : `${formatUsd(topUpThresholdUsdLabel)} -> ${formatUsd(topUpTargetUsdLabel)}`
                    : "--"}
                </p>
              </div>
              <div className="cad-panel-muted px-4 py-3">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Slippage</p>
                <p className="mt-1 text-sm font-semibold text-foreground">{formatAmount(form.slippage_percent)}%</p>
              </div>
            </div>

            <div className="cad-panel-soft px-4 py-3 text-sm text-muted-foreground">
              {swapBudgetValue > 0
                ? swapSourceMode === "native"
                  ? `${wrappedNativeSymbol} will be wrapped inside each sub-wallet as needed for token swaps.`
                  : swapSourceMode === "wrapped_native"
                    ? `${wrappedNativeSymbol} must be funded directly into each sub-wallet for token swaps.`
                    : `${swapBudgetAssetSymbol} must already be on the main wallet and will be funded directly into each sub-wallet for token swaps.`
                : directContractWrappedValue > 0
                  ? `${wrappedNativeSymbol} is only required for direct contract funding in this template.`
                  : `No swap-source funding is required.`}
            </div>

            <div className="cad-panel-soft px-4 py-3 text-sm text-muted-foreground">
              Fee tier: {currentOptions?.fee_tiers.find((option) => option.value === form.fee_tier)?.label ?? currentOptions?.fee_tiers[0]?.label ?? "Auto"}
            </div>

            <div className="cad-panel-soft px-4 py-3 text-sm text-muted-foreground">
              Top-up: {topUpEnabled
                ? topUpHasSingleValue
                  ? `${formatAmount(form.auto_top_up_target_eth)} ${nativeSymbol}`
                  : `${formatAmount(form.auto_top_up_threshold_eth)} -> ${formatAmount(form.auto_top_up_target_eth)} ${nativeSymbol}`
                : "Off"}
            </div>

            <div className="cad-panel-soft px-4 py-3 text-sm text-muted-foreground">
              Test batch send: {form.test_auto_execute_after_funding ? "On" : "Off"}
            </div>

            <div className="cad-panel-soft px-4 py-3 text-sm text-muted-foreground">
              Testing recipient: {form.recipient_address || "Not set"}
            </div>

            <div className="cad-panel-soft px-4 py-3 text-sm text-muted-foreground">
              Return wallet: {form.return_wallet_address || "Not set"}
            </div>

            {form.test_auto_execute_after_funding &&
            form.recipient_address &&
            form.return_wallet_address &&
            form.recipient_address.toLowerCase() !== form.return_wallet_address.toLowerCase() ? (
              <div className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
                Testing batch send goes to the testing recipient. Use the same address if funds should end at the return wallet during a test.
              </div>
            ) : null}

            <div className="cad-panel-accent px-4 py-3 text-sm text-muted-foreground">
              Wallet balance is checked before any sub-wallet is created.
            </div>
          </SectionCard>

          {saveError ? <p className="text-sm text-destructive">{saveError}</p> : null}

          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {locale === "en" ? "Cancel" : locale === "zn" ? "取消" : "Hủy"}
            </Button>
            <Button type="submit" disabled={saving || !currentOptions}>
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {locale === "en" ? "Saving..." : locale === "zn" ? "保存中..." : "Đang lưu..."}
                </>
              ) : template ? (
                locale === "en" ? "Save changes" : locale === "zn" ? "保存更改" : "Lưu thay đổi"
              ) : (
                locale === "en" ? "Save template" : locale === "zn" ? "保存模板" : "Lưu mẫu"
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
