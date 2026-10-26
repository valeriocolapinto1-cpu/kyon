'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { EmptyState } from '@/components/ui/EmptyState';
import { FormError } from '@/components/ui/FormError';
import { GlassButton } from '@/components/ui/GlassButton';
import { GlassCard } from '@/components/ui/GlassCard';
import { PasswordField } from '@/components/ui/PasswordField';
import { SkeletonList } from '@/components/ui/Skeleton';
import { ApiClientError, api } from '@/lib/client/api';
import { resetPassword } from '@/lib/client/auth';
import { passwordError } from '@/lib/client/passwordRules';
import { it } from '@/lib/i18n/it';

export function ResetForm({ token }: { token: string }) {
  const info = useQuery({
    queryKey: ['reset', token],
    queryFn: () => api<{ email: string }>(`/api/reset/${encodeURIComponent(token)}`),
    retry: false,
  });
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  if (info.isPending) return <SkeletonList rows={2} />;
  const toLogin = (
    <Link href="/login" className="font-semibold text-accent-text">
      {it.auth.toLogin}
    </Link>
  );
  if (info.isError)
    return (
      <EmptyState
        title={it.auth.resetTitle}
        body={info.error.message || it.auth.resetInvalid}
        action={toLogin}
      />
    );
  if (done)
    return <EmptyState title={it.auth.resetTitle} body={it.auth.resetDone} action={toLogin} />;

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const password = String(form.get('password') ?? '');
    const problem = passwordError(password, String(form.get('confirm') ?? ''));
    setFieldError(problem);
    if (problem) return;
    setBusy(true);
    setError(null);
    try {
      await resetPassword(token, info.data.email, password);
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : it.common.errorBody);
      setBusy(false);
    }
  };

  return (
    <GlassCard className="flex flex-col gap-5 p-6">
      <div>
        <h1 className="text-title2 font-bold text-fg">{it.auth.resetTitle}</h1>
        <p className="text-subhead text-muted">{it.auth.resetSubtitle(info.data.email)}</p>
      </div>
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <FormError message={error} />
        <input
          type="email"
          name="username"
          autoComplete="username"
          value={info.data.email}
          readOnly
          hidden
        />
        <PasswordField
          label={it.auth.newPassword}
          name="password"
          autoComplete="new-password"
          hint={it.auth.passwordHint}
          required
        />
        <PasswordField
          label={it.auth.confirmPassword}
          name="confirm"
          autoComplete="new-password"
          error={fieldError ?? undefined}
          required
        />
        <GlassButton type="submit" variant="primary" disabled={busy} className="justify-center">
          {it.auth.resetSave}
        </GlassButton>
      </form>
    </GlassCard>
  );
}

export function ResetPage() {
  const token = useSearchParams().get('token') ?? '';
  return <ResetForm token={token} />;
}
