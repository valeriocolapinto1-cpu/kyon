'use client';

import { Loader2, Paperclip, SendHorizontal, X } from 'lucide-react';
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import {
  ATTACHMENT_ACCEPT,
  MAX_ATTACHMENT_BYTES,
  filterMentionable,
  mentionQuery,
  type Mentionable,
} from '@kyon/core';
import { GlassButton } from '@/components/ui/GlassButton';
import { useToast } from '@/components/ui/Toast';
import { ApiClientError } from '@/lib/client/api';
import { uploadAttachment, type ChatAttachment, type ChatMessage } from '@/lib/client/chat';
import { useMediaQuery } from '@/lib/hooks/useMediaQuery';
import { cn } from '@/lib/cn';
import { it } from '@/lib/i18n/it';

const c = it.chat;

interface PendingFile {
  key: string;
  file: File;
  alt: string;
  status: 'uploading' | 'ready' | 'error';
  attachment?: ChatAttachment;
}

export interface ComposerProps {
  roomId: string;
  label: string;
  people: Mentionable[];
  replyTo: ChatMessage | null;
  editing: ChatMessage | null;
  onCancel: () => void;
  onSend: (body: string, attachments: ChatAttachment[]) => Promise<void>;
  onSaveEdit: (message: ChatMessage, body: string) => Promise<void>;
  onTyping: () => void;
}

export function Composer({
  roomId,
  label,
  people,
  replyTo,
  editing,
  onCancel,
  onSend,
  onSaveEdit,
  onTyping,
}: ComposerProps) {
  const { toast } = useToast();
  const id = useId();
  const area = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [suggest, setSuggest] = useState<{
    start: number;
    options: Mentionable[];
    active: number;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  // On phones Enter goes to a new line (the keyboard has no Shift habit); the button sends.
  const coarse = useMediaQuery('(pointer: coarse)');
  const [editingFor, setEditingFor] = useState<string | null>(null);

  if ((editing?.id ?? null) !== editingFor) {
    setEditingFor(editing?.id ?? null);
    setText(editing ? editing.body : '');
  }

  // Auto-grow up to ~6 lines.
  useEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 168)}px`;
  }, [text]);

  useEffect(() => {
    if (replyTo || editing) area.current?.focus();
  }, [replyTo, editing]);

  const updateSuggestions = (value: string, caret: number) => {
    const q = mentionQuery(value, caret);
    const options = q ? filterMentionable(people, q.query) : [];
    setSuggest(q && options.length ? { start: q.start, options, active: 0 } : null);
  };

  const pick = (person: Mentionable) => {
    if (!suggest) return;
    const el = area.current;
    const caret = el?.selectionStart ?? text.length;
    const next = `${text.slice(0, suggest.start)}@${person.name} ${text.slice(caret)}`;
    setText(next);
    setSuggest(null);
    const pos = suggest.start + person.name.length + 2;
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(pos, pos);
    });
  };

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    for (const file of [...list].slice(0, 10 - files.length)) {
      // Images are resized before upload, so only non-images are refused here by size.
      if (!file.type.startsWith('image/') && file.size > MAX_ATTACHMENT_BYTES) {
        toast({ tone: 'error', title: c.tooLarge(file.name) });
        continue;
      }
      const key = crypto.randomUUID();
      setFiles((current) => [...current, { key, file, alt: '', status: 'uploading' }]);
      uploadAttachment(roomId, file, null).then(
        (attachment) =>
          setFiles((current) =>
            current.map((f) => (f.key === key ? { ...f, status: 'ready', attachment } : f)),
          ),
        (error: unknown) => {
          setFiles((current) => current.filter((f) => f.key !== key));
          toast({
            tone: 'error',
            title: error instanceof ApiClientError ? error.message : c.failed,
          });
        },
      );
    }
  };

  const submit = async () => {
    const body = text.trim();
    if (busy) return;
    if (editing) {
      if (!body) return;
      setBusy(true);
      try {
        await onSaveEdit(editing, body);
        setText('');
      } finally {
        setBusy(false);
      }
      return;
    }
    const ready = files.filter((f) => f.status === 'ready' && f.attachment);
    if (files.some((f) => f.status === 'uploading')) return;
    if (!body && !ready.length) return;
    setText('');
    setFiles([]);
    setSuggest(null);
    try {
      await onSend(
        body,
        ready.map((f) => ({ ...(f.attachment as ChatAttachment), alt: f.alt || null })),
      );
    } catch (error) {
      toast({ tone: 'error', title: error instanceof ApiClientError ? error.message : c.failed });
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (suggest) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const step = event.key === 'ArrowDown' ? 1 : -1;
        setSuggest({
          ...suggest,
          active: (suggest.active + step + suggest.options.length) % suggest.options.length,
        });
        return;
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault();
        const person = suggest.options[suggest.active];
        if (person) pick(person);
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        setSuggest(null);
        return;
      }
    }
    if (event.key === 'Escape' && (replyTo || editing)) {
      event.preventDefault();
      onCancel();
      return;
    }
    if (event.key === 'Enter' && !event.shiftKey && !coarse && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void submit();
    }
  };

  const listboxId = `${id}-mentions`;
  const banner = editing
    ? c.editing
    : replyTo
      ? c.replyingTo(replyTo.author?.name ?? c.someone)
      : null;

  return (
    <div className="flex flex-col gap-2">
      {banner && (
        <div className="flex items-center justify-between gap-2 rounded-control bg-neutral-soft px-3 py-1">
          <p className="min-w-0 truncate text-footnote text-fg">
            <span className="font-semibold">{banner}</span>
            {replyTo && !editing && (
              <span className="text-muted"> · {replyTo.body.slice(0, 80)}</span>
            )}
          </p>
          <button
            type="button"
            onClick={onCancel}
            aria-label={editing ? c.cancelEdit : c.cancelReply}
            className="inline-flex size-touch shrink-0 items-center justify-center rounded-full text-muted"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
      )}
      {files.length > 0 && (
        <ul className="flex flex-col gap-2">
          {files.map((f) => (
            <li
              key={f.key}
              className="flex flex-wrap items-center gap-2 rounded-control border border-border bg-surface-solid p-2"
            >
              {f.status === 'uploading' && (
                <Loader2 className="size-4 animate-spin text-muted" aria-hidden="true" />
              )}
              <span
                className="min-w-0 flex-1 truncate text-footnote text-fg"
                role={f.status === 'uploading' ? 'status' : undefined}
              >
                {f.status === 'uploading' ? c.uploading(f.file.name) : f.file.name}
              </span>
              {f.file.type.startsWith('image/') && (
                <input
                  aria-label={c.attachAlt(f.file.name)}
                  placeholder={c.attachAlt(f.file.name)}
                  value={f.alt}
                  maxLength={300}
                  onChange={(event) =>
                    setFiles((current) =>
                      current.map((x) => (x.key === f.key ? { ...x, alt: event.target.value } : x)),
                    )
                  }
                  className="min-h-touch w-full rounded-control border border-input-border bg-surface-solid px-3 text-[1rem] text-fg sm:w-64"
                />
              )}
              <button
                type="button"
                aria-label={c.removeAttachment(f.file.name)}
                onClick={() => setFiles((current) => current.filter((x) => x.key !== f.key))}
                className="inline-flex size-touch items-center justify-center rounded-full text-muted"
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="relative flex items-end gap-2">
        {!editing && (
          <>
            <input
              ref={fileInput}
              type="file"
              multiple
              accept={ATTACHMENT_ACCEPT}
              className="sr-only"
              tabIndex={-1}
              aria-hidden="true"
              onChange={(event) => {
                addFiles(event.target.files);
                event.target.value = '';
              }}
            />
            <GlassButton
              size="icon"
              aria-label={c.attach}
              onClick={() => fileInput.current?.click()}
            >
              <Paperclip className="size-5" aria-hidden="true" />
            </GlassButton>
          </>
        )}
        <div className="relative min-w-0 flex-1">
          <label htmlFor={`${id}-text`} className="sr-only">
            {label}
          </label>
          <textarea
            ref={area}
            id={`${id}-text`}
            value={text}
            rows={1}
            placeholder={label}
            aria-describedby={`${id}-hint`}
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={Boolean(suggest)}
            aria-controls={suggest ? listboxId : undefined}
            aria-activedescendant={suggest ? `${listboxId}-${suggest.active}` : undefined}
            onChange={(event) => {
              setText(event.target.value);
              updateSuggestions(event.target.value, event.target.selectionStart);
              onTyping();
            }}
            onKeyDown={onKeyDown}
            onPaste={(event) => {
              if (event.clipboardData.files.length) {
                event.preventDefault();
                addFiles(event.clipboardData.files);
              }
            }}
            className="block max-h-42 min-h-touch w-full resize-none rounded-[1.375rem] border border-input-border bg-surface-solid px-4 py-2.5 text-[1rem] leading-6 text-fg placeholder:text-muted"
          />
          <p id={`${id}-hint`} className="sr-only">
            {c.composerHint}
          </p>
          {suggest && (
            <ul
              id={listboxId}
              role="listbox"
              aria-label={c.mentionSuggestions}
              className="k-chrome absolute bottom-full left-0 z-30 mb-2 w-64 rounded-card p-1"
            >
              {suggest.options.map((person, i) => (
                <li
                  key={person.id}
                  id={`${listboxId}-${i}`}
                  role="option"
                  aria-selected={i === suggest.active}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    pick(person);
                  }}
                  className={cn(
                    'flex min-h-touch cursor-pointer items-center rounded-control px-3 text-body text-fg',
                    i === suggest.active && 'bg-accent-soft',
                  )}
                >
                  @{person.name}
                </li>
              ))}
            </ul>
          )}
        </div>
        <GlassButton
          variant="primary"
          size="icon"
          aria-label={editing ? c.save : c.send}
          disabled={busy || files.some((f) => f.status === 'uploading')}
          onClick={() => void submit()}
        >
          <SendHorizontal className="size-5" aria-hidden="true" />
        </GlassButton>
      </div>
    </div>
  );
}
