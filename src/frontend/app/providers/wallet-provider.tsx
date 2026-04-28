'use client';

import dynamic from 'next/dynamic';
import { ReactNode } from 'react';

const MeshProvider = dynamic(
  () => import('@meshsdk/react').then((mod) => mod.MeshProvider),
  { ssr: false }
);

export function WalletProvider({ children }: { children: ReactNode }) {
  return <MeshProvider>{children}</MeshProvider>;
}
