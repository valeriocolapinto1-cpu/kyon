'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Camera, LogOut, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useRef, useState, type FormEvent } from 'react';
import { isAccentId } from '@kyon/core';
import { Avatar } from '@/components/ui/Avatar';
import { ColorSwatchPicker } from '@/components/ui/ColorSwatchPicker';
import { FormError } from '@/components/ui/FormError';
import { GlassButton } from '@/components/ui/GlassButton';
import { GlassCard } from '@/components/ui/GlassCard';
import { GlassInput } from '@/components/ui/GlassInput';
import { PasswordField } from '@/components/ui/PasswordField';
import { PersonName } from '@/components/ui/PersonName';
import { useToast } from '@/components/ui/Toast';
import { ApiClientError, api } from '@/lib/client/api';
import { changeEmail, changePassword, signOut } from '@/lib/client/auth';
import { resizeImage } from '@/lib/client/image';
import { meKey, type Me } from '@/lib/client/me';
import { passwordError } from '@/lib/client/passwordRules';
import { it } from '@/lib/i18n/it';
import { usePreferences } from '@/lib/preferences/context';

const a = it.account;
const message = (error: unknown) =>
  error instanceof ApiClientError ? error.message : it.common.errorBody;

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
    <GlassCard as="section" aria-labelledby={id} className="flex flex-col gap-4">
      <h2 id={id} className="text-title3 font-semibold text-fg">
        {title}
      </h2>
      {children}
    </GlassCard>
  );
}

function ProfileForm({ me }: { me: Me }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const { resolved } = usePreferences();
  const scheme = resolved['data-scheme'] === 'dark' ? 'dark' : 'light';
  const nameColorMutation = useMutation({
    mutationFn: (nameColor: string | null) =>
      api<Me>('/api/me', { method: 'PATCH', json: { nameColor } }),
    onSuccess: (data) => {
      queryClient.setQueryData(meKey, data);
      void queryClient.invalidateQueries({ queryKey: ['people'] });
      toast({ title: a.saved, tone: 'success' });
    },
  });
  const save = useMutation({
    mutationFn: (body: { name: string; bio: string | null; statusText: string | null }) =>
      api<Me>('/api/me', { method: 'PATCH', json: body }),
    onSuccess: (data) => {
      queryClient.setQueryData(meKey, data);
      toast({ title: a.saved, tone: 'success' });
    },
  });
  const avatar = useMutation({
    mutationFn: async (file: File | null) => {
      if (!file) return api<Me>('/api/me/avatar', { method: 'DELETE' });
      const blob = await resizeImage(file, 512);
      return api<Me>('/api/me/avatar', {
        method: 'PUT',
        body: blob,
        headers: { 'content-type': blob.type },
      });
    },
    onSuccess: (data) => queryClient.setQueryData(meKey, data),
  });

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    save.mutate({
      name: String(form.get('name') ?? ''),
      bio: String(form.get('bio') ?? '') || null,
      statusText: String(form.get('statusText') ?? '') || null,
    });
  };

  return (
    <Section id="account-profile" title={a.profile}>
      <div className="flex flex-wrap items-center gap-4">
        <Avatar name={me.name} src={me.avatarUrl} size="lg" />
        <div className="flex flex-wrap gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="sr-only"
            aria-label={a.changeAvatar}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) avatar.mutate(file);
              e.target.value = '';
            }}
          />
          <GlassButton
            size="sm"
            onClick={() => fileRef.current?.click()}
            disabled={avatar.isPending}
          >
            <Camera className="size-4" aria-hidden="true" /> {a.changeAvatar}
          </GlassButton>
          {me.avatarUrl && (
            <GlassButton
              size="sm"
              variant="plain"
              onClick={() => avatar.mutate(null)}
              disabled={avatar.isPending}
            >
              <Trash2 className="size-4" aria-hidden="true" /> {a.removeAvatar}
            </GlassButton>
          )}
        </div>
      </div>
      <FormError
        message={avatar.error ? message(avatar.error) : save.error ? message(save.error) : null}
      />
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <GlassInput
          label={it.auth.name}
          name="name"
          defaultValue={me.name}
          required
          maxLength={60}
          autoComplete="name"
        />
        <GlassInput
          label={a.status}
          name="statusText"
          defaultValue={me.statusText ?? ''}
          placeholder={a.statusPlaceholder}
          maxLength={60}
        />
        <GlassInput
          label={a.bio}
          name="bio"
          defaultValue={me.bio ?? ''}
          placeholder={a.bioPlaceholder}
          maxLength={280}
        />
        <GlassButton
          type="submit"
          variant="primary"
          disabled={save.isPending}
          className="self-start"
        >
          {a.save}
        </GlassButton>
      </form>
      <div className="flex flex-col gap-3">
        <p className="text-subhead font-medium text-fg" id="name-color-label">
          {a.nameColor}:{' '}
          <PersonName color={me.nameColor} className="font-semibold text-fg">
            {me.name}
          </PersonName>
        </p>
        <p className="text-footnote text-muted">{a.nameColorHelp}</p>
        <ColorSwatchPicker
          label={a.nameColor}
          value={isAccentId(me.nameColor) ? me.nameColor : null}
          scheme={scheme}
          onChange={(nameColor) => nameColorMutation.mutate(nameColor)}
        />
        {me.nameColor && (
          <GlassButton
            size="sm"
            variant="plain"
            className="self-start"
            onClick={() => nameColorMutation.mutate(null)}
          >
            {a.nameColorReset}
          </GlassButton>
        )}
      </div>
    </Section>
  );
}

function EmailForm({ me }: { me: Me }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formEl = event.currentTarget;
    const form = new FormData(formEl);
    setBusy(true);
    setError(null);
    try {
      const updated = await changeEmail(
        me.email,
        String(form.get('newEmail') ?? ''),
        String(form.get('password') ?? ''),
      );
      queryClient.setQueryData(meKey, updated);
      formEl.reset();
      toast({ title: a.emailChanged, tone: 'success' });
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" aria-labelledby="account-email-title">
      <h3 id="account-email-title" className="text-headline text-fg">
        {a.emailSection}: <span className="font-normal text-muted">{me.email}</span>
      </h3>
      <FormError message={error} />
      <GlassInput label={a.newEmail} name="newEmail" type="email" autoComplete="email" required />
      <PasswordField
        label={a.currentPassword}
        name="password"
        autoComplete="current-password"
        required
      />
      <GlassButton type="submit" disabled={busy} className="self-start">
        {a.changeEmail}
      </GlassButton>
    </form>
  );
}

function PasswordForm({ me }: { me: Me }) {
  const { toast } = useToast();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formEl = event.currentTarget;
    const form = new FormData(formEl);
    const next = String(form.get('next') ?? '');
    const problem = passwordError(next, String(form.get('confirm') ?? ''));
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await changePassword(me.email, String(form.get('current') ?? ''), next);
      formEl.reset();
      toast({ title: a.passwordChanged, tone: 'success' });
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-col gap-4"
      aria-labelledby="account-password-title"
    >
      <h3 id="account-password-title" className="text-headline text-fg">
        {a.passwordSection}
      </h3>
      <FormError message={error} />
      <input
        type="email"
        name="username"
        autoComplete="username"
        value={me.email}
        readOnly
        hidden
      />
      <PasswordField
        label={a.currentPassword}
        name="current"
        autoComplete="current-password"
        required
      />
      <PasswordField
        label={it.auth.newPassword}
        name="next"
        autoComplete="new-password"
        hint={it.auth.passwordHint}
        required
      />
      <PasswordField
        label={it.auth.confirmPassword}
        name="confirm"
        autoComplete="new-password"
        required
      />
      <GlassButton type="submit" disabled={busy} className="self-start">
        {a.changePassword}
      </GlassButton>
    </form>
  );
}

export function AccountSettings({ me }: { me: Me }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const logout = async () => {
    try {
      await signOut();
    } finally {
      queryClient.clear();
      router.replace('/login');
    }
  };
  return (
    <div className="flex flex-col gap-6">
      <ProfileForm me={me} />
      <Section id="account-security" title={a.title}>
        <EmailForm me={me} />
        <hr className="border-separator" />
        <PasswordForm me={me} />
        <hr className="border-separator" />
        <GlassButton variant="danger" onClick={logout} className="self-start">
          <LogOut className="size-5" aria-hidden="true" /> {it.auth.logout}
        </GlassButton>
      </Section>
    </div>
  );
}
