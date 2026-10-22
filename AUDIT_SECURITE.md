# Audit de sécurité et de qualité — GarageFlows Contract Generator

Date : 22 octobre 2026 · Auditeur : ingénierie (agent) · Périmètre : dépôt complet (src, core, electron, storage, scripts, tests), dépendances npm (production + développement), serveur API local, durcissement runtime.

## A. État initial

Application Electron + React + Express local (SQLite via sql.js), traitement 100 % local.
Constats initiaux principaux : API écoutant sur `0.0.0.0` avec `cors()` permissif et sans authentification (données clients/IBAN accessibles depuis le réseau local et tout site web via le navigateur), aucune restauration de sauvegarde validée avant écriture, aucun garde-fou sur les archives ZIP (docx/odt/xlsx/pptx) ni sur SheetJS, pas de script `lint`, dashboard désérialisant tous les rapports JSON pour de simples compteurs, Vitest 2.1.9 et Electron 28.3.3 anciens.

## B. Environnement

Node v22.22.3 · npm 10.9.8 · TypeScript 5.9.3 · Vite 6.4.5 · Vitest 4.1.12 (après correction) · ESLint 9.39.5 (ajouté).
Note réseau : l'endpoint POST de `npm audit` est très lent via le proxy (plusieurs minutes) mais aboutit ; le CDN SheetJS et les dépôts OS sont inaccessibles depuis cet environnement.

## C. Commandes réellement exécutées (avant → après)

| Contrôle | Avant | Après |
|---|---|---|
| `npm run typecheck` | OK | OK |
| `npm test` | 9/9 (2 fichiers) | **28/28 (3 fichiers, dont 19 tests de sécurité nouveaux)** |
| `npm run build` | OK | OK (renderer + electron + exemples) |
| `npm run lint` | inexistant | **ajouté : 0 erreur, 115 avertissements** (essentiellement `any` historiques, comptés et assumés) |
| `npm audit` (complet) | 21 vuln. (3 critical, 5 high, 13 moderate) | **11 vuln. (0 critical, 2 high, 9 moderate)** |
| `npm audit --omit=dev` | non mesuré séparément au départ | **5 vuln. (0 critical, 2 high, 3 moderate)** — détail §E |
| `npm outdated` | majors disponibles | aucun retard dans les plages déclarées (mises à jour majeures évaluées §E) |
| `npm ls --depth=0` | cohérent | cohérent (arbre régénéré proprement, voir incident npm §J) |

## D/E. Vulnérabilités et traitement

### Corrigées et vérifiées
| Composant | Gravité | Cause | Correction | Vérification |
|---|---|---|---|---|
| vitest ≤ 4.1.10 (+ @vitest/mocker, tinypool) | **CRITICAL** (CVE-2026-47429, exécution/lecture de fichiers via serveur UI) + MEDIUM | devDependency obsolète | `vitest@^4.1.11` → 4.1.12 installé | GHSA `vitest@4.1.12` : aucun avis ; tests 28/28 ; l'UI Vitest n'est de toute façon jamais lancée |
| tar ≤ 7.5.20 (chaîne electron-builder) | **CRITICAL** ×3 avis (traversée par liens durs) | lockfile ancien | régénération du lockfile → tar 7.5.22 | audit complet post-correction : 0 critical |
| vite ≤ 6.4.3 / esbuild ≤ 0.24.2 (transitives) | HIGH/MEDIUM | copies imbriquées anciennes | lockfile régénéré → vite 6.4.5, esbuild 0.25.12 | `npm ls` + audit |
| API locale exposée réseau | **HIGH** (contexte) | `listen('0.0.0.0')` + `cors()` wildcard, sans auth | écoute `127.0.0.1` par défaut (env `HOST` pour dev encadré), CORS limité aux origines boucle locale, en-têtes `nosniff`, `X-Frame-Options: DENY`, `Cache-Control: no-store`, `x-powered-by` désactivé | sondes curl réelles : origine `evil.example` → aucun en-tête ACAO ; origine locale → autorisée ; test automatisé dans `tests/security.test.ts` |
| Restauration de sauvegarde | MEDIUM | écriture immédiate, contrôle de préfixe contournable, aucune limite de taille | validation de **tous** les chemins et tailles **avant** écriture, rejet `..`/absolu/backslash/lecteur Windows, plafonds 5 000 entrées / 200 Mo par entrée / 1 Go total | tests unitaires + archive piégée réelle : le fichier « evil » atterrit à l'intérieur du dossier applicatif (normalisation JSZip + contrôles), rien hors racine |
| Bombes de décompression DOCX/ODT/PPTX/XLSX | MEDIUM | `JSZip.loadAsync` sans limites | `assertZipWithinLimits` (2 000 entrées, 300 Mo décompressés max) dans les 4 parseurs | tests unitaires du garde-fou |
| SheetJS CVE-2023-30533 (pollution de prototype) | HIGH | xlsx 0.18.5, aucun correctif sur npm, CDN officiel inaccessible depuis cet environnement | `withPrototypePollutionGuard` autour de chaque `XLSX.read` : toute propriété ajoutée à `Object.prototype` pendant le parsing synchrone est supprimée immédiatement | tests unitaires dédiés (pollution simulée nettoyée, y compris en cas d'erreur) |
| sprintf-js (chaîne mammoth) | MEDIUM | version imbriquée 1.0.3 | `overrides` npm → 1.1.3 dédupliquée partout | `npm ls sprintf-js --all` ; **mais l'avis couvre aussi 1.1.3 (aucune version corrigée publiée)** → voir réserves |

### Réserves formelles (risque traité, correctif indisponible ou bloquant)
1. **xlsx@0.18.5 — CVE-2023-30533 (HIGH) & CVE-2024-22363 ReDoS (HIGH)** : aucun correctif sur npm ; tarball officiel (CDN SheetJS) inaccessible depuis l'environnement d'audit. Atténuations vérifiées : garde-fou anti-pollution (ci-dessus), fichiers limités à 50 Mo et choisis explicitement par l'utilisateur, contenu jamais exécuté. Action requise hors périmètre : migrer vers la distribution officielle SheetJS ≥ 0.20.3 ou un parseur maintenu dès que le réseau le permet.
2. **pdfjs-dist@3.11.174 — CVE-2024-4367 (HIGH)** : neutralisé par configuration vérifiée dans le code (`isEvalSupported: false` dans `getDocument`, extraction de texte Node sans rendu). Mise à jour vers pdfjs ≥ 4 bloquée : elle exige Node ≥ 20 alors que le runtime livré est Electron 28 (Node 18), et le miroir Electron utilisé pour la compilation Windows (`@assistant-ai/electron-win32-x64`) n'existe qu'en 28.3.3. Action requise : monter Electron (≥ 39 recommandé, corrige aussi ses propres avis HIGH/MEDIUM listés par GHSA) puis pdfjs-dist ≥ 4.2.67, avec revalidation complète du packaging Windows.
3. **Electron 28.3.3** : nombreux avis GHSA 2026 (HIGH/MEDIUM) corrigés dans les branches 39–42. Atténuations en place : `sandbox: true`, `contextIsolation: true`, `nodeIntegration: false`, aucun contenu distant chargé, `setWindowOpenHandler` restrictif, aucune `<webview>`. Mise à jour bloquée par le miroir ci-dessus.
4. **sprintf-js ≤ 1.1.3 (MEDIUM, CVE-2026-97058)** : aucune version corrigée publiée ; code vulnérable atteignable uniquement via les CLI argparse/roarr (chaînes de format internes), pas via les documents traités. À réévaluer à chaque `npm audit`.
5. **Chaîne electron-builder (MEDIUM ×5, build uniquement)** : @electron/get/global-agent/roarr/app-builder-lib — outils de packaging, jamais livrés dans l'application installée ; le « correctif » proposé par npm (rétrograder electron-builder) n'est pas appliqué car non pertinent.

## F. Analyse du code source (manuelle, outillée par ESLint + grep ciblés)

- SQL : requêtes paramétrées partout (aucune concaténation trouvée) ; pas d'`eval`/`Function`/exécution de commandes dans le code applicatif.
- XSS : l'aperçu utilise `dangerouslySetInnerHTML` uniquement sur du HTML échappé (`escapeHtml`) avant insertion des balises `<mark>` ; l'attribut `src` des signatures est contraint aux `data:image/`.
- Chemins : noms de fichiers d'export assainis (`basename` + caractères interdits), import de modèles : extensions + magic bytes (MZ/ELF/PDF/ZIP) + 50 Mo ; journalisation avec masquage IBAN/e-mail/signatures.
- Secrets : aucun secret codé en dur, aucun `.env` versionné (vérifié par recherche sur le dépôt et les fichiers suivis).
- Corrections de code issues d'ESLint (18 erreurs → 0) : cause d'erreur préservée (`{ cause }`), `const`, échappements regex inutiles, expressions à effet de bord explicitées dans ProfilePage, directives d'exception justifiées (interop CJS pdfjs, retrait de caractères de contrôle).

## G. Tests / lint / types / build (après corrections)

typecheck OK · lint 0 erreur / 115 avertissements · tests 28/28 · build complet OK · serveur redémarré et sondé (santé, CORS, en-têtes, restauration piégée, génération déjà validée précédemment).

## H. Performances (mesuré)

`GET /api/dashboard` : ~43 ms → **~0,5–2 ms** sur le jeu de référence (3 contrats/3 clients/10 modèles), et surtout complexité découplée de la taille des rapports : compteurs, timelines et usages calculés par requêtes SQL légères (`COUNT`, colonnes minimales) au lieu de désérialiser `values_json`/`report_json` de tous les contrats. Aucune autre optimisation appliquée sans mesure justifiant un changement.

## I. Fichiers modifiés

`electron/server.ts`, `scripts/serve-api.ts`, `storage/backup/backup-service.ts`, `core/document-parser/guards.ts` (nouveau), `core/document-parser/{docx,odt,text,xlsx}-parser.ts`, `core/replacement-engine/xlsx-replacer.ts`, `storage/repositories/{contract,client,template}-repo.ts`, `electron/services/app-service.ts`, `core/document-parser/{index,pdf-parser}.ts`, `core/document-exporter/exporter.ts`, `core/ocr/ocr-engine.ts`, `src/pages/ProfilePage.tsx`, `scripts/generate-examples.ts`, `eslint.config.mjs` (nouveau), `tests/security.test.ts` (nouveau), `package.json` / `package-lock.json` (vitest 4.1.12, eslint, override sprintf-js), ce rapport.

## J. Problèmes restants et contrôles impossibles

- Objectif « zéro vulnérabilité connue » **non atteint au sens strict** : 5 avis subsistent en production (2 HIGH, 3 MEDIUM), chacun analysé, atténué et documenté ci-dessus ; leurs correctifs dépendent d'acteurs externes (SheetJS, Mozilla/pdf.js + Electron, sprintf-js).
- `npm audit` complet prend plusieurs minutes via le proxy (POST lent) ; résultats obtenus et archivés en session, à relancer en CI.
- Compilation de l'installeur Windows (`npm run dist`) non ré-exécutée pendant cet audit (téléchargements NSIS/Electron requis) ; le build applicatif complet (`npm run build`) est validé.
- Incident outillage : bug arborist de npm 10.9.8 (`edgesOut`) déclenché par les peerDependencies de Vitest 4 ; contourné par régénération du lockfile avec `--legacy-peer-deps`, arbre revérifié (`npm ls`, tests, build).
- Aucun test d'intrusion n'a été réalisé (analyses statiques + sondes HTTP ciblées uniquement).

## K. Statut final : **VALIDÉ AVEC RÉSERVES**

Tous les contrôles exécutables dans cet environnement passent (types, lint 0 erreur, 28/28 tests, build, sondes runtime) et les vulnérabilités critiques sont éliminées (3 → 0 ; total 21 → 11, production 5). Subsistent uniquement les 5 réserves formelles du §E, toutes atténuées par des mesures vérifiées, dont la résolution complète exige des mises à jour majeures externes (Electron ≥ 39, pdfjs ≥ 4.2.67, SheetJS ≥ 0.20.3) planifiées ci-dessus.

---

## Addendum — 22 octobre 2026 : correction du conflit ERESOLVE ESLint

**Erreur reproduite** : `npm install` → `ERESOLVE could not resolve @eslint/js@10.0.1 / Found: eslint@9.39.5 / peerOptional eslint@"^10.0.0" from @eslint/js@10.0.1`.

**Cause racine** : `@eslint/js@^10.0.1` avait été installé comme dépendance directe (dernière version majeure) aux côtés de `eslint@^9.39.5`, alors que `@eslint/js` 10 exige ESLint 10. La configuration (`eslint.config.mjs`, typescript-eslint 8.72.0 dont les peers acceptent ESLint `^8.57 || ^9 || ^10`) n'était pas en cause.

**Correction (sans `--force` ni `--legacy-peer-deps`)** : alignement sur la ligne maintenue cohérente — `eslint@^9.39.5` + `@eslint/js@^9.39.5` + `typescript-eslint@^8.72.0` — et régénération incrémentale du `package-lock.json` par `npm install` standard. La montée vers ESLint 10 a été écartée à ce stade : elle imposerait de revalider l'ensemble de la chaîne flat config sans bénéfice fonctionnel, la ligne 9.39 étant la version maintenue de sa branche.

**Vérifications réelles** : `npm install` OK · suppression de `node_modules` + `npm ci` OK · suppression + `npm install` OK · `npm ls eslint @eslint/js typescript-eslint` propre · `npx eslint .` 0 erreur · typecheck OK · tests 28/28 · `npm run build` OK · `npm run dist` OK → `dist/GarageFlows-Contract-Generator-Setup.exe` (106,7 Mo, contenu app.asar vérifié : main, preload, renderer, exemples).

---

## Addendum — 22 octobre 2026 (2) : binaires natifs Windows (Rollup/esbuild) et chaîne canvas

**Problème rapporté (Windows 10, poste utilisateur)** : `npm run dist` échoue à `build:renderer` — `Cannot find module @rollup/rollup-win32-x64-msvc` (bug npm #4828).

**Cause racine prouvée** : le `package-lock.json` régénéré sous Linux ne contenait plus que les variantes **Linux** des dépendances optionnelles natives (`@rollup/rollup-linux-x64-*`, `@esbuild/linux-x64`) ; toutes les variantes Windows/Darwin avaient été élaguées de l'arbre verrouillé. Sur Windows, npm ne pouvait donc pas installer le binaire MSVC correspondant à Rollup 4.x — le module est déclaré en `optionalDependencies` par Rollup mais absent des entrées du lock.

**Corrections (aucune version arbitraire, optionnels conservés)** :
1. `optionalDependencies` explicites aux versions exactes de l'arbre résolu : `@rollup/rollup-win32-x64-msvc@4.65.0` (version de Rollup résolue par Vite 6.4.5) et `@esbuild/win32-x64@0.25.12` (version d'esbuild de Vite). npm les ignore automatiquement hors Windows (os/cpu).
2. Lockfile régénéré **complet et multi-plateforme** (25 variantes `@rollup/rollup-*`, toutes les variantes `@esbuild/*` pour les deux versions présentes 0.25.12 et 0.28.2) avec npm 11 (le npm 10.9.8 de l'environnement d'audit déclenche son bug arborist `edgesOut` en régénération à froid ; le lock v3 produit est exploité sans erreur par npm 10.9.8 : `npm ci` et `npm install` vérifiés).
3. Chaîne `pdfjs-dist → canvas@2 → @mapbox/node-pre-gyp → tar@6.2.1 (CRITICAL)` éliminée : `overrides` `canvas@^3.2.3` (node-canvas 3 utilise prebuild-install, aucun avis GHSA ; canvas n'est qu'une dépendance **optionnelle** de pdfjs, inutilisée par notre extraction de texte — vérifié par les tests moteur).

**Preuve de résolution Windows** : installation simulée `npm install --os=win32 --cpu=x64` dans un répertoire vierge à partir du lock livré → `@rollup/rollup-win32-x64-msvc@4.65.0` installé avec son binaire `rollup.win32-x64-msvc.node`, ainsi que `@esbuild/win32-x64` 0.25.12 et 0.28.2.

**Revalidé après correction** : `npm ci` + `npm install` (npm système, sans flag), `npm ls vite rollup`, imports Rollup/Vite, typecheck, ESLint 0 erreur, tests 28/28, `npm run build` ×3, `npm run dist` → `GarageFlows-Contract-Generator-Setup.exe` (106,7 Mo), exports PDF/DOCX réels re-testés via l'API.

**Vulnérabilités restantes** : voir l'audit relancé après correction (récapitulatif dans le rapport de mission) — les chaînes builder (dev uniquement) et les réserves déjà documentées (xlsx, pdfjs ≤ 4.1.392 neutralisé par configuration, sprintf-js sans correctif) subsistent sans changement de statut.

---

# Addendum (3) — 2026-10-22 — Erreur ENOENT 7-Zip sous Windows : cause racine et correction

## Cause racine (prouvée)
L'erreur `ENOENT ... node_modules\7zip-bin\linux\x64\7za` ne venait **ni** d'une variable d'environnement persistante, **ni** d'electron-builder, **ni** d'une corruption de `node_modules` : elle venait du script du projet `scripts/prepare-dist.mjs`, écrit pour la compilation croisée depuis Linux, qui **imposait inconditionnellement** à electron-builder le binaire Linux (`ELECTRON_BUILDER_7ZIP_PATH=<racine>/node_modules/7zip-bin/linux/x64/7za`) ainsi que le bundle NSIS Linux (`ELECTRON_BUILDER_NSIS_DIR/_RESOURCES_DIR`), quelle que soit la plateforme d'exécution. Sous Windows, electron-builder tentait donc d'exécuter le binaire ELF Linux → `ENOENT`. Le package `7zip-bin` contenait déjà le binaire Windows correct (`win/x64/7za.exe`, PE « MZ », 1 231 360 octets, vérifié) ; le binaire Linux est un ELF (vérifié par octets magiques).

## Corrections
- `scripts/prepare-dist.mjs` réécrit **multi-plateforme, fail-fast, messages explicites en français** :
  - détection plateforme/architecture ; contrôles préalables (version Node ≥ 18, présence d'electron-builder, artefacts de build, icône) avec arrêt immédiat (code 1) en cas d'échec ;
  - **sous Windows** : aucun chemin Linux n'est injecté ; NSIS et 7zip-bin sont résolus nativement ; existence de `7za.exe` (win/x64) vérifiée avant build ; `patch-builder.cjs` (adaptation « sans Wine ») non appliqué ; toute variable héritée `ELECTRON_BUILDER_7ZIP_PATH` incompatible (plateforme différente ou chemin inexistant) est détectée et ignorée avec message ;
  - **sous Linux (compilation croisée)** : comportement historique conservé (bundle NSIS de `tools/`, `7za` Linux, patch no-Wine, override `-c.win.signAndEditExecutable=false`) ;
  - vérifications post-build conservées/renforcées (installateur présent, taille > 20 Mo, exécutable win-unpacked présent).
- Icône réelle créée : `build/icon.ico` multi-résolutions (16→256 px, PNG, 32 bpp ; générateur déterministe `scripts/generate-icon.mjs`, monogramme « GF ») + `build/icon.png` ; configurée dans `electron-builder.yml` (`win.icon`, `nsis.installerIcon/uninstallerIcon`) et utilisée comme icône de fenêtre/barre des tâches dans `electron/main.ts`.
- Avertissement `signAndEditExecutable` traité proprement : `win.signExecutable: false` (aucune signature, aucun certificat) tout en gardant l'édition des ressources active sous Windows natif ; pas de signature payante simulée.
- Git : la branche `arena/bffcc8b2-garageflows-contract-generator` n'avait aucun upstream configuré (cause directe du `git pull` « no tracking information ») : `git branch --set-upstream-to=origin/arena/bffcc8b2-garageflows-contract-generator` appliqué et vérifié (`git branch -vv`). Dépôt distant inchangé : `github.com/supremperf/GARAGEFLOWS-CONTRACT-GENERATOR`.

## Vérifications exécutées
- `npm run build` (exemples + renderer + Electron/TypeScript) : exit 0. `npm test` : 28/28.
- `npm run dist` : exit 0 → `dist/GarageFlows-Contract-Generator-Setup.exe` = **111 849 032 octets (106,7 Mo)** ; `dist/win-unpacked/GarageFlows Contract Generator.exe` présent, **PE x64 (0x8664)** vérifié ; stub NSIS de l'installateur en PE x86 (0x14c, comportement standard NSIS, compatible Windows 64 bits) ; asar contient `build/icon.png`, main, preload, renderer, exemples.
- `npm audit` (ré-exécuté) : **12 vulnérabilités (0 critique, 2 high, 10 moderate)** — identique à l'analyse précédente ; aucune correction aveugle `--force` appliquée.
- **Non testé** : exécution/installation réelle sous Windows 10 et lancement de `7za.exe` natif (bac Linux sans Wine) ; sous Windows, le nouveau script ne force plus aucun chemin et valide le binaire PE avant build — le test final reste `npm run dist` sur la machine Windows.

Statut de l'addendum : **VALIDÉ AVEC RÉSERVES** (vérification fonctionnelle native Windows non exécutable depuis ce bac).

---

# Addendum (4) — 2026-10-22 — Défilement clavier, zéro vulnérabilité npm, zéro avertissement ESLint

## 1. Défilement clavier (priorité absolue)
**Cause racine** : `body { overflow: hidden }` + zone principale `.content { overflow-y: auto }` non focalisable et aucun gestionnaire clavier : Chromium/Electron ne défilait aucune zone avec Flèches/PageUp/PageDown/Espace/Home/End lorsque le focus n'était pas dans un champ.
**Correction** (`src/scroll-utils.ts` nouveau, `src/App.tsx`, `src/styles/global.css`) : gestionnaire clavier global qui route la touche vers la zone réellement active (modale ouverte → conteneur focalisé → zone principale), amplitudes natives (56 px par flèche, 90 % d'écran pour Page/Espace), Home/End aux extrémités ; jamais d'interception dans les champs de saisie, éditeurs, listes déroulantes ni sur l'activation native (Espace/Entrée sur boutons/liens, Tab natif) ; `.content` rendue focalisable (`tabIndex=-1`, `data-scroll-region`) ; anneau `:focus-visible` pour la navigation Tab. **12 tests dédiés** (`tests/scroll.test.ts`) : correspondance des touches, bornes, routage de zones, protection de la saisie — tous verts. Validation dans Electron réel sous Windows : **NON TESTÉ** (bac Linux sans interface graphique), logique testée unitairement.

## 2. Vulnérabilités npm : 12 → 0 (prouvé par `npm audit --json` final : total 0)
- **pdfjs-dist 3.11.174 → 4.2.67** (HIGH GHSA-wgrm-67xf-hhpq, plage vulnérable ≤ 4.1.392) : build legacy ESM chargé en import dynamique, worker local résolu explicitement (`resolvePdfWorkerSrc`, chemin physique asarUnpack sous Electron), `isEvalSupported:false` conservé, API typée. Version choisie car `engines: node>=18` = compatible runtime Electron 28 (Node 18) ; les versions 4.10+/5+/6 exigent Node ≥ 20 et casseraient l'application packagée. Tests d'extraction multipage + accents verts (`tests/pdf.test.ts`).
- **xlsx (SheetJS 0.18.5, 2 HIGH sans correctif npm) : package retiré.** Remplacé par un moteur interne `core/spreadsheet/` (CSV RFC 4180, XLSX lecture/écriture OOXML via JSZip — chaînes partagées, formules, dates, ODS via content.xml), gardes zip-bomb conservées, remplacement XLSX toujours par réécriture XML dans le zip d'origine (mise en page préservée). Le package est absent de l'asar final (vérifié : 0 fichier). **Compromis assumé et signalé à l'utilisateur** : le format binaire **XLS (Excel 97-2003)** n'est plus lu ; message explicite de conversion en XLSX/ODS (aucune autre fonctionnalité supprimée : XLSX/ODS/CSV import, remplacement et export préservés et testés, `tests/spreadsheet.test.ts` 10 tests).
- **sprintf-js / argparse / mammoth** (modérée) : override `mammoth.argparse → ^2.0.1` (argparse 2 n'utilise plus sprintf-js ; seule la CLI mammoth, inutilisée, consommait argparse 1). Extraction DOCX revalidée (E2E).
- **Chaîne electron-builder** (7 modérées : @electron/get, app-builder-lib, dmg-builder, squirrel, global-agent, roarr, sprintf-js) : electron-builder déjà au plus récent (26.15.3) ; overrides `app-builder-lib.@electron/get → ^4.0.3` et `@electron/get.global-agent → ^4.1.3` (syntaxe imbriquée requise pour la dépendance optionnelle) → global-agent 4 sans roarr ni sprintf-js. NSIS/7-Zip/packaging revalidés par `npm run dist` complet. Aucun `audit fix --force`, aucun downgrade.
- `engines` ajouté : Node `>=20 <23`, npm `>=10` (décision documentée : chaîne validée sous Node 22 LTS ; Node 24/npm 12 de `npm doctor` non adoptés — génériques, sans bénéfice, et pdfjs 4.2/Electron 28 ciblent Node 18–22).

## 3. ESLint : 115 → 0 erreur, 0 avertissement (sans désactiver de règle)
104 `no-explicit-any` éliminés par typage réel : DTO complets dans `src/api.ts` (Client/Template/Profile/Subscription/Dashboard/Preview/Export/Settings… miroirs des réponses serveur), états React typés dans les 7 pages et App, `electron/electron-shim.d.ts` réécrit avec les contrats Electron réellement utilisés, champs AcroForm via `PDFTextField` (pdf-lib), erreurs typées `Error & {code, existingPath}`. 11 `no-unused-vars` : imports morts retirés et 4 fonctions PDF réellement mortes supprimées (`escapePdfLiteralString`, `encodeWinAnsiHex`, `purgeAndReplaceInContentStream`, `decodePdfContentToken` — aucune référence externe, vérifié par recherche globale).

## 4. Vérifications exécutées
- `npm run typecheck` (renderer + electron) : 0 erreur. `npm run lint` : 0/0. `npm test` : **53/53** (6 fichiers : moteur, sécurité, stockage, défilement, tableur, PDF).
- E2E réel via l'API locale (données isolées `/tmp/gf-e2e2`) : santé, import 10 modèles, profil, client, validation légale bloquant un export incomplet (téléphone manquant), exports **PDF + DOCX + XLSX** générés et relus (variables remplacées, `99,99 €`, formule et clause fixe préservées, aucun `{{}}` résiduel), tableau de bord cohérent, **persistance après redémarrage complet du serveur** (3 contrats, 2 clients, 10 modèles).
- `npm run dist` : exit 0 → `dist/GarageFlows-Contract-Generator-Setup.exe` = **110 810 488 octets (105,7 Mo)**, exécutable PE x64 vérifié, asar contrôlé (moteur tableur présent, package xlsx absent).
- **NON TESTÉS** : installation/lancement sous Windows 10 réel et défilement clavier dans Electron packagé (aucun environnement graphique Windows dans ce bac) ; OCR sur document scanné réel (moteur inchangé, déjà validé précédemment).

Statut de l'addendum : **VALIDÉ AVEC RÉSERVES** (deux points Windows natifs non exécutables ici, explicitement listés).
