import { useEffect, useRef, useState } from 'react';
import {
  Bell, Building2, ChevronDown, FilePlus2, History, Home, Layers, LayoutDashboard,
  LogOut, Search, Settings, User, Users,
} from 'lucide-react';
import { api, type DashboardData, type ProfessionalProfile } from './api';
import DashboardPage from './pages/DashboardPage';
import GeneratorPage from './pages/GeneratorPage';
import TemplatesPage from './pages/TemplatesPage';
import ClientsPage from './pages/ClientsPage';
import ProfilePage from './pages/ProfilePage';
import HistoryPage from './pages/HistoryPage';
import SettingsPage from './pages/SettingsPage';

export type PageId = 'dashboard' | 'generate' | 'templates' | 'clients' | 'profile' | 'history' | 'settings';

const NAV: { id: PageId; label: string; hint: string; icon: typeof LayoutDashboard }[] = [
  { id: 'dashboard', label: 'Dashboard', hint: 'Activité réelle du poste', icon: Home },
  { id: 'generate', label: 'Générer un contrat', hint: 'Assistant en 6 étapes', icon: FilePlus2 },
  { id: 'templates', label: 'Mes modèles', hint: 'Import et correspondances', icon: Layers },
  { id: 'clients', label: 'Clients', hint: 'Fiches réutilisables', icon: Users },
  { id: 'profile', label: 'Mes informations', hint: 'GarageFlows et abonnement', icon: User },
  { id: 'history', label: 'Historique', hint: 'Contrats générés', icon: History },
  { id: 'settings', label: 'Paramètres', hint: 'Sauvegardes et journaux', icon: Settings },
];

interface SearchHit { id: string; kind: string; label: string; detail: string; page: PageId; templateId?: string }

export default function App() {
  const [page, setPage] = useState<PageId>('dashboard');
  const [toast, setToast] = useState('');
  const [online, setOnline] = useState(true);
  const [profile, setProfile] = useState<ProfessionalProfile | null>(null);
  const [notifications, setNotifications] = useState<DashboardData['notifications']>([]);
  const [notifOpen, setNotifOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [generateTemplateId, setGenerateTemplateId] = useState<string | undefined>();
  const [generateKey, setGenerateKey] = useState(0);
  const searchRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);
  const userRef = useRef<HTMLDivElement>(null);

  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(''), 4200);
  };

  const refreshChrome = () => {
    api.health().then(() => setOnline(true)).catch(() => setOnline(false));
    api.profile().then(setProfile).catch(() => undefined);
    api.dashboard().then((d) => setNotifications(d.notifications || [])).catch(() => undefined);
  };
  useEffect(refreshChrome, [page]);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setSearchOpen(false);
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false);
      if (userRef.current && !userRef.current.contains(e.target as Node)) setUserOpen(false);
    };
    const keys = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        document.querySelector<HTMLInputElement>('.global-search input')?.focus();
      }
      if (e.key === 'Escape') { setSearchOpen(false); setNotifOpen(false); setUserOpen(false); }
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', keys);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', keys); };
  }, []);

  useEffect(() => {
    if (!query.trim()) { setHits([]); return; }
    const t = window.setTimeout(async () => {
      try {
        const [clients, templates, contracts] = await Promise.all([api.clients(query), api.templates(), api.contracts()]);
        const q = query.toLowerCase();
        setHits([
          ...clients.map((c) => ({ id: `c-${c.id}`, kind: 'Client', label: `${c.prenom} ${c.nom}`.trim(), detail: c.email || c.ville || '', page: 'clients' as PageId })),
          ...templates.filter((t) => t.name.toLowerCase().includes(q)).map((t) => ({ id: `t-${t.id}`, kind: 'Modèle', label: t.name, detail: t.format.toUpperCase(), page: 'generate' as PageId, templateId: t.id })),
          ...contracts.filter((c) => `${c.clientName} ${c.templateName} ${c.fileName}`.toLowerCase().includes(q)).slice(0, 5).map((c) => ({ id: `k-${c.id}`, kind: 'Contrat', label: c.fileName, detail: c.clientName, page: 'history' as PageId })),
        ].slice(0, 9));
        setSearchOpen(true);
      } catch { setHits([]); }
    }, 220);
    return () => window.clearTimeout(t);
  }, [query]);

  const goGenerate = (templateId?: string) => { setGenerateTemplateId(templateId); setGenerateKey((k) => k + 1); setPage('generate'); };
  const displayName = profile ? (`${profile.prenom || ''} ${profile.nom || ''}`.trim() || profile.nomCommercial || profile.entrepriseNom || 'Mon garage') : 'Mon garage';
  const initials = displayName.split(/\s+/).map((w: string) => w[0]).slice(0, 2).join('').toUpperCase() || 'GF';
  const garage = profile?.nomCommercial || profile?.entrepriseNom || 'GarageFlows';

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="mark gf-logo">GF</div>
          <div><h1>GarageFlows</h1><p>Contract Generator</p></div>
        </div>
        <nav className="nav" aria-label="Navigation principale">
          {NAV.map((item) => { const Icon = item.icon; return (
            <button key={item.id} className={page === item.id ? 'active' : ''} onClick={() => setPage(item.id)} aria-current={page === item.id ? 'page' : undefined}>
              <Icon size={19} /><span>{item.label}</span>
            </button> ); })}
        </nav>
        <div className="promo-card" aria-hidden>
          <p>Des contrats<br />plus simples.<br />Un garage plus fort.</p>
          <svg viewBox="0 0 200 60" preserveAspectRatio="none"><path d="M0,48 C40,20 70,55 105,32 C140,10 165,38 200,14" fill="none" stroke="#4ea2ff" strokeWidth="2.5" /><path d="M0,55 C45,35 80,58 115,42 C150,26 175,45 200,28" fill="none" stroke="#2563eb" strokeWidth="2" opacity=".6" /></svg>
        </div>
        <div className="sidebar-foot"><strong>GarageFlows</strong><span>Contract Generator</span><span>v1.0.0</span></div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div className="global-search" ref={searchRef}>
            <Search size={17} />
            <input value={query} onChange={(e) => setQuery(e.target.value)} onFocus={() => hits.length && setSearchOpen(true)}
              placeholder="Rechercher un client, un contrat, un modèle..." aria-label="Recherche globale" />
            <kbd>⌘ K</kbd>
            {searchOpen && query.trim() && (
              <div className="search-results">
                {hits.length === 0 ? <p className="search-empty">Aucun résultat pour « {query} » dans vos données locales.</p> :
                  hits.map((h) => (
                    <button key={h.id} onClick={() => { setSearchOpen(false); setQuery(''); if (h.templateId) goGenerate(h.templateId); else setPage(h.page); }}>
                      <span className="badge blue">{h.kind}</span><span><strong>{h.label}</strong>{h.detail && <small>{h.detail}</small>}</span>
                    </button>
                  ))}
              </div>
            )}
          </div>
          <div className="top-actions">
            <span className={`local-pill ${online ? '' : 'offline'}`} title="Toutes vos données restent sur cet appareil">
              <i className="dot" />{online ? 'Fonctionne en local' : 'Moteur local indisponible'}<small>Toutes vos données restent sur cet appareil</small>
            </span>
            <div className="pop-wrap" ref={notifRef}>
              <button className="icon-btn bell" aria-label="Notifications" onClick={() => setNotifOpen(!notifOpen)}>
                <Bell size={19} />{notifications.length > 0 && <i className="bell-dot" />}
              </button>
              {notifOpen && (
                <div className="popover">
                  <h4>Activité réelle</h4>
                  {notifications.length === 0 ? <p className="help">Aucun événement enregistré pour le moment.</p> :
                    notifications.map((n) => (
                      <button key={n.id} className="notif" onClick={() => { setNotifOpen(false); setPage(n.page); }}>
                        <strong>{n.title}</strong><span>{n.detail}</span><small>{new Date(n.date).toLocaleString('fr-FR')}</small>
                      </button>
                    ))}
                </div>
              )}
            </div>
            <div className="pop-wrap" ref={userRef}>
              <button className="user-chip" onClick={() => setUserOpen(!userOpen)}>
                <span className="avatar">{initials}</span>
                <span className="user-meta"><strong>{displayName}</strong><small>{garage}</small></span>
                <ChevronDown size={16} />
              </button>
              {userOpen && (
                <div className="popover right">
                  <button className="notif" onClick={() => { setUserOpen(false); setPage('profile'); }}><strong><Building2 size={14} /> Mes informations</strong><span>Identité et abonnement GarageFlows</span></button>
                  <button className="notif" onClick={() => { setUserOpen(false); setPage('settings'); }}><strong><Settings size={14} /> Paramètres</strong><span>Sauvegardes et journaux locaux</span></button>
                  <button className="notif" onClick={() => { setUserOpen(false); refreshChrome(); notify(online ? 'Moteur local actif : vos données restent sur cet appareil.' : 'Moteur local indisponible.'); }}><strong><LogOut size={14} /> État du poste</strong><span>{online ? 'Fonctionne en local' : 'Indisponible'}</span></button>
                </div>
              )}
            </div>
          </div>
        </header>

        <section className="content" key={page} tabIndex={-1} data-scroll-region="main" aria-label="Contenu de la page">
          {page === 'dashboard' && <DashboardPage onNavigate={setPage} onGenerate={goGenerate} notify={notify} />}
          {page === 'generate' && <GeneratorPage key={generateKey} notify={notify} initialTemplateId={generateTemplateId} />}
          {page === 'templates' && <TemplatesPage notify={notify} />}
          {page === 'clients' && <ClientsPage notify={notify} />}
          {page === 'profile' && <ProfilePage notify={notify} />}
          {page === 'history' && <HistoryPage notify={notify} />}
          {page === 'settings' && <SettingsPage notify={notify} />}
        </section>
      </main>
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}
