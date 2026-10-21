import { useEffect, useState } from 'react';
import {
  Building2,
  FilePlus2,
  Files,
  History,
  LayoutDashboard,
  Settings,
  Users,
} from 'lucide-react';
import { api } from './api';
import DashboardPage from './pages/DashboardPage';
import GeneratorPage from './pages/GeneratorPage';
import TemplatesPage from './pages/TemplatesPage';
import ClientsPage from './pages/ClientsPage';
import ProfilePage from './pages/ProfilePage';
import HistoryPage from './pages/HistoryPage';
import SettingsPage from './pages/SettingsPage';

export type PageId = 'dashboard' | 'generate' | 'templates' | 'clients' | 'profile' | 'history' | 'settings';

const NAV: { id: PageId; label: string; hint: string; icon: typeof LayoutDashboard }[] = [
  { id: 'dashboard', label: 'Tableau de bord', hint: 'Activité réelle du poste', icon: LayoutDashboard },
  { id: 'generate', label: 'Générer un contrat', hint: 'Assistant en 6 étapes', icon: FilePlus2 },
  { id: 'templates', label: 'Mes modèles', hint: 'Import et correspondances', icon: Files },
  { id: 'clients', label: 'Clients', hint: 'Fiches réutilisables', icon: Users },
  { id: 'profile', label: 'Mes informations', hint: 'GarageFlows et abonnement', icon: Building2 },
  { id: 'history', label: 'Historique', hint: 'Contrats générés', icon: History },
  { id: 'settings', label: 'Paramètres', hint: 'Sauvegardes et journaux', icon: Settings },
];

export default function App() {
  const [page, setPage] = useState<PageId>('dashboard');
  const [toast, setToast] = useState('');
  const [online, setOnline] = useState(true);

  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(''), 4200);
  };

  useEffect(() => {
    api.health().then(() => setOnline(true)).catch(() => setOnline(false));
  }, []);

  const current = NAV.find((item) => item.id === page)!;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="mark">GF</div>
          <div>
            <h1>GarageFlows</h1>
            <p>Contract Generator</p>
          </div>
        </div>
        <nav className="nav">
          {NAV.map((item) => {
            const Icon = item.icon;
            return (
              <button key={item.id} className={page === item.id ? 'active' : ''} onClick={() => setPage(item.id)}>
                <Icon size={18} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
        <div className="sidebar-foot">
          Traitement 100 % local. Aucune donnée n’est transmise. Le tarif de référence est 99,99 € TTC / mois.
        </div>
      </aside>
      <main className="workspace">
        <header className="topbar">
          <div>
            <h2>{current.label}</h2>
            <p>{current.hint}</p>
          </div>
          <span className={`badge ${online ? 'ok' : 'danger'}`}>{online ? 'Moteur local actif' : 'Moteur local indisponible'}</span>
        </header>
        <section className="content">
          {page === 'dashboard' && <DashboardPage onNavigate={setPage} notify={notify} />}
          {page === 'generate' && <GeneratorPage notify={notify} />}
          {page === 'templates' && <TemplatesPage notify={notify} />}
          {page === 'clients' && <ClientsPage notify={notify} />}
          {page === 'profile' && <ProfilePage notify={notify} />}
          {page === 'history' && <HistoryPage notify={notify} />}
          {page === 'settings' && <SettingsPage notify={notify} />}
        </section>
      </main>
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
