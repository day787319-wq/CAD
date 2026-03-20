import { WalletDetailsPage } from "@/components/dashboard/wallet-details-page";

interface WalletPageProps {
  params: Promise<{
    walletId: string;
  }>;
}

export default async function WalletPage({ params }: WalletPageProps) {
  const { walletId } = await params;

  return <WalletDetailsPage walletId={walletId} />;
}
