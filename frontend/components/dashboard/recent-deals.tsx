"use client";

import { FormEvent, MouseEvent, useEffect, useState } from "react";
import { Copy, Loader2, PlusCircle, ShieldCheck, Trash2, WalletCards } from "lucide-react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n-provider";
import { Button } from "@/components/ui/button";
import { WalletRunHistory } from "@/components/dashboard/wallet-run-history";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { API_URL } from "@/lib/api";

const copy = {
  title: { en: "Wallet Vault", zn: "Wallet Vault", vn: "Wallet Vault" },
  subtitle: {
    en: "Import and secure wallets from the backend",
    zn: "Import and secure wallets from the backend",
    vn: "Import and secure wallets from the backend",
  },
  button: { en: "Import wallet", zn: "Import wallet", vn: "Import wallet" },
  mainMode: { en: "Main wallet", zn: "Main wallet", vn: "Main wallet" },
  privateKeyMode: { en: "Private key", zn: "Private key", vn: "Private key" },
  sheetTitle: {
    en: "Import wallet",
    zn: "Import wallet",
    vn: "Import wallet",
  },
  mainDescription: {
    en: "Paste the 12 or 24 word seed phrase to import the real main wallet and derive its subwallets.",
    zn: "Paste the 12 or 24 word seed phrase to import the real main wallet and derive its subwallets.",
    vn: "Paste the 12 or 24 word seed phrase to import the real main wallet and derive its subwallets.",
  },
  privateKeyDescription: {
    en: "Paste one EVM private key. The backend validates it, encrypts it, stores it, and returns only safe wallet details.",
    zn: "Paste one EVM private key. The backend validates it, encrypts it, stores it, and returns only safe wallet details.",
    vn: "Paste one EVM private key. The backend validates it, encrypts it, stores it, and returns only safe wallet details.",
  },
  mainInputLabel: { en: "Seed phrase", zn: "Seed phrase", vn: "Seed phrase" },
  privateKeyInputLabel: { en: "Private key", zn: "Private key", vn: "Private key" },
  mainInputPlaceholder: {
    en: "word1 word2 word3 ...",
    zn: "word1 word2 word3 ...",
    vn: "word1 word2 word3 ...",
  },
  privateKeyInputPlaceholder: { en: "0x...", zn: "0x...", vn: "0x..." },
  submit: { en: "Import wallet", zn: "Import wallet", vn: "Import wallet" },
  submitting: { en: "Importing...", zn: "Importing...", vn: "Importing..." },
  importedTitle: { en: "Imported wallet", zn: "Imported wallet", vn: "Imported wallet" },
  copyAddress: { en: "Copy address", zn: "Copy address", vn: "Copy address" },
  openWallet: { en: "Open wallet page", zn: "Open wallet page", vn: "Open wallet page" },
  successTitle: { en: "Wallet imported", zn: "Wallet imported", vn: "Wallet imported" },
  successDescription: {
    en: "The wallet was imported and stored securely by the backend.",
    zn: "The wallet was imported and stored securely by the backend.",
    vn: "The wallet was imported and stored securely by the backend.",
  },
  emptyState: {
    en: "No wallet imported yet. Use the button above to import a main wallet or private key.",
    zn: "No wallet imported yet. Use the button above to import a main wallet or private key.",
    vn: "No wallet imported yet. Use the button above to import a main wallet or private key.",
  },
  savedTab: { en: "Saved wallets", zn: "Saved wallets", vn: "Saved wallets" },
  latestTab: { en: "Latest import", zn: "Latest import", vn: "Latest import" },
  runsTab: { en: "Run history", zn: "Run history", vn: "Run history" },
  savedEmptyState: {
    en: "No saved wallets yet. Import one once and it will stay here for reuse.",
    zn: "No saved wallets yet. Import one once and it will stay here for reuse.",
    vn: "No saved wallets yet. Import one once and it will stay here for reuse.",
  },
  savedLoading: {
    en: "Loading saved wallets...",
    zn: "Loading saved wallets...",
    vn: "Loading saved wallets...",
  },
  savedError: {
    en: "Failed to load saved wallets.",
    zn: "Failed to load saved wallets.",
    vn: "Failed to load saved wallets.",
  },
  openSavedWallet: { en: "Open saved wallet", zn: "Open saved wallet", vn: "Open saved wallet" },
  privateKeyType: { en: "Private key", zn: "Private key", vn: "Private key" },
  mainType: { en: "Seed wallet", zn: "Seed wallet", vn: "Seed wallet" },
  deleteWallet: { en: "Delete wallet", zn: "Delete wallet", vn: "Delete wallet" },
  deleteSuccessTitle: { en: "Wallet deleted", zn: "Wallet deleted", vn: "Wallet deleted" },
  deleteSuccessDescription: {
    en: "The saved wallet was removed.",
    zn: "The saved wallet was removed.",
    vn: "The saved wallet was removed.",
  },
} as const;

type ImportedWallet = {
  id: string;
  type?: string;
  address: string;
  eth_balance: number | null;
  weth_balance: number | null;
  weth_address: string;
  balances_live?: boolean;
  created_at?: string | null;
};

type ImportMode = "main" | "private_key";

function walletSummary(wallet: ImportedWallet) {
  return `${wallet.address} | ${wallet.id}`;
}

function formatBalance(value: number | null | undefined, symbol: string) {
  if (value === null || value === undefined) return `Unavailable ${symbol}`;
  return `${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })} ${symbol}`;
}

export function RecentDeals() {
  const router = useRouter();
  const { locale } = useI18n();
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [importMode, setImportMode] = useState<ImportMode>("main");
  const [secretValue, setSecretValue] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wallet, setWallet] = useState<ImportedWallet | null>(null);
  const [savedWallets, setSavedWallets] = useState<ImportedWallet[]>([]);
  const [loadingWallets, setLoadingWallets] = useState(true);
  const [walletsError, setWalletsError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("saved");
  const [deletingWalletId, setDeletingWalletId] = useState<string | null>(null);

  const loadWallets = async () => {
    setLoadingWallets(true);
    try {
      const response = await fetch(`${API_URL}/api/wallets`);
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.detail ?? "Failed to load saved wallets");
      }
      setSavedWallets(Array.isArray(payload.wallets) ? payload.wallets : []);
      setWalletsError(null);
    } catch (loadError) {
      setWalletsError(loadError instanceof Error ? loadError.message : "Failed to load saved wallets");
    } finally {
      setLoadingWallets(false);
    }
  };

  useEffect(() => {
    loadWallets();
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const isMainWallet = importMode === "main";
      const response = await fetch(
        `${API_URL}/api/wallets/${isMainWallet ? "main/import" : "private-key/import"}`,
        {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
          body: JSON.stringify(
            isMainWallet ? { seed_phrase: secretValue } : { private_key: secretValue },
          ),
        },
      );
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.detail ?? "Failed to import wallet");
      }

      setWallet(payload);
      await loadWallets();
      setActiveTab("saved");
      setSecretValue("");
      setIsOpen(false);
      toast({
        title: copy.successTitle[locale],
        description: copy.successDescription[locale],
      });
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Failed to import wallet");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopyAddress = async (event: MouseEvent<HTMLButtonElement>, address: string | undefined) => {
    event.stopPropagation();

    if (!address || !navigator.clipboard) {
      return;
    }

    await navigator.clipboard.writeText(address);
    toast({
      title: copy.copyAddress[locale],
      description: address,
    });
  };

  const openWalletPage = (walletId: string | undefined) => {
    if (!walletId) {
      return;
    }

    router.push(`/wallets/${walletId}`);
  };

  const handleDeleteWallet = async (event: MouseEvent<HTMLButtonElement>, walletToDelete: ImportedWallet) => {
    event.stopPropagation();
    if (!window.confirm(`Delete wallet ${walletToDelete.address}?`)) {
      return;
    }

    setDeletingWalletId(walletToDelete.id);
    try {
      const response = await fetch(`${API_URL}/api/wallets/${walletToDelete.id}`, {
        method: "DELETE",
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.detail ?? "Failed to delete wallet");
      }

      if (wallet?.id === walletToDelete.id) {
        setWallet(null);
      }
      await loadWallets();
      toast({
        title: copy.deleteSuccessTitle[locale],
        description: copy.deleteSuccessDescription[locale],
      });
    } catch (deleteError) {
      toast({
        title: copy.deleteWallet[locale],
        description: deleteError instanceof Error ? deleteError.message : "Failed to delete wallet",
        variant: "destructive",
      });
    } finally {
      setDeletingWalletId(null);
    }
  };

  return (
    <div className="w-full animate-in slide-in-from-bottom-4 fade-in rounded-xl border border-border bg-card p-5 duration-500 delay-200">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-foreground">{copy.title[locale]}</h3>
          <p className="mt-0.5 text-sm text-muted-foreground">{copy.subtitle[locale]}</p>
        </div>

        <Sheet open={isOpen} onOpenChange={setIsOpen}>
          <SheetTrigger asChild>
            <button
              type="button"
              className="group flex items-center gap-1 text-sm font-medium text-accent transition-colors hover:text-accent/80"
            >
              {copy.button[locale]}
              <PlusCircle className="h-4 w-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
            </button>
          </SheetTrigger>

          <SheetContent className="sm:max-w-lg">
            <SheetHeader>
              <SheetTitle>{copy.sheetTitle[locale]}</SheetTitle>
              <SheetDescription>
                {importMode === "main" ? copy.mainDescription[locale] : copy.privateKeyDescription[locale]}
              </SheetDescription>
            </SheetHeader>

            <form onSubmit={handleSubmit} className="flex h-full flex-col gap-6 px-4 pb-4">
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant={importMode === "main" ? "default" : "outline"}
                  onClick={() => {
                    setImportMode("main");
                    setError(null);
                    setSecretValue("");
                  }}
                >
                  {copy.mainMode[locale]}
                </Button>
                <Button
                  type="button"
                  variant={importMode === "private_key" ? "default" : "outline"}
                  onClick={() => {
                    setImportMode("private_key");
                    setError(null);
                    setSecretValue("");
                  }}
                >
                  {copy.privateKeyMode[locale]}
                </Button>
              </div>

              <div className="space-y-2">
                <label htmlFor="wallet-private-key" className="text-sm font-medium text-foreground">
                  {importMode === "main" ? copy.mainInputLabel[locale] : copy.privateKeyInputLabel[locale]}
                </label>

                {importMode === "main" ? (
                  <Textarea
                    id="wallet-private-key"
                    value={secretValue}
                    onChange={(event) => setSecretValue(event.target.value)}
                    placeholder={copy.mainInputPlaceholder[locale]}
                    autoComplete="off"
                    spellCheck={false}
                    rows={5}
                    required
                  />
                ) : (
                  <Input
                    id="wallet-private-key"
                    type="password"
                    value={secretValue}
                    onChange={(event) => setSecretValue(event.target.value)}
                    placeholder={copy.privateKeyInputPlaceholder[locale]}
                    autoComplete="off"
                    spellCheck={false}
                    required
                  />
                )}
                {error ? <p className="text-sm text-destructive">{error}</p> : null}
              </div>

              <Button type="submit" disabled={isSubmitting || !secretValue.trim()} className="w-full">
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                {isSubmitting ? copy.submitting[locale] : copy.submit[locale]}
              </Button>
            </form>
          </SheetContent>
        </Sheet>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="gap-4">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="saved">{copy.savedTab[locale]}</TabsTrigger>
          <TabsTrigger value="latest">{copy.latestTab[locale]}</TabsTrigger>
          <TabsTrigger value="runs">{copy.runsTab[locale]}</TabsTrigger>
        </TabsList>

        <TabsContent value="saved">
          {loadingWallets ? (
            <div className="rounded-2xl border border-border bg-secondary/20 p-6 text-center">
              <p className="text-sm text-muted-foreground">{copy.savedLoading[locale]}</p>
            </div>
          ) : walletsError ? (
            <div className="rounded-2xl border border-destructive/40 bg-destructive/5 p-6 text-center">
              <p className="text-sm text-destructive">{walletsError || copy.savedError[locale]}</p>
            </div>
          ) : savedWallets.length > 0 ? (
            <div className="space-y-3">
              {savedWallets.map((savedWallet) => (
                <div
                  key={savedWallet.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => openWalletPage(savedWallet.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      openWalletPage(savedWallet.id);
                    }
                  }}
                  className="rounded-2xl border border-border bg-secondary/30 p-4 transition hover:border-accent/50 hover:bg-secondary/45 focus:outline-none focus:ring-2 focus:ring-accent/40"
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="flex min-w-0 items-start gap-3">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-accent/10 text-accent">
                        <WalletCards className="h-5 w-5" />
                      </div>

                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground">
                          {savedWallet.type === "imported_private_key" ? copy.privateKeyType[locale] : copy.mainType[locale]}
                        </p>
                        <p className="mt-1 break-all font-mono text-xs text-muted-foreground">{savedWallet.address}</p>
                        <p className="mt-1 break-all text-xs text-muted-foreground">{savedWallet.id}</p>
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      <p className="hidden text-xs text-muted-foreground sm:block">{copy.openSavedWallet[locale]}</p>
                      <Button type="button" variant="outline" size="sm" onClick={(event) => handleCopyAddress(event, savedWallet.address)}>
                        <Copy className="h-4 w-4" />
                        {copy.copyAddress[locale]}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={(event) => handleDeleteWallet(event, savedWallet)}
                        disabled={deletingWalletId === savedWallet.id}
                      >
                        {deletingWalletId === savedWallet.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                        {copy.deleteWallet[locale]}
                      </Button>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-xl border border-border/70 bg-background/70 px-4 py-3">
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">ETH</p>
                      <p className="mt-1 text-sm font-semibold text-foreground">{formatBalance(savedWallet.eth_balance, "ETH")}</p>
                    </div>
                    <div className="rounded-xl border border-border/70 bg-background/70 px-4 py-3">
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">WETH</p>
                      <p className="mt-1 text-sm font-semibold text-foreground">{formatBalance(savedWallet.weth_balance, "WETH")}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-border bg-secondary/20 p-6 text-center">
              <p className="text-sm text-muted-foreground">{copy.savedEmptyState[locale]}</p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="latest">
          {wallet ? (
            <div
              role="button"
              tabIndex={0}
              onClick={() => openWalletPage(wallet.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  openWalletPage(wallet.id);
                }
              }}
              className="rounded-2xl border border-border bg-secondary/30 p-4 transition hover:border-accent/50 hover:bg-secondary/45 focus:outline-none focus:ring-2 focus:ring-accent/40"
            >
              <div className="flex items-center justify-between gap-4">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-accent/10 text-accent">
                    <WalletCards className="h-5 w-5" />
                  </div>

                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">{copy.importedTitle[locale]}</p>
                    <p className="truncate font-mono text-xs text-muted-foreground">{walletSummary(wallet)}</p>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <p className="hidden text-xs text-muted-foreground sm:block">{copy.openWallet[locale]}</p>
                  <Button type="button" variant="outline" size="sm" onClick={(event) => handleCopyAddress(event, wallet.address)}>
                    <Copy className="h-4 w-4" />
                    {copy.copyAddress[locale]}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={(event) => handleDeleteWallet(event, wallet)}
                    disabled={deletingWalletId === wallet.id}
                  >
                    {deletingWalletId === wallet.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                    {copy.deleteWallet[locale]}
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-border bg-secondary/20 p-6 text-center">
              <p className="text-sm text-muted-foreground">{copy.emptyState[locale]}</p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="runs">
          <WalletRunHistory
            title="Run history"
            description="Each run records the batch, funding submission details, and the generated subwallets."
            emptyMessage="No runs yet. Execute one from a main wallet and it will appear here."
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
