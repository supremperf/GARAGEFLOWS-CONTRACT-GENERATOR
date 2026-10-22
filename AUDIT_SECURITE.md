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
