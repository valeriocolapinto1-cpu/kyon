import { cn } from '@/lib/cn';

/** Kyon mark: three glass spheres (Cerbero's heads), tinted with the current accent. */
export function Logo({ className, title }: { className?: string; title?: string }) {
  return (
    <svg
      viewBox="0 0 512 512"
      className={cn('shrink-0', className)}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      <circle cx="168" cy="300" r="100" className="fill-accent" fillOpacity="0.55" />
      <circle cx="344" cy="300" r="100" className="fill-accent" fillOpacity="0.75" />
      <circle cx="256" cy="204" r="112" className="fill-accent-fill" />
      <ellipse
        cx="220"
        cy="156"
        rx="44"
        ry="24"
        fill="#FFFFFF"
        fillOpacity="0.55"
        transform="rotate(-28 220 156)"
      />
    </svg>
  );
}
