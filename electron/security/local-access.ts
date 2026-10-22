import { timingSafeEqual } from 'crypto';
import type { RequestHandler } from 'express';

/** Single-user desktop capability, held by main/proxy, never returned to renderer JS.
 * This is not a SaaS account/role system and does not protect against a compromised OS account.
 */
export function localAccess(capability: string | undefined, extraOrigins: string[] = []): RequestHandler {
  return (req, res, next) => {
    if (req.path === '/health' && req.method === 'GET') return next();
    const supplied = req.get('X-GF-Local-Capability') || '';
    const expected = capability || '';
    const equal = expected.length >= 32 && Buffer.byteLength(expected) === Buffer.byteLength(supplied) && timingSafeEqual(Buffer.from(expected), Buffer.from(supplied));
    const origin = req.get('Origin');
    const sameOrigin = !origin || origin === `${req.get('X-Forwarded-Proto') === 'https' ? 'https' : req.protocol}://${req.get('host')}` || extraOrigins.includes(origin);
    if (!equal || !sameOrigin || req.get('Sec-Fetch-Site') === 'cross-site') {
      res.status(403).json({ error: 'Accès local non autorisé. Ouvrir l’application Electron ou le serveur de développement autorisé.' }); return;
    }
    next();
  };
}
