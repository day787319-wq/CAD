"use client";

import { FormEvent, ReactNode, useEffect, useMemo, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/components/i18n-provider";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  TEMPLATE_API_URL,
  Template,
  TemplateChain,
  TemplateEditorForm,
  TemplateOptions,
  TemplatePriceSnapshot,
  defaultTemplateForm,
  formatAmount,
  formatRelativeTimestamp,
  formatUsd,
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

export function TemplateEditor({ open, onOpenChange, options, template, onSaved }: TemplateEditorProps) {
  const { toast } = useToast();
  const { locale } = useI18n();
  const [form, setForm] = useState<TemplateEditorForm>(defaultTemplateForm(options));
  const [editorOptions, setEditorOptions] = useState<TemplateOptions | null>(options);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [marketSnapshot, setMarketSnapshot] = useState<TemplatePriceSnapshot | null>(null);
  const [marketError, setMarketError] = useState<string | null>(null);

  const currentOptions = editorOptions ?? options;
  const stablecoins = currentOptions?.stablecoins ?? [];
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
    };
  const nativeSymbol = currentOptions?.native_symbol ?? currentChain.native_symbol;
  const wrappedNativeSymbol = currentOptions?.wrapped_native_symbol ?? currentChain.wrapped_native_symbol;
  const selectedStablecoinAddresses = useMemo(
    () => new Set(form.stablecoin_allocations.map((allocation) => allocation.token_address.toLowerCase())),
    [form.stablecoin_allocations],
  );
  const hasStablecoinSwap = form.stablecoin_distribution_mode !== "none";
  const topUpEnabled = form.auto_top_up_enabled;
  const needsWeth = Number(form.swap_budget_eth_per_contract || "0") > 0 || Number(form.direct_contract_weth_per_contract || "0") > 0;
  const topUpThresholdValue = toFiniteNumber(form.auto_top_up_threshold_eth) ?? 0;
  const topUpTargetValue = toFiniteNumber(form.auto_top_up_target_eth) ?? 0;
  const topUpHasSingleValue = topUpEnabled && topUpThresholdValue === topUpTargetValue;

  const loadChainOptions = async (chain: TemplateChain) => {
    const response = await fetch(`${TEMPLATE_API_URL}/api/templates/options?chain=${encodeURIComponent(chain)}`, {
      cache: "no-store",
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.detail ?? "Failed to load template options");
    setEditorOptions(payload);
    return payload as TemplateOptions;
  };

  useEffect(() => {
    if (!open) return;

    let active = true;
    setSaveError(null);
    const nextForm = template ? templateToForm(template) : defaultTemplateForm(options);
    setForm(nextForm);
    setEditorOptions(options);

    void (async () => {
      try {
        const nextOptions = await loadChainOptions(nextForm.chain);
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

  const selectedStablecoins = useMemo(
    () => stablecoins.filter((coin) => selectedStablecoinAddresses.has(coin.address.toLowerCase())),
    [selectedStablecoinAddresses, stablecoins],
  );
  const distributionPreviewRows = useMemo(
    () => getStablecoinDistributionRows(form),
    [form],
  );
  const ethUsdLabel = useMemo(
    () => getUsdValue(form.gas_reserve_eth_per_contract, marketSnapshot?.eth_usd),
    [form.gas_reserve_eth_per_contract, marketSnapshot?.eth_usd],
  );
  const swapBudgetUsdLabel = useMemo(
    () => getUsdValue(form.swap_budget_eth_per_contract, marketSnapshot?.weth_usd),
    [form.swap_budget_eth_per_contract, marketSnapshot?.weth_usd],
  );
  const directEthUsdLabel = useMemo(
    () => getUsdValue(form.direct_contract_eth_per_contract, marketSnapshot?.eth_usd),
    [form.direct_contract_eth_per_contract, marketSnapshot?.eth_usd],
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
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.detail ?? "Failed to load live market snapshot");
        if (!active) return;
        setMarketSnapshot(payload);
        setMarketError(payload.error ?? null);
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
      const nextOptions = await loadChainOptions(nextChain);
      setSaveError(null);
      setForm((current) => ({
        ...current,
        chain: nextChain,
        fee_tier: nextOptions.defaults.fee_tier ?? null,
        auto_wrap_eth_to_weth: nextOptions.defaults.auto_wrap_eth_to_weth ?? true,
        stablecoin_distribution_mode: nextOptions.defaults.stablecoin_distribution_mode ?? "none",
        stablecoin_allocations: [],
      }));
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Failed to load template options");
    }
  };

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
        chain: form.chain,
        template_version: "v2",
        recipient_address: form.recipient_address || null,
        return_wallet_address: form.return_wallet_address || null,
        test_auto_execute_after_funding: form.test_auto_execute_after_funding,
        gas_reserve_eth_per_contract: form.gas_reserve_eth_per_contract,
        swap_budget_eth_per_contract: form.swap_budget_eth_per_contract,
        direct_contract_eth_per_contract: form.direct_contract_eth_per_contract,
        direct_contract_native_eth_per_contract: form.direct_contract_native_eth_per_contract,
        direct_contract_weth_per_contract: form.direct_contract_weth_per_contract,
        auto_top_up_enabled: form.auto_top_up_enabled,
        auto_top_up_threshold_eth: form.auto_top_up_threshold_eth,
        auto_top_up_target_eth: form.auto_top_up_target_eth,
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
                ? `${nativeSymbol}, ${wrappedNativeSymbol}, and selected token spot prices refresh every 60 seconds while this editor is open. These are reference labels only and do not change execution logic.`
                : locale === "zn"
                  ? `当此编辑器打开时，${nativeSymbol}、${wrappedNativeSymbol} 和所选代币现货价格每 60 秒刷新一次。这些仅作参考，不会改变执行逻辑。`
                  : `Giá spot của ${nativeSymbol}, ${wrappedNativeSymbol} và token đã chọn sẽ làm mới mỗi 60 giây khi trình chỉnh sửa đang mở. Đây chỉ là nhãn tham chiếu và không thay đổi logic thực thi.`}
            </p>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span>{nativeSymbol} {formatUsd(marketSnapshot?.eth_usd)}</span>
              <span>{wrappedNativeSymbol} {formatUsd(marketSnapshot?.weth_usd)}</span>
              <span>{locale === "en" ? "Updated" : locale === "zn" ? "更新时间" : "Cập nhật"} {formatRelativeTimestamp(marketSnapshot?.fetched_at)}</span>
            </div>
            {marketError ? <p className="mt-2 text-xs text-amber-800">{locale === "en" ? "Market data warning" : locale === "zn" ? "市场数据警告" : "Cảnh báo dữ liệu thị trường"}: {marketError}</p> : null}
            {!currentChain.quote_supported ? (
              <p className="mt-2 text-xs text-amber-800">
                {locale === "en"
                  ? `${currentChain.label} supports token selection, pricing, and wallet execution for funding, local wrap, auto top-up, and direct contract funding. Live swap quoting and token swap execution are still unavailable.`
                  : locale === "zn"
                    ? `${currentChain.label} 当前支持模板编辑器中的代币选择、价格显示，以及注资、本地包装、自动补充和直接合约注资执行；但实时兑换报价和代币兑换执行仍不可用。`
                    : `${currentChain.label} hỗ trợ chọn token, xem giá và chạy ví cho cấp vốn, wrap cục bộ, auto top-up và cấp vốn hợp đồng trực tiếp. Báo giá swap trực tiếp và thực thi swap token vẫn chưa khả dụng.`}
              </p>
            ) : null}
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
                <div className="grid gap-2 sm:grid-cols-2">
                  {chainOptions.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      disabled={Boolean(template)}
                      onClick={() => void handleChainChange(option.value)}
                      className={`rounded-2xl border px-4 py-3 text-left transition ${
                        form.chain === option.value
                          ? "border-primary/30 bg-accent text-foreground shadow-[0_12px_28px_-24px_rgba(37,99,235,0.55)]"
                          : "border-border/70 bg-card hover:bg-secondary/35"
                      } ${template ? "cursor-default opacity-85" : ""}`}
                    >
                      <p className="text-sm font-semibold text-foreground">{option.label}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {option.native_symbol} / {option.wrapped_native_symbol}
                      </p>
                    </button>
                  ))}
                </div>
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
                  {locale === "en" ? "Recipient address" : locale === "zn" ? "接收地址" : "Địa chỉ nhận"}
                </label>
                <Input
                  id="recipient-address"
                  value={form.recipient_address}
                  placeholder="0x..."
                  onChange={(event) => setForm((current) => ({ ...current, recipient_address: event.target.value }))}
                />
                <p className="text-xs text-muted-foreground">
                  {locale === "en"
                    ? `Required when token swaps or direct contract ${nativeSymbol}/${wrappedNativeSymbol} funding should auto-deploy ManagedTokenDistributor from each sub-wallet.`
                    : locale === "zn"
                      ? `当代币兑换或直接合约 ${nativeSymbol}/${wrappedNativeSymbol} 注资需要从每个子钱包自动部署 ManagedTokenDistributor 时，此项为必填。`
                      : `Bắt buộc khi swap token hoặc cấp ${nativeSymbol}/${wrappedNativeSymbol} trực tiếp cho hợp đồng cần tự động triển khai ManagedTokenDistributor từ mỗi ví con.`}
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
                      ? "Optional. After the run, leftover ETH, WETH, and supported token balances still sitting in a sub-wallet will be swept here."
                      : locale === "zn"
                        ? "可选。运行结束后，子钱包中剩余的 ETH、WETH 和受支持代币余额会被归集到这里。"
                        : "Tùy chọn. Sau khi chạy xong, ETH, WETH và số dư token được hỗ trợ còn lại trong ví con sẽ được gom về đây.")}
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
                <span className="block text-sm font-medium text-foreground">{locale === "en" ? "Testing only: execute distributor immediately after funding" : locale === "zn" ? "仅测试：注资后立即执行分发合约" : "Chỉ để thử nghiệm: thực thi hợp đồng phân phối ngay sau khi cấp vốn"}</span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  {currentOptions?.hints.test_auto_execute_note ??
                    (locale === "en"
                      ? "After each ManagedTokenDistributor is deployed and funded, the sub-wallet will call execute() right away. If you want the contract output to end in the return wallet during testing, set the recipient address to the same address."
                      : locale === "zn"
                        ? "每个 ManagedTokenDistributor 部署并注资后，子钱包会立即调用 execute()。如果你希望测试时合约输出回到回收钱包，请把接收地址设置成相同地址。"
                        : "Sau khi mỗi ManagedTokenDistributor được triển khai và cấp vốn, ví con sẽ gọi execute() ngay. Nếu muốn đầu ra của hợp đồng kết thúc ở ví nhận lại trong lúc thử nghiệm, hãy đặt địa chỉ người nhận giống địa chỉ đó.")}
                </span>
              </span>
            </label>

            {form.test_auto_execute_after_funding ? (
              <div className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
                {locale === "en" ? "This bypasses the normal hold-in-contract behavior for testing. `execute()` still sends the funded amount to the recipient address, not the return wallet." : locale === "zn" ? "这会在测试中绕过常规的合约内持有行为。`execute()` 仍会把注资金额发送到接收地址，而不是回收钱包。" : "Điều này bỏ qua cơ chế giữ tiền trong hợp đồng thông thường để thử nghiệm. `execute()` vẫn gửi số tiền đã cấp vốn đến địa chỉ người nhận, không phải ví nhận lại."}
              </div>
            ) : null}
          </SectionCard>

          <SectionCard
            title={locale === "en" ? `${nativeSymbol} Budget` : locale === "zn" ? `${nativeSymbol} 预算` : `Ngân sách ${nativeSymbol}`}
            description={locale === "en" ? "These values apply to one contract. The wallet flow multiplies them by the contract count later." : locale === "zn" ? "这些数值适用于单个合约，后续钱包流程会按合约数量进行倍增。" : "Các giá trị này áp dụng cho một hợp đồng. Luồng ví sẽ nhân chúng theo số lượng hợp đồng ở bước sau."}
          >
            <div className="grid gap-4 sm:grid-cols-2">
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

              <div className="space-y-2">
                <label htmlFor="swap-budget" className="text-sm font-medium text-foreground">
                  {locale === "en" ? `Swap token budget (${wrappedNativeSymbol})` : locale === "zn" ? `兑换代币预算 (${wrappedNativeSymbol})` : `Ngân sách swap token (${wrappedNativeSymbol})`}
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
                <LiveValueHint label={`Live ${wrappedNativeSymbol} spend`} value={swapBudgetUsdLabel} />
              </div>
            </div>

            <label className="cad-panel-muted flex items-start gap-3 px-4 py-3">
              <input
                type="checkbox"
                checked
                disabled
                readOnly
                className="mt-1 h-4 w-4 rounded border-border"
              />
              <span>
                <span className="block text-sm font-medium text-foreground">
                  {locale === "en"
                    ? `Local sub-wallet wrapping is always used when ${wrappedNativeSymbol} is needed`
                    : locale === "zn"
                      ? `当需要 ${wrappedNativeSymbol} 时，始终在子钱包内本地包装`
                      : `Luôn wrap cục bộ trong ví con khi cần ${wrappedNativeSymbol}`}
                </span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  {locale === "en"
                    ? `The current execution engine funds ${nativeSymbol} first, keeps gas unwrapped, and wraps the required ${wrappedNativeSymbol} amount inside each sub-wallet. Direct main-wallet ${wrappedNativeSymbol} funding is not available in this flow.`
                    : locale === "zn"
                      ? `当前执行引擎会先注入 ${nativeSymbol}，保留 gas 为未包装状态，并在每个子钱包内包装所需的 ${wrappedNativeSymbol}。此流程不支持主钱包直接注入 ${wrappedNativeSymbol}。`
                      : `Luồng thực thi hiện tại sẽ cấp ${nativeSymbol} trước, giữ gas ở dạng chưa wrap và chỉ wrap lượng ${wrappedNativeSymbol} cần thiết trong từng ví con. Luồng này chưa hỗ trợ cấp ${wrappedNativeSymbol} trực tiếp từ ví chính.`}
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
                    ? `The main wallet will top the sub-wallet back up to this native ${nativeSymbol} target. Set it higher than the trigger.`
                    : locale === "zn"
                      ? `主钱包会把子钱包补回到这个原生 ${nativeSymbol} 目标值。请将其设为高于触发阈值。`
                      : `Ví chính sẽ nạp lại ví con về mức ${nativeSymbol} gốc này. Hãy đặt nó cao hơn ngưỡng kích hoạt.`}
                </p>
                <LiveValueHint label="Live value" value={topUpTargetUsdLabel} />
              </div>
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
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {stablecoins.map((coin) => {
                    const active = selectedStablecoinAddresses.has(coin.address.toLowerCase());
                    return (
                      <button
                        key={coin.address}
                        type="button"
                        onClick={() => toggleStablecoin(coin.address, coin.symbol)}
                        className={`rounded-2xl px-4 py-4 text-left transition ${
                          active
                            ? "bg-accent/85 shadow-[0_18px_36px_-26px_rgba(56,189,248,0.35)] ring-1 ring-sky-200"
                            : "bg-card ring-1 ring-border/70 hover:bg-secondary/35"
                        }`}
                      >
                        <p className="text-sm font-semibold text-foreground">{coin.symbol}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{coin.name}</p>
                        <p className="mt-2 font-mono text-[11px] text-muted-foreground">{shortAddress(coin.address)}</p>
                        <p className="mt-2 text-[11px] text-muted-foreground">
                          {coin.official_source ? "Verified from official docs" : `${currentChain.label} token`}
                        </p>
                        <p className="mt-1 text-[11px] font-medium text-sky-700">
                          Spot {formatUsd(marketSnapshot?.token_prices?.[coin.address.toLowerCase()])}
                        </p>
                      </button>
                    );
                  })}
                </div>

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
                            : `Exact ${wrappedNativeSymbol} amounts must total the swap budget for one contract.`}
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
                              <p className="mt-1 text-[11px] font-medium text-sky-700">
                                Spot {formatUsd(marketSnapshot?.token_prices?.[coin.address.toLowerCase()])}
                              </p>
                            </div>
                            <div className="space-y-2">
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
                              {form.stablecoin_distribution_mode === "manual_percent" ? (
                                <LiveValueHint
                                  label="Live budget slice"
                                  value={getUsdValue(
                                    ((toFiniteNumber(form.swap_budget_eth_per_contract) ?? 0) * (toFiniteNumber(allocation.percent) ?? 0)) / 100,
                                    marketSnapshot?.weth_usd,
                                  )}
                                />
                              ) : (
                                <LiveValueHint
                                  label={`Live ${wrappedNativeSymbol} spend`}
                                  value={getUsdValue(allocation.weth_amount_per_contract, marketSnapshot?.weth_usd)}
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
                            <p className="text-sm font-semibold text-foreground">{allocation.token_symbol}</p>
                            <p className="mt-1 font-mono text-[11px] text-muted-foreground">{shortAddress(allocation.token_address)}</p>
                          </div>
                          <div>
                            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{wrappedNativeSymbol} per contract</p>
                            <p className="mt-1 text-sm font-semibold text-foreground">
                              {formatAmount(allocation.weth_amount_per_contract)} {wrappedNativeSymbol}
                            </p>
                            <p className="mt-1 text-[11px] font-medium text-sky-700">
                              {formatUsd(getUsdValue(allocation.weth_amount_per_contract, marketSnapshot?.weth_usd))}
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
                      {form.chain === "bnb"
                        ? "BNB Chain uses PancakeSwap auto routing. Fee tier stays on auto."
                        : "Leave this on auto unless you know you want to force a specific V3 pool fee."}
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
            description={`Keep extra ${nativeSymbol} in each sub-wallet, or fund ManagedTokenDistributor directly with ${nativeSymbol} and ${wrappedNativeSymbol}.`}
          >
            <div className="cad-panel-soft px-4 py-3 text-sm text-foreground/80">
              {`Sub-wallet ${nativeSymbol} stays local for gas headroom or native-side actions. Direct contract ${nativeSymbol} and direct contract ${wrappedNativeSymbol} are sent into ManagedTokenDistributor after deployment.`}
            </div>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <div className="space-y-2">
                <label htmlFor="direct-eth" className="text-sm font-medium text-foreground">
                  {`Direct ${nativeSymbol} to sub-wallet`}
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
                  {`This ${nativeSymbol} stays unwrapped in the sub-wallet after funding. Use it for extra gas headroom or any native-side action in the run.`}
                </p>
                <LiveValueHint label="Live value" value={directEthUsdLabel} />
              </div>

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
                  {`Optional. After deployment, the sub-wallet sends this ${nativeSymbol} directly into ManagedTokenDistributor for a native-token execute path.`}
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
                  {`Optional. The sub-wallet wraps this amount locally after funding, then transfers it into a deployed ManagedTokenDistributor.`}
                </p>
                <LiveValueHint label="Live value" value={directWethUsdLabel} />
              </div>
            </div>
          </SectionCard>

          <SectionCard
            title={locale === "en" ? "Summary" : locale === "zn" ? "摘要" : "Tóm tắt"}
            description={locale === "en" ? "Per contract." : locale === "zn" ? "按单个合约计算。" : "Theo từng hợp đồng."}
          >
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-7">
              <div className="cad-panel-muted px-4 py-3">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Gas</p>
                <p className="mt-1 text-sm font-semibold text-foreground">{formatAmount(form.gas_reserve_eth_per_contract)} {nativeSymbol}</p>
                <p className="mt-1 text-[11px] font-medium text-sky-700">{formatUsd(ethUsdLabel)}</p>
              </div>
              <div className="cad-panel-muted px-4 py-3">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Swap</p>
                <p className="mt-1 text-sm font-semibold text-foreground">{formatAmount(form.swap_budget_eth_per_contract)} {wrappedNativeSymbol}</p>
                <p className="mt-1 text-[11px] font-medium text-sky-700">{formatUsd(swapBudgetUsdLabel)}</p>
              </div>
              <div className="cad-panel-muted px-4 py-3">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{`Wallet ${nativeSymbol}`}</p>
                <p className="mt-1 text-sm font-semibold text-foreground">{formatAmount(form.direct_contract_eth_per_contract)} {nativeSymbol}</p>
                <p className="mt-1 text-[11px] font-medium text-sky-700">{formatUsd(directEthUsdLabel)}</p>
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
              {needsWeth
                ? `${wrappedNativeSymbol} will be wrapped inside each sub-wallet.`
                : `No ${wrappedNativeSymbol} is required.`}
            </div>

            <div className="cad-panel-soft px-4 py-3 text-sm text-muted-foreground">
              Fee tier: {currentOptions?.fee_tiers.find((option) => option.value === form.fee_tier)?.label ?? (form.chain === "bnb" ? "Auto route" : "Auto best route")}
            </div>

            <div className="cad-panel-soft px-4 py-3 text-sm text-muted-foreground">
              Top-up: {topUpEnabled
                ? topUpHasSingleValue
                  ? `${formatAmount(form.auto_top_up_target_eth)} ${nativeSymbol}`
                  : `${formatAmount(form.auto_top_up_threshold_eth)} -> ${formatAmount(form.auto_top_up_target_eth)} ${nativeSymbol}`
                : "Off"}
            </div>

            <div className="cad-panel-soft px-4 py-3 text-sm text-muted-foreground">
              Test execute: {form.test_auto_execute_after_funding ? "On" : "Off"}
            </div>

            <div className="cad-panel-soft px-4 py-3 text-sm text-muted-foreground">
              Recipient: {form.recipient_address || "Not set"}
            </div>

            <div className="cad-panel-soft px-4 py-3 text-sm text-muted-foreground">
              Return wallet: {form.return_wallet_address || "Not set"}
            </div>

            {form.test_auto_execute_after_funding &&
            form.recipient_address &&
            form.return_wallet_address &&
            form.recipient_address.toLowerCase() !== form.return_wallet_address.toLowerCase() ? (
              <div className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
                Test execute sends funds to the recipient. Use the same address if funds should return there.
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
