/** Exact-origin checks: a hostname prefix is not a security boundary. */
export function isTrustedWindowUrl(target: string, origin: string | null): boolean {
  try {
    const url = new URL(target);
    return !!origin && url.protocol === 'http:' && !url.username && !url.password && url.origin === origin;
  } catch { return false; }
}

export function isSafeExternalUrl(target: string): boolean {
  try {
    const url = new URL(target);
    return ['https:', 'http:', 'mailto:'].includes(url.protocol) && !url.username && !url.password;
  } catch { return false; }
}

export function assertTrustedIpcSender(event: unknown, origin: string | null): void {
  const sender = event as { senderFrame?: { url?: string }; sender?: { mainFrame?: unknown } } | null;
  if (!sender?.senderFrame || sender.senderFrame !== sender.sender?.mainFrame || !isTrustedWindowUrl(sender.senderFrame.url || '', origin)) {
    throw new Error('IPC refusé : frame ou origine non autorisée.');
  }
}
