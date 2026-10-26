import Link from 'next/link';
import { it } from '@/lib/i18n/it';

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
      <div className="k-mesh" aria-hidden="true" />
      <h1 className="text-title1 font-bold text-fg">{it.common.notFoundTitle}</h1>
      <p className="text-body text-muted">{it.common.notFoundBody}</p>
      <Link
        href="/"
        className="k-pressable inline-flex min-h-touch items-center rounded-pill bg-accent-fill px-5 font-semibold text-on-accent"
        data-plain
      >
        {it.common.backHome}
      </Link>
    </main>
  );
}
