"use client";

import { MouseEvent, useEffect, useMemo, useState } from "react";
import { Layers3, Pencil, PlusCircle, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { TemplateEditor } from "@/components/dashboard/template-editor";
import { TemplateMarketCheckPanel } from "@/components/dashboard/template-market-check";
import {
  TEMPLATE_API_URL,
  Template,
  TemplateOptions,
  formatAmount,
  formatFeeTier,
  getStablecoinDistributionRows,
} from "@/lib/template";


function SummaryPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-background/60 px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-semibold text-foreground">{value}</p>
    </div>
  );
}

export function TemplateLibraryStarter() {
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

        if (!templateResponse.ok) throw new Error(templatePayload.detail ?? "Failed to load templates");
        if (!optionsResponse.ok) throw new Error(optionsPayload.detail ?? "Failed to load template options");

        if (active) {
          setTemplates(Array.isArray(templatePayload.templates) ? templatePayload.templates : []);
          setOptions(optionsPayload);
          setError(null);
        }
      } catch (loadError) {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : "Failed to load templates");
        }
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, []);

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
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.detail ?? "Failed to delete template");

      setTemplates((current) => current.filter((item) => item.id !== template.id));
      toast({
        title: "Template deleted",
        description: "The template was hidden from the active library.",
      });
    } catch (deleteError) {
      toast({
        title: "Delete failed",
        description: deleteError instanceof Error ? deleteError.message : "Failed to delete template",
        variant: "destructive",
      });
    }
  };

  const upsertTemplate = (template: Template) => {
    setTemplates((current) => [template, ...current.filter((item) => item.id !== template.id)]);
  };

  return (
    <>
      <div className="w-full animate-in slide-in-from-bottom-4 fade-in rounded-xl border border-border bg-card p-5 duration-500 delay-300">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-foreground">Template Library</h3>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Build one-contract templates first. Later, the wallet flow multiplies them by the contract count.
            </p>
          </div>

          <Button type="button" onClick={openCreate}>
            <PlusCircle className="h-4 w-4" />
            Create
          </Button>
        </div>

        <div className="mb-4 rounded-2xl border border-border/70 bg-secondary/20 p-4">
          <div className="flex items-start gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-accent/10 text-accent">
              <Layers3 className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">One template equals one contract / one subwallet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Define the ETH-first funding plan here: gas reserve, direct ETH, optional local-WETH distributor funding, and stablecoin swap budgets. A main wallet is not needed yet.
              </p>
            </div>
          </div>
        </div>

        {error ? <p className="mb-4 text-sm text-destructive">{error}</p> : null}

        {loading ? (
          <div className="rounded-2xl border border-border/70 bg-secondary/20 p-4 text-sm text-muted-foreground">
            Loading templates...
          </div>
        ) : visibleTemplates.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-secondary/20 p-6 text-center text-sm text-muted-foreground">
            No templates saved yet. Create one now and reuse it later when a main wallet is selected.
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-foreground">Saved templates</p>
              <p className="text-xs text-muted-foreground">{templates.length} total</p>
            </div>

            {visibleTemplates.map((template) => (
              <div key={template.id} className="rounded-2xl border border-border/70 bg-background/70 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">{template.name}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {template.stablecoin_distribution_mode === "none"
                        ? "No stablecoin swap configured"
                        : `${template.stablecoin_allocations.length} stablecoin route${template.stablecoin_allocations.length === 1 ? "" : "s"}`}
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
                      TEST JSON
                    </Button>
                    <Button type="button" size="icon-sm" variant="outline" onClick={(event) => handleDelete(event, template)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                  <SummaryPill label="Gas reserve" value={`${formatAmount(template.gas_reserve_eth_per_contract)} ETH`} />
                  <SummaryPill label="Swap budget" value={`${formatAmount(template.swap_budget_eth_per_contract)} ETH`} />
                  <SummaryPill label="Sub-wallet ETH" value={`${formatAmount(template.direct_contract_eth_per_contract)} ETH`} />
                  <SummaryPill label="Contract ETH" value={`${formatAmount(template.direct_contract_native_eth_per_contract)} ETH`} />
                  <SummaryPill label="Contract WETH" value={`${formatAmount(template.direct_contract_weth_per_contract)} WETH`} />
                </div>

                <p className="mt-3 text-xs text-muted-foreground">
                  {`${formatAmount(template.slippage_percent)}% slippage · ${formatFeeTier(template.fee_tier)}`}
                </p>

                {template.stablecoin_allocations.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {getStablecoinDistributionRows(template).map((allocation) => (
                      <div key={allocation.token_address} className="rounded-xl border border-border/60 bg-secondary/10 px-3 py-2 text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">{allocation.token_symbol}</span>
                        {` ${formatAmount(allocation.weth_amount_per_contract)} WETH · ${formatAmount(allocation.percent)}%`}
                      </div>
                    ))}
                  </div>
                ) : null}

                <TemplateMarketCheckPanel template={template} />
              </div>
            ))}

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
