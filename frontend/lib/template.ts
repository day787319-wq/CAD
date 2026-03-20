"use client";

import { API_URL } from "@/lib/api";

export const TEMPLATE_API_URL = API_URL;

export type StablecoinOption = {
  symbol: string;
  name: string;
  address: string;
  decimals?: number | null;
  official_source?: string | null;
};

export type StablecoinAllocation = {
  token_symbol: string;
  token_address: string;
  percent?: string | null;
  weth_amount_per_contract?: string | null;
};

export type Template = {
  id: string;
  name: string;
  template_version: "v2";
  gas_reserve_eth_per_contract: string;
  swap_budget_eth_per_contract: string;
  direct_contract_eth_per_contract: string;
  direct_contract_weth_per_contract: string;
  slippage_percent: string;
  fee_tier: number | null;
  auto_wrap_eth_to_weth: boolean;
  stablecoin_distribution_mode: "none" | "equal" | "manual_percent" | "manual_weth_amount";
  stablecoin_allocations: StablecoinAllocation[];
  notes: string | null;
  is_active?: boolean;
  created_at?: string;
  source?: string;
};

export type TemplateOptions = {
  stablecoins: StablecoinOption[];
  distribution_modes: Array<{
    value: Template["stablecoin_distribution_mode"];
    label: string;
    description: string;
  }>;
  fee_tiers: Array<{
    value: number | null;
    label: string;
    description: string;
  }>;
  defaults: {
    template_version: "v2";
    gas_reserve_eth_per_contract: string;
    swap_budget_eth_per_contract: string;
    direct_contract_eth_per_contract: string;
    direct_contract_weth_per_contract: string;
    slippage_percent: string;
    fee_tier: number | null;
    auto_wrap_eth_to_weth: boolean;
    stablecoin_distribution_mode: Template["stablecoin_distribution_mode"];
    stablecoin_allocations: StablecoinAllocation[];
  };
  hints: {
    summary: string;
    swap_budget_note: string;
    swap_settings_note?: string;
  };
};

export type TemplateEditorForm = {
  name: string;
  gas_reserve_eth_per_contract: string;
  swap_budget_eth_per_contract: string;
  direct_contract_eth_per_contract: string;
  direct_contract_weth_per_contract: string;
  slippage_percent: string;
  fee_tier: number | null;
  auto_wrap_eth_to_weth: boolean;
  stablecoin_distribution_mode: Template["stablecoin_distribution_mode"];
  stablecoin_allocations: StablecoinAllocation[];
  notes: string;
};

export type TemplatePreview = {
  template_id: string;
  wallet_id: string;
  contract_count: number;
  slippage_percent: string;
  fee_tier: number | null;
  can_proceed: boolean;
  shortfall_reason: string | null;
  effective_weth_available: string;
  balances: {
    available_eth: string;
    available_weth: string;
    wrappable_eth: string;
    remaining_eth_after_funding: string;
    remaining_weth_after_funding: string;
  };
  funding: {
    eth_sent_to_subwallets: string;
    weth_sent_to_subwallets: string;
    weth_from_main_wallet: string;
    weth_from_wrapped_eth: string;
    total_eth_deducted: string;
  };
  per_contract: {
    gas_reserve_eth: string;
    swap_budget_eth: string;
    direct_contract_eth: string;
    direct_contract_weth: string;
    required_eth: string;
    required_weth: string;
    total_eth_if_no_weth_available: string;
  };
  totals: {
    required_eth_total: string;
    required_weth_total: string;
    gas_reserve_eth_total: string;
    swap_budget_eth_total: string;
    direct_contract_eth_total: string;
    direct_contract_weth_total: string;
    total_eth_if_no_weth_available_total: string;
    required_eth_total_usd: string | null;
    required_weth_total_usd: string | null;
    combined_cost_usd: string | null;
    stablecoin_output_total_usd: string | null;
  };
  stablecoin_distribution_mode: Template["stablecoin_distribution_mode"];
  stablecoin_quotes: TemplateStablecoinQuote[];
  price_snapshot: TemplatePriceSnapshot;
};

export type TemplateWalletSupportPreview = {
  template_id: string;
  wallet_id: string;
  contract_count: number;
  slippage_percent: string;
  fee_tier: number | null;
  can_proceed: boolean;
  shortfall_reason: string | null;
  effective_weth_available: string;
  balances: {
    available_eth: string;
    available_weth: string;
    wrappable_eth: string;
    remaining_eth_after_funding: string;
    remaining_weth_after_funding: string;
  };
  funding: {
    eth_sent_to_subwallets: string;
    weth_sent_to_subwallets: string;
    weth_from_main_wallet: string;
    weth_from_wrapped_eth: string;
    total_eth_deducted: string;
  };
  execution: {
    funding_network_fee_eth: string;
    estimated_gas_price_gwei: string | null;
    funding_transaction_count: number;
    total_eth_required_with_fees: string;
    remaining_eth_after_run: string;
  };
  per_contract: {
    gas_reserve_eth: string;
    swap_budget_eth: string;
    direct_contract_eth: string;
    direct_contract_weth: string;
    required_eth: string;
    required_weth: string;
    total_eth_if_no_weth_available: string;
  };
  totals: {
    required_eth_total: string;
    required_weth_total: string;
    gas_reserve_eth_total: string;
    swap_budget_eth_total: string;
    direct_contract_eth_total: string;
    direct_contract_weth_total: string;
    total_eth_if_no_weth_available_total: string;
  };
  stablecoin_distribution_mode: Template["stablecoin_distribution_mode"];
  stablecoin_routes: Array<{
    token_symbol: string;
    token_address: string;
    percent: string | null;
    per_contract_weth_amount: string | null;
    total_weth_amount: string | null;
  }>;
};

export type TemplateStablecoinQuote = {
  token_symbol: string;
  token_name: string;
  token_address: string;
  percent: string | null;
  per_contract_weth_amount: string | null;
  total_weth_amount: string | null;
  per_contract_weth_usd: string | null;
  total_weth_usd: string | null;
  per_contract_output: string | null;
  total_output: string | null;
  per_contract_min_output: string | null;
  total_min_output: string | null;
  token_usd: string | null;
  per_contract_output_usd: string | null;
  total_output_usd: string | null;
  per_contract_min_output_usd: string | null;
  total_min_output_usd: string | null;
  quote: {
    available: boolean;
    token_in: string;
    token_out: string;
    amount_in?: string;
    amount_out?: string;
    min_amount_out?: string;
    fee_tier?: number | null;
    source?: string;
    slippage_percent?: string;
    error?: string | null;
  };
};

export type TemplatePriceSnapshot = {
  available: boolean;
  eth_usd: string | null;
  weth_usd: string | null;
  token_prices: Record<string, string | null>;
  fetched_at?: string | null;
  error?: string | null;
};

export type TemplateMarketCheck = {
  template_id: string;
  template_name: string;
  contract_count: number;
  slippage_percent: string;
  fee_tier: number | null;
  per_contract: TemplatePreview["per_contract"];
  totals: TemplatePreview["totals"];
  stablecoin_distribution_mode: Template["stablecoin_distribution_mode"];
  stablecoin_quotes: TemplateStablecoinQuote[];
  price_snapshot: TemplatePriceSnapshot;
};

export function formatAmount(value: string | number | null | undefined) {
  const numeric = typeof value === "number" ? value : Number.parseFloat(value ?? "");
  if (!Number.isFinite(numeric)) return "0";
  return numeric.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 });
}

export function formatUsd(value: string | null | undefined) {
  const numeric = Number.parseFloat(value ?? "");
  if (!Number.isFinite(numeric)) return "--";
  return numeric.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatRelativeTimestamp(value: string | null | undefined) {
  if (!value) return "Unavailable";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unavailable";
  return date.toLocaleString();
}

export function formatFeeTier(value: number | null | undefined) {
  if (value === null || value === undefined) return "Auto best route";
  if (value === 500) return "0.05%";
  if (value === 3000) return "0.30%";
  if (value === 10000) return "1.00%";
  return `${value}`;
}

export function shortAddress(value: string) {
  return `${value.slice(0, 8)}...${value.slice(-6)}`;
}

function toFiniteNumber(value: string | number | null | undefined) {
  const numeric = typeof value === "number" ? value : Number.parseFloat(value ?? "");
  return Number.isFinite(numeric) ? numeric : null;
}

function toAmountString(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "0";
  const normalized = Number(value.toFixed(12));
  return normalized === 0 ? "0" : `${normalized}`;
}

function toDistributionValue(value: number | null) {
  return value === null ? null : value.toFixed(6);
}

export function getStablecoinDistributionRows(input: {
  swap_budget_eth_per_contract: string;
  stablecoin_distribution_mode: Template["stablecoin_distribution_mode"];
  stablecoin_allocations: StablecoinAllocation[];
}) {
  const allocations = input.stablecoin_allocations ?? [];
  if (input.stablecoin_distribution_mode === "none" || allocations.length === 0) return [];

  const swapBudget = toFiniteNumber(input.swap_budget_eth_per_contract) ?? 0;

  if (input.stablecoin_distribution_mode === "equal") {
    const percent = 100 / allocations.length;
    const wethAmountPerContract = swapBudget / allocations.length;
    return allocations.map((allocation) => ({
      token_symbol: allocation.token_symbol,
      token_address: allocation.token_address,
      percent: toDistributionValue(percent),
      weth_amount_per_contract: toDistributionValue(wethAmountPerContract),
    }));
  }

  if (input.stablecoin_distribution_mode === "manual_percent") {
    return allocations.map((allocation) => {
      const percent = toFiniteNumber(allocation.percent);
      const wethAmountPerContract = percent === null ? null : swapBudget * (percent / 100);
      return {
        token_symbol: allocation.token_symbol,
        token_address: allocation.token_address,
        percent: toDistributionValue(percent),
        weth_amount_per_contract: toDistributionValue(wethAmountPerContract),
      };
    });
  }

  return allocations.map((allocation) => {
    const wethAmountPerContract = toFiniteNumber(allocation.weth_amount_per_contract);
    const percent = wethAmountPerContract === null || swapBudget <= 0 ? null : (wethAmountPerContract / swapBudget) * 100;
    return {
      token_symbol: allocation.token_symbol,
      token_address: allocation.token_address,
      percent: toDistributionValue(percent),
      weth_amount_per_contract: toDistributionValue(wethAmountPerContract),
    };
  });
}

export function defaultTemplateForm(options: TemplateOptions | null): TemplateEditorForm {
  return {
    name: "",
    gas_reserve_eth_per_contract: options?.defaults.gas_reserve_eth_per_contract ?? "0.02",
    swap_budget_eth_per_contract: options?.defaults.swap_budget_eth_per_contract ?? "0",
    direct_contract_eth_per_contract: options?.defaults.direct_contract_eth_per_contract ?? "0",
    direct_contract_weth_per_contract: options?.defaults.direct_contract_weth_per_contract ?? "0",
    slippage_percent: options?.defaults.slippage_percent ?? "0.5",
    fee_tier: options?.defaults.fee_tier ?? null,
    auto_wrap_eth_to_weth: options?.defaults.auto_wrap_eth_to_weth ?? true,
    stablecoin_distribution_mode: options?.defaults.stablecoin_distribution_mode ?? "none",
    stablecoin_allocations: options?.defaults.stablecoin_allocations.map((allocation) => ({ ...allocation })) ?? [],
    notes: "",
  };
}

export function templateToForm(template: Template): TemplateEditorForm {
  return {
    name: template.name,
    gas_reserve_eth_per_contract: template.gas_reserve_eth_per_contract,
    swap_budget_eth_per_contract: template.swap_budget_eth_per_contract,
    direct_contract_eth_per_contract: template.direct_contract_eth_per_contract,
    direct_contract_weth_per_contract: template.direct_contract_weth_per_contract,
    slippage_percent: template.slippage_percent,
    fee_tier: template.fee_tier,
    auto_wrap_eth_to_weth: template.auto_wrap_eth_to_weth,
    stablecoin_distribution_mode: template.stablecoin_distribution_mode,
    stablecoin_allocations: template.stablecoin_allocations.map((allocation) => ({ ...allocation })),
    notes: template.notes ?? "",
  };
}

export function buildTemplateWalletSupportPreview(input: {
  template: Template;
  wallet: {
    id: string;
    eth_balance: number | null;
    weth_balance: number | null;
    funding_gas_price_gwei?: number | null;
  };
  contractCount: number;
}): TemplateWalletSupportPreview {
  const { template, wallet, contractCount } = input;

  const gasReserve = toFiniteNumber(template.gas_reserve_eth_per_contract) ?? 0;
  const swapBudget = toFiniteNumber(template.swap_budget_eth_per_contract) ?? 0;
  const directEth = toFiniteNumber(template.direct_contract_eth_per_contract) ?? 0;
  const directWeth = toFiniteNumber(template.direct_contract_weth_per_contract) ?? 0;

  const requiredEthPerContract = gasReserve + directEth;
  const requiredWethPerContract = swapBudget + directWeth;
  const requiredEthTotal = requiredEthPerContract * contractCount;
  const requiredWethTotal = requiredWethPerContract * contractCount;

  const availableEth = wallet.eth_balance ?? 0;
  const availableWeth = wallet.weth_balance ?? 0;
  const autoWrap = template.auto_wrap_eth_to_weth;
  const wethFromMainWallet = Math.min(availableWeth, requiredWethTotal);
  const wethShortfall = Math.max(requiredWethTotal - wethFromMainWallet, 0);
  const gasPriceGwei = wallet.funding_gas_price_gwei ?? null;
  const gasPriceEth = gasPriceGwei === null ? 0 : gasPriceGwei / 1_000_000_000;
  const fundingTransactionCount =
    (autoWrap && wethShortfall > 0 ? 1 : 0) +
    (requiredEthPerContract > 0 ? contractCount : 0) +
    (requiredWethPerContract > 0 ? contractCount : 0);
  const fundingNetworkFeeEth = fundingTransactionCount > 0
    ? gasPriceEth * ((autoWrap && wethShortfall > 0 ? 120000 : 0) + (requiredEthPerContract > 0 ? 21000 * contractCount : 0) + (requiredWethPerContract > 0 ? 90000 * contractCount : 0))
    : 0;
  const wrappableEth = autoWrap ? Math.max(availableEth - requiredEthTotal - fundingNetworkFeeEth, 0) : 0;
  const effectiveWethAvailable = availableWeth + wrappableEth;
  const wethFromWrappedEth = autoWrap ? wethShortfall : 0;
  const totalEthDeducted = requiredEthTotal + wethFromWrappedEth;
  const totalEthRequiredWithFees = totalEthDeducted + fundingNetworkFeeEth;
  const remainingEthAfterFunding = availableEth - totalEthDeducted;
  const remainingEthAfterRun = availableEth - totalEthRequiredWithFees;
  const remainingWethAfterFunding = availableWeth - wethFromMainWallet;
  const canProceed = autoWrap
    ? availableEth >= totalEthRequiredWithFees
    : availableEth >= requiredEthTotal + fundingNetworkFeeEth && availableWeth >= requiredWethTotal;

  let shortfallReason: string | null = null;
  if (availableEth < requiredEthTotal + fundingNetworkFeeEth && availableWeth >= requiredWethTotal) {
    shortfallReason =
      `Not enough ETH in the main wallet. Need ${toAmountString((requiredEthTotal + fundingNetworkFeeEth) - availableEth)} more ETH ` +
      "to cover direct funding and the network fee for the funding transactions.";
  } else if (availableEth < requiredEthTotal) {
    shortfallReason =
      `Not enough ETH in the main wallet. Need ${toAmountString(requiredEthTotal - availableEth)} more ETH ` +
      "to fund gas reserve and direct ETH for the new subwallets.";
  } else if (!autoWrap && availableWeth < requiredWethTotal) {
    shortfallReason =
      `Not enough WETH in the main wallet. Need ${toAmountString(requiredWethTotal - availableWeth)} more WETH because auto-wrap is disabled.`;
  } else if (autoWrap && availableEth < totalEthRequiredWithFees) {
    shortfallReason =
      `Not enough ETH in the main wallet. Need ${toAmountString(totalEthRequiredWithFees - availableEth)} more ETH ` +
      "to wrap into WETH, fund the new subwallets, and cover network fees.";
  }

  const stablecoinRoutes = getStablecoinDistributionRows(template).map((allocation) => {
    const perContractWethAmount = toFiniteNumber(allocation.weth_amount_per_contract);
    return {
      token_symbol: allocation.token_symbol,
      token_address: allocation.token_address,
      percent: allocation.percent ?? null,
      per_contract_weth_amount: allocation.weth_amount_per_contract ?? null,
      total_weth_amount:
        perContractWethAmount === null ? null : toAmountString(perContractWethAmount * contractCount),
    };
  });

  return {
    template_id: template.id,
    wallet_id: wallet.id,
    contract_count: contractCount,
    slippage_percent: template.slippage_percent,
    fee_tier: template.fee_tier,
    can_proceed: canProceed,
    shortfall_reason: shortfallReason,
    balances: {
      available_eth: toAmountString(availableEth),
      available_weth: toAmountString(availableWeth),
      wrappable_eth: toAmountString(wrappableEth),
      remaining_eth_after_funding: toAmountString(remainingEthAfterFunding),
      remaining_weth_after_funding: toAmountString(remainingWethAfterFunding),
    },
    funding: {
      eth_sent_to_subwallets: toAmountString(requiredEthTotal),
      weth_sent_to_subwallets: toAmountString(requiredWethTotal),
      weth_from_main_wallet: toAmountString(wethFromMainWallet),
      weth_from_wrapped_eth: toAmountString(wethFromWrappedEth),
      total_eth_deducted: toAmountString(totalEthDeducted),
    },
    execution: {
      funding_network_fee_eth: toAmountString(fundingNetworkFeeEth),
      estimated_gas_price_gwei: gasPriceGwei === null ? null : toAmountString(gasPriceGwei),
      funding_transaction_count: fundingTransactionCount,
      total_eth_required_with_fees: toAmountString(totalEthRequiredWithFees),
      remaining_eth_after_run: toAmountString(remainingEthAfterRun),
    },
    effective_weth_available: toAmountString(effectiveWethAvailable),
    per_contract: {
      gas_reserve_eth: toAmountString(gasReserve),
      swap_budget_eth: toAmountString(swapBudget),
      direct_contract_eth: toAmountString(directEth),
      direct_contract_weth: toAmountString(directWeth),
      required_eth: toAmountString(requiredEthPerContract),
      required_weth: toAmountString(requiredWethPerContract),
      total_eth_if_no_weth_available: toAmountString(requiredEthPerContract + requiredWethPerContract),
    },
    totals: {
      required_eth_total: toAmountString(requiredEthTotal),
      required_weth_total: toAmountString(requiredWethTotal),
      gas_reserve_eth_total: toAmountString(gasReserve * contractCount),
      swap_budget_eth_total: toAmountString(swapBudget * contractCount),
      direct_contract_eth_total: toAmountString(directEth * contractCount),
      direct_contract_weth_total: toAmountString(directWeth * contractCount),
      total_eth_if_no_weth_available_total: toAmountString((requiredEthPerContract + requiredWethPerContract) * contractCount),
    },
    stablecoin_distribution_mode: template.stablecoin_distribution_mode,
    stablecoin_routes: stablecoinRoutes,
  };
}
