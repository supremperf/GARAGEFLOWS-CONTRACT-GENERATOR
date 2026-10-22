import type { Express, Request, Response } from 'express';
import { CONTRACT_FIELD_LABELS, INTEGRATIONS } from '../core/contracts/types';
import { listContractEvents, listProfessionalContracts, listProfessionalModels, localActor } from '../storage/repositories/professional-contract-repo';
import * as service from './services/professional-contract-service';
import { writeAppLog } from './security/logger';

export function professionalRoutes(app: Express): void {
  const route = (handler: (req: Request, res: Response) => Promise<void>) => (req: Request, res: Response) => {
    service.serialized(() => handler(req, res)).catch((error: unknown) => {
      if (error instanceof service.ContractError) res.status(error.status).json({ error: error.message });
      else { writeAppLog('ERROR', `Contrats professionnels : ${error instanceof Error ? error.message : 'Erreur inconnue'}`); res.status(500).json({ error: 'Opération impossible. Aucun succès revendiqué. Consulter le journal technique.' }); }
    });
  };
  const id = (req: Request) => String(req.params.id);
  app.get('/api/professional/meta', route(async (_req, res) => { res.json({ fields: CONTRACT_FIELD_LABELS, integrations: INTEGRATIONS, actor: localActor(), accessModel: 'Propriétaire du poste local ; aucun rôle SaaS.' }); }));
  app.get('/api/professional/models', route(async (_req, res) => { res.json(await listProfessionalModels()); }));
  app.post('/api/professional/models', route(async (req, res) => { res.json(await service.importLegalModel(req.body)); }));
  app.post('/api/professional/context', route(async (req, res) => { res.json(await service.contextFor(req.body.clientId, req.body.terms || {})); }));
  app.get('/api/professional/contracts', route(async (req, res) => { res.json(await listProfessionalContracts(typeof req.query.clientId === 'string' ? req.query.clientId : undefined)); }));
  app.post('/api/professional/contracts', route(async (req, res) => { res.status(201).json(await service.createProfessionalDraft(req.body)); }));
  app.get('/api/professional/contracts/:id', route(async (req, res) => { res.json(await service.requireProfessional(id(req))); }));
  app.patch('/api/professional/contracts/:id', route(async (req, res) => { res.json(await service.updateProfessionalDraft(id(req), req.body.revision, req.body.terms)); }));
  app.get('/api/professional/contracts/:id/events', route(async (req, res) => { await service.requireProfessional(id(req)); res.json(await listContractEvents(id(req))); }));
  app.post('/api/professional/contracts/:id/preview', route(async (req, res) => { res.json(await service.previewProfessional(id(req))); }));
  app.post('/api/professional/contracts/:id/generate', route(async (req, res) => { res.json(await service.generateProfessional(id(req), req.body.expectedHash)); }));
  app.post('/api/professional/contracts/:id/state', route(async (req, res) => { res.json(await service.transitionProfessional(id(req), req.body.revision, req.body.state, req.body.reason)); }));
  app.post('/api/professional/contracts/:id/acceptance', route(async (req, res) => { res.json(await service.recordAcceptance(id(req), req.body.email, req.body.consent)); }));
  app.post('/api/professional/contracts/:id/manual-signature', route(async (req, res) => { res.json(await service.recordManualSignature(id(req), req.body)); }));
  app.post('/api/professional/contracts/:id/email', route(async () => { await service.unavailableIntegration('e-mail'); }));
  app.post('/api/professional/contracts/:id/e-sign', route(async () => { await service.unavailableIntegration('signature électronique'); }));
  app.get('/api/professional/contracts/:id/pdf', route(async (req, res) => {
    const variant = req.query.variant === 'original' ? 'original' : req.query.variant === 'signed' ? 'signed' : 'preview';
    const doc = await service.readProfessionalPdf(id(req), variant);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `${req.query.download === '1' ? 'attachment' : 'inline'}; filename="${doc.name}"`);
    res.send(doc.bytes);
  }));
  app.get('/api/professional/contracts/:id/source', route(async (req, res) => { res.type('text/plain').send(await service.fullRenderedSource(id(req))); }));
}
