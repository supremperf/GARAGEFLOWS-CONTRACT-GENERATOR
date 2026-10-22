import fs from 'fs';
import path from 'path';
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { legalBlocks } from './variables';
import type { ProfessionalContract } from './types';
import { calendarDay, frenchDate } from './context';

export interface LayoutLine { text: string; page: number; x: number; y: number; size: number; width: number }
export async function renderProfessionalPdf(contract: ProfessionalContract): Promise<{ bytes: Buffer; pages: number; lines: LayoutLine[] }> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${contract.number} — ${contract.clientName}`);
  pdf.setAuthor('GarageFlows Contract Generator');
  pdf.setSubject(`Modèle ${contract.model.version} ; source SHA-256 ${contract.model.sha256}`);
  // Stable metadata: repeated previews of one immutable snapshot have identical bytes.
  pdf.setCreationDate(new Date(contract.createdAt)); pdf.setModificationDate(new Date(contract.createdAt));
  const regular = await pdf.embedFont(StandardFonts.Helvetica), bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const navy = rgb(.025, .065, .13), blue = rgb(.02, .33, .52), gray = rgb(.30, .35, .42), light = rgb(.92, .96, .98);
  const W = 595.28, H = 841.89, L = 48, R = W - 48, bottom = 58;
  const lines: LayoutLine[] = [];
  let page!: PDFPage, y = H - 94;
  const resourceRoot = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
  const candidates = [resourceRoot && path.join(resourceRoot, 'branding/wordmark.png'), path.resolve('public/branding/wordmark.png'), path.join(__dirname, '../../../public/branding/wordmark.png')].filter(Boolean) as string[];
  const logoPath = candidates.find(p => fs.existsSync(p));
  if (!logoPath) throw new Error('Logo officiel introuvable : génération arrêtée plutôt que substituer une autre image.');
  const logo = await pdf.embedPng(fs.readFileSync(logoPath));
  const compact = (text: string) => clean(text).replace(/\s/g, '');
  const clean = (text: string) => text.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/`([^`]+)`/g, '$1').replace(/\t/g, '    ');
  function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
    const result: string[] = [];
    for (const sourceLine of clean(text).split('\n')) {
      let line = '';
      for (const word of sourceLine.split(/\s+/).filter(Boolean)) {
        if (font.widthOfTextAtSize(word, size) > width) {
          if (line) { result.push(line); line = ''; }
          let chunk = '';
          for (const char of word) {
            if (font.widthOfTextAtSize(chunk + char, size) > width && chunk) { result.push(chunk); chunk = ''; }
            chunk += char;
          }
          line = chunk;
        } else if (line && font.widthOfTextAtSize(`${line} ${word}`, size) > width) { result.push(line); line = word; }
        else line = line ? `${line} ${word}` : word;
      }
      result.push(line);
    }
    if (compact(result.join('')) !== compact(text)) throw new Error('Perte de caractères pendant la composition PDF.');
    return result;
  }
  function draw(text: string, x: number, yy: number, size: number, font = regular, color = gray) {
    // Unsupported glyphs throw; never strip names/clauses silently.
    const width = font.widthOfTextAtSize(text, size);
    page.drawText(text, { x, y: yy, size, font, color });
    lines.push({ text, x, y: yy, size, width, page: pdf.getPageCount() });
  }
  function newPage(cover = false) {
    page = pdf.addPage([W, H]); y = H - 94;
    page.drawRectangle({ x: 0, y: H - 62, width: W, height: 62, color: navy });
    const dims = logo.scaleToFit(160, 44);
    page.drawImage(logo, { x: L, y: H - 53, width: dims.width, height: dims.height });
    if (!cover) page.drawText(contract.number, { x: W - 235, y: H - 34, size: 9, font: regular, color: rgb(.8, .88, .94) });
  }
  function paragraph(text: string, options: { size?: number; strong?: boolean; gap?: number; color?: ReturnType<typeof rgb> } = {}) {
    const size = options.size || 10.2, font = options.strong ? bold : regular, leading = size * 1.45;
    const wrapped = wrap(text, font, size, R - L);
    const keep = wrapped.length <= 3 ? wrapped.length : 2;
    // Keep short paragraphs together and colon introductions with the first list line.
    const reserve = /:\s*$/.test(text) && wrapped.length <= 4 ? wrapped.length * leading + (options.gap ?? 6) + leading : keep * leading;
    if (y - reserve < bottom) newPage();
    for (let i = 0; i < wrapped.length; i++) {
      const line = wrapped[i];
      if (y - leading < bottom || (wrapped.length - i === 2 && y - 2 * leading < bottom)) newPage();
      draw(line, L, y, size, font, options.color || gray); y -= leading;
    }
    y -= options.gap ?? 6;
  }
  function heading(text: string, major = false) {
    const size = major ? 16 : 12;
    const required = wrap(text, bold, size, R - L).length * size * 1.45 + 70;
    if (y - required < bottom) newPage();
    y -= 12; paragraph(text, { size, strong: true, color: blue, gap: 10 });
  }
  function table(rows: [string, string][]) {
    for (const [label, value] of rows) {
      const a = wrap(label, bold, 9.3, 150), b = wrap(value, regular, 10.2, R - L - 180);
      const count = Math.max(a.length, b.length);
      // A row can span pages; label repeats and no cells are clipped.
      let offset = 0;
      while (offset < count) {
        if (y - 42 < bottom) newPage();
        const capacity = Math.max(1, Math.floor((y - bottom - 16) / 15));
        const take = Math.min(count - offset, capacity), height = take * 15 + 16;
        page.drawRectangle({ x: L, y: y - height, width: R - L, height, color: light });
        for (let i = 0; i < take; i++) {
          const yy = y - 15 - i * 15;
          const labelLine = a[offset + i] || (offset && i === 0 ? '(suite)' : '');
          if (labelLine) draw(labelLine, L + 8, yy, 9.3, bold);
          if (b[offset + i]) draw(b[offset + i], L + 174, yy, 10.2);
        }
        y -= height + 3; offset += take;
      }
    }
    y -= 10;
  }
  function legalTable(header: string[], rows: string[][]) {
    const columns = header.length, widths = columns === 2 ? [166, R - L - 166] : Array.from({ length: columns }, () => (R - L) / columns);
    const headerLines = header.map((cell, col) => wrap(cell, bold, 9.3, widths[col] - 16));
    const headerHeight = Math.max(...headerLines.map(cell => cell.length)) * 15 + 16;
    function printHeader() {
      if (y - headerHeight - 40 < bottom) newPage();
      page.drawRectangle({ x: L, y: y - headerHeight, width: R - L, height: headerHeight, color: blue });
      let x = L;
      for (let col = 0; col < columns; col++) {
        headerLines[col].forEach((line, i) => draw(line, x + 8, y - 15 - i * 15, 9.3, bold, rgb(1, 1, 1)));
        x += widths[col];
      }
      y -= headerHeight + 3;
    }
    printHeader();
    for (const row of rows) {
      const cells = row.map((cell, col) => wrap(cell, col === 0 ? bold : regular, col === 0 ? 9.3 : 10.2, widths[col] - 16));
      const painted = row.map(() => [] as string[]), count = Math.max(...cells.map(cell => cell.length));
      let offset = 0;
      if (count <= 3 && y - (count * 15 + 16) < bottom) { newPage(); printHeader(); }
      while (offset < count) {
        if (y - 42 < bottom || (count - offset > 1 && y - 46 < bottom)) { newPage(); printHeader(); }
        const take = Math.min(count - offset, Math.max(1, Math.floor((y - bottom - 16) / 15))), height = take * 15 + 16;
        page.drawRectangle({ x: L, y: y - height, width: R - L, height, color: light });
        let x = L;
        for (let col = 0; col < columns; col++) {
          for (let i = 0; i < take; i++) {
            const line = cells[col][offset + i];
            if (line !== undefined) { if (line) draw(line, x + 8, y - 15 - i * 15, col === 0 ? 9.3 : 10.2, col === 0 ? bold : regular); painted[col].push(line); }
          }
          x += widths[col];
        }
        offset += take; y -= height + 3;
      }
      for (let col = 0; col < columns; col++) if (compact(painted[col].join('')) !== compact(row[col])) throw new Error('Cellule de tableau tronquée : génération annulée.');
    }
    y -= 10;
  }
  newPage(true);
  y = H - 140;
  paragraph('CONTRAT PROFESSIONNEL', { size: 25, strong: true, color: navy, gap: 16 });
  paragraph(contract.model.title, { size: 15, strong: true, color: blue, gap: 24 });
  table([
    ['Référence', contract.number], ['Client', contract.clientName], ['Version juridique', `${contract.model.version} — ${frenchDate(contract.model.date)}`],
    ['Émission', new Date(contract.createdAt).toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' })],
    ['Activation prévue/déclarée', contract.context.fields.DATE_EFFET], ['Nature du document', contract.kind === 'amendment' ? `Nouvelle version proposée / avenant à ${contract.parentId} — à faire signer` : 'Exemplaire généré — aucune signature apposée'],
  ]);
  paragraph('DOCUMENT CONFIDENTIEL · USAGE PROFESSIONNEL', { size: 10, strong: true, color: blue, gap: 12 });
  paragraph('La génération ne vaut ni acceptation, ni signature, ni validation juridique. Les images de signature enregistrées dans l’application ne sont pas apposées automatiquement.', { size: 10.2 });
  newPage();
  heading('Synthèse des données contractuelles', true);
  const f = contract.context.fields;
  table([
    ['Prestataire', `${f.PRESTATAIRE_NOM}\n${f.PRESTATAIRE_FORME_JURIDIQUE}\n${f.PRESTATAIRE_ADRESSE}\nSIRET ${f.PRESTATAIRE_SIRET}\n${f.PRESTATAIRE_EMAIL}`],
    ['Client', `${f.CLIENT_RAISON_SOCIALE}\n${f.CLIENT_FORME_JURIDIQUE}\n${f.CLIENT_ADRESSE}\nSIRET ${f.CLIENT_SIRET}\n${f.CLIENT_EMAIL}`],
    ['Représentant du client', `${f.CLIENT_REPRESENTANT} — ${f.CLIENT_QUALITE}`], ['Offre', f.ABONNEMENT_NOM],
    ['Prix par période', `${f.PRIX_TTC} € TTC / ${f.PERIODICITE} ; ${f.PRIX_HT} € HT ; TVA ${f.TVA_MONTANT} €`],
    ['Régime fiscal déclaré', f.TVA_MENTION], ['Annuel indicatif (€ TTC)', f.MONTANT_ANNUEL], ['Première échéance', f.PREMIERE_ECHEANCE],
    ['Engagement particulier', f.DUREE_ENGAGEMENT], ['Remise', f.REMISE], ['Mode de paiement déclaré', f.MOYEN_PAIEMENT],
  ]);
  heading('Conditions particulières expressément renseignées');
  paragraph(f.CONDITIONS_PARTICULIERES);
  paragraph('Cette synthèse reprend le contexte financier figé. Les conditions particulières ne modifient pas silencieusement le texte juridique reproduit ci-après. En cas de contradiction, faire valider le contrat avant signature.');
  newPage();
  const blocks = legalBlocks(contract.model.text, contract.model.bindings, { ...f, REFERENCE_CONTRAT: contract.number, NUMERO_CONTRAT: contract.number.replace(/^GF-ABO-/, ''), VERSION_MODELE: contract.model.version, DATE_EMISSION: frenchDate(calendarDay(new Date(contract.createdAt))) });
  const hasSignatureZones = blocks.filter(block => block.kind === 'line' && /^Signature\s*:\s*$/i.test(clean(block.text.trim()))).length >= 2;
  const expected: string[] = [], emitted: string[] = [];
  let paragraphBuffer: string[] = [];
  const flush = () => {
    if (!paragraphBuffer.length) return;
    const text = paragraphBuffer.join(' '); paragraph(text); emitted.push(text); paragraphBuffer = [];
  };
  for (const block of blocks) {
    if (block.kind === 'table') { flush(); expected.push(...block.header, ...block.rows.flat()); legalTable(block.header, block.rows); emitted.push(...block.header, ...block.rows.flat()); continue; }
    const line = block.text.replace(/^#{1,6}\s+/, '').trim(), plain = clean(line);
    if (!line) { flush(); continue; }
    if (/^---+$/.test(line)) { flush(); if (y - 20 < bottom) newPage(); page.drawLine({ start: { x: L, y }, end: { x: R, y }, thickness: .4, color: rgb(.75, .82, .87) }); y -= 14; continue; }
    expected.push(line);
    const annex = /^ANNEXE\s*(?:N[°o]\s*)?[12]\b/i.test(plain);
    const signatureTitle = /^SIGNATURES?(?: DES PARTIES)?\s*[:–—-]?\s*$/i.test(plain);
    const partyTitle = /^POUR (?:GARAGEFLOWS|LE FOURNISSEUR|LE PRESTATAIRE|LE CLIENT)/i.test(plain);
    if (/^Signature\s*:\s*$/i.test(plain)) {
      flush(); if (y - 140 < bottom) newPage(); paragraph(line); emitted.push(line);
      page.drawLine({ start: { x: L, y: y - 70 }, end: { x: L + 230, y: y - 70 }, thickness: .4, color: rgb(.6, .7, .77) }); y -= 85;
    } else if (/^ARTICLE\s+\d+\b/i.test(plain) || annex || block.heading || signatureTitle || partyTitle) {
      flush();
      if (annex || signatureTitle) newPage();
      if (partyTitle && y - 250 < bottom) newPage();
      heading(plain, annex); emitted.push(line);
      if (partyTitle && !hasSignatureZones) y -= 70;
    } else if (/ {2}$/.test(block.text) || /^\*\*[^*\n]+:\*\*/.test(line)) { flush(); paragraph(line, { gap: 4 }); emitted.push(line); }
    else if (/^(?:\d+(?:\.\d+)*[.)]|[-•])\s/.test(plain)) { flush(); paragraph(line, { gap: 5 }); emitted.push(line); }
    else paragraphBuffer.push(line);
  }
  flush();
  if (compact(expected.join('')) !== compact(emitted.join(''))) throw new Error('Intégrité du texte rendu incorrecte : génération annulée.');
  // A source with explicit signature zones already ends with its own final disclaimer.
  // Never append a second signature block after FIN DU CONTRAT.
  if (!hasSignatureZones) {
    if (y - 200 < bottom) newPage();
    heading('Espaces de signature — aucune signature apposée');
    table([['Prestataire', `${f.PRESTATAIRE_SIGNATAIRE} — ${f.PRESTATAIRE_QUALITE}`], ['Client', `${f.CLIENT_REPRESENTANT} — ${f.CLIENT_QUALITE}`]]);
    y -= 105;
  }
  const pages = pdf.getPages();
  for (let i = 0; i < pages.length; i++) {
    pages[i].drawLine({ start: { x: L, y: 44 }, end: { x: R, y: 44 }, thickness: .5, color: rgb(.7, .8, .86) });
    pages[i].drawText(`${contract.number}  |  Modèle ${contract.model.version}`, { x: L, y: 29, size: 8, font: regular, color: gray });
    const pagination = `${i + 1} / ${pages.length}`;
    pages[i].drawText(pagination, { x: R - regular.widthOfTextAtSize(pagination, 8), y: 29, size: 8, font: regular, color: gray });
  }
  return { bytes: Buffer.from(await pdf.save({ useObjectStreams: false })), pages: pages.length, lines };
}
