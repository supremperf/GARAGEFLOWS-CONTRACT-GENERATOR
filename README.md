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

## Identité visuelle officielle

L’image fournie est conservée sans modification dans `resources/branding/logo-official.png`.
Les déclinaisons sont générées par `npm run build:branding` (également exécuté par `build` et `dist`) dans `public/branding/` : logo complet, recadrages de l’emblème et du lettrage, PNG 16 à 512 px et ICO Windows multi-résolutions.
Le fond sombre est conservé pour préserver le halo cyan ; aucune suppression de fond ni recréation du logo n’est appliquée.

Le hook `scripts/after-pack.cjs` intègre réellement l’icône aux ressources PE de l’application, y compris lors d’une compilation Linux sans Wine. `npm run verify:dist` relit les icônes de l’application et du Setup, contrôle les images dans ASAR/extraResources et extrait le contenu du Setup pour comparaison SHA-256. Ce contrôle est exécuté automatiquement à la fin de `npm run dist` et bloque la commande en cas d’incohérence.

Voir [le rapport d’intégration du logo](RAPPORT_INTEGRATION_LOGO.md) pour les fichiers, les résultats réels, les captures actualisées et les vérifications restant à effectuer sur Windows. Les anciens rapports et captures numérotées décrivent la version antérieure et ne sont pas distribués avec le logiciel.

## Version 1.0.1 — clavier et boutons

Le contenu défile sans souris avec **↑ / ↓**, **PageUp / PageDown**, **Espace / Maj+Espace** et **Home / End**. Après un changement de rubrique, le focus va dans le contenu. Les champs de saisie conservent leurs touches habituelles ; Tab permet d’atteindre les actions et Échap de fermer les modales/menus.

Les rangées de boutons reviennent à la ligne, les tableaux larges ont leur propre défilement et l’aperçu zoomé ne recouvre plus les actions.

Tests navigateur reproductibles :

```bash
npx playwright install chromium
npm run test:ui
```

Voir [le rapport clavier/interface](RAPPORT_CLAVIER_INTERFACE.md) pour les 15 scénarios, la matrice des sept dimensions, les limites réelles et l’empreinte du **nouveau Setup 1.0.1**. Les tests UI réussissent ; la suite unitaire globale conserve l’exception OCR préexistante décrite dans les rapports.
