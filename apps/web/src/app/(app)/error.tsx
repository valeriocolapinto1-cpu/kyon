'use client';

import { AlertTriangle } from 'lucide-react';
import { useEffect } from 'react';
import { EmptyState } from '@/components/ui/EmptyState';
import { GlassButton } from '@/components/ui/GlassButton';
import { it } from '@/lib/i18n/it';

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('page error', error);
  }, [error]);
  return (
    <EmptyState
      icon={<AlertTriangle className="size-10" />}
      title={it.common.errorTitle}
      body={it.common.errorBody}
      action={
        <GlassButton variant="primary" onClick={reset}>
          {it.common.retry}
        </GlassButton>
      }
    />
  );
}
