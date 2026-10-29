import { CardanoNetwork, NETWORK_LABEL } from '@/lib/network';

/**
 * Small badge naming the Cardano network an event lives on. Mainnet is shown in
 * amber because real ADA is involved; Preprod in grey.
 */
export function NetworkBadge({ network, className = '' }: { network: CardanoNetwork | null | undefined; className?: string }) {
  if (!network) return null;
  const style = network === 'mainnet'
    ? 'bg-amber-100 text-amber-900 border-amber-300'
    : 'bg-gray-100 text-gray-700 border-gray-300';
  const title = network === 'mainnet'
    ? 'Cardano Mainnet — transactions cost real ADA'
    : 'Cardano Preprod testnet — test ADA only, no real money';
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-semibold whitespace-nowrap ${style} ${className}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${network === 'mainnet' ? 'bg-amber-500' : 'bg-gray-400'}`} />
      Cardano {NETWORK_LABEL[network]}
    </span>
  );
}
