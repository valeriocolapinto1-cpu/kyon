'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, LogOut, Plus, Shield, ShieldOff } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Avatar } from '@/components/ui/Avatar';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { CopyField } from '@/components/ui/CopyField';
import { FormError } from '@/components/ui/FormError';
import { GlassButton } from '@/components/ui/GlassButton';
import { GlassCard } from '@/components/ui/GlassCard';
import { GlassInput } from '@/components/ui/GlassInput';
import { GlassTextarea } from '@/components/ui/GlassTextarea';
import { Sheet } from '@/components/ui/Sheet';
import { SkeletonList } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { ApiClientError, api } from '@/lib/client/api';
import type { Me } from '@/lib/client/me';
import { relativeTime } from '@/lib/format/relative';
import { it } from '@/lib/i18n/it';

const t = it.admin;
type InviteState = 'valid' | 'used' | 'revoked' | 'expired';
interface Invite {
  id: string;
  note: string | null;
  state: InviteState;
  createdAt: string;
  expiresAt: string;
  usedByName: string | null;
}
interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'user';
  createdAt: string;
  activeSessions: number;
  lastSeenAt: string | null;
}

const stateTone: Record<InviteState, BadgeTone> = {
  valid: 'success',
  used: 'neutral',
  revoked: 'danger',
  expired: 'warning',
};
const message = (error: unknown) =>
  error instanceof ApiClientError ? error.message : it.common.errorBody;

function Invites() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const invites = useQuery({
    queryKey: ['admin', 'invites'],
    queryFn: () => api<{ invites: Invite[] }>('/api/admin/invites'),
  });
  const [created, setCreated] = useState<{ url: string } | null>(null);
  const create = useMutation({
    mutationFn: (note: string | null) =>
      api<{ url: string }>('/api/admin/invites', { method: 'POST', json: { note } }),
    onSuccess: (data) => {
      setCreated(data);
      void queryClient.invalidateQueries({ queryKey: ['admin', 'invites'] });
    },
  });
  const revoke = useMutation({
    mutationFn: (id: string) => api(`/api/admin/invites/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast({ title: t.inviteRevoked, tone: 'success' });
      void queryClient.invalidateQueries({ queryKey: ['admin', 'invites'] });
    },
  });
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formEl = event.currentTarget;
    const note = String(new FormData(formEl).get('note') ?? '').trim();
    create.mutate(note || null, { onSuccess: () => formEl.reset() });
  };

  return (
    <GlassCard as="section" aria-labelledby="admin-invites" className="flex flex-col gap-4">
      <div>
        <h3 id="admin-invites" className="text-headline text-fg">
          {t.invites}
        </h3>
        <p className="text-subhead text-muted">{t.invitesHelp}</p>
      </div>
      <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3">
        <GlassInput label={t.inviteNote} name="note" maxLength={80} className="min-w-48 flex-1" />
        <GlassButton type="submit" variant="primary" disabled={create.isPending}>
          <Plus className="size-5" aria-hidden="true" /> {t.newInvite}
        </GlassButton>
      </form>
      <FormError message={create.error ? message(create.error) : null} />
      {invites.isPending ? (
        <SkeletonList rows={2} />
      ) : invites.data?.invites.length ? (
        <ul className="flex flex-col divide-y divide-separator">
          {invites.data.invites.map((inv) => (
            <li key={inv.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
              <div>
                <p className="text-body text-fg">
                  {inv.note ?? '—'} <Badge tone={stateTone[inv.state]}>{t.states[inv.state]}</Badge>
                </p>
                <p className="text-footnote text-muted">
                  {inv.state === 'used' && inv.usedByName
                    ? t.usedBy(inv.usedByName)
                    : t.expires(relativeTime(inv.expiresAt))}
                </p>
              </div>
              {inv.state === 'valid' && (
                <GlassButton
                  size="sm"
                  variant="plain"
                  onClick={() => revoke.mutate(inv.id)}
                  disabled={revoke.isPending}
                >
                  {t.revokeInvite}
                </GlassButton>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-subhead text-muted">{t.noInvites}</p>
      )}
      <Sheet
        open={created !== null}
        onOpenChange={(open) => !open && setCreated(null)}
        title={t.inviteCreated}
        description={t.inviteCreatedHelp}
      >
        {created && <CopyField label={t.copyLink} value={created.url} />}
      </Sheet>
    </GlassCard>
  );
}

function Users({ me }: { me: Me }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const users = useQuery({
    queryKey: ['admin', 'users'],
    queryFn: () => api<{ users: AdminUser[] }>('/api/admin/users'),
  });
  const [resetLink, setResetLink] = useState<string | null>(null);
  const [confirmLogout, setConfirmLogout] = useState<AdminUser | null>(null);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
  const setRole = useMutation({
    mutationFn: ({ id, role }: { id: string; role: 'admin' | 'user' }) =>
      api(`/api/admin/users/${id}`, { method: 'PATCH', json: { role } }),
    onSuccess: () => void refresh(),
    onError: (error) => toast({ title: message(error), tone: 'error' }),
  });
  const reset = useMutation({
    mutationFn: (id: string) =>
      api<{ url: string }>(`/api/admin/users/${id}/reset-link`, { method: 'POST' }),
    onSuccess: (data) => setResetLink(data.url),
    onError: (error) => toast({ title: message(error), tone: 'error' }),
  });
  const logoutAll = useMutation({
    mutationFn: (id: string) => api(`/api/admin/users/${id}/sessions`, { method: 'DELETE' }),
    onSuccess: () => {
      setConfirmLogout(null);
      toast({ title: t.loggedOutEverywhere, tone: 'success' });
      void refresh();
    },
  });

  return (
    <GlassCard as="section" aria-labelledby="admin-users" className="flex flex-col gap-4">
      <h3 id="admin-users" className="text-headline text-fg">
        {t.users}
      </h3>
      {users.isPending ? (
        <SkeletonList rows={3} />
      ) : (
        <ul className="flex flex-col divide-y divide-separator">
          {users.data?.users.map((u) => (
            <li
              key={u.id}
              className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex items-center gap-3">
                <Avatar name={u.name} />
                <div>
                  <p className="text-body text-fg">
                    {u.name}{' '}
                    <Badge tone={u.role === 'admin' ? 'accent' : 'neutral'}>
                      {u.role === 'admin' ? t.roleAdmin : t.roleUser}
                    </Badge>
                  </p>
                  <p className="text-footnote text-muted">
                    {u.email} · {t.sessionsCount(u.activeSessions)}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-1">
                {u.id !== me.id && (
                  <GlassButton
                    size="sm"
                    variant="plain"
                    onClick={() =>
                      setRole.mutate({ id: u.id, role: u.role === 'admin' ? 'user' : 'admin' })
                    }
                  >
                    {u.role === 'admin' ? (
                      <ShieldOff className="size-4" aria-hidden="true" />
                    ) : (
                      <Shield className="size-4" aria-hidden="true" />
                    )}
                    {u.role === 'admin' ? t.makeUser : t.makeAdmin}
                  </GlassButton>
                )}
                <GlassButton size="sm" variant="plain" onClick={() => reset.mutate(u.id)}>
                  <KeyRound className="size-4" aria-hidden="true" /> {t.resetLink}
                </GlassButton>
                <GlassButton size="sm" variant="plain" onClick={() => setConfirmLogout(u)}>
                  <LogOut className="size-4" aria-hidden="true" /> {t.logoutEverywhere}
                </GlassButton>
              </div>
            </li>
          ))}
        </ul>
      )}
      <Sheet
        open={resetLink !== null}
        onOpenChange={(open) => !open && setResetLink(null)}
        title={t.resetLink}
        description={t.resetLinkCreated}
      >
        {resetLink && <CopyField label={t.copyLink} value={resetLink} />}
      </Sheet>
      <Sheet
        open={confirmLogout !== null}
        onOpenChange={(open) => !open && setConfirmLogout(null)}
        title={t.confirmLogoutTitle}
        description={confirmLogout ? t.confirmLogoutBody(confirmLogout.name) : undefined}
        footer={
          <>
            <GlassButton variant="plain" onClick={() => setConfirmLogout(null)}>
              {it.common.cancel}
            </GlassButton>
            <GlassButton
              variant="danger"
              onClick={() => confirmLogout && logoutAll.mutate(confirmLogout.id)}
              disabled={logoutAll.isPending}
            >
              {t.logoutEverywhere}
            </GlassButton>
          </>
        }
      >
        <span />
      </Sheet>
    </GlassCard>
  );
}

function PromptFooter() {
  const a = it.admin2;
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const footer = useQuery({
    queryKey: ['admin', 'prompt-footer'],
    queryFn: () => api<{ footer: string; custom: boolean }>('/api/admin/prompt-footer'),
  });
  const save = useMutation({
    mutationFn: (value: string) =>
      api<{ footer: string; custom: boolean }>('/api/admin/prompt-footer', {
        method: 'PUT',
        json: { footer: value },
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(['admin', 'prompt-footer'], data);
      toast({ tone: 'success', title: a.footerSaved });
    },
  });
  return (
    <GlassCard
      as="section"
      aria-labelledby="admin-footer"
      className="flex flex-col gap-4 lg:col-span-2"
    >
      <h3 id="admin-footer" className="text-title3 font-semibold text-fg">
        {a.footerTitle}
      </h3>
      {footer.isPending ? (
        <SkeletonList rows={2} />
      ) : (
        <form
          key={footer.data?.footer}
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            save.mutate(String(new FormData(event.currentTarget).get('footer') ?? ''));
          }}
        >
          <GlassTextarea
            label={a.footerTitle}
            hint={a.footerHelp}
            name="footer"
            rows={10}
            defaultValue={footer.data?.footer ?? ''}
            maxLength={10_000}
            className="[&_textarea]:font-mono"
          />
          <FormError
            message={
              save.error instanceof ApiClientError
                ? save.error.message
                : save.error
                  ? it.common.errorBody
                  : null
            }
          />
          <div className="flex flex-wrap gap-2">
            <GlassButton type="submit" variant="primary" size="sm" disabled={save.isPending}>
              {a.footerSave}
            </GlassButton>
            {footer.data?.custom && (
              <GlassButton size="sm" variant="plain" onClick={() => save.mutate('')}>
                {a.footerReset}
              </GlassButton>
            )}
          </div>
        </form>
      )}
    </GlassCard>
  );
}

export function AdminPanel({ me }: { me: Me }) {
  return (
    <section aria-labelledby="admin-title" className="flex flex-col gap-4">
      <h2 id="admin-title" className="text-title2 font-semibold text-fg">
        {t.title}
      </h2>
      <div className="grid gap-6 lg:grid-cols-2">
        <Invites />
        <Users me={me} />
        <PromptFooter />
      </div>
    </section>
  );
}
