import { useEffect, useState } from 'react';
import { api, type ClientRecord, type GeneratedContractRecord } from '../api';

const EMPTY: ClientFormState = {
  civilite: '', nom: '', prenom: '', dateNaissance: '', lieuNaissance: '', adresse: '', complementAdresse: '',
  codePostal: '', ville: '', pays: 'France', telephone: '', email: '', entreprise: '', formeJuridique: '', siret: '',
  tvaIntracommunautaire: '', adresseProfessionnelle: '', representantLegal: '', fonctionRepresentant: '',
  dateSouscription: '', dateDebut: '', typeAbonnement: 'GarageFlows', prixTTC: '99,99', frequencePaiement: 'mois',
  moyenPaiement: 'Prélèvement SEPA', datePrelevement: '', notes: '', customFields: {} as Record<string, string>,
};

type ClientFormState = Omit<ClientRecord, 'id' | 'createdAt' | 'updatedAt' | 'signatureClient'> & { id?: string; signatureClient?: string };

export default function ClientsPage({ notify }: { notify: (m: string) => void }) {
  const [items, setItems] = useState<ClientRecord[]>([]);
  const [query, setQuery] = useState('');
  const [form, setForm] = useState<ClientFormState>(EMPTY);
  const [history, setHistory] = useState<GeneratedContractRecord[]>([]);
  const [customKey, setCustomKey] = useState('');
  const [customValue, setCustomValue] = useState('');

  const load = (q = query) => api.clients(q).then(setItems).catch((e: Error) => notify(e.message));
  useEffect(() => { load(''); }, []);

  const set = (key: string, value: string) => setForm({ ...form, [key]: value });

  const save = async () => {
    try {
      if (form.id) await api.updateClient(form.id, form);
      else await api.createClient(form);
      notify(form.id ? 'Client mis à jour.' : 'Client créé.');
      setForm(EMPTY);
      setHistory([]);
      load();
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Enregistrement du client impossible.');
    }
  };

  return (
    <div className="grid-2">
      <section className="card stack">
        <div className="spread">
          <h3>{form.id ? 'Modifier la fiche' : 'Nouvelle fiche client'}</h3>
          {form.id && <button className="btn-ghost" onClick={() => { setForm(EMPTY); setHistory([]); }}>Nouvelle fiche</button>}
        </div>
        <div className="grid-3">
          <label className="field">Civilité
            <select value={form.civilite} onChange={(e) => set('civilite', e.target.value)}>
              <option value="">—</option><option>M.</option><option>Mme</option>
            </select>
          </label>
          <label className="field">Nom*<input value={form.nom} onChange={(e) => set('nom', e.target.value)} /></label>
          <label className="field">Prénom<input value={form.prenom} onChange={(e) => set('prenom', e.target.value)} /></label>
          <label className="field">Date de naissance<input type="date" value={form.dateNaissance} onChange={(e) => set('dateNaissance', e.target.value)} /></label>
          <label className="field">Lieu de naissance<input value={form.lieuNaissance} onChange={(e) => set('lieuNaissance', e.target.value)} /></label>
          <label className="field">Téléphone<input value={form.telephone} onChange={(e) => set('telephone', e.target.value)} /></label>
          <label className="field">E-mail<input value={form.email} onChange={(e) => set('email', e.target.value)} /></label>
          <label className="field">Adresse<input value={form.adresse} onChange={(e) => set('adresse', e.target.value)} /></label>
          <label className="field">Complément<input value={form.complementAdresse} onChange={(e) => set('complementAdresse', e.target.value)} /></label>
          <label className="field">Code postal<input value={form.codePostal} onChange={(e) => set('codePostal', e.target.value)} /></label>
          <label className="field">Ville<input value={form.ville} onChange={(e) => set('ville', e.target.value)} /></label>
          <label className="field">Pays<input value={form.pays} onChange={(e) => set('pays', e.target.value)} /></label>
          <label className="field">Entreprise<input value={form.entreprise} onChange={(e) => set('entreprise', e.target.value)} /></label>
          <label className="field">Forme juridique<input value={form.formeJuridique} onChange={(e) => set('formeJuridique', e.target.value)} /></label>
          <label className="field">SIRET<input value={form.siret} onChange={(e) => set('siret', e.target.value)} /></label>
          <label className="field">TVA intracommunautaire<input value={form.tvaIntracommunautaire} onChange={(e) => set('tvaIntracommunautaire', e.target.value)} /></label>
          <label className="field">Représentant légal<input value={form.representantLegal} onChange={(e) => set('representantLegal', e.target.value)} /></label>
          <label className="field">Fonction<input value={form.fonctionRepresentant} onChange={(e) => set('fonctionRepresentant', e.target.value)} /></label>
          <label className="field">Abonnement<input value={form.typeAbonnement} onChange={(e) => set('typeAbonnement', e.target.value)} /></label>
          <label className="field">Prix TTC<input value={form.prixTTC} onChange={(e) => set('prixTTC', e.target.value)} /></label>
          <label className="field">Fréquence<input value={form.frequencePaiement} onChange={(e) => set('frequencePaiement', e.target.value)} /></label>
          <label className="field">Moyen de paiement<input value={form.moyenPaiement} onChange={(e) => set('moyenPaiement', e.target.value)} /></label>
          <label className="field">Date de souscription<input type="date" value={form.dateSouscription} onChange={(e) => set('dateSouscription', e.target.value)} /></label>
          <label className="field">Date de début<input type="date" value={form.dateDebut} onChange={(e) => set('dateDebut', e.target.value)} /></label>
        </div>
        <label className="field">Notes<textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} /></label>
        <div className="row">
          <input className="input" placeholder="Champ personnalisé" value={customKey} onChange={(e) => setCustomKey(e.target.value)} />
          <input className="input" placeholder="Valeur" value={customValue} onChange={(e) => setCustomValue(e.target.value)} />
          <button className="btn-ghost" onClick={() => {
            if (!customKey.trim()) return;
            setForm({ ...form, customFields: { ...form.customFields, [customKey.trim().toUpperCase().replace(/\s+/g, '_')]: customValue } });
            setCustomKey(''); setCustomValue('');
          }}>Ajouter</button>
        </div>
        {Object.keys(form.customFields || {}).length > 0 && (
          <div className="help">{Object.entries(form.customFields).map(([k, v]) => `${k}: ${v}`).join(' · ')}</div>
        )}
        <button className="btn" onClick={save}>{form.id ? 'Enregistrer les modifications' : 'Créer le client'}</button>
        {history.length > 0 && (
          <div className="info-box">Contrats déjà générés pour cette fiche : {history.map((h) => h.fileName).join(', ')}</div>
        )}
      </section>
      <section className="card stack">
        <input className="input" placeholder="Rechercher un client" value={query} onChange={(e) => { setQuery(e.target.value); load(e.target.value); }} />
        {items.length === 0 && <div className="empty">Aucun client enregistré.</div>}
        {items.map((client) => (
          <article key={client.id} className="pick">
            <strong>{client.prenom} {client.nom}</strong>
            <p>{client.entreprise || 'Particulier'} · {client.ville || 'Ville non renseignée'} · {client.email || 'sans e-mail'}</p>
            <div className="row" style={{ marginTop: 8 }}>
              <button className="btn-ghost" onClick={() => { setForm(client); api.clientContracts(client.id).then(setHistory); }}>Ouvrir</button>
              <button className="btn-danger" onClick={() => { if (confirm(`Supprimer ${client.prenom} ${client.nom} ?`)) api.deleteClient(client.id).then(() => load()); }}>Supprimer</button>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
