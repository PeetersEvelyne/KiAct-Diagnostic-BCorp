# KiAct · Diagnostic B Corp V2

Outil interne de diagnostic B Corp V2 — KiAct Consulting.

URL en ligne (une fois déployé) :
**https://peetersevelyne.github.io/KiAct-Diagnostic-BCorp/**

---

## Mise en ligne — pas à pas

### 1. Créer le dépôt GitHub

1. Aller sur https://github.com/new
2. Repository name : **`KiAct-Diagnostic-BCorp`**
3. Description : *Outil interne KiAct — Diagnostic B Corp V2*
4. Choisir **Private** ou **Public** (Public est nécessaire pour GitHub Pages
   sur un compte gratuit, mais le contenu reste un outil interne ; aucune donnée
   client n'est dans le code, juste des questions et exemples de preuves)
5. **NE PAS** cocher "Add a README" (le dépôt doit être vide)
6. Cliquer sur **Create repository**

### 2. Uploader les fichiers

Sur la page du dépôt fraîchement créé, cliquer sur le lien
**"uploading an existing file"** (ou aller dans l'onglet *Add file* →
*Upload files*).

**Glisser-déposer dans la zone d'upload** :
- le fichier `index.html`
- le fichier `.nojekyll` (caché, mais important)
- le **dossier `assets/` complet** (faire glisser le dossier entier)

Puis :
- Commit message : `Premier déploiement`
- Cliquer sur **Commit changes**

### 3. Activer GitHub Pages

1. Dans le dépôt, aller sur l'onglet **Settings** (en haut à droite)
2. Dans le menu de gauche : **Pages**
3. Section "Build and deployment" :
   - **Source** : *Deploy from a branch*
   - **Branch** : *main* — dossier `/ (root)`
   - Cliquer sur **Save**
4. Attendre 1 à 2 minutes
5. L'URL apparaît en haut de la page Pages :
   `https://peetersevelyne.github.io/KiAct-Diagnostic-BCorp/`

### 4. Vérifier que ça marche

Ouvrir l'URL dans le navigateur. L'outil doit s'afficher exactement comme
dans l'aperçu Claude.ai.

---

## Comment l'utiliser en RDV

1. Ouvre l'URL dans Chrome ou Safari sur ton laptop
2. **Mets le navigateur en favori / signet** pour l'ouvrir vite
3. Crée un nouveau diagnostic, renseigne le contexte client (taille, secteur,
   activité d'investissement si services à faible empreinte)
4. Déroule les questions pendant l'entretien
5. Les données sont **sauvegardées automatiquement** dans le navigateur

**Important sur le stockage** :
- Les diagnostics sont enregistrés dans **localStorage** — la mémoire du
  navigateur, sur l'ordinateur que tu utilises
- Si tu changes d'ordinateur, les diagnostics ne suivent pas
- Si tu **vides l'historique** ou les **cookies** du navigateur, les diagnostics
  sont perdus
- Mode navigation privée : les données disparaissent à la fermeture
- **Recommandation** : utilise toujours le même navigateur (Chrome ou Safari)
  pour les RDV, et fais attention à ne pas effacer les données du site

---

## Mise à jour du contenu

Quand tu veux faire évoluer l'outil (nouvelles questions, corrections, etc.) :

1. Reviens dans une conversation avec Claude
2. Demande les modifications dans le fichier `.jsx` source
3. Claude te regénérera un dossier compilé prêt à uploader
4. Sur GitHub, refais l'upload des fichiers (l'ancienne version sera écrasée)

---

## Structure du dossier

```
KiAct-Diagnostic-BCorp/
├── index.html                  Page d'accueil (point d'entrée)
├── .nojekyll                   Indispensable pour GitHub Pages
└── assets/
    ├── index-XXXX.js           Code compilé (~340 Ko)
    ├── index-XXXX.css          Styles
    └── favicon-XXXX.svg        Icône d'onglet
```

---

## Référentiel

L'outil est aligné sur les **B Lab Standards V2** — référence officielle
récupérée du Knowledge Hub B Lab (Release 2, 25 août 2025, Standard v2.1).

7 thématiques : PSG, FW, JEDI, HR, CA, ESC, GACA — plus les 3 Foundation
Requirements (FR1.1/1.2, FR2.1, FR3.1 Risk Tool).

L'outil prend en compte les règles de **taille** (Micro/Petite/Moyenne/Grande/
XL/XXL), de **secteur** (services à faible/forte empreinte, fabrication,
agriculture, vente), et l'**activité d'investissement** comme sous-filtre des
services à faible empreinte.

---

© KiAct Consulting — outil interne
