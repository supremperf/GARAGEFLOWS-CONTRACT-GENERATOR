import ProfessionalContractWizard from './ProfessionalContractWizard';
import FilePicker from '../FilePicker';
import { useEffect, useMemo, useState } from 'react';
import {
  ApiError, api, downloadUrl, fileToBase64,
  type ClientRecord, type DetectedVariable, type DictionaryFieldEntry, type GenerationReport,
  type PreviewResult, type TemplateRecord,
} from '../api';
import type { ExportFormat } from '../../core/types';

const STEPS = ['Modèle', 'Client', 'Informations', 'Variables', 'Aperçu', 'Export'];

function GenericGeneratorPage({ notify, initialTemplateId }: { notify: (m: string) => void; initialTemplateId?: string }) {
  const [step, setStep] = useState(1);
  const [templates, setTemplates] = useState<TemplateRecord[]>([]);
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [dictionary, setDictionary] = useState<DictionaryFieldEntry[]>([]);
  const [templateId, setTemplateId] = useState('');
  const [clientId, setClientId] = useState('');
  const [query, setQuery] = useState('');
  const [variables, setVariables] = useState<DetectedVariable[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [page, setPage] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [search, setSearch] = useState('');
  const [compare, setCompare] = useState(false);
  const [format, setFormat] = useState<ExportFormat>('pdf');
  const [fileName, setFileName] = useState('');
  const [destinationDir, setDestinationDir] = useState('');
  const [report, setReport] = useState<GenerationReport | null>(null);
  const [busy, setBusy] = useState(false);

  const loadLists = () => {
    api.templates().then(setTemplates).catch((e: Error) => notify(e.message));
    api.clients(query).then(setClients).catch((e: Error) => notify(e.message));
    api.dictionary().then(setDictionary).catch(() => undefined);
  };
  useEffect(loadLists, []);
  useEffect(() => { if (initialTemplateId) setTemplateId(initialTemplateId); }, [initialTemplateId]);

  const template = templates.find((item) => item.id === templateId);

  const refreshPreview = async (patches = variables, currentValues?: Record<string, string>) => {
    if (!templateId) return null;
    const data = await api.preview({
      templateId,
      clientId: clientId || undefined,
      variablePatches: patches,
      variableValues: currentValues,
    });
    setVariables(data.variables);
    setValues(currentValues || data.values);
    setPreview(data);
    setFileName(data.suggestedFileName);
    if (!data.supportedExports.includes(format)) setFormat(data.supportedExports[0]);
    return data;
  };

  const go = async (next: number) => {
    try {
      setBusy(true);
      if (next >= 3 && templateId) {
        const data = await refreshPreview(variables.length ? variables : undefined, next === 3 ? undefined : values);
        if (next === 5 && data && !data.validation.canExport) {
          notify('Des champs obligatoires ou ambigus empêchent un export complet. Vous pouvez tout de même prévisualiser.');
        }
      }
      setStep(next);
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Une erreur est survenue.');
    } finally {
      setBusy(false);
    }
  };

  const visibleParagraphs = useMemo(() => {
    const current = preview?.previewPages?.[page];
    if (!current) return [];
    if (!search.trim()) return current.paragraphs;
    return current.paragraphs.filter((p) => p.finalText.toLowerCase().includes(search.toLowerCase()) || p.originalText.toLowerCase().includes(search.toLowerCase()));
  }, [preview, page, search]);

  const exportNow = async (overwriteConfirmed = false) => {
    try {
      setBusy(true);
      const result = await api.exportContract({
        templateId,
        clientId: clientId || undefined,
        variablePatches: variables,
        variableValues: values,
        format,
        fileName,
        destinationDir: destinationDir || undefined,
        overwriteConfirmed,
      });
      setReport(result.report);
      await downloadUrl(result.downloadUrl, result.contract.fileName);
      notify(`Contrat exporté : ${result.contract.fileName}`);
    } catch (error) {
      if (error instanceof ApiError && error.code === 'FILE_ALREADY_EXISTS') {
        if (confirm(`${error.message}\nÉcraser le fichier existant ?`)) {
          await exportNow(true);
          return;
        }
      }
      notify(error instanceof Error ? error.message : 'Une erreur est survenue lors de l’export.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack">
      <div className="steps">
        {STEPS.map((label, index) => (
          <button key={label} className={`step-pill ${step === index + 1 ? 'on' : ''}`} onClick={() => go(index + 1)}>{index + 1}. {label}</button>
        ))}
      </div>

      {step === 1 && (
        <section className="stack">
          <div className="spread">
            <p className="help">Choisissez un modèle déjà analysé. Le fichier original reste intact.</p>
            <FilePicker className="btn" onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const base64 = await fileToBase64(file);
                const created = await api.importTemplate({ fileName: file.name, base64 });
                notify('Modèle importé.');
                await loadLists();
                setTemplateId(created.id);
              }}>Importer</FilePicker>
          </div>
          <div className="template-grid">
            {templates.map((tpl) => (
              <button key={tpl.id} className={`pick ${templateId === tpl.id ? 'selected' : ''}`} onClick={() => setTemplateId(tpl.id)}>
                <span className="badge blue">{tpl.format.toUpperCase()}</span>
                <h3>{tpl.name}</h3>
                <p>{tpl.variables.length} variables · exports : {tpl.supportedExports.join(', ').toUpperCase()}</p>
              </button>
            ))}
          </div>
          {templates.length === 0 && <div className="card empty">Aucun modèle. Importez un contrat ou les exemples livrés depuis Mes modèles.</div>}
        </section>
      )}

      {step === 2 && (
        <section className="stack">
          <input className="input" placeholder="Rechercher un client" value={query} onChange={(e) => { setQuery(e.target.value); api.clients(e.target.value).then(setClients); }} />
          <button className={`pick ${clientId === '' ? 'selected' : ''}`} onClick={() => setClientId('')}>
            <h3>Continuer sans fiche</h3>
            <p>Vous saisirez les informations à l’étape suivante. Elles ne seront pas enregistrées tant que vous ne créez pas de client.</p>
          </button>
          <div className="client-grid">
            {clients.map((client) => (
              <button key={client.id} className={`pick ${clientId === client.id ? 'selected' : ''}`} onClick={() => setClientId(client.id)}>
                <h3>{client.prenom} {client.nom}</h3>
                <p>{client.ville || '—'} · {client.typeAbonnement || 'GarageFlows'} · {client.prixTTC || '99,99'} €</p>
              </button>
            ))}
          </div>
        </section>
      )}

      {step === 3 && preview && (
        <section className="grid-2">
          <div className="card stack">
            <h3>Informations chargées</h3>
            <div className="info-box">Client : {preview.client ? `${preview.client.prenom} ${preview.client.nom}` : 'saisie libre'} · Fournisseur : {preview.profile.entrepriseNom || 'GarageFlows'}</div>
            <div className="info-box">Abonnement {preview.subscription.produit} · {preview.subscription.prixTTC} € TTC · HT {preview.subscription.prixHT} € · TVA {preview.subscription.tvaTaux} % · / {preview.subscription.periodicite}</div>
            <p className="help">Modifiez ici les valeurs qui seront injectées. Les clauses du modèle ne sont pas réécrites.</p>
            {variables.filter((v) => ['CLIENT_NOM', 'CLIENT_PRENOM', 'CLIENT_ADRESSE_COMPLETE', 'CLIENT_ADRESSE', 'CLIENT_TELEPHONE', 'CLIENT_EMAIL', 'DATE_SIGNATURE', 'DATE_DEBUT', 'ABONNEMENT_PRIX_TTC', 'ABONNEMENT_NOM'].includes(v.canonicalField) || v.required).slice(0, 16).map((variable) => (
              <label key={variable.id} className="field">{variable.name}
                <input value={values[variable.id] || ''} onChange={(e) => setValues({ ...values, [variable.id]: e.target.value })} />
              </label>
            ))}
          </div>
          <div className="card stack">
            <h3>Contrôles</h3>
            {preview.validation.missingMandatoryFields.length === 0 ? <div className="ok-box">Aucun champ obligatoire vide parmi les variables chargées.</div> : <div className="warn-box">Manquants : {preview.validation.missingMandatoryFields.join(', ')}</div>}
            {preview.validation.unresolvedAmbiguousFields.length > 0 && <div className="warn-box">À valider : {preview.validation.unresolvedAmbiguousFields.join(', ')}</div>}
            {preview.warnings?.map((w: string) => <div key={w} className="warn-box">{w}</div>)}
            {preview.limitations?.map((w: string) => <div key={w} className="info-box">{w}</div>)}
          </div>
        </section>
      )}

      {step === 4 && (
        <section className="card stack">
          <h3>Variables détectées</h3>
          <p className="help">Chaque XXX est une variable distincte. Un identifiant {'{{CLIENT_NOM}}'} répété partage la même valeur.</p>
          <div className="table-wrap" tabIndex={0} role="region" aria-label="Variables du contrat">
            <table>
              <thead><tr><th>Détectée</th><th>Champ</th><th>Valeur</th><th>Occ.</th><th>Confiance</th><th>Lieu</th><th>OK</th></tr></thead>
              <tbody>
                {variables.map((variable, index) => (
                  <tr key={variable.id}>
                    <td className="mono">{variable.originalText}<div className="help">{variable.name}</div></td>
                    <td>
                      <select className="input" value={variable.canonicalField} onChange={(e) => {
                        const next = [...variables];
                        const found = dictionary.find((d) => d.key === e.target.value);
                        next[index] = { ...variable, canonicalField: e.target.value, name: found?.label || variable.name, validatedByHuman: true, ambiguous: false };
                        setVariables(next);
                      }}>
                        {dictionary.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
                      </select>
                    </td>
                    <td><input className="input" value={values[variable.id] || ''} onChange={(e) => setValues({ ...values, [variable.id]: e.target.value })} /></td>
                    <td>{variable.occurrences}</td>
                    <td>{Math.round(variable.confidence * 100)}%{variable.ambiguous && !variable.validatedByHuman ? ' ambigu' : ''}</td>
                    <td className="help">{variable.locations?.[0]?.section} {variable.locations?.[0]?.fullSentence?.slice(0, 70)}</td>
                    <td><input type="checkbox" checked={!!variable.validatedByHuman || !variable.ambiguous} onChange={(e) => {
                      const next = [...variables];
                      next[index] = { ...variable, validatedByHuman: e.target.checked, ambiguous: e.target.checked ? false : variable.ambiguous };
                      setVariables(next);
                    }} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {step === 5 && preview && (
        <section className="stack">
          <div className="card row">
            <button className="btn-ghost" onClick={() => setPage(Math.max(0, page - 1))}>Page précédente</button>
            <span>Page {page + 1} / {preview.previewPages.length}</span>
            <button className="btn-ghost" onClick={() => setPage(Math.min(preview.previewPages.length - 1, page + 1))}>Page suivante</button>
            <button className="btn-ghost" aria-label="Réduire le zoom" onClick={() => setZoom(Math.max(0.7, zoom - 0.1))}>−</button>
            <button className="btn-ghost" aria-label="Augmenter le zoom" onClick={() => setZoom(Math.min(1.4, zoom + 0.1))}>+</button>
            <input className="input" placeholder="Rechercher dans l’aperçu" value={search} onChange={(e) => setSearch(e.target.value)} />
            <button className="btn-ghost" onClick={() => setCompare(!compare)}>{compare ? 'Masquer la comparaison' : 'Comparer au modèle'}</button>
          </div>
          <div className="help">Surlignage vert : valeur insérée. Surlignage rose : champ encore vide. Cet aperçu reflète le texte qui sera exporté.</div>
          <div className="preview-viewport" tabIndex={0} aria-label="Aperçu du contrat"><div className="preview-zoom" style={{ zoom }}>
            <article className="sheet">
              {preview.previewPages[page]?.headers?.map((h: string) => <div key={h} className="header-line">{h}</div>)}
              {visibleParagraphs.map((p, i: number) => (
                <div key={i} className={compare ? 'split' : ''}>
                  {compare && <p style={{ color: '#64748b' }}>{p.originalText}</p>}
                  <p dangerouslySetInnerHTML={{ __html: p.highlightedHtml }} />
                </div>
              ))}
              {preview.previewPages[page]?.tables?.map((table, ti: number) => (
                <table key={ti} style={{ width: '100%', marginTop: 12, color: '#172033' }}>
                  <tbody>{table.rows.map((row: string[], ri: number) => <tr key={ri}>{row.map((cell, ci) => <td key={ci} style={{ border: '1px solid #cbd5e1' }}>{cell}</td>)}</tr>)}</tbody>
                </table>
              ))}
              {preview.previewPages[page]?.footers?.map((f: string) => <div key={f} className="footer-line">{f}</div>)}
            </article>
          </div></div>
        </section>
      )}

      {step === 6 && (
        <section className="grid-2">
          <div className="card stack">
            <h3>Exporter</h3>
            <label className="field">Format réellement disponible
              <select value={format} onChange={(e) => { setFormat(e.target.value as ExportFormat); setFileName(fileName.replace(/\.[a-z0-9]+$/i, `.${e.target.value}`)); }}>
                {(template?.supportedExports || preview?.supportedExports || ['pdf']).map((item: string) => <option key={item} value={item}>{item.toUpperCase()}</option>)}
              </select>
            </label>
            <label className="field">Nom du fichier<input value={fileName} onChange={(e) => setFileName(e.target.value)} /></label>
            <label className="field">Dossier de destination (vide = dossier generated local)
              <input value={destinationDir} onChange={(e) => setDestinationDir(e.target.value)} placeholder="Laisser vide pour le stockage de l’application" />
            </label>
            <button className="btn" disabled={busy || !templateId} onClick={() => exportNow(false)}>{busy ? 'Génération…' : 'Générer et exporter'}</button>
            <p className="help">Un fichier déjà présent n’est jamais écrasé sans confirmation. Le modèle original est revérifié après export.</p>
          </div>
          <div className="card stack">
            <h3>Avant envoi</h3>
            {preview && (
              <>
                <p>Fournisseur : {preview.profile.entrepriseNom} · SIRET masqué dans l’aperçu</p>
                <p>Prix : {preview.subscription.prixTTC} € TTC / {preview.subscription.periodicite}</p>
                {!preview.validation.canExport && <div className="warn-box">Export bloqué tant que les champs obligatoires ou ambigus ne sont pas traités.</div>}
              </>
            )}
            {report && (
              <div className="ok-box">
                {report.fidelityReport.summary}<br />
                Remplacements : {report.replacedFieldsCount}/{report.totalDetectedFields}. Anomalies : {report.anomalies.length}.
              </div>
            )}
            <div className="info-box">Le logiciel ne garantit pas la conformité juridique. Vérifiez le document avant de l’envoyer ou de l’imprimer.</div>
          </div>
        </section>
      )}

      <div className="row">
        {step > 1 && <button className="btn-ghost" onClick={() => setStep(step - 1)}>Retour</button>}
        {step < 6 && <button className="btn" disabled={busy || (step === 1 && !templateId)} onClick={() => go(step + 1)}>{busy ? 'Analyse…' : 'Continuer'}</button>}
      </div>
    </div>
  );
}


export default function GeneratorPage(props: { notify: (m: string) => void; initialTemplateId?: string; initialClientId?: string; initialContractId?: string }) {
  const [professional, setProfessional] = useState(Boolean(props.initialClientId || props.initialContractId));
  return <div className="stack">
    <div className="row" role="group" aria-label="Type de génération">
      <button className={professional ? 'btn-ghost' : 'btn'} aria-pressed={!professional} onClick={() => setProfessional(false)}>Modèles importés</button>
      <button className={professional ? 'btn' : 'btn-ghost'} aria-pressed={professional} onClick={() => setProfessional(true)}>Contrat professionnel GarageFlows</button>
    </div>
    {professional ? <ProfessionalContractWizard notify={props.notify} initialClientId={props.initialClientId} initialContractId={props.initialContractId} /> : <GenericGeneratorPage notify={props.notify} initialTemplateId={props.initialTemplateId} />}
  </div>;
}
