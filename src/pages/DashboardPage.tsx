import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight, ArrowUpRight, Clock3, FileText, Layers, MoreHorizontal, Plus, Sparkles, Trash2, Download, Eye, Users,
} from 'lucide-react';
import { api, downloadUrl } from '../api';
import type { PageId } from '../App';

function Sparkline({ points, color = '#4ea2ff', label }: { points: number[]; color?: string; label: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const w = 120, h = 44, pad = 3;
  const max = Math.max(...points, 1);
  const coords = points.map((v, i) => [pad + (i / Math.max(points.length - 1, 1)) * (w - pad * 2), h - pad - (v / max) * (h - pad * 2)] as const);
  const line = coords.map(([x, y]) => `${x},${y}`).join(' ');
  return (
    <div className="spark" onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label={label}>
        <polygon points={`${pad},${h - pad} ${line} ${w - pad},${h - pad}`} fill={color} opacity="0.14" />
        <polyline points={line} fill="none" stroke={color} strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />
        {coords.map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r={hover === i ? 3.4 : 0} fill={color} className="spark-dot"
            onMouseEnter={() => setHover(i)} />
        ))}
        {coords.map(([x], i) => (
          <rect key={`h${i}`} x={x - 5} y={0} width={10} height={h} fill="transparent" onMouseEnter={() => setHover(i)} />
        ))}
      </svg>
      {hover !== null && <span className="spark-tip">{points[hover]} — {new Date(Date.now() - (points.length - 1 - hover) * 86400000).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}</span>}
    </div>
  );
}

function Trend({ pct, added, suffix }: { pct?: number | null; added?: number; suffix: string }) {
  if (added !== undefined) return <p className="trend"><span className="trend-up"><ArrowUpRight size={13} /> +{added}</span> {suffix}</p>;
  if (pct === null || pct === undefined) return <p className="trend"><span className="trend-up">Nouveau</span> {suffix}</p>;
  const up = pct >= 0;
  return <p className="trend"><span className={up ? 'trend-up' : 'trend-down'}>{up ? '↑' : '↓'} {up ? '+' : ''}{pct}%</span> {suffix}</p>;
}

const TEMPLATE_TONES = ['tone-blue', 'tone-green', 'tone-violet', 'tone-cyan', 'tone-rose'];

export default function DashboardPage({ onNavigate, onGenerate, notify }: {
  onNavigate: (page: PageId) => void;
  onGenerate: (templateId?: string) => void;
  notify: (m: string) => void;
}) {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const load = () => { api.dashboard().then((d) => { setData(d); setError(''); }).catch((e) => setError(e.message)); };
  useEffect(() => { load(); }, []);
  useEffect(() => {
    const close = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuFor(null); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const usage = useMemo(() => new Map<string, number>((data?.templateUsage || []).map((u: any) => [u.templateId, u.count] as [string, number])), [data]);
  if (error) return <div className="card stack"><p className="help">Le moteur local n’a pas répondu : {error}</p><button className="btn" onClick={load}>Réessayer</button></div>;
  if (!data) return <div className="card">Chargement des données locales…</div>;

  const firstName = data.profile?.prenom || data.profile?.nom || 'à vous';
  const today = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const contractsSeries = data.series.map((s: any) => s.contracts);
  const clientsSeries = data.series.map((s: any) => s.clientsCumulative);
  const templatesSeries = data.series.map((s: any) => s.templatesCumulative);

  const stats = [
    { label: 'Contrats générés', value: data.contractsCount, icon: FileText, tone: 'tone-blue', page: 'history' as PageId, series: contractsSeries, trend: <Trend pct={data.trends.contractsPct} suffix="vs mois précédent" /> },
    { label: 'Clients enregistrés', value: data.clientsCount, icon: Users, tone: 'tone-cyan', page: 'clients' as PageId, series: clientsSeries, trend: <Trend pct={data.trends.clientsPct} suffix="vs mois précédent" /> },
    { label: 'Modèles disponibles', value: data.templatesCount, icon: Layers, tone: 'tone-violet', page: 'templates' as PageId, series: templatesSeries, trend: <Trend added={data.trends.templatesAdded30Days} suffix="vs mois précédent" /> },
    { label: 'Dernières générations', value: data.contractsLast7Days, icon: Clock3, tone: 'tone-violet', page: 'history' as PageId, series: contractsSeries.slice(-7), trend: <Trend pct={data.trends.contracts7DaysPct} suffix="ces 7 derniers jours" /> },
  ];

  const removeContract = async (item: any) => {
    setMenuFor(null);
    if (!confirm(`Supprimer « ${item.fileName} » et le fichier généré ?`)) return;
    try { await api.deleteContract(item.id, true); notify('Contrat supprimé. Les indicateurs sont à jour.'); load(); }
    catch (e: any) { notify(e.message); }
  };

  return (
    <div className="dash">
      <div className="dash-head">
        <div>
          <h2 className="dash-title">Bonjour {firstName} <span aria-hidden>👋</span></h2>
          <p className="dash-sub">Gérez et générez vos contrats en toute simplicité avec GarageFlows.</p>
        </div>
        <div className="dash-date">
          <p>{today.charAt(0).toUpperCase() + today.slice(1)}</p>
          <p className="dash-tagline">Des documents pros pour faire avancer votre garage.</p>
        </div>
      </div>

      <div className="grid-stats4">
        {stats.map((s) => { const Icon = s.icon; return (
          <button key={s.label} className="card stat-card" onClick={() => onNavigate(s.page)} title={`Ouvrir : ${s.label}`}>
            <div className="spread"><span className={`stat-icon ${s.tone}`}><Icon size={20} /></span></div>
            <span className="stat-label">{s.label}</span>
            <div className="stat-bottom"><strong>{s.value}</strong><Sparkline points={s.series.length > 1 ? s.series : [0, s.value]} label={`Évolution : ${s.label}`} /></div>
            {s.trend}
          </button> ); })}
      </div>

      <div className="dash-mid">
        <section className="card hero-card">
          <div>
            <h3>Créer un nouveau contrat</h3>
            <p>Sélectionnez un modèle, renseignez les informations et générez votre contrat en quelques clics.</p>
            <button className="btn btn-big" onClick={() => onGenerate()}> <Plus size={18} /> Nouveau contrat <ArrowRight size={17} /></button>
            <p className="hero-badge">✦ Rapide · Simple · Professionnel</p>
          </div>
          <div className="contract-art" aria-hidden>
            <div className="contract-sheet back" /><div className="contract-sheet">
              <span>CONTRAT</span><i /><i /><i className="short" /><em />
            </div>
          </div>
        </section>

        <section className="card assistant-card">
          <div className="spread">
            <div><h3>Assistant de génération</h3><p className="help">Un processus simple et guidé pour un résultat parfait.</p></div>
            <button className="btn-ghost glow" onClick={() => onGenerate()}><Sparkles size={15} /> Lancer l’assistant</button>
          </div>
          <div className="steps-line">
            {[['Choisir un modèle', 'Sélectionnez un modèle de contrat'], ['Renseigner les détails', 'Ajoutez les informations du client et du véhicule'], ['Aperçu et validation', 'Vérifiez votre contrat avant génération'], ['Exporter le PDF', 'Générez et enregistrez votre contrat']].map(([t, d], i) => (
              <button key={t} className="step-item" onClick={() => onGenerate()}>
                <span className={`step-num ${i === 0 ? 'on' : ''}`}>{i + 1}</span>
                <strong>{t}</strong><span>{d}</span>
              </button>
            ))}
          </div>
        </section>
      </div>

      <div className="dash-bottom">
        <section className="card">
          <div className="spread"><h3>Activité récente</h3><button className="btn-ghost small" onClick={() => onNavigate('history')}>Voir tout <ArrowRight size={14} /></button></div>
          {data.recentContracts.length === 0 ? (
            <div className="empty">Aucun contrat généré pour le moment.<br /><button className="btn" style={{ marginTop: 12 }} onClick={() => onGenerate()}>Générer mon premier contrat</button></div>
          ) : (
            <div className="table-wrap flat" ref={menuRef}>
              <table>
                <thead><tr><th>Contrat</th><th>Client</th><th>Modèle</th><th>Date</th><th>Statut</th><th /></tr></thead>
                <tbody>
                  {data.recentContracts.slice(0, 5).map((item: any, i: number) => (
                    <tr key={item.id}>
                      <td><span className="row"><FileText size={15} className="muted-icon" /> {String(item.fileName).replace(/\.[^.]+$/, '').replace(/_/g, ' ')}</span></td>
                      <td>{item.clientName}</td><td>{item.templateName}</td>
                      <td>{new Date(item.createdAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                      <td><span className="badge ok"><i className="dot" />Généré</span></td>
                      <td className="menu-cell">
                        <button className="icon-btn" aria-label="Actions" onClick={() => setMenuFor(menuFor === item.id ? null : item.id)}><MoreHorizontal size={17} /></button>
                        {menuFor === item.id && (
                          <div className="context-menu">
                            <button onClick={() => { setMenuFor(null); onNavigate('history'); }}><Eye size={14} /> Voir dans l’historique</button>
                            <button onClick={() => { setMenuFor(null); downloadUrl(`/api/contracts/${item.id}/download`, item.fileName).catch((e) => notify(e.message)); }}><Download size={14} /> Télécharger</button>
                            <button className="danger" onClick={() => removeContract(item)}><Trash2 size={14} /> Supprimer…</button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="card">
          <div className="spread"><h3>Mes modèles</h3><button className="btn-ghost small" onClick={() => onNavigate('templates')}>Voir tous les modèles <ArrowRight size={14} /></button></div>
          <div className="tpl-grid">
            {data.recentTemplates.slice(0, 5).map((tpl: any, i: number) => (
              <button key={tpl.id} className="tpl-card" onClick={() => onGenerate(tpl.id)} title="Générer un contrat avec ce modèle">
                <span className={`stat-icon ${TEMPLATE_TONES[i % TEMPLATE_TONES.length]}`}><FileText size={17} /></span>
                <strong>{tpl.name}</strong>
                <span className="help">{tpl.description || tpl.category}</span>
                <span className="badge blue">{usage.get(tpl.id) || 0} utilisation{(usage.get(tpl.id) || 0) > 1 ? 's' : ''}</span>
              </button>
            ))}
            <button className="tpl-card add" onClick={() => onNavigate('templates')}>
              <span className="add-plus"><Plus size={18} /></span><strong>Ajouter un modèle</strong><span className="help">Importez votre propre modèle</span>
            </button>
          </div>
          {data.recentTemplates.length === 0 && <div className="empty">Aucun modèle importé. Utilisez « Ajouter un modèle » pour importer votre premier contrat type.</div>}
        </section>
      </div>

      <footer className="quote-bar">
        <p><span className="quote-mark">▥</span> “Des outils simples pour des professionnels exigeants.” <span className="help">· GarageFlows</span></p>
        <p className="quote-tags"><span>🛡 Local</span><span>Sécurisé</span><span>Efficace</span></p>
      </footer>
    </div>
  );
}
