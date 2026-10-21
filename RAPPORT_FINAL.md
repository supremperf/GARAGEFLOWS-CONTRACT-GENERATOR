# Rapport de livraison — GarageFlows Contract Generator

Date des vérifications : 21 octobre 2026.

## 1. Architecture

Application locale en trois couches :

- Interface React / TypeScript (Vite), thème sombre, navigation réelle.
- Moteur documentaire dans `core/` : analyse, détection, remplacement, conversion, contrôle de fidélité, validation.
- Persistance SQLite locale (`sql.js`) et fichiers dans le dossier utilisateur.
- Electron 28.3.3 : `contextIsolation`, `nodeIntegration` désactivé, preload par `contextBridge`, sandbox activé.
- API locale Express, utilisée par l’interface et par Electron. Aucun service cloud n’est appelé pendant l’usage.

## 2. Fonctionnalités développées

- Import de modèles, copie de travail, original jamais modifié.
- Détection `{{VARIABLE}}`, `{NOM}`, `[NOM]`, `XXX` distincts, libellés « À compléter ».
- Éditeur de correspondances, champs obligatoires, validation des ambigus.
- Fiches clients, profil GarageFlows, abonnement préconfiguré à 99,99 € TTC.
- Calcul HT en centimes : 99,99 € TTC à 20 % = 83,33 € HT et 16,66 € de TVA.
- Assistant de génération en 6 étapes, aperçu paginé, export multi-format.
- Historique, sauvegarde ZIP, restauration, journaux sans IBAN ni signature.
- Contrôle de fidélité et blocage d’un export incomplet.

## 3. Bibliothèques

pdf-lib, pdfjs-dist 3.11.174, jszip, xlsx (SheetJS), mammoth présent pour lecture complémentaire, tesseract.js 5 avec `fra.traineddata`, sql.js, express, React 18, Electron 28.3.3, electron-builder 26.15.3, NSIS 3.12.

## 4. Formats réellement vérifiés

Vérifiés par exécution, pas seulement par présence de code :

- DOCX : remplacement natif, 5 occurrences de `{{CLIENT_NOM}}` remplacées, original intact, score de fidélité 100 sur le modèle d’exemple.
- PDF texte : anciens opérateurs supprimés du flux, `{{CLIENT_NOM}}` absent du fichier généré, nouvelles valeurs présentes.
- TXT ancien modèle : chaque `XXX` reçoit une valeur différente (`Jean DUPONT`, `15/04/1995`, adresse, `99,99`).
- XLSX : valeurs remplacées, formule `=B5` conservée, clause fixe conservée.
- ODT, RTF et HTML : remplacement vérifié par analyse du fichier produit.
- PNG annoté : détection OCR structurelle des `XXX`.
- Export DOCX vers PDF : parcours API complet, score 100, fichier non vide.

## 5. Formats partiels

- PDF scanné et images : Tesseract français est embarqué et s’exécute localement. Sur une image sans glyphes, il renvoie un texte vide, ce qui est attendu. La qualité sur une photo réelle de contrat n’a pas pu être mesurée ici. L’interface signale la limite et reconstruit un PDF vectoriel.
- DOC binaire Word 97-2003 : extraction de texte, pas de conservation intégrale des styles.
- PPTX : texte des diapositives, pas une conservation complète des animations.
- XLS et ODS : données et formules, export principal en XLSX / PDF / CSV.

## 6. Limitations

- L’icône de l’exécutable Windows reste l’icône Electron par défaut : l’édition de ressources exige un outil qui n’a pas pu être téléchargé de façon fiable dans cet environnement. L’identité visuelle est dans l’interface.
- Une signature dessinée n’est pas une signature électronique qualifiée.
- Le logiciel ne garantit pas la conformité juridique.
- Aucune clause n’est inventée. Une condition commerciale vide reste vide.
- L’installateur n’a pas été exécuté sur Windows 10 ou 11 dans cet environnement Linux. Son format PE/NSIS a été vérifié, pas son installation réelle.

## 7. Tests exécutés

`npx vitest run` : 9 tests, 9 réussites.

- Détection XXX distincts et regroupement `{{CLIENT_NOM}}`.
- Calcul monétaire 99,99 / 83,33 / 16,66.
- IBAN valide et invalide, SIRET.
- DOCX : remplacement, clause conservée, original intact.
- PDF : variable plus récupérable dans le fichier.
- TXT XXX et XLSX avec formule.
- Refus d’export incomplet et refus d’écrasement silencieux.
- Blocage d’un exécutable MZ déguisé et d’un PDF sans en-tête.
- Persistance client, profil, abonnement et modèle après réouverture de la base.
- Sauvegarde et restauration.

Parcours API réel : import DOCX, création client DUPONT, prévisualisation, export PDF `Contrat_GarageFlows_DUPONT_Jean_2026-10-21.pdf`, score 100, tableau de bord à 1/1/1, puis nettoyage.

## 8. Résultat de `npm run dist`

Réussi.

Fichier :

`dist/GarageFlows-Contract-Generator-Setup.exe`

Taille vérifiée : 111 830 627 octets. En-tête `MZ`. Marqueur Nullsoft présent. Le dossier `dist/win-unpacked` contient l’exécutable Electron, les exemples et `resources/tessdata/fra.traineddata`.

## 9. Installation

1. Copier `dist/GarageFlows-Contract-Generator-Setup.exe` sur un PC Windows 10 ou 11.
2. Lancer l’assistant, choisir le dossier, terminer.
3. Ouvrir GarageFlows Contract Generator. Node.js n’est pas requis.
4. Les données sont dans `%APPDATA%\GarageFlowsContractGenerator\`.

Compilation développeur : `npm install` puis `npm run dist`. Le script télécharge le bundle NSIS s’il n’est pas déjà dans `tools/`.

## 10. Ce qui n’est pas terminé

- Installation et lancement réels sur Windows non exécutés ici.
- Reconnaissance OCR d’une photo de contrat non mesurée, moteur toutefois embarqué.
- Icône Windows personnalisée non appliquée.
