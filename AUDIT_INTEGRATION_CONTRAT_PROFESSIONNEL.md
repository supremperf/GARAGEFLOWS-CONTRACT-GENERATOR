# Audit initial — intégration du contrat professionnel GarageFlows

Date : 22 octobre 2026. Source auditée : `0626a0d`, branche `arena/04806916-garageflows-contract-generator`.

**Mise à jour après développement :** la source intégrale re-fournie est maintenant enregistrée, figée par SHA-256, embarquée et raccordée par occurrence dans l’application existante. Les tests utilisent cette source réelle avec des identités synthétiques, en plus des scénarios historiques. Voir [le rapport d’intégration](RAPPORT_INTEGRATION_CONTRAT_PROFESSIONNEL.md) et `captures/professional/validation.json` pour les résultats effectifs et les limites natives/juridiques. La revue juridique n’est pas remplacée par ces contrôles.

**Les observations ci-dessous sont l’état initial, avant implémentation**, et non l’inventaire des fonctionnalités actuelles. L’audit statique initial était effectué sans nouvelle génération ni nouveaux tests à cette date.

## 1. État et protection du projet

- Git vérifié avant intervention : seul `build/` est non suivi ; il est conservé.
- Aucune donnée utilisateur, base SQLite, template importé ou document généré ouvert en écriture.
- Aucun changement de dépendance, de version, de secret ou de configuration utilisateur.
- État initial et patch sauvegardés dans `tools/pro-contract-audit/`, ignoré par Git.
- Ce rapport est le seul fichier fonctionnellement ajouté à ce stade ; aucun parcours métier n’est remplacé.

## 2. Architecture constatée

| Couche | Architecture actuelle | Réemploi requis |
|---|---|---|
| Desktop | Electron 28.3.3, main/preload compilés en CommonJS, isolation de contexte, sandbox, intégration Node désactivée dans le renderer | Fenêtre actuelle, ponts limités, runtime et packaging existants |
| Interface | React 18, TypeScript, Vite, CSS global sombre, navigation interne dans `src/App.tsx` | Pages Clients, Générateur, Historique et Profil, composants Modal/FloatingPanel |
| API locale | Express dans `electron/server.ts`, service `electron/services/app-service.ts`, appels relatifs depuis `src/api.ts` | Étendre les routes et services, ne pas créer une application séparée |
| Base | SQL.js / SQLite, singleton, export du fichier et remplacement par renommage | Même fichier `database/garageflows.sqlite`, migrations additives uniquement si nécessaires |
| Stockage | `storage/storage-paths.ts` : database, models, clients, generated, signatures, settings, backups, logs | Conserver la racine existante et les sauvegardes |
| Modèles | Import DOCX/PDF/ODT/texte et autres formats, détection des variables, copie du modèle, empreinte et correspondances | Conserver import, bibliothèque et moteurs de remplacement génériques |
| PDF | `pdf-lib`, PDF.js, remplacement positionnel et générateur vectoriel simple | Réutiliser les bibliothèques ; ne pas qualifier le moteur actuel de mise en page premium |
| Tests | Vitest, Playwright, tests runtime compilés et workflow Windows installé | Ajouter des tests isolés à ces chaînes existantes |

## 3. Données existantes et écarts

### Clients

`ClientRecord` contient civilité, nom/prénom, coordonnées, entreprise, forme juridique, SIRET, TVA intracommunautaire, adresse professionnelle, représentant/fonction, dates, abonnement, prix TTC, fréquence, paiement, date de prélèvement, signature, notes et champs personnalisés. Les fiches sont dans `clients`, avec champs de recherche et `payload_json`.

Il n’existe pas de champs dédiés distincts pour SIREN, nom commercial et dénomination sociale du client, ni de liste de plusieurs représentants. Ne pas assimiler automatiquement un nom de personne à une raison sociale. Une éventuelle dérivation SIREN depuis SIRET doit être explicitement déterministe et contrôlée, pas une valeur inventée.

### Paramètres de GarageFlows

`ProfessionalProfile` et `profile-repo.ts` centralisent déjà identité, nom commercial, entreprise, adresse, SIRET, forme juridique, e-mail, téléphone, site, coordonnées bancaires et signature. L’interface `ProfilePage.tsx` permet leur modification. La base utilise `key_value_store`.

Ces paramètres doivent être enrichis, pas remplacés. Les champs juridiques absents restent absents jusqu’à leur saisie. Les valeurs affichées par défaut ne constituent pas une identité légale vérifiée.

### Abonnements, prix et dates

`SubscriptionConfig` contient produit, prix TTC/HT, TVA, périodicité/fréquence, devise, date de facturation, durée d’engagement, reconduction, résiliation, paiement, retard et clauses personnalisées avec indicateur de validation. Les fiches clients peuvent surcharger certains champs.

**Il n’existe pas de table d’abonnements autonomes ni d’identifiant d’abonnement par client.** La configuration globale n’est pas un module complet de gestion d’abonnements. Renouvellement, remise structurée, prix annuel et première échéance ne sont pas des champs complets déjà disponibles.

Le dictionnaire existant applique des replis comme `client.prixTTC || subscription.prixTTC || '99,99'` et la date du jour à `DATE_SIGNATURE`. Le parcours professionnel devra distinguer valeur réellement enregistrée, valeur proposée et information manquante : ni tarif silencieusement substitué, ni date d’émission présentée comme date de signature.

### Facturation et paiements

Les recherches dans les modèles, services, routes et pages n’identifient **aucun module de factures**, d’échéancier comptable ou de transactions de paiement. Les coordonnées de paiement et tarifs sont des informations de configuration, pas des factures ni des paiements exécutés.

Une cohérence avec des factures réelles ne peut donc pas être annoncée. Si ces modules appartiennent à un autre projet, leur contrat d’API et leur accès autorisé devront être fournis. Sinon, le périmètre local devra explicitement rester limité aux données effectivement présentes.

### Contrats, documents et historique

Le module existe déjà : `GeneratedContractRecord`, `contract-repo.ts`, table `contracts`, `HistoryPage.tsx`, téléchargement et rapport de génération.

Sont déjà enregistrés : identifiant, modèle, client, format, nom/chemin, taille, SHA-256, valeurs utilisées, rapport et date de création. `listContractsByClient` relie les documents aux clients.

Ne sont pas présents : numéro contractuel métier, versions explicites immuables, statut juridique, date réelle de signature, journal d’événements métier, auteur authentifié, avenants et résiliation. Le dépôt autorise actuellement la suppression de contrats et l’export peut écraser un fichier après confirmation. Ces comportements ne doivent pas s’appliquer à une version signée du nouveau parcours.

### Signatures et e-mails

Les signatures actuelles sont des images, tracés ou textes. Aucun fournisseur de signature, certificat qualifié, preuve indépendante de consentement ou mécanisme de webhook vérifié n’est connecté.

Aucun service SMTP, API de messagerie ou journal d’envoi confirmé n’est identifié. Un lien `mailto:` ne constituerait pas une preuve d’envoi. Aucun e-mail ne pourra être marqué envoyé sans transport réel et réponse positive.

## 4. Modèle contractuel absent : point bloquant précis

Le fichier `examples/contrat-abonnement-garageflows.txt` contient un exemple court : parties, tarif, coordonnées bancaires, prise d’effet, signatures et tableau. Le script de génération d’exemples et les autres formats reprennent ce type de démonstration.

**Ce n’est pas le contrat professionnel intégral demandé.** Il ne contient pas les articles détaillés, l’annexe RGPD, la réversibilité et le bon de commande décrits dans la mission. Le guide `README_MODELES_CONTRATS.md` interdit lui-même d’inventer des conditions contractuelles.

La conversation accessible donne la liste des rubriques attendues, mais pas leur rédaction complète. Le dossier de pièces jointes accessible contient le logo, pas de contrat PDF/DOCX. Les recherches textuelles dans le dépôt n’ont pas trouvé le contrat professionnel intégral annoncé.

Il faut donc obtenir le document source exact et ses annexes avant d’intégrer le contenu de référence ou d’affirmer que toutes ses clauses sont conservées. La liste de titres ne permet pas de reconstituer fidèlement les engagements contractuels.

## 5. Risques de régression et de sécurité

1. **Prix incohérent** : le contexte fusionne les données client et abonnement, mais certaines zones de l’assistant affichent la configuration globale. Le nouveau parcours doit présenter un instantané effectif unique et contrôler toute divergence avant export définitif.
2. **Aperçu différent du PDF** : l’aperçu actuel est une représentation HTML des paragraphes/tableaux ; il ne montre pas nécessairement la pagination exacte. Le nouveau parcours doit afficher les véritables octets du PDF produit.
3. **Troncature PDF actuelle** : le générateur simple coupe le texte des cellules à 48 caractères et utilise une hauteur de ligne fixe. Il ne convient pas aux tableaux juridiques longs. Il ne faut pas le réutiliser inchangé pour le nouveau contrat.
4. **Conservation historique** : conserver les instantanés fournisseur/client/abonnement, le contenu du modèle et leurs empreintes, pas uniquement des liens vers des paramètres modifiables.
5. **Versions signées** : bloquer côté serveur suppression et écrasement, y compris depuis les anciennes routes, pour les versions protégées. Un avenant produit une nouvelle version liée.
6. **Droits** : application locale mono-profil, sans comptes, rôles, tenants ou session authentifiée. Un nom d’utilisateur fourni librement par le navigateur ne constitue pas un auteur authentifié.
7. **API locale** : la politique CORS existante limite la lecture par le navigateur, mais n’est pas une autorisation serveur. Les routes documentaires ne disposent pas actuellement de contrôle d’accès par session. Ne pas exposer le serveur sur un réseau ni présenter des UUID comme une protection des PDF.
8. **Ressources PDF** : aucune ressource distante ou HTML/script arbitraire ne doit être exécuté lors du rendu. Réutiliser le logo local officiel et échapper les données clients.
9. **Migrations et sauvegardes** : modifications additives et idempotentes ; aucune suppression/recréation de table existante. Vérifier les archives de sauvegarde/restauration avec les nouvelles versions et événements.
10. **Juridique** : génération, acceptation, signature simple, avancée et qualifiée sont des notions distinctes. Aucune transition vers « Signé » ou « Actif » ne doit résulter de la seule génération ou de l’insertion d’une image.

## 6. Plan de fichiers proposé après réception du modèle

Les noms ci-dessous sont un plan d’intégration, **pas une liste de fichiers déjà livrés**. Le découpage précis du modèle dépendra du document fourni.

### Étendre les éléments existants

- `core/types.ts` : métadonnées professionnelles et versions/statuts, extensions additives des profils et abonnements.
- `storage/database/sqlite-db.ts` : migrations additives pour métadonnées/version, événements, preuves et éventuelle liaison d’abonnement.
- `storage/repositories/contract-repo.ts` : lectures compatibles, immutabilité des versions protégées et filtres documentaires par client.
- `storage/repositories/profile-repo.ts`, `client-repo.ts` : paramètres manquants et validation, sans remplacer la base ni les anciennes fiches.
- `electron/services/app-service.ts`, `electron/server.ts`, `src/api.ts` : contexte professionnel, validations, routes protégées, téléchargement/aperçu et transitions.
- `electron/main.ts` et `electron/preload.ts` : seulement si nécessaire pour le rendu PDF natif et le contrôle des accès locaux ; pas d’accès Node générique exposé au renderer.
- `src/App.tsx`, `src/pages/ClientsPage.tsx` : entrée « Générer un contrat » avec client présélectionné.
- `src/pages/GeneratorPage.tsx` : réutiliser l’assistant, ajouter un parcours professionnel identifiable, ne pas supprimer la génération générique.
- `src/pages/ProfilePage.tsx` : compléter les paramètres centralisés.
- `src/pages/HistoryPage.tsx`, `src/styles/global.css` : statuts, versions, historique, actions et styles cohérents avec le logiciel existant.

### Ajouter des services ciblés

- `core/contracts/professional-model.ts` : modèle intégral versionné, empreinte source et classification des clauses nécessitant validation.
- `core/contracts/context.ts` et `validation.ts` : instantané effectif, contrôles de données et cohérence financière/date.
- `core/contracts/lifecycle.ts` : transitions explicites, preuves requises et immutabilité.
- `core/contracts/pdf-renderer.ts` : rendu A4 paginé, couverture, parties, articles, annexes et signatures ; aucun texte supprimé pour faire tenir.
- `storage/repositories/contract-event-repo.ts` : journal append-only avec dates et origine vérifiable.
- `electron/services/contract-signature-service.ts` : interface d’intégration de prestataire, indisponibilité explicite si non configuré, vérification des preuves et événements reçus.
- `electron/services/contract-mail-service.ts` : adaptateur de transport réellement confirmé ; action désactivée et explicative tant qu’aucun transport n’existe.
- Tests Vitest dédiés au contexte, montants, transitions, migrations et versions ; tests Playwright du parcours complet et tests PDF structurels/visuels avec données synthétiques uniquement en environnement isolé.

### Invariants de données

- Réutiliser `clients`, `contracts`, `key_value_store` et le stockage existant.
- Ne pas réécrire les contrats historiques ni attribuer une signature aux anciennes générations.
- Ajouter des versions/événements liés aux contrats plutôt que créer une bibliothèque documentaire parallèle.
- Lier les fichiers au client et à une référence/version unique ; empreinte de chaque document définitif et du modèle utilisé.
- Conserver les instantanés historiques même si le profil de l’exploitant ou le tarif est modifié ultérieurement.

## 7. Vérifications à exécuter lors du développement

- Configuration, TypeScript, lint, unitaires et compilation renderer/Electron.
- Migrations sur copie isolée de données anciennes, sauvegarde/restauration, lecture des anciens documents.
- Flux de création depuis la fiche, informations manquantes et facultatives, cohérence des montants/TVA/remises/dates.
- Références uniques, concurrence/double soumission, journal et conservation après redémarrage.
- Refus des transitions sans preuve et refus de suppression/écrasement d’une version signée.
- Accès non autorisés, origine interdite, chemins, tentatives d’accès inter-clients et absence d’exposition publique.
- PDF longs, accents, apostrophes, €, adresses sans espace, tableaux/annexes multipages, en-têtes/pieds et absence de troncature.
- Aperçu du PDF exact, téléchargement, impression et contrôle visuel des captures.
- Non-régression des 49 scénarios UI déjà livrés et validation Windows native du nouveau code.

**Aucun de ces nouveaux tests n’a encore été exécuté pour cette mission.** Les résultats des missions précédentes ne valent pas validation d’un module contractuel qui n’a pas encore été développé.
