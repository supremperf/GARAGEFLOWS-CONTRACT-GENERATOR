import { useEffect, useRef, useState } from 'react';
import { api, downloadUrl, type ClientRecord } from '../api';
import { EMPTY_TERMS, INTEGRATIONS, STATE_LABELS, type ContractTerms, type LegalModel, type ProfessionalContract } from '../../core/contracts/types';
import { professionalApi } from '../professional-api';
import ActualPdfPreview, { printActualPdf } from '../ActualPdfPreview';
import ProfessionalModelSetup from '../ProfessionalModelSetup';

const steps = ['Client', 'Abonnement', 'Vérification', 'Conditions particulières', 'Aperçu PDF exact', 'Génération'];
export default function ProfessionalContractWizard({ initialClientId, initialContractId, notify }: { initialClientId?: string; initialContractId?: string; notify: (message: string) => void }) {
  const [clients, setClients] = useState<ClientRecord[]>([]), [models, setModels] = useState<LegalModel[]>([]);
  const [clientId, setClientId] = useState(initialClientId || ''), [modelId, setModelId] = useState('');
  const [terms, setTerms] = useState<ContractTerms>({ ...EMPTY_TERMS }), [item, setItem] = useState<ProfessionalContract | null>(null);
  const [step, setStep] = useState(0), [error, setError] = useState(''), [busy, setBusy] = useState(false), [pdfChecked, setPdfChecked] = useState(false);
  const lock = useRef(false), requestId = useRef(crypto.randomUUID());
  const loadModels = () => professionalApi.models().then(m => { setModels(m); setModelId(current => current || m.find(model => model.bundled)?.id || m[0]?.id || ''); });
  useEffect(() => {
    if (!initialContractId) Promise.all([api.profile(), api.subscription()]).then(([p, s]) => setTerms(t => ({ ...t, taxRegime: p.tvaRegime || '', commitment: s.dureeEngagement || '' }))).catch((e: Error) => setError(e.message));
    api.clients().then(setClients).catch((e: Error) => setError(e.message));
    loadModels().catch((e: Error) => setError(e.message));
    if (initialContractId) professionalApi.get(initialContractId).then(c => { setItem(c); setClientId(c.clientId); setModelId(c.model.id); setTerms(c.context.terms); setStep(c.generatedAt ? 5 : c.previewHash ? 4 : 2); }).catch((e: Error) => setError(e.message));
  }, [initialContractId]);
  useEffect(() => {
    if (!item && clientId) { const date = clients.find(c => c.id === clientId)?.datePrelevement || ''; if (/^\d{4}-\d{2}-\d{2}$/.test(date)) setTerms(t => ({ ...t, firstDueDate: date })); }
  }, [clientId, clients, item]);
  async function run(work: () => Promise<void>) {
    if (lock.current) return; lock.current = true; setBusy(true); setError('');
    try { await work(); } catch (e) { setError((e as Error).message); } finally { lock.current = false; setBusy(false); }
  }
  const setTerm = <K extends keyof ContractTerms>(key: K, value: ContractTerms[K]) => { setTerms(t => ({ ...t, [key]: value })); setPdfChecked(false); };
  async function saveDraft(): Promise<ProfessionalContract> {
    const saved = item ? await professionalApi.update(item, terms) : await professionalApi.create(clientId, modelId, terms, undefined, undefined, requestId.current);
    setItem(saved); return saved;
  }
  const client = clients.find(c => c.id === clientId);
  const textField = (key: 'firstDueDate' | 'endDate' | 'commitment' | 'discountDuration', label: string, type = 'text') => <label className="field">{label}<input type={type} value={terms[key]} disabled={busy || !!item?.generatedAt} onChange={e => setTerm(key, e.target.value)} /></label>;
  return <div className="stack pro-contract">
    <section className="card stack">
      <div className="row"><h3>Contrat professionnel GarageFlows</h3>{item && <span className="badge">{item.number} · {STATE_LABELS[item.state]}</span>}</div>
      <ol className="pro-steps" aria-label="Étapes du contrat professionnel">{steps.map((label, i) => <li className={i === step ? 'current' : ''} aria-current={i === step ? 'step' : undefined} key={label}>{i + 1}. {label}</li>)}</ol>
      {error && <div className="warn-box" role="alert">{error}</div>}
      {step === 0 && <>
        <label className="field">Client professionnel<select value={clientId} disabled={busy || !!item} onChange={e => setClientId(e.target.value)}><option value="">Choisir un client…</option>{clients.map(c => <option key={c.id} value={c.id}>{c.entreprise || `${c.prenom} ${c.nom}`} — {c.email}</option>)}</select></label>
        <label className="field">Version juridique intégrale<select value={modelId} disabled={busy || !!item} onChange={e => setModelId(e.target.value)}><option value="">Choisir une version…</option>{models.map(m => <option key={m.id} value={m.id}>v{m.version} — {m.date} · {m.sha256.slice(0, 12)}{m.bundled ? ' · Modèle fourni' : ''}</option>)}</select></label>
        <p className="help">Les fiches Clients et Mes informations restent les sources d’identité et de prix. Aucune donnée de démonstration n’est injectée.</p>
      </>}
      {step === 1 && <>
        <div className="info-box">Prix TTC enregistré : <strong>{client?.prixTTC || 'À vérifier dans les paramètres enregistrés'}</strong> · fréquence : {client?.frequencePaiement || 'Paramètres enregistrés'}<br />Activation prévue/déclarée : {client?.dateDebut || 'Manquante : compléter la fiche client'}. La date de souscription n’est pas une date de signature.</div>
        <label className="field">Régime fiscal applicable<select value={terms.taxRegime} onChange={e => setTerm('taxRegime', e.target.value as ContractTerms['taxRegime'])}><option value="">À confirmer…</option><option value="vat">TVA applicable — taux des paramètres enregistrés</option><option value="franchise">Franchise de TVA — article 293 B du CGI</option></select></label>
        <p className="help">Franchise de TVA : enregistrer également un taux de 0 dans Mes informations pour que HT = TTC dans les paramètres et le contrat.</p>
        <div className="grid-2">{textField('firstDueDate', 'Première échéance réelle*', 'date')}{textField('endDate', 'Date de fin expressément stipulée (facultative)', 'date')}{textField('commitment', 'Engagement particulier (facultatif)')}</div>
        <div className="warn-box">Aucun recalcul silencieux du prix client. Pour corriger le tarif ou l’identité, modifier la fiche ou les paramètres, puis actualiser le brouillon.</div>
      </>}
      {step === 2 && item && <>
        <h4>Contexte unique figé · données à vérifier</h4>
        <div className="grid-2">{[['Prestataire', item.context.fields.PRESTATAIRE_NOM], ['Client', item.clientName], ['Prix TTC / HT', `${item.context.fields.PRIX_TTC} / ${item.context.fields.PRIX_HT} €`], ['TVA', item.context.fields.TVA_MENTION], ['Périodicité', item.context.fields.PERIODICITE], ['Activation prévue/déclarée', item.context.fields.DATE_EFFET], ['Première échéance', item.context.fields.PREMIERE_ECHEANCE], ['Source du prix', item.context.priceSource === 'client' ? 'Fiche client enregistrée' : 'Paramètres enregistrés']].map(([label, value]) => <div className="info-box" key={label}><strong>{label}</strong><br />{value || 'Manquant'}</div>)}</div>
        {item.context.errors.length > 0 && <div className="warn-box"><strong>Points à compléter avant le PDF :</strong><ul>{item.context.errors.map(e => <li key={e}>{e}</li>)}</ul></div>}
        <ul className="help">{item.context.warnings.map(w => <li key={w}>{w}</li>)}</ul>
        <button className="btn-ghost" disabled={busy} onClick={() => run(async () => { await saveDraft(); notify('Brouillon actualisé depuis les données enregistrées.'); })}>Actualiser les données enregistrées</button>
      </>}
      {step === 3 && <>
        <label className="field">Conditions particulières expresses<textarea value={terms.specialConditions} disabled={busy} onChange={e => setTerm('specialConditions', e.target.value)} placeholder="Aucune clause n’est ajoutée si ce champ reste vide. Toute dérogation au tarif standard doit être explicite." /></label>
        <div className="grid-2"><label className="field">Tarif de référence TTC (centimes entiers)<input type="number" min="0" step="1" value={terms.referencePriceCents} onChange={e => setTerm('referencePriceCents', Number(e.target.value))} /></label><label className="field">Remise par période (centimes entiers)<input type="number" min="0" step="1" value={terms.discountCents} onChange={e => setTerm('discountCents', Number(e.target.value))} /></label>{textField('discountDuration', 'Durée de la remise et modalités de retour au tarif normal')}</div>
        <p className="help">La remise doit déjà être reflétée dans le prix TTC de la fiche client : prix final = référence − remise. Une remise temporaire ne génère pas un faux échéancier annuel.</p>
        <label className="pro-check"><input type="checkbox" checked={terms.commercialExceptionAccepted} onChange={e => setTerm('commercialExceptionAccepted', e.target.checked)} />Je confirme les dérogations commerciales expresses (tarif, périodicité, remise ou engagement), à faire valider avec le bon de commande.</label>
        <label className="pro-check"><input type="checkbox" checked={terms.legalReviewAccepted} onChange={e => setTerm('legalReviewAccepted', e.target.checked)} />J’ai vérifié l’intégralité du modèle, les identités réelles, la forme juridique, le régime fiscal, les dates et les conditions. Les points juridiques et techniques incertains doivent être validés avant commercialisation.</label>
      </>}
      {step === 4 && item && <>
        <div className="info-box">PDF final de {item.pageCount} pages · aucune signature apposée.<br /><small className="pro-hash">SHA-256 : {item.previewHash}</small></div>
        <ActualPdfPreview url={professionalApi.pdfUrl(item)} />
        <label className="pro-check"><input type="checkbox" checked={pdfChecked} onChange={e => setPdfChecked(e.target.checked)} />J’ai parcouru le PDF complet : articles, annexes, montants, conditions et espaces de signature.</label>
      </>}
      {step === 5 && item && <>
        <div className="ok-box"><strong>{item.number}</strong> · {STATE_LABELS[item.state]}<br />Document sauvegardé dans l’historique du client. Il ne vaut pas signature ni activation de services externes.</div>
        <small className="pro-hash">SHA-256 : {item.pdfHash}</small>
        <div className="row"><button className="btn" onClick={() => downloadUrl(professionalApi.pdfUrl(item, 'original'), `${item.number}.pdf`).catch((e: Error) => setError(e.message))}>Télécharger le contrat PDF</button><button className="btn-ghost" disabled={busy} onClick={() => run(async () => { await printActualPdf(professionalApi.pdfUrl(item, 'original')); })}>Imprimer le PDF final</button><button className="btn-ghost" onClick={() => navigator.clipboard.writeText(item.number).then(() => notify('Référence copiée.')).catch(() => setError('Presse-papiers indisponible.'))}>Copier la référence</button></div>
        <ActualPdfPreview url={professionalApi.pdfUrl(item, 'original')} />
      </>}
      <div className="row">
        {step > 0 && step < 5 && <button className="btn-ghost" disabled={busy} onClick={() => { setStep(s => s - 1); setPdfChecked(false); }}>Précédent</button>}
        {step < 4 && <button className="btn" disabled={busy || !clientId || !modelId} onClick={() => run(async () => {
          if (step === 1) await saveDraft();
          if (step === 3) { const saved = await saveDraft(); const preview = await professionalApi.preview(saved.id); setItem(preview); }
          setStep(s => s + 1);
        })}>{busy ? 'Traitement…' : step === 3 ? 'Créer l’aperçu PDF exact' : 'Continuer'}</button>}
        {step === 4 && item && <button className="btn" disabled={busy || !pdfChecked} onClick={() => run(async () => { const generated = await professionalApi.generate(item); setItem(generated); setStep(5); notify('Contrat généré, non signé.'); })}>{busy ? 'Génération…' : 'Générer et enregistrer ce PDF'}</button>}
        {step < 4 && clientId && modelId && <button className="btn-ghost" disabled={busy} onClick={() => run(async () => { await saveDraft(); notify('Brouillon sauvegardé dans l’historique.'); })}>Enregistrer le brouillon</button>}
      </div>
    </section>
    <section className="card"><h4>Connexions externes</h4><ul className="help">{Object.values(INTEGRATIONS).map(i => <li key={i.message}>{i.message}</li>)}</ul></section>
    {models.length === 0 && <ProfessionalModelSetup onInstalled={() => { void loadModels(); }} />}
  </div>;
}
