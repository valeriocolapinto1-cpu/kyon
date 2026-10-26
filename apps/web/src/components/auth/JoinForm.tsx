'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { EmptyState } from '@/components/ui/EmptyState';
import { FormError } from '@/components/ui/FormError';
import { GlassButton } from '@/components/ui/GlassButton';
import { GlassCard } from '@/components/ui/GlassCard';
import { GlassInput } from '@/components/ui/GlassInput';
import { PasswordField } from '@/components/ui/PasswordField';
import { SkeletonList } from '@/components/ui/Skeleton';
import { ApiClientError } from '@/lib/client/api';
import { checkInvite, join } from '@/lib/client/auth';
import { passwordError } from '@/lib/client/passwordRules';
import { it } from '@/lib/i18n/it';

export function JoinForm({ code }: { code: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const invite = useQuery({
    queryKey: ['invite', code],
    queryFn: () => checkInvite(code),
    retry: false,
  });
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (invite.isPending) return <SkeletonList rows={3} />;
  if (invite.isError || !invite.data.valid) {
    return (
      <EmptyState
        title={it.auth.joinInvalidTitle}
        body={
          invite.error instanceof ApiClientError && invite.error.code === 'rate_limited'
            ? invite.error.message
            : it.auth.joinInvalidBody
        }
        action={
          <Link href="/login" className="font-semibold text-accent-text">
            {it.auth.toLogin}
          </Link>
        }
      />
    );
  }

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
      await join(code, String(form.get('name') ?? ''), String(form.get('email') ?? ''), password);
      queryClient.clear();
      router.replace('/');
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : it.common.errorBody);
      setBusy(false);
    }
  };

  return (
    <GlassCard className="flex flex-col gap-5 p-6">
      <div>
        <h1 className="text-title2 font-bold text-fg">{it.auth.joinTitle}</h1>
        <p className="text-subhead text-muted">
          {invite.data.bootstrap ? it.auth.joinBootstrap : it.auth.joinSubtitle}
        </p>
      </div>
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <FormError message={error} />
        <GlassInput
          label={it.auth.name}
          name="name"
          autoComplete="name"
          placeholder={it.auth.namePlaceholder}
          required
          maxLength={60}
        />
        <GlassInput
          label={it.auth.email}
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
        />
        <PasswordField
          label={it.auth.password}
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
          {busy ? it.auth.creating : it.auth.createAccount}
        </GlassButton>
      </form>
    </GlassCard>
  );
}

export function JoinPage() {
  const code = useSearchParams().get('code') ?? '';
  return <JoinForm code={code} />;
}
