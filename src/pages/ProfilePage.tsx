import { useEffect, useRef, useState } from 'react';
import { api, fileToBase64, type CustomVariableDefinition, type ProfessionalProfile, type SubscriptionConfig } from '../api';

export default function ProfilePage({ notify }: { notify: (m: string) => void }) {
  const [profile, setProfile] = useState<ProfessionalProfile | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionConfig | null>(null);
  const [customs, setCustoms] = useState<CustomVariableDefinition[]>([]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);

  useEffect(() => {
    Promise.all([api.profile(), api.subscription(), api.customVariables()])
      .then(([p, s, c]) => { setProfile(p); setSubscription(s); setCustoms(c); })
      .catch((e: Error) => notify(e.message));
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2;
  }, [profile]);

  if (!profile || !subscription) return <div className="card">Chargement…</div>;

  const setP = (key: keyof ProfessionalProfile, value: string) => { if (profile) setProfile({ ...profile, [key]: value }); };
  const setS = (key: keyof SubscriptionConfig, value: string) => { if (subscription) setSubscription({ ...subscription, [key]: value }); };

  const pointer = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * (canvas.width / rect.width),
      y: (event.clientY - rect.top) * (canvas.height / rect.height),
    };
  };

  return (
    <div className="stack">
      <section className="card stack">
        <h3>Identité et entreprise</h3>
        <p className="help">Ces informations sont réutilisées dans tous les contrats. Aucune donnée d’entreprise n’est inventée : laissez vide ce que vous n’avez pas encore renseigné.</p>
        <div className="grid-3">
          {([
            ['nom', 'Nom'], ['prenom', 'Prénom'], ['nomCommercial', 'Nom commercial'], ['entrepriseNom', 'Nom de l’entreprise'],
            ['adresse', 'Adresse'], ['codePostal', 'Code postal'], ['ville', 'Ville'], ['pays', 'Pays'],
            ['siret', 'SIRET'], ['formeJuridique', 'Forme juridique'], ['emailPro', 'E-mail professionnel'], ['telephonePro', 'Téléphone'],
            ['siteInternet', 'Site Internet'], ['nomSignataire', 'Nom du signataire'], ['fonctionSignataire', 'Fonction'],
          ] as [keyof ProfessionalProfile, string][]).map(([key, label]) => (
            <label key={key} className="field">{label}<input value={profile[key] || ''} onChange={(e) => setP(key, e.target.value)} /></label>
          ))}
        </div>
      </section>
      <section className="card stack">
        <h3>Coordonnées bancaires</h3>
        <p className="help">IBAN, BIC et RIB ne sont jamais écrits dans les journaux techniques.</p>
        <div className="grid-3">
          {([
            ['titulaireCompte', 'Titulaire du compte'], ['iban', 'IBAN'], ['bic', 'BIC'], ['banque', 'Banque'], ['rib', 'RIB'],
          ] as [keyof ProfessionalProfile, string][]).map(([key, label]) => (
            <label key={key} className="field">{label}<input value={profile[key] || ''} onChange={(e) => setP(key, e.target.value)} autoComplete="off" /></label>
          ))}
        </div>
      </section>
      <section className="card stack">
        <h3>Signature</h3>
        <p className="help">Un dessin ou une image importée n’est pas une signature électronique qualifiée. Elle est insérée comme élément graphique du document.</p>
        <canvas
          ref={canvasRef}
          className="sig-canvas"
          width={900}
          height={220}
          onPointerDown={(e) => { drawing.current = true; const p = pointer(e); const ctx = canvasRef.current?.getContext('2d'); if (p && ctx) { ctx.beginPath(); ctx.moveTo(p.x, p.y); } }}
          onPointerMove={(e) => { if (!drawing.current) return; const p = pointer(e); const ctx = canvasRef.current?.getContext('2d'); if (p && ctx) { ctx.lineTo(p.x, p.y); ctx.stroke(); } }}
          onPointerUp={() => { drawing.current = false; }}
        />
        <div className="row">
          <button className="btn" onClick={() => setProfile({ ...profile, signatureDessinee: canvasRef.current?.toDataURL('image/png') || '' })}>Utiliser le dessin</button>
          <button className="btn-ghost" onClick={() => {
            const canvas = canvasRef.current; const ctx = canvas?.getContext('2d');
            if (canvas && ctx) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); }
            setProfile({ ...profile, signatureDessinee: '' });
          }}>Effacer</button>
          <label className="btn-ghost">Importer une image
            <input hidden type="file" accept="image/png,image/jpeg" onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const base64 = await fileToBase64(file);
              setProfile({ ...profile, signatureImage: `data:${file.type};base64,${base64}` });
            }} />
          </label>
        </div>
        {(profile.signatureDessinee || profile.signatureImage) && <div className="ok-box">Signature enregistrée localement, prête à être réutilisée.</div>}
        <button className="btn" onClick={() => api.saveProfile(profile).then((saved) => { setProfile(saved); notify('Informations professionnelles enregistrées.'); }).catch((e: Error) => notify(e.message))}>Enregistrer mes informations</button>
      </section>
      <section className="card stack">
        <h3>Abonnement GarageFlows</h3>
        <p className="help">Le tarif initial est 99,99 € TTC. Le HT est calculé en centimes pour éviter les erreurs d’arrondi. Les clauses restent celles de votre modèle.</p>
        <div className="grid-3">
          <label className="field">Produit<input value={subscription.produit} onChange={(e) => setS('produit', e.target.value)} /></label>
          <label className="field">Prix TTC<input value={subscription.prixTTC} onChange={(e) => setS('prixTTC', e.target.value)} /></label>
          <label className="field">TVA %<input value={subscription.tvaTaux} onChange={(e) => setS('tvaTaux', e.target.value)} /></label>
          <label className="field">Périodicité<input value={subscription.periodicite} onChange={(e) => setS('periodicite', e.target.value)} /></label>
          <label className="field">Fréquence<input value={subscription.frequence} onChange={(e) => setS('frequence', e.target.value)} /></label>
          <label className="field">Devise<input value={subscription.devise} onChange={(e) => setS('devise', e.target.value)} /></label>
          <label className="field">Durée d’engagement<input value={subscription.dureeEngagement} onChange={(e) => setS('dureeEngagement', e.target.value)} placeholder="À renseigner, jamais inventée" /></label>
          <label className="field">Reconduction<input value={subscription.reconduction} onChange={(e) => setS('reconduction', e.target.value)} /></label>
          <label className="field">Modalités de paiement<input value={subscription.modalitesPaiement} onChange={(e) => setS('modalitesPaiement', e.target.value)} /></label>
        </div>
        <label className="field">Conditions de résiliation validées par vous
          <textarea value={subscription.conditionsResiliation} onChange={(e) => setS('conditionsResiliation', e.target.value)} placeholder="Saisissez uniquement une clause que vous avez validée. Elle n’est pas insérée automatiquement dans le modèle." />
        </label>
        <button className="btn" onClick={() => api.saveSubscription(subscription).then((saved) => { setSubscription(saved); notify(`Abonnement enregistré. HT calculé : ${saved.prixHT} €`); }).catch((e: Error) => notify(e.message))}>Enregistrer l’abonnement</button>
        <div className="info-box">Prix HT actuel : {subscription.prixHT} € · TVA : {subscription.tvaMontant} € · TTC : {subscription.prixTTC} €</div>
      </section>
      <section className="card stack">
        <h3>Variables personnalisées</h3>
        {customs.map((item, index) => (
          <div key={index} className="grid-3">
            <input className="input" value={item.key} onChange={(e) => { const next = [...customs]; next[index] = { ...item, key: e.target.value.toUpperCase() }; setCustoms(next); }} />
            <input className="input" value={item.label} onChange={(e) => { const next = [...customs]; next[index] = { ...item, label: e.target.value }; setCustoms(next); }} />
            <button className="btn-danger" onClick={() => setCustoms(customs.filter((_, i) => i !== index))}>Retirer</button>
          </div>
        ))}
        <button className="btn-ghost" onClick={() => setCustoms([...customs, { key: 'CLIENT_CODE_CLIENT', label: 'Code client', category: 'personnalise', dataType: 'text', defaultValue: '', required: false, synonyms: [], description: '' }])}>Ajouter une variable</button>
        <button className="btn" onClick={() => api.saveCustomVariables(customs).then((saved) => { setCustoms(saved); notify('Dictionnaire personnalisé enregistré.'); }).catch((e: Error) => notify(e.message))}>Enregistrer le dictionnaire</button>
      </section>
    </div>
  );
}
