import { request } from './api';
import type { ContractEvent, ContractState, ContractTerms, EffectiveContext, LegalModel, ProfessionalContract } from '../core/contracts/types';
const root = '/api/professional';
const send = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body) });
export const professionalApi = {
  models: () => request<LegalModel[]>(`${root}/models`),
  importModel: (model: Omit<LegalModel, 'id' | 'sha256' | 'createdAt'> & { confirmed: boolean }) => request<LegalModel>(`${root}/models`, send('POST', model)),
  context: (clientId: string, terms: ContractTerms) => request<EffectiveContext>(`${root}/context`, send('POST', { clientId, terms })),
  list: (clientId?: string) => request<ProfessionalContract[]>(`${root}/contracts${clientId ? `?clientId=${encodeURIComponent(clientId)}` : ''}`),
  get: (id: string) => request<ProfessionalContract>(`${root}/contracts/${id}`),
  create: (clientId: string, modelId: string, terms: ContractTerms, parentId?: string, kind?: 'revision' | 'amendment', requestId = crypto.randomUUID()) => request<ProfessionalContract>(`${root}/contracts`, send('POST', { requestId, clientId, modelId, terms, parentId, kind })),
  update: (item: ProfessionalContract, terms: ContractTerms) => request<ProfessionalContract>(`${root}/contracts/${item.id}`, send('PATCH', { terms, revision: item.revision })),
  preview: (id: string) => request<ProfessionalContract>(`${root}/contracts/${id}/preview`, send('POST', {})),
  generate: (item: ProfessionalContract) => request<ProfessionalContract>(`${root}/contracts/${item.id}/generate`, send('POST', { expectedHash: item.previewHash })),
  transition: (item: ProfessionalContract, state: ContractState, reason: string) => request<ProfessionalContract>(`${root}/contracts/${item.id}/state`, send('POST', { state, reason, revision: item.revision })),
  events: (id: string) => request<ContractEvent[]>(`${root}/contracts/${id}/events`),
  acceptance: (id: string, email: string, consent: boolean) => request<ProfessionalContract>(`${root}/contracts/${id}/acceptance`, send('POST', { email, consent })),
  manualSignature: (item: ProfessionalContract, input: { base64: string; signatory: string; email: string; signedAt: string; consent: boolean; attested: boolean }) => request<ProfessionalContract>(`${root}/contracts/${item.id}/manual-signature`, send('POST', { ...input, expectedHash: item.pdfHash })),
  pdfUrl: (item: ProfessionalContract, variant: 'preview' | 'original' | 'signed' = 'preview') => `${root}/contracts/${item.id}/pdf?variant=${variant}&hash=${item.pdfHash || item.previewHash || ''}`,
};
