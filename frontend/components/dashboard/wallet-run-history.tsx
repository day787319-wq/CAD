"use client";

import { type CSSProperties, MouseEvent, useEffect, useRef, useState } from "react";
import { AlertTriangle, ArrowRightLeft, Boxes, CheckCircle2, CircleDashed, CircleSlash, Copy, Download, Loader2, Rocket, ScrollText, Trash2, WalletCards } from "lucide-react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n-provider";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { API_URL } from "@/lib/api";
import { localeTagByLocale, type SupportedLocale } from "@/lib/i18n";

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

function formatTimestamp(value: string | null | undefined, locale: SupportedLocale) {
  if (!value) return locale === "en" ? "Unknown" : locale === "zn" ? "未知" : "Không xác định";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat(localeTagByLocale[locale], {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "short",
  }).format(parsed);
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

function toTitleLabel(value: string | null | undefined) {
  return `${value ?? ""}`
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

const logLabelMap: Record<string, Record<SupportedLocale, string>> = {
  run: { en: "Run", zn: "运行", vn: "Lần chạy" },
  started: { en: "Started", zn: "已开始", vn: "Đã bắt đầu" },
  ready: { en: "Ready", zn: "就绪", vn: "Sẵn sàng" },
  funding: { en: "Funding", zn: "注资", vn: "Cấp vốn" },
  wallet_creation: { en: "Wallet Creation", zn: "钱包创建", vn: "Tạo ví" },
  deployment: { en: "Deployment", zn: "部署", vn: "Triển khai" },
  distribution: { en: "Distribution", zn: "分发", vn: "Phân phối" },
  wrapping: { en: "Wrapping", zn: "包装", vn: "Wrap" },
  approval: { en: "Approval", zn: "授权", vn: "Phê duyệt" },
  swap: { en: "Swap", zn: "兑换", vn: "Swap" },
  confirmed: { en: "Confirmed", zn: "已确认", vn: "Đã xác nhận" },
  completed: { en: "Completed", zn: "已完成", vn: "Hoàn tất" },
  submitted: { en: "Submitted", zn: "已提交", vn: "Đã gửi" },
  skipped: { en: "Skipped", zn: "已跳过", vn: "Bỏ qua" },
  failed: { en: "Failed", zn: "失败", vn: "Thất bại" },
  run_started: { en: "Run Started", zn: "运行开始", vn: "Bắt đầu chạy" },
  run_finished: { en: "Run Finished", zn: "运行结束", vn: "Kết thúc chạy" },
  run_snapshot_recorded: { en: "Run Snapshot Recorded", zn: "已记录运行快照", vn: "Đã ghi snapshot chạy" },
  movement: { en: "Movement", zn: "变动", vn: "Biến động" },
  transfer: { en: "Transfer", zn: "转账", vn: "Chuyển" },
};

const logDetailLabelMap: Record<string, Record<SupportedLocale, string>> = {
  main_wallet_id: { en: "Main Wallet ID", zn: "主钱包 ID", vn: "ID ví chính" },
  main_wallet_address: { en: "Main Wallet Address", zn: "主钱包地址", vn: "Địa chỉ ví chính" },
  template_id: { en: "Template ID", zn: "模板 ID", vn: "ID mẫu" },
  template_name: { en: "Template Name", zn: "模板名称", vn: "Tên mẫu" },
  subwallet_count: { en: "Subwallet Count", zn: "子钱包数量", vn: "Số lượng ví con" },
  gas_reserve_eth_per_wallet: { en: "Gas Reserve ETH Per Wallet", zn: "每钱包 Gas 预留 ETH", vn: "ETH dự phòng gas mỗi ví" },
  direct_eth_per_wallet: { en: "Direct ETH Per Wallet", zn: "每钱包直接 ETH", vn: "ETH trực tiếp mỗi ví" },
  direct_contract_native_eth_per_wallet: { en: "Direct Contract Native ETH Per Wallet", zn: "每钱包合约原生 ETH", vn: "ETH gốc hợp đồng mỗi ví" },
  per_wallet_eth: { en: "Per Wallet ETH", zn: "每钱包 ETH", vn: "ETH mỗi ví" },
  per_wallet_local_wrap_weth: { en: "Per Wallet Local Wrap WETH", zn: "每钱包本地包装 WETH", vn: "WETH wrap cục bộ mỗi ví" },
  swap_budget_weth_per_wallet: { en: "Swap Budget WETH Per Wallet", zn: "每钱包 WETH 兑换预算", vn: "Ngân sách swap WETH mỗi ví" },
  direct_contract_weth_per_wallet: { en: "Direct Contract WETH Per Wallet", zn: "每钱包合约 WETH", vn: "WETH hợp đồng mỗi ví" },
  test_auto_execute_after_funding: { en: "Test Auto Execute After Funding", zn: "注资后测试自动执行", vn: "Tự chạy thử sau cấp vốn" },
  total_eth_deducted: { en: "Total ETH Deducted", zn: "扣除 ETH 总额", vn: "Tổng ETH đã trừ" },
  total_eth_required_with_fees: { en: "Total ETH Required With Fees", zn: "含手续费所需 ETH 总额", vn: "Tổng ETH cần gồm phí" },
  main_wallet_network_fee_eth: { en: "Main Wallet Network Fee ETH", zn: "主钱包网络费 ETH", vn: "Phí mạng ETH ví chính" },
  top_up_network_fee_eth: { en: "Top Up Network Fee ETH", zn: "补充网络费 ETH", vn: "Phí mạng nạp thêm ETH" },
  local_execution_gas_fee_eth: { en: "Local Execution Gas Fee ETH", zn: "本地执行 Gas 费 ETH", vn: "Phí gas thực thi cục bộ ETH" },
  local_execution_gas_fee_per_wallet_eth: { en: "Local Execution Gas Fee Per Wallet ETH", zn: "每钱包本地执行 Gas 费 ETH", vn: "Phí gas thực thi cục bộ mỗi ví ETH" },
  auto_top_up_enabled: { en: "Auto Top Up Enabled", zn: "已启用自动补充", vn: "Đã bật nạp thêm tự động" },
  auto_top_up_threshold_eth: { en: "Auto Top Up Threshold ETH", zn: "自动补充阈值 ETH", vn: "Ngưỡng nạp thêm tự động ETH" },
  auto_top_up_target_eth: { en: "Auto Top Up Target ETH", zn: "自动补充目标 ETH", vn: "Mục tiêu nạp thêm tự động ETH" },
  projected_auto_top_up_eth_total: { en: "Projected Auto Top Up ETH Total", zn: "预计自动补充 ETH 总额", vn: "Tổng ETH nạp thêm dự kiến" },
  stablecoin_route_count: { en: "Stablecoin Route Count", zn: "稳定币路由数量", vn: "Số lượng tuyến stablecoin" },
  required_total_eth: { en: "Required Total ETH", zn: "所需 ETH 总额", vn: "Tổng ETH cần" },
  initial_funding_eth: { en: "Initial Funding ETH", zn: "初始注资 ETH", vn: "ETH cấp vốn ban đầu" },
  local_wrap_weth_total: { en: "Local Wrap WETH Total", zn: "本地包装 WETH 总额", vn: "Tổng WETH wrap cục bộ" },
  funding_transaction_count: { en: "Funding Transaction Count", zn: "注资交易数", vn: "Số giao dịch cấp vốn" },
  top_up_transaction_count: { en: "Top Up Transaction Count", zn: "补充交易数", vn: "Số giao dịch nạp thêm" },
  recipient_address_present: { en: "Recipient Address Present", zn: "已设置接收地址", vn: "Có địa chỉ nhận" },
  direct_contract_native_eth_per_contract: { en: "Direct Contract Native ETH Per Contract", zn: "每合约原生 ETH", vn: "ETH gốc hợp đồng mỗi hợp đồng" },
  direct_contract_weth_per_contract: { en: "Direct Contract WETH Per Contract", zn: "每合约 WETH", vn: "WETH hợp đồng mỗi hợp đồng" },
  run_status: { en: "Run Status", zn: "运行状态", vn: "Trạng thái chạy" },
  funding_submitted_transaction_count: { en: "Funding Submitted Transaction Count", zn: "已提交注资交易数", vn: "Số giao dịch cấp vốn đã gửi" },
  subwallet_wrap_count: { en: "Subwallet Wrap Count", zn: "子钱包包装数", vn: "Số lần wrap ví con" },
  top_up_success_count: { en: "Top Up Success Count", zn: "补充成功数", vn: "Số lần nạp thêm thành công" },
  top_up_failure_count: { en: "Top Up Failure Count", zn: "补充失败数", vn: "Số lần nạp thêm thất bại" },
  contract_execute_success_count: { en: "Contract Execute Success Count", zn: "合约执行成功数", vn: "Số lần thực thi hợp đồng thành công" },
  contract_execute_failure_count: { en: "Contract Execute Failure Count", zn: "合约执行失败数", vn: "Số lần thực thi hợp đồng thất bại" },
  return_sweep_success_count: { en: "Return Sweep Success Count", zn: "回收成功数", vn: "Số lần gom trả thành công" },
  return_sweep_failure_count: { en: "Return Sweep Failure Count", zn: "回收失败数", vn: "Số lần gom trả thất bại" },
  execution_failure_count: { en: "Execution Failure Count", zn: "执行失败数", vn: "Số lỗi thực thi" },
  approval_success_count: { en: "Approval Success Count", zn: "授权成功数", vn: "Số lần phê duyệt thành công" },
  approval_failure_count: { en: "Approval Failure Count", zn: "授权失败数", vn: "Số lần phê duyệt thất bại" },
  swap_success_count: { en: "Swap Success Count", zn: "兑换成功数", vn: "Số lần swap thành công" },
  swap_failure_count: { en: "Swap Failure Count", zn: "兑换失败数", vn: "Số lần swap thất bại" },
  deployed_contract_count: { en: "Deployed Contract Count", zn: "已部署合约数", vn: "Số hợp đồng đã triển khai" },
  deployment_failure_count: { en: "Deployment Failure Count", zn: "部署失败数", vn: "Số lần triển khai thất bại" },
  contract_funding_success_count: { en: "Contract Funding Success Count", zn: "合约注资成功数", vn: "Số lần cấp vốn hợp đồng thành công" },
  contract_funding_failure_count: { en: "Contract Funding Failure Count", zn: "合约注资失败数", vn: "Số lần cấp vốn hợp đồng thất bại" },
  starting_nonce: { en: "Starting Nonce", zn: "起始 Nonce", vn: "Nonce bắt đầu" },
  index: { en: "Index", zn: "序号", vn: "Chỉ số" },
};

function getLocalizedLogLabel(value: string | null | undefined, locale: SupportedLocale) {
  const normalized = `${value ?? ""}`.trim().toLowerCase();
  if (!normalized) return locale === "en" ? "Run" : locale === "zn" ? "运行" : "Lần chạy";
  return logLabelMap[normalized]?.[locale] ?? toTitleLabel(value);
}

function getLogHeadingLabel(log: RunLog, locale: SupportedLocale) {
  const stage = (log.stage ?? "").trim().toLowerCase();
  const event = (log.event ?? "").trim().toLowerCase();
  const status = (log.status ?? "").trim().toLowerCase();

  if (stage === "run") {
    if (event) return getLocalizedLogLabel(event, locale);
    if (status && status !== "run") return getLocalizedLogLabel(status, locale);
    return locale === "en" ? "Run" : locale === "zn" ? "运行" : "Lần chạy";
  }

  return getLocalizedLogLabel(log.stage ?? log.event ?? log.status ?? "run", locale);
}

function formatLogDetailLabel(key: string, locale: SupportedLocale) {
  const normalized = key.toLowerCase();
  if (logDetailLabelMap[normalized]) return logDetailLabelMap[normalized][locale];
  return toTitleLabel(
    key
      .replace(/\beth\b/gi, "ETH")
      .replace(/\bweth\b/gi, "WETH")
      .replace(/\bid\b/gi, "ID")
      .replace(/\btx\b/gi, "TX")
  );
}

function formatLogDetailValue(key: string, value: string | number | boolean | null, locale: SupportedLocale) {
  if (typeof value === "boolean") return value ? (locale === "en" ? "Yes" : locale === "zn" ? "是" : "Có") : (locale === "en" ? "No" : locale === "zn" ? "否" : "Không");
  const text = `${value ?? ""}`;
  if (!text) return text;
  if (key === "run_status") return getRunStatusLabel(text, locale);
  if (key.includes("address")) return shortValue(text, 10, 6);
  if (key.endsWith("_id")) return shortValue(text, 10, 6);
  return text;
}

function getLogDetailEntries(details: RunLog["details"], locale: SupportedLocale) {
  if (!details) return [];
  return Object.entries(details)
    .filter(([, value]) => value !== null && value !== undefined && value !== "")
    .map(([key, value]) => ({
      key,
      label: formatLogDetailLabel(key, locale),
      value: formatLogDetailValue(key, value, locale),
    }));
}

function getLocalizedLogMessage(log: RunLog, locale: SupportedLocale) {
  const message = (log.message ?? "").trim();
  if (!message) return log.event ? getLocalizedLogLabel(log.event, locale) : (locale === "en" ? "Run activity" : locale === "zn" ? "运行活动" : "Hoạt động chạy");

  const startedRunMatch = message.match(/^Started run for template (.+) with (\d+) new subwallets?\.$/i);
  if (startedRunMatch) {
    const [, templateName, count] = startedRunMatch;
    return locale === "en"
      ? message
      : locale === "zn"
        ? `已开始运行模板 ${templateName}，创建 ${count} 个新子钱包。`
        : `Đã bắt đầu chạy mẫu ${templateName} với ${count} ví con mới.`;
  }

  const createdBatchMatch = message.match(/^Created (\d+) new subwallets?\.$/i);
  if (createdBatchMatch) {
    const [, count] = createdBatchMatch;
    return locale === "en"
      ? message
      : locale === "zn"
        ? `已创建 ${count} 个新子钱包。`
        : `Đã tạo ${count} ví con mới.`;
  }

  const createdSubwalletMatch = message.match(/^Created subwallet #(\d+) at (0x[a-fA-F0-9]+)\.$/i);
  if (createdSubwalletMatch) {
    const [, index, address] = createdSubwalletMatch;
    return locale === "en"
      ? message
      : locale === "zn"
        ? `已创建子钱包 #${index}，地址为 ${address}。`
        : `Đã tạo ví con #${index} tại ${address}.`;
  }

  const submittedTransferMatch = message.match(/^Submitted ETH transfer to subwallet (0x[a-fA-F0-9]+)\.$/i);
  if (submittedTransferMatch) {
    const [, address] = submittedTransferMatch;
    return locale === "en"
      ? message
      : locale === "zn"
        ? `已向子钱包 ${address} 提交 ETH 转账。`
        : `Đã gửi giao dịch chuyển ETH đến ví con ${address}.`;
  }

  const confirmedFundingMatch = message.match(/^Confirmed ETH funding for subwallet (0x[a-fA-F0-9]+)\.$/i);
  if (confirmedFundingMatch) {
    const [, address] = confirmedFundingMatch;
    return locale === "en"
      ? message
      : locale === "zn"
        ? `已确认对子钱包 ${address} 的 ETH 注资。`
        : `Đã xác nhận cấp vốn ETH cho ví con ${address}.`;
  }

  const finishedMatch = message.match(/^Run finished with status ([a-z_]+)\.$/i);
  if (finishedMatch) {
    const [, status] = finishedMatch;
    return locale === "en"
      ? message
      : locale === "zn"
        ? `运行结束，状态为 ${getRunStatusLabel(status, locale)}。`
        : `Lượt chạy kết thúc với trạng thái ${getRunStatusLabel(status, locale)}.`;
  }

  if (message === "Funding transfers are ready to submit.") {
    return locale === "en" ? message : locale === "zn" ? "注资转账已准备好提交。" : "Các giao dịch cấp vốn đã sẵn sàng để gửi.";
  }

  if (message === "Submitting ETH funding transfers from the main wallet.") {
    return locale === "en" ? message : locale === "zn" ? "正在从主钱包提交 ETH 注资转账。" : "Đang gửi các giao dịch cấp vốn ETH từ ví chính.";
  }

  if (message === "Saved the run snapshot and wallet batch details.") {
    return locale === "en" ? message : locale === "zn" ? "已保存运行快照和钱包批次详情。" : "Đã lưu snapshot chạy và chi tiết lô ví.";
  }

  if (message.startsWith("ManagedTokenDistributor auto deployment is skipped because this template only funds sub-wallet ETH.")) {
    return locale === "en"
      ? message
      : locale === "zn"
        ? "已跳过 ManagedTokenDistributor 自动部署。此模板只为子钱包提供 ETH 资金。如需部署，请添加稳定币兑换预算并配置分配，或将直接合约 ETH/WETH 设置为大于 0。"
        : "Đã bỏ qua tự động triển khai ManagedTokenDistributor. Mẫu này chỉ cấp ETH cho ví con. Để triển khai, hãy thêm ngân sách swap stablecoin và cấu hình phân bổ, hoặc đặt ETH/WETH trực tiếp cho hợp đồng lớn hơn 0.";
  }

  return message;
}

function isCompletedStatus(status: string | null | undefined) {
  return ["completed", "confirmed", "deployed", "created"].includes((status ?? "").toLowerCase());
}

function isRunningStatus(status: string | null | undefined) {
  return ["queued", "running", "started", "submitted", "wrapping", "swapping", "deploying"].includes((status ?? "").toLowerCase());
}

function shouldAnimateLogStatus(status: string | null | undefined) {
  return ["queued", "running", "started", "wrapping", "swapping", "deploying"].includes((status ?? "").toLowerCase());
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

function stageStatusText(status: AutomationStageStatus, locale: SupportedLocale) {
  switch (status) {
    case "completed":
      return locale === "en" ? "completed" : locale === "zn" ? "已完成" : "hoàn tất";
    case "running":
      return locale === "en" ? "running" : locale === "zn" ? "进行中" : "đang chạy";
    case "failed":
      return locale === "en" ? "failed" : locale === "zn" ? "失败" : "thất bại";
    case "skipped":
      return locale === "en" ? "skipped" : locale === "zn" ? "已跳过" : "bỏ qua";
    default:
      return locale === "en" ? "pending" : locale === "zn" ? "待处理" : "đang chờ";
  }
}

function getRunStageSummaries(run: WalletRun, locale: SupportedLocale) {
  const walletCreationLogs = run.run_logs?.filter((log) => log.stage === "wallet_creation");
  const fundingLogs = run.run_logs?.filter((log) => log.stage === "funding");
  const wrappingLogs = run.run_logs?.filter((log) => log.stage === "wrapping");
  const routeLogs = run.run_logs?.filter((log) => ["approval", "swap"].includes(log.stage ?? ""));
  const deploymentLogs = run.run_logs?.filter((log) => ["deployment", "distribution"].includes(log.stage ?? ""));
  const fundedWalletCount = countFundedWallets(run);
  const wrappedWalletCount = countWrappedTransactions(run);
  const swapCount = countSwapTransactions(run);
  const deployedContractCount = countDeployedContracts(run);
  const deploymentMessage = (run.contract_execution?.managed_token_distributor?.message ?? "").toLowerCase();

  return [
    {
      key: "wallet_creation",
      label: locale === "en" ? "Create wallets" : locale === "zn" ? "创建钱包" : "Tạo ví",
      status: deriveStageStatus(walletCreationLogs, run.sub_wallets?.length ? "completed" : "pending"),
      note:
        locale === "en"
          ? `${run.sub_wallets?.length ?? 0} sub-wallet${run.sub_wallets?.length === 1 ? "" : "s"} created`
          : locale === "zn"
            ? `已创建 ${run.sub_wallets?.length ?? 0} 个子钱包`
            : `Đã tạo ${run.sub_wallets?.length ?? 0} ví con`,
    },
    {
      key: "funding",
      label: locale === "en" ? "Fund batch" : locale === "zn" ? "批量注资" : "Cấp vốn lô",
      status: deriveStageStatus(
        fundingLogs,
        run.sub_wallets?.some((wallet) => wallet.funding_transactions?.eth?.tx_hash || wallet.funding_transactions?.weth?.tx_hash) ? "completed" : "pending",
      ),
      note:
        locale === "en"
          ? `${fundedWalletCount} wallet${fundedWalletCount === 1 ? "" : "s"} funded`
          : locale === "zn"
            ? `${fundedWalletCount} 个钱包已注资`
            : `${fundedWalletCount} ví đã cấp vốn`,
    },
    {
      key: "wrapping",
      label: locale === "en" ? "Local wrap" : locale === "zn" ? "本地包装" : "Wrap cục bộ",
      status: deriveStageStatus(
        wrappingLogs,
        wrappedWalletCount > 0 ? "completed" : "skipped",
      ),
      note: wrappedWalletCount > 0
        ? locale === "en"
          ? `${wrappedWalletCount} wallet${wrappedWalletCount === 1 ? "" : "s"} wrapped to WETH`
          : locale === "zn"
            ? `${wrappedWalletCount} 个钱包已包装为 WETH`
            : `${wrappedWalletCount} ví đã wrap sang WETH`
        : locale === "en"
          ? "No WETH wrap needed"
          : locale === "zn"
            ? "无需 WETH 包装"
            : "Không cần wrap WETH",
    },
    {
      key: "swap",
      label: locale === "en" ? "Approve and swap" : locale === "zn" ? "授权与兑换" : "Phê duyệt và swap",
      status: deriveStageStatus(
        routeLogs,
        swapCount > 0 ? "completed" : "skipped",
      ),
      note: swapCount > 0
        ? locale === "en"
          ? `${swapCount} swap${swapCount === 1 ? "" : "s"} completed`
          : locale === "zn"
            ? `已完成 ${swapCount} 笔兑换`
            : `Đã hoàn tất ${swapCount} giao dịch swap`
        : routeLogs?.some((log) => isFailedStatus(log.status))
          ? locale === "en"
            ? "Swap failed"
            : locale === "zn"
              ? "兑换失败"
              : "Swap thất bại"
          : routeLogs?.some((log) => isRunningStatus(log.status))
            ? locale === "en"
              ? "Swap in progress"
              : locale === "zn"
                ? "兑换进行中"
                : "Swap đang chạy"
          : locale === "en"
            ? "No token swaps set"
            : locale === "zn"
              ? "未设置代币兑换"
              : "Chưa thiết lập swap token",
    },
    {
      key: "deployment",
      label: locale === "en" ? "Deploy distributors" : locale === "zn" ? "部署分发合约" : "Triển khai distributor",
      status: deriveStageStatus(
        deploymentLogs,
        deployedContractCount > 0 ? "completed" : "skipped",
      ),
      note:
        deployedContractCount > 0
          ? locale === "en"
            ? `${deployedContractCount} contract${deployedContractCount === 1 ? "" : "s"} deployed`
            : locale === "zn"
              ? `已部署 ${deployedContractCount} 个合约`
              : `Đã triển khai ${deployedContractCount} hợp đồng`
          : deploymentLogs?.some((log) => isFailedStatus(log.status))
            ? locale === "en"
              ? "Deployment failed"
              : locale === "zn"
                ? "部署失败"
                : "Triển khai thất bại"
            : deploymentLogs?.some((log) => isRunningStatus(log.status))
              ? locale === "en"
                ? "Deployment in progress"
                : locale === "zn"
                  ? "部署进行中"
                  : "Đang triển khai"
              : deploymentMessage.includes("recipient_address")
                ? locale === "en"
                  ? "Add a recipient to enable deployment"
                  : locale === "zn"
                    ? "添加接收地址以启用部署"
                    : "Thêm địa chỉ nhận để bật triển khai"
                : locale === "en"
                  ? "No contract deployment set"
                  : locale === "zn"
                    ? "未设置合约部署"
                    : "Chưa thiết lập triển khai hợp đồng",
    },
  ];
}

function getAutomationHeadline(run: WalletRun, locale: SupportedLocale) {
  switch ((run.status ?? "").toLowerCase()) {
    case "queued":
      return {
        label: locale === "en" ? "Automation Queued" : locale === "zn" ? "自动化已排队" : "Tự động hóa đã vào hàng đợi",
        tone: "border-sky-200 bg-sky-50 text-sky-700",
        bar: "bg-sky-400",
      };
    case "running":
    case "submitted":
    case "created":
      return {
        label: locale === "en" ? "Automation Running" : locale === "zn" ? "自动化运行中" : "Tự động hóa đang chạy",
        tone: "border-sky-200 bg-sky-50 text-sky-700",
        bar: "bg-sky-500",
      };
    case "completed":
      return {
        label: locale === "en" ? "Automation Complete" : locale === "zn" ? "自动化已完成" : "Tự động hóa hoàn tất",
        tone: "border-emerald-200 bg-emerald-50 text-emerald-700",
        bar: "bg-emerald-500",
      };
    case "partial":
      return {
        label: locale === "en" ? "Automation Partial" : locale === "zn" ? "自动化部分完成" : "Tự động hóa hoàn thành một phần",
        tone: "border-amber-200 bg-amber-50 text-amber-800",
        bar: "bg-amber-500",
      };
    case "failed":
      return {
        label: locale === "en" ? "Automation Failed" : locale === "zn" ? "自动化失败" : "Tự động hóa thất bại",
        tone: "border-rose-200 bg-rose-50 text-rose-700",
        bar: "bg-rose-500",
      };
    default:
      return {
        label: locale === "en" ? "Automation Submitted" : locale === "zn" ? "自动化已提交" : "Tự động hóa đã gửi",
        tone: "border-sky-200 bg-sky-50 text-sky-700",
        bar: "bg-sky-500",
      };
  }
}

function getRunStatusLabel(status: string | null | undefined, locale: SupportedLocale) {
  switch ((status ?? "").toLowerCase()) {
    case "queued":
      return locale === "en" ? "queued" : locale === "zn" ? "已排队" : "đã xếp hàng";
    case "running":
      return locale === "en" ? "running" : locale === "zn" ? "运行中" : "đang chạy";
    case "started":
      return locale === "en" ? "started" : locale === "zn" ? "已开始" : "đã bắt đầu";
    case "ready":
      return locale === "en" ? "ready" : locale === "zn" ? "就绪" : "sẵn sàng";
    case "submitted":
      return locale === "en" ? "submitted" : locale === "zn" ? "已提交" : "đã gửi";
    case "created":
      return locale === "en" ? "created" : locale === "zn" ? "已创建" : "đã tạo";
    case "confirmed":
      return locale === "en" ? "confirmed" : locale === "zn" ? "已确认" : "đã xác nhận";
    case "completed":
      return locale === "en" ? "completed" : locale === "zn" ? "已完成" : "hoàn tất";
    case "partial":
      return locale === "en" ? "partial" : locale === "zn" ? "部分完成" : "một phần";
    case "skipped":
      return locale === "en" ? "skipped" : locale === "zn" ? "已跳过" : "bỏ qua";
    case "funded":
      return locale === "en" ? "funded" : locale === "zn" ? "已注资" : "đã cấp vốn";
    case "approved":
      return locale === "en" ? "approved" : locale === "zn" ? "已授权" : "đã phê duyệt";
    case "wrapped":
      return locale === "en" ? "wrapped" : locale === "zn" ? "已包装" : "đã wrap";
    case "swapped":
      return locale === "en" ? "swapped" : locale === "zn" ? "已兑换" : "đã swap";
    case "deploying":
      return locale === "en" ? "deploying" : locale === "zn" ? "部署中" : "đang triển khai";
    case "swapping":
      return locale === "en" ? "swapping" : locale === "zn" ? "兑换中" : "đang swap";
    case "wrapping":
      return locale === "en" ? "wrapping" : locale === "zn" ? "包装中" : "đang wrap";
    case "failed":
      return locale === "en" ? "failed" : locale === "zn" ? "失败" : "thất bại";
    case "info":
      return locale === "en" ? "info" : locale === "zn" ? "信息" : "thông tin";
    default:
      return status ?? (locale === "en" ? "unknown" : locale === "zn" ? "未知" : "không xác định");
  }
}

function getRunSummaryMessage(run: WalletRun, latestLog: RunLog | null, locale: SupportedLocale) {
  const latestMessage = (latestLog?.message ?? "").trim();
  const isGenericRunMessage =
    (latestLog?.stage ?? "").toLowerCase() === "run"
    || /^run (finished|started|submitted)/i.test(latestMessage)
    || /^started run /i.test(latestMessage);

  if (isGenericRunMessage || !latestMessage) {
    switch ((run.status ?? "").toLowerCase()) {
      case "queued":
        return locale === "en"
          ? "Run is queued and waiting to start."
          : locale === "zn"
            ? "运行已排队，等待开始。"
            : "Lượt chạy đã vào hàng đợi và đang chờ bắt đầu.";
      case "running":
      case "submitted":
      case "created":
        return locale === "en"
          ? "Run is in progress."
          : locale === "zn"
            ? "运行进行中。"
            : "Lượt chạy đang diễn ra.";
      case "completed":
        return locale === "en"
          ? "Run finished successfully."
          : locale === "zn"
            ? "运行已成功完成。"
            : "Lượt chạy đã hoàn tất thành công.";
      case "partial":
        return locale === "en"
          ? "Run finished with partial success."
          : locale === "zn"
            ? "运行已部分完成。"
            : "Lượt chạy đã hoàn tất một phần.";
      case "failed":
        return locale === "en"
          ? "Run finished with errors."
          : locale === "zn"
            ? "运行结束，但出现错误。"
            : "Lượt chạy kết thúc với lỗi.";
      default:
        return locale === "en"
          ? "Automation details were saved for this run."
          : locale === "zn"
            ? "该运行的自动化详情已保存。"
            : "Chi tiết tự động hóa đã được lưu cho lần chạy này.";
    }
  }

  return latestMessage;
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

function parseLogAttempt(log: RunLog) {
  const rawAttempt = log.details?.attempt;
  if (typeof rawAttempt === "number" && Number.isFinite(rawAttempt)) return rawAttempt;
  if (typeof rawAttempt === "string") {
    const parsed = Number(rawAttempt);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 1;
}

function estimateRunningLogDurationSeconds(log: RunLog | null | undefined) {
  if (!log) return null;

  const stage = (log.stage ?? "").toLowerCase();
  const event = (log.event ?? "").toLowerCase();
  const attempt = Math.max(parseLogAttempt(log), 1);

  let baseSeconds = 60;
  if (event.includes("execute")) {
    baseSeconds = 95;
  } else if (event.includes("deployment")) {
    baseSeconds = 140;
  } else if (event.includes("swap")) {
    baseSeconds = 110;
  } else if (event.includes("approval")) {
    baseSeconds = 75;
  } else if (event.includes("wrap")) {
    baseSeconds = 70;
  } else if (event.includes("funding")) {
    baseSeconds = stage === "distribution" ? 75 : 50;
  } else {
    switch (stage) {
      case "funding":
        baseSeconds = 50;
        break;
      case "wrapping":
        baseSeconds = 70;
        break;
      case "approval":
        baseSeconds = 75;
        break;
      case "swap":
        baseSeconds = 110;
        break;
      case "deployment":
        baseSeconds = 140;
        break;
      case "distribution":
        baseSeconds = 85;
        break;
      default:
        baseSeconds = 60;
        break;
    }
  }

  if (attempt > 1) {
    baseSeconds += (attempt - 1) * 35;
  }

  if (event.includes("retry_scheduled")) {
    baseSeconds += 20;
  }

  return baseSeconds;
}

function formatCountdown(totalSeconds: number) {
  const safeSeconds = Math.max(0, Math.ceil(totalSeconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;

  if (hours > 0) {
    return `${hours}:${`${minutes}`.padStart(2, "0")}:${`${seconds}`.padStart(2, "0")}`;
  }
  return `${minutes}:${`${seconds}`.padStart(2, "0")}`;
}

function getRunningCountdownLabel(log: RunLog | null | undefined, nowMs: number, locale: SupportedLocale) {
  if (!log) return null;

  const estimatedDurationSeconds = estimateRunningLogDurationSeconds(log);
  if (!estimatedDurationSeconds) return null;

  const startedAtMs = log.timestamp ? new Date(log.timestamp).getTime() : Number.NaN;
  if (Number.isNaN(startedAtMs)) return null;

  const elapsedSeconds = Math.max(0, Math.floor((nowMs - startedAtMs) / 1000));
  const remainingSeconds = estimatedDurationSeconds - elapsedSeconds;

  if (remainingSeconds >= 0) {
    switch (locale) {
      case "zn":
        return `预计剩余 ${formatCountdown(remainingSeconds)}`;
      case "vn":
        return `Còn khoảng ${formatCountdown(remainingSeconds)}`;
      default:
        return `ETA ${formatCountdown(remainingSeconds)}`;
    }
  }

  switch (locale) {
    case "zn":
      return `超出预估 +${formatCountdown(Math.abs(remainingSeconds))}`;
    case "vn":
      return `Quá dự kiến +${formatCountdown(Math.abs(remainingSeconds))}`;
    default:
      return `Over ETA +${formatCountdown(Math.abs(remainingSeconds))}`;
  }
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
  const { locale } = useI18n();
  const { toast } = useToast();
  const [runs, setRuns] = useState<WalletRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exportTarget, setExportTarget] = useState<RunSubWallet | null>(null);
  const [accessPassphrase, setAccessPassphrase] = useState("");
  const [exportPassphrase, setExportPassphrase] = useState("");
  const [confirmExportPassphrase, setConfirmExportPassphrase] = useState("");
  const [exportingWalletId, setExportingWalletId] = useState<string | null>(null);
  const [deletingRunId, setDeletingRunId] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const summaryPanelRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [summaryPanelHeights, setSummaryPanelHeights] = useState<Record<string, number>>({});
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
          throw new Error(payload.detail ?? (locale === "en" ? "Failed to load run history" : locale === "zn" ? "加载运行记录失败" : "Tải lịch sử chạy thất bại"));
        }
        if (active) {
          setRuns(Array.isArray(payload.runs) ? payload.runs : []);
          setError(null);
        }
      } catch (loadError) {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : (locale === "en" ? "Failed to load run history" : locale === "zn" ? "加载运行记录失败" : "Tải lịch sử chạy thất bại"));
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

  useEffect(() => {
    if (!hasActiveRun) return;
    setNowMs(Date.now());
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => window.clearInterval(timer);
  }, [hasActiveRun]);

  useEffect(() => {
    if (typeof ResizeObserver === "undefined") {
      return;
    }

    const observer = new ResizeObserver((entries) => {
      setSummaryPanelHeights((current) => {
        let changed = false;
        const next = { ...current };

        for (const entry of entries) {
          const runId = (entry.target as HTMLElement).dataset.runSummaryId;
          if (!runId) continue;
          const nextHeight = Math.ceil(entry.contentRect.height);
          if (nextHeight > 0 && next[runId] !== nextHeight) {
            next[runId] = nextHeight;
            changed = true;
          }
        }

        return changed ? next : current;
      });
    });

    for (const element of Object.values(summaryPanelRefs.current)) {
      if (element) {
        observer.observe(element);
      }
    }

    return () => observer.disconnect();
  }, [runs, openRunId, locale]);

  const handleCopy = async (event: MouseEvent<HTMLButtonElement>, value: string | undefined, label: string) => {
    event.stopPropagation();
    if (!value || !navigator.clipboard) return;
    await navigator.clipboard.writeText(value);
    toast({
      title:
        locale === "en"
          ? `${label} copied`
          : locale === "zn"
            ? `已复制${label}`
            : `Đã sao chép ${label.toLowerCase()}`,
      description: value,
    });
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
        title: locale === "en" ? "Export password too short" : locale === "zn" ? "导出密码过短" : "Mật khẩu xuất quá ngắn",
        description: locale === "en" ? "Use at least 12 characters for the keystore export password." : locale === "zn" ? "导出 keystore 的密码至少需要 12 个字符。" : "Dùng ít nhất 12 ký tự cho mật khẩu xuất keystore.",
        variant: "destructive",
      });
      return;
    }
    if (exportPassphrase !== confirmExportPassphrase) {
      toast({
        title: locale === "en" ? "Passwords do not match" : locale === "zn" ? "密码不匹配" : "Mật khẩu không khớp",
        description: locale === "en" ? "Re-enter the export password so the keystore can be decrypted later." : locale === "zn" ? "请重新输入导出密码，以便后续解密 keystore。" : "Nhập lại mật khẩu xuất để có thể giải mã keystore sau này.",
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
        throw new Error(payload.detail ?? (locale === "en" ? "Failed to export keystore" : locale === "zn" ? "导出 keystore 失败" : "Xuất keystore thất bại"));
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
        title: locale === "en" ? "Keystore exported" : locale === "zn" ? "Keystore 已导出" : "Đã xuất keystore",
        description: locale === "en" ? "Downloaded an encrypted keystore JSON. The raw private key was not exposed to the browser." : locale === "zn" ? "已下载加密的 keystore JSON。原始私钥不会暴露给浏览器。" : "Đã tải xuống tệp JSON keystore đã mã hóa. Khóa riêng thô không bị lộ trong trình duyệt.",
      });
      setExportTarget(null);
      setAccessPassphrase("");
      setExportPassphrase("");
      setConfirmExportPassphrase("");
    } catch (exportError) {
      toast({
        title: locale === "en" ? "Keystore export failed" : locale === "zn" ? "Keystore 导出失败" : "Xuất keystore thất bại",
        description: exportError instanceof Error ? exportError.message : (locale === "en" ? "Failed to export keystore" : locale === "zn" ? "导出 keystore 失败" : "Xuất keystore thất bại"),
        variant: "destructive",
      });
    } finally {
      setExportingWalletId(null);
    }
  };

  const handleDeleteRun = async (run: WalletRun) => {
    if (!isTerminalRunStatus(run.status)) {
      toast({
        title: locale === "en" ? "Run is still active" : locale === "zn" ? "运行仍在进行中" : "Lượt chạy vẫn đang hoạt động",
        description:
          locale === "en"
            ? "Wait for the run to finish before deleting its history."
            : locale === "zn"
              ? "请等待该运行结束后再删除其历史记录。"
              : "Hãy đợi lượt chạy hoàn tất trước khi xóa lịch sử của nó.",
        variant: "destructive",
      });
      return;
    }

    const confirmed = window.confirm(
      locale === "en"
        ? `Delete run history for ${run.template_name}?`
        : locale === "zn"
          ? `要删除 ${run.template_name} 的运行记录吗？`
          : `Xóa lịch sử chạy của ${run.template_name}?`,
    );
    if (!confirmed) {
      return;
    }

    setDeletingRunId(run.id);
    try {
      const response = await fetch(`${API_URL}/api/wallets/runs/${run.id}`, {
        method: "DELETE",
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.detail ?? (locale === "en" ? "Failed to delete run history" : locale === "zn" ? "删除运行记录失败" : "Xóa lịch sử chạy thất bại"));
      }

      setRuns((current) => current.filter((item) => item.id !== run.id));
      setOpenRunId((current) => (current === run.id ? undefined : current));
      if (autoOpenedActiveRunIdRef.current === run.id) {
        autoOpenedActiveRunIdRef.current = null;
      }

      toast({
        title: locale === "en" ? "Run history deleted" : locale === "zn" ? "运行记录已删除" : "Đã xóa lịch sử chạy",
        description:
          locale === "en"
            ? `${run.template_name} was removed from history.`
            : locale === "zn"
              ? `${run.template_name} 已从运行记录中移除。`
              : `${run.template_name} đã được xóa khỏi lịch sử chạy.`,
      });
    } catch (deleteError) {
      toast({
        title: locale === "en" ? "Delete failed" : locale === "zn" ? "删除失败" : "Xóa thất bại",
        description:
          deleteError instanceof Error
            ? deleteError.message
            : locale === "en"
              ? "Failed to delete run history"
              : locale === "zn"
                ? "删除运行记录失败"
                : "Xóa lịch sử chạy thất bại",
        variant: "destructive",
      });
    } finally {
      setDeletingRunId(null);
    }
  };

  return (
    <div className="rounded-2xl border border-border/70 bg-background/70 p-5">
      <div className="mb-4">
        <p className="text-base font-semibold text-foreground">{title}</p>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        {hasActiveRun ? (
          <p className="mt-2 text-xs font-medium text-sky-700">
            {locale === "en" ? "Live automation progress is updating every 2 seconds." : locale === "zn" ? "实时自动化进度每 2 秒更新一次。" : "Tiến độ tự động hóa trực tiếp đang cập nhật mỗi 2 giây."}
          </p>
        ) : null}
      </div>

      {loading ? (
        <div className="rounded-2xl border border-border/70 bg-secondary/20 p-6 text-sm text-muted-foreground">
          {locale === "en" ? "Loading run history..." : locale === "zn" ? "正在加载运行记录..." : "Đang tải lịch sử chạy..."}
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-destructive/40 bg-destructive/5 p-6 text-sm text-destructive">{error}</div>
      ) : runs.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-6 text-sm text-muted-foreground">{emptyMessage}</div>
      ) : (
        <Accordion type="single" collapsible value={openRunId} onValueChange={setOpenRunId} className="space-y-3">
          {runs.map((run) => {
            const stageSummaries = getRunStageSummaries(run, locale);
            const automationHeadline = getAutomationHeadline(run, locale);
            const progressPercent = getProgressPercent(run, stageSummaries);
            const fundedWalletCount = countFundedWallets(run);
            const wrappedTransactionCount = countWrappedTransactions(run);
            const swapTransactionCount = countSwapTransactions(run);
            const deployedContractCount = countDeployedContracts(run);
            const latestLog = run.run_logs?.length ? run.run_logs[run.run_logs.length - 1] : null;
            const deploymentLogs = run.run_logs?.filter((log) => ["deployment", "distribution"].includes(log.stage ?? ""));
            const isRunLive = !isTerminalRunStatus(run.status);
            const latestLogIndex = run.run_logs?.length ? run.run_logs.length - 1 : -1;
            const activeLog = isRunLive && latestLogIndex >= 0 && shouldAnimateLogStatus(run.run_logs?.[latestLogIndex]?.status)
              ? run.run_logs?.[latestLogIndex] ?? null
              : null;
            const activeLogCountdownLabel = getRunningCountdownLabel(activeLog, nowMs, locale);
            const runningStage = stageSummaries.find((stage) => stage.status === "running");

            return (
              <AccordionItem key={run.id} value={run.id} className="overflow-hidden rounded-2xl bg-secondary/10 ring-1 ring-border/60">
                <AccordionTrigger className="px-4 py-5 hover:no-underline">
                  <div className="flex min-w-0 flex-1 flex-col gap-3 text-left">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${statusTone(run.status)}`}>
                        {getRunStatusLabel(run.status, locale)}
                      </span>
                      <span className="text-sm font-semibold text-foreground">{run.template_name}</span>
                      <span className="text-xs text-muted-foreground">{formatTimestamp(run.created_at, locale)}</span>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      <div className="rounded-xl border border-border/70 bg-background/80 px-3 py-2">
                        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{locale === "en" ? "Main wallet" : locale === "zn" ? "主钱包" : "Ví chính"}</p>
                        <p className="mt-1 break-all font-mono text-xs text-foreground">{shortValue(run.main_wallet_address, 10, 6)}</p>
                      </div>
                      <div className="rounded-xl border border-border/70 bg-background/80 px-3 py-2">
                        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{locale === "en" ? "Wallet count" : locale === "zn" ? "钱包数量" : "Số lượng ví"}</p>
                        <p className="mt-1 text-sm font-semibold text-foreground">{run.contract_count}</p>
                      </div>
                      <div className="rounded-xl border border-border/70 bg-background/80 px-3 py-2">
                        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{locale === "en" ? "ETH funded" : locale === "zn" ? "已注资 ETH" : "ETH đã cấp vốn"}</p>
                        <p className="mt-1 text-sm font-semibold text-foreground">
                          {formatAmount(run.preview?.funding?.total_eth_deducted, "ETH")}
                        </p>
                      </div>
                      <div className="rounded-xl border border-border/70 bg-background/80 px-3 py-2">
                        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{locale === "en" ? "Contracts deployed" : locale === "zn" ? "已部署合约" : "Hợp đồng đã triển khai"}</p>
                        <p className="mt-1 text-sm font-semibold text-foreground">{deployedContractCount}</p>
                      </div>
                    </div>
                  </div>
                </AccordionTrigger>

                <AccordionContent className="px-4 pb-5">
                  <div className="space-y-5">
                    <div className="flex justify-end">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="border-rose-200 text-rose-700 hover:bg-rose-50 hover:text-rose-800"
                        onClick={() => handleDeleteRun(run)}
                        disabled={deletingRunId === run.id}
                        title={
                          isTerminalRunStatus(run.status)
                            ? undefined
                            : locale === "en"
                              ? "Finish the run before deleting its history."
                              : locale === "zn"
                                ? "请先等待运行结束，再删除其历史记录。"
                                : "Hãy hoàn tất lượt chạy trước khi xóa lịch sử."
                        }
                      >
                        {deletingRunId === run.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                        {locale === "en" ? "Delete history" : locale === "zn" ? "删除记录" : "Xóa lịch sử"}
                      </Button>
                    </div>

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
                                {locale === "en" ? "Live automation is running" : locale === "zn" ? "实时自动化运行中" : "Tự động hóa trực tiếp đang chạy"}
                              </div>
                            ) : null}
                            <h3 className="mt-4 text-2xl font-semibold tracking-tight text-slate-950">{run.template_name}</h3>
                            <p className="mt-2 text-sm leading-6 text-slate-600">
                              {getRunSummaryMessage(run, latestLog, locale)}
                            </p>
                            {run.contract_execution?.managed_token_distributor?.message && !deployedContractCount && !deploymentLogs?.length ? (
                              <p className="mt-2 text-sm text-slate-500">{stageSummaries.find((stage) => stage.key === "deployment")?.note}</p>
                            ) : null}
                          </div>

                          <div className="grid gap-3 sm:min-w-[280px]">
                            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                              <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
                                {locale === "en" ? "Run ID" : locale === "zn" ? "运行 ID" : "ID lượt chạy"}
                              </p>
                              <p className="mt-1 break-all font-mono text-xs text-slate-700">{run.id}</p>
                            </div>
                            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                              <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
                                {locale === "en" ? "Network fee estimate" : locale === "zn" ? "网络费预估" : "Ước tính phí mạng"}
                              </p>
                              <p className="mt-1 text-sm font-semibold text-slate-900">
                                {formatAmount(run.preview?.execution?.total_network_fee_eth ?? run.funding_fee_estimate?.fee_eth, "ETH")}
                              </p>
                            </div>
                          </div>
                        </div>

                        <div className="mt-6">
                          <div className="flex items-center justify-between text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
                            <span>{locale === "en" ? "Automation progress" : locale === "zn" ? "自动化进度" : "Tiến độ tự động hóa"}</span>
                            <div className="flex flex-wrap items-center justify-end gap-2">
                              {isRunLive ? (
                                <>
                                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold tracking-normal text-sky-700">
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    {runningStage ? `${runningStage.label} ${locale === "en" ? "live" : locale === "zn" ? "实时" : "trực tiếp"}` : locale === "en" ? "Polling live" : locale === "zn" ? "实时轮询中" : "Đang thăm dò trực tiếp"}
                                  </span>
                                  {activeLogCountdownLabel ? (
                                    <span className="inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[11px] font-semibold tracking-normal text-sky-700">
                                      {activeLogCountdownLabel}
                                    </span>
                                  ) : null}
                                </>
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
                            <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
                              {locale === "en" ? "Wallets" : locale === "zn" ? "钱包" : "Ví"}
                            </p>
                            <p className="mt-1 text-sm font-semibold text-slate-900">{run.sub_wallets?.length ?? 0}</p>
                          </div>
                          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                            <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
                              {locale === "en" ? "Funded" : locale === "zn" ? "已注资" : "Đã cấp vốn"}
                            </p>
                            <p className="mt-1 text-sm font-semibold text-slate-900">{fundedWalletCount}</p>
                          </div>
                          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                            <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
                              {locale === "en" ? "Wrapped" : locale === "zn" ? "已包装" : "Đã wrap"}
                            </p>
                            <p className="mt-1 text-sm font-semibold text-slate-900">{wrappedTransactionCount}</p>
                          </div>
                          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                            <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
                              {locale === "en" ? "Swaps" : locale === "zn" ? "兑换" : "Swap"}
                            </p>
                            <p className="mt-1 text-sm font-semibold text-slate-900">{swapTransactionCount}</p>
                          </div>
                          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                            <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
                              {locale === "en" ? "Deployed" : locale === "zn" ? "已部署" : "Đã triển khai"}
                            </p>
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
                                  <p className="mt-1 text-sm font-semibold text-slate-500">{stageStatusText(stage.status, locale)}</p>
                                  <p className="mt-1 text-sm font-semibold text-slate-900">{stage.note}</p>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>

                        <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200">
                            <div className="flex items-center gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3">
                              <Boxes className="h-4 w-4 text-slate-500" />
                            <p className="text-sm font-semibold text-slate-900">{locale === "en" ? "Automation matrix" : locale === "zn" ? "自动化矩阵" : "Ma trận tự động hóa"}</p>
                          </div>
                          {run.sub_wallets?.length ? (
                            <div className="overflow-x-auto">
                              <table className="min-w-full divide-y divide-slate-200 text-sm">
                                <thead className="bg-white">
                                  <tr>
                                    <th className="px-4 py-3 text-left font-medium text-slate-500">#</th>
                                    <th className="px-4 py-3 text-left font-medium text-slate-500">{locale === "en" ? "Address" : locale === "zn" ? "地址" : "Địa chỉ"}</th>
                                    <th className="px-4 py-3 text-left font-medium text-slate-500">{locale === "en" ? "Funded" : locale === "zn" ? "已注资" : "Đã cấp vốn"}</th>
                                    <th className="px-4 py-3 text-left font-medium text-slate-500">{locale === "en" ? "Wrap" : locale === "zn" ? "包装" : "Wrap"}</th>
                                    <th className="px-4 py-3 text-left font-medium text-slate-500">{locale === "en" ? "Approve" : locale === "zn" ? "授权" : "Phê duyệt"}</th>
                                    <th className="px-4 py-3 text-left font-medium text-slate-500">{locale === "en" ? "Swaps" : locale === "zn" ? "兑换" : "Swap"}</th>
                                    <th className="px-4 py-3 text-left font-medium text-slate-500">{locale === "en" ? "Contract" : locale === "zn" ? "合约" : "Hợp đồng"}</th>
                                    <th className="px-4 py-3 text-left font-medium text-slate-500">{locale === "en" ? "Status" : locale === "zn" ? "状态" : "Trạng thái"}</th>
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
                                            onClick={(event) => handleCopy(event, subWallet.address, locale === "en" ? "Address" : locale === "zn" ? "地址" : "Địa chỉ")}
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
                                            {locale === "en" ? "Deploying..." : locale === "zn" ? "部署中..." : "Đang triển khai..."}
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
                            <div className="px-4 py-6 text-sm text-slate-500">
                              {locale === "en" ? "No sub-wallet batch was saved for this run." : locale === "zn" ? "该运行未保存子钱包批次。" : "Không có lô ví con nào được lưu cho lần chạy này."}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
                      <div className="rounded-2xl border border-border/70 bg-card px-5 py-5 shadow-[0_18px_40px_-32px_rgba(15,23,42,0.14)]">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-secondary/40 text-muted-foreground">
                            <ScrollText className="h-4 w-4" />
                          </div>
                          <div>
                            <p className="text-lg font-semibold text-foreground">{locale === "en" ? "Logs" : locale === "zn" ? "日志" : "Nhật ký"}</p>
                            <p className="text-sm text-muted-foreground">{locale === "en" ? "Saved run events and transaction updates." : locale === "zn" ? "已保存的运行事件和交易更新。" : "Sự kiện chạy và cập nhật giao dịch đã lưu."}</p>
                          </div>
                        </div>

                        {run.run_logs?.length ? (
                          <div className="mt-4 rounded-2xl bg-background/40">
                            <div
                              className="space-y-4 px-1 py-1 xl:max-h-[var(--run-summary-height)] xl:overflow-y-auto"
                              style={
                                summaryPanelHeights[run.id]
                                  ? ({ "--run-summary-height": `${summaryPanelHeights[run.id]}px` } as CSSProperties)
                                  : undefined
                              }
                            >
                              {run.run_logs.map((log, index) => {
                                const detailEntries = getLogDetailEntries(log.details, locale);
                                const stageLabel = getLogHeadingLabel(log, locale);
                                const hasMeta = Boolean(log.movement || log.wallet_address || detailEntries.length || log.tx_hash);
                                const isLogActive = isRunLive && index === latestLogIndex && shouldAnimateLogStatus(log.status);
                                const countdownLabel = isLogActive ? getRunningCountdownLabel(log, nowMs, locale) : null;

                                return (
                                  <div
                                    key={`${run.id}-log-${index}`}
                                    className={`rounded-2xl px-4 py-4 ring-1 ${
                                      isLogActive
                                        ? "bg-accent/12 ring-primary/20 shadow-[0_12px_28px_-20px_rgba(37,99,235,0.2)]"
                                        : "bg-card ring-border/60"
                                    }`}
                                  >
                                    <div className="flex flex-wrap items-start justify-between gap-3">
                                      <div className="min-w-0">
                                        <div className="flex flex-wrap items-center gap-2">
                                          <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${statusTone(log.status)} ${isLogActive ? "animate-pulse" : ""}`}>
                                            {isLogActive ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                                            {getRunStatusLabel(log.status ?? "info", locale)}
                                          </span>
                                          <span className="text-sm font-semibold text-foreground">{stageLabel}</span>
                                        </div>
                                        <p className="mt-2 text-sm font-semibold text-foreground">
                                          {getLocalizedLogMessage(log, locale)}
                                        </p>
                                        {countdownLabel ? (
                                          <p className="mt-2 text-xs font-semibold text-sky-700">{countdownLabel}</p>
                                        ) : null}
                                      </div>
                                      <span className="shrink-0 text-xs text-muted-foreground">{formatTimestamp(log.timestamp, locale)}</span>
                                    </div>

                                    {hasMeta ? (
                                      <div className="mt-3 space-y-3 border-t border-border/60 pt-3">
                                        {log.movement ? (
                                          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                            <ArrowRightLeft className="h-3.5 w-3.5 text-primary" />
                                            <span>
                                              {getLocalizedLogLabel(log.movement.action ?? "movement", locale)} · {formatAmount(log.movement.amount, log.movement.asset ?? "")}
                                            </span>
                                            {log.movement.from_address ? <span>{shortValue(log.movement.from_address, 10, 6)}</span> : null}
                                            {log.movement.to_address ? <span>{`-> ${shortValue(log.movement.to_address, 10, 6)}`}</span> : null}
                                          </div>
                                        ) : null}

                                        {!log.movement && log.wallet_address ? (
                                          <p className="text-xs text-muted-foreground">
                                            <span className="font-medium text-foreground">{locale === "en" ? "Wallet" : locale === "zn" ? "钱包" : "Ví"}:</span>{" "}
                                            {shortValue(log.wallet_address, 10, 6)}
                                          </p>
                                        ) : null}

                                        {detailEntries.length ? (
                                          <dl className="grid gap-x-6 gap-y-2 text-[11px] sm:grid-cols-2 xl:grid-cols-3">
                                            {detailEntries.map((item) => (
                                              <div key={`${run.id}-log-${index}-${item.key}`}>
                                                <dt className="text-muted-foreground">{item.label}</dt>
                                                <dd className="mt-0.5 font-medium text-foreground">{item.value}</dd>
                                              </div>
                                            ))}
                                          </dl>
                                        ) : null}

                                        {log.tx_hash ? (
                                          <p className="break-all font-mono text-xs text-muted-foreground">{log.tx_hash}</p>
                                        ) : null}
                                      </div>
                                    ) : null}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ) : (
                          <div className="mt-4 rounded-2xl border border-dashed border-border/70 bg-secondary/20 px-4 py-6 text-sm text-muted-foreground">
                            {locale === "en" ? "No movement logs were saved for this run." : locale === "zn" ? "该运行未保存任何变动日志。" : "Không có nhật ký biến động nào được lưu cho lần chạy này."}
                          </div>
                        )}
                      </div>

                      <div
                        ref={(element) => {
                          summaryPanelRefs.current[run.id] = element;
                        }}
                        data-run-summary-id={run.id}
                        className="self-start space-y-4 rounded-3xl border border-slate-200 bg-slate-50/70 p-3 shadow-[0_18px_40px_-32px_rgba(15,23,42,0.2)] xl:sticky xl:top-5"
                      >
                        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-[0_18px_40px_-32px_rgba(15,23,42,0.28)]">
                          <p className="text-[11px] uppercase tracking-wide text-slate-500">{locale === "en" ? "Main wallet" : locale === "zn" ? "主钱包" : "Ví chính"}</p>
                          <p className="mt-1 break-all font-mono text-xs text-slate-700">{run.main_wallet_address}</p>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-[0_18px_40px_-32px_rgba(15,23,42,0.28)]">
                          <p className="text-[11px] uppercase tracking-wide text-slate-500">{locale === "en" ? "Movement entries" : locale === "zn" ? "变动记录" : "Mục biến động"}</p>
                          <p className="mt-1 text-sm font-semibold text-slate-900">{run.run_logs?.length ?? 0}</p>
                          {latestLog ? <p className="mt-2 text-xs text-slate-500">{getLocalizedLogMessage(latestLog, locale)}</p> : null}
                        </div>
                        {wrappedTransactionCount > 0 ? (
                          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-[0_18px_40px_-32px_rgba(15,23,42,0.28)]">
                            <p className="text-[11px] uppercase tracking-wide text-slate-500">{locale === "en" ? "Local wrap" : locale === "zn" ? "本地包装" : "Wrap cục bộ"}</p>
                            <p className="mt-1 text-sm font-semibold text-slate-900">
                              {locale === "en"
                                ? `${wrappedTransactionCount} wallet${wrappedTransactionCount === 1 ? "" : "s"} wrapped ETH into WETH`
                                : locale === "zn"
                                  ? `${wrappedTransactionCount} 个钱包已将 ETH 包装为 WETH`
                                  : `${wrappedTransactionCount} ví đã wrap ETH thành WETH`}
                            </p>
                            {run.wrap_transaction?.tx_hash ? (
                              <p className="mt-2 break-all font-mono text-xs text-slate-700">{run.wrap_transaction.tx_hash}</p>
                            ) : null}
                          </div>
                        ) : null}
                        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-[0_18px_40px_-32px_rgba(15,23,42,0.28)]">
                          <p className="text-[11px] uppercase tracking-wide text-slate-500">{locale === "en" ? "Contract deployment" : locale === "zn" ? "合约部署" : "Triển khai hợp đồng"}</p>
                          <p className="mt-1 text-sm font-semibold text-slate-900">
                            {run.contract_execution?.managed_token_distributor?.status?.replace(/_/g, " ") ?? (locale === "en" ? "Unavailable" : locale === "zn" ? "不可用" : "Không khả dụng")}
                          </p>
                          {run.contract_execution?.managed_token_distributor?.message ? (
                            <p className="mt-2 text-xs text-slate-500">{stageSummaries.find((stage) => stage.key === "deployment")?.note}</p>
                          ) : null}
                        </div>
                        {run.deployed_contracts?.length ? (
                          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-[0_18px_40px_-32px_rgba(15,23,42,0.28)]">
                            <p className="text-sm font-semibold text-slate-900">{locale === "en" ? "Deployed contracts" : locale === "zn" ? "已部署合约" : "Hợp đồng đã triển khai"}</p>
                            <div className="mt-3 space-y-3">
                              {run.deployed_contracts.map((contract, index) => (
                                <div key={`${run.id}-contract-${index}`} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${statusTone(contract.status)}`}>
                                      {contract.status ?? (locale === "en" ? "unknown" : locale === "zn" ? "未知" : "không xác định")}
                                    </span>
                                    <p className="text-sm font-semibold text-slate-900">{contract.contract_name ?? (locale === "en" ? "Managed contract" : locale === "zn" ? "托管合约" : "Hợp đồng quản lý")}</p>
                                  </div>
                                  {contract.contract_address ? (
                                    <p className="mt-2 break-all font-mono text-xs text-slate-700">{contract.contract_address}</p>
                                  ) : (
                                    <p className="mt-2 text-xs text-slate-500">{locale === "en" ? "Contract address unavailable" : locale === "zn" ? "合约地址不可用" : "Địa chỉ hợp đồng không khả dụng"}</p>
                                  )}
                                  <p className="mt-2 text-xs text-slate-500">
                                    {contract.wallet_address ? `${locale === "en" ? "Subwallet" : locale === "zn" ? "子钱包" : "Ví con"} ${shortValue(contract.wallet_address, 10, 6)}` : locale === "en" ? "Subwallet unavailable" : locale === "zn" ? "子钱包不可用" : "Ví con không khả dụng"}
                                    {contract.recipient_address ? ` • ${locale === "en" ? "Recipient" : locale === "zn" ? "接收地址" : "Người nhận"} ${shortValue(contract.recipient_address, 10, 6)}` : ""}
                                    {contract.amount ? ` • ${formatAmount(contract.amount, getDisplayTokenSymbol(contract.token_symbol, contract.token_address))}` : ""}
                                    {contract.deployment_attempts ? ` • ${locale === "en" ? "Attempts" : locale === "zn" ? "尝试次数" : "Lần thử"} ${contract.deployment_attempts}` : ""}
                                  </p>
                                  {contract.tx_hash ? <p className="mt-2 break-all font-mono text-xs text-slate-700">{contract.tx_hash}</p> : null}
                                  {contract.error ? (
                                    <div className="mt-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
                                      {contract.error}
                                    </div>
                                  ) : null}
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    </div>

                    <div className="space-y-3">
                      <p className="text-sm font-semibold text-foreground">{locale === "en" ? "Created wallets" : locale === "zn" ? "已创建钱包" : "Ví đã tạo"}</p>
                      {run.sub_wallets?.map((subWallet) => {
                        return (
                          <div key={subWallet.wallet_id} className="rounded-2xl border border-border/70 bg-background px-4 py-4">
                            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                              <div className="flex min-w-0 items-start gap-3">
                                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 via-sky-500 to-cyan-500 text-white shadow-[0_14px_30px_-18px_rgba(37,99,235,0.65)]">
                                  <WalletCards className="h-5 w-5" />
                                </div>
                                <div className="min-w-0">
                                  <p className="text-sm font-semibold text-foreground">{locale === "en" ? "Subwallet" : locale === "zn" ? "子钱包" : "Ví con"} {typeof subWallet.index === "number" ? `#${subWallet.index}` : ""}</p>
                                  <p className="mt-1 break-all font-mono text-xs text-muted-foreground">{subWallet.address}</p>
                                  <p className="mt-1 break-all text-xs text-muted-foreground">{subWallet.wallet_id}</p>
                                </div>
                              </div>

                              <div className="flex flex-wrap items-center gap-2">
                                <Button type="button" variant="outline" size="sm" onClick={() => router.push(`/wallets/${subWallet.wallet_id}`)}>
                                  {locale === "en" ? "Open wallet" : locale === "zn" ? "打开钱包" : "Mở ví"}
                                </Button>
                                <Button type="button" variant="outline" size="sm" onClick={(event) => handleCopy(event, subWallet.address, locale === "en" ? "Address" : locale === "zn" ? "地址" : "Địa chỉ")}>
                                  <Copy className="h-4 w-4" />
                                  {locale === "en" ? "Copy address" : locale === "zn" ? "复制地址" : "Sao chép địa chỉ"}
                                </Button>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={(event) => handleOpenExport(event, subWallet)}
                                  disabled={exportingWalletId === subWallet.wallet_id}
                                >
                                  {exportingWalletId === subWallet.wallet_id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                                  {locale === "en" ? "Export keystore" : locale === "zn" ? "导出 keystore" : "Xuất keystore"}
                                </Button>
                              </div>
                            </div>

                            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                              <div className="rounded-xl border border-border/70 bg-secondary/10 px-3 py-2">
                                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{locale === "en" ? "Status" : locale === "zn" ? "状态" : "Trạng thái"}</p>
                                <p className="mt-1 text-sm font-semibold text-foreground">{subWallet.status ?? (locale === "en" ? "created" : locale === "zn" ? "已创建" : "đã tạo")}</p>
                              </div>
                              <div className="rounded-xl border border-border/70 bg-secondary/10 px-3 py-2">
                                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{locale === "en" ? "Expected ETH" : locale === "zn" ? "预计 ETH" : "ETH dự kiến"}</p>
                                <p className="mt-1 text-sm font-semibold text-foreground">
                                  {formatAmount(subWallet.expected_funding?.eth, "ETH")}
                                </p>
                              </div>
                              <div className="rounded-xl border border-border/70 bg-secondary/10 px-3 py-2">
                                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{locale === "en" ? "Local WETH wrap" : locale === "zn" ? "本地 WETH 包装" : "Wrap WETH cục bộ"}</p>
                                <p className="mt-1 text-sm font-semibold text-foreground">
                                  {formatAmount(subWallet.expected_local_wrap_weth ?? subWallet.expected_funding?.weth, "WETH")}
                                </p>
                              </div>
                              <div className="rounded-xl border border-border/70 bg-secondary/10 px-3 py-2">
                                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{locale === "en" ? "Access" : locale === "zn" ? "访问权限" : "Quyền truy cập"}</p>
                                <p className="mt-1 text-sm font-semibold text-foreground">
                                  {(subWallet.private_key_access?.export_supported ?? subWallet.private_key_access?.reveal_supported)
                                    ? locale === "en" ? "Encrypted keystore export" : locale === "zn" ? "加密 keystore 导出" : "Xuất keystore được mã hóa"
                                    : locale === "en" ? "Unavailable" : locale === "zn" ? "不可用" : "Không khả dụng"}
                                </p>
                              </div>
                            </div>

                            {subWallet.funding_transactions?.eth?.tx_hash || subWallet.funding_transactions?.weth?.tx_hash || subWallet.wrap_transaction?.tx_hash ? (
                              <div className="mt-4 grid gap-3 md:grid-cols-2">
                                {subWallet.funding_transactions?.eth?.tx_hash ? (
                                  <div className="rounded-xl border border-border/70 bg-secondary/10 px-3 py-3">
                                    <p className="text-sm font-semibold text-foreground">{locale === "en" ? "ETH transfer" : locale === "zn" ? "ETH 转账" : "Chuyển ETH"}</p>
                                    <p className="mt-1 text-xs text-muted-foreground">
                                      {formatAmount(subWallet.funding_transactions.eth.amount, "ETH")} · {subWallet.funding_transactions.eth.status ?? (locale === "en" ? "submitted" : locale === "zn" ? "已提交" : "đã gửi")}
                                    </p>
                                    <p className="mt-2 break-all font-mono text-xs text-foreground">{subWallet.funding_transactions.eth.tx_hash}</p>
                                  </div>
                                ) : null}
                                {subWallet.funding_transactions?.weth?.tx_hash ? (
                                  <div className="rounded-xl border border-border/70 bg-secondary/10 px-3 py-3">
                                    <p className="text-sm font-semibold text-foreground">{locale === "en" ? "WETH transfer" : locale === "zn" ? "WETH 转账" : "Chuyển WETH"}</p>
                                    <p className="mt-1 text-xs text-muted-foreground">
                                      {formatAmount(subWallet.funding_transactions.weth.amount, "WETH")} · {subWallet.funding_transactions.weth.status ?? (locale === "en" ? "submitted" : locale === "zn" ? "已提交" : "đã gửi")}
                                    </p>
                                    <p className="mt-2 break-all font-mono text-xs text-foreground">{subWallet.funding_transactions.weth.tx_hash}</p>
                                  </div>
                                ) : null}
                                {subWallet.wrap_transaction?.tx_hash ? (
                                  <div className="rounded-xl border border-border/70 bg-secondary/10 px-3 py-3">
                                    <p className="text-sm font-semibold text-foreground">{locale === "en" ? "Local ETH wrap" : locale === "zn" ? "本地 ETH 包装" : "Wrap ETH cục bộ"}</p>
                                    <p className="mt-1 text-xs text-muted-foreground">
                                      {formatAmount(subWallet.wrap_transaction.eth_wrapped, "ETH")} {locale === "en" ? "wrapped" : locale === "zn" ? "已包装" : "đã wrap"} · {subWallet.wrap_transaction.status ?? (locale === "en" ? "confirmed" : locale === "zn" ? "已确认" : "đã xác nhận")}
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
                                    <p className="text-sm font-semibold text-foreground">{locale === "en" ? "Router approval" : locale === "zn" ? "路由授权" : "Phê duyệt router"}</p>
                                    <p className="mt-1 text-xs text-muted-foreground">
                                      {formatAmount(approval.amount, approval.token_symbol ?? "WETH")} · {approval.status ?? (locale === "en" ? "submitted" : locale === "zn" ? "已提交" : "đã gửi")}
                                    </p>
                                    {approval.attempts || approval.confirmation_source ? (
                                      <p className="mt-1 text-[11px] text-muted-foreground">
                                        {approval.attempts ? `${locale === "en" ? "attempts" : locale === "zn" ? "尝试次数" : "lần thử"} ${approval.attempts}` : `${locale === "en" ? "attempts" : locale === "zn" ? "尝试次数" : "lần thử"} 1`}
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
                                    <p className="text-sm font-semibold text-foreground">{swap.token_symbol ?? (locale === "en" ? "Swap" : locale === "zn" ? "兑换" : "Swap")}</p>
                                    <p className="mt-1 text-xs text-muted-foreground">
                                      {formatAmount(swap.amount_in, "WETH")} {locale === "en" ? "in" : locale === "zn" ? "输入" : "vào"}
                                      {swap.amount_out ? ` · ${formatAmount(swap.amount_out, swap.token_symbol ?? "TOKEN")} ${locale === "en" ? "out" : locale === "zn" ? "输出" : "ra"}` : ""}
                                      {swap.status ? ` · ${swap.status}` : ""}
                                    </p>
                                    {swap.attempts || swap.confirmation_source ? (
                                      <p className="mt-1 text-[11px] text-muted-foreground">
                                        {swap.attempts ? `${locale === "en" ? "attempts" : locale === "zn" ? "尝试次数" : "lần thử"} ${swap.attempts}` : `${locale === "en" ? "attempts" : locale === "zn" ? "尝试次数" : "lần thử"} 1`}
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
                                        : locale === "en" ? "Deployment details unavailable" : locale === "zn" ? "部署详情不可用" : "Chi tiết triển khai không khả dụng"}
                                    </p>
                                    {contract?.contract_address ? (
                                      <p className="mt-2 break-all font-mono text-xs text-foreground">{contract.contract_address}</p>
                                    ) : null}
                                    {contract?.tx_hash ? (
                                      <p className="mt-2 break-all font-mono text-xs text-muted-foreground">{locale === "en" ? "deploy" : locale === "zn" ? "部署" : "triển khai"}: {contract.tx_hash}</p>
                                    ) : null}
                                    {contract?.funding_tx_hash ? (
                                      <p className="mt-1 break-all font-mono text-xs text-muted-foreground">{locale === "en" ? "funding" : locale === "zn" ? "注资" : "cấp vốn"}: {contract.funding_tx_hash}</p>
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
            <DialogTitle>{locale === "en" ? "Export encrypted keystore" : locale === "zn" ? "导出加密 keystore" : "Xuất keystore đã mã hóa"}</DialogTitle>
            <DialogDescription>
              {locale === "en" ? "This exports an encrypted keystore JSON only. Enter the dedicated wallet access passphrase from the backend, then choose a separate password for the exported keystore file." : locale === "zn" ? "这里只会导出加密的 keystore JSON。请输入后端提供的钱包访问口令，然后为导出的 keystore 文件设置单独密码。" : "Thao tác này chỉ xuất tệp JSON keystore đã mã hóa. Hãy nhập mật khẩu truy cập ví từ backend, sau đó chọn một mật khẩu riêng cho tệp keystore xuất ra."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-xl border border-border/70 bg-secondary/10 px-4 py-3">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{locale === "en" ? "Wallet" : locale === "zn" ? "钱包" : "Ví"}</p>
              <p className="mt-1 break-all font-mono text-xs text-foreground">{exportTarget?.address ?? (locale === "en" ? "Unavailable" : locale === "zn" ? "不可用" : "Không khả dụng")}</p>
            </div>

            <div className="space-y-2">
              <label htmlFor="wallet-access-passphrase" className="text-sm font-medium text-foreground">
                {locale === "en" ? "Unlock passphrase" : locale === "zn" ? "解锁口令" : "Mật khẩu mở khóa"}
              </label>
              <Input
                id="wallet-access-passphrase"
                type="password"
                value={accessPassphrase}
                onChange={(event) => setAccessPassphrase(event.target.value)}
                placeholder={locale === "en" ? "Dedicated wallet access passphrase" : locale === "zn" ? "专用钱包访问口令" : "Mật khẩu truy cập ví chuyên dụng"}
                autoComplete="off"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="wallet-export-passphrase" className="text-sm font-medium text-foreground">
                {locale === "en" ? "Keystore password" : locale === "zn" ? "Keystore 密码" : "Mật khẩu keystore"}
              </label>
              <Input
                id="wallet-export-passphrase"
                type="password"
                value={exportPassphrase}
                onChange={(event) => setExportPassphrase(event.target.value)}
                placeholder={locale === "en" ? "At least 12 characters" : locale === "zn" ? "至少 12 个字符" : "Ít nhất 12 ký tự"}
                autoComplete="off"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="wallet-export-passphrase-confirm" className="text-sm font-medium text-foreground">
                {locale === "en" ? "Confirm keystore password" : locale === "zn" ? "确认 keystore 密码" : "Xác nhận mật khẩu keystore"}
              </label>
              <Input
                id="wallet-export-passphrase-confirm"
                type="password"
                value={confirmExportPassphrase}
                onChange={(event) => setConfirmExportPassphrase(event.target.value)}
                placeholder={locale === "en" ? "Re-enter the keystore password" : locale === "zn" ? "重新输入 keystore 密码" : "Nhập lại mật khẩu keystore"}
                autoComplete="off"
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setExportTarget(null)} disabled={Boolean(exportingWalletId)}>
              {locale === "en" ? "Cancel" : locale === "zn" ? "取消" : "Hủy"}
            </Button>
            <Button type="button" onClick={handleExportKeystore} disabled={!exportTarget || Boolean(exportingWalletId)}>
              {exportingWalletId ? (locale === "en" ? "Exporting..." : locale === "zn" ? "导出中..." : "Đang xuất...") : locale === "en" ? "Download keystore" : locale === "zn" ? "下载 keystore" : "Tải keystore"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
