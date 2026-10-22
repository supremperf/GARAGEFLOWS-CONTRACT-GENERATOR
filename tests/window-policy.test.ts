import { describe, expect, it } from 'vitest';
import { isTrustedWindowUrl, isSafeExternalUrl, assertTrustedIpcSender } from '../electron/security/window-policy';
const origin = 'http://127.0.0.1:4321';
describe('Electron window and IPC security', () => {
  it('accepts only the exact app origin', () => {
    expect(isTrustedWindowUrl(`${origin}/contracts`, origin)).toBe(true);
  });
  it.each(['http://127.0.0.1.evil.test:4321', 'http://localhost.evil.test', 'http://127.0.0.1:4322', 'http://user@127.0.0.1:4321', 'file:///C:/Windows/system.ini', 'javascript:alert(1)', 'invalid'])('rejects navigation %s', url => {
    expect(isTrustedWindowUrl(url, origin)).toBe(false);
  });
  it.each(['https://garageflows.example', 'http://example.test', 'mailto:contact@example.test'])('permits safe external protocol %s', url => {
    expect(isSafeExternalUrl(url)).toBe(true);
  });
  it.each(['file:///C:/x.exe', 'javascript:alert(1)', 'ms-settings:privacy', 'https://user:password@example.test'])('never opens an unsafe external protocol %s', url => {
    expect(isSafeExternalUrl(url)).toBe(false);
  });
  it('requires the main frame and trusted origin for IPC', () => {
    const frame = { url: `${origin}/` };
    expect(() => assertTrustedIpcSender({ senderFrame: frame, sender: { mainFrame: frame } }, origin)).not.toThrow();
    expect(() => assertTrustedIpcSender({ senderFrame: frame, sender: { mainFrame: {} } }, origin)).toThrow(/IPC refusé/);
    expect(() => assertTrustedIpcSender({ senderFrame: frame, sender: { mainFrame: frame } }, null)).toThrow();
    expect(() => assertTrustedIpcSender(null, origin)).toThrow();
    const external = { url: 'https://evil.example' };
    expect(() => assertTrustedIpcSender({ senderFrame: external, sender: { mainFrame: external } }, origin)).toThrow();
  });
});
