import ProfessionalContractHistory from '../ProfessionalContractHistory';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { api, type ClientRecord, type GeneratedContractRecord } from '../api';

const EMPTY: ClientFormState = {
  civilite: '', nom: '', prenom: '', dateNaissance: '', lieuNaissance: '', adresse: '', complementAdresse: '',
  codePostal: '', ville: '', pays: 'France', telephone: '', email: '', entreprise: '', formeJuridique: '', siret: '',
  tvaIntracommunautaire: '', adresseProfessionnelle: '', representantLegal: '', fonctionRepresentant: '',
  dateSouscription: '', dateDebut: '', typeAbonnement: 'GarageFlows', prixTTC: '99,99', frequencePaiement: 'mois',
  moyenPaiement: 'Prélèvement SEPA', datePrelevement: '', notes: '', customFields: {} as Record<string, string>,
};

type ClientFormState = Omit<ClientRecord, 'id' | 'createdAt' | 'updatedAt' | 'signatureClient'> & { id?: string; signatureClient?: string };

export default function ClientsPage({ notify, onGenerateContract, onResumeContract }: { notify: (m: string) => void; onGenerateContract?: (id: string) => void; onResumeContract?: (id: string) => void }) {
  const [items, setItems] = useState<ClientRecord[]>([]);
  const [query, setQuery] = useState('');
  const [form, setForm] = useState<ClientFormState>(EMPTY);
  const [history, setHistory] = useState<GeneratedContractRecord[]>([]);
  const [customKey, setCustomKey] = useState('');
  const [customValue, setCustomValue] = useState('');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [customError, setCustomError] = useState('');
  const savingRef = useRef(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const customKeyRef = useRef<HTMLInputElement>(null);
  const loadVersion = useRef(0);

  const load = async (q = query) => {
    const version = ++loadVersion.current;
    try {
      const clients = await api.clients(q);
      if (version === loadVersion.current) setItems(clients);
    } catch (e) { if (version === loadVersion.current) notify(e instanceof Error ? e.message : 'Chargement des clients impossible.'); }
  };
  useEffect(() => { load(''); }, []);

  const set = (key: string, value: string) => setForm(previous => ({ ...previous, [key]: value }));

  const addCustomField = () => {
    if (!customKey.trim()) {
      setCustomError('Indiquez le nom du champ personnalisé.');
      customKeyRef.current?.focus();
      return;
    }
    const key = customKey.trim().toUpperCase().replace(/\s+/g, '_');
    setForm(previous => ({ ...previous, customFields: { ...previous.customFields, [key]: customValue } }));
    setCustomKey(''); setCustomValue(''); setCustomError('');
    customKeyRef.current?.focus();
  };

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (savingRef.current) return;
    setError('');
    if (!form.nom.trim()) {
      setError('Le nom du client est obligatoire.');
      nameRef.current?.focus();
      return;
    }
    savingRef.current = true;
    setSaving(true);
    try {
      const saved = form.id ? await api.updateClient(form.id, form) : await api.createClient(form);
      // The acknowledged record is already durable in SQLite. Never reset on an error.
      ++loadVersion.current;
      setItems(previous => [saved, ...previous.filter(client => client.id !== saved.id)]);
      setQuery('');
      notify(form.id ? 'Client mis à jour.' : 'Client créé.');
      setForm(EMPTY);
      setHistory([]);
      setCustomKey(''); setCustomValue(''); setCustomError('');
      void load('');
    } catch (error) {
      const message = error instanceof TypeError
        ? `Enregistrement impossible : le moteur local est injoignable (${error.message}). Votre saisie est conservée.`
        : error instanceof Error ? error.message : 'Enregistrement du client impossible.';
      setError(message);
      notify(message);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <div className="grid-2">
      <form className="card stack" onSubmit={save} aria-label="Fiche client" aria-busy={saving}>
        <div className="spread">
          <h3>{form.id ? 'Modifier la fiche' : 'Nouvelle fiche client'}</h3>
          {form.id && <button type="button" className="btn-ghost" disabled={saving} onClick={() => { setForm(EMPTY); setHistory([]); setError(''); }}>Nouvelle fiche</button>}
        </div>
        <fieldset className="stack client-fields" disabled={saving}>
          <div className="grid-3">
            <label className="field">Civilité
              <select value={form.civilite} onChange={(e) => set('civilite', e.target.value)}>
                <option value="">—</option><option>M.</option><option>Mme</option>
              </select>
            </label>
            <label className="field">Nom*<input ref={nameRef} required onInvalid={() => setError('Le nom du client est obligatoire.')} aria-invalid={Boolean(error && !form.nom.trim())} aria-describedby={error ? 'client-form-error' : undefined} value={form.nom} onChange={(e) => set('nom', e.target.value)} /></label>
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
            <label className="field">Fréquence<select value={form.frequencePaiement} onChange={(e) => set('frequencePaiement', e.target.value)}>
              <option value="">—</option><option value="mois">Mensuelle</option><option value="trimestre">Trimestrielle</option><option value="semestre">Semestrielle</option><option value="an">Annuelle</option>
              {form.frequencePaiement && !['mois', 'trimestre', 'semestre', 'an'].includes(form.frequencePaiement) && <option value={form.frequencePaiement}>{form.frequencePaiement}</option>}
            </select></label>
            <label className="field">Moyen de paiement<select value={form.moyenPaiement} onChange={(e) => set('moyenPaiement', e.target.value)}>
              <option value="">—</option>{['Prélèvement SEPA', 'Virement bancaire', 'Carte bancaire', 'Chèque', 'Espèces'].map(value => <option key={value}>{value}</option>)}
              {form.moyenPaiement && !['Prélèvement SEPA', 'Virement bancaire', 'Carte bancaire', 'Chèque', 'Espèces'].includes(form.moyenPaiement) && <option value={form.moyenPaiement}>{form.moyenPaiement}</option>}
            </select></label>
            <label className="field">Date de souscription<input type="date" value={form.dateSouscription} onChange={(e) => set('dateSouscription', e.target.value)} /></label>
            <label className="field">Date de début<input type="date" value={form.dateDebut} onChange={(e) => set('dateDebut', e.target.value)} /></label>
          </div>
          <label className="field">Notes<textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} /></label>
          <div className="row" onKeyDown={event => { if (event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); addCustomField(); } }}>
            <input ref={customKeyRef} className="input" aria-label="Champ personnalisé" placeholder="Champ personnalisé" value={customKey} onChange={(e) => setCustomKey(e.target.value)} />
            <input className="input" aria-label="Valeur du champ personnalisé" placeholder="Valeur" value={customValue} onChange={(e) => setCustomValue(e.target.value)} />
            <button type="button" className="btn-ghost" onClick={addCustomField}>Ajouter</button>
          </div>
          {customError && <div className="warn-box" role="alert">{customError}</div>}
          {Object.keys(form.customFields || {}).length > 0 && (
            <div className="help">{Object.entries(form.customFields).map(([k, v]) => `${k}: ${v}`).join(' · ')}</div>
          )}
          <button className="btn" type="submit">{saving ? 'Enregistrement…' : form.id ? 'Enregistrer les modifications' : 'Créer le client'}</button>
        </fieldset>
        {error && <div id="client-form-error" className="warn-box" role="alert">{error}</div>}
        {history.length > 0 && (
          <div className="info-box">Contrats déjà générés pour cette fiche : {history.map((h) => h.fileName).join(', ')}</div>
        )}
      </form>
      <section className="card stack">
        <input className="input" placeholder="Rechercher un client" value={query} onChange={(e) => { setQuery(e.target.value); load(e.target.value); }} />
        {items.length === 0 && <div className="empty">Aucun client enregistré.</div>}
        {items.map((client) => (
          <article key={client.id} className="pick">
            <strong>{client.prenom} {client.nom}</strong>
            <p>{client.entreprise || 'Particulier'} · {client.ville || 'Ville non renseignée'} · {client.email || 'sans e-mail'}</p>
            <div className="row" style={{ marginTop: 8 }}>
              <button className="btn-ghost" disabled={saving} onClick={() => { setForm(client); setError(''); setCustomError(''); setCustomKey(''); setCustomValue(''); api.clientContracts(client.id).then(setHistory).catch((e: Error) => notify(e.message)); }}>Ouvrir</button>
              {onGenerateContract && <button className="btn-ghost" disabled={saving} onClick={() => onGenerateContract(client.id)}>Générer un contrat</button>}
              <button className="btn-danger" disabled={saving} onClick={() => { if (confirm(`Supprimer ${client.prenom} ${client.nom} ?`)) api.deleteClient(client.id).then(() => load()); }}>Supprimer</button>
            </div>
          </article>
        ))}
      </section>
      {form.id && <div className="pro-client-history"><ProfessionalContractHistory key={form.id} clientId={form.id} onResume={onResumeContract} /></div>}
    </div>
  );
}
