# Audit et réparation fonctionnelle — Nouvelle fiche client

**22 octobre 2026 — dépôt GARAGEFLOWS-CONTRACT-GENERATOR, version 1.0.1.**

## A. Cause du blocage : constat vérifié et limites

**Le logiciel concerné est bien GarageFlows Contract Generator**, comme confirmé par l’utilisateur après correction du nom indiqué dans la demande initiale. Le dépôt est donc le bon. Le blocage général des clics n’a pas été reproduit dans l’environnement local. « Nouvelle fiche client » est ici un panneau de la page Clients, pas une fenêtre Electron indépendante ni une modale.

Avant modification, les contrôles présents ont reçu les clics et le focus. Une seconde reproduction avec les **sources originales sauvegardées**, compilées séparément sans remplacer les fichiers de travail, confirme **81 clics réussis : 27 contrôles × 3 largeurs (1440, 900 et 375 px)**. Voir [preuve de l’audit original](captures/client-form-audit-original.json).

Aucune couche transparente interceptant globalement les champs, aucun `pointer-events: none`, aucune zone de déplacement Electron `app-region: drag`, aucun `readOnly` ou `disabled` permanent n’a été trouvé sur ce formulaire. Le toast est déjà non interceptant (`pointer-events: none`). Les dialogues natifs et panneaux flottants existent ailleurs mais ne sont pas les parents du formulaire Clients. Le gestionnaire clavier global respecte déjà les inputs, select et textarea.

**Il serait donc inexact d’annoncer « un overlay bloquait les clics, il est supprimé ». Aucun z-index arbitraire ou correctif CSS à l’aveugle n’a été ajouté.** Le blocage dans le binaire Contract Generator réellement utilisé reste à reproduire sur la version concernée.

### Défauts fonctionnels effectivement identifiés dans le code fourni

- Fréquence et moyen de paiement étaient des inputs texte : aucun menu de choix n’existait pour ces deux champs.
- Le bouton de création n’avait aucun verrou contre deux requêtes simultanées.
- La validation du nom reposait uniquement sur la réponse du serveur et sa notification temporaire.
- Après une création, le filtre de recherche pouvait continuer à masquer le nouveau client. Des réponses de recherche plus anciennes pouvaient également remplacer la liste courante.
- Ajouter avec un nom de champ personnalisé vide échouait silencieusement.
- Aucun test dédié n’établissait le parcours complet des champs, les calendriers, la création réelle et la relecture après redémarrage du moteur.

## B. Fichiers inspectés

- `src/pages/ClientsPage.tsx` : tous les champs, états, événements, ajout personnalisé, création, édition et liste.
- `src/App.tsx`, `src/main.tsx` : montage, changement de page, focus, StrictMode, notifications et recherche.
- `src/styles/global.css`, `index.html` : grille, overflow, champs, positionnement, couches, pointer-events, styles de focus et responsive.
- `src/Modal.tsx`, `src/FloatingPanel.tsx` : backdrop, focus et fermeture ; ces composants ne contiennent pas la fiche client.
- `src/keyboard-scroll.ts`, `src/scroll-utils.ts` : propagation et conservation du comportement clavier natif des champs.
- `src/api.ts` : payloads et appels HTTP réels de création/mise à jour.
- `electron/server.ts`, `electron/services/app-service.ts` : routes et délégation vers le dépôt client.
- `storage/repositories/client-repo.ts`, `storage/database/sqlite-db.ts`, `storage/storage-paths.ts` : validation, JSON des champs, SQL paramétré, écriture disque et réouverture.
- `core/types.ts`, `core/validation/legal-validator.ts` : contrat ClientRecord et validations existantes.
- `electron/main.ts`, `electron/preload.ts` : fenêtre, sécurité et surface IPC. Le formulaire client utilise HTTP local, pas une méthode de saisie du preload.
- `package.json`, `package-lock.json`, `playwright.config.ts`, `vitest.config.ts`, `tests/setup.ts`, `scripts/serve-ui-tests.ts`, `e2e/keyboard-layout.spec.ts` : outillage et isolation des tests.

## C. Fichiers modifiés par cette mission

1. **`src/pages/ClientsPage.tsx`** : réparation du parcours et de la soumission.
2. **`src/styles/global.css`** : une seule règle supplémentaire `.client-fields` supprimant les bordure, marge et padding natifs du nouveau fieldset ; aucune couleur, typographie ou grille existante modifiée.
3. **`e2e/client-form.spec.ts`** : 33 nouveaux scénarios Playwright.
4. **`RAPPORT_FORMULAIRE_CLIENT.md`**, preuves JSON et captures `captures/client-form-*` : rapport et résultats synthétiques.

Le dépôt contenait de nombreuses modifications et fichiers non suivis avant cette intervention. Ils sont conservés : pas de reset, nettoyage global, publication forcée ni commit englobant le travail antérieur.

Sauvegardes avant modification : `tools/client-form-backup/ClientsPage.tsx`, `global.css`, `App.tsx`, `serve-ui-tests.ts`, ainsi que le patch et le statut Git préexistants. Le répertoire `tools` est ignoré par Git.

## D. Corrections réalisées

- Vrai élément **form** avec `onSubmit` et prévention du rechargement ; Entrée bénéficie du comportement natif de soumission.
- Nom obligatoire avec `required`, message français visible et focus sur le champ. Les noms uniquement composés d’espaces sont refusés également. **La validation native n’est pas désactivée.** Les validations serveur e-mail/SIRET/téléphone/code postal restent inchangées.
- Verrou synchrone par ref **et** état de soumission : aucun double envoi, contrôles désactivés seulement pendant l’enregistrement, libellé « Enregistrement… », `aria-busy`.
- Erreurs persistantes dans un `role="alert"`, en plus de la notification. Un échec réseau est expliqué et ne réinitialise pas la saisie. Aucune confirmation de réussite n’est produite sur un échec.
- Formulaire réinitialisé **après l’accusé de réussite réel du serveur** uniquement. Ici il n’existe pas de fenêtre modale à fermer.
- Nouveau client affiché à partir de la réponse réelle enregistrée, filtre effacé, puis liste relue. Les anciennes réponses de recherche sont ignorées grâce à un compteur de requêtes.
- Mises à jour de champs fonctionnelles (`setForm(previous => ...)`) et utilisation de contrôles HTML natifs pour conserver focus, curseur, sélection et presse-papiers.
- Menus natifs pour fréquence et paiement, avec choix vide. Une valeur historique différente des choix proposés reste affichée et est conservée à l’édition.
- Calendriers natifs conservés, sans remplacement de composant ni nouvelle dépendance de date.
- Ajouter est explicitement `type="button"` : validation du nom du champ personnalisé, retour de focus et ajout par Entrée sans création accidentelle du client. Entrée pendant une composition IME n’est pas interceptée.
- Aucune migration SQL, substitution de stockage, modification de facturation, de paiements globaux, du preload ou des protections Electron.

Le nom commercial et le logo de Contract Generator sont conservés, conformément à la clarification de l’utilisateur.

## E–F. Tests réels et résultats

Environnement : Linux, Node **22.22.3**, npm **10.9.8**, Playwright du projet et **Chromium 153** fourni séparément comme outil de test dans `tools/browser`. Aucune dépendance applicative ajoutée ; package.json inchangé par cette mission et lockfile identique à son état d’arrivée. Préparation locale : `npm install --ignore-scripts`.

Les tests exécutent le renderer **compilé pour la production**, le vrai serveur Express, le vrai service client et SQL.js. Aucun succès API synthétique n’est utilisé. Pour tester le double clic, seule la livraison d’une **véritable réponse serveur** est retardée ; pour le test négatif réseau, la requête est explicitement interrompue.

**Résultat final de la suite UI complète : 49 scénarios réussis, 0 échec, 0 ignoré**, en **4 min 40 s** (début le 22 octobre 2026 à 18:28:12 UTC) — 33 consacrés au formulaire et 16 de non-régression clavier/interface. Voir [liste des tests et statistiques](captures/client-form-tests.json).

| Exigence | Test réel | Résultat |
|---|---|---|
| Chaque champ texte, professionnel compris | Clic non forcé, focus réel, hit-test au centre, saisie clavier, sélection, copie, effacement, collage et modification ; 21 scénarios incluant Notes et les 2 inputs personnalisés | PASS |
| Civilité | Ouverture du select à la souris et sélection clavier de M. ; Mme dans le parcours complet | PASS |
| Fréquence | Menu natif : choix trimestriel au clavier, annuel enregistré | PASS |
| Moyen de paiement | Menu natif : virement au clavier, chèque enregistré | PASS |
| Date de naissance | Clic sur l’indicateur, ouverture du calendrier, jour suivant sélectionné par flèche puis Entrée ; valeur ISO contrôlée | PASS |
| Date de souscription | Même parcours natif, valeur contrôlée | PASS |
| Date de début | Même parcours natif, valeur contrôlée | PASS |
| Notes | Saisie multiligne par Entrée, accents, copier-coller, modification puis relecture | PASS |
| Ajouter | Erreur explicite si nom vide, ajout à la souris et par Entrée, **zéro POST client** pendant ces ajouts | PASS |
| Nom obligatoire | Nom vide puis espaces : erreur française et focus ; aucun succès | PASS |
| Erreur serveur | E-mail invalide : erreur réelle, nom et e-mail conservés | PASS |
| Échec réseau | Erreur visible, aucune confirmation mensongère, formulaire conservé et réactivé | PASS |
| Créer le client | Véritable requête avec l’ensemble des informations, confirmation, reset après réussite | PASS |
| Double soumission | Double clic pendant une réponse réelle retardée : **un seul POST et un seul client complet en base** | PASS |
| Présence immédiate | Ancien filtre ne correspondant pas au client : filtre effacé, client présent dans la liste sans rechargement manuel | PASS |
| Tab / Maj+Tab | Tous les contrôles dans les deux sens, y compris les segments internes natifs des dates ; copier-coller entre champs | PASS |
| Écrans étroits / couches | Clic et focus des 27 contrôles à 1440, 900 et 375 px | PASS |
| Facultatifs vides | Deuxième client avec seul le nom, tous les contrôles facultatifs visibles vidés, y compris les sélections et valeurs par défaut | PASS |
| Édition | Notes modifiées, véritable PUT, confirmation et relecture | PASS |
| Redémarrage du moteur | Nouveau processus OS, même fichier SQLite, comparaison intégrale des deux clients et réouverture de la fiche dans le navigateur | PASS |
| Anciennes valeurs | Fréquence/paiement hors liste conservés ; adresse professionnelle, date de prélèvement et signature non exposées préservées à l’édition | PASS |
| Régressions de l’interface | Les 16 scénarios existants : défilement, modales, menus, focus et 7 dimensions de fenêtre | PASS |

Autres commandes exécutées :

- `npm run verify:config` : **PASS**.
- `npm run typecheck` : **PASS**.
- `npm run lint` : **PASS**, sans suppression de règle.
- `npm run build:renderer` : **PASS** (également exécuté automatiquement avant les suites UI).
- `npm run build:electron` : **PASS**.
- `npm run build:branding` : **PASS**, régénération standard depuis la source officielle existante.
- `npm test` : **130/131 réussis**, **un échec préexistant de branding**, précisé ci-dessous. Ce résultat n’est pas présenté comme entièrement vert.

Les premiers essais du nouveau harnais ont révélé des sélecteurs de test inadaptés (`getByLabel` sur des labels contenant des options ou un textarea contrôlé) et une hypothèse incorrecte d’un seul Tab par date. Les tests ciblent maintenant les rôles accessibles des contrôles et respectent les étapes internes du calendrier Chromium, sans sauter de champ ni forcer le focus par JavaScript. Une suite intermédiaire de 48 tests puis les suites complètes suivantes ont réussi. Les erreurs de lancement initiales dues aux bibliothèques Linux manquantes ont été résolues uniquement dans l’environnement du navigateur de test, pas dans le produit.

## G. Sauvegarde réelle en base

Chemin de production inchangé : racine du stockage existant, sous-dossier **`database/garageflows.sqlite`**. Les routes POST/PUT passent toujours par `client-repo`, avec SQL paramétré et `payload_json` contenant l’ensemble des champs.

La persistance existante exporte SQL.js dans un fichier temporaire adjacent, puis effectue un renommage vers le fichier SQLite définitif. Aucun faux stockage localStorage ou tableau mémoire n’a remplacé cette chaîne.

Dans le test isolé :

1. un client complet est créé par l’interface ; toutes les valeurs sont vérifiées par le vrai GET API ;
2. les notes sont modifiées et enregistrées par l’interface ;
3. un client minimal est créé ;
4. le fichier de **45 056 octets** possède l’en-tête **`SQLite format 3\0`** ;
5. le moteur est arrêté puis relancé dans un **nouveau processus** ;
6. la totalité des objets clients relus est identique, y compris IDs, dates et valeurs ;
7. la fiche complète est rouverte dans l’interface et ses notes/sélections vérifiées ;
8. des valeurs héritées et des champs non affichés sont modifiés par l’API du profil de test, puis une édition UI vérifie leur conservation.

[Preuve de persistance](captures/client-form-persistence.json) — données **entièrement synthétiques**, pas de données utilisateur. Les dossiers de tests sont créés avec `mkdtemp` et seuls ces dossiers possédés par les tests sont supprimés. Aucune base existante n’est effacée ou migrée.

## H. Vérification après redémarrage : portée exacte

**Validé :** arrêt du serveur local, lancement d’un nouveau processus avec une nouvelle instance SQL.js sur le même profil disque, rechargement de l’interface, lecture de la liste et ouverture de la fiche.

**Non exécuté dans cette mission :** fermeture et relancement d’un nouvel installateur Electron Windows contenant ces modifications. Un redémarrage de moteur n’est pas présenté comme un test de binaire Windows installé. Les anciens artefacts Windows de la mission précédente ne contiennent pas cette nouvelle réparation du formulaire.

## I. Problèmes restants et limites

1. **Cause du blocage dans le binaire installé non établie** : avant même correction, les sources de ce dépôt acceptent les clics. Le dépôt a bien été confirmé par l’utilisateur. Il reste à reproduire le blocage dans la version Windows installée et à vérifier le binaire reconstruit. Ce rapport ne promet pas une correction définitive d’un défaut non reproduit.
2. **Unitaire branding préexistant** : `tests/branding.test.ts`, cas « remplace le monogramme de marque sans remplacer les pictogrammes métier », attend l’absence de `build/icon.ico` et `build/icon.png`. Ces deux fichiers étaient déjà présents dans la copie à l’arrivée et n’ont pas été supprimés pour faire passer le test. Les assets actifs configurés sont dans `public/branding`. Aucun assert n’a été désactivé.
3. **Windows/Electron natif non retesté pour cette nouvelle mission** : le navigateur testé est Chromium 153 sous Linux, pas le Chromium embarqué dans Electron 28.3.3. Il reste à vérifier le comportement du binaire reconstruit, les dialogues natifs et le presse-papiers Windows sur le poste concerné.
4. Les brouillons non enregistrés ne sont pas sauvegardés à la fermeture de l’application ou au changement de page. Ce comportement existant n’a pas été remplacé par un stockage temporaire ; les valeurs restent conservées pendant les déplacements entre les champs, les défilements, les erreurs et la navigation clavier **dans** le formulaire.
5. Aucun nouvel EXE Windows n’est livré ici. Aucune réussite de packaging n’est déduite des seuls tests renderer.

## J. Peut-on créer un client complet ?

**Oui, dans le projet fourni et dans l’environnement testé :** le parcours automatisé a effectivement créé, affiché, modifié et relu un client complet avec données personnelles, professionnelles, abonnement, trois dates, notes multilignes et champ personnalisé. Un client minimal a également été enregistré. Les données ont survécu au redémarrage du moteur.

**Ce n’est pas une garantie « 100 % sur le poste Windows concerné » :** le binaire reconstruit doit encore être vérifié sur ce poste ; la validation locale ne remplace pas cette vérification.

## K. Commandes exactes pour reconstruire et tester

Sur le poste de développement Windows x64, avec Node **>=22.12 et <23** et npm **>=10** (outils de build, pas prérequis pour l’utilisateur final) :

```powershell
npm install
npm run verify:config
npm run typecheck
npm run lint
npm run build:branding
npm test
npx playwright install chromium
npm run test:ui -- e2e/client-form.spec.ts
npm run test:ui
npm run dist
```

L’échec de branding décrit en I reste à traiter séparément ; ne pas transformer cette commande en faux succès, ne pas masquer sa sortie et ne pas supprimer des fichiers utilisateur pour l’éviter.

`npm run dist` exécute le build complet et la préparation de distribution existante. Sortie configurée :

```text
dist\GarageFlows-Contract-Generator-Setup.exe
```

Pour seulement reconstruire les deux parties du logiciel sans produire de Setup :

```powershell
npm run build:renderer
npm run build:electron
```

Le lancement de tests doit utiliser un profil isolé, comme les scénarios fournis ; aucune instruction de suppression d’AppData ou de réinitialisation de la base utilisateur n’est nécessaire.
