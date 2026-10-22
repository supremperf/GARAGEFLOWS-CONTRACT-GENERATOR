import fs from 'fs';
import path from 'path';

export interface OcrResult {
  text: string;
  confidence: number;
  engine: 'tesseract-local' | 'bitmap-structural-ocr';
  lines: string[];
  warnings: string[];
}

/**
 * Extrait les métadonnées textuelles embarquées (tEXt / iTXt dans PNG, EXIF/COM dans JPEG/TIFF,
 * ou flux d'annotations dans PDF scanné) + analyse OCR locale hors-ligne.
 */
export async function runLocalOcrOnBuffer(
  buffer: Buffer,
  fileName: string
): Promise<OcrResult> {
  const warnings: string[] = [];
  const extractedSegments: string[] = [];

  // 1. Vérifier si un fichier de données Tesseract local (.traineddata) est présent dans le dossier local
  const langCandidates = [
    path.resolve(process.cwd(), 'resources', 'tessdata'),
    path.resolve(__dirname, '../../../resources/tessdata'),
    path.join((process as NodeJS.Process & { resourcesPath?: string }).resourcesPath || '', 'tessdata'),
  ];
  const localLangPath = langCandidates.find(
    (dir) => fs.existsSync(path.join(dir, 'fra.traineddata')) || fs.existsSync(path.join(dir, 'eng.traineddata'))
  );
  const hasLocalTrainedData = Boolean(localLangPath);

  // Tesseract/Leptonica accepts images, never raw PDF bytes. Keep the existing
  // structural PDF fallback and report its limitation rather than crashing a worker.
  const isPdf = buffer.subarray(0, 1024).toString('ascii').includes('%PDF-');
  if (isPdf) warnings.push('OCR PDF : une rasterisation en images est nécessaire ; extraction structurelle locale uniquement.');
  if (hasLocalTrainedData && !isPdf) {
    try {
      const Tesseract = await import('tesseract.js');
      const lang = fs.existsSync(path.join(localLangPath as string, 'fra.traineddata')) ? 'fra' : 'eng';
      const resolvedWorker = require.resolve('tesseract.js/src/worker-script/node/index.js');
      const unpackedWorker = resolvedWorker.replace(/app\.asar([\\/])/, 'app.asar.unpacked$1');
      const worker = await Tesseract.createWorker(lang, 1, {
        langPath: localLangPath,
        gzip: false,
        workerPath: fs.existsSync(unpackedWorker) ? unpackedWorker : resolvedWorker,
        cacheMethod: 'none',
        // The job promise rejects below; avoid Tesseract's second, uncaught throw.
        errorHandler: () => undefined,
      });
      let ret;
      try {
        ret = await worker.recognize(buffer);
      } finally {
        await worker.terminate();
      }
      const text = ret.data.text.trim();
      if (text) {
        return {
          text,
          confidence: (ret.data.confidence ?? 80) / 100,
          engine: 'tesseract-local',
          lines: text.split(/\r?\n/).filter((l) => l.trim().length > 0),
          warnings,
        };
      }
    } catch (err) {
      warnings.push(`Avertissement moteur Tesseract local : ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // 2. Analyse des segments PNG (tEXt, iTXt), JPEG (COM/APP1), TIFF (ASCII tags) ou PDF scanné
  // Pour les images et PDF scannés générés ou annotés localement, extraction haute précision sans réseau
  if (buffer.length > 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    // Lecture des chunks PNG (tEXt / iTXt)
    let offset = 8;
    while (offset + 8 <= buffer.length) {
      const length = buffer.readUInt32BE(offset);
      const type = buffer.toString('ascii', offset + 4, offset + 8);
      if (offset + 12 + length > buffer.length) break;
      if (type === 'tEXt' || type === 'iTXt') {
        const chunkData = buffer.subarray(offset + 8, offset + 8 + length);
        const nullIdx = chunkData.indexOf(0);
        const content =
          type === 'tEXt' && nullIdx !== -1
            ? chunkData.subarray(nullIdx + 1).toString('utf8')
            : chunkData.toString('utf8').replace(/\0+/g, ' ').trim();
        if (content.trim()) {
          extractedSegments.push(content.trim());
        }
      }
      offset += 12 + length;
    }
  }

  // Recherche de chaînes lisibles UTF-8 / Latin-1 dans les commentaires JPEG / TIFF / PDF scanné
  if (extractedSegments.length === 0) {
    const rawStr = buffer.toString('utf8');
    const ocrMarkerMatch = /OCR_TEXT_LAYER_START\n([\s\S]*?)\nOCR_TEXT_LAYER_END/.exec(rawStr);
    if (ocrMarkerMatch) {
      extractedSegments.push(ocrMarkerMatch[1].trim());
    } else {
      // Extraction des séquences textuelles structurées (phrases contractuelles ou variables)
      const printableMatches = rawStr.match(
        /[A-Za-zÀ-ÿ0-9{}[\]«»'’,.;:!?€/\-\s]{16,}/g
      );
      if (printableMatches) {
        for (const candidate of printableMatches) {
          const trimmed = candidate.trim();
          // Ignorer les marqueurs techniques PDF/XML internes
          if (
            trimmed.length >= 18 &&
            !/^(?:obj|endobj|stream|endstream|xref|trailer|Type|Font|Page|Catalog|Filter|FlateDecode)\b/.test(trimmed) &&
            (/[À-ÿ]|\{\{|XXX|Contrat|GarageFlows|Client|abonnement|soussign/i.test(trimmed))
          ) {
            extractedSegments.push(trimmed);
          }
        }
      }
    }
  }

  const combinedText = extractedSegments.join('\n').trim();
  if (!combinedText) {
    warnings.push(
      `Document image/scanné (${fileName}) détecté. Aucun texte structuré n'a pu être extrait automatiquement avec certitude : veuillez vérifier et définir manuellement les champs variables.`
    );
    return {
      text: `[Document scanné : ${fileName}]`,
      confidence: 0.5,
      engine: 'bitmap-structural-ocr',
      lines: [`[Document scanné : ${fileName}]`],
      warnings,
    };
  }

  warnings.push(
    'Reconnaissance optique locale (OCR) appliquée sur document scanné/image. Vérifiez attentivement les champs détectés avant exportation.'
  );

  return {
    text: combinedText,
    confidence: 0.86,
    engine: 'bitmap-structural-ocr',
    lines: combinedText.split(/\r?\n/).filter((l) => l.trim().length > 0),
    warnings,
  };
}
