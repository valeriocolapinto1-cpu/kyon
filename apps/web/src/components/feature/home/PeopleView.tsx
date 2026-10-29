'use client';

import Link from 'next/link';
import { PersonName } from '@/components/ui/PersonName';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft, ExternalLink, FolderKanban } from 'lucide-react';
import { ActivityLine } from '@/components/feature/home/ActivityLine';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { GlassCard } from '@/components/ui/GlassCard';
import { PageHeader } from '@/components/ui/PageHeader';
import { SkeletonList } from '@/components/ui/Skeleton';
import { usePeople, usePerson, type PersonProfile } from '@/lib/client/home';
import { useMe } from '@/lib/client/me';
import { useGroupLive } from '@/lib/client/presence';
import { lazy } from '@/lib/format/lazy';
import { it } from '@/lib/i18n/it';

const p = it.people;

const dateFormat = lazy(
  () =>
    new Intl.DateTimeFormat('it-IT', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'Europe/Rome',
    }),
);

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <GlassCard as="section" aria-labelledby={id} className="flex flex-col gap-3">
      <h2 id={id} className="text-headline text-fg">
        {title}
      </h2>
      {children}
    </GlassCard>
  );
}

function Profile({ person }: { person: PersonProfile }) {
  const { online } = useGroupLive();
  const me = useMe().data;
  const isOnline = online.includes(person.id);
  return (
    <div className="flex flex-col gap-4">
      <Link
        href="/persone"
        className="inline-flex min-h-touch items-center gap-1 self-start text-subhead font-semibold text-accent-text"
      >
        <ArrowLeft className="size-4" aria-hidden="true" /> {p.back}
      </Link>
      <GlassCard className="flex flex-wrap items-center gap-4">
        <Avatar name={person.name} src={person.avatarUrl} size="lg" online={isOnline} />
        <div className="min-w-0 flex-1">
          <h1 tabIndex={-1} className="text-large font-bold tracking-tight text-fg outline-none">
            <PersonName color={person.nameColor}>{person.name}</PersonName>
            {person.id === me?.id ? ` (${p.you})` : ''}
          </h1>
          <p className="flex flex-wrap items-center gap-2 text-subhead text-muted">
            <span>{isOnline ? it.home.online : it.home.offline}</span>
            {person.statusText && <span>· {person.statusText}</span>}
            {person.admin && <Badge tone="accent">{p.admin}</Badge>}
          </p>
          <p className="text-footnote text-muted">
            {p.memberSince(dateFormat().format(new Date(person.memberSince)))}
            {person.githubLogin ? ` · ${p.github(person.githubLogin)}` : ''}
          </p>
        </div>
      </GlassCard>
      <div className="grid gap-4 md:grid-cols-2">
        <Section id="person-bio" title={p.bio}>
          <p className="text-body whitespace-pre-line text-fg">{person.bio || p.noBio}</p>
        </Section>
        <Section id="person-stats" title={p.stats}>
          <dl className="grid grid-cols-2 gap-3">
            <div className="rounded-control bg-neutral-soft p-3">
              <dt className="text-footnote text-muted">{p.tasksCompleted}</dt>
              <dd className="text-title2 font-bold text-fg">{person.stats.tasksCompleted}</dd>
            </div>
            <div className="rounded-control bg-neutral-soft p-3">
              <dt className="text-footnote text-muted">{p.runs}</dt>
              <dd className="text-title2 font-bold text-fg">{person.stats.runs}</dd>
            </div>
          </dl>
          <p className="text-footnote text-muted">{p.statsHelp}</p>
        </Section>
        <Section id="person-projects" title={p.projects}>
          {person.projects.length ? (
            <ul className="flex flex-col gap-1">
              {person.projects.map((proj) => (
                <li key={proj.id}>
                  <Link
                    href={`/progetti?id=${encodeURIComponent(proj.id)}`}
                    className="flex min-h-touch items-center gap-2 rounded-control px-2 text-subhead text-fg hover:bg-neutral-soft"
                  >
                    <FolderKanban className="size-4 text-accent-text" aria-hidden="true" />
                    {proj.name}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-subhead text-muted">{p.noProjects}</p>
          )}
        </Section>
        <Section id="person-repos" title={p.repos}>
          {person.repos.length ? (
            <ul className="flex flex-col gap-1">
              {person.repos.map((repo) => (
                <li key={repo.id}>
                  <a
                    href={repo.htmlUrl}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={p.openRepo(repo.fullName)}
                    className="flex min-h-touch items-center gap-2 rounded-control px-2 text-subhead text-fg hover:bg-neutral-soft"
                  >
                    <span className="min-w-0 flex-1 truncate">{repo.fullName}</span>
                    <ExternalLink className="size-4 text-muted" aria-hidden="true" />
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-subhead text-muted">{p.noRepos}</p>
          )}
        </Section>
      </div>
      <Section id="person-activity" title={p.activity}>
        {person.activity.length ? (
          <ul className="flex flex-col gap-3">
            {person.activity.map((e) => (
              <ActivityLine key={e.id} event={e} />
            ))}
          </ul>
        ) : (
          <p className="text-subhead text-muted">{p.noActivity}</p>
        )}
      </Section>
    </div>
  );
}

function PeopleList() {
  const people = usePeople();
  const { online } = useGroupLive();
  return (
    <>
      <PageHeader title={p.title} subtitle={p.subtitle} />
      {!people.data ? (
        <SkeletonList rows={4} />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {people.data.map((person) => (
            <li key={person.id}>
              <GlassCard
                as={Link}
                href={`/persone?id=${encodeURIComponent(person.id)}`}
                interactive
                className="flex items-center gap-3"
              >
                <Avatar
                  name={person.name}
                  src={person.avatarUrl}
                  online={online.includes(person.id)}
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-headline text-fg">
                    <PersonName color={person.nameColor}>{person.name}</PersonName>
                  </span>
                  <span className="block truncate text-footnote text-muted">
                    {online.includes(person.id) ? it.home.online : it.home.offline}
                    {person.statusText ? ` · ${person.statusText}` : ''}
                  </span>
                </span>
              </GlassCard>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/** Persone: the group, then a rich profile (`?id=`), limited to what you may see. */
export function PeopleView() {
  const id = useSearchParams().get('id');
  const person = usePerson(id);
  if (!id) return <PeopleList />;
  if (person.isError)
    return (
      <>
        <PageHeader title={p.title} />
        <EmptyState title={p.notFound} body={person.error.message} />
      </>
    );
  if (!person.data)
    return (
      <>
        <h1 className="sr-only">{p.title}</h1>
        <SkeletonList rows={4} />
      </>
    );
  return <Profile person={person.data} />;
}
