"use client";

import Link from "next/link";
import { MouseEvent, ReactNode, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowLeft, CheckCircle2, Coins, Copy, FileText, Fuel, Loader2, Pencil, PlusCircle, RefreshCw, Rocket, Trash2, WalletCards } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Section } from "@/app/page";
import { Header } from "@/components/dashboard/header";
import { useI18n } from "@/components/i18n-provider";
import { WalletAssetMonitoring } from "@/components/dashboard/wallet-asset-monitoring";
import { TemplateMarketCheckPanel } from "@/components/dashboard/template-market-check";
import { WalletRunHistory } from "@/components/dashboard/wallet-run-history";
import { Sidebar } from "@/components/dashboard/sidebar";
import { TemplateEditor } from "@/components/dashboard/template-editor";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { buildApiUrl, readApiPayload } from "@/lib/api";
import {
  formatChainLag,
  getAutomationStabilitySummary,
  getChainLagTone,
  getTemplateStatusChainKey,
  isRpcOnline,
  type RuntimeChainStatus,
  type RuntimeSingleStatusResponse,
} from "@/lib/chain-status";
import {
  TEMPLATE_API_URL,
  Template,
  TemplateOptions,
  TemplatePreviewIssue,
  TemplateWalletSupportPreview,
  buildTemplateWalletSupportPreview,
  formatAmount,
  formatFeeTier,
  formatRelativeTimestamp,
  getTemplateNoRouteAllocations,
  getTemplateChainMeta,
  getStablecoinDistributionRows,
  normalizeTemplateChain,
  shortAddress,
} from "@/lib/template";
import type { SupportedLocale } from "@/lib/i18n";

type BalanceWallet = {
  id: string;
  type: string;
  address: string;
  parent_id?: string | null;
  chain?: string;
  native_symbol?: string;
  wrapped_native_symbol?: string;
  eth_balance: number | null;
  weth_balance: number | null;
  balances_live: boolean;
  funding_gas_price_gwei?: number | null;
  balance_error?: string | null;
  balance_refreshed_at?: string | null;
  token_holdings?: TokenHolding[];
  index?: number;
};

type TokenHolding = {
  symbol: string;
  name?: string | null;
  address: string;
  chain?: string | null;
  chain_label?: string | null;
  decimals?: number | null;
  raw_balance?: string | null;
  balance?: string | null;
  error?: string | null;
};

type LinkedTreasuryContract = {
  contract_name?: string | null;
  contract_address: string;
  chain?: string | null;
  chain_label?: string | null;
  owner_address?: string | null;
  wallet_id?: string | null;
  wallet_address?: string | null;
  recipient_address?: string | null;
  return_wallet_address?: string | null;
  status?: string | null;
  funding_status?: string | null;
  execution_status?: string | null;
  tx_hash?: string | null;
  funding_tx_hash?: string | null;
  funding_tx_hashes?: string[];
  funded_assets?: Array<{
    symbol?: string | null;
    token_symbol?: string | null;
    address?: string | null;
    token_address?: string | null;
    amount?: string | null;
    kind?: string | null;
  }>;
  source_run_id?: string | null;
  source_run_status?: string | null;
  source_run_created_at?: string | null;
  code_present?: boolean;
  can_withdraw?: boolean;
  native_symbol?: string | null;
  wrapped_native_symbol?: string | null;
  eth_balance: number | null;
  weth_balance: number | null;
  balances_live: boolean;
  funding_gas_price_gwei?: number | null;
  balance_error?: string | null;
  balance_refreshed_at?: string | null;
  token_holdings?: TokenHolding[];
};

type WalletDetails = BalanceWallet & {
  sub_wallets: BalanceWallet[];
  linked_contracts?: LinkedTreasuryContract[];
  return_wallet_address?: string | null;
  return_sweep_chain?: string | null;
  return_sweep_source_run_id?: string | null;
};

type ContractSourcePayload = {
  contract_name: string;
  source_path: string;
  source_code: string;
};

type TemplatePreviewFailurePayload = {
  detail?: string | TemplatePreviewIssue | null;
  error?: TemplatePreviewIssue | null;
};

type ActionIssueFallback = {
  code?: string;
  title: string;
  summary: string;
  hint?: string;
  details?: string[];
};

function normalizePreviewFailureMessage(value: unknown) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized) return null;
  return normalized.toLowerCase() === "internal server error" ? null : normalized;
}

function extractPayloadErrorMessage(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== "object") {
    return fallback;
  }

  const record = payload as {
    detail?: unknown;
    error?: Partial<TemplatePreviewIssue> | null;
    preview_issue?: Partial<TemplatePreviewIssue> | null;
    shortfall_reason?: unknown;
  };

  const candidates = [
    normalizePreviewFailureMessage(typeof record.detail === "string" ? record.detail : null),
    normalizePreviewFailureMessage(typeof record.shortfall_reason === "string" ? record.shortfall_reason : null),
    normalizePreviewFailureMessage(record.error?.summary),
    normalizePreviewFailureMessage(record.preview_issue?.summary),
    Array.isArray(record.error?.details)
      ? record.error?.details.map((value) => normalizePreviewFailureMessage(value)).find(Boolean) ?? null
      : null,
    Array.isArray(record.preview_issue?.details)
      ? record.preview_issue?.details.map((value) => normalizePreviewFailureMessage(value)).find(Boolean) ?? null
      : null,
  ];

  return candidates.find((value): value is string => Boolean(value)) ?? fallback;
}

function buildFallbackActionIssue(
  locale: SupportedLocale,
  fallback: ActionIssueFallback,
  message?: string | null,
): TemplatePreviewIssue {
  const fallbackSummary = message ?? normalizePreviewFailureMessage(fallback.summary) ?? localeText(locale, {
    en: "The action failed before it could complete.",
    zn: "该操作在完成前失败。",
    vn: "Thao tác đã thất bại trước khi hoàn tất.",
  });
  const fallbackDetails = Array.isArray(fallback.details)
    ? fallback.details
        .map((value) => normalizePreviewFailureMessage(value))
        .filter((value): value is string => Boolean(value))
    : [];
  return {
    code: `${fallback.code ?? "action_failed"}`.trim() || "action_failed",
    title: normalizePreviewFailureMessage(fallback.title) ?? localeText(locale, {
      en: "Action failed",
      zn: "操作失败",
      vn: "Thao tác thất bại",
    }),
    summary: fallbackSummary,
    details: fallbackDetails.length ? fallbackDetails : [fallbackSummary],
    hint: normalizePreviewFailureMessage(fallback.hint) ?? localeText(locale, {
      en: "Review the current wallet state and try again.",
      zn: "请检查当前钱包状态后再重试。",
      vn: "Hãy kiểm tra trạng thái ví hiện tại rồi thử lại.",
    }),
  };
}

function normalizeActionIssue(
  issue: unknown,
  locale: SupportedLocale,
  fallback: ActionIssueFallback,
  fallbackMessage?: string | null,
): TemplatePreviewIssue {
  const fallbackIssue = buildFallbackActionIssue(locale, fallback, fallbackMessage);
  if (!issue || typeof issue !== "object") {
    return fallbackIssue;
  }

  const record = issue as Partial<TemplatePreviewIssue>;
  const details = Array.isArray(record.details)
    ? record.details
        .map((value) => normalizePreviewFailureMessage(value))
        .filter((value): value is string => Boolean(value))
    : [];

  return {
    code: `${record.code ?? fallbackIssue.code}`.trim() || fallbackIssue.code,
    title: normalizePreviewFailureMessage(record.title) ?? fallbackIssue.title,
    summary: normalizePreviewFailureMessage(record.summary) ?? fallbackIssue.summary,
    details: details.length ? details : fallbackIssue.details,
    hint: normalizePreviewFailureMessage(record.hint) ?? fallbackIssue.hint ?? null,
    context: record.context ?? null,
  };
}

function extractActionIssueFromPayload(
  payload: unknown,
  locale: SupportedLocale,
  fallback: ActionIssueFallback,
): TemplatePreviewIssue {
  if (payload && typeof payload === "object") {
    const record = payload as
      | (TemplatePreviewFailurePayload & {
          preview_issue?: TemplatePreviewIssue | null;
          shortfall_reason?: string | null;
        })
      | null;
    const explicitIssue = record?.error ?? record?.preview_issue;
    const nestedDetailIssue = record?.detail && typeof record.detail === "object" ? record.detail : null;
    const fallbackMessage =
      normalizePreviewFailureMessage(record?.shortfall_reason)
      ?? normalizePreviewFailureMessage(typeof record?.detail === "string" ? record.detail : null);
    return normalizeActionIssue(explicitIssue ?? nestedDetailIssue, locale, fallback, fallbackMessage);
  }

  return buildFallbackActionIssue(locale, fallback);
}

function buildFallbackPreviewIssue(locale: SupportedLocale, message?: string | null): TemplatePreviewIssue {
  return buildFallbackActionIssue(
    locale,
    {
      code: "preview_failed",
      title: localeText(locale, {
        en: "Automation check failed",
        zn: "自动化检查失败",
        vn: "Kiểm tra tự động hóa thất bại",
      }),
      summary: localeText(locale, {
        en: "The automation check failed before it could finish validating balances, routes, and funding.",
        zn: "自动化检查在完成余额、路由和资金验证前失败。",
        vn: "Kiểm tra tự động hóa đã thất bại trước khi hoàn tất xác minh số dư, tuyến swap và cấp vốn.",
      }),
      hint: localeText(locale, {
        en: "Check the chain RPC, main wallet balance, recipient settings, and funded token routes, then try again.",
        zn: "请检查链 RPC、主钱包余额、接收地址设置和已注资代币路由后再重试。",
        vn: "Hãy kiểm tra RPC của chain, số dư ví chính, cài đặt người nhận và các tuyến token được cấp vốn rồi thử lại.",
      }),
      details: [
        localeText(locale, {
          en: "The backend did not return any additional preview error details.",
          zn: "后端没有返回更多预览错误细节。",
          vn: "Backend không trả về thêm chi tiết lỗi cho bước kiểm tra này.",
        }),
      ],
    },
    message,
  );
}

function extractPreviewIssueFromPayload(payload: unknown, locale: SupportedLocale): TemplatePreviewIssue {
  return extractActionIssueFromPayload(
    payload,
    locale,
    {
      code: "preview_failed",
      title: localeText(locale, {
        en: "Automation check failed",
        zn: "自动化检查失败",
        vn: "Kiểm tra tự động hóa thất bại",
      }),
      summary: localeText(locale, {
        en: "The automation check failed before it could finish validating balances, routes, and funding.",
        zn: "自动化检查在完成余额、路由和资金验证前失败。",
        vn: "Kiểm tra tự động hóa đã thất bại trước khi hoàn tất xác minh số dư, tuyến swap và cấp vốn.",
      }),
      hint: localeText(locale, {
        en: "Check the chain RPC, main wallet balance, recipient settings, and funded token routes, then try again.",
        zn: "请检查链 RPC、主钱包余额、接收地址设置和已注资代币路由后再重试。",
        vn: "Hãy kiểm tra RPC của chain, số dư ví chính, cài đặt người nhận và các tuyến token được cấp vốn rồi thử lại.",
      }),
    },
  );
}

function buildSweepIssueFromPayload(
  payload: {
    return_wallet_address?: string | null;
    errors?: Array<{ error?: string | null; asset?: string | null }>;
    summary?: {
      error?: string | null;
      detected_asset_count?: number | null;
      successful_asset_count?: number | null;
      failed_asset_count?: number | null;
      remaining_asset_count?: number | null;
    } | null;
  },
  locale: SupportedLocale,
): TemplatePreviewIssue {
  const detectedCount = Number(payload.summary?.detected_asset_count ?? 0);
  const successfulCount = Number(payload.summary?.successful_asset_count ?? 0);
  const failedCount = Number(payload.summary?.failed_asset_count ?? 0);
  const remainingCount = Number(payload.summary?.remaining_asset_count ?? 0);
  const errorMessages = (payload.errors ?? [])
    .map((entry) => normalizePreviewFailureMessage(entry.error))
    .filter((value): value is string => Boolean(value));
  const summaryMessage =
    normalizePreviewFailureMessage(payload.summary?.error)
    ?? errorMessages[0]
    ?? localeText(locale, {
      en: "The leftover sweep did not fully complete.",
      zn: "剩余资产清扫未完全完成。",
      vn: "Lệnh sweep tài sản dư chưa hoàn tất.",
    });

  return {
    code: successfulCount > 0 ? "subwallet_sweep_partial" : "subwallet_sweep_failed",
    title: successfulCount > 0
      ? localeText(locale, {
        en: "Subwallet sweep partially completed",
        zn: "子钱包清扫部分完成",
        vn: "Sweep ví con hoàn tất một phần",
      })
      : localeText(locale, {
        en: "Subwallet sweep failed",
        zn: "子钱包清扫失败",
        vn: "Sweep ví con thất bại",
      }),
    summary: summaryMessage,
    details: [
      localeText(locale, {
        en: `Detected leftover assets: ${detectedCount}`,
        zn: `检测到的剩余资产：${detectedCount}`,
        vn: `Số tài sản dư được phát hiện: ${detectedCount}`,
      }),
      localeText(locale, {
        en: `Successfully returned: ${successfulCount}`,
        zn: `成功返还：${successfulCount}`,
        vn: `Đã hoàn trả thành công: ${successfulCount}`,
      }),
      localeText(locale, {
        en: `Failed return attempts: ${failedCount}`,
        zn: `返还失败次数：${failedCount}`,
        vn: `Số lần hoàn trả thất bại: ${failedCount}`,
      }),
      localeText(locale, {
        en: `Assets still remaining: ${remainingCount}`,
        zn: `仍然剩余的资产：${remainingCount}`,
        vn: `Số tài sản vẫn còn lại: ${remainingCount}`,
      }),
      ...(payload.return_wallet_address ? [
        localeText(locale, {
          en: `Return wallet: ${payload.return_wallet_address}`,
          zn: `回收地址：${payload.return_wallet_address}`,
          vn: `Ví nhận lại: ${payload.return_wallet_address}`,
        }),
      ] : []),
      ...errorMessages,
    ].filter(Boolean),
    hint: localeText(locale, {
      en: "Retry the sweep after checking the return wallet, the chain RPC, and the subwallet's remaining native gas.",
      zn: "请检查回收地址、链 RPC 和子钱包剩余原生 gas 后再重试清扫。",
      vn: "Hãy kiểm tra ví nhận lại, RPC của chain và lượng gas native còn lại của ví con rồi thử sweep lại.",
    }),
  };
}

function buildWithdrawIssueFromPayload(
  payload: {
    errors?: Array<{ error?: string | null }>;
  },
  locale: SupportedLocale,
): TemplatePreviewIssue {
  const errorMessages = (payload.errors ?? [])
    .map((entry) => normalizePreviewFailureMessage(entry.error))
    .filter((value): value is string => Boolean(value));
  const summaryMessage = errorMessages[0] ?? localeText(locale, {
    en: "The contract withdrawal did not complete.",
    zn: "合约提取未完成。",
    vn: "Lệnh rút khỏi hợp đồng chưa hoàn tất.",
  });

  return {
    code: "contract_withdraw_failed",
    title: localeText(locale, {
      en: "Contract withdrawal failed",
      zn: "合约提取失败",
      vn: "Rút khỏi hợp đồng thất bại",
    }),
    summary: summaryMessage,
    details: errorMessages.length ? errorMessages : [summaryMessage],
    hint: localeText(locale, {
      en: "Check the treasury contract balance, subwallet gas, and chain RPC, then retry the withdraw action.",
      zn: "请检查资金库合约余额、子钱包 gas 和链 RPC，然后再重试提取。",
      vn: "Hãy kiểm tra số dư treasury, gas của ví con và RPC của chain rồi thử rút lại.",
    }),
  };
}

function formatTokenBalance(value: string | number | null | undefined, symbol: string) {
  return value === null || value === undefined ? "Unavailable" : `${formatAmount(value)} ${symbol}`;
}

function formatLinkedContractStatus(contract: LinkedTreasuryContract) {
  const parts = [contract.status, contract.funding_status, contract.execution_status]
    .map((value) => `${value ?? ""}`.trim())
    .filter(Boolean);
  return parts.length ? parts.join(" / ") : "Unknown";
}

function localeText(locale: SupportedLocale, text: Record<SupportedLocale, string>) {
  return text[locale];
}

function getChainUiContext(
  template?: Template | null,
  wallet?: Pick<BalanceWallet, "chain" | "native_symbol" | "wrapped_native_symbol"> | null,
  locale?: SupportedLocale,
) {
  const requestedChain = (template?.chain ?? wallet?.chain ?? "ethereum_mainnet") as Template["chain"];
  const chain = requestedChain in {
    ethereum_mainnet: true,
    bnb: true,
    arbitrum: true,
    avalanche: true,
    base: true,
    optimism: true,
    polygon: true,
    xlayer: true,
  }
    ? requestedChain
    : "ethereum_mainnet";
  const defaultMeta = getTemplateChainMeta(chain);
  const defaultNativeSymbol = defaultMeta.nativeSymbol;
  const defaultWrappedNativeSymbol = defaultMeta.wrappedNativeSymbol;
  const walletMatchesChain = wallet?.chain === chain;
  const nativeSymbol = walletMatchesChain ? wallet?.native_symbol ?? defaultNativeSymbol : defaultNativeSymbol;
  const wrappedNativeSymbol = walletMatchesChain ? wallet?.wrapped_native_symbol ?? defaultWrappedNativeSymbol : defaultWrappedNativeSymbol;
  const chainLabel = locale
    ? localeText(locale, {
        en: defaultMeta.label,
        zn:
          chain === "bnb"
            ? "BNB 链"
            : chain === "arbitrum"
              ? "Arbitrum"
              : chain === "avalanche"
                ? "Avalanche"
                : chain === "base"
                  ? "Base"
                  : chain === "optimism"
                    ? "Optimism"
                    : chain === "polygon"
                      ? "Polygon"
                      : chain === "xlayer"
                        ? "X Layer"
                        : "以太坊主网",
        vn: defaultMeta.label,
      })
    : defaultMeta.label;

  return {
    chain,
    chainLabel,
    nativeSymbol,
    wrappedNativeSymbol,
  };
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
    <div className={`cad-panel-muted min-w-0 px-4 py-3 ${className ?? ""}`}>
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
  className,
  bodyClassName,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <div className={`cad-panel px-5 py-5 ${className ?? ""}`}>
      <div className="mb-4">
        <p className="text-base font-semibold text-foreground">{title}</p>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      <div className={bodyClassName}>{children}</div>
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
    <div className="rounded-xl bg-secondary/45 px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-semibold text-foreground">{value}</p>
    </div>
  );
}

function NoRouteTokenBadge({
  symbol,
}: {
  symbol: string;
}) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-1 text-[11px] font-medium text-rose-700 ring-1 ring-rose-200/70">
      <span>{symbol}</span>
      <span>No route found</span>
    </span>
  );
}

const WRAP_GAS_UNITS = 120_000;
const ETH_TRANSFER_GAS_UNITS = 21_000;
const APPROVE_GAS_UNITS = 70_000;
const SWAP_GAS_UNITS = 350_000;
const DISTRIBUTOR_DEPLOY_GAS_UNITS = 900_000;
const CHAIN_STATUS_POLL_INTERVAL_MS = 10_000;

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

function estimateGasFeeDisplay(
  gasUnits: number,
  gasPriceGwei: string | number | null | undefined,
  locale: SupportedLocale,
  symbol = "ETH",
) {
  if (gasUnits <= 0) return `0 ${symbol}`;
  const gasPrice = toNumericValue(gasPriceGwei);
  if (gasPrice === null) {
    return localeText(locale, {
      en: "Pending RPC",
      zn: "等待 RPC",
      vn: "Đang chờ RPC",
    });
  }
  return formatCryptoMetric((gasUnits * gasPrice) / 1_000_000_000, symbol);
}

function getTestAutoBatchSendEnabled(
  value: Pick<Template, "test_auto_execute_after_funding" | "test_auto_batch_send_after_funding"> |
    Pick<TemplateWalletSupportPreview, "test_auto_execute_after_funding" | "test_auto_batch_send_after_funding">,
) {
  return value.test_auto_batch_send_after_funding ?? value.test_auto_execute_after_funding ?? false;
}

function getDistributorAutomationSummary(template: Template, locale: SupportedLocale) {
  const { nativeSymbol, wrappedNativeSymbol } = getChainUiContext(template, null, locale);
  const recipientConfigured = Boolean(template.recipient_address);
  const distributorNativeEthAmount = toNumericValue(template.direct_contract_native_eth_per_contract) ?? 0;
  const distributorAmount = toNumericValue(template.direct_contract_weth_per_contract) ?? 0;
  const hasSwapRoutes = getStablecoinDistributionRows(template).some((route) => (toNumericValue(route.weth_amount_per_contract) ?? 0) > 0);
  const hasDistributorFlow = hasSwapRoutes || distributorNativeEthAmount > 0 || distributorAmount > 0;

  if (recipientConfigured && hasDistributorFlow) {
    return {
      enabled: true,
      title: localeText(locale, {
        en: "Ready to deploy",
        zn: "可部署",
        vn: "Sẵn sàng triển khai",
      }),
      description: hasSwapRoutes && (distributorAmount > 0 || distributorNativeEthAmount > 0)
        ? localeText(locale, {
            en: `Deploy treasury contracts after swaps, then fund direct ${nativeSymbol}/${wrappedNativeSymbol} from the main wallet.`,
            zn: `在兑换后部署资金库合约，然后由主钱包注入直接 ${nativeSymbol}/${wrappedNativeSymbol}。`,
            vn: `Triển khai treasury sau bước swap, rồi cấp trực tiếp ${nativeSymbol}/${wrappedNativeSymbol} từ ví chính.`,
          })
        : hasSwapRoutes
          ? localeText(locale, {
              en: "Deploy treasury contracts after the swap step.",
              zn: "在兑换步骤后部署资金库合约。",
              vn: "Triển khai treasury sau bước swap.",
            })
          : locale === "en"
            ? `Main-wallet treasury funding is ready with ${formatCryptoMetric(template.direct_contract_native_eth_per_contract, nativeSymbol)} and ${formatCryptoMetric(template.direct_contract_weth_per_contract, wrappedNativeSymbol)}.`
            : locale === "zn"
              ? `主钱包资金库合约注资已就绪：${formatCryptoMetric(template.direct_contract_native_eth_per_contract, nativeSymbol)} 和 ${formatCryptoMetric(template.direct_contract_weth_per_contract, wrappedNativeSymbol)}。`
              : `Cấp vốn treasury từ ví chính đã sẵn sàng với ${formatCryptoMetric(template.direct_contract_native_eth_per_contract, nativeSymbol)} và ${formatCryptoMetric(template.direct_contract_weth_per_contract, wrappedNativeSymbol)}.`,
    };
  }

  if (hasDistributorFlow && !recipientConfigured) {
    return {
      enabled: false,
      title: localeText(locale, {
        en: "Recipient needed",
        zn: "需要接收地址",
        vn: "Cần địa chỉ nhận",
      }),
      description: localeText(locale, {
        en: "Add a recipient address to enable contract deployment.",
        zn: "添加接收地址以启用合约部署。",
        vn: "Thêm địa chỉ nhận để bật triển khai hợp đồng.",
      }),
    };
  }

  return {
    enabled: false,
    title: localeText(locale, {
      en: "Auto deploy off",
      zn: "自动部署已关闭",
      vn: "Tắt tự động triển khai",
    }),
    description: localeText(locale, {
      en: "This template only funds the sub-wallet. No contract deployment is included.",
      zn: "此模板仅为子钱包注资，不包含合约部署。",
      vn: "Mẫu này chỉ cấp vốn cho ví con, không bao gồm triển khai hợp đồng.",
    }),
  };
}

function buildBudgetPreviewRows(
  wallet: WalletDetails,
  preview: TemplateWalletSupportPreview,
  template: Template,
  locale: SupportedLocale,
) {
  const { chainLabel, nativeSymbol, wrappedNativeSymbol } = getChainUiContext(template, wallet, locale);
  const configuredTotals = buildConfiguredTemplateTotals(template, preview.contract_count);
  return [
    {
      label: localeText(locale, { en: "Chain", zn: "链", vn: "Chuỗi" }),
      value: chainLabel,
    },
    { label: localeText(locale, { en: "Sub-wallets", zn: "子钱包", vn: "Ví con" }), value: `${preview.contract_count}` },
    {
      label: localeText(locale, { en: "Configured total", zn: "模板总额", vn: "Tổng cấu hình" }),
      value: `${formatCryptoMetric(configuredTotals.totalEth, nativeSymbol)} + ${formatCryptoMetric(configuredTotals.totalWeth, wrappedNativeSymbol)}`,
    },
    {
      label: localeText(locale, { en: "Main wallet balance", zn: "主钱包余额", vn: "Số dư ví chính" }),
      value: `${formatCryptoMetric(wallet.eth_balance, nativeSymbol)} / ${formatCryptoMetric(wallet.weth_balance, wrappedNativeSymbol)}`,
    },
    {
      label: localeText(locale, { en: `Total ${nativeSymbol} needed`, zn: `所需 ${nativeSymbol} 总额`, vn: `Tổng ${nativeSymbol} cần` }),
      value: formatCryptoMetric(preview.execution.total_eth_required_with_fees, nativeSymbol),
    },
    {
      label: localeText(locale, { en: "Top-up reserve", zn: "补充预留", vn: "Dự phòng nạp thêm" }),
      value: formatCryptoMetric(preview.funding.auto_top_up_eth_reserved ?? "0", nativeSymbol),
    },
    {
      label: localeText(locale, { en: "Return wallet", zn: "回收钱包", vn: "Ví nhận lại" }),
      value: preview.return_wallet_address
        ? shortAddress(preview.return_wallet_address)
        : localeText(locale, { en: "Not set", zn: "未设置", vn: "Chưa thiết lập" }),
    },
  ];
}

function buildSwapPreviewRows(preview: TemplateWalletSupportPreview, template: Template, locale: SupportedLocale) {
  const { nativeSymbol, wrappedNativeSymbol } = getChainUiContext(template, null, locale);
  const gasPerRoute = estimateGasFeeDisplay(SWAP_GAS_UNITS, preview.execution.estimated_gas_price_gwei, locale, nativeSymbol);

  return preview.stablecoin_routes.map((route) => ({
    token: route.token_symbol,
    budgetPerWallet: formatCryptoMetric(route.per_contract_weth_amount, wrappedNativeSymbol),
    estimatedOutput: route.percent
      ? locale === "en"
        ? `${formatCryptoMetric(route.percent)}% allocation`
        : locale === "zn"
          ? `${formatCryptoMetric(route.percent)}% 分配`
          : `${formatCryptoMetric(route.percent)}% phân bổ`
      : localeText(locale, {
          en: "Template route",
          zn: "模板路由",
          vn: "Tuyến theo mẫu",
        }),
    gasPerRoute,
  }));
}

function buildGasEstimateRows(
  preview: TemplateWalletSupportPreview,
  template: Template,
  locale: SupportedLocale,
) {
  const { nativeSymbol, wrappedNativeSymbol } = getChainUiContext(template, null, locale);
  const distributorAutomation = getDistributorAutomationSummary(template, locale);
  const gasPrice = preview.execution.estimated_gas_price_gwei;
  const totalGasUnits = preview.execution.estimated_gas_units ?? 0;
  const testAutoBatchSendEnabled = getTestAutoBatchSendEnabled(preview);

  return [
    {
      label: localeText(locale, { en: "funding gas", zn: "注资 gas", vn: "gas cấp vốn" }),
      value: estimateGasFeeDisplay(preview.execution.funding_transaction_count * ETH_TRANSFER_GAS_UNITS, gasPrice, locale, nativeSymbol),
      hint: preview.execution.funding_transaction_count > 0 ? `${nativeSymbol} transfers from the main wallet into each sub-wallet` : `No ${nativeSymbol} funding transfers in this plan`,
    },
    {
      label: localeText(locale, { en: "main wrap gas", zn: "主钱包包装 gas", vn: "gas wrap ví chính" }),
      value: estimateGasFeeDisplay(preview.execution.main_wallet_wrap_gas_units ?? 0, gasPrice, locale, nativeSymbol),
      hint:
        (preview.execution.main_wallet_wrap_transaction_count ?? 0) > 0
          ? `Wrap ${wrappedNativeSymbol} on the main wallet before direct treasury funding`
          : `No main-wallet ${wrappedNativeSymbol} wrap is required`,
    },
    {
      label: localeText(locale, { en: "top-up gas", zn: "补充 gas", vn: "gas nạp thêm" }),
      value: estimateGasFeeDisplay((preview.execution.top_up_transaction_count ?? 0) * ETH_TRANSFER_GAS_UNITS, gasPrice, locale, nativeSymbol),
      hint:
        (preview.execution.top_up_transaction_count ?? 0) > 0
          ? `Reserved for main-wallet refill transfers if a sub-wallet drops to the configured ${nativeSymbol} trigger`
          : "No projected auto top-up transfers are reserved in this plan",
    },
    {
      label: localeText(locale, { en: "testing batch send gas", zn: "测试批量发送 gas", vn: "gas batch send thử nghiệm" }),
      value: estimateGasFeeDisplay((preview.execution.execute_gas_units_per_wallet ?? 0) * preview.contract_count, gasPrice, locale, nativeSymbol),
      hint:
        testAutoBatchSendEnabled
          ? "Testing mode: immediately call batchSend() after each treasury contract is funded."
          : "Testing batch send is off",
    },
    {
      label: localeText(locale, { en: "return sweep gas", zn: "回收 gas", vn: "gas hoàn lại" }),
      value: estimateGasFeeDisplay((preview.execution.return_sweep_gas_units_per_wallet ?? 0) * preview.contract_count, gasPrice, locale, nativeSymbol),
      hint:
        preview.return_wallet_address
          ? "Covers the final leftover sweep from each sub-wallet into the configured return wallet."
          : "No return-wallet cleanup is configured for this template",
    },
    {
      label: localeText(locale, { en: "wrap gas", zn: "包装 gas", vn: "gas wrap" }),
      value: estimateGasFeeDisplay(preview.execution.wrap_transaction_count * WRAP_GAS_UNITS, gasPrice, locale, nativeSymbol),
      hint: preview.execution.wrap_transaction_count > 0 ? `Each sub-wallet wraps only the ${wrappedNativeSymbol} it needs for local swap execution` : `No local ${wrappedNativeSymbol} wrapping is required`,
    },
    {
      label: localeText(locale, { en: "approve gas", zn: "授权 gas", vn: "gas phê duyệt" }),
      value: estimateGasFeeDisplay(preview.execution.approval_transaction_count * APPROVE_GAS_UNITS, gasPrice, locale, nativeSymbol),
      hint: preview.execution.approval_transaction_count > 0 ? `Approve ${wrappedNativeSymbol} to the router before swaps` : "No router approvals are required",
    },
    {
      label: localeText(locale, { en: "swap gas", zn: "兑换 gas", vn: "gas swap" }),
      value: estimateGasFeeDisplay(preview.execution.swap_transaction_count * SWAP_GAS_UNITS, gasPrice, locale, nativeSymbol),
      hint: preview.execution.swap_transaction_count > 0 ? `Swap ${wrappedNativeSymbol} into the configured token routes` : "No token swap routes are configured",
    },
    {
      label: localeText(locale, { en: "deploy gas", zn: "部署 gas", vn: "gas triển khai" }),
      value: estimateGasFeeDisplay(preview.execution.deployment_transaction_count * DISTRIBUTOR_DEPLOY_GAS_UNITS, gasPrice, locale, nativeSymbol),
      hint: preview.execution.deployment_transaction_count > 0 ? "Deploy one BatchTreasuryDistributor from each funded sub-wallet." : distributorAutomation.description,
    },
    {
      label: localeText(locale, { en: "treasury funding gas", zn: "资金库注资 gas", vn: "gas cấp vốn treasury" }),
      value: estimateGasFeeDisplay((preview.execution.contract_funding_gas_units_per_wallet ?? 0) * preview.contract_count, gasPrice, locale, nativeSymbol),
      hint: preview.execution.contract_funding_transaction_count > 0 ? `Transfer swapped tokens from sub-wallets and direct ${nativeSymbol}/${wrappedNativeSymbol} from the main wallet into each deployed treasury contract.` : "No post-deploy treasury funding transfers are required",
    },
    {
      label: localeText(locale, { en: "total gas", zn: "总 gas", vn: "tổng gas" }),
      value: estimateGasFeeDisplay(totalGasUnits, gasPrice, locale, nativeSymbol),
      hint: "Funding, main-wallet wrap, projected top-up, local wrap, approval, swap, treasury deployment, treasury funding, testing batch send, and return sweep estimate",
    },
  ];
}

function buildAutomationSteps(
  preview: TemplateWalletSupportPreview,
  template: Template,
  walletType: WalletDetails["type"],
  locale: SupportedLocale,
): Array<{ title: string; description: string; tone: AutomationStepTone }> {
  const { nativeSymbol, wrappedNativeSymbol } = getChainUiContext(template, null, locale);
  const distributorAutomation = getDistributorAutomationSummary(template, locale);
  const testAutoBatchSendEnabled = getTestAutoBatchSendEnabled(preview);
  const autoAddedGasBuffer = toNumericValue(preview.per_contract.auto_added_gas_buffer_eth);
  const minimumUnwrappedEth = preview.per_contract.minimum_unwrapped_eth ?? preview.per_contract.gas_reserve_eth;
  const mainWalletWethWrapped = toNumericValue(preview.funding.main_wallet_weth_wrapped ?? "0") ?? 0;
  const autoTopUp = preview.auto_top_up;
  const projectedTopUpReserve = toNumericValue(preview.funding.auto_top_up_eth_reserved);
  const availableEth = toNumericValue(preview.balances.available_eth);
  const totalRequiredWithFees = toNumericValue(preview.execution.total_eth_required_with_fees);
  const shortfallEth =
    availableEth !== null && totalRequiredWithFees !== null && totalRequiredWithFees > availableEth
      ? totalRequiredWithFees - availableEth
      : null;
  const recipientRequired = preview.shortfall_reason?.includes("recipient_address");

  return [
    {
      title: localeText(locale, { en: "Budget check", zn: "预算检查", vn: "Kiểm tra ngân sách" }),
      description: preview.can_proceed
        ? projectedTopUpReserve && projectedTopUpReserve > 0
          ? `Ready to run. The main wallet covers funding, gas, and a ${formatCryptoMetric(preview.funding.auto_top_up_eth_reserved, nativeSymbol)} top-up reserve.`
          : autoAddedGasBuffer && autoAddedGasBuffer > 0
          ? `Ready to run. The main wallet covers funding, gas, and a ${formatCryptoMetric(preview.per_contract.auto_added_gas_buffer_eth, nativeSymbol)} buffer per wallet.`
          : "Ready to run. The main wallet covers funding and estimated gas."
        : recipientRequired
          ? "Not ready. Add a recipient address before running this template."
          : shortfallEth !== null
            ? `Not ready. Add ${formatCryptoMetric(shortfallEth, nativeSymbol)} more ${nativeSymbol} to continue.`
            : "Not ready. The main wallet cannot cover this run yet.",
      tone: preview.can_proceed ? "ready" : "attention",
    },
    {
      title: localeText(locale, { en: "Create wallets", zn: "创建钱包", vn: "Tạo ví" }),
      description:
        walletType === "imported_private_key"
          ? `Create ${preview.contract_count} linked sub-wallet${preview.contract_count === 1 ? "" : "s"} from the main wallet.`
          : `Create ${preview.contract_count} sub-wallet${preview.contract_count === 1 ? "" : "s"} from the main wallet seed.`,
      tone: "planned",
    },
    {
      title: localeText(locale, { en: "Fund wallets", zn: "注资钱包", vn: "Cấp vốn ví" }),
      description: `Send ${formatCryptoMetric(preview.funding.eth_sent_to_subwallets, nativeSymbol)} from the main wallet to fund each sub-wallet.`,
      tone: "planned",
    },
    {
      title: localeText(locale, { en: `Wrap to ${wrappedNativeSymbol}`, zn: `转换为 ${wrappedNativeSymbol}`, vn: `Wrap sang ${wrappedNativeSymbol}` }),
      description:
        preview.execution.wrap_transaction_count > 0 && mainWalletWethWrapped > 0
          ? `Each sub-wallet wraps ${formatCryptoMetric(preview.per_contract.required_weth, wrappedNativeSymbol)} for swaps and keeps ${formatCryptoMetric(minimumUnwrappedEth, nativeSymbol)} in ${nativeSymbol} for gas. The main wallet also wraps ${formatCryptoMetric(preview.funding.main_wallet_weth_wrapped, wrappedNativeSymbol)} for direct treasury funding.`
          : preview.execution.wrap_transaction_count > 0
            ? `Each sub-wallet wraps ${formatCryptoMetric(preview.per_contract.required_weth, wrappedNativeSymbol)} and keeps ${formatCryptoMetric(minimumUnwrappedEth, nativeSymbol)} in ${nativeSymbol} for gas.`
            : mainWalletWethWrapped > 0
              ? `The main wallet wraps ${formatCryptoMetric(preview.funding.main_wallet_weth_wrapped, wrappedNativeSymbol)} for direct treasury funding.`
              : `No ${wrappedNativeSymbol} wrap is needed.`,
      tone: preview.execution.wrap_transaction_count > 0 || mainWalletWethWrapped > 0 ? "planned" : "optional",
    },
    {
      title: localeText(locale, { en: "Top-up", zn: "自动补充", vn: "Nạp thêm" }),
      description: autoTopUp?.enabled
        ? autoTopUp.projected_transaction_count > 0
          ? `If a wallet drops below ${formatCryptoMetric(autoTopUp.threshold_eth, nativeSymbol)}, it can be refilled to ${formatCryptoMetric(autoTopUp.target_eth, nativeSymbol)}. ${formatCryptoMetric(autoTopUp.projected_total_eth, nativeSymbol)} is reserved for that.`
          : `If a wallet drops below ${formatCryptoMetric(autoTopUp.threshold_eth, nativeSymbol)}, it can be refilled to ${formatCryptoMetric(autoTopUp.target_eth, nativeSymbol)}.`
        : "Top-up is off. The first funding must cover the full run.",
      tone: autoTopUp?.enabled ? "planned" : "optional",
    },
    {
      title: localeText(locale, { en: "Testing batch send", zn: "测试批量发送", vn: "Batch send thử nghiệm" }),
      description: testAutoBatchSendEnabled
        ? "Testing mode is on. Each funded BatchTreasuryDistributor calls batchSend() immediately."
        : "Testing mode is off. Funded treasury contracts wait for a later manual release path.",
      tone: testAutoBatchSendEnabled ? "attention" : "optional",
    },
    {
      title: localeText(locale, { en: "Return funds", zn: "返还资金", vn: "Hoàn tiền" }),
      description: preview.return_wallet_address
        ? `Leftover funds are sent to ${shortAddress(preview.return_wallet_address)} at the end of the run.`
        : "Leftover funds stay in each sub-wallet after the run.",
      tone: preview.return_wallet_address ? "planned" : "optional",
    },
    {
      title: localeText(locale, { en: "Swap tokens", zn: "兑换代币", vn: "Swap token" }),
      description: preview.execution.swap_transaction_count > 0
        ? `Approve ${wrappedNativeSymbol} and run ${preview.execution.swap_transaction_count} token swap${preview.execution.swap_transaction_count === 1 ? "" : "s"} across the selected routes.`
        : "No token swaps are included in this template.",
      tone: preview.execution.swap_transaction_count > 0 ? "planned" : "optional",
    },
    {
      title: distributorAutomation.enabled
        ? localeText(locale, { en: "Deploy treasury", zn: "部署资金库", vn: "Triển khai treasury" })
        : distributorAutomation.title,
      description: distributorAutomation.enabled
        ? `Deploy up to ${preview.execution.deployment_transaction_count} BatchTreasuryDistributor contract${preview.execution.deployment_transaction_count === 1 ? "" : "s"} and fund each one with successful swap outputs plus any direct ${nativeSymbol}/${wrappedNativeSymbol} from the main wallet.`
        : distributorAutomation.description,
      tone: distributorAutomation.enabled ? "planned" : "optional",
    },
    {
      title: localeText(locale, { en: "Save history", zn: "保存记录", vn: "Lưu lịch sử" }),
      description: "All transactions and run details are saved in Run history.",
      tone: "ready",
    },
  ];
}

function getPreviewStatusNote(preview: TemplateWalletSupportPreview, template: Template, locale: SupportedLocale) {
  const { nativeSymbol } = getChainUiContext(template, null, locale);
  const recipientRequired = preview.shortfall_reason?.includes("recipient_address");
  const availableEth = toNumericValue(preview.balances.available_eth);
  const totalRequiredWithFees = toNumericValue(preview.execution.total_eth_required_with_fees);
  const shortfallEth =
    availableEth !== null && totalRequiredWithFees !== null && totalRequiredWithFees > availableEth
      ? totalRequiredWithFees - availableEth
      : null;

  if (preview.can_proceed) {
    return {
      title: localeText(locale, { en: "Ready to run", zn: "可运行", vn: "Sẵn sàng chạy" }),
      detail:
        locale === "en"
          ? `Est. remaining: ${formatCryptoMetric(preview.execution.remaining_eth_after_run, nativeSymbol, { maxDecimals: 6 })}`
          : locale === "zn"
            ? `预计剩余：${formatCryptoMetric(preview.execution.remaining_eth_after_run, nativeSymbol, { maxDecimals: 6 })}`
            : `Còn lại dự kiến: ${formatCryptoMetric(preview.execution.remaining_eth_after_run, nativeSymbol, { maxDecimals: 6 })}`,
      tone: "ready" as const,
    };
  }

  if (recipientRequired) {
    return {
      title: localeText(locale, { en: "Recipient needed", zn: "需要接收地址", vn: "Cần địa chỉ nhận" }),
      detail: localeText(locale, {
        en: "Add a recipient address to continue.",
        zn: "添加接收地址后继续。",
        vn: "Thêm địa chỉ nhận để tiếp tục.",
      }),
      tone: "attention" as const,
    };
  }

  if (shortfallEth !== null) {
    return {
      title: localeText(locale, { en: `More ${nativeSymbol} needed`, zn: `需要更多 ${nativeSymbol}`, vn: `Cần thêm ${nativeSymbol}` }),
      detail:
        locale === "en"
          ? `Add ${formatCryptoMetric(shortfallEth, nativeSymbol, { maxDecimals: 6 })}.`
          : locale === "zn"
            ? `请补充 ${formatCryptoMetric(shortfallEth, nativeSymbol, { maxDecimals: 6 })}。`
            : `Thêm ${formatCryptoMetric(shortfallEth, nativeSymbol, { maxDecimals: 6 })}.`,
      tone: "attention" as const,
    };
  }

  return {
    title: localeText(locale, { en: "Not ready", zn: "未就绪", vn: "Chưa sẵn sàng" }),
    detail: localeText(locale, {
      en: "Check the wallet balance or template settings.",
      zn: "请检查钱包余额或模板设置。",
      vn: "Kiểm tra số dư ví hoặc cài đặt mẫu.",
    }),
    tone: "attention" as const,
  };
}

function automationToneClass(tone: AutomationStepTone) {
  switch (tone) {
    case "ready":
      return "bg-sky-100 text-sky-700";
    case "attention":
      return "bg-rose-100 text-rose-700";
    case "optional":
      return "bg-slate-200 text-slate-600";
    default:
      return "bg-sky-50 text-sky-700";
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
    <div className="relative px-1 py-2">
      <div className="flex items-center gap-3">
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${automationToneClass(step.tone)}`}>
          {index + 1}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900">{step.title}</p>
        </div>
      </div>
    </div>
  );
}

function buildTemplateSummary(template: Template, locale: SupportedLocale) {
  const { nativeSymbol } = getChainUiContext(template, null, locale);
  const noRouteAllocations = getTemplateNoRouteAllocations(template);
  const noRouteSuffix = noRouteAllocations.length > 0
    ? localeText(locale, {
        en: ` · ${noRouteAllocations.length} no-route token${noRouteAllocations.length === 1 ? "" : "s"}`,
        zn: ` · ${noRouteAllocations.length} 个无路由代币`,
        vn: ` · ${noRouteAllocations.length} token không có tuyến`,
      })
    : "";
  const autoTopUpSuffix = template.auto_top_up_enabled
    ? localeText(locale, { en: " · auto top-up", zn: " · 自动补充", vn: " · nạp thêm tự động" })
    : "";
  const testingExecuteSuffix = getTestAutoBatchSendEnabled(template)
    ? localeText(locale, { en: " · testing batch send", zn: " · 测试批量发送", vn: " · batch send thử nghiệm" })
    : "";
  if (template.stablecoin_distribution_mode === "none") {
    return `${localeText(locale, {
      en: `Gas, sub-wallet ${nativeSymbol}, and direct contract funding only`,
      zn: `仅包含 gas、子钱包 ${nativeSymbol} 和直接合约注资`,
      vn: `Chỉ gồm gas, ${nativeSymbol} ví con và cấp vốn hợp đồng trực tiếp`,
    })}${noRouteSuffix}${autoTopUpSuffix}${testingExecuteSuffix}`;
  }

  const routeCount = getStablecoinDistributionRows(template).filter(
    (route) => (toNumericValue(route.weth_amount_per_contract) ?? 0) > 0,
  ).length;
  if (routeCount === 0) {
    return locale === "en"
      ? `No funded token routes · ${formatFeeTier(template.fee_tier, template.chain)}${noRouteSuffix}${autoTopUpSuffix}${testingExecuteSuffix}`
      : locale === "zn"
        ? `暂无已注资的代币路由 · ${formatFeeTier(template.fee_tier, template.chain)}${noRouteSuffix}${autoTopUpSuffix}${testingExecuteSuffix}`
        : `Chưa có tuyến token được cấp vốn · ${formatFeeTier(template.fee_tier, template.chain)}${noRouteSuffix}${autoTopUpSuffix}${testingExecuteSuffix}`;
  }
  return locale === "en"
    ? `${routeCount} token route${routeCount === 1 ? "" : "s"} · ${formatFeeTier(template.fee_tier, template.chain)}${noRouteSuffix}${autoTopUpSuffix}${testingExecuteSuffix}`
    : locale === "zn"
      ? `${routeCount} 个代币路由 · ${formatFeeTier(template.fee_tier, template.chain)}${noRouteSuffix}${autoTopUpSuffix}${testingExecuteSuffix}`
      : `${routeCount} tuyến token · ${formatFeeTier(template.fee_tier, template.chain)}${noRouteSuffix}${autoTopUpSuffix}${testingExecuteSuffix}`;
}

function buildTemplateChainNote(template: Template, locale: SupportedLocale) {
  const { chainLabel } = getChainUiContext(template, null, locale);
  return localeText(locale, {
    en: `Chain: ${chainLabel}`,
    zn: `链：${chainLabel}`,
    vn: `Chuỗi: ${chainLabel}`,
  });
}

function buildAutoTopUpSummary(template: Template, locale: SupportedLocale) {
  const { nativeSymbol } = getChainUiContext(template, null, locale);
  return template.auto_top_up_enabled
    ? `${formatCryptoMetric(template.auto_top_up_threshold_eth, nativeSymbol)} -> ${formatCryptoMetric(template.auto_top_up_target_eth, nativeSymbol)}`
    : localeText(locale, { en: "Off", zn: "关闭", vn: "Tắt" });
}

function buildReturnWalletSummary(template: Template, locale: SupportedLocale) {
  return template.return_wallet_address ? shortAddress(template.return_wallet_address) : localeText(locale, { en: "Off", zn: "关闭", vn: "Tắt" });
}

function buildTestingExecuteSummary(template: Template, locale: SupportedLocale) {
  return getTestAutoBatchSendEnabled(template)
    ? localeText(locale, { en: "Testing only", zn: "仅测试", vn: "Chỉ để thử nghiệm" })
    : localeText(locale, { en: "Off", zn: "关闭", vn: "Tắt" });
}

function buildConfiguredTemplateTotals(template: Template, contractCount: number) {
  const normalizedCount = Number.isFinite(contractCount) && contractCount > 0 ? Math.floor(contractCount) : 1;
  const nativePerContract =
    (toNumericValue(template.gas_reserve_eth_per_contract) ?? 0) +
    (toNumericValue(template.direct_contract_native_eth_per_contract) ?? 0);
  const wethPerContract =
    (toNumericValue(template.swap_budget_eth_per_contract) ?? 0) +
    (toNumericValue(template.direct_contract_weth_per_contract) ?? 0);

  return {
    contractCount: normalizedCount,
    totalEth: nativePerContract * normalizedCount,
    totalWeth: wethPerContract * normalizedCount,
    nativeOnlyEquivalent: (nativePerContract + wethPerContract) * normalizedCount,
  };
}

export function WalletDetailsPage({ walletId }: { walletId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const { locale } = useI18n();
  const requestedChainParam = searchParams.get("chain");
  const preferredChain = normalizeTemplateChain(requestedChainParam);
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
  const [loadingTemplateBalances, setLoadingTemplateBalances] = useState(false);
  const [creatingSubWallets, setCreatingSubWallets] = useState(false);
  const [deletingWallet, setDeletingWallet] = useState(false);
  const [sweepingSubwallet, setSweepingSubwallet] = useState(false);
  const [withdrawingContractAddress, setWithdrawingContractAddress] = useState<string | null>(null);
  const [contractSourceOpen, setContractSourceOpen] = useState(false);
  const [loadingContractSource, setLoadingContractSource] = useState(false);
  const [contractSourceError, setContractSourceError] = useState<string | null>(null);
  const [contractSourcePayload, setContractSourcePayload] = useState<ContractSourcePayload | null>(null);
  const [runReviewOpen, setRunReviewOpen] = useState(false);
  const [runPreviewIssue, setRunPreviewIssue] = useState<TemplatePreviewIssue | null>(null);
  const [walletViewTab, setWalletViewTab] = useState("plan");
  const [runHistoryRefreshKey, setRunHistoryRefreshKey] = useState(0);
  const [reviewPreview, setReviewPreview] = useState<TemplateWalletSupportPreview | null>(null);
  const [preparingRun, setPreparingRun] = useState(false);
  const [selectedChainStatus, setSelectedChainStatus] = useState<RuntimeChainStatus | null>(null);
  const [loadingSelectedChainStatus, setLoadingSelectedChainStatus] = useState(false);
  const [selectedChainStatusError, setSelectedChainStatusError] = useState<string | null>(null);
  const dashboardPath = preferredChain ? `/?chain=${encodeURIComponent(preferredChain)}` : "/";
  const walletPathWithPreferredChain = (targetWalletId: string) =>
    preferredChain ? `/wallets/${targetWalletId}?chain=${encodeURIComponent(preferredChain)}` : `/wallets/${targetWalletId}`;

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === selectedTemplateId) ?? null,
    [selectedTemplateId, templates],
  );
  const subwalletChain = useMemo<Template["chain"] | undefined>(() => {
    if (wallet?.type !== "sub") return undefined;
    return normalizeTemplateChain(
      wallet.return_sweep_chain ?? wallet.linked_contracts?.[0]?.chain ?? wallet.chain ?? preferredChain,
    );
  }, [preferredChain, wallet?.chain, wallet?.linked_contracts, wallet?.return_sweep_chain, wallet?.type]);
  const walletBalanceChain = useMemo<Template["chain"] | undefined>(() => {
    if (selectedTemplate?.chain) return selectedTemplate.chain;
    if (wallet?.type === "sub") return subwalletChain;
    return undefined;
  }, [selectedTemplate?.chain, subwalletChain, wallet?.type]);
  const isSubwallet = wallet?.type === "sub";
  const hasWalletBalanceContext = Boolean(selectedTemplate || wallet?.type === "sub");
  const walletMatchesSelectedChain = !walletBalanceChain || !wallet?.chain || wallet.chain === walletBalanceChain;
  const balanceChainUi = getChainUiContext(
    selectedTemplate,
    wallet
      ? {
          chain: walletBalanceChain ?? wallet.chain,
          native_symbol: wallet.native_symbol,
          wrapped_native_symbol: wallet.wrapped_native_symbol,
        }
      : null,
    locale,
  );

  const buildWalletDetailsQuery = ({
    chain,
    liveBalances,
    includeTokenHoldings,
    includeSubwallets,
  }: {
    chain?: Template["chain"];
    liveBalances: boolean;
    includeTokenHoldings: boolean;
    includeSubwallets: boolean;
  }) => {
    const params = new URLSearchParams();
    if (chain) {
      params.set("chain", chain);
    }
    params.set("live_balances", liveBalances ? "true" : "false");
    params.set("include_token_holdings", includeTokenHoldings ? "true" : "false");
    params.set("include_subwallets", includeSubwallets ? "true" : "false");
    return `?${params.toString()}`;
  };

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        const walletQuery = buildWalletDetailsQuery({
          chain: preferredChain ?? undefined,
          liveBalances: false,
          includeTokenHoldings: false,
          includeSubwallets: false,
        });
        setLoadingTemplateBalances(false);
        const [walletResponse, templateResponse, optionsResponse] = await Promise.all([
          fetch(`${TEMPLATE_API_URL}/api/wallets/${walletId}/details${walletQuery}`),
          fetch(`${TEMPLATE_API_URL}/api/templates`),
          fetch(`${TEMPLATE_API_URL}/api/templates/options${preferredChain ? `?chain=${encodeURIComponent(preferredChain)}` : ""}`),
        ]);
        const [walletPayload, templatePayload, optionsPayload] = await Promise.all([
          readApiPayload(walletResponse),
          readApiPayload(templateResponse),
          readApiPayload(optionsResponse),
        ]);

        if (!walletResponse.ok) {
          throw new Error(extractPayloadErrorMessage(walletPayload, "Failed to load wallet"));
        }
        if (!templateResponse.ok) {
          throw new Error(extractPayloadErrorMessage(templatePayload, "Failed to load templates"));
        }
        if (!optionsResponse.ok) {
          throw new Error(extractPayloadErrorMessage(optionsPayload, "Failed to load template options"));
        }

        if (active) {
          const nextTemplates: Template[] = Array.isArray((templatePayload as { templates?: Template[] } | null)?.templates)
            ? (templatePayload as { templates: Template[] }).templates
            : [];
          const nextWalletPayload = walletPayload as WalletDetails;
          const nextOptionsPayload = optionsPayload as TemplateOptions;
          setWallet(nextWalletPayload);
          setTemplates(nextTemplates);
          setOptions(nextOptionsPayload);
          setSelectedTemplateId((current) => (nextTemplates.some((template) => template.id === current) ? current : ""));
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
  }, [walletId, preferredChain]);

  useEffect(() => {
    if (!selectedTemplate?.chain) return;

    let active = true;

    (async () => {
      setLoadingTemplateBalances(true);
      try {
        const query = buildWalletDetailsQuery({
          chain: selectedTemplate.chain,
          liveBalances: true,
          includeTokenHoldings: false,
          includeSubwallets: false,
        });
        const response = await fetch(
          `${TEMPLATE_API_URL}/api/wallets/${walletId}/details${query}`,
        );
        const payload = await readApiPayload(response);
        if (!response.ok) {
          throw new Error(extractPayloadErrorMessage(payload, "Failed to load wallet"));
        }
        if (active) {
          setWallet(payload as WalletDetails);
          setLoadError(null);
        }
      } catch (error) {
        if (active) {
          const message = error instanceof Error ? error.message : "Failed to load wallet details";
          setLoadError(message);
        }
      } finally {
        if (active) {
          setLoadingTemplateBalances(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [selectedTemplate?.chain, walletId]);

  useEffect(() => {
    if (!isSubwallet || !walletBalanceChain) return;

    let active = true;

    (async () => {
      setLoadingTemplateBalances(true);
      try {
        const query = buildWalletDetailsQuery({
          chain: walletBalanceChain,
          liveBalances: true,
          includeTokenHoldings: false,
          includeSubwallets: false,
        });
        const response = await fetch(`${TEMPLATE_API_URL}/api/wallets/${walletId}/details${query}`);
        const payload = await readApiPayload(response);
        if (!response.ok) {
          throw new Error(extractPayloadErrorMessage(payload, "Failed to load wallet"));
        }
        if (active) {
          setWallet(payload as WalletDetails);
          setLoadError(null);
        }
      } catch (error) {
        if (active) {
          const message = error instanceof Error ? error.message : "Failed to load wallet details";
          setLoadError(message);
        }
      } finally {
        if (active) {
          setLoadingTemplateBalances(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [isSubwallet, walletBalanceChain, walletId]);

  useEffect(() => {
    if (!selectedTemplate?.chain) {
      setSelectedChainStatus(null);
      setSelectedChainStatusError(null);
      setLoadingSelectedChainStatus(false);
      return;
    }

    let active = true;
    let timer: ReturnType<typeof setInterval> | null = null;
    const statusChainKey = getTemplateStatusChainKey(selectedTemplate.chain);

    const fetchSelectedChainStatus = async () => {
      if (!active) return;
      setLoadingSelectedChainStatus(true);
      try {
        const response = await fetch(buildApiUrl(`/status/${statusChainKey}`), { cache: "no-store" });
        const payload = (await readApiPayload(response)) as RuntimeSingleStatusResponse | { detail?: string } | null;
        if (!response.ok) {
          throw new Error(extractPayloadErrorMessage(payload, "Failed to load chain status"));
        }

        const nextStatus =
          payload && "status" in payload && payload.status
            ? (payload as RuntimeSingleStatusResponse).status
            : null;

        if (active) {
          setSelectedChainStatus(nextStatus);
          setSelectedChainStatusError(null);
        }
      } catch (error) {
        if (active) {
          setSelectedChainStatus(null);
          setSelectedChainStatusError(error instanceof Error ? error.message : "Failed to load chain status");
        }
      } finally {
        if (active) {
          setLoadingSelectedChainStatus(false);
        }
      }
    };

    void fetchSelectedChainStatus();
    timer = setInterval(() => {
      void fetchSelectedChainStatus();
    }, CHAIN_STATUS_POLL_INTERVAL_MS);

    return () => {
      active = false;
      if (timer) {
        clearInterval(timer);
      }
    };
  }, [selectedTemplate?.chain]);

  const contractCountValue = useMemo(() => Number.parseInt(contractCount, 10), [contractCount]);
  const contractCountError = useMemo(() => {
    if (!contractCount.trim()) {
      return locale === "en"
        ? "Enter a contract count between 1 and 100"
        : locale === "zn"
          ? "请输入 1 到 100 之间的合约数量"
          : "Nhập số lượng hợp đồng từ 1 đến 100";
    }
    if (!Number.isFinite(contractCountValue) || contractCountValue < 1 || contractCountValue > 100) {
      return locale === "en"
        ? "Contract count must be between 1 and 100"
        : locale === "zn"
          ? "合约数量必须在 1 到 100 之间"
          : "Số lượng hợp đồng phải từ 1 đến 100";
    }
    return null;
  }, [contractCount, contractCountValue, locale]);

  const preview = useMemo<TemplateWalletSupportPreview | null>(() => {
    if (
      !wallet ||
      wallet.type === "sub" ||
      !selectedTemplate ||
      !walletMatchesSelectedChain ||
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
  }, [wallet, selectedTemplate, walletMatchesSelectedChain, contractCountError, contractCountValue]);

  useEffect(() => {
    setReviewPreview(null);
  }, [wallet?.id, selectedTemplateId, contractCount]);

  const walletBalanceStatusMessage = useMemo(() => {
    if (!wallet) return null;
    if (!hasWalletBalanceContext) {
      return locale === "en"
        ? "Select a template to load live balances for that chain."
        : locale === "zn"
          ? "请选择模板后再加载该链的实时余额。"
          : "Hãy chọn một mẫu để tải số dư trực tiếp cho chain đó.";
    }
    if (loadingTemplateBalances) {
      return locale === "en"
        ? `Loading ${balanceChainUi.chainLabel} balances...`
        : locale === "zn"
          ? `正在加载 ${balanceChainUi.chainLabel} 余额...`
          : `Đang tải số dư ${balanceChainUi.chainLabel}...`;
    }
    if (!walletMatchesSelectedChain) {
      return locale === "en"
        ? `Refreshing ${balanceChainUi.chainLabel} balances...`
        : locale === "zn"
          ? `正在刷新 ${balanceChainUi.chainLabel} 余额...`
          : `Đang làm mới số dư ${balanceChainUi.chainLabel}...`;
    }
    if (wallet.balances_live) {
      return wallet.balance_refreshed_at
        ? locale === "en"
          ? `Live balances refreshed ${formatRelativeTimestamp(wallet.balance_refreshed_at)}`
          : locale === "zn"
            ? `实时余额已刷新 ${formatRelativeTimestamp(wallet.balance_refreshed_at)}`
            : `Số dư trực tiếp đã được làm mới ${formatRelativeTimestamp(wallet.balance_refreshed_at)}`
        : locale === "en"
          ? "Live balances fetched from the RPC."
          : locale === "zn"
            ? "实时余额已从 RPC 获取。"
            : "Số dư trực tiếp đã được lấy từ RPC.";
    }
    return wallet.balance_error ?? (locale === "en" ? "Live wallet balances are unavailable." : locale === "zn" ? "实时钱包余额不可用。" : "Số dư ví trực tiếp chưa khả dụng.");
  }, [wallet, walletMatchesSelectedChain, hasWalletBalanceContext, loadingTemplateBalances, locale, balanceChainUi.chainLabel]);

  const handleCopyAddress = async () => {
    if (!wallet?.address || !navigator.clipboard) return;
    await navigator.clipboard.writeText(wallet.address);
    toast({
      title: locale === "en" ? "Address copied" : locale === "zn" ? "地址已复制" : "Đã sao chép địa chỉ",
      description: wallet.address,
    });
  };

  const handleRefreshWallet = async () => {
    if (!walletBalanceChain) return;
    setRefreshingWallet(true);
    try {
      const payload = await fetchWalletDetails(walletBalanceChain);
      toast({
        title: locale === "en" ? "Balances refreshed" : locale === "zn" ? "余额已刷新" : "Đã làm mới số dư",
        description: payload.balance_refreshed_at
          ? locale === "en"
            ? `Updated ${formatRelativeTimestamp(payload.balance_refreshed_at)}`
            : locale === "zn"
              ? `已更新 ${formatRelativeTimestamp(payload.balance_refreshed_at)}`
              : `Đã cập nhật ${formatRelativeTimestamp(payload.balance_refreshed_at)}`
          : locale === "en"
            ? "Wallet balances were refreshed from the backend."
            : locale === "zn"
              ? "钱包余额已从后端刷新。"
              : "Số dư ví đã được làm mới từ backend.",
      });
    } catch (error) {
      setRunPreviewIssue(
        buildFallbackActionIssue(
          locale,
          {
            code: "wallet_refresh_failed",
            title: localeText(locale, { en: "Refresh failed", zn: "刷新失败", vn: "Làm mới thất bại" }),
            summary: localeText(locale, {
              en: "Failed to refresh wallet balances.",
              zn: "刷新钱包余额失败。",
              vn: "Không thể làm mới số dư ví.",
            }),
            hint: localeText(locale, {
              en: "Check the selected chain RPC and try the refresh again.",
              zn: "请检查所选链的 RPC 后再重试刷新。",
              vn: "Hãy kiểm tra RPC của chain đã chọn rồi thử làm mới lại.",
            }),
          },
          normalizePreviewFailureMessage(error instanceof Error ? error.message : null),
        ),
      );
    } finally {
      setRefreshingWallet(false);
    }
  };

  const fetchWalletDetails = async (chain?: Template["chain"]) => {
    const effectiveChain = chain ?? preferredChain ?? undefined;
    const query = buildWalletDetailsQuery({
      chain: effectiveChain,
      liveBalances: true,
      includeTokenHoldings: false,
      includeSubwallets: false,
    });
    const response = await fetch(`${TEMPLATE_API_URL}/api/wallets/${walletId}/details${query}`);
    const payload = await readApiPayload(response);
    if (!response.ok) {
      throw new Error(extractPayloadErrorMessage(payload, "Failed to refresh wallet balances"));
    }
    setWallet(payload as WalletDetails);
    return payload as WalletDetails;
  };

  const handleSweepSubwallet = async () => {
    if (!wallet || wallet.type !== "sub") return;

    setSweepingSubwallet(true);
    try {
      const response = await fetch(`${TEMPLATE_API_URL}/api/wallets/${wallet.id}/sweep`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          chain: subwalletChain ?? wallet.return_sweep_chain ?? wallet.chain ?? preferredChain,
        }),
      });
      const payload = await readApiPayload(response);
      if (!response.ok) {
        setRunPreviewIssue(
          extractActionIssueFromPayload(
            payload,
            locale,
            {
              code: "subwallet_sweep_failed",
              title: localeText(locale, { en: "Subwallet sweep failed", zn: "子钱包清扫失败", vn: "Sweep ví con thất bại" }),
              summary: localeText(locale, {
                en: "Failed to sweep leftover assets from this subwallet.",
                zn: "清扫该子钱包中的剩余资产失败。",
                vn: "Không thể sweep tài sản dư từ ví con này.",
              }),
              hint: localeText(locale, {
                en: "Check the return wallet, chain RPC, and remaining subwallet gas, then retry the sweep.",
                zn: "请检查回收地址、链 RPC 和子钱包剩余 gas 后再重试清扫。",
                vn: "Hãy kiểm tra ví nhận lại, RPC của chain và lượng gas còn lại của ví con rồi thử sweep lại.",
              }),
            },
          ),
        );
        return;
      }

      const sweepPayload = payload as {
        status?: string;
        return_wallet_address?: string | null;
        transactions?: Array<{ kind?: string }>;
        errors?: Array<{ error?: string }>;
        summary?: {
          detected_asset_count?: number | null;
          successful_asset_count?: number | null;
          failed_asset_count?: number | null;
        } | null;
      };
      const detectedCount = Number(sweepPayload.summary?.detected_asset_count ?? 0);
      const confirmedCount = sweepPayload.transactions?.length ?? 0;
      const errorCount = sweepPayload.errors?.length ?? 0;
      if (errorCount > 0) {
        setRunPreviewIssue(buildSweepIssueFromPayload(sweepPayload, locale));
        void fetchWalletDetails(
          subwalletChain ?? (wallet.return_sweep_chain as Template["chain"] | undefined) ?? (wallet.chain as Template["chain"] | undefined),
        ).catch(() => undefined);
        return;
      }
      toast({
        title:
          detectedCount === 0
            ? locale === "en"
              ? "No leftovers found"
              : locale === "zn"
                ? "未发现剩余资产"
                : "Không có tài sản dư"
            : errorCount === 0
              ? locale === "en"
                ? "Subwallet swept"
                : locale === "zn"
                  ? "子钱包已清扫"
                  : "Đã sweep ví con"
              : locale === "en"
                ? "Subwallet swept"
                : locale === "zn"
                  ? "子钱包已清扫"
                  : "Đã sweep ví con",
        description:
          detectedCount === 0
            ? locale === "en"
              ? "This subwallet does not currently hold tracked leftovers."
              : locale === "zn"
                ? "该子钱包当前没有受跟踪的剩余资产。"
                : "Ví con này hiện không giữ tài sản dư đang được theo dõi."
            : locale === "en"
              ? `${confirmedCount} return transaction${confirmedCount === 1 ? "" : "s"} sent to ${shortAddress(sweepPayload.return_wallet_address ?? wallet.return_wallet_address ?? "")}.`
              : locale === "zn"
                ? `已向 ${shortAddress(sweepPayload.return_wallet_address ?? wallet.return_wallet_address ?? "")} 发送 ${confirmedCount} 笔回收交易。`
                : `Đã gửi ${confirmedCount} giao dịch hoàn trả tới ${shortAddress(sweepPayload.return_wallet_address ?? wallet.return_wallet_address ?? "")}.`,
      });
      await fetchWalletDetails(subwalletChain ?? (wallet.return_sweep_chain as Template["chain"] | undefined) ?? (wallet.chain as Template["chain"] | undefined));
    } catch (error) {
      setRunPreviewIssue(
        buildFallbackActionIssue(
          locale,
          {
            code: "subwallet_sweep_failed",
            title: localeText(locale, { en: "Subwallet sweep failed", zn: "子钱包清扫失败", vn: "Sweep ví con thất bại" }),
            summary: localeText(locale, {
              en: "Failed to sweep leftover assets from this subwallet.",
              zn: "清扫该子钱包中的剩余资产失败。",
              vn: "Không thể sweep tài sản dư từ ví con này.",
            }),
            hint: localeText(locale, {
              en: "Check the return wallet, chain RPC, and remaining subwallet gas, then retry the sweep.",
              zn: "请检查回收地址、链 RPC 和子钱包剩余 gas 后再重试清扫。",
              vn: "Hãy kiểm tra ví nhận lại, RPC của chain và lượng gas còn lại của ví con rồi thử sweep lại.",
            }),
          },
          normalizePreviewFailureMessage(error instanceof Error ? error.message : null),
        ),
      );
    } finally {
      setSweepingSubwallet(false);
    }
  };

  const handleWithdrawContract = async (contract: LinkedTreasuryContract) => {
    if (!wallet) return;

    setWithdrawingContractAddress(contract.contract_address);
    try {
      const response = await fetch(
        `${TEMPLATE_API_URL}/api/wallets/${wallet.id}/contracts/${encodeURIComponent(contract.contract_address)}/withdraw`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            chain: contract.chain ?? walletBalanceChain ?? preferredChain ?? wallet.chain,
          }),
        },
      );
      const payload = await readApiPayload(response);
      if (!response.ok) {
        setRunPreviewIssue(
          extractActionIssueFromPayload(
            payload,
            locale,
            {
              code: "contract_withdraw_failed",
              title: localeText(locale, { en: "Withdraw failed", zn: "提取失败", vn: "Rút thất bại" }),
              summary: localeText(locale, {
                en: "Failed to withdraw funds from the linked treasury contract.",
                zn: "从关联资金库合约中提取资金失败。",
                vn: "Không thể rút tài sản khỏi treasury liên kết.",
              }),
              hint: localeText(locale, {
                en: "Check the subwallet gas, chain RPC, and contract ownership, then retry the withdraw action.",
                zn: "请检查子钱包 gas、链 RPC 和合约所有权后再重试提取。",
                vn: "Hãy kiểm tra gas của ví con, RPC của chain và quyền sở hữu hợp đồng rồi thử rút lại.",
              }),
            },
          ),
        );
        return;
      }

      const withdrawPayload = payload as {
        status?: string;
        transactions?: Array<{ kind?: string }>;
        errors?: Array<{ error?: string }>;
      };
      const confirmedCount = withdrawPayload.transactions?.length ?? 0;
      const errorCount = withdrawPayload.errors?.length ?? 0;
      if (errorCount > 0) {
        setRunPreviewIssue(buildWithdrawIssueFromPayload(withdrawPayload, locale));
        void fetchWalletDetails(walletBalanceChain ?? (contract.chain as Template["chain"] | undefined)).catch(() => undefined);
        return;
      }
      toast({
        title:
          confirmedCount > 0
            ? locale === "en"
              ? "Contract withdrawal sent"
              : locale === "zn"
                ? "合约提取已发送"
                : "Đã gửi lệnh rút khỏi hợp đồng"
            : errorCount > 0
              ? locale === "en"
                ? "Contract withdrawal failed"
                : locale === "zn"
                  ? "合约提取失败"
                  : "Rút khỏi hợp đồng thất bại"
              : locale === "en"
                ? "No contract funds left"
                : locale === "zn"
                  ? "合约中没有剩余资金"
                  : "Không còn tài sản trong hợp đồng",
        description:
          confirmedCount > 0
            ? locale === "en"
              ? `${confirmedCount} withdrawal transaction${confirmedCount === 1 ? "" : "s"} submitted. Funds return to the subwallet owner first.`
              : locale === "zn"
                ? `已提交 ${confirmedCount} 笔提取交易。资金会先返回到子钱包所有者。`
                : `Đã gửi ${confirmedCount} giao dịch rút. Tài sản sẽ quay về ví con sở hữu trước.`
            : locale === "en"
                ? "This treasury contract does not currently hold tracked assets."
                : locale === "zn"
                  ? "该资金库合约当前没有持有受跟踪的资产。"
                  : "Treasury contract này hiện không giữ tài sản đang được theo dõi.",
      });
      await fetchWalletDetails(walletBalanceChain ?? (contract.chain as Template["chain"] | undefined));
    } catch (error) {
      setRunPreviewIssue(
        buildFallbackActionIssue(
          locale,
          {
            code: "contract_withdraw_failed",
            title: localeText(locale, { en: "Withdraw failed", zn: "提取失败", vn: "Rút thất bại" }),
            summary: localeText(locale, {
              en: "Failed to withdraw funds from the linked treasury contract.",
              zn: "从关联资金库合约中提取资金失败。",
              vn: "Không thể rút tài sản khỏi treasury liên kết.",
            }),
            hint: localeText(locale, {
              en: "Check the subwallet gas, chain RPC, and contract ownership, then retry the withdraw action.",
              zn: "请检查子钱包 gas、链 RPC 和合约所有权后再重试提取。",
              vn: "Hãy kiểm tra gas của ví con, RPC của chain và quyền sở hữu hợp đồng rồi thử rút lại.",
            }),
          },
          normalizePreviewFailureMessage(error instanceof Error ? error.message : null),
        ),
      );
    } finally {
      setWithdrawingContractAddress(null);
    }
  };

  const handleViewContractSource = async (contractName?: string | null) => {
    const resolvedContractName = `${contractName ?? "BatchTreasuryDistributor"}`.trim() || "BatchTreasuryDistributor";
    setContractSourceOpen(true);
    setLoadingContractSource(true);
    setContractSourceError(null);

    try {
      const response = await fetch(
        `${TEMPLATE_API_URL}/api/wallets/contracts/source?contract_name=${encodeURIComponent(resolvedContractName)}`,
        { cache: "no-store" },
      );
      const payload = await readApiPayload(response);
      if (!response.ok) {
        throw new Error(extractPayloadErrorMessage(payload, "Failed to load contract source"));
      }
      setContractSourcePayload(payload as ContractSourcePayload);
    } catch (error) {
      setContractSourcePayload(null);
      setContractSourceError(error instanceof Error ? error.message : "Failed to load contract source");
    } finally {
      setLoadingContractSource(false);
    }
  };

  const handleDeleteWallet = async () => {
    if (!wallet) return;
    if (!window.confirm(
      locale === "en"
        ? `Delete wallet ${wallet.address}?`
        : locale === "zn"
          ? `要删除钱包 ${wallet.address} 吗？`
          : `Xóa ví ${wallet.address}?`,
    )) {
      return;
    }

    setDeletingWallet(true);
    try {
      const response = await fetch(`${TEMPLATE_API_URL}/api/wallets/${wallet.id}`, {
        method: "DELETE",
      });
      const payload = await readApiPayload(response);
      if (!response.ok) {
        throw new Error(extractPayloadErrorMessage(payload, "Failed to delete wallet"));
      }
      const deletePayload = payload as { deleted_subwallet_count?: number };
      toast({
        title: locale === "en" ? "Wallet deleted" : locale === "zn" ? "钱包已删除" : "Đã xóa ví",
        description:
          (deletePayload.deleted_subwallet_count ?? 0) > 0
            ? locale === "en"
              ? `Deleted wallet and ${deletePayload.deleted_subwallet_count} linked subwallet(s).`
              : locale === "zn"
                ? `已删除钱包和 ${deletePayload.deleted_subwallet_count} 个关联子钱包。`
                : `Đã xóa ví và ${deletePayload.deleted_subwallet_count} ví con liên kết.`
            : locale === "en"
              ? "Deleted wallet."
              : locale === "zn"
                ? "钱包已删除。"
                : "Đã xóa ví.",
      });
      router.push(dashboardPath);
    } catch (error) {
      setRunPreviewIssue(
        buildFallbackActionIssue(
          locale,
          {
            code: "wallet_delete_failed",
            title: localeText(locale, { en: "Delete failed", zn: "删除失败", vn: "Xóa thất bại" }),
            summary: localeText(locale, {
              en: "Failed to delete the wallet.",
              zn: "删除钱包失败。",
              vn: "Không thể xóa ví.",
            }),
            hint: localeText(locale, {
              en: "Retry the delete action after confirming there is no active run depending on this wallet.",
              zn: "请确认没有活动运行依赖该钱包后再重试删除。",
              vn: "Hãy xác nhận không có lượt chạy đang hoạt động phụ thuộc vào ví này rồi thử xóa lại.",
            }),
          },
          normalizePreviewFailureMessage(error instanceof Error ? error.message : null),
        ),
      );
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
      const payload = await readApiPayload(response);
      if (!response.ok) {
        throw new Error(extractPayloadErrorMessage(payload, "Failed to delete template"));
      }

      const nextTemplates = templates.filter((item) => item.id !== template.id);
      setTemplates(nextTemplates);
      if (selectedTemplateId === template.id) {
        setSelectedTemplateId("");
      }
      toast({
        title: locale === "en" ? "Template deleted" : locale === "zn" ? "模板已删除" : "Đã xóa mẫu",
        description: locale === "en" ? "The template was removed from the active library." : locale === "zn" ? "该模板已从当前模板库移除。" : "Mẫu đã được xóa khỏi thư viện đang hoạt động.",
      });
    } catch (deleteError) {
      setRunPreviewIssue(
        buildFallbackActionIssue(
          locale,
          {
            code: "template_delete_failed",
            title: localeText(locale, { en: "Delete failed", zn: "删除失败", vn: "Xóa thất bại" }),
            summary: localeText(locale, {
              en: "Failed to delete the template.",
              zn: "删除模板失败。",
              vn: "Không thể xóa mẫu.",
            }),
            hint: localeText(locale, {
              en: "Retry after confirming the template is not currently needed by another run.",
              zn: "请确认没有其他运行正在使用该模板后再重试删除。",
              vn: "Hãy xác nhận không có lượt chạy nào khác đang dùng mẫu này rồi thử xóa lại.",
            }),
          },
          normalizePreviewFailureMessage(deleteError instanceof Error ? deleteError.message : null),
        ),
      );
    }
  };

  const handleProceed = async () => {
    if (!wallet || !selectedTemplate || !preview) {
      setRunPreviewIssue({
        code: "preview_required",
        title: localeText(locale, { en: "Preview required", zn: "需要预览", vn: "Cần xem trước" }),
        summary: localeText(locale, {
          en: "Pick a template and enter a subwallet count before starting the automation check.",
          zn: "请先选择模板并输入子钱包数量，然后再开始自动化检查。",
          vn: "Hãy chọn mẫu và nhập số lượng ví con trước khi bắt đầu kiểm tra tự động hóa.",
        }),
        details: [
          localeText(locale, {
            en: "The app needs a live preview first so it can verify wallet balances, route availability, and required funding.",
            zn: "应用需要先生成实时预览，以验证钱包余额、路由可用性和所需资金。",
            vn: "Ứng dụng cần bản xem trước trực tiếp để xác minh số dư ví, khả dụng của route và số vốn cần thiết.",
          }),
        ],
        hint: localeText(locale, {
          en: "Select a template, confirm the chain, and enter the number of subwallets you want to create.",
          zn: "请选择模板、确认链，并输入想要创建的子钱包数量。",
          vn: "Hãy chọn mẫu, xác nhận chain và nhập số lượng ví con muốn tạo.",
        }),
      });
      return;
    }

    if (!preview.can_proceed) {
      setRunPreviewIssue(extractPreviewIssueFromPayload(preview, locale));
      return;
    }

    setPreparingRun(true);
    setRunPreviewIssue(null);
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
      const payload = await readApiPayload(response);
      if (!response.ok) {
        setRunPreviewIssue(extractPreviewIssueFromPayload(payload, locale));
        return;
      }
      const previewPayload = payload as TemplateWalletSupportPreview;
      if (!previewPayload.can_proceed) {
        setRunPreviewIssue(extractPreviewIssueFromPayload(previewPayload, locale));
        return;
      }
      setReviewPreview(previewPayload);
      setRunReviewOpen(true);
    } catch (error) {
      setRunPreviewIssue(
        buildFallbackPreviewIssue(
          locale,
          normalizePreviewFailureMessage(error instanceof Error ? error.message : null)
            ?? localeText(locale, {
              en: "Failed to prepare the automation preview.",
              zn: "准备自动化预览失败。",
              vn: "Không thể chuẩn bị bản xem trước tự động hóa.",
            }),
        ),
      );
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
          preview: activePreview,
        }),
      });
      const payload = await readApiPayload(response);
      if (!response.ok) {
        setRunPreviewIssue(
          extractActionIssueFromPayload(
            payload,
            locale,
            {
              code: "run_execute_failed",
              title: localeText(locale, { en: "Run failed", zn: "运行失败", vn: "Chạy thất bại" }),
              summary: localeText(locale, {
                en: "Failed to execute the automation run.",
                zn: "执行自动化运行失败。",
                vn: "Không thể thực thi lượt chạy tự động hóa.",
              }),
              hint: localeText(locale, {
                en: "Review the preview warnings, the selected chain RPC, and the wallet funding, then retry the run.",
                zn: "请检查预览警告、所选链 RPC 和钱包资金后再重试运行。",
                vn: "Hãy kiểm tra các cảnh báo của preview, RPC của chain đã chọn và số vốn của ví rồi thử chạy lại.",
              }),
            },
          ),
        );
        return;
      }
      const runPayload = payload as { status?: string };

      setRunReviewOpen(false);
      setWalletViewTab("runs");
      setRunHistoryRefreshKey((current) => current + 1);
      setReviewPreview(null);

      const runStatus = `${runPayload.status ?? ""}`.toLowerCase();
      toast({
        title:
          runStatus === "queued" || runStatus === "running"
            ? locale === "en" ? "Automation started" : locale === "zn" ? "自动化已开始" : "Tự động hóa đã bắt đầu"
            : runStatus === "completed"
              ? locale === "en" ? "Automation completed" : locale === "zn" ? "自动化已完成" : "Tự động hóa đã hoàn tất"
              : runStatus === "partial"
                ? locale === "en" ? "Automation partially completed" : locale === "zn" ? "自动化部分完成" : "Tự động hóa hoàn tất một phần"
                : runStatus === "failed"
                  ? locale === "en" ? "Automation failed" : locale === "zn" ? "自动化失败" : "Tự động hóa thất bại"
                  : locale === "en" ? "Automation submitted" : locale === "zn" ? "自动化已提交" : "Đã gửi tự động hóa",
        description:
          runStatus === "queued" || runStatus === "running"
            ? locale === "en" ? "Live updates are now available in Run history." : locale === "zn" ? "实时更新现在可以在运行记录中查看。" : "Cập nhật trực tiếp hiện đã có trong lịch sử chạy."
            : runStatus === "failed"
              ? locale === "en" ? "The run was saved to history, but the automation did not finish cleanly." : locale === "zn" ? "该运行已保存到历史记录，但自动化未能正常完成。" : "Lượt chạy đã được lưu vào lịch sử, nhưng quá trình tự động hóa không kết thúc trọn vẹn."
              : locale === "en" ? "The run was saved to history with its full funding, wrap, swap, and deployment log." : locale === "zn" ? "该运行已连同完整的注资、包装、兑换和部署日志一起保存到历史记录。" : "Lượt chạy đã được lưu vào lịch sử cùng nhật ký đầy đủ về cấp vốn, wrap, swap và triển khai.",
        variant: runStatus === "failed" || runStatus === "partial" ? "destructive" : undefined,
      });
    } catch (error) {
      setRunPreviewIssue(
        buildFallbackActionIssue(
          locale,
          {
            code: "run_execute_failed",
            title: localeText(locale, { en: "Run failed", zn: "运行失败", vn: "Chạy thất bại" }),
            summary: localeText(locale, {
              en: "Failed to execute the automation run.",
              zn: "执行自动化运行失败。",
              vn: "Không thể thực thi lượt chạy tự động hóa.",
            }),
            hint: localeText(locale, {
              en: "Review the preview warnings, the selected chain RPC, and the wallet funding, then retry the run.",
              zn: "请检查预览警告、所选链 RPC 和钱包资金后再重试运行。",
              vn: "Hãy kiểm tra các cảnh báo của preview, RPC của chain đã chọn và số vốn của ví rồi thử chạy lại.",
            }),
          },
          normalizePreviewFailureMessage(error instanceof Error ? error.message : null),
        ),
      );
    } finally {
      setCreatingSubWallets(false);
    }
  };

  const activeRunPreview = reviewPreview ?? preview;
  const selectedDistributorAutomation = selectedTemplate ? getDistributorAutomationSummary(selectedTemplate, locale) : null;
  const previewBudgetRows = wallet && preview && selectedTemplate ? buildBudgetPreviewRows(wallet, preview, selectedTemplate, locale) : [];
  const previewSwapRows = preview && selectedTemplate ? buildSwapPreviewRows(preview, selectedTemplate, locale) : [];
  const previewGasRows = preview && selectedTemplate ? buildGasEstimateRows(preview, selectedTemplate, locale) : [];
  const previewAutomationSteps = preview && selectedTemplate ? buildAutomationSteps(preview, selectedTemplate, wallet?.type ?? "main", locale) : [];
  const reviewBudgetRows = wallet && activeRunPreview && selectedTemplate ? buildBudgetPreviewRows(wallet, activeRunPreview, selectedTemplate, locale) : [];
  const reviewGasRows = activeRunPreview && selectedTemplate ? buildGasEstimateRows(activeRunPreview, selectedTemplate, locale) : [];
  const reviewAutomationSteps =
    activeRunPreview && selectedTemplate ? buildAutomationSteps(activeRunPreview, selectedTemplate, wallet?.type ?? "main", locale) : [];
  const reviewStablecoinRoutes = activeRunPreview?.stablecoin_routes ?? [];
  const previewStatusNote = preview && selectedTemplate ? getPreviewStatusNote(preview, selectedTemplate, locale) : null;
  const selectedChainUi = getChainUiContext(selectedTemplate, wallet, locale);
  const nativeSymbol = selectedChainUi.nativeSymbol;
  const wrappedNativeSymbol = selectedChainUi.wrappedNativeSymbol;
  const automationStability = getAutomationStabilitySummary(selectedChainStatus);
  const automationStabilityValue = loadingSelectedChainStatus
    ? localeText(locale, { en: "Checking...", zn: "检查中...", vn: "Đang kiểm tra..." })
    : selectedChainStatusError
      ? localeText(locale, { en: "Status unavailable", zn: "状态不可用", vn: "Không có trạng thái" })
      : automationStability.label === "Yes"
        ? localeText(locale, { en: "Yes", zn: "是", vn: "Có" })
        : automationStability.label === "No"
          ? localeText(locale, { en: "No", zn: "否", vn: "Không" })
          : localeText(locale, { en: "Unknown", zn: "未知", vn: "Chưa rõ" });
  const rpcOnlineValue = loadingSelectedChainStatus
    ? localeText(locale, { en: "Checking...", zn: "检查中...", vn: "Đang kiểm tra..." })
    : selectedChainStatusError
      ? localeText(locale, { en: "Status unavailable", zn: "状态不可用", vn: "Không có trạng thái" })
      : selectedChainStatus?.status === "unconfigured"
        ? localeText(locale, { en: "No", zn: "否", vn: "Không" })
        : isRpcOnline(selectedChainStatus)
          ? localeText(locale, { en: "Yes", zn: "是", vn: "Có" })
          : localeText(locale, { en: "No", zn: "否", vn: "Không" });
  const lagValue = loadingSelectedChainStatus
    ? localeText(locale, { en: "Checking...", zn: "检查中...", vn: "Đang kiểm tra..." })
    : selectedChainStatusError
      ? localeText(locale, { en: "Status unavailable", zn: "状态不可用", vn: "Không có trạng thái" })
      : formatChainLag(selectedChainStatus);

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar
        activeSection={activeSection}
        onSectionChange={(section) => {
          setActiveSection(section);
          router.push(dashboardPath);
        }}
        collapsed={sidebarCollapsed}
        onCollapsedChange={setSidebarCollapsed}
      />

      <div className={`flex min-h-screen flex-1 flex-col transition-all duration-300 ease-out ${sidebarCollapsed ? "ml-[72px]" : "ml-[260px]"}`}>
        <Header activeSection={activeSection} />

        <main className="flex-1 overflow-auto p-6">
          <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
            <Link href={dashboardPath} className="inline-flex items-center gap-2 text-sm text-muted-foreground transition hover:text-foreground">
              <ArrowLeft className="h-4 w-4" />
              {locale === "en" ? "Back to dashboard" : locale === "zn" ? "返回仪表盘" : "Quay lại bảng điều khiển"}
            </Link>

            {loadingWallet ? (
              <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
                {locale === "en" ? "Loading wallet details..." : locale === "zn" ? "正在加载钱包详情..." : "Đang tải chi tiết ví..."}
              </div>
            ) : loadError || !wallet ? (
              <div className="rounded-2xl border border-border bg-card p-6 text-sm text-destructive">
                {loadError ?? (locale === "en" ? "Wallet not found." : locale === "zn" ? "未找到钱包。" : "Không tìm thấy ví.")}
              </div>
            ) : (
              <>
                <SectionBlock
                  title={
                    isSubwallet
                      ? locale === "en"
                        ? "Subwallet"
                        : locale === "zn"
                          ? "子钱包"
                          : "Ví con"
                      : locale === "en"
                        ? "Main wallet"
                        : locale === "zn"
                          ? "主钱包"
                          : "Ví chính"
                  }
                  description={
                    isSubwallet
                      ? locale === "en"
                        ? "This subwallet view is read-only. You can inspect balances, linked treasury contracts, and sweep leftover funds back to the configured return wallet."
                        : locale === "zn"
                          ? "此子钱包页面为只读。你可以查看余额、关联的资金库合约，并将剩余资金清扫回已配置的回收地址。"
                          : "Trang ví con này chỉ để xem. Bạn có thể kiểm tra số dư, các hợp đồng treasury liên kết và sweep tài sản dư về ví nhận lại đã cấu hình."
                      : locale === "en"
                        ? "Each selected contract creates one new subwallet. This page checks local funding first, then the review step confirms the funding plan before submission."
                        : locale === "zn"
                          ? "每个选定合约都会创建一个新的子钱包。此页面先检查本地资金支持，再在提交前确认执行计划。"
                          : "Mỗi hợp đồng được chọn sẽ tạo một ví con mới. Trang này kiểm tra hỗ trợ vốn trước, rồi bước xem lại sẽ xác nhận kế hoạch trước khi gửi."
                  }
                >
                  <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                    <div className="flex min-w-0 items-start gap-4">
                      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 via-sky-500 to-cyan-500 text-white shadow-[0_18px_36px_-20px_rgba(37,99,235,0.65)]">
                        <WalletCards className="h-6 w-6" />
                      </div>
                      <div className="min-w-0">
                        <p className="break-all font-mono text-base font-semibold text-foreground">{wallet.address}</p>
                        <p className="mt-1 break-all text-xs text-muted-foreground">
                          {locale === "en" ? "Wallet ID" : locale === "zn" ? "钱包 ID" : "ID ví"} {wallet.id}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <Button type="button" variant="outline" onClick={handleRefreshWallet} disabled={refreshingWallet || !walletBalanceChain}>
                        <RefreshCw className={`h-4 w-4 ${refreshingWallet ? "animate-spin" : ""}`} />
                        {locale === "en" ? "Refresh balances" : locale === "zn" ? "刷新余额" : "Làm mới số dư"}
                      </Button>
                      <Button type="button" variant="outline" onClick={handleCopyAddress}>
                        <Copy className="h-4 w-4" />
                        {locale === "en" ? "Copy address" : locale === "zn" ? "复制地址" : "Sao chép địa chỉ"}
                      </Button>
                      <Button type="button" variant="outline" onClick={handleDeleteWallet} disabled={deletingWallet}>
                        <Trash2 className="h-4 w-4" />
                        {deletingWallet
                          ? locale === "en"
                            ? "Deleting..."
                            : locale === "zn"
                              ? "删除中..."
                              : "Đang xóa..."
                          : locale === "en"
                            ? "Delete wallet"
                            : locale === "zn"
                              ? "删除钱包"
                              : "Xóa ví"}
                      </Button>
                    </div>
                  </div>

                  <div
                    className={`mt-5 rounded-xl border px-4 py-3 text-sm ${
                      hasWalletBalanceContext && wallet.balances_live
                        ? "border-sky-200 bg-sky-50 text-sky-700"
                        : !hasWalletBalanceContext
                          ? "border-slate-200 bg-slate-50 text-slate-700"
                        : "border-amber-500/30 bg-amber-500/10 text-amber-800"
                    }`}
                  >
                    {walletBalanceStatusMessage}
                  </div>

                  <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <InfoCard
                      label={locale === "en" ? "Creation mode" : locale === "zn" ? "创建方式" : "Chế độ tạo"}
                      value={
                        isSubwallet
                          ? locale === "en"
                            ? "Run-created subwallet"
                            : locale === "zn"
                              ? "运行创建的子钱包"
                              : "Ví con được tạo bởi lượt chạy"
                          : wallet.type === "imported_private_key"
                          ? locale === "en"
                            ? "Linked wallets from private key"
                            : locale === "zn"
                              ? "由私钥关联的钱包"
                              : "Ví liên kết từ khóa riêng"
                          : locale === "en"
                            ? "Derived subwallets from seed"
                            : locale === "zn"
                              ? "由助记词派生的子钱包"
                              : "Ví con sinh từ seed"
                      }
                      className="sm:col-span-2"
                      hint={
                        isSubwallet
                          ? locale === "en"
                            ? "This wallet was created for an automation run. It cannot create child wallets, but it can still sweep leftovers and recover linked treasury funds."
                            : locale === "zn"
                              ? "这个钱包是为一次自动化运行创建的。它不能再创建子钱包，但仍可清扫剩余资金并提取关联资金库合约中的资产。"
                              : "Ví này được tạo cho một lượt chạy tự động hóa. Nó không thể tạo ví con khác, nhưng vẫn có thể sweep tài sản dư và rút tài sản từ treasury liên kết."
                          : wallet.type === "imported_private_key"
                          ? locale === "en"
                            ? "No seed phrase is required. Each new wallet is generated independently and linked to this imported wallet."
                            : locale === "zn"
                              ? "无需助记词。每个新钱包都会独立生成，并关联到这个导入钱包。"
                              : "Không cần seed phrase. Mỗi ví mới được tạo độc lập và liên kết với ví đã nhập này."
                          : locale === "en"
                            ? "New wallets are derived deterministically from the main wallet seed."
                            : locale === "zn"
                              ? "新钱包会从主钱包助记词中确定性派生。"
                              : "Ví mới được sinh xác định từ seed của ví chính."
                      }
                    />
                    <InfoCard
                      label={locale === "en" ? "Wallet address" : locale === "zn" ? "钱包地址" : "Địa chỉ ví"}
                      value={wallet.address}
                      className="sm:col-span-2 xl:col-span-2"
                      valueClassName="break-all font-mono text-xs leading-5"
                    />
                    <InfoCard
                      label={locale === "en" ? "Wallet ID" : locale === "zn" ? "钱包 ID" : "ID ví"}
                      value={wallet.id}
                      className="sm:col-span-2 xl:col-span-2"
                      valueClassName="break-all font-mono text-xs leading-5"
                    />
                    <InfoCard
                      label={locale === "en" ? `${nativeSymbol} balance` : locale === "zn" ? `${nativeSymbol} 余额` : `Số dư ${nativeSymbol}`}
                      value={
                        !hasWalletBalanceContext
                          ? locale === "en"
                            ? "Select a template"
                            : locale === "zn"
                              ? "请选择模板"
                              : "Hãy chọn một mẫu"
                          : loadingTemplateBalances || !walletMatchesSelectedChain
                            ? locale === "en"
                              ? "Loading..."
                              : locale === "zn"
                                ? "加载中..."
                                : "Đang tải..."
                            : formatTokenBalance(wallet.eth_balance, nativeSymbol)
                      }
                    />
                    <InfoCard
                      label={locale === "en" ? `${wrappedNativeSymbol} balance` : locale === "zn" ? `${wrappedNativeSymbol} 余额` : `Số dư ${wrappedNativeSymbol}`}
                      value={
                        !hasWalletBalanceContext
                          ? locale === "en"
                            ? "Select a template"
                            : locale === "zn"
                              ? "请选择模板"
                              : "Hãy chọn một mẫu"
                          : loadingTemplateBalances || !walletMatchesSelectedChain
                            ? locale === "en"
                              ? "Loading..."
                              : locale === "zn"
                                ? "加载中..."
                                : "Đang tải..."
                            : formatTokenBalance(wallet.weth_balance, wrappedNativeSymbol)
                      }
                    />
                  </div>
                </SectionBlock>

                {wallet.type === "sub" ? (
                  <div className="space-y-6">
                    <SectionBlock
                      title={locale === "en" ? "Subwallet details" : locale === "zn" ? "子钱包详情" : "Chi tiết ví con"}
                      description={
                        locale === "en"
                          ? "This page is read-only. Subwallets cannot create additional runs or fund child wallets."
                          : locale === "zn"
                            ? "此页面为只读。子钱包不能创建新的运行，也不能为子钱包再注资。"
                            : "Trang này chỉ đọc. Ví con không thể tạo lượt chạy mới hoặc cấp vốn cho ví con khác."
                      }
                    >
                      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                        <InfoCard
                          label={locale === "en" ? "Wallet type" : locale === "zn" ? "钱包类型" : "Loại ví"}
                          value={locale === "en" ? "Subwallet" : locale === "zn" ? "子钱包" : "Ví con"}
                        />
                        <InfoCard
                          label={locale === "en" ? "Parent wallet ID" : locale === "zn" ? "父钱包 ID" : "ID ví cha"}
                          value={wallet.parent_id ?? (locale === "en" ? "Unavailable" : locale === "zn" ? "不可用" : "Không khả dụng")}
                          valueClassName="break-all font-mono text-xs leading-5"
                        />
                        <InfoCard
                          label={locale === "en" ? "Return wallet" : locale === "zn" ? "回收地址" : "Ví nhận lại"}
                          value={
                            wallet.return_wallet_address
                              ? shortAddress(wallet.return_wallet_address)
                              : (locale === "en" ? "Not configured" : locale === "zn" ? "未配置" : "Chưa cấu hình")
                          }
                          hint={
                            wallet.return_wallet_address
                              ? wallet.return_wallet_address
                              : (locale === "en"
                                ? "Automatic and manual leftover sweeps use this address."
                                : locale === "zn"
                                  ? "自动和手动剩余资产清扫都会使用这个地址。"
                                  : "Cả sweep tự động và thủ công đều dùng địa chỉ này.")
                          }
                          valueClassName={wallet.return_wallet_address ? "font-mono text-xs leading-5" : undefined}
                        />
                      </div>
                      {wallet.parent_id || wallet.return_wallet_address ? (
                        <div className="mt-5 flex flex-wrap gap-2">
                          {wallet.parent_id ? (
                            <Button type="button" variant="outline" onClick={() => router.push(walletPathWithPreferredChain(wallet.parent_id ?? ""))}>
                              {locale === "en" ? "Open parent wallet" : locale === "zn" ? "打开父钱包" : "Mở ví cha"}
                            </Button>
                          ) : null}
                          <Button
                            type="button"
                            variant="outline"
                            onClick={handleSweepSubwallet}
                            disabled={sweepingSubwallet || !wallet.return_wallet_address}
                          >
                            {sweepingSubwallet ? <Loader2 className="h-4 w-4 animate-spin" /> : <Coins className="h-4 w-4" />}
                            {sweepingSubwallet
                              ? locale === "en"
                                ? "Sweeping..."
                                : locale === "zn"
                                  ? "清扫中..."
                                  : "Đang sweep..."
                              : locale === "en"
                                ? "Sweep To Return Wallet"
                                : locale === "zn"
                                  ? "清扫到回收地址"
                                  : "Sweep về ví nhận lại"}
                          </Button>
                        </div>
                      ) : null}
                    </SectionBlock>

                    <SectionBlock
                      title={locale === "en" ? "Linked Treasury Contracts" : locale === "zn" ? "关联资金库合约" : "Hợp đồng treasury liên kết"}
                      description={
                        locale === "en"
                          ? "These BatchTreasuryDistributor contracts were created by this subwallet. Manual withdraw calls the contract sweep methods and returns funds back to the subwallet owner first."
                          : locale === "zn"
                            ? "这些 BatchTreasuryDistributor 合约由该子钱包创建。手动提取会调用合约的 sweep 方法，并先把资金返回给子钱包所有者。"
                            : "Các hợp đồng BatchTreasuryDistributor này được tạo bởi ví con này. Rút thủ công sẽ gọi các hàm sweep của hợp đồng và đưa tài sản về ví con sở hữu trước."
                      }
                    >
                      {wallet.linked_contracts?.length ? (
                        <div className="space-y-4">
                          {wallet.linked_contracts.map((contract) => {
                            const contractChainUi = getChainUiContext(
                              undefined,
                              {
                                chain: (contract.chain ?? preferredChain ?? wallet.chain ?? "ethereum_mainnet") as Template["chain"],
                                native_symbol: contract.native_symbol ?? undefined,
                                wrapped_native_symbol: contract.wrapped_native_symbol ?? undefined,
                              },
                              locale,
                            );
                            const contractNativeSymbol = contract.native_symbol ?? contractChainUi.nativeSymbol;
                            const contractWrappedNativeSymbol = contract.wrapped_native_symbol ?? contractChainUi.wrappedNativeSymbol;
                            const hasNativeLeft = (toNumericValue(contract.eth_balance) ?? 0) > 0;
                            const withdrawing = withdrawingContractAddress === contract.contract_address;
                            return (
                              <div key={contract.contract_address} className="rounded-2xl border border-border/70 bg-background/60 p-4">
                                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                  <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <p className="text-sm font-semibold text-foreground">{contract.contract_name ?? "BatchTreasuryDistributor"}</p>
                                      <span className="inline-flex rounded-full bg-sky-50 px-2.5 py-1 text-[11px] font-medium text-sky-700 ring-1 ring-sky-200/70">
                                        {contract.chain_label ?? contractChainUi.chainLabel}
                                      </span>
                                      <span className="inline-flex rounded-full bg-secondary/70 px-2.5 py-1 text-[11px] font-medium text-foreground ring-1 ring-border/60">
                                        {formatLinkedContractStatus(contract)}
                                      </span>
                                      {!contract.code_present ? (
                                        <span className="inline-flex rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-800 ring-1 ring-amber-200/70">
                                          {locale === "en" ? "Code not found" : locale === "zn" ? "未找到链上代码" : "Không tìm thấy code"}
                                        </span>
                                      ) : null}
                                    </div>
                                    <p className="mt-2 break-all font-mono text-xs text-muted-foreground">{contract.contract_address}</p>
                                    <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
                                      {contract.recipient_address ? (
                                        <span>
                                          {locale === "en" ? "Recipient" : locale === "zn" ? "接收地址" : "Người nhận"} {shortAddress(contract.recipient_address)}
                                        </span>
                                      ) : null}
                                      {contract.return_wallet_address ? (
                                        <span>
                                          {locale === "en" ? "Return" : locale === "zn" ? "回收地址" : "Ví nhận lại"} {shortAddress(contract.return_wallet_address)}
                                        </span>
                                      ) : null}
                                      {contract.tx_hash ? (
                                        <span>
                                          {locale === "en" ? "Deploy tx" : locale === "zn" ? "部署交易" : "Tx triển khai"} {shortAddress(contract.tx_hash)}
                                        </span>
                                      ) : null}
                                    </div>
                                  </div>

                                  <div className="flex flex-wrap items-center gap-2">
                                    <Button
                                      type="button"
                                      variant="outline"
                                      onClick={() => handleViewContractSource(contract.contract_name)}
                                    >
                                      <FileText className="h-4 w-4" />
                                      {locale === "en" ? "View Code" : locale === "zn" ? "查看代码" : "Xem mã"}
                                    </Button>
                                    <Button
                                      type="button"
                                      variant="outline"
                                      onClick={() => handleWithdrawContract(contract)}
                                      disabled={withdrawing || !contract.can_withdraw}
                                    >
                                      {withdrawing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Coins className="h-4 w-4" />}
                                      {withdrawing
                                        ? locale === "en"
                                          ? "Withdrawing..."
                                          : locale === "zn"
                                            ? "提取中..."
                                            : "Đang rút..."
                                        : locale === "en"
                                          ? "Withdraw To Subwallet"
                                          : locale === "zn"
                                            ? "提取到子钱包"
                                            : "Rút về ví con"}
                                    </Button>
                                  </div>
                                </div>

                                <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                                  <InfoCard
                                    label={locale === "en" ? `${contractNativeSymbol} in contract` : locale === "zn" ? `合约中的 ${contractNativeSymbol}` : `${contractNativeSymbol} trong hợp đồng`}
                                    value={contract.balances_live ? formatTokenBalance(contract.eth_balance, contractNativeSymbol) : "Unavailable"}
                                  />
                                  <InfoCard
                                    label={locale === "en" ? `${contractWrappedNativeSymbol} in contract` : locale === "zn" ? `合约中的 ${contractWrappedNativeSymbol}` : `${contractWrappedNativeSymbol} trong hợp đồng`}
                                    value={contract.balances_live ? formatTokenBalance(contract.weth_balance, contractWrappedNativeSymbol) : "Unavailable"}
                                  />
                                  <InfoCard
                                    label={locale === "en" ? "Owner" : locale === "zn" ? "所有者" : "Chủ sở hữu"}
                                    value={contract.owner_address ? shortAddress(contract.owner_address) : (locale === "en" ? "Unavailable" : locale === "zn" ? "不可用" : "Không khả dụng")}
                                    hint={
                                      locale === "en"
                                        ? "Contract sweep returns assets here first."
                                        : locale === "zn"
                                          ? "合约提取会先把资产返回到这里。"
                                          : "Lệnh sweep của hợp đồng sẽ đưa tài sản về đây trước."
                                    }
                                  />
                                  <InfoCard
                                    label={locale === "en" ? "Last refresh" : locale === "zn" ? "最近刷新" : "Lần làm mới gần nhất"}
                                    value={
                                      contract.balance_refreshed_at
                                        ? formatRelativeTimestamp(contract.balance_refreshed_at)
                                        : locale === "en"
                                          ? "Pending RPC"
                                          : locale === "zn"
                                            ? "等待 RPC"
                                            : "Đang chờ RPC"
                                    }
                                  />
                                </div>

                                <div className="mt-4">
                                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                    {locale === "en" ? "Current Holdings" : locale === "zn" ? "当前持仓" : "Tài sản hiện có"}
                                  </p>
                                  {contract.balances_live ? (
                                    hasNativeLeft || (contract.token_holdings?.length ?? 0) > 0 ? (
                                      <div className="mt-2 flex flex-wrap gap-2">
                                        {hasNativeLeft ? (
                                          <span className="inline-flex items-center rounded-full bg-secondary/70 px-2.5 py-1 text-[11px] font-medium text-foreground ring-1 ring-border/60">
                                            {formatCryptoMetric(contract.eth_balance, contractNativeSymbol)}
                                          </span>
                                        ) : null}
                                        {contract.token_holdings?.map((holding) => (
                                          <span
                                            key={`${contract.contract_address}-${holding.address}`}
                                            className="inline-flex items-center rounded-full bg-secondary/70 px-2.5 py-1 text-[11px] font-medium text-foreground ring-1 ring-border/60"
                                          >
                                            {`${formatCryptoMetric(holding.balance, holding.symbol)}`}
                                          </span>
                                        ))}
                                      </div>
                                    ) : (
                                      <p className="mt-2 text-sm text-muted-foreground">
                                        {locale === "en"
                                          ? "No tracked assets are left in this contract."
                                          : locale === "zn"
                                            ? "该合约中没有剩余的受跟踪资产。"
                                            : "Không còn tài sản theo dõi nào trong hợp đồng này."}
                                      </p>
                                    )
                                  ) : (
                                    <p className="mt-2 text-sm text-muted-foreground">
                                      {contract.balance_error
                                        ?? (locale === "en"
                                          ? "Live contract balances are unavailable."
                                          : locale === "zn"
                                            ? "实时合约余额不可用。"
                                            : "Số dư hợp đồng trực tiếp chưa khả dụng.")}
                                    </p>
                                  )}
                                </div>

                                {contract.funded_assets?.length ? (
                                  <div className="mt-4">
                                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                      {locale === "en" ? "Funded Assets" : locale === "zn" ? "注资资产" : "Tài sản đã cấp vốn"}
                                    </p>
                                    <div className="mt-2 flex flex-wrap gap-2">
                                      {contract.funded_assets.map((asset, index) => (
                                        <span
                                          key={`${contract.contract_address}-funded-${asset.token_address ?? asset.address ?? asset.symbol ?? index}`}
                                          className="inline-flex items-center rounded-full bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-700 ring-1 ring-slate-200/70"
                                        >
                                          {asset.token_symbol ?? asset.symbol ?? asset.kind ?? "Asset"}
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                ) : null}
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="cad-panel-soft p-4 text-sm text-muted-foreground">
                          {locale === "en"
                            ? "No linked BatchTreasuryDistributor contracts were found for this subwallet on the configured chains."
                            : locale === "zn"
                              ? "在当前已配置的链上，未找到该子钱包关联的 BatchTreasuryDistributor 合约。"
                              : "Không tìm thấy hợp đồng BatchTreasuryDistributor liên kết nào cho ví con này trên các chain đã cấu hình."}
                        </div>
                      )}
                    </SectionBlock>

                    <WalletAssetMonitoring walletId={wallet.id} chain={selectedTemplate?.chain ?? preferredChain ?? wallet.chain} />
                  </div>
                ) : (
                <Tabs value={walletViewTab} onValueChange={setWalletViewTab} className="space-y-5">
                  <TabsList className="grid h-10 w-full grid-cols-3 rounded-xl sm:w-[480px]">
                    <TabsTrigger value="plan" className="w-full rounded-lg">{locale === "en" ? "Plan run" : locale === "zn" ? "运行规划" : "Lập kế hoạch chạy"}</TabsTrigger>
                    <TabsTrigger value="runs" className="w-full rounded-lg">{locale === "en" ? "Run history" : locale === "zn" ? "运行记录" : "Lịch sử chạy"}</TabsTrigger>
                    <TabsTrigger value="monitoring" className="w-full rounded-lg">{locale === "en" ? "Monitoring" : locale === "zn" ? "监控" : "Giám sát"}</TabsTrigger>
                  </TabsList>

                  <TabsContent value="plan" className="space-y-0">
                    <div className="grid gap-6 xl:grid-cols-[340px_minmax(0,1fr)]">
                  <SectionBlock
                    title={locale === "en" ? "Template library" : locale === "zn" ? "模板库" : "Thư viện mẫu"}
                    description={
                      locale === "en"
                        ? "Keep this side focused on selection. The full breakdown for the selected template appears on the right."
                        : locale === "zn"
                          ? "左侧只用于选择，右侧会显示所选模板的完整详情。"
                          : "Giữ phần này tập trung vào việc chọn mẫu. Toàn bộ chi tiết của mẫu đang chọn sẽ hiển thị bên phải."
                    }
                    className="xl:flex xl:h-[calc(100dvh-220px)] xl:flex-col"
                    bodyClassName="flex min-h-0 flex-1 flex-col"
                  >
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <p className="text-sm text-muted-foreground">
                        {loadingTemplates
                          ? locale === "en"
                            ? "Loading..."
                            : locale === "zn"
                              ? "加载中..."
                              : "Đang tải..."
                          : locale === "en"
                            ? `${templates.length} active template${templates.length === 1 ? "" : "s"}`
                            : locale === "zn"
                              ? `${templates.length} 个启用模板`
                              : `${templates.length} mẫu đang hoạt động`}
                      </p>
                      <Button type="button" onClick={openCreate}>
                        <PlusCircle className="h-4 w-4" />
                        {locale === "en" ? "Create" : locale === "zn" ? "创建" : "Tạo mới"}
                      </Button>
                    </div>

                    {templatesError ? <p className="mb-4 text-sm text-destructive">{templatesError}</p> : null}

                    {loadingTemplates ? (
                      <div className="cad-panel-soft flex flex-1 items-center p-4 text-sm text-muted-foreground">
                        {locale === "en" ? "Loading templates..." : locale === "zn" ? "正在加载模板..." : "Đang tải mẫu..."}
                      </div>
                    ) : templates.length === 0 ? (
                      <div className="cad-panel-soft flex flex-1 items-center justify-center p-6 text-center text-sm text-muted-foreground">
                        {locale === "en"
                          ? "No active v2 templates yet. Create one first, then return here to check wallet support."
                          : locale === "zn"
                            ? "当前还没有启用的 v2 模板。请先创建一个，然后返回这里检查钱包支持情况。"
                            : "Chưa có mẫu v2 nào đang hoạt động. Hãy tạo một mẫu trước rồi quay lại đây để kiểm tra hỗ trợ của ví."}
                      </div>
                    ) : (
                      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
                        {templates.map((template) => {
                          const active = template.id === selectedTemplateId;
                          const templateChainUi = getChainUiContext(template, null, locale);
                          const noRouteAllocations = getTemplateNoRouteAllocations(template);
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
                              className={`rounded-2xl p-4 text-left transition ${
                                active
                                  ? "bg-accent/85 shadow-[0_18px_38px_-28px_rgba(56,189,248,0.32)] ring-1 ring-sky-200"
                                  : "bg-card ring-1 ring-border/70 hover:bg-secondary/30"
                              }`}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2">
                                    <p className="truncate text-base font-semibold text-foreground">{template.name}</p>
                                    {active ? <CheckCircle2 className="h-4 w-4 shrink-0 text-accent" /> : null}
                                  </div>
                                  <div className="mt-2 inline-flex rounded-full bg-sky-50 px-2.5 py-1 text-[11px] font-medium text-sky-700 ring-1 ring-sky-200/70">
                                    {buildTemplateChainNote(template, locale)}
                                  </div>
                                  {noRouteAllocations.length > 0 ? (
                                    <div className="mt-2 inline-flex rounded-full bg-rose-50 px-2.5 py-1 text-[11px] font-medium text-rose-700 ring-1 ring-rose-200/70">
                                      {locale === "en"
                                        ? `${noRouteAllocations.length} token${noRouteAllocations.length === 1 ? "" : "s"} marked No route found`
                                        : locale === "zn"
                                          ? `${noRouteAllocations.length} 个代币标记为 No route found`
                                          : `${noRouteAllocations.length} token được đánh dấu No route found`}
                                    </div>
                                  ) : null}
                                  <p className="mt-1 text-xs text-muted-foreground">{buildTemplateSummary(template, locale)}</p>
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
                                <TemplateMetric label="Gas" value={`${formatAmount(template.gas_reserve_eth_per_contract)} ${templateChainUi.nativeSymbol}`} />
                                <TemplateMetric label="Swap" value={`${formatAmount(template.swap_budget_eth_per_contract)} ${templateChainUi.wrappedNativeSymbol}`} />
                                <TemplateMetric label={`Contract ${templateChainUi.nativeSymbol}`} value={`${formatAmount(template.direct_contract_native_eth_per_contract)} ${templateChainUi.nativeSymbol}`} />
                                <TemplateMetric label={`Contract ${templateChainUi.wrappedNativeSymbol}`} value={`${formatAmount(template.direct_contract_weth_per_contract)} ${templateChainUi.wrappedNativeSymbol}`} />
                                <TemplateMetric label={locale === "en" ? "Auto Top-Up" : locale === "zn" ? "自动补充" : "Nạp thêm tự động"} value={buildAutoTopUpSummary(template, locale)} />
                                <TemplateMetric label={locale === "en" ? "Test Execute" : locale === "zn" ? "测试执行" : "Chạy thử"} value={buildTestingExecuteSummary(template, locale)} />
                                <TemplateMetric label={locale === "en" ? "Return Wallet" : locale === "zn" ? "回收钱包" : "Ví nhận lại"} value={buildReturnWalletSummary(template, locale)} />
                              </div>

                              {template.notes ? (
                                <p className="mt-3 line-clamp-2 text-xs text-muted-foreground">{template.notes}</p>
                              ) : null}
                              {noRouteAllocations.length > 0 ? (
                                <div className="mt-3 flex flex-wrap gap-2">
                                  {noRouteAllocations.map((allocation) => (
                                    <NoRouteTokenBadge key={allocation.token_address} symbol={allocation.token_symbol} />
                                  ))}
                                </div>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </SectionBlock>

                  {selectedTemplate ? (
                    <div className="space-y-6">
                      {getTemplateNoRouteAllocations(selectedTemplate).length > 0 ? (
                        <div className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-rose-100">
                          <p className="font-medium">
                            {locale === "en"
                              ? "Tokens without routes"
                              : locale === "zn"
                                ? "无路由代币"
                                : "Token không có tuyến"}
                          </p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {getTemplateNoRouteAllocations(selectedTemplate).map((allocation) => (
                              <NoRouteTokenBadge key={allocation.token_address} symbol={allocation.token_symbol} />
                            ))}
                          </div>
                        </div>
                      ) : null}
                      <div className="cad-panel-accent p-4 shadow-[0_28px_60px_-44px_rgba(14,165,233,0.45)] sm:p-5">
                        <div className="rounded-[24px] bg-white/92 p-5 sm:p-6">
                            <div className="grid gap-3 xl:grid-cols-[minmax(0,1.05fr)_320px] xl:items-stretch">
                              <div className="space-y-3">
                                <div className="inline-flex items-center gap-2 rounded-full bg-primary px-3 py-1 text-xs font-medium uppercase tracking-[0.16em] text-primary-foreground">
                                  <Rocket className="h-3.5 w-3.5" />
                                  Contract Auto Deploy
                                </div>
                                <div className="space-y-3">
                                  <p className="text-lg font-semibold text-slate-950">
                                    {locale === "en" ? "Run settings" : locale === "zn" ? "运行设置" : "Thiết lập chạy"}
                                  </p>
                                  <div className="grid gap-3 sm:auto-rows-fr sm:grid-cols-[180px_minmax(0,1fr)]">
                                    <div className="cad-panel-muted flex h-full flex-col justify-between px-4 py-3">
                                      <label htmlFor="contract-count" className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
                                        {locale === "en" ? "Sub-wallet count" : locale === "zn" ? "子钱包数量" : "Số lượng ví con"}
                                      </label>
                                      <Input
                                        id="contract-count"
                                        type="number"
                                        min={1}
                                        max={100}
                                        value={contractCount}
                                        onChange={(event) => setContractCount(event.target.value)}
                                        className="mt-2 bg-background/80"
                                      />
                                    </div>

                                    {contractCountError ? (
                                      <div className="rounded-xl bg-rose-50 px-3 py-3 text-sm text-rose-700">
                                        {contractCountError}
                                      </div>
                                    ) : previewStatusNote ? (
                                      <div
                                        className={`rounded-xl px-3 py-3 ${
                                          previewStatusNote.tone === "ready"
                                            ? "bg-sky-50 text-sky-900 ring-1 ring-sky-100"
                                            : "bg-rose-50 text-rose-700 ring-1 ring-rose-100"
                                        }`}
                                      >
                                        <div className="flex h-full items-start gap-2.5">
                                          {previewStatusNote.tone === "ready" ? (
                                            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                                          ) : (
                                            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                                          )}
                                          <div>
                                            <p className="text-sm font-semibold">{previewStatusNote.title}</p>
                                            <p className="mt-1 text-xs">{previewStatusNote.detail}</p>
                                          </div>
                                        </div>
                                      </div>
                                    ) : null}
                                  </div>

                                  <div className="cad-panel-muted flex min-h-[88px] flex-col justify-center px-4 py-3">
                                    <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
                                      {locale === "en" ? "One-template budget" : locale === "zn" ? "单模板预算" : "Ngân sách một mẫu"}
                                    </p>
                                    <p className="mt-1 text-sm font-semibold text-slate-900">
                                      {locale === "en"
                                        ? `${formatCryptoMetric(selectedTemplate.gas_reserve_eth_per_contract, nativeSymbol)} gas reserve • ${formatCryptoMetric(selectedTemplate.swap_budget_eth_per_contract, wrappedNativeSymbol)} swap budget`
                                        : locale === "zn"
                                          ? `${formatCryptoMetric(selectedTemplate.gas_reserve_eth_per_contract, nativeSymbol)} gas 预留 • ${formatCryptoMetric(selectedTemplate.swap_budget_eth_per_contract, wrappedNativeSymbol)} 兑换预算`
                                          : `${formatCryptoMetric(selectedTemplate.gas_reserve_eth_per_contract, nativeSymbol)} dự phòng gas • ${formatCryptoMetric(selectedTemplate.swap_budget_eth_per_contract, wrappedNativeSymbol)} ngân sách swap`}
                                    </p>
                                  </div>
                                </div>
                              </div>

                              <div className="grid gap-3 sm:auto-rows-fr xl:w-[320px]">
                                <div className="cad-panel-muted flex min-h-[88px] flex-col justify-center px-4 py-3">
                                  <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
                                    {locale === "en" ? "Template" : locale === "zn" ? "模板" : "Mẫu"}
                                  </p>
                                  <p className="mt-1 text-sm font-semibold text-slate-900">{selectedTemplate.name}</p>
                                  <p className="mt-1 text-xs font-medium text-sky-700">{buildTemplateChainNote(selectedTemplate, locale)}</p>
                                  <p className="mt-1 text-xs text-slate-500">{buildTemplateSummary(selectedTemplate, locale)}</p>
                                </div>
                                <div className="cad-panel-muted flex min-h-[88px] flex-col justify-center px-4 py-3">
                                  <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
                                    {locale === "en" ? "Testing Recipient" : locale === "zn" ? "测试接收地址" : "Người nhận thử nghiệm"}
                                  </p>
                                  <p className="mt-1 break-all font-mono text-xs text-slate-700">
                                    {(selectedTemplate.testing_recipient_address ?? selectedTemplate.recipient_address) ?? (locale === "en" ? "Not set" : locale === "zn" ? "未设置" : "Chưa thiết lập")}
                                  </p>
                                  {selectedDistributorAutomation ? (
                                    <p className="mt-2 text-xs text-slate-500">{selectedDistributorAutomation.description}</p>
                                  ) : null}
                                </div>
                              </div>
                            </div>

                            <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_320px]">
                              <div className="space-y-5">
                                <div className="cad-panel-soft px-5 py-5">
                                  <div className="flex items-center gap-3">
                                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
                                      <Fuel className="h-5 w-5" />
                                    </div>
                                    <div>
                                      <p className="text-lg font-semibold text-slate-950">
                                        {locale === "en" ? "Chain automation status" : locale === "zn" ? "链自动化状态" : "Trạng thái tự động hóa của chain"}
                                      </p>
                                      <p className="text-sm text-slate-500">
                                        {locale === "en"
                                          ? "Live RPC status for the selected template chain. Auto-refreshes every 10 seconds."
                                          : locale === "zn"
                                            ? "所选模板链的实时 RPC 状态。每 10 秒自动刷新。"
                                            : "Trạng thái RPC trực tiếp của chain mẫu đã chọn. Tự làm mới mỗi 10 giây."}
                                      </p>
                                    </div>
                                  </div>

                                  <div className="mt-5 grid gap-3 sm:grid-cols-3">
                                    <InfoCard
                                      label={locale === "en" ? "Stable enough to automate" : locale === "zn" ? "是否足够稳定可自动化" : "Đủ ổn định để tự động hóa"}
                                      value={automationStabilityValue}
                                      valueClassName={loadingSelectedChainStatus ? "" : automationStability.tone}
                                      hint={selectedChainStatusError ?? automationStability.hint}
                                    />
                                    <InfoCard
                                      label={locale === "en" ? "How far behind" : locale === "zn" ? "落后多少" : "Đang chậm bao xa"}
                                      value={lagValue}
                                      valueClassName={loadingSelectedChainStatus || selectedChainStatusError ? "" : getChainLagTone(selectedChainStatus)}
                                      hint={
                                        selectedChainStatus?.timestamp
                                          ? locale === "en"
                                            ? `Latest block time ${selectedChainStatus.timestamp} UTC`
                                            : locale === "zn"
                                              ? `最新区块时间 ${selectedChainStatus.timestamp} UTC`
                                              : `Thời gian khối mới nhất ${selectedChainStatus.timestamp} UTC`
                                          : selectedChainStatusError ?? (locale === "en" ? "Waiting for chain status." : locale === "zn" ? "等待链状态。" : "Đang chờ trạng thái chain.")
                                      }
                                    />
                                    <InfoCard
                                      label={locale === "en" ? "RPC online" : locale === "zn" ? "RPC 在线" : "RPC trực tuyến"}
                                      value={rpcOnlineValue}
                                      valueClassName={
                                        loadingSelectedChainStatus
                                          ? ""
                                          : selectedChainStatusError
                                            ? "text-rose-700"
                                            : isRpcOnline(selectedChainStatus)
                                              ? "text-emerald-700"
                                              : "text-rose-700"
                                      }
                                      hint={
                                        selectedChainStatus?.error
                                          ? selectedChainStatus.error
                                          : selectedChainStatus?.peer_count !== null && selectedChainStatus?.peer_count !== undefined
                                            ? locale === "en"
                                              ? `${selectedChainStatus.peer_count} peers reported by the node`
                                              : locale === "zn"
                                                ? `节点报告 ${selectedChainStatus.peer_count} 个对等节点`
                                                : `Node báo cáo ${selectedChainStatus.peer_count} peer`
                                            : selectedChainStatusError ?? (locale === "en" ? "Checks node reachability and latest chain state." : locale === "zn" ? "检查节点可达性和最新链状态。" : "Kiểm tra khả năng truy cập node và trạng thái chain mới nhất.")
                                      }
                                    />
                                  </div>
                                </div>

                                <div className="cad-panel-soft px-5 py-5">
                                  <div className="flex items-center gap-3">
                                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
                                      <WalletCards className="h-5 w-5" />
                                    </div>
                                    <div>
                                      <p className="text-lg font-semibold text-slate-950">
                                        {locale === "en" ? "Budget preview" : locale === "zn" ? "预算预览" : "Xem trước ngân sách"}
                                      </p>
                                      <p className="text-sm text-slate-500">
                                        {locale === "en"
                                          ? "Real values from the selected template and the connected wallet."
                                          : locale === "zn"
                                            ? "基于所选模板和当前钱包的实际数值。"
                                            : "Giá trị thực từ mẫu đã chọn và ví đang kết nối."}
                                      </p>
                                    </div>
                                  </div>

                                  <div className="mt-5 cad-panel-muted px-4 py-2">
                                    {preview ? (
                                      previewBudgetRows.map((row) => <BudgetPreviewRow key={row.label} label={row.label} value={row.value} />)
                                    ) : (
                                      <div className="py-6 text-sm text-slate-500">
                                        {locale === "en"
                                          ? "Enter a valid sub-wallet count and make sure live balances are available to build the preview."
                                          : locale === "zn"
                                            ? "请输入有效的子钱包数量，并确保实时余额可用后再生成预览。"
                                            : "Nhập số lượng ví con hợp lệ và bảo đảm có số dư trực tiếp để tạo bản xem trước."}
                                      </div>
                                    )}
                                  </div>
                                </div>

                                <div className="cad-panel-soft px-5 py-5">
                                  <div className="flex items-center gap-3">
                                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
                                      <Coins className="h-5 w-5" />
                                    </div>
                                    <div>
                                      <p className="text-lg font-semibold text-slate-950">
                                        {locale === "en" ? `Swaps per wallet (${nativeSymbol} -> local ${wrappedNativeSymbol} -> Token)` : locale === "zn" ? `每钱包兑换（${nativeSymbol} -> 本地 ${wrappedNativeSymbol} -> 代币）` : `Swap theo mỗi ví (${nativeSymbol} -> ${wrappedNativeSymbol} cục bộ -> Token)`}
                                      </p>
                                      <p className="text-sm text-slate-500">
                                        {locale === "en" ? "Route sizing per wallet using the template allocation." : locale === "zn" ? "按模板分配展示每个钱包的路由规模。" : "Quy mô tuyến cho mỗi ví theo phân bổ của mẫu."}
                                      </p>
                                    </div>
                                  </div>

                                  <div className="cad-panel-muted mt-5 overflow-hidden">
                                    <div className="overflow-x-auto">
                                      <table className="min-w-full divide-y divide-slate-200 text-sm">
                                        <thead className="bg-slate-50">
                                          <tr>
                                            <th className="px-4 py-3 text-left font-medium text-slate-500">{locale === "en" ? "Token" : locale === "zn" ? "代币" : "Token"}</th>
                                            <th className="px-4 py-3 text-left font-medium text-slate-500">{locale === "en" ? "Budget / wallet" : locale === "zn" ? "每钱包预算" : "Ngân sách / ví"}</th>
                                            <th className="px-4 py-3 text-left font-medium text-slate-500">{locale === "en" ? "Est. output / wallet" : locale === "zn" ? "每钱包预计输出" : "Đầu ra ước tính / ví"}</th>
                                            <th className="px-4 py-3 text-left font-medium text-slate-500">{locale === "en" ? "Gas / route" : locale === "zn" ? "每路由 gas" : "Gas / tuyến"}</th>
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
                                                {locale === "en"
                                                  ? `No token swap routes are configured. The run will keep the funding flow ${nativeSymbol}-first and only deploy treasury contracts if direct contract ${nativeSymbol}/${wrappedNativeSymbol} funding is configured.`
                                                  : locale === "zn"
                                                    ? `当前没有配置代币兑换路由。此运行将保持 ${nativeSymbol} 优先注资流程，只有在配置了直接合约 ${nativeSymbol}/${wrappedNativeSymbol} 注资时才会部署资金库合约。`
                                                    : `Chưa có tuyến swap token nào được cấu hình. Lượt chạy sẽ giữ luồng cấp vốn ưu tiên ${nativeSymbol} và chỉ triển khai treasury nếu có cấp vốn ${nativeSymbol}/${wrappedNativeSymbol} trực tiếp cho hợp đồng.`}
                                              </td>
                                            </tr>
                                          )}
                                        </tbody>
                                      </table>
                                    </div>
                                  </div>
                                </div>

                                <div className="cad-panel-soft px-5 py-5">
                                  <div className="flex items-center gap-3">
                                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
                                      <Fuel className="h-5 w-5" />
                                    </div>
                                    <div>
                                      <p className="text-lg font-semibold text-slate-950">
                                        {locale === "en" ? "Gas estimates" : locale === "zn" ? "Gas 预估" : "Ước tính gas"}
                                      </p>
                                      <p className="text-sm text-slate-500">
                                        {locale === "en"
                                          ? "Funding, local wrap, swap, treasury deployment, and treasury funding costs for the selected wallet count."
                                          : locale === "zn"
                                            ? "按所选钱包数量估算注资、本地包装、兑换、资金库部署和资金库注资成本。"
                                            : "Chi phí cấp vốn, wrap cục bộ, swap, triển khai treasury và cấp vốn treasury theo số lượng ví đã chọn."}
                                      </p>
                                    </div>
                                  </div>

                                  <div className="mt-5 space-y-3">
                                    {preview ? (
                                      previewGasRows.map((row) => (
                                        <div key={row.label} className="cad-panel-muted px-4 py-3">
                                          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                                            <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">{row.label}</p>
                                            <p className="text-sm font-semibold text-slate-900">{row.value}</p>
                                          </div>
                                          <p className="mt-1 text-xs text-slate-500">{row.hint}</p>
                                        </div>
                                      ))
                                    ) : (
                                      <div className="cad-panel-muted px-4 py-6 text-sm text-slate-500">
                                        {locale === "en" ? "Gas estimates appear once the live preview is available." : locale === "zn" ? "实时预览可用后会显示 gas 预估。" : "Ước tính gas sẽ xuất hiện khi bản xem trước trực tiếp sẵn sàng."}
                                      </div>
                                    )}
                                  </div>
                                </div>

                                {selectedTemplate && !loadingTemplateBalances && !wallet.balances_live ? (
                                  <div className="rounded-2xl bg-amber-50 px-4 py-4 text-sm text-amber-800">
                                    {wallet.balance_error ?? (locale === "en" ? "Live wallet balances are unavailable, so the support preview is paused." : locale === "zn" ? "实时钱包余额不可用，因此支持预览已暂停。" : "Số dư ví trực tiếp chưa khả dụng nên bản xem trước hỗ trợ đang tạm dừng.")}
                                  </div>
                                ) : null}

                              </div>

                              <div className="space-y-5">
                                <div className="cad-panel-soft px-5 py-5">
                                  <p className="text-lg font-semibold text-slate-950">{locale === "en" ? "Automation options" : locale === "zn" ? "自动化选项" : "Tùy chọn tự động hóa"}</p>
                                  <div className="mt-4 space-y-4">
                                    <div className="grid gap-3">
                                      <div className="cad-panel-muted px-4 py-3">
                                        <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">{locale === "en" ? "Contract funding" : locale === "zn" ? "合约注资" : "Cấp vốn hợp đồng"}</p>
                                        <p className="mt-1 text-sm font-semibold text-slate-900">
                                          {locale === "en"
                                            ? `${formatCryptoMetric(selectedTemplate.direct_contract_native_eth_per_contract, nativeSymbol)} ${nativeSymbol} + ${formatCryptoMetric(selectedTemplate.direct_contract_weth_per_contract, wrappedNativeSymbol)} ${wrappedNativeSymbol} to treasury`
                                            : locale === "zn"
                                              ? `${formatCryptoMetric(selectedTemplate.direct_contract_native_eth_per_contract, nativeSymbol)} ${nativeSymbol} + ${formatCryptoMetric(selectedTemplate.direct_contract_weth_per_contract, wrappedNativeSymbol)} ${wrappedNativeSymbol} 注入资金库合约`
                                              : `${formatCryptoMetric(selectedTemplate.direct_contract_native_eth_per_contract, nativeSymbol)} ${nativeSymbol} + ${formatCryptoMetric(selectedTemplate.direct_contract_weth_per_contract, wrappedNativeSymbol)} ${wrappedNativeSymbol} vào treasury`}
                                        </p>
                                        <p className="mt-1 text-xs text-slate-500">
                                          {locale === "en" ? `The main wallet transfers direct contract ${nativeSymbol} and direct contract ${wrappedNativeSymbol} into BatchTreasuryDistributor after deployment.` : locale === "zn" ? `部署后会由主钱包把直接合约 ${nativeSymbol} 和直接合约 ${wrappedNativeSymbol} 转入 BatchTreasuryDistributor。` : `Sau khi triển khai, ví chính sẽ chuyển ${nativeSymbol} và ${wrappedNativeSymbol} cấp trực tiếp cho hợp đồng vào BatchTreasuryDistributor.`}
                                        </p>
                                      </div>
                                      <div className="cad-panel-muted px-4 py-3">
                                        <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">{locale === "en" ? "Auto top-up" : locale === "zn" ? "自动补充" : "Nạp thêm tự động"}</p>
                                        <p className="mt-1 text-sm font-semibold text-slate-900">{buildAutoTopUpSummary(selectedTemplate, locale)}</p>
                                        {selectedTemplate.auto_top_up_enabled ? (
                                          <p className="mt-1 text-xs text-slate-500">{locale === "en" ? `Refill from the main wallet when native ${nativeSymbol} gets too low mid-run.` : locale === "zn" ? `当运行中原生 ${nativeSymbol} 过低时，从主钱包自动补充。` : `Nạp lại từ ví chính khi ${nativeSymbol} gốc xuống quá thấp trong lúc chạy.`}</p>
                                        ) : null}
                                      </div>
                                      <div className="rounded-2xl bg-amber-50 px-4 py-3">
                                        <p className="text-xs font-medium uppercase tracking-[0.18em] text-amber-700">{locale === "en" ? "Testing Batch Send" : locale === "zn" ? "测试批量发送" : "Batch send thử nghiệm"}</p>
                                        <p className="mt-1 text-sm font-semibold text-slate-900">{buildTestingExecuteSummary(selectedTemplate, locale)}</p>
                                        {getTestAutoBatchSendEnabled(selectedTemplate) ? (
                                          <p className="mt-1 text-xs text-amber-800">{locale === "en" ? "Testing only. Each funded batch treasury will immediately call batchSend()." : locale === "zn" ? "仅测试。每个已注资的批量金库合约都会立即调用 batchSend()。" : "Chỉ để thử nghiệm. Mỗi batch treasury được cấp vốn sẽ gọi batchSend() ngay lập tức."}</p>
                                        ) : null}
                                      </div>
                                      <div className="cad-panel-muted px-4 py-3">
                                        <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">{locale === "en" ? "Return wallet" : locale === "zn" ? "回收钱包" : "Ví nhận lại"}</p>
                                        <p className="mt-1 text-sm font-semibold text-slate-900">{buildReturnWalletSummary(selectedTemplate, locale)}</p>
                                        {selectedTemplate.return_wallet_address ? (
                                          <p className="mt-1 text-xs text-slate-500">{locale === "en" ? "Final sub-wallet leftovers sweep into this address." : locale === "zn" ? "最终会把子钱包剩余资金归集到这个地址。" : "Phần dư cuối cùng của ví con sẽ được gom về địa chỉ này."}</p>
                                        ) : null}
                                      </div>
                                      <div className="cad-panel-muted px-4 py-3">
                                        <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">{locale === "en" ? "Protection" : locale === "zn" ? "保护设置" : "Bảo vệ"}</p>
                                        <p className="mt-1 text-sm font-semibold text-slate-900">
                                          {formatCryptoMetric(selectedTemplate.slippage_percent)}% slippage • {formatFeeTier(selectedTemplate.fee_tier, selectedTemplate.chain)}
                                        </p>
                                      </div>
                                      <div className="cad-panel-muted px-4 py-3">
                                        <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">{locale === "en" ? "Local wrap" : locale === "zn" ? "本地包装" : "Wrap cục bộ"}</p>
                                        <p className="mt-1 text-sm font-semibold text-slate-900">
                                          {(toNumericValue(selectedTemplate.swap_budget_eth_per_contract) ?? 0) > 0
                                            ? locale === "en" ? "Required by flow" : locale === "zn" ? "流程需要" : "Bắt buộc theo luồng"
                                            : locale === "en" ? "Not needed" : locale === "zn" ? "不需要" : "Không cần"}
                                        </p>
                                      </div>
                                      <div className="cad-panel-muted px-4 py-3">
                                        <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">{locale === "en" ? "Distributor flow" : locale === "zn" ? "分发流程" : "Luồng phân phối"}</p>
                                        <p className="mt-1 text-sm font-semibold text-slate-900">
                                          {selectedDistributorAutomation?.title ?? (locale === "en" ? "Auto deploy disabled" : locale === "zn" ? "自动部署已关闭" : "Tắt tự động triển khai")}
                                        </p>
                                        {selectedDistributorAutomation ? (
                                          <p className="mt-1 text-xs text-slate-500">{selectedDistributorAutomation.description}</p>
                                        ) : null}
                                      </div>
                                    </div>
                                  </div>
                                </div>

                                <div className="cad-panel-soft px-5 py-5">
                                  <p className="text-lg font-semibold text-slate-950">{locale === "en" ? "Automation flow" : locale === "zn" ? "自动化流程" : "Luồng tự động hóa"}</p>
                                  <p className="mt-1 text-sm text-slate-500">{locale === "en" ? "Simple step-by-step view of what this run will do." : locale === "zn" ? "按步骤查看这次运行会执行什么。" : "Xem từng bước ngắn gọn về những gì lượt chạy này sẽ làm."}</p>
                                  <div className="mt-4 space-y-3">
                                    {previewAutomationSteps.length > 0 ? (
                                      previewAutomationSteps.map((step, index) => <AutomationStepCard key={step.title} step={step} index={index} />)
                                    ) : (
                                      <div className="cad-panel-muted px-4 py-6 text-sm text-slate-500">
                                        {locale === "en" ? "The step list appears when the preview is ready." : locale === "zn" ? "预览准备好后会显示步骤列表。" : "Danh sách bước sẽ hiện khi bản xem trước sẵn sàng."}
                                      </div>
                                    )}
                                  </div>
                                </div>

                                {selectedTemplate.notes ? (
                                  <div className="cad-panel-soft px-5 py-5 text-sm leading-6 text-slate-600">
                                    {selectedTemplate.notes}
                                  </div>
                                ) : null}
                              </div>
                            </div>

                            <div className="mt-6 flex flex-col gap-3 border-t border-slate-200 pt-5 sm:flex-row sm:items-center sm:justify-between">
                              <Button type="button" variant="outline" onClick={() => setSelectedTemplateId("")}>
                                {locale === "en" ? "Back" : locale === "zn" ? "返回" : "Quay lại"}
                              </Button>
                              <Button
                                type="button"
                                className="sm:min-w-[220px]"
                                onClick={handleProceed}
                                disabled={creatingSubWallets || preparingRun}
                              >
                                <Rocket className="h-4 w-4" />
                                {creatingSubWallets
                                  ? locale === "en"
                                    ? "Processing..."
                                    : locale === "zn"
                                      ? "处理中..."
                                      : "Đang xử lý..."
                                  : preparingRun
                                    ? locale === "en"
                                      ? "Checking..."
                                      : locale === "zn"
                                        ? "检查中..."
                                        : "Đang kiểm tra..."
                                    : locale === "en"
                                      ? "Run Automation"
                                      : locale === "zn"
                                        ? "运行自动化"
                                        : "Chạy tự động hóa"}
                              </Button>
                            </div>
                        </div>
                      </div>

                      <TemplateMarketCheckPanel
                        template={selectedTemplate}
                        contractCount={contractCountError ? 1 : contractCountValue}
                      />
                    </div>
                  ) : (
                    <SectionBlock
                      title={locale === "en" ? "Template details" : locale === "zn" ? "模板详情" : "Chi tiết mẫu"}
                      description={locale === "en" ? "Select a template from the library to load live balances for that chain, then review its plan and support preview." : locale === "zn" ? "从模板库中选择模板后，会为该链加载实时余额，然后显示其计划和支持预览。" : "Chọn một mẫu từ thư viện để tải số dư trực tiếp cho chain đó, rồi xem kế hoạch và bản xem trước hỗ trợ ví."}
                    >
                      <div className="cad-panel-soft px-4 py-6 text-sm text-muted-foreground">
                        {locale === "en" ? "No live balance check runs yet. Choose a template to load only the balances needed for that template chain." : locale === "zn" ? "当前还不会执行实时余额检查。请选择模板，仅加载该模板所属链所需的余额。" : "Hiện chưa có kiểm tra số dư trực tiếp nào chạy. Hãy chọn một mẫu để chỉ tải các số dư cần cho chain của mẫu đó."}
                      </div>
                    </SectionBlock>
                  )}
                    </div>
                  </TabsContent>

                  <TabsContent value="runs" className="space-y-0">
                    <WalletRunHistory
                      mainWalletId={wallet.id}
                      refreshKey={runHistoryRefreshKey}
                      title={locale === "en" ? "Run history" : locale === "zn" ? "运行记录" : "Lịch sử chạy"}
                      description={locale === "en" ? `Each run creates a fresh batch of wallets, funds them with ${nativeSymbol}, wraps locally, approves and swaps when configured, deploys treasury contracts, transfers assets into them, and stores a detailed movement log here.` : locale === "zn" ? `每次运行都会创建一批新的钱包、用 ${nativeSymbol} 注资、本地包装、按配置授权和兑换、部署资金库合约、把资产转入其中，并在这里保存详细日志。` : `Mỗi lượt chạy sẽ tạo một lô ví mới, cấp vốn bằng ${nativeSymbol}, wrap cục bộ, phê duyệt và swap khi được cấu hình, triển khai treasury, chuyển tài sản vào đó và lưu nhật ký chi tiết tại đây.`}
                      emptyMessage={locale === "en" ? "No runs for this main wallet yet. Execute one from the Plan run tab and it will appear here." : locale === "zn" ? "这个主钱包还没有运行记录。请在“运行规划”标签中执行一次，记录就会显示在这里。" : "Ví chính này chưa có lượt chạy nào. Hãy thực hiện một lần trong tab lập kế hoạch chạy và nó sẽ xuất hiện ở đây."}
                    />
                  </TabsContent>

                  <TabsContent value="monitoring" className="space-y-0">
                    <WalletAssetMonitoring walletId={wallet.id} enabled={walletViewTab === "monitoring"} chain={selectedTemplate?.chain ?? preferredChain ?? wallet.chain} />
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
        open={Boolean(runPreviewIssue)}
        onOpenChange={(open) => {
          if (!open) {
            setRunPreviewIssue(null);
          }
        }}
      >
        <DialogContent className="flex max-h-[88vh] w-[calc(100vw-1.5rem)] flex-col overflow-hidden p-0 sm:max-w-2xl">
          <DialogHeader className="shrink-0 border-b border-border/70 px-4 pt-5 pb-4 sm:px-6 sm:pt-6">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-rose-100 text-rose-700">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <DialogTitle>{runPreviewIssue?.title ?? localeText(locale, { en: "Automation check failed", zn: "自动化检查失败", vn: "Kiểm tra tự động hóa thất bại" })}</DialogTitle>
                <DialogDescription className="mt-2 text-sm leading-6 text-slate-600">
                  {runPreviewIssue?.summary
                    ?? localeText(locale, {
                      en: "The automation check could not finish.",
                      zn: "自动化检查未能完成。",
                      vn: "Bước kiểm tra tự động hóa không thể hoàn tất.",
                    })}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
            <div className="rounded-2xl border border-rose-200 bg-rose-50/80 px-4 py-4">
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-rose-700">
                {localeText(locale, { en: "What went wrong", zn: "问题原因", vn: "Vấn đề đã xảy ra" })}
              </p>
              <p className="mt-2 text-sm leading-6 text-rose-900">{runPreviewIssue?.summary}</p>
            </div>

            <div className="cad-panel-soft px-4 py-4">
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
                {localeText(locale, { en: "What the check found", zn: "检查结果", vn: "Những gì bước kiểm tra đã phát hiện" })}
              </p>
              {runPreviewIssue?.details?.length ? (
                <div className="mt-3 space-y-2">
                  {runPreviewIssue.details.map((detail, index) => (
                    <div key={`${runPreviewIssue.code}-${index}`} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-700">
                      {detail}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-sm text-slate-600">
                  {localeText(locale, {
                    en: "The backend did not return additional detail for this failure.",
                    zn: "后端没有返回此失败的更多细节。",
                    vn: "Backend không trả về thêm chi tiết cho lỗi này.",
                  })}
                </p>
              )}
            </div>

            {runPreviewIssue?.hint ? (
              <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-4">
                <p className="text-xs font-medium uppercase tracking-[0.18em] text-sky-700">
                  {localeText(locale, { en: "What to do next", zn: "下一步操作", vn: "Làm gì tiếp theo" })}
                </p>
                <p className="mt-2 text-sm leading-6 text-sky-900">{runPreviewIssue.hint}</p>
              </div>
            ) : null}
          </div>

          <DialogFooter className="shrink-0 border-t border-border/70 px-4 py-4 sm:px-6">
            <Button type="button" variant="outline" onClick={() => setRunPreviewIssue(null)}>
              {localeText(locale, { en: "Close", zn: "关闭", vn: "Đóng" })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
            <DialogTitle>{locale === "en" ? "Automation review" : locale === "zn" ? "自动化复核" : "Xem lại tự động hóa"}</DialogTitle>
            <DialogDescription>
              {locale === "en" ? "Confirm the budget and automation sequence before submitting the run." : locale === "zn" ? "提交运行前，请确认预算和自动化步骤。" : "Xác nhận ngân sách và chuỗi tự động hóa trước khi gửi lượt chạy."}
            </DialogDescription>
          </DialogHeader>

          {wallet && selectedTemplate && activeRunPreview ? (
            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
              <div className="cad-panel-accent p-4 shadow-[0_28px_60px_-44px_rgba(14,165,233,0.45)]">
                <div className="rounded-[24px] bg-white/92 p-5 sm:p-6">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div className="max-w-2xl">
                      <div className="inline-flex items-center gap-2 rounded-full bg-primary px-3 py-1 text-xs font-medium uppercase tracking-[0.16em] text-primary-foreground">
                        <Rocket className="h-3.5 w-3.5" />
                        Contract Auto Deploy
                      </div>
                      <h3 className="mt-4 text-2xl font-semibold tracking-tight text-slate-950">
                        {locale === "en" ? "Final automation check" : locale === "zn" ? "最终自动化检查" : "Kiểm tra tự động hóa cuối cùng"}
                      </h3>
                      <p className="mt-2 text-sm leading-6 text-slate-600">
                        {locale === "en"
                          ? <>This run creates {activeRunPreview.contract_count} sub-wallet{activeRunPreview.contract_count === 1 ? "" : "s"} and follows the steps below for <span className="font-medium text-slate-900">{selectedTemplate.name}</span>.</>
                          : locale === "zn"
                            ? <>此运行会创建 {activeRunPreview.contract_count} 个子钱包，并为 <span className="font-medium text-slate-900">{selectedTemplate.name}</span> 按以下步骤执行。</>
                            : <>Lượt chạy này sẽ tạo {activeRunPreview.contract_count} ví con và thực hiện các bước dưới đây cho <span className="font-medium text-slate-900">{selectedTemplate.name}</span>.</>}
                      </p>
                    </div>

                    <div className="grid gap-3 sm:min-w-[280px]">
                      <div className="cad-panel-muted px-4 py-3">
                        <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">{locale === "en" ? "Source wallet" : locale === "zn" ? "源钱包" : "Ví nguồn"}</p>
                        <p className="mt-1 text-sm font-semibold text-slate-900">{shortAddress(wallet.address)}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {wallet.type === "imported_private_key"
                            ? locale === "en"
                              ? "Linked wallets from private key"
                              : locale === "zn"
                                ? "由私钥关联的钱包"
                                : "Ví liên kết từ khóa riêng"
                            : locale === "en"
                              ? "Derived wallets from seed"
                              : locale === "zn"
                                ? "由助记词派生的钱包"
                                : "Ví sinh từ seed"}
                        </p>
                      </div>
                      <div className="cad-panel-muted px-4 py-3">
                        <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">{locale === "en" ? "Recipient" : locale === "zn" ? "接收地址" : "Người nhận"}</p>
                        <p className="mt-1 break-all font-mono text-xs text-slate-700">{selectedTemplate.recipient_address ?? (locale === "en" ? "Not set" : locale === "zn" ? "未设置" : "Chưa thiết lập")}</p>
                        {selectedDistributorAutomation ? (
                          <p className="mt-2 text-xs text-slate-500">{selectedDistributorAutomation.description}</p>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {creatingSubWallets ? (
                <div className="cad-panel-accent px-5 py-5 shadow-[0_18px_40px_-34px_rgba(56,189,248,0.3)]">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-[0.18em] text-sky-700">{locale === "en" ? "Processing" : locale === "zn" ? "处理中" : "Đang xử lý"}</p>
                      <p className="mt-2 text-xl font-semibold text-slate-950">{locale === "en" ? "Automation in progress" : locale === "zn" ? "自动化进行中" : "Tự động hóa đang chạy"}</p>
                      <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                        {locale === "en" ? "The system is working through the selected steps. Live updates appear in Run history." : locale === "zn" ? "系统正在执行所选步骤。实时更新会显示在运行记录中。" : "Hệ thống đang xử lý các bước đã chọn. Cập nhật trực tiếp sẽ xuất hiện trong lịch sử chạy."}
                      </p>
                    </div>
                    <div className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-sm font-medium text-sky-700 ring-1 ring-sky-100">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {locale === "en" ? "Processing" : locale === "zn" ? "处理中" : "Đang xử lý"}
                    </div>
                  </div>

                  <div className="mt-5 h-2 overflow-hidden rounded-full bg-sky-100">
                    <div className="h-full w-2/3 animate-pulse rounded-full bg-sky-500" />
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-3">
                    <div className="cad-panel-muted px-4 py-3">
                      <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">{locale === "en" ? "Step 1" : locale === "zn" ? "步骤 1" : "Bước 1"}</p>
                      <p className="mt-1 text-sm font-semibold text-slate-900">
                        {locale === "en"
                          ? `Create ${activeRunPreview.contract_count} wallet${activeRunPreview.contract_count === 1 ? "" : "s"}`
                          : locale === "zn"
                            ? `创建 ${activeRunPreview.contract_count} 个钱包`
                            : `Tạo ${activeRunPreview.contract_count} ví`}
                      </p>
                    </div>
                    <div className="cad-panel-muted px-4 py-3">
                      <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">{locale === "en" ? "Step 2" : locale === "zn" ? "步骤 2" : "Bước 2"}</p>
                      <p className="mt-1 text-sm font-semibold text-slate-900">{locale === "en" ? `Send ${nativeSymbol} and reserve gas` : locale === "zn" ? `发送 ${nativeSymbol} 并预留 gas` : `Gửi ${nativeSymbol} và dự phòng gas`}</p>
                    </div>
                    <div className="cad-panel-muted px-4 py-3">
                      <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">{locale === "en" ? "Step 3" : locale === "zn" ? "步骤 3" : "Bước 3"}</p>
                      <p className="mt-1 text-sm font-semibold text-slate-900">
                        {locale === "en" ? "Run template actions" : locale === "zn" ? "执行模板动作" : "Chạy các hành động của mẫu"}
                      </p>
                    </div>
                  </div>
                </div>
              ) : null}

              <TemplateMarketCheckPanel
                template={selectedTemplate}
                contractCount={activeRunPreview.contract_count}
                defaultOpen
                showToggle={false}
              />

              <div className="grid gap-5 xl:grid-cols-[minmax(0,1.05fr)_320px]">
                <div className="space-y-5">
                  <div className="cad-panel-soft px-5 py-5">
                    <p className="text-lg font-semibold text-slate-950">{locale === "en" ? "Budget preview" : locale === "zn" ? "预算预览" : "Xem trước ngân sách"}</p>
                    <div className="cad-panel-muted mt-4 px-4 py-2">
                      {reviewBudgetRows.map((row) => (
                        <BudgetPreviewRow key={row.label} label={row.label} value={row.value} />
                      ))}
                    </div>
                  </div>

                  <div className="cad-panel-soft px-5 py-5">
                    <p className="text-lg font-semibold text-slate-950">{locale === "en" ? "Gas estimates" : locale === "zn" ? "Gas 预估" : "Ước tính gas"}</p>
                    <div className="mt-4 space-y-3">
                      {reviewGasRows.map((row) => (
                        <div key={row.label} className="cad-panel-muted px-4 py-3">
                          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                            <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">{row.label}</p>
                            <p className="text-sm font-semibold text-slate-900">{row.value}</p>
                          </div>
                          <p className="mt-1 text-xs text-slate-500">{row.hint}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="cad-panel-soft px-5 py-5">
                    <p className="text-lg font-semibold text-slate-950">{locale === "en" ? "Route summary" : locale === "zn" ? "路由汇总" : "Tóm tắt tuyến"}</p>
                    {reviewStablecoinRoutes.length ? (
                      <div className="mt-4 grid gap-3 md:grid-cols-2">
                        {reviewStablecoinRoutes.map((route) => (
                          <div key={route.token_address} className="cad-panel-muted px-4 py-3">
                            <p className="text-sm font-semibold text-slate-900">{route.token_symbol}</p>
                            <p className="mt-1 text-xs text-slate-500">
                              {locale === "en"
                                ? `${formatCryptoMetric(route.per_contract_weth_amount, wrappedNativeSymbol)} per wallet`
                                : locale === "zn"
                                  ? `每钱包 ${formatCryptoMetric(route.per_contract_weth_amount, wrappedNativeSymbol)}`
                                  : `${formatCryptoMetric(route.per_contract_weth_amount, wrappedNativeSymbol)} mỗi ví`}
                              {route.percent
                                ? locale === "en"
                                  ? ` • ${formatCryptoMetric(route.percent)}% allocation`
                                  : locale === "zn"
                                    ? ` • ${formatCryptoMetric(route.percent)}% 分配`
                                    : ` • ${formatCryptoMetric(route.percent)}% phân bổ`
                                : ""}
                            </p>
                            <p className="mt-2 text-sm text-slate-700">
                              {locale === "en"
                                ? `${formatCryptoMetric(route.total_weth_amount, wrappedNativeSymbol)} total route size`
                                : locale === "zn"
                                  ? `${formatCryptoMetric(route.total_weth_amount, wrappedNativeSymbol)} 路由总量`
                                  : `${formatCryptoMetric(route.total_weth_amount, wrappedNativeSymbol)} tổng quy mô tuyến`}
                            </p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-4 text-sm text-slate-500">{locale === "en" ? `No token swap routes are set. This run only sends ${nativeSymbol} unless direct contract funding is enabled.` : locale === "zn" ? `未设置代币兑换路由。除非启用直接合约注资，否则此运行只会发送 ${nativeSymbol}。` : `Chưa có tuyến swap token nào được đặt. Lượt chạy này chỉ gửi ${nativeSymbol} trừ khi bật cấp vốn hợp đồng trực tiếp.`}</p>
                    )}
                  </div>
                </div>

                <div className="space-y-5">
                  <div className="cad-panel-soft px-5 py-5">
                    <p className="text-lg font-semibold text-slate-950">{locale === "en" ? "Automation flow" : locale === "zn" ? "自动化流程" : "Luồng tự động hóa"}</p>
                    <div className="mt-4 space-y-3">
                      {reviewAutomationSteps.map((step, index) => (
                        <AutomationStepCard key={step.title} step={step} index={index} />
                      ))}
                    </div>
                  </div>

                  <div className="cad-panel-soft px-5 py-5">
                    <p className="text-lg font-semibold text-slate-950">{locale === "en" ? "Key numbers" : locale === "zn" ? "关键数字" : "Số liệu chính"}</p>
                    <div className="mt-4 grid gap-3">
                      <div className="cad-panel-muted px-4 py-3">
                        <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">{locale === "en" ? "Wallets to create" : locale === "zn" ? "待创建钱包" : "Số ví sẽ tạo"}</p>
                        <p className="mt-1 text-sm font-semibold text-slate-900">{activeRunPreview.contract_count}</p>
                      </div>
                      <div className="cad-panel-muted px-4 py-3">
                        <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">{locale === "en" ? `${nativeSymbol} deducted` : locale === "zn" ? `扣除 ${nativeSymbol}` : `${nativeSymbol} đã trừ`}</p>
                        <p className="mt-1 text-sm font-semibold text-slate-900">{formatCryptoMetric(activeRunPreview.funding.total_eth_deducted, nativeSymbol)}</p>
                      </div>
                      <div className="cad-panel-muted px-4 py-3">
                        <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">{locale === "en" ? `Local ${wrappedNativeSymbol} wrap` : locale === "zn" ? `本地 ${wrappedNativeSymbol} 包装` : `Wrap ${wrappedNativeSymbol} cục bộ`}</p>
                        <p className="mt-1 text-sm font-semibold text-slate-900">{formatCryptoMetric(activeRunPreview.funding.weth_from_wrapped_eth, wrappedNativeSymbol)}</p>
                      </div>
                      <div className="cad-panel-muted px-4 py-3">
                        <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">{locale === "en" ? `${wrappedNativeSymbol} from main wallet` : locale === "zn" ? `来自主钱包的 ${wrappedNativeSymbol}` : `${wrappedNativeSymbol} từ ví chính`}</p>
                        <p className="mt-1 text-sm font-semibold text-slate-900">{formatCryptoMetric(activeRunPreview.funding.weth_from_main_wallet, wrappedNativeSymbol)}</p>
                      </div>
                      <div className="cad-panel-muted px-4 py-3">
                        <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">{locale === "en" ? `Estimated remaining ${nativeSymbol}` : locale === "zn" ? `预计剩余 ${nativeSymbol}` : `${nativeSymbol} còn lại dự kiến`}</p>
                        <p className="mt-1 text-sm font-semibold text-slate-900">{formatCryptoMetric(activeRunPreview.execution.remaining_eth_after_run, nativeSymbol)}</p>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl bg-amber-50 px-4 py-4 text-sm text-amber-900">
                    {locale === "en" ? "All transactions and run details will be saved in Run history." : locale === "zn" ? "所有交易和运行详情都会保存在运行记录中。" : "Mọi giao dịch và chi tiết lượt chạy sẽ được lưu trong lịch sử chạy."}
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
              {locale === "en" ? "Back" : locale === "zn" ? "返回" : "Quay lại"}
            </Button>
            <Button type="button" onClick={handleRun} disabled={creatingSubWallets}>
              <Rocket className="h-4 w-4" />
              {creatingSubWallets
                ? locale === "en"
                  ? "Processing..."
                  : locale === "zn"
                    ? "处理中..."
                    : "Đang xử lý..."
                : locale === "en"
                  ? "Run Automation"
                  : locale === "zn"
                    ? "运行自动化"
                    : "Chạy tự động hóa"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={contractSourceOpen}
        onOpenChange={(open) => {
          setContractSourceOpen(open);
          if (!open) {
            setContractSourceError(null);
          }
        }}
      >
        <DialogContent className="flex max-h-[88vh] w-[calc(100vw-1.5rem)] flex-col overflow-hidden p-0 sm:max-w-5xl">
          <DialogHeader className="shrink-0 border-b border-border/70 px-4 pt-5 pb-4 sm:px-6 sm:pt-6">
            <DialogTitle>
              {contractSourcePayload?.contract_name ?? (locale === "en" ? "Contract source" : locale === "zn" ? "合约源码" : "Mã nguồn hợp đồng")}
            </DialogTitle>
            <DialogDescription>
              {contractSourcePayload?.source_path
                ?? (locale === "en"
                  ? "View the exact Solidity source currently configured by the app."
                  : locale === "zn"
                    ? "查看当前应用配置使用的 Solidity 源码。"
                    : "Xem chính xác mã nguồn Solidity mà ứng dụng đang dùng.")}
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-auto px-4 py-4 sm:px-6">
            {loadingContractSource ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>{locale === "en" ? "Loading contract source..." : locale === "zn" ? "正在加载合约源码..." : "Đang tải mã nguồn hợp đồng..."}</span>
              </div>
            ) : contractSourceError ? (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {contractSourceError}
              </div>
            ) : contractSourcePayload ? (
              <pre className="overflow-x-auto rounded-2xl bg-slate-950 p-4 text-[11px] leading-5 text-slate-100">
                <code>{contractSourcePayload.source_code}</code>
              </pre>
            ) : (
              <p className="text-sm text-muted-foreground">
                {locale === "en"
                  ? "Contract source is unavailable."
                  : locale === "zn"
                    ? "合约源码不可用。"
                    : "Mã nguồn hợp đồng không khả dụng."}
              </p>
            )}
          </div>
          <DialogFooter className="shrink-0 border-t border-border/70 px-4 py-4 sm:px-6">
            <Button type="button" variant="outline" onClick={() => setContractSourceOpen(false)}>
              {locale === "en" ? "Close" : locale === "zn" ? "关闭" : "Đóng"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
