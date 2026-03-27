"use client";

import { MouseEvent, useEffect, useMemo, useState } from "react";
import { Fuel, Pencil, PlusCircle, Trash2 } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n-provider";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { readApiPayload } from "@/lib/api";
import { TemplateEditor } from "@/components/dashboard/template-editor";
import { TemplateMarketCheckPanel } from "@/components/dashboard/template-market-check";
import {
  TEMPLATE_API_URL,
  Template,
  TemplateOptions,
  formatAmount,
  formatFeeTier,
  getTemplateChainMeta,
  getStablecoinDistributionRows,
  normalizeTemplateChain,
} from "@/lib/template";

const copy = {
  title: { en: "Template Library", zn: "模板库", vn: "Thư viện mẫu" },
  subtitle: {
    en: "Build one-contract templates first. Later, the wallet flow multiplies them by the contract count.",
    zn: "先构建单合约模板，后续钱包流程会按合约数量进行放大。",
    vn: "Tạo mẫu cho một hợp đồng trước. Sau đó luồng ví sẽ nhân theo số lượng hợp đồng.",
  },
  create: { en: "Create", zn: "创建", vn: "Tạo mới" },
  introTitle: {
    en: "One template equals one contract / one subwallet",
    zn: "一个模板对应一个合约 / 一个子钱包",
    vn: "Một mẫu tương ứng một hợp đồng / một ví con",
  },
  introBody: {
    en: "Define the native-first funding plan here: gas reserve, direct contract funding, direct main-wallet wrapped-native treasury funding, and token swap budgets. A main wallet is not needed yet.",
    zn: "在这里定义以原生代币为核心的资金计划：Gas 预留、直接合约注资、由主钱包提供的包装原生代币资金库注资以及代币兑换预算。此阶段还不需要主钱包。",
    vn: "Xác định kế hoạch cấp vốn ưu tiên tài sản gốc tại đây: dự trữ gas, cấp vốn trực tiếp cho hợp đồng, cấp wrapped-native trực tiếp từ ví chính cho treasury và ngân sách hoán đổi token. Chưa cần ví chính ở bước này.",
  },
  loading: { en: "Loading templates...", zn: "正在加载模板...", vn: "Đang tải mẫu..." },
  empty: {
    en: "No templates saved yet. Create one now and reuse it later when a main wallet is selected.",
    zn: "还没有已保存模板。现在创建一个，之后选择主钱包时即可复用。",
    vn: "Chưa có mẫu nào được lưu. Hãy tạo một mẫu ngay và tái sử dụng khi chọn ví chính sau này.",
  },
  saved: { en: "Saved templates", zn: "已保存模板", vn: "Mẫu đã lưu" },
  total: { en: "{count} total", zn: "共 {count} 个", vn: "Tổng {count}" },
  noSwap: {
    en: "No stablecoin swap configured",
    zn: "未配置稳定币兑换",
    vn: "Chưa cấu hình hoán đổi stablecoin",
  },
  stableRoutes: {
    en: "{count} stablecoin route{suffix}",
    zn: "{count} 条稳定币路由",
    vn: "{count} tuyến stablecoin{suffix}",
  },
  more: {
    en: "More templates are available once you open the wallet flow and pick from the full library.",
    zn: "打开钱包流程并进入完整模板库后，可查看更多模板。",
    vn: "Sẽ có thêm mẫu khi bạn mở luồng ví và chọn từ toàn bộ thư viện.",
  },
  gasReserve: { en: "Gas reserve", zn: "Gas 预留", vn: "Dự trữ gas" },
  swapBudget: { en: "Swap budget", zn: "兑换预算", vn: "Ngân sách swap" },
  contractEth: { en: "Contract ETH", zn: "合约 ETH", vn: "ETH hợp đồng" },
  contractWeth: { en: "Contract WETH", zn: "合约 WETH", vn: "WETH hợp đồng" },
  testJson: { en: "TEST JSON", zn: "测试 JSON", vn: "JSON KIỂM THỬ" },
  deletedTitle: { en: "Template deleted", zn: "模板已删除", vn: "Đã xóa mẫu" },
  deletedDescription: {
    en: "The template was hidden from the active library.",
    zn: "该模板已从活动模板库中移除。",
    vn: "Mẫu đã được gỡ khỏi thư viện đang hoạt động.",
  },
  deleteFailed: { en: "Delete failed", zn: "删除失败", vn: "Xóa thất bại" },
} as const;

function SummaryPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/70 bg-background/70 px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-semibold text-foreground">{value}</p>
    </div>
  );
}

export function TemplateLibraryStarter() {
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const { locale, interpolate } = useI18n();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [options, setOptions] = useState<TemplateOptions | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const preferredChain = normalizeTemplateChain(searchParams.get("chain"));

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        const optionsQuery = preferredChain ? `?chain=${encodeURIComponent(preferredChain)}` : "";
        const [templateResponse, optionsResponse] = await Promise.all([
          fetch(`${TEMPLATE_API_URL}/api/templates`),
          fetch(`${TEMPLATE_API_URL}/api/templates/options${optionsQuery}`),
        ]);
        const [templatePayload, optionsPayload] = await Promise.all([
          templateResponse.json(),
          optionsResponse.json(),
        ]);

        if (!templateResponse.ok) throw new Error(templatePayload.detail ?? copy.loading[locale]);
        if (!optionsResponse.ok) throw new Error(optionsPayload.detail ?? copy.loading[locale]);

        if (active) {
          setTemplates(Array.isArray(templatePayload.templates) ? templatePayload.templates : []);
          setOptions(optionsPayload);
          setError(null);
        }
      } catch (loadError) {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : copy.loading[locale]);
        }
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [locale, preferredChain]);

  const visibleTemplates = useMemo(() => templates.slice(0, 4), [templates]);

  const openCreate = () => {
    setEditingTemplate(null);
    setEditorOpen(true);
  };

  const openEdit = (event: MouseEvent<HTMLButtonElement>, template: Template) => {
    event.stopPropagation();
    setEditingTemplate(template);
    setEditorOpen(true);
  };

  const logTemplateJson = (event: MouseEvent<HTMLButtonElement>, template: Template) => {
    event.stopPropagation();
    console.log("[TEST TEMPLATE JSON]", JSON.stringify(template, null, 2));
  };

  const handleDelete = async (event: MouseEvent<HTMLButtonElement>, template: Template) => {
    event.stopPropagation();

    try {
      const response = await fetch(`${TEMPLATE_API_URL}/api/templates/${template.id}`, {
        method: "DELETE",
      });
      const payload = await readApiPayload(response);
      if (!response.ok) throw new Error((payload as { detail?: string } | null)?.detail ?? "Failed to delete template");

      setTemplates((current) => current.filter((item) => item.id !== template.id));
      toast({
        title: copy.deletedTitle[locale],
        description: copy.deletedDescription[locale],
      });
    } catch (deleteError) {
      toast({
        title: copy.deleteFailed[locale],
        description: deleteError instanceof Error ? deleteError.message : copy.deleteFailed[locale],
        variant: "destructive",
      });
    }
  };

  const upsertTemplate = (template: Template) => {
    setTemplates((current) => [template, ...current.filter((item) => item.id !== template.id)]);
  };

  return (
    <>
      <div className="cad-panel w-full animate-in slide-in-from-bottom-4 fade-in p-5 duration-500 delay-300">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h3 className="text-[16px] font-semibold text-foreground">{copy.title[locale]}</h3>
            <p className="mt-1 text-[13px] text-muted-foreground">{copy.subtitle[locale]}</p>
          </div>

          <Button type="button" onClick={openCreate}>
            <PlusCircle className="h-4 w-4" />
            {copy.create[locale]}
          </Button>
        </div>

        <div className="mb-4 rounded-xl border border-border/70 bg-secondary/35 p-4">
          <div className="flex items-start gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 via-orange-500 to-rose-500 text-white shadow-[0_14px_30px_-18px_rgba(249,115,22,0.7)]">
              <Fuel className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">{copy.introTitle[locale]}</p>
              <p className="mt-1 text-[13px] text-muted-foreground">{copy.introBody[locale]}</p>
            </div>
          </div>
        </div>

        {error ? <p className="mb-4 text-sm text-destructive">{error}</p> : null}

        {loading ? (
          <div className="rounded-xl border border-border/70 bg-secondary/20 p-4 text-sm text-muted-foreground">
            {copy.loading[locale]}
          </div>
        ) : visibleTemplates.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-secondary/20 p-6 text-center text-sm text-muted-foreground">
            {copy.empty[locale]}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-foreground">{copy.saved[locale]}</p>
              <p className="text-xs text-muted-foreground">
                {interpolate(copy.total[locale], { count: templates.length })}
              </p>
            </div>

            {visibleTemplates.map((template) => {
              const chainMeta = getTemplateChainMeta(template.chain);
              return (
                <div key={template.id} className="rounded-xl border border-border/70 bg-background/75 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">{template.name}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {template.stablecoin_distribution_mode === "none"
                        ? copy.noSwap[locale]
                        : interpolate(copy.stableRoutes[locale], {
                            count: template.stablecoin_allocations.length,
                            suffix: template.stablecoin_allocations.length === 1 ? "" : "s",
                          })}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button type="button" size="icon-sm" variant="outline" onClick={(event) => openEdit(event, template)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8 px-2.5 text-[11px] font-semibold tracking-wide"
                      onClick={(event) => logTemplateJson(event, template)}
                    >
                      {copy.testJson[locale]}
                    </Button>
                    <Button type="button" size="icon-sm" variant="outline" onClick={(event) => handleDelete(event, template)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                  <SummaryPill label={copy.gasReserve[locale]} value={`${formatAmount(template.gas_reserve_eth_per_contract)} ${chainMeta.nativeSymbol}`} />
                  <SummaryPill label={copy.swapBudget[locale]} value={`${formatAmount(template.swap_budget_eth_per_contract)} ${chainMeta.wrappedNativeSymbol}`} />
                  <SummaryPill label={`Contract ${chainMeta.nativeSymbol}`} value={`${formatAmount(template.direct_contract_native_eth_per_contract)} ${chainMeta.nativeSymbol}`} />
                  <SummaryPill label={`Contract ${chainMeta.wrappedNativeSymbol}`} value={`${formatAmount(template.direct_contract_weth_per_contract)} ${chainMeta.wrappedNativeSymbol}`} />
                </div>

                <p className="mt-3 text-xs text-muted-foreground">
                  {`${formatAmount(template.slippage_percent)}% slippage · ${formatFeeTier(template.fee_tier, template.chain)}`}
                </p>

                {template.stablecoin_allocations.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {getStablecoinDistributionRows(template).map((allocation) => (
                      <div key={allocation.token_address} className="rounded-xl border border-border/60 bg-secondary/10 px-3 py-2 text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">{allocation.token_symbol}</span>
                        {` ${formatAmount(allocation.weth_amount_per_contract)} ${chainMeta.wrappedNativeSymbol} · ${formatAmount(allocation.percent)}%`}
                      </div>
                    ))}
                  </div>
                ) : null}

                <TemplateMarketCheckPanel template={template} />
                </div>
              );
            })}

            {templates.length > visibleTemplates.length ? (
              <p className="text-xs text-muted-foreground">
                {copy.more[locale]}
              </p>
            ) : null}
          </div>
        )}
      </div>

      <TemplateEditor
        open={editorOpen}
        onOpenChange={setEditorOpen}
        options={options}
        template={editingTemplate}
        onSaved={upsertTemplate}
      />
    </>
  );
}
