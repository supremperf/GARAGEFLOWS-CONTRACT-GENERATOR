# Intégration du logo officiel — GarageFlows Contract Generator

> Rapport de la première intégration (1.0.0). Le Setup a depuis été reconstruit en **1.0.1** avec les corrections clavier et interface. Voir [RAPPORT_CLAVIER_INTERFACE.md](RAPPORT_CLAVIER_INTERFACE.md) pour le livrable actuel, son empreinte et les derniers tests. Les tailles/empreintes ci-dessous restent celles de la première livraison.

Vérifications réalisées le **22 octobre 2026**, sous Linux x64, Node.js 22.22.3.

## 1. Résumé et limites de validation

Le fichier fourni est désormais la seule source de l’identité visuelle **active et distribuée**. Il n’a pas été redessiné. Le monogramme GF de la barre latérale, les anciens fichiers d’icône et l’icône Electron de l’exécutable ont été remplacés.

Le build de production et `npm run dist` réussissent. L’exécutable applicatif et le Setup contiennent effectivement les sept résolutions de l’icône officielle : les ressources PE ont été relues et comparées, et le contenu du Setup a été extrait pour vérifier ses fichiers.

**La validation native Windows reste à faire.** Cet environnement n’exécute ni Windows ni l’installateur. La présence des ressources dans les binaires n’est pas présentée comme une observation de la barre des tâches, de l’Explorateur ou de raccourcis installés.

**La suite globale de tests reste en erreur**, malgré ses 58 assertions réussies : une exception OCR préexistante n’est pas interceptée lors du test d’un PDF corrompu. Elle a été reproduite à partir du code initial extrait de Git, sans les modifications d’intégration.

## 2. Architecture analysée avant modification

- Interface : React 18, TypeScript, Vite 6, CSS global sombre, pictogrammes fonctionnels lucide-react.
- Application de bureau : Electron 28.3.3 ; `electron/main.ts`, preload isolé, sandbox et `contextIsolation` conservés ; déclarations locales dans `electron/electron-shim.d.ts`.
- Serveur local : Node.js / Express / CORS, `electron/server.ts`, services applicatifs dans `electron/services/`.
- Moteur documentaire : `core/`, analyse/remplacement/export, pdf-lib, pdfjs-dist, mammoth, JSZip, Tesseract local et traitements XML/tableurs.
- Persistance : SQLite via sql.js, fichiers locaux et sauvegardes dans `storage/` ; données utilisateur hors du répertoire d’installation.
- Qualité : TypeScript, ESLint, Vitest.
- Packaging : `electron-builder.yml`, electron-builder 26.15.3, runtime Windows x64 fourni par npm, NSIS 3.12 ; `scripts/prepare-dist.mjs` et `scripts/patch-builder.cjs` pour la compilation croisée.
- Production : `dist-renderer/`, `dist-electron/`, `app.asar`, ressources externes, puis installateur dans `dist/`.

### Inventaire de marque initial

- `src/App.tsx` : carré GF et nom typographique dans la barre latérale commune aux sept rubriques.
- `src/styles/global.css` : ancien style `.mark` et styles du nom de marque.
- `scripts/generate-icon.mjs` : dessin synthétique du monogramme GF.
- `build/icon.ico`, `build/icon.png` : anciennes icônes génériques.
- `electron/main.ts` : icône de fenêtre ; chemin à l’ancienne ressource.
- `electron-builder.yml` : icônes de l’application et de NSIS ; inclusion de l’ancien PNG.
- `index.html` : pas de favicon ni d’identité dans le conteneur initial vide.
- Pas de splash natif dédié, d’écran de connexion, ni de logo propre à une modale ou à une page secondaire.
- La barre supérieure représente le profil utilisateur ; son avatar et les icônes métier ne sont pas des logos du logiciel.

## 3. Source et formats

Source conservée : `resources/branding/logo-official.png`, **1254 × 1254**, fichier fourni copié à l’identique.

SHA-256 de la source :

```text
8ec4b44173f32407a4adb7a6de2df1b4e99699a68f0c93fbb35307b8b920cd21
```

Déclinaisons dans `public/branding/` :

| Fichier | Dimensions / usage |
|---|---|
| `logo-full.png` | 1254 × 1254, copie identique de la source haute résolution |
| `logo-lockup.png` | 1130 × 775, recadrage du logo complet sans les grandes marges |
| `wordmark.png` | 1130 × 175, recadrage du lettrage original et de sa signature |
| `icon.png` | 512 × 512, emblème cerveau/document pour affichage haute densité |
| `icon-16.png` | 16 × 16 |
| `icon-24.png` | 24 × 24, taille complémentaire pour Windows |
| `icon-32.png` | 32 × 32 |
| `icon-48.png` | 48 × 48 |
| `icon-64.png` | 64 × 64 |
| `icon-128.png` | 128 × 128 |
| `icon-256.png` | 256 × 256 |
| `icon.ico` | Sept images PNG embarquées : 16, 24, 32, 48, 64, 128, 256 |

Le recadrage carré de l’emblème est pris directement dans les pixels d’origine `(270, 150, 670, 670)`. Les réductions utilisent Lanczos3. Aucun étirement, changement de teinte, ajout de symbole ou texte redessiné.

**Fond conservé volontairement** : la source n’est pas transparente et possède un halo lumineux sur un fond sombre dégradé. Une suppression automatique du fond aurait détérioré ce halo. Aucune variante à transparence artificielle ni fond blanc n’a été introduit. À 16 px, le texte du logo complet serait illisible : seul l’emblème original est utilisé.

## 4. Intégration dans l’interface

- **Démarrage Electron** : fenêtre splash dédiée, avant le démarrage du serveur ; logo complet et message de démarrage. Elle est fermée quand la fenêtre principale est prête à être affichée.
- **Chargement initial du renderer** : logo et message dans `index.html`, visibles avant le montage de React ; pas de délai artificiel.
- **Barre latérale / navigation principale** : composant partagé `Brand`, emblème et lettrage issus du fichier officiel. L’identité est donc présente dans Dashboard, Générer un contrat, Mes modèles, Clients, Mes informations, Historique et Paramètres.
- **Responsive** : conservation de l’emblème seul dans la navigation compacte.
- **Paramètres** : bloc « À propos du logiciel » avec le logo complet et l’identité du produit.
- **Navigateur / onglet** : favicon ICO et PNG 32 px.
- **Fenêtres Electron** : icône commune à la fenêtre principale, au splash et aux fenêtres internes autorisées par le gestionnaire d’ouverture.

Pas d’ajout répétitif de logo aux formulaires, aux modales métier, au tableau de bord ou au pied de page déjà textuel. L’avatar utilisateur en barre supérieure, les pictogrammes de navigation et l’illustration de contrat ne sont pas des anciennes marques et sont conservés.

Captures actualisées :

- `captures/branding-dashboard.png`
- `captures/branding-settings.png`
- `captures/branding-splash.png`

Les captures numérotées et rapports antérieurs restent des **archives documentaires** : certaines montrent encore l’ancienne interface. Ils ne sont ni utilisés par l’application ni inclus dans le package. Ils ne sont pas réécrits artificiellement ni supprimés pour effacer l’historique.

## 5. Windows, Electron et NSIS

- AppUserModelID conservé et explicitement appliqué : `com.garageflows.contractgenerator`.
- `BrowserWindow.icon` : ICO sous Windows, PNG ailleurs.
- En développement : résolution depuis le chemin du main compilé vers `public/branding/`.
- En production : résolution depuis `process.resourcesPath/branding/` ; aucun chemin de machine de développement codé en dur.
- `win.icon`, `nsis.installerIcon`, `nsis.uninstallerIcon`, `nsis.installerHeaderIcon` : `public/branding/icon.ico`.
- Ressources incluses dans le renderer via Vite **et** dans `extraResources/branding`, hors ASAR, pour le splash et les fenêtres natives.
- Raccourcis Bureau et menu Démarrer maintenus activés, avec le nom existant. Les modèles NSIS d’electron-builder utilisent l’exécutable de l’application comme source d’icône et appliquent l’APP_ID aux raccourcis.
- Le modèle NSIS utilise `uninstallerIcon.ico` pour `DisplayIcon` dans la liste des applications installées lorsque `uninstallerIcon` est fourni. Configuration inspectée ; registre réel non observé ici.

### Correction de la compilation croisée

Auparavant, `prepare-dist.mjs` désactivait l’édition des ressources PE sous Linux pour éviter Wine, laissant l’icône Electron dans l’exécutable.

Le hook **`scripts/after-pack.cjs`** remplace maintenant tous les groupes d’icônes et images d’icônes PE de l’application par les entrées officielles, renseigne les métadonnées GarageFlows, puis relit l’exécutable pour vérifier les images. Il s’exécute avant la compression NSIS. Le programme de démonstration Electron `resources/default_app.asar`, inutile quand `app.asar` est présent, est retiré du package ; les bibliothèques et mentions de licence Electron/Chromium restent présentes.

Sous Windows, l’édition native d’electron-builder est conservée. Sous Linux, le hook JavaScript fournit l’édition sans Wine. Le message d’electron-builder indiquant que sa propre édition native est désactivée ne signifie donc plus que l’icône est absente ; les contrôles binaires indépendants le vérifient.

**Authenticode** : pas de certificat fourni, exécutable et Setup non signés, comme auparavant. L’intégration d’une icône ne constitue pas une signature de code ; un avertissement SmartScreen reste possible.

## 6. Fichiers modifiés, créés et retirés

### Fichiers existants modifiés

1. `README.md` — documentation de la génération et de la vérification.
2. `electron-builder.yml` — ressources, hook, chemins des icônes Windows/NSIS.
3. `electron/electron-shim.d.ts` — contrats TypeScript des API Electron désormais utilisées.
4. `electron/main.ts` — chemins installés, AppUserModelID, splash, affichage et icônes des fenêtres.
5. `index.html` — favicon et chargement initial de marque.
6. `package.json` — scripts de marque/vérification et dépendances de développement.
7. `package-lock.json` — verrouillage des dépendances ajoutées.
8. `scripts/generate-icon.mjs` — remplacement du dessin GF par des dérivés du fichier fourni.
9. `scripts/prepare-dist.mjs` — absence d’icône bloquante et vérification réelle de distribution en fin de commande.
10. `src/App.tsx` — remplacement de l’ancienne marque par le composant partagé.
11. `src/pages/SettingsPage.tsx` — bloc À propos.
12. `src/styles/global.css` — styles de marque proportionnels et responsive ; retrait de l’ancien carré générique.

### Fichiers créés

- `RAPPORT_INTEGRATION_LOGO.md` — ce rapport.
- `resources/branding/logo-official.png` — original officiel.
- Les douze images de `public/branding/` listées dans le tableau des formats.
- `public/branding/loading.css`, `public/branding/splash.html`.
- `src/Brand.tsx`.
- `scripts/after-pack.cjs`.
- `scripts/verify-branding.mjs`.
- `tests/branding.test.ts`.
- Les trois captures `captures/branding-*.png` listées plus haut.

### Retraits justifiés

- `build/icon.ico`, `build/icon.png` : anciennes ressources GF devenues obsolètes, remplacées par les fichiers officiels de `public/branding/`.
- Dans le package généré seulement : `resources/default_app.asar`, application de démonstration Electron non utilisée.

Dépendances de développement ajoutées : **sharp** (recadrage/redimensionnement), **resedit** (édition et lecture des ressources PE), **@electron/asar** (inspection explicite des ressources packagées). Aucune dépendance métier existante supprimée. Les outils Chromium/Playwright de vérification ont été installés séparément dans `tools/ui-check/`, ignoré par Git, sans être ajoutés aux dépendances du logiciel.

Les exemples réécrits par le script de build ont été restaurés dans l’arbre Git pour éviter des modifications documentaires parasites. Le moteur `core/`, le serveur métier, le stockage, les clés, les configurations et les données utilisateur n’ont pas été modifiés par cette intégration. Les essais de navigateur utilisent un stockage de test isolé.

## 7. Vérifications réellement exécutées

| Contrôle | Résultat réel |
|---|---|
| Installation des dépendances npm | Réussie ; audit npm : aucune vulnérabilité signalée |
| `npm run typecheck` | Réussi, renderer et Electron |
| `npm run lint` | Réussi, aucune erreur ni avertissement au dernier passage |
| `npx vitest run tests/branding.test.ts` | Réussi : 5 tests |
| `npm test` | **Code 1** : 58 assertions réussies dans 7 fichiers, mais 1 exception OCR non interceptée |
| Reproduction PDF/OCR sur code initial extrait de Git | Même exception, code 1 ; défaut préexistant confirmé |
| `npm run build` | Réussi : ressources, exemples, Vite, TypeScript Electron ; aucun avertissement Vite au dernier build |
| `npm run dist` final | Réussi, code 0, Windows x64/NSIS, vérification de distribution incluse |
| ICO | Sept entrées analysées ; dimensions et octets comparés aux PNG correspondants |
| Source officielle | SHA-256 vérifié ; copie complète identique à l’original |
| Images PE de l’application | Un groupe officiel, sept tailles ; aucune ancienne image d’icône PE dans ce groupe |
| Images PE du Setup | Un groupe officiel, sept tailles ; comparaison binaire avec l’ICO |
| ASAR et extraResources | Les 14 fichiers de marque comparés octet par octet aux ressources sources |
| Contenu réel du Setup | Extraction par 7-Zip puis SHA-256 : exécutable, ASAR et toutes les ressources de marque identiques à `win-unpacked` |
| Interface en Chromium | Dashboard + six autres rubriques, images chargées, proportions contrôlées, aucune erreur JavaScript ni HTTP sur le parcours final |
| Responsive | Emblème visible, lettrage compact masqué à 900 et 600 px |
| Splash | Page testée en HTTP et en fichier local ; image chargée et proportionnelle |
| Chargement avant React | Page testée avec JavaScript désactivé : image et message de chargement visibles |
| `git diff --check` | Réussi |
| Installation et intégration shell Windows | **Non exécutées** : nécessite un poste Windows |

### Erreur restante, non masquée

`tests/pdf.test.ts`, cas « signale un PDF corrompu sans planter » : Tesseract tente de reconnaître un PDF tronqué alors que son lecteur d’images ne lit pas les PDF (`Pdf reading is not supported`, puis `Error attempting to read image` dans `tesseract.js/src/createWorker.js:247`).

Le même défaut apparaît sur le code initial avec les mêmes dépendances. Il n’est pas corrigé ici afin de respecter la consigne de ne pas modifier les fonctionnalités métier. **La suite globale n’est donc pas déclarée verte.**

Les messages de packaging sur les références de dépendances dupliquées n’ont pas empêché le build. L’avertissement 7-Zip « data after the end of archive » correspond aux données NSIS entourant l’archive embarquée ; les fichiers extraits ont tout de même été vérifiés par empreinte.

## 8. Livrable final

Chemin exact du Setup généré :

```text
/home/user/GARAGEFLOWS-CONTRACT-GENERATOR/dist/GarageFlows-Contract-Generator-Setup.exe
```

Chemin relatif : `dist/GarageFlows-Contract-Generator-Setup.exe`.

Taille : **117 958 128 octets**, soit environ **112,5 Mio**.

SHA-256 :

```text
dd0dc0c1ae103174e954fe50269de398d69f5c147bf206174c0dfb29fc85d8d8
```

Exécutable décompressé : `dist/win-unpacked/GarageFlows Contract Generator.exe`.

Les binaires restent dans `dist/`, ignoré par Git suivant les conventions du dépôt. Ils ont été produits dans cet environnement ; leur conservation ne repose pas sur un commit de fichiers générés.

## 9. Recette Windows à effectuer avant validation définitive

1. Copier le Setup sur un poste Windows x64 et vérifier son empreinte.
2. Installer dans un dossier choisi, ouvrir depuis le Bureau puis depuis le menu Démarrer.
3. Constater le splash, l’icône de la fenêtre et de la barre des tâches, et le regroupement sous l’identité GarageFlows.
4. Vérifier les propriétés des deux raccourcis et leur source d’icône, puis l’icône de l’exécutable dans l’Explorateur.
5. Vérifier l’identité dans « Applications installées » et dans l’assistant de désinstallation.
6. Contrôler un import/export de contrat avec des données de test, fermer puis relancer depuis l’installation.
7. Désinstaller et confirmer que les données utilisateur existantes sont conservées.

Ces étapes ne sont **pas cochées** dans ce rapport : elles ne peuvent pas être remplacées par la lecture des fichiers de configuration ni par les contrôles binaires réalisés ici.
