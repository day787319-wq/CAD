"use client";

import { FormEvent, MouseEvent, useEffect, useState } from "react";
import { Copy, Loader2, PlusCircle, ShieldCheck, Trash2, WalletCards } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
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
  title: { en: "Wallet Vault", zn: "钱包库", vn: "Kho ví" },
  subtitle: {
    en: "Import and manage source wallets from the backend",
    zn: "从后端导入并管理源钱包",
    vn: "Nhập và quản lý ví nguồn từ backend",
  },
  button: { en: "Import wallet", zn: "导入钱包", vn: "Nhập ví" },
  mainMode: { en: "Main wallet", zn: "主钱包", vn: "Ví chính" },
  privateKeyMode: { en: "Private key", zn: "私钥", vn: "Khóa riêng" },
  sheetTitle: {
    en: "Import wallet",
    zn: "导入钱包",
    vn: "Nhập ví",
  },
  mainDescription: {
    en: "Paste the 12 or 24 word seed phrase to import the real main wallet and derive its subwallets.",
    zn: "粘贴 12 或 24 个助记词以导入主钱包，并派生其子钱包。",
    vn: "Dán cụm từ khôi phục 12 hoặc 24 từ để nhập ví chính và tạo các ví con.",
  },
  privateKeyDescription: {
    en: "Paste one EVM private key. The backend validates it, encrypts it, stores it, and returns only safe wallet details.",
    zn: "粘贴一个 EVM 私钥。后端会验证、加密并保存它，只返回安全的钱包信息。",
    vn: "Dán một khóa riêng EVM. Backend sẽ xác thực, mã hóa, lưu trữ và chỉ trả về thông tin ví an toàn.",
  },
  mainInputLabel: { en: "Seed phrase", zn: "助记词", vn: "Cụm từ khôi phục" },
  privateKeyInputLabel: { en: "Private key", zn: "私钥", vn: "Khóa riêng" },
  mainInputPlaceholder: {
    en: "word1 word2 word3 ...",
    zn: "word1 word2 word3 ...",
    vn: "word1 word2 word3 ...",
  },
  privateKeyInputPlaceholder: { en: "0x...", zn: "0x...", vn: "0x..." },
  submit: { en: "Import wallet", zn: "导入钱包", vn: "Nhập ví" },
  submitting: { en: "Importing...", zn: "导入中...", vn: "Đang nhập..." },
  importedTitle: { en: "Imported wallet", zn: "已导入钱包", vn: "Ví đã nhập" },
  copyAddress: { en: "Copy address", zn: "复制地址", vn: "Sao chép địa chỉ" },
  openWallet: { en: "Open wallet page", zn: "打开钱包页面", vn: "Mở trang ví" },
  successTitle: { en: "Wallet imported", zn: "钱包已导入", vn: "Đã nhập ví" },
  successDescription: {
    en: "The wallet was imported and stored securely by the backend.",
    zn: "钱包已导入，并由后端安全存储。",
    vn: "Ví đã được nhập và lưu trữ an toàn bởi backend.",
  },
  emptyState: {
    en: "No wallet imported yet. Use the button above to import a main wallet or private key.",
    zn: "尚未导入钱包。使用上方按钮导入主钱包或私钥。",
    vn: "Chưa có ví nào được nhập. Dùng nút phía trên để nhập ví chính hoặc khóa riêng.",
  },
  savedTab: { en: "Saved wallets", zn: "已保存的钱包", vn: "Ví đã lưu" },
  latestTab: { en: "Latest import", zn: "最近导入", vn: "Lần nhập gần nhất" },
  runsTab: { en: "Run history", zn: "运行记录", vn: "Lịch sử chạy" },
  savedEmptyState: {
    en: "No saved wallets yet. Import one once and it will stay here for reuse.",
    zn: "还没有已保存的钱包。导入后会保留在这里供后续复用。",
    vn: "Chưa có ví nào được lưu. Sau khi nhập, ví sẽ ở lại đây để tái sử dụng.",
  },
  savedLoading: {
    en: "Loading saved wallets...",
    zn: "正在加载已保存的钱包...",
    vn: "Đang tải ví đã lưu...",
  },
  savedError: {
    en: "Failed to load saved wallets.",
    zn: "加载已保存的钱包失败。",
    vn: "Tải ví đã lưu thất bại.",
  },
  openSavedWallet: { en: "Open saved wallet", zn: "打开已保存钱包", vn: "Mở ví đã lưu" },
  privateKeyType: { en: "Private key", zn: "私钥钱包", vn: "Ví khóa riêng" },
  mainType: { en: "Seed wallet", zn: "助记词钱包", vn: "Ví cụm từ khôi phục" },
  deleteWallet: { en: "Delete wallet", zn: "删除钱包", vn: "Xóa ví" },
  deleteSuccessTitle: { en: "Wallet deleted", zn: "钱包已删除", vn: "Đã xóa ví" },
  deleteSuccessDescription: {
    en: "The saved wallet was removed.",
    zn: "已保存的钱包已被移除。",
    vn: "Ví đã lưu đã được xóa.",
  },
  loadFailed: { en: "Failed to load saved wallets", zn: "加载已保存的钱包失败", vn: "Tải ví đã lưu thất bại" },
  importFailed: { en: "Failed to import wallet", zn: "导入钱包失败", vn: "Nhập ví thất bại" },
  deleteFailed: { en: "Failed to delete wallet", zn: "删除钱包失败", vn: "Xóa ví thất bại" },
  deleteConfirm: {
    en: "Delete wallet {address}?",
    zn: "删除钱包 {address}？",
    vn: "Xóa ví {address}?",
  },
  nativeBalance: { en: "Native balance", zn: "原生代币余额", vn: "Số dư coin gốc" },
  wrappedBalance: { en: "Wrapped balance", zn: "封装代币余额", vn: "Số dư token bọc" },
} as const;

type ImportedWallet = {
  id: string;
  type?: string;
  address: string;
  chain?: string | null;
  native_symbol?: string | null;
  wrapped_native_symbol?: string | null;
  eth_balance: number | null;
  weth_balance: number | null;
  weth_address: string;
  token_holdings?: Array<{
    symbol: string;
    name?: string | null;
    address: string;
    decimals?: number | null;
    raw_balance?: string | null;
    balance?: string | null;
    error?: string | null;
    chain_label?: string | null;
  }>;
  balances_live?: boolean;
  created_at?: string | null;
};

type ImportMode = "main" | "private_key";

function walletSummary(wallet: ImportedWallet) {
  return `${wallet.address} | ${wallet.id}`;
}

function formatBalance(value: string | number | null | undefined, symbol: string) {
  if (value === null || value === undefined) return `Unavailable ${symbol}`;
  const numeric = typeof value === "number" ? value : Number.parseFloat(value ?? "");
  if (!Number.isFinite(numeric)) return `Unavailable ${symbol}`;
  return `${numeric.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })} ${symbol}`;
}

function formatBalanceValue(value: string | number | null | undefined) {
  if (value === null || value === undefined) return "Unavailable";
  const numeric = typeof value === "number" ? value : Number.parseFloat(value ?? "");
  if (!Number.isFinite(numeric)) return "Unavailable";
  return numeric.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 });
}

export function RecentDeals() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { locale, interpolate } = useI18n();
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
      const chain = searchParams.get("chain");
      const query = chain ? `?chain=${encodeURIComponent(chain)}` : "";
      const response = await fetch(`${API_URL}/api/wallets${query}`);
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.detail ?? copy.loadFailed[locale]);
      }
      setSavedWallets(Array.isArray(payload.wallets) ? payload.wallets : []);
      setWalletsError(null);
    } catch (loadError) {
      setWalletsError(loadError instanceof Error ? loadError.message : copy.loadFailed[locale]);
    } finally {
      setLoadingWallets(false);
    }
  };

  useEffect(() => {
    loadWallets();
  }, [searchParams]);

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
        throw new Error(payload.detail ?? copy.importFailed[locale]);
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
      setError(submitError instanceof Error ? submitError.message : copy.importFailed[locale]);
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
    if (!window.confirm(interpolate(copy.deleteConfirm[locale], { address: walletToDelete.address }))) {
      return;
    }

    setDeletingWalletId(walletToDelete.id);
    try {
      const response = await fetch(`${API_URL}/api/wallets/${walletToDelete.id}`, {
        method: "DELETE",
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.detail ?? copy.deleteFailed[locale]);
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
        description: deleteError instanceof Error ? deleteError.message : copy.deleteFailed[locale],
        variant: "destructive",
      });
    } finally {
      setDeletingWalletId(null);
    }
  };

  return (
    <div className="cad-panel w-full animate-in slide-in-from-bottom-4 fade-in p-5 duration-500 delay-200">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-foreground">{copy.title[locale]}</h3>
          <p className="mt-0.5 text-sm text-muted-foreground">{copy.subtitle[locale]}</p>
        </div>

        <Sheet open={isOpen} onOpenChange={setIsOpen}>
          <SheetTrigger asChild>
            <button
              type="button"
              className="group flex items-center gap-1 text-[13px] font-medium text-primary transition-colors hover:text-primary/80"
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
        <TabsList className="grid h-10 w-full grid-cols-3 rounded-xl">
          <TabsTrigger value="saved" className="w-full rounded-lg">{copy.savedTab[locale]}</TabsTrigger>
          <TabsTrigger value="latest" className="w-full rounded-lg">{copy.latestTab[locale]}</TabsTrigger>
          <TabsTrigger value="runs" className="w-full rounded-lg">{copy.runsTab[locale]}</TabsTrigger>
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
              {savedWallets.map((savedWallet) => {
                const summaryTokenHoldings = savedWallet.token_holdings ?? [];
                return (
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
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 via-sky-500 to-cyan-500 text-white shadow-[0_14px_30px_-18px_rgba(37,99,235,0.65)]">
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

                    <div className={`mt-4 grid gap-3 ${summaryTokenHoldings.length > 0 ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
                      <div className="rounded-xl border border-border/70 bg-background/70 px-4 py-3">
                        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{copy.nativeBalance[locale]}</p>
                        <p className="mt-1 text-sm font-semibold text-foreground">{formatBalanceValue(savedWallet.eth_balance)}</p>
                      </div>
                      <div className="rounded-xl border border-border/70 bg-background/70 px-4 py-3">
                        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{copy.wrappedBalance[locale]}</p>
                        <p className="mt-1 text-sm font-semibold text-foreground">{formatBalanceValue(savedWallet.weth_balance)}</p>
                      </div>
                      {summaryTokenHoldings.map((holding) => (
                        <div key={holding.address} className="rounded-xl border border-border/70 bg-background/70 px-4 py-3">
                          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{holding.symbol}</p>
                          <p className="mt-1 text-sm font-semibold text-foreground">
                            {holding.error ? `Unavailable ${holding.symbol}` : formatBalance(holding.balance, holding.symbol)}
                          </p>
                          {holding.chain_label ? (
                            <p className="mt-1 text-[11px] text-muted-foreground">{holding.chain_label}</p>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
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
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 via-sky-500 to-cyan-500 text-white shadow-[0_14px_30px_-18px_rgba(37,99,235,0.65)]">
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
            title={copy.runsTab[locale]}
            description={
              locale === "en"
                ? "Each run records the batch, funding submission details, and the generated subwallets."
                : locale === "zn"
                  ? "每次运行都会记录批次、资金提交详情以及生成的子钱包。"
                  : "Mỗi lần chạy đều ghi lại lô xử lý, chi tiết cấp vốn và các ví con đã tạo."
            }
            emptyMessage={
              locale === "en"
                ? "No runs yet. Execute one from a main wallet and it will appear here."
                : locale === "zn"
                  ? "还没有运行记录。从主钱包执行一次后会显示在这里。"
                  : "Chưa có lần chạy nào. Thực hiện một lần từ ví chính và nó sẽ xuất hiện ở đây."
            }
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
