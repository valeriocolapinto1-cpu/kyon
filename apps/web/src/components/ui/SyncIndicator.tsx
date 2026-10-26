import { AlertTriangle, Check, CloudOff, Loader2, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/cn';
import { it } from '@/lib/i18n/it';

export type SyncState = 'idle' | 'saving' | 'saved' | 'error' | 'offline';

/** Repo sync status ("Salvo su GitHub…", "Salvato", "Errore, riprova"). Announced politely. */
export function SyncIndicator({ state, onRetry }: { state: SyncState; onRetry?: () => void }) {
  const content = {
    idle: { icon: <Check className="size-4" />, text: it.sync.idle, tone: 'text-muted' },
    saving: {
      icon: <Loader2 className="size-4 animate-spin" />,
      text: it.sync.saving,
      tone: 'text-muted',
    },
    saved: { icon: <Check className="size-4" />, text: it.sync.saved, tone: 'text-success' },
    error: { icon: <AlertTriangle className="size-4" />, text: it.sync.error, tone: 'text-danger' },
    offline: { icon: <CloudOff className="size-4" />, text: it.sync.offline, tone: 'text-warning' },
  }[state];
  return (
    <div className="inline-flex items-center gap-2">
      <span
        role="status"
        aria-live="polite"
        className={cn('inline-flex items-center gap-1.5 text-footnote font-medium', content.tone)}
      >
        <span aria-hidden="true">{content.icon}</span>
        {content.text}
      </span>
      {state === 'error' && onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="k-pressable inline-flex min-h-touch items-center gap-1 rounded-pill px-3 text-footnote font-semibold text-accent-text hover:bg-accent-soft"
        >
          <RefreshCw className="size-4" aria-hidden="true" />
          {it.sync.retry}
        </button>
      )}
    </div>
  );
}
