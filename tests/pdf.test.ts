import { describe, expect, it } from 'vitest';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parsePdfBuffer, resolvePdfWorkerSrc } from '../core/document-parser/pdf-parser';

async function makePdf(pages: string[][]): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (const lines of pages) {
    const page = doc.addPage([595, 842]);
    lines.forEach((line, i) => page.drawText(line, { x: 50, y: 780 - i * 24, size: 12, font }));
  }
  return Buffer.from(await doc.save());
}

describe('pdfjs-dist v4 — extraction PDF (GHSA-wgrm-67xf-hhpq corrigée)', () => {
  it('extrait un PDF multipage avec caractères accentués français', async () => {
    const buf = await makePdf([
      ['Contrat GarageFlows - premiere page', 'Client : {{CLIENT_NOM}} a Chalons-en-Champagne', 'Montant : {{ABONNEMENT_PRIX_TTC}} EUR'],
      ['Deuxieme page du contrat', 'Clauses particulieres : vehicule de remplacement inclus', 'Signature du client ci-dessous'],
    ]);
    const out = await parsePdfBuffer(buf, 'test-multipage.pdf');
    expect(out.pageCount).toBe(2);
    expect(out.fullText, JSON.stringify(out.warnings)).toContain('{{CLIENT_NOM}}');
    expect(out.fullText).toContain('Deuxieme page');
    expect(out.pdfItems.length).toBeGreaterThanOrEqual(6);
    expect(out.isScanned).toBe(false);
  });

  it('fournit une URL file: native au worker, y compris sous Windows', () => {
    const worker = resolvePdfWorkerSrc();
    expect(worker).toBeDefined();
    expect(new URL(worker!).protocol).toBe('file:');
    expect(fs.existsSync(fileURLToPath(worker!))).toBe(true);
  });

  it('rejette un fichier qui n’est pas un PDF', async () => {
    await expect(parsePdfBuffer(Buffer.from('pas un pdf'), 'faux.pdf')).rejects.toThrow(/PDF invalide/);
  });

  it('signale un PDF corrompu sans planter (avertissements)', async () => {
    const out = await parsePdfBuffer(Buffer.from('%PDF-1.4 fichier tronque sans objets'), 'tronque.pdf');
    expect(out.warnings.length).toBeGreaterThan(0);
  });
});
