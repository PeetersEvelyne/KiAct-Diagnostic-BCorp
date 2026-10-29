# Journal des modifications · KiAct Diagnostic B Corp V2

## Version 2.1.0 du 29 octobre 2026

Référentiel : Standards B Lab V2.2 du 20 février 2026. Aucune version postérieure publiée au 29 octobre 2026 (journal des modifications du Knowledge Hub B Lab, vérifié ce jour).

### Contenu B Corp
- FR2.1 : calendrier corrigé. Avant la certification si le chiffre d'affaires est inférieur à 10 M USD et l'effectif inférieur à 50 personnes. Un délai s'applique dès qu'un seul seuil est dépassé, un an (SA, Sàrl ou équivalent) ou deux ans (statut à mission exigé). Source, Knowledge Hub B Lab, article 43000786021. Repères de coût et de délai présentés comme estimations KiAct.
- FR1.1 et FR1.2 : conditions d'éligibilité FR1.1 ajoutées, critère 1.2.4 (producteurs d'énergie) ajouté, seuil client de 5 % retiré car absent du standard, règle d'attribution du revenu client conforme à fr.pdf p. 22.
- FR1.2 non bloquant en Année 0 pour une recertification depuis les standards V1.6 (critère 1.2.5, fr.pdf p. 19).
- Mention de version : « Standards B Lab V2.2 du 20 février 2026, mises à jour vérifiées le 27 octobre 2026 ».
- Codes français des PDF affichés à côté des codes anglais (EB, MGPP, TE, JEDI, DH, AC, GEC, APAC).

### Questionnaire, restitution et documents attendus
- Filtrage des questions recalculé à partir des tableaux d'applicabilité des huit PDF V2.2 (taille, secteur, industrie B Lab, année de départ). Les filtres saisis à la main sont supprimés.
- Nouveau champ « Industrie B Lab » pour les services à faible empreinte. HR3.3 et GEC2.6 ne visent que certaines industries listées (hr.pdf p. 92, esc.pdf p. 136).
- Risk Tool FR3.1.a à n transcrit (fr.pdf p. 50 à 138). Chaque « oui » affiche les sous-exigences ajoutées, remplacées ou à prendre en compte. Les exigences d'Année 3 et 5 activées figurent dans une liste « À anticiper ».
- Profils d'usage de l'IA (six cas). Seule la distribution d'un produit numérique utilisant l'IA répond « oui » à FR3.1.c (fr.pdf p. 63 et 64). Conseil KiAct distinct, hors exigence B Lab.
- Nouvelle question fr_4 (FR1.3, FR1.4, FR1.5, FR2.2), exigible en Année 0 pour toutes les tailles.
- Textes des questions, précisions et preuves réécrits pour les huit thématiques. Preuves tirées des articles « Evidence Examples » du Knowledge Hub, ou signalées comme sélection KiAct.
- Seuil de 1 % de FR1.2 calculé par industrie (Knowledge Hub, article 43000766216).
- Précisions et preuves présentées en puces courtes (3 à 5 puces, 22 mots au plus).
- Cadrage, mention des chiffres consolidés de toutes les entités contrôlées et nouveau champ facultatif « Sites et pays », repris dans l'export (Knowledge Hub, articles 43000761591 et 43000777719).
- Restitution, suppression du classement « critique », sans base B Lab (toute sous-exigence applicable en Année 0 est due, Knowledge Hub 43000747437). Remplacé par « Condition d'éligibilité » (exigences FR1) et « Délai long » (estimation KiAct).
- Restitution, nouvelle section « Documents attendus » (240 documents exigés par les standards V2.2, filtrés selon la taille, le secteur, l'industrie et le Risk Tool). Statut déduit des réponses, ajustable, enregistré et exporté. Cas particuliers et alternatives masqués par défaut (sélection KiAct), statut « Sans objet ».
- Documents attendus, statut « Démarche B Lab » pour l'accord de certification, la déclaration d'interdépendance, le questionnaire BIA, le profil public, le profil de risque et la documentation d'ensemble. Ces éléments sont produits pendant la certification et ne comptent pas dans la couverture.
- Documents attendus, vue « Grouper par support » (règlement du personnel, politique RH, code de conduite, dispositif de réclamation, analyse des achats, enquête annuelle, page B Corp, procès-verbal annuel). Le regroupement est signalé comme admis par le standard (PSG4.2, GACA1.1, GACA1.3, CA2.1, HR4.2 et ESC5.1, JEDI1.1) ou suggéré par KiAct.
- Noms des thématiques alignés sur les PDF français. Libellés des 19 actions JEDI2 et des 5 types d'action GACA2 repris des PDF.

### Taux de pratiques et de documents
- Restitution, deux taux affichés par deux anneaux et deux barres par thématique, pratiques en place et documents existants. Chaque taux est donné en moyenne des thématiques (poids égal) et en cumul (nombre d'éléments satisfaits sur nombre applicable).
- Les questions applicables sans réponse comptent comme non satisfaites. Seule la réponse « non applicable » sort du dénominateur. Affichage du nombre de questions évaluées.
- Seuils de 70 % et 40 % supprimés, sans base B Lab (V2 n'a ni score ni niveau minimal par thématique). Repères KiAct Prêt (100 %), Proche (à partir de 60 %) et Chantier. Trait de cible à 100 %.
- Exports texte et HTML, index des diagnostics et message de prochaine étape alignés sur ces taux.
- Nouvelle réponse « Ne sait pas », distincte de « Non applicable ». Elle compte comme non satisfaite, n'est pas comptée comme évaluée et alimente une liste « À vérifier » dans les exports.
- Nettoyage du code, constante ANSWERS, variable allTopicAnswered, paramètre inutilisé et trois règles CSS retirés. En-tête adapté aux écrans étroits.
- Documents des actions JEDI2 et GACA2 cochées, statut de départ « À vérifier » et non plus « Existant », une action réalisée ne prouvant pas l'existence du document.
- JEDI1.1, documents filtrés selon le seuil de 50 personnes (1.1.1 et 1.1.3). Le seuil s'applique aux ETP, seule donnée saisie, et le statut « Sans objet » reste ajustable.
- Export imprimable (PDF) aligné sur l'export texte. Ajout des plages de taille, du taux de change, du profil de risque, des documents « Démarche B Lab », « Sans objet » et « Années 3 et 5 », des conditions et des supports possibles.
- Documents attendus, HR4.9 regroupé en une seule évaluation des contrats de service, règlement du personnel et politique RH séparés.

### Export et import des diagnostics
- Export d'un diagnostic en fichier JSON depuis « Mes diagnostics » (bouton Exporter) et depuis la restitution (Télécharger le fichier du diagnostic).
- « Tout exporter » réunit tous les diagnostics du navigateur dans un seul fichier.
- « Importer un fichier » restaure un ou plusieurs diagnostics sur n'importe quel poste. Une version plus récente déjà présente dans le navigateur est conservée. Un fichier d'une autre origine est refusé avec un message.
- Dans un artefact Claude, où les téléchargements sont bloqués, l'export affiche le contenu du fichier avec un bouton « Copier le contenu », et « Coller un export » permet l'import par simple collage.
- Le fichier contient le cadrage, les réponses, le Risk Tool, les menus JEDI et GACA, les statuts ajustés des documents et les notes du mode consultant.

### Cadrage
- Deux statuts : Exploration (entreprise non certifiée) et Recertification (depuis V1.6). Conversion automatique des diagnostics enregistrés (premiere vers Exploration, recert_v2 vers Recertification).
- Taux de change par défaut mis à jour (1 CHF = 1,21 USD au 27.10.2026 ; 1 EUR = 1,12 USD, BCE 15.10.2026), modifiable pour chaque diagnostic et repris dans l'export.
- Libellés de taille en français (Petite, Moyenne, Grande, XL, XXL) et définition B Lab du collaborateur dans l'aide ETP.

### Interface et langue
- Emojis retirés, tutoiement supprimé, alertes natives remplacées par des messages intégrés.
- Tirets cadratins retirés des textes d'interface ; anglicismes courants remplacés (records, Year 0, Living Wage, Large).
- Mention de sauvegarde corrigée : stockage local du navigateur, aucune transmission à un serveur.

## Version 2.0 du 18 juin 2026

Première mise en ligne sur GitHub Pages (Standards B Lab V2.1, Release 2 du 25 août 2025).
