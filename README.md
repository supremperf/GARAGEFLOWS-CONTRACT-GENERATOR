# GarageFlows Contract Generator

Logiciel Windows professionnel, autonome et local, pour générer des contrats d’abonnement GarageFlows à partir de vos modèles.

Le logiciel ne contacte aucun service cloud pour fonctionner. Il ne invente aucune clause juridique : il remplace uniquement les variables détectées et validées.

## Installation pour l’utilisateur final

1. Lancer `dist/GarageFlows-Contract-Generator-Setup.exe`.
2. Choisir le dossier d’installation.
3. Ouvrir **GarageFlows Contract Generator** depuis le menu Démarrer ou le bureau.
4. Aucune installation de Node.js, Python ou d’un moteur OCR séparé n’est demandée.

Les données restent dans :

`%APPDATA%\GarageFlowsContractGenerator\`

- `database/` base SQLite locale
- `models/` copies des modèles importés (les originaux ne sont jamais modifiés)
- `generated/` contrats exportés par défaut
- `signatures/` images de signature
- `backups/` archives de sauvegarde
- `logs/` journaux techniques sans IBAN ni signature
- `settings/` paramètres

La désinstallation Windows ne supprime pas ce dossier, afin de ne pas perdre les clients et les modèles.

## Compilation

```bash
npm install
npm test
npm run dist
```

L’installateur est produit ici :

`dist/GarageFlows-Contract-Generator-Setup.exe`

La compilation Windows est réalisée depuis cet environnement par `electron-builder` avec le runtime Electron 28.3.3 win32-x64 et NSIS 3.12. Le script `npm run dist` télécharge le bundle NSIS officiel d’electron-builder si nécessaire et n’exige pas Wine.

## Utilisation

1. **Mes modèles** : importer un PDF, DOCX, ODT, RTF, TXT, HTML, XLSX, CSV, PPTX ou une image.
2. Vérifier les variables détectées. La syntaxe recommandée est `{{CLIENT_NOM}}`. Les anciens `XXX` sont identifiés un par un selon le contexte.
3. **Clients** : enregistrer la fiche.
4. **Mes informations** : renseigner GarageFlows une seule fois. Le tarif initial est **99,99 € TTC / mois** (83,33 € HT à 20 % de TVA, calcul en centimes).
5. **Générer un contrat** : modèle, client, contrôle, aperçu, export.
6. Choisir uniquement un format proposé : un format non fiable n’est pas offert.

Nom de fichier proposé : `Contrat_GarageFlows_NOM_PRENOM_YYYY-MM-DD.pdf`. Un fichier existant n’est jamais écrasé sans confirmation.

## Formats

| Format | Analyse | Remplacement natif | Export |
|---|---|---|---|
| DOCX | Complet (paragraphes, tableaux, en-têtes, pieds de page, images conservées) | Oui, sans reconstruire le document | DOCX, PDF, ODT, RTF, HTML, TXT |
| ODT | Complet | Oui | ODT, PDF, DOCX, RTF, HTML, TXT |
| PDF texte | Positions, polices, pages | Réécriture des opérateurs de texte, sans laisser l’ancien texte récupérable | PDF, DOCX, HTML, TXT |
| PDF scanné / image | OCR local si `fra.traineddata` est présent, sinon extraction de couche texte embarquée | Reconstruction vectorielle signalée comme limitée | PDF, DOCX, TXT |
| XLSX | Cellules, formules non concernées conservées | Oui | XLSX, PDF, CSV, HTML |
| XLS / ODS | Données et formules | Conversion maîtrisée | XLSX, PDF, CSV, HTML |
| RTF, HTML, TXT, CSV | Complet | Oui | Formats annoncés dans l’interface |
| DOC binaire | Partiel | Extraction puis reconstruction | DOCX, PDF, RTF, TXT |
| PPTX | Texte des diapositives | Partiel | PDF, DOCX, TXT |

Les limites réelles sont affichées sur chaque modèle. Une fonctionnalité partielle n’est pas présentée comme une conservation pixel par pixel.

## Limites assumées

- Un PDF scanné ne peut pas modifier la police bitmap d’origine. Le logiciel le dit et produit un document vectoriel vérifiable.
- Le format `.DOC` Word 97-2003 n’offre pas une conservation totale des styles complexes.
- Une signature dessinée ou importée n’est **pas** une signature électronique qualifiée.
- Le logiciel ne garantit pas la conformité juridique du contrat.
- Les conditions commerciales doivent venir du modèle ou être saisies par l’utilisateur. Elles ne sont jamais inventées.

## Développement

```bash
npm run dev
```

L’interface Vite est servie sur le port 5173 et le moteur local sur le port 3001. En application installée, l’interface et l’API sont servies ensemble en local.

Voir `README_MODELES_CONTRATS.md` pour préparer un modèle compatible.
