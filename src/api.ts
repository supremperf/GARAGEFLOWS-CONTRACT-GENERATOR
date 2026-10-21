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

export const api = {
  health: () => request<{ ok: boolean }>('/api/health'),
  dashboard: () => request<any>('/api/dashboard'),
  dictionary: () => request<any[]>('/api/dictionary'),
  templates: () => request<any[]>('/api/templates'),
  template: (id: string) => request<any>(`/api/templates/${id}`),
  importTemplate: (body: any) => request<any>('/api/templates/import', { method: 'POST', body: JSON.stringify(body) }),
  updateTemplate: (id: string, body: any) => request<any>(`/api/templates/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteTemplate: (id: string) => request<any>(`/api/templates/${id}`, { method: 'DELETE' }),
  duplicateTemplate: (id: string) => request<any>(`/api/templates/${id}/duplicate`, { method: 'POST' }),
  analyzeTemplate: (id: string) => request<any>(`/api/templates/${id}/analyze`, { method: 'POST' }),
  clients: (q?: string) => request<any[]>(`/api/clients${q ? `?q=${encodeURIComponent(q)}` : ''}`),
  clientContracts: (id: string) => request<any[]>(`/api/clients/${id}/contracts`),
  createClient: (body: any) => request<any>('/api/clients', { method: 'POST', body: JSON.stringify(body) }),
  updateClient: (id: string, body: any) => request<any>(`/api/clients/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteClient: (id: string) => request<any>(`/api/clients/${id}`, { method: 'DELETE' }),
  profile: () => request<any>('/api/profile'),
  saveProfile: (body: any) => request<any>('/api/profile', { method: 'PUT', body: JSON.stringify(body) }),
  subscription: () => request<any>('/api/subscription'),
  saveSubscription: (body: any) => request<any>('/api/subscription', { method: 'PUT', body: JSON.stringify(body) }),
  customVariables: () => request<any[]>('/api/custom-variables'),
  saveCustomVariables: (definitions: any[]) =>
    request<any[]>('/api/custom-variables', { method: 'PUT', body: JSON.stringify({ definitions }) }),
  preview: (body: any) => request<any>('/api/generate/preview', { method: 'POST', body: JSON.stringify(body) }),
  exportContract: (body: any) => request<any>('/api/generate/export', { method: 'POST', body: JSON.stringify(body) }),
  contracts: () => request<any[]>('/api/contracts'),
  deleteContract: (id: string, deleteFile: boolean) =>
    request<any>(`/api/contracts/${id}?file=${deleteFile ? '1' : '0'}`, { method: 'DELETE' }),
  settings: () => request<any>('/api/settings'),
  logs: () => request<{ lines: string[] }>('/api/logs'),
  exportBackup: () => request<any>('/api/backup/export', { method: 'POST' }),
  importBackup: (base64: string) => request<any>('/api/backup/import', { method: 'POST', body: JSON.stringify({ base64 }) }),
  importExamples: () => request<any>('/api/examples/import', { method: 'POST' }),
  capabilities: () => request<any>('/api/capabilities'),
  dialogOpenFile: () => request<any>('/api/dialog/open-file', { method: 'POST', body: '{}' }),
  dialogOpenDirectory: () => request<any>('/api/dialog/open-directory', { method: 'POST', body: '{}' }),
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
