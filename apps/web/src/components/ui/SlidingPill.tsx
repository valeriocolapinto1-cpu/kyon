import { cn } from '@/lib/cn';

/**
 * The "selected" pill of a row (or column) of equal items, sliding with a springy CSS
 * transition. Pure CSS: no animation library on the first load. The parent must be `relative`
 * and its items equal in size; `inset` is the parent's padding, `gap` the space between items.
 */
export function SlidingPill({
  index,
  count,
  axis = 'x',
  inset = '0.25rem',
  gap = '0px',
  className,
}: {
  index: number;
  count: number;
  axis?: 'x' | 'y';
  inset?: string;
  gap?: string;
  className?: string;
}) {
  if (index < 0) return null;
  const size = `calc((100% - 2 * ${inset} - ${count - 1} * ${gap}) / ${count})`;
  const offset = `calc(${index} * (100% + ${gap}))`;
  return (
    <span
      aria-hidden="true"
      className={cn(
        'pointer-events-none absolute rounded-pill transition-transform duration-500 ease-[cubic-bezier(0.34,1.36,0.64,1)]',
        className,
      )}
      style={
        axis === 'x'
          ? {
              top: inset,
              bottom: inset,
              left: inset,
              width: size,
              transform: `translateX(${offset})`,
            }
          : {
              left: inset,
              right: inset,
              top: inset,
              height: size,
              transform: `translateY(${offset})`,
            }
      }
    />
  );
}
