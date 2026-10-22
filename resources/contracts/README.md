# Contrat professionnel GarageFlows — source intégrale embarquée

La source fournie est conservée dans `garageflows-professional-v1.0-2026-10-22.md`, sans réécriture des clauses : 27 articles, annexe RGPD en 15 sections, bon de commande, déclaration du client, signatures et avertissement final.

- Titre : CONTRAT PROFESSIONNEL D'ABONNEMENT ET DE LICENCE D'UTILISATION D'UN LOGICIEL SAAS.
- Version : 1.0 — 22 octobre 2026 ; territoire : France.
- Taille UTF-8 : 38 275 octets.
- SHA-256 : `82ff73ad47b495a9091ac9b82d3cd1ddba2305c6f2d3cf60b4f4431aa94dcf5c`.
- Manifeste adjacent `.json` : empreinte, 32 correspondances par occurrence, champs supplémentaires requis et points de revue.

`.gitattributes` préserve les fins de ligne exactes, y compris lors du checkout Windows. Les deux espaces en fin de certaines lignes sont des sauts de ligne Markdown intentionnels : ne pas les nettoyer dans la source. Une révision juridique doit créer une nouvelle version, pas modifier silencieusement ce texte ou les instantanés existants.

## Installation automatique et usage

Le modèle est chargé depuis les ressources de l’application, son empreinte et sa structure sont vérifiées, puis il est installé de façon idempotente dans la base SQLite existante. Il est sélectionné par défaut dans **Clients → Générer un contrat**. Aucun import manuel n’est nécessaire pour cette version. `electron-builder.yml` embarque le dossier sous `resources/contracts` → `contracts` dans l’installation.

Renseigner les données réelles dans Clients, Mes informations et Paramètres d’abonnement. La source exige notamment la date de souscription enregistrée, le code postal/ville du client et le moyen de paiement déclaré. La première échéance et le régime fiscal doivent être confirmés dans l’assistant. Les dates et le lieu de signature restent « À compléter lors de la signature » ; la génération ne signe pas le document.

L’import d’une **autre version intégrale** reste disponible sous Mes informations. Les occurrences identiques sont présentées séparément, avec leur contexte. Les correspondances ambiguës doivent être levées explicitement.

## Correspondances sensibles

- `NUMÉRO#1` : numéro sans préfixe, adapté à `GF-ABO-[NUMÉRO]`. `REFERENCE_CONTRAT` contient déjà le préfixe.
- `DATE#1` : souscription ; `DATE#2` : activation prévue/déclarée de la fiche client ; `DATE#3` : première échéance explicite ; `DATE#4` : date de signature non présumée.
- `NOM ET PRÉNOM#1/#3` : représentant du client ; `#2` : signataire du fournisseur.
- `À RENSEIGNER#1` : contexte tarifaire effectif et conditions particulières ; `#2` : moyen de paiement.

Le tableau est analysé **avant** substitution : les pipes, dollars et retours à la ligne des valeurs ne créent pas de nouvelles cellules. Les tarifs et fréquences mensuels littéraux de la source restent inchangés. Toute exception doit figurer explicitement dans les conditions particulières du bon de commande ; la confirmation de l’opérateur n’est pas une validation juridique.

## Preuves et limites

`captures/professional/modele-fourni-specimen.pdf` utilise cette source juridique intégrale mais **uniquement des identités et données synthétiques de test : ne pas signer ni utiliser commercialement**. `source-pages.json` identifie ses pages et empreintes. Les autres PDF portant « synthetic » sont des fixtures techniques, pas des modèles de production. Les exemples historiques de `examples/` restent ceux du générateur générique.

Le contrôle d’empreinte, les tests d’extraction des paragraphes et la revue visuelle ne certifient pas la validité juridique du contrat. Préavis, fiscalité, RGPD, hébergement, sous-traitants et services effectivement fournis doivent être vérifiés. Le générateur local n’a pas de facturation, paiement, transport d’e-mail ou signature électronique connecté.

Voir `RAPPORT_INTEGRATION_CONTRAT_PROFESSIONNEL.md` pour les résultats effectivement exécutés et les validations natives restant à réaliser.
