import type { ReactNode } from 'react';
import { AppShell } from '@/components/shell/AppShell';
import { AuthGate } from '@/components/shell/AuthGate';
import { QueryProvider } from '@/lib/client/query';

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <QueryProvider>
      <AuthGate>
        <AppShell>{children}</AppShell>
      </AuthGate>
    </QueryProvider>
  );
}
