import type {
  ClientRecord,
  CustomVariableDefinition,
  DetectedVariable,
  GeneratedContractRecord,
  GenerationReport,
  ProfessionalProfile,
  SubscriptionConfig,
  TemplateRecord,
} from '../core/types';
import type { DictionaryFieldEntry } from '../core/variable-detection/dictionary';
export type { DictionaryFieldEntry };
import type { PreviewPageData } from '../core/replacement-engine';
import type { LegalValidationResult } from '../core/validation/legal-validator';

/** Miroir du DashboardData renvoyé par GET /api/dashboard (electron/services/app-service). */
export interface DashboardData {
  contractsCount: number;
  clientsCount: number;
  templatesCount: number;
  contractsLast7Days: number;
  trends: {
    contractsPct: number | null;
    clientsPct: number | null;
    templatesAdded30Days: number;
    contracts7DaysPct: number | null;
  };
  series: { date: string; contracts: number; clientsCumulative: number; templatesCumulative: number }[];
  templateUsage: { templateId: string; count: number }[];
  notifications: { id: string; kind: 'contract' | 'template' | 'client'; title: string; detail: string; date: string; page: 'history' | 'templates' | 'clients' }[];
  profile: { prenom: string; nom: string; entreprise: string };
  recentContracts: GeneratedContractRecord[];
  recentTemplates: TemplateRecord[];
}

export type {
  ClientRecord,
  CustomVariableDefinition,
  DetectedVariable,
  GeneratedContractRecord,
  GenerationReport,
  ProfessionalProfile,
  SubscriptionConfig,
  TemplateRecord,
};

export class ApiError extends Error {
  code?: string;
  existingPath?: string;
  constructor(message: string, code?: string, existingPath?: string) {
    super(message);
    this.code = code;
    this.existingPath = existingPath;
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
    ...init,
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new ApiError(data.error || 'Erreur de communication avec le moteur local.', data.code, data.existingPath);
  }
  return data as T;
}

/** Corps acceptés par les routes d'écriture (formes partielles des modèles). */
export type ClientInput = Partial<ClientRecord>;
export type ProfileInput = Partial<ProfessionalProfile>;
export type SubscriptionInput = Partial<SubscriptionConfig>;
export interface TemplateImportInput {
  name?: string;
  category?: string;
  description?: string;
  fileName?: string;
  base64?: string;
  path?: string;
  [key: string]: string | undefined;
}
export type TemplateUpdateInput = Partial<
  Pick<TemplateRecord, 'name' | 'category' | 'description' | 'variables' | 'isDefault' | 'lastUsedAt'>
>;

export interface PreviewRequest {
  templateId: string;
  clientId?: string;
  variableValues?: Record<string, string>;
  variablePatches?: DetectedVariable[];
}
export interface PreviewResult {
  template: TemplateRecord;
  client: ClientRecord | null;
  profile: ProfessionalProfile;
  subscription: SubscriptionConfig;
  variables: DetectedVariable[];
  values: Record<string, string>;
  previewPages: PreviewPageData[];
  originalText: string;
  finalText: string;
  validation: LegalValidationResult;
  supportedExports: TemplateRecord['supportedExports'];
  suggestedFileName: string;
  pageCount: number;
  warnings: string[];
  limitations: string[];
}

export interface ExportRequest extends PreviewRequest {
  format: string;
  fileName?: string;
  destinationDir?: string;
  overwriteConfirmed?: boolean;
}
export interface ExportResult {
  /** Ajouté par la route serveur (/api/generate/export). */
  downloadUrl: string;
  contract: GeneratedContractRecord;
  report: GenerationReport;
  export: { fileName: string; filePath: string; fileSize: number; sha256: string };
  previewPages: PreviewPageData[];
}

export interface SettingsBundle {
  profile: ProfessionalProfile;
  subscription: SubscriptionConfig;
  customVariables: CustomVariableDefinition[];
  storage: {
    root: string;
    directories: Record<string, string>;
    bytes: number;
  };
  legalNotice: string;
}

export interface BackupExportResult { fileName: string; filePath?: string; size?: number; [key: string]: unknown }
export interface BackupImportResult { restored?: boolean; message?: string; [key: string]: unknown }
export interface DialogResult { canceled: boolean; path?: string; filePaths?: string[]; [key: string]: unknown }
export interface Capabilities { dialogs: boolean; platform: string }

export const api = {
  health: () => request<{ ok: boolean }>('/api/health'),
  dashboard: () => request<DashboardData>('/api/dashboard'),
  dictionary: () => request<DictionaryFieldEntry[]>('/api/dictionary'),
  templates: () => request<TemplateRecord[]>('/api/templates'),
  template: (id: string) => request<TemplateRecord>(`/api/templates/${id}`),
  importTemplate: (body: TemplateImportInput) =>
    request<TemplateRecord>('/api/templates/import', { method: 'POST', body: JSON.stringify(body) }),
  updateTemplate: (id: string, body: TemplateUpdateInput) =>
    request<TemplateRecord>(`/api/templates/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteTemplate: (id: string) => request<{ deleted: boolean }>(`/api/templates/${id}`, { method: 'DELETE' }),
  duplicateTemplate: (id: string) => request<TemplateRecord>(`/api/templates/${id}/duplicate`, { method: 'POST' }),
  analyzeTemplate: (id: string) => request<TemplateRecord>(`/api/templates/${id}/analyze`, { method: 'POST' }),
  clients: (q?: string) => request<ClientRecord[]>(`/api/clients${q ? `?q=${encodeURIComponent(q)}` : ''}`),
  clientContracts: (id: string) => request<GeneratedContractRecord[]>(`/api/clients/${id}/contracts`),
  createClient: (body: ClientInput) => request<ClientRecord>('/api/clients', { method: 'POST', body: JSON.stringify(body) }),
  updateClient: (id: string, body: ClientInput) =>
    request<ClientRecord>(`/api/clients/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteClient: (id: string) => request<{ deleted: boolean }>(`/api/clients/${id}`, { method: 'DELETE' }),
  profile: () => request<ProfessionalProfile>('/api/profile'),
  saveProfile: (body: ProfileInput) => request<ProfessionalProfile>('/api/profile', { method: 'PUT', body: JSON.stringify(body) }),
  subscription: () => request<SubscriptionConfig>('/api/subscription'),
  saveSubscription: (body: SubscriptionInput) =>
    request<SubscriptionConfig>('/api/subscription', { method: 'PUT', body: JSON.stringify(body) }),
  customVariables: () => request<CustomVariableDefinition[]>('/api/custom-variables'),
  saveCustomVariables: (definitions: CustomVariableDefinition[]) =>
    request<CustomVariableDefinition[]>('/api/custom-variables', { method: 'PUT', body: JSON.stringify({ definitions }) }),
  preview: (body: PreviewRequest) => request<PreviewResult>('/api/generate/preview', { method: 'POST', body: JSON.stringify(body) }),
  exportContract: (body: ExportRequest) =>
    request<ExportResult>('/api/generate/export', { method: 'POST', body: JSON.stringify(body) }),
  contracts: () => request<GeneratedContractRecord[]>('/api/contracts'),
  deleteContract: (id: string, deleteFile: boolean) =>
    request<{ deleted: boolean }>(`/api/contracts/${id}?file=${deleteFile ? '1' : '0'}`, { method: 'DELETE' }),
  settings: () => request<SettingsBundle>('/api/settings'),
  logs: () => request<{ lines: string[] }>('/api/logs'),
  exportBackup: () => request<BackupExportResult>('/api/backup/export', { method: 'POST' }),
  importBackup: (base64: string) =>
    request<BackupImportResult>('/api/backup/import', { method: 'POST', body: JSON.stringify({ base64 }) }),
  importExamples: () => request<{ imported: string[]; skipped: string[] }>('/api/examples/import', { method: 'POST' }),
  capabilities: () => request<Capabilities>('/api/capabilities'),
  dialogOpenFile: () => request<DialogResult>('/api/dialog/open-file', { method: 'POST', body: '{}' }),
  dialogOpenDirectory: () => request<DialogResult>('/api/dialog/open-directory', { method: 'POST', body: '{}' }),
};

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      resolve(result.includes(',') ? result.split(',')[1] : result);
    };
    reader.onerror = () => reject(new Error('Lecture du fichier impossible.'));
    reader.readAsDataURL(file);
  });
}

export async function downloadUrl(url: string, fileName: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error('Téléchargement impossible.');
  const blob = await response.blob();
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 1500);
}
