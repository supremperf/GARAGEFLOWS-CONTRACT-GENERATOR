# GarageFlows — correction ASAR et validation Windows

Date : **22 octobre 2026**. Branche : `arena/04806916-garageflows-contract-generator`. PR [#4](https://github.com/supremperf/GARAGEFLOWS-CONTRACT-GENERATOR/pull/4), non fusionnée.

Ce rapport remplace, pour l’état actuel, les conclusions du rapport d’audit précédent. Le dossier Windows de Mathys n’est pas accessible depuis la copie Linux utilisée ici. Les exécutions natives sont effectuées sur un runner GitHub **Windows Server 2022 x64**, distinct d’une homologation manuelle Windows 10/11.

## 1. Cause exacte de l’erreur ASAR

L’archive contient bien `node_modules`. Ce n’est ni une dépendance disparue, ni une archive de mauvaise architecture.

Dans `@electron/asar@3.4.1`, `Filesystem.listFiles()` construit les chemins d’affichage avec `path.join('/', ...)`. Cela donne :

| Système | Sortie de `listPackage()` |
|---|---|
| Linux | `/node_modules` et `/node_modules/express/index.js` |
| Windows | `\node_modules` et `\node_modules\express\index.js` |

Le vérificateur utilisait `name.replace(/^\//, '')`. Il retirait uniquement un slash Unix. Sous Windows, il passait donc **`\node_modules` à `statFile()`**, qui attend un chemin relatif à la racine logique de l’ASAR, sans préfixe raciné.

La bibliothèque traverse le répertoire parent avec les conventions de l’hôte. Le composant racine vide n’est pas le répertoire logique `node_modules` ; la recherche finit par lever exactement :

```text
Error: "\node_modules" was not found in this archive
```

### Reproduction exécutée

Le test charge le **véritable code `Filesystem` d’@electron/asar** avec l’API `path.win32` et un en-tête contenant `node_modules`. L’ancienne expression produit l’erreur exacte ; un chemin relatif normalisé accède correctement à la même entrée. Ce test unitaire de conventions Windows n’est pas présenté comme l’exécution d’un OS Windows.

La correction a également été exercée dans un **véritable build Windows natif** : `node scripts/prepare-dist.mjs` puis **`npm run dist` terminent avec succès**, vérification du branding, de l’ASAR et du payload NSIS incluse, dans les runs [39800210155](https://github.com/supremperf/GARAGEFLOWS-CONTRACT-GENERATOR/actions/runs/39800210155) et [39801785750](https://github.com/supremperf/GARAGEFLOWS-CONTRACT-GENERATOR/actions/runs/39801785750). Ces runs ont ensuite rencontré des échecs de tests distincts, détaillés plus bas : leur succès de compilation ne signifie pas un succès global de tous les tests.

## 2. Correction du vérificateur, sans suppression de contrôle

Nouveau module : `scripts/distribution-archive.mjs`.

1. Vérification explicite de l’existence du fichier ASAR et de sa lisibilité.
2. Lecture de l’en-tête réel et indexation des entrées, dossiers compris : aucune hypothèse sur la présence de `node_modules`.
3. Chemins logiques canoniques **relatifs, séparés par `/`** ; suppression des préfixes d’affichage Unix/Windows ; rejet des traversées, octets nuls et chemins à lettre de lecteur.
4. Conversion vers les séparateurs de l’hôte **uniquement à la frontière de l’API @electron/asar**.
5. Lecture des fichiers inclus avec l’API ASAR ; lecture des entrées `unpacked` depuis le vrai dossier **`app.asar.unpacked`**.
6. Recherche des modules entièrement externes dans **`resources/node_modules`**, emplacement que le résolveur Node peut réellement atteindre depuis `resources/app.asar`. Un fichier déposé dans un dossier unpacked mais absent de l’index n’est pas accepté comme un module ASAR valable.
7. Vérification des manifestes et points d’entrée des dépendances de production. Les points d’entrée sans extension, comme `jszip/lib/index`, sont résolus avec leurs extensions réelles, conformément au chargement Node.
8. Les erreurs de fichier absent, archive corrompue, mauvais type ou dépendance manquante restent bloquantes, avec le chemin logique et/ou physique attendu.

`scripts/verify-branding.mjs` utilise ce module pour **toutes** les lectures : hashes, exclusions d’outillage, ressources, renderer, package et addons. Corriger seulement le premier `statFile()` aurait laissé d’autres erreurs de séparateurs Windows plus loin dans les lectures d’assets.

### Architecture réellement distribuée

Le renderer est regroupé par Vite. En revanche, le main et le preload sont compilés par **tsc / Node16 CommonJS**, sans bundling de leurs dépendances : leurs `require()` nécessitent donc bien les modules de production. Electron-builder les place sous `app.asar/node_modules`, avec les bindings et ressources déclarés unpacked indexés dans l’ASAR. Les ressources extraResources (branding, exemples et langues OCR) se trouvent à côté de l’ASAR. Une archive supposée « entièrement bundlée » n’aurait pas expliqué ni corrigé cette distribution réelle.

### Contrôles conservés et renforcés

- Versions PE fixes et chaînes de toutes les traductions, ProductName, CompanyName et FileDescription.
- Architecture AMD64 de l’application, des DLL et des `.node` ; bootstrapper NSIS x86 admis pour un payload x64.
- Toutes les icônes de tous les groupes PE confrontées à l’ICO officiel multirésolution.
- Hash de l’en-tête ASAR déclaré dans le PE et hash de chaque fichier ASAR/unpacked.
- Absence des principaux outils de développement dans l’ASAR distribué.
- Présence réelle de main, preload, renderer, worker PDF.js, worker Tesseract, WASM SQL.js, données françaises OCR, branding et exemples.
- **Canvas est exigé dans la vérification native Windows**, avec lecture de son binding et contrôle AMD64. Son absence dans l’environnement Linux croisé est signalée explicitement : cette compilation ne constitue pas une certification d’autonomie native complète.
- Extraction du **Setup lui-même**, puis comparaison SHA256 de tous les fichiers de son payload avec win-unpacked.
- Les sorties 7-Zip sont maintenant affichées. Le code d’avertissement 1 dû aux données NSIS entourant l’archive n’est accepté qu’avec extraction réussie et comparaison effective de tout le payload. Les autres erreurs sont bloquantes.

## 3. Autres erreurs découvertes et corrigées

### Worker OCR installé : résolution ASAR, puis classification Electron de Tesseract

Le contrôle natif a identifié un **deuxième défaut réel d’autonomie**, distinct du vérificateur. Les runs `39806915577`, `39808779987` et `39810710885` installent et lancent l’application, chargent le binding canvas x64 et ses DLL, dessinent et encodent réellement un PNG, puis expirent sur l’OCR. Les annotations du dernier confirment le chemin logique du worker, sans exception non traitée : la première correction de chemin n’était donc pas suffisante. Ces runs ne sont pas présentés comme des réussites complètes.

**Premier risque corrigé : contexte de résolution.** L’ancien code réécrivait le worker Tesseract de `app.asar/node_modules/...` vers le chemin physique `app.asar.unpacked/node_modules/...`. Des dépendances telles que `node-fetch` restent empaquetées dans l’ASAR. Un worker physique isolé perd ces parents de résolution (`MODULE_NOT_FOUND` reproduit hors dépôt). Le nouveau point d’entrée est un bootstrap applicatif **logique dans l’ASAR**, conservé par `require.resolve`. Electron 28 sait lancer un `worker_threads.Worker` depuis l’ASAR, comme le montre [son test officiel 28.3.3](https://github.com/electron/electron/blob/v28.3.3/spec/asar-spec.ts#L115-L129).

**Cause supplémentaire du blocage, reproduite :** Tesseract **5.1.1**, version inchangée du lockfile, détecte `process.versions.electron` et classe le worker comme « electron ». Son chargeur de langues applique `env !== 'node'` et traite alors le dossier local de langue comme une URL. De plus, `createWorker()` ignore l’échec de `loadLanguage`/`initialize` via `.catch(() => {})` : la promesse d’initialisation reste en attente. Le `errorHandler` protège des exceptions secondaires mais ne corrige pas cette promesse.

Le même blocage a été reproduit **avec le véritable Tesseract/WASM sous Node**, en ajoutant le seul indicateur Electron dans un worker isolé. Ce test de classification n’est pas une fausse installation Windows. L’essai de données de langue en mémoire a également révélé un défaut de cette version (`initialize` utilise `l.data` au lieu de `l.code`) : ce contournement n’est pas distribué.

**Correction réellement intégrée :**

- `core/ocr/tesseract-worker.ts` utilise l’adaptateur Node de la version existante, avec un chargeur de langues strictement local.
- Seuls `fra.traineddata` et `eng.traineddata`, dans les répertoires de ressources connus, sont accessibles. URLs, autres fichiers et sorties par symlink sont rejetés ; aucun repli CDN/réseau.
- Dans une application ASAR installée, **seules les ressources installées** sont retenues : pas de recherche dans un répertoire courant arbitraire. Le mode développement conserve ses ressources locales.
- Un véritable rejet d’initialisation est propagé au mécanisme d’échec de chargement de Tesseract, avec ses vrais identifiants de job, puis le port du worker est fermé. Aucun faux résultat OCR n’est fabriqué.
- Les erreurs de bootstrap deviennent des échecs de chargement explicites, plutôt qu’une boîte de dialogue Electron non interceptée.
- Aucun changement global de `process.versions`, du sandbox, de la version de Tesseract ou du binding canvas dans le produit. Le wrapper de protocole est limité au worker de compatibilité et couvert par une régression réelle de langue corrompue.
- Le vérificateur de distribution exige les deux nouveaux fichiers JavaScript compilés.

Cet adaptateur s’appuie sur le protocole interne de Tesseract 5.1.1 : toute mise à jour de cette dépendance doit rejouer les régressions d’initialisation, de rejet et d’OCR installé, pas seulement compiler.

Trois tests protègent les chemins du worker ; six contrôlent les ressources locales et l’absence de réseau. Le test compilé exécute **un vrai OCR de pixels et un vrai rejet de langue corrompue**, avec l’indicateur Electron dans ce seul worker, sous Node 22 et Node 18.18.2. L’OCR réel en mode **TSX de développement** a également été exécuté avec succès.

Le smoke test conserve son délai d’échec de 120 secondes et son arrêt borné du seul processus qu’il a lancé. Un dépassement est un **échec**, jamais un succès masqué. Les données temporaires restent disponibles en cas d’échec.

### Worker PDF.js sous Windows

La bibliothèque PDF.js utilisait un import dynamique du worker avec un chemin Windows brut `C:\...`. Node interprète alors le préfixe `C:` comme un schéma d’URL non pris en charge. Le chargement échouait et le parseur basculait sur un repli « document scanné ».

`resolvePdfWorkerSrc()` renvoie maintenant une **URL `file:` produite par `pathToFileURL`**, y compris pour le worker dans `app.asar.unpacked`. Les tests contrôlent l’URL et l’existence du fichier. L’import de la bibliothèque conserve également son import ESM natif dans le JavaScript compilé pour Electron/Node 18.

### Assertion de branding et CRLF

Une assertion comparait du YAML Windows CRLF à une chaîne LF. La lecture de test normalise les fins de ligne avant de conserver les mêmes assertions d’identité. Ni l’icône ni la configuration de marque ne sont modifiées pour contourner l’assertion.

### Course dans le test clavier

Sur Windows, 14 scénarios UI passaient et un contrôle Fin échouait à 900×650. Certaines pages affichent une liste initialement vide sans indicateur de chargement : le test pouvait envoyer Fin **avant** l’arrivée des données, puis mesurer une page devenue plus haute.

Le test attend maintenant les données réelles de sa fixture avant la frappe et observe le résultat de manière asynchrone, avec la **même tolérance d’un pixel**, sans deuxième frappe automatique. Un nouveau scénario retarde uniquement le transport de la véritable API clients pour reproduire cette course. Aucun changement de design ou de routage clavier n’a été nécessaire.

### Contexte d’évaluation du smoke test Electron

Le run `39803258079` a réellement installé et lancé le logiciel, affiché le renderer, le preload sandboxé et le logo, et réussi les 16 scénarios UI. Son contrôle approfondi a ensuite échoué dans **le harnais de test** : `import('node:module')` depuis la fonction évaluée par Playwright dans le VM Electron provoquait `Invalid host defined options`. Le harnais utilise maintenant le chargeur CommonJS du processus principal, puis un `createRequire` ancré dans le package installé. Aucun assouplissement du sandbox ni changement du code métier pour contourner cette erreur.

### Isolation des profils pendant les tests

Des tests de validation de chemins pouvaient déclencher le logger avant de définir un profil temporaire. Sur une machine Windows propre, cela pouvait créer un dossier métier par défaut et faire légitimement refuser le test d’installation, qui protège les profils préexistants.

`tests/setup.ts` définit désormais un dossier temporaire **avant les imports applicatifs** pour chaque fichier de tests. Seul ce dossier de test est nettoyé. Le garde-fou qui refuse les installations et données préexistantes n’a pas été retiré ; aucun AppData existant n’est effacé pour faire passer un test.

## 4. Sécurité et protection des données

### Corrections Electron ciblées

L’audit a relevé une comparaison par préfixe dans l’ouverture de fenêtres et l’absence de contrôle d’émetteur des trois IPC exposés.

- Nouvelle politique testable `electron/security/window-policy.ts` : origine exacte, pas de faux localhost par préfixe, pas d’identifiants dans l’URL.
- IPC autorisés uniquement depuis la frame principale de l’origine de l’application ; validation des filtres de fichiers et des chemins absolus de révélation dans l’Explorateur.
- Navigation externe de la fenêtre principale bloquée ; ouverture externe limitée aux protocoles HTTP, HTTPS et mailto, pas de `file:`, `javascript:` ou protocole système arbitraire.
- Maintien de **contextIsolation=true, nodeIntegration=false, sandbox=true**, également explicites pour les nouvelles fenêtres autorisées.
- Le preload conserve une surface de trois méthodes spécifiques ; aucun accès Node générique, filesystem brut ou ipcRenderer complet n’est exposé au renderer.

### Audit des chemins et du stockage

- AppId, nom commercial et racine métier Windows **`%APPDATA%\GarageFlowsContractGenerator`** inchangés.
- Aucune migration de schéma ou de format de stockage ajoutée.
- `deleteAppDataOnUninstall: false` conservé.
- Les modèles et documents ne sont pas stockés dans le répertoire d’installation en lecture seule.
- Les ressources installées sont résolues à partir du répertoire de l’application ou de `process.resourcesPath`, pas d’un chemin local de développeur.
- Les tests de persistance et de sauvegarde/restauration sont réellement exécutés, dans des profils temporaires.
- Les protections existantes contre les extensions exécutables, signatures MZ/ELF, fichiers trop volumineux, bombes ZIP et traversées d’archives restent en place et testées.
- Le serveur de l’application installée est local ; cet audit ne constitue pas une certification de l’API pour une exposition publique en réseau. **Limite résiduelle connue : CORS n’est pas une autorisation serveur et ne rejette pas systématiquement les requêtes mutantes d’origine interdite.** La politique globale HTTP n’a pas été réécrite ici ; son durcissement Origin/authentification reste un chantier distinct, sans suppression des protections Electron.

## 5. Dépendances et warnings npm

Aucune dépendance n’a été ajoutée, remplacée ou mise à jour pour cette correction. Aucun `npm audit fix --force`. Package et lockfile restent cohérents, version applicative **1.0.1**.

| Avertissement | Origine / utilisation | Décision justifiée |
|---|---|---|
| inflight 1.0.6 | glob 7 via @electron/asar 3.4.1, outillage de développement | Conservé. ASAR 4.3.1 existe, mais est ESM avec Node >=22.12 et un nouveau graphe glob ; migration majeure distincte du correctif de chemins. |
| glob 7.2.3 | @electron/asar ; aussi chaîne temp/rimraf de Squirrel | Conservé, absent du runtime distribué audité. Ne pas imposer glob 13 à des consommateurs anciens. |
| rimraf 2.6.3 | electron-builder → Squirrel → electron-winstaller → temp | Développement ; cible produite NSIS. Un override majeur changerait l’API attendue par le consommateur. |
| prebuild-install 7.1.3 | canvas 3.2.3, helper d’installation du binding natif | 7.1.3 reste la version disponible consultée. Canvas 3.2.3 est également la version courante consultée ; pas de remplacement d’un binding fonctionnel pour supprimer un avertissement. |
| eslint 9.39.5 | dépendance directe et typescript-eslint, développement | Conservé. ESLint 10.13 existe, avec Node ^20.19 / ^22.13 / >=24 ; migration majeure de lint sans rapport avec l’ASAR, à valider séparément. |

`npm install` : succès local et succès natif Windows. `npm audit --audit-level=high` : **0 vulnérabilité signalée** pour ce lockfile. Cela n’est pas une certification de sécurité du moteur Electron 28. Les alertes GitHub sur la branche par défaut ne sont pas effacées par une PR non fusionnée.

Les avertissements de références dupliquées du builder n’ont pas été assimilés à une corruption : pas de déduplication aveugle. Les dépendances et points d’entrée effectivement distribués sont inspectés. Les runtimes Electron 28.3.3, builder 26.15.3, Vite 6.4.5 et TypeScript 5.9.3 sont conservés.

## 6. Fichiers modifiés

- `scripts/distribution-archive.mjs` — nouveau lecteur/inventaire portable.
- `scripts/verify-branding.mjs` — consommation de cet inventaire, dépendances et ressources installées, sorties d’extraction et marque.
- `core/document-parser/pdf-parser.ts` — URL fichier du worker Windows.
- `core/ocr/ocr-engine.ts`, `tests/ocr-worker-path.test.ts` — point d’entrée logique ASAR et trois régressions.
- `core/ocr/tesseract-worker.ts`, `core/ocr/local-language-fetch.ts`, `tests/local-ocr-fetch.test.ts` — adaptateur local Electron et propagation des échecs d’initialisation.
- `scripts/test-compiled-runtime.cjs`, `scripts/test-ocr-worker-runtime.cjs` — régressions réelles Tesseract/WASM et langue corrompue.
- `electron/main.ts`, `electron/security/window-policy.ts`, `electron/electron-shim.d.ts` — contrôles de fenêtres et IPC, sans désactivation du sandbox.
- `tests/distribution-archive.test.ts` — 20 régressions ASAR réelles et conventions Windows.
- `tests/pdf.test.ts`, `tests/branding.test.ts` — worker portable et CRLF.
- `tests/window-policy.test.ts` — 16 cas de sécurité fenêtres/IPC.
- `tests/setup.ts`, `tests/security.test.ts`, `vitest.config.ts` — profils temporaires dès les imports et test de non-régression.
- `e2e/keyboard-layout.spec.ts` — synchronisation sur les données et scénario d’API retardée.
- `scripts/test-windows-installer.mjs` — autonomie, profil métier, ressources, version/icône de désinstallation, réinstallation.
- `.github/workflows/windows-distribution.yml` — ordre de build demandé, `npm install`, vérification finale, diagnostics GitHub et exécution du smoke test même si un autre test échoue, sans transformer cet échec en succès.

`prepare-dist.mjs`, `electron-builder.yml`, `package.json`, le lockfile et `tsconfig.electron.json` ont été audités et n’ont pas nécessité de modification supplémentaire dans cette mission. Les seuls exemples régénérés par nos builds sont remis à leur état Git initial pour ne pas committer des changements de dates/ZIP/CRLF sans rapport ; les templates et données du poste utilisateur ne sont pas touchés.

## 7. Tests réellement exécutés

### Local Linux x64

Environnement : Node **22.22.3**, npm **10.9.8**. Runtime Node **18.18.2** également utilisé pour le code compilé. Le poste utilisateur Windows 10 / Node 22.23.2 n’a pas été accessible dans cette session. Le job Windows sélectionne Node `22.x` via setup-node ; son étape `node --version; npm --version` fait foi pour la révision effectivement utilisée. Cette validation ne remplace pas un essai sur ce poste précis.

Ordre demandé exécuté :

1. `npm run verify:config` — succès.
2. `npm run typecheck` — succès.
3. `npm run build:renderer` — succès.
4. `npm run build:electron` — succès.
5. `npm run build:branding` puis `npm run build:examples` — succès.
6. `node scripts/prepare-dist.mjs` — packaging Windows x64 réussi.
7. Branding PE — succès dans `verify:dist`.
8. ASAR — succès dans `verify:dist`.
9. Payload NSIS extrait et comparé — succès dans `verify:dist`.
10. **`npm run dist` intégral — code 0**, exécuté ensuite.

Compléments :

- **131/131 tests**, 12 fichiers, code 0 ; aucune erreur worker non interceptée.
- **16/16 scénarios Playwright**, 7 tailles d’écran, via le lanceur Chromium Linux `node tools/ui-check/run-ui.mjs`.
- `npm run lint` : succès.
- `npm run test:runtime` sous Node 22 : succès.
- Code compilé sous Node 18.18.2 : succès pour PDF.js positionnel, persistance SQLite/WASM, génération DOCX et OCR local d’une vraie image.
- Le rejet d’une image invalide et d’une langue délibérément corrompue est également testé : les messages Leptonica/Tesseract sont visibles sur stderr, l’erreur est traitée et le worker terminé. Il n’est pas masqué ni présenté comme un OCR réussi.

Sur le build croisé final : **6 639 entrées ASAR**, **6 314 fichiers ASAR/unpacked** hashés ; **6 DLL AMD64** ; **454 fichiers** du payload Setup comparés. Le module optionnel canvas n’est pas installé sous Linux dans cet environnement réseau, ce qui est explicitement signalé par le vérificateur. Ce build croisé n’est pas le paquet natif à homologuer pour canvas.

### Windows natif — bilan final

**SUCCÈS GLOBAL**, run [39821009273](https://github.com/supremperf/GARAGEFLOWS-CONTRACT-GENERATOR/actions/runs/39821009273), source `bb8474ddb99b9866f874ee74eed9a421aafac699`, job Windows `119971955716`, durée **8 min 29 s**. Aucun échec restant dans cette exécution ; le job optionnel de diagnostic d’un ancien artefact est normalement ignoré lors d’un push.

| Contrôle réellement exécuté sur Windows Server 2022 x64 | Résultat |
|---|---|
| `npm install`, configuration, TypeScript, renderer, Electron, branding, exemples | PASS |
| Préparation Windows x64 puis **`npm run dist` intégral** | **Code 0** |
| Versions PE, architecture, icônes, ASAR, modules unpacked et payload NSIS | PASS |
| Lint, **131 tests unitaires**, runtime compilé | PASS |
| **16 scénarios UI** | PASS — 52,4 s |
| Installation silencieuse du véritable Setup | PASS |
| Fenêtre installée, renderer, preload sandboxé, logo réellement décodé | PASS |
| Canvas x64/DLL, dessin et PNG réels | PASS |
| OCR réel de pixels, hors ligne, dans l’application installée | PASS |
| PDF.js ESM positionnel, SQLite/WASM, profil professionnel | PASS |
| Import DOCX puis véritable génération de contrat | PASS |
| Cibles des raccourcis Bureau et menu Démarrer | PASS |
| Première fermeture normale du vrai PID Electron | **Code 0** |
| Versions PE et toutes les icônes officielles du désinstallateur installé | PASS |
| Désinstallation réelle et comparaison SHA256 de tous les fichiers métier isolés | **Identiques byte pour byte** |
| Réinstallation et relancement : clients, modèle importé, entreprise, abonnement | **Conservés** |
| Deuxième fermeture normale du vrai PID Electron | **Code 0** |
| Désinstallation finale de cette seule installation de test | PASS |
| Téléversement de l’installateur et des preuves | PASS |

Les dix jalons d’installation sont présents dans les annotations GitHub du job. Le rapport `test-results/windows-installed.json` est inclus dans l’artefact, avec les résultats runtime, les étapes et les deux codes natifs. **Aucun arrêt forcé n’est compté comme une fermeture réussie.** Les données testées ont été créées dans des dossiers temporaires possédés par le harnais, sans toucher à un profil métier existant.

Ce résultat valide la chaîne automatisée sur le runner indiqué, pas une inspection visuelle humaine ni un essai sur un PC Windows 10/11 réellement vierge.

### Échecs observés et leur traitement

- Ancien vérificateur Windows : chemin raciné ASAR ; corrigé et reproduit par test dédié.
- Anciens jobs Windows : import du worker PDF.js et assertion CRLF ; corrigés, unitaires et runtime compilé ensuite réussis sous Windows.
- Run `39800210155` : build complet réussi, UI en échec ; tests d’installation sautés dans cette première organisation.
- Run `39801785750` : build complet réussi, **14/15 UI**, course de chargement à 900×650 ; assertion conservée et synchronisation corrigée. Smoke test également en échec, sans message détaillé récupéré pour ce run. Le risque constaté par inspection — un logger unitaire pouvant créer le profil par défaut avant l’isolation — a été corrigé ; les runs suivants franchissent le garde-fou sans suppression de profil existant.
- Run `39803258079` : build, 122 tests, 16 UI, installation et fenêtre installée réussis ; évaluation Playwright bloquée par un import dynamique dans le contexte VM du harnais, remplacé par le chargeur CommonJS.
- Run `39804802746` : annulé après blocage de l’évaluation approfondie, pour ajouter un diagnostic et des délais d’échec ; il n’est pas compté comme réussi.
- Run `39806915577` : build, 122 tests et 16 UI réussis ; binding canvas et encodage PNG opérationnels ; expiration OCR confirmée, résolution du worker corrigée comme expliqué ci-dessus.
- Runs `39808779987` et `39810710885` : 125 tests, 16 UI et builds réussis ; la seule correction de chemin ne suffisait pas, expiration OCR encore bloquante. Le diagnostic de classification Tesseract/Electron ci-dessus a ensuite été reproduit et corrigé.
- Le diagnostic manuel par `workflow_dispatch` a été refusé par les droits de l’intégration GitHub (HTTP 403) ; aucune permission n’a été contournée. Les validations automatiques sur push continuent de fonctionner. Le job optionnel de réutilisation d’artefact vérifie obligatoirement son SHA256 et ne se présente jamais comme un nouveau build.
- Run `39813339489` : build, 131 tests, 16 UI, puis **véritables canvas, OCR hors ligne, PDF.js positionnel et SQLite installés réussis**. La génération DOCX a correctement refusé un BIC invalide dans la fixture (« TEST INSTALLATION »). La fixture utilise désormais un BIC valide ; la validation métier n’a pas été modifiée. Le runtime compilé teste maintenant lui aussi un modèle réellement importé.
- Run `39816369434` : la génération DOCX installée et les contrôles de sécurité réels passent également. Le harnais expire ensuite en attendant `ElectronApplication.close()`. Playwright lance un shell `cmd.exe` sur Windows ; le contrôle final a été corrigé pour demander une fermeture normale de fenêtre, ouvrir préalablement le handle du **vrai PID Electron**, et exiger son **code de sortie 0**. La fin d’un shell n’est plus confondue avec la fin du produit ; aucun arrêt forcé de l’application n’est accepté comme un succès.
- Run `39818526335` : tous les builds, les 131 tests, les 16 UI et les fonctions installées réussissent ; le harnais rencontre ensuite une référence Playwright supprimée lors de la fermeture (`process()` après destruction du canal). Le handle du lanceur est désormais conservé **avant** la fermeture. Les diagnostics de progression sont des logs ordinaires pour réserver les dix annotations GitHub aux véritables étapes de validation, dont les deux codes de sortie natifs.
- Run `39819806973` : installation, fonctions, raccourcis, **deux fermetures natives avec code 0**, métadonnées/icônes du désinstallateur et **désinstallation avec conservation byte pour byte** réussies. Au redémarrage après réinstallation, une assertion instantanée mesurait l’image du logo avant son décodage. Elle attend désormais réellement `complete && naturalWidth > 0`, sans accepter d’image cassée. Le profil Chromium est également redirigé dans le dossier temporaire possédé par le test, indépendamment du profil métier.
- État final après ces corrections : voir bilan natif ci-dessus. Un succès de build n’est pas confondu avec le succès de l’ensemble de ces étapes.

## 8. Installateur et autonomie

Sortie attendue, inchangée :

```text
dist\GarageFlows-Contract-Generator-Setup.exe
```

**Installateur natif validé à utiliser :**

- Run : [39821009273](https://github.com/supremperf/GARAGEFLOWS-CONTRACT-GENERATOR/actions/runs/39821009273).
- [Télécharger l’artefact Windows natif et ses preuves](https://github.com/supremperf/GARAGEFLOWS-CONTRACT-GENERATOR/actions/runs/39821009273/artifacts/12444787585) — `windows-x64-installer-and-proof`, ID **12444787585**.
- Dans le ZIP : **`dist/GarageFlows-Contract-Generator-Setup.exe`** ; `test-results/windows-installed.json` contient la preuve des étapes natives.
- **Taille du Setup : 131 831 684 octets** (environ 125,72 MiB).
- **SHA256 du Setup : `982B1569F87A6FA385A0ACB95414E3D77F0902E4EC3EE9906317C68392A8D9F1`.**
- Version applicative **1.0.1** ; application et addons natifs **x64** ; runtime Electron embarqué **28.3.3**.
- Le ZIP d’artefact mesure **133 139 506 octets** ; son digest GitHub est `sha256:5b43136f65226f3077301baaa41cf2ad3550e9938c2960456b7084eb2c5595d2`. Ce digest est celui du **ZIP**, pas celui du Setup.
- Rétention configurée : **7 jours**, expiration annoncée le **29 octobre 2026 à 17:23:28 UTC**. Télécharger l’artefact avant cette échéance. Aucun gros binaire n’est ajouté au dépôt Git.

Pour contrôler le fichier extrait sous PowerShell :

```powershell
Get-FileHash '.\dist\GarageFlows-Contract-Generator-Setup.exe' -Algorithm SHA256
```

L’installateur complet se trouve dans cet artefact **natif Windows**. Le fichier local décrit ci-dessous est un autre build, croisé, et ne doit pas lui être substitué.

Artefact croisé disponible dans cet espace :

```text
/home/user/GARAGEFLOWS-CONTRACT-GENERATOR/dist/GarageFlows-Contract-Generator-Setup.exe
```

- Taille : **118 103 891 octets**, environ 112,63 MiB.
- SHA256 : `0a298471fd7bef8e8a91f8aa7afdbc08ed0bb9ef4af80dd8c1631b3c02abf3a6`.
- Version applicative/ProductVersion : **1.0.1** ; FileVersion et versions fixes : **1.0.1.0**.
- Application AMD64 ; bootstrapper NSIS x86 contenant le payload x64, configuration normale.
- ICO officiel : **16/24/32/48/64/128/256** ; source officielle inchangée, SHA256 `8ec4b44173f32407a4adb7a6de2df1b4e99699a68f0c93fbb35307b8b920cd21`.
- Aucun certificat Authenticode ajouté ; ne pas confondre ressources de marque et signature commerciale.
- **Ce fichier croisé ne contient pas canvas et n’est pas présenté comme le paquet Windows natif complet.** Préférer le résultat natif identifié ci-dessus pour la validation de cette dépendance.

L’autonomie doit être établie avec l’EXE réellement installé : runtime Electron embarqué, main/preload/renderer embarqués et dépendances natives locales. Le test natif isole aussi le profil Chromium avec `--user-data-dir` et utilise un dossier d’installation avec espace, un répertoire courant vide hors dépôt, un PATH enfant limité à System32 et aucun NODE_PATH/NODE_OPTIONS. Il ne s’appuie pas sur Node, npm, Python, Visual Studio, les sources ou un `.env` pour les fonctionnalités exercées. L’outillage Node du runner n’est nécessaire qu’à la conduite des tests et du build, pas au lancement normal du produit.

## 9. Limites et tâches manuelles

- Le runner Windows Server 2022 est un véritable Windows x64, mais ne remplace pas un essai humain sur **Windows 10 et Windows 11**, avec le Node développeur précis demandé et sur un autre PC propre.
- L’apparence réelle dans l’Explorateur, la barre des tâches, le cache d’icônes et les écrans interactifs d’installation requièrent un contrôle visuel humain ; les ressources PE et cibles de raccourcis sont contrôlées séparément.
- L’OCR d’images est testé réellement ; la rasterisation de PDF purement scannés avant OCR reste une limite fonctionnelle préexistante, distincte de l’erreur ASAR. Aucun OCR réel de toutes les pages de PDF scanné n’est revendiqué.
- Electron 28 est conservé pour la compatibilité du projet ; une stratégie de mise à niveau de sécurité du moteur doit être traitée séparément, sans migration majeure aveugle.
- L’absence de signature commerciale peut entraîner les avertissements habituels de Windows. Aucun contournement SmartScreen ni demande de clé privée.
- Aucun test ne peut garantir tous les pilotes, permissions, antivirus ou configurations possibles d’un autre PC ; les limites sont explicites plutôt que remplacées par un faux succès.

La PR reste ouverte et les sources sont poussées exclusivement sur la branche de session. Aucun binaire de plus de 100 MB n’est committé dans Git ; les artefacts natifs sont conservés par le workflow de validation.
