import { ChevronsUp, ChevronUp, Equal, ChevronDown, Minus } from 'lucide-react';
import { it } from '@/lib/i18n/it';
import { Badge, type BadgeTone } from './Badge';

export type Priority = 'urgent' | 'high' | 'medium' | 'low' | 'none';

const config: Record<Priority, { tone: BadgeTone; Icon: typeof ChevronUp }> = {
  urgent: { tone: 'danger', Icon: ChevronsUp },
  high: { tone: 'warning', Icon: ChevronUp },
  medium: { tone: 'accent', Icon: Equal },
  low: { tone: 'neutral', Icon: ChevronDown },
  none: { tone: 'neutral', Icon: Minus },
};

/** Priority is always color + symbol + text: never color alone. */
export function PriorityBadge({ priority }: { priority: Priority }) {
  const { tone, Icon } = config[priority];
  return (
    <Badge tone={tone} icon={<Icon className="size-3.5" strokeWidth={2.5} />}>
      {it.priority[priority]}
    </Badge>
  );
}
