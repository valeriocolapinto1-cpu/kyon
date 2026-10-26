import { AlertCircle } from 'lucide-react';

/** Form-level error, announced immediately by screen readers. */
export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="flex items-start gap-2 rounded-control bg-neutral-soft p-3 text-subhead font-medium text-danger"
    >
      <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      {message}
    </p>
  );
}
