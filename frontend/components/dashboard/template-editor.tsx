"use client";

import { FormEvent, ReactNode, useEffect, useMemo, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
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
  formatFeeTier,
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

const copy = {
  saveFailed: { en: "Failed to save template", zn: "保存模板失败", vn: "Luu template that bai" },
  updated: { en: "Template updated", zn: "模板已更新", vn: "Da cap nhat template" },
  saved: { en: "Template saved", zn: "模板已保存", vn: "Da luu template" },
  savedDescription: {
    en: "This template now defines one contract / one subwallet.",
    zn: "该模板现在定义一个合约 / 一个子钱包。",
    vn: "Template nay hien mo ta mot hop dong / mot sub-wallet.",
  },
  editTitle: { en: "Edit template", zn: "编辑模板", vn: "Chinh sua template" },
  createTitle: { en: "Create template", zn: "创建模板", vn: "Tao template" },
  dialogDescription: {
    en: "This template defines one contract / one subwallet.",
    zn: "该模板定义一个合约 / 一个子钱包。",
    vn: "Template nay dinh nghia mot hop dong / mot sub-wallet.",
  },
  basics: { en: "Basics", zn: "基础信息", vn: "Thong tin co ban" },
  basicsDescription: {
    en: "Set the identity and overall intent for one contract / one subwallet.",
    zn: "设置一个合约 / 一个子钱包的标识和整体目标。",
    vn: "Dat ten va muc dich tong the cho mot hop dong / mot sub-wallet.",
  },
  templateName: { en: "Template name", zn: "模板名称", vn: "Ten template" },
  templateNamePlaceholder: {
    en: "Example: Stablecoin distribution contract",
    zn: "例如：稳定币分发合约",
    vn: "Vi du: hop dong phan phoi stablecoin",
  },
  recipientAddress: { en: "Recipient address", zn: "接收地址", vn: "Dia chi nguoi nhan" },
  recipientHint: {
    en: "Required when stablecoin swaps or direct WETH funding should auto-deploy ManagedTokenDistributor from each sub-wallet.",
    zn: "当稳定币交换或直接 WETH 资金需要从每个子钱包自动部署 ManagedTokenDistributor 时必须填写。",
    vn: "Bat buoc khi swap stablecoin hoac cap WETH truc tiep can tu dong deploy ManagedTokenDistributor tu moi sub-wallet.",
  },
  notes: { en: "Notes", zn: "备注", vn: "Ghi chu" },
  notesPlaceholder: {
    en: "Optional notes about funding intent or distribution strategy.",
    zn: "关于资金目的或分发策略的可选备注。",
    vn: "Ghi chu tuy chon ve muc dich cap von hoac chien luoc phan phoi.",
  },
  ethBudget: { en: "ETH Budget", zn: "ETH 预算", vn: "Ngan sach ETH" },
  ethBudgetDescription: {
    en: "These values apply to one contract. The wallet flow multiplies them by the contract count later.",
    zn: "这些数值适用于单个合约，钱包流程会在之后按合约数量放大。",
    vn: "Cac gia tri nay ap dung cho mot hop dong. Luong wallet se nhan len theo so hop dong ve sau.",
  },
  gasReserveEth: { en: "Gas reserve ETH", zn: "Gas 预留 ETH", vn: "ETH du phong gas" },
  gasReserveHint: {
    en: "Optional baseline. Preview will automatically add extra unwrapped ETH when local wrap, swap, deploy, or token-transfer gas needs more headroom.",
    zn: "可选基线值。当本地 wrap、swap、部署或代币转账需要更多空间时，预览会自动增加未包装的 ETH。",
    vn: "Muc co so tuy chon. Preview se tu dong them ETH chua wrap khi wrap noi bo, swap, deploy hoac chuyen token can them gas.",
  },
  swapBudget: { en: "Stablecoin swap budget", zn: "稳定币交换预算", vn: "Ngan sach swap stablecoin" },
  swapBudgetHint: {
    en: "This budget is wrapped locally inside each future sub-wallet before swaps execute.",
    zn: "该预算会在每个未来子钱包中先本地包装后再执行交换。",
    vn: "Ngan sach nay se duoc wrap noi bo trong moi sub-wallet truoc khi thuc hien swap.",
  },
  localWrapTitle: {
    en: "Use local sub-wallet wrapping when WETH is needed",
    zn: "当需要 WETH 时使用子钱包本地包装",
    vn: "Dung wrap noi bo trong sub-wallet khi can WETH",
  },
  localWrapDescription: {
    en: "The safer production flow funds ETH first, keeps gas unwrapped, then wraps only the WETH budget inside each sub-wallet.",
    zn: "更安全的生产流程会先提供 ETH，保留未包装的 gas，再只在每个子钱包内部包装所需的 WETH 预算。",
    vn: "Luong production an toan hon se cap ETH truoc, giu gas o dang chua wrap, sau do chi wrap phan ngan sach WETH can thiet trong moi sub-wallet.",
  },
  distribution: { en: "Stablecoin Distribution", zn: "稳定币分配", vn: "Phan bo stablecoin" },
  distributionDescription: {
    en: "Pick one or many stablecoins for one contract, then decide how the swap budget is split across them.",
    zn: "为单个合约选择一种或多种稳定币，然后决定交换预算如何在它们之间分配。",
    vn: "Chon mot hoac nhieu stablecoin cho mot hop dong, sau do quyet dinh cach chia ngan sach swap cho chung.",
  },
  verified: {
    en: "Verified from official issuer docs",
    zn: "已通过官方发行方文档验证",
    vn: "Da xac minh tu tai lieu chinh thuc cua issuer",
  },
  mainnet: { en: "Ethereum mainnet stablecoin", zn: "以太坊主网稳定币", vn: "Stablecoin tren Ethereum mainnet" },
  manualDistribution: { en: "Manual distribution", zn: "手动分配", vn: "Phan bo thu cong" },
  manualPercentHint: {
    en: "Percentages must total exactly 100.",
    zn: "百分比总和必须正好为 100。",
    vn: "Tong phan tram phai bang dung 100.",
  },
  manualWethHint: {
    en: "Exact WETH amounts must total the swap budget for one contract.",
    zn: "精确的 WETH 数量总和必须等于单个合约的交换预算。",
    vn: "Tong luong WETH chinh xac phai bang ngan sach swap cho mot hop dong.",
  },
  autoDistribute: { en: "Auto distribute", zn: "自动分配", vn: "Tu dong phan bo" },
  equalPreview: { en: "Equal split preview", zn: "平均分配预览", vn: "Preview chia deu" },
  contractPreview: { en: "Per-contract distribution preview", zn: "每合约分配预览", vn: "Preview phan bo moi hop dong" },
  previewDescription: {
    en: "This is what one future subwallet would have allocated from the stablecoin swap budget before contract creation.",
    zn: "这是在创建合约之前，一个未来子钱包从稳定币交换预算中会分配到的内容。",
    vn: "Day la nhung gi mot sub-wallet tuong lai se duoc cap phat tu ngan sach swap stablecoin truoc khi tao hop dong.",
  },
  coins: { en: "coins", zn: "个币种", vn: "dong" },
  wethPerContract: { en: "WETH per contract", zn: "每合约 WETH", vn: "WETH moi hop dong" },
  share: { en: "Share", zn: "占比", vn: "Ty trong" },
  noSwap: { en: "No stablecoin swap is included in this template.", zn: "该模板不包含稳定币交换。", vn: "Template nay khong bao gom swap stablecoin." },
  swapProtection: { en: "Swap Protection", zn: "交换保护", vn: "Bao ve swap" },
  swapProtectionDescription: {
    en: "Set the slippage guardrail and optional Uniswap fee tier for this template.",
    zn: "为该模板设置滑点保护和可选的 Uniswap 费率层级。",
    vn: "Dat nguong bao ve truot gia va muc phi Uniswap tuy chon cho template nay.",
  },
  slippageTolerance: { en: "Slippage tolerance", zn: "滑点容忍度", vn: "Muc chap nhan truot gia" },
  slippageHint: {
    en: "Used to calculate the minimum received amount for each stablecoin route.",
    zn: "用于计算每条稳定币路径的最少收到数量。",
    vn: "Dung de tinh so luong nhan toi thieu cho moi route stablecoin.",
  },
  uniswapFeeTier: { en: "Uniswap fee tier", zn: "Uniswap 费率层级", vn: "Muc phi Uniswap" },
  feeTierHint: {
    en: "Leave this on auto unless you know you want to force a specific V3 pool fee.",
    zn: "除非你明确知道要强制指定某个 V3 池费率，否则请保持自动。",
    vn: "Hay de tu dong tru khi ban chac chan muon ep mot muc phi pool V3 cu the.",
  },
  swapProtectionInactive: {
    en: "Swap protection becomes active when this template includes a stablecoin swap route.",
    zn: "当模板包含稳定币交换路径时，交换保护才会生效。",
    vn: "Bao ve swap se kich hoat khi template nay co route stablecoin.",
  },
  directFunding: { en: "Direct Contract Funding", zn: "直接合约资金", vn: "Cap von truc tiep cho hop dong" },
  directFundingDescription: {
    en: "Set the exact ETH and optional WETH that each future subwallet should place into the contract.",
    zn: "设置每个未来子钱包应放入合约中的准确 ETH 和可选 WETH 数量。",
    vn: "Dat chinh xac luong ETH va WETH tuy chon ma moi sub-wallet tuong lai se dua vao hop dong.",
  },
  directEth: { en: "Direct ETH kept in sub-wallet", zn: "保留在子钱包中的直接 ETH", vn: "ETH truc tiep giu trong sub-wallet" },
  directEthHint: {
    en: "This ETH stays unwrapped in the sub-wallet after funding. Use it for gas headroom or any ETH-side action in the run.",
    zn: "这些 ETH 在资金到位后会保留在子钱包中不包装。可用于 gas 余量或运行中的任何 ETH 操作。",
    vn: "Luong ETH nay se duoc giu chua wrap trong sub-wallet sau khi cap von. Dung cho du phong gas hoac cac thao tac ETH trong run.",
  },
  directWeth: { en: "Direct WETH distributor funding", zn: "直接 WETH 分发资金", vn: "Cap von WETH truc tiep cho distributor" },
  directWethHint: {
    en: "Optional. The sub-wallet wraps this amount locally after funding, then transfers it into a deployed ManagedTokenDistributor.",
    zn: "可选。子钱包在收到资金后本地包装该数量，然后转入已部署的 ManagedTokenDistributor。",
    vn: "Tuy chon. Sub-wallet se wrap luong nay noi bo sau khi cap von, sau do chuyen vao ManagedTokenDistributor da duoc deploy.",
  },
  review: { en: "Review", zn: "复核", vn: "Xem lai" },
  reviewDescription: {
    en: "This summary is per contract. The wallet flow will multiply these numbers by the selected contract count.",
    zn: "该摘要按单个合约计算。钱包流程会根据选择的合约数量对这些数值进行放大。",
    vn: "Ban tom tat nay tinh theo moi hop dong. Luong wallet se nhan cac so nay theo so hop dong da chon.",
  },
  gasReserve: { en: "Gas reserve", zn: "Gas 预留", vn: "Du phong gas" },
  directEthShort: { en: "Direct ETH", zn: "直接 ETH", vn: "ETH truc tiep" },
  directWethShort: { en: "Direct WETH", zn: "直接 WETH", vn: "WETH truc tiep" },
  slippage: { en: "Slippage", zn: "滑点", vn: "Do truot gia" },
  ethOnly: { en: "If starting with only ETH", zn: "如果只从 ETH 开始", vn: "Neu bat dau chi voi ETH" },
  needsWeth: {
    en: "This template needs WETH. The run will fund ETH first, leave gas unwrapped, and wrap only the required WETH budget inside each sub-wallet.",
    zn: "该模板需要 WETH。运行会先提供 ETH，保留 gas 为未包装状态，并只在每个子钱包内包装所需的 WETH 预算。",
    vn: "Template nay can WETH. Run se cap ETH truoc, giu gas chua wrap va chi wrap phan ngan sach WETH can thiet trong moi sub-wallet.",
  },
  noWethNeeded: {
    en: "This template does not require WETH unless you add swap budget or direct WETH funding.",
    zn: "除非你添加交换预算或直接 WETH 资金，否则该模板不需要 WETH。",
    vn: "Template nay khong can WETH tru khi ban them ngan sach swap hoac cap von WETH truc tiep.",
  },
  feeTier: { en: "Fee tier", zn: "费率层级", vn: "Muc phi" },
  recipient: { en: "Recipient", zn: "接收方", vn: "Nguoi nhan" },
  notSet: { en: "Not set", zn: "未设置", vn: "Chua dat" },
  reviewHint: {
    en: "We will later compare these per-template ETH requirements against the selected main wallet before any subwallets are created. WETH is produced locally inside each sub-wallet when the flow needs it.",
    zn: "在创建任何子钱包之前，我们稍后会将这些模板级 ETH 需求与所选主钱包进行比较。当流程需要时，WETH 会在每个子钱包内部本地生成。",
    vn: "Sau nay chung toi se doi chieu cac yeu cau ETH theo template nay voi wallet chinh da chon truoc khi tao bat ky sub-wallet nao. WETH se duoc tao noi bo trong moi sub-wallet khi flow can den.",
  },
  cancel: { en: "Cancel", zn: "取消", vn: "Huy" },
  saving: { en: "Saving...", zn: "保存中...", vn: "Dang luu..." },
  saveChanges: { en: "Save changes", zn: "保存更改", vn: "Luu thay doi" },
  saveTemplate: { en: "Save template", zn: "保存模板", vn: "Luu template" },
  noDistributionMode: { en: "No swap", zn: "不交换", vn: "Khong swap" },
} as const;

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

function getDistributionModeLabel(
  value: Template["stablecoin_distribution_mode"],
  locale: "en" | "zn" | "vn",
) {
  switch (value) {
    case "equal":
      return locale === "zn" ? "平均分配" : locale === "vn" ? "Chia deu" : "Equal split";
    case "manual_percent":
      return locale === "zn" ? "手动百分比" : locale === "vn" ? "Phan tram thu cong" : "Manual percent";
    case "manual_weth_amount":
      return locale === "zn" ? "手动 WETH 数量" : locale === "vn" ? "Luong WETH thu cong" : "Manual WETH amount";
    default:
      return copy.noDistributionMode[locale];
  }
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
  const { locale } = useI18n();
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
  const needsWeth =
    Number(form.swap_budget_eth_per_contract || "0") > 0 ||
    Number(form.direct_contract_weth_per_contract || "0") > 0;
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
  const distributionPreviewRows = useMemo(() => getStablecoinDistributionRows(form), [form]);

  const toggleStablecoin = (tokenAddress: string, tokenSymbol: string) => {
    const normalized = tokenAddress.toLowerCase();
    setForm((current) => {
      const exists = current.stablecoin_allocations.some(
        (allocation) => allocation.token_address.toLowerCase() === normalized,
      );
      const stablecoin_allocations = exists
        ? current.stablecoin_allocations.filter(
            (allocation) => allocation.token_address.toLowerCase() !== normalized,
          )
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

  const updateAllocation = (
    tokenAddress: string,
    field: "percent" | "weth_amount_per_contract",
    value: string,
  ) => {
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
      const values = splitMicroUnits(
        Number(form.swap_budget_eth_per_contract || "0"),
        selectedStablecoins.length,
      );
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
        template
          ? `${TEMPLATE_API_URL}/api/templates/${template.id}`
          : `${TEMPLATE_API_URL}/api/templates`,
        {
          method: template ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.detail ?? copy.saveFailed[locale]);

      onSaved(result);
      onOpenChange(false);
      toast({
        title: template ? copy.updated[locale] : copy.saved[locale],
        description: copy.savedDescription[locale],
      });
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : copy.saveFailed[locale]);
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
          <DialogTitle>{template ? copy.editTitle[locale] : copy.createTitle[locale]}</DialogTitle>
          <DialogDescription>{copy.dialogDescription[locale]}</DialogDescription>
        </DialogHeader>

        <form className="space-y-5" onSubmit={handleSubmit}>
          <SectionCard title={copy.basics[locale]} description={copy.basicsDescription[locale]}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <label htmlFor="template-name" className="text-sm font-medium text-foreground">
                  {copy.templateName[locale]}
                </label>
                <Input
                  id="template-name"
                  value={form.name}
                  placeholder={copy.templateNamePlaceholder[locale]}
                  onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                  required
                />
              </div>

              <div className="space-y-2 sm:col-span-2">
                <label htmlFor="recipient-address" className="text-sm font-medium text-foreground">
                  {copy.recipientAddress[locale]}
                </label>
                <Input
                  id="recipient-address"
                  value={form.recipient_address}
                  placeholder="0x..."
                  onChange={(event) =>
                    setForm((current) => ({ ...current, recipient_address: event.target.value }))
                  }
                />
                <p className="text-xs text-muted-foreground">{copy.recipientHint[locale]}</p>
              </div>

              <div className="space-y-2 sm:col-span-2">
                <label htmlFor="template-notes" className="text-sm font-medium text-foreground">
                  {copy.notes[locale]}
                </label>
                <Textarea
                  id="template-notes"
                  value={form.notes}
                  placeholder={copy.notesPlaceholder[locale]}
                  onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
                />
              </div>
            </div>
          </SectionCard>

          <SectionCard title={copy.ethBudget[locale]} description={copy.ethBudgetDescription[locale]}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label htmlFor="gas-reserve" className="text-sm font-medium text-foreground">
                  {copy.gasReserveEth[locale]}
                </label>
                <Input
                  id="gas-reserve"
                  type="number"
                  min="0"
                  step="0.0001"
                  value={form.gas_reserve_eth_per_contract}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, gas_reserve_eth_per_contract: event.target.value }))
                  }
                />
                <p className="text-xs text-muted-foreground">{copy.gasReserveHint[locale]}</p>
              </div>

              <div className="space-y-2">
                <label htmlFor="swap-budget" className="text-sm font-medium text-foreground">
                  {copy.swapBudget[locale]}
                </label>
                <Input
                  id="swap-budget"
                  type="number"
                  min="0"
                  step="0.0001"
                  value={form.swap_budget_eth_per_contract}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, swap_budget_eth_per_contract: event.target.value }))
                  }
                />
                <p className="text-xs text-muted-foreground">{copy.swapBudgetHint[locale]}</p>
              </div>
            </div>

            <label className="flex items-start gap-3 rounded-xl border border-border/70 bg-background/70 px-4 py-3">
              <input
                type="checkbox"
                checked={form.auto_wrap_eth_to_weth}
                onChange={(event) =>
                  setForm((current) => ({ ...current, auto_wrap_eth_to_weth: event.target.checked }))
                }
                className="mt-1 h-4 w-4 rounded border-border"
              />
              <span>
                <span className="block text-sm font-medium text-foreground">{copy.localWrapTitle[locale]}</span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  {copy.localWrapDescription[locale]}
                </span>
              </span>
            </label>
          </SectionCard>

          <SectionCard title={copy.distribution[locale]} description={copy.distributionDescription[locale]}>
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
                      stablecoin_allocations:
                        mode.value === "none" ? [] : current.stablecoin_allocations,
                    }))
                  }
                >
                  {getDistributionModeLabel(mode.value, locale)}
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
                          active
                            ? "border-accent bg-accent/10"
                            : "border-border bg-background/70 hover:bg-secondary/20"
                        }`}
                      >
                        <p className="text-sm font-semibold text-foreground">{coin.symbol}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{coin.name}</p>
                        <p className="mt-2 font-mono text-[11px] text-muted-foreground">
                          {shortAddress(coin.address)}
                        </p>
                        <p className="mt-2 text-[11px] text-muted-foreground">
                          {coin.official_source ? copy.verified[locale] : copy.mainnet[locale]}
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
                        <p className="text-sm font-semibold text-foreground">
                          {copy.manualDistribution[locale]}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {form.stablecoin_distribution_mode === "manual_percent"
                            ? copy.manualPercentHint[locale]
                            : copy.manualWethHint[locale]}
                        </p>
                      </div>
                      <Button type="button" variant="outline" onClick={distributeEqually}>
                        <RefreshCw className="h-4 w-4" />
                        {copy.autoDistribute[locale]}
                      </Button>
                    </div>

                    <div className="space-y-3">
                      {selectedStablecoins.map((coin) => {
                        const allocation = form.stablecoin_allocations.find(
                          (item) => item.token_address.toLowerCase() === coin.address.toLowerCase(),
                        );
                        if (!allocation) return null;
                        return (
                          <div
                            key={coin.address}
                            className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_180px] sm:items-center"
                          >
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
                          {form.stablecoin_distribution_mode === "equal"
                            ? copy.equalPreview[locale]
                            : copy.contractPreview[locale]}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {copy.previewDescription[locale]}
                        </p>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {locale === "en"
                          ? `${distributionPreviewRows.length} ${copy.coins[locale]}`
                          : `${distributionPreviewRows.length} ${copy.coins[locale]}`}
                      </p>
                    </div>

                    <div className="space-y-3">
                      {distributionPreviewRows.map((allocation) => (
                        <div
                          key={allocation.token_address}
                          className="grid gap-2 rounded-xl border border-border/70 bg-background/70 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_140px_110px] sm:items-center"
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-foreground">{allocation.token_symbol}</p>
                            <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                              {shortAddress(allocation.token_address)}
                            </p>
                          </div>
                          <div>
                            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                              {copy.wethPerContract[locale]}
                            </p>
                            <p className="mt-1 text-sm font-semibold text-foreground">
                              {formatAmount(allocation.weth_amount_per_contract, locale)} WETH
                            </p>
                          </div>
                          <div>
                            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                              {copy.share[locale]}
                            </p>
                            <p className="mt-1 text-sm font-semibold text-foreground">
                              {formatAmount(allocation.percent, locale)}%
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
                {copy.noSwap[locale]}
              </div>
            )}
          </SectionCard>

          <SectionCard title={copy.swapProtection[locale]} description={copy.swapProtectionDescription[locale]}>
            {hasStablecoinSwap ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <label htmlFor="slippage-percent" className="text-sm font-medium text-foreground">
                    {copy.slippageTolerance[locale]}
                  </label>
                  <Input
                    id="slippage-percent"
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    value={form.slippage_percent}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, slippage_percent: event.target.value }))
                    }
                  />
                  <p className="text-xs text-muted-foreground">{copy.slippageHint[locale]}</p>
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">{copy.uniswapFeeTier[locale]}</p>
                  <div className="flex flex-wrap gap-2">
                    {options?.fee_tiers.map((option) => (
                      <Button
                        key={`${option.value}`}
                        type="button"
                        variant={form.fee_tier === option.value ? "default" : "outline"}
                        onClick={() => setForm((current) => ({ ...current, fee_tier: option.value }))}
                      >
                        {formatFeeTier(option.value, locale)}
                      </Button>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">{copy.feeTierHint[locale]}</p>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">
                {copy.swapProtectionInactive[locale]}
              </div>
            )}
          </SectionCard>

          <SectionCard title={copy.directFunding[locale]} description={copy.directFundingDescription[locale]}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label htmlFor="direct-eth" className="text-sm font-medium text-foreground">
                  {copy.directEth[locale]}
                </label>
                <Input
                  id="direct-eth"
                  type="number"
                  min="0"
                  step="0.0001"
                  value={form.direct_contract_eth_per_contract}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      direct_contract_eth_per_contract: event.target.value,
                    }))
                  }
                />
                <p className="text-xs text-muted-foreground">{copy.directEthHint[locale]}</p>
              </div>

              <div className="space-y-2">
                <label htmlFor="direct-weth" className="text-sm font-medium text-foreground">
                  {copy.directWeth[locale]}
                </label>
                <Input
                  id="direct-weth"
                  type="number"
                  min="0"
                  step="0.0001"
                  value={form.direct_contract_weth_per_contract}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      direct_contract_weth_per_contract: event.target.value,
                    }))
                  }
                />
                <p className="text-xs text-muted-foreground">{copy.directWethHint[locale]}</p>
              </div>
            </div>
          </SectionCard>

          <SectionCard title={copy.review[locale]} description={copy.reviewDescription[locale]}>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
              <div className="rounded-xl border border-border/70 bg-background/70 px-4 py-3">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  {copy.gasReserve[locale]}
                </p>
                <p className="mt-1 text-sm font-semibold text-foreground">
                  {formatAmount(form.gas_reserve_eth_per_contract, locale)} ETH
                </p>
              </div>
              <div className="rounded-xl border border-border/70 bg-background/70 px-4 py-3">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  {copy.swapBudget[locale]}
                </p>
                <p className="mt-1 text-sm font-semibold text-foreground">
                  {formatAmount(form.swap_budget_eth_per_contract, locale)} ETH
                </p>
              </div>
              <div className="rounded-xl border border-border/70 bg-background/70 px-4 py-3">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  {copy.directEthShort[locale]}
                </p>
                <p className="mt-1 text-sm font-semibold text-foreground">
                  {formatAmount(form.direct_contract_eth_per_contract, locale)} ETH
                </p>
              </div>
              <div className="rounded-xl border border-border/70 bg-background/70 px-4 py-3">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  {copy.directWethShort[locale]}
                </p>
                <p className="mt-1 text-sm font-semibold text-foreground">
                  {formatAmount(form.direct_contract_weth_per_contract, locale)} WETH
                </p>
              </div>
              <div className="rounded-xl border border-border/70 bg-background/70 px-4 py-3">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  {copy.slippage[locale]}
                </p>
                <p className="mt-1 text-sm font-semibold text-foreground">
                  {formatAmount(form.slippage_percent, locale)}%
                </p>
              </div>
              <div className="rounded-xl border border-accent/40 bg-accent/10 px-4 py-3">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  {copy.ethOnly[locale]}
                </p>
                <p className="mt-1 text-sm font-semibold text-foreground">
                  {formatAmount(totalEthIfNoWeth, locale)} ETH
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-border/70 bg-background/70 px-4 py-3 text-sm text-muted-foreground">
              {needsWeth ? copy.needsWeth[locale] : copy.noWethNeeded[locale]}
            </div>

            <div className="rounded-xl border border-border/70 bg-background/70 px-4 py-3 text-sm text-muted-foreground">
              {copy.feeTier[locale]}: {formatFeeTier(form.fee_tier, locale)}
            </div>

            <div className="rounded-xl border border-border/70 bg-background/70 px-4 py-3 text-sm text-muted-foreground">
              {copy.recipient[locale]}: {form.recipient_address || copy.notSet[locale]}
            </div>

            <div className="rounded-xl border border-border/70 bg-secondary/10 px-4 py-3 text-sm text-muted-foreground">
              {copy.reviewHint[locale]}
            </div>
          </SectionCard>

          {saveError ? <p className="text-sm text-destructive">{saveError}</p> : null}

          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {copy.cancel[locale]}
            </Button>
            <Button type="submit" disabled={saving || !options}>
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {copy.saving[locale]}
                </>
              ) : template ? (
                copy.saveChanges[locale]
              ) : (
                copy.saveTemplate[locale]
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
