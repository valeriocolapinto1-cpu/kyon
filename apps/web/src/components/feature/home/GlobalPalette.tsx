'use client';

import { CheckSquare, FileText, FolderKanban, MessageSquareText } from 'lucide-react';
import { useState } from 'react';
import { CommandPalette, type CommandItem } from '@/components/ui/CommandPalette';
import { messageHref, taskHref, useGlobalSearch } from '@/lib/client/home';
import { it } from '@/lib/i18n/it';

const s = it.search;

/** Cmd/Ctrl+K: local commands plus server results (loaded the first time it opens). */
export default function GlobalPalette({
  open,
  onOpenChange,
  commands,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  commands: CommandItem[];
}) {
  const [query, setQuery] = useState('');
  const search = useGlobalSearch(open ? query : '');
  const remote: CommandItem[] = search.data
    ? [
        ...search.data.projects.map((p) => ({
          id: `project-${p.id}`,
          label: p.name,
          group: s.groupProjects,
          href: `/progetti?id=${encodeURIComponent(p.id)}`,
          icon: <FolderKanban className="size-5" />,
        })),
        ...search.data.tasks.map((t) => ({
          id: `task-${t.id}`,
          label: `${t.text}${t.done ? ` ${s.doneTask}` : ''} ${s.inProject(t.projectName)}`,
          group: s.groupTasks,
          href: taskHref(t.projectId, t.id),
          icon: <CheckSquare className="size-5" />,
        })),
        ...search.data.prompts.map((p) => ({
          id: `prompt-${p.id}`,
          label: `${p.title} ${s.inProject(p.projectName)}`,
          group: s.groupPrompts,
          href: `/progetti?id=${encodeURIComponent(p.projectId)}&tab=prompt&prompt=${encodeURIComponent(p.id)}`,
          icon: <FileText className="size-5" />,
        })),
        ...search.data.messages.map((m) => ({
          id: `message-${m.id}`,
          label: `${m.author?.name ?? it.chat.someone}: ${m.body.slice(0, 80)}`,
          group: s.groupMessages,
          href: messageHref(m.roomId, m.projectId, m.taskId),
          icon: <MessageSquareText className="size-5" />,
        })),
      ]
    : [];
  return (
    <CommandPalette
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) setQuery('');
      }}
      items={commands}
      query={query}
      onQueryChange={setQuery}
      remoteItems={remote}
      loading={search.isFetching}
    />
  );
}
