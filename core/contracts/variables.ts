/** Shared pure helpers: safe to import in the renderer (no Node modules). */
export interface VariableSlot { token: string; key: string; occurrence: number; context: string }
export function variableSlots(text: string): VariableSlot[] {
  const counts = new Map<string, number>();
  return [...text.matchAll(/\[([^\x5b\]\n]{1,150})\]/g)].map(match => {
    const token = match[1], occurrence = (counts.get(token) || 0) + 1; counts.set(token, occurrence);
    const offset = match.index!, before = text.slice(0, offset);
    const section = [...before.matchAll(/^#{1,6}\s+(.+)$/gm)].at(-1)?.[1] || '';
    const line = text.slice(text.lastIndexOf('\n', offset) + 1, text.indexOf('\n', offset) < 0 ? text.length : text.indexOf('\n', offset));
    return { token, occurrence, key: `${token}#${occurrence}`, context: `${section} — ${line}`.slice(0, 260) };
  });
}
export function bindingFor(bindings: Record<string, string>, token: string, occurrence: number): string | undefined {
  return bindings[`${token}#${occurrence}`] || bindings[token];
}
export function variableReplacer(bindings: Record<string, string>, fields: Record<string, string>): (text: string) => string {
  const counts = new Map<string, number>();
  return text => text.replace(/\[([^\x5b\]\n]{1,150})\]/g, (_all, token: string) => {
    const occurrence = (counts.get(token) || 0) + 1; counts.set(token, occurrence);
    const field = bindingFor(bindings, token, occurrence);
    if (!field || !Object.hasOwn(fields, field)) throw new Error(`Variable non résolue : [${token}] occurrence ${occurrence}.`);
    return fields[field]; // Callback: dollars, brackets and pipes in values remain literal.
  });
}
export type LegalBlock = { kind: 'line'; text: string; heading: boolean } | { kind: 'table'; header: string[]; rows: string[][] };
export function legalBlocks(text: string, bindings: Record<string, string>, fields: Record<string, string>): LegalBlock[] {
  const replace = variableReplacer(bindings, fields), sourceLines = text.replace(/\r\n?/g, '\n').split('\n');
  const blocks: LegalBlock[] = [];
  for (let i = 0; i < sourceLines.length; i++) {
    const line = sourceLines[i];
    if (/^\s*\|/.test(line) && /^\s*\|(?:\s*:?-{3,}:?\s*\|)+\s*$/.test(sourceLines[i + 1] || '')) {
      // Parse the ORIGINAL source structure before substitution: a real value may contain pipes/newlines.
      const cells = (raw: string) => raw.trim().replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/).map(c => replace(c.trim().replace(/\\\|/g, '|')));
      const header = cells(line), rows: string[][] = []; i++;
      while (i + 1 < sourceLines.length && /^\s*\|/.test(sourceLines[i + 1])) {
        const row = cells(sourceLines[++i]);
        if (row.length !== header.length) throw new Error('Table du modèle invalide : nombre de cellules incohérent.');
        rows.push(row);
      }
      blocks.push({ kind: 'table', header, rows });
    } else blocks.push({ kind: 'line', text: replace(line), heading: /^\s*#{1,6}\s/.test(line) });
  }
  return blocks;
}
