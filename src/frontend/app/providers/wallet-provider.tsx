'use client';

import { MeshProvider } from '@meshsdk/react';
import { ReactNode } from 'react';

export function WalletProvider({ children }: { children: ReactNode }) {
  return (
    <MeshProvider>
      {children}
    </MeshProvider>
  );
}
