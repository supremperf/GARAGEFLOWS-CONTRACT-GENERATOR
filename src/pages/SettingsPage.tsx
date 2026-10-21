import { useEffect, useState } from 'react';
import { api, fileToBase64 } from '../api';

export default function SettingsPage({ notify }: { notify: (m: string) => void }) {
  const [settings, setSettings] = useState<any>(null);
  const [logs, setLogs] = useState<string[]>([]);
  useEffect(() => {
    api.settings().then(setSettings).catch((e) => notify(e.message));
    api.logs().then((r) => setLogs(r.lines)).catch(() => undefined);
  }, []);
  if (!settings) return <div className="card">Chargement…</div>;

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
            window.location.href = '/api/backup/download';
          }).catch((e) => notify(e.message))}>Exporter une sauvegarde</button>
          <label className="btn-ghost">Restaurer une archive
            <input hidden type="file" accept=".zip,application/zip" onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              if (!confirm('La restauration remplace les données locales par le contenu de l’archive. Continuer ?')) return;
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
          {logs.length === 0 ? <div className="empty">Journal vide.</div> : logs.map((line, i) => <div key={i} className="mono" style={{ padding: '4px 8px' }}>{line}</div>)}
        </div>
      </section>
    </div>
  );
}
