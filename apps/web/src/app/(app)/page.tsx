import { Activity, CalendarClock, MessageSquareText, PlayCircle, Users } from 'lucide-react';
import { HomeClock } from '@/components/feature/HomeClock';
import { GlassCard } from '@/components/ui/GlassCard';
import { PageHeader } from '@/components/ui/PageHeader';
import { it } from '@/lib/i18n/it';

const blocks = [
  {
    title: 'Ultimi contributi',
    Icon: Activity,
    body: 'Commit e azioni del gruppo, appena colleghi GitHub.',
  },
  {
    title: 'Le mie task',
    Icon: CalendarClock,
    body: 'Le task assegnate a te e quelle in scadenza.',
  },
  {
    title: 'Ultimi commenti',
    Icon: MessageSquareText,
    body: 'I commenti più recenti dei thread di progetto e di task.',
  },
  {
    title: 'Esecuzioni in corso',
    Icon: PlayCircle,
    body: 'Prompt lanciati, PR aperte e CI da controllare.',
  },
  { title: 'Chi è online', Icon: Users, body: 'La presenza dei membri del gruppo.' },
];

export default function HomePage() {
  return (
    <>
      <PageHeader title={it.home.title} subtitle={it.home.emptyBody} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <GlassCard className="flex items-center justify-center">
          <HomeClock />
        </GlassCard>
        {blocks.map(({ title, Icon, body }) => (
          <GlassCard
            key={title}
            as="section"
            aria-labelledby={`b-${title}`}
            className="flex flex-col gap-2"
          >
            <h2 id={`b-${title}`} className="flex items-center gap-2 text-headline text-fg">
              <Icon className="size-5 text-accent-text" aria-hidden="true" />
              {title}
            </h2>
            <p className="text-subhead text-muted">{body}</p>
          </GlassCard>
        ))}
      </div>
    </>
  );
}
