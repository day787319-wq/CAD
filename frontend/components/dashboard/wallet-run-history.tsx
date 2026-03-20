"use client";

import { MouseEvent, useEffect, useState } from "react";
import { AlertTriangle, Copy, Download, Loader2, WalletCards } from "lucide-react";
import { useRouter } from "next/navigation";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { API_URL } from "@/lib/api";

type FundingTransaction = {
  tx_hash?: string;
  status?: string;
  amount?: string | null;
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
  funding_transactions?: {
    eth?: FundingTransaction;
    weth?: FundingTransaction;
  };
  private_key_access?: {
    wallet_id?: string;
    export_supported?: boolean;
    reveal_supported?: boolean;
  };
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
  };
  funding_fee_estimate?: {
    fee_eth?: string | null;
    gas_units?: number | null;
  };
  wrap_transaction?: {
    tx_hash?: string;
    status?: string;
    eth_wrapped?: string | null;
  } | null;
  contract_execution?: {
    status?: string;
    message?: string;
  };
  sub_wallets?: RunSubWallet[];
};

function shortValue(value: string | null | undefined, head = 6, tail = 4) {
  if (!value) return "Unavailable";
  if (value.length <= head + tail + 3) return value;
  return `${value.slice(0, head)}...${value.slice(-tail)}`;
}

function formatAmount(value: string | null | undefined, symbol: string) {
  if (!value || value === "0") return `0 ${symbol}`;
  return `${value} ${symbol}`;
}

function formatTimestamp(value: string | null | undefined) {
  if (!value) return "Unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function statusTone(status: string | null | undefined) {
  switch ((status || "").toLowerCase()) {
    case "submitted":
      return "border-blue-500/30 bg-blue-500/10 text-blue-700";
    case "partial":
      return "border-amber-500/30 bg-amber-500/10 text-amber-800";
    case "failed":
      return "border-destructive/40 bg-destructive/5 text-destructive";
    case "created":
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700";
    default:
      return "border-border/70 bg-secondary/20 text-foreground";
  }
}

export function WalletRunHistory({
  mainWalletId,
  refreshKey = 0,
  title = "Run history",
  description = "Every run creates a fresh batch of wallets. Open a batch to inspect its subwallets and export encrypted keystores when needed.",
  emptyMessage = "No runs yet. Execute one from a main wallet and it will appear here.",
}: {
  mainWalletId?: string;
  refreshKey?: number;
  title?: string;
  description?: string;
  emptyMessage?: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [runs, setRuns] = useState<WalletRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exportTarget, setExportTarget] = useState<RunSubWallet | null>(null);
  const [accessPassphrase, setAccessPassphrase] = useState("");
  const [exportPassphrase, setExportPassphrase] = useState("");
  const [confirmExportPassphrase, setConfirmExportPassphrase] = useState("");
  const [exportingWalletId, setExportingWalletId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const loadRuns = async () => {
      setLoading(true);
      try {
        const params = mainWalletId ? `?main_wallet_id=${encodeURIComponent(mainWalletId)}` : "";
        const response = await fetch(`${API_URL}/api/wallets/runs${params}`);
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload.detail ?? "Failed to load run history");
        }
        if (active) {
          setRuns(Array.isArray(payload.runs) ? payload.runs : []);
          setError(null);
        }
      } catch (loadError) {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : "Failed to load run history");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    loadRuns();
    return () => {
      active = false;
    };
  }, [mainWalletId, refreshKey]);

  const handleCopy = async (event: MouseEvent<HTMLButtonElement>, value: string | undefined, label: string) => {
    event.stopPropagation();
    if (!value || !navigator.clipboard) return;
    await navigator.clipboard.writeText(value);
    toast({ title: `${label} copied`, description: value });
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
        title: "Export password too short",
        description: "Use at least 12 characters for the keystore export password.",
        variant: "destructive",
      });
      return;
    }
    if (exportPassphrase !== confirmExportPassphrase) {
      toast({
        title: "Passwords do not match",
        description: "Re-enter the export password so the keystore can be decrypted later.",
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
        throw new Error(payload.detail ?? "Failed to export keystore");
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
        title: "Keystore exported",
        description: "Downloaded an encrypted keystore JSON. The raw private key was not exposed to the browser.",
      });
      setExportTarget(null);
      setAccessPassphrase("");
      setExportPassphrase("");
      setConfirmExportPassphrase("");
    } catch (exportError) {
      toast({
        title: "Keystore export failed",
        description: exportError instanceof Error ? exportError.message : "Failed to export keystore",
        variant: "destructive",
      });
    } finally {
      setExportingWalletId(null);
    }
  };

  return (
    <div className="rounded-2xl border border-border/70 bg-background/70 p-5">
      <div className="mb-4">
        <p className="text-base font-semibold text-foreground">{title}</p>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-border/70 bg-secondary/20 p-6 text-sm text-muted-foreground">Loading run history...</div>
      ) : error ? (
        <div className="rounded-2xl border border-destructive/40 bg-destructive/5 p-6 text-sm text-destructive">{error}</div>
      ) : runs.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-6 text-sm text-muted-foreground">{emptyMessage}</div>
      ) : (
        <Accordion type="single" collapsible className="rounded-2xl border border-border/70 bg-secondary/10 px-4">
          {runs.map((run) => (
            <AccordionItem key={run.id} value={run.id} className="border-border/60">
              <AccordionTrigger className="py-5 hover:no-underline">
                <div className="flex min-w-0 flex-1 flex-col gap-3 text-left">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${statusTone(run.status)}`}>
                      {run.status}
                    </span>
                    <span className="text-sm font-semibold text-foreground">{run.template_name}</span>
                    <span className="text-xs text-muted-foreground">{formatTimestamp(run.created_at)}</span>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <div className="rounded-xl border border-border/70 bg-background/80 px-3 py-2">
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Main wallet</p>
                      <p className="mt-1 break-all font-mono text-xs text-foreground">{shortValue(run.main_wallet_address, 10, 6)}</p>
                    </div>
                    <div className="rounded-xl border border-border/70 bg-background/80 px-3 py-2">
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Wallet count</p>
                      <p className="mt-1 text-sm font-semibold text-foreground">{run.contract_count}</p>
                    </div>
                    <div className="rounded-xl border border-border/70 bg-background/80 px-3 py-2">
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">ETH funded</p>
                      <p className="mt-1 text-sm font-semibold text-foreground">
                        {formatAmount(run.preview?.funding?.total_eth_deducted, "ETH")}
                      </p>
                    </div>
                    <div className="rounded-xl border border-border/70 bg-background/80 px-3 py-2">
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">WETH funded</p>
                      <p className="mt-1 text-sm font-semibold text-foreground">
                        {formatAmount(run.preview?.funding?.weth_sent_to_subwallets, "WETH")}
                      </p>
                    </div>
                  </div>
                </div>
              </AccordionTrigger>

              <AccordionContent className="pb-5">
                <div className="space-y-4">
                  {run.error ? (
                    <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-900">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                        <p>{run.error}</p>
                      </div>
                    </div>
                  ) : null}

                  <div className="grid gap-3 md:grid-cols-3">
                    <div className="rounded-xl border border-border/70 bg-background px-4 py-3">
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Run ID</p>
                      <p className="mt-1 break-all font-mono text-xs text-foreground">{run.id}</p>
                    </div>
                    <div className="rounded-xl border border-border/70 bg-background px-4 py-3">
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Network fee estimate</p>
                      <p className="mt-1 text-sm font-semibold text-foreground">
                        {formatAmount(run.funding_fee_estimate?.fee_eth, "ETH")}
                      </p>
                    </div>
                    <div className="rounded-xl border border-border/70 bg-background px-4 py-3">
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Contract execution</p>
                      <p className="mt-1 text-sm font-semibold text-foreground">{run.contract_execution?.status ?? "unknown"}</p>
                      {run.contract_execution?.message ? (
                        <p className="mt-1 text-xs text-muted-foreground">{run.contract_execution.message}</p>
                      ) : null}
                    </div>
                  </div>

                  {run.wrap_transaction?.tx_hash ? (
                    <div className="rounded-xl border border-border/70 bg-background px-4 py-3">
                      <p className="text-sm font-semibold text-foreground">Wrap transaction</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Wrapped {formatAmount(run.wrap_transaction.eth_wrapped, "ETH")} into WETH.
                      </p>
                      <p className="mt-2 break-all font-mono text-xs text-foreground">{run.wrap_transaction.tx_hash}</p>
                    </div>
                  ) : null}

                  <div className="space-y-3">
                    <p className="text-sm font-semibold text-foreground">Created wallets</p>
                    {run.sub_wallets?.map((subWallet) => {
                      return (
                        <div key={subWallet.wallet_id} className="rounded-2xl border border-border/70 bg-background px-4 py-4">
                          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                            <div className="flex min-w-0 items-start gap-3">
                              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-accent/10 text-accent">
                                <WalletCards className="h-5 w-5" />
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm font-semibold text-foreground">Subwallet {typeof subWallet.index === "number" ? `#${subWallet.index}` : ""}</p>
                                <p className="mt-1 break-all font-mono text-xs text-muted-foreground">{subWallet.address}</p>
                                <p className="mt-1 break-all text-xs text-muted-foreground">{subWallet.wallet_id}</p>
                              </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                              <Button type="button" variant="outline" size="sm" onClick={() => router.push(`/wallets/${subWallet.wallet_id}`)}>
                                Open wallet
                              </Button>
                              <Button type="button" variant="outline" size="sm" onClick={(event) => handleCopy(event, subWallet.address, "Address")}>
                                <Copy className="h-4 w-4" />
                                Copy address
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={(event) => handleOpenExport(event, subWallet)}
                                disabled={exportingWalletId === subWallet.wallet_id}
                              >
                                {exportingWalletId === subWallet.wallet_id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                                Export keystore
                              </Button>
                            </div>
                          </div>

                          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                            <div className="rounded-xl border border-border/70 bg-secondary/10 px-3 py-2">
                              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Status</p>
                              <p className="mt-1 text-sm font-semibold text-foreground">{subWallet.status ?? "created"}</p>
                            </div>
                            <div className="rounded-xl border border-border/70 bg-secondary/10 px-3 py-2">
                              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Expected ETH</p>
                              <p className="mt-1 text-sm font-semibold text-foreground">
                                {formatAmount(subWallet.expected_funding?.eth, "ETH")}
                              </p>
                            </div>
                            <div className="rounded-xl border border-border/70 bg-secondary/10 px-3 py-2">
                              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Expected WETH</p>
                              <p className="mt-1 text-sm font-semibold text-foreground">
                                {formatAmount(subWallet.expected_funding?.weth, "WETH")}
                              </p>
                            </div>
                            <div className="rounded-xl border border-border/70 bg-secondary/10 px-3 py-2">
                              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Access</p>
                              <p className="mt-1 text-sm font-semibold text-foreground">
                                {(subWallet.private_key_access?.export_supported ?? subWallet.private_key_access?.reveal_supported)
                                  ? "Encrypted keystore export"
                                  : "Unavailable"}
                              </p>
                            </div>
                          </div>

                          {subWallet.funding_transactions?.eth?.tx_hash || subWallet.funding_transactions?.weth?.tx_hash ? (
                            <div className="mt-4 grid gap-3 md:grid-cols-2">
                              {subWallet.funding_transactions?.eth?.tx_hash ? (
                                <div className="rounded-xl border border-border/70 bg-secondary/10 px-3 py-3">
                                  <p className="text-sm font-semibold text-foreground">ETH transfer</p>
                                  <p className="mt-1 text-xs text-muted-foreground">
                                    {formatAmount(subWallet.funding_transactions.eth.amount, "ETH")} · {subWallet.funding_transactions.eth.status ?? "submitted"}
                                  </p>
                                  <p className="mt-2 break-all font-mono text-xs text-foreground">{subWallet.funding_transactions.eth.tx_hash}</p>
                                </div>
                              ) : null}
                              {subWallet.funding_transactions?.weth?.tx_hash ? (
                                <div className="rounded-xl border border-border/70 bg-secondary/10 px-3 py-3">
                                  <p className="text-sm font-semibold text-foreground">WETH transfer</p>
                                  <p className="mt-1 text-xs text-muted-foreground">
                                    {formatAmount(subWallet.funding_transactions.weth.amount, "WETH")} · {subWallet.funding_transactions.weth.status ?? "submitted"}
                                  </p>
                                  <p className="mt-2 break-all font-mono text-xs text-foreground">{subWallet.funding_transactions.weth.tx_hash}</p>
                                </div>
                              ) : null}
                            </div>
                          ) : null}

                        </div>
                      );
                    })}
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
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
            <DialogTitle>Export encrypted keystore</DialogTitle>
            <DialogDescription>
              This exports an encrypted keystore JSON only. Enter the dedicated wallet access passphrase from the backend, then choose a separate password for the exported keystore file.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-xl border border-border/70 bg-secondary/10 px-4 py-3">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Wallet</p>
              <p className="mt-1 break-all font-mono text-xs text-foreground">{exportTarget?.address ?? "Unavailable"}</p>
            </div>

            <div className="space-y-2">
              <label htmlFor="wallet-access-passphrase" className="text-sm font-medium text-foreground">
                Unlock passphrase
              </label>
              <Input
                id="wallet-access-passphrase"
                type="password"
                value={accessPassphrase}
                onChange={(event) => setAccessPassphrase(event.target.value)}
                placeholder="Dedicated wallet access passphrase"
                autoComplete="off"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="wallet-export-passphrase" className="text-sm font-medium text-foreground">
                Keystore password
              </label>
              <Input
                id="wallet-export-passphrase"
                type="password"
                value={exportPassphrase}
                onChange={(event) => setExportPassphrase(event.target.value)}
                placeholder="At least 12 characters"
                autoComplete="off"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="wallet-export-passphrase-confirm" className="text-sm font-medium text-foreground">
                Confirm keystore password
              </label>
              <Input
                id="wallet-export-passphrase-confirm"
                type="password"
                value={confirmExportPassphrase}
                onChange={(event) => setConfirmExportPassphrase(event.target.value)}
                placeholder="Re-enter the keystore password"
                autoComplete="off"
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setExportTarget(null)} disabled={Boolean(exportingWalletId)}>
              Cancel
            </Button>
            <Button type="button" onClick={handleExportKeystore} disabled={!exportTarget || Boolean(exportingWalletId)}>
              {exportingWalletId ? "Exporting..." : "Download keystore"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
