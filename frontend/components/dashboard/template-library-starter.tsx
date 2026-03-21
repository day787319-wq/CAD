"use client";

import { MouseEvent, useEffect, useMemo, useState } from "react";
import { BarChart3, Layers3, Pencil, PlusCircle, Trash2 } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { TemplateEditor } from "@/components/dashboard/template-editor";
import {
  TEMPLATE_API_URL,
  Template,
  TemplateOptions,
  formatAmount,
  formatFeeTier,
  getStablecoinDistributionRows,
} from "@/lib/template";

const copy = {
  title: {
    en: "Template Library",
    zn: "模板库",
    vn: "Thu vien mau",
  },
  subtitle: {
    en: "Build one-contract templates first. Later, the wallet flow multiplies them by the contract count.",
    zn: "先构建单合约模板，之后钱包流程会按合约数量进行扩展。",
    vn: "Tao mau mot hop dong truoc. Sau do luong wallet se nhan len theo so luong hop dong.",
  },
  create: {
    en: "Create",
    zn: "创建",
    vn: "Tao moi",
  },
  oneTemplateTitle: {
    en: "One template equals one contract / one subwallet",
    zn: "一个模板等于一个合约 / 一个子钱包",
    vn: "Mot template tuong ung mot hop dong / mot sub-wallet",
  },
  oneTemplateDescription: {
    en: "Define the ETH-first funding plan here: gas reserve, direct ETH, optional local-WETH distributor funding, and stablecoin swap budgets. A main wallet is not needed yet.",
    zn: "在这里定义以 ETH 为先的资金方案：gas 预留、直接 ETH、可选的本地 WETH 分发资金，以及稳定币交换预算。此时还不需要主钱包。",
    vn: "Dinh nghia ke hoach cap von uu tien ETH tai day: du phong gas, ETH truc tiep, cap WETH noi bo tuy chon cho distributor, va ngan sach swap stablecoin. Chua can wallet chinh o buoc nay.",
  },
  loading: {
    en: "Loading templates...",
    zn: "正在加载模板...",
    vn: "Dang tai template...",
  },
  empty: {
    en: "No templates saved yet. Create one now and reuse it later when a main wallet is selected.",
    zn: "还没有保存的模板。现在创建一个，之后选择主钱包时即可复用。",
    vn: "Chua co template nao duoc luu. Tao mot template bay gio de dung lai khi chon wallet chinh.",
  },
  savedTemplates: {
    en: "Saved templates",
    zn: "已保存模板",
    vn: "Template da luu",
  },
  totalSuffix: {
    en: "total",
    zn: "个",
    vn: "tong",
  },
  noSwap: {
    en: "No stablecoin swap configured",
    zn: "未配置稳定币交换",
    vn: "Chua cau hinh swap stablecoin",
  },
  liveCheck: {
    en: "Live check",
    zn: "实时检查",
    vn: "Kiem tra truc tiep",
  },
  testJson: {
    en: "TEST JSON",
    zn: "测试 JSON",
    vn: "TEST JSON",
  },
  gasReserve: {
    en: "Gas reserve",
    zn: "Gas 预留",
    vn: "Du phong gas",
  },
  swapBudget: {
    en: "Swap budget",
    zn: "交换预算",
    vn: "Ngan sach swap",
  },
  directEth: {
    en: "Direct ETH",
    zn: "直接 ETH",
    vn: "ETH truc tiep",
  },
  directWeth: {
    en: "Direct WETH",
    zn: "直接 WETH",
    vn: "WETH truc tiep",
  },
  sidebarHint: {
    en: "Open the Live Market Check item in the sidebar to inspect this template with live pricing.",
    zn: "打开侧边栏中的实时市场检查来查看该模板的实时定价。",
    vn: "Mo muc Live Market Check trong sidebar de xem template nay voi gia truc tiep.",
  },
  templateDeleted: {
    en: "Template deleted",
    zn: "模板已删除",
    vn: "Da xoa template",
  },
  templateDeletedDescription: {
    en: "The template was hidden from the active library.",
    zn: "该模板已从当前库中隐藏。",
    vn: "Template da duoc an khoi thu vien dang hoat dong.",
  },
  deleteFailed: {
    en: "Delete failed",
    zn: "删除失败",
    vn: "Xoa that bai",
  },
} as const;

function getTemplateRouteSummary(template: Template, locale: "en" | "zn" | "vn") {
  if (template.stablecoin_distribution_mode === "none") {
    return copy.noSwap[locale];
  }

  const routeCount = template.stablecoin_allocations.length;
  if (locale === "zn") {
    return `${routeCount} 条稳定币路径`;
  }
  if (locale === "vn") {
    return `${routeCount} tuyen stablecoin`;
  }
  return `${routeCount} stablecoin route${routeCount === 1 ? "" : "s"}`;
}

function SummaryPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-background/60 px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-semibold text-foreground">{value}</p>
    </div>
  );
}

export function TemplateLibraryStarter({
  selectedTemplateId,
  onSelectedTemplateChange,
  onOpenLiveCheck,
}: {
  selectedTemplateId: string | null;
  onSelectedTemplateChange: (templateId: string | null) => void;
  onOpenLiveCheck: (templateId: string) => void;
}) {
  const { locale } = useI18n();
  const { toast } = useToast();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [options, setOptions] = useState<TemplateOptions | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        const [templateResponse, optionsResponse] = await Promise.all([
          fetch(`${TEMPLATE_API_URL}/api/templates`),
          fetch(`${TEMPLATE_API_URL}/api/templates/options`),
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
  }, [locale]);

  const visibleTemplates = useMemo(() => templates.slice(0, 4), [templates]);
  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === selectedTemplateId) ?? templates[0] ?? null,
    [selectedTemplateId, templates],
  );

  useEffect(() => {
    if (templates.length === 0) {
      if (selectedTemplateId !== null) onSelectedTemplateChange(null);
      return;
    }

    if (!selectedTemplateId || !templates.some((template) => template.id === selectedTemplateId)) {
      onSelectedTemplateChange(templates[0].id);
    }
  }, [onSelectedTemplateChange, selectedTemplateId, templates]);

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
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.detail ?? copy.deleteFailed[locale]);

      const nextTemplates = templates.filter((item) => item.id !== template.id);
      setTemplates(nextTemplates);
      if (selectedTemplateId === template.id) {
        onSelectedTemplateChange(nextTemplates[0]?.id ?? null);
      }
      toast({
        title: copy.templateDeleted[locale],
        description: copy.templateDeletedDescription[locale],
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
    onSelectedTemplateChange(template.id);
  };

  return (
    <>
      <div className="w-full animate-in slide-in-from-bottom-4 fade-in rounded-xl border border-border bg-card p-5 duration-500 delay-300">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-foreground">{copy.title[locale]}</h3>
            <p className="mt-0.5 text-sm text-muted-foreground">{copy.subtitle[locale]}</p>
          </div>

          <Button type="button" onClick={openCreate}>
            <PlusCircle className="h-4 w-4" />
            {copy.create[locale]}
          </Button>
        </div>

        <div className="mb-4 rounded-2xl border border-border/70 bg-secondary/20 p-4">
          <div className="flex items-start gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-accent/10 text-accent">
              <Layers3 className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">{copy.oneTemplateTitle[locale]}</p>
              <p className="mt-1 text-sm text-muted-foreground">{copy.oneTemplateDescription[locale]}</p>
            </div>
          </div>
        </div>

        {error ? <p className="mb-4 text-sm text-destructive">{error}</p> : null}

        {loading ? (
          <div className="rounded-2xl border border-border/70 bg-secondary/20 p-4 text-sm text-muted-foreground">
            {copy.loading[locale]}
          </div>
        ) : visibleTemplates.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-secondary/20 p-6 text-center text-sm text-muted-foreground">
            {copy.empty[locale]}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-foreground">{copy.savedTemplates[locale]}</p>
              <p className="text-xs text-muted-foreground">{`${templates.length} ${copy.totalSuffix[locale]}`}</p>
            </div>

            {visibleTemplates.map((template) => {
              const isSelected = template.id === selectedTemplate?.id;
              return (
                <div
                  key={template.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => onSelectedTemplateChange(template.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onSelectedTemplateChange(template.id);
                    }
                  }}
                  className={`rounded-2xl border bg-background/70 p-4 transition-colors ${
                    isSelected ? "border-accent/60 bg-accent/5" : "border-border/70"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground">{template.name}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {getTemplateRouteSummary(template, locale)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant={isSelected ? "default" : "outline"}
                        className="h-8 px-2.5 text-[11px] font-semibold tracking-wide"
                        onClick={(event) => {
                          event.stopPropagation();
                          onOpenLiveCheck(template.id);
                        }}
                      >
                        <BarChart3 className="h-3.5 w-3.5" />
                        {copy.liveCheck[locale]}
                      </Button>
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
                    <SummaryPill label={copy.gasReserve[locale]} value={`${formatAmount(template.gas_reserve_eth_per_contract, locale)} ETH`} />
                    <SummaryPill label={copy.swapBudget[locale]} value={`${formatAmount(template.swap_budget_eth_per_contract, locale)} ETH`} />
                    <SummaryPill label={copy.directEth[locale]} value={`${formatAmount(template.direct_contract_eth_per_contract, locale)} ETH`} />
                    <SummaryPill label={copy.directWeth[locale]} value={`${formatAmount(template.direct_contract_weth_per_contract, locale)} WETH`} />
                  </div>

                  <p className="mt-3 text-xs text-muted-foreground">
                    {`${formatAmount(template.slippage_percent, locale)}% · ${formatFeeTier(template.fee_tier, locale)}`}
                  </p>

                  {template.stablecoin_allocations.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {getStablecoinDistributionRows(template).map((allocation) => (
                        <div key={allocation.token_address} className="rounded-xl border border-border/60 bg-secondary/10 px-3 py-2 text-xs text-muted-foreground">
                          <span className="font-medium text-foreground">{allocation.token_symbol}</span>
                          {` ${formatAmount(allocation.weth_amount_per_contract, locale)} WETH · ${formatAmount(allocation.percent, locale)}%`}
                        </div>
                      ))}
                    </div>
                  ) : null}

                  <p className="mt-3 text-xs text-muted-foreground">
                    {copy.sidebarHint[locale]}
                  </p>
                </div>
              );
            })}

            {templates.length > visibleTemplates.length ? (
              <p className="text-xs text-muted-foreground">
                More templates are available once you open the wallet flow and pick from the full library.
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
