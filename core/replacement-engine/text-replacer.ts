import JSZip from 'jszip';
import { decodeXmlEntities, encodeXmlEntities } from '../document-parser/docx-parser';
import {
  computeTextSpanReplacements,
  ReplacementInstruction,
} from './docx-replacer';

export function encodeStringToRtf(str: string): string {
  let out = '';
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    const code = str.charCodeAt(i);
    if (ch === '\\' || ch === '{' || ch === '}') {
      out += '\\' + ch;
    } else if (code >= 32 && code <= 126) {
      out += ch;
    } else if (code === 0x20ac) {
      out += "\\'80";
    } else if (code >= 160 && code <= 255) {
      out += "\\'" + code.toString(16).padStart(2, '0');
    } else {
      out += `\\u${code}?`;
    }
  }
  return out;
}

export function replaceInTxtBuffer(
  originalBuffer: Buffer,
  instructions: ReplacementInstruction[]
): { buffer: Buffer; replacementsCount: Record<string, number> } {
  const text = originalBuffer.toString('utf8');
  const replacementsCount: Record<string, number> = {};
  const genericCounterRef = { count: 0 };

  const lines = text.split(/\r?\n/);
  const outLines = lines.map((line) => {
    if (!line.trim()) return line;
    return computeTextSpanReplacements(line, instructions, genericCounterRef, replacementsCount).newText;
  });

  return {
    buffer: Buffer.from(outLines.join('\n'), 'utf8'),
    replacementsCount,
  };
}

export function replaceInHtmlBuffer(
  originalBuffer: Buffer,
  instructions: ReplacementInstruction[]
): { buffer: Buffer; replacementsCount: Record<string, number> } {
  const html = originalBuffer.toString('utf8');
  const replacementsCount: Record<string, number> = {};
  const genericCounterRef = { count: 0 };

  // Remplacer dans les segments textuels hors balises <...> et hors <style>/<script>
  const parts = html.split(/(<style\b[^>]*>[\s\S]*?<\/style>|<script\b[^>]*>[\s\S]*?<\/script>|<[^>]+>)/gi);
  const updatedParts = parts.map((part) => {
    if (part.startsWith('<')) return part;
    const decoded = decodeXmlEntities(part);
    if (!decoded.trim()) return part;

    // Gérer les signatures images en HTML
    const customInst = instructions.map((inst) => {
      if (inst.canonicalField.startsWith('SIGNATURE_') && inst.value.startsWith('data:image/')) {
        return {
          ...inst,
          value: `__HTML_SIG_START__${inst.value}__HTML_SIG_END__`,
        };
      }
      return inst;
    });

    const { newText, spanReplacements } = computeTextSpanReplacements(
      decoded,
      customInst,
      genericCounterRef,
      replacementsCount
    );
    if (spanReplacements.length === 0) return part;

    let encoded = encodeXmlEntities(newText);
    encoded = encoded.replace(
      /__HTML_SIG_START__(data:image\/[^_]+?)__HTML_SIG_END__/g,
      (_, dataUrl) =>
        `<img src="${dataUrl}" alt="Signature" style="max-height:52px;max-width:160px;vertical-align:middle;display:inline-block;" />`
    );
    return encoded;
  });

  return {
    buffer: Buffer.from(updatedParts.join(''), 'utf8'),
    replacementsCount,
  };
}

export function replaceInRtfBuffer(
  originalBuffer: Buffer,
  instructions: ReplacementInstruction[]
): { buffer: Buffer; replacementsCount: Record<string, number> } {
  let rtf = originalBuffer.toString('latin1');
  const replacementsCount: Record<string, number> = {};
  const genericCounterRef = { count: 0 };

  // Normaliser les accolades échappées \{\{VAR\}\} vers {{VAR}} temporairement pour la correspondance
  rtf = rtf.replace(/\\\{\\\{([A-Za-z0-9_À-ÿ\s'-]{1,60}?)\\\}\\\}/g, '{{$1}}');

  // 1. Variables nommées
  const namedInstructions = instructions
    .filter((i) => !i.isGenericPositional && i.originalText.length > 0)
    .sort((a, b) => b.originalText.length - a.originalText.length);

  for (const inst of namedInstructions) {
    const rtfOrig = encodeStringToRtf(inst.originalText).replace(/\\\{/g, '{').replace(/\\\}/g, '}');
    const rtfVal = encodeStringToRtf(
      inst.canonicalField.startsWith('SIGNATURE_') && inst.value.startsWith('data:image/')
        ? '[Signature électronique apposée]'
        : inst.value
    );

    for (const tokenCandidate of [inst.originalText, rtfOrig]) {
      if (tokenCandidate && rtf.includes(tokenCandidate)) {
        const occurrences = rtf.split(tokenCandidate).length - 1;
        if (occurrences > 0) {
          rtf = rtf.split(tokenCandidate).join(rtfVal);
          replacementsCount[inst.variableId] = (replacementsCount[inst.variableId] || 0) + occurrences;
          break;
        }
      }
    }
  }

  // 2. Variables génériques positionnelles (XXX, XXXX, XXXXX)
  const genericInstructions = instructions.filter((i) => i.isGenericPositional);
  if (genericInstructions.length > 0) {
    rtf = rtf.replace(/\b(X{3,12})\b/g, (match) => {
      genericCounterRef.count += 1;
      const idx = genericCounterRef.count;
      const found = genericInstructions.find((gi) => gi.occurrenceIndex === idx);
      if (found && found.value) {
        replacementsCount[found.variableId] = (replacementsCount[found.variableId] || 0) + 1;
        return encodeStringToRtf(found.value);
      }
      return match;
    });
  }

  return {
    buffer: Buffer.from(rtf, 'latin1'),
    replacementsCount,
  };
}

export async function replaceInPptxBuffer(
  originalBuffer: Buffer,
  instructions: ReplacementInstruction[]
): Promise<{ buffer: Buffer; replacementsCount: Record<string, number> }> {
  const zip = await JSZip.loadAsync(Buffer.from(originalBuffer));
  const replacementsCount: Record<string, number> = {};
  const genericCounterRef = { count: 0 };

  const slideFiles = Object.keys(zip.files)
    .filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f))
    .sort();

  for (const sf of slideFiles) {
    const xml = await zip.file(sf)!.async('string');
    const updatedXml = xml.replace(/<a:t\b[^>]*>([\s\S]*?)<\/a:t>/g, (fullTag, inner) => {
      const decoded = decodeXmlEntities(inner);
      const { newText, spanReplacements } = computeTextSpanReplacements(
        decoded,
        instructions,
        genericCounterRef,
        replacementsCount
      );
      if (spanReplacements.length === 0) return fullTag;
      return `<a:t>${encodeXmlEntities(newText)}</a:t>`;
    });
    zip.file(sf, updatedXml);
  }

  const outBuf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  return { buffer: outBuf, replacementsCount };
}
