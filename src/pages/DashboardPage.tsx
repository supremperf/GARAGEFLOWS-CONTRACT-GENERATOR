import { useEffect, useState } from 'react';
import { api } from '../api';
import type { PageId } from '../App';

export default function DashboardPage({ onNavigate, notify }: { onNavigate: (page: PageId) => void; notify: (m: string) => void }) {
  const [data, setData] = useState<any>(null);

  const load = () => {
    api.dashboard().then(setData).catch((error) => notify(error.message));
  };
  useEffect(load, []);

  if (!data) return <div className="card">Chargement des données locales…</div>;

  return (
    <div className="stack">
      <div className="grid-stats">
        <article className="card stat"><span>Contrats générés</span><strong>{data.contractsCount}</strong></article>
        <article className="card stat"><span>Clients enregistrés</span><strong>{data.clientsCount}</strong></article>
        <article className="card stat"><span>Modèles disponibles</span><strong>{data.templatesCount}</strong></article>
      </div>
      <div className="grid-2">
        <section className="card stack">
          <div className="spread">
            <h3>Derniers contrats</h3>
            <button className="btn" onClick={() => onNavigate('generate')}>Générer un contrat</button>
          </div>
          {data.recentContracts.length === 0 ? (
            <div className="empty">Aucun contrat généré pour le moment. Les chiffres ci-dessus proviennent uniquement de votre base locale.</div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Client</th><th>Modèle</th><th>Format</th><th>Date</th></tr></thead>
                <tbody>
                  {data.recentContracts.map((item: any) => (
                    <tr key={item.id}>
                      <td>{item.clientName}</td>
                      <td>{item.templateName}</td>
                      <td>{String(item.exportFormat).toUpperCase()}</td>
                      <td>{new Date(item.createdAt).toLocaleString('fr-FR')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
        <section className="card stack">
          <div className="spread">
            <h3>Modèles récents</h3>
            <button className="btn-ghost" onClick={() => onNavigate('templates')}>Gérer</button>
          </div>
          {data.recentTemplates.length === 0 ? (
            <div className="empty">Importez un modèle DOCX, PDF, ODT ou un ancien contrat avec des XXX.</div>
          ) : (
            data.recentTemplates.map((tpl: any) => (
              <div key={tpl.id} className="spread">
                <div>
                  <strong>{tpl.name}</strong>
                  <div className="help">{tpl.format.toUpperCase()} · {tpl.variables.length} variables · {tpl.isDefault ? 'par défaut' : tpl.category}</div>
                </div>
                <span className={`badge ${tpl.supportLevel === 'full' ? 'ok' : 'warn'}`}>{tpl.supportLevel}</span>
              </div>
            ))
          )}
          <div className="info-box">
            Abonnement de référence préconfiguré : GarageFlows, 99,99 € TTC par mois. Aucune clause juridique n’est inventée par le logiciel.
          </div>
        </section>
      </div>
    </div>
  );
}
