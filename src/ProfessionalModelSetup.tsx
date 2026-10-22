import { variableSlots } from '../core/contracts/variables';
import { useEffect, useMemo, useState } from 'react';
import { CONTRACT_FIELD_LABELS, type LegalModel } from '../core/contracts/types';
import { professionalApi } from './professional-api';

export default function ProfessionalModelSetup({ onInstalled }: { onInstalled?: () => void }) {
  const [models, setModels] = useState<LegalModel[]>([]), [text, setText] = useState(''), [bindings, setBindings] = useState<Record<string, string>>({});
  const [confirmed, setConfirmed] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [version, setVersion] = useState('1.0'), [date, setDate] = useState('2026-10-22');
  const slots = useMemo(() => variableSlots(text), [text]);
  const load = () => professionalApi.models().then(setModels).catch((e: Error) => setError(e.message));
  useEffect(() => { void load(); }, []);
  function sourceChanged(source: string) {
    setText(source); setConfirmed(false);
    const mapping: Record<string, string> = {};
    for (const slot of variableSlots(source)) {
      const key = slot.token.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, '_');
      if (Object.hasOwn(CONTRACT_FIELD_LABELS, key)) mapping[slot.key] = key;
    }
    setBindings(mapping);
  }
  return <section className="card stack pro-contract">
    <h3>Modèle juridique professionnel · versions immuables</h3>
    <div className="info-box">Le texte intégral fourni, version 1.0 du 22 octobre 2026, est intégré et disponible sans import manuel. Les clauses restent inchangées ; les variables répétées sont raccordées séparément selon leur emplacement. La revue juridique et technique reste nécessaire.</div>
    {models.map(m => <div className="info-box" key={m.id}><strong>{m.title}</strong> · v{m.version} · {m.date}{m.bundled ? ' · Modèle fourni intégré' : ''}<br /><small className="pro-hash">Source SHA-256 : {m.sha256}</small></div>)}
    <details>
      <summary>Installer une version du texte original complet</summary>
      <div className="stack" style={{ marginTop: 16 }}>
        <label className="field">Fichier original UTF-8 (.txt ou .md)<input type="file" accept=".txt,.md,text/plain,text/markdown" disabled={busy} onChange={e => { const file = e.target.files?.[0]; if (file) { if (file.size > 1_000_000) setError('Fichier trop volumineux.'); else file.arrayBuffer().then(buffer => sourceChanged(new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(buffer))).catch(() => setError('Lecture impossible : fournir un fichier UTF-8 valide.')); } }} /></label>
        <label className="field">Texte intégral, sans raccourcissement<textarea className="pro-source" value={text} onChange={e => sourceChanged(e.target.value)} spellCheck={false} /></label>
        <div className="grid-2"><label className="field">Version juridique<input value={version} onChange={e => setVersion(e.target.value)} /></label><label className="field">Date du modèle<input type="date" value={date} onChange={e => setDate(e.target.value)} /></label></div>
        <p className="help">Le texte est sauvegardé sans réécriture. Chaque variable doit pointer explicitement vers une donnée ; les champs de signature restent non signés. NUMERO_CONTRAT exclut le préfixe GF-ABO-, REFERENCE_CONTRAT l’inclut.</p>
        {slots.map(slot => <label className="field" key={slot.key}>[{slot.token}] · occurrence {slot.occurrence}<small className="help">{slot.context}</small><select value={bindings[slot.key] || ''} onChange={e => setBindings({ ...bindings, [slot.key]: e.target.value })}><option value="">Choisir la donnée réelle…</option>{Object.entries(CONTRACT_FIELD_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>)}
        <label className="pro-check"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />Je confirme avoir comparé ce texte à l’original complet : 27 articles, annexe RGPD (15 sections), bon de commande, signatures et avertissement final ; j’ai vérifié les correspondances des variables.</label>
        <button className="btn" disabled={busy || !confirmed || !text} onClick={async () => {
          setBusy(true); setError('');
          try { await professionalApi.importModel({ title: "CONTRAT PROFESSIONNEL D’ABONNEMENT ET DE LICENCE D’UTILISATION D’UN LOGICIEL SAAS", text, bindings, version, date, confirmed }); await load(); setText(''); setConfirmed(false); onInstalled?.(); }
          catch (e) { setError((e as Error).message); } finally { setBusy(false); }
        }}>{busy ? 'Installation…' : 'Conserver cette version intégrale'}</button>
      </div>
    </details>
    {error && <div className="warn-box" role="alert">{error}</div>}
  </section>;
}
