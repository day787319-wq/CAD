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
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [marketSnapshot, setMarketSnapshot] = useState<TemplatePriceSnapshot | null>(null);
  const [marketError, setMarketError] = useState<string | null>(null);

  const stablecoins = options?.stablecoins ?? [];
  const selectedStablecoinAddresses = useMemo(
    () => new Set(form.stablecoin_allocations.map((allocation) => allocation.token_address.toLowerCase())),
    [form.stablecoin_allocations],
  );
  const hasStablecoinSwap = form.stablecoin_distribution_mode !== "none";
  const topUpEnabled = form.auto_top_up_enabled;
  const needsWeth = Number(form.swap_budget_eth_per_contract || "0") > 0 || Number(form.direct_contract_weth_per_contract || "0") > 0;
  const configuredEthPerContract =
    Number(form.gas_reserve_eth_per_contract || "0") +
    Number(form.direct_contract_eth_per_contract || "0") +
    Number(form.direct_contract_native_eth_per_contract || "0");
  const configuredWethPerContract =
    Number(form.swap_budget_eth_per_contract || "0") +
    Number(form.direct_contract_weth_per_contract || "0");
  const totalEthIfNoWeth = configuredEthPerContract + configuredWethPerContract;

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
  const configuredSpendUsdLabel = useMemo(() => {
    const nativeSpend = toFiniteNumber(ethUsdLabel);
    const directEthSpend = toFiniteNumber(directEthUsdLabel);
    const directContractNativeEthSpend = toFiniteNumber(directContractNativeEthUsdLabel);
    const swapBudgetSpend = toFiniteNumber(swapBudgetUsdLabel);
    const directWethSpend = toFiniteNumber(directWethUsdLabel);
    if ([nativeSpend, directEthSpend, directContractNativeEthSpend, swapBudgetSpend, directWethSpend].some((value) => value === null)) return null;
    return `${nativeSpend! + directEthSpend! + directContractNativeEthSpend! + swapBudgetSpend! + directWethSpend!}`;
  }, [directContractNativeEthUsdLabel, directEthUsdLabel, directWethUsdLabel, ethUsdLabel, swapBudgetUsdLabel]);

  useEffect(() => {
    if (!open) return;

    let active = true;

    const loadMarketSnapshot = async () => {
      try {
        const response = await fetch(`${TEMPLATE_API_URL}/api/templates/market-snapshot`, {
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

    void loadMarketSnapshot();
    const intervalId = window.setInterval(() => {
      if (!document.hidden) {
        void loadMarketSnapshot();
      }
    }, MARKET_REFRESH_INTERVAL_MS);

    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, [open]);

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
            {options?.hints.summary ?? (locale === "en" ? "This template defines one contract / one subwallet." : locale === "zn" ? "此模板定义一个合约 / 一个子钱包。" : "Mẫu này định nghĩa một hợp đồng / một ví con.")}
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-5" onSubmit={handleSubmit}>
          <div className="cad-panel-accent px-4 py-4">
            <p className="text-sm font-semibold text-foreground">{locale === "en" ? "Live USD labels" : locale === "zn" ? "实时 USD 标签" : "Nhãn USD trực tiếp"}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {locale === "en"
                ? "ETH, WETH, and stablecoin spot prices refresh every 60 seconds while this editor is open. These are reference labels only and do not change execution logic."
                : locale === "zn"
                  ? "当此编辑器打开时，ETH、WETH 和稳定币现货价格每 60 秒刷新一次。这些仅作参考，不会改变执行逻辑。"
                  : "Giá spot của ETH, WETH và stablecoin sẽ làm mới mỗi 60 giây khi trình chỉnh sửa đang mở. Đây chỉ là nhãn tham chiếu và không thay đổi logic thực thi."}
            </p>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span>ETH {formatUsd(marketSnapshot?.eth_usd)}</span>
              <span>WETH {formatUsd(marketSnapshot?.weth_usd)}</span>
              <span>{locale === "en" ? "Updated" : locale === "zn" ? "更新时间" : "Cập nhật"} {formatRelativeTimestamp(marketSnapshot?.fetched_at)}</span>
            </div>
            {marketError ? <p className="mt-2 text-xs text-amber-800">{locale === "en" ? "Market data warning" : locale === "zn" ? "市场数据警告" : "Cảnh báo dữ liệu thị trường"}: {marketError}</p> : null}
          </div>

          <SectionCard
            title={locale === "en" ? "Basics" : locale === "zn" ? "基础信息" : "Cơ bản"}
            description={locale === "en" ? "Set the identity and overall intent for one contract / one subwallet." : locale === "zn" ? "设置一个合约 / 一个子钱包的标识和整体用途。" : "Thiết lập định danh và mục đích tổng thể cho một hợp đồng / một ví con."}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <label htmlFor="template-name" className="text-sm font-medium text-foreground">
                  {locale === "en" ? "Template name" : locale === "zn" ? "模板名称" : "Tên mẫu"}
                </label>
                <Input
                  id="template-name"
                  value={form.name}
                  placeholder={locale === "en" ? "Example: Stablecoin distribution contract" : locale === "zn" ? "例如：稳定币分发合约" : "Ví dụ: Hợp đồng phân phối stablecoin"}
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
                  {locale === "en" ? "Required when stablecoin swaps or direct contract ETH/WETH funding should auto-deploy ManagedTokenDistributor from each sub-wallet." : locale === "zn" ? "当稳定币兑换或直接合约 ETH/WETH 注资需要从每个子钱包自动部署 ManagedTokenDistributor 时，此项为必填。" : "Bắt buộc khi swap stablecoin hoặc cấp ETH/WETH trực tiếp cho hợp đồng cần tự động triển khai ManagedTokenDistributor từ mỗi ví con."}
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
                  {options?.hints.return_wallet_note ??
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
                  {options?.hints.test_auto_execute_note ??
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
            title={locale === "en" ? "ETH Budget" : locale === "zn" ? "ETH 预算" : "Ngân sách ETH"}
            description={locale === "en" ? "These values apply to one contract. The wallet flow multiplies them by the contract count later." : locale === "zn" ? "这些数值适用于单个合约，后续钱包流程会按合约数量进行倍增。" : "Các giá trị này áp dụng cho một hợp đồng. Luồng ví sẽ nhân chúng theo số lượng hợp đồng ở bước sau."}
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
                <LiveValueHint label="Live value" value={ethUsdLabel} />
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
                <LiveValueHint label="Live WETH spend" value={swapBudgetUsdLabel} />
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
                <span className="block text-sm font-medium text-foreground">Local sub-wallet wrapping is always used when WETH is needed</span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  The current execution engine funds ETH first, keeps gas unwrapped, and wraps the required WETH amount inside each sub-wallet. Direct main-wallet WETH funding is not available in this flow.
                </span>
              </span>
            </label>
          </SectionCard>

          <SectionCard
            title={locale === "en" ? "Auto Top-Up" : locale === "zn" ? "自动补充" : "Nạp thêm tự động"}
            description={locale === "en" ? "Let the main wallet refill a sub-wallet before approvals, swaps, or deployments continue when its native ETH balance gets too low." : locale === "zn" ? "当子钱包的原生 ETH 余额过低时，让主钱包在继续授权、兑换或部署之前为其补充余额。" : "Cho phép ví chính nạp lại ví con trước khi tiếp tục phê duyệt, swap hoặc triển khai khi số dư ETH gốc xuống quá thấp."}
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
                <span className="block text-sm font-medium text-foreground">Enable auto top-up from the main wallet</span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  {options?.hints.auto_top_up_note ??
                    "When a sub-wallet reaches the trigger threshold after local execution starts, the main wallet can send another ETH transfer to refill it to the target."}
                </span>
              </span>
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label htmlFor="auto-top-up-threshold" className="text-sm font-medium text-foreground">
                  Trigger threshold ETH
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
                  If the sub-wallet balance falls to or below this value during the run, the executor will try to refill it before continuing.
                </p>
                <LiveValueHint label="Live value" value={topUpThresholdUsdLabel} />
              </div>

              <div className="space-y-2">
                <label htmlFor="auto-top-up-target" className="text-sm font-medium text-foreground">
                  Refill target ETH
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
                  The main wallet will top the sub-wallet back up to this native ETH target. Set it higher than the trigger.
                </p>
                <LiveValueHint label="Live value" value={topUpTargetUsdLabel} />
              </div>
            </div>
          </SectionCard>

          <SectionCard
            title={locale === "en" ? "Stablecoin Distribution" : locale === "zn" ? "稳定币分配" : "Phân bổ stablecoin"}
            description={locale === "en" ? "Pick one or many stablecoins for one contract, then decide how the swap budget is split across them." : locale === "zn" ? "为一个合约选择一个或多个稳定币，然后决定兑换预算如何分配。" : "Chọn một hoặc nhiều stablecoin cho một hợp đồng, rồi quyết định cách chia ngân sách swap giữa chúng."}
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
                          {coin.official_source ? "Verified from official issuer docs" : "Ethereum mainnet stablecoin"}
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
                                  label="Live WETH spend"
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
                          This is what one future subwallet would have allocated from the stablecoin swap budget before contract creation.
                        </p>
                      </div>
                      <p className="text-xs text-muted-foreground">{distributionPreviewRows.length} coin{distributionPreviewRows.length === 1 ? "" : "s"}</p>
                    </div>

                    <div className="space-y-3">
                      {distributionPreviewRows.map((allocation) => (
                        <div key={allocation.token_address} className="cad-panel-muted grid gap-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_140px_110px] sm:items-center">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-foreground">{allocation.token_symbol}</p>
                            <p className="mt-1 font-mono text-[11px] text-muted-foreground">{shortAddress(allocation.token_address)}</p>
                          </div>
                          <div>
                            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">WETH per contract</p>
                            <p className="mt-1 text-sm font-semibold text-foreground">
                              {formatAmount(allocation.weth_amount_per_contract)} WETH
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
              <div className="cad-panel-soft px-4 py-3 text-sm text-muted-foreground">
                Swap protection becomes active when this template includes a stablecoin swap route.
              </div>
            )}
          </SectionCard>

          <SectionCard
            title="Direct Funding"
            description="Keep extra ETH in each sub-wallet, or fund ManagedTokenDistributor directly with ETH and WETH."
          >
            <div className="cad-panel-soft px-4 py-3 text-sm text-foreground/80">
              Sub-wallet ETH stays local for gas headroom or ETH-side actions. Direct contract ETH and direct contract WETH are sent into ManagedTokenDistributor after deployment.
            </div>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <div className="space-y-2">
                <label htmlFor="direct-eth" className="text-sm font-medium text-foreground">
                  Direct ETH to sub-wallet
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
                  This ETH stays unwrapped in the sub-wallet after funding. Use it for extra gas headroom or any ETH-side action in the run.
                </p>
                <LiveValueHint label="Live value" value={directEthUsdLabel} />
              </div>

              <div className="space-y-2">
                <label htmlFor="direct-contract-eth" className="text-sm font-medium text-foreground">
                  Direct ETH distributor funding
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
                  Optional. After deployment, the sub-wallet sends this ETH directly into ManagedTokenDistributor for a native ETH execute path.
                </p>
                <LiveValueHint label="Live value" value={directContractNativeEthUsdLabel} />
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
                <LiveValueHint label="Live value" value={directWethUsdLabel} />
              </div>
            </div>
          </SectionCard>

          <SectionCard
            title={locale === "en" ? "Review" : locale === "zn" ? "复核" : "Xem lại"}
            description={locale === "en" ? "This summary is per contract. The wallet flow will multiply these numbers by the selected contract count." : locale === "zn" ? "此汇总按单个合约计算，钱包流程会根据所选合约数量乘算这些数值。" : "Phần tổng hợp này tính theo từng hợp đồng. Luồng ví sẽ nhân các số này theo số lượng hợp đồng đã chọn."}
          >
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-8">
              <div className="cad-panel-muted px-4 py-3">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Gas reserve</p>
                <p className="mt-1 text-sm font-semibold text-foreground">{formatAmount(form.gas_reserve_eth_per_contract)} ETH</p>
                <p className="mt-1 text-[11px] font-medium text-sky-700">{formatUsd(ethUsdLabel)}</p>
              </div>
              <div className="cad-panel-muted px-4 py-3">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Swap budget</p>
                <p className="mt-1 text-sm font-semibold text-foreground">{formatAmount(form.swap_budget_eth_per_contract)} ETH</p>
                <p className="mt-1 text-[11px] font-medium text-sky-700">{formatUsd(swapBudgetUsdLabel)}</p>
              </div>
              <div className="cad-panel-muted px-4 py-3">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Sub-wallet ETH</p>
                <p className="mt-1 text-sm font-semibold text-foreground">{formatAmount(form.direct_contract_eth_per_contract)} ETH</p>
                <p className="mt-1 text-[11px] font-medium text-sky-700">{formatUsd(directEthUsdLabel)}</p>
              </div>
              <div className="cad-panel-muted px-4 py-3">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Contract ETH</p>
                <p className="mt-1 text-sm font-semibold text-foreground">{formatAmount(form.direct_contract_native_eth_per_contract)} ETH</p>
                <p className="mt-1 text-[11px] font-medium text-sky-700">{formatUsd(directContractNativeEthUsdLabel)}</p>
              </div>
              <div className="cad-panel-muted px-4 py-3">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Contract WETH</p>
                <p className="mt-1 text-sm font-semibold text-foreground">{formatAmount(form.direct_contract_weth_per_contract)} WETH</p>
                <p className="mt-1 text-[11px] font-medium text-sky-700">{formatUsd(directWethUsdLabel)}</p>
              </div>
              <div className="cad-panel-muted px-4 py-3">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Auto top-up</p>
                <p className="mt-1 text-sm font-semibold text-foreground">
                  {topUpEnabled
                    ? `${formatAmount(form.auto_top_up_threshold_eth)} -> ${formatAmount(form.auto_top_up_target_eth)} ETH`
                    : "Off"}
                </p>
                <p className="mt-1 text-[11px] font-medium text-sky-700">
                  {topUpEnabled
                    ? `${formatUsd(topUpThresholdUsdLabel)} -> ${formatUsd(topUpTargetUsdLabel)}`
                    : "--"}
                </p>
              </div>
              <div className="cad-panel-muted px-4 py-3">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Slippage</p>
                <p className="mt-1 text-sm font-semibold text-foreground">{formatAmount(form.slippage_percent)}%</p>
              </div>
              <div className="cad-panel-accent px-4 py-3">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Configured spend / contract</p>
                <p className="mt-1 text-sm font-semibold text-foreground">
                  {formatAmount(configuredEthPerContract)} ETH + {formatAmount(configuredWethPerContract)} WETH
                </p>
                <p className="mt-1 text-[11px] font-medium text-sky-700">{formatUsd(configuredSpendUsdLabel)}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {formatAmount(totalEthIfNoWeth)} ETH if starting from native only
                </p>
              </div>
            </div>

            <div className="cad-panel-soft px-4 py-3 text-sm text-muted-foreground">
              {needsWeth
                ? "This template needs WETH. The run will fund ETH first, leave gas unwrapped, and wrap only the required WETH budget inside each sub-wallet."
                : "This template does not require WETH unless you add swap budget or direct contract WETH funding."}
            </div>

            <div className="cad-panel-soft px-4 py-3 text-sm text-muted-foreground">
              Fee tier: {options?.fee_tiers.find((option) => option.value === form.fee_tier)?.label ?? "Auto best route"}
            </div>

            <div className="cad-panel-soft px-4 py-3 text-sm text-muted-foreground">
              Auto top-up: {topUpEnabled
                ? `Enabled at ${formatAmount(form.auto_top_up_threshold_eth)} ETH, refilling to ${formatAmount(form.auto_top_up_target_eth)} ETH.`
                : "Disabled"}
            </div>

            <div className="cad-panel-soft px-4 py-3 text-sm text-muted-foreground">
              Testing auto execute: {form.test_auto_execute_after_funding ? "Enabled" : "Disabled"}
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
                Testing note: this will execute to the recipient, not the return wallet. Make both addresses the same if you want the full test cycle to land there.
              </div>
            ) : null}

            <div className="cad-panel-accent px-4 py-3 text-sm text-muted-foreground">
              We will later compare these per-template ETH requirements against the selected main wallet before any subwallets are created. WETH is produced locally inside each sub-wallet when the flow needs it.
            </div>
          </SectionCard>

          {saveError ? <p className="text-sm text-destructive">{saveError}</p> : null}

          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {locale === "en" ? "Cancel" : locale === "zn" ? "取消" : "Hủy"}
            </Button>
            <Button type="submit" disabled={saving || !options}>
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
