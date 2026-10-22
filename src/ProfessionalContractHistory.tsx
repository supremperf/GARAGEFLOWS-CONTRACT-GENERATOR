import { useEffect, useRef, useState } from 'react';
import { downloadUrl, fileToBase64 } from './api';
import { STATE_LABELS, TRANSITIONS, type ContractEvent, type ContractState, type ProfessionalContract } from '../core/contracts/types';
import { professionalApi } from './professional-api';
import ActualPdfPreview, { printActualPdf } from './ActualPdfPreview';

export default function ProfessionalContractHistory({ onResume, clientId }: { onResume?: (id: string) => void; clientId?: string }) {
  const [items, setItems] = useState<ProfessionalContract[]>([]), [selected, setSelected] = useState<ProfessionalContract | null>(null), [events, setEvents] = useState<ContractEvent[]>([]);
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [reason, setReason] = useState(''), [to, setTo] = useState<ContractState | ''>('');
  const [email, setEmail] = useState(''), [signatory, setSignatory] = useState(''), [signedAt, setSignedAt] = useState(''), [proof, setProof] = useState<File | null>(null);
  const [consent, setConsent] = useState(false), [attested, setAttested] = useState(false), [showPdf, setShowPdf] = useState(false);
  const lock = useRef(false);
  const load = () => professionalApi.list(clientId).then(setItems);
  useEffect(() => { load().catch((e: Error) => setError(e.message)); }, [clientId]);
  async function select(item: ProfessionalContract) { setSelected(item); setTo(''); setReason(''); setError(''); setEmail(item.context.client.email); setSignatory(''); setSignedAt(''); setProof(null); setConsent(false); setAttested(false); setShowPdf(false); setEvents(await professionalApi.events(item.id)); }
  async function run(work: () => Promise<ProfessionalContract | void>) {
    if (lock.current) return; lock.current = true; setBusy(true); setError('');
    try { const saved = await work(); await load(); if (saved) { setSelected(saved); setEvents(await professionalApi.events(saved.id)); setTo(''); } }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); lock.current = false; }
  }
  return <section className="card stack pro-contract">
    <h3>Contrats professionnels · versions et journal</h3>
    {error && <div role="alert" className="warn-box">{error}</div>}
    {!items.length && <div className="empty">Aucun contrat professionnel. Le générateur de modèles importés reste disponible.</div>}
    {items.length > 0 && <div className="table-wrap" tabIndex={0} role="region" aria-label="Historique professionnel"><table><thead><tr><th>Référence</th><th>Client</th><th>Statut</th><th>Modèle</th><th>Actions</th></tr></thead><tbody>{items.map(item => <tr key={item.id}><td>{item.number}{item.parentId && <small className="help"> · version liée</small>}</td><td>{item.clientName}</td><td>{STATE_LABELS[item.state]}{item.acceptedAt && <small> · acceptation déclarée, non signée électroniquement</small>}</td><td>v{item.model.version}</td><td><button className="btn-ghost" onClick={() => select(item).catch((e: Error) => setError(e.message))}>Gérer</button>{['draft', 'review'].includes(item.state) && onResume && <button className="btn-ghost" onClick={() => onResume(item.id)}>Reprendre</button>}</td></tr>)}</tbody></table></div>}
    {selected && <div className="stack pro-detail">
      <div className="row"><h4>{selected.number}</h4><button className="btn-ghost" onClick={() => setSelected(null)}>Fermer la fiche contrat</button></div>
      <p>Créé le {new Date(selected.createdAt).toLocaleString('fr-FR')} · début {selected.context.fields.DATE_EFFET} · fin {selected.context.fields.DATE_FIN}</p>
      <small className="pro-hash">Source : {selected.model.sha256}<br />PDF original : {selected.pdfHash || 'Non généré'}</small>
      <div className="row">
        {(selected.previewHash || selected.pdfHash) && <button className="btn-ghost" onClick={() => setShowPdf(!showPdf)}>Afficher / masquer le PDF exact</button>}
        {selected.pdfHash && <><button className="btn" onClick={() => run(async () => { await downloadUrl(professionalApi.pdfUrl(selected, 'original'), `${selected.number}.pdf`); })}>Télécharger l’original</button><button className="btn-ghost" disabled={busy} onClick={() => run(async () => { await printActualPdf(professionalApi.pdfUrl(selected, 'original')); })}>Imprimer l’original</button></>}
        <button className="btn-ghost" onClick={() => navigator.clipboard.writeText(selected.number).catch(() => setError('Presse-papiers indisponible.'))}>Copier la référence</button>
        {selected.generatedAt && onResume && <button className="btn-ghost" disabled={busy} onClick={() => run(async () => { const draft = await professionalApi.create(selected.clientId, selected.model.id, selected.context.terms, selected.id, selected.signature ? 'amendment' : 'revision'); onResume(draft.id); })}>{selected.signature ? 'Proposer un avenant / nouvelle version à signer' : 'Créer une nouvelle version'}</button>}
      </div>
      {showPdf && <ActualPdfPreview url={professionalApi.pdfUrl(selected)} />}
      {selected.signature && <div className="warn-box"><strong>Signature manuscrite déclarée par l’opérateur local — authenticité non vérifiée par prestataire.</strong><p>{selected.signature.signatory} · {selected.signature.email} · date déclarée : {selected.signature.signedAt}. Ce n’est ni une signature électronique avancée, ni une signature qualifiée.</p><small className="pro-hash">Preuve : {selected.signature.evidenceHash}</small><br /><button className="btn-ghost" onClick={() => downloadUrl(professionalApi.pdfUrl(selected, 'signed'), `${selected.number}-preuve.pdf`).catch((e: Error) => setError(e.message))}>Télécharger la preuve enregistrée</button></div>}
      {TRANSITIONS[selected.state].filter(s => s !== 'review').length > 0 && <>
        <div className="grid-2"><label className="field">Nouveau statut<select value={to} onChange={e => setTo(e.target.value as ContractState | '')}><option value="">Choisir…</option>{TRANSITIONS[selected.state].filter(s => s !== 'review').map(s => <option key={s} value={s}>{STATE_LABELS[s]}</option>)}</select></label><label className="field">Motif documenté<input value={reason} onChange={e => setReason(e.target.value)} /></label></div>
        <button className="btn-ghost" disabled={busy || !to || reason.trim().length < 5} onClick={() => { if (to) void run(() => professionalApi.transition(selected, to, reason)); }}>Enregistrer le changement de statut</button>
      </>}
      {['generated', 'pending_signature'].includes(selected.state) && <details><summary>Acceptation déclarative ou pièce signée manuscrite</summary><div className="stack" style={{ marginTop: 16 }}>
        <div className="warn-box">Seul le propriétaire du poste renseigne cette attestation. L’application n’identifie pas un signataire à distance, n’envoie aucun lien et ne valide pas l’authenticité d’une signature. Pour une signature électronique probante, connecter un prestataire réel.</div>
        <label className="field">E-mail du signataire / client<input type="email" value={email} onChange={e => setEmail(e.target.value)} /></label>
        <label className="pro-check"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} />Je consigne le consentement explicite reçu pour cette version et cette empreinte ; il s’agit d’une déclaration locale, pas d’une vérification d’identité distante.</label>
        {!selected.acceptedAt && <button className="btn-ghost" disabled={busy || !consent} onClick={() => run(() => professionalApi.acceptance(selected.id, email, consent))}>Consigner l’acceptation déclarée (sans signer)</button>}
        <label className="field">Nom réel du signataire manuscrit<input value={signatory} onChange={e => setSignatory(e.target.value)} /></label>
        <label className="field">Date réelle de signature<input type="date" value={signedAt} onChange={e => setSignedAt(e.target.value)} /></label>
        <label className="field">Copie complète effectivement signée manuscrite (PDF, 10 Mo max.)<input type="file" accept="application/pdf,.pdf" onChange={e => setProof(e.target.files?.[0] || null)} /></label>
        <label className="pro-check"><input type="checkbox" checked={attested} onChange={e => setAttested(e.target.checked)} />J’atteste avoir vérifié les signatures manuscrites des parties, leur identité, leur consentement et la correspondance de toutes les pages avec l’original. Une image ou un PDF quelconque ne suffit pas.</label>
        <button className="btn-ghost" disabled={busy || !proof || !attested || !consent || !signedAt || !signatory} onClick={() => run(async () => { if (!proof || proof.size > 10_000_000) throw new Error('Pièce PDF absente ou supérieure à 10 Mo.'); return professionalApi.manualSignature(selected, { base64: await fileToBase64(proof), signatory, email, signedAt, consent, attested }); })}>Enregistrer la preuve et l’attestation manuscrite</button>
      </div></details>}
      <div className="info-box">E-mail, paiements, facturation et signature électronique non connectés. Les changements de statut sont locaux : aucun accès SaaS, encaissement, annulation ou envoi externe n’est exécuté.</div>
      <h4>Journal horodaté · identité du compte du poste</h4>
      <ol className="pro-events">{events.map(e => <li key={e.id}><strong>{new Date(e.at).toLocaleString('fr-FR')} · {e.action}</strong><br />{e.actor}<br />{e.detail}<br /><small className="pro-hash">Événement : {e.hash}</small></li>)}</ol>
      <p className="help">Journal chaîné par empreintes, non qualifié et non ancré chez un tiers. L’administrateur du système peut modifier les fichiers du profil.</p>
    </div>}
  </section>;
}
