import type { ReactNode } from 'react';
import { Logo } from '@/components/shell/Logo';
import { QueryProvider } from '@/lib/client/query';
import { it } from '@/lib/i18n/it';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <QueryProvider>
      <div className="k-mesh" aria-hidden="true" />
      <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 px-4 pt-[max(2rem,var(--k-safe-top))] pb-[max(2rem,var(--k-safe-bottom))]">
        <div className="flex items-center justify-center gap-3">
          <Logo className="size-12" />
          <span className="text-title1 font-bold text-fg">{it.app.name}</span>
        </div>
        {children}
      </main>
    </QueryProvider>
  );
}
