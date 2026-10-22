import { useEffect, useState } from 'react';
import { api, downloadUrl, type GeneratedContractRecord } from '../api';

export default function HistoryPage({ notify }: { notify: (m: string) => void }) {
  const [items, setItems] = useState<GeneratedContractRecord[]>([]);
  const [open, setOpen] = useState<GeneratedContractRecord | null>(null);
  const load = () => api.contracts().then(setItems).catch((e: Error) => notify(e.message));
  useEffect(() => { load(); }, []);

  return (
    <div className="stack">
      <section className="card">
        {items.length === 0 ? <div className="empty">Aucun contrat dans l’historique local.</div> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Fichier</th><th>Client</th><th>Modèle</th><th>Format</th><th>Fidélité</th><th>Date</th><th></th></tr></thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td>{item.fileName}</td>
                    <td>{item.clientName}</td>
                    <td>{item.templateName}</td>
                    <td>{item.exportFormat.toUpperCase()}</td>
                    <td>{item.report?.fidelityReport?.fidelityScore ?? '—'}/100</td>
                    <td>{new Date(item.createdAt).toLocaleString('fr-FR')}</td>
                    <td className="row">
                      <button className="btn-ghost" onClick={() => downloadUrl(`/api/contracts/${item.id}/download`, item.fileName).catch((e: Error) => notify(e.message))}>Télécharger</button>
                      <button className="btn-ghost" onClick={() => setOpen(item)}>Rapport</button>
                      <button className="btn-danger" onClick={() => { if (confirm('Supprimer cette entrée et le fichier généré ?')) api.deleteContract(item.id, true).then(load); }}>Supprimer</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {open && (
        <div className="modal-back" onClick={() => setOpen(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="spread"><h3>Rapport de génération</h3><button className="btn-ghost" onClick={() => setOpen(null)}>Fermer</button></div>
            <div className="grid-3" style={{ marginTop: 12 }}>
              <div className="info-box">Champs détectés : {open.report.totalDetectedFields}</div>
              <div className="ok-box">Champs remplacés : {open.report.replacedFieldsCount}</div>
              <div className="warn-box">Restants : {open.report.remainingEmptyFieldsCount} · ambigus : {open.report.ambiguousFieldsCount}</div>
            </div>
            <h4>Récapitulatif contractuel</h4>
            <p>Fournisseur : {open.report.legalRecap.fournisseurIdentite}</p>
            <p>Client : {open.report.legalRecap.clientIdentite} — {open.report.legalRecap.clientCoordonnees}</p>
            <p>Abonnement : {open.report.legalRecap.abonnementNom} · {open.report.legalRecap.prixTTC} TTC ({open.report.legalRecap.prixHT} HT) / {open.report.legalRecap.periodicite}</p>
            <p>Prise d’effet : {open.report.legalRecap.datePriseEffet} · Signature : {open.report.legalRecap.dateSignature}</p>
            <p>IBAN utilisé : {open.report.legalRecap.ibanUtilise}</p>
            <p className="help">{open.report.fidelityReport.summary}</p>
            {open.report.anomalies?.length > 0 && <div className="warn-box">{open.report.anomalies.join(' · ')}</div>}
            <div className="info-box">La génération technique ne constitue ni une validation juridique ni une signature qualifiée.</div>
          </div>
        </div>
      )}
    </div>
  );
}
