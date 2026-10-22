import { useEffect, useRef, useState } from 'react';
import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
GlobalWorkerOptions.workerSrc = workerUrl;

export async function printActualPdf(url: string): Promise<void> {
  const response = await fetch(url); if (!response.ok) throw new Error('PDF indisponible pour impression.');
  const doc = await getDocument({ data: new Uint8Array(await response.arrayBuffer()), isEvalSupported: false }).promise;
  const frame = document.createElement('iframe'); frame.className = 'pdf-print-frame'; frame.title = 'Impression du PDF final';
  try {
    const images: string[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i), viewport = page.getViewport({ scale: 1.8 }), canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
      const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('Rendu d’impression indisponible.');
      await page.render({ canvasContext: ctx, viewport }).promise;
      images.push(`<img alt="Page ${i}" src="${canvas.toDataURL('image/png')}" />`); canvas.width = 0; canvas.height = 0; page.cleanup();
    }
    const ready = new Promise<void>(resolve => { frame.onload = () => resolve(); });
    frame.srcdoc = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Contrat GarageFlows</title><style>@page{size:A4;margin:0}body{margin:0}img{display:block;width:210mm;height:297mm;break-after:page}img:last-child{break-after:auto}</style></head><body>${images.join('')}</body></html>`;
    document.body.appendChild(frame); await ready;
    await Promise.all(Array.from(frame.contentDocument?.images || []).map(image => image.decode()));
    const win = frame.contentWindow; if (!win) throw new Error('Fenêtre d’impression indisponible.');
    win.addEventListener('afterprint', () => frame.remove(), { once: true }); win.focus(); win.print();
    // Some platforms do not emit afterprint. Do not remove during a live print dialog.
  } catch (error) { frame.remove(); throw error; } finally { await doc.destroy(); }
}
export default function ActualPdfPreview({ url }: { url: string }) {
  const canvas = useRef<HTMLCanvasElement>(null), [doc, setDoc] = useState<PDFDocumentProxy | null>(null), [number, setNumber] = useState(1), [error, setError] = useState(''), [renderedKey, setRenderedKey] = useState('');
  useEffect(() => {
    let stopped = false, loaded: PDFDocumentProxy | undefined;
    const controller = new AbortController(); setDoc(null); setNumber(1); setError('');
    fetch(url, { signal: controller.signal }).then(async response => {
      if (!response.ok) { const message = await response.json(); throw new Error(message.error || 'PDF indisponible.'); }
      loaded = await getDocument({ data: new Uint8Array(await response.arrayBuffer()), isEvalSupported: false }).promise;
      if (stopped) await loaded.destroy(); else setDoc(loaded);
    }).catch((e: Error) => { if (!stopped) setError(e.message); });
    return () => { stopped = true; controller.abort(); if (loaded) void loaded.destroy(); };
  }, [url]);
  useEffect(() => {
    if (!doc || !canvas.current) return;
    let cancelled = false; setRenderedKey('');
    let task: ReturnType<Awaited<ReturnType<PDFDocumentProxy['getPage']>>['render']> | undefined;
    doc.getPage(number).then(page => {
      if (cancelled || !canvas.current) return;
      const viewport = page.getViewport({ scale: 1.5 }), ctx = canvas.current.getContext('2d'); if (!ctx) return;
      canvas.current.width = Math.ceil(viewport.width); canvas.current.height = Math.ceil(viewport.height);
      task = page.render({ canvasContext: ctx, viewport });
      task.promise.then(() => { if (!cancelled) setRenderedKey(`${url}:${number}`); }).catch((e: Error) => { if (!cancelled) setError(e.message); });
    }).catch((e: Error) => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; task?.cancel(); };
  }, [doc, number, url]);
  return <div className="stack actual-pdf" aria-label="Aperçu du PDF final">
    <div className="row"><button className="btn-ghost" disabled={!doc || number <= 1} onClick={() => setNumber(n => n - 1)}>Page précédente</button><span aria-live="polite">Page {number} / {doc?.numPages || '…'}</span><button className="btn-ghost" disabled={!doc || number >= doc.numPages} onClick={() => setNumber(n => n + 1)}>Page suivante</button></div>
    {error ? <div className="warn-box" role="alert">{error}</div> : <><canvas ref={canvas} aria-label={`PDF réel, page ${number}`} data-rendered={Boolean(doc && renderedKey === `${url}:${number}`)} /><p className="help">Rendu des octets PDF finaux par PDF.js ; ce n’est pas une approximation HTML.</p></>}
  </div>;
}
