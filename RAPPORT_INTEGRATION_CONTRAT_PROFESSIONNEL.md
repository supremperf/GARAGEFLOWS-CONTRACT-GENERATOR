# GarageFlows Contract Generator — intégration professionnelle

22 octobre 2026 · branche `arena/04806916-garageflows-contract-generator` · base Git `0626a0d`.

## A. Résultat et limites

**La source juridique intégrale fournie est maintenant intégrée dans l’application existante, sans import manuel nécessaire.** Le modèle court historique et les fixtures synthétiques ne la remplacent pas.

Source : `resources/contracts/garageflows-professional-v1.0-2026-10-22.md` — version 1.0 du 22 octobre 2026, 38 275 octets UTF-8. SHA-256 : `82ff73ad47b495a9091ac9b82d3cd1ddba2305c6f2d3cf60b4f4431aa94dcf5c`. Les espaces Markdown intentionnels et les clauses sont conservés. Seules les variables explicitement raccordées sont substituées ; la mise en forme Markdown est composée en PDF.

`.gitattributes` interdit la conversion des fins de ligne de la source lors du checkout Windows pour préserver son empreinte exacte. Le modèle est installé automatiquement et de façon idempotente dans la même base SQLite, vérifié par empreinte, sélectionné par défaut dans l’assistant et inclus dans les ressources Windows. Le PDF spécimen utilise **cette source juridique réelle mais uniquement des identités/données synthétiques : ne pas signer ni utiliser commercialement**.

Cela n’est **pas une certification de commercialisation** : revue juridique/technique, nouveau test natif de l’installateur et impression physique restent à distinguer des tests Linux/web/Node. Facturation, paiements, e-mail et signature électronique ne sont pas connectés ; ils ne bloquent pas la génération locale et ne sont jamais simulés.

## B. Protection et réemploi de l’existant

- Audit initial : [AUDIT_INTEGRATION_CONTRAT_PROFESSIONNEL.md](AUDIT_INTEGRATION_CONTRAT_PROFESSIONNEL.md).
- Git contrôlé avant intervention ; `build/` préexistant et non suivi conservé. Aucune suppression ou réinitialisation du travail utilisateur.
- Sauvegardes vérifiées avant modification : `tools/pro-contract-audit/before.tar.gz` puis `tools/pro-contract-source/before-source-integration.tar.gz` (outillage ignoré par Git).
- Clients, Profil/Abonnement, moteur générique, historique `contracts`, SQL.js, répertoires AppData, branding officiel et mécanismes de sauvegarde réutilisés.
- Aucun changement de version (`1.0.1`), dépendance applicative, lockfile, identité visuelle ou contenu des exemples historiques. Ajout volontaire de `resources/contracts` dans `electron-builder.yml`, sans suppression des ressources existantes.
- Installation des dépendances déjà verrouillées avec scripts d’installation désactivés dans ce sandbox ; navigateur de test installé uniquement sous `tools/`, sans ajout aux dépendances du projet.
- Tests sur profils temporaires créés pour chaque campagne ; aucun profil de production ouvert en écriture.

## C. Fonctionnement intégré

### Entrées

- **Clients → Générer un contrat** : client présélectionné.
- **Générer un contrat → Contrat professionnel GarageFlows** : sélection du client et de la version juridique.
- **Historique → Contrats professionnels** : brouillons, originaux et états. Reprise d’un brouillon, aperçu, téléchargement, impression, référence, journal, nouvelle version/proposition d’avenant, résiliation et archivage.
- Une fiche client ouverte affiche également son historique professionnel.
- L’onglet **Modèles importés** conserve le générateur générique existant.

### Six étapes

1. Client et version juridique intégrale.
2. Abonnement : prix enregistré, régime fiscal, première échéance réelle, fin et engagement particuliers.
3. Vérification du contexte unique et des informations manquantes.
4. Conditions particulières explicites, remise, durée et confirmations.
5. PDF final réellement rendu par PDF.js, navigation sur toutes ses pages et confirmation de lecture.
6. Enregistrement de **ces mêmes octets**, sans seconde génération divergente, dans l’historique existant du client.

Le brouillon peut être sauvegardé avant le PDF. Les données client et paramètres peuvent être rechargés explicitement ; une modification invalide l’aperçu antérieur. Si les sources enregistrées ont changé entre vérification et génération, le serveur refuse la génération et demande une nouvelle vérification.

## D. Modèle et cohérence des données

- Source UTF-8 conservée intégralement avec version, date, correspondances et SHA-256. Pas d’endpoint de remplacement en place d’une version juridique.
- Contrôle structurel : articles 1–27, annexes 1 et 2 ordonnées, 15 sections numérotées dans l’annexe RGPD et présence des signatures. Ce contrôle ne certifie pas le contenu juridique de chaque clause.
- **32 occurrences distinctes** : les quatre `[DATE]` correspondent à souscription, activation prévue/déclarée, première échéance et signature ; les trois `[NOM ET PRÉNOM]` distinguent représentant client et fournisseur. Les deux `[À RENSEIGNER]` distinguent contexte commercial et moyen de paiement. Les répétitions ambiguës ne peuvent plus recevoir une seule correspondance globale.
- Correspondance explicite de chaque variable détectée avec une donnée du contexte. Aucune valeur inconnue n’est fabriquée ; une correspondance manquante empêche l’installation du modèle.
- Prix TTC client prioritaire ; paramètres utilisés seulement s’ils sont réellement enregistrés. Aucun repli silencieux sur `99,99` dans ce parcours.
- Calcul en centimes entiers, arrondi du HT, puis TVA = TTC − HT. Monnaie EUR exigée ; aucune conversion implicite.
- Périodicités existantes mensuelle, trimestrielle, semestrielle et annuelle ; écarts au modèle mensuel standard soumis à conditions particulières et confirmation explicites.
- Remise : prix final enregistré = référence − remise ; durée obligatoire. Aucun faux total annuel calculé pour une remise temporaire.
- Franchise : HT = TTC, TVA nulle ; le taux enregistré doit également être 0 afin d’éviter une contradiction avec les paramètres centraux.
- Date de souscription enregistrée exigée par la source et non postérieure à l’activation déclarée ; début de la fiche client et première échéance explicite ; dates invalides ou incohérentes refusées. Date d’émission et contrôles calendaires en Europe/Paris.
- Date de souscription, émission, acceptation déclarée et signature sont distinctes. Aucune signature dessinée ou image enregistrée n’est automatiquement apposée.
- SIREN dérivé uniquement des neuf premiers chiffres du SIRET renseigné. Le format n’est pas une vérification auprès du registre. Aucun nom d’exploitant ni identité professionnelle n’est déduit d’un nom commercial par défaut.
- Champs obligatoires bloquants ; téléphone et informations facultatives peuvent rester explicitement non renseignés.
- Instantanés historiques : client, prestataire, configuration, données financières, conditions, source et correspondances. Modifier les paramètres ne modifie pas les originaux déjà générés.

Le modèle annoncé comporte des affirmations EI/micro-entreprise. Un texte identifié comme tel ne peut pas être généré avec un profil prestataire incompatible. Les questions de préavis, TVA, responsabilité, RGPD, hébergement et sous-traitants restent à vérifier juridiquement et techniquement ; aucune conformité juridique globale n’est certifiée.

## E. PDF et preuve visuelle

- A4 vectoriel, couverture, référence, version, émission, client, synthèse des parties et finances.
- Logo officiel existant, proportions conservées ; aucun nouveau logo ni dessin de remplacement.
- Texte courant 10,2 points, interligne proportionnel ; vrais tableaux de synthèse **et de bon de commande**, hauteurs dynamiques, cellules longues continuées sur plusieurs pages avec répétition de l’en-tête et contrôles de non-troncature. Structure analysée avant substitution pour préserver les pipes/retours à la ligne des valeurs.
- Retours à la ligne sans suppression des fins de texte ; découpage des mots exceptionnellement longs ; paragraphes courts gardés ensemble, introductions avec la première ligne suivante ; titres gardés avec du contenu ; annexes et signatures sur nouvelles pages. Les deux zones de signature suivent les emplacements de la source, sans bloc ajouté après FIN DU CONTRAT.
- En-têtes et pieds récurrents, référence et pagination totale.
- Vérification interne que la séquence de caractères imprimés du corps juridique correspond au texte substitué, après normalisation des espaces et des marques de formatage Markdown prises en charge. Pas de score visuel fictif « 100/100 ».
- Original et aperçu comparés octet pour octet par les tests ; SHA-256 vérifié à chaque lecture, y compris par l’ancienne route de téléchargement.
- Aperçu canvas issu du PDF final, **pas d’HTML approximatif**. Le signal de fin de rendu est lié au document et à la page, pour empêcher une capture prématurée après pagination.
- Impression : rendu des pages réelles du PDF dans une fenêtre d’impression interne. Le test observe les images de toutes les pages et exécute le chemin d’impression du navigateur ; **il ne certifie pas une sortie papier ni le spooler Windows**. Pour l’impression vectorielle native du lecteur PDF, télécharger le fichier et l’ouvrir dans ce lecteur.

### Captures et fichiers de contrôle — sans valeur juridique

Dans [captures/professional/](captures/professional/) :

- [Spécimen du modèle fourni — 24 pages](captures/professional/modele-fourni-specimen.pdf) : source intégrale avec identités de test, aucune signature.
- `pdf-source-page-NN.png` : toutes les pages réelles rendues par PDF.js ; `source-pages.json` : nombre de pages et empreinte du PDF correspondant ; `source-vue-ensemble.png` : vue de contrôle globale.
- `wizard-source-original.png` : assistant réel ; `contract-synthetic-test.pdf`, `stress-synthetic-test.pdf` et PNG « synthetic » : scénarios techniques distincts, pas sources de production.
- `validation.json` : résultats durables et empreintes des sources/captures, sans capacité d’accès, secret ni chemin de profil temporaire.

Les PNG sont exportés des pixels du canvas, pas de reconstructions HTML. Le contrôle visuel final du PDF de 24 pages porte sur la vue de toutes les pages et les pages détaillées de couverture, parties, corps, annexe RGPD, bon de commande et signatures. Les autres pages sont également contrôlées par extraction du texte, coordonnées et rendu. Chaque paragraphe original sans variable est recherché dans le texte extrait du véritable PDF ; les variables et cellules longues ont leurs tests dédiés. Cela prouve des propriétés techniques de fidélité, pas la validité juridique de chaque disposition.

## F. Versions, états et signatures

Chaque contrat reçoit un UUID et un numéro `GF-ABO-AAAA-NNNNNN`, dont le millésime suit Europe/Paris, y compris à la frontière de l’année UTC. La création et la génération disposent de contrôles d’idempotence. Une révision concurrente obsolète est refusée.

États gardés côté serveur : brouillon, à vérifier, généré non signé, attente de signature, signé manuscrit déclaré, actif, résilié, expiré, archivé. La signature ne peut pas être obtenue par une simple transition de statut. Activation conditionnée à une preuve enregistrée et à la période contractuelle ; expiration conditionnée à une fin stipulée atteinte. Ces états sont **locaux**, pas des commandes d’accès au SaaS ou de paiement.

Trois notions distinctes :

1. **Génération** : un PDF existe, aucune acceptation ni signature présumée.
2. **Acceptation déclarée** : l’opérateur consigne un consentement pour un e-mail et une version/empreinte ; le statut ne devient pas signé. Pas de vérification distante de l’identité.
3. **Signature manuscrite déclarée** : copie PDF complète distincte de l’original, signataire, e-mail, date réelle non future et non antérieure à l’émission, consentement et attestation explicite de l’opérateur. La pièce, l’original, leurs empreintes et l’auteur de la consignation sont conservés. Un PDF quelconque n’est pas automatiquement déclaré signé : l’opérateur doit effectuer et attester la vérification.

La vérification de l’authenticité de cette pièce n’est **pas automatisée** ; son niveau est `not_verified`. L’interface ne la présente jamais comme signature électronique avancée ou qualifiée. Un fichier changé, même avec attestation, ne constitue pas une certification cryptographique d’une signature.

Après génération, toute modification nécessite une nouvelle version. Après consignation d’une signature, la voie proposée est une **proposition d’avenant/nouvelle version à faire valider et signer**, pas un avenant juridique automatiquement validé. Les originaux et pièces signées ne sont jamais écrasés par ce parcours. Même la suppression générique refuse ces entrées : utiliser l’archivage. La suppression d’un client lié est refusée.

## G. Sécurité, stockage et intégrations

- Autorisation effective de l’API locale, pas seulement CORS : capacité aléatoire gardée en mémoire du processus principal Electron et ajoutée aux seules requêtes API de sa fenêtre de confiance. Absente du bundle et des variables JavaScript du renderer ; aucun secret de prestataire ajouté.
- Routes de données, documents, sauvegardes et actions sensibles refusées sans capacité. Origines étrangères et `Sec-Fetch-Site: cross-site` refusés, même avec une capacité correcte. `/api/health` reste public et ne contient pas de données personnelles.
- Production Electron : boucle locale par défaut ; verrou d’instance unique pour éviter deux écrivains desktop du même profil. **Le raccordement réel de l’en-tête et ce verrou restent à valider dans l’installateur Windows.**
- Modèle d’autorisation honnête : propriétaire du poste local, auteur = compte OS réellement utilisé. Pas de comptes SaaS, rôles multi-utilisateurs, tenant ou authentification distante inventés.
- Développement : `npm run dev` partage une capacité entre les processus Node API et proxy Vite, jamais via une variable `VITE_`. Ce proxy de développement est une entrée de confiance, **pas un portail de production sécurisé pour des utilisateurs distants**. Ne pas l’exposer à un réseau non fiable avec des données réelles. Les tests utilisent des capacités et profils jetables.
- Stockage : sous-répertoire privé `generated/professional` de la racine existante ; noms construits par le serveur, pas de chemin utilisateur libre. Contrôle du chemin canonique, liens symboliques et sorties de profil refusés ; fichiers créés en mode privé et écriture exclusive.
- Le moteur d’export générique ne peut pas écraser le stockage professionnel, même avec confirmation d’écrasement. Les routes historiques de lecture et suppression respectent les nouvelles protections.
- Journal daté, acteur local, événements chaînés par SHA-256. Ce journal n’est pas ancré chez un tiers ni qualifié ; un administrateur du poste peut modifier les fichiers. La protection du profil relève aussi des ACL et de la sécurité du système ; pas de chiffrement applicatif ou stockage WORM revendiqué.
- Facturation, paiements, e-mail, signature électronique : explicitement non connectés dans l’interface. E-mail/e-signature renvoient une erreur 501, jamais un faux succès.
- Ports d’intégration typés dans `core/contracts/integrations.ts`, fournisseurs tous `null` : confirmations de transport, empreintes/preuves et rapprochement d’abonnement requis pour une future implémentation réelle.

## H. Base de données additive

Même fichier `database/garageflows.sqlite`, aucun déplacement ou effacement.

| Ajout | Rôle |
|---|---|
| `professional_models` | Sources complètes et correspondances immuables |
| `professional_contracts` | Brouillons, instantanés, états et liens de versions ; même identifiant que l’entrée `contracts` après génération |
| `professional_contract_events` | Journal chronologique chaîné |
| `professional_counters` | Allocation des numéros |
| Index client | Historique professionnel de la fiche client |

Les PDF générés sont également inscrits dans **la table `contracts` existante**, qui reste la source de l’historique documentaire général. Les brouillons n’y créent pas de faux PDF. Aucun module parallèle de clients, factures ou abonnements n’a été créé.

Création idempotente des tables ; réouverture et conservation des anciennes données testées. Initialisation concurrente SQL.js mutualisée pour éviter plusieurs connexions initiales. Métadonnées de génération, entrée documentaire et événement insérés dans une transaction SQL ; fichiers exclusifs réutilisables à empreinte identique en cas de reprise.

## I. Tests réellement exécutés

| Vérification | Résultat |
|---|---|
| `npm run typecheck` | PASS |
| `npm run lint` | PASS, aucune alerte sur l’état vérifié |
| `npm run verify:config` | PASS — version 1.0.1, Electron 28.3.3, x64 NSIS, conservation des données |
| `npm run build:renderer` | PASS via les campagnes Playwright ; cible Chromium 120 cohérente avec Electron 28 |
| `npm run build:electron` | PASS |
| Nouveaux tests professionnels Vitest | **76/76 PASS** |
| Suite Vitest complète | **206 PASS / 207 ; 1 échec préexistant conservé** |
| `node scripts/test-professional-runtime.cjs` | PASS — CommonJS compilé, SQLite, source intégrale fournie et fixture synthétique, aperçu/original identiques, extraction, HTTP 403/200 |
| `npm run test:runtime` | PASS — régression PDF.js/SQLite/DOCX/OCR compilés ; messages d’erreur attendus sur fixtures OCR corrompues |
| Playwright final | **56/56 PASS**, dont 49 parcours existants et 7 professionnels ; 0 ignoré/échec/flaky, 99,896 s, début 2026-10-22T20:27:26.945Z |
| Contrôle du diff | PASS hors doubles espaces Markdown intentionnels de la source ; aucune réécriture de celle-ci |
| Nouvel installateur Windows et impression papier | **Non exécutés** |
| Fidélité au modèle juridique original | **Empreinte, substitutions, paragraphes non variables et rendu PDF contrôlés ; aucune certification juridique** |

L’unique échec Vitest complet reste `tests/branding.test.ts` : il exige l’absence de `build/icon.ico` et `build/icon.png`, alors que ces fichiers locaux préexistants non suivis ont été expressément conservés. L’assertion n’a pas été modifiée, les fichiers n’ont pas été supprimés pour obtenir un résultat vert. Les autres 130 tests existants et les 76 nouveaux passent, dont 20 consacrés à la source réellement fournie.

Couverture nouvelle : montants/arrondis, TVA/franchise et contradictions, prix manquants, champs requis/facultatifs, dates, remises, périodicités, intégrité du texte, variables littérales `$&` et crochets, articles/annexes manquants, génération idempotente, concurrence, protection des originaux, données devenues obsolètes, preuves/acceptation déclaratives, états gardés, historique après reconnexion SQLite, PDF altéré ou manquant, accès sans autorisation et origine étrangère, noms/adresses/représentants longs, accents/apostrophes/€, annexes et conditions multipages, vrais téléchargements et chemin d’impression.

Historique des essais : les premières campagnes synthétiques avaient révélé deux erreurs de harnais (sélecteur de liste et héritage des en-têtes dans le contexte prétendument anonyme), corrigées sans affaiblir les assertions. Le contrôle visuel a ensuite détecté le signal de rendu périmé après pagination, corrigé dans l’aperçu ; la campagne finale doit être lue après ce correctif, pas confondue avec les essais précédents.

La reprise avec la source réelle a également rencontré un délai de rendu dépassant 5 s sur le PDF de stress (54 UI passés, 1 échec, puis 1 scénario ignoré par la série). Un essai avec des options Chromium single-process a été interrompu après fermeture des contextes du navigateur ; une tentative suivante a été bloquée avant les tests par son serveur résiduel, qui a été arrêté. La campagne finale utilise le rendu headless CPU, sans désactiver la sécurité web, sans changer les assertions ni augmenter les délais pour masquer ces essais. Elle repasse les **56 tests** et produit les captures finales ci-jointes.

## J. Fichiers principaux

**Créés :**

- `core/contracts/types.ts`, `context.ts`, `pdf.ts`, `integrations.ts`, `variables.ts`, `bundled-model.ts`.
- `storage/repositories/professional-contract-repo.ts`.
- `electron/services/professional-contract-service.ts`, `electron/professional-routes.ts`, `electron/security/local-access.ts`.
- `src/professional-api.ts`, `src/ProfessionalModelSetup.tsx`, `src/ActualPdfPreview.tsx`, `src/ProfessionalContractHistory.tsx`, `src/pages/ProfessionalContractWizard.tsx`.
- `tests/professional-contract.test.ts`, `tests/bundled-professional-contract.test.ts`, `tests/fixtures/professional-contract.ts`, `e2e/professional-contract.spec.ts`, `scripts/test-professional-runtime.cjs`.
- `.gitattributes`, source `.md` et manifeste `.json` sous `resources/contracts/`, son README, ce rapport, l’audit et les preuves sous `captures/professional/`.

**Étendus :** `core/types.ts`, exporteur générique, schéma SQLite, dépôts clients/contrats/profil ; `electron/server.ts`, `main.ts` et shim ; `src/App.tsx`, `api.ts`, pages Clients/Générateur/Historique/Profil et CSS global ; proxy/dev et configuration Playwright/Vite ; ressources Electron Builder ; harnais Windows installé et workflow existant enrichis pour vérifier la source embarquée, le PDF immuable, les accès natifs 403/200 et la conservation après réinstallation.

## K. Utilisation et reste à faire

1. Ouvrir l’application ; en développement, utiliser `npm run dev` plutôt qu’un serveur API seul sans capacité.
2. Renseigner et enregistrer les identités réelles du prestataire et du client dans les écrans existants, ainsi que le prix et les paramètres d’abonnement.
3. Le modèle fourni est déjà intégré et sélectionné par défaut. Vérifier les données réelles et faire valider les clauses et annexes juridiques/techniques. Mes informations permet seulement l’import explicite d’autres versions. Ne jamais utiliser les spécimens à identités fictives comme contrats commerciaux.
4. Depuis le client, cliquer **Générer un contrat**, suivre les six étapes, vérifier toutes les pages et enregistrer le PDF.
5. Reprendre le document dans l’historique ; télécharger/imprimer, consigner uniquement des faits vérifiés, créer une nouvelle version plutôt que modifier un original, archiver plutôt que supprimer.

**Avant livraison commerciale :** faire valider l’articulation du préavis et du renouvellement mensuel, le taux de pénalités, la fiscalité, la responsabilité et les prestations réellement exécutées. Documenter notamment hébergement, mesures de sécurité, sous-traitants, transferts, IA, sauvegardes/rétention et réversibilité RGPD. Les mentions standard 99,99 €/mois, fréquence mensuelle et absence d’engagement restent inchangées ; toute dérogation doit être décrite explicitement au bon de commande et validée, sans prétendre que la confirmation de l’opérateur résout juridiquement une contradiction.

Les caractères hors Helvetica/WinAnsi sont refusés explicitement, pas supprimés. L’interface conserve un représentant principal textuel ; le test multireprésentants prouve l’absence de troncature d’une liste, pas une gestion complète des pouvoirs. Les gros historiques, une politique métier de purge/rétention, les rôles distants et les connecteurs externes restent à développer si requis. Le journal local ne remplace pas un horodatage qualifié ; le retour arrière complet de l’état mémoire SQL.js après une panne de persistance disque n’est pas revendiqué/testé.

Le harnais Windows installé a été étendu, mais **son exécution sur ce nouveau code reste à confirmer**. Le succès historique du run `39833919146` concerne `0626a0d`, avant cette intégration ; ce n’est pas une validation de ces changements. Aucune impression papier, signature qualifiée, publication de nouveau binaire ou fusion de PR n’est annoncée ici.
