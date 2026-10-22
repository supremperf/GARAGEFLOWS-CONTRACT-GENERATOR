# Audit et correction de la distribution Windows x64

**Date : 22 octobre 2026.** Code construit : `3158e64`, branche `arena/04806916-garageflows-contract-generator`. PR : [#4](https://github.com/supremperf/GARAGEFLOWS-CONTRACT-GENERATOR/pull/4), ouverte, non fusionnée.

## Verdict de portée

**CORRIGÉ ET TESTÉ** : vérification des versions PE, reproduction du faux négatif NSIS, compilation croisée complète, intégrité de la distribution, tests automatisés, chargement PDF.js dans le JavaScript compilé et OCR d’images hors ligne.

**NON VALIDÉ SOUS WINDOWS NATIF** : aucun lancement d’Electron Windows, installation, raccourci ou désinstallation n’est déclaré réussi. Le job Windows créé pour cela reste en attente, sans étape exécutée à la rédaction. Le dossier Windows local de l’utilisateur et son Setup de 126,5 MB ne sont pas accessibles depuis cet environnement Linux.

L’installateur ci-dessous est un **artefact réel de compilation croisée Linux → Windows**, pas un résultat de compilation native Windows. Le module natif optionnel `canvas` n’est pas présent sur cette machine Linux et n’est donc pas contenu dans cet artefact. Sa validation Windows reste à faire.

## A — Cause technique et audit préalable

### 1. Chaîne examinée avant modification

État Git initial propre, HEAD `2c99320`. Lecture de :

- `package.json`, `package-lock.json`, `electron-builder.yml` ; recherche des autres configurations et des occurrences de version, productName, appVersion, artifactName, installer, NSIS et win-unpacked ;
- `scripts/verify-branding.mjs`, `prepare-dist.mjs`, `after-pack.cjs`, `patch-builder.cjs`, `generate-icon.mjs` ;
- `tsconfig.electron.json`, chemins de ressources, stockage et désinstallation ;
- code installé d’electron-builder : `AppInfo`, `NsisTarget.computeVersionKey`, génération des commandes NSIS et modèle de désinstallation ;
- sources NSIS `script.cpp` et `lang.cpp`, notamment `VIAddVersionKey` et `GetLangNameAndCPForVersionResource` ;
- graphe de dépendances, modules natifs, PDF.js et gestion des erreurs du worker Tesseract.

Les fichiers importants ont été copiés avant modification dans `tools/audit-windows-backup/` (outillage local ignoré par Git). Aucune donnée métier existante n’a été supprimée ou modifiée.

### 2. Les versions ne sont pas interchangeables

| Élément | Source / valeur |
|---|---|
| Version applicative | `package.json.version` = **1.0.1** |
| Deux versions du lockfile | racine et `packages[""].version` = **1.0.1** |
| Configuration builder | pas de version applicative indépendante |
| ProductVersion textuel attendu | **1.0.1** |
| FileVersion Windows dérivé | **1.0.1.0** |
| Versions numériques fixes PE | FileVersion et ProductVersion = **1.0.1.0** |
| Runtime Electron | **28.3.3**, indépendant de la version applicative |
| Nom commercial | **GarageFlows Contract Generator**, inchangé |
| Nom d’artefact | `GarageFlows-Contract-Generator-Setup.exe`, inchangé |

Le `.0` est la révision Windows dérivée, pas une nouvelle version commerciale. Une ancienne notation textuelle stable `1.0.1.0` est acceptée seulement si les quatre composantes numériques correspondent exactement. Les identités de préversion et de build SemVer, lorsqu’elles existent, doivent rester présentes dans ProductVersion.

### 3. Défaut du vérificateur

L’ancienne vérification lisait exclusivement :

```js
vi.getStringValues({ lang: 1033, codepage: 1200 }).ProductVersion
```

puis comparait un **préfixe** avec `startsWith(appVersion)`.

Deux défauts distincts :

1. Une table valide `(1033, 1252)` donne `undefined` à cette lecture ciblée `(1033, 1200)`. Le message « incorrect product version » ne prouvait donc pas que la version contenue dans le Setup était incorrecte.
2. `1.0.10` commence par `1.0.1` : une véritable mauvaise version pouvait être acceptée. Les versions fixes numériques n’étaient pas vérifiées.

### 4. Reproduction NSIS exécutée, et limite du diagnostic local

Un exécutable a réellement été compilé avec NSIS, pas seulement construit en mémoire par un mock. Le script reproducteur est conservé dans `tests/fixtures/nsis-native-version-order.nsi` :

```nsis
Unicode false
VIProductVersion 1.0.1.0
VIAddVersionKey /LANG=1033 ProductVersion "1.0.1"
; autres champs de version
Unicode true
```

Résultat lu dans le PE généré :

- table de chaînes : **lang=1033, codepage=1252** ;
- ProductVersion réel : **1.0.1** ; FileVersion textuel : **1.0.1** ;
- les deux versions fixes : **1.0.1.0** ;
- valeur lue par l’ancienne expression : **undefined** ;
- nouveau contrôle strict : **succès**.

Les commandes produites par le builder placent `VIAddVersionKey` avant `Unicode`. NSIS choisit la page de codes lorsque la clé est ajoutée ; elle dépend de l’état/language du compilateur à cet instant. Une page de codes 1252 est valide, elle ne signifie pas « mauvaise version » et ne nécessite pas de réécrire arbitrairement l’installateur.

**Ce mécanisme et le faux négatif sont démontrés.** En revanche, faute d’avoir le fichier Windows original, je ne certifie pas que sa table précise était 1252 ni qu’il n’avait aucune autre anomalie. Le nouveau vérificateur affiche désormais les valeurs réellement présentes et échoue explicitement si elles sont effectivement mauvaises.

### 5. Deux autres défauts réels constatés

- **PDF.js ESM** : TypeScript en mode CommonJS transformait l’import dynamique en `require('pdfjs-dist/legacy/build/pdf.mjs')`. Node 22 peut masquer ce problème, mais Node 18 embarqué dans Electron 28 ne sait pas charger ce module ESM par `require()`. La lecture PDF pouvait alors basculer silencieusement sur un repli.
- **OCR** : un PDF brut était envoyé à Tesseract/Leptonica, qui ne décode pas les PDF. Le worker ajoutait un second throw asynchrone à la promesse rejetée et n’était terminé que sur le chemin de succès. Cela expliquait le précédent `npm test` non nul malgré 58 assertions réussies.

## B — Modifications apportées

| Fichier | Correction |
|---|---|
| `scripts/windows-metadata.mjs` | Politique commune dérivée du package, cohérence lock/config/runtime ; lecture de toutes les tables et traductions ; contrôles des deux versions fixes, de FileVersion, ProductVersion, ProductName et de l’architecture. Diagnostics complets. Aucun changement binaire dans le vérificateur. |
| `scripts/verify-branding.mjs` | Remplacement de la lecture 1033/1200 et du préfixe ; conservation et renforcement des contrôles d’icônes ; contrôle du hash d’en-tête ASAR stocké dans le PE, des fichiers ASAR/unpacked, des DLL et addons ; extraction et comparaison de tout le payload du Setup, plus seulement quelques fichiers. |
| `scripts/after-pack.cjs` | Écriture des métadonnées dérivées dans toutes les tables présentes ; conservation des deux versions numériques ; contrôle immédiat du PE après insertion des icônes. |
| `scripts/prepare-dist.mjs` | Configuration YAML explicite ; FileVersion dérivé ; isolation des compteurs CI hérités ; contrôle Node/config avant packaging. Les adaptations Linux restent uniquement dans la branche Linux. |
| `scripts/verify-config.mjs` | Contrôle de la cohérence des versions, du runtime, des ressources relatives, de la cible x64, de l’ASAR, des icônes/raccourcis et de la conservation des données. |
| `electron-builder.yml` | `deleteAppDataOnUninstall: false` explicite ; ASAR explicite ; décompression des `.node`, de canvas, des workers Tesseract et de leurs fichiers de cœur ; maintien de PDF.js et du WASM SQL.js hors ASAR. |
| `tsconfig.electron.json`, `core/document-parser/pdf-parser.ts` | Émission Node16 conservant `import()` natif dans CommonJS ; import par URL fichier, compatible Windows et chemins physiques `app.asar.unpacked`. |
| `core/ocr/ocr-engine.ts` | Pas d’envoi de PDF brut au décodeur d’images ; avertissement explicite ; rejet du job traité sans second throw ; terminaison en `finally` ; worker physique décompressé et absence de cache OCR écrit dans le dossier courant. |
| `tests/windows-metadata.test.ts` | 26 tests sur de véritables ressources PE générées : CP1252/Unicode, langues, versions fixes, faux préfixes, traductions périmées/absentes, architecture, préversions/builds et isolation des compteurs CI. |
| `scripts/test-compiled-runtime.cjs` | Tests du JavaScript réellement compilé sans Vite/tsx : PDF positionnel, persistance SQLite, génération DOCX, reconnaissance réelle d’image et rejet d’image corrompue. Profil temporaire isolé. |
| `.github/workflows/windows-distribution.yml`, `scripts/test-windows-installer.mjs` | Validation native préparée : build, UI, installation NSIS, lancement Electron installé, canvas/DLL, OCR/PDF, raccourcis, désinstallation/réinstallation et conservation des fichiers métier de test. Exécution restreinte à une CI/VM jetable, refus d’une installation ou d’un dossier métier préexistant. **Pas encore exécutée avec succès.** |
| `package.json`, lockfile | Commandes de contrôle ; Node de compilation `>=22.12.0 <23` cohérent avec `@electron/rebuild` ; dépendances directes d’outillage `js-yaml` et `semver` déclarées. Aucun changement arbitraire de version applicative. |

Aucune modification de design, de nom commercial, de logo source ou des corrections clavier précédentes. Aucun `npm audit fix --force`, aucune désactivation de `verify:dist`, aucune assertion remplacée par un avertissement.

### Compatibilité et dépendances

Environnement exécuté : **Linux x64, Node 22.22.3, npm 10.9.8, Electron Windows 28.3.3, electron-builder 26.15.3, Vite 6.4.5, TypeScript 5.9.3**. Le Node **22.23.2** du poste utilisateur n’est pas installé ici : il est inclus dans la plage configurée, mais n’a pas été exécuté pendant cet audit. Le runtime Node **18.18.2** a été installé dans l’outillage de test et réellement utilisé pour tester le code compilé.

- `inflight@1.0.6` et `glob@7.2.3` : dépendances de développement via `@electron/asar@3.4.1` ; pas des composants de l’application distribuée.
- `rimraf@2.6.3` : développement, via Squirrel → electron-winstaller → temp ; cible réellement construite : NSIS. Pas de mise à jour transitive forcée.
- `prebuild-install@7.1.3` : dépendance d’installation de canvas, optionnelle dans le lockfile ; absente de l’installation Linux actuelle puisque canvas est absent. Sa dépréciation ne démontre pas une incompatibilité du binaire déjà construit.
- `eslint@9.39.5` : avertissement de fin de support reconnu ; uniquement développement ; lint réel réussi ; pas de migration majeure non sollicitée.
- `canvas@3.2.3` : override préexistant conservé, plage Node compatible avec Node 18.18.2 et Node 22 ; addon Node-API. **Aucun binaire canvas Windows n’a été exécuté ni validé ici.** Le test d’installation Windows l’exige et doit confirmer le chargement effectif des DLL.
- SQL.js est du WASM, pas un addon SQLite lié à un ABI Electron. Chargement et persistance réellement testés sous Node 18 et 22.
- Les messages « duplicate dependency references » du builder désignent les références répétées du graphe ; ils ne suffisent pas à établir une corruption. `npm ls --all` termine avec code 0 ; pas de déduplication aveugle susceptible de changer la résolution des modules.
- Les paquets de build principaux (Electron de développement, builder, rebuild, asar, TypeScript, ESLint, Vite, sharp, resedit, Playwright) ont été recherchés dans l’ASAR : absents.
- `npm audit --audit-level=high` : **0 vulnérabilité signalée dans ce lockfile**. Cela ne certifie pas l’absence de défaut dans le runtime Electron 28 ni son maintien de sécurité. Les alertes GitHub affichées au push concernent la branche par défaut `main`, pas la preuve d’un audit npm échoué sur cette branche. La PR n’est pas fusionnée.

## C — Commandes exécutées et résultats

| Contrôle exécuté | Résultat réel |
|---|---|
| Git status/diff/branche avant intervention | propre, travail sur la branche imposée uniquement |
| `npm run verify:config` | succès |
| `npm run typecheck` | succès : renderer et compilation Electron |
| `npm run lint` | succès, sans avertissement final |
| `npm test` | **84/84 tests, 8 fichiers, code 0, aucune erreur non interceptée** |
| `npm run build:electron` | succès ; `import()` conservé dans le code émis |
| `npm run test:runtime` | succès sous Node **22.22.3** |
| `tools/runtime-node18/node_modules/node/bin/node scripts/test-compiled-runtime.cjs` | succès sous Node **18.18.2**, sans loader TypeScript |
| `node tools/ui-check/run-ui.mjs` | **15/15 scénarios Playwright**, 7 tailles d’écran, clavier/modales/actions/absence de chevauchement ; le wrapper Linux utilise Chromium et ses bibliothèques locales |
| Compilation du reproducteur NSIS | succès ; table 1033/1252 ; ancien faux négatif constaté et nouveau contrôle réussi |
| `npm run dist` | succès complet, plusieurs exécutions réelles, dont contrôles finaux renforcés |
| `BUILD_NUMBER=77 CI_PIPELINE_IID=99 npm run dist` | **succès final**, les versions PE restent **1.0.1.0**, aucun compteur CI concurrent injecté |
| `npm run verify:dist` | succès ; vérifications détaillées ci-dessous |
| `npm ls --all` | code 0 |
| `npm audit --audit-level=high` | 0 vulnérabilité signalée |
| `git diff --check` | succès après remise des seuls exemples régénérés par nos builds à leur état Git initial |
| Build/installation Windows natifs | **non validés** : job distant sans étape exécutée à la rédaction |

Le test volontaire d’une image invalide produit le message natif Leptonica `Unknown format: no pix returned` sur stderr. Ce n’est pas masqué : le rejet est reçu, un avertissement est retourné et le worker est terminé ; le programme se termine avec code 0 après les assertions. L’OCR d’une véritable image « GARAGEFLOWS CLIENT MARTIN » est exécuté séparément et reconnaît MARTIN.

### Vérification du contenu effectivement généré

- application : PE **AMD64 0x8664** ; Setup : bootstrapper NSIS **x86 0x14c**, contenant le payload **x64**. Un bootstrapper NSIS x86 est normal pour installer une application x64 ; il n’a pas été confondu avec une application 32 bits ;
- toutes les versions numériques et chaînes réelles inspectées, pas seulement le YAML ;
- icône officielle : 7 résolutions **16, 24, 32, 48, 64, 128, 256**, dans tous les groupes PE du programme et du Setup ;
- **14 fichiers de marque** comparés octet par octet dans extraResources et le renderer ASAR ;
- assets JS/CSS du renderer comparés à ceux de l’ASAR ; version du package embarqué vérifiée ;
- hash d’en-tête ASAR déclaré dans la ressource PE `INTEGRITY/ELECTRONASAR` vérifié ; **6 311 fichiers ASAR/unpacked** vérifiés par SHA256 ;
- **6 DLL** contrôlées comme PE Windows AMD64 ; **0 addon `.node` présent dans cet artefact Linux** : cela n’est pas présenté comme une validation canvas ;
- **454 fichiers** du payload effectivement extrait du Setup, y compris ASAR, modules décompressés, WASM, DLL, ressources et exemples, comparés par SHA256 à win-unpacked.

### État du test natif distant

Workflow : `.github/workflows/windows-distribution.yml`, hôte demandé `windows-2022` (**Windows Server**, pas une preuve d’exécution sur Windows 10/11).

Dernière exécution de code : [39796003226](https://github.com/supremperf/GARAGEFLOWS-CONTRACT-GENERATOR/actions/runs/39796003226), commit `3158e64`. État observé : **queued**, aucune étape exécutée. Ce statut est un instantané, à vérifier sur GitHub après ce rapport.

Une première exécution `39794643880` est affichée en échec, mais sans étapes de job disponibles ; le téléchargement du journal redirige vers un hôte non accessible depuis cet environnement. Sa cause n’est donc pas attribuée au code sans preuve. La connexion autorise le push et la lecture des statuts, mais certaines opérations d’administration/annulation Actions renvoient HTTP 403. Aucun identifiant ou secret n’a été demandé.

**La présence de ce workflow et de ce test ne constitue pas une validation native réussie.**

## D — Installateur final réellement disponible

Chemin dans cet espace de travail :

```text
/home/user/GARAGEFLOWS-CONTRACT-GENERATOR/dist/GarageFlows-Contract-Generator-Setup.exe
```

Chemin de sortie correspondant après construction locale sur Windows :

```text
dist\GarageFlows-Contract-Generator-Setup.exe
```

| Propriété | Valeur mesurée sur le dernier artefact |
|---|---|
| Taille | **118 102 187 octets** — 118,10 MB / 112,63 MiB |
| SHA256 | `5ec2968a4eeba25d51e31535ddc83917f80b8645697b38ad2d42cee35af1c0da` |
| Version applicative / ProductVersion textuel | **1.0.1** |
| FileVersion textuel | **1.0.1.0** |
| Deux versions fixes PE | **1.0.1.0** |
| Table de chaînes de ce build Linux | **1033 / 1200**, application et Setup |
| Payload | Windows **x64**, application AMD64 ; bootstrapper NSIS x86 |
| Nom / société | GarageFlows Contract Generator / GarageFlows |
| Icônes | source officielle, 7 résolutions PE vérifiées |
| Authenticode | signature désactivée dans la configuration ; aucune signature commerciale ajoutée |
| Construction | compilation croisée depuis Linux ; **pas un build natif Windows validé** |

Logo source inchangé, SHA256 : `8ec4b44173f32407a4adb7a6de2df1b4e99699a68f0c93fbb35307b8b920cd21`.

Le binaire n’est pas ajouté à Git. Les différences de taille avec le Setup Windows de 126,5 MB ne sont pas interprétées comme une corruption : canvas optionnel est absent ici et les outils NSIS diffèrent. Les dates/métadonnées des exemples et de l’installateur empêchent également de promettre des builds bit-à-bit identiques ; le hash ci-dessus identifie précisément le dernier fichier, pas tous les builds futurs.

## E — Statut final et intervention restante

### CORRIGÉ ET TESTÉ

- Faux négatif de table PE, faux positif par préfixe, contrôle des versions fixes et des traductions.
- Source de vérité package/lock/config, FileVersion dérivé, isolation des compteurs CI.
- `npm run dist` complet sous Linux avec `verify:dist` strict et payload extrait vérifié.
- JavaScript compilé compatible Node 18 pour PDF.js ; extraction positionnelle réelle.
- Reconnaissance locale réelle d’images, propagation contrôlée des erreurs et terminaison du worker.
- Persistance SQL.js/WASM, génération DOCX et préservation des fichiers originaux de test.
- 84 tests et 15 scénarios de non-régression de l’interface/clavier.

### CORRIGÉ MAIS NON TESTÉ NATIVEMENT

- Configuration de décompression des addons/Canvas/worker pour le paquet Windows natif.
- Politique explicite de non-suppression des données à la désinstallation.
- Script d’installation/rejeu/désinstallation/réinstallation et contrôles de raccourcis : présent, mais pas déclaré réussi tant que le job natif n’a pas tourné.

### RESTANT À CORRIGER / LIMITES CONNUES

- **PDF purement scannés** : la rasterisation des pages avant OCR n’est pas implémentée dans cette correction. Le repli structurel existant est conservé avec avertissement explicite ; un PDF brut n’est plus envoyé à Tesseract comme s’il s’agissait d’une image. Aucune reconnaissance réelle de PDF scanné n’est revendiquée.
- **Canvas Windows et DLL sur un autre PC** : à valider dans le paquet natif ; non présents dans l’artefact croisé décrit ici.
- **Maintenance du runtime Electron 28 et des outils dépréciés** : pas de migration majeure aveugle ; l’audit npm réussi n’est pas une certification de sécurité du moteur Electron.

### INTERVENTION MANUELLE

1. Vérifier/reprendre le job Windows GitHub lorsqu’un runner devient disponible. Ne pas assimiler un statut queued ou un workflow ajouté à un test passé.
2. Dans une VM Windows 10/11 x64 propre, construire avec Node 22.23.2 si cette version précise doit être homologuée ; exécuter les contrôles puis `npm run dist`. Ne pas supprimer AppData, bases, modèles ni réglages pour réparer le build.
3. Installer/lancer le Setup natif, tester les documents réels, le chargement de canvas et les DLL, l’icône dans l’Explorateur/barre des tâches/raccourcis ; désinstaller/réinstaller en vérifiant la conservation des données. Le test `npm run test:installed` est réservé à une **VM jetable sans installation/données préexistantes**, pas au poste métier.
4. Prévoir une signature Authenticode si une distribution commerciale signée est exigée ; ne pas contourner SmartScreen ni fournir de certificat ou clé privée dans le chat.

Aucune donnée métier du poste utilisateur n’a été ouverte ni altérée. Les tests locaux utilisent uniquement des profils temporaires isolés. Les sources correctives sont poussées sur la branche de session et la PR #4 reste ouverte ; aucune fusion n’est prétendue.
