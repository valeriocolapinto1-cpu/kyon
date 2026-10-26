import { cn } from '@/lib/cn';

interface AvatarProps {
  name: string;
  src?: string | null;
  size?: 'sm' | 'md' | 'lg';
  /** Presence dot; announced through the accessible name. */
  online?: boolean;
  className?: string;
}

const sizes = {
  sm: 'size-8 text-caption',
  md: 'size-10 text-subhead',
  lg: 'size-16 text-title3',
} as const;

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters =
    parts.length > 1
      ? [parts[0]?.[0], parts[parts.length - 1]?.[0]]
      : [parts[0]?.[0], parts[0]?.[1]];
  return letters.filter(Boolean).join('').toUpperCase();
}

export function Avatar({ name, src, size = 'md', online, className }: AvatarProps) {
  const label = online === undefined ? name : `${name}, ${online ? 'online' : 'offline'}`;
  return (
    <span role="img" aria-label={label} className={cn('relative inline-flex shrink-0', className)}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- avatars come from R2 through the Worker, not next/image
        <img src={src} alt="" className={cn('rounded-full object-cover', sizes[size])} />
      ) : (
        <span
          aria-hidden="true"
          className={cn(
            'inline-flex items-center justify-center rounded-full bg-accent-fill font-semibold text-on-accent',
            sizes[size],
          )}
        >
          {initials(name)}
        </span>
      )}
      {online !== undefined && (
        <span
          aria-hidden="true"
          className={cn(
            'absolute -right-0.5 -bottom-0.5 size-3 rounded-full border-2 border-surface-solid',
            online ? 'bg-success-fill' : 'bg-muted',
          )}
        />
      )}
    </span>
  );
}
