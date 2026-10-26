'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useRef, useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { FormError } from '@/components/ui/FormError';
import { GlassButton } from '@/components/ui/GlassButton';
import { GlassCard } from '@/components/ui/GlassCard';
import { GlassInput } from '@/components/ui/GlassInput';
import { PasswordField } from '@/components/ui/PasswordField';
import { ApiClientError } from '@/lib/client/api';
import { signIn } from '@/lib/client/auth';
import { safeNext } from '@/lib/client/passwordRules';
import { it } from '@/lib/i18n/it';

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    try {
      await signIn(String(form.get('email') ?? ''), String(form.get('password') ?? ''));
      queryClient.clear();
      router.replace(safeNext(params.get('next')));
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : it.common.errorBody);
      setBusy(false);
      emailRef.current?.focus();
    }
  };

  return (
    <GlassCard className="flex flex-col gap-5 p-6">
      <div>
        <h1 className="text-title2 font-bold text-fg">{it.auth.loginTitle}</h1>
        <p className="text-subhead text-muted">{it.auth.loginSubtitle}</p>
      </div>
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <FormError message={error} />
        <GlassInput
          ref={emailRef}
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
          autoComplete="current-password"
          required
        />
        <GlassButton type="submit" variant="primary" disabled={busy} className="justify-center">
          {busy ? it.auth.loggingIn : it.auth.login}
        </GlassButton>
      </form>
      <div className="flex flex-col gap-1 text-footnote text-muted">
        <p>{it.auth.noAccount}</p>
        <p>{it.auth.forgot}</p>
      </div>
    </GlassCard>
  );
}
