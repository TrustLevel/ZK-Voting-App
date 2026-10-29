'use client';

import { useEffect } from 'react';
import { AppShell } from '@/components/AppShell';
import { Spinner } from '@/components/Icons';

const DOCS_URL = 'https://trustlevel.gitbook.io/knowledge-base/tools-and-apps/zk-voting-app';

/**
 * INFO PAGE - Redirect to GitBook Documentation
 * Automatically redirects users to the ZK Voting App knowledge base
 */
export default function Info() {
  useEffect(() => {
    // Redirect to GitBook documentation
    window.location.href = DOCS_URL;
  }, []);

  return (
    <AppShell width="sm" center>
      <div className="flex flex-col items-center gap-4 text-center">
        <Spinner size={40} className="text-ink" />
        <p className="text-muted">Redirecting to documentation...</p>
        <a href={DOCS_URL} className="inline-flex min-h-11 items-center text-sm font-semibold text-ink underline decoration-brand decoration-2 underline-offset-[3px]">
          Open the documentation
        </a>
      </div>
    </AppShell>
  );
}
