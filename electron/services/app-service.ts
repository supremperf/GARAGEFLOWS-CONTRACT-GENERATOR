import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import {
  ClientRecord,
  CustomVariableDefinition,
  DetectedVariable,
  ExportFormat,
  ProfessionalProfile,
  SubscriptionConfig,
} from '../../core/types';
import { parseDocumentBuffer } from '../../core/document-parser';
import { generateContractDocument, buildContractPreviewPages } from '../../core/replacement-engine';
import { resolveCanonicalValues } from '../../core/variable-detection/dictionary';
import { validateContractBeforeGeneration } from '../../core/validation/legal-validator';
import { buildRecommendedContractFileName, exportGeneratedDocumentToDisk } from '../../core/document-exporter/exporter';
import { ensureStorageDirectories } from '../../storage/storage-paths';
import {
  getCustomVariableDefinitions,
  getProfessionalProfile,
  getSubscriptionConfig,
  saveCustomVariableDefinitions,
  saveProfessionalProfile,
  saveSubscriptionConfig,
} from '../../storage/repositories/profile-repo';
import {
  countClients,
  createClient,
  deleteClient,
  getClient,
  listClientDates,
  listClients,
  listRecentClientSummaries,
  updateClient,
} from '../../storage/repositories/client-repo';
import {
  countTemplates,
  deleteTemplate,
  duplicateTemplate,
  getTemplate,
  importTemplate,
  listTemplateDates,
  listTemplates,
  listTemplatesLight,
  readTemplateBuffer,
  reanalyzeTemplate,
  touchTemplateUsed,
  updateTemplate,
} from '../../storage/repositories/template-repo';
import {
  countContracts,
  deleteContract,
  getContract,
  listContractTimeline,
  listContracts,
  listContractsByClient,
  listContractsLight,
  saveContract,
} from '../../storage/repositories/contract-repo';
import { exportBackupArchive, getStorageSummary, importBackupArchive } from '../../storage/backup/backup-service';
import { readRecentLogs, writeAppLog } from '../security/logger';
import { validateImportedFileSecurity, validateSafeFilePath } from '../security/path-validator';

export type PageHint = 'history' | 'templates' | 'clients';

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
  notifications: { id: string; kind: 'contract' | 'template' | 'client'; title: string; detail: string; date: string; page: PageHint }[];
  profile: { prenom: string; nom: string; entreprise: string };
  recentContracts: Awaited<ReturnType<typeof listContracts>>;
  recentTemplates: Awaited<ReturnType<typeof listTemplates>>;
}

function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return Math.round(((current - previous) / previous) * 100);
}
function inRange(iso: string, from: number, to: number): boolean {
  const t = new Date(iso).getTime();
  return t >= from && t < to;
}

function valuesFromContext(params: {
  variables: DetectedVariable[];
  client?: Partial<ClientRecord> | null;
  profile?: ProfessionalProfile | null;
  subscription?: SubscriptionConfig | null;
  overrides?: Record<string, string>;
}): Record<string, string> {
  const canonical = resolveCanonicalValues(params.client, params.profile, params.subscription, params.overrides);
  const byId: Record<string, string> = {};
  for (const variable of params.variables) {
    const override = params.overrides?.[variable.id];
    if (override !== undefined) {
      byId[variable.id] = override;
      continue;
    }
    const fromCanonical = canonical[variable.canonicalField];
    if (fromCanonical !== undefined && fromCanonical !== '') {
      byId[variable.id] = fromCanonical;
    } else if (variable.defaultValue) {
      byId[variable.id] = variable.defaultValue;
    } else {
      byId[variable.id] = '';
    }
  }
  return byId;
}

export async function getDashboard(): Promise<DashboardData> {
  // Indicateurs calculés par requêtes légères : aucun rapport/valeur de contrat
  // n'est désérialisé pour afficher des compteurs (performance constante).
  const [contractsCount, clientsCount, templatesCount, timeline, cDates, tDates, recentContracts, recentTemplates, recentClients, profile] =
    await Promise.all([
      countContracts(),
      countClients(),
      countTemplates(),
      listContractTimeline(),
      listClientDates(),
      listTemplateDates(),
      listContractsLight(6),
      listTemplatesLight(6),
      listRecentClientSummaries(10),
      getProfessionalProfile(),
    ]);
  const now = Date.now();
  const DAY = 86_400_000;
  const d30 = now - 30 * DAY, d60 = now - 60 * DAY, d7 = now - 7 * DAY, d14 = now - 14 * DAY;
  const count = (dates: string[], from: number, to: number) => dates.filter((d) => inRange(d, from, to)).length;
  const contractDates = timeline.map((t) => t.createdAt);

  const series = Array.from({ length: 14 }, (_, i) => {
    const start = new Date(now - (13 - i) * DAY);
    start.setHours(0, 0, 0, 0);
    const end = start.getTime() + DAY;
    return {
      date: start.toISOString(),
      contracts: count(contractDates, start.getTime(), end),
      clientsCumulative: cDates.filter((d) => new Date(d).getTime() < end).length,
      templatesCumulative: tDates.filter((d) => new Date(d).getTime() < end).length,
    };
  });

  const usage = new Map<string, number>();
  for (const t of timeline) usage.set(t.templateId, (usage.get(t.templateId) || 0) + 1);

  const notifications: DashboardData['notifications'] = [
    ...recentContracts.map((c) => ({
      id: `contract-${c.id}`, kind: 'contract' as const,
      title: 'Contrat généré', detail: `${c.templateName} — ${c.clientName}`, date: c.createdAt, page: 'history' as PageHint,
    })),
    ...recentTemplates.map((t) => ({
      id: `template-${t.id}`, kind: 'template' as const,
      title: 'Modèle disponible', detail: `${t.name} (${t.format.toUpperCase()})`, date: t.updatedAt, page: 'templates' as PageHint,
    })),
    ...recentClients.map((c) => ({
      id: `client-${c.id}`, kind: 'client' as const,
      title: 'Client enregistré', detail: `${c.prenom} ${c.nom}`.trim(), date: c.createdAt, page: 'clients' as PageHint,
    })),
  ].sort((a, b) => +new Date(b.date) - +new Date(a.date)).slice(0, 8);

  return {
    contractsCount,
    clientsCount,
    templatesCount,
    contractsLast7Days: count(contractDates, d7, now + DAY),
    trends: {
      contractsPct: pctChange(count(contractDates, d30, now + DAY), count(contractDates, d60, d30)),
      clientsPct: pctChange(count(cDates, d30, now + DAY), count(cDates, d60, d30)),
      templatesAdded30Days: count(tDates, d30, now + DAY),
      contracts7DaysPct: pctChange(count(contractDates, d7, now + DAY), count(contractDates, d14, d7)),
    },
    series,
    templateUsage: [...usage.entries()].map(([templateId, count]) => ({ templateId, count })),
    notifications,
    profile: {
      prenom: profile.prenom || '',
      nom: profile.nom || '',
      entreprise: profile.nomCommercial || profile.entrepriseNom || 'GarageFlows',
    },
    recentContracts: recentContracts as unknown as DashboardData['recentContracts'],
    recentTemplates: recentTemplates as unknown as DashboardData['recentTemplates'],
  };
}

export async function importTemplateFromUpload(params: {
  fileName: string;
  buffer: Buffer;
  name?: string;
  category?: string;
  description?: string;
}): Promise<Awaited<ReturnType<typeof importTemplate>>> {
  validateImportedFileSecurity({ fileName: params.fileName, buffer: params.buffer });
  const record = await importTemplate(params);
  writeAppLog('INFO', `Modèle importé : ${record.name} (${record.format}, ${record.variables.length} variables)`);
  return record;
}

export async function importTemplateFromPath(filePath: string, meta?: { name?: string; category?: string; description?: string }) {
  const safe = validateSafeFilePath(filePath);
  if (!fs.existsSync(safe)) throw new Error('Fichier inaccessible.');
  const buffer = fs.readFileSync(safe);
  return importTemplateFromUpload({
    fileName: path.basename(safe),
    buffer,
    ...meta,
  });
}

export async function buildGenerationContext(params: {
  templateId: string;
  clientId?: string;
  variableValues?: Record<string, string>;
  variablePatches?: DetectedVariable[];
}) {
  const template = await getTemplate(params.templateId);
  if (!template) throw new Error('Modèle introuvable.');
  const [profile, subscription, client] = await Promise.all([
    getProfessionalProfile(),
    getSubscriptionConfig(),
    params.clientId ? getClient(params.clientId) : Promise.resolve(null),
  ]);
  const variables = params.variablePatches && params.variablePatches.length > 0 ? params.variablePatches : template.variables;
  const values = valuesFromContext({
    variables,
    client,
    profile,
    subscription,
    overrides: params.variableValues,
  });
  return { template, profile, subscription, client, variables, values };
}

export async function previewContract(params: {
  templateId: string;
  clientId?: string;
  variableValues?: Record<string, string>;
  variablePatches?: DetectedVariable[];
}) {
  const ctx = await buildGenerationContext(params);
  const buffer = readTemplateBuffer(ctx.template);
  const parsed = await parseDocumentBuffer(buffer, ctx.template.originalFileName, ctx.template.storedFilePath);
  const preview = buildContractPreviewPages(parsed, ctx.variables, ctx.values);
  const validation = validateContractBeforeGeneration({
    variables: ctx.variables,
    valuesByVariableId: ctx.values,
    client: ctx.client,
    profile: ctx.profile,
    subscription: ctx.subscription,
  });
  const suggestedFileName = buildRecommendedContractFileName({
    nom: ctx.client?.nom,
    prenom: ctx.client?.prenom,
    format: ctx.template.supportedExports.includes('pdf') ? 'pdf' : ctx.template.supportedExports[0],
  });
  return {
    template: ctx.template,
    client: ctx.client,
    profile: {
      ...ctx.profile,
      iban: ctx.profile.iban ? `${ctx.profile.iban.slice(0, 4)} •••• ${ctx.profile.iban.slice(-4)}` : '',
      rib: ctx.profile.rib ? '[coordonnées bancaires enregistrées]' : '',
    },
    subscription: ctx.subscription,
    variables: ctx.variables,
    values: ctx.values,
    previewPages: preview.previewPages,
    originalText: parsed.fullText,
    finalText: preview.finalParagraphs.join('\n'),
    validation,
    supportedExports: ctx.template.supportedExports,
    suggestedFileName,
    pageCount: parsed.pageCount,
    warnings: parsed.warnings,
    limitations: parsed.limitations,
  };
}

export async function exportContract(params: {
  templateId: string;
  clientId?: string;
  variableValues?: Record<string, string>;
  variablePatches?: DetectedVariable[];
  format: ExportFormat;
  fileName?: string;
  destinationDir?: string;
  overwriteConfirmed?: boolean;
}) {
  const ctx = await buildGenerationContext(params);
  if (!ctx.template.supportedExports.includes(params.format)) {
    throw new Error(
      `Le format .${params.format.toUpperCase()} n'est pas proposé pour ce modèle : le résultat ne serait pas fiable.`
    );
  }
  const originalBuffer = readTemplateBuffer(ctx.template);
  const originalHash = crypto.createHash('sha256').update(originalBuffer).digest('hex');

  const generated = await generateContractDocument({
    templateId: ctx.template.id,
    templateName: ctx.template.name,
    originalBuffer,
    originalFilePath: ctx.template.storedFilePath,
    originalFileName: ctx.template.originalFileName,
    variables: ctx.variables,
    valuesByVariableId: ctx.values,
    targetFormat: params.format,
    client: ctx.client,
    profile: ctx.profile,
    subscription: ctx.subscription,
  });

  const dirs = ensureStorageDirectories();
  const destinationDir = params.destinationDir ? validateSafeFilePath(params.destinationDir) : dirs.generated;
  const fileName =
    params.fileName ||
    buildRecommendedContractFileName({
      nom: ctx.client?.nom,
      prenom: ctx.client?.prenom,
      format: params.format,
    });

  const exported = await exportGeneratedDocumentToDisk({
    buffer: generated.buffer,
    destinationDir,
    fileName,
    format: params.format,
    overwriteConfirmed: params.overwriteConfirmed,
  });

  const stillThere = fs.readFileSync(ctx.template.storedFilePath);
  if (crypto.createHash('sha256').update(stillThere).digest('hex') !== originalHash) {
    throw new Error('ALERTE : le modèle original a été modifié. Export annulé.');
  }

  const record = await saveContract({
    id: `ctr_${crypto.randomBytes(8).toString('hex')}`,
    templateId: ctx.template.id,
    templateName: ctx.template.name,
    clientId: ctx.client?.id,
    clientName: generated.report.clientDisplayName,
    exportFormat: params.format,
    fileName: exported.fileName,
    filePath: exported.filePath,
    fileSize: exported.fileSize,
    sha256: exported.sha256,
    valuesUsed: ctx.values,
    report: generated.report,
    createdAt: new Date().toISOString(),
  });
  await touchTemplateUsed(ctx.template.id);
  writeAppLog('INFO', `Contrat exporté : ${exported.fileName} (${exported.fileSize} octets, fidélité ${generated.report.fidelityReport.fidelityScore})`);

  return {
    contract: record,
    report: generated.report,
    export: exported,
    previewPages: generated.previewPages,
  };
}

export async function getSettingsBundle() {
  const [profile, subscription, customVariables, storage] = await Promise.all([
    getProfessionalProfile(),
    getSubscriptionConfig(),
    getCustomVariableDefinitions(),
    Promise.resolve(getStorageSummary()),
  ]);
  return {
    profile,
    subscription,
    customVariables,
    storage,
    legalNotice:
      "GarageFlows Contract Generator produit un document technique à partir du modèle et des informations que vous validez. Il ne garantit pas la conformité juridique du contrat. Une image de signature ou un tracé n'est pas une signature électronique qualifiée. La validation juridique et la signature du contrat restent sous votre responsabilité.",
  };
}

export async function importBundledExamples(): Promise<{ imported: string[]; skipped: string[] }> {
  const candidates = [
    path.join(process.cwd(), 'examples'),
    path.join(__dirname, '../../../examples'),
    path.join(process.resourcesPath || '', 'examples'),
  ];
  const examplesDir = candidates.find((dir) => fs.existsSync(dir));
  if (!examplesDir) {
    throw new Error('Dossier d’exemples introuvable.');
  }
  const imported: string[] = [];
  const skipped: string[] = [];
  const existing = await listTemplates();
  const knownHashes = new Set(existing.map((item) => item.sha256));
  for (const fileName of fs.readdirSync(examplesDir)) {
    const full = path.join(examplesDir, fileName);
    if (!fs.statSync(full).isFile()) continue;
    if (!/\.(pdf|docx|odt|rtf|txt|html|xlsx|xls|ods|csv|pptx|png|jpe?g|tiff)$/i.test(fileName)) continue;
    const buffer = fs.readFileSync(full);
    const hash = crypto.createHash('sha256').update(buffer).digest('hex');
    if (knownHashes.has(hash)) {
      skipped.push(fileName);
      continue;
    }
    try {
      await importTemplateFromUpload({
        fileName,
        buffer,
        category: 'Exemples',
        description: 'Modèle d’exemple livré avec GarageFlows Contract Generator',
      });
      knownHashes.add(hash);
      imported.push(fileName);
    } catch (error) {
      skipped.push(`${fileName} (${error instanceof Error ? error.message : 'ignoré'})`);
    }
  }
  return { imported, skipped };
}

export const api = {
  getDashboard,
  listTemplates,
  getTemplate,
  importTemplateFromUpload,
  importTemplateFromPath,
  updateTemplate,
  deleteTemplate,
  duplicateTemplate,
  reanalyzeTemplate,
  listClients,
  getClient,
  createClient,
  updateClient,
  deleteClient,
  listContractsByClient,
  getProfessionalProfile,
  saveProfessionalProfile,
  getSubscriptionConfig,
  saveSubscriptionConfig,
  getCustomVariableDefinitions,
  saveCustomVariableDefinitions: async (defs: CustomVariableDefinition[]) => {
    for (const def of defs) {
      if (!/^[A-Z0-9_]{2,40}$/.test(def.key)) {
        throw new Error(`Identifiant de variable invalide : ${def.key}. Utilisez A-Z, 0-9 et _.`);
      }
    }
    return saveCustomVariableDefinitions(defs);
  },
  previewContract,
  exportContract,
  listContracts,
  getContract,
  deleteContract,
  readContractFile(id: string) {
    return getContract(id).then((contract) => {
      if (!contract) throw new Error('Contrat introuvable.');
      if (!fs.existsSync(contract.filePath)) throw new Error('Fichier de contrat introuvable.');
      return { contract, buffer: fs.readFileSync(contract.filePath) };
    });
  },
  exportBackupArchive,
  importBackupArchive: async (buffer: Buffer) => {
    const result = await importBackupArchive(buffer);
    writeAppLog('INFO', `Sauvegarde restaurée (${result.restoredFiles} fichiers)`);
    return result;
  },
  getSettingsBundle,
  importBundledExamples,
  readRecentLogs,
  saveProfileSafe: async (profile: Partial<ProfessionalProfile>) => {
    const saved = await saveProfessionalProfile(profile);
    writeAppLog('INFO', 'Profil professionnel mis à jour');
    return saved;
  },
  saveSubscriptionSafe: async (config: Partial<SubscriptionConfig>) => {
    const saved = await saveSubscriptionConfig(config);
    writeAppLog('INFO', 'Configuration d’abonnement mise à jour');
    return saved;
  },
};
