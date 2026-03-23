"use client";

import { API_URL } from "@/lib/api";
import {
  defaultLocale,
  localeStorageKey,
  localeTagByLocale,
  normalizeLocale,
  translateText,
  type SupportedLocale,
} from "@/lib/i18n";

export const TEMPLATE_API_URL = API_URL;
const ETH_TRANSFER_GAS_UNITS = 21_000;
const WRAP_GAS_UNITS = 120_000;
const APPROVE_GAS_UNITS = 70_000;
const SWAP_GAS_UNITS = 350_000;
const TOKEN_TRANSFER_GAS_UNITS = 90_000;
const DISTRIBUTOR_DEPLOY_GAS_UNITS = 900_000;
const DISTRIBUTOR_EXECUTE_GAS_UNITS = 180_000;

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

export type TemplateChain = "ethereum_mainnet" | "bnb";

export type Template = {
  id: string;
  name: string;
  chain: TemplateChain;
  template_version: "v2";
  recipient_address?: string | null;
  return_wallet_address?: string | null;
  test_auto_execute_after_funding: boolean;
  gas_reserve_eth_per_contract: string;
  swap_budget_eth_per_contract: string;
  direct_contract_eth_per_contract: string;
  direct_contract_native_eth_per_contract: string;
  direct_contract_weth_per_contract: string;
  auto_top_up_enabled: boolean;
  auto_top_up_threshold_eth: string;
  auto_top_up_target_eth: string;
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
  available_chains: Array<{
    value: TemplateChain;
    label: string;
    native_symbol: string;
    wrapped_native_symbol: string;
    quote_supported: boolean;
  }>;
  selected_chain: TemplateChain;
  native_symbol: string;
  wrapped_native_symbol: string;
  quote_supported: boolean;
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
    chain: TemplateChain;
    template_version: "v2";
    recipient_address?: string | null;
    return_wallet_address?: string | null;
    test_auto_execute_after_funding: boolean;
    gas_reserve_eth_per_contract: string;
    swap_budget_eth_per_contract: string;
    direct_contract_eth_per_contract: string;
    direct_contract_native_eth_per_contract: string;
    direct_contract_weth_per_contract: string;
    auto_top_up_enabled: boolean;
    auto_top_up_threshold_eth: string;
    auto_top_up_target_eth: string;
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
    auto_top_up_note?: string;
    return_wallet_note?: string;
    test_auto_execute_note?: string;
  };
  contract_sync?: {
    enabled: boolean;
    main_wallet_registry_enabled: boolean;
    sub_wallet_registry_enabled: boolean;
    message: string;
  };
};

export type TemplateEditorForm = {
  name: string;
  chain: TemplateChain;
  recipient_address: string;
  return_wallet_address: string;
  test_auto_execute_after_funding: boolean;
  gas_reserve_eth_per_contract: string;
  swap_budget_eth_per_contract: string;
  direct_contract_eth_per_contract: string;
  direct_contract_native_eth_per_contract: string;
  direct_contract_weth_per_contract: string;
  auto_top_up_enabled: boolean;
  auto_top_up_threshold_eth: string;
  auto_top_up_target_eth: string;
  slippage_percent: string;
  fee_tier: number | null;
  auto_wrap_eth_to_weth: boolean;
  stablecoin_distribution_mode: Template["stablecoin_distribution_mode"];
  stablecoin_allocations: StablecoinAllocation[];
  notes: string;
};

export type TemplateAutoTopUpPreview = {
  enabled: boolean;
  threshold_eth: string;
  target_eth: string;
  projected_post_wrap_eth_per_contract: string;
  projected_triggered: boolean;
  projected_eth_per_contract: string;
  projected_total_eth: string;
  projected_transaction_count: number;
  projected_network_fee_eth: string;
};

export type TemplatePreview = {
  template_id: string;
  wallet_id: string;
  contract_count: number;
  return_wallet_address?: string | null;
  test_auto_execute_after_funding?: boolean;
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
    auto_top_up_eth_reserved?: string;
    total_eth_deducted: string;
  };
  per_contract: {
    gas_reserve_eth: string;
    swap_budget_eth: string;
    direct_contract_eth: string;
    direct_subwallet_eth?: string;
    direct_contract_native_eth?: string;
    direct_contract_weth: string;
    auto_top_up_threshold_eth?: string;
    auto_top_up_target_eth?: string;
    projected_auto_top_up_eth?: string;
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
    direct_subwallet_eth_total?: string;
    direct_contract_native_eth_total?: string;
    direct_contract_weth_total: string;
    projected_auto_top_up_eth_total?: string;
    total_eth_if_no_weth_available_total: string;
    required_eth_total_usd: string | null;
    required_weth_total_usd: string | null;
    combined_cost_usd: string | null;
    stablecoin_output_total_usd: string | null;
  };
  auto_top_up?: TemplateAutoTopUpPreview;
  stablecoin_distribution_mode: Template["stablecoin_distribution_mode"];
  stablecoin_quotes: TemplateStablecoinQuote[];
  price_snapshot: TemplatePriceSnapshot;
  contract_sync?: {
    enabled: boolean;
    main_wallet_registry_enabled: boolean;
    sub_wallet_registry_enabled: boolean;
    main_wallet_registration_required: boolean;
    expected_action_count: number;
    message: string;
  };
};

export type TemplateWalletSupportPreview = {
  template_id: string;
  wallet_id: string;
  contract_count: number;
  return_wallet_address?: string | null;
  test_auto_execute_after_funding?: boolean;
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
    auto_top_up_eth_reserved?: string;
    total_eth_deducted: string;
  };
  execution: {
    funding_network_fee_eth: string;
    top_up_network_fee_eth?: string;
    main_wallet_network_fee_eth?: string;
    local_execution_gas_fee_eth?: string;
    local_execution_gas_fee_per_wallet_eth?: string;
    contract_sync_network_fee_eth: string;
    total_network_fee_eth: string;
    estimated_gas_price_gwei: string | null;
    estimated_gas_units?: number | null;
    execute_gas_units_per_wallet?: number | null;
    return_sweep_gas_units_per_wallet?: number | null;
    local_execution_gas_units_per_wallet?: number | null;
    funding_transaction_count: number;
    top_up_transaction_count?: number;
    execute_transaction_count?: number;
    return_sweep_transaction_count?: number;
    wrap_transaction_count: number;
    approval_transaction_count: number;
    swap_transaction_count: number;
    deployment_transaction_count: number;
    contract_funding_transaction_count: number;
    contract_funding_gas_units_per_wallet?: number | null;
    contract_sync_transaction_count: number;
    total_transaction_count: number;
    total_eth_required_with_fees: string;
    remaining_eth_after_run: string;
  };
  per_contract: {
    gas_reserve_eth: string;
    swap_budget_eth: string;
    direct_contract_eth: string;
    direct_subwallet_eth?: string;
    direct_contract_native_eth?: string;
    direct_contract_weth: string;
    auto_top_up_threshold_eth?: string;
    auto_top_up_target_eth?: string;
    projected_auto_top_up_eth?: string;
    configured_unwrapped_eth?: string;
    minimum_unwrapped_eth?: string;
    auto_added_gas_buffer_eth?: string;
    local_execution_gas_fee_eth?: string;
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
    direct_subwallet_eth_total?: string;
    direct_contract_native_eth_total?: string;
    direct_contract_weth_total: string;
    projected_auto_top_up_eth_total?: string;
    configured_unwrapped_eth_total?: string;
    minimum_unwrapped_eth_total?: string;
    auto_added_gas_buffer_eth_total?: string;
    local_execution_gas_fee_eth_total?: string;
    total_eth_if_no_weth_available_total: string;
  };
  auto_top_up?: TemplateAutoTopUpPreview;
  stablecoin_distribution_mode: Template["stablecoin_distribution_mode"];
  stablecoin_routes: Array<{
    token_symbol: string;
    token_address: string;
    percent: string | null;
    per_contract_weth_amount: string | null;
    total_weth_amount: string | null;
  }>;
  contract_sync: {
    enabled: boolean;
    main_wallet_registry_enabled: boolean;
    sub_wallet_registry_enabled: boolean;
    main_wallet_registration_required: boolean;
    expected_action_count: number;
    message: string;
  };
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

export type TemplateMarketCheckTotals = TemplatePreview["totals"] & {
  projected_auto_top_up_eth_total_usd?: string | null;
  total_network_fee_eth?: string | null;
  total_network_fee_eth_usd?: string | null;
  total_eth_required_with_fees?: string | null;
  total_eth_required_with_fees_usd?: string | null;
};

export type TemplateMarketCheck = {
  template_id: string;
  template_name: string;
  contract_count: number;
  slippage_percent: string;
  fee_tier: number | null;
  per_contract: TemplatePreview["per_contract"];
  totals: TemplateMarketCheckTotals;
  stablecoin_distribution_mode: Template["stablecoin_distribution_mode"];
  stablecoin_quotes: TemplateStablecoinQuote[];
  price_snapshot: TemplatePriceSnapshot;
};

export function formatAmount(value: string | number | null | undefined) {
  const numeric = typeof value === "number" ? value : Number.parseFloat(value ?? "");
  if (!Number.isFinite(numeric)) return "0";
  return numeric.toLocaleString(getRuntimeLocaleTag(), { minimumFractionDigits: 2, maximumFractionDigits: 6 });
}

export function formatUsd(value: string | null | undefined) {
  const numeric = Number.parseFloat(value ?? "");
  if (!Number.isFinite(numeric)) return "--";
  return numeric.toLocaleString(getRuntimeLocaleTag(), {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

const DASHBOARD_TIME_ZONE = "Asia/Phnom_Penh";
const DASHBOARD_TIME_ZONE_LABEL = "UTC+7";

function getRuntimeLocale(): SupportedLocale {
  if (typeof window === "undefined") return defaultLocale;
  return normalizeLocale(window.localStorage.getItem(localeStorageKey));
}

function getRuntimeLocaleTag() {
  return localeTagByLocale[getRuntimeLocale()];
}

function parseDashboardTimestamp(value: string) {
  const normalized = value.trim();
  const hasTimeZone = /(?:[zZ]|[+\-]\d{2}:\d{2})$/.test(normalized);
  return new Date(hasTimeZone ? normalized : `${normalized}Z`);
}

export function formatRelativeTimestamp(value: string | null | undefined) {
  const locale = getRuntimeLocale();
  if (!value) return translateText(locale, "Unavailable");
  const date = parseDashboardTimestamp(value);
  if (Number.isNaN(date.getTime())) return translateText(locale, "Unavailable");
  const formatted = new Intl.DateTimeFormat(getRuntimeLocaleTag(), {
    timeZone: DASHBOARD_TIME_ZONE,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  }).format(date);
  return `${formatted} ${DASHBOARD_TIME_ZONE_LABEL}`;
}

export function formatFeeTier(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return translateText(getRuntimeLocale(), "Auto best route");
  }
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
    chain: options?.defaults.chain ?? "ethereum_mainnet",
    recipient_address: options?.defaults.recipient_address ?? "",
    return_wallet_address: options?.defaults.return_wallet_address ?? "",
    test_auto_execute_after_funding: options?.defaults.test_auto_execute_after_funding ?? false,
    gas_reserve_eth_per_contract: options?.defaults.gas_reserve_eth_per_contract ?? "0.02",
    swap_budget_eth_per_contract: options?.defaults.swap_budget_eth_per_contract ?? "0",
    direct_contract_eth_per_contract: options?.defaults.direct_contract_eth_per_contract ?? "0",
    direct_contract_native_eth_per_contract: options?.defaults.direct_contract_native_eth_per_contract ?? "0",
    direct_contract_weth_per_contract: options?.defaults.direct_contract_weth_per_contract ?? "0",
    auto_top_up_enabled: options?.defaults.auto_top_up_enabled ?? false,
    auto_top_up_threshold_eth: options?.defaults.auto_top_up_threshold_eth ?? "0",
    auto_top_up_target_eth: options?.defaults.auto_top_up_target_eth ?? "0",
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
    chain: template.chain,
    recipient_address: template.recipient_address ?? "",
    return_wallet_address: template.return_wallet_address ?? "",
    test_auto_execute_after_funding: template.test_auto_execute_after_funding,
    gas_reserve_eth_per_contract: template.gas_reserve_eth_per_contract,
    swap_budget_eth_per_contract: template.swap_budget_eth_per_contract,
    direct_contract_eth_per_contract: template.direct_contract_eth_per_contract,
    direct_contract_native_eth_per_contract: template.direct_contract_native_eth_per_contract,
    direct_contract_weth_per_contract: template.direct_contract_weth_per_contract,
    auto_top_up_enabled: template.auto_top_up_enabled,
    auto_top_up_threshold_eth: template.auto_top_up_threshold_eth,
    auto_top_up_target_eth: template.auto_top_up_target_eth,
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
  const nativeSymbol = template.chain === "bnb" ? "BNB" : "ETH";
  const wrappedNativeSymbol = template.chain === "bnb" ? "WBNB" : "WETH";

  const gasReserve = toFiniteNumber(template.gas_reserve_eth_per_contract) ?? 0;
  const swapBudget = toFiniteNumber(template.swap_budget_eth_per_contract) ?? 0;
  const directEth = toFiniteNumber(template.direct_contract_eth_per_contract) ?? 0;
  const directContractNativeEth = toFiniteNumber(template.direct_contract_native_eth_per_contract) ?? 0;
  const directWeth = toFiniteNumber(template.direct_contract_weth_per_contract) ?? 0;
  const returnWalletConfigured = Boolean(template.return_wallet_address);
  const testAutoExecuteAfterFunding = template.test_auto_execute_after_funding;
  const autoTopUpEnabled = template.auto_top_up_enabled;
  const autoTopUpThreshold = toFiniteNumber(template.auto_top_up_threshold_eth) ?? 0;
  const autoTopUpTarget = toFiniteNumber(template.auto_top_up_target_eth) ?? 0;
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
  const routeCount = stablecoinRoutes.filter((route) => (toFiniteNumber(route.per_contract_weth_amount) ?? 0) > 0).length;
  const tokenFundingTargetsPerWallet = routeCount + (directWeth > 0 ? 1 : 0);
  const nativeFundingTargetsPerWallet = directContractNativeEth > 0 ? 1 : 0;
  const deploymentContractsPerWallet = tokenFundingTargetsPerWallet + nativeFundingTargetsPerWallet;
  const requiresRecipient = deploymentContractsPerWallet > 0;
  const deploymentEnabled = requiresRecipient && Boolean(template.recipient_address);
  const configuredUnwrappedEthPerContract = gasReserve + directEth;
  const requiredWethPerContract = swapBudget + directWeth;
  const returnSweepTokenTransferCountPerWallet = returnWalletConfigured ? routeCount + (requiredWethPerContract > 0 ? 1 : 0) : 0;
  const returnSweepTransactionCountPerWallet = returnWalletConfigured ? 1 + returnSweepTokenTransferCountPerWallet : 0;
  const wrapTransactionCount = requiredWethPerContract > 0 ? contractCount : 0;
  const approvalTransactionCount = routeCount > 0 ? contractCount : 0;
  const swapTransactionCount = contractCount * routeCount;
  const deploymentTransactionCount = deploymentEnabled ? contractCount * deploymentContractsPerWallet : 0;
  const contractFundingTransactionCount = deploymentEnabled ? contractCount * deploymentContractsPerWallet : 0;
  const executeTransactionCount = deploymentEnabled && testAutoExecuteAfterFunding ? contractCount * deploymentContractsPerWallet : 0;

  const availableEth = wallet.eth_balance ?? 0;
  const availableWeth = wallet.weth_balance ?? 0;
  const wethFromMainWallet = 0;
  const gasPriceGwei = wallet.funding_gas_price_gwei ?? null;
  const gasPriceEth = gasPriceGwei === null ? 0 : gasPriceGwei / 1_000_000_000;
  const deploymentGasUnitsPerWallet =
    deploymentEnabled
      ? deploymentContractsPerWallet * DISTRIBUTOR_DEPLOY_GAS_UNITS
        + tokenFundingTargetsPerWallet * TOKEN_TRANSFER_GAS_UNITS
        + nativeFundingTargetsPerWallet * ETH_TRANSFER_GAS_UNITS
      : 0;
  const localExecutionGasUnitsPerWallet =
    (requiredWethPerContract > 0 ? WRAP_GAS_UNITS : 0) +
    (routeCount > 0 ? APPROVE_GAS_UNITS : 0) +
    routeCount * SWAP_GAS_UNITS +
    deploymentGasUnitsPerWallet +
    (deploymentEnabled && testAutoExecuteAfterFunding ? deploymentContractsPerWallet * DISTRIBUTOR_EXECUTE_GAS_UNITS : 0) +
    (returnWalletConfigured ? ETH_TRANSFER_GAS_UNITS + returnSweepTokenTransferCountPerWallet * TOKEN_TRANSFER_GAS_UNITS : 0);
  const localExecutionGasFeePerWalletEth = localExecutionGasUnitsPerWallet * gasPriceEth;
  const minimumUnwrappedEthPerContract = Math.max(configuredUnwrappedEthPerContract, localExecutionGasFeePerWalletEth);
  const autoAddedGasBufferEthPerContract = Math.max(minimumUnwrappedEthPerContract - configuredUnwrappedEthPerContract, 0);
  const requiredEthPerContract = minimumUnwrappedEthPerContract + requiredWethPerContract + directContractNativeEth;
  const requiredEthTotal = requiredEthPerContract * contractCount;
  const requiredWethTotal = requiredWethPerContract * contractCount;
  const wrapGasFeePerWalletEth = (requiredWethPerContract > 0 ? WRAP_GAS_UNITS : 0) * gasPriceEth;
  const projectedPostWrapEthPerContract = Math.max(requiredEthPerContract - requiredWethPerContract - directContractNativeEth - wrapGasFeePerWalletEth, 0);
  const projectedAutoTopUpTriggered =
    autoTopUpEnabled &&
    (requiredWethPerContract > 0 || directContractNativeEth > 0) &&
    projectedPostWrapEthPerContract <= autoTopUpThreshold &&
    autoTopUpTarget > projectedPostWrapEthPerContract;
  const projectedAutoTopUpEthPerContract = projectedAutoTopUpTriggered ? autoTopUpTarget - projectedPostWrapEthPerContract : 0;
  const projectedAutoTopUpEthTotal = projectedAutoTopUpEthPerContract * contractCount;

  const fundingTransactionCount = requiredEthPerContract > 0 ? contractCount : 0;
  const topUpTransactionCount = projectedAutoTopUpEthPerContract > 0 ? contractCount : 0;
  const returnSweepTransactionCount = contractCount * returnSweepTransactionCountPerWallet;
  const fundingGasUnits = fundingTransactionCount * ETH_TRANSFER_GAS_UNITS;
  const topUpGasUnits = topUpTransactionCount * ETH_TRANSFER_GAS_UNITS;
  const estimatedGasUnits = fundingGasUnits + localExecutionGasUnitsPerWallet * contractCount + topUpGasUnits;
  const fundingNetworkFeeEth = gasPriceEth * fundingGasUnits;
  const topUpNetworkFeeEth = gasPriceEth * topUpGasUnits;
  const localExecutionGasFeeEth = localExecutionGasFeePerWalletEth * contractCount;
  const wrappableEth = requiredWethTotal;
  const effectiveWethAvailable = requiredWethTotal;
  const wethFromWrappedEth = requiredWethTotal;
  const totalEthDeducted = requiredEthTotal;
  const totalNetworkFeeEth = fundingNetworkFeeEth + topUpNetworkFeeEth + localExecutionGasFeeEth;
  const totalEthRequiredWithFees = totalEthDeducted + projectedAutoTopUpEthTotal + fundingNetworkFeeEth + topUpNetworkFeeEth;
  const remainingEthAfterFunding = availableEth - totalEthDeducted;
  const remainingEthAfterRun = availableEth - totalEthRequiredWithFees;
  const remainingWethAfterFunding = availableWeth;
  const canProceed = availableEth >= totalEthRequiredWithFees && (!requiresRecipient || Boolean(template.recipient_address));

  let shortfallReason: string | null = null;
  if (requiresRecipient && !template.recipient_address) {
    shortfallReason = `recipient_address is required when token swaps or direct contract ${nativeSymbol}/${wrappedNativeSymbol} are enabled.`;
  } else if (availableEth < requiredEthTotal) {
    shortfallReason =
      `Not enough ${nativeSymbol} in the main wallet. Need ${toAmountString(requiredEthTotal - availableEth)} more ${nativeSymbol} ` +
      `to fund the sub-wallet gas reserve, sub-wallet ${nativeSymbol}, direct contract ${nativeSymbol}, automatic local execution gas headroom, and the local ${wrappedNativeSymbol} wrap budget.`;
  } else if (availableEth < totalEthRequiredWithFees) {
    shortfallReason =
      `Not enough ${nativeSymbol} in the main wallet. Need ${toAmountString(totalEthRequiredWithFees - availableEth)} more ${nativeSymbol} ` +
      "to fund the new sub-wallets, reserve projected auto top-ups, and cover the main-wallet funding transaction fees.";
  }

  return {
    template_id: template.id,
    wallet_id: wallet.id,
    contract_count: contractCount,
    return_wallet_address: template.return_wallet_address ?? null,
    test_auto_execute_after_funding: template.test_auto_execute_after_funding,
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
      weth_sent_to_subwallets: "0",
      weth_from_main_wallet: toAmountString(wethFromMainWallet),
      weth_from_wrapped_eth: toAmountString(wethFromWrappedEth),
      auto_top_up_eth_reserved: toAmountString(projectedAutoTopUpEthTotal),
      total_eth_deducted: toAmountString(totalEthDeducted),
    },
    execution: {
      funding_network_fee_eth: toAmountString(fundingNetworkFeeEth),
      top_up_network_fee_eth: toAmountString(topUpNetworkFeeEth),
      main_wallet_network_fee_eth: toAmountString(fundingNetworkFeeEth + topUpNetworkFeeEth),
      local_execution_gas_fee_eth: toAmountString(localExecutionGasFeeEth),
      local_execution_gas_fee_per_wallet_eth: toAmountString(localExecutionGasFeePerWalletEth),
      contract_sync_network_fee_eth: "0",
      total_network_fee_eth: toAmountString(totalNetworkFeeEth),
      estimated_gas_price_gwei: gasPriceGwei === null ? null : toAmountString(gasPriceGwei),
      estimated_gas_units: estimatedGasUnits,
      execute_gas_units_per_wallet: deploymentEnabled && testAutoExecuteAfterFunding ? deploymentContractsPerWallet * DISTRIBUTOR_EXECUTE_GAS_UNITS : 0,
      return_sweep_gas_units_per_wallet: returnWalletConfigured ? ETH_TRANSFER_GAS_UNITS + returnSweepTokenTransferCountPerWallet * TOKEN_TRANSFER_GAS_UNITS : 0,
      local_execution_gas_units_per_wallet: localExecutionGasUnitsPerWallet,
      funding_transaction_count: fundingTransactionCount,
      top_up_transaction_count: topUpTransactionCount,
      execute_transaction_count: executeTransactionCount,
      return_sweep_transaction_count: returnSweepTransactionCount,
      wrap_transaction_count: wrapTransactionCount,
      approval_transaction_count: approvalTransactionCount,
      swap_transaction_count: swapTransactionCount,
      deployment_transaction_count: deploymentTransactionCount,
      contract_funding_transaction_count: contractFundingTransactionCount,
      contract_funding_gas_units_per_wallet: deploymentEnabled ? tokenFundingTargetsPerWallet * TOKEN_TRANSFER_GAS_UNITS + nativeFundingTargetsPerWallet * ETH_TRANSFER_GAS_UNITS : 0,
      contract_sync_transaction_count: 0,
      total_transaction_count:
        fundingTransactionCount +
        topUpTransactionCount +
        executeTransactionCount +
        returnSweepTransactionCount +
        wrapTransactionCount +
        approvalTransactionCount +
        swapTransactionCount +
        deploymentTransactionCount +
        contractFundingTransactionCount,
      total_eth_required_with_fees: toAmountString(totalEthRequiredWithFees),
      remaining_eth_after_run: toAmountString(remainingEthAfterRun),
    },
    effective_weth_available: toAmountString(effectiveWethAvailable),
    per_contract: {
      gas_reserve_eth: toAmountString(gasReserve),
      swap_budget_eth: toAmountString(swapBudget),
      direct_contract_eth: toAmountString(directEth),
      direct_subwallet_eth: toAmountString(directEth),
      direct_contract_native_eth: toAmountString(directContractNativeEth),
      direct_contract_weth: toAmountString(directWeth),
      auto_top_up_threshold_eth: toAmountString(autoTopUpThreshold),
      auto_top_up_target_eth: toAmountString(autoTopUpTarget),
      projected_auto_top_up_eth: toAmountString(projectedAutoTopUpEthPerContract),
      configured_unwrapped_eth: toAmountString(configuredUnwrappedEthPerContract),
      minimum_unwrapped_eth: toAmountString(minimumUnwrappedEthPerContract),
      auto_added_gas_buffer_eth: toAmountString(autoAddedGasBufferEthPerContract),
      local_execution_gas_fee_eth: toAmountString(localExecutionGasFeePerWalletEth),
      required_eth: toAmountString(requiredEthPerContract),
      required_weth: toAmountString(requiredWethPerContract),
      total_eth_if_no_weth_available: toAmountString(requiredEthPerContract),
    },
    totals: {
      required_eth_total: toAmountString(requiredEthTotal),
      required_weth_total: toAmountString(requiredWethTotal),
      gas_reserve_eth_total: toAmountString(gasReserve * contractCount),
      swap_budget_eth_total: toAmountString(swapBudget * contractCount),
      direct_contract_eth_total: toAmountString(directEth * contractCount),
      direct_subwallet_eth_total: toAmountString(directEth * contractCount),
      direct_contract_native_eth_total: toAmountString(directContractNativeEth * contractCount),
      direct_contract_weth_total: toAmountString(directWeth * contractCount),
      projected_auto_top_up_eth_total: toAmountString(projectedAutoTopUpEthTotal),
      configured_unwrapped_eth_total: toAmountString(configuredUnwrappedEthPerContract * contractCount),
      minimum_unwrapped_eth_total: toAmountString(minimumUnwrappedEthPerContract * contractCount),
      auto_added_gas_buffer_eth_total: toAmountString(autoAddedGasBufferEthPerContract * contractCount),
      local_execution_gas_fee_eth_total: toAmountString(localExecutionGasFeeEth),
      total_eth_if_no_weth_available_total: toAmountString(requiredEthTotal),
    },
    auto_top_up: {
      enabled: autoTopUpEnabled,
      threshold_eth: toAmountString(autoTopUpThreshold),
      target_eth: toAmountString(autoTopUpTarget),
      projected_post_wrap_eth_per_contract: toAmountString(projectedPostWrapEthPerContract),
      projected_triggered: projectedAutoTopUpTriggered,
      projected_eth_per_contract: toAmountString(projectedAutoTopUpEthPerContract),
      projected_total_eth: toAmountString(projectedAutoTopUpEthTotal),
      projected_transaction_count: topUpTransactionCount,
      projected_network_fee_eth: toAmountString(topUpNetworkFeeEth),
    },
    stablecoin_distribution_mode: template.stablecoin_distribution_mode,
    stablecoin_routes: stablecoinRoutes,
    contract_sync: {
      enabled: false,
      main_wallet_registry_enabled: false,
      sub_wallet_registry_enabled: false,
      main_wallet_registration_required: false,
      expected_action_count: 0,
      message: "Final review re-checks the funding plan and stores the run activity log.",
    },
  };
}
