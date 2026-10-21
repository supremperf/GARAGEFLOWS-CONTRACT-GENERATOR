import { useEffect, useState } from 'react';
import { api, fileToBase64 } from '../api';

export default function TemplatesPage({ notify }: { notify: (m: string) => void }) {
  const [items, setItems] = useState<any[]>([]);
  const [dictionary, setDictionary] = useState<any[]>([]);
  const [editing, setEditing] = useState<any>(null);
  const [meta, setMeta] = useState({ name: '', category: 'Abonnement', description: '' });

  const load = () => api.templates().then(setItems).catch((e) => notify(e.message));
  useEffect(() => {
    load();
    api.dictionary().then(setDictionary).catch(() => undefined);
  }, []);

  const importFile = async (file: File) => {
    try {
      const base64 = await fileToBase64(file);
      await api.importTemplate({ fileName: file.name, base64, ...meta, name: meta.name || file.name });
      notify(`Modèle importé : ${file.name}`);
      setMeta({ name: '', category: 'Abonnement', description: '' });
      load();
    } catch (error: any) {
      notify(error.message);
    }
  };

  const saveEditing = async () => {
    try {
      await api.updateTemplate(editing.id, {
        name: editing.name,
        category: editing.category,
        description: editing.description,
        variables: editing.variables,
        isDefault: editing.isDefault,
      });
      notify('Correspondances enregistrées.');
      setEditing(null);
      load();
    } catch (error: any) {
      notify(error.message);
    }
  };

  return (
    <div className="stack">
      <section className="card stack">
        <div className="spread">
          <div>
            <h3>Importer un modèle</h3>
            <p className="help">Le fichier original est copié et n’est jamais modifié. Formats : PDF, DOCX, DOC, ODT, RTF, TXT, HTML, XLSX, XLS, ODS, CSV, PPTX, PNG, JPG, TIFF.</p>
          </div>
          <button className="btn-ghost" onClick={() => api.importExamples().then((r) => notify(`${r.imported.length} exemple(s) importé(s).`)).then(load).catch((e) => notify(e.message))}>
            Importer les exemples livrés
          </button>
        </div>
        <div className="grid-3">
          <label className="field">Nom<input value={meta.name} onChange={(e) => setMeta({ ...meta, name: e.target.value })} placeholder="Contrat abonnement" /></label>
          <label className="field">Catégorie<input value={meta.category} onChange={(e) => setMeta({ ...meta, category: e.target.value })} /></label>
          <label className="field">Description<input value={meta.description} onChange={(e) => setMeta({ ...meta, description: e.target.value })} /></label>
        </div>
        <label className="drop">
          Déposez un document ou cliquez pour le sélectionner
          <input hidden type="file" accept=".pdf,.docx,.doc,.odt,.rtf,.txt,.html,.xlsx,.xls,.ods,.csv,.pptx,.png,.jpg,.jpeg,.tiff" onChange={(e) => e.target.files?.[0] && importFile(e.target.files[0])} />
        </label>
      </section>

      <div className="template-grid">
        {items.map((tpl) => (
          <article key={tpl.id} className="card stack">
            <div className="spread">
              <span className="badge blue">{tpl.format.toUpperCase()}</span>
              {tpl.isDefault && <span className="badge ok">Défaut</span>}
            </div>
            <h3 style={{ margin: 0 }}>{tpl.name}</h3>
            <p className="help">{tpl.description || 'Sans description'} · {tpl.variables.length} variables · {tpl.pageCount} page(s)</p>
            {tpl.warnings?.slice(0, 2).map((w: string) => <div key={w} className="warn-box">{w}</div>)}
            {tpl.limitations?.slice(0, 1).map((w: string) => <div key={w} className="info-box">{w}</div>)}
            <div className="row">
              <button className="btn" onClick={() => setEditing(JSON.parse(JSON.stringify(tpl)))}>Variables</button>
              <button className="btn-ghost" onClick={() => api.analyzeTemplate(tpl.id).then(() => { notify('Analyse relancée.'); load(); }).catch((e) => notify(e.message))}>Réanalyser</button>
            </div>
            <div className="row">
              <button className="btn-ghost" onClick={() => api.updateTemplate(tpl.id, { isDefault: true }).then(load)}>Défaut</button>
              <button className="btn-ghost" onClick={() => api.duplicateTemplate(tpl.id).then(() => { notify('Modèle dupliqué.'); load(); })}>Dupliquer</button>
              <button className="btn-danger" onClick={() => { if (confirm(`Supprimer le modèle « ${tpl.name} » ?`)) api.deleteTemplate(tpl.id).then(load); }}>Supprimer</button>
            </div>
          </article>
        ))}
      </div>

      {editing && (
        <div className="modal-back" onClick={() => setEditing(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="spread">
              <h3>Éditeur de variables — {editing.name}</h3>
              <button className="btn-ghost" onClick={() => setEditing(null)}>Fermer</button>
            </div>
            <div className="grid-3" style={{ margin: '12px 0' }}>
              <label className="field">Nom<input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></label>
              <label className="field">Catégorie<input value={editing.category} onChange={(e) => setEditing({ ...editing, category: e.target.value })} /></label>
              <label className="field">Description<input value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })} /></label>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Texte original</th><th>Champ</th><th>Type</th><th>Occ.</th><th>Confiance</th><th>Obligatoire</th><th>Validé</th></tr>
                </thead>
                <tbody>
                  {editing.variables.map((variable: any, index: number) => (
                    <tr key={variable.id}>
                      <td className="mono">{variable.originalText}<div className="help">{variable.locations?.[0]?.fullSentence?.slice(0, 90)}</div></td>
                      <td>
                        <select className="input" value={variable.canonicalField} onChange={(e) => {
                          const next = [...editing.variables];
                          const found = dictionary.find((d) => d.key === e.target.value);
                          next[index] = { ...variable, canonicalField: e.target.value, name: found?.label || variable.name, dataType: found?.dataType || variable.dataType, validatedByHuman: true, ambiguous: false };
                          setEditing({ ...editing, variables: next });
                        }}>
                          {dictionary.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
                          {!dictionary.some((d) => d.key === variable.canonicalField) && <option value={variable.canonicalField}>{variable.canonicalField}</option>}
                        </select>
                      </td>
                      <td>{variable.dataType}</td>
                      <td>{variable.occurrences}</td>
                      <td>{Math.round(variable.confidence * 100)}%{variable.ambiguous ? ' · ambigu' : ''}</td>
                      <td><input type="checkbox" checked={variable.required} onChange={(e) => {
                        const next = [...editing.variables];
                        next[index] = { ...variable, required: e.target.checked };
                        setEditing({ ...editing, variables: next });
                      }} /></td>
                      <td><input type="checkbox" checked={variable.validatedByHuman} onChange={(e) => {
                        const next = [...editing.variables];
                        next[index] = { ...variable, validatedByHuman: e.target.checked, ambiguous: e.target.checked ? false : variable.ambiguous };
                        setEditing({ ...editing, variables: next });
                      }} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="row" style={{ marginTop: 12 }}>
              <button className="btn" onClick={saveEditing}>Enregistrer les correspondances</button>
              <button className="btn-ghost" onClick={() => {
                const text = prompt('Texte exact à remplacer manuellement');
                if (!text) return;
                const next = [...editing.variables, {
                  id: `manual_${Date.now()}`,
                  name: 'Remplacement manuel',
                  originalText: text,
                  syntaxType: 'custom_rule',
                  canonicalField: 'CLIENT_NOM',
                  dataType: 'text',
                  category: 'personnalise',
                  occurrences: 1,
                  locations: [],
                  confidence: 1,
                  ambiguous: false,
                  validatedByHuman: true,
                  required: false,
                  defaultValue: '',
                  customRule: text,
                }];
                setEditing({ ...editing, variables: next });
              }}>Ajouter un remplacement manuel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
