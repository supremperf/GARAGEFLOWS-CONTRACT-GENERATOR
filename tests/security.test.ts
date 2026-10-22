import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { assertSafeBackupEntryName, MAX_BACKUP_TOTAL_BYTES } from '../storage/backup/backup-service';
import { assertZipWithinLimits, withPrototypePollutionGuard } from '../core/document-parser/guards';
import { validateSafeFilePath, validateImportedFileSecurity } from '../electron/security/path-validator';
import { validateEmailFormat } from '../core/validation/legal-validator';

describe('isolation des données de test', () => {
  it('installe un profil temporaire avant les imports et journaux de sécurité', () => {
    const root = process.env.GARAGEFLOWS_DATA_DIR!;
    expect(path.dirname(root)).toBe(os.tmpdir());
    expect(path.basename(root)).toMatch(/^garageflows-unit-/);
  });
});

describe('restauration de sauvegarde : chemins', () => {
  const root = '/home/user/GarageFlowsContractGenerator'.replace('user', 'x');
  it('accepte un chemin relatif sain', () => {
    expect(assertSafeBackupEntryName('database/garageflows.sqlite', root)).toContain('garageflows.sqlite');
  });
  it.each(['../evil.txt', 'database/../../evil.txt', '..\\evil.txt', '/etc/passwd', 'C:\\evil.txt', 'a//b.txt', ''])(
    'rejette %s',
    (name) => {
      expect(() => assertSafeBackupEntryName(name, root)).toThrow(/refusée|traversée/);
    }
  );
});

describe('garde-fou pollution de prototype (CVE-2023-30533)', () => {
  it('supprime toute propriété ajoutée à Object.prototype pendant le parsing', () => {
    const result = withPrototypePollutionGuard(() => {
      (Object.prototype as Record<string, unknown>).pollutedByTest = 'x';
      return 42;
    });
    expect(result).toBe(42);
    expect((Object.prototype as Record<string, unknown>).pollutedByTest).toBeUndefined();
    expect(({} as Record<string, unknown>).pollutedByTest).toBeUndefined();
  });
  it('nettoie même en cas d’erreur du parseur', () => {
    expect(() =>
      withPrototypePollutionGuard(() => {
        (Object.prototype as Record<string, unknown>).pollutedByError = 'x';
        throw new Error('parse error');
      })
    ).toThrow('parse error');
    expect(({} as Record<string, unknown>).pollutedByError).toBeUndefined();
  });
});

describe('garde-fou bombe de décompression', () => {
  const fakeZip = (sizes: number[]) =>
    ({
      files: Object.fromEntries(sizes.map((s, i) => [`f${i}`, { dir: false, name: `f${i}`, _data: { uncompressedSize: s } }])),
    }) as never;
  it('accepte une archive raisonnable', () => {
    expect(() => assertZipWithinLimits(fakeZip([1024, 2048]), 'Test')).not.toThrow();
  });
  it('rejette une archive dépassant le plafond', () => {
    expect(() => assertZipWithinLimits(fakeZip([MAX_BACKUP_TOTAL_BYTES]), 'Test')).toThrow(/refusée|volumineuse/);
  });
});

describe('validation des chemins et fichiers importés', () => {
  it('rejette l’octet nul dans un chemin', () => {
    expect(() => validateSafeFilePath('doc\0.pdf')).toThrow(/octet nul|malveillant/);
  });
  it('rejette un exécutable renommé en document', () => {
    const pe = Buffer.from([0x4d, 0x5a, 0x90, 0x00]);
    expect(() => validateImportedFileSecurity({ fileName: 'contrat.pdf', buffer: pe })).toThrow(/MZ|exécutable/);
  });
  it('rejette une extension exécutable', () => {
    expect(() => validateImportedFileSecurity({ fileName: 'script.exe', buffer: Buffer.from('x') })).toThrow(/interdits/);
  });
  it('accepte un PDF minimal valide', () => {
    expect(() => validateImportedFileSecurity({ fileName: 'c.pdf', buffer: Buffer.from('%PDF-1.4 test') })).not.toThrow();
  });
});

describe('validateurs métier', () => {
  it('accepte les e-mails avec majuscules (conformes RFC)', () => {
    expect(validateEmailFormat('Jean.Dupont@Example.FR').valid).toBe(true);
  });
  it('rejette les e-mails contenant une espace', () => {
    expect(validateEmailFormat('Jean Dupont@Example.FR').valid).toBe(false);
  });
});

describe('API locale : politique CORS', () => {
  it('refuse une origine web externe et accepte la boucle locale', async () => {
    const { startServer } = await import('../electron/server');
    // Port 0 : port éphémère attribué par le système, aucun conflit possible.
    const { createApp } = await import('../electron/server');
    const app = createApp({});
    const server = await new Promise<import('http').Server>((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    const port = (server.address() as { port: number }).port;
    try {
      const evil = await fetch(`http://127.0.0.1:${port}/api/health`, { headers: { Origin: 'https://evil.example' } });
      expect(evil.status).toBe(200);
      expect(evil.headers.get('access-control-allow-origin')).toBeNull();
      const local = await fetch(`http://127.0.0.1:${port}/api/health`, { headers: { Origin: 'http://127.0.0.1:5173' } });
      expect(local.headers.get('access-control-allow-origin')).toBe('http://127.0.0.1:5173');
      expect(local.headers.get('x-content-type-options')).toBe('nosniff');
      const health = await local.json();
      expect(health.ok).toBe(true);
    } finally {
      server.close();
    }
    expect(startServer).toBeTypeOf('function');
  });
});
