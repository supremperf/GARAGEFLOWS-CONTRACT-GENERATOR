import { useEffect, useState } from ‘react’;
import { api, fileToBase64 } from ‘../api’;
import { SyncPanel, SyncApiProvider, useSyncPanel } from ‘@garageflows/sync-core/ui’;
import React from ‘react’;

// Sync API implementation for Contract Generator (uses HTTP API)
const contractGenSyncApi = {
  getStatus: async () => {
    try {
      const response = await fetch(‘/api/sync/status’);
      return response.json();
    } catch {
      return { enabled: false, pendingEvents: 0 };
    }
  },
  pushEvents: async () => {
    try {
      const response = await fetch(‘/api/sync/push’, { method: ‘POST’ });
      return response.json();
    } catch {
      return { pushed: 0, errors: [‘Push failed’] };
    }
  },
  pullEvents: async () => {
    try {
      const response = await fetch(‘/api/sync/pull’, { method: ‘POST’ });
      return response.json();
    } catch {
      return { pulled: 0, errors: [‘Pull failed’] };
    }
  },
  getMetrics: async () => {
    try {
      const response = await fetch(‘/api/sync/metrics’);
      return response.json();
    } catch {
      return {};
    }
  },
  listConflicts: async (globalId?: string) => {
    try {
      const url = globalId ? `/api/sync/conflicts?globalId=${encodeURIComponent(globalId)}` : ‘/api/sync/conflicts’;
      const response = await fetch(url);
      return response.json();
    } catch {
      return { conflicts: [] };
    }
  },
  resolveConflict: async (conflictId: number, resolution: string, value?: any) => {
    try {
      const response = await fetch(‘/api/sync/conflicts/resolve’, {
        method: ‘POST’,
        headers: { ‘Content-Type’: ‘application/json’ },
        body: JSON.stringify({ conflictId, resolution, value }),
      });
      return response.json();
    } catch {
      return { resolved: false };
    }
  },
  runDeduplication: async () => {
    try {
      const response = await fetch(‘/api/sync/deduplicate’, { method: ‘POST’ });
      return response.json();
    } catch {
      return { matches: 0, autoMerged: 0 };
    }
  },
  listGlobals: async (status?: string) => {
    try {
      const url = status ? `/api/sync/globals?status=${encodeURIComponent(status)}` : ‘/api/sync/globals’;
      const response = await fetch(url);
      return response.json();
    } catch {
      return { globals: [] };
    }
  },
  getConfig: async () => {
    try {
      const response = await fetch(‘/api/sync/config’);
      return response.json();
    } catch {
      return {};
    }
  },
  saveConfig: async (config: any) => {
    try {
      const response = await fetch(‘/api/sync/config’, {
        method: ‘PUT’,
        headers: { ‘Content-Type’: ‘application/json’ },
        body: JSON.stringify({ config }),
      });
      return response.json();
    } catch {
      return { saved: false };
    }
  },
  forcePush: async () => {
    try {
      const response = await fetch(‘/api/sync/force-push’, { method: ‘POST’ });
      return response.json();
    } catch {
      return { pushed: 0, errors: [‘Force push failed’] };
    }
  },
};

function SettingsPageInner({ notify }: { notify: (m: string) => void }) {
  const [settings, setSettings] = useState<any>(null);
  const [logs, setLogs] = useState<string[]>([]);
  useEffect(() => {
    api.settings().then(setSettings).catch((e) => notify(e.message));
    api.logs().then((r) => setLogs(r.lines)).catch(() => undefined);
  }, []);
  if (!settings) return <div className="card">Chargement…</div>;

  const { metrics, conflicts, globals, config, actions, loading, error, reloadAll } = useSyncPanel();

  return (
    <div className="stack">
      <section className="card stack">
        <h3>Stockage local</h3>
        <p className="mono">{settings.storage.root}</p>
        <p className="help">Volume local : {(settings.storage.bytes / 1024).toFixed(1)} Ko. Les données restent dans ce dossier après fermeture et mise à jour.</p>
        <div className="grid-2">
          {Object.entries(settings.storage.directories).map(([key, value]) => (
            <div key={key} className="help"><strong>{key}</strong><br />{String(value)}</div>
          ))}
        </div>
      </section>
      <section className="card stack">
        <h3>Sauvegarde et restauration</h3>
        <div className="row">
          <button className="btn" onClick={() => api.exportBackup().then((r) => {
            notify(`Sauvegarde créée : ${r.fileName}`);
            window.location.href = ‘/api/backup/download’;
          }).catch((e) => notify(e.message))}>Exporter une sauvegarde</button>
          <label className="btn-ghost">Restaurer une archive
            <input hidden type="file" accept=".zip,application/zip" onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              if (!confirm(‘La restauration remplace les données locales par le contenu de l’archive. Continuer ?’)) return;
              const base64 = await fileToBase64(file);
              api.importBackup(base64).then((r) => notify(`${r.restoredFiles} fichiers restaurés. Rechargez les écrans.`)).catch((err) => notify(err.message));
            }} />
          </label>
        </div>
      </section>
      <section className="card stack">
        <h3>Mention légale</h3>
        <div className="info-box">{settings.legalNotice}</div>
      </section>
      <section className="card stack">
        <h3>Journal technique</h3>
        <p className="help">Les IBAN, signatures et e-mails sont masqués.</p>
        <div className="table-wrap" style={{ maxHeight: 280 }}>
          {logs.length === 0 ? <div className="empty">Journal vide.</div> : logs.map((line, i) => <div key={i} className="mono" style={{ padding: ‘4px 8px’ }}>{line}</div>)}
        </div>
      </section>
      <section className="card stack">
        <h3>Synchronisation GarageFlows</h3>
        <p className="help">Synchronisation inter-applications (NEXA CRM, Contract Generator, FacturePro)</p>
        <SyncPanel
          metrics={metrics}
          conflicts={conflicts}
          globals={globals}
          config={config}
          actions={actions}
          loading={loading}
          error={error}
          onRefresh={reloadAll}
        />
      </section>
    </div>
  );
}

export default function SettingsPage(props: { notify: (m: string) => void }) {
  return (
    <SyncApiProvider api={contractGenSyncApi}>
      <SettingsPageInner {...props} />
    </SyncApiProvider>
  );
}
