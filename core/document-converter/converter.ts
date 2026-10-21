import JSZip from 'jszip';
import * as XLSX from 'xlsx';
import { encodeXmlEntities } from '../document-parser/docx-parser';
import { encodeStringToRtf } from '../replacement-engine/text-replacer';

export interface StructuredContractContent {
  title?: string;
  headers: string[];
  paragraphs: string[];
  tables: string[][][];
  footers: string[];
  signatures?: {
    client?: string;
    entreprise?: string;
  };
}

/**
 * Construit un véritable fichier OpenXML .DOCX conforme et complet à partir d'un contenu structuré
 */
export async function buildDocxBufferFromStructuredContent(
  content: StructuredContractContent
): Promise<Buffer> {
  const zip = new JSZip();

  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>
  <Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>
</Types>`
  );

  zip.file(
    '_rels/.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`
  );

  zip.file(
    'word/_rels/document.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  <Relationship Id="rIdHeader1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>
  <Relationship Id="rIdFooter1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>
</Relationships>`
  );

  zip.file(
    'word/styles.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal">
    <w:name w:val="Normal"/>
    <w:rPr>
      <w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/>
      <w:sz w:val="22"/>
    </w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading1">
    <w:name w:val="heading 1"/>
    <w:pPr><w:spacing w:before="240" w:after="120"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="28"/><w:color w:val="0F172A"/></w:rPr>
  </w:style>
</w:styles>`
  );

  const headerXmlBody = (content.headers.length > 0 ? content.headers : ['GARAGEFLOWS — CONTRAT D’ABONNEMENT'])
    .map(
      (h) =>
        `<w:p><w:r><w:rPr><w:sz w:val="18"/><w:color w:val="64748B"/></w:rPr><w:t xml:space="preserve">${encodeXmlEntities(h)}</w:t></w:r></w:p>`
    )
    .join('');

  zip.file(
    'word/header1.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${headerXmlBody}</w:hdr>`
  );

  const footerXmlBody = (content.footers.length > 0 ? content.footers : ['Document contractuel généré par GarageFlows Contract Generator'])
    .map(
      (f) =>
        `<w:p><w:r><w:rPr><w:sz w:val="16"/><w:color w:val="64748B"/></w:rPr><w:t xml:space="preserve">${encodeXmlEntities(f)}</w:t></w:r></w:p>`
    )
    .join('');

  zip.file(
    'word/footer1.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${footerXmlBody}</w:ftr>`
  );

  const bodyElements: string[] = [];

  for (const p of content.paragraphs) {
    const isHeading =
      p.toUpperCase() === p && p.length > 3 && p.length < 90 && /[A-ZÀ-Ÿ]/.test(p);
    if (isHeading) {
      bodyElements.push(
        `<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="26"/></w:rPr><w:t xml:space="preserve">${encodeXmlEntities(p)}</w:t></w:r></w:p>`
      );
    } else {
      bodyElements.push(
        `<w:p><w:pPr><w:spacing w:after="120"/></w:pPr><w:r><w:t xml:space="preserve">${encodeXmlEntities(p)}</w:t></w:r></w:p>`
      );
    }
  }

  for (const tbl of content.tables) {
    const rowsXml = tbl
      .map(
        (row, rIdx) =>
          `<w:tr>${row
            .map(
              (cell) =>
                `<w:tc><w:tcPr><w:tcW w:w="2800" w:type="dxa"/></w:tcPr><w:p><w:r>${
                  rIdx === 0 ? '<w:rPr><w:b/></w:rPr>' : ''
                }<w:t xml:space="preserve">${encodeXmlEntities(cell)}</w:t></w:r></w:p></w:tc>`
            )
            .join('')}</w:tr>`
      )
      .join('');
    bodyElements.push(
      `<w:tbl><w:tblPr><w:tblBorders><w:top w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/><w:left w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/><w:bottom w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/><w:right w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/><w:insideH w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/><w:insideV w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/></w:tblBorders></w:tblPr>${rowsXml}</w:tbl>`
    );
  }

  zip.file(
    'word/document.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>
    ${bodyElements.join('\n    ')}
    <w:sectPr>
      <w:headerReference w:type="default" r:id="rIdHeader1"/>
      <w:footerReference w:type="default" r:id="rIdFooter1"/>
      <w:pgSz w:w="11906" w:h="16838"/>
      <w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="708" w:footer="708" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>`
  );

  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

/**
 * Construit un véritable fichier OpenDocument .ODT conforme à partir d'un contenu structuré
 */
export async function buildOdtBufferFromStructuredContent(
  content: StructuredContractContent
): Promise<Buffer> {
  const zip = new JSZip();
  zip.file('mimetype', 'application/vnd.oasis.opendocument.text', { compression: 'STORE' });

  zip.file(
    'META-INF/manifest.xml',
    `<?xml version="1.0" encoding="UTF-8"?>
<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.2">
  <manifest:file-entry manifest:full-path="/" manifest:version="1.2" manifest:media-type="application/vnd.oasis.opendocument.text"/>
  <manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/>
  <manifest:file-entry manifest:full-path="styles.xml" manifest:media-type="text/xml"/>
</manifest:manifest>`
  );

  const headerXml = content.headers
    .map((h) => `<text:p>${encodeXmlEntities(h)}</text:p>`)
    .join('');
  const footerXml = content.footers
    .map((f) => `<text:p>${encodeXmlEntities(f)}</text:p>`)
    .join('');

  zip.file(
    'styles.xml',
    `<?xml version="1.0" encoding="UTF-8"?>
<office:document-styles xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" office:version="1.2">
  <office:master-styles>
    <style:master-page style:name="Standard">
      <style:header>${headerXml}</style:header>
      <style:footer>${footerXml}</style:footer>
    </style:master-page>
  </office:master-styles>
</office:document-styles>`
  );

  const paragraphsXml = content.paragraphs
    .map((p) => `<text:p>${encodeXmlEntities(p)}</text:p>`)
    .join('\n      ');

  const tablesXml = content.tables
    .map(
      (tbl, idx) =>
        `<table:table table:name="Table${idx + 1}">${tbl
          .map(
            (row) =>
              `<table:table-row>${row
                .map((cell) => `<table:table-cell><text:p>${encodeXmlEntities(cell)}</text:p></table:table-cell>`)
                .join('')}</table:table-row>`
          )
          .join('')}</table:table>`
    )
    .join('\n      ');

  zip.file(
    'content.xml',
    `<?xml version="1.0" encoding="UTF-8"?>
<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" office:version="1.2">
  <office:body>
    <office:text>
      ${paragraphsXml}
      ${tablesXml}
    </office:text>
  </office:body>
</office:document-content>`
  );

  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

/**
 * Construit un fichier RTF conforme avec prise en charge complète des accents français
 */
export function buildRtfBufferFromStructuredContent(content: StructuredContractContent): Buffer {
  const lines: string[] = [
    '{\\rtf1\\ansi\\ansicpg1252\\deff0{\\fonttbl{\\f0\\fswiss\\fcharset0 Arial;}}',
    '\\viewkind4\\uc1\\pard\\f0\\fs22 ',
  ];

  for (const h of content.headers) {
    lines.push(`{\\b\\fs18 ${encodeStringToRtf(h)}\\par}`);
  }
  if (content.headers.length > 0) lines.push('\\par ');

  for (const p of content.paragraphs) {
    const isHeading = p.toUpperCase() === p && p.length > 3 && p.length < 90 && /[A-ZÀ-Ÿ]/.test(p);
    if (isHeading) {
      lines.push(`{\\b\\fs26 ${encodeStringToRtf(p)}\\par}\\par `);
    } else {
      lines.push(`${encodeStringToRtf(p)}\\par\\par `);
    }
  }

  for (const tbl of content.tables) {
    for (const row of tbl) {
      lines.push(`${encodeStringToRtf(row.join('   |   '))}\\par `);
    }
    lines.push('\\par ');
  }

  for (const f of content.footers) {
    lines.push(`{\\i\\fs16 ${encodeStringToRtf(f)}\\par}`);
  }

  lines.push('}');
  return Buffer.from(lines.join('\n'), 'latin1');
}

/**
 * Construit un fichier HTML autonome prêt à l'impression A4
 */
export function buildHtmlBufferFromStructuredContent(content: StructuredContractContent): Buffer {
  const headersHtml = content.headers
    .map((h) => `<div class="doc-header">${encodeXmlEntities(h)}</div>`)
    .join('\n');

  const paragraphsHtml = content.paragraphs
    .map((p) => {
      const isHeading = p.toUpperCase() === p && p.length > 3 && p.length < 90 && /[A-ZÀ-Ÿ]/.test(p);
      return isHeading
        ? `<h2>${encodeXmlEntities(p)}</h2>`
        : `<p>${encodeXmlEntities(p)}</p>`;
    })
    .join('\n');

  const tablesHtml = content.tables
    .map(
      (tbl) =>
        `<table><tbody>${tbl
          .map(
            (row, rIdx) =>
              `<tr>${row
                .map((c) => (rIdx === 0 ? `<th>${encodeXmlEntities(c)}</th>` : `<td>${encodeXmlEntities(c)}</td>`))
                .join('')}</tr>`
          )
          .join('')}</tbody></table>`
    )
    .join('\n');

  const footersHtml = content.footers
    .map((f) => `<div class="doc-footer">${encodeXmlEntities(f)}</div>`)
    .join('\n');

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <title>${encodeXmlEntities(content.title || 'Contrat GarageFlows')}</title>
  <style>
    body { font-family: 'Segoe UI', Arial, sans-serif; color: #0f172a; line-height: 1.6; max-width: 210mm; margin: 18mm auto; padding: 0 12mm; }
    .doc-header { font-size: 12px; color: #64748b; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px; margin-bottom: 20px; }
    h2 { font-size: 16px; color: #0f172a; margin-top: 22px; margin-bottom: 8px; border-left: 3px solid #2563eb; padding-left: 10px; }
    p { font-size: 13.5px; margin: 10px 0; text-align: justify; }
    table { width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 13px; }
    th, td { border: 1px solid #cbd5e1; padding: 8px 10px; text-align: left; }
    th { background: #f1f5f9; font-weight: 600; }
    .doc-footer { font-size: 11px; color: #64748b; border-top: 1px solid #e2e8f0; padding-top: 8px; margin-top: 32px; }
  </style>
</head>
<body>
  ${headersHtml}
  ${paragraphsHtml}
  ${tablesHtml}
  ${footersHtml}
</body>
</html>`;

  return Buffer.from(html, 'utf8');
}

export function buildTxtBufferFromStructuredContent(content: StructuredContractContent): Buffer {
  const parts: string[] = [];
  if (content.headers.length > 0) parts.push(...content.headers, '');
  parts.push(...content.paragraphs);
  for (const tbl of content.tables) {
    parts.push('');
    for (const row of tbl) {
      parts.push(row.join(' | '));
    }
  }
  if (content.footers.length > 0) parts.push('', ...content.footers);
  return Buffer.from(parts.join('\n'), 'utf8');
}

export function buildXlsxBufferFromTables(
  tables: string[][][],
  paragraphs: string[],
  format: 'xlsx' | 'csv' = 'xlsx'
): Buffer {
  const wb = XLSX.utils.book_new();
  if (tables.length > 0) {
    tables.forEach((tbl, idx) => {
      const ws = XLSX.utils.aoa_to_sheet(tbl);
      XLSX.utils.book_append_sheet(wb, ws, `Tableau_${idx + 1}`);
    });
  } else {
    const rows = paragraphs.map((p) => [p]);
    const ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, 'Contrat');
  }
  if (format === 'csv') {
    const csv = XLSX.utils.sheet_to_csv(wb.Sheets[wb.SheetNames[0]]);
    return Buffer.from(csv, 'utf8');
  }
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}
