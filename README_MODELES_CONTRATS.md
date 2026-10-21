# Guide de création des modèles de contrats GarageFlows

Ce document explique comment préparer un modèle pour **GarageFlows Contract Generator**. Il est suffisamment précis pour être transmis à une autre IA chargée de créer ou d’adapter un contrat compatible.

Le logiciel remplace uniquement les variables identifiées. Il ne doit pas, et ne doit jamais, inventer une clause, une durée, une pénalité ou une condition de résiliation.

## Syntaxe recommandée

La syntaxe officielle est la double accolade :

```text
{{NOM_DU_CHAMP}}
```

Exemples obligatoires à privilégier :

```text
{{CLIENT_NOM}}
{{CLIENT_PRENOM}}
{{CLIENT_ADRESSE}}
{{CLIENT_CODE_POSTAL}}
{{CLIENT_VILLE}}
{{CLIENT_TELEPHONE}}
{{CLIENT_EMAIL}}
{{ENTREPRISE_NOM}}
{{ENTREPRISE_SIRET}}
{{ENTREPRISE_ADRESSE}}
{{ENTREPRISE_IBAN}}
{{ENTREPRISE_BIC}}
{{ABONNEMENT_NOM}}
{{ABONNEMENT_PRIX_TTC}}
{{ABONNEMENT_PERIODICITE}}
{{DATE_SIGNATURE}}
{{DATE_DEBUT}}
{{SIGNATURE_CLIENT}}
{{SIGNATURE_ENTREPRISE}}
```

## Règles de rédaction

1. Une variable correspond à une seule information.
2. Utiliser un nom explicite, en majuscules, avec des underscores.
3. Éviter `XXX` lorsque plusieurs informations différentes sont attendues.
4. Répéter exactement le même identifiant pour une information répétée. `{{CLIENT_NOM}}` cinq fois recevra la même valeur.
5. Ne pas couper une variable sur plusieurs lignes.
6. Ne pas séparer les caractères d’une variable dans plusieurs cellules, runs Word ou zones de texte.
7. Utiliser les doubles accolades.
8. Ne pas renommer une variable sans mettre à jour la correspondance dans le logiciel.
9. Ne pas placer une variable dans une formule Excel si la cellule doit rester calculée. Une formule non concernée est conservée.
10. Ne pas modifier le modèle original après import : le logiciel travaille sur une copie.

## Dictionnaire

### Variables client

| Variable | Obligatoire | Type | Exemple |
|---|---|---|---|
| `{{CLIENT_CIVILITE}}` | Non | Texte | M. |
| `{{CLIENT_NOM}}` | Oui | Texte | DUPONT |
| `{{CLIENT_PRENOM}}` | Oui | Texte | Jean |
| `{{CLIENT_NOM_COMPLET}}` | Oui si utilisée | Texte | Jean DUPONT |
| `{{CLIENT_DATE_NAISSANCE}}` | Non | Date JJ/MM/AAAA | 15/04/1995 |
| `{{CLIENT_LIEU_NAISSANCE}}` | Non | Texte | Metz |
| `{{CLIENT_ADRESSE}}` | Oui | Texte | 12 rue de Paris |
| `{{CLIENT_ADRESSE_COMPLETE}}` | Oui si utilisée | Texte | 12 rue de Paris, 57000 Metz |
| `{{CLIENT_COMPLEMENT_ADRESSE}}` | Non | Texte | Bâtiment B |
| `{{CLIENT_CODE_POSTAL}}` | Oui | Code postal | 57000 |
| `{{CLIENT_VILLE}}` | Oui | Texte | Metz |
| `{{CLIENT_PAYS}}` | Non | Texte | France |
| `{{CLIENT_TELEPHONE}}` | Oui | Téléphone | 06 00 00 00 00 |
| `{{CLIENT_EMAIL}}` | Oui | E-mail | jean.dupont@email.fr |
| `{{CLIENT_ENTREPRISE}}` | Non | Texte | Garage Dupont |
| `{{CLIENT_FORME_JURIDIQUE}}` | Non | Texte | SAS |
| `{{CLIENT_SIRET}}` | Non | SIRET 14 chiffres |  |
| `{{CLIENT_TVA_INTRA}}` | Non | Texte |  |
| `{{CLIENT_REPRESENTANT}}` | Non | Texte |  |
| `{{CLIENT_FONCTION_REPRESENTANT}}` | Non | Texte | Gérant |

### Variables GarageFlows

| Variable | Obligatoire | Type |
|---|---|---|
| `{{ENTREPRISE_NOM}}` | Oui | Texte |
| `{{ENTREPRISE_ADRESSE}}` | Oui | Texte |
| `{{ENTREPRISE_CODE_POSTAL}}` | Non | Code postal |
| `{{ENTREPRISE_VILLE}}` | Non | Texte |
| `{{ENTREPRISE_SIRET}}` | Oui | SIRET |
| `{{ENTREPRISE_FORME_JURIDIQUE}}` | Non | Texte |
| `{{ENTREPRISE_REPRESENTANT}}` | Oui | Texte |
| `{{ENTREPRISE_EMAIL}}` | Non | E-mail |
| `{{ENTREPRISE_TELEPHONE}}` | Non | Téléphone |
| `{{ENTREPRISE_IBAN}}` | Non | IBAN |
| `{{ENTREPRISE_BIC}}` | Non | BIC |
| `{{ENTREPRISE_RIB}}` | Non | Texte |
| `{{ENTREPRISE_BANQUE}}` | Non | Texte |

### Abonnement, dates, signatures

| Variable | Obligatoire | Type | Valeur de référence |
|---|---|---|---|
| `{{ABONNEMENT_NOM}}` | Oui | Texte | GarageFlows |
| `{{ABONNEMENT_PRIX_TTC}}` | Oui | Montant | 99,99 € |
| `{{ABONNEMENT_PRIX_MONTANT}}` | Si le mot « euros » suit déjà | Montant | 99,99 |
| `{{ABONNEMENT_PRIX_HT}}` | Non | Montant | 83,33 € |
| `{{ABONNEMENT_PERIODICITE}}` | Oui | Texte | mois |
| `{{ABONNEMENT_TVA}}` | Non | Texte | 20 % |
| `{{ABONNEMENT_MOYEN_PAIEMENT}}` | Non | Texte | Prélèvement SEPA |
| `{{ABONNEMENT_ENGAGEMENT}}` | Non | Texte | Uniquement si vous l’avez saisi |
| `{{DATE_SIGNATURE}}` | Oui | Date | JJ/MM/AAAA |
| `{{DATE_DEBUT}}` | Oui | Date | JJ/MM/AAAA |
| `{{SIGNATURE_CLIENT}}` | Non | Signature | Texte ou image |
| `{{SIGNATURE_ENTREPRISE}}` | Non | Signature | Texte ou image |

Les champs obligatoires ci-dessus le sont seulement s’ils sont présents dans le modèle. Un champ absent du modèle n’est pas inventé.

## Champs personnalisés

Vous pouvez créer `{{CODE_PARRAINAGE}}` ou toute clé `A-Z`, `0-9` et `_`. Déclarez-la dans **Mes informations → Variables personnalisées**, puis utilisez exactement le même identifiant dans le modèle.

## Anciens modèles

Les formes suivantes sont comprises, avec validation humaine si le contexte est ambigu :

- `XXX`, `XXXX`, `XXXXX`
- `[NOM]`, `[PRENOM]`, `[ADRESSE]`
- `{NOM}`
- `« À compléter »`
- libellés suivis de pointillés : `Nom du client : .....`

Chaque `XXX` est une variable distincte. Le logiciel propose une correspondance d’après le contexte :

```text
Je soussigné XXX, résidant au XXX, joignable au XXX.
```

- XXX n°1 → nom et prénom
- XXX n°2 → adresse complète
- XXX n°3 → téléphone

Il ne remplace jamais tous les `XXX` par la même valeur. Si la confiance est faible, l’export est bloqué jusqu’à votre validation.

Les doubles accolades sont prioritaires lorsqu’elles sont présentes.

## Exemple compatible

```text
CONTRAT D'ABONNEMENT GARAGEFLOWS

Entre :

L'entreprise {{ENTREPRISE_NOM}}, immatriculée sous le numéro {{ENTREPRISE_SIRET}}, dont le siège est situé au {{ENTREPRISE_ADRESSE}}, représentée par {{ENTREPRISE_REPRESENTANT}}.

Et :

{{CLIENT_PRENOM}} {{CLIENT_NOM}}, domicilié au {{CLIENT_ADRESSE}}, {{CLIENT_CODE_POSTAL}} {{CLIENT_VILLE}}, joignable au {{CLIENT_TELEPHONE}} et à l'adresse {{CLIENT_EMAIL}}.

Le client souscrit à l'abonnement {{ABONNEMENT_NOM}} pour un montant de {{ABONNEMENT_PRIX_TTC}} TTC par {{ABONNEMENT_PERIODICITE}}.

Coordonnées bancaires : {{ENTREPRISE_IBAN}}.

Fait le {{DATE_SIGNATURE}}.

Signature du client : {{SIGNATURE_CLIENT}}.
```

Des fichiers prêts à importer se trouvent dans `examples/`.

## Tableaux

Dans Word, Writer ou Excel, placez la variable entière dans une seule cellule :

| Désignation | Montant |
|---|---|
| `{{ABONNEMENT_NOM}}` | `{{ABONNEMENT_PRIX_TTC}}` |

Ne pas écrire `{{CLIENT_` dans une cellule et `NOM}}` dans la suivante.

## Images et signatures

- Les images du modèle DOCX/ODT sont conservées lors d’un remplacement natif.
- `{{SIGNATURE_CLIENT}}` et `{{SIGNATURE_ENTREPRISE}}` reçoivent le nom du signataire ou une mention si une image est apposée.
- Une image importée ou un dessin n’est pas une signature électronique qualifiée.

## PDF

- Préférez un PDF texte, pas un scan, si vous voulez conserver la position exacte des lignes.
- Ne vectorisez pas les variables en contours : le texte doit rester sélectionnable.
- Ne découpez pas `{{CLIENT_NOM}}` sur deux lignes.
- Un PDF scanné est signalé. L’OCR local est utilisé si les données de langue sont présentes. Sinon, une couche texte embarquée peut être lue, et la limite est affichée.

## Mise en page

- Marges suffisantes : une valeur longue (`12 rue de Paris, 57000 Metz`) est plus large que `{{CLIENT_ADRESSE}}`.
- Le moteur PDF réduit la taille de police du bloc si le texte déborde et signale l’anomalie.
- Ne sacrifiez pas une clause pour « faire tenir » une variable. Raccourcissez le libellé de la variable, pas le texte juridique.
- Conservez le fichier source. Le logiciel n’écrit jamais dans l’original.

## Formatage

- Dates saisies en `AAAA-MM-JJ` ou `JJ/MM/AAAA`, insérées en `JJ/MM/AAAA`.
- Montants en euros avec virgule décimale : `99,99 €`.
- Le prix HT de 99,99 € TTC à 20 % est `83,33 €`. La TVA est `16,66 €`. Le calcul est fait en centimes.
- Accents français et symbole € sont conservés.
- IBAN, BIC et SIRET sont contrôlés avant export s’ils sont renseignés.

## Ce qu’il ne faut pas demander au logiciel

- Inventer des conditions générales.
- Inventer une durée d’engagement, une reconduction, une pénalité ou un prélèvement.
- Supprimer une clause.
- Réécrire le sens juridique d’une phrase.
- Garantir la validité juridique du contrat.

La génération technique, la validation des informations, la validation juridique et la signature sont quatre étapes distinctes. Seule la première est automatisée.
