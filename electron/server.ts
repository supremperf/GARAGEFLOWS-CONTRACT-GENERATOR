import fs from 'fs';
import path from 'path';
import express from 'express';
import cors from 'cors';
import { api, importBundledExamples } from './services/app-service';
import { OFFICIAL_VARIABLE_DICTIONARY } from '../core/variable-detection/dictionary';
import { writeAppLog } from './security/logger';
import { validateSafeFilePath } from './security/path-validator';

export interface ServerOptions {
  port?: number;
  /** Interface d'écoute. Défaut : 127.0.0.1 uniquement (jamais le réseau local). Surchargeable par env HOST pour le dev encadré. */
  host?: string;
  staticDir?: string;
  electronDialogs?: {
    openFile: (filters?: { name: string; extensions: string[] }[]) => Promise<string | null>;
    openDirectory: () => Promise<string | null>;
    saveFile: (defaultPath: string) => Promise<string | null>;
  };
}

function idOf(value: string | string[]): string {
  return Array.isArray(value) ? value[0] : value;
}

function asyncRoute(handler: (req: express.Request, res: express.Response) => Promise<void>) {
  return (req: express.Request, res: express.Response) => {
    handler(req, res).catch((error: any) => {
      const message = error?.message || 'Erreur interne.';
      const code = error?.code;
      writeAppLog('ERROR', message);
      const status = code === 'FILE_ALREADY_EXISTS' ? 409 : /introuvable|invalide|obligatoire|non pris en charge|interdit|bloqué|incomplet/i.test(message) ? 400 : 500;
      res.status(status).json({
        error: message,
        code,
        existingPath: error?.existingPath,
      });
    });
  };
}

/**
 * Origines autorisées en CORS : uniquement les boucles locales (interface Electron
 * servie par ce même serveur, et Vite en développement via son proxy).
 * Aucune origine externe (site web, réseau local) ne peut appeler l'API :
 * c'est la protection contre les attaques par navigateur interposé (DNS rebinding inclus).
 */
function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return true; // client non-navigateur ou même origine (pas d'en-tête Origin)
  try {
    const url = new URL(origin);
    return url.hostname === '127.0.0.1' || url.hostname === 'localhost' || url.hostname === '::1';
  } catch {
    return false;
  }
}

export function createApp(options: ServerOptions = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(
    cors({
      origin: (origin, callback) => {
        // Origine refusée : aucun en-tête Access-Control-Allow-Origin n'est émis
        // (le navigateur bloque la lecture), sans transformer la requête en erreur 500.
        callback(null, isAllowedOrigin(origin));
      },
    })
  );
  app.use('/api', (_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.use(express.json({ limit: '80mb' }));

  app.get('/api/dictionary', (_req, res) => {
    res.json(
      OFFICIAL_VARIABLE_DICTIONARY.map((entry) => ({
        key: entry.key,
        label: entry.label,
        dataType: entry.dataType,
        category: entry.category,
        required: entry.required,
      }))
    );
  });

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, product: 'GarageFlows Contract Generator' });
  });

  app.get('/api/dashboard', asyncRoute(async (_req, res) => {
    res.json(await api.getDashboard());
  }));

  app.get('/api/templates', asyncRoute(async (_req, res) => {
    res.json(await api.listTemplates());
  }));

  app.get('/api/templates/:id', asyncRoute(async (req, res) => {
    const template = await api.getTemplate(idOf(req.params.id));
    if (!template) {
      res.status(404).json({ error: 'Modèle introuvable.' });
      return;
    }
    res.json(template);
  }));

  app.post('/api/templates/import', asyncRoute(async (req, res) => {
    const { fileName, base64, filePath, name, category, description } = req.body || {};
    if (filePath) {
      const record = await api.importTemplateFromPath(filePath, { name, category, description });
      res.json(record);
      return;
    }
    if (!fileName || !base64) {
      throw new Error('Fichier manquant pour l’importation.');
    }
    const buffer = Buffer.from(String(base64), 'base64');
    const record = await api.importTemplateFromUpload({ fileName, buffer, name, category, description });
    res.json(record);
  }));

  app.put('/api/templates/:id', asyncRoute(async (req, res) => {
    res.json(await api.updateTemplate(idOf(req.params.id), req.body || {}));
  }));

  app.delete('/api/templates/:id', asyncRoute(async (req, res) => {
    await api.deleteTemplate(idOf(req.params.id));
    res.json({ ok: true });
  }));

  app.post('/api/templates/:id/duplicate', asyncRoute(async (req, res) => {
    res.json(await api.duplicateTemplate(idOf(req.params.id)));
  }));

  app.post('/api/templates/:id/analyze', asyncRoute(async (req, res) => {
    res.json(await api.reanalyzeTemplate(idOf(req.params.id)));
  }));

  app.get('/api/clients', asyncRoute(async (req, res) => {
    res.json(await api.listClients(typeof req.query.q === 'string' ? req.query.q : undefined));
  }));

  app.get('/api/clients/:id', asyncRoute(async (req, res) => {
    const client = await api.getClient(idOf(req.params.id));
    if (!client) {
      res.status(404).json({ error: 'Client introuvable.' });
      return;
    }
    res.json(client);
  }));

  app.get('/api/clients/:id/contracts', asyncRoute(async (req, res) => {
    res.json(await api.listContractsByClient(idOf(req.params.id)));
  }));

  app.post('/api/clients', asyncRoute(async (req, res) => {
    res.json(await api.createClient(req.body || {}));
  }));

  app.put('/api/clients/:id', asyncRoute(async (req, res) => {
    res.json(await api.updateClient(idOf(req.params.id), req.body || {}));
  }));

  app.delete('/api/clients/:id', asyncRoute(async (req, res) => {
    await api.deleteClient(idOf(req.params.id));
    res.json({ ok: true });
  }));

  app.get('/api/profile', asyncRoute(async (_req, res) => {
    res.json(await api.getProfessionalProfile());
  }));

  app.put('/api/profile', asyncRoute(async (req, res) => {
    res.json(await api.saveProfileSafe(req.body || {}));
  }));

  app.get('/api/subscription', asyncRoute(async (_req, res) => {
    res.json(await api.getSubscriptionConfig());
  }));

  app.put('/api/subscription', asyncRoute(async (req, res) => {
    res.json(await api.saveSubscriptionSafe(req.body || {}));
  }));

  app.get('/api/custom-variables', asyncRoute(async (_req, res) => {
    res.json(await api.getCustomVariableDefinitions());
  }));

  app.put('/api/custom-variables', asyncRoute(async (req, res) => {
    res.json(await api.saveCustomVariableDefinitions(req.body?.definitions || []));
  }));

  app.post('/api/generate/preview', asyncRoute(async (req, res) => {
    res.json(await api.previewContract(req.body || { templateId: '' }));
  }));

  app.post('/api/generate/export', asyncRoute(async (req, res) => {
    const result = await api.exportContract(req.body || { templateId: '', format: 'pdf' });
    res.json({
      ...result,
      downloadUrl: `/api/contracts/${result.contract.id}/download`,
    });
  }));

  app.get('/api/contracts', asyncRoute(async (_req, res) => {
    res.json(await api.listContracts());
  }));

  app.get('/api/contracts/:id', asyncRoute(async (req, res) => {
    const contract = await api.getContract(idOf(req.params.id));
    if (!contract) {
      res.status(404).json({ error: 'Contrat introuvable.' });
      return;
    }
    res.json(contract);
  }));

  app.get('/api/contracts/:id/download', asyncRoute(async (req, res) => {
    const { contract, buffer } = await api.readContractFile(idOf(req.params.id));
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(contract.fileName)}"`);
    res.send(buffer);
  }));

  app.delete('/api/contracts/:id', asyncRoute(async (req, res) => {
    await api.deleteContract(idOf(req.params.id), req.query.file === '1');
    res.json({ ok: true });
  }));

  app.get('/api/settings', asyncRoute(async (_req, res) => {
    res.json(await api.getSettingsBundle());
  }));

  app.get('/api/logs', asyncRoute(async (_req, res) => {
    res.json({ lines: api.readRecentLogs(200) });
  }));

  app.post('/api/backup/export', asyncRoute(async (_req, res) => {
    const backup = await api.exportBackupArchive();
    const dirs = (await api.getSettingsBundle()).storage;
    const target = path.join(dirs.directories.backups, backup.fileName);
    fs.writeFileSync(target, backup.buffer);
    res.json({
      fileName: backup.fileName,
      filePath: target,
      size: backup.buffer.length,
      downloadUrl: '/api/backup/download',
    });
  }));

  app.get('/api/backup/download', asyncRoute(async (_req, res) => {
    const backup = await api.exportBackupArchive();
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${backup.fileName}"`);
    res.send(backup.buffer);
  }));

  app.post('/api/backup/import', asyncRoute(async (req, res) => {
    const { base64, filePath } = req.body || {};
    const buffer = filePath ? fs.readFileSync(validateSafeFilePath(filePath)) : Buffer.from(String(base64 || ''), 'base64');
    if (!buffer.length) throw new Error('Archive de sauvegarde vide.');
    res.json(await api.importBackupArchive(buffer));
  }));

  app.post('/api/examples/import', asyncRoute(async (_req, res) => {
    res.json(await importBundledExamples());
  }));

  app.get('/api/capabilities', (_req, res) => {
    res.json({
      dialogs: Boolean(options.electronDialogs),
      platform: process.platform,
    });
  });

  app.post('/api/dialog/open-file', asyncRoute(async (req, res) => {
    if (!options.electronDialogs) {
      res.json({ available: false });
      return;
    }
    const selected = await options.electronDialogs.openFile(req.body?.filters);
    res.json({ available: true, filePath: selected });
  }));

  app.post('/api/dialog/open-directory', asyncRoute(async (_req, res) => {
    if (!options.electronDialogs) {
      res.json({ available: false });
      return;
    }
    const selected = await options.electronDialogs.openDirectory();
    res.json({ available: true, directory: selected });
  }));

  if (options.staticDir && fs.existsSync(options.staticDir)) {
    app.use(express.static(options.staticDir));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api/')) return next();
      res.sendFile(path.join(options.staticDir as string, 'index.html'));
    });
  }

  return app;
}

export function startServer(options: ServerOptions = {}): Promise<number> {
  const app = createApp(options);
  const requested = options.port === undefined ? Number(process.env.PORT || 3001) : options.port;
  const host = options.host || process.env.HOST || '127.0.0.1';
  return new Promise((resolve, reject) => {
    const server = app.listen(requested, host, () => {
      const address = server.address();
      const bound = typeof address === 'object' && address ? address.port : requested;
      writeAppLog('INFO', `Serveur local démarré sur le port ${bound}`);
      resolve(bound);
    });
    server.on('error', reject);
  });
}
