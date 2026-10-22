# Correctifs clavier et interface — version 1.0.1

Date : 22 octobre 2026. Environnement de validation : Linux x64, Node.js 22.22.3, Chromium headless 153. L’installation native Windows n’est pas exécutée dans cet environnement.

## Problèmes constatés et reproduits

1. Les fonctions de `src/scroll-utils.ts` étaient présentes et testées unitairement, mais **aucun gestionnaire de l’application ne les appelait**.
2. La combinaison grille/flex, hauteur du contenu et `body { overflow: hidden }` permettait au contenu de grandir hors de la fenêtre au lieu de créer une véritable zone défilante. Sur l’ancienne version à 1100 × 720, la page Paramètres annonçait une amplitude de défilement de **0 px** ; PageDown ne changeait rien et le focus restait sur le bouton du menu.
3. Le focus n’allait pas dans le contenu après navigation ; les importations via des labels avec champ caché n’étaient pas accessibles comme de vrais boutons au clavier.
4. Les groupes `.row` et `.spread` ne revenaient pas à la ligne ; plusieurs grilles conservaient des minima intrinsèques trop larges. L’historique utilisait une cellule `td` comme conteneur flex, au détriment du tableau.
5. Les menus de tableau étaient positionnés dans les cellules, ce qui empêchait de rendre correctement le tableau défilant sans couper ses menus.
6. Le zoom de l’aperçu utilisait une transformation qui ne réservait pas sa hauteur dans la mise en page.

Dernier contrôle sur le serveur de production, sans fixtures de stress, à **1100 × 720** : contenu limité au bord inférieur **720 px**, focus `content`, amplitude **516 px**, puis **PageDown : 0 → 516 px**. Ce contrôle reproduit le geste qui échouait dans la version précédente.

## Corrections livrées

### Défilement sans souris

- Gestionnaire réel dans `src/keyboard-scroll.ts`, monté et démonté proprement par React.
- Flèches ↑/↓ : déplacement progressif ; PageUp/PageDown et Espace/Maj+Espace : déplacement d’environ une hauteur de vue ; Home/End : début/fin de la zone ciblée.
- Aucune interception des champs de saisie, sélecteurs, éditeurs, combinaisons Ctrl/Alt/Meta, événements déjà traités ou de la composition de texte.
- Espace reste une activation native sur un bouton ou un lien.
- Focus dans le contenu après chaque navigation, y compris après un clic sur la rubrique déjà active ; région focalisable avec Tab et lien « Aller au contenu ».
- Les tableaux, le journal et l’aperçu sont accessibles au clavier. Le panneau intérieur défile avant la page si nécessaire.
- Grille et flexbox contraints par `min-height: 0` ; le contenu occupe l’espace restant de la fenêtre et possède une vraie barre de défilement.

### Boutons et affichage

- Rangées d’actions et en-têtes autorisés à revenir à la ligne, avec espacement régulier.
- Boutons normalisés : texte de 13 px, hauteur minimale 38 px, texte long repliable, pictogrammes non écrasés et états désactivés cohérents.
- Largeurs de grilles et champs maîtrisées ; les tableaux larges défilent dans leur propre région au lieu de déborder sur les cartes ou la fenêtre.
- Barre supérieure adaptable ; navigation compacte défilante horizontalement indépendamment du logo, qui reste visible.
- Avatar à texte long tronqué sans élargir le bouton.
- Modales natives partagées (`dialog`) avec arrière-plan inerte, focus intérieur, boucle Tab/Maj+Tab, fermeture Échap et restitution du focus au déclencheur.
- Menus et résultats de recherche dans un portail, placés à l’intérieur de la fenêtre ; fermeture extérieure/Échap et restitution du focus. Ils ne sont plus coupés par un tableau.
- Recherche : Ctrl+K / Meta+K ; flèche bas pour entrer dans les résultats ; Échap pour fermer sans réouverture involontaire.
- Sélecteurs de fichier remplacés par des boutons réels, activables avec Entrée ou Espace.
- Aperçu zoomé dans une zone dédiée : le zoom réserve la place du document et ne recouvre plus la barre d’actions ou les boutons suivants.
- Animations respectant la préférence de réduction du mouvement ; suppression de la translation initiale qui déplaçait temporairement le contenu sous le bord de la fenêtre.

Aucun bouton flottant de défilement ajouté. Aucune donnée utilisateur supprimée. Le moteur de génération, l’API métier et la persistance ne sont pas modifiés par ces correctifs.

## Vérifications exécutées

| Contrôle | Résultat |
|---|---|
| `npm run typecheck` | Réussi, interface et Electron |
| `npm run lint` | Réussi, aucune erreur ni avertissement au dernier passage |
| `git diff --check` | Réussi |
| `npm run test:ui` avec Chromium configuré pour ce sandbox | **15 scénarios réussis**, dernier passage intégral sur la version 1.0.1 |
| Matrice de mise en page | Sept rubriques × sept dimensions : 1440×900, 1100×720, 900×650, 600×720, 375×667, 320×568, 1100×480 |
| Boutons | Vérification géométrique des textes non coupés, des actions non superposées et des boutons contenus dans les cartes ; contrôle avant et après End |
| Défilement | Toutes les touches décrites ci-dessus, après navigation et sans focus préalable par clic dans le contenu |
| Modales | Défilement isolé, fond immobile, Tab/Maj+Tab, Échap, restitution du focus |
| Saisie/import | Curseur et texte préservés ; déclenchement réel de l’événement de sélecteur de fichiers avec Entrée/Espace |
| Panneaux imbriqués | Journal et aperçu défilants sans déplacer la page derrière |
| Recherche et menus | Résultats au clavier ; menus dans les limites de la fenêtre aux sept dimensions |
| Parcours du générateur | Sélection d’un vrai modèle importé par l’API, aperçu réel, zoom jusqu’à 140 %, accès à l’export |
| `npm test` | **Code 1** : 58 assertions réussies, mais exception OCR préexistante non interceptée sur un PDF corrompu |
| `npm run dist` | Réussi, code 0 ; build renderer/Electron et Setup NSIS x64 produits |
| Contrôle de distribution | Ressources PE officielles, version 1.0.1, assets compilés du renderer dans ASAR, logos et contenu extrait du Setup contrôlés |

Les tests UI sont dans `e2e/keyboard-layout.spec.ts`. Ils utilisent un profil temporaire propre à chaque serveur de test. Import de modèle, création de fiches et aperçu passent par la véritable API locale. L’historique, les contrats récents du Dashboard et le journal utilisent des **fixtures de stress en lecture seule**, explicitement déclarées dans les tests, afin de contrôler les textes longs et les grands volumes sans toucher à des données utilisateur.

Les premiers passages des tests UI ont révélé des défauts de focus, de placement initial et de fermeture des résultats ; ils ont été corrigés, puis les 15 scénarios ont été rejoués intégralement avec succès. Les tests de placement ne prétendent pas couvrir tous les contenus possibles ni remplacer la recette sur l’appareil de l’utilisateur.

### Limites restantes

- Exception OCR déjà documentée dans `RAPPORT_INTEGRATION_LOGO.md`, reproduite sur le code initial : `Error attempting to read image` dans Tesseract lors du test de PDF tronqué. La suite globale n’est **pas** présentée comme verte. Pas de masquage du défaut et pas de modification du moteur documentaire dans ce correctif d’interface.
- Electron/Windows et l’installateur ne sont pas exécutés ici. La validation au clavier a lieu dans Chromium ; les icônes et la version des binaires Windows ont été relues, mais l’affichage dans le shell Windows reste à constater sur un poste Windows.
- Setup non signé Authenticode, comme auparavant.

## Rejouer les tests UI

```bash
npm ci
npx playwright install chromium
npm run test:ui
```

Sur Linux, l’installation des bibliothèques système du navigateur peut nécessiter `npx playwright install --with-deps chromium`.

Le test construit le renderer, démarre automatiquement un serveur sur le port **5180**, crée un profil de test temporaire puis ferme le serveur. Les rapports/traces sont ignorés par Git. Pour un navigateur déjà installé, définir `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` ; `PLAYWRIGHT_CHROMIUM_ARGS` accepte une liste JSON de paramètres. Dans ce sandbox, Chromium et ses bibliothèques ont été fournis par l’outillage isolé `tools/ui-check/` et ces variables, sans ajout de binaire navigateur à l’application.

## Fichiers du correctif clavier/interface

- `src/keyboard-scroll.ts`, `src/scroll-utils.ts`, `src/App.tsx` : gestion clavier, focus et navigation.
- `src/styles/global.css` : dimensions, défilement, boutons, cartes, menus, responsive et aperçu.
- `src/Modal.tsx`, `src/FloatingPanel.tsx`, `src/FilePicker.tsx` : composants partagés de modale, panneau et import.
- `src/pages/DashboardPage.tsx`, `GeneratorPage.tsx`, `HistoryPage.tsx`, `ProfilePage.tsx`, `SettingsPage.tsx`, `TemplatesPage.tsx` : utilisation des composants et régions accessibles.
- `src/version.ts`, `package.json`, `package-lock.json` : version 1.0.1 cohérente avec le Setup et ajout de Playwright comme dépendance de développement.
- `playwright.config.ts`, `e2e/keyboard-layout.spec.ts`, `scripts/serve-ui-tests.ts`, `vitest.config.ts` : tests UI reproductibles et séparation des suites navigateur/unitaires.
- `scripts/verify-branding.mjs` : contrôle supplémentaire des assets compilés et de la version dans les ressources PE/ASAR.
- `.gitignore`, `README.md`, `RAPPORT_CLAVIER_INTERFACE.md` : sorties ignorées et documentation.
- `captures/clavier-parametres-bas.png`, `clavier-mobile-boutons.png`, `clavier-modale.png` : captures des derniers tests réussis, avec données de test.

Les travaux de logo de la demande précédente sont également inclus dans cette livraison ; leur inventaire est dans `RAPPORT_INTEGRATION_LOGO.md`.

## Nouveau Setup — version 1.0.1

```text
/home/user/GARAGEFLOWS-CONTRACT-GENERATOR/dist/GarageFlows-Contract-Generator-Setup.exe
```

Taille : **117 960 301 octets**, environ **112,5 Mio**.

SHA-256 :

```text
ee3360f85479d0bf26f2a1c83ff3835037fa3c2740909b5206b9985733822cc0
```

Le Setup précédent a été remplacé par ce nouveau build ; les empreintes du rapport de première intégration sont donc historiques. La version **1.0.1** est affichée dans la barre latérale et les paramètres et vérifiée dans les métadonnées du package. Pour profiter des corrections sur un poste déjà installé, utiliser ce nouveau Setup : pousser le code sur GitHub ne met pas à jour une installation locale automatiquement.

Les exécutables restent dans `dist/`, ignoré par Git suivant la convention du dépôt. Le code, les ressources, les tests et les rapports sont destinés à être poussés sur la branche de cette session ; la branche principale n’est pas modifiée sans fusion de la pull request.
