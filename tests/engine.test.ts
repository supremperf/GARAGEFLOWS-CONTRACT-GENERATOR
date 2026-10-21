import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterAll, describe, expect, it } from 'vitest';
import { parseDocumentBuffer, parseDocumentFile } from '../core/document-parser';
import { generateContractDocument } from '../core/replacement-engine';
import { calculateMonetaryAmounts } from '../core/variable-detection/dictionary';
import { detectDocumentVariables } from '../core/variable-detection/detector';
import { validateIbanFormat, validateSiretFormat } from '../core/validation/legal-validator';
import { exportGeneratedDocumentToDisk } from '../core/document-exporter/exporter';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gf-engine-'));

function valuesFor(variables: { id: string; canonicalField: string }[]) {
  const map: Record<string, string> = {
    CLIENT_NOM: 'DUPONT',
    CLIENT_PRENOM: 'Jean',
    CLIENT_NOM_COMPLET: 'Jean DUPONT',
    CLIENT_ADRESSE: '12 rue de Paris',
    CLIENT_ADRESSE_COMPLETE: '12 rue de Paris, 57000 Metz',
    CLIENT_CODE_POSTAL: '57000',
    CLIENT_VILLE: 'Metz',
    CLIENT_TELEPHONE: '0600000000',
    CLIENT_EMAIL: 'jean.dupont@email.fr',
    CLIENT_DATE_NAISSANCE: '15/04/1995',
    ENTREPRISE_NOM: 'GarageFlows',
    ENTREPRISE_SIRET: '12345678901234',
    ENTREPRISE_ADRESSE: '1 rue du Garage, 57000 Metz',
    ENTREPRISE_REPRESENTANT: 'Alex Martin',
    ENTREPRISE_VILLE: 'Metz',
    ENTREPRISE_IBAN: 'FR1420041010050500013M02606',
    ENTREPRISE_BIC: 'AGRIFRPP',
    ABONNEMENT_NOM: 'GarageFlows',
    ABONNEMENT_PRIX_TTC: '99,99 €',
    ABONNEMENT_PRIX_MONTANT: '99,99',
    ABONNEMENT_PRIX_HT: '83,33 €',
    ABONNEMENT_TVA: '20 %',
    ABONNEMENT_PERIODICITE: 'mois',
    DATE_DEBUT: '01/11/2026',
    DATE_SIGNATURE: '21/10/2026',
    SIGNATURE_CLIENT: 'Jean DUPONT',
    SIGNATURE_ENTREPRISE: 'Alex Martin',
  };
  return Object.fromEntries(variables.map((v) => [v.id, map[v.canonicalField] || 'VALEUR']));
}

describe('détection des variables', () => {
  it('distingue chaque XXX et regroupe {{CLIENT_NOM}}', () => {
    const detected = detectDocumentVariables({
      paragraphs: [
        { index: 0, text: 'Je soussigné XXX, résidant au XXX, joignable au XXX.', section: 'body' },
        { index: 1, text: 'Client {{CLIENT_NOM}} et encore {{CLIENT_NOM}}.', section: 'body' },
        { index: 2, text: 'Nom : [NOM]', section: 'body' },
      ],
      tables: [],
      headers: [],
      footers: [],
    });
    const generics = detected.filter((v) => v.syntaxType === 'generic_xxx');
    expect(generics).toHaveLength(3);
    expect(generics.map((v) => v.canonicalField)).toEqual([
      'CLIENT_NOM_COMPLET',
      'CLIENT_ADRESSE_COMPLETE',
      'CLIENT_TELEPHONE',
    ]);
    expect(new Set(generics.map((v) => v.id)).size).toBe(3);
    const named = detected.find((v) => v.canonicalField === 'CLIENT_NOM' && v.syntaxType === 'double_braces');
    expect(named?.occurrences).toBe(2);
    expect(detected.some((v) => v.originalText === '[NOM]')).toBe(true);
  });

  it('calcule 99,99 € TTC en 83,33 € HT sans erreur d’arrondi', () => {
    const amounts = calculateMonetaryAmounts('99,99', '20');
    expect(amounts.ttcNumeric).toBe('99,99');
    expect(amounts.htNumeric).toBe('83,33');
    expect(amounts.tvaAmountFormatted).toBe('16,66 €');
    expect(validateIbanFormat('FR1420041010050500013M02606').valid).toBe(true);
    expect(validateIbanFormat('FR00INVALID').valid).toBe(false);
    expect(validateSiretFormat('12345678901234').valid).toBe(true);
    expect(validateSiretFormat('123').valid).toBe(false);
  });
});

describe('remplacement documentaire', () => {
  it('remplace un DOCX sans modifier l’original ni inventer de clause', async () => {
    const file = 'examples/contrat-abonnement-garageflows.docx';
    const original = fs.readFileSync(file);
    const parsed = await parseDocumentFile(file);
    const generated = await generateContractDocument({
      templateId: 'tpl',
      templateName: 'Contrat',
      originalBuffer: original,
      originalFilePath: file,
      originalFileName: path.basename(file),
      variables: parsed.detectedVariables,
      valuesByVariableId: valuesFor(parsed.detectedVariables),
      targetFormat: 'docx',
    });
    expect(fs.readFileSync(file).equals(original)).toBe(true);
    expect(generated.finalFullText).toContain('Jean DUPONT');
    expect(generated.finalFullText).toContain('99,99 €');
    expect(generated.finalFullText).not.toContain('{{');
    expect(generated.finalFullText).toContain('aucune condition commerciale n’est ajoutée');
    expect(generated.report.fidelityReport.originalFileUntouchedVerified).toBe(true);
    expect(generated.report.fidelityReport.fidelityScore).toBeGreaterThanOrEqual(90);
    const reparsed = await parseDocumentBuffer(generated.buffer, 'contrat.docx');
    expect(reparsed.fullText.match(/DUPONT/g)?.length).toBeGreaterThanOrEqual(4);
  });

  it('réécrit un PDF texte sans laisser les variables récupérables', async () => {
    const file = 'examples/contrat-abonnement-garageflows.pdf';
    const original = fs.readFileSync(file);
    const parsed = await parseDocumentFile(file);
    const generated = await generateContractDocument({
      templateId: 'tpl',
      templateName: 'Contrat',
      originalBuffer: original,
      originalFilePath: file,
      originalFileName: path.basename(file),
      variables: parsed.detectedVariables,
      valuesByVariableId: valuesFor(parsed.detectedVariables),
      targetFormat: 'pdf',
    });
    expect(fs.readFileSync(file).equals(original)).toBe(true);
    const reparsed = await parseDocumentBuffer(generated.buffer, 'contrat.pdf');
    expect(reparsed.fullText).toContain('DUPONT');
    expect(reparsed.fullText).not.toContain('{{CLIENT_NOM}}');
    expect(reparsed.fullText).toContain('aucune condition commerciale');
    expect(generated.buffer.toString('latin1')).not.toContain('{{CLIENT_NOM}}');
  });

  it('remplace les XXX distincts et conserve la formule Excel', async () => {
    const legacy = await parseDocumentFile('examples/contrat-ancien-modele-xxx.txt');
    const generatedTxt = await generateContractDocument({
      templateId: 'tpl',
      templateName: 'Ancien',
      originalBuffer: fs.readFileSync('examples/contrat-ancien-modele-xxx.txt'),
      originalFileName: 'contrat-ancien-modele-xxx.txt',
      variables: legacy.detectedVariables,
      valuesByVariableId: valuesFor(legacy.detectedVariables),
      targetFormat: 'txt',
    });
    expect(generatedTxt.finalFullText).toContain('Jean DUPONT');
    expect(generatedTxt.finalFullText).toContain('15/04/1995');
    expect(generatedTxt.finalFullText).toContain('99,99 euros');
    expect(generatedTxt.finalFullText).not.toMatch(/\bXXX\b/);

    const xlsxPath = 'examples/fiche-abonnement.xlsx';
    const original = fs.readFileSync(xlsxPath);
    const parsed = await parseDocumentFile(xlsxPath);
    expect(parsed.detectedVariables.find((v) => v.canonicalField === 'CLIENT_NOM')?.occurrences).toBe(1);
    const generated = await generateContractDocument({
      templateId: 'tpl',
      templateName: 'Tableur',
      originalBuffer: original,
      originalFilePath: xlsxPath,
      originalFileName: 'fiche-abonnement.xlsx',
      variables: parsed.detectedVariables,
      valuesByVariableId: valuesFor(parsed.detectedVariables),
      targetFormat: 'xlsx',
    });
    const reparsed = await parseDocumentBuffer(generated.buffer, 'fiche.xlsx');
    expect(reparsed.fullText).toContain('DUPONT');
    expect(reparsed.fullText).toContain('=B5');
    expect(reparsed.fullText).toContain('Ne pas modifier cette clause');
    expect(fs.readFileSync(xlsxPath).equals(original)).toBe(true);
  });

  it('refuse un export incomplet et n’écrase pas un fichier existant', async () => {
    const file = 'examples/contrat-abonnement-garageflows.txt';
    const parsed = await parseDocumentFile(file);
    await expect(
      generateContractDocument({
        templateId: 'tpl',
        templateName: 'Contrat',
        originalBuffer: fs.readFileSync(file),
        originalFileName: 'contrat.txt',
        variables: parsed.detectedVariables,
        valuesByVariableId: {},
        targetFormat: 'txt',
      })
    ).rejects.toThrow(/incomplet|obligatoire/i);

    const dest = path.join(tmp, 'exports');
    const first = await exportGeneratedDocumentToDisk({
      buffer: Buffer.from('contrat test'),
      destinationDir: dest,
      fileName: 'Contrat_GarageFlows_DUPONT_Jean_2026-10-21.txt',
      format: 'txt',
    });
    expect(first.verifiedReadable).toBe(true);
    await expect(
      exportGeneratedDocumentToDisk({
        buffer: Buffer.from('autre'),
        destinationDir: dest,
        fileName: first.fileName,
        format: 'txt',
      })
    ).rejects.toThrow(/FILE_ALREADY_EXISTS|existe déjà/);
  });
});

describe('sécurité des imports', () => {
  it('bloque un exécutable déguisé et un PDF corrompu', async () => {
    const { validateImportedFileSecurity } = await import('../electron/security/path-validator');
    expect(() => validateImportedFileSecurity({ fileName: 'virus.exe', buffer: Buffer.from('MZ') })).toThrow(/interdit/i);
    expect(() =>
      validateImportedFileSecurity({ fileName: 'contrat.pdf', buffer: Buffer.from([0x4d, 0x5a, 0x00, 0x00]) })
    ).toThrow(/MZ|exécutable/i);
    expect(() => validateImportedFileSecurity({ fileName: 'vide.pdf', buffer: Buffer.from('%PDF-1.4') })).not.toThrow();
    await expect(parseDocumentBuffer(Buffer.from('pas un pdf'), 'contrat.pdf')).rejects.toThrow(/illisible|invalide|corrompu/i);
  });
});

afterAll(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});
