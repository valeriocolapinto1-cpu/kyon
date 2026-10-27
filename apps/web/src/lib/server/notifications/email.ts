/**
 * Email behind an interface: Cloudflare Email Service when the binding and a sender exist
 * (Workers Paid, or verified recipients only on Free), otherwise nothing is sent and the app
 * keeps in-app and push notifications.
 */
export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface EmailProvider {
  readonly available: boolean;
  send(message: EmailMessage): Promise<'sent' | 'skipped' | 'failed'>;
}

class NoEmailProvider implements EmailProvider {
  readonly available = false;
  async send(): Promise<'skipped'> {
    return 'skipped';
  }
}

class CloudflareEmailProvider implements EmailProvider {
  readonly available = true;
  constructor(
    private readonly binding: NonNullable<CloudflareEnv['EMAIL']>,
    private readonly from: string,
  ) {}

  async send(message: EmailMessage): Promise<'sent' | 'failed'> {
    try {
      await this.binding.send({ ...message, from: this.from });
      return 'sent';
    } catch (error) {
      // Typically: recipient not verified on the Free plan. Logged without the address.
      console.warn('Email not sent', error instanceof Error ? error.message : error);
      return 'failed';
    }
  }
}

export function emailProvider(env: CloudflareEnv): EmailProvider {
  return env.EMAIL && env.EMAIL_FROM
    ? new CloudflareEmailProvider(env.EMAIL, env.EMAIL_FROM)
    : new NoEmailProvider();
}

const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** A short, plain email: title, text, one link. */
export function notificationEmail(
  title: string,
  body: string,
  link: string | null,
): EmailMessage['html'] {
  return `<!doctype html><html lang="it"><body style="font-family:-apple-system,system-ui,'Segoe UI',sans-serif;color:#1c1c1e;line-height:1.5">
<h1 style="font-size:20px">${escapeHtml(title)}</h1>
<p>${escapeHtml(body)}</p>
${link ? `<p><a href="${escapeHtml(link)}" style="color:#0040dd">Apri in Kyon</a></p>` : ''}
<p style="color:#6c6c70;font-size:13px">Puoi scegliere quali email ricevere in Kyon → Settings → Notifiche.</p>
</body></html>`;
}
