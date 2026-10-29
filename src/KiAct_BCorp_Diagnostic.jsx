import React, { useState, useMemo, useEffect } from "react";

/* ============================================================================
   KiAct · Diagnostic B Corp V2
   Outil de RDV piloté par le consultant — adaptatif par taille et secteur
   Aligné sur B Lab Standards V2.2 (20 février 2026), mises à jour vérifiées le 29 octobre 2026
   ============================================================================ */

// Mention de version affichée dans l'outil et les rapports
const STANDARDS_LABEL = "Standards B Lab V2.2 du 20 février 2026, mises à jour vérifiées le 29 octobre 2026";

// ----- Référentiel B Lab : tailles -------------------------------------------
// Table officielle B Lab V2 (effective novembre 2025).
// Règle "Lesser of Two" : la catégorie finale = la plus petite des deux entre
// la catégorie ETP et la catégorie revenu (en USD).
// Source : kb.bimpactassessment.net — table officielle.
const SIZE_TIERS = [
  { id: "individuelle", label: "Sans collaborateur·ice",
    rangeFTE: "0 ETP", minFTE: 0, maxFTE: 0,
    rangeUSD: "—", minUSD: null, maxUSD: null, order: 0 },
  { id: "micro", label: "Micro",
    rangeFTE: "1 à 9 ETP", minFTE: 0.01, maxFTE: 9.99,
    rangeUSD: "< 2 M USD", minUSD: 0, maxUSD: 2, order: 1 },
  { id: "petite", label: "Petite",
    rangeFTE: "10 à 49 ETP", minFTE: 10, maxFTE: 49.99,
    rangeUSD: "2 à 10 M USD", minUSD: 2, maxUSD: 10, order: 2 },
  { id: "moyenne", label: "Moyenne",
    rangeFTE: "50 à 249 ETP", minFTE: 50, maxFTE: 249.99,
    rangeUSD: "10 à 75 M USD", minUSD: 10, maxUSD: 75, order: 3 },
  { id: "grande", label: "Grande",
    rangeFTE: "250 à 999 ETP", minFTE: 250, maxFTE: 999.99,
    rangeUSD: "75 à 350 M USD", minUSD: 75, maxUSD: 350, order: 4 },
  { id: "xl", label: "XL",
    rangeFTE: "1 000 à 9 999 ETP", minFTE: 1000, maxFTE: 9999.99,
    rangeUSD: "350 M à 1.5 Mrd USD", minUSD: 350, maxUSD: 1500, order: 5 },
  { id: "xxl", label: "XXL",
    rangeFTE: "10 000 ETP et plus", minFTE: 10000, maxFTE: Infinity,
    rangeUSD: "> 1.5 Mrd USD", minUSD: 1500, maxUSD: Infinity, order: 6 },
];

// Taux de change par défaut (USD pour 1 unité de devise). La table B Lab est en USD.
// Valeurs indicatives, modifiables pour chaque diagnostic (ctx.fxRate).
// CHF : 1.21 USD, cours du 27 octobre 2026 (poundsterlinglive.com, clôture 1.2076).
// EUR : 1.12 USD, taux de référence BCE du 15 octobre 2026 (1.1208).
const FX = {
  CHF: 1.21,
  EUR: 1.12,
  USD: 1.00,
};
const FX_SOURCE_LABEL = "Taux par défaut au 27 octobre 2026 pour le CHF et au 15 octobre 2026 pour l'EUR (taux de référence BCE).";

// Taux effectivement appliqué pour un diagnostic : saisie manuelle sinon défaut
const getFxRate = (ctx) => {
  const cur = ctx.revenueCurrency || "CHF";
  if (cur === "USD") return 1;
  const manual = parseFloat(String(ctx.fxRate ?? "").replace(",", "."));
  if (!isNaN(manual) && manual > 0) return manual;
  return FX[cur] || 1;
};

// Helpers de catégorisation
const sizeFromFTE = (ftes) => {
  const num = parseFloat(String(ftes).replace(",", "."));
  if (isNaN(num) || num < 0) return null;
  return SIZE_TIERS.find((t) => num >= t.minFTE && num <= t.maxFTE) || null;
};

const sizeFromRevenueUSD = (revenueMillionsUSD) => {
  const num = parseFloat(String(revenueMillionsUSD).replace(",", "."));
  if (isNaN(num) || num < 0) return null;
  // On ignore "Sans collaborateur·ice" qui n'a pas de seuil revenu
  return SIZE_TIERS.slice(1).find((t) => num >= t.minUSD && num < t.maxUSD)
      || (num >= 1500 ? SIZE_TIERS.find((t) => t.id === "xxl") : null);
};

// Règle "Lesser of Two" : la plus petite des deux catégories
const lesserOfTwo = (sizeA, sizeB) => {
  if (!sizeA && !sizeB) return null;
  if (!sizeA) return sizeB;
  if (!sizeB) return sizeA;
  return sizeA.order <= sizeB.order ? sizeA : sizeB;
};

const SECTORS = [
  { id: "services_faible", label: "Services à faible empreinte", hint: "Conseil, IT, finance, juridique, design, R&D…" },
  { id: "services_forte", label: "Services à forte empreinte", hint: "Nettoyage, hôtellerie, restauration, transport, logistique…" },
  { id: "fabrication", label: "Fabrication", hint: "Industrie, manufacture, transformation" },
  { id: "agriculture", label: "Agriculture / Culture", hint: "Production agricole, élevage, pêche" },
  { id: "vente", label: "Vente en gros / au détail", hint: "Commerce, distribution, commerce de détail" },
];

// Deux parcours seulement, car seuls ces deux statuts modifient les exigences.
// La B Corp certifiée selon les standards V1.6 satisfait FR1.2 en Année 3
// et non en Année 0 (FR1.2, critère 1.2.5, fr.pdf p. 19).
const STATUS_OPTIONS = [
  { id: "exploration", label: "Exploration", hint: "Entreprise non certifiée, en vue d'une première certification" },
  { id: "recert_v6", label: "Recertification", hint: "B Corp certifiée selon les standards V1.6, passage aux standards V2" },
];

// Conversion des statuts des diagnostics enregistrés avant octobre 2026
const migrateCtx = (c) => {
  if (!c) return c;
  const map = { premiere: "exploration", recert_v2: "recert_v6" };
  return map[c.status] ? { ...c, status: map[c.status] } : c;
};
const isRecertV16 = (ctx) => ctx && ctx.status === "recert_v6";
// FR1.2 n'est pas bloquant en Année 0 pour une B Corp V1.6 (critère 1.2.5)
const isCritical = (q, isRecert) => !!q.eligibilite && !(q.fr12 && isRecert);
// Délai long : estimation KiAct (approbation par une instance, cycle de collecte annuel,
// acte notarié). Ce n'est pas une notion B Lab.
const isLongLead = (q) => !!q.delaiLong;
const LONG_LEAD_TITLE = "Estimation KiAct, hors exigence B Lab. Chantier qui demande plusieurs mois (approbation par une instance, collecte annuelle ou acte notarié).";

// ----- Échelles de réponse ---------------------------------------------------
// Deux échelles distinctes selon la nature de la question :
//
// PRATIQUE (par défaut) — pour les sujets où la substance ET la documentation
// comptent séparément. Une entreprise peut bien faire les choses sans les avoir
// formalisées ; B Lab exige les deux. Capture les 4 cas de figure.
//
// FACTUELLE — pour les sujets binaires (statuts modifiés ou pas, éligibilité,
// validation SBTi, vérification tiers, etc.). 3 niveaux suffisent.

const ANSWERS_PRACTICE = {
  fait_doc: { id: "fait_doc", label: "En place + documenté", short: "Fait + documenté", value: 1.0, color: "#388D54", category: "acquis" },
  fait_seul: { id: "fait_seul", label: "Pratiqué, mais non formalisé", short: "Fait, sans preuves", value: 0.6, color: "#4583D4", category: "a_formaliser" },
  partiel: { id: "partiel", label: "Partiel ou ad hoc", short: "Partiel", value: 0.3, color: "#F59E0B", category: "a_construire" },
  non: { id: "non", label: "Pas en place", short: "Non", value: 0, color: "#DC2626", category: "a_construire" },
  ns: { id: "ns", label: "Ne sait pas", short: "À vérifier", value: 0, color: "#6B7670", category: "a_verifier" },
  na: { id: "na", label: "Non applicable", short: "N.A.", value: null, color: "#9CA3AF", category: "na" },
};

const ANSWERS_FACTUAL = {
  oui: { id: "oui", label: "Oui", short: "Oui", value: 1.0, color: "#388D54", category: "acquis" },
  partiel: { id: "partiel", label: "Partiellement / zone grise", short: "Partiel", value: 0.5, color: "#F59E0B", category: "a_construire" },
  non: { id: "non", label: "Non", short: "Non", value: 0, color: "#DC2626", category: "a_construire" },
  ns: { id: "ns", label: "Ne sait pas", short: "À vérifier", value: 0, color: "#6B7670", category: "a_verifier" },
  na: { id: "na", label: "Non applicable", short: "N.A.", value: null, color: "#9CA3AF", category: "na" },
};

// Helper : retourne l'échelle applicable à une question
const getAnswerSet = (q) => (q.kind === "factual" ? ANSWERS_FACTUAL : ANSWERS_PRACTICE);
const getAnswerOpt = (q, answerId) => getAnswerSet(q)[answerId];


// ----- Applicabilité des questions ------------------------------------------
// Chaque question porte la liste des sous-exigences B Lab qu'elle couvre (codes).
// Elle s'affiche si au moins une de ces sous-exigences est due en Année 0 pour
// la taille, le secteur et l'industrie du diagnostic, après prise en compte des
// réponses au Risk Tool. Le calcul s'appuie sur BLAB_SUBREQS, extrait des PDF
// B Lab V2.2. Les sous-exigences des Années 3 et 5 ne sont pas comptées ; celles
// déclenchées par le Risk Tool sont listées à part comme « À anticiper ».
// La fonction matches() est définie après le référentiel B Lab (voir plus bas).

// ----- Charges consultant par défaut -----------------------------------------
// Système de calibration à 3 dimensions :
//   1. Type de livrable : document / processus_simple / processus_complet
//   2. Taille entreprise : petite / moyenne / grande
//   3. Mode : kiact ("Je le fais") / piloting ("Je pilote")
//
// Logique métier (Evelyne Peeters, KiAct) :
// - "document"           = Rédaction d'un document court (politique, charte, déclaration)
// - "processus_simple"   = Document + déploiement léger (1 atelier, 1 outil simple)
// - "processus_complet"  = Méthode + outils + déploiement + suivi (politique d'achats,
//                          mesure culture, bilan carbone, audit équité…)
//
// Repères Evelyne :
// - Politique RH (FW), PME = 1h KiAct + 2h client = "document" en taille petite
// - Politique RH (FW), Grand groupe = 10j KiAct = "document" en taille grande
// - Bilan carbone Scopes 1+2+3, PME = 9j KiAct = override spécifique
//
// Unité : jours (1 jour = 8h). 0.125j = 1h, 0.25j = 2h, 0.5j = 4h.

const DEFAULT_CHARGES = {
  document: {
    petite:  { kiact: 0.125, piloting: 0.0625 },  // 1h / 30min
    moyenne: { kiact: 0.5,   piloting: 0.25 },     // 4h / 2h
    grande:  { kiact: 2.0,   piloting: 1.0 },      // 2j / 1j
  },
  processus_simple: {
    petite:  { kiact: 0.5,   piloting: 0.25 },     // 4h / 2h
    moyenne: { kiact: 1.0,   piloting: 0.5 },      // 1j / 4h
    grande:  { kiact: 5.0,   piloting: 2.5 },      // 5j / 2.5j
  },
  processus_complet: {
    petite:  { kiact: 1.0,   piloting: 0.5 },      // 1j / 4h
    moyenne: { kiact: 3.0,   piloting: 1.5 },      // 3j / 1.5j
    grande:  { kiact: 10.0,  piloting: 5.0 },      // 10j / 5j
  },
};

// Overrides par question — uniquement pour les chantiers très spécifiques
// (charges ne suivant pas la grille standard, comme le bilan carbone)
// Format : { questionId: { taille: { kiact, piloting } } }
const QUESTION_CHARGE_OVERRIDES = {
  // Bilan carbone Scopes 1+2+3 : 6j bilan + 3j feuille de route = 9j PME (Evelyne)
  // Charge piloting = uniquement la part KiAct si externalisé/mixte
  ca_1: {
    petite:  { kiact: 9.0,  piloting: 4.0 },
    moyenne: { kiact: 12.0, piloting: 6.0 },
    grande:  { kiact: 25.0, piloting: 12.0 },
  },
  // Validation SBTi : dossier scientifique + accompagnement (uniquement Grandes)
  ca_4: {
    grande:  { kiact: 4.0, piloting: 2.0 },
  },
  // Plan transition climatique complet (CA2.3) : Grandes uniquement
  ca_5: {
    grande:  { kiact: 5.0, piloting: 2.5 },
  },
};

// Classification par défaut de chaque question selon le type de livrable
// (peut être ajusté pendant le diagnostic via le toggle dans le panneau consultant)
const DEFAULT_LIVRABLE_TYPE = {
  // === FONDATIONS ===
  fr_1a: "document",          // Cartographie revenus exclus
  fr_1b: "document",          // Cartographie revenus formalisée
  fr_2: "document",           // Mission Lock juridique (charge externe avocat)
  fr_3: "document",           // Évaluation des risques (Risk Tool B Lab)
  // === PSG ===
  psg_1: "document",          // Raison d'être publique
  psg_2: "processus_complet", // Mécanisme/politique gouvernance parties prenantes
  psg_3: "processus_complet", // Analyse de matérialité
  psg_4: "processus_simple",  // Procédure réclamations
  psg_8: "processus_complet", // Procédure réclamations + reporting (Grande, PSG3.3/3.4)
  psg_9: "processus_complet", // Sujets matériels hors standard, cibles + report (PSG2.4)
  psg_5: "document",          // Politique marketing responsable
  psg_6: "processus_simple",  // Supervision direction (agenda + procédure)
  psg_7: "processus_simple",  // Rapport public ESG annuel (mise en forme)
  // === FW ===
  fw_1: "document",           // Contrats signés
  fw_2: "document",           // Délai prévenance horaires variables
  fw_3: "document",           // Politique no wage history
  fw_4: "document",           // Information salariés calcul salaire
  fw_5: "processus_simple",   // Calcul écart F/H + publication
  fw_6: "processus_complet",  // Living Wage 100%
  fw_7: "processus_simple",   // Représentation salariés
  fw_8: "processus_complet",  // Collecte feedback structurée
  fw_9: "processus_complet",  // Mesure culture + plan amélioration
  // === JEDI ===
  jedi_1: "processus_simple",  // Collecte données diversité (JEDI1.1)
  jedi_2: "processus_complet", // Menu des 19 actions JEDI2
  // === HR ===
  hr_1: "document",            // Engagement public droits humains
  hr_2: "processus_complet",   // Identification & publication enjeux saillants
  hr_3: "processus_complet",   // Stratégie droits humains
  hr_4: "processus_complet",   // Processus remontée impacts
  hr_5: "processus_simple",    // Critères droits humains dans achats
  hr_6: "processus_simple",    // Living wage prestataires
  hr_7: "processus_complet",   // Collaboration fournisseurs prioritaires
  hr_8: "processus_simple",    // Évaluation impacts DH clients/projets (HR3.3)
  hr_9: "processus_simple",    // Évaluation impacts DH investissements (HR3.4)
  // === CA ===
  ca_1: "processus_complet",   // Bilan carbone Scopes 1+2+3 (override actif)
  ca_2: "processus_simple",    // Vérification GES par tiers
  ca_3: "document",            // Plan d'action climatique simple (Petites/Moyennes)
  ca_4: "processus_complet",   // Validation SBTi (override actif)
  ca_5: "processus_complet",   // Plan transition climatique complet (override actif)
  ca_6: "processus_simple",    // Mise en œuvre & suivi plan climat
  ca_7: "document",             // Reporting annuel progrès climat
  // === ESC ===
  esc_1: "processus_complet",  // Suivi déchets + plan
  esc_2: "processus_complet",  // Suivi énergie
  esc_3: "processus_simple",   // Évaluation zones stress hydrique
  esc_4: "processus_complet",  // Stratégie environnementale
  esc_5: "processus_complet",  // Circularité produits
  esc_6: "processus_simple",   // Actions concrètes environnement
  esc_7: "processus_complet",  // Politique achats durables (= ton exemple Evelyne)
  esc_8: "processus_simple",   // Suivi bien-être animal (ESC1.6)
  esc_9: "processus_simple",   // Évaluation impacts env. clients/projets (ESC2.6)
  esc_10: "processus_simple",  // Évaluation impacts env. investissements (ESC2.7)
  esc_11: "processus_complet", // Suivi consommation/prélèvement d'eau (ESC1.3)
  esc_12: "processus_simple",  // Évaluation impacts env. opérations + chaîne (ESC1.7)
  esc_13: "processus_complet", // Suivi des flux de matières entrant (ESC3.1)
  esc_14: "processus_complet", // Engagement/suivi fournisseurs environnement (ESC5.3)
  // === GACA ===
  gaca_1: "document",          // Politique lobbying
  gaca_2: "processus_simple",  // Transparence contributions politiques
  gaca_3: "processus_complet", // Menu des 5 actions collectives GACA2
  gaca_4: "document",          // Politique fiscalité responsable
};

// Mappe la taille B Lab effective vers les 3 paliers du calcul de charge
const sizeToBucket = (sizeId) => {
  if (!sizeId) return "petite"; // par défaut
  if (["individuelle", "micro", "petite"].includes(sizeId)) return "petite";
  if (sizeId === "moyenne") return "moyenne";
  // grande, xl, xxl
  return "grande";
};

// Récupère la charge par défaut pour une question donnée.
// Tient compte des standards utilisateur (priorité sur les valeurs système).
// Tient compte du type de livrable ajusté pour cette question (consultantNote.livrableType).
const getDefaultCharge = (questionId, mode, sizeBucket, livrableType, userStandards = null) => {
  if (mode === "client") return 0;
  if (!mode) return null;
  if (!livrableType) return null;
  if (!sizeBucket) sizeBucket = "petite";

  // Priorité 1 : override par question dans les standards utilisateur
  if (userStandards?.questionOverrides?.[questionId]?.[sizeBucket]?.[mode] !== undefined) {
    return userStandards.questionOverrides[questionId][sizeBucket][mode];
  }
  // Priorité 2 : override système par question (cas spéciaux comme bilan carbone)
  if (QUESTION_CHARGE_OVERRIDES[questionId]?.[sizeBucket]?.[mode] !== undefined) {
    return QUESTION_CHARGE_OVERRIDES[questionId][sizeBucket][mode];
  }
  // Priorité 3 : standards utilisateur par type de livrable + taille
  if (userStandards?.typeDefaults?.[livrableType]?.[sizeBucket]?.[mode] !== undefined) {
    return userStandards.typeDefaults[livrableType][sizeBucket][mode];
  }
  // Priorité 4 : valeur par défaut système par type + taille
  return DEFAULT_CHARGES[livrableType]?.[sizeBucket]?.[mode] ?? null;
};

// Convertit une valeur en jours en libellé lisible (ex: 0.125 → "1h", 0.25 → "2h", 1.0 → "1j")
const formatCharge = (j) => {
  if (j === null || j === undefined) return "—";
  const n = parseFloat(j);
  if (isNaN(n)) return "—";
  if (n === 0) return "0";
  if (n < 1) {
    const hours = n * 8;
    if (Math.abs(hours - Math.round(hours)) < 0.05) return `${Math.round(hours)}h`;
    return `${hours.toFixed(1)}h`;
  }
  if (Math.abs(n - Math.round(n)) < 0.05) return `${Math.round(n)}j`;
  return `${n.toFixed(2).replace(/\.?0+$/, "")}j`;
};

// Libellé court d'un type de livrable
const LIVRABLE_LABELS = {
  document: "Document",
  processus_simple: "Processus simple",
  processus_complet: "Processus complet",
};

// ----- Référentiel Risk Tool (FR3.1) ----------------------------------------
// Grille KiAct alignée sur les 14 questions officielles B Lab FR3.1.a à FR3.1.n
// Source : plateforme B Impact (Setup → Profil de risque)
// Reformulation pédagogique KiAct — non un calque officiel
// 4 catégories officielles B Lab : Employés / Produits / Opérations / Réputation
const RISK_TOOL_SECTIONS = [
  {
    id: "employes",
    label: "Vos employés",
    icon: "◆",
    description: "Risques potentiels liés à votre personnel.",
    questions: [
      {
        id: "risk_emp_1",
        ref: "FR3.1.a",
        question: "Au cours de l'année fiscale écoulée, votre entreprise a-t-elle engagé plus de prestataires indépendants qu'elle n'a de salariés ?",
        signal: "La question vise la précarité de l'emploi liée au recours à des prestataires indépendants plutôt qu'à des salariés. Seuls comptent les prestataires qui travaillent plus de 20 heures par semaine pendant plus de six mois ou pour une durée indéterminée, et ceux dont les heures ne sont pas suivies sont inclus par défaut. Le décompte peut se faire en effectif ou en équivalents temps plein, avec la même méthode pour les deux catégories. Le périmètre couvre les activités propres de l'entreprise.",
      },
    ],
  },
  {
    id: "produits",
    label: "Vos produits",
    icon: "◆",
    description: "Impacts sociaux et environnementaux potentiels de vos produits et services.",
    questions: [
      {
        id: "risk_prod_1",
        ref: "FR3.1.b",
        question: "Au cours de l'année fiscale écoulée, votre entreprise a-t-elle généré au moins 10 % de son chiffre d'affaires à partir d'un produit de consommation dont les impacts négatifs sur la santé ont été reconnus par un gouvernement national ou une instance intergouvernementale ?",
        signal: "B Lab cite l'alcool au-delà de 1,2 % d'alcool par volume, les produits dont les sucres libres atteignent 22,5 % du poids, les viandes rouges transformées, les peintures au plomb et les réseaux sociaux. Les médicaments sont exclus, tout comme les produits destinés aux entreprises plutôt qu'aux consommateurs individuels. La reconnaissance peut venir d'un organisme public du pays de l'entreprise ou du pays de consommation, ou d'une instance comme l'Organisation mondiale de la santé. Le périmètre couvre les activités propres de l'entreprise, en tant que fabricant, grossiste ou détaillant.",
      },
      {
        id: "risk_prod_2",
        ref: "FR3.1.c",
        question: "Au cours de l'année fiscale écoulée, votre entreprise a-t-elle distribué un produit numérique utilisant l'intelligence artificielle ?",
        signal: "Distribuer signifie vendre, concéder sous licence, monétiser ou mettre à disposition sous toute autre forme un produit ou un service à des utilisateurs externes. Un produit numérique peut être destiné aux consommateurs ou à d'autres entreprises, comme une plateforme, un logiciel en tant que service ou une application. Les produits physiques sont exclus, même lorsqu'ils intègrent de l'intelligence artificielle. Aucun seuil de chiffre d'affaires ne s'applique et le périmètre couvre les activités propres de l'entreprise.",
      },
      {
        id: "risk_prod_3",
        ref: "FR3.1.d",
        question: "Au cours de l'année fiscale écoulée, votre entreprise a-t-elle généré au moins 10 % de son chiffre d'affaires de la vente de produits chimiques dangereux ?",
        signal: "Un produit chimique dangereux est une substance ou un mélange qui présente un danger physique, sanitaire ou environnemental, selon une définition adaptée du règlement CE n° 1272/2008. Sont notamment visés les produits inflammables ou explosifs, les substances cancérogènes, mutagènes ou toxiques pour la reproduction et les produits nocifs pour la vie aquatique. La vente s'entend comme la vente de produits finis par le fabricant, le grossiste ou le détaillant. Le périmètre couvre les activités propres de l'entreprise.",
      },
      {
        id: "risk_prod_4",
        ref: "FR3.1.e",
        question: "Au cours de l'année fiscale écoulée, votre entreprise a-t-elle généré au moins 10 % de son chiffre d'affaires de la vente de produits ou d'emballages plastiques à usage unique en matériaux vierges non renouvelables, ou de produits conditionnés dans de tels emballages, fabriqués par elle ou pour son compte ?",
        signal: "La question couvre trois cas, à savoir les produits plastiques à usage unique, les emballages plastiques à usage unique et les produits vendus dans ces emballages. Les matériaux vierges non renouvelables désignent par exemple un plastique fabriqué sans contenu recyclé. Seuls les emballages primaires et secondaires comptent, et les emballages utilisés uniquement pour l'expédition peuvent être exclus. Le périmètre couvre les activités propres de l'entreprise et la production qu'elle externalise.",
      },
      {
        id: "risk_prod_5",
        ref: "FR3.1.f",
        question: "Au cours de l'année fiscale écoulée, votre entreprise a-t-elle généré au moins 10 % de son chiffre d'affaires de la vente de produits chimiques agricoles, à l'exclusion des pesticides et des engrais d'origine naturelle ?",
        signal: "Sont visés les engrais azotés ou phosphatés, les pesticides, les autres produits chimiques à usage agricole et les produits antiparasitaires domestiques. Les pesticides et engrais d'origine naturelle sont exclus lorsqu'ils proviennent de plantes, d'animaux, de micro-organismes ou de minéraux sans procédé chimique, comme l'huile de neem ou la citronnelle. Une réponse « oui » à cette question implique aussi une réponse « oui » à FR3.1.d. Le périmètre couvre les activités propres de l'entreprise.",
      },
    ],
  },
  {
    id: "operations",
    label: "Vos opérations",
    icon: "◆",
    description: "Activités principales et leurs impacts sur l'environnement et les communautés.",
    questions: [
      {
        id: "risk_ops_1",
        ref: "FR3.1.g",
        question: "Au cours de l'année fiscale écoulée, les activités propres de votre entreprise ont-elles eu des impacts négatifs potentiels sur les droits ou les terres de peuples autochtones ?",
        signal: "B Lab cite en exemple l'industrie minière, la construction et l'agriculture industrielle. Les terres concernées sont celles dont des peuples autochtones ont la propriété légale ou coutumière ou l'usage, y compris lorsqu'elles font l'objet d'un litige. Les droits sont ceux de la Déclaration des Nations unies sur les droits des peuples autochtones et du droit local, et les actions qui visent à les protéger sont exclues. Le périmètre couvre les activités propres de l'entreprise.",
      },
      {
        id: "risk_ops_2",
        ref: "FR3.1.h",
        question: "Au cours des trois dernières années, votre entreprise a-t-elle enregistré un accident mortel ou fait l'objet d'une sanction en matière de santé et de sécurité ?",
        signal: "Un accident mortel est un décès causé par un incident ou une exposition liés au travail. Une sanction peut être financière, comme une amende, ou opérationnelle, comme une restriction ou une suspension d'activité. La question concerne tout collaborateur ou toute collaboratrice inclus ou susceptible d'être inclus dans le périmètre de certification. Le périmètre couvre les activités propres de l'entreprise.",
      },
      {
        id: "risk_ops_3",
        ref: "FR3.1.i",
        question: "Au cours de l'année fiscale écoulée, votre entreprise a-t-elle fabriqué ou sous-traité la fabrication de produits principalement composés de matériaux issus des industries extractives ?",
        signal: "Les industries extractives tirent du sol des matières comme le pétrole, les métaux, les minéraux et les granulats. Sont visés par exemple les produits principalement en métal ou en plastique, les équipements électroniques, les véhicules et les batteries. Le composant principal peut être déterminé selon sa fonction, son volume ou sa valeur, comme le lithium d'une batterie, le sable d'un matériau de construction ou l'or d'un composant électronique. Le périmètre couvre les activités propres de l'entreprise et la production qu'elle externalise.",
      },
      {
        id: "risk_ops_4",
        ref: "FR3.1.j",
        question: "Au cours des trois dernières années, les activités de votre entreprise ont-elles directement impliqué une conversion d'écosystèmes susceptible d'entraîner une perte d'habitat, une érosion des sols ou une diminution de la biodiversité ?",
        signal: "Sont visés par exemple le défrichement de forêts pour des plantations, l'ouverture d'une mine dans une zone boisée, l'urbanisation de zones humides ou la création de zones industrielles sur des terrains non aménagés. L'usage de terres défrichées ou dégradées depuis longtemps n'est en général pas considéré comme une conversion. Il en va de même pour l'extension d'activités dans une zone déjà urbanisée ou industrielle. Le périmètre couvre les activités propres de l'entreprise.",
      },
      {
        id: "risk_ops_5",
        ref: "FR3.1.k",
        question: "Au cours de l'année fiscale écoulée, votre entreprise a-t-elle utilisé des produits chimiques dangereux dans ses principaux processus de production ?",
        signal: "Cette question porte sur l'usage de produits chimiques dangereux, alors que FR3.1.d porte sur leur vente. Les processus principaux comprennent la fabrication, le nettoyage lié à la production, l'agriculture, la transformation, l'assemblage et toute activité essentielle à la fourniture des produits ou services principaux. La définition des produits chimiques dangereux est la même que pour FR3.1.d et aucun seuil de chiffre d'affaires ne s'applique. Le périmètre couvre les activités propres de l'entreprise.",
      },
      {
        id: "risk_ops_6",
        ref: "FR3.1.l",
        question: "Au cours de l'année fiscale écoulée, votre entreprise a-t-elle mené une activité de production à forte consommation d'eau dans une zone à risque hydrique ?",
        signal: "Une zone à risque hydrique présente des enjeux de disponibilité, de qualité, de quantité ou d'accès à l'eau, ou des enjeux réglementaires et de partage de la ressource avec les communautés. B Lab cite comme activités à forte consommation d'eau l'agriculture, le textile, les boissons, la pharmacie, les produits forestiers, les semi-conducteurs, les centres de données, les métaux et l'exploitation minière. L'entreprise peut s'appuyer sur des références sectorielles, son empreinte hydrique ou le rapport entre sa consommation d'eau et sa production. Le périmètre couvre les activités propres de l'entreprise.",
      },
    ],
  },
  {
    id: "reputation",
    label: "Votre réputation",
    icon: "◆",
    description: "Risques liés aux pratiques de la chaîne d'approvisionnement et aux allégations marketing.",
    questions: [
      {
        id: "risk_rep_1",
        ref: "FR3.1.m",
        question: "Au cours des trois dernières années, votre entreprise a-t-elle fait l'objet de litiges, de sanctions ou d'allégations publiques de travail forcé dans sa chaîne d'approvisionnement ?",
        signal: "Le travail forcé inclut l'esclavage moderne et le travail des enfants. Une allégation publique doit émaner d'un média, d'une organisation de la société civile, d'un gouvernement, ou d'une lettre ouverte ou pétition signée nommément par au moins cinq personnes. Les publications isolées sur les réseaux sociaux sont exclues, sauf si l'une de ces sources les reprend. Le périmètre est la chaîne d'approvisionnement, c'est-à-dire les prestataires de services pour une entreprise de services.",
      },
      {
        id: "risk_rep_2",
        ref: "FR3.1.n",
        question: "Au cours des trois dernières années, votre entreprise a-t-elle fait l'objet de litiges, de sanctions ou d'allégations publiques pour des pratiques de marketing trompeuses ou d'écoblanchiment ?",
        signal: "Le marketing trompeur recouvre les informations fausses ou les omissions importantes dans les emballages, les publicités, les catalogues, les sites internet ou les réseaux sociaux. L'écoblanchiment désigne une allégation environnementale trompeuse, non fondée, vague ou disproportionnée par rapport aux impacts réels. Les allégations publiques retenues sont les mêmes que pour FR3.1.m, et les publications isolées sur les réseaux sociaux sont exclues. Le périmètre couvre les activités propres de l'entreprise.",
      },
    ],
  },
];

// Helper : compte total des questions Risk Tool (= 14)
const RISK_TOOL_TOTAL_QUESTIONS = RISK_TOOL_SECTIONS.reduce(
  (acc, s) => acc + s.questions.length, 0
);

// Helper : compte les réponses "yes" dans riskAnswers
const countRiskYes = (riskAnswers) => {
  if (!riskAnswers) return 0;
  return Object.values(riskAnswers).filter(v => v === "yes").length;
};

// ----- Référentiel JEDI2 : menu des 19 actions ------------------------------
// Source officielle B Lab : Impact Topic Summary for JEDI (Knowledge Hub,
// article 43000760403, Release 2 — 25 août 2025, basé sur B Lab Standard v2.1)
// JEDI2 fonctionne comme un "menu de choix" : l'entreprise sélectionne et met
// en œuvre un nombre d'actions calibré sur sa taille, parmi 3 ensembles.
const JEDI2_SETS = [
  {
    id: "foundation",
    label: "Socle de base",
    labelEn: "Foundation",
    icon: "◆",
    description: "Ancre l'engagement JEDI au niveau de la direction. Les options portent sur l'engagement public, la formation des équipes dirigeantes, la révision des politiques, la diversité des instances dirigeantes et l'audit d'équité.",
    actions: [
      { ref: "JEDI2.a", label: "L'entreprise s'engage publiquement à respecter les principes JEDI" },
      { ref: "JEDI2.b", label: "L'entreprise renforce les connaissances et les capacités en matière de JEDI au sein des équipes de direction" },
      { ref: "JEDI2.c", label: "L'entreprise examine et met à jour ses politiques existantes en s'appuyant sur les principes JEDI" },
      { ref: "JEDI2.d", label: "La plus haute instance de direction et l'équipe de direction de l'entreprise reflètent la diversité de sa communauté" },
      { ref: "JEDI2.e", label: "L'entreprise réalise un audit d'équité" },
    ],
  },
  {
    id: "workplace",
    label: "Sur le lieu de travail",
    labelEn: "Within the Workplace",
    icon: "◆",
    description: "Rend les pratiques internes plus inclusives. Les options portent sur les groupes d'affinité, l'embauche, le parrainage et le mentorat, le langage inclusif, la représentation des groupes sous-représentés, les congés payés et l'accessibilité des outils internes. Cet ensemble ne s'applique pas à l'entreprise sans collaborateurs.",
    actions: [
      { ref: "JEDI2.f", label: "L'entreprise soutient au moins deux Groupes Ressources d'Employés ou groupes d'affinité" },
      { ref: "JEDI2.g", label: "L'entreprise met en œuvre des pratiques d'embauche inclusives" },
      { ref: "JEDI2.h", label: "L'entreprise offre des opportunités de parrainage et de mentorat à ses salariés" },
      { ref: "JEDI2.i", label: "L'entreprise conçoit et déploie un guide du langage inclusif pour la communication interne" },
      { ref: "JEDI2.j", label: "L'entreprise augmente la proportion de collaborateurs et de collaboratrices issus de groupes sous-représentés afin de refléter la diversité de sa communauté" },
      { ref: "JEDI2.k", label: "L'entreprise offre d'autres types de congés payés que ceux requis par la loi" },
      { ref: "JEDI2.l", label: "Les outils de communication interne de l'entreprise sont conformes aux standards d'accessibilité" },
    ],
  },
  {
    id: "beyond",
    label: "Au-delà du lieu de travail",
    labelEn: "Beyond the Workplace",
    icon: "◆",
    description: "Étend les principes JEDI aux clients, aux fournisseurs et à la société. Les options portent sur l'accessibilité du site internet, la publication du plan d'action, la diversité des prestataires locaux, la communication externe inclusive, l'inclusivité des produits ou services et l'action collective.",
    actions: [
      { ref: "JEDI2.m", label: "Le site internet de l'entreprise est conforme aux standards d'accessibilité" },
      { ref: "JEDI2.n", label: "L'entreprise communique publiquement son plan d'action et ses progrès en matière de JEDI" },
      { ref: "JEDI2.o", label: "L'entreprise encourage la diversité parmi ses prestataires de biens et de services locaux" },
      { ref: "JEDI2.p", label: "L'entreprise conçoit et déploie un guide de communication inclusive et de contenu éthique pour la communication externe" },
      { ref: "JEDI2.q", label: "L'entreprise évalue dans quelle mesure un produit ou un service est inclusif" },
      { ref: "JEDI2.r", label: "L'entreprise revoit la conception d'un produit ou d'un service pour le rendre plus inclusif" },
      { ref: "JEDI2.s", label: "L'entreprise prend part à au moins une action collective visant à promouvoir les principes JEDI" },
    ],
  },
];

// Barème officiel B Lab : nombre d'actions JEDI2 requises par taille et par année
// Référence B Lab : JEDI2.1 (sans collaborateurs) à JEDI2.6 (XL/XXL)
const JEDI2_REQUIREMENTS = {
  individuelle: { ref: "JEDI2.1", y0: 1, y3: 1, y5: 1, sets: ["foundation", "beyond"] },
  micro:        { ref: "JEDI2.2", y0: 2, y3: 3, y5: 3, sets: ["foundation", "workplace", "beyond"] },
  petite:       { ref: "JEDI2.3", y0: 2, y3: 4, y5: 4, sets: ["foundation", "workplace", "beyond"] },
  moyenne:      { ref: "JEDI2.4", y0: 2, y3: 5, y5: 5, sets: ["foundation", "workplace", "beyond"] },
  grande:       { ref: "JEDI2.5", y0: 2, y3: 6, y5: 6, sets: ["foundation", "workplace", "beyond"] },
  xl:           { ref: "JEDI2.6", y0: 2, y3: 7, y5: 7, sets: ["foundation", "workplace", "beyond"] },
  xxl:          { ref: "JEDI2.6", y0: 2, y3: 7, y5: 7, sets: ["foundation", "workplace", "beyond"] },
};

// Total des actions JEDI2 du menu (= 19)
const JEDI2_TOTAL_ACTIONS = JEDI2_SETS.reduce((acc, s) => acc + s.actions.length, 0);

// Helper : compte les actions JEDI2 cochées ("done")
const countJediDone = (jediAnswers) => {
  if (!jediAnswers) return 0;
  return Object.values(jediAnswers).filter(v => v === "done").length;
};

// Helper : récupère le barème JEDI2 pour une taille donnée (avec fallback)
const getJedi2Req = (sizeBucket) => {
  return JEDI2_REQUIREMENTS[sizeBucket] || JEDI2_REQUIREMENTS.petite;
};

// ----- Référentiel GACA2 : menu des 5 actions collectives -------------------
// Source officielle B Lab : Impact Topic Summary for Government Affairs &
// Collective Action (Knowledge Hub, art. 43000759315, Release 2 — 25 août 2025,
// basé sur B Lab Standard v2.1)
// GACA2 fonctionne comme un "menu de choix" : l'entreprise sélectionne et met
// en œuvre un nombre d'actions collectives calibré sur sa taille, parmi 5 types.
const GACA2_ACTIONS = [
  {
    id: "mentorat",
    ref: "GACA2.1a / GACA2.3a",
    icon: "◆",
    label: "Mentorat",
    description: "L'entreprise conseille d'autres acteurs de son secteur, de sa profession ou de sa chaîne de valeur pour faire progresser leur impact social ou environnemental.",
    examples: "Formation, partage de connaissances, retour d'expérience ou partage d'expertise. La partie accompagnée est externe et liée au secteur ou à la chaîne de valeur. Le mentorat n'est pas rémunéré. La partie accompagnée confirme un résultat positif.",
  },
  {
    id: "leadership",
    ref: "GACA2.1e / GACA2.3e",
    icon: "◆",
    label: "Leadership d'opinion",
    description: "L'entreprise pratique le leadership d'opinion pour susciter un changement systémique vers une économie plus équitable, inclusive et régénératrice.",
    examples: "Cours ou conférences dans des établissements d'enseignement, billets de blog ou articles publiés avec d'autres parties prenantes, documents de recherche sur des thèmes sociaux ou environnementaux, connaissances techniques en libre accès.",
  },
  {
    id: "collaboration",
    ref: "GACA2.1c / GACA2.3c",
    icon: "◆",
    label: "Collaboration multipartite",
    description: "L'entreprise travaille avec plusieurs parties prenantes externes pour faire progresser les impacts sociaux ou environnementaux.",
    examples: "Guide sectoriel, infrastructure de recyclage, investissement communautaire conjoint, standardisation de matériels ou groupe de travail sectoriel. Les partenaires peuvent être des associations professionnelles, d'autres entreprises, des organisations de la société civile ou des institutions universitaires. Une entreprise simplement observatrice ou signataire intègre les résultats dans ses activités.",
  },
  {
    id: "recherche",
    ref: "GACA2.1b / GACA2.3b",
    icon: "◆",
    label: "Recherche externe",
    description: "L'entreprise contribue à une recherche externe qui fait progresser les impacts sociaux ou environnementaux.",
    examples: "Contribution financière, contribution en nature ou partage de données, de préférence pour une recherche utile au secteur ou à la chaîne de valeur. La recherche n'est pas conduite par l'équipe interne de recherche et développement.",
  },
  {
    id: "plaidoyer",
    ref: "GACA2.1d / GACA2.3d",
    icon: "◆",
    label: "Plaidoyer pour des politiques publiques",
    description: "L'entreprise promeut une politique publique qui fait progresser les impacts sociaux ou environnementaux.",
    examples: "Soutien à une campagne de plaidoyer, diffusion d'une pétition auprès des parties prenantes, prise de position publique d'un membre de la direction, contribution à une consultation gouvernementale ou participation à un groupe de travail gouvernemental. La simple signature d'une pétition ne suffit pas.",
  },
];

// Barème officiel B Lab : nombre d'actions GACA2 requises par taille et par année
// Référence B Lab : GACA2.1 (sans collaborateurs/micro) à GACA2.5 (XXL)
// Note : GACA2.6 (collaboration multi-parties ou plaidoyer obligatoire) s'ajoute
// pour Large/XL/XXL à partir de l'Année 3.
const GACA2_REQUIREMENTS = {
  individuelle: { ref: "GACA2.1", y0: 1, y3: 1, y5: 1 },
  micro:        { ref: "GACA2.1", y0: 1, y3: 1, y5: 1 },
  petite:       { ref: "GACA2.2", y0: 1, y3: 2, y5: 2 },
  moyenne:      { ref: "GACA2.3", y0: 1, y3: 2, y5: 2 },
  grande:       { ref: "GACA2.4", y0: 2, y3: 2, y5: 2, gaca26: true },
  xl:           { ref: "GACA2.4", y0: 2, y3: 2, y5: 2, gaca26: true },
  xxl:          { ref: "GACA2.5", y0: 2, y3: 4, y5: 4, gaca26: true },
};

// Total des actions GACA2 du menu (= 5)
const GACA2_TOTAL_ACTIONS = GACA2_ACTIONS.length;

// Helper : compte les actions GACA2 cochées ("done")
const countGacaDone = (gacaAnswers) => {
  if (!gacaAnswers) return 0;
  return Object.values(gacaAnswers).filter(v => v === "done").length;
};

// Helper : récupère le barème GACA2 pour une taille donnée (avec fallback)
const getGaca2Req = (sizeBucket) => {
  return GACA2_REQUIREMENTS[sizeBucket] || GACA2_REQUIREMENTS.petite;
};

// ============================================================================
// RÉFÉRENTIEL D'APPLICABILITÉ B LAB V2.2 (extrait des PDF officiels)
// ============================================================================
// Généré automatiquement le 27 octobre 2026 à partir des tableaux « Variables
// en fonction de la piste d'évaluation » des huit PDF B Lab Standards V2.2
// (20 février 2026). Pour chaque sous-exigence :
//   y = année de départ (0, 3 ou 5), p = page du PDF, t = intitulé officiel,
//   a = applicabilité par taille ("*" = tous secteurs, sinon liste de secteurs ;
//       "secteur|@" = seulement les industries listées dans i[secteur]).
// Ne pas modifier à la main : régénérer depuis les PDF en cas de nouvelle version.
const BLAB_SUBREQS = {"CA1.1":{"y":0,"p":23,"t":"L'entreprise dispose d'un processus documenté pour mesurer chaque année ses émissions de gaz à effet de serre sur les scope 1, 2 et 3, et publie les résultats obtenus.","a":{"grande":"*","xl":"*","xxl":"*"}},"CA1.2":{"y":0,"p":34,"t":"L'entreprise fait appel à un organisme tiers indépendant pour vérifier l'inventaire annuel de ses émissions de gaz à effet de serre.","a":{"grande":"*","xl":"*","xxl":"*"}},"CA2.1":{"y":0,"p":39,"t":"L'entreprise dispose d'un plan d'action climatique accessible publiquement.","a":{"individuelle":"*","micro":"*","petite":"*","moyenne":"*"}},"CA2.2":{"y":3,"p":49,"t":"L'entreprise a des objectifs alignés sur les connaissances scientifiques, validés par la Science Based Targets initiative (SBTi) ou vérifiés par un organisme tiers indépe","a":{"grande":"*","xl":"*","xxl":"*"}},"CA2.3":{"y":3,"p":56,"t":"L'entreprise a un plan de transition climatique qui permet d'apporter une juste contribution à l'objectif mondial de zéro émission nette d'ici 2050.","a":{"grande":"*","xl":"*","xxl":"*"}},"CA2.4":{"y":3,"p":65,"t":"L'entreprise consulte ses collaborateurs et collaboratrices ainsi que ses autres parties prenantes pour garantir une transition juste dans son plan de transition climatiq","a":{"grande":["agriculture","fabrication","services_forte","vente"],"xl":["agriculture","fabrication","services_forte","vente"],"xxl":["agriculture","fabrication","services_forte","vente"]}},"CA3.1":{"y":3,"p":73,"t":"Si l'entreprise dispose d'un système de rémunération incitative pour l'équipe de direction, celui-ci intègre des objectifs climatiques.","a":{"grande":["agriculture","fabrication","services_forte","vente"],"xl":["agriculture","fabrication","services_forte","vente"],"xxl":["agriculture","fabrication","services_forte","vente"]}},"CA3.2":{"y":3,"p":78,"t":"L'entreprise utilise le plaidoyer pour soutenir l'objectif mondial de zéro émission nette d'ici 2050.","a":{"xxl":"*"}},"CA3.3":{"y":3,"p":83,"t":"L'entreprise fait progresser son plan d'action climatique et évalue son efficacité.","a":{"individuelle":"*","micro":"*","petite":"*","moyenne":"*"}},"CA3.4":{"y":5,"p":88,"t":"L'entreprise réalise des progrès sur son plan de transition climatique et évalue son efficacité.","a":{"grande":"*","xl":"*","xxl":"*"}},"CA3.5":{"y":5,"p":95,"t":"L'entreprise met en place des actions pour une transition juste.","a":{"grande":["agriculture","fabrication","services_forte","vente"],"xl":["agriculture","fabrication","services_forte","vente"],"xxl":["agriculture","fabrication","services_forte","vente"]}},"CA3.6":{"y":3,"p":100,"t":"L'entreprise rend publics les progrès réalisés dans le cadre de son plan d'action climatique.","a":{"individuelle":"*","micro":"*","petite":"*","moyenne":"*"}},"CA3.7":{"y":5,"p":105,"t":"L'entreprise publie chaque année l'état d'avancement de son plan de transition climatique.","a":{"grande":"*","xl":"*","xxl":"*"}},"ESC1.1":{"y":0,"p":43,"t":"L'entreprise surveille la production de déchets issus de ses activités et leur destination finale.","a":{"micro":["agriculture","fabrication","services_forte","vente"],"petite":["agriculture","fabrication","services_forte","vente"],"moyenne":["agriculture","fabrication","services_forte","vente"],"grande":["agriculture","fabrication","services_forte","vente"],"xl":["agriculture","fabrication","services_forte","vente"],"xxl":["agriculture","fabrication","services_forte","vente"]}},"ESC1.2":{"y":0,"p":52,"t":"L'entreprise surveille sa consommation énergétique.","a":{"micro":["agriculture","fabrication","services_forte","vente"],"petite":["agriculture","fabrication","services_forte","vente"],"moyenne":["agriculture","fabrication","services_forte","vente"],"grande":["agriculture","fabrication","services_forte","vente"],"xl":["agriculture","fabrication","services_forte","vente"],"xxl":["agriculture","fabrication","services_forte","vente"]}},"ESC1.3":{"y":0,"p":58,"t":"L'entreprise surveille sa consommation ou son prélèvement d'eau.","a":{"micro":["agriculture","fabrication","services_forte","vente"],"petite":["agriculture","fabrication","services_forte","vente"],"moyenne":["agriculture","fabrication","services_forte","vente"],"grande":["agriculture","fabrication","services_forte","vente"],"xl":["agriculture","fabrication","services_forte","vente"],"xxl":["agriculture","fabrication","services_forte","vente"]}},"ESC1.4":{"y":0,"p":63,"t":"L'entreprise identifie ses infrastructures dans les zones à risque hydrique et surveille leur consommation ou leur prélèvement d'eau.","a":{"moyenne":["agriculture","fabrication","services_forte","vente"],"grande":["agriculture","fabrication","services_forte","vente"],"xl":["agriculture","fabrication","services_forte","vente"],"xxl":["agriculture","fabrication","services_forte","vente"]}},"ESC1.5":{"y":0,"p":68,"t":"L'entreprise identifie ses infrastructures situées en zone écologiquement sensible ou à proximité, et détermine si elles ont une incidence négative sur ces zones.","a":{"moyenne":["agriculture","fabrication"],"grande":["agriculture","fabrication"],"xl":["agriculture","fabrication"],"xxl":["agriculture","fabrication"]}},"ESC1.6":{"y":0,"p":74,"t":"L'entreprise surveille les conditions de bien-être animal dans ses activités.","a":{"micro":"*","petite":"*","moyenne":"*","grande":"*","xl":"*","xxl":"*"}},"ESC1.7":{"y":0,"p":80,"t":"L'entreprise procède à une évaluation afin d'identifier les impacts environnementaux réels et potentiels liés à ses activités internes et à sa chaîne de valeur.","a":{"moyenne":["agriculture","fabrication","services_forte","vente"],"grande":["agriculture","fabrication","services_forte","vente"],"xl":["agriculture","fabrication","services_forte","vente"],"xxl":["agriculture","fabrication","services_forte","vente"]}},"ESC1.8":{"y":3,"p":95,"t":"L'entreprise partage publiquement ses enjeux environnementaux matériels.","a":{"moyenne":["agriculture","fabrication","services_forte","vente"],"grande":["agriculture","fabrication","services_forte","vente"],"xl":["agriculture","fabrication","services_forte","vente"],"xxl":["agriculture","fabrication","services_forte","vente"]}},"ESC2.1":{"y":3,"p":99,"t":"L'entreprise a mis en place une stratégie pour remédier à ses impacts négatifs réels et potentiels sur l'environnement.","a":{"moyenne":["agriculture","fabrication","services_forte","vente"],"grande":["agriculture","fabrication","services_forte","vente"],"xl":["agriculture","fabrication","services_forte","vente"],"xxl":["agriculture","fabrication","services_forte","vente"]}},"ESC2.2":{"y":3,"p":110,"t":"L'entreprise dispose d'un plan de transition pour la biodiversité visant à arrêter et à inverser la perte de biodiversité causée par ses activités et sa chaîne de valeur.","a":{"moyenne":["agriculture","fabrication|@"],"grande":["agriculture","fabrication|@"],"xl":["agriculture","fabrication","services_forte","vente"],"xxl":["agriculture","fabrication","services_forte","vente"]},"i":{"fabrication":["Mining"]}},"ESC2.3":{"y":3,"p":120,"t":"L'entreprise a mis en place une stratégie de gestion de l'eau qui limite la consommation d'eau dans ses activités et sa chaîne de valeur à des seuils soutenables.","a":{"moyenne":["agriculture","fabrication|@"],"grande":["agriculture","fabrication","services_forte","vente"],"xl":["agriculture","fabrication","services_forte","vente"],"xxl":["agriculture","fabrication","services_forte","vente"]},"i":{"fabrication":["Mining"]}},"ESC2.4":{"y":3,"p":127,"t":"Les politiques et procédures de l'entreprise traitent les enjeux d'impacts environnementaux matériels.","a":{"moyenne":["agriculture","fabrication","services_forte","vente"],"grande":["agriculture","fabrication","services_forte","vente"],"xl":["agriculture","fabrication","services_forte","vente"],"xxl":["agriculture","fabrication","services_forte","vente"]}},"ESC2.5":{"y":3,"p":132,"t":"Les collaborateurs et collaboratrices exerçant des fonctions pertinentes reçoivent les conseils dont ils ont besoin pour mettre en œuvre les politiques et procédures envi","a":{"moyenne":["agriculture","fabrication","services_forte","vente"],"grande":["agriculture","fabrication","services_forte","vente"],"xl":["agriculture","fabrication","services_forte","vente"],"xxl":["agriculture","fabrication","services_forte","vente"]}},"ESC2.6":{"y":0,"p":136,"t":"L'entreprise évalue les impacts environnementaux négatifs potentiels liés à ses prospects organisationnels et aux projets envisagés, et prend les mesures d'atténuation né","a":{"individuelle":["services_faible|@"],"micro":["services_faible|@"],"petite":["services_faible|@"],"moyenne":["services_faible|@"],"grande":["services_faible|@"],"xl":["services_faible|@"],"xxl":["services_faible|@"]},"i":{"services_faible":["Advertising & market research","Architecture design & planning","Book publishing","Civil engineering","Computer programming services","Contracting & building","Data processing & hosting","Design & building","Engineering","Environmental consulting","Film, TV & music production","Landscape services","Legal activities","Management consultant - for-profits","Mobile applications","Other info service activities","Other install & construction","Programming & broadcasting","Publishing - newspapers & magazines","Real estate - leased property","Real estate development","Real estate- fee/contract","Scientific R&D","Social networks & info sharing","Software publishing and SaaS platforms","Telecommunications","Veterinary activities","Web portals"]}},"ESC2.7":{"y":0,"p":152,"t":"L'entreprise évalue les impacts environnementaux négatifs potentiels des investissements, et prend les mesures d'atténuation nécessaires.","a":{"individuelle":["services_faible|@"],"micro":["services_faible|@"],"petite":["services_faible|@"],"moyenne":["services_faible|@"],"grande":["services_faible|@"],"xl":["services_faible|@"],"xxl":["services_faible|@"]},"i":{"services_faible":["Equity investing - Developed Markets","Equity investing - Emerging Markets","Investment advising"]}},"ESC3.1":{"y":0,"p":158,"t":"L'entreprise surveille ses approvisionnements en matériaux.","a":{"grande":["agriculture","fabrication","services_forte","vente"],"xl":["agriculture","fabrication","services_forte","vente"],"xxl":["agriculture","fabrication","services_forte","vente"]}},"ESC3.2":{"y":3,"p":166,"t":"L'entreprise réduit son utilisation de matériaux vierges non renouvelables.","a":{"grande":["agriculture","fabrication","services_forte","vente"],"xl":["agriculture","fabrication","services_forte","vente"],"xxl":["agriculture","fabrication","services_forte","vente"]}},"ESC3.3":{"y":3,"p":171,"t":"Le développement des produits de l'entreprise intègre les principes de circularité.","a":{"petite":["agriculture","fabrication","services_forte","vente"],"moyenne":["agriculture","fabrication","services_forte","vente"],"grande":["agriculture","fabrication","services_forte","vente"],"xl":["agriculture","fabrication","services_forte","vente"],"xxl":["agriculture","fabrication","services_forte","vente"]}},"ESC3.4":{"y":0,"p":211,"t":"L'entreprise comprend les infrastructures de revalorisation disponibles là où elle vend ses produits.","a":{"xl":["agriculture","fabrication","services_forte","vente"],"xxl":["agriculture","fabrication","services_forte","vente"]}},"ESC3.5":{"y":3,"p":215,"t":"L'entreprise prend des mesures pour augmenter la revalorisation de ses produits et emballages après leur fin de vie.","a":{"xl":["agriculture","fabrication","services_forte","vente"],"xxl":["agriculture","fabrication","services_forte","vente"]}},"ESC4.1":{"y":3,"p":220,"t":"L'entreprise met en place des actions pour prévenir ou atténuer ses impacts environnementaux négatifs réels et potentiels.","a":{"petite":["agriculture","fabrication","services_forte","vente"],"grande":["services_faible"],"xl":["services_faible"],"xxl":["services_faible"]}},"ESC4.2":{"y":5,"p":232,"t":"L'entreprise progresse dans sa stratégie environnementale et en évalue l'efficacité.","a":{"moyenne":["agriculture","fabrication","services_forte","vente"],"grande":["agriculture","fabrication","services_forte","vente"],"xl":["agriculture","fabrication","services_forte","vente"],"xxl":["agriculture","fabrication","services_forte","vente"]}},"ESC4.3":{"y":5,"p":242,"t":"L'entreprise progresse dans son plan de transition pour la biodiversité et évalue son efficacité.","a":{"moyenne":["agriculture","fabrication|@"],"grande":["agriculture","fabrication|@"],"xl":["agriculture","fabrication","services_forte","vente"],"xxl":["agriculture","fabrication","services_forte","vente"]},"i":{"fabrication":["Mining"]}},"ESC4.4":{"y":5,"p":247,"t":"L'entreprise progresse dans sa stratégie de gestion de l'eau et évalue son efficacité.","a":{"moyenne":["agriculture","fabrication|@"],"grande":["agriculture","fabrication","services_forte","vente"],"xl":["agriculture","fabrication","services_forte","vente"],"xxl":["agriculture","fabrication","services_forte","vente"]},"i":{"fabrication":["Mining"]}},"ESC4.5":{"y":5,"p":252,"t":"L'entreprise partage publiquement l'efficacité de sa stratégie environnementale.","a":{"xxl":["agriculture","fabrication","services_forte","vente"]}},"ESC5.1":{"y":0,"p":255,"t":"L'entreprise prend en compte les impacts environnementaux réels et potentiels dans ses décisions d'achat.","a":{"individuelle":"*","micro":"*","petite":"*","moyenne":["services_faible","services_forte"]}},"ESC5.2":{"y":0,"p":263,"t":"L'entreprise prend en compte les impacts environnementaux réels et potentiels dans ses décisions d'achat.","a":{"moyenne":["agriculture","fabrication","vente"],"grande":["services_faible"],"xl":["services_faible"],"xxl":["services_faible"]}},"ESC5.3":{"y":0,"p":271,"t":"L'entreprise collabore avec ses fournisseurs pour prévenir ou atténuer leurs impacts environnementaux les plus matériels.","a":{"grande":["agriculture","fabrication","services_forte","vente"],"xl":["agriculture","fabrication","services_forte","vente"],"xxl":["agriculture","fabrication","services_forte","vente"]}},"ESC5.4":{"y":3,"p":279,"t":"L'entreprise dispose d'un plan, défini dans le temps, pour assurer la traçabilité de l'origine de ses matières premières à haut risque ainsi que leurs impacts environneme","a":{"xl":["agriculture","fabrication","vente"],"xxl":["agriculture","fabrication","vente"]}},"ESC5.5":{"y":3,"p":285,"t":"L'entreprise s'approvisionne en matières premières non issues de la déforestation.","a":{"xl":["agriculture","fabrication","vente"],"xxl":["agriculture","fabrication","vente"]}},"ESC5.6":{"y":5,"p":290,"t":"L'entreprise trace une part croissante de ses matières premières à haut risque.","a":{"xl":["agriculture","fabrication","vente"],"xxl":["agriculture","fabrication","vente"]}},"ESC5.7":{"y":5,"p":296,"t":"L'entreprise collabore avec ses fournisseurs pour remédier aux impacts environnementaux liés aux matières premières à haut risque.","a":{"xl":["agriculture","fabrication","vente"],"xxl":["agriculture","fabrication","vente"]}},"FR1.1":{"y":0,"p":15,"t":"L'entreprise remplit les conditions requises pour obtenir la certification B Corp.","a":{"individuelle":"*","micro":"*","petite":"*","moyenne":"*","grande":"*","xl":"*","xxl":"*"}},"FR1.2":{"y":0,"p":18,"t":"L'entreprise n'est pas impliquée de manière significative dans des secteurs incompatibles avec la théorie du changement de B Lab.","a":{"individuelle":"*","micro":"*","petite":"*","moyenne":"*","grande":"*","xl":"*","xxl":"*"}},"FR1.3":{"y":0,"p":26,"t":"L'entreprise respecte les législations locales et nationales.","a":{"individuelle":"*","micro":"*","petite":"*","moyenne":"*","grande":"*","xl":"*","xxl":"*"}},"FR1.4":{"y":0,"p":31,"t":"L'entreprise fournit à B Lab des informations exactes et complètes.","a":{"individuelle":"*","micro":"*","petite":"*","moyenne":"*","grande":"*","xl":"*","xxl":"*"}},"FR1.5":{"y":0,"p":35,"t":"L'entreprise communique avec transparence ses performances par rapport aux standards de B Lab.","a":{"individuelle":"*","micro":"*","petite":"*","moyenne":"*","grande":"*","xl":"*","xxl":"*"}},"FR2.1":{"y":0,"p":39,"t":"L'entreprise adopte les exigences juridiques B Corp dans sa structure d'entreprise ou dans ses documents constitutifs.","a":{"individuelle":"*","micro":"*","petite":"*","moyenne":"*","grande":"*","xl":"*","xxl":"*"}},"FR2.2":{"y":0,"p":44,"t":"L'entreprise signe la déclaration d'interdépendance et s'engage en faveur de la mission collective de la communauté B Corp.","a":{"individuelle":"*","micro":"*","petite":"*","moyenne":"*","grande":"*","xl":"*","xxl":"*"}},"FR3.1":{"y":0,"p":46,"t":"L'entreprise crée un profil de risque et se conforme aux éventuelles sous-exigences supplémentaires.","a":{"petite":"*","moyenne":"*","grande":"*","xl":"*","xxl":"*"}},"FR3.1.a":{"y":0,"p":50,"t":"[Vos salariés] Au cours de l'année fiscale écoulée, l'entreprise a-t-elle engagé plus de prestataires indépendants qu'elle n'a de salariés ?","a":{"petite":"*","moyenne":"*","grande":"*","xl":"*","xxl":"*"}},"FR3.1.b":{"y":0,"p":54,"t":"[Vos produits] Au cours de l’année fiscale écoulée, l’entreprise a-t-elle généré au moins 10/ % de son chiffre d’affaires à partir d’un produit de consommation dont les i","a":{"petite":"*","moyenne":"*","grande":"*","xl":"*","xxl":"*"}},"FR3.1.c":{"y":0,"p":61,"t":"[Vos produits] Au cours de l'année fiscale écoulée, l’entreprise a-t-elle distribué un produit numérique utilisant l'intelligence artificielle ?","a":{"petite":"*","moyenne":"*","grande":"*","xl":"*","xxl":"*"}},"FR3.1.d":{"y":0,"p":68,"t":"[Vos produits] Au cours de l'année fiscale écoulée, l’entreprise a-t-elle généré au moins 10 % de son chiffre d'affaires de la vente de produits chimiques dangereux ?","a":{"petite":"*","moyenne":"*","grande":"*","xl":"*","xxl":"*"}},"FR3.1.e":{"y":0,"p":76,"t":"[Vos produits] Au cours de l’année fiscale écoulée, l’entreprise a-t-elle généré au moins 10 % de son chiffre d’affaires de l’une des activités suivantes ? (i) La vente d","a":{"petite":"*","moyenne":"*","grande":"*","xl":"*","xxl":"*"}},"FR3.1.f":{"y":0,"p":83,"t":"[Vos produits] Au cours de l'année fiscale écoulée, l’entreprise a-t-elle généré au moins 10 % de son chiffre d'affaires dans la vente de produits chimiques agricoles, à","a":{"petite":"*","moyenne":"*","grande":"*","xl":"*","xxl":"*"}},"FR3.1.g":{"y":0,"p":91,"t":"[Vos activités] Au cours de l'année fiscale écoulée, les activités propres à l’entreprise ont-elles eu des impacts négatifs potentiels sur les droits ou les terres des pe","a":{"petite":"*","moyenne":"*","grande":"*","xl":"*","xxl":"*"}},"FR3.1.h":{"y":0,"p":96,"t":"[Vos activités] Au cours des trois dernières années, l'entreprise a-t-elle enregistré un accident mortel ou fait l’objet d’une sanction en matière de santé et sécurité ?","a":{"petite":"*","moyenne":"*","grande":"*","xl":"*","xxl":"*"}},"FR3.1.i":{"y":0,"p":100,"t":"[Vos activités] Au cours de l'année fiscale écoulée, l’entreprise a-t-elle fabriqué ou sous-traité la fabrication de produits principalement composés de matériaux issus d","a":{"petite":"*","moyenne":"*","grande":"*","xl":"*","xxl":"*"}},"FR3.1.j":{"y":0,"p":105,"t":"[Vos activités] Au cours des trois dernières années, les activités de l’entreprise ont-elles directement impliqué une conversion d’écosystèmes susceptible d’entraîner une","a":{"petite":"*","moyenne":"*","grande":"*","xl":"*","xxl":"*"}},"FR3.1.k":{"y":0,"p":116,"t":"[Vos activités] Au cours de l'année fiscale écoulée, l'entreprise a-t-elle utilisé des produits chimiques dangereux dans ses principaux processus de production ?","a":{"petite":"*","moyenne":"*","grande":"*","xl":"*","xxl":"*"}},"FR3.1.l":{"y":0,"p":123,"t":"[Vos activités] Au cours de l'année fiscale écoulée, l’entreprise a-t-elle mené une activité de production à forte consommation d’eau dans une zone à risque hydrique ?","a":{"petite":"*","moyenne":"*","grande":"*","xl":"*","xxl":"*"}},"FR3.1.m":{"y":0,"p":131,"t":"[Votre réputation] Au cours des trois dernières années, l’entreprise a-t-elle fait l'objet de litiges, de sanctions ou d'allégations publiques de travail forcé dans sa ch","a":{"petite":"*","moyenne":"*","grande":"*","xl":"*","xxl":"*"}},"FR3.1.n":{"y":0,"p":137,"t":"[Votre réputation] Au cours des trois dernières années, l’entreprise a-t-elle fait l’objet de litiges, de sanctions ou d’allégations publiques pour des pratiques de marke","a":{"petite":"*","moyenne":"*","grande":"*","xl":"*","xxl":"*"}},"FW1.1":{"y":0,"p":15,"t":"L'entreprise fournit à tous les salariés un contrat de travail ou une lettre d'engagement signés.","a":{"micro":"*","petite":"*","moyenne":"*","grande":"*","xl":"*","xxl":"*"}},"FW1.2":{"y":0,"p":19,"t":"L'entreprise applique un délai de prévenance équitable pour les salariés ayant des emplois du temps variables.","a":{"petite":"*","moyenne":"*","grande":"*","xl":"*","xxl":"*"}},"FW2.1":{"y":0,"p":23,"t":"L'entreprise a pour politique de ne pas demander les antécédents salariaux des candidats et candidates.","a":{"petite":"*","moyenne":"*","grande":"*","xl":"*","xxl":"*"}},"FW2.2":{"y":0,"p":27,"t":"L'entreprise informe les collaborateurs et collaboratrices de la manière dont leur salaire est déterminé et des avantages auxquels ils et elles ont droit.","a":{"micro":"*","petite":"*","moyenne":"*","grande":"*","xl":"*","xxl":"*"}},"FW2.3":{"y":3,"p":31,"t":"L'entreprise dispose d'une grille salariale.","a":{"grande":"*","xl":"*","xxl":"*"}},"FW2.4":{"y":0,"p":35,"t":"L'entreprise calcule son écart de salaire entre les femmes et les hommes.","a":{"grande":"*","xl":"*","xxl":"*"}},"FW2.5":{"y":0,"p":40,"t":"L'entreprise publie son ou ses écarts de salaires entre les hommes et les femmes.","a":{"xl":"*","xxl":"*"}},"FW2.6":{"y":3,"p":44,"t":"L'entreprise élimine l'écart de salaires entre les hommes et les femmes, le réduit ou justifie les raisons pour lesquelles l'écart n'est pas comblé.","a":{"grande":"*","xl":"*","xxl":"*"}},"FW2.7":{"y":5,"p":48,"t":"L'entreprise évalue le salaire égal pour un poste à valeur égale.","a":{"xl":"*","xxl":"*"}},"FW2.8":{"y":3,"p":54,"t":"L'entreprise met en œuvre des pratiques salariales équitables pour ses salariés les moins bien rémunérés.","a":{"micro":"*","petite":"*","moyenne":"*","grande":"*","xl":"*","xxl":"*"}},"FW2.8.a":{"y":3,"p":56,"t":"L'entreprise verse un salaire de subsistance à ses salariés.","a":{"micro":"*","petite":"*","moyenne":"*","grande":"*","xl":"*","xxl":"*"}},"FW2.8.b":{"y":3,"p":70,"t":"L'entreprise verse un salaire négocié collectivement à ses salariés.","a":{"micro":"*","petite":"*","moyenne":"*","grande":"*","xl":"*","xxl":"*"}},"FW2.8.c":{"y":3,"p":74,"t":"L'entreprise évalue l'écart entre les salaires payés et le salaire subsistance, élabore un plan de réduction de cet écart, et atteint deux critères supplémentaires.","a":{"micro":"*","petite":"*","moyenne":"*","grande":"*","xl":"*","xxl":"*"}},"FW3.1":{"y":3,"p":92,"t":"L'entreprise possède un dispositif de représentation des salariés.","a":{"xl":"*","xxl":"*"}},"FW3.2":{"y":0,"p":97,"t":"L'entreprise prend en compte le retour des collaborateurs et collaboratrices sur les décisions qui les concernent.","a":{"petite":"*","moyenne":"*","grande":"*","xl":"*","xxl":"*"}},"FW4.1":{"y":0,"p":102,"t":"L'entreprise évalue régulièrement la culture d'entreprise.","a":{"petite":"*","moyenne":"*","grande":"*","xl":"*","xxl":"*"}},"FW4.2":{"y":3,"p":109,"t":"L'entreprise a un plan d'amélioration continue de sa culture d'entreprise.","a":{"petite":"*","moyenne":"*","grande":"*","xl":"*","xxl":"*"}},"FW4.3":{"y":3,"p":112,"t":"Les résultats des enquêtes sur la culture d'entreprise sont ventilés par identité de genre ou selon le sexe assigné à la naissance.","a":{"grande":"*","xl":"*","xxl":"*"}},"FW4.4":{"y":3,"p":117,"t":"Les résultats des enquêtes sur la culture d'entreprise sont ventilés selon un autre aspect de l'identité sociale.","a":{"grande":"*","xl":"*","xxl":"*"}},"GACA1.1":{"y":0,"p":13,"t":"L'entreprise dispose d'une politique publiquement accessible en matière de lobbying responsable.","a":{"individuelle":"*","micro":"*","petite":"*","moyenne":"*","grande":"*","xl":"*","xxl":"*"}},"GACA1.2":{"y":0,"p":19,"t":"L'entreprise rend publique ses positions en matière de lobbying ainsi que ses contributions politiques à chaque année fiscale.","a":{"grande":"*","xl":"*","xxl":"*"}},"GACA1.3":{"y":3,"p":24,"t":"L'entreprise rend publiques ses positions en matière de lobbying et ses contributions politiques à chaque année fiscale.","a":{"individuelle":"*","micro":"*","petite":"*","moyenne":"*"}},"GACA2.1":{"y":0,"p":29,"t":"L'entreprise prend part à des actions collectives visant à promouvoir des impacts sociaux ou environnementaux positifs.","a":{"individuelle":"*","micro":"*"}},"GACA2.2":{"y":0,"p":32,"t":"L'entreprise prend part à des actions collectives visant à promouvoir des impacts sociaux ou environnementaux positifs.","a":{"petite":"*"}},"GACA2.3":{"y":0,"p":56,"t":"L'entreprise prend part à des actions collectives visant à promouvoir des impacts sociaux ou environnementaux positifs.","a":{"moyenne":"*"}},"GACA2.4":{"y":0,"p":59,"t":"L'entreprise prend part à des actions collectives visant à promouvoir des impacts sociaux ou environnementaux positifs.","a":{"grande":"*","xl":"*"}},"GACA2.5":{"y":0,"p":62,"t":"L'entreprise prend part à des actions collectives visant à promouvoir des impacts sociaux ou environnementaux positifs.","a":{"xxl":"*"}},"GACA2.6":{"y":3,"p":86,"t":"L'entreprise inclut les intitiatives multipartites ou le plaidoyer en faveur de politiques publiques dans ses actions collectives.","a":{"grande":"*","xl":"*","xxl":"*"}},"GACA3.1":{"y":0,"p":89,"t":"L'entreprise dispose d'une politique en matière de fiscalité responsable et la rend publique.","a":{"xxl":"*"}},"GACA3.2":{"y":3,"p":94,"t":"L'entreprise publie son reporting pays par pays pour chaque année fiscale.","a":{"xxl":"*"}},"HR1.1":{"y":0,"p":26,"t":"L'entreprise s'engage publiquement à respecter les droits humains.","a":{"micro":"*","petite":"*","moyenne":["services_faible"]}},"HR1.2":{"y":0,"p":32,"t":"L'entreprise dispose d'une politique publique en matière de droits humains.","a":{"moyenne":["agriculture","fabrication","services_forte","vente"],"grande":"*","xl":"*","xxl":"*"}},"HR2.1":{"y":0,"p":39,"t":"L'entreprise identifie ses enjeux majeurs en matière de droits humains.","a":{"moyenne":["agriculture","fabrication","services_forte","vente"],"grande":"*","xl":"*","xxl":"*"}},"HR2.2":{"y":3,"p":49,"t":"L'entreprise partage publiquement ses enjeux majeurs en matière de droits humains.","a":{"moyenne":["agriculture","fabrication","services_forte","vente"],"grande":"*","xl":"*","xxl":"*"}},"HR2.3":{"y":3,"p":53,"t":"L'entreprise dispose d'une stratégie pour traiter ses enjeux majeurs en matière de droits humains.","a":{"moyenne":["agriculture","fabrication","services_forte","vente"],"grande":["agriculture","fabrication","services_forte","vente"],"xl":["agriculture","fabrication","services_forte","vente"],"xxl":["agriculture","fabrication","services_forte","vente"]}},"HR2.4":{"y":5,"p":60,"t":"L'entreprise progresse dans sa stratégie en matière de droits humains et en évalue l'efficacité.","a":{"moyenne":["agriculture","fabrication","services_forte","vente"],"grande":["agriculture","fabrication","services_forte","vente"],"xl":["agriculture","fabrication","services_forte","vente"],"xxl":["agriculture","fabrication","services_forte","vente"]}},"HR2.5":{"y":5,"p":65,"t":"L'entreprise partage publiquement l'efficacité de sa stratégie en matière de droits humains.","a":{"xxl":["agriculture","fabrication","services_forte","vente"]}},"HR2.6":{"y":3,"p":69,"t":"Les politiques et procédures de l'entreprise traitent ses enjeux majeurs en matière de droits humains.","a":{"moyenne":["agriculture","fabrication","services_forte","vente"],"grande":["agriculture","fabrication","services_forte","vente"],"xl":["agriculture","fabrication","services_forte","vente"],"xxl":["agriculture","fabrication","services_forte","vente"]}},"HR2.7":{"y":3,"p":74,"t":"Les collaborateurs et collaboratrices exerçant les fonctions concernées reçoivent l’accompagnement nécessaire pour mettre en œuvre les politiques et procédures relatives","a":{"moyenne":["agriculture","fabrication","services_forte","vente"],"grande":["agriculture","fabrication","services_forte","vente"],"xl":["agriculture","fabrication","services_forte","vente"],"xxl":["agriculture","fabrication","services_forte","vente"]}},"HR3.1":{"y":0,"p":79,"t":"L'entreprise dispose d'un processus pour collecter, hiérarchiser et faire remonter les informations concernant ses impacts négatifs réels et potentiels sur les droits hum","a":{"moyenne":["agriculture","fabrication","services_forte","vente"],"grande":"*","xl":"*","xxl":"*"}},"HR3.2":{"y":3,"p":86,"t":"L'entreprise prévient, atténue et remédie à ses impacts négatifs réels et potentiels sur les droits humains.","a":{"moyenne":["agriculture","fabrication","services_forte","vente"],"grande":"*","xl":"*","xxl":"*"}},"HR3.3":{"y":0,"p":92,"t":"L'entreprise évalue les potentiels impacts négatifs sur les droits humains de ses potentiels clients organisationnels et projets, et prend les mesures d'atténuation néces","a":{"individuelle":["services_faible|@"],"micro":["services_faible|@"],"petite":["services_faible|@"],"moyenne":["services_faible|@"],"grande":["services_faible|@"],"xl":["services_faible|@"],"xxl":["services_faible|@"]},"i":{"services_faible":["Advertising & market research","Architecture design & planning","Book publishing","Civil engineering","Computer programming services","Contracting & building","Data processing & hosting","Design & building","Engineering","Environmental consulting","Film, TV & music production","Legal activities","Management consultant - for-profits","Mobile applications","Other info service activities","Other install & construction","Programming & broadcasting","Publishing - newspapers & magazines","Real estate - leased property","Real estate development","Real estate- fee/contract","Security & investigation","Social networks & info sharing","Software publishing and SaaS platforms","Telecommunications","Web portals"]}},"HR3.4":{"y":0,"p":108,"t":"L'entreprise évalue les potentiels impacts négatifs sur les droits humains de ses investissements, et prend les mesures d'atténuation nécessaires.","a":{"individuelle":["services_faible|@"],"micro":["services_faible|@"],"petite":["services_faible|@"],"moyenne":["services_faible|@"],"grande":["services_faible|@"],"xl":["services_faible|@"],"xxl":["services_faible|@"]},"i":{"services_faible":["Equity investing - Developed Markets","Equity investing - Emerging Markets","Investment advising"]}},"HR3.5":{"y":5,"p":116,"t":"L'entreprise procède à une évaluation d'impact sur les droits humains.","a":{"xl":"*","xxl":"*"}},"HR3.6":{"y":3,"p":121,"t":"L'entreprise met en œuvre une diligence raisonnable supplémentaire pour toutes ses activités menées dans des zones en situation de conflit.","a":{"petite":"*","moyenne":"*","grande":"*","xl":"*","xxl":"*"}},"HR4.1":{"y":3,"p":128,"t":"L'entreprise prend en compte les limites de sa capacité à impliquer ses fournisseurs et à assurer leur suivi.","a":{"moyenne":["fabrication","vente"],"grande":["fabrication","vente"],"xl":["fabrication","vente"],"xxl":["fabrication","vente"]}},"HR4.2":{"y":0,"p":135,"t":"L'entreprise prend en compte les impacts réels et potentiels sur les droits humains dans ses décisions d'achat.","a":{"individuelle":"*","micro":"*","petite":"*","moyenne":["services_faible","services_forte"]}},"HR4.3":{"y":0,"p":143,"t":"L'entreprise prend en compte les impacts réels et potentiels sur les droits humains dans ses décisions d'achat.","a":{"moyenne":["agriculture","fabrication","vente"],"grande":["services_faible"],"xl":["services_faible"],"xxl":["services_faible"]}},"HR4.4":{"y":0,"p":151,"t":"L'entreprise travaille en collaboration avec ses fournisseurs pour prévenir ou atténuer ses enjeux majeurs en matière de droits humains.","a":{"grande":["agriculture","fabrication","services_forte","vente"],"xl":["agriculture","fabrication","services_forte","vente"],"xxl":["agriculture","fabrication","services_forte","vente"]}},"HR4.5":{"y":5,"p":158,"t":"L'entreprise renforce ses engagements dans l'ensemble des documents relatifs à ses achats.","a":{"grande":["agriculture","fabrication","vente"],"xl":["agriculture","fabrication","vente"],"xxl":["agriculture","fabrication","vente"]}},"HR4.6":{"y":3,"p":164,"t":"L'entreprise dispose d'un plan délimité dans le temps pour tracer l'origine et les impacts potentiels sur les droits humains de ses matières premières à haut risque.","a":{"xl":["agriculture","fabrication","vente"],"xxl":["agriculture","fabrication","vente"]}},"HR4.7":{"y":5,"p":169,"t":"L'entreprise retrace davantage de matières premières à haut risque jusqu'à leur origine.","a":{"xl":["agriculture","fabrication","vente"],"xxl":["agriculture","fabrication","vente"]}},"HR4.8":{"y":5,"p":174,"t":"L'entreprise collabore avec ses fournisseurs pour traiter les impacts sur les droits humains liés aux matières premières à haut risque.","a":{"xl":["agriculture","fabrication","vente"],"xxl":["agriculture","fabrication","vente"]}},"HR4.9":{"y":0,"p":180,"t":"L'entreprise recherche les écarts par rapport au salaire de subsistance dans ses contrats de service.","a":{"moyenne":["services_faible"],"grande":["services_faible"],"xl":["services_faible"],"xxl":["services_faible"]}},"HR4.10":{"y":3,"p":192,"t":"L'entreprise fait référence au salaire de subsistance dans la sélection de ses prestataires de services.","a":{"moyenne":["services_faible"],"grande":["services_faible"],"xl":["services_faible"],"xxl":["services_faible"]}},"HR4.11":{"y":3,"p":203,"t":"L’entreprise dispose d’un plan pour traiter la question du salaire de subsistance, du revenu de subsistance ou de la négociation collective dans sa chaîne d’approvisionne","a":{"moyenne":["agriculture","fabrication","services_forte","vente"],"grande":["agriculture","fabrication","services_forte","vente"],"xl":["agriculture","fabrication","services_forte","vente"],"xxl":["agriculture","fabrication","services_forte","vente"]}},"JEDI1.1":{"y":0,"p":19,"t":"L'entreprise collecte des données afin d'orienter ses actions en matière de JEDI.","a":{"petite":"*","moyenne":"*","grande":"*","xl":"*","xxl":"*"}},"JEDI1.2":{"y":3,"p":28,"t":"L'entreprise collecte des données sur une identité sociale supplémentaire dans le cadre des enquêtes relatives aux collabo- rateurs et collaboratrices.","a":{"grande":"*","xl":"*","xxl":"*"}},"JEDI2.1":{"y":0,"p":36,"t":"L'entreprise choisit et met en œuvre une action JEDI.","a":{"individuelle":"*"}},"JEDI2.2":{"y":0,"p":38,"t":"L'entreprise choisit ses actions en matière de JEDI et les met en œuvre.","a":{"micro":"*"}},"JEDI2.3":{"y":0,"p":41,"t":"L'entreprise s'appuie sur des données ainsi que sur les retours des parties prenantes pour choisir ses actions en matière de JEDI, les consigne dans un plan d'action et l","a":{"petite":"*"}},"JEDI2.4":{"y":0,"p":45,"t":"L'entreprise s'appuie sur des données ainsi que sur les retours des parties prenantes pour choisir ses actions en matière de JEDI, les consigne dans un plan d'action et l","a":{"moyenne":"*"}},"JEDI2.5":{"y":0,"p":49,"t":"L'entreprise s'appuie sur des données ainsi que sur les retours des parties prenantes pour choisir ses actions en matière de JEDI, les consigne dans un plan d'action et l","a":{"grande":"*"}},"JEDI2.6":{"y":0,"p":53,"t":"L'entreprise s'appuie sur des données ainsi que sur les retours des parties prenantes pour choisir ses actions en matière de JEDI, les consigne dans un plan d'action et l","a":{"xl":"*","xxl":"*"}},"PSG1.1":{"y":0,"p":21,"t":"L'entreprise établit une raison d'être publique visant à générer un impact positif significatif.","a":{"individuelle":"*","micro":"*","petite":"*","moyenne":"*","grande":"*","xl":"*","xxl":"*"}},"PSG2.1":{"y":0,"p":26,"t":"L'entreprise dispose d'un mécanisme permettant de prendre en compte ou d'impliquer ses parties prenantes et de représenter leurs intérêts dans ses processus décisionnels.","a":{"individuelle":"*","micro":"*","petite":"*","moyenne":"*"}},"PSG2.2":{"y":0,"p":33,"t":"L'entreprise dispose d'une politique de gouvernance des parties prenantes.","a":{"grande":"*","xl":"*","xxl":"*"}},"PSG2.3":{"y":0,"p":40,"t":"L'entreprise procède régulièrement à une analyse de matérialité afin d'évaluer et d'identifier ses enjeux matériels.","a":{"grande":"*","xl":"*","xxl":"*"}},"PSG2.4":{"y":0,"p":50,"t":"L'entreprise identifie les enjeux matériels non couverts par les standards de B Lab, fixe des objectifs et rend compte des progrès réalisés chaque année.","a":{"grande":"*","xl":"*","xxl":"*"}},"PSG2.5":{"y":3,"p":56,"t":"L'entreprise tient compte de ses parties prenantes dans la prise de décision concernant les dividendes et les rachats d'actions.","a":{"xxl":"*"}},"PSG3.1":{"y":0,"p":60,"t":"L'entreprise dispose d'une procédure de réclamation accessible au public, permettant aux parties prenantes de soumettre leurs réclamations et d'obtenir une résolution en","a":{"individuelle":"*","micro":"*","petite":"*","moyenne":"*"}},"PSG3.2":{"y":0,"p":68,"t":"L'entreprise recense les réclamations et attribue la responsabilité de leur résolution.","a":{"micro":"*","petite":"*","moyenne":"*"}},"PSG3.3":{"y":0,"p":73,"t":"L'entreprise dispose d'une procédure de réclamation accessible au public, permettant aux parties prenantes de soumettre leurs réclamations et d'obtenir une résolution en","a":{"grande":"*","xl":"*","xxl":"*"}},"PSG3.4":{"y":0,"p":80,"t":"L'entreprise recense les réclamations, en attribue la responsabilité en interne et rend compte de leur suivi auprès de la plus haute instance de direction de l'entreprise","a":{"grande":"*","xl":"*","xxl":"*"}},"PSG4.1":{"y":0,"p":88,"t":"L'entreprise s'est dotée de principes en matière de marketing et de communication responsables.","a":{"micro":"*","petite":"*"}},"PSG4.2":{"y":0,"p":94,"t":"L'entreprise dispose d'une politique de marketing et de communications responsables supervisée par l'équipe de direction ou la plus haute instance de direction.","a":{"moyenne":"*","grande":"*","xl":"*","xxl":"*"}},"PSG5.1":{"y":0,"p":102,"t":"La plus haute instance de direction supervise le déploiement de la raison d'être de l'entreprise, la gestion de son impact social et environnemental ainsi que la prise en","a":{"micro":"*","petite":"*","moyenne":"*","grande":"*","xl":"*","xxl":"*"}},"PSG5.2":{"y":0,"p":108,"t":"Les exigences relatives au suivi du déploiement de la raison d'être de l'entreprise, de son impact social et environnemental, ainsi que de la prise en compte des parties","a":{"grande":"*","xl":"*","xxl":"*"}},"PSG5.3":{"y":3,"p":113,"t":"Tous les membres de l'équipe de direction ont au moins un objectif annuel lié aux performances sociales ou environnementales de l'entreprise.","a":{"grande":"*","xl":"*","xxl":"*"}},"PSG5.4":{"y":3,"p":118,"t":"Si l'entreprise dispose d'un système de rémunération incitative pour l'équipe de direction, celui-ci intègre des objectifs de performance sociale et environnementale.","a":{"grande":"*","xl":"*","xxl":"*"}},"PSG5.5":{"y":3,"p":124,"t":"L'entreprise inclut des objectifs de performance sociale ou environnementale dans les évaluations de performance des managers.","a":{"xxl":"*"}},"PSG6.1":{"y":3,"p":129,"t":"Chaque année, l'entreprise rend compte publiquement de ses performances sociales et environnementales, avec l'approbation de la plus haute instance de direction.","a":{"grande":"*","xl":"*"}},"PSG6.2":{"y":3,"p":134,"t":"Chaque année, l'entreprise rend compte publiquement de ses performances sociales et environnementales en s'appuyant sur un standard externe.","a":{"xxl":"*"}},"PSG6.3":{"y":3,"p":139,"t":"L'entreprise évalue la capacité des collaborateurs et collaboratrices à mettre en œuvre sa stratégie sociale et environnementale.","a":{"grande":"*","xl":"*","xxl":"*"}}};

// Industries d'investissement (HR3.4, ESC2.7) : couvertes par la question
// « activité d'investissement » du cadrage.
const INVESTMENT_INDUSTRIES = [
  "Equity investing - Developed Markets",
  "Equity investing - Emerging Markets",
  "Investment advising",
];

// Industries des services à faible empreinte visées par HR3.3 (droits humains)
// et ESC2.6 (environnement) : évaluation des clients et des projets.
// Intitulés officiels B Lab (anglais) et traduction KiAct.
const SF_INDUSTRIES = [
  { id: "Advertising & market research", label: "Publicité et études de marché" },
  { id: "Architecture design & planning", label: "Architecture, conception et urbanisme" },
  { id: "Book publishing", label: "Édition de livres" },
  { id: "Civil engineering", label: "Génie civil" },
  { id: "Computer programming services", label: "Programmation informatique" },
  { id: "Contracting & building", label: "Entreprise générale et construction" },
  { id: "Data processing & hosting", label: "Traitement de données et hébergement" },
  { id: "Design & building", label: "Conception et réalisation de bâtiments" },
  { id: "Engineering", label: "Ingénierie" },
  { id: "Environmental consulting", label: "Conseil en environnement" },
  { id: "Film, TV & music production", label: "Production de films, de télévision et de musique" },
  { id: "Landscape services", label: "Aménagement paysager" },
  { id: "Legal activities", label: "Activités juridiques" },
  { id: "Management consultant - for-profits", label: "Conseil en management pour des entreprises" },
  { id: "Mobile applications", label: "Applications mobiles" },
  { id: "Other info service activities", label: "Autres services d'information" },
  { id: "Other install & construction", label: "Autres travaux d'installation et de construction" },
  { id: "Programming & broadcasting", label: "Programmation et diffusion audiovisuelle" },
  { id: "Publishing - newspapers & magazines", label: "Édition de journaux et de magazines" },
  { id: "Real estate - leased property", label: "Immobilier, location de biens" },
  { id: "Real estate development", label: "Promotion immobilière" },
  { id: "Real estate- fee/contract", label: "Immobilier, services à la commission ou sous contrat" },
  { id: "Scientific R&D", label: "Recherche et développement scientifiques" },
  { id: "Security & investigation", label: "Sécurité et enquêtes" },
  { id: "Social networks & info sharing", label: "Réseaux sociaux et partage d'information" },
  { id: "Software publishing and SaaS platforms", label: "Édition de logiciels et plateformes SaaS" },
  { id: "Telecommunications", label: "Télécommunications" },
  { id: "Veterinary activities", label: "Activités vétérinaires" },
  { id: "Web portals", label: "Portails web" },
];

// Industries retenues pour un diagnostic
const ctxIndustries = (ctx) => {
  const list = [];
  if (ctx.sector === "services_faible") {
    if (ctx.industry && ctx.industry !== "autre") list.push(ctx.industry);
    if (ctx.hasInvestment === true) list.push(...INVESTMENT_INDUSTRIES);
  }
  if (ctx.sector === "fabrication" && ctx.isMining === true) list.push("Mining");
  return list;
};

// La sous-exigence s'applique-t-elle à cette taille, ce secteur et cette industrie ?
const subreqApplies = (code, ctx) => {
  const sr = BLAB_SUBREQS[code];
  if (!sr || !ctx.size || !ctx.sector) return false;
  const a = sr.a[ctx.size];
  if (!a) return false;
  if (a === "*" || a.includes(ctx.sector)) return true;
  if (a.includes(ctx.sector + "|@")) {
    const allowed = (sr.i && sr.i[ctx.sector]) || [];
    // Diagnostic ancien sans industrie renseignée : on affiche par prudence,
    // sauf pour les industries d'investissement (question dédiée au cadrage).
    const onlyInvestment = allowed.every((i) => INVESTMENT_INDUSTRIES.includes(i));
    if (ctx.sector === "services_faible" && !ctx.industry && !onlyInvestment) return true;
    return ctxIndustries(ctx).some((i) => allowed.includes(i));
  }
  return false;
};

// ----- Règles d'activation du Risk Tool (FR3.1.a à FR3.1.n) -----------------
// Transcription des critères de conformité 3.1.x.1 à 3.1.x.7 (fr.pdf p. 50 à 138).
// sz = tailles, sec = groupe de secteurs, add = sous-exigences ajoutées,
// na = sous-exigence remplacée (« non applicable ») par une autre,
// consider = évaluation existante qui doit intégrer l'impact potentiel.
// Groupes : "*" tous ; "nonsf" fabrication, agriculture, vente, services à forte
// empreinte ; "sf" services à faible empreinte ; "fnm" fabrication hors industrie
// minière, vente, services à forte empreinte ; "am" agriculture et industrie minière.
const R_HR_STD = (g4) => [
  { sz: ["petite"], sec: "*", add: ["HR2.1", "HR2.3", "HR2.4"], consider: "HR2.1" },
  { sz: ["moyenne", "grande", "xl"], sec: "nonsf", add: ["HR2.5"], consider: "HR2.1" },
  { sz: ["moyenne"], sec: "sf", add: ["HR2.1", "HR2.3", "HR2.4"], consider: "HR2.1" },
  g4,
  { sz: ["xxl"], sec: "*", consider: "HR2.1" },
];
const R_ESC_STD = [
  { sz: ["petite"], sec: "nonsf", add: ["ESC1.7", "ESC2.1", "ESC4.2"], na: { "ESC4.1": "ESC4.2" }, consider: "ESC1.7" },
  { sz: ["petite"], sec: "sf", add: ["ESC1.7", "ESC2.1", "ESC4.2"], consider: "ESC1.7" },
];
const RISK_RULES = {
  "FR3.1.a": R_HR_STD({ sz: ["grande", "xl"], sec: "sf", add: ["HR2.3", "HR2.4", "HR2.5"], consider: "HR2.1" }),
  "FR3.1.b": R_HR_STD({ sz: ["xl", "xxl"], sec: "sf", add: ["HR2.3", "HR2.4", "HR2.5"], consider: "HR2.1" }),
  "FR3.1.c": R_HR_STD({ sz: ["grande", "xl"], sec: "sf", add: ["HR2.3", "HR2.4", "HR2.5"], consider: "HR2.1" }),
  "FR3.1.g": R_HR_STD({ sz: ["grande", "xl"], sec: "sf", add: ["HR2.1", "HR2.3", "HR2.4"], consider: "HR2.1" }),
  "FR3.1.h": R_HR_STD({ sz: ["grande", "xl"], sec: "sf", add: ["HR2.3", "HR2.4", "HR2.5"], consider: "HR2.1" }),
  "FR3.1.m": R_HR_STD({ sz: ["grande", "xl"], sec: "sf", add: ["HR2.3", "HR2.4", "HR2.5"], consider: "HR2.1" }),
  "FR3.1.d": [
    ...R_ESC_STD,
    { sz: ["moyenne", "grande", "xl", "xxl"], sec: "nonsf", consider: "ESC1.7" },
    { sz: ["moyenne"], sec: "sf", add: ["ESC1.7", "ESC2.1", "ESC4.2"], consider: "ESC1.7" },
    { sz: ["grande", "xl", "xxl"], sec: "sf", add: ["ESC1.7", "ESC2.1", "ESC4.2"], na: { "ESC4.1": "ESC4.2" }, consider: "ESC1.7" },
  ],
  "FR3.1.e": [
    { sz: ["petite"], sec: "nonsf", add: ["ESC3.1", "ESC3.2"] },
    { sz: ["petite", "moyenne"], sec: "sf", add: ["ESC3.1", "ESC3.2"] },
    { sz: ["moyenne"], sec: "nonsf", add: ["ESC3.1", "ESC3.2"], consider: "ESC1.7" },
    { sz: ["grande"], sec: "nonsf", add: ["ESC3.4", "ESC3.5"], consider: "ESC1.7" },
    { sz: ["xl", "xxl"], sec: "nonsf", consider: "ESC1.7" },
    { sz: ["grande", "xl", "xxl"], sec: "sf", add: ["ESC3.1", "ESC3.2", "ESC3.4", "ESC3.5"] },
  ],
  "FR3.1.f": [
    ...R_ESC_STD,
    { sz: ["moyenne", "grande"], sec: "fnm", add: ["ESC2.2", "ESC4.3"], consider: "ESC1.7" },
    { sz: ["moyenne", "grande", "xl", "xxl"], sec: "am", consider: "ESC1.7" },
    { sz: ["moyenne", "grande", "xl", "xxl"], sec: "sf", add: ["ESC1.7", "ESC2.2", "ESC4.3"], consider: "ESC1.7" },
    { sz: ["xl", "xxl"], sec: "fnm", consider: "ESC1.7" },
  ],
  "FR3.1.i": [
    { sz: ["petite"], sec: "nonsf", add: ["ESC3.1", "ESC3.2"] },
    { sz: ["moyenne"], sec: "nonsf", add: ["ESC3.1", "ESC3.2"], consider: "ESC1.7" },
    { sz: ["grande", "xl", "xxl"], sec: "nonsf", consider: "ESC1.7" },
    { sz: ["petite", "moyenne", "grande", "xl", "xxl"], sec: "sf", add: ["ESC3.1", "ESC3.2"] },
  ],
  "FR3.1.j": [
    { sz: ["petite"], sec: "fnm", add: ["ESC1.7", "ESC2.1", "ESC4.2"], na: { "ESC4.1": "ESC4.2" }, consider: "ESC1.7" },
    { sz: ["petite"], sec: "am", add: ["ESC1.7", "ESC2.1", "ESC4.2"], na: { "ESC4.1": "ESC4.2" }, consider: "ESC1.7" },
    { sz: ["petite"], sec: "sf", add: ["ESC1.7", "ESC2.1", "ESC4.2"], consider: "ESC1.7" },
    { sz: ["moyenne", "grande"], sec: "fnm", add: ["ESC2.2", "ESC4.3"], consider: "ESC1.7" },
    { sz: ["xl", "xxl"], sec: "fnm", consider: "ESC1.7" },
    { sz: ["moyenne", "grande", "xl", "xxl"], sec: "am", consider: "ESC1.7" },
    { sz: ["moyenne", "grande", "xl", "xxl"], sec: "sf", add: ["ESC1.7", "ESC2.2", "ESC4.3"], consider: "ESC1.7" },
  ],
  "FR3.1.k": [
    { sz: ["petite"], sec: "nonsf", add: ["ESC1.7", "ESC2.1", "ESC4.2"], na: { "ESC4.1": "ESC4.2" }, consider: "ESC1.7" },
    { sz: ["petite", "moyenne"], sec: "sf", add: ["ESC1.7", "ESC2.1", "ESC4.2"], consider: "ESC1.7" },
    { sz: ["moyenne", "grande", "xl", "xxl"], sec: "nonsf", consider: "ESC1.7" },
    { sz: ["grande", "xl", "xxl"], sec: "sf", add: ["ESC1.7", "ESC2.1", "ESC4.2"], na: { "ESC4.1": "ESC4.2" }, consider: "ESC1.7" },
  ],
  "FR3.1.l": [
    ...R_ESC_STD,
    { sz: ["moyenne", "grande", "xl", "xxl"], sec: "nonsf", consider: "ESC1.7" },
    { sz: ["moyenne"], sec: "sf", add: ["ESC1.4", "ESC1.7", "ESC2.1", "ESC4.2"], consider: "ESC1.7" },
    { sz: ["grande", "xl", "xxl"], sec: "sf", add: ["ESC1.4", "ESC1.7", "ESC2.1", "ESC4.2"], na: { "ESC4.1": "ESC4.2" }, consider: "ESC1.7" },
  ],
  "FR3.1.n": [
    { sz: ["petite"], sec: "*", add: ["PSG4.2"], na: { "PSG4.1": "PSG4.2" } },
    { sz: ["moyenne"], sec: "*", add: ["PSG3.3", "PSG3.4"], na: { "PSG3.1": "PSG3.3", "PSG3.2": "PSG3.4" } },
  ],
};

const RISK_SIZES = ["petite", "moyenne", "grande", "xl", "xxl"]; // FR3.1 : Micro et sans collaborateurs exemptés
const riskSecMatch = (sec, ctx) => {
  const s = ctx.sector;
  const mining = s === "fabrication" && ctx.isMining === true;
  if (sec === "*") return true;
  if (sec === "sf") return s === "services_faible";
  if (sec === "nonsf") return ["fabrication", "agriculture", "vente", "services_forte"].includes(s);
  if (sec === "fnm") return (s === "fabrication" && !mining) || s === "vente" || s === "services_forte";
  if (sec === "am") return s === "agriculture" || mining;
  return false;
};

// Règles applicables pour une question du Risk Tool donnée (réf. FR3.1.x)
const riskRulesFor = (ref, ctx) =>
  !ctx.size || !ctx.sector || !RISK_SIZES.includes(ctx.size)
    ? []
    : (RISK_RULES[ref] || []).filter((r) => r.sz.includes(ctx.size) && riskSecMatch(r.sec, ctx));

// Calcule les sous-exigences dues pour un diagnostic (Année 0) et celles à anticiper
const computeRequirements = (ctx, riskAnswers) => {
  const res = { base: new Set(), active: new Set(), triggered: {}, replaced: {}, consider: {}, anticipate: [] };
  if (!ctx.size || !ctx.sector) return res;
  Object.keys(BLAB_SUBREQS).forEach((c) => { if (subreqApplies(c, ctx)) res.base.add(c); });
  RISK_TOOL_SECTIONS.forEach((section) => section.questions.forEach((rq) => {
    if (!riskAnswers || riskAnswers[rq.id] !== "yes") return;
    riskRulesFor(rq.ref, ctx).forEach((rule) => {
      (rule.add || []).forEach((c) => {
        if (res.base.has(c)) return;
        res.triggered[c] = [...new Set([...(res.triggered[c] || []), rq.ref])];
      });
      Object.entries(rule.na || {}).forEach(([c, by]) => { res.replaced[c] = { by, src: rq.ref }; });
      if (rule.consider) res.consider[rule.consider] = [...new Set([...(res.consider[rule.consider] || []), rq.ref])];
    });
  }));
  const all = new Set([...res.base, ...Object.keys(res.triggered)]);
  Object.keys(res.replaced).forEach((c) => all.delete(c));
  all.forEach((c) => {
    const y = BLAB_SUBREQS[c] ? BLAB_SUBREQS[c].y : null;
    if (y === 0) res.active.add(c);
    else if (res.triggered[c]) {
      const replaces = Object.keys(res.replaced).filter((r) => res.replaced[r].by === c);
      res.anticipate.push({ code: c, year: y, sources: res.triggered[c], replaces });
    }
  });
  res.anticipate.sort((a, b) => a.year - b.year || a.code.localeCompare(b.code));
  return res;
};

// Une question est affichée si au moins une de ses sous-exigences est due en Année 0
const matches = (q, ctx) => {
  if (!ctx.size || !ctx.sector) return true;
  if (!q.codes) return true;
  const req = ctx.req || computeRequirements(ctx, null);
  return q.codes.some((c) => req.active.has(c));
};

// Affiche un texte d'aide, sous forme de puces s'il s'agit d'un tableau
const TextBlock = ({ value }) => {
  if (Array.isArray(value)) {
    return (
      <ul style={{ margin: 0, paddingLeft: 18 }}>
        {value.map((item, i) => (
          <li key={i} style={{ marginBottom: i === value.length - 1 ? 0 : 4 }}>{item}</li>
        ))}
      </ul>
    );
  }
  return <>{value}</>;
};

// ----- Référentiel des thématiques et questions ------------------------------
// Chaque question reflète une (ou plusieurs) sous-exigences B Lab V2, reformulée
// en langage dirigeant. La référence officielle B Lab (ex: "PSG1.1", "FW2.8") est conservée.
// Codes officiels B Lab (anglais) : FR, PSG, FW, JEDI, HR, CA, ESC, GACA.

const TOPICS = [
  // -------------------------------------------------------------------------
  {
    id: "fr",
    code: "FR",
    codeFr: "EB",  // code utilisé dans les PDF français B Lab
    name: "Exigences de base",
    short: "Exigences de base",
    color: "#0f1f1f",
    icon: "◆",
    description: "Conditions d'éligibilité, exigences juridiques B Corp et profil de risque. Sans elles, aucune certification n'est possible. Codes B Lab FR1 à FR3.",
    questions: [
      {
        id: "fr_1a",
        codes: ["FR1.1", "FR1.2"],
        ref: "FR1.1 / FR1.2",
        kind: "factual",
        fr12: true,
        question: "Votre entreprise remplit-elle les conditions d'éligibilité et se tient-elle à l'écart des industries exclues par B Lab ?",
        help: ["FR1.1 exige une société active depuis douze mois au moins, dont la majorité des revenus provient d'un marché concurrentiel.", "Dès l'Année 0 pour toutes les tailles, sauf FR1.2 en recertification depuis V1.6, exigible en Année 3.", "FR1.2 exclut six industries, soit combustibles fossiles, jeux de hasard, pornographie, prisons, tabac et armement.", "L'implication directe, les services dédiés et le financement direct restent chacun sous 1 % du chiffre d'affaires, par industrie.", "Le conseil juridique ou en management à une clientèle controversée n'est pas visé, mais peut entraîner des démarches supplémentaires."],
        examples: ["Extrait du registre du commerce indiquant la forme juridique et la date de constitution.", "Comptes annuels de la dernière année fiscale.", "Répartition chiffrée du chiffre d'affaires par activité, avec la part liée aux industries visées.", "Organigramme du groupe en cas de société mère ou de filiales."],
        examplesLabel: "Preuves utiles, sélection KiAct fondée sur le standard",
        eligibilite: true,
      },
      {
        id: "fr_1b",
        codes: ["FR1.2"],
        ref: "FR1.2 / FR1.4, preuves",
        fr12: true,
        question: "Avez-vous établi la répartition de vos revenus par activité pour démontrer votre éligibilité ?",
        help: ["Une répartition chiffrée des revenus de la dernière année fiscale démontre le respect du seuil de FR1.2.", "FR1.4 exige que ces informations soient exactes, complètes et étayées par des preuves.", "Elle distingue le revenu par activité, les ventes liées à une industrie exclue et les investissements directs que l'entreprise contrôle.", "Les fonds diversifiés, comme les fonds indiciels cotés, n'entrent pas dans le calcul.", "Pour une recertification depuis V1.6, cette démonstration est attendue en Année 3."],
        examples: ["Chiffre d'affaires de la dernière année fiscale par activité, rapproché des comptes annuels.", "Liste des clients actifs dans une industrie visée, avec prestations et part de revenus.", "Liste des investissements directs dont l'entreprise contrôle les décisions.", "Nom de la personne responsable de ces données."],
        examplesLabel: "Preuves utiles, sélection KiAct fondée sur le standard",
        eligibilite: true,
      },
      {
        id: "fr_2",
        codes: ["FR2.1"],
        ref: "FR2.1",
        kind: "factual",
        question: "Vos statuts intègrent-ils les exigences juridiques B Corp, soit une clause raison d'être et une clause administrateurs ?",
        help: ["FR2.1 exige d'inscrire dans les statuts une clause raison d'être et une clause administrateurs.", "Sous 10 millions de dollars US de chiffre d'affaires et sous 50 personnes à plein temps, la clause précède la certification.", "Dès qu'un seul de ces deux seuils est dépassé, un délai s'applique après l'obtention du certificat.", "Ce délai est d'un an pour une SA ou une Sàrl, et de deux ans si un statut à mission est exigé.", "L'outil d'exigences juridiques de B Lab fournit la formulation propre à chaque forme juridique.", "Source, Knowledge Hub B Lab, article FR2 (43000786021), qui précise « et » avant la certification et « ou » pour le délai."],
        examples: ["Pour une SA, l'assemblée générale modifie les statuts, et pour une Sàrl, l'assemblée des associés.", "La décision est constatée par acte authentique, puis inscrite au registre du commerce.", "Estimation KiAct hors B Lab, environ quatre à huit semaines et 1'500 à 3'500 CHF, à confirmer avec le notaire.", "Ce chantier est souvent le plus long et gagne à être lancé dès le diagnostic."],
        examplesLabel: "Repères pratiques KiAct",
        delaiLong: true,
      },
      {
        id: "fr_3",
        codes: ["FR3.1"],
        ref: "FR3.1",
        question: "Avez-vous complété l'outil d'évaluation des risques de B Lab (14 questions) ?",
        help: ["FR3.1 exige d'établir un profil de risque avec l'outil d'évaluation des risques de B Lab, soit 14 questions.", "Dès l'Année 0 pour Petite et Moyenne, tous secteurs, la Micro et l'entreprise individuelle étant exemptées.", "Chaque « oui » ajoute ou remplace des sous-exigences, surtout en HR, ESC et PSG, selon la taille et le secteur.", "Un résumé du profil de risque figure sur le profil public B Corp de l'entreprise.", "La grille ci-dessous calcule les exigences ajoutées pour cette entreprise."],
        examples: ["Les 14 réponses consignées, avec la période couverte par chacune.", "Données justifiant chaque réponse, par exemple la part du chiffre d'affaires par catégorie de produits.", "Décompte des prestataires indépendants et des personnes salariées.", "Liste des sous-exigences activées et preuves propres à chacune."],
        examplesLabel: "Preuves utiles, sélection KiAct fondée sur le standard",
        hasRiskTool: true,
      },
      {
        id: "fr_4",
        codes: ["FR1.3", "FR1.4", "FR1.5", "FR2.2"],
        ref: "FR1.3 / FR1.4 / FR1.5 / FR2.2",
        kind: "factual",
        question: "Votre entreprise respecte-t-elle la législation applicable, sans violation grave non résolue, et accepte-t-elle les engagements de transparence de B Lab ?",
        help: ["FR1.3 exige le respect des lois sociales, environnementales et de gouvernance, sans violation grave non résolue.", "Dès l'Année 0 pour Micro, Petite et Moyenne, comme pour toutes les autres tailles, tous secteurs.", "Une violation est grave si elle est de grande ampleur, touche beaucoup de personnes ou se répare difficilement.", "FR1.4, FR1.5 et FR2.2 exigent des informations exactes, un profil public et la signature de la déclaration d'interdépendance.", "Une personne mandatée par la plus haute instance de direction signe l'accord de certification qui réunit ces engagements."],
        examples: ["Registre des procédures, litiges et sanctions en cours ou de l'année écoulée.", "Désignation des personnes chargées de fournir les preuves.", "Informations du profil public, dont siège, secteur, description, logo et site internet.", "Décision de la plus haute instance de direction mandatant la personne signataire."],
        examplesLabel: "Preuves utiles, sélection KiAct fondée sur le standard",
        eligibilite: true,
      },
    ],
  },

  // -------------------------------------------------------------------------
  {
    id: "psg",
    code: "PSG",
    codeFr: "MGPP",  // code utilisé dans les PDF français B Lab
    name: "Mission et gouvernance des parties prenantes",
    short: "Mission et gouvernance",
    color: "#0d4f3c",
    icon: "◐",
    description: "Raison d'être publique, prise en compte des parties prenantes, traitement des réclamations, communication responsable, supervision par la plus haute instance de gouvernance et transparence. Codes B Lab PSG1 à PSG6.",
    questions: [
      {
        id: "psg_1",
        codes: ["PSG1.1"],
        ref: "PSG1.1",
        question: "Votre raison d'être, qui exprime l'impact positif visé par votre entreprise, est-elle publiée sur votre site internet ?",
        help: ["PSG1.1 exige une raison d'être décrivant précisément l'impact positif et significatif visé sur la société ou l'environnement.", "Dès l'Année 0 pour Micro, Petite et Moyenne, tous secteurs, ainsi que pour l'entreprise individuelle.", "Elle est liée à l'activité, intégrée dans la stratégie et approuvée par la plus haute instance de direction.", "Elle est publiée sur le site internet, avec une déclaration complémentaire si le lien avec l'activité n'apparaît pas.", "Un énoncé centré sur la qualité du service à la clientèle n'est pas accepté."],
        examples: ["Raison d'être publiée sur le site internet, ou à défaut dans une brochure officielle.", "Déclaration complémentaire reliant la raison d'être à l'activité et à la stratégie.", "Feuille de route stratégique reliant la raison d'être aux objectifs et aux indicateurs.", "Procès-verbal ou lettre d'approbation de la plus haute instance de direction."],
      },
      {
        id: "psg_2",
        codes: ["PSG2.1", "PSG2.2"],
        ref: "PSG2.1 / PSG2.2",
        question: "Disposez-vous de mécanismes pour impliquer vos parties prenantes et tenir compte de leurs intérêts dans vos décisions ?",
        help: ["PSG2.1 exige d'identifier, de hiérarchiser et de cartographier les parties prenantes, puis de dialoguer avec elles et d'intégrer leurs intérêts.", "Dès l'Année 0 pour Micro, Petite et Moyenne, ainsi que pour l'entreprise individuelle.", "Au moins un mécanisme couvre chacun des six groupes, soit personnel, prestataires, clientèle, partenaires financiers, communauté locale et environnement.", "Une enquête, un groupe de discussion, un conseil consultatif ou un comité de développement durable peuvent servir de mécanisme.", "Un comité RSE existant compte s'il réunit une expertise sociale ou environnementale et inclut un membre de la plus haute instance ou lui rend compte directement.", "Un mécanisme limité à la clientèle ne suffit pas."],
        examples: ["Procès-verbaux de réunions, résultats d'enquêtes ou charte d'un conseil consultatif multipartite.", "Composition, mandat et comptes rendus du comité RSE, le cas échéant.", "Éléments montrant que chacun des six groupes est représenté.", "Pour PSG2.2, politique approuvée par la plus haute instance de direction et diffusée au personnel."],
      },
      {
        id: "psg_3",
        codes: ["PSG2.3"],
        ref: "PSG2.3",
        question: "Avez-vous réalisé une analyse de matérialité de vos enjeux sociaux et environnementaux avec vos parties prenantes ?",
        help: ["PSG2.3 exige une analyse de matérialité d'impact menée avec les six groupes de parties prenantes de PSG2.1.", "Non applicable à Micro, Petite et Moyenne, elle s'applique dès l'Année 0 aux Grandes entreprises et au-delà.", "Elle couvre les enjeux des standards de B Lab, dont les droits humains et l'environnement, et les autres enjeux pertinents.", "Une analyse complète a lieu au moins tous les 36 mois, avec une mise à jour intermédiaire.", "La plus haute instance de direction supervise le processus, et les résultats comme la méthode sont publiés."],
        examples: ["Rapport d'analyse de matérialité de moins de 36 mois, attestant l'engagement des parties prenantes.", "Méthode précisant le seuil retenu et l'évaluation de la gravité et de la probabilité des impacts.", "Traces de la revue intermédiaire et de la supervision par la plus haute instance de direction.", "Matrice ou liste des enjeux publiée sur le site internet ou dans le rapport d'impact."],
      },
      {
        id: "psg_9",
        codes: ["PSG2.4"],
        ref: "PSG2.4",
        question: "Pour vos enjeux matériels non couverts par les standards de B Lab, fixez-vous des objectifs et publiez-vous vos progrès chaque année ?",
        help: ["PSG2.4 exige au moins un objectif pour chaque enjeu matériel non couvert par les standards de B Lab.", "Non applicable à Micro, Petite et Moyenne, elle s'applique dès l'Année 0 aux Grandes entreprises et au-delà.", "Les objectifs sont mesurables, datés, publics, intégrés à la stratégie et approuvés par la plus haute instance de direction.", "Chaque objectif a une personne responsable, et les progrès sont publiés chaque année.", "Un objectif atteint est remplacé par un nouvel objectif."],
        examples: ["Liste des enjeux matériels non couverts par les standards de B Lab.", "Objectif mesurable et daté par enjeu, avec sa personne responsable.", "Approbation des objectifs par la plus haute instance de direction.", "Rapport public annuel sur les progrès réalisés."],
      },
      {
        id: "psg_4",
        codes: ["PSG3.1", "PSG3.2"],
        ref: "PSG3.1 / PSG3.2",
        question: "Disposez-vous d'une procédure accessible au public pour recevoir et traiter les réclamations de vos parties prenantes ?",
        help: ["PSG3.1 exige une procédure de réclamation accessible au public, par formulaire en ligne ou autre canal facile d'accès.", "Dès l'Année 0 pour Micro, Petite et Moyenne, l'entreprise individuelle n'étant soumise qu'à PSG3.1.", "La procédure fixe recevabilité, étapes, délais et résolution, et protège les personnes plaignantes contre les représailles.", "PSG3.2 ajoute un registre des réclamations, un résumé annuel et une personne salariée responsable.", "Une adresse électronique générale ou une politique de porte ouverte peut suffire comme canal."],
        examples: ["Lien vers le formulaire en ligne ou description du canal retenu.", "Procédure écrite couvrant recevabilité, étapes, délais, résolution et protection contre les représailles.", "Registre, résumé annuel et dossiers clôturés, y compris les échanges avec les personnes plaignantes.", "Organigramme ou cahier des charges désignant la personne responsable."],
      },
      {
        id: "psg_8",
        codes: ["PSG3.3", "PSG3.4"],
        ref: "PSG3.3 / PSG3.4",
        question: "Disposez-vous d'une procédure de réclamation publiée, dont le suivi est rapporté à la plus haute instance de direction et aux parties prenantes ?",
        help: ["PSG3.3 et PSG3.4 exigent une procédure de réclamation publiée, suivie par la direction et rapportée aux parties prenantes.", "Non applicables à Micro, Petite et Moyenne, elles s'appliquent dès l'Année 0 aux Grandes entreprises et au-delà.", "La procédure est publiée en langues et formats accessibles, prévient les conflits d'intérêts et est communiquée aux parties prenantes.", "Un rapport interne annuel analyse les réclamations, et une personne cadre en rend compte à la plus haute instance.", "Un rapport public suit les critères d'efficacité des Principes directeurs des Nations Unies."],
        examples: ["Procédure publiée sur le site dans les langues pertinentes et communications aux parties prenantes.", "Règles de prévention des conflits d'intérêts.", "Rapport interne annuel et procès-verbaux de sa présentation à la plus haute instance de direction.", "Rapport public intégrant les critères d'efficacité des Nations Unies."],
      },
      {
        id: "psg_5",
        codes: ["PSG4.1", "PSG4.2"],
        ref: "PSG4.1 / PSG4.2",
        question: "Avez-vous défini des principes ou une politique de marketing et de communication responsables ?",
        help: ["PSG4.1 exige des principes écrits garantissant des allégations sociales et environnementales précises, vérifiables et étayées.", "Dès l'Année 0, PSG4.1 vise Micro et Petite, et PSG4.2 la Moyenne et au-delà.", "Les principes imposent une communication honnête sur les impacts et encadrent les canaux sensibles, comme ceux visant les enfants.", "PSG4.2 exige une politique approuvée par l'équipe de direction ou la plus haute instance, avec une personne dirigeante responsable.", "Les principes sont diffusés au personnel et peuvent figurer dans le code de conduite."],
        examples: ["Politique interne ou section du code de conduite fixant les principes d'allégation.", "Preuve de diffusion au personnel, par exemple intranet, formation, courriel ou attestation de lecture.", "Pour PSG4.2, politique signée ou approuvée par procès-verbal.", "Document désignant la personne responsable au sein de la direction."],
      },
      {
        id: "psg_6",
        codes: ["PSG5.1", "PSG5.2"],
        ref: "PSG5.1 / PSG5.2",
        question: "Votre plus haute instance de direction examine-t-elle au moins une fois par an la raison d'être, l'impact social et environnemental et la prise en compte des parties prenantes ?",
        help: ["PSG5.1 exige que la plus haute instance de direction examine au moins tous les 12 mois trois sujets.", "Dès l'Année 0 pour Micro, Petite et Moyenne, l'entreprise individuelle n'étant pas concernée.", "Ces sujets sont les progrès de la raison d'être, les performances sociales et environnementales et la gouvernance des parties prenantes.", "La plus haute instance peut être un conseil d'administration ou un administrateur ou une administratrice unique.", "Un comité RSE peut préparer cet examen, mais ne le remplace pas, sauf sous-comité du conseil d'une Grande entreprise tenant le conseil informé."],
        examples: ["Procès-verbaux de la plus haute instance de direction des 12 derniers mois.", "Point spécifique à l'ordre du jour sur ces trois sujets.", "Pour PSG5.2, cadre de référence écrit attribuant cette supervision à l'instance."],
      },
      {
        id: "psg_7",
        codes: ["PSG6.1"],
        ref: "PSG6.1",
        question: "Publiez-vous chaque année un rapport sur vos performances sociales et environnementales, approuvé par votre plus haute instance de direction ?",
        help: ["PSG6.1 exige un rapport public annuel sur les performances sociales et environnementales, approuvé par la plus haute instance.", "Non applicable à Micro, Petite et Moyenne, elle vise Grandes et XL à partir de l'Année 3.", "Publié sur le site internet, il présente les progrès sur les indicateurs pertinents et résume l'engagement des parties prenantes.", "Un rapport complet tous les deux ans est admis, complété par des mises à jour intermédiaires.", "Les XXL relèvent de PSG6.2 dès l'Année 3 et suivent un standard de reporting externe."],
        examples: ["Rapport d'impact annuel couvrant tous les indicateurs pertinents.", "Approbation par la plus haute instance de direction.", "Publication sur le site internet.", "À défaut, rapport complet tous les deux ans, avec des mises à jour annuelles."],
      },
    ],
  },

  // -------------------------------------------------------------------------
  {
    id: "fw",
    code: "FW",
    codeFr: "TE",  // code utilisé dans les PDF français B Lab
    name: "Travail équitable",
    short: "Travail équitable",
    color: "#1d4f74",
    icon: "◑",
    description: "Attentes claires envers les personnes salariées, pratiques salariales équitables, prise en compte de leurs retours et amélioration de la culture d'entreprise. Codes B Lab FW1 à FW4.",
    questions: [
      {
        id: "fw_1",
        codes: ["FW1.1"],
        ref: "FW1.1",
        question: "Chaque personne salariée dispose-t-elle d'un contrat de travail ou d'une lettre d'engagement signés par les deux parties ?",
        help: ["FW1.1 exige un contrat de travail ou une lettre d'engagement signés pour chaque personne salariée.", "Dès l'Année 0 pour Micro, Petite et Moyenne, tous secteurs.", "Le document est signé par les deux parties, rédigé dans une langue comprise et remis en copie.", "Il précise notamment le poste, le lieu, les horaires, la rémunération, la durée et les conditions de résiliation.", "Pour une personne déjà en poste sans contrat écrit, une lettre conforme suffit."],
        examples: ["Contrats ou lettres d'engagement signés.", "Liste des personnes salariées avec le document de chacune.", "Traces de remise d'une copie à chaque personne.", "Entretiens avec des personnes salariées."],
      },
      {
        id: "fw_2",
        codes: ["FW1.2"],
        ref: "FW1.2",
        question: "Si vous recourez à des horaires variables, disposez-vous d'une règle écrite fixant un délai de prévenance identique pour l'entreprise et pour les personnes salariées ?",
        help: ["FW1.2 exige une règle écrite de délai de prévenance identique pour l'entreprise et le personnel à horaires variables.", "Dès l'Année 0 pour Petite et Moyenne, Micro non concernée.", "Une annulation tardive pour un motif maîtrisé par l'entreprise est payée intégralement.", "La règle précise l'indemnité éventuelle lorsque le motif échappe à l'entreprise.", "Des horaires en rotation régulière ou fixés par contrat ne sont pas considérés comme variables."],
        examples: ["Politique ou règlement du personnel intégrant la règle.", "Traces de communication ou d'accès à la règle.", "Entretiens avec des personnes salariées à horaires variables."],
      },
      {
        id: "fw_3",
        codes: ["FW2.1"],
        ref: "FW2.1",
        question: "Votre entreprise s'interdit-elle, par une règle écrite, de demander aux candidates et candidats leur salaire antérieur et leurs prétentions salariales ?",
        help: ["FW2.1 exige une règle écrite interdisant de demander le salaire antérieur aux candidates et candidats.", "Dès l'Année 0 pour Petite et Moyenne, Micro non concernée.", "Les prétentions salariales ne sont demandées qu'après communication de la grille salariale du poste.", "L'engagement peut figurer dans un règlement ou un manuel du personnel existant.", "B Lab recommande d'indiquer la fourchette salariale dans chaque offre d'emploi."],
        examples: ["Politique ou règlement du personnel confirmant l'engagement.", "Entretiens avec les personnes chargées des recrutements."],
      },
      {
        id: "fw_4",
        codes: ["FW2.2"],
        ref: "FW2.2",
        question: "Informez-vous vos collaborateurs et collaboratrices de la composition de leur rémunération, de leurs avantages et de la manière dont salaires et avantages sont fixés puis révisés ?",
        help: ["FW2.2 exige d'informer chaque personne salariée de sa rémunération, de ses avantages et de leur mode de fixation.", "Dès l'Année 0 pour Micro, Petite et Moyenne, tous secteurs.", "L'information couvre la fixation et la révision des salaires à l'embauche, à l'évaluation et lors des promotions.", "Une fiche de paie régulière détaille salaire de base, autres composantes et déductions, dans une langue comprise."],
        examples: ["Communications ou règlement accessible sur la rémunération et les avantages.", "Fiches de paie conformes et langues utilisées par groupe de personnel.", "Entretiens avec des collaborateurs et collaboratrices."],
      },
      {
        id: "fw_5",
        codes: ["FW2.4", "FW2.5"],
        ref: "FW2.4 / FW2.5",
        question: "Calculez-vous chaque année l'écart de salaire entre les femmes et les hommes et, si vous y êtes tenus, le publiez-vous ?",
        help: ["FW2.4 exige un calcul annuel de l'écart salarial entre femmes et hommes, et FW2.5 sa publication.", "Micro, Petite et Moyenne ne sont pas concernées.", "Dès l'Année 0, FW2.4 vise les Grandes et plus, FW2.5 les XL et XXL.", "Les deux exigences ne valent que dans un pays comptant au moins 250 personnes salariées.", "Le calcul porte sur les montants bruts du dernier exercice, primes et indemnités comprises."],
        examples: ["Calcul de l'écart avec données et type de calcul.", "Note de méthode précisant les éléments inclus et exclus.", "Pour FW2.5, page internet ou rapport public présentant les écarts."],
      },
      {
        id: "fw_6",
        codes: ["FW2.8"],
        ref: "FW2.8",
        kind: "factual",
        question: "Vos salariés les moins bien rémunérés perçoivent-ils un salaire de subsistance ou un salaire fixé par une convention collective ?",
        help: ["FW2.8 exige que les salaires les plus bas atteignent un salaire de subsistance ou un salaire conventionnel.", "Dès l'Année 3 pour Micro, Petite et Moyenne, non exigible en Année 0.", "Option a, salaire de subsistance selon une estimation approuvée par B Lab, pour les personnes de 18 ans et plus.", "Option b, salaire fixé par une convention collective active et plus favorable que les minimums légaux.", "Option c, mesure de l'écart, plan de réduction et au moins deux critères complémentaires."],
        examples: ["Option retenue pour chaque site.", "Données de paie et calcul du salaire de subsistance ou convention collective.", "Plan interne pour combler un éventuel écart.", "Entretiens avec des personnes salariées."],
      },
      {
        id: "fw_7",
        codes: ["FW3.1"],
        ref: "FW3.1",
        question: "Disposez-vous d'un dispositif formel de représentation du personnel, tel qu'un syndicat, un comité d'entreprise ou un comité de collaborateurs ?",
        help: ["FW3.1 exige un dispositif formel de représentation du personnel, tel un syndicat ou un comité.", "Micro, Petite et Moyenne ne sont pas concernées, seules les XL et XXL dès l'Année 3.", "Les représentants se réunissent sur le temps de travail et rencontrent la direction au moins deux fois par an.", "Un groupe d'affinité ou un comité limité à un seul thème ne suffit pas."],
        examples: ["Document fondateur, par exemple accord syndical ou charte.", "Liste des représentants et comptes rendus des réunions.", "À défaut de dispositif, déclaration publique et résultat de la consultation du personnel."],
      },
      {
        id: "fw_8",
        codes: ["FW3.2"],
        ref: "FW3.2",
        question: "Avant une décision qui concerne votre personnel, recueillez-vous l'avis des collaborateurs et collaboratrices concernés et leur expliquez-vous ensuite comment vous en avez tenu compte ?",
        help: ["FW3.2 exige de consulter les personnes concernées avant une décision qui les touche.", "Dès l'Année 0 pour Petite et Moyenne, Micro non concernée.", "L'entreprise communique ensuite sa décision et la manière dont elle a tenu compte des retours.", "Elle n'est pas tenue de suivre l'avis exprimé, et un échantillon de personnes peut suffire.", "Réunions, enquêtes ou votes conviennent, par exemple pour une révision salariale ou un nouvel outil."],
        examples: ["Communications montrant la prise en compte des retours.", "Traces d'ateliers, de discussions de groupe ou d'enquêtes.", "Entretiens avec le personnel et ses représentants."],
      },
      {
        id: "fw_9",
        codes: ["FW4.1"],
        ref: "FW4.1",
        question: "Évaluez-vous chaque année la culture d'entreprise au moyen d'une enquête ou d'ateliers auprès de vos collaborateurs et collaboratrices ?",
        help: ["FW4.1 exige une évaluation annuelle de la culture d'entreprise auprès des collaborateurs et collaboratrices.", "Dès l'Année 0 pour Petite et Moyenne, Micro non concernée.", "La première évaluation a lieu dans les douze mois précédant l'Année 0, puis chaque année.", "Elle couvre au moins deux thèmes, par exemple satisfaction, bien-être ou sécurité psychologique.", "Dès 50 personnes, l'enquête est qualitative, quantitative et anonyme par défaut."],
        examples: ["Questionnaire d'enquête ou traces d'ateliers.", "Résultats annuels couvrant au moins deux thèmes.", "Communication des résultats au personnel.", "Entretiens avec des collaborateurs et collaboratrices."],
        delaiLong: true,
      },
    ],
  },

  // -------------------------------------------------------------------------
  {
    id: "jedi",
    code: "JEDI",
    codeFr: "JEDI",  // code utilisé dans les PDF français B Lab
    name: "Justice, équité, diversité et inclusion",
    short: "JEDI",
    color: "#7C5E0E",
    icon: "◒",
    description: "Collecte de données pour orienter la démarche, puis choix d'actions parmi 19 options réparties en trois ensembles. Codes B Lab JEDI1 et JEDI2.",
    questions: [
      {
        id: "jedi_1",
        codes: ["JEDI1.1"],
        ref: "JEDI1.1",
        question: "Recueillez-vous chaque année des retours ou des données de vos collaborateurs et collaboratrices sur la diversité et l'inclusion ?",
        help: ["JEDI1.1 exige de recueillir chaque année des données et des retours sur la diversité et l'inclusion.", "Dès l'Année 0 pour Petite et Moyenne, Micro exemptée.", "Une Petite organise chaque année une discussion d'au moins une heure ou une enquête.", "Une Moyenne recueille aussi l'identité de genre dans au moins cinq enquêtes et ventile les résultats.", "Dans une petite équipe, veillez à ce que les réponses ne deviennent pas identifiables."],
        examples: ["Notes de discussion avec date, durée et ordre du jour.", "Questionnaire et résultats annuels d'enquête.", "Communications garantissant l'anonymat de la démarche.", "Pour une Moyenne, données ventilées par identité de genre."],
        delaiLong: true,
      },
      {
        id: "jedi_2",
        codes: ["JEDI2.1", "JEDI2.2", "JEDI2.3", "JEDI2.4", "JEDI2.5", "JEDI2.6"],
        ref: "JEDI2",
        question: "Quelles actions JEDI avez-vous déjà mises en œuvre parmi les 19 options proposées par B Lab ?",
        help: ["JEDI2 exige de réaliser des actions choisies parmi 19 options réparties en trois ensembles.", "Deux actions avant l'Année 0 pour Micro, Petite et Moyenne.", "Aux Années 3 et 5, trois actions pour une Micro, quatre pour une Petite et cinq pour une Moyenne.", "Chaque ensemble est couvert au moins une fois sur les Années 0, 3 et 5.", "Dès la Petite, un plan d'action annuel fondé sur JEDI1 est partagé avec le personnel."],
        examples: ["Confirmation écrite des options retenues et de leur ensemble.", "Plan d'action avec échéances, responsables et statut.", "Accès du personnel au plan, par exemple sur l'intranet.", "Entretiens avec des collaborateurs et collaboratrices."],
        hasJediMenu: true,
      },
    ],
  },

  // -------------------------------------------------------------------------
  {
    id: "hr",
    code: "HR",
    codeFr: "DH",  // code utilisé dans les PDF français B Lab
    name: "Droits humains",
    short: "Droits humains",
    color: "#7C2D52",
    icon: "◓",
    description: "Engagement public, identification des enjeux majeurs et stratégie, prévention et réparation des impacts négatifs, collaboration avec les fournisseurs. Codes B Lab HR1 à HR4.",
    questions: [
      {
        id: "hr_1",
        codes: ["HR1.1", "HR1.2"],
        ref: "HR1.1 / HR1.2",
        question: "Votre entreprise a-t-elle pris un engagement public de respecter les droits humains ?",
        help: ["HR1.1 exige un engagement public de respecter les droits humains.", "Dès l'Année 0 pour Micro et Petite, tous secteurs, et pour Moyenne des services à faible empreinte.", "L'engagement cite les Principes directeurs de l'ONU, la Charte internationale des droits de l'homme et la Déclaration de l'OIT.", "Les Moyennes des autres secteurs relèvent de HR1.2, une politique approuvée par la plus haute instance de direction.", "Un code de conduite ne suffit pas, mais l'engagement peut figurer dans une politique de durabilité plus large."],
        examples: ["Page web ou document public contenant l'engagement, autonome ou intégré à une autre politique.", "À défaut de site, brochure ou page hébergée par une autre organisation.", "Pour HR1.2, politique approuvée par procès-verbal ou signature de la plus haute instance.", "Pour HR1.2, périmètre couvrant toutes les personnes et communautés affectées par la chaîne de valeur."],
      },
      {
        id: "hr_2",
        codes: ["HR2.1"],
        ref: "HR2.1 / HR2.2",
        question: "Avez-vous identifié et hiérarchisé vos enjeux majeurs en matière de droits humains ?",
        help: ["HR2.1 exige une évaluation des enjeux majeurs en matière de droits humains, sur les activités et toute la chaîne de valeur.", "Dès l'Année 0 pour Moyenne hors services à faible empreinte, Micro et Petite n'étant pas concernées.", "L'évaluation porte sur les risques pour les personnes, hiérarchisés selon leur gravité puis leur probabilité.", "Elle s'appuie sur des recherches documentaires et le dialogue avec les parties prenantes, et date de moins de 36 mois.", "La publication des enjeux et de la méthode (HR2.2) n'est attendue qu'à partir de l'Année 3."],
        examples: ["Document interne hiérarchisant les enjeux, avec une section méthodologique couvrant les critères 2.1.1 a à f.", "Traces de l'évaluation, comme une matrice de matérialité, une analyse de la chaîne de valeur ou des échanges.", "Périmètre couvrant toutes les personnes et communautés affectées.", "Date de moins de 36 mois et prise en compte des impacts signalés par l'outil de risque."],
        delaiLong: true,
      },
      {
        id: "hr_3",
        codes: ["HR2.3"],
        ref: "HR2.3",
        question: "Disposez-vous d'une stratégie pour traiter vos enjeux majeurs en matière de droits humains ?",
        help: ["HR2.3 exige une stratégie qui traite chacun des enjeux majeurs identifiés en HR2.1.", "À partir de l'Année 3 pour Moyenne hors services à faible empreinte, Micro et Petite n'étant pas concernées.", "La stratégie est adoptée ou révisée depuis moins de douze mois et approuvée par la plus haute instance de gouvernance.", "Elle précise pour chaque enjeu si l'entreprise le cause, y contribue ou y est liée.", "Elle fixe des objectifs sur trois ans au moins, des indicateurs, des rôles et le dialogue avec les parties prenantes."],
        examples: ["Document de stratégie décrivant la réponse prévue à chaque impact négatif majeur.", "Procès-verbal d'adoption ou de revue datant de moins de douze mois, ou signature de la plus haute instance.", "Type de lien de l'entreprise indiqué pour chaque enjeu majeur.", "Plan de mise en œuvre couvrant les éléments 2.3.5 a à d."],
      },
      {
        id: "hr_8",
        codes: ["HR3.3"],
        ref: "HR3.3",
        question: "Évaluez-vous les risques pour les droits humains liés à vos clients organisationnels et à vos projets avant de vous engager ?",
        help: ["HR3.3 exige un processus d'évaluation des risques pour les droits humains liés aux clients organisationnels et projets envisagés.", "Dès l'Année 0, à toutes les tailles, pour les services à faible empreinte de certaines industries.", "Sont notamment visés l'informatique, la publicité, le juridique, le conseil en management, l'architecture, la construction et l'ingénierie.", "Chaque année, l'entreprise documente l'évaluation de ses trois clients ou projets potentiels les plus importants et les mesures d'atténuation.", "Le but n'est pas d'exclure des clients, mais de les choisir en connaissance de cause."],
        examples: ["Processus ou politique de sélection des clients intégrant des critères relatifs aux droits humains.", "Document décrivant les mesures d'atténuation.", "Relevé annuel des trois clients ou projets potentiels les plus importants et des résultats de l'évaluation.", "En Années 3 et 5, trace des mesures d'atténuation et de leur efficacité."],
      },
      {
        id: "hr_9",
        codes: ["HR3.4"],
        ref: "HR3.4",
        question: "Évaluez-vous les risques pour les droits humains de vos investissements potentiels avant de vous engager ?",
        help: ["HR3.4 exige un processus d'évaluation des risques pour les droits humains liés aux investissements envisagés.", "Dès l'Année 0, à toutes les tailles, pour les services à faible empreinte actifs dans l'investissement.", "Chaque année, l'entreprise documente l'évaluation de ses trois investissements potentiels les plus importants et les mesures d'atténuation.", "L'importance se mesure à la valeur investie ou à la gravité et à la probabilité des impacts.", "Cette question ne s'affiche que si une activité d'investissement a été indiquée dans le contexte."],
        examples: ["Processus ou politique de sélection des investissements intégrant des critères relatifs aux droits humains.", "Document décrivant les mesures d'atténuation.", "Relevé annuel des trois investissements potentiels les plus importants et des résultats de l'évaluation.", "En Années 3 et 5, trace des mesures d'atténuation et de leur efficacité."],
      },
      {
        id: "hr_4",
        codes: ["HR3.1"],
        ref: "HR3.1 / HR3.2",
        question: "Disposez-vous d'un processus pour recueillir, hiérarchiser et faire remonter les informations sur vos impacts négatifs en matière de droits humains ?",
        help: ["HR3.1 exige un processus interne pour recueillir, hiérarchiser et faire remonter les impacts négatifs sur les droits humains.", "Dès l'Année 0 pour Moyenne hors services à faible empreinte, Micro et Petite n'étant pas concernées.", "Les rôles sont définis et les impacts classés selon leur gravité et leur probabilité.", "Le processus prévoit quand approfondir un cas, comment associer les personnes affectées et quels changements déclenchent une évaluation.", "La procédure de réclamation (MGPP3) alimente ce processus, et la remédiation (HR3.2) commence en Année 3."],
        examples: ["Procédure de recueil et de remontée des informations, y compris par la procédure de réclamation.", "Rôles et responsabilités ou fiches de poste qui s'y réfèrent.", "Traces de cas évalués selon la gravité et la probabilité, puis remontés.", "Traces d'échanges avec les parties prenantes."],
      },
      {
        id: "hr_5",
        codes: ["HR4.2", "HR4.3"],
        ref: "HR4.2 / HR4.3",
        question: "Tenez-vous compte des impacts sur les droits humains dans vos principales décisions d'achat ?",
        help: ["HR4.2 et HR4.3 exigent de prendre en compte les droits humains dans les décisions d'achat les plus importantes.", "Dès l'Année 0 pour Micro et Petite, tous secteurs, et pour Moyenne des services, avec HR4.2.", "HR4.2 porte sur les trois principales décisions, HR4.3 sur les cinq pour Moyenne de la fabrication, l'agriculture et la vente.", "L'analyse porte sur l'exercice précédent puis chaque année, tous achats compris, services inclus.", "Le processus peut être commun avec GEC5, ce qui permet de traiter ensemble droits humains et environnement."],
        examples: ["Relevé annuel montrant comment les trois ou cinq principales décisions d'achat ont été déterminées.", "Rapports de dépenses, factures ou bons de commande à l'appui.", "Recherches, échanges avec les fournisseurs ou notations externes montrant la prise en compte des impacts sociaux."],
      },
      {
        id: "hr_6",
        codes: ["HR4.9"],
        ref: "HR4.9",
        question: "Vérifiez-vous si les prestataires de vos contrats de service versent un salaire de subsistance à leur personnel ?",
        help: ["HR4.9 exige de vérifier si les prestataires de services versent un salaire de subsistance ou conventionnel.", "Dès l'Année 0 pour Moyenne des services à faible empreinte, Micro et Petite n'étant pas concernées.", "L'évaluation vise les services sans qualification formelle, comme le nettoyage, la sécurité, l'entretien ou le jardinage.", "Tout écart constaté est consigné, selon l'une des quatre méthodes de vérification admises.", "Aucune évaluation n'est requise sans données disponibles ou en présence d'une convention collective."],
        examples: ["Liste des services ne requérant pas de qualification formelle.", "Rapports d'évaluation des prestataires selon une méthode prévue par le standard.", "Calcul des écarts au salaire de subsistance lorsque les données le permettent."],
      },
      {
        id: "hr_7",
        codes: ["HR4.4"],
        ref: "HR4.4",
        question: "Collaborez-vous avec vos fournisseurs prioritaires pour prévenir ou atténuer vos enjeux majeurs en matière de droits humains ?",
        help: ["HR4.4 exige de collaborer avec les fournisseurs prioritaires pour prévenir les enjeux majeurs en matière de droits humains.", "Micro, Petite et Moyenne ne sont pas concernées.", "Dès l'Année 0 pour Grande, XL et XXL de la vente, de la fabrication, de l'agriculture et des services à forte empreinte.", "Des objectifs sont convenus avec chaque fournisseur prioritaire et les progrès suivis au moins une fois par an.", "Un audit social ou la remise d'un code de conduite ne suffit pas à lui seul."],
        examples: ["Liste des fournisseurs prioritaires et critères de priorisation documentés.", "Objectifs convenus avec chaque fournisseur prioritaire.", "Traces du suivi annuel, comme des tableaux de bord ou des rapports de performance.", "Participation à des groupes de travail sectoriels ou à des initiatives multipartites."],
      },
    ],
  },

  // -------------------------------------------------------------------------
  {
    id: "ca",
    code: "CA",
    codeFr: "AC",  // code utilisé dans les PDF français B Lab
    name: "Action climatique",
    short: "Action climatique",
    color: "#1d6e3a",
    icon: "◔",
    description: "Mesure annuelle des émissions de gaz à effet de serre, engagement en faveur de la limite de 1,5 °C, puis mise en œuvre et progrès du plan d'action climatique. Codes B Lab CA1 à CA3.",
    questions: [
      {
        id: "ca_1",
        codes: ["CA1.1"],
        ref: "CA1.1",
        question: "Mesurez-vous chaque année vos émissions de gaz à effet de serre sur les scopes 1, 2 et 3, et publiez-vous les résultats ?",
        help: ["CA1.1 exige une mesure annuelle documentée des émissions sur les scopes 1, 2 et 3, avec publication de l'inventaire.", "Micro, Petite et Moyenne ne sont pas concernées, seul le plan d'action climatique CA2.1 leur est demandé.", "Dès l'Année 0 pour Grande, XL et XXL, tous secteurs, avec un inventaire annuel public.", "L'inventaire suit le GHG Protocol ou ISO 14064-1 et justifie les catégories du scope 3 exclues."],
        examples: ["Inventaire annuel public, par exemple dans le rapport annuel ou de durabilité.", "Émissions par scope et par catégorie pertinente du scope 3, en tonnes équivalent CO2.", "Scope 2 selon les approches géographique et par le marché.", "Notes méthodologiques conformes au critère 1.1.4."],
      },
      {
        id: "ca_2",
        codes: ["CA1.2"],
        ref: "CA1.2",
        kind: "factual",
        question: "Votre inventaire annuel des émissions de gaz à effet de serre est-il vérifié par un organisme tiers indépendant et accrédité ?",
        help: ["CA1.2 exige la vérification de l'inventaire annuel des émissions par un organisme tiers indépendant et accrédité.", "Micro, Petite et Moyenne ne sont pas concernées.", "Dès l'Année 0 pour Grande, XL et XXL, tous secteurs, sur l'exercice précédent puis chaque année.", "Le vérificateur contrôle la couverture des scopes 1, 2 et 3 pertinents et la méthode exigée par CA1.1.", "Il est accrédité par une instance membre de l'IAF, selon ISO 14064-3 ou ISAE 3410 notamment."],
        examples: ["Déclaration ou rapport de vérification de l'inventaire.", "Certificat d'accréditation du vérificateur délivré par une instance nationale.", "Rapport confirmant le respect des critères 1.2.2 a et b."],
      },
      {
        id: "ca_3",
        codes: ["CA2.1"],
        ref: "CA2.1",
        question: "Disposez-vous d'un plan d'action climatique accessible au public ?",
        help: ["CA2.1 exige un plan d'action climatique accessible au public.", "Dès l'Année 0 pour Micro, Petite et Moyenne, ainsi que sans collaborateurs, tous secteurs.", "Le plan soutient l'objectif de 1,5 °C et fixe des objectifs SMART, des ressources et le dialogue avec les parties prenantes.", "Il est approuvé par la plus haute instance de gouvernance et mis à jour tous les 36 mois.", "Aucune mesure des émissions n'est exigée, et les objectifs ne sont pas des objectifs d'émissions."],
        examples: ["Plan publié sur le site internet ou, à défaut, dans une brochure ou un contenu hébergé par un tiers.", "Plan couvrant les éléments 2.1.2 a à e.", "Budgets, descriptions de poste ou listes de projets attestant les ressources dédiées.", "Approbation par la plus haute instance et date de mise à jour de moins de 36 mois."],
        delaiLong: true,
      },
      {
        id: "ca_4",
        codes: ["CA2.2"],
        ref: "CA2.2",
        kind: "factual",
        question: "Vos objectifs climatiques sont-ils validés par la Science Based Targets initiative ou vérifiés par un organisme tiers indépendant ?",
        help: ["CA2.2 exige des objectifs climatiques scientifiques, validés par la SBTi ou vérifiés par un tiers accrédité.", "Micro, Petite et Moyenne ne sont pas concernées.", "À partir de l'Année 3 pour Grande, XL et XXL.", "Les objectifs comprennent le zéro émission nette aligné sur 1,5 °C et des objectifs à court terme sur les trois scopes."],
        examples: ["Lettre de validation des objectifs par la Science Based Targets initiative.", "À défaut, déclaration de vérification par un tiers indépendant.", "Certificat d'accréditation du vérificateur."],
      },
      {
        id: "ca_5",
        codes: ["CA2.3"],
        ref: "CA2.3",
        question: "Disposez-vous d'un plan de transition climatique qui contribue à l'objectif mondial de zéro émission nette d'ici 2050 ?",
        help: ["CA2.3 exige un plan de transition climatique contribuant au zéro émission nette d'ici 2050.", "Micro, Petite et Moyenne ne sont pas concernées.", "À partir de l'Année 3 pour Grande, XL et XXL.", "Le plan décrit les mesures de réduction, les rôles, les ressources et l'investissement de l'exercice écoulé.", "Il explique la contribution du modèle d'affaires et est approuvé par la plus haute instance de direction."],
        examples: ["Plan de transition couvrant les éléments 2.3.1 a à g.", "Budgets ou projets attestant les ressources dédiées.", "Approbation par la plus haute instance de direction.", "Le cas échéant, registres vérifiés attestant la séquestration des émissions résiduelles."],
      },
      {
        id: "ca_6",
        codes: ["CA3.3", "CA3.4"],
        ref: "CA3.3 / CA3.4",
        question: "Mettez-vous en œuvre votre plan d'action climatique en consignant vos progrès et en évaluant son efficacité ?",
        help: ["CA3.3 exige de consigner les progrès du plan d'action climatique et d'en évaluer l'efficacité.", "À partir de l'Année 3 pour Micro, Petite et Moyenne ainsi que sans collaborateurs, avec mécanismes d'équité possibles.", "L'entreprise agit selon la dernière version du plan et révise ses objectifs si nécessaire.", "Si le plan se révèle inefficace, elle consigne les enseignements et met le plan à jour.", "Pour Grande et plus, CA3.4 s'applique dès l'Année 5 avec un suivi en tonnes équivalent CO2."],
        examples: ["Rapport annuel, tableaux de bord ou rapports de projet relevant les progrès.", "Document reliant les actions menées au plan, avec ressources investies ou procès-verbaux.", "Version actuelle du plan et traces de révision des objectifs.", "Évaluation documentée de l'efficacité."],
      },
      {
        id: "ca_7",
        codes: ["CA3.6", "CA3.7"],
        ref: "CA3.6 / CA3.7",
        question: "Rendez-vous publics les progrès réalisés dans le cadre de votre plan d'action climatique ?",
        help: ["CA3.6 exige de rendre publics les progrès réalisés dans le cadre du plan d'action climatique.", "À partir de l'Année 3 pour Micro, Petite et Moyenne ainsi que sans collaborateurs, tous secteurs.", "La publication présente les performances et les actions menées, sur le site ou un autre support accessible.", "Le standard ne fixe pas de fréquence pour CA3.6.", "Pour Grande et plus, CA3.7 impose dès l'Année 5 une publication annuelle incluant l'inventaire des émissions."],
        examples: ["Page internet ou rapport public présentant les progrès du plan, par exemple le rapport de durabilité.", "À défaut de site, brochure ou contenu hébergé par un tiers."],
      },
    ],
  },

  // -------------------------------------------------------------------------
  {
    id: "esc",
    code: "ESC",
    codeFr: "GEC",  // code utilisé dans les PDF français B Lab
    name: "Gestion environnementale et circularité",
    short: "Environnement et circularité",
    color: "#2f6b1f",
    icon: "◕",
    description: "Connaissance des impacts environnementaux, stratégie pour y remédier, principes de circularité, mesures de prévention et collaboration avec les fournisseurs. Codes B Lab ESC1 à ESC5.",
    questions: [
      {
        id: "esc_1",
        codes: ["ESC1.1"],
        ref: "ESC1.1",
        question: "Mesurez-vous chaque année les déchets produits par vos activités et leur destination finale ?",
        help: ["ESC1.1 exige de mesurer chaque année, en tonnes, les déchets dangereux et non dangereux ainsi que leur destination finale.", "Dès l'Année 0 pour Micro, Petite et Moyenne, tous secteurs sauf services à faible empreinte.", "Pour chaque catégorie, distinguer la part réemployée, recyclée ou revalorisée de la part incinérée sans récupération ou mise en décharge.", "Le suivi peut couvrir d'abord les installations matérielles, puis s'étendre à toutes les installations en Année 5.", "Point d'attention, un déchet de destination inconnue compte comme mis en décharge et l'alimentaire se suit à part."],
        examples: ["Politique, procédure ou système de management environnemental décrivant le suivi des déchets.", "Tableau annuel par catégorie, mode de traitement et installation, avec déchets alimentaires si concernés.", "Bordereaux de suivi des déchets dangereux.", "Liste des installations matérielles et plan d'extension aux sites non suivis."],
      },
      {
        id: "esc_2",
        codes: ["ESC1.2"],
        ref: "ESC1.2",
        question: "Mesurez-vous chaque année votre consommation d'énergie et la part d'énergie renouvelable ?",
        help: ["ESC1.2 exige de mesurer chaque année la consommation totale d'énergie, en gigajoules ou en wattheures.", "Dès l'Année 0 pour Micro, Petite et Moyenne, tous secteurs sauf services à faible empreinte.", "La mesure inclut les combustibles ainsi que l'électricité, la chaleur, la vapeur et le froid achetés.", "Elle précise la part renouvelable, la part autoproduite et une intensité par million de chiffre d'affaires ou par unité.", "Le suivi peut couvrir d'abord les installations matérielles, puis toutes les installations en Année 5."],
        examples: ["Politique, procédure ou système de management environnemental décrivant le suivi de l'énergie.", "Tableau annuel de consommation par installation, ventilé selon ESC1.2.2.", "Photographies et factures d'installation en cas de production renouvelable sur site.", "Liste des installations matérielles et plan d'extension aux sites non suivis."],
      },
      {
        id: "esc_11",
        codes: ["ESC1.3"],
        ref: "ESC1.3",
        question: "Mesurez-vous chaque année votre consommation ou votre prélèvement d'eau ?",
        help: ["ESC1.3 exige de mesurer chaque année la consommation ou le prélèvement d'eau total, en mètres cubes.", "Dès l'Année 0 pour Micro, Petite et Moyenne, tous secteurs sauf services à faible empreinte.", "La mesure inclut l'eau recyclée ou réutilisée et une intensité par million de chiffre d'affaires ou par unité.", "L'entreprise justifie par écrit son choix entre consommation et prélèvement.", "Le suivi peut couvrir d'abord les installations matérielles, puis toutes les installations en Année 5."],
        examples: ["Politique, procédure ou système de management environnemental décrivant le suivi de l'eau.", "Note justifiant le choix entre consommation et prélèvement, avec évaluation du risque hydrique.", "Tableau annuel par installation, ventilé selon ESC1.3.2.", "Liste des installations matérielles et plan d'extension aux sites non suivis."],
      },
      {
        id: "esc_3",
        codes: ["ESC1.4", "ESC1.5"],
        ref: "ESC1.4 / ESC1.5",
        question: "Avez-vous identifié vos installations situées en zone à risque hydrique ou à proximité d'une zone écologiquement sensible ?",
        help: ["ESC1.4 exige d'identifier les installations en zone à risque hydrique et d'y mesurer l'eau chaque année.", "ESC1.5 exige d'évaluer l'impact des sites de production sur une zone écologiquement sensible proche.", "Dès l'Année 0 pour Moyenne, ESC1.4 hors services à faible empreinte et ESC1.5 en fabrication et agriculture seulement.", "L'évaluation ESC1.5 intègre la surface en hectares, classe les impacts par gravité et probabilité et date de moins de 36 mois.", "Micro et Petite ne sont pas concernées, et les bureaux sans production peuvent être exclus d'ESC1.5."],
        examples: ["Liste localisée des installations signalant celles situées en zone à risque.", "Traces de la recherche menée, par exemple rapports publics, échanges avec l'autorité locale ou outils dédiés.", "Tableau de consommation d'eau et plan de gestion de l'eau des sites à risque.", "Évaluation des impacts sur la biodiversité et sa méthode, datée de moins de 36 mois."],
      },
      {
        id: "esc_12",
        codes: ["ESC1.7"],
        ref: "ESC1.7",
        question: "Avez-vous évalué les impacts environnementaux de vos activités et de votre chaîne de valeur, au cours des trois dernières années ?",
        help: ["ESC1.7 exige d'évaluer les impacts environnementaux négatifs réels et potentiels des activités directes et de la chaîne de valeur.", "Dès l'Année 0 pour Moyenne, hors services à faible empreinte, et les entreprises Micro et Petite ne sont pas concernées.", "Elle couvre les cinq facteurs de changement de la nature et le bien-être animal, hiérarchisés par gravité et probabilité.", "Elle repose sur des recherches et sur le dialogue avec les parties prenantes, et date de moins de 36 mois.", "Point d'attention, le climat est toujours matériel et toute exclusion de l'eau, de la biodiversité ou des déchets exige une justification approuvée."],
        examples: ["Rapport hiérarchisant les enjeux, avec sa méthode, daté de moins de 36 mois.", "Pièces justificatives telles que données de performance, échanges avec les parties prenantes ou registre des impacts.", "Justification scientifique signée en cas d'enjeu jugé non matériel.", "Note sur les impacts potentiels signalés par l'outil d'évaluation des risques de B Lab."],
        delaiLong: true,
      },
      {
        id: "esc_8",
        codes: ["ESC1.6"],
        ref: "ESC1.6",
        question: "Si vous élevez, transportez ou abattez des animaux, suivez-vous leurs conditions de bien-être ?",
        help: ["ESC1.6 exige des indicateurs sur l'élevage, le transport et l'abattage des animaux, dans le respect des cinq libertés.", "Dès l'Année 0 pour Micro, Petite et Moyenne, tous secteurs, les entreprises sans collaborateurs étant exemptées.", "Elle ne s'applique que si l'entreprise contrôle une installation où elle manipule, transporte ou abat elle-même des animaux.", "L'entreprise établit un résumé annuel des conditions de bien-être animal et respecte le droit applicable.", "Point d'attention, l'achat de produits animaux à des tiers relève d'ESC1.7 et une certification tierce peut servir de preuve."],
        examples: ["Note ou organigramme décrivant les activités liées aux animaux, ou confirmant leur absence.", "Indicateurs d'élevage, de transport et d'abattage, avec tableau de suivi annuel.", "Résumé annuel des conditions de bien-être animal.", "Liste des lois applicables et preuves de conformité, telles qu'autorisations, politiques ou audits."],
      },
      {
        id: "esc_9",
        codes: ["ESC2.6"],
        ref: "ESC2.6",
        question: "Évaluez-vous les impacts environnementaux négatifs potentiels de vos clients et de vos projets avant de vous engager ?",
        help: ["ESC2.6 exige un processus d'évaluation des impacts environnementaux potentiels des clients organisationnels et des projets envisagés.", "Dès l'Année 0 pour toutes les tailles, uniquement dans certains services à faible empreinte.", "Sont visés notamment publicité, conseil, ingénierie, architecture, droit, logiciel, édition, immobilier et R&D.", "Chaque année, l'entreprise documente l'évaluation de ses trois prospects les plus matériels et prévoit des mesures d'atténuation.", "Point d'attention, le but n'est pas d'exclure d'office des clients et les particuliers ne sont pas visés."],
        examples: ["Processus documenté d'évaluation des clients et des projets, avec processus d'atténuation.", "Grille ou politique de sélection intégrant des critères environnementaux.", "Relevé annuel des trois prospects les plus matériels et résultats des évaluations.", "Dès l'Année 3, mesures d'atténuation appliquées et évaluation de leur efficacité."],
      },
      {
        id: "esc_10",
        codes: ["ESC2.7"],
        ref: "ESC2.7",
        question: "Évaluez-vous les impacts environnementaux négatifs potentiels de vos investissements avant de les réaliser ?",
        help: ["ESC2.7 exige un processus d'évaluation des impacts environnementaux potentiels des investissements futurs, avec mesures d'atténuation.", "Dès l'Année 0 pour toutes les tailles, uniquement en investissement en fonds propres et en conseil en investissement.", "Chaque année, l'entreprise documente l'évaluation de ses trois investissements envisagés les plus matériels.", "La matérialité se fonde sur le montant investi ou sur l'importance de l'impact potentiel.", "Un investissement répété dans le même actif ne demande pas de nouvelle évaluation."],
        examples: ["Processus documenté d'évaluation des investissements, avec processus d'atténuation.", "Politique ou grille de sélection intégrant des critères environnementaux.", "Relevé annuel des trois investissements les plus matériels et résultats des évaluations.", "Dès l'Année 3, mesures d'atténuation appliquées et évaluation de leur efficacité."],
      },
      {
        id: "esc_4",
        codes: ["ESC2.1"],
        ref: "ESC2.1",
        question: "Disposez-vous d'une stratégie environnementale approuvée par la direction, fondée sur vos impacts matériels ?",
        help: ["ESC2.1 exige une stratégie environnementale traitant les impacts matériels identifiés par ESC1.7.", "Dès l'Année 3 pour Moyenne, hors services à faible empreinte, et Micro et Petite ne sont pas concernées.", "Elle fixe des objectifs chiffrés sur au moins 36 mois, des indicateurs, des responsabilités et un plan de dialogue.", "La plus haute instance de direction l'approuve, et elle est adoptée ou révisée chaque année.", "Point d'attention, elle n'est pas exigible en Année 0 mais suppose une évaluation ESC1.7 déjà solide."],
        examples: ["Document de stratégie et plan de mise en œuvre, couvrant activités et chaîne de valeur.", "Approbation par la direction ou le conseil.", "Procès-verbal de revue ou d'adoption datant de moins de douze mois."],
      },
      {
        id: "esc_5",
        codes: ["ESC3.3"],
        ref: "ESC3.3",
        question: "Intégrez-vous les principes de circularité dans la conception de vos produits ?",
        help: ["ESC3.3 exige d'appliquer au moins une option de circularité dans la conception des produits.", "Dès l'Année 3 pour Petite et Moyenne, hors services à faible empreinte, et Micro n'est pas concernée.", "Les options sont réduire l'usage unique, concevoir des produits durables ou des produits recyclables en fin de vie.", "L'entreprise explique comment la conception respecte la hiérarchie des déchets.", "Point d'attention, seuls les produits fabriqués par l'entreprise ou pour son compte sont visés, pas la simple revente."],
        examples: ["Confirmation écrite des options retenues et fiches techniques des produits.", "Document montrant le respect de la hiérarchie des déchets.", "Part en poids du portefeuille couverte par chaque option.", "Selon l'option, tests de durabilité, preuves de recyclabilité ou adhésion à des initiatives collectives."],
      },
      {
        id: "esc_6",
        codes: ["ESC4.1", "ESC4.2"],
        ref: "ESC4.1 / ESC4.2",
        question: "Mettez-vous en œuvre des actions concrètes pour prévenir ou atténuer vos impacts environnementaux, et en mesurez-vous les résultats ?",
        help: ["ESC4.1 et ESC4.2 exigent des actions pour prévenir ou atténuer les impacts environnementaux, avec des résultats mesurés.", "ESC4.1 vise Petite dès l'Année 3 et ESC4.2 vise Moyenne dès l'Année 5, hors services à faible empreinte.", "Pour ESC4.1, une amélioration mesurée sur les déchets, l'énergie, l'eau ou le bien-être animal suffit.", "Pour ESC4.2, l'entreprise progresse vers les objectifs ESC2.1, en évalue l'efficacité et en rend compte à la direction.", "Micro n'est pas concernée, et rien n'est dû en Année 0."],
        examples: ["Traces des actions menées, liées aux activités ou à la chaîne de valeur.", "Engagements, rapports d'avancement, tableaux de bord et données d'impact.", "Pour ESC4.2, rapport d'efficacité transmis à la direction et mise à jour de la stratégie."],
      },
      {
        id: "esc_7",
        codes: ["ESC5.1", "ESC5.2"],
        ref: "ESC5.1 / ESC5.2",
        question: "Prenez-vous en compte les impacts environnementaux dans vos décisions d'achat les plus importantes ?",
        help: ["ESC5.1 et ESC5.2 exigent d'intégrer les impacts environnementaux dans les décisions d'achat les plus matérielles.", "ESC5.1 demande trois décisions dès l'Année 0 pour Micro, Petite, entreprises sans collaborateurs et Moyenne de services.", "ESC5.2 demande cinq décisions dès l'Année 0 pour Moyenne de fabrication, d'agriculture et de commerce.", "Les décisions se choisissent chaque année selon la dépense, le volume ou l'impact, services compris.", "Point d'attention, un processus commun avec les achats responsables en droits humains est admis."],
        examples: ["Relevé annuel du processus de sélection des décisions d'achat les plus matérielles.", "Rapports de dépenses, factures ou bons de commande à l'appui.", "Évaluations d'impact des achats retenus."],
      },
      {
        id: "esc_13",
        codes: ["ESC3.1"],
        ref: "ESC3.1",
        question: "Mesurez-vous chaque année les matériaux utilisés pour vos produits et vos emballages ?",
        help: ["ESC3.1 exige une vue d'ensemble annuelle, en tonnes, des matériaux utilisés pour les produits et pour les emballages.", "Micro, Petite et Moyenne ne sont pas concernées, l'exigence visant Grande et plus hors services à faible empreinte.", "Elle indique le poids total, la part renouvelable certifiée par des tiers et la part réemployée ou recyclée.", "Des estimations sont admises au départ, le poids réel étant exigé à l'issue de l'Année 3."],
        examples: ["Vue d'ensemble annuelle des matériaux entrants sous forme de tableur, de plateforme d'achat ou de base de données.", "Certifications de durabilité ou évaluations de tiers pour les matériaux renouvelables."],
      },
      {
        id: "esc_14",
        codes: ["ESC5.3"],
        ref: "ESC5.3",
        question: "Collaborez-vous avec vos fournisseurs prioritaires pour réduire leurs impacts environnementaux ?",
        help: ["ESC5.3 exige de collaborer avec les fournisseurs prioritaires pour réduire leurs impacts environnementaux.", "Micro, Petite et Moyenne ne sont pas concernées, l'exigence visant Grande et plus hors services à faible empreinte.", "Les fournisseurs prioritaires découlent des impacts matériels relevés par ESC1.7, tous rangs confondus.", "L'entreprise convient d'objectifs avec chacun et suit les progrès au moins une fois par an."],
        examples: ["Liste des fournisseurs prioritaires et critères de priorisation.", "Objectifs convenus et suivi annuel, par exemple procès-verbaux ou tableaux de bord.", "Traces de participation à des actions collectives ou à des associations professionnelles."],
      },
    ],
  },

  // -------------------------------------------------------------------------
  {
    id: "gaca",
    code: "GACA",
    codeFr: "APAC",  // code utilisé dans les PDF français B Lab
    name: "Affaires publiques et action collective",
    short: "Affaires publiques",
    color: "#5b3a8a",
    icon: "◖",
    description: "Lobbying responsable et transparent, actions collectives au service d'impacts sociaux ou environnementaux, fiscalité responsable et transparente. Codes B Lab GACA1 à GACA3.",
    questions: [
      {
        id: "gaca_1",
        codes: ["GACA1.1"],
        ref: "GACA1.1",
        question: "Disposez-vous d'une politique de lobbying responsable publiée sur votre site internet ?",
        help: ["GACA1.1 exige une politique de lobbying responsable publiée sur le site internet.", "Dès l'Année 0 pour Micro, Petite et Moyenne, tous secteurs.", "Sans activité de lobbying, une déclaration publique en ce sens suffit.", "Sinon, la politique couvre contributions politiques, corruption, associations professionnelles et gouvernance, puis la plus haute instance l'approuve.", "Un lobbying contraire à la mission empêche la certification."],
        examples: ["Déclaration publique d'absence de lobbying.", "À défaut, politique de lobbying en ligne conforme.", "Procès-verbal d'approbation par la plus haute instance de direction."],
      },
      {
        id: "gaca_2",
        codes: ["GACA1.2", "GACA1.3"],
        ref: "GACA1.2 / GACA1.3",
        question: "Publiez-vous chaque année vos positions de lobbying et vos contributions politiques ?",
        help: ["GACA1.3 exige un rapport public annuel sur les positions de lobbying et les contributions politiques.", "Dès l'Année 3 pour Micro, Petite et Moyenne.", "Le rapport indique la valeur et les bénéficiaires des contributions, financières ou en nature.", "Il résume les positions de lobbying matérielles et est supervisé par la plus haute instance de direction.", "Sans activité de lobbying, une déclaration publique en ce sens suffit."],
        examples: ["Rapport annuel publié sur le site internet.", "Procès-verbal de supervision par la plus haute instance de direction.", "Déclaration publique d'absence de lobbying, le cas échéant."],
      },
      {
        id: "gaca_3",
        codes: ["GACA2.1", "GACA2.2", "GACA2.3", "GACA2.4", "GACA2.5"],
        ref: "GACA2",
        question: "Quelles actions collectives menez-vous parmi les cinq types reconnus par B Lab ?",
        help: ["GACA2 exige de participer à des actions collectives parmi cinq types reconnus par B Lab.", "Au moins une action en Année 0 pour Micro, Petite et Moyenne.", "Aux Années 3 et 5, Petite et Moyenne passent à deux types d'action.", "Pour une Moyenne, chaque type comporte des critères renforcés, par exemple 0,2 % du chiffre d'affaires pour la recherche.", "Une action menée pour un autre standard B Lab peut compter."],
        examples: ["Confirmation écrite des types d'action choisis.", "Partenaires externes et lien avec un impact positif.", "Preuves propres à chaque type, par exemple programme de mentorat ou contribution à la recherche.", "Billets, conférences ou articles pour le leadership d'opinion."],
        hasGacaMenu: true,
      },
      {
        id: "gaca_4",
        codes: ["GACA3.1", "GACA3.2"],
        ref: "GACA3.1 / GACA3.2",
        question: "Disposez-vous d'une politique de fiscalité responsable, approuvée par votre plus haute instance et publiée ?",
        help: ["GACA3.1 exige une politique de fiscalité responsable approuvée par la plus haute instance et publiée.", "Micro, Petite et Moyenne ne sont pas concernées, seules les XXL dès l'Année 0.", "La politique relie la fiscalité à la stratégie et couvre gouvernance, risques et relations avec les autorités.", "Un document limité à la conformité légale ne suffit pas.", "Le reporting pays par pays (GACA3.2) s'ajoute dès l'Année 3."],
        examples: ["Politique fiscale publiée, autonome ou intégrée à un autre rapport.", "Procès-verbal ou signature d'approbation par la plus haute instance."],
      },
    ],
  },
];

// ============================================================================
// COMPONENT PRINCIPAL
// ============================================================================

const STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700&family=Manrope:wght@400;500;600;700;800&display=swap');

  .kiact-app {
    font-family: 'Manrope', system-ui, sans-serif;
    color: #0f1f1f;
    background: #FAFAF7;
    min-height: 100vh;
  }
  .kiact-display {
    font-family: 'Fraunces', Georgia, serif;
    font-feature-settings: "ss01" on, "ss02" on;
    letter-spacing: -0.01em;
  }
  .kiact-shadow {
    box-shadow: 0 1px 2px rgba(15,31,31,0.04), 0 8px 24px rgba(15,31,31,0.06);
  }
  .kiact-shadow-lg {
    box-shadow: 0 2px 4px rgba(15,31,31,0.04), 0 24px 48px rgba(15,31,31,0.08);
  }
  .kiact-card {
    background: white;
    border-radius: 14px;
    border: 1px solid rgba(15,31,31,0.06);
  }
  .kiact-btn {
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    font-weight: 600;
    letter-spacing: -0.005em;
  }
  .kiact-btn:hover {
    transform: translateY(-1px);
  }
  @media (max-width: 640px) {
    .kiact-header { padding: 12px 16px !important; }
  }
  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(8px); }
    to { opacity: 1; transform: translateY(0); }
  }
  .fade-up { animation: fadeUp 0.4s ease-out forwards; }
  .answer-pill {
    transition: all 0.18s ease;
    cursor: pointer;
  }
  .answer-pill:hover {
    transform: scale(1.02);
  }

  /* === Styles d'impression PDF =========================================== */
  @media print {
    @page { size: A4; margin: 12mm 14mm; }
    body { background: white !important; }
    .kiact-app { background: white !important; }

    /* Masquer tout ce qui n'a pas de sens en PDF */
    .no-print { display: none !important; }
    header, /* Header app */
    nav, /* StepBar */
    button { display: none !important; }

    /* Le bloc consultant est masqué (info privée non partageable) */
    [data-consultant-only="true"] { display: none !important; }

    /* Cartes plus compactes en print */
    .kiact-card {
      box-shadow: none !important;
      border: 1px solid #e5e5e5 !important;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .kiact-shadow, .kiact-shadow-lg {
      box-shadow: none !important;
    }

    /* Couleurs préservées */
    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }

    /* Police légèrement réduite pour A4 */
    .kiact-display { font-size: 90% !important; }

    /* Sauts de page propres entre sections principales */
    h1, h2, h3 { page-break-after: avoid; }
  }
`;

// --- Petit logo KiAct typographique inline ----------------------------------
const KiActLogo = ({ size = 36 }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
    <div style={{
      width: size, height: size, borderRadius: 10,
      background: "linear-gradient(135deg, #388D54 0%, #4583D4 100%)",
      display: "flex", alignItems: "center", justifyContent: "center",
      color: "white", fontFamily: "Fraunces, serif", fontWeight: 700,
      fontSize: size * 0.5, letterSpacing: "-0.02em",
    }}>K</div>
    <div>
      <div className="kiact-display" style={{ fontWeight: 700, fontSize: 18, lineHeight: 1, letterSpacing: "-0.02em" }}>KiAct</div>
      <div style={{ fontSize: 10, color: "#6B7670", letterSpacing: "0.08em", textTransform: "uppercase", marginTop: 2 }}>Consulting</div>
    </div>
  </div>
);

// --- Header ------------------------------------------------------------------
const Header = ({ consultantMode, onToggleConsultant, onNewSession, hasSession, hideControls, homeButton }) => (
  <header className="kiact-header" style={{
    background: "white",
    borderBottom: "1px solid rgba(15,31,31,0.08)",
    padding: "16px 32px",
    display: "flex",
    flexWrap: "wrap",
    gap: 10,
    alignItems: "center",
    justifyContent: "space-between",
    position: "sticky",
    top: 0,
    zIndex: 50,
  }}>
    <KiActLogo />
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 16 }}>
      <div style={{ textAlign: "right", marginRight: 8 }}>
        <div style={{ fontSize: 10, color: "#6B7670", letterSpacing: "0.08em", textTransform: "uppercase" }}>Diagnostic</div>
        <div className="kiact-display" style={{ fontWeight: 600, fontSize: 15, marginTop: 1 }}>B Corp · Standards V2</div>
      </div>
      {!hideControls && (
        <>
          {/* Toggle mode consultant */}
          <button
            onClick={onToggleConsultant}
            className="kiact-btn"
            title={consultantMode ? "Mode consultant actif. Votre estimation de charge s'affiche sous chaque question" : "Activer le mode consultant pour estimer la charge"}
            style={{
              padding: "8px 14px",
              borderRadius: 999,
              fontSize: 12,
              fontWeight: 700,
              background: consultantMode ? "linear-gradient(135deg, #0f1f1f 0%, #1a3838 100%)" : "white",
              color: consultantMode ? "#7CC956" : "#0f1f1f",
              border: consultantMode ? "1.5px solid #0f1f1f" : "1.5px solid rgba(15,31,31,0.15)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
              letterSpacing: "0.02em",
            }}
          >
            <span style={{ fontSize: 10 }}>{consultantMode ? "●" : "○"}</span>
            Mode consultant
          </button>
          {hasSession && (
            <button
              onClick={onNewSession}
              className="kiact-btn"
              title={homeButton ? "Retour à la liste des diagnostics" : "Effacer la session en cours"}
              style={{
                padding: "8px 12px", borderRadius: 999, fontSize: 12, fontWeight: 600,
                background: "white", color: "#6B7670",
                border: "1.5px solid rgba(15,31,31,0.12)", cursor: "pointer",
              }}
            >
              {homeButton ? "← Mes diagnostics" : "↻ Nouveau"}
            </button>
          )}
        </>
      )}
    </div>
  </header>
);

// --- Step indicator ----------------------------------------------------------
const StepBar = ({ steps, currentIndex }) => (
  <div style={{ padding: "20px 32px", background: "white", borderBottom: "1px solid rgba(15,31,31,0.06)" }}>
    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
      {steps.map((s, i) => {
        const done = i < currentIndex;
        const active = i === currentIndex;
        return (
          <React.Fragment key={s.id}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, opacity: done || active ? 1 : 0.4 }}>
              <div style={{
                width: 26, height: 26, borderRadius: "50%",
                background: done ? "#388D54" : active ? "#0f1f1f" : "white",
                border: done || active ? "none" : "1.5px solid rgba(15,31,31,0.2)",
                color: done || active ? "white" : "#6B7670",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 11, fontWeight: 700,
              }}>
                {done ? "✓" : i + 1}
              </div>
              <div className="kiact-display" style={{ fontWeight: 600, fontSize: 13, color: active ? "#0f1f1f" : "#6B7670" }}>
                {s.label}
              </div>
            </div>
            {i < steps.length - 1 && (
              <div style={{ flex: 1, height: 1.5, background: done ? "#388D54" : "rgba(15,31,31,0.08)", margin: "0 4px" }} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  </div>
);

// --- Étape 1 : Contexte ------------------------------------------------------
const ContextStep = ({ ctx, setCtx, onNext }) => {
  // Catégories candidates calculées
  const sizeFTE = sizeFromFTE(ctx.ftes);

  // Conversion du revenu en M USD
  const revenueNum = parseFloat(String(ctx.revenue || "").replace(",", "."));
  const fxRate = getFxRate(ctx);
  const revenueUSD = !isNaN(revenueNum) && revenueNum >= 0 ? revenueNum * fxRate : null;
  const sizeRevenue = revenueUSD !== null ? sizeFromRevenueUSD(revenueUSD) : null;

  // Catégorie auto = Lesser of Two
  const autoSize = lesserOfTwo(sizeFTE, sizeRevenue);

  // Catégorie effective = override manuel s'il existe, sinon auto
  const effectiveSize = ctx.sizeOverride
    ? SIZE_TIERS.find((t) => t.id === ctx.sizeOverride)
    : autoSize;

  // Pour les services à faible empreinte, la réponse à la question "activité
  // d'investissement" est requise (conditionne ESC2.7 / HR3.4).
  const investmentAnswered = ctx.sector !== "services_faible" || typeof ctx.hasInvestment === "boolean";
  // L'industrie conditionne HR3.3 et ESC2.6 (évaluation des clients et projets)
  const industryAnswered = ctx.sector !== "services_faible" || !!ctx.industry;
  const ready = ctx.companyName && ctx.status && effectiveSize && ctx.sector && investmentAnswered && industryAnswered;

  return (
    <div className="fade-up" style={{ maxWidth: 880, margin: "0 auto", padding: "48px 32px" }}>
      <div style={{ marginBottom: 8, fontSize: 12, color: "#388D54", letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: 700 }}>
        Étape 1 / 3
      </div>
      <h1 className="kiact-display" style={{ fontSize: 40, fontWeight: 600, lineHeight: 1.1, marginBottom: 12, letterSpacing: "-0.02em" }}>
        Cadrage de l'entreprise
      </h1>
      <p style={{ fontSize: 16, color: "#4A5552", marginBottom: 40, maxWidth: 620, lineHeight: 1.5 }}>
        Les exigences B Corp varient selon la taille, le secteur et le statut actuel. Ces informations conditionnent le diagnostic.
      </p>

      <div className="kiact-card kiact-shadow" style={{ padding: 32 }}>
        {/* Nom */}
        <Field label="Nom de l'entreprise">
          <input
            type="text"
            value={ctx.companyName}
            onChange={(e) => setCtx({ ...ctx, companyName: e.target.value })}
            placeholder="Ex. Blanc SA"
            style={inputStyle}
          />
        </Field>

        {/* Consolidation du périmètre */}
        <div style={{ marginTop: 24, padding: "10px 14px", background: "rgba(69,131,212,0.07)", borderRadius: 8, fontSize: 12.5, color: "#4A5552", lineHeight: 1.5 }}>
          <strong style={{ color: "#0f1f1f" }}>Chiffres consolidés.</strong>{" "}
          Saisissez l'effectif et le revenu de toutes les entités que l'entreprise contrôle, tous sites et tous pays confondus.
          B Lab calcule la taille sur l'ensemble du périmètre de certification.
        </div>

        {/* Effectif + Pays */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginTop: 24 }}>
          <Field label="Effectif en ETP">
            <input
              type="number"
              step="0.1"
              min="0"
              value={ctx.ftes}
              onChange={(e) => setCtx({ ...ctx, ftes: e.target.value, sizeOverride: null })}
              placeholder="Ex. 95.5"
              style={inputStyle}
            />
            <div style={{ marginTop: 6, fontSize: 11, color: "#6B7670", lineHeight: 1.4 }}>
              Équivalent temps plein. Une personne à 50 % compte 0,5 et une personne à 80 % compte 0,8.
              B Lab compte aussi les prestataires indépendants et les intérimaires qui travaillent plus de 20 heures par semaine depuis plus de six mois.
              Les stagiaires et les apprentis ne sont pas comptés.
            </div>
            {sizeFTE && (
              <div style={{ marginTop: 10, padding: "8px 12px", background: "rgba(15,31,31,0.04)", borderRadius: 8, fontSize: 12.5, color: "#4A5552" }}>
                <span style={{ fontWeight: 700, color: "#0f1f1f" }}>Selon ETP</span> →{" "}
                <span style={{ fontWeight: 700, color: "#388D54" }}>{sizeFTE.label}</span>
              </div>
            )}
          </Field>

          <Field label="Pays principal d'activité">
            <select
              value={ctx.country}
              onChange={(e) => setCtx({ ...ctx, country: e.target.value })}
              style={inputStyle}
            >
              <option value="CH">Suisse</option>
              <option value="FR">France</option>
              <option value="EU">Autre Union européenne</option>
              <option value="OTHER">Autre</option>
            </select>
          </Field>
        </div>

        {/* Revenu annuel */}
        <Field label="Revenu annuel" style={{ marginTop: 24 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 140px", gap: 12 }}>
            <input
              type="number"
              step="0.1"
              min="0"
              value={ctx.revenue}
              onChange={(e) => setCtx({ ...ctx, revenue: e.target.value, sizeOverride: null })}
              placeholder="Ex. 12.5"
              style={inputStyle}
            />
            <select
              value={ctx.revenueCurrency || "CHF"}
              onChange={(e) => setCtx({ ...ctx, revenueCurrency: e.target.value, fxRate: "", sizeOverride: null })}
              style={inputStyle}
            >
              <option value="CHF">M CHF</option>
              <option value="EUR">M EUR</option>
              <option value="USD">M USD</option>
            </select>
          </div>
          {(ctx.revenueCurrency || "CHF") !== "USD" && (
            <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontSize: 12.5, color: "#4A5552" }}>
              <span>Taux appliqué, 1 {ctx.revenueCurrency || "CHF"} =</span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={ctx.fxRate ?? ""}
                onChange={(e) => setCtx({ ...ctx, fxRate: e.target.value, sizeOverride: null })}
                placeholder={String(FX[ctx.revenueCurrency || "CHF"])}
                style={{ ...inputStyle, width: 100, padding: "6px 10px", fontSize: 13 }}
                title="Laissez vide pour utiliser le taux par défaut"
              />
              <span>USD</span>
            </div>
          )}
          <div style={{ marginTop: 6, fontSize: 11, color: "#6B7670", lineHeight: 1.4 }}>
            Montant en millions. B Lab applique ses seuils de taille en USD.
            {(ctx.revenueCurrency || "CHF") !== "USD" && <> {FX_SOURCE_LABEL} Laissez le champ vide pour utiliser le taux par défaut.</>}
          </div>
          {sizeRevenue && (
            <div style={{ marginTop: 10, padding: "8px 12px", background: "rgba(15,31,31,0.04)", borderRadius: 8, fontSize: 12.5, color: "#4A5552" }}>
              <span style={{ fontWeight: 700, color: "#0f1f1f" }}>
                Selon revenu ({revenueUSD.toFixed(1)} M USD)
              </span> →{" "}
              <span style={{ fontWeight: 700, color: "#388D54" }}>{sizeRevenue.label}</span>
            </div>
          )}
        </Field>

        {/* Sites et pays */}
        <Field label="Sites et pays (facultatif)" style={{ marginTop: 24 }}>
          <textarea
            rows={2}
            value={ctx.sites || ""}
            onChange={(e) => setCtx({ ...ctx, sites: e.target.value })}
            placeholder="Ex. Siège à Lausanne, atelier à Yverdon-les-Bains, filiale à Annecy (France)"
            style={{ ...inputStyle, resize: "vertical" }}
          />
          <div style={{ marginTop: 6, fontSize: 11, color: "#6B7670", lineHeight: 1.4 }}>
            Chaque site contrôlé entre dans le périmètre de certification. Cette information est reprise dans l'export.
          </div>
        </Field>

        {/* Synthèse Lesser of Two */}
        {(sizeFTE || sizeRevenue) && (
          <div style={{
            marginTop: 24,
            padding: "18px 20px",
            background: "linear-gradient(135deg, rgba(56,141,84,0.06) 0%, rgba(69,131,212,0.04) 100%)",
            border: "1.5px solid rgba(56,141,84,0.25)",
            borderRadius: 12,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <span style={{
                fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase",
                color: "#388D54", padding: "3px 10px", background: "white", borderRadius: 999,
                border: "1px solid rgba(56,141,84,0.2)",
              }}>
                Règle de la plus petite catégorie
              </span>
              <span style={{ fontSize: 11, color: "#6B7670" }}>En vigueur depuis novembre 2025</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", fontSize: 13 }}>
              <span style={{ color: "#4A5552" }}>
                Catégorie ETP : <strong style={{ color: "#0f1f1f" }}>{sizeFTE?.label || "—"}</strong>
              </span>
              <span style={{ color: "#9CA3AF" }}>·</span>
              <span style={{ color: "#4A5552" }}>
                Catégorie revenu : <strong style={{ color: "#0f1f1f" }}>{sizeRevenue?.label || "—"}</strong>
              </span>
              <span style={{ color: "#9CA3AF" }}>·</span>
              <span style={{ color: "#388D54", fontWeight: 700 }}>
                → Catégorie B Lab : {autoSize?.label || "à compléter"}
              </span>
            </div>
            {!sizeRevenue && sizeFTE && (
              <div style={{ marginTop: 10, fontSize: 12, color: "#6B7670", fontStyle: "italic" }}>
                Renseignez le revenu pour appliquer la règle de la plus petite catégorie.
                Sans cette information, l'outil retient la catégorie issue des ETP, qui peut être supérieure à la catégorie réelle.
              </div>
            )}
          </div>
        )}

        {/* Override manuel */}
        {autoSize && (
          <Field label="Ajuster manuellement (optionnel)" style={{ marginTop: 20 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => setCtx({ ...ctx, sizeOverride: null })}
                className="kiact-btn"
                style={{
                  padding: "8px 14px", borderRadius: 999, fontSize: 12,
                  background: !ctx.sizeOverride ? "#0f1f1f" : "white",
                  color: !ctx.sizeOverride ? "white" : "#0f1f1f",
                  border: !ctx.sizeOverride ? "1.5px solid #0f1f1f" : "1.5px solid rgba(15,31,31,0.12)",
                  cursor: "pointer", fontWeight: 600,
                }}
              >
                Auto ({autoSize.label})
              </button>
              {SIZE_TIERS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setCtx({ ...ctx, sizeOverride: t.id })}
                  className="kiact-btn"
                  style={{
                    padding: "8px 14px", borderRadius: 999, fontSize: 12,
                    background: ctx.sizeOverride === t.id ? "#388D54" : "white",
                    color: ctx.sizeOverride === t.id ? "white" : "#0f1f1f",
                    border: ctx.sizeOverride === t.id ? "1.5px solid #388D54" : "1.5px solid rgba(15,31,31,0.12)",
                    cursor: "pointer", fontWeight: 600,
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </Field>
        )}

        {/* Statut */}
        <Field label="Situation B Corp" style={{ marginTop: 32 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {STATUS_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setCtx({ ...ctx, status: opt.id })}
                className="kiact-btn"
                style={{
                  textAlign: "left",
                  padding: "14px 18px",
                  borderRadius: 10,
                  background: ctx.status === opt.id ? "#0f1f1f" : "white",
                  color: ctx.status === opt.id ? "white" : "#0f1f1f",
                  border: ctx.status === opt.id ? "1.5px solid #0f1f1f" : "1.5px solid rgba(15,31,31,0.12)",
                  cursor: "pointer",
                }}
              >
                <div style={{ fontWeight: 700, fontSize: 14 }}>{opt.label}</div>
                <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>{opt.hint}</div>
              </button>
            ))}
          </div>
        </Field>

        {/* Secteur */}
        <Field label="Secteur d'activité" style={{ marginTop: 32 }}>
          <div style={{ display: "grid", gap: 8 }}>
            {SECTORS.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setCtx({ ...ctx, sector: s.id, hasInvestment: s.id === "services_faible" ? ctx.hasInvestment : null, industry: s.id === "services_faible" ? ctx.industry : "", isMining: s.id === "fabrication" ? ctx.isMining : false })}
                className="kiact-btn"
                style={{
                  textAlign: "left",
                  padding: "12px 18px",
                  borderRadius: 10,
                  background: ctx.sector === s.id ? "rgba(56,141,84,0.08)" : "white",
                  border: ctx.sector === s.id ? "1.5px solid #388D54" : "1.5px solid rgba(15,31,31,0.12)",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{s.label}</div>
                  <div style={{ fontSize: 12, color: "#6B7670", marginTop: 2 }}>{s.hint}</div>
                </div>
                {ctx.sector === s.id && (
                  <div style={{ color: "#388D54", fontWeight: 700, fontSize: 18 }}>✓</div>
                )}
              </button>
            ))}
          </div>
        </Field>

        {/* Activité d'investissement — n'apparaît que pour les services à faible empreinte.
            Conditionne les sous-exigences ESC2.7 et HR3.4 (impacts des investissements). */}
        {ctx.sector === "services_faible" && (
          <Field label="Activité d'investissement" style={{ marginTop: 32 }}>
            <div style={{ fontSize: 13, color: "#6B7670", marginBottom: 10, lineHeight: 1.5 }}>
              L'entreprise exerce-t-elle une activité d'investissement (gestion d'actifs,
              capital-investissement, conseil en investissement) ? Deux sous-exigences B Corp
              (ESC2.7 et HR3.4, impacts environnementaux et droits humains des investissements)
              ne s'appliquent qu'aux entreprises concernées.
            </div>
            <div style={{ display: "grid", gap: 8 }}>
              {[
                { val: false, label: "Non", hint: "Pas d'activité d'investissement" },
                { val: true, label: "Oui", hint: "Gestion d'actifs, equity, conseil en investissement" },
              ].map((opt) => (
                <button
                  key={String(opt.val)}
                  type="button"
                  onClick={() => setCtx({ ...ctx, hasInvestment: opt.val })}
                  className="kiact-btn"
                  style={{
                    textAlign: "left",
                    padding: "12px 18px",
                    borderRadius: 10,
                    background: ctx.hasInvestment === opt.val ? "rgba(56,141,84,0.08)" : "white",
                    border: ctx.hasInvestment === opt.val ? "1.5px solid #388D54" : "1.5px solid rgba(15,31,31,0.12)",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{opt.label}</div>
                    <div style={{ fontSize: 12, color: "#6B7670", marginTop: 2 }}>{opt.hint}</div>
                  </div>
                  {ctx.hasInvestment === opt.val && (
                    <div style={{ color: "#388D54", fontWeight: 700, fontSize: 18 }}>✓</div>
                  )}
                </button>
              ))}
            </div>
          </Field>
        )}

        {/* Industrie B Lab : services à faible empreinte uniquement.
            Conditionne HR3.3 et ESC2.6, qui ne visent que certaines industries. */}
        {ctx.sector === "services_faible" && (
          <Field label="Industrie B Lab" style={{ marginTop: 32 }}>
            <div style={{ fontSize: 13, color: "#6B7670", marginBottom: 10, lineHeight: 1.5 }}>
              L'évaluation des clients et des projets (HR3.3 et ESC2.6) ne concerne que certaines industries.
              Choisissez l'industrie qui correspond le mieux à l'activité principale.
              Choisissez « Autre » si aucune ne convient, par exemple pour une fiduciaire.
            </div>
            <select
              value={ctx.industry || ""}
              onChange={(e) => setCtx({ ...ctx, industry: e.target.value })}
              style={inputStyle}
            >
              <option value="">Choisir une industrie</option>
              {SF_INDUSTRIES.map((ind) => (
                <option key={ind.id} value={ind.id}>{ind.label} ({ind.id})</option>
              ))}
              <option value="autre">Autre activité de services à faible empreinte</option>
            </select>
          </Field>
        )}

        {/* Industrie minière : fabrication uniquement (règles ESC et Risk Tool) */}
        {ctx.sector === "fabrication" && (
          <label style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 16, fontSize: 13, color: "#4A5552", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={ctx.isMining === true}
              onChange={(e) => setCtx({ ...ctx, isMining: e.target.checked })}
            />
            L'activité relève de l'exploitation minière (industrie « Mining » de B Lab)
          </label>
        )}

        {/* Date recertification (si applicable) */}
        {ctx.status === "recert_v6" && (
          <Field label="Date de recertification visée" style={{ marginTop: 32 }}>
            <input
              type="month"
              value={ctx.recertDate}
              onChange={(e) => setCtx({ ...ctx, recertDate: e.target.value })}
              style={inputStyle}
            />
          </Field>
        )}
      </div>

      <div style={{ marginTop: 32, display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 16 }}>
        {!ready && (
          <div style={{ fontSize: 13, color: "#6B7670" }}>Renseignez toutes les informations obligatoires pour continuer.</div>
        )}
        <button
          onClick={onNext}
          disabled={!ready}
          className="kiact-btn"
          style={{
            padding: "14px 28px",
            borderRadius: 10,
            background: ready ? "#0f1f1f" : "rgba(15,31,31,0.2)",
            color: "white",
            border: "none",
            fontSize: 14,
            cursor: ready ? "pointer" : "not-allowed",
          }}
        >
          Lancer le diagnostic →
        </button>
      </div>
    </div>
  );
};

const Field = ({ label, children, style }) => (
  <div style={style}>
    <label style={{
      display: "block",
      fontSize: 12,
      fontWeight: 700,
      color: "#0f1f1f",
      letterSpacing: "0.05em",
      textTransform: "uppercase",
      marginBottom: 10,
    }}>{label}</label>
    {children}
  </div>
);

const inputStyle = {
  width: "100%",
  padding: "12px 16px",
  borderRadius: 10,
  border: "1.5px solid rgba(15,31,31,0.12)",
  fontSize: 15,
  fontFamily: "Manrope, sans-serif",
  background: "white",
  color: "#0f1f1f",
  outline: "none",
};

// --- Étape 2 : Questionnaire -------------------------------------------------
const QuestionnaireStep = ({ ctx, answers, setAnswers, onBack, onFinish, consultantMode, consultantNotes, setConsultantNotes, userStandards, onOpenRiskTool, riskAnswers, onOpenJediMenu, jediAnswers, onOpenGacaMenu, gacaAnswers }) => {
  const [topicIndex, setTopicIndex] = useState(0);
  const topic = TOPICS[topicIndex];

  const applicableQuestions = useMemo(
    () => topic.questions.filter((q) => matches(q, ctx)),
    [topic, ctx]
  );

  // Pré-calcul (memoisé) des stats par thématique pour le sticky nav :
  // évite de filtrer 2× toutes les questions à chaque keystroke.
  const topicStats = useMemo(() => TOPICS.map((t) => {
    const applicable = t.questions.filter((q) => matches(q, ctx));
    const answered = applicable.filter((q) => answers[q.id]).length;
    return { id: t.id, total: applicable.length, answered };
  }), [ctx, answers]);

  const totalQuestionsApplicable = useMemo(
    () => topicStats.reduce((acc, t) => acc + t.total, 0),
    [topicStats]
  );
  const totalAnswered = Object.keys(answers).length;
  const overallProgress = totalQuestionsApplicable > 0
    ? Math.round((totalAnswered / totalQuestionsApplicable) * 100)
    : 0;

  const isLast = topicIndex === TOPICS.length - 1;

  return (
    <div className="fade-up" style={{ maxWidth: 940, margin: "0 auto", padding: "32px" }}>
      {/* Sticky topic nav */}
      <div style={{
        background: "white",
        borderRadius: 14,
        border: "1px solid rgba(15,31,31,0.08)",
        padding: "16px 20px",
        marginBottom: 24,
        position: "sticky",
        top: 80,
        zIndex: 10,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={{ fontSize: 11, color: "#6B7670", letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 700 }}>
            Étape 2 / 3 · Diagnostic par thématique
          </div>
          <div style={{ fontSize: 12, color: "#388D54", fontWeight: 700 }}>
            {totalAnswered} / {totalQuestionsApplicable} questions répondues ({overallProgress}%)
          </div>
        </div>
        {/* Progress bar */}
        <div style={{ height: 4, background: "rgba(15,31,31,0.06)", borderRadius: 2, overflow: "hidden" }}>
          <div style={{
            width: `${overallProgress}%`,
            height: "100%",
            background: "linear-gradient(90deg, #388D54 0%, #4583D4 100%)",
            transition: "width 0.4s ease",
          }} />
        </div>
        {/* Topic chips */}
        <div style={{ display: "flex", gap: 6, marginTop: 14, flexWrap: "wrap" }}>
          {TOPICS.map((t, i) => {
            const stats = topicStats[i];
            const answered = stats.answered;
            const total = stats.total;
            const complete = answered === total && total > 0;
            const active = i === topicIndex;
            return (
              <button
                key={t.id}
                onClick={() => setTopicIndex(i)}
                className="kiact-btn"
                style={{
                  padding: "6px 12px",
                  borderRadius: 999,
                  fontSize: 12,
                  fontWeight: 600,
                  background: active ? t.color : complete ? "rgba(56,141,84,0.1)" : "white",
                  color: active ? "white" : complete ? "#388D54" : "#6B7670",
                  border: `1px solid ${active ? t.color : complete ? "rgba(56,141,84,0.3)" : "rgba(15,31,31,0.12)"}`,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <span>{t.code}</span>
                <span style={{ opacity: 0.6, fontSize: 11 }}>{answered}/{total}</span>
                {complete && <span>✓</span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* Topic header */}
      <div style={{ marginBottom: 32 }}>
        <div style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          padding: "4px 12px",
          borderRadius: 999,
          background: `${topic.color}15`,
          color: topic.color,
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          marginBottom: 12,
        }}>
          <span style={{ fontSize: 14 }}>{topic.icon}</span>
          {topic.code}{topic.codeFr !== topic.code ? ` (${topic.codeFr})` : ""} · Thématique {topicIndex + 1} / {TOPICS.length}
        </div>
        <h2 className="kiact-display" style={{ fontSize: 32, fontWeight: 600, lineHeight: 1.15, letterSpacing: "-0.02em", marginBottom: 12 }}>
          {topic.name}
        </h2>
        <p style={{ fontSize: 15, color: "#4A5552", lineHeight: 1.5, maxWidth: 760 }}>
          {topic.description}
        </p>
      </div>

      {/* Questions */}
      <div style={{ display: "grid", gap: 16 }}>
        {applicableQuestions.length === 0 && (
          <div className="kiact-card" style={{ padding: 24, textAlign: "center", color: "#6B7670", fontSize: 14 }}>
            Aucune sous-exigence applicable à cette taille / ce secteur sur cette thématique.
          </div>
        )}
        {applicableQuestions.map((q, i) => (
          <QuestionCard
            key={q.id}
            question={q}
            index={i + 1}
            answer={answers[q.id]}
            onAnswer={(val) => setAnswers({ ...answers, [q.id]: val })}
            color={topic.color}
            consultantMode={consultantMode}
            consultantNote={consultantNotes[q.id]}
            onConsultantNoteChange={(note) => setConsultantNotes({ ...consultantNotes, [q.id]: note })}
            userStandards={userStandards}
            sizeBucket={sizeToBucket(ctx.size)}
            isRecert={isRecertV16(ctx)}
            req={ctx.req}
            onOpenRiskTool={onOpenRiskTool}
            riskAnswers={riskAnswers}
            onOpenJediMenu={onOpenJediMenu}
            jediAnswers={jediAnswers}
            onOpenGacaMenu={onOpenGacaMenu}
            gacaAnswers={gacaAnswers}
          />
        ))}
      </div>

      {/* Footer nav */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        marginTop: 40, padding: "20px 0", borderTop: "1px solid rgba(15,31,31,0.08)",
      }}>
        <button
          onClick={() => topicIndex === 0 ? onBack() : setTopicIndex(topicIndex - 1)}
          className="kiact-btn"
          style={{
            padding: "10px 20px", borderRadius: 10, background: "white",
            border: "1.5px solid rgba(15,31,31,0.12)", color: "#0f1f1f",
            fontSize: 14, cursor: "pointer",
          }}
        >
          ← {topicIndex === 0 ? "Modifier le contexte" : `Précédent (${TOPICS[topicIndex - 1].code})`}
        </button>
        {!isLast ? (
          <button
            onClick={() => setTopicIndex(topicIndex + 1)}
            className="kiact-btn"
            style={{
              padding: "12px 24px", borderRadius: 10, background: "#0f1f1f",
              color: "white", border: "none", fontSize: 14, cursor: "pointer",
              fontWeight: 700,
            }}
          >
            Suivant : {TOPICS[topicIndex + 1].code} →
          </button>
        ) : (
          <button
            onClick={onFinish}
            disabled={totalAnswered === 0}
            className="kiact-btn"
            style={{
              padding: "14px 28px", borderRadius: 10,
              background: totalAnswered === 0 ? "rgba(15,31,31,0.2)" : "linear-gradient(135deg, #388D54 0%, #4583D4 100%)",
              color: "white", border: "none", fontSize: 14, cursor: totalAnswered === 0 ? "not-allowed" : "pointer",
              fontWeight: 700,
            }}
          >
            Voir le diagnostic →
          </button>
        )}
      </div>
    </div>
  );
};

// Effets du Risk Tool résumés en phrases (restitution et exports)
const riskEffectLines = (req) => {
  if (!req) return [];
  const lines = [];
  Object.keys(req.triggered).filter((c) => req.active.has(c)).sort().forEach((c) => {
    lines.push(`${codeWithFr(c)} ajoutée en Année 0 par ${req.triggered[c].join(", ")}.`);
  });
  Object.entries(req.replaced).forEach(([c, r]) => lines.push(`${codeWithFr(r.by)} remplace ${codeWithFr(c)} (${r.src}).`));
  Object.entries(req.consider).forEach(([c, srcs]) => {
    if (req.active.has(c)) lines.push(`L'évaluation ${codeWithFr(c)} doit intégrer les impacts signalés par ${srcs.join(", ")}.`);
  });
  return lines;
};

// Notes liées au Risk Tool affichées sous une question : sous-exigence ajoutée,
// sous-exigence remplacée, ou impact à intégrer dans une évaluation existante.
const RiskNotes = ({ question, req }) => {
  if (!req || !question.codes) return null;
  const notes = [];
  question.codes.forEach((c) => {
    if (req.triggered[c] && req.active.has(c)) {
      notes.push(`${c} est ajoutée par la réponse « Oui » à ${req.triggered[c].join(", ")} du Risk Tool.`);
    }
    if (req.replaced[c]) {
      notes.push(`${req.replaced[c].by} remplace ${c} à la suite de la réponse « Oui » à ${req.replaced[c].src}.`);
    }
    if (req.consider[c] && req.active.has(c)) {
      notes.push(`L'évaluation ${c} doit intégrer l'impact signalé par ${req.consider[c].join(", ")} du Risk Tool.`);
    }
  });
  if (notes.length === 0) return null;
  return (
    <div style={{
      marginBottom: 12, padding: "10px 12px", borderRadius: 8,
      background: "rgba(124,45,82,0.06)", borderLeft: "3px solid #7C2D52",
      fontSize: 12.5, color: "#4A5552", lineHeight: 1.5,
    }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: "#7C2D52", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 4 }}>
        Effet du Risk Tool
      </div>
      {notes.map((n, i) => <div key={i}>{n}</div>)}
    </div>
  );
};

const QuestionCard = ({ isRecert, req, question, index, answer, onAnswer, color, consultantMode, consultantNote, onConsultantNoteChange, userStandards, sizeBucket, onOpenRiskTool, riskAnswers, onOpenJediMenu, jediAnswers, onOpenGacaMenu, gacaAnswers }) => {
  const [expanded, setExpanded] = useState(false);
  const answerSet = getAnswerSet(question);
  const isFactual = question.kind === "factual";
  const note = consultantNote || { mode: null, charge: "", notes: "", livrableType: null };

  // Type de livrable effectif : ce que l'utilisateur a choisi pour cette question,
  // sinon le type par défaut prévu dans le système.
  const effectiveLivrableType = note.livrableType || DEFAULT_LIVRABLE_TYPE[question.id] || "document";

  return (
    <div className="kiact-card" style={{ padding: 22, transition: "border-color 0.2s ease", borderColor: answer ? "rgba(56,141,84,0.2)" : "rgba(15,31,31,0.06)" }}>
      <div style={{ display: "flex", gap: 16 }}>
        <div style={{
          minWidth: 32, height: 32, borderRadius: 8,
          background: answer ? color : "rgba(15,31,31,0.04)",
          color: answer ? "white" : "#6B7670",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 13, fontWeight: 700, fontFamily: "Fraunces",
        }}>
          {index}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
            <div style={{ fontSize: 10, color: "#6B7670", letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 700 }}>
              Référence : {question.ref}
            </div>
            {isFactual ? (
              <div style={{ fontSize: 10, color: "#6B7670", letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 700, background: "rgba(15,31,31,0.05)", padding: "2px 8px", borderRadius: 999 }}>
                Question factuelle
              </div>
            ) : (
              <div style={{ fontSize: 10, color: "#4583D4", letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 700, background: "rgba(69,131,212,0.08)", padding: "2px 8px", borderRadius: 999 }}>
                Pratique + preuves
              </div>
            )}
            {isCritical(question, isRecert) && (
              <div style={{ fontSize: 10, color: "#DC2626", letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 700, background: "rgba(220,38,38,0.08)", padding: "2px 8px", borderRadius: 999 }}>
                ◉ Condition d'éligibilité
              </div>
            )}
            {isLongLead(question) && (
              <div title={LONG_LEAD_TITLE} style={{ fontSize: 10, color: "#9A6200", letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 700, background: "rgba(245,158,11,0.12)", padding: "2px 8px", borderRadius: 999 }}>
                Délai long
              </div>
            )}
          </div>
          <div style={{ fontSize: 16, fontWeight: 600, lineHeight: 1.4, color: "#0f1f1f", marginBottom: 12 }}>
            {question.question}
          </div>
          <RiskNotes question={question} req={req} />
          {(question.help || question.examples) && (
            <div style={{ marginBottom: 14 }}>
              <button
                onClick={() => setExpanded(!expanded)}
                style={{ fontSize: 12, color: "#4583D4", background: "none", border: "none", padding: 0, cursor: "pointer", fontWeight: 600 }}
              >
                {expanded ? "− Masquer" : `+ Précision${question.examples ? (question.examplesLabel && question.examplesLabel.startsWith("Repères") ? " et repères pratiques" : " et preuves attendues") : ""}`}
              </button>
              {expanded && (
                <>
                  {question.help && (
                    <div style={{
                      fontSize: 13, color: "#4A5552", lineHeight: 1.5, marginTop: 8,
                      padding: 12, background: "rgba(15,31,31,0.025)", borderRadius: 8,
                      borderLeft: "3px solid #4583D4",
                    }}>
                      <TextBlock value={question.help} />
                    </div>
                  )}
                  {question.examples && (
                    <div style={{
                      fontSize: 13, color: "#0f1f1f", lineHeight: 1.5, marginTop: 8,
                      padding: 12, background: "rgba(124,201,86,0.08)", borderRadius: 8,
                      borderLeft: "3px solid #7CC956",
                    }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: "#388D54", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>
                        {question.examplesLabel || "Preuves attendues par l'auditeur (source B Lab)"}
                      </div>
                      <TextBlock value={question.examples} />
                    </div>
                  )}
                </>
              )}
            </div>
          )}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {Object.values(answerSet).map((a) => (
              <button
                key={a.id}
                onClick={() => onAnswer(a.id)}
                className="answer-pill kiact-btn"
                style={{
                  padding: "8px 14px", borderRadius: 999,
                  background: answer === a.id ? a.color : "white",
                  color: answer === a.id ? "white" : "#0f1f1f",
                  border: answer === a.id ? `1.5px solid ${a.color}` : "1.5px solid rgba(15,31,31,0.12)",
                  fontSize: 13, fontWeight: 600, cursor: "pointer",
                }}
              >
                {a.label}
              </button>
            ))}
          </div>

          {/* Bouton Risk Tool — affiché uniquement pour les questions avec hasRiskTool */}
          {question.hasRiskTool && onOpenRiskTool && (() => {
            const yesCount = countRiskYes(riskAnswers);
            const totalAnswered = Object.keys(riskAnswers || {}).filter(
              k => riskAnswers[k] === "yes" || riskAnswers[k] === "no"
            ).length;
            const hasStarted = totalAnswered > 0;
            return (
              <div style={{
                marginTop: 14,
                padding: 16,
                background: hasStarted
                  ? "linear-gradient(135deg, rgba(56,141,84,0.06) 0%, rgba(124,201,86,0.06) 100%)"
                  : "rgba(69,131,212,0.06)",
                border: hasStarted
                  ? "1px solid rgba(56,141,84,0.2)"
                  : "1px solid rgba(69,131,212,0.2)",
                borderRadius: 10,
                display: "flex",
                alignItems: "center",
                gap: 14,
                flexWrap: "wrap",
              }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ fontWeight: 600, color: "#0f1f1f", fontSize: 14, marginBottom: 4 }}>
                    {hasStarted
                      ? `Risk Tool engagé : ${totalAnswered} / 14 questions`
                      : "Réaliser l'évaluation des risques avec le client"}
                  </div>
                  <div style={{ fontSize: 13, color: "#4A5552", lineHeight: 1.5 }}>
                    {hasStarted ? (
                      <>
                        {yesCount > 0 && (
                          <span style={{ color: "#7CC956", fontWeight: 600 }}>
                            {yesCount} réponse{yesCount > 1 ? "s" : ""} « Oui » → exigences additionnelles ·{" "}
                          </span>
                        )}
                        Reprendre la grille pour compléter ou ajuster.
                      </>
                    ) : (
                      "Grille KiAct en 14 questions, alignée sur le Risk Tool officiel B Lab, pour anticiper les sous-exigences additionnelles à respecter."
                    )}
                  </div>
                </div>
                <button
                  onClick={onOpenRiskTool}
                  style={{
                    background: hasStarted ? "#388D54" : "#4583D4",
                    color: "white",
                    border: "none",
                    padding: "10px 20px",
                    borderRadius: 8,
                    cursor: "pointer",
                    fontSize: 14,
                    fontWeight: 600,
                    fontFamily: "inherit",
                    whiteSpace: "nowrap",
                  }}
                >
                  {hasStarted ? "Reprendre →" : "Démarrer la grille →"}
                </button>
              </div>
            );
          })()}

          {/* Bouton menu JEDI2 — affiché uniquement pour les questions avec hasJediMenu */}
          {question.hasJediMenu && onOpenJediMenu && (() => {
            const jediDone = countJediDone(jediAnswers);
            const req = getJedi2Req(sizeBucket);
            const hasStarted = jediDone > 0;
            const y0Met = jediDone >= req.y0;
            return (
              <div style={{
                marginTop: 14,
                padding: 16,
                background: hasStarted
                  ? "linear-gradient(135deg, rgba(124,94,14,0.07) 0%, rgba(56,141,84,0.06) 100%)"
                  : "rgba(124,94,14,0.06)",
                border: hasStarted
                  ? "1px solid rgba(124,94,14,0.25)"
                  : "1px solid rgba(124,94,14,0.2)",
                borderRadius: 10,
                display: "flex",
                alignItems: "center",
                gap: 14,
                flexWrap: "wrap",
              }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ fontWeight: 600, color: "#0f1f1f", fontSize: 14, marginBottom: 4 }}>
                    {hasStarted
                      ? `◒ Menu JEDI2 : ${jediDone} action${jediDone > 1 ? "s" : ""} sélectionnée${jediDone > 1 ? "s" : ""}`
                      : "◒ Faire le point sur les actions JEDI2 avec le client"}
                  </div>
                  <div style={{ fontSize: 13, color: "#4A5552", lineHeight: 1.5 }}>
                    {hasStarted ? (
                      <>
                        {y0Met ? (
                          <span style={{ color: "#388D54", fontWeight: 600 }}>
                            ✓ Cible Année 0 atteinte ({req.y0}) ·{" "}
                          </span>
                        ) : (
                          <span style={{ color: "#B45309", fontWeight: 600 }}>
                            Année 0 : {jediDone}/{req.y0} ·{" "}
                          </span>
                        )}
                        Reprendre le menu des 19 actions.
                      </>
                    ) : (
                      "Menu des 19 actions B Lab, réparties en trois ensembles, avec compteur calibré sur la taille de l'entreprise, Année 0 et Années 3 et 5."
                    )}
                  </div>
                </div>
                <button
                  onClick={onOpenJediMenu}
                  style={{
                    background: hasStarted ? "#388D54" : "#7C5E0E",
                    color: "white",
                    border: "none",
                    padding: "10px 20px",
                    borderRadius: 8,
                    cursor: "pointer",
                    fontSize: 14,
                    fontWeight: 600,
                    fontFamily: "inherit",
                    whiteSpace: "nowrap",
                  }}
                >
                  {hasStarted ? "Reprendre →" : "Ouvrir le menu →"}
                </button>
              </div>
            );
          })()}

          {/* Bouton menu GACA2 — affiché uniquement pour les questions avec hasGacaMenu */}
          {question.hasGacaMenu && onOpenGacaMenu && (() => {
            const gacaDone = countGacaDone(gacaAnswers);
            const req = getGaca2Req(sizeBucket);
            const hasStarted = gacaDone > 0;
            const y0Met = gacaDone >= req.y0;
            return (
              <div style={{
                marginTop: 14,
                padding: 16,
                background: hasStarted
                  ? "linear-gradient(135deg, rgba(91,58,138,0.07) 0%, rgba(56,141,84,0.06) 100%)"
                  : "rgba(91,58,138,0.06)",
                border: hasStarted
                  ? "1px solid rgba(91,58,138,0.25)"
                  : "1px solid rgba(91,58,138,0.2)",
                borderRadius: 10,
                display: "flex",
                alignItems: "center",
                gap: 14,
                flexWrap: "wrap",
              }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ fontWeight: 600, color: "#0f1f1f", fontSize: 14, marginBottom: 4 }}>
                    {hasStarted
                      ? `◖ Menu GACA2 : ${gacaDone} action${gacaDone > 1 ? "s" : ""} collective${gacaDone > 1 ? "s" : ""} sélectionnée${gacaDone > 1 ? "s" : ""}`
                      : "◖ Faire le point sur les actions collectives avec le client"}
                  </div>
                  <div style={{ fontSize: 13, color: "#4A5552", lineHeight: 1.5 }}>
                    {hasStarted ? (
                      <>
                        {y0Met ? (
                          <span style={{ color: "#388D54", fontWeight: 600 }}>
                            ✓ Cible Année 0 atteinte ({req.y0}) ·{" "}
                          </span>
                        ) : (
                          <span style={{ color: "#B45309", fontWeight: 600 }}>
                            Année 0 : {gacaDone}/{req.y0} ·{" "}
                          </span>
                        )}
                        Reprendre le menu des 5 actions collectives.
                      </>
                    ) : (
                      "Menu des 5 types d'action collective B Lab (mentorat, leadership d'opinion, collaboration, recherche, plaidoyer) avec compteur calibré sur la taille, Année 0 et Années 3 et 5."
                    )}
                  </div>
                </div>
                <button
                  onClick={onOpenGacaMenu}
                  style={{
                    background: hasStarted ? "#388D54" : "#5b3a8a",
                    color: "white",
                    border: "none",
                    padding: "10px 20px",
                    borderRadius: 8,
                    cursor: "pointer",
                    fontSize: 14,
                    fontWeight: 600,
                    fontFamily: "inherit",
                    whiteSpace: "nowrap",
                  }}
                >
                  {hasStarted ? "Reprendre →" : "Ouvrir le menu →"}
                </button>
              </div>
            );
          })()}

          {/* Panneau consultant privé — visible uniquement en mode consultant */}
          {consultantMode && answer && answer !== "na" && answer !== "fait_doc" && answer !== "oui" && (
            <div style={{
              marginTop: 14,
              padding: 14,
              background: "linear-gradient(135deg, rgba(15,31,31,0.92) 0%, rgba(26,56,56,0.96) 100%)",
              color: "white",
              borderRadius: 10,
              border: "1px solid rgba(124,201,86,0.3)",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
                <span style={{
                  fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase",
                  color: "#7CC956", padding: "2px 8px", background: "rgba(124,201,86,0.12)",
                  borderRadius: 999, border: "1px solid rgba(124,201,86,0.3)",
                }}>
                  Espace consultant
                </span>
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>Visible uniquement par vous</span>
              </div>

              {/* Toggle type de livrable */}
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.7)", marginBottom: 6, fontWeight: 600 }}>
                Type de livrable
              </div>
              <div style={{ display: "flex", gap: 4, marginBottom: 12, flexWrap: "wrap" }}>
                {[
                  { id: "document", label: "Document", hint: "Rédaction d'un document court" },
                  { id: "processus_simple", label: "Processus simple", hint: "Document + déploiement léger (1 atelier, 1 outil)" },
                  { id: "processus_complet", label: "Processus complet", hint: "Méthode + outils + déploiement + suivi" },
                ].map((opt) => {
                  const isActive = effectiveLivrableType === opt.id;
                  const isDefault = !note.livrableType && DEFAULT_LIVRABLE_TYPE[question.id] === opt.id;
                  return (
                    <button
                      key={opt.id}
                      onClick={() => {
                        // Si on clique sur le type déjà actif (par override), revenir au défaut système
                        const newType = note.livrableType === opt.id ? null : opt.id;
                        // Recalcule la charge si elle vient du défaut (heuristique : si la charge actuelle = ancienne valeur par défaut)
                        const oldDefault = getDefaultCharge(question.id, note.mode, sizeBucket, effectiveLivrableType, userStandards);
                        const newDefault = getDefaultCharge(question.id, note.mode, sizeBucket, newType || DEFAULT_LIVRABLE_TYPE[question.id] || "document", userStandards);
                        let newCharge = note.charge;
                        if (note.mode && note.mode !== "client" && (note.charge === "" || parseFloat(note.charge) === oldDefault)) {
                          newCharge = newDefault !== null ? String(newDefault) : note.charge;
                        }
                        onConsultantNoteChange({ ...note, livrableType: newType, charge: newCharge });
                      }}
                      title={opt.hint}
                      style={{
                        padding: "5px 10px", borderRadius: 6, fontSize: 10.5, fontWeight: 600,
                        background: isActive ? "rgba(124,201,86,0.15)" : "transparent",
                        color: isActive ? "#7CC956" : "rgba(255,255,255,0.65)",
                        border: isActive ? "1px solid rgba(124,201,86,0.5)" : "1px solid rgba(255,255,255,0.15)",
                        cursor: "pointer",
                      }}
                    >
                      {opt.label}{isDefault ? " ✓" : ""}
                    </button>
                  );
                })}
              </div>

              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.7)", marginBottom: 8, fontWeight: 600 }}>
                Mon rôle sur ce chantier
              </div>
              <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
                {[
                  { id: "kiact", label: "Je le fais", hint: "Réalisation par KiAct" },
                  { id: "piloting", label: "Je pilote", hint: "Le client fait, j'accompagne" },
                  { id: "client", label: "Le client", hint: "Hors périmètre KiAct" },
                ].map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => {
                      const newMode = note.mode === opt.id ? null : opt.id;
                      // Pré-remplit la charge avec la valeur par défaut si la charge est vide
                      let newCharge = note.charge;
                      if (newMode && (!note.charge || note.charge === "")) {
                        const def = getDefaultCharge(question.id, newMode, sizeBucket, effectiveLivrableType, userStandards);
                        if (def !== null && def !== undefined) {
                          newCharge = String(def);
                        }
                      }
                      onConsultantNoteChange({ ...note, mode: newMode, charge: newCharge });
                    }}
                    title={opt.hint}
                    style={{
                      padding: "6px 12px", borderRadius: 999, fontSize: 11, fontWeight: 600,
                      background: note.mode === opt.id ? "#7CC956" : "transparent",
                      color: note.mode === opt.id ? "#0f1f1f" : "rgba(255,255,255,0.85)",
                      border: note.mode === opt.id ? "1.5px solid #7CC956" : "1.5px solid rgba(255,255,255,0.2)",
                      cursor: "pointer",
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              {note.mode && note.mode !== "client" && (
                <div style={{ fontSize: 10.5, color: "rgba(255,255,255,0.55)", marginBottom: 6, fontStyle: "italic" }}>
                  Estimation par défaut ({LIVRABLE_LABELS[effectiveLivrableType]} · {sizeBucket}) : {formatCharge(getDefaultCharge(question.id, note.mode, sizeBucket, effectiveLivrableType, userStandards))}, modifiable ci-dessous (jours, ex. 0.125 = 1h)
                </div>
              )}
              <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: 8 }}>
                <input
                  type="text"
                  value={note.charge}
                  onChange={(e) => onConsultantNoteChange({ ...note, charge: e.target.value })}
                  placeholder="Charge (j)"
                  style={{
                    padding: "7px 10px", borderRadius: 8, fontSize: 12,
                    background: "rgba(255,255,255,0.08)", color: "white",
                    border: "1px solid rgba(255,255,255,0.15)", outline: "none",
                  }}
                />
                <input
                  type="text"
                  value={note.notes}
                  onChange={(e) => onConsultantNoteChange({ ...note, notes: e.target.value })}
                  placeholder="Note (livrable, dépendance, risque…)"
                  style={{
                    padding: "7px 10px", borderRadius: 8, fontSize: 12,
                    background: "rgba(255,255,255,0.08)", color: "white",
                    border: "1px solid rgba(255,255,255,0.15)", outline: "none",
                  }}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// --- Étape 3 : Restitution ---------------------------------------------------
// Inventaire des documents attendus (standards B Lab V2.2), généré le 28 octobre 2026
// depuis les fichiers BLab_V2.2_*.md. Documents « Recommandé » exclus.
// t = thématique, c = sous-exigences, d = document, ty = typologie, di = diffusion,
// y = année de départ, sz = tailles, se = secteurs ("*" = tous), ct = contenu exigé, p = pages du PDF.
const DOCS_REQUIS = [{"id":"d1","t":"FR","c":["FR1.3","FR1.4","FR1.5","FR2.1","FR2.2"],"d":"Accord de certification B Corp signé","ty":"Contrat","di":"B Lab","y":0,"sz":["individuelle","micro","petite","moyenne","grande","xl","xxl"],"se":"*","ct":"Engagement dans le processus de certification, respect des législations applicables, communication d'informations exactes et complètes, transparence et publication des informations exigées, adoption des exigences juridiques B Corp","p":"14, 27-28, 32-33, 36, 38, 40, 42, 45"},{"id":"d2","t":"FR","c":["FR2.2"],"d":"Déclaration d'interdépendance signée","ty":"Déclaration","di":"Non précisé","y":0,"sz":["individuelle","micro","petite","moyenne","grande","xl","xxl"],"se":"*","ct":"Engagement en faveur de la mission collective de la communauté B Corp selon le texte de la déclaration d'interdépendance","p":"44-45"},{"id":"d3","t":"FR","c":["FR2.1"],"d":"Documents constitutifs ou statuts modifiés selon les exigences juridiques B Corp","ty":"Statuts","di":"Non précisé","y":0,"sz":["individuelle","micro","petite","moyenne","grande","xl","xxl"],"se":"*","ct":"Clause raison d'être visant un impact positif significatif sur la société ou l'environnement, clause administrateurs instaurant la gouvernance des parties prenantes, formulation conforme à la juridiction et à la forme juridique","p":"4, 40-43"},{"id":"d4","t":"FR","c":["FR2.1"],"d":"Déclaration publique d'intention d'adopter les exigences juridiques B Corp","ty":"Déclaration","di":"Public","y":0,"sz":["individuelle","micro","petite","moyenne","grande","xl","xxl"],"se":"*","ct":"Intention d'adopter les exigences juridiques B Corp dès que la législation le permet","p":"42"},{"id":"d5","t":"FR","c":["FR1.4","FR1.5"],"d":"Questionnaire B Impact Assessment (BIA) complété","ty":"Évaluation ou analyse","di":"B Lab et Public","y":0,"sz":["individuelle","micro","petite","moyenne","grande","xl","xxl"],"se":"*","ct":"Réponses exactes et complètes, fondées sur des preuves et des sources crédibles, couvrant toutes les entités du périmètre et leurs propriétaires","p":"32-34, 36"},{"id":"d6","t":"FR","c":["FR1.5"],"d":"Profil public B Corp","ty":"Autre","di":"Public","y":0,"sz":["individuelle","micro","petite","moyenne","grande","xl","xxl"],"se":"*","ct":"Siège, mois et année de certification, industrie, secteur et périmètre géographique, brève description, logo, lien vers le site internet","p":"36-37"},{"id":"d7","t":"FR","c":["FR1.5"],"d":"Questionnaire BIA intégral publié avec l'identité des propriétaires majoritaires","ty":"Évaluation ou analyse","di":"Public","y":0,"sz":["individuelle","micro","petite","moyenne","grande","xl","xxl"],"se":"*","ct":"Intégralité des réponses au BIA et identité de tout propriétaire majoritaire","p":"36-38"},{"id":"d8","t":"FR","c":["FR1.5"],"d":"Demande à B Lab de non-publication de certaines informations du BIA","ty":"Autre","di":"B Lab","y":0,"sz":["individuelle","micro","petite","moyenne","grande","xl","xxl"],"se":"*","ct":"Informations visées et preuve que leur divulgation profiterait aux concurrents, nuirait à un litige ou serait disproportionnée au regard du cadre juridique","p":"37-38"},{"id":"d9","t":"FR","c":["FR1.4"],"d":"Documentation formelle des pratiques, processus et politiques en place","ty":"Autre","di":"B Lab","y":0,"sz":["individuelle","micro","petite","moyenne","grande","xl","xxl"],"se":"*","ct":"Pratiques, processus et politiques documentés formellement, personnes chargées de fournir les preuves clairement désignées, sources de données fiables, performances actuelles et passées","p":"33"},{"id":"d10","t":"FR","c":["FR3.1"],"d":"Profil de risque établi avec l'outil d'évaluation des risques de B Lab","ty":"Évaluation ou analyse","di":"B Lab et Public","y":0,"sz":["petite","moyenne","grande","xl","xxl"],"se":"*","ct":"Réponses oui ou non aux 14 questions des points FR3.1.a à FR3.1.n sur les pratiques à risque","p":"46-49"},{"id":"d11","t":"PSG","c":["PSG1.1"],"d":"Déclaration de raison d'être","ty":"Déclaration","di":"Public","y":0,"sz":["individuelle","micro","petite","moyenne","grande","xl","xxl"],"se":"*","ct":"Impact positif et significatif visé sur la société ou l'environnement, lien avec les activités commerciales et intégration dans la stratégie","p":"21-23"},{"id":"d12","t":"PSG","c":["PSG1.1"],"d":"Déclaration complémentaire sur la raison d'être","ty":"Déclaration","di":"Non précisé","y":0,"sz":["individuelle","micro","petite","moyenne","grande","xl","xxl"],"se":"*","ct":"Pertinence de la raison d'être pour l'entreprise, intégration dans la stratégie, exemples de politiques, pratiques, communications, KPI ou objectifs liés","p":"23"},{"id":"d13","t":"PSG","c":["PSG2.1"],"d":"Cartographie des parties prenantes avec identification et priorisation","ty":"Évaluation ou analyse","di":"Non précisé","y":0,"sz":["individuelle","micro","petite","moyenne"],"se":"*","ct":"Identification des parties prenantes, ordre de priorité, carte couvrant les six catégories du critère 2.1.3","p":"26-28"},{"id":"d14","t":"PSG","c":["PSG2.1"],"d":"Description du processus de dialogue et des mécanismes d'engagement des parties prenantes","ty":"Processus","di":"Non précisé","y":0,"sz":["individuelle","micro","petite","moyenne"],"se":"*","ct":"Processus de recueil et d'intégration des points de vue dans les décisions, mécanismes directs ou indirects représentant collaborateurs, prestataires, clientèle, partenaires financiers, communauté et environnement","p":"27-28"},{"id":"d15","t":"PSG","c":["PSG2.2"],"d":"Politique de gouvernance des parties prenantes","ty":"Politique","di":"Personnel","y":0,"sz":["grande","xl","xxl"],"se":"*","ct":"Définition du modèle de gouvernance des parties prenantes, critères d'identification et de priorisation avec cartographie complète, prise en compte dans les décisions sur les impacts, création de valeur, mécanismes d'implication régulière couvrant les six catégories de parties prenantes","p":"33-36"},{"id":"d16","t":"PSG","c":["PSG2.3"],"d":"Analyse de matérialité complète","ty":"Évaluation ou analyse","di":"Direction","y":0,"sz":["grande","xl","xxl"],"se":"*","ct":"Travail avec les six catégories de parties prenantes, enjeux couverts et non couverts par les standards B Lab, matérialité d'impact, évaluation selon gravité et probabilité, seuil de matérialité, impacts positifs et négatifs hiérarchisés séparément","p":"40-44"},{"id":"d17","t":"PSG","c":["PSG2.3"],"d":"Analyse intermédiaire de matérialité","ty":"Évaluation ou analyse","di":"Non précisé","y":0,"sz":["grande","xl","xxl"],"se":"*","ct":"Mise à jour de la liste des enjeux matériels avec une sélection de parties prenantes","p":"41-44"},{"id":"d18","t":"PSG","c":["PSG2.3"],"d":"Publication des résultats et de la méthodologie de l'analyse de matérialité","ty":"Résumé ou synthèse","di":"Public","y":0,"sz":["grande","xl","xxl"],"se":"*","ct":"Matrice de matérialité ou liste des enjeux matériels, méthodologie, résumé des processus d'engagement des parties prenantes","p":"41"},{"id":"d19","t":"PSG","c":["PSG2.4"],"d":"Liste des enjeux matériels non couverts par les standards B Lab","ty":"Liste","di":"Non précisé","y":0,"sz":["grande","xl","xxl"],"se":"*","ct":"Résultat de l'analyse des écarts entre les enjeux matériels issus de PSG2.3 et les standards B Lab","p":"50-52"},{"id":"d20","t":"PSG","c":["PSG2.4"],"d":"Objectifs SMART par enjeu matériel non couvert","ty":"Plan","di":"Public","y":0,"sz":["grande","xl","xxl"],"se":"*","ct":"Au moins un objectif SMART par enjeu, intégré dans la stratégie, responsables désignés pour chaque objectif, nouvel objectif fixé une fois l'objectif atteint","p":"50-52"},{"id":"d21","t":"PSG","c":["PSG2.4"],"d":"Compte rendu public des progrès sur les objectifs","ty":"Rapport","di":"Public","y":0,"sz":["grande","xl","xxl"],"se":"*","ct":"Progrès réalisés pour chaque objectif lié aux enjeux matériels non couverts","p":"50-51"},{"id":"d22","t":"PSG","c":["PSG2.5"],"d":"Documentation des décisions sur les dividendes et les rachats d'actions","ty":"Compte rendu ou procès-verbal","di":"Non précisé","y":3,"sz":["xxl"],"se":"*","ct":"Décisions de la plus haute instance de direction, prise en compte et arbitrage des intérêts des six catégories de parties prenantes","p":"56-57"},{"id":"d23","t":"PSG","c":["PSG2.5"],"d":"Compte rendu de l'équilibre entre distributions et réinvestissements sociaux et environnementaux","ty":"Rapport","di":"Non précisé","y":3,"sz":["xxl"],"se":"*","ct":"Équilibre recherché entre dividendes et rachats d'actions d'une part, réinvestissements dans les performances sociales et environnementales d'autre part","p":"57-59"},{"id":"d24","t":"PSG","c":["PSG3.1"],"d":"Formulaire de réclamation ou autre moyen de soumission","ty":"Formulaire ou canal","di":"Public","y":0,"sz":["individuelle","micro","petite","moyenne"],"se":"*","ct":"Moyen facilement accessible permettant aux parties prenantes de soumettre une réclamation","p":"60-62"},{"id":"d25","t":"PSG","c":["PSG3.1"],"d":"Procédure de réclamation","ty":"Procédure","di":"Public","y":0,"sz":["individuelle","micro","petite","moyenne"],"se":"*","ct":"Critères de recevabilité, étapes et délais, processus de résolution, processus et contrôles de protection contre les représailles","p":"60-63"},{"id":"d26","t":"PSG","c":["PSG3.1"],"d":"Réponses aux dépositaires de réclamations","ty":"Autre","di":"Parties prenantes","y":0,"sz":["individuelle","micro","petite","moyenne"],"se":"*","ct":"Communication régulière des étapes, de l'avancement et de la résolution, ou motifs d'irrecevabilité","p":"61-63"},{"id":"d27","t":"PSG","c":["PSG3.2"],"d":"Registre de suivi des réclamations","ty":"Registre","di":"Non précisé","y":0,"sz":["micro","petite","moyenne"],"se":"*","ct":"Recensement et suivi de chaque réclamation, documentation de la résolution et de la clôture","p":"68-70"},{"id":"d28","t":"PSG","c":["PSG3.2"],"d":"Résumé annuel des réclamations","ty":"Résumé ou synthèse","di":"Confidentiel","y":0,"sz":["micro","petite","moyenne"],"se":"*","ct":"Statut, référence du dossier, date de dépôt, dépositaire, partie adverse, lieu, objet de chaque réclamation","p":"69-70"},{"id":"d29","t":"PSG","c":["PSG3.2"],"d":"Attribution des responsabilités de gestion des réclamations","ty":"Autre","di":"Interne","y":0,"sz":["micro","petite","moyenne"],"se":"*","ct":"Personne salariée chargée de la gestion des réclamations, responsabilités clairement définies pour chaque étape","p":"69-70"},{"id":"d30","t":"PSG","c":["PSG3.3"],"d":"Procédure de réclamation publique","ty":"Procédure","di":"Public","y":0,"sz":["grande","xl","xxl"],"se":"*","ct":"Critères de recevabilité, étapes et délais, processus de résolution, contrôles contre les représailles, prévention des conflits d'intérêts dans la décision","p":"73-76"},{"id":"d31","t":"PSG","c":["PSG3.3"],"d":"Réponses aux dépositaires de réclamations","ty":"Autre","di":"Parties prenantes","y":0,"sz":["grande","xl","xxl"],"se":"*","ct":"Communication régulière des étapes, de l'avancement et de la résolution, ou motifs d'irrecevabilité","p":"74-77"},{"id":"d32","t":"PSG","c":["PSG3.3"],"d":"Information des parties prenantes principales sur les procédures de réclamation","ty":"Autre","di":"Parties prenantes","y":0,"sz":["grande","xl","xxl"],"se":"*","ct":"Procédures de réclamation applicables à chaque partie prenante principale","p":"74-76"},{"id":"d33","t":"PSG","c":["PSG3.4"],"d":"Registre des réclamations avec documentation de la résolution","ty":"Registre","di":"Interne","y":0,"sz":["grande","xl","xxl"],"se":"*","ct":"Recensement de chaque réclamation, documentation de la résolution et de la clôture","p":"80-81"},{"id":"d34","t":"PSG","c":["PSG3.4"],"d":"Rapport interne annuel d'analyse des réclamations","ty":"Rapport","di":"Interne et Confidentiel","y":0,"sz":["grande","xl","xxl"],"se":"*","ct":"Réclamations reçues et acceptées avec statut, référence, date, dépositaire, partie adverse, lieu et objet, efficacité des procédures, tendances et sources récurrentes, recommandations d'amélioration","p":"80-83"},{"id":"d35","t":"PSG","c":["PSG3.4"],"d":"Résumé annuel des réclamations destiné à la plus haute instance de direction","ty":"Résumé ou synthèse","di":"Direction","y":0,"sz":["grande","xl","xxl"],"se":"*","ct":"Résultats des réclamations, tendances et sources récurrentes, recommandations pour améliorer les procédures","p":"81-83"},{"id":"d36","t":"PSG","c":["PSG3.4"],"d":"Rapport public sur la résolution des réclamations","ty":"Rapport","di":"Public et Confidentiel","y":0,"sz":["grande","xl","xxl"],"se":"*","ct":"Nombre, type et nature des réclamations, rejets et motifs, réclamations résolues, résultats, actions correctives, durée moyenne, satisfaction des parties prenantes","p":"80-85"},{"id":"d37","t":"PSG","c":["PSG4.1"],"d":"Principes de marketing et de communication responsables","ty":"Charte ou engagement","di":"Personnel","y":0,"sz":["micro","petite"],"se":"*","ct":"Allégations précises, vérifiables et étayées, communication transparente sur les impacts positifs et négatifs, principes éthiques pour les canaux et pratiques sensibles","p":"88-90"},{"id":"d38","t":"PSG","c":["PSG4.2"],"d":"Politique de marketing et de communication responsables","ty":"Politique","di":"Personnel","y":0,"sz":["moyenne","grande","xl","xxl"],"se":"*","ct":"Champ d'application, tous publics, exigences pour les personnes impliquées, allégations précises, proportionnées, pertinentes, compréhensibles et traduites, communication sur les impacts positifs et négatifs, principes éthiques pour les canaux sensibles, responsable de la conformité désigné","p":"94-97"},{"id":"d39","t":"PSG","c":["PSG5.1"],"d":"Examen annuel par la plus haute instance de direction","ty":"Compte rendu ou procès-verbal","di":"Direction","y":0,"sz":["micro","petite","moyenne","grande","xl","xxl"],"se":"*","ct":"Progrès dans le déploiement de la raison d'être, performances sociales et environnementales, déploiement de la gouvernance des parties prenantes","p":"102-104"},{"id":"d40","t":"PSG","c":["PSG5.2"],"d":"Cadre de référence de la plus haute instance de direction","ty":"Règlement","di":"Non précisé","y":0,"sz":["grande","xl","xxl"],"se":"*","ct":"Responsabilité explicite de supervision de la raison d'être, de l'impact social et environnemental, de la prise en compte des parties prenantes","p":"108-110"},{"id":"d41","t":"PSG","c":["PSG5.3"],"d":"Objectifs annuels sociaux ou environnementaux des membres de l'équipe de direction","ty":"Autre","di":"Non précisé","y":3,"sz":["grande","xl","xxl"],"se":"*","ct":"Au moins un objectif SMART par membre, aligné sur la stratégie et les enjeux matériels","p":"113-115"},{"id":"d42","t":"PSG","c":["PSG5.4"],"d":"Objectifs SMART du système de rémunération incitative de l'équipe de direction","ty":"Autre","di":"Non précisé","y":3,"sz":["grande","xl","xxl"],"se":"*","ct":"Objectifs de performance sociale et environnementale déterminés par évaluation annuelle ou revue annuelle fiscale","p":"118-120"},{"id":"d43","t":"PSG","c":["PSG5.4"],"d":"Registre annuel des récompenses liées aux objectifs sociaux et environnementaux","ty":"Registre","di":"Non précisé","y":3,"sz":["grande","xl","xxl"],"se":"*","ct":"Valeur des récompenses monétaires en pourcentage du salaire de chaque cadre","p":"119"},{"id":"d44","t":"PSG","c":["PSG5.5"],"d":"Objectifs sociaux et environnementaux documentés des managers","ty":"Évaluation ou analyse","di":"Non précisé","y":3,"sz":["xxl"],"se":"*","ct":"Au moins un objectif SMART par manager intégré à l'évaluation de performance","p":"124-126"},{"id":"d45","t":"PSG","c":["PSG6.1"],"d":"Rapport d'impact social et environnemental","ty":"Rapport","di":"Public","y":3,"sz":["grande","xl"],"se":"*","ct":"Enjeux sociaux et environnementaux et mesures prises, indicateurs de performance, progrès vers les objectifs, prise en compte des parties prenantes, résumé des processus d'engagement","p":"129-132"},{"id":"d46","t":"PSG","c":["PSG6.2"],"d":"Rapport d'impact social et environnemental selon un standard externe","ty":"Rapport","di":"Public","y":3,"sz":["xxl"],"se":"*","ct":"Standard externe, structure cohérente d'une année à l'autre, indicateurs pertinents, résumé des processus d'engagement, actions concrètes, stratégies managériales et progrès","p":"134-136"},{"id":"d47","t":"PSG","c":["PSG6.3"],"d":"Évaluation de la capacité des collaborateurs à mettre en œuvre la stratégie sociale et environnementale","ty":"Évaluation ou analyse","di":"Personnel","y":3,"sz":["grande","xl","xxl"],"se":"*","ct":"Compréhension de l'impact et de la stratégie, préparation à agir, perception de la mise en œuvre, caractère facultatif de la participation","p":"139-141"},{"id":"d48","t":"PSG","c":["PSG6.3"],"d":"Analyse des retours des collaborateurs et aperçu des actions","ty":"Rapport","di":"Non précisé","y":3,"sz":["grande","xl","xxl"],"se":"*","ct":"Résumé des principales conclusions, plans d'action éventuels, prochaines étapes","p":"140-141"},{"id":"d49","t":"FW","c":["FW1.1"],"d":"Contrat de travail ou lettre d'engagement signé","ty":"Contrat","di":"Personnel","y":0,"sz":["micro","petite","moyenne","grande","xl","xxl"],"se":"*","ct":"Langage intelligible pour la personne salariée, signature d'un représentant de l'entreprise et de la personne salariée, nom de l'entreprise, noms des signataires, nature et lieu du poste, horaires, salaire de base, composantes salariales supplémentaires, date de prise de poste, durée, conditions de résiliation","p":"15-17"},{"id":"d50","t":"FW","c":["FW1.2"],"d":"Politique de délai de prévenance pour les emplois du temps variables","ty":"Politique","di":"Personnel","y":0,"sz":["petite","moyenne","grande","xl","xxl"],"se":"*","ct":"Délai de prévenance identique pour l'entreprise et la personne salariée, paiement intégral en cas d'annulation tardive imputable à l'entreprise, règle de paiement en cas d'annulation tardive indépendante de sa volonté","p":"19-21"},{"id":"d51","t":"FW","c":["FW2.1"],"d":"Politique ou procédure de non-demande des antécédents salariaux","ty":"Politique","di":"Non précisé","y":0,"sz":["petite","moyenne","grande","xl","xxl"],"se":"*","ct":"Engagement à ne pas demander aux candidats et candidates leurs antécédents salariaux ni leurs préférences salariales, sauf grille salariale partagée au préalable","p":"23-25"},{"id":"d52","t":"FW","c":["FW2.2"],"d":"Information sur la rémunération, les avantages et leurs mécanismes de fixation","ty":"Autre","di":"Personnel","y":0,"sz":["micro","petite","moyenne","grande","xl","xxl"],"se":"*","ct":"Toutes les composantes de la rémunération, tous les avantages légaux et facultatifs, mécanismes de fixation et de révision des salaires et avantages (négociation initiale, évaluation des performances, promotions)","p":"27-29"},{"id":"d53","t":"FW","c":["FW2.2"],"d":"Fiche de paie ou document équivalent","ty":"Autre","di":"Personnel","y":0,"sz":["micro","petite","moyenne","grande","xl","xxl"],"se":"*","ct":"Salaire de base, autres composantes de la rémunération, déductions, abréviations définies, termes alignés sur les autres documents internes, langue comprise par la personne salariée","p":"28-29"},{"id":"d54","t":"FW","c":["FW2.3"],"d":"Grille salariale","ty":"Autre","di":"Personnel","y":3,"sz":["grande","xl","xxl"],"se":"*","ct":"Fourchettes de salaire de base par catégorie de poste couvrant tous les niveaux, y compris les plus hauts placés, hors autres composantes de la rémunération","p":"31-33"},{"id":"d55","t":"FW","c":["FW2.4"],"d":"Calcul de l'écart salarial entre les femmes et les hommes","ty":"Évaluation ou analyse","di":"Non précisé","y":0,"sz":["grande","xl","xxl"],"se":"*","ct":"Calcul par pays comptant au moins 250 salariés, selon l'une des trois méthodes (moyenne non ajustée au niveau de l'entreprise, moyenne non ajustée à niveau professionnel équivalent, écart ajusté avec un tiers spécialisé), salaire de base, indemnités et primes en brut, hors heures supplémentaires, frais, avantages en nature et primes différées","p":"35-38"},{"id":"d56","t":"FW","c":["FW2.5"],"d":"Publication de l'écart salarial entre les hommes et les femmes","ty":"Rapport","di":"Public","y":0,"sz":["xl","xxl"],"se":"*","ct":"Écart salarial annuel, écart pour chaque pays comptant au moins 250 salariés, méthodologie de calcul","p":"40-42"},{"id":"d57","t":"FW","c":["FW2.6"],"d":"Présentation des actions de réduction de l'écart salarial et justification éventuelle","ty":"Résumé ou synthèse","di":"Non précisé","y":3,"sz":["grande","xl","xxl"],"se":"*","ct":"Actions mises en œuvre pour réduire l'écart, réduction d'au moins 50 % ou justification fondée sur des facteurs indépendants de la volonté de l'entreprise","p":"44-47"},{"id":"d58","t":"FW","c":["FW2.7"],"d":"Évaluation non genrée des emplois et de l'égalité salariale pour un poste à valeur égale","ty":"Évaluation ou analyse","di":"Personnel","y":5,"sz":["xl","xxl"],"se":"*","ct":"Couverture d'au moins 80 % des catégories de collaborateurs et collaboratrices, méthode analytique à points, équipe mixte, retours des collaborateurs et collaboratrices, comparaison avec les grilles salariales et éléments complémentaires, résumé écrit de la méthodologie","p":"48-50"},{"id":"d59","t":"FW","c":["FW2.7"],"d":"Plan de remédiation des écarts salariaux identifiés","ty":"Plan","di":"Non précisé","y":5,"sz":["xl","xxl"],"se":"*","ct":"Mesures pour remédier aux écarts salariaux identifiés par l'évaluation des emplois","p":"49"},{"id":"d60","t":"FW","c":["FW2.8","FW2.8.a"],"d":"Calcul de la rémunération totale comparée au salaire de subsistance","ty":"Évaluation ou analyse","di":"Non précisé","y":3,"sz":["micro","petite","moyenne","grande","xl","xxl"],"se":"*","ct":"Estimation approuvée par B Lab (Tableau 1), même unité de temps que l'estimation, base temps plein, montants bruts, éléments complémentaires admis plafonnés à 20 %, exclusions listées","p":"54-58, 64-67"},{"id":"d61","t":"FW","c":["FW2.8","FW2.8.b"],"d":"Convention collective fixant le salaire négocié","ty":"Contrat","di":"Non précisé","y":3,"sz":["micro","petite","moyenne","grande","xl","xxl"],"se":"*","ct":"Convention reconnue par la législation nationale, active, allant au-delà des minimums légaux, au moins aussi avantageuse que la loi","p":"70-72"},{"id":"d62","t":"FW","c":["FW2.8","FW2.8.c"],"d":"Évaluation de l'écart avec le salaire de subsistance","ty":"Évaluation ou analyse","di":"Non précisé","y":3,"sz":["micro","petite","moyenne","grande","xl","xxl"],"se":"*","ct":"Écart par salarié, par fonction ou par échelon, nombre et pourcentage de salariés dont la rémunération totale est inférieure au salaire de subsistance, selon les mêmes règles de calcul que FW2.8.a","p":"74-85"},{"id":"d63","t":"FW","c":["FW2.8","FW2.8.c"],"d":"Plan de réduction des écarts avec le salaire de subsistance","ty":"Plan","di":"Non précisé","y":3,"sz":["micro","petite","moyenne","grande","xl","xxl"],"se":"*","ct":"Mesures de réduction des écarts avec le salaire de subsistance","p":"75, 85"},{"id":"d64","t":"FW","c":["FW2.8","FW2.8.c"],"d":"Calcul du ratio entre le salaire le plus élevé et le plus bas","ty":"Évaluation ou analyse","di":"Non précisé","y":3,"sz":["micro","petite","moyenne","grande","xl","xxl"],"se":"*","ct":"Ratio par pays sur la base des rémunérations totales brutes et des primes non incluses, hors parts d'actionnaires, au plus 1 à 10 dans tous les pays","p":"75, 86"},{"id":"d65","t":"FW","c":["FW2.8","FW2.8.c"],"d":"Information publique sur la fixation des salaires extrêmes","ty":"Déclaration","di":"Public","y":3,"sz":["micro","petite","moyenne","grande","xl","xxl"],"se":"*","ct":"Mode de détermination des salaires les plus bas et les plus élevés, raisons de l'absence de salaire de subsistance ou négocié, intentions et objectifs pour les salaires les plus bas, salaires extrêmes ou ratio, réunis au même endroit","p":"75, 86-87"},{"id":"d66","t":"FW","c":["FW2.8","FW2.8.c"],"d":"Rapport d'un tiers sur le positionnement des salaires les plus bas","ty":"Rapport","di":"Non précisé","y":3,"sz":["micro","petite","moyenne","grande","xl","xxl"],"se":"*","ct":"Confirmation par un tiers que les salaires les plus bas se situent dans le premier quartile d'au moins quatre entreprises similaires (secteur, territoire, taille), échantillon choisi par le tiers","p":"75, 87"},{"id":"d67","t":"FW","c":["FW3.1"],"d":"Document formalisant le dispositif de représentation des salariés","ty":"Charte ou engagement","di":"Non précisé","y":3,"sz":["xl","xxl"],"se":"*","ct":"Nature officielle du dispositif (syndicat, comité d'entreprise ou comité de collaborateurs), sous forme de politique, procédure, cadre de référence, charte, accord-cadre ou accord syndical","p":"92-95"},{"id":"d68","t":"FW","c":["FW3.1"],"d":"Compte rendu des réunions des représentants des salariés","ty":"Compte rendu ou procès-verbal","di":"Non précisé","y":3,"sz":["xl","xxl"],"se":"*","ct":"Échanges des représentants lors de leurs réunions","p":"93"},{"id":"d69","t":"FW","c":["FW3.1"],"d":"Déclaration publique de renonciation des salariés à un dispositif de représentation","ty":"Déclaration","di":"Public","y":3,"sz":["xl","xxl"],"se":"*","ct":"Choix des personnes salariées de ne pas avoir de dispositif et manière dont ce choix a été déterminé","p":"93"},{"id":"d70","t":"FW","c":["FW3.2"],"d":"Processus de consultation des collaborateurs et collaboratrices sur les décisions qui les concernent","ty":"Processus","di":"Parties prenantes","y":0,"sz":["petite","moyenne","grande","xl","xxl"],"se":"*","ct":"Sollicitation, prise en compte et réponse aux retours des collaborateurs et collaboratrices concernés ou de leurs représentants","p":"97-99"},{"id":"d71","t":"FW","c":["FW3.2"],"d":"Communication de la décision et de la prise en compte des retours","ty":"Autre","di":"Parties prenantes","y":0,"sz":["petite","moyenne","grande","xl","xxl"],"se":"*","ct":"Décision prise et manière dont les retours ont été pris en compte","p":"98"},{"id":"d72","t":"FW","c":["FW4.1"],"d":"Enquête sur la culture d'entreprise","ty":"Évaluation ou analyse","di":"Confidentiel","y":0,"sz":["petite","moyenne","grande","xl","xxl"],"se":"*","ct":"Mesure de l'impact sur les collaborateurs et collaboratrices, au moins deux thèmes parmi satisfaction, bien-être, appartenance, se sentir engagé, être engagé, sécurité psychologique, qualitative et quantitative dès 50 personnes","p":"102-105"},{"id":"d73","t":"FW","c":["FW4.1"],"d":"Communication relative à l'enquête sur la culture d'entreprise","ty":"Autre","di":"Personnel","y":0,"sz":["petite","moyenne","grande","xl","xxl"],"se":"*","ct":"Caractère facultatif de la participation, mesures d'anonymisation des réponses","p":"103, 105"},{"id":"d74","t":"FW","c":["FW4.1"],"d":"Trace écrite des ateliers ou discussions de groupe","ty":"Compte rendu ou procès-verbal","di":"Confidentiel","y":0,"sz":["petite","moyenne","grande","xl","xxl"],"se":"*","ct":"Contenu des ateliers ou discussions de groupe, anonymisé dans la mesure du possible","p":"104"},{"id":"d75","t":"FW","c":["FW4.2"],"d":"Plan d'amélioration de la culture d'entreprise","ty":"Plan","di":"Personnel","y":3,"sz":["petite","moyenne","grande","xl","xxl"],"se":"*","ct":"Actions d'amélioration de la culture d'entreprise, progression de chaque action, actions pour accroître la participation si elle est inférieure à 50 %","p":"109-110"},{"id":"d76","t":"FW","c":["FW4.3"],"d":"Résultats de l'enquête ventilés par identité de genre ou sexe assigné à la naissance","ty":"Évaluation ou analyse","di":"Confidentiel","y":3,"sz":["grande","xl","xxl"],"se":"*","ct":"Ventilation des résultats, déclaration volontaire et anonyme possible, méthodologie protégeant l'identité","p":"112-114"},{"id":"d77","t":"FW","c":["FW4.4"],"d":"Résultats de l'enquête ventilés selon une autre composante de l'identité sociale","ty":"Évaluation ou analyse","di":"Confidentiel","y":3,"sz":["grande","xl","xxl"],"se":"*","ct":"Ventilation selon une composante choisie à partir des retours des parties prenantes, déclaration volontaire et anonyme possible, méthodologie protégeant l'identité","p":"117-119"},{"id":"d78","t":"JEDI","c":["JEDI1.1"],"d":"Compte rendu de la discussion sur les principes JEDI","ty":"Compte rendu ou procès-verbal","di":"Interne et Confidentiel","y":0,"sz":["petite","moyenne","grande","xl","xxl"],"se":"*","ct":"Discussion d'au moins une heure sur les principes JEDI sur le lieu de travail","p":"20-21"},{"id":"d79","t":"JEDI","c":["JEDI1.1"],"d":"Enquête sur les principes JEDI auprès des collaborateurs et collaboratrices","ty":"Évaluation ou analyse","di":"Confidentiel","y":0,"sz":["petite","moyenne","grande","xl","xxl"],"se":"*","ct":"Enquête sur les principes JEDI sur le lieu de travail, participation volontaire avec anonymat possible","p":"20-21"},{"id":"d80","t":"JEDI","c":["JEDI1.1"],"d":"Compte rendu interne des enquêtes ventilées selon l'identité de genre ou le sexe assigné à la naissance","ty":"Rapport","di":"Interne et Confidentiel","y":0,"sz":["petite","moyenne","grande","xl","xxl"],"se":"*","ct":"Données d'identité de genre ou de sexe assigné à la naissance recueillies dans au moins cinq enquêtes relatives aux collaborateurs et collaboratrices, ventilées pour rendre compte des enquêtes choisies","p":"20-21"},{"id":"d81","t":"JEDI","c":["JEDI1.2"],"d":"Compte rendu interne des enquêtes ventilées selon une identité sociale supplémentaire","ty":"Rapport","di":"Interne et Confidentiel","y":3,"sz":["grande","xl","xxl"],"se":"*","ct":"Données sur une identité sociale autre que l'identité de genre dans au moins cinq évaluations, identité choisie d'après les retours des parties prenantes, résultats ventilés","p":"29-31"},{"id":"d82","t":"JEDI","c":["JEDI2.3"],"d":"Plan d'action JEDI","ty":"Plan","di":"Personnel et Parties prenantes","y":0,"sz":["petite"],"se":"*","ct":"Actions JEDI retenues (quatre actions pour les années 3 et 5, deux avant l'année 0) et progrès réalisés, échéances, ressources allouées, responsabilités attribuées à des rôles spécifiques","p":"42-43"},{"id":"d83","t":"JEDI","c":["JEDI2.4"],"d":"Plan d'action JEDI","ty":"Plan","di":"Personnel et Parties prenantes","y":0,"sz":["moyenne"],"se":"*","ct":"Actions JEDI retenues (cinq actions pour les années 3 et 5, deux avant l'année 0) et progrès réalisés, échéances, ressources allouées, responsabilités attribuées à des rôles spécifiques","p":"46-47"},{"id":"d84","t":"JEDI","c":["JEDI2.5"],"d":"Plan d'action JEDI","ty":"Plan","di":"Personnel et Parties prenantes","y":0,"sz":["grande"],"se":"*","ct":"Actions JEDI retenues (six actions pour les années 3 et 5, deux avant l'année 0) et progrès réalisés, échéances, ressources allouées, responsabilités attribuées à des rôles spécifiques","p":"50-51"},{"id":"d85","t":"JEDI","c":["JEDI2.6"],"d":"Plan d'action JEDI","ty":"Plan","di":"Personnel et Parties prenantes","y":0,"sz":["xl","xxl"],"se":"*","ct":"Actions JEDI retenues (sept actions pour les années 3 et 5, deux avant l'année 0) et progrès réalisés, échéances, ressources allouées, responsabilités attribuées à des rôles spécifiques","p":"54-55"},{"id":"d86","t":"JEDI","c":["JEDI2.a"],"d":"Déclaration d'engagement JEDI","ty":"Déclaration","di":"Public","y":0,"sz":["individuelle","micro","petite","moyenne","grande","xl","xxl"],"se":"*","ct":"Engagement envers les principes JEDI applicable aux politiques et pratiques dans l'ensemble des activités, des relations commerciales et au sein de la communauté. Responsabilité confiée à l'équipe de direction ou à la plus haute instance","p":"58-59"},{"id":"d87","t":"JEDI","c":["JEDI2.c"],"d":"Examen JEDI d'au moins cinq politiques ayant une incidence sur les personnes","ty":"Évaluation ou analyse","di":"Non précisé","y":0,"sz":["individuelle","micro","petite","moyenne","grande","xl","xxl"],"se":"*","ct":"Examen fondé sur les données de JEDI1, les retours des parties prenantes et, le cas échéant, la déclaration JEDI2.a et JEDI2.b. Porte sur la terminologie, l'impact sur les personnes et le lien avec les principes JEDI","p":"67-68"},{"id":"d88","t":"JEDI","c":["JEDI2.d"],"d":"Calcul des ratios de diversité de la plus haute instance de direction et de l'équipe de direction","ty":"Évaluation ou analyse","di":"Non précisé","y":0,"sz":["individuelle","micro","petite","moyenne","grande","xl","xxl"],"se":"*","ct":"Trois identités sociales choisies d'après les retours des parties prenantes et les données démographiques de la communauté, ratios comparés à la communauté (écart toléré inférieur à dix points)","p":"72-73"},{"id":"d89","t":"JEDI","c":["JEDI2.e"],"d":"Rapport d'audit d'équité réalisé par un organisme tiers","ty":"Rapport","di":"Confidentiel","y":0,"sz":["individuelle","micro","petite","moyenne","grande","xl","xxl"],"se":"*","ct":"Résumé écrit de la méthodologie, retours des groupes d'identité sociale concernés, périmètre minimal couvrant collaborateurs et collaboratrices, communication interne et externe, produits et services","p":"77-78"},{"id":"d90","t":"JEDI","c":["JEDI2.e"],"d":"Résumé public des résultats de l'audit d'équité","ty":"Résumé ou synthèse","di":"Public","y":0,"sz":["individuelle","micro","petite","moyenne","grande","xl","xxl"],"se":"*","ct":"Synthèse des résultats de l'audit d'équité","p":"77-78"},{"id":"d91","t":"JEDI","c":["JEDI2.g"],"d":"Déclaration d'engagement JEDI dans les offres d'emploi","ty":"Déclaration","di":"Non précisé","y":0,"sz":["micro","petite","moyenne","grande","xl","xxl"],"se":"*","ct":"Déclaration insérée dans toutes les offres d'emploi, alignée sur la déclaration JEDI2.a si celle-ci existe","p":"85"},{"id":"d92","t":"JEDI","c":["JEDI2.g"],"d":"Politique de non-vérification de solvabilité et de casier judiciaire au recrutement","ty":"Politique","di":"Non précisé","y":0,"sz":["micro","petite","moyenne","grande","xl","xxl"],"se":"*","ct":"Aucune demande de vérification de solvabilité ou de casier judiciaire, sauf exigence légale, professionnelle ou réglementaire","p":"85"},{"id":"d93","t":"JEDI","c":["JEDI2.g"],"d":"Descriptions de poste examinées sous l'angle inclusif","ty":"Évaluation ou analyse","di":"Non précisé","y":0,"sz":["micro","petite","moyenne","grande","xl","xxl"],"se":"*","ct":"Examen du langage et des exigences des descriptions de poste pour garantir leur caractère inclusif et équitable","p":"85"},{"id":"d94","t":"JEDI","c":["JEDI2.g"],"d":"Processus de recrutement réduisant les préjugés","ty":"Processus","di":"Non précisé","y":0,"sz":["micro","petite","moyenne","grande","xl","xxl"],"se":"*","ct":"Mesures pour réduire les préjugés ou leur impact dans le recrutement","p":"85-86"},{"id":"d95","t":"JEDI","c":["JEDI2.h"],"d":"Politique ou procédure écrite de parrainage ou de mentorat","ty":"Procédure","di":"Non précisé","y":0,"sz":["micro","petite","moyenne","grande","xl","xxl"],"se":"*","ct":"Programme ouvert à l'ensemble des salariés, gratuit, d'au moins six mois, sur le temps de travail","p":"88"},{"id":"d96","t":"JEDI","c":["JEDI2.h"],"d":"Suivi de la participation de deux groupes sous-représentés au parrainage ou au mentorat","ty":"Registre","di":"Non précisé","y":0,"sz":["micro","petite","moyenne","grande","xl","xxl"],"se":"*","ct":"Nombre de participantes et participants issus de deux groupes sous-représentés choisis, participation représentative visée","p":"88-89"},{"id":"d97","t":"JEDI","c":["JEDI2.i"],"d":"Guide du langage inclusif pour la communication interne","ty":"Autre","di":"Personnel","y":0,"sz":["micro","petite","moyenne","grande","xl","xxl"],"se":"*","ct":"Termes à utiliser et à éviter, un guide par langue de communication interne","p":"93-94"},{"id":"d98","t":"JEDI","c":["JEDI2.j"],"d":"Calcul des ratios de collaborateurs et collaboratrices issus de groupes sous-représentés","ty":"Évaluation ou analyse","di":"Non précisé","y":0,"sz":["micro","petite","moyenne","grande","xl","xxl"],"se":"*","ct":"Proportion d'au moins deux groupes sous-représentés comparée à la communauté (écart toléré inférieur à cinq points)","p":"97-98"},{"id":"d99","t":"JEDI","c":["JEDI2.k"],"d":"Politique écrite des congés payés supplémentaires","ty":"Politique","di":"Personnel","y":0,"sz":["micro","petite","moyenne","grande","xl","xxl"],"se":"*","ct":"Au moins trois types de congés payés non légaux, entièrement rémunérés, ouverts à tous les salariés, durées fixées d'après leurs retours","p":"102-103"},{"id":"d100","t":"JEDI","c":["JEDI2.l"],"d":"Évaluation de l'accessibilité des outils numériques de communication interne","ty":"Évaluation ou analyse","di":"Non précisé","y":0,"sz":["micro","petite","moyenne","grande","xl","xxl"],"se":"*","ct":"Conformité aux critères WCAG AA ou AAA, réalisée par un ou une spécialiste, tests manuels, retours de personnes en situation de handicap","p":"107-108"},{"id":"d101","t":"JEDI","c":["JEDI2.m"],"d":"Évaluation de l'accessibilité du site internet public","ty":"Évaluation ou analyse","di":"Non précisé","y":0,"sz":["individuelle","micro","petite","moyenne","grande","xl","xxl"],"se":"*","ct":"Conformité aux critères WCAG AA ou AAA, réalisée par un ou une spécialiste, tests manuels, retours de personnes en situation de handicap","p":"111-112"},{"id":"d102","t":"JEDI","c":["JEDI2.n"],"d":"Communication publique du plan d'action JEDI et des progrès","ty":"Rapport","di":"Public","y":0,"sz":["individuelle","micro","petite","moyenne","grande","xl","xxl"],"se":"*","ct":"Plan d'action JEDI issu de JEDI2.3 à JEDI2.6, progrès et domaines sans progrès ou engagements non tenus","p":"115-116"},{"id":"d103","t":"JEDI","c":["JEDI2.o"],"d":"Liste des prestataires locaux et de la diversité de leurs propriétaires","ty":"Liste","di":"Non précisé","y":0,"sz":["individuelle","micro","petite","moyenne","grande","xl","xxl"],"se":"*","ct":"Prestataires locaux de biens et de services et, le cas échéant, appartenance des propriétaires à un groupe sous-représenté","p":"119-120"},{"id":"d104","t":"JEDI","c":["JEDI2.o"],"d":"Politique d'achat favorisant les entreprises locales détenues par des groupes sous-représentés","ty":"Politique","di":"Non précisé","y":0,"sz":["individuelle","micro","petite","moyenne","grande","xl","xxl"],"se":"*","ct":"Préférence aux entreprises locales détenues par des personnes de groupes sous-représentés définis par l'entreprise, objectif de pourcentage d'achats","p":"119-120"},{"id":"d105","t":"JEDI","c":["JEDI2.p"],"d":"Guide de communication inclusive et de contenu éthique pour la communication externe","ty":"Autre","di":"Personnel","y":0,"sz":["individuelle","micro","petite","moyenne","grande","xl","xxl"],"se":"*","ct":"Termes à utiliser et à éviter par langue, collecte, gestion et usage éthiques du contenu, attentes de représentation des identités sociales, usage de l'IA générative le cas échéant","p":"124-126"},{"id":"d106","t":"JEDI","c":["JEDI2.q"],"d":"Évaluation de l'inclusivité d'un produit ou d'un service","ty":"Évaluation ou analyse","di":"Non précisé","y":0,"sz":["individuelle","micro","petite","moyenne","grande","xl","xxl"],"se":"*","ct":"Groupes d'identité sociale susceptibles de rencontrer des obstacles d'accès et nature de ces obstacles, d'après les retours des parties prenantes","p":"129-130"},{"id":"d107","t":"HR","c":["HR1.1"],"d":"Engagement public en matière de droits humains","ty":"Charte ou engagement","di":"Public","y":0,"sz":["micro","petite"],"se":"*","ct":"Engagement à respecter les droits humains, les Principes directeurs des Nations unies, la Charte internationale des droits de l'homme ou la Déclaration universelle, la Déclaration de l'OIT relative aux principes et droits fondamentaux au travail","p":"26-30"},{"id":"d108","t":"HR","c":["HR1.1"],"d":"Engagement public en matière de droits humains","ty":"Charte ou engagement","di":"Public","y":0,"sz":["moyenne"],"se":["services_faible"],"ct":"Engagement à respecter les droits humains, les Principes directeurs des Nations unies, la Charte internationale des droits de l'homme ou la Déclaration universelle, la Déclaration de l'OIT relative aux principes et droits fondamentaux au travail","p":"26-30"},{"id":"d109","t":"HR","c":["HR1.2"],"d":"Politique publique en matière de droits humains","ty":"Politique","di":"Public","y":0,"sz":["grande","xl","xxl"],"se":["services_faible","services_forte","fabrication","vente","agriculture"],"ct":"Engagements à respecter les droits humains, à évaluer les impacts négatifs potentiels, à remédier aux impacts causés ou auxquels l'entreprise a contribué, à respecter les Principes directeurs des Nations unies, la Charte internationale des droits de l'homme et la Déclaration de l'OIT. Périmètre couvrant toutes les personnes et communautés affectées par les activités et la chaîne de valeur","p":"32-38"},{"id":"d110","t":"HR","c":["HR1.2"],"d":"Politique publique en matière de droits humains","ty":"Politique","di":"Public","y":0,"sz":["moyenne"],"se":["services_forte","fabrication","vente","agriculture"],"ct":"Engagements à respecter les droits humains, à évaluer les impacts négatifs potentiels, à remédier aux impacts causés ou auxquels l'entreprise a contribué, à respecter les Principes directeurs des Nations unies, la Charte internationale des droits de l'homme et la Déclaration de l'OIT. Périmètre couvrant toutes les personnes et communautés affectées par les activités et la chaîne de valeur","p":"32-38"},{"id":"d111","t":"HR","c":["HR2.1"],"d":"Évaluation des enjeux majeurs en matière de droits humains","ty":"Évaluation ou analyse","di":"Non précisé","y":0,"sz":["grande","xl","xxl"],"se":["services_faible","services_forte","fabrication","vente","agriculture"],"ct":"Évaluation fondée sur des recherches documentaires et l'engagement des parties prenantes, portant sur les risques pour les personnes et les impacts négatifs réels et potentiels, identifiant les enjeux spécifiques et le lieu où ils sont les plus importants, hiérarchisant les enjeux selon la gravité et la probabilité, tenant compte des impacts potentiels de l'outil d'évaluation des risques de B Lab (FR3.1). Résultat attendu, une liste des enjeux majeurs","p":"39-48"},{"id":"d112","t":"HR","c":["HR2.1"],"d":"Évaluation des enjeux majeurs en matière de droits humains","ty":"Évaluation ou analyse","di":"Non précisé","y":0,"sz":["moyenne"],"se":["services_forte","fabrication","vente","agriculture"],"ct":"Évaluation fondée sur des recherches documentaires et l'engagement des parties prenantes, portant sur les risques pour les personnes et les impacts négatifs réels et potentiels, identifiant les enjeux spécifiques et le lieu où ils sont les plus importants, hiérarchisant les enjeux selon la gravité et la probabilité, tenant compte des impacts potentiels de l'outil d'évaluation des risques de B Lab (FR3.1). Résultat attendu, une liste des enjeux majeurs","p":"39-48"},{"id":"d113","t":"HR","c":["HR2.2"],"d":"Publication des enjeux majeurs en matière de droits humains et de la méthodologie d'évaluation","ty":"Déclaration","di":"Public","y":3,"sz":["grande","xl","xxl"],"se":["services_faible","services_forte","fabrication","vente","agriculture"],"ct":"Enjeux majeurs issus de HR2.1 et méthodologie utilisée pour les évaluer","p":"49-52"},{"id":"d114","t":"HR","c":["HR2.2"],"d":"Publication des enjeux majeurs en matière de droits humains et de la méthodologie d'évaluation","ty":"Déclaration","di":"Public","y":3,"sz":["moyenne"],"se":["services_forte","fabrication","vente","agriculture"],"ct":"Enjeux majeurs issus de HR2.1 et méthodologie utilisée pour les évaluer","p":"49-52"},{"id":"d115","t":"HR","c":["HR2.3"],"d":"Stratégie en matière de droits humains","ty":"Stratégie","di":"Direction","y":3,"sz":["moyenne","grande","xl","xxl"],"se":["services_forte","fabrication","vente","agriculture"],"ct":"Traitement de chaque enjeu majeur selon le type de lien de l'entreprise avec l'enjeu. Objectifs sur trois ans au minimum, indicateurs, rôles et responsabilités, engagement des parties prenantes, dans la stratégie ou son plan de mise en œuvre","p":"53-59"},{"id":"d116","t":"HR","c":["HR2.4"],"d":"Évaluation de l'efficacité de la stratégie en matière de droits humains","ty":"Évaluation ou analyse","di":"Direction","y":5,"sz":["moyenne","grande","xl","xxl"],"se":["services_forte","fabrication","vente","agriculture"],"ct":"Progrès par rapport aux objectifs et indicateurs de la stratégie HR2.3 et appréciation de son efficacité","p":"60-64"},{"id":"d117","t":"HR","c":["HR2.4"],"d":"Enregistrement des enseignements en cas de stratégie inefficace","ty":"Registre","di":"Interne","y":5,"sz":["moyenne","grande","xl","xxl"],"se":["services_forte","fabrication","vente","agriculture"],"ct":"Enseignements tirés, changements envisagés, mise à jour de la stratégie","p":"60-64"},{"id":"d118","t":"HR","c":["HR2.5"],"d":"Rapport public sur la stratégie en matière de droits humains","ty":"Rapport","di":"Public","y":5,"sz":["xxl"],"se":["services_forte","fabrication","vente","agriculture"],"ct":"Progrès sur les objectifs et indicateurs, méthode d'évaluation de l'efficacité. En cas d'inefficacité, enseignements, changements envisagés et mise à jour de la stratégie","p":"65-68"},{"id":"d119","t":"HR","c":["HR2.6"],"d":"Politiques ou procédures couvrant chaque enjeu majeur en matière de droits humains","ty":"Politique","di":"Non précisé","y":3,"sz":["moyenne","grande","xl","xxl"],"se":["services_forte","fabrication","vente","agriculture"],"ct":"Une politique ou une procédure par enjeu majeur, avec un champ d'application adapté à la nature de l'enjeu","p":"69-73"},{"id":"d120","t":"HR","c":["HR2.7"],"d":"Supports d'accompagnement pour la mise en œuvre des politiques et procédures relatives aux droits humains","ty":"Autre","di":"Personnel","y":3,"sz":["moyenne","grande","xl","xxl"],"se":["services_forte","fabrication","vente","agriculture"],"ct":"Formation, documents d'orientation ou outils adaptés à chaque fonction concernée","p":"74-78"},{"id":"d121","t":"HR","c":["HR3.1"],"d":"Processus de collecte, de hiérarchisation et de remontée des informations sur les impacts en droits humains","ty":"Processus","di":"Non précisé","y":0,"sz":["grande","xl","xxl"],"se":["services_faible","services_forte","fabrication","vente","agriculture"],"ct":"Collecte, hiérarchisation et remontée des informations sur les impacts négatifs réels et potentiels, rôles et responsabilités, priorisation selon la gravité et la probabilité, recherche d'informations complémentaires et implication des parties prenantes, changements internes déclenchant une évaluation proactive","p":"79-85"},{"id":"d122","t":"HR","c":["HR3.1"],"d":"Processus de collecte, de hiérarchisation et de remontée des informations sur les impacts en droits humains","ty":"Processus","di":"Non précisé","y":0,"sz":["moyenne"],"se":["services_forte","fabrication","vente","agriculture"],"ct":"Collecte, hiérarchisation et remontée des informations sur les impacts négatifs réels et potentiels, rôles et responsabilités, priorisation selon la gravité et la probabilité, recherche d'informations complémentaires et implication des parties prenantes, changements internes déclenchant une évaluation proactive","p":"79-85"},{"id":"d123","t":"HR","c":["HR3.3"],"d":"Processus d'évaluation des impacts en droits humains des clients organisationnels et projets potentiels","ty":"Processus","di":"Non précisé","y":0,"sz":["individuelle","micro","petite","moyenne","grande","xl","xxl"],"se":["services_faible"],"ct":"Évaluation des impacts négatifs potentiels liés aux clients organisationnels et projets potentiels, mesures opérationnelles d'atténuation","p":"92-107"},{"id":"d124","t":"HR","c":["HR3.3"],"d":"Compte rendu annuel de l'évaluation des trois clients ou projets potentiels les plus matériels","ty":"Résumé ou synthèse","di":"Non précisé","y":0,"sz":["individuelle","micro","petite","moyenne","grande","xl","xxl"],"se":["services_faible"],"ct":"Méthode d'évaluation et résultats pour les trois clients ou projets les plus matériels","p":"102-103"},{"id":"d125","t":"HR","c":["HR3.3"],"d":"Registre des mesures d'atténuation liées aux clients et projets et de leur efficacité","ty":"Registre","di":"Interne","y":0,"sz":["individuelle","micro","petite","moyenne","grande","xl","xxl"],"se":["services_faible"],"ct":"Mesures d'atténuation prises lorsque les évaluations révèlent des impacts, efficacité de ces mesures","p":"102"},{"id":"d126","t":"HR","c":["HR3.4"],"d":"Processus d'évaluation des impacts en droits humains des investissements potentiels","ty":"Processus","di":"Non précisé","y":0,"sz":["individuelle","micro","petite","moyenne","grande","xl","xxl"],"se":["services_faible"],"ct":"Évaluation des impacts négatifs potentiels des investissements potentiels, mesures d'atténuation","p":"108-115"},{"id":"d127","t":"HR","c":["HR3.4"],"d":"Compte rendu annuel de l'évaluation des trois investissements potentiels les plus matériels","ty":"Résumé ou synthèse","di":"Non précisé","y":0,"sz":["individuelle","micro","petite","moyenne","grande","xl","xxl"],"se":["services_faible"],"ct":"Méthode d'évaluation et résultats pour les trois investissements les plus matériels","p":"110-111"},{"id":"d128","t":"HR","c":["HR3.4"],"d":"Registre des mesures d'atténuation liées aux investissements et de leur efficacité","ty":"Registre","di":"Interne","y":0,"sz":["individuelle","micro","petite","moyenne","grande","xl","xxl"],"se":["services_faible"],"ct":"Mesures d'atténuation prises lorsque les évaluations révèlent des impacts, efficacité de ces mesures","p":"110"},{"id":"d129","t":"HR","c":["HR3.5"],"d":"Évaluation d'impact sur les droits humains","ty":"Évaluation ou analyse","di":"Non précisé","y":5,"sz":["xl","xxl"],"se":"*","ct":"Contexte à haut risque, engagement significatif des parties prenantes y compris concernées, impacts négatifs réels et potentiels, type de lien de l'entreprise, réalisation par des personnes disposant de l'expertise nécessaire","p":"116-120"},{"id":"d130","t":"HR","c":["HR3.5"],"d":"Résumé public des résultats de l'évaluation d'impact sur les droits humains","ty":"Résumé ou synthèse","di":"Public","y":5,"sz":["xl","xxl"],"se":"*","ct":"Résultats de l'évaluation d'impact, au minimum sous forme de résumé","p":"117"},{"id":"d131","t":"HR","c":["HR3.6"],"d":"Évaluation des liens avec les zones en situation de conflit","ty":"Évaluation ou analyse","di":"Non précisé","y":3,"sz":["petite","moyenne","grande","xl","xxl"],"se":"*","ct":"Identification des activités en zone de conflit d'après la liste FCS de la Banque mondiale, évaluation des liens avec chaque zone","p":"121-125"},{"id":"d132","t":"HR","c":["HR3.6"],"d":"Explication publique des liens avec les zones en situation de conflit","ty":"Déclaration","di":"Public","y":3,"sz":["petite","moyenne","grande","xl","xxl"],"se":"*","ct":"Nature des activités dans le pays ou territoire, manière dont elles peuvent ou non influer sur le conflit","p":"122-124"},{"id":"d133","t":"HR","c":["HR3.6"],"d":"Analyse de diligence raisonnable renforcée en zone de conflit","ty":"Évaluation ou analyse","di":"Non précisé","y":3,"sz":["petite","moyenne","grande","xl","xxl"],"se":"*","ct":"Consultation d'experts ou de représentants des parties prenantes, accès aux plaintes, déclencheurs d'action en cas d'escalade, personne de contact désignée, lacunes de diligence raisonnable, moyens de prévention et d'atténuation","p":"122-125"},{"id":"d134","t":"HR","c":["HR4.1"],"d":"Registre des impacts potentiels en droits humains liés aux pays d'origine et aux matières premières","ty":"Registre","di":"Interne","y":3,"sz":["moyenne","grande","xl","xxl"],"se":["fabrication","vente"],"ct":"Impacts négatifs potentiels liés aux pays d'origine et aux matières premières","p":"128-134"},{"id":"d135","t":"HR","c":["HR4.1"],"d":"Analyse des limites du suivi des fournisseurs et mesures d'atténuation","ty":"Évaluation ou analyse","di":"Non précisé","y":3,"sz":["moyenne","grande","xl","xxl"],"se":["fabrication","vente"],"ct":"Limites de la capacité de suivi des fournisseurs par pays d'origine, mesures d'atténuation, limites des audits de conformité sociale ou des certifications utilisés et réponse à chacune, prise en compte lors du choix des pays et matières","p":"130-132"},{"id":"d136","t":"HR","c":["HR4.2"],"d":"Analyse des impacts en droits humains des trois décisions d'achat les plus matérielles","ty":"Évaluation ou analyse","di":"Non précisé","y":0,"sz":["individuelle","micro","petite"],"se":"*","ct":"Prise en compte des impacts réels et potentiels sur les droits humains dans les trois décisions d'achat les plus matérielles, tous rangs de fournisseurs et tous types d'achats","p":"135-142"},{"id":"d137","t":"HR","c":["HR4.2"],"d":"Analyse des impacts en droits humains des trois décisions d'achat les plus matérielles","ty":"Évaluation ou analyse","di":"Non précisé","y":0,"sz":["moyenne"],"se":["services_faible","services_forte"],"ct":"Prise en compte des impacts réels et potentiels sur les droits humains dans les trois décisions d'achat les plus matérielles, tous rangs de fournisseurs et tous types d'achats","p":"135-142"},{"id":"d138","t":"HR","c":["HR4.3"],"d":"Analyse des impacts en droits humains des cinq décisions d'achat les plus matérielles","ty":"Évaluation ou analyse","di":"Non précisé","y":0,"sz":["grande","xl","xxl"],"se":["services_faible"],"ct":"Prise en compte des impacts réels et potentiels sur les droits humains dans les cinq décisions d'achat les plus matérielles, tous rangs de fournisseurs et tous types d'achats","p":"143-150"},{"id":"d139","t":"HR","c":["HR4.3"],"d":"Analyse des impacts en droits humains des cinq décisions d'achat les plus matérielles","ty":"Évaluation ou analyse","di":"Non précisé","y":0,"sz":["moyenne"],"se":["fabrication","vente","agriculture"],"ct":"Prise en compte des impacts réels et potentiels sur les droits humains dans les cinq décisions d'achat les plus matérielles, tous rangs de fournisseurs et tous types d'achats","p":"143-150"},{"id":"d140","t":"HR","c":["HR4.4"],"d":"Liste des fournisseurs prioritaires et critères de hiérarchisation","ty":"Liste","di":"Non précisé","y":0,"sz":["grande","xl","xxl"],"se":["services_forte","fabrication","vente","agriculture"],"ct":"Fournisseurs prioritaires au regard des enjeux majeurs HR2.1, critères documentés de hiérarchisation","p":"151-157"},{"id":"d141","t":"HR","c":["HR4.4"],"d":"Objectifs convenus avec chaque fournisseur prioritaire et suivi des progrès","ty":"Plan","di":"Parties prenantes","y":0,"sz":["grande","xl","xxl"],"se":["services_forte","fabrication","vente","agriculture"],"ct":"Objectifs de prévention ou d'atténuation convenus avec chaque fournisseur prioritaire, suivi des progrès","p":"153-154"},{"id":"d142","t":"HR","c":["HR4.4"],"d":"Documentation des mesures de prévention et d'atténuation menées avec les fournisseurs et de leurs résultats","ty":"Registre","di":"Interne","y":0,"sz":["grande","xl","xxl"],"se":["services_forte","fabrication","vente","agriculture"],"ct":"Mesures spécifiques de prévention et d'atténuation, résultats obtenus","p":"153"},{"id":"d143","t":"HR","c":["HR4.5"],"d":"Documents relatifs aux achats intégrant les engagements de l'acheteur","ty":"Charte ou engagement","di":"Parties prenantes","y":5,"sz":["grande","xl","xxl"],"se":["fabrication","vente","agriculture"],"ct":"Engagements et responsabilités de l'acheteur équilibrés avec ceux du fournisseur et portant sur les droits humains, engagement commun de diligence raisonnable, engagement commun de priorité à la remédiation, engagement de l'acheteur au désengagement responsable","p":"158-163"},{"id":"d144","t":"HR","c":["HR4.5"],"d":"Registre des modifications apportées aux documents relatifs aux achats","ty":"Registre","di":"Interne","y":5,"sz":["grande","xl","xxl"],"se":["fabrication","vente","agriculture"],"ct":"Modifications apportées aux documents d'achat","p":"159"},{"id":"d145","t":"HR","c":["HR4.6"],"d":"Liste des matières premières à haut risque","ty":"Liste","di":"Non précisé","y":3,"sz":["xl","xxl"],"se":["fabrication","vente","agriculture"],"ct":"Matières premières dont on sait ou soupçonne qu'elles ont de graves impacts négatifs sur les droits humains","p":"164-168"},{"id":"d146","t":"HR","c":["HR4.6"],"d":"Plan de traçabilité des matières premières à haut risque","ty":"Plan","di":"Non précisé","y":3,"sz":["xl","xxl"],"se":["fabrication","vente","agriculture"],"ct":"Calendrier de traçabilité et de cartographie complète de la chaîne d'approvisionnement à tous les rangs pour toutes les matières premières à haut risque","p":"165"},{"id":"d147","t":"HR","c":["HR4.6","HR4.7"],"d":"Documentation de la proportion de matières premières à haut risque traçables","ty":"Registre","di":"Interne","y":3,"sz":["xl","xxl"],"se":["fabrication","vente","agriculture"],"ct":"Proportion de matières premières à haut risque dont l'origine peut être retracée","p":"165, 170"},{"id":"d148","t":"HR","c":["HR4.8"],"d":"Plan d'action et objectifs avec les fournisseurs prioritaires pour les matières premières à haut risque","ty":"Plan","di":"Parties prenantes","y":5,"sz":["xl","xxl"],"se":["fabrication","vente","agriculture"],"ct":"Plan d'action et objectifs de prévention, d'atténuation et de remédiation, suivi des progrès","p":"174-179"},{"id":"d149","t":"HR","c":["HR4.8"],"d":"Registre des actions de prévention et d'atténuation liées aux matières premières à haut risque","ty":"Registre","di":"Interne","y":5,"sz":["xl","xxl"],"se":["fabrication","vente","agriculture"],"ct":"Actions spécifiques de prévention et d'atténuation, résultats obtenus","p":"175"},{"id":"d150","t":"HR","c":["HR4.9"],"d":"Évaluation des contrats de service au regard du salaire de subsistance","ty":"Évaluation ou analyse","di":"Non précisé","y":0,"sz":["moyenne","grande","xl","xxl"],"se":["services_faible"],"ct":"Vérification du versement d'un salaire de subsistance ou d'un salaire négocié collectivement par les prestataires, contrats de services sans qualification formelle requise","p":"180-191"},{"id":"d151","t":"HR","c":["HR4.9"],"d":"Registre des écarts par rapport au salaire de subsistance dans les contrats de service","ty":"Registre","di":"Interne","y":0,"sz":["moyenne","grande","xl","xxl"],"se":["services_faible"],"ct":"Tout écart constaté, souvent exprimé en pourcentage sous le salaire de subsistance","p":"181-182"},{"id":"d152","t":"HR","c":["HR4.10"],"d":"Documents de sélection des prestataires de services mentionnant le salaire de subsistance","ty":"Autre","di":"Non précisé","y":3,"sz":["moyenne","grande","xl","xxl"],"se":["services_faible"],"ct":"Mention du salaire de subsistance pour les services présentant un écart potentiel identifié en HR4.9","p":"192-195"},{"id":"d153","t":"HR","c":["HR4.11"],"d":"Plan relatif au salaire de subsistance, au revenu de subsistance ou à la négociation collective dans la chaîne d'approvisionnement","ty":"Plan","di":"Non précisé","y":3,"sz":["moyenne","grande","xl","xxl"],"se":["services_forte","fabrication","vente","agriculture"],"ct":"Vue d'ensemble des écarts connus et inconnus, domaines prioritaires, objectifs sur trois ans, engagement des parties prenantes y compris les fournisseurs","p":"203-206"},{"id":"d154","t":"HR","c":["HR4.11"],"d":"Mise à jour publique du plan relatif au salaire ou au revenu de subsistance","ty":"Rapport","di":"Public","y":3,"sz":["moyenne","grande","xl","xxl"],"se":["services_forte","fabrication","vente","agriculture"],"ct":"Actions mises en œuvre dans les domaines prioritaires, réalisations et défis","p":"205"},{"id":"d155","t":"CA","c":["CA1.1"],"d":"Processus documenté de mesure annuelle des émissions de GES","ty":"Processus","di":"Non précisé","y":0,"sz":["grande","xl","xxl"],"se":"*","ct":"Mesure des émissions brutes du scope 1, du scope 2 selon l'approche géographique et selon l'approche par le marché, du scope 3 par catégorie pertinente, et des totaux selon les deux approches, en tonnes équivalent CO2","p":"23-30"},{"id":"d156","t":"CA","c":["CA1.1"],"d":"Inventaire des émissions de gaz à effet de serre","ty":"Inventaire","di":"Public","y":0,"sz":["grande","xl","xxl"],"se":"*","ct":"Émissions brutes des scopes 1, 2 (deux approches) et 3, émissions par catégorie pertinente du scope 3, totaux selon les deux approches du scope 2, publiés dans un rapport annuel, un rapport de durabilité ou un autre rapport public en ligne","p":"23-30"},{"id":"d157","t":"CA","c":["CA1.1"],"d":"Liste des catégories du scope 3 incluses et exclues de l'inventaire","ty":"Liste","di":"Non précisé","y":0,"sz":["grande","xl","xxl"],"se":"*","ct":"Catégories du scope 3 incluses et exclues, avec justification de chaque exclusion","p":"24"},{"id":"d158","t":"CA","c":["CA1.1"],"d":"Description des principes, outils comptables et hypothèses de mesure","ty":"Autre","di":"Non précisé","y":0,"sz":["grande","xl","xxl"],"se":"*","ct":"Principes et outils conformes au GHG Protocol ou à la norme ISO 14064-1:2018, méthodologie PCAF pour les fonds d'investissement et le conseil en investissement, hypothèses associées","p":"24"},{"id":"d159","t":"CA","c":["CA1.2"],"d":"Vérification de l'inventaire annuel des émissions par un organisme tiers indépendant et accrédité","ty":"Rapport","di":"Non précisé","y":0,"sz":["grande","xl","xxl"],"se":"*","ct":"Confirmation que l'inventaire couvre les scopes 1 et 2 et toutes les catégories pertinentes du scope 3 et suit la méthodologie du critère 1.1.4, par un organisme accrédité par un membre de l'IAF selon une norme de vérification (par exemple ISO 14064-3:2019, ISAE 3410)","p":"34-38"},{"id":"d160","t":"CA","c":["CA2.1"],"d":"Plan d'action climatique","ty":"Plan","di":"Public","y":0,"sz":["individuelle","micro","petite","moyenne"],"se":"*","ct":"Engagement à soutenir l'ambition de 1,5 °C, objectifs SMART de performance et d'impact, allocation des ressources humaines, techniques et matérielles, modalités d'engagement avec les parties prenantes","p":"39-45"},{"id":"d161","t":"CA","c":["CA2.2"],"d":"Objectifs de réduction alignés sur les connaissances scientifiques, validés par la SBTi ou vérifiés par un tiers accrédité","ty":"Autre","di":"Non précisé","y":3,"sz":["grande","xl","xxl"],"se":"*","ct":"Objectif de zéro émission nette des scopes 1, 2 et 3 aligné sur 1,5 °C (2050 au plus tard, 2040 pour l'électricité et le transport maritime), objectifs à court terme sur 5 à 10 ans, en émissions absolues sauf trajectoire d'intensité sectorielle approuvée","p":"49-52"},{"id":"d162","t":"CA","c":["CA2.2"],"d":"Données de l'année de référence des émissions","ty":"Registre","di":"Non précisé","y":3,"sz":["grande","xl","xxl"],"se":"*","ct":"Année de référence et émissions brutes des scopes 1, 2 et 3 (catégories pertinentes) de cette année, en tonnes équivalent CO2","p":"50"},{"id":"d163","t":"CA","c":["CA2.3"],"d":"Plan de transition climatique","ty":"Plan","di":"Non précisé","y":3,"sz":["grande","xl","xxl"],"se":"*","ct":"Mesures d'atténuation pour atteindre les objectifs de CA2.2, rôles et responsabilités, implication des parties prenantes, plan réaliste de mobilisation des ressources, investissement alloué l'an dernier (montant et pourcentage), contribution du modèle d'affaires à l'objectif de zéro émission nette","p":"56-58"},{"id":"d164","t":"CA","c":["CA2.3"],"d":"Preuves de séquestration des émissions résiduelles","ty":"Registre","di":"Non précisé","y":3,"sz":["grande","xl","xxl"],"se":"*","ct":"Preuves du recours à des méthodes crédibles de séquestration et quantité de GES séquestrés ou stockés, en tonnes équivalent CO2","p":"57"},{"id":"d165","t":"CA","c":["CA2.4"],"d":"Revue du plan de transition identifiant les parties prenantes affectées","ty":"Évaluation ou analyse","di":"Non précisé","y":3,"sz":["grande","xl","xxl"],"se":["services_forte","fabrication","vente","agriculture"],"ct":"Parties prenantes affectées positivement ou négativement et dans quelle mesure, parties prenantes les plus vulnérables au changement climatique, au minimum fournisseurs ou chaîne d'approvisionnement et collaborateurs","p":"65-69"},{"id":"d166","t":"CA","c":["CA2.4"],"d":"Consultation des collaborateurs et des parties prenantes sur le plan de transition","ty":"Processus","di":"Personnel et Parties prenantes","y":3,"sz":["grande","xl","xxl"],"se":["services_forte","fabrication","vente","agriculture"],"ct":"Information sur le plan, possibilité de faire des retours, modalités de collaboration pour la mise en œuvre","p":"67"},{"id":"d167","t":"CA","c":["CA2.4"],"d":"Volet transition juste du plan de transition climatique","ty":"Plan","di":"Non précisé","y":3,"sz":["grande","xl","xxl"],"se":["services_forte","fabrication","vente","agriculture"],"ct":"Retours de la consultation intégrés, actions de transition juste, ressources dédiées financières et en temps de travail, objectifs définis","p":"67"},{"id":"d168","t":"CA","c":["CA3.1"],"d":"Relevé des rémunérations incitatives liées aux objectifs climatiques de l'équipe de direction","ty":"Registre","di":"Non précisé","y":3,"sz":["grande","xl","xxl"],"se":["services_forte","fabrication","vente","agriculture"],"ct":"Montant annuel des récompenses monétaires liées aux objectifs de réduction des scopes 1, 2 et 3 ou d'efficacité énergétique, en pourcentage du salaire de chaque membre concerné","p":"73-77"},{"id":"d169","t":"CA","c":["CA3.2"],"d":"Résultats visés et ressources du plaidoyer climatique","ty":"Autre","di":"Non précisé","y":3,"sz":["xxl"],"se":"*","ct":"Résultats spécifiques visés, politiques climatiques fondées sur la science alignées sur 2050, ressources financières, en nature ou en temps de travail","p":"78-82"},{"id":"d170","t":"CA","c":["CA3.3"],"d":"Suivi des progrès du plan d'action climatique","ty":"Registre","di":"Non précisé","y":3,"sz":["individuelle","micro","petite","moyenne"],"se":"*","ct":"Progrès réalisés, actions alignées sur la dernière version du plan, objectifs révisés si nécessaire","p":"83-84"},{"id":"d171","t":"CA","c":["CA3.3"],"d":"Évaluation de l'efficacité du plan d'action climatique","ty":"Évaluation ou analyse","di":"Non précisé","y":3,"sz":["individuelle","micro","petite","moyenne"],"se":"*","ct":"Enseignements retirés, changements prévus, mise à jour du plan","p":"84"},{"id":"d172","t":"CA","c":["CA3.4"],"d":"Suivi des progrès vers les objectifs à court terme et de zéro émission nette","ty":"Registre","di":"Non précisé","y":5,"sz":["grande","xl","xxl"],"se":"*","ct":"Progrès en tonnes équivalent CO2 et en pourcentage des émissions de l'année de référence","p":"88-90"},{"id":"d173","t":"CA","c":["CA3.4"],"d":"Évaluation de l'efficacité du plan de transition climatique","ty":"Évaluation ou analyse","di":"Non précisé","y":5,"sz":["grande","xl","xxl"],"se":"*","ct":"Enseignements retirés, changements prévus, mise à jour du plan de transition","p":"89"},{"id":"d174","t":"CA","c":["CA3.4"],"d":"Relevé des émissions séquestrées ou stockées","ty":"Registre","di":"Non précisé","y":5,"sz":["grande","xl","xxl"],"se":"*","ct":"Quantité de GES séquestrés ou stockés dans les activités ou la chaîne de valeur, en tonnes équivalent CO2","p":"89"},{"id":"d175","t":"CA","c":["CA3.5"],"d":"Relevé des actions de transition juste","ty":"Registre","di":"Non précisé","y":5,"sz":["grande","xl","xxl"],"se":["services_forte","fabrication","vente","agriculture"],"ct":"Actions en faveur d'une transition juste issues de la consultation prévue en CA2.4 et suivi de leurs progrès","p":"95-98"},{"id":"d176","t":"CA","c":["CA3.6"],"d":"Rapport public sur les progrès du plan d'action climatique","ty":"Rapport","di":"Public","y":3,"sz":["individuelle","micro","petite","moyenne"],"se":"*","ct":"Performances et actions mises en place pour atteindre les objectifs, dans un rapport annuel, un rapport de durabilité ou un autre rapport public","p":"100-104"},{"id":"d177","t":"CA","c":["CA3.7"],"d":"Rapport public annuel d'avancement du plan de transition climatique","ty":"Rapport","di":"Public","y":5,"sz":["grande","xl","xxl"],"se":"*","ct":"Inventaire complet des émissions (scopes 1, 2 selon les deux approches, 3 par catégorie, totaux), objectifs de zéro émission nette et à court terme, progrès en tonnes équivalent CO2 et en pourcentage de l'année de référence, actions mises en place","p":"105-109"},{"id":"d178","t":"ESC","c":["ESC1.1"],"d":"Registre annuel de la production de déchets et de leur destination finale","ty":"Registre","di":"Non précisé","y":0,"sz":["micro","petite","moyenne","grande","xl","xxl"],"se":["services_forte","fabrication","vente","agriculture"],"ct":"Déchets non dangereux et dangereux en tonnes, quantité totale, part non éliminée (réemploi, recyclage, autre revalorisation), part éliminée (incinération sans récupération d'énergie, décharge, autres méthodes) ; déchets alimentaires si l'entreprise produit ou vend des denrées ; destination inconnue réputée mise en décharge","p":"44-51"},{"id":"d179","t":"ESC","c":["ESC1.1","ESC1.2","ESC1.3"],"d":"Plan d'extension du suivi des déchets, de l'énergie et de l'eau à toutes les installations","ty":"Plan","di":"Non précisé","y":0,"sz":["micro","petite","moyenne","grande","xl","xxl"],"se":["services_forte","fabrication","vente","agriculture"],"ct":"Extension de l'évaluation et de l'enregistrement aux installations non encore couvertes par le suivi des installations matérielles (GEC1.7)","p":"46, 54, 60"},{"id":"d180","t":"ESC","c":["ESC1.2"],"d":"Registre annuel de la consommation d'énergie","ty":"Registre","di":"Non précisé","y":0,"sz":["micro","petite","moyenne","grande","xl","xxl"],"se":["services_forte","fabrication","vente","agriculture"],"ct":"Énergie totale et énergie renouvelable (GJ ou Wh), pourcentage d'énergie renouvelable autoproduite, pourcentage d'électricité renouvelable, intensité énergétique par million de dollars de chiffre d'affaires ou par unité","p":"52-57"},{"id":"d181","t":"ESC","c":["ESC1.3"],"d":"Registre annuel de la consommation ou du prélèvement d'eau","ty":"Registre","di":"Non précisé","y":0,"sz":["micro","petite","moyenne","grande","xl","xxl"],"se":["services_forte","fabrication","vente","agriculture"],"ct":"Volume total en m3, eau recyclée et réutilisée en m3, intensité hydrique par million de dollars ou par unité de produit, justification du choix entre consommation et prélèvement","p":"58-62"},{"id":"d182","t":"ESC","c":["ESC1.4"],"d":"Liste des infrastructures en zone à risque hydrique et registre de leur consommation ou prélèvement d'eau","ty":"Registre","di":"Non précisé","y":0,"sz":["moyenne","grande","xl","xxl"],"se":["services_forte","fabrication","vente","agriculture"],"ct":"Identification de toutes les infrastructures en zone à risque physique lié à l'eau ; volume annuel en m3 ; plan d'extension du suivi aux installations restantes de ces zones","p":"63-68"},{"id":"d183","t":"ESC","c":["ESC1.5"],"d":"Évaluation des infrastructures situées en zone écologiquement sensible ou à proximité","ty":"Évaluation ou analyse","di":"Non précisé","y":0,"sz":["moyenne","grande","xl","xxl"],"se":["fabrication","agriculture"],"ct":"Localisation et superficie en hectares des infrastructures, impacts sur la biodiversité classés par gravité et probabilité, ensemble des infrastructures de fabrication et de production","p":"68-73"},{"id":"d184","t":"ESC","c":["ESC1.6"],"d":"Processus de suivi du bien-être animal et indicateurs associés","ty":"Processus","di":"Non précisé","y":0,"sz":["micro","petite","moyenne","grande","xl","xxl"],"se":"*","ct":"Indicateurs couvrant l'élevage, le transport et l'abattage des animaux ; respect des cinq libertés fondamentales et des exigences légales","p":"74-79"},{"id":"d185","t":"ESC","c":["ESC1.6"],"d":"Résumé annuel global des conditions de bien-être animal","ty":"Résumé ou synthèse","di":"Non précisé","y":0,"sz":["micro","petite","moyenne","grande","xl","xxl"],"se":"*","ct":"Synthèse des conditions de bien-être animal mesurées par les indicateurs de suivi","p":"75"},{"id":"d186","t":"ESC","c":["ESC1.7"],"d":"Évaluation des impacts environnementaux réels et potentiels des activités directes et de la chaîne de valeur","ty":"Évaluation ou analyse","di":"Non précisé","y":0,"sz":["moyenne","grande","xl","xxl"],"se":["services_forte","fabrication","vente","agriculture"],"ct":"Vue d'ensemble de la chaîne de valeur et de ses impacts sur la nature et le bien-être animal ; liste des activités prioritaires ; liste des matières premières ou produits à fort impact avec méthode d'identification ; liste priorisée des enjeux environnementaux matériels ; cinq facteurs de changement de la nature ; prise en compte des impacts potentiels de l'outil de B Lab (EB3.1) ; recherches et engagement des parties prenantes","p":"80-94"},{"id":"d187","t":"ESC","c":["ESC1.7"],"d":"Explication écrite de la non-matérialité de l'eau, de la biodiversité ou des déchets","ty":"Autre","di":"Non précisé","y":0,"sz":["moyenne","grande","xl","xxl"],"se":["services_forte","fabrication","vente","agriculture"],"ct":"Justification fondée sur des preuves scientifiques crédibles","p":"82"},{"id":"d188","t":"ESC","c":["ESC1.8"],"d":"Publication des enjeux environnementaux matériels et de la méthodologie d'analyse","ty":"Rapport","di":"Public","y":3,"sz":["moyenne","grande","xl","xxl"],"se":["services_forte","fabrication","vente","agriculture"],"ct":"Enjeux environnementaux matériels issus de GEC1.7 et méthodologie utilisée, dans un rapport annuel, un rapport de développement durable ou intégré, ou un autre rapport public","p":"95-98"},{"id":"d189","t":"ESC","c":["ESC2.1"],"d":"Stratégie environnementale ou plan de mise en œuvre connexe","ty":"Stratégie","di":"Non précisé","y":3,"sz":["moyenne","grande","xl","xxl"],"se":["services_forte","fabrication","vente","agriculture"],"ct":"Traitement des impacts négatifs matériels de GEC1.7 ; objectifs quantifiés sur au moins 36 mois ; indicateurs ; rôles et responsabilités ; plan de consultation des parties prenantes ; priorité à l'évitement et à la réduction ; protection des zones sensibles ou à risque hydrique ; alignement du modèle d'affaires","p":"99-109"},{"id":"d190","t":"ESC","c":["ESC2.2"],"d":"Plan de transition pour la biodiversité","ty":"Plan","di":"Non précisé","y":3,"sz":["xl","xxl"],"se":["services_forte","fabrication","vente","agriculture"],"ct":"Engagement à arrêter et inverser la perte de biodiversité d'ici 2030 ; objectifs quantifiés pour les sites propres ; plan de consultation des fournisseurs significatifs ; intégration des savoirs autochtones ; actions de maintien de la biodiversité, du carbone, des sols et des écosystèmes ; mesure des résultats positifs ; prévention en zones sensibles ; hiérarchie des mesures d'atténuation","p":"110-119"},{"id":"d191","t":"ESC","c":["ESC2.2"],"d":"Plan de transition pour la biodiversité","ty":"Plan","di":"Non précisé","y":3,"sz":["moyenne","grande"],"se":["fabrication","agriculture"],"ct":"Engagement à arrêter et inverser la perte de biodiversité d'ici 2030 ; objectifs quantifiés pour les sites propres ; plan de consultation des fournisseurs significatifs ; intégration des savoirs autochtones ; actions de maintien de la biodiversité, du carbone, des sols et des écosystèmes ; mesure des résultats positifs ; prévention en zones sensibles ; hiérarchie des mesures d'atténuation","p":"110-119"},{"id":"d192","t":"ESC","c":["ESC2.3"],"d":"Stratégie de gestion de l'eau","ty":"Stratégie","di":"Non précisé","y":3,"sz":["grande","xl","xxl"],"se":["services_forte","fabrication","vente","agriculture"],"ct":"Gestion circulaire de l'eau ; objectifs quantifiés pour les sites propres ; plan d'engagement des fournisseurs significatifs ; actions de réduction de la consommation et de la pollution, surtout en zone à risque hydrique ; savoirs autochtones ; respect de la part proportionnelle des réserves du bassin versant si des données existent","p":"120-126"},{"id":"d193","t":"ESC","c":["ESC2.3"],"d":"Stratégie de gestion de l'eau","ty":"Stratégie","di":"Non précisé","y":3,"sz":["moyenne"],"se":["fabrication","agriculture"],"ct":"Gestion circulaire de l'eau ; objectifs quantifiés pour les sites propres ; plan d'engagement des fournisseurs significatifs ; actions de réduction de la consommation et de la pollution, surtout en zone à risque hydrique ; savoirs autochtones ; respect de la part proportionnelle des réserves du bassin versant si des données existent","p":"120-126"},{"id":"d194","t":"ESC","c":["ESC2.4"],"d":"Politiques ou procédures couvrant chaque enjeu environnemental matériel","ty":"Politique","di":"Non précisé","y":3,"sz":["moyenne","grande","xl","xxl"],"se":["services_forte","fabrication","vente","agriculture"],"ct":"Une politique ou une procédure par enjeu environnemental matériel, avec un périmètre correspondant à l'enjeu (activités internes ou chaîne d'approvisionnement)","p":"127-131"},{"id":"d195","t":"ESC","c":["ESC2.5"],"d":"Supports de formation, guides ou outils adaptés aux fonctions pertinentes","ty":"Autre","di":"Personnel","y":3,"sz":["moyenne","grande","xl","xxl"],"se":["services_forte","fabrication","vente","agriculture"],"ct":"Conseils pour mettre en œuvre les politiques et procédures environnementales, adaptés au poste ou au département ; une formation générique ne suffit pas","p":"132-135"},{"id":"d196","t":"ESC","c":["ESC2.6"],"d":"Processus d'évaluation des impacts environnementaux des prospects organisationnels et des projets envisagés","ty":"Processus","di":"Non précisé","y":0,"sz":["individuelle","micro","petite","moyenne","grande","xl","xxl"],"se":["services_faible"],"ct":"Évaluation des impacts négatifs potentiels de chaque projet et des clients organisationnels, avec mesures d'atténuation prévues","p":"136-151"},{"id":"d197","t":"ESC","c":["ESC2.6"],"d":"Compte rendu annuel de l'évaluation des trois prospects les plus matériels","ty":"Compte rendu ou procès-verbal","di":"Non précisé","y":0,"sz":["individuelle","micro","petite","moyenne","grande","xl","xxl"],"se":["services_faible"],"ct":"Méthode d'évaluation et résultats pour les trois prospects ou projets les plus matériels (chiffre d'affaires, heures ou importance de l'impact)","p":"147-148"},{"id":"d198","t":"ESC","c":["ESC2.6"],"d":"Registre des mesures d'atténuation et de leur efficacité pour les prospects et projets","ty":"Registre","di":"Non précisé","y":0,"sz":["individuelle","micro","petite","moyenne","grande","xl","xxl"],"se":["services_faible"],"ct":"Mesures d'atténuation mises en place en cas d'impacts identifiés et efficacité de ces mesures","p":"147"},{"id":"d199","t":"ESC","c":["ESC2.7"],"d":"Processus d'évaluation des impacts environnementaux des investissements futurs","ty":"Processus","di":"Non précisé","y":0,"sz":["individuelle","micro","petite","moyenne","grande","xl","xxl"],"se":["services_faible"],"ct":"Évaluation des impacts négatifs potentiels des investissements envisagés, avec mesures d'atténuation prévues","p":"152-157"},{"id":"d200","t":"ESC","c":["ESC2.7"],"d":"Compte rendu annuel de l'évaluation des trois investissements envisagés les plus matériels","ty":"Compte rendu ou procès-verbal","di":"Non précisé","y":0,"sz":["individuelle","micro","petite","moyenne","grande","xl","xxl"],"se":["services_faible"],"ct":"Méthode d'évaluation et résultats pour les trois investissements les plus matériels (valeur ou importance de l'impact)","p":"154-155"},{"id":"d201","t":"ESC","c":["ESC2.7"],"d":"Registre des mesures d'atténuation et de leur efficacité pour les investissements","ty":"Registre","di":"Non précisé","y":0,"sz":["individuelle","micro","petite","moyenne","grande","xl","xxl"],"se":["services_faible"],"ct":"Mesures d'atténuation mises en place en cas d'impacts identifiés et efficacité de ces mesures","p":"154"},{"id":"d202","t":"ESC","c":["ESC3.1"],"d":"Vue d'ensemble annuelle des indicateurs d'approvisionnement en matériaux","ty":"Inventaire","di":"Non précisé","y":0,"sz":["grande","xl","xxl"],"se":["services_forte","fabrication","vente","agriculture"],"ct":"Par produits et par emballages, en tonnes, poids total des matériaux, matériaux renouvelables de sources durables vérifiées par des tiers, matériaux réemployés ou recyclés, en poids et en pourcentage","p":"158-165"},{"id":"d203","t":"ESC","c":["ESC3.1"],"d":"Vérification par un tiers ou certification des matériaux renouvelables de sources durables","ty":"Autre","di":"Non précisé","y":0,"sz":["grande","xl","xxl"],"se":["services_forte","fabrication","vente","agriculture"],"ct":"Confirmation que les matériaux renouvelables intrants ont été produits de manière durable","p":"163"},{"id":"d204","t":"ESC","c":["ESC3.3","ESC3.3a","ESC3.3b","ESC3.3c"],"d":"Indicateurs de circularité du portefeuille de produits et d'emballages","ty":"Rapport","di":"Non précisé","y":3,"sz":["petite","moyenne","grande","xl","xxl"],"se":["services_forte","fabrication","vente","agriculture"],"ct":"Option de circularité retenue ; pourcentages en poids selon l'option (usage unique et réduction obtenue, conception pour durabilité, réparabilité ou réemploi, conception pour désassemblage, reconditionnement ou remise à neuf) ; pourcentage du portefeuille hors options ; informations sur les tests de durabilité et la conception réparable ou réemployable","p":"171-203"},{"id":"d205","t":"ESC","c":["ESC3.3d"],"d":"Indicateurs de recyclabilité en fin de vie et explication des pratiques courantes","ty":"Rapport","di":"Non précisé","y":3,"sz":["petite","grande","xl","xxl"],"se":["services_forte","fabrication","vente","agriculture"],"ct":"Pourcentages en poids des produits et des emballages conçus pour le recyclage ou le cycle biologique ; définition des pratiques courantes et démonstration du dépassement","p":"204-210"},{"id":"d206","t":"ESC","c":["ESC3.3d"],"d":"Indicateurs de recyclabilité en fin de vie et explication des pratiques courantes","ty":"Rapport","di":"Non précisé","y":3,"sz":["moyenne"],"se":["services_forte","vente","agriculture"],"ct":"Pourcentages en poids des produits et des emballages conçus pour le recyclage ou le cycle biologique ; définition des pratiques courantes et démonstration du dépassement","p":"204-210"},{"id":"d207","t":"ESC","c":["ESC3.4"],"d":"Analyse des infrastructures de revalorisation et document de méthodologie","ty":"Évaluation ou analyse","di":"Non précisé","y":0,"sz":["xl","xxl"],"se":["services_forte","fabrication","vente","agriculture"],"ct":"Tous les produits et emballages matériels ; au moins 25 % des pays de vente ; recherches documentaires ou consultation des parties prenantes ; difficultés par pays ; document résumant la méthodologie ; portée élargie à chaque mise à jour","p":"211-214"},{"id":"d208","t":"ESC","c":["ESC3.5"],"d":"Liste des actions ou programmes d'amélioration de l'infrastructure de revalorisation","ty":"Liste","di":"Non précisé","y":3,"sz":["xl","xxl"],"se":["services_forte","fabrication","vente","agriculture"],"ct":"Actions ou programmes fondés sur l'analyse GEC3.4, déployés dans les deux pays aux ventes les plus importantes, puis étendus","p":"215-219"},{"id":"d209","t":"ESC","c":["ESC4.1"],"d":"Description des actions de prévention ou d'atténuation et de leurs résultats vérifiables","ty":"Rapport","di":"Non précisé","y":3,"sz":["grande","xl","xxl"],"se":["services_faible"],"ct":"Action liée aux activités ou à la chaîne de valeur et tout résultat vérifiable, avec données d'impact ou indicateurs","p":"220-231"},{"id":"d210","t":"ESC","c":["ESC4.1"],"d":"Description des actions de prévention ou d'atténuation et de leurs résultats vérifiables","ty":"Rapport","di":"Non précisé","y":3,"sz":["petite"],"se":["services_forte","fabrication","vente","agriculture"],"ct":"Action liée aux activités ou à la chaîne de valeur et tout résultat vérifiable, avec données d'impact ou indicateurs","p":"220-231"},{"id":"d211","t":"ESC","c":["ESC4.2"],"d":"Évaluation de l'efficacité de la stratégie environnementale","ty":"Évaluation ou analyse","di":"Direction","y":5,"sz":["moyenne","grande","xl","xxl"],"se":["services_forte","fabrication","vente","agriculture"],"ct":"Progrès par rapport aux objectifs et indicateurs ; priorité donnée à l'évitement et à la réduction ; en cas d'inefficacité, enseignements, changements envisagés et mise à jour de la stratégie ; objectifs pour la chaîne de valeur","p":"232-241"},{"id":"d212","t":"ESC","c":["ESC4.3"],"d":"Évaluation de l'efficacité du plan de transition pour la biodiversité","ty":"Évaluation ou analyse","di":"Direction","y":5,"sz":["xl","xxl"],"se":["services_forte","fabrication","vente","agriculture"],"ct":"Progrès par rapport aux objectifs et indicateurs ; alignement sur la hiérarchie des mesures d'atténuation ; en cas d'inefficacité, enseignements, changements envisagés et mise à jour ; ajout d'objectifs pour la chaîne de valeur","p":"242-247"},{"id":"d213","t":"ESC","c":["ESC4.3"],"d":"Évaluation de l'efficacité du plan de transition pour la biodiversité","ty":"Évaluation ou analyse","di":"Direction","y":5,"sz":["moyenne","grande"],"se":["fabrication","agriculture"],"ct":"Progrès par rapport aux objectifs et indicateurs ; alignement sur la hiérarchie des mesures d'atténuation ; en cas d'inefficacité, enseignements, changements envisagés et mise à jour ; ajout d'objectifs pour la chaîne de valeur","p":"242-247"},{"id":"d214","t":"ESC","c":["ESC4.4"],"d":"Évaluation de l'efficacité de la stratégie de gestion de l'eau","ty":"Évaluation ou analyse","di":"Direction","y":5,"sz":["grande","xl","xxl"],"se":["services_forte","fabrication","vente","agriculture"],"ct":"Progrès par rapport aux objectifs et indicateurs ; en cas d'inefficacité, enseignements, changements envisagés et mise à jour ; ajout d'objectifs pour la chaîne de valeur","p":"247-251"},{"id":"d215","t":"ESC","c":["ESC4.4"],"d":"Évaluation de l'efficacité de la stratégie de gestion de l'eau","ty":"Évaluation ou analyse","di":"Direction","y":5,"sz":["moyenne"],"se":["fabrication","agriculture"],"ct":"Progrès par rapport aux objectifs et indicateurs ; en cas d'inefficacité, enseignements, changements envisagés et mise à jour ; ajout d'objectifs pour la chaîne de valeur","p":"247-251"},{"id":"d216","t":"ESC","c":["ESC4.5"],"d":"Rapport public sur les stratégies environnementales et leur efficacité","ty":"Rapport","di":"Public","y":5,"sz":["xxl"],"se":["services_forte","fabrication","vente","agriculture"],"ct":"Stratégie environnementale, plan biodiversité et stratégie eau ; progrès sur objectifs et indicateurs ; méthode d'évaluation de l'efficacité ; en cas d'inefficacité, enseignements, changements envisagés et mises à jour","p":"252-254"},{"id":"d217","t":"ESC","c":["ESC5.1"],"d":"Prise en compte des impacts environnementaux dans les trois décisions d'achat les plus matérielles","ty":"Évaluation ou analyse","di":"Non précisé","y":0,"sz":["individuelle","micro","petite"],"se":"*","ct":"Identification des achats les plus matériels (dépenses, volume ou importance de l'impact) et prise en compte de leurs impacts environnementaux, y compris le bien-être animal, tous rangs de fournisseurs","p":"255-262"},{"id":"d218","t":"ESC","c":["ESC5.1"],"d":"Prise en compte des impacts environnementaux dans les trois décisions d'achat les plus matérielles","ty":"Évaluation ou analyse","di":"Non précisé","y":0,"sz":["moyenne"],"se":["services_faible","services_forte"],"ct":"Identification des achats les plus matériels (dépenses, volume ou importance de l'impact) et prise en compte de leurs impacts environnementaux, y compris le bien-être animal, tous rangs de fournisseurs","p":"255-262"},{"id":"d219","t":"ESC","c":["ESC5.2"],"d":"Prise en compte des impacts environnementaux dans les cinq décisions d'achat les plus matérielles","ty":"Évaluation ou analyse","di":"Non précisé","y":0,"sz":["grande","xl","xxl"],"se":["services_faible"],"ct":"Identification des achats les plus matériels (dépenses, volume ou importance de l'impact) et prise en compte de leurs impacts environnementaux, y compris le bien-être animal, tous rangs de fournisseurs","p":"263-270"},{"id":"d220","t":"ESC","c":["ESC5.2"],"d":"Prise en compte des impacts environnementaux dans les cinq décisions d'achat les plus matérielles","ty":"Évaluation ou analyse","di":"Non précisé","y":0,"sz":["moyenne"],"se":["fabrication","vente","agriculture"],"ct":"Identification des achats les plus matériels (dépenses, volume ou importance de l'impact) et prise en compte de leurs impacts environnementaux, y compris le bien-être animal, tous rangs de fournisseurs","p":"263-270"},{"id":"d221","t":"ESC","c":["ESC5.3"],"d":"Liste des fournisseurs prioritaires et critères de hiérarchisation","ty":"Liste","di":"Non précisé","y":0,"sz":["grande","xl","xxl"],"se":["services_forte","fabrication","vente","agriculture"],"ct":"Fournisseurs de tous rangs priorisés selon leurs impacts environnementaux les plus matériels (GEC1.7) et critères retenus","p":"271-274"},{"id":"d222","t":"ESC","c":["ESC5.3"],"d":"Objectifs convenus avec chaque fournisseur prioritaire et suivi des progrès","ty":"Plan","di":"Parties prenantes","y":0,"sz":["grande","xl","xxl"],"se":["services_forte","fabrication","vente","agriculture"],"ct":"Objectifs de prévention ou d'atténuation convenus avec chaque fournisseur et suivi des progrès","p":"273"},{"id":"d223","t":"ESC","c":["ESC5.3"],"d":"Registre des mesures de prévention et d'atténuation chez les fournisseurs et de leurs résultats","ty":"Registre","di":"Non précisé","y":0,"sz":["grande","xl","xxl"],"se":["services_forte","fabrication","vente","agriculture"],"ct":"Mesures spécifiques mises en place avec les fournisseurs prioritaires et résultats obtenus","p":"273"},{"id":"d224","t":"ESC","c":["ESC5.4"],"d":"Plan de traçabilité des matières premières à haut risque, défini dans le temps","ty":"Plan","di":"Non précisé","y":3,"sz":["xl","xxl"],"se":["fabrication","vente","agriculture"],"ct":"Traçabilité et cartographie complète de la chaîne d'approvisionnement, tous rangs et tous matériaux à haut risque identifiés en GEC1.7","p":"279-284"},{"id":"d225","t":"ESC","c":["ESC5.4"],"d":"Calcul documenté de la proportion de matières premières à haut risque d'origine traçable","ty":"Registre","di":"Non précisé","y":3,"sz":["xl","xxl"],"se":["fabrication","vente","agriculture"],"ct":"Volume de matières à haut risque d'origine connue rapporté au volume total utilisé","p":"280-281"},{"id":"d226","t":"ESC","c":["ESC5.5"],"d":"Évaluation des matières premières prioritaires liées à la déforestation","ty":"Évaluation ou analyse","di":"Non précisé","y":3,"sz":["xl","xxl"],"se":["fabrication","vente","agriculture"],"ct":"Au minimum élevage bovin, cacao, café, huile de palme, caoutchouc, soja et bois","p":"285-289"},{"id":"d227","t":"ESC","c":["ESC5.5"],"d":"Preuves d'absence de déforestation et de conformité légale des matières premières","ty":"Autre","di":"Non précisé","y":3,"sz":["xl","xxl"],"se":["fabrication","vente","agriculture"],"ct":"Géolocalisation vérifiable, certification avec traçabilité géolocalisée (bilan massique exclu) ou liste approuvée de pays à faible risque ; conformité à la législation du pays de production","p":"286-287"},{"id":"d228","t":"ESC","c":["ESC5.7"],"d":"Plan d'action avec objectifs pour les fournisseurs prioritaires de matières à haut risque","ty":"Plan","di":"Parties prenantes","y":5,"sz":["xl","xxl"],"se":["fabrication","vente","agriculture"],"ct":"Objectifs de prévention et d'atténuation, conformes au plan GEC5.4 et aux mesures GEC5.6","p":"296-302"},{"id":"d229","t":"ESC","c":["ESC5.7"],"d":"Recensement des mesures d'atténuation et de prévention chez les fournisseurs et de leurs résultats","ty":"Registre","di":"Non précisé","y":5,"sz":["xl","xxl"],"se":["fabrication","vente","agriculture"],"ct":"Mesures spécifiques mises en place pour les matières à haut risque et résultats obtenus","p":"297"},{"id":"d230","t":"GACA","c":["GACA1.1"],"d":"Politique de lobbying responsable","ty":"Politique","di":"Public","y":0,"sz":["individuelle","micro","petite","moyenne","grande","xl","xxl"],"se":"*","ct":"Engagement à un lobbying à impact positif ; approche fondée sur des données fiables ou scientifiques ; politique de contributions politiques financières et en nature ; lutte contre la corruption et les pots-de-vin ; approche envers les organisations intermédiaires et contrôles de cohérence ; instance qui examine et approuve la politique et fréquence ; instance ou poste responsable de l'application ; intégration et mise en pratique ; gestion des risques de non-conformité ; évaluation du cadre de gouvernance et de contrôle ; moyens pour les parties prenantes de faire part de préoccupations, avec renvoi à la procédure de réclamation (MGPP3)","p":"13-17"},{"id":"d231","t":"GACA","c":["GACA1.1"],"d":"Déclaration publique d'absence d'activités de lobbying","ty":"Déclaration","di":"Public","y":0,"sz":["individuelle","micro","petite","moyenne","grande","xl","xxl"],"se":"*","ct":"Déclaration que l'entreprise ne poursuit pas d'activités de lobbying","p":"14"},{"id":"d232","t":"GACA","c":["GACA1.1"],"d":"Publication de la position face aux organisations intermédiaires divergentes","ty":"Déclaration","di":"Public","y":0,"sz":["individuelle","micro","petite","moyenne","grande","xl","xxl"],"se":"*","ct":"Position de l'entreprise par rapport à celle de l'organisation intermédiaire ; manière dont elle influence positivement cette position ; lignes rouges entraînant la fin de la collaboration","p":"16"},{"id":"d233","t":"GACA","c":["GACA1.2"],"d":"Rapport public annuel sur les positions de lobbying et les contributions politiques","ty":"Rapport","di":"Public","y":0,"sz":["grande","xl","xxl"],"se":"*","ct":"Valeur et bénéficiaires des contributions politiques financières et en nature ; résumé des positions matérielles de lobbying (standards B Lab, enjeux matériels, organisations intermédiaires où l'entreprise joue un rôle significatif) et bénéficiaires ou organisations intermédiaires concernés ; en cas de divergence avec une organisation intermédiaire, position, influence exercée et lignes rouges","p":"19-22"},{"id":"d234","t":"GACA","c":["GACA1.3"],"d":"Rapport public annuel sur les positions de lobbying et les contributions politiques","ty":"Rapport","di":"Public","y":3,"sz":["individuelle","micro","petite","moyenne"],"se":"*","ct":"Valeur et bénéficiaires des contributions politiques financières et en nature ; résumé des positions matérielles de lobbying (standards B Lab, enjeux matériels, organisations intermédiaires où l'entreprise joue un rôle significatif) et destinataires ou organisations intermédiaires concernés ; en cas de divergence avec une organisation intermédiaire, position, influence exercée et lignes rouges","p":"24-27"},{"id":"d235","t":"GACA","c":["GACA2.1a"],"d":"Confirmation du résultat positif par le bénéficiaire du mentorat","ty":"Autre","di":"Non précisé","y":0,"sz":["individuelle","micro","petite"],"se":"*","ct":"Résultat positif manifeste du mentorat confirmé par le bénéficiaire","p":"36-38"},{"id":"d236","t":"GACA","c":["GACA2.3a"],"d":"Confirmation du résultat positif par le bénéficiaire du mentorat","ty":"Autre","di":"Non précisé","y":0,"sz":["moyenne","grande","xl","xxl"],"se":"*","ct":"Résultat positif manifeste du mentorat confirmé par le bénéficiaire","p":"66-68"},{"id":"d237","t":"GACA","c":["GACA2.3a"],"d":"Programme structuré de mentorat ciblant un groupe spécifique","ty":"Plan","di":"Non précisé","y":0,"sz":["moyenne","grande","xl","xxl"],"se":"*","ct":"Groupe ciblé, calendrier, objectifs et livrables définis, objectif clair de renforcement de l'impact du bénéficiaire","p":"66-67"},{"id":"d238","t":"GACA","c":["GACA2.3b"],"d":"Suivi des résultats de la recherche externe","ty":"Processus","di":"Non précisé","y":0,"sz":["moyenne","grande","xl","xxl"],"se":"*","ct":"Suivi de la progression de la recherche vers le résultat escompté","p":"70-71"},{"id":"d239","t":"GACA","c":["GACA3.1"],"d":"Politique de fiscalité responsable","ty":"Politique","di":"Public","y":0,"sz":["xxl"],"se":"*","ct":"Lien avec la stratégie commerciale et de développement durable ; approche de la conformité réglementaire ; instance ou poste qui examine et approuve la politique et fréquence ; instance ou poste responsable de l'application ; intégration et mise en œuvre ; gestion des risques de non-conformité ; évaluation du cadre de gouvernance et de contrôle ; moyens pour les parties prenantes de faire part de préoccupations, avec renvoi à la procédure de réclamation (MGPP3) ; processus de vérification des déclarations fiscales publiques et lien vers une vérification externe le cas échéant ; relations avec les autorités fiscales ; plaidoyer en matière de politique fiscale ; recueil des avis des parties prenantes","p":"89-92"},{"id":"d240","t":"GACA","c":["GACA3.2"],"d":"Rapport public pays par pays","ty":"Rapport","di":"Public","y":3,"sz":["xxl"],"se":"*","ct":"Toutes les juridictions de résidence fiscale ; pour chacune, entités résidentes, activités principales, effectif et mode de calcul, recettes de tiers et intragroupe, bénéfice ou perte avant impôt, actifs corporels, impôt sur le revenu payé et accumulé, explication des écarts avec l'impôt dû ; période couverte","p":"94-96"}];

// ----- Documents attendus : calcul et statuts -------------------------------
// Statut de départ déduit de la réponse à la question liée (même sous-exigence).
// Le consultant peut ajuster chaque statut ; l'ajustement est enregistré.
const DOC_STATUS = {
  existant: { label: "Existant", color: "#2F7A47", bg: "rgba(56,141,84,0.12)" },
  a_formaliser: { label: "À formaliser", color: "#9A6200", bg: "rgba(245,158,11,0.14)" },
  a_produire: { label: "À produire", color: "#B42323", bg: "rgba(220,38,38,0.10)" },
  a_verifier: { label: "À vérifier", color: "#4A5552", bg: "rgba(15,31,31,0.06)" },
  a_anticiper: { label: "À anticiper", color: "#7C2D52", bg: "rgba(124,45,82,0.08)" },
  sans_objet: { label: "Sans objet", color: "#8A9490", bg: "rgba(15,31,31,0.03)" },
  demarche: { label: "Démarche B Lab", color: "#2C5F8A", bg: "rgba(69,131,212,0.10)" },
};
const DOC_STATUS_CYCLE = ["existant", "a_formaliser", "a_produire", "a_verifier", "sans_objet"];
// Sélection KiAct : cas particuliers masqués par défaut, conditions et alternatives
// signalées. Lorsque le standard offre plusieurs voies, la plus courante est affichée.
// Chaque note s'appuie sur le critère cité dans l'inventaire (fichiers BLab_V2.2_*.md).
const DOC_CURATION = {
  d1: { demarche: "Envoyé par B Lab pour signature électronique en fin de processus." },
  d2: { demarche: "Signée avec l'accord de certification, en fin de processus." },
  d5: { demarche: "Complété sur la plateforme B Impact pendant la démarche." },
  d6: { demarche: "Saisi sur la plateforme B Impact, publié après la certification." },
  d9: { demarche: "Constituée au fil de la démarche, par les documents et preuves de la liste." },
  d10: { demarche: "Complété sur la plateforme B Impact lors de la configuration." },
  d4: { special: "Société cotée seulement, si la loi ne permet pas encore d'adopter la gouvernance des parties prenantes (FR2.1)." },
  d7: { special: "Filiale détenue à 100 %, filiale d'un groupe de plus de 1 milliard USD ou société cotée seulement (FR1.5)." },
  d8: { special: "Seulement si l'entreprise soumise à la publication intégrale souhaite en retirer des éléments (FR1.5)." },
  d12: { cond: "Seulement si la raison d'être ne précise pas sa pertinence ni son intégration dans la stratégie (1.1.1 b)." },
  d50: { cond: "Seulement si l'entreprise recourt à des horaires variables." },
  d60: { cond: "Option a. Les autres options sont une convention collective (b) ou un plan de réduction de l'écart (c)." },
  d61: { special: "Option b de FW2.8, à la place de l'option a." },
  d62: { special: "Option c de FW2.8, à la place de l'option a." },
  d63: { special: "Option c de FW2.8, à la place de l'option a." },
  d64: { special: "Critère au choix de l'option c de FW2.8." },
  d65: { special: "Critère au choix de l'option c de FW2.8." },
  d66: { special: "Critère au choix de l'option c de FW2.8." },
  d74: { special: "Seulement si l'entreprise organise des ateliers ou discussions de groupe (FW4.1)." },
  d78: { cond: "Entre 11 et 49 personnes en effectif. Une enquête JEDI peut la remplacer (1.1.1). Seuil appliqué aux ETP, à ajuster si l'effectif en personnes diffère.", fteMax: 50 },
  d79: { special: "Alternative à la discussion JEDI (1.1.1)." },
  d80: { cond: "Dès 50 personnes en effectif (1.1.3). Seuil appliqué aux ETP, à ajuster si l'effectif en personnes diffère.", fteMin: 50 },
  d117: { special: "Seulement si la stratégie se révèle inefficace (HR2.4)." },
  d125: { y: 3 }, d128: { y: 3 }, d198: { y: 3 }, d201: { y: 3 },
  d132: { special: "Seulement en cas d'activités liées à une zone de conflit (HR3.6)." },
  d133: { special: "Seulement si l'évaluation révèle un impact négatif possible en zone de conflit (HR3.6)." },
  d171: { special: "Seulement si le plan d'action climatique s'est révélé inefficace (3.3.3)." },
  d184: { special: "Seulement en cas d'élevage, de transport ou d'abattage d'animaux par l'entreprise (ESC1.6)." },
  d185: { special: "Seulement en cas d'élevage, de transport ou d'abattage d'animaux par l'entreprise (ESC1.6)." },
  d187: { cond: "Seulement si l'eau, la biodiversité ou un autre thème listé est jugé non matériel (1.7.4)." },
  d191: { cond: "Seulement si les impacts sur la biodiversité sont matériels (ESC1.7)." },
  d193: { cond: "Seulement si les impacts liés à l'eau sont matériels (ESC1.7)." },
  d213: { cond: "Seulement si la biodiversité est matérielle (ESC1.7)." },
  d215: { cond: "Seulement si l'eau est matérielle (ESC1.7)." },
  d230: { special: "Seulement si l'entreprise fait du lobbying. Sinon, la déclaration d'absence de lobbying suffit (1.1.1)." },
  d231: { cond: "Voie la plus simple si l'entreprise ne fait pas de lobbying. Sinon, politique de lobbying responsable (1.1.2)." },
  d150: { d: "Évaluation des contrats de service au regard du salaire de subsistance, avec les écarts éventuels", cond: "Concerne les prestataires sans qualification formelle (nettoyage, sécurité, entretien, jardinage), et non le personnel propre. Sans objet si une convention collective s'applique (4.9.1). Les écarts éventuels sont consignés dans la même évaluation (4.9.2)." },
  d151: { special: "Intégré à l'évaluation des contrats de service (HR4.9)." },
  d232: { special: "Seulement si une organisation intermédiaire défend des positions contraires (GACA1.1)." },
};

const DOC_OPTION_RE = /^(JEDI2\.[a-s]|GACA2\.[13][a-e])$/;
const GACA_OPTION_BY_LETTER = { a: "mentorat", b: "recherche", c: "collaboration", d: "plaidoyer", e: "leadership" };
const ANSWER_TO_DOC_STATUS = { fait_doc: "existant", oui: "existant", fait_seul: "a_formaliser", partiel: "a_formaliser", non: "a_produire" };
const DOC_STATUS_RANK = { a_produire: 0, a_formaliser: 1, a_verifier: 2, existant: 3 };

// Supports communs : plusieurs documents peuvent tenir dans un même support.
// « Standard » signale une intégration admise expressément par B Lab, « KiAct » une suggestion de regroupement.
const DOC_SUPPORTS = [
  { id: "reglement", label: "Règlement du personnel", basis: "KiAct", note: "Conditions de travail applicables à toutes les personnes salariées. FW1.2 et JEDI2.k admettent un manuel ou règlement du personnel.",
    docs: ["d50", "d52", "d99"] },
  { id: "rh", label: "Politique RH", basis: "KiAct", note: "Principes de recrutement, de développement et de dialogue avec le personnel. Les exigences visent une règle écrite, sans imposer un document distinct.",
    docs: ["d51", "d70", "d92", "d94", "d95"] },
  { id: "code", label: "Code de conduite ou charte éthique", basis: "Standard", note: "PSG4.2 et GACA1.1 admettent expressément une politique intégrée à un autre document, par exemple un code de conduite.",
    docs: ["d37", "d38", "d86", "d107", "d108", "d110", "d230", "d231"] },
  { id: "reclamation", label: "Dispositif de réclamation", basis: "KiAct", note: "Une procédure unique peut décrire le canal, les étapes, le registre, le résumé annuel et la personne responsable.",
    docs: ["d24", "d25", "d26", "d27", "d28", "d29"] },
  { id: "achats", label: "Analyse annuelle des principales décisions d'achat", basis: "Standard", note: "HR4.2, HR4.3, ESC5.1 et ESC5.2 admettent un processus combiné, social et environnemental.",
    docs: ["d136", "d137", "d139", "d217", "d218", "d220"] },
  { id: "clients", label: "Évaluation des clients et des projets", basis: "KiAct", note: "HR3.3 et ESC2.6 portent sur les mêmes clients et projets. Une seule grille peut couvrir les deux.",
    docs: ["d123", "d124", "d125", "d196", "d197", "d198", "d126", "d127", "d128", "d199", "d200", "d201"] },
  { id: "enquete", label: "Enquête annuelle auprès du personnel", basis: "Standard", note: "JEDI1.1 admet l'enquête de FW4. PSG6.3 peut aussi y être combinée.",
    docs: ["d72", "d73", "d74", "d79", "d80"] },
  { id: "environnement", label: "Tableau de suivi environnemental", basis: "KiAct", note: "Déchets, énergie et eau peuvent être suivis dans un même tableau annuel.",
    docs: ["d178", "d179", "d180", "d181", "d182"] },
  { id: "impacts", label: "Évaluation des impacts sociaux et environnementaux", basis: "KiAct", note: "HR2.1 et ESC1.7 peuvent s'appuyer sur une même démarche d'analyse.",
    docs: ["d112", "d186", "d187"] },
  { id: "publication", label: "Page B Corp du site ou rapport de durabilité", basis: "Standard", note: "CA2.1, CA3.6, GACA1.2 et GACA1.3 admettent une publication dans un rapport annuel ou un autre rapport public.",
    docs: ["d11", "d160", "d176", "d102", "d114", "d154", "d188", "d234", "d65", "d90", "d132"] },
  { id: "instance", label: "Procès-verbal annuel de la plus haute instance", basis: "KiAct", note: "L'examen annuel PSG5.1 et les approbations exigées (raison d'être, plan climat, politiques) peuvent figurer dans le même procès-verbal.",
    docs: ["d39"] },
];
const DOC_SUPPORT_OF = Object.fromEntries(DOC_SUPPORTS.flatMap((sp) => sp.docs.map((id) => [id, sp.id])));

const optionSelected = (code, jediAnswers, gacaAnswers) => {
  if (code.startsWith("JEDI2.")) return (jediAnswers || {})[code] === "done";
  const letter = code.slice(-1);
  return (gacaAnswers || {})[GACA_OPTION_BY_LETTER[letter]] === "done";
};

const computeDocuments = (ctx, answers, jediAnswers, gacaAnswers, docStatus, showSpecial = false) => {
  if (!ctx || !ctx.size || !ctx.sector) return [];
  const req = ctx.req || computeRequirements(ctx, null);
  const inScope = (c) => (req.base.has(c) || req.triggered[c]) && !req.replaced[c];
  const questions = TOPICS.flatMap((t) => t.questions.filter((q) => matches(q, ctx)));
  return DOCS_REQUIS.map((doc) => ({ ...doc, ...(DOC_CURATION[doc.id] || {}) })).filter((doc) => {
    if (doc.special && !showSpecial) return false;
    const isOption = doc.c.every((c) => DOC_OPTION_RE.test(c));
    const triggered = doc.c.some((c) => req.triggered[c]);
    if (!triggered && !doc.sz.includes(ctx.size)) return false;
    if (!triggered && doc.se !== "*" && !doc.se.includes(ctx.sector)) return false;
    if (isOption) return doc.c.some((c) => optionSelected(c, jediAnswers, gacaAnswers));
    const known = doc.c.filter((c) => BLAB_SUBREQS[c]);
    if (known.length > 0 && !known.some(inScope)) return false;
    return true;
  }).map((doc) => {
    const isOption = doc.c.every((c) => DOC_OPTION_RE.test(c));
    const linked = questions.filter((q) => q.codes && q.codes.some((c) => doc.c.includes(c) || (isOption && c.startsWith(doc.c[0].slice(0, 5)))));
    let auto;
    if (doc.demarche) auto = "demarche";
    else if (doc.y > 0) auto = "a_anticiper";
    // Une action cochée comme réalisée ne prouve pas l'existence du document
    else if (isOption) auto = "a_verifier";
    else {
      const statuses = linked.map((q) => ANSWER_TO_DOC_STATUS[answers[q.id]] || "a_verifier");
      auto = statuses.length ? statuses.sort((a, b) => DOC_STATUS_RANK[a] - DOC_STATUS_RANK[b])[0] : "a_verifier";
    }
    // Seuils d'effectif (JEDI1.1). L'outil ne connaît que les ETP, inférieurs ou égaux
    // à l'effectif en personnes. Le statut reste ajustable si l'effectif réel diffère.
    const fte = parseFloat(String(ctx.ftes || "").replace(",", "."));
    if (!Number.isNaN(fte) && doc.y === 0 && !doc.demarche) {
      if (doc.fteMin && fte < doc.fteMin) auto = "sans_objet";
      if (doc.fteMax && fte >= doc.fteMax) auto = "sans_objet";
    }
    const manual = (docStatus || {})[doc.id];
    return { ...doc, status: manual || auto, auto, manual: !!manual, noQuestion: doc.y === 0 && !isOption && linked.length === 0 };
  });
};

const DocumentsSection = ({ docs, docStatus, setDocStatus, showSpecial, setShowSpecial }) => {
  const [period, setPeriod] = useState("y0");
  const [publicOnly, setPublicOnly] = useState(false);
  const [openTopics, setOpenTopics] = useState({});
  const [view, setView] = useState("theme");
  const toggleTopic = (id) => setOpenTopics({ ...openTopics, [id]: !openTopics[id] });
  const y0 = docs.filter((d) => d.y === 0);
  const later = docs.filter((d) => d.y > 0);
  const shown = (period === "y0" ? y0 : later).filter((d) => !publicOnly || d.di.includes("Public"));
  const count = (s) => y0.filter((d) => d.status === s).length;
  const nDemarche = count("demarche");
  const total = (y0.length - count("sans_objet") - nDemarche) || 1;
  const counters = ["existant", "a_formaliser", "a_produire", "a_verifier"].map((s) => ({ s, n: count(s) }));
  const nSansObjet = count("sans_objet");
  const tiles = nSansObjet > 0 ? [...counters, { s: "sans_objet", n: nSansObjet }] : counters;
  const coverage = Math.round((count("existant") / total) * 100);
  const cycle = (doc) => {
    if (doc.demarche) return;
    const order = doc.y > 0 ? ["a_anticiper", ...DOC_STATUS_CYCLE] : DOC_STATUS_CYCLE;
    const next = order[(order.indexOf(doc.status) + 1) % order.length];
    const nextMap = { ...(docStatus || {}) };
    if (next === doc.auto) delete nextMap[doc.id]; else nextMap[doc.id] = next;
    setDocStatus(nextMap);
  };
  const groups = view === "theme"
    ? TOPICS.map((t) => ({ key: t.id, label: t.short || t.name, color: t.color, items: shown.filter((d) => d.t === t.code) }))
    : [
        { key: "demarche", label: "Démarche B Lab", color: "#2C5F8A", note: "Éléments produits sur la plateforme ou fournis par B Lab pendant la certification.", items: shown.filter((d) => d.demarche) },
        ...DOC_SUPPORTS.map((sp) => ({ key: sp.id, label: sp.label, color: "#388D54", basis: sp.basis, note: sp.note, items: shown.filter((d) => !d.demarche && DOC_SUPPORT_OF[d.id] === sp.id) })),
        { key: "autres", label: "Autres documents", color: "#4A5552", items: shown.filter((d) => !d.demarche && !DOC_SUPPORT_OF[d.id]) },
      ];
  const byTopic = groups.filter((g) => g.items.length);
  const missingQuestion = y0.filter((d) => d.noQuestion);
  const btn = (active) => ({ fontSize: 12.5, padding: "6px 12px", borderRadius: 999, cursor: "pointer", border: active ? "1.5px solid #388D54" : "1px solid rgba(15,31,31,0.15)", background: active ? "rgba(56,141,84,0.08)" : "white", color: active ? "#2F7A47" : "#4A5552", fontWeight: active ? 700 : 500 });

  if (docs.length === 0) return null;
  return (
    <div className="kiact-card kiact-shadow" style={{ padding: 28, marginBottom: 24 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 20, color: "#388D54" }}>◆</span>
        <h3 className="kiact-display" style={{ fontSize: 22, fontWeight: 600 }}>Documents attendus</h3>
        <span style={{ fontSize: 11, color: "#388D54", letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 700, background: "rgba(56,141,84,0.08)", padding: "3px 10px", borderRadius: 999 }}>
          Couverture Année 0 · {coverage} %
        </span>
      </div>
      <p style={{ fontSize: 13, color: "#4A5552", marginBottom: 16, lineHeight: 1.5 }}>
        Politiques, procédures, plans, registres et publications exigés par les standards pour cette entreprise. Le statut découle des réponses.
        Ouvrez une thématique pour voir le détail. Cliquez sur un statut pour l'ajuster.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10, marginBottom: 12 }}>
        {tiles.map(({ s, n }) => (
          <div key={s} style={{ background: DOC_STATUS[s].bg, borderRadius: 10, padding: "10px 14px", border: s === "sans_objet" ? "1px dashed rgba(15,31,31,0.15)" : "none" }}>
            <div style={{ fontSize: 12, color: DOC_STATUS[s].color, fontWeight: 600 }}>{DOC_STATUS[s].label}</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: DOC_STATUS[s].color }}>{n}</div>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 12, color: "#6B7670", marginBottom: 6 }}>
        Année 0, {y0.length} document{y0.length > 1 ? "s" : ""}
        {nDemarche > 0 ? `, dont ${nDemarche} élément${nDemarche > 1 ? "s" : ""} de la démarche B Lab` : ""}
        {nSansObjet > 0 ? `${nDemarche > 0 ? " et" : ", dont"} ${nSansObjet} sans objet` : ""}
        {(nDemarche + nSansObjet) > 0 ? ", non comptés dans la couverture" : ""}.
      </div>
      <div style={{ height: 10, borderRadius: 5, overflow: "hidden", display: "flex", marginBottom: 16, background: "rgba(15,31,31,0.05)" }}>
        {counters.map(({ s, n }) => n > 0 && <div key={s} style={{ width: `${(n / total) * 100}%`, background: DOC_STATUS[s].color, opacity: 0.85 }} />)}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
        <button onClick={() => setView(view === "theme" ? "support" : "theme")} style={btn(view === "support")} title="Regrouper les documents qui peuvent tenir dans un même support">{view === "theme" ? "Grouper par support" : "Grouper par thématique"}</button>
        <button onClick={() => setPeriod("y0")} style={btn(period === "y0")}>Année 0 ({y0.length})</button>
        <button onClick={() => setPeriod("later")} style={btn(period === "later")}>Années 3 et 5 ({later.length})</button>
        <button onClick={() => setPublicOnly(!publicOnly)} style={btn(publicOnly)}>Publics seulement</button>
        <button onClick={() => setShowSpecial(!showSpecial)} style={btn(showSpecial)} title="Documents exigés seulement dans des situations particulières ou options alternatives">Cas particuliers</button>
      </div>
      {missingQuestion.length > 0 && (
        <div style={{ fontSize: 12.5, color: "#9A6200", background: "rgba(245,158,11,0.08)", borderRadius: 8, padding: "8px 12px", margin: "8px 0" }}>
          {missingQuestion.length} document{missingQuestion.length > 1 ? "s" : ""} sans question liée dans le questionnaire. Statut à vérifier en entretien.
        </div>
      )}
      {byTopic.map(({ key, label, color, note, basis, items }) => (
        <div key={key} style={{ marginTop: 10 }}>
          <button onClick={() => toggleTopic(key)} style={{ width: "100%", display: "grid", gridTemplateColumns: "18px minmax(0,1fr) auto", gap: 8, alignItems: "center", background: "rgba(15,31,31,0.025)", border: "none", borderRadius: 8, padding: "8px 10px", cursor: "pointer", textAlign: "left" }}>
            <span style={{ color: "#6B7670", fontSize: 12 }}>{openTopics[key] ? "▾" : "▸"}</span>
            <span style={{ fontSize: 13, fontWeight: 700, color }}>{label} <span style={{ fontWeight: 500, color: "#6B7670" }}>· {items.length} document{items.length > 1 ? "s" : ""}{basis ? ` · regroupement ${basis === "Standard" ? "admis par le standard" : "suggéré par KiAct"}` : ""}</span></span>
            <span style={{ display: "flex", gap: 4 }}>
              {["existant", "a_formaliser", "a_produire", "a_verifier", "a_anticiper", "demarche"].map((st) => {
                const n = items.filter((d) => d.status === st).length;
                return n > 0 && <span key={st} style={{ fontSize: 11.5, fontWeight: 700, color: DOC_STATUS[st].color, background: DOC_STATUS[st].bg, borderRadius: 999, padding: "2px 8px" }}>{n} {st === "demarche" ? "démarche B Lab" : DOC_STATUS[st].label.toLowerCase()}</span>;
              })}
            </span>
          </button>
          {openTopics[key] && note && <div style={{ fontSize: 12, color: "#4A5552", fontStyle: "italic", padding: "6px 10px" }}>{note}</div>}
          {openTopics[key] && items.map((d) => (
            <div key={d.id} style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 130px 120px 110px", gap: 10, alignItems: "center", padding: "8px 0", borderTop: "1px solid rgba(15,31,31,0.07)", fontSize: 13 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ color: d.status === "sans_objet" ? "#8A9490" : "#0f1f1f", textDecoration: d.status === "sans_objet" ? "line-through" : "none" }}>{d.d}</div>
                {(d.cond || d.special || d.demarche) && <div style={{ fontSize: 11.5, color: d.demarche ? "#2C5F8A" : "#9A6200", fontStyle: "italic" }}>{d.demarche || d.cond || d.special}</div>}
                <div style={{ fontSize: 11.5, color: "#6B7670" }}>{d.c.join(", ")}{d.y > 0 ? ` · Année ${d.y}` : ""} · p. {d.p}</div>
              </div>
              <span style={{ fontSize: 12, color: "#4A5552" }}>{d.ty}</span>
              <span style={{ fontSize: 11.5, color: "#4A5552", border: "1px solid rgba(15,31,31,0.15)", borderRadius: 6, padding: "2px 6px", justifySelf: "start" }}>{d.di}</span>
              <button onClick={() => cycle(d)} title={d.demarche ? "Élément de la démarche B Lab, non compté dans la couverture." : d.manual ? "Statut ajusté. Cliquez pour changer." : "Statut calculé. Cliquez pour ajuster."}
                style={{ fontSize: 12, fontWeight: 600, padding: "4px 8px", borderRadius: 999, border: d.manual ? `1.5px dashed ${DOC_STATUS[d.status].color}` : "none", background: DOC_STATUS[d.status].bg, color: DOC_STATUS[d.status].color, cursor: "pointer" }}>
                {DOC_STATUS[d.status].label}
              </button>
            </div>
          ))}
        </div>
      ))}
      <div style={{ fontSize: 11.5, color: "#6B7670", marginTop: 14, lineHeight: 1.5 }}>
        Source, standards B Lab V2.2 du 20 février 2026. Les documents seulement recommandés par B Lab ne figurent pas dans la liste.
        Les options JEDI2 et GACA2 n'apparaissent que si elles ont été retenues dans les menus. Leur statut part de « À vérifier » tant que la preuve n'est pas vue. Lorsque le standard offre plusieurs voies, la plus courante est affichée (sélection KiAct) et les autres figurent sous « Cas particuliers ». Un statut ajusté est entouré de pointillés. Un même support peut réunir plusieurs documents, par exemple un règlement du personnel. Le bouton « Grouper par support » montre ces regroupements.
      </div>
    </div>
  );
};

// ----- Taux de pratiques et de documents ------------------------------------
// Les questions applicables sans réponse, ou avec la réponse « ne sait pas », comptent comme non satisfaites
// et ne sont pas comptées comme évaluées. Seules les réponses « non applicable » sortent du dénominateur.
const computePracticeRates = (ctx, answers) => {
  const topics = TOPICS.map((t) => {
    const applicable = t.questions.filter((q) => matches(q, ctx));
    const na = applicable.filter((q) => answers[q.id] === "na").length;
    const denom = applicable.length - na;
    const valued = applicable.filter((q) => answers[q.id] && answers[q.id] !== "na");
    const points = valued.reduce((acc, q) => acc + (getAnswerOpt(q, answers[q.id])?.value ?? 0), 0);
    const answered = valued.filter((q) => answers[q.id] !== "ns").length;
    return { code: t.code, denom, answered, points, pct: denom ? Math.round((points / denom) * 100) : null };
  });
  const valid = topics.filter((x) => x.pct !== null);
  const sumDenom = valid.reduce((a, x) => a + x.denom, 0);
  const sumPoints = valid.reduce((a, x) => a + x.points, 0);
  return {
    topics,
    avg: valid.length ? Math.round(valid.reduce((a, x) => a + x.pct, 0) / valid.length) : null,
    cumul: sumDenom ? Math.round((sumPoints / sumDenom) * 100) : null,
    answered: valid.reduce((a, x) => a + x.answered, 0),
    total: sumDenom,
  };
};

const computeDocRates = (docs) => {
  const counted = docs.filter((d) => d.y === 0 && d.status !== "sans_objet" && d.status !== "demarche");
  const topics = TOPICS.map((t) => {
    const c = counted.filter((d) => d.t === t.code);
    const ok = c.filter((d) => d.status === "existant").length;
    return { code: t.code, total: c.length, ok, pct: c.length ? Math.round((ok / c.length) * 100) : null };
  });
  const valid = topics.filter((x) => x.pct !== null);
  const ok = counted.filter((d) => d.status === "existant").length;
  return {
    topics,
    ok,
    total: counted.length,
    cumul: counted.length ? Math.round((ok / counted.length) * 100) : null,
    avg: valid.length ? Math.round(valid.reduce((a, x) => a + x.pct, 0) / valid.length) : null,
  };
};

// Repères KiAct, sans équivalent chez B Lab (V2 n'a ni score ni seuil minimal)
const rateState = (answered, p, d) => {
  if (!answered && (d === null || d === 0)) return { l: "Non évalué", c: "#4A5552", bg: "rgba(15,31,31,0.06)" };
  const vals = [p, d].filter((v) => v !== null);
  const m = vals.length ? Math.min(...vals) : 0;
  if (m >= 100) return { l: "Prêt", c: "#2F7A47", bg: "rgba(56,141,84,0.12)" };
  if (m >= 60) return { l: "Proche", c: "#9A6200", bg: "rgba(245,158,11,0.14)" };
  return { l: "Chantier", c: "#B42323", bg: "rgba(220,38,38,0.10)" };
};

const RateRing = ({ label, color, avg, lines }) => {
  const C = 2 * Math.PI * 60;
  const v = avg === null ? 0 : avg;
  return (
    <div style={{ textAlign: "center" }}>
      <svg viewBox="0 0 150 150" style={{ width: 150, maxWidth: "100%", height: "auto" }}>
        <circle cx="75" cy="75" r="60" fill="none" stroke="rgba(15,31,31,0.07)" strokeWidth="13" />
        <circle cx="75" cy="75" r="60" fill="none" stroke={color} strokeWidth="13" strokeLinecap="round"
          strokeDasharray={`${(v / 100) * C} ${C}`} transform="rotate(-90 75 75)" />
        <text x="75" y="84" textAnchor="middle" fontSize="30" fontWeight="700" fill="#0f1f1f">{avg === null ? "-" : `${avg} %`}</text>
      </svg>
      <div style={{ fontWeight: 700, fontSize: 14, marginTop: 4 }}>{label}</div>
      {lines.map((l, i) => (<div key={i} style={{ fontSize: 12.5, color: "#4A5552", lineHeight: 1.45 }}>{l}</div>))}
    </div>
  );
};

const ResultsStep = ({ ctx, setCtx, answers, onRestart, onBack, consultantMode, consultantNotes, setConsultantNotes, riskAnswers, onOpenRiskTool, jediAnswers, gacaAnswers, docStatus, setDocStatus, onExportFile }) => {
  const [showSpecialDocs, setShowSpecialDocs] = useState(false);
  const documents = useMemo(() => computeDocuments(ctx, answers, jediAnswers, gacaAnswers, docStatus, showSpecialDocs), [ctx, answers, jediAnswers, gacaAnswers, docStatus, showSpecialDocs]);
  // La taille effective vient de ctx.size (déjà calculée dans enrichedCtx avec override)
  const sizeObj = SIZE_TIERS.find((t) => t.id === ctx.size);
  const sectorObj = SECTORS.find((s) => s.id === ctx.sector);

  // Score par thématique — memoisé pour éviter recalcul à chaque keystroke
  // (notamment dans le panneau consultant)
  const practice = useMemo(() => computePracticeRates(ctx, answers), [ctx, answers]);
  const topicScores = useMemo(() => TOPICS.map((t, idx) => {
    const applicable = t.questions.filter((q) => matches(q, ctx));
    const valued = applicable
      .map((q) => ({ q, a: answers[q.id] }))
      .filter((x) => x.a && x.a !== "na");
    const pr = practice.topics[idx];
    const gaps = valued.filter(({ a }) => a === "non").map((x) => x.q);
    const partials = valued.filter(({ a }) => a === "partiel").map((x) => x.q);
    // "À formaliser" = pratique en place mais pas documentée (uniquement échelle pratique)
    const toFormalize = valued.filter(({ q, a }) => q.kind !== "factual" && a === "fait_seul").map((x) => x.q);
    // "Acquis" = fait + doc (pratique) ou Oui (factuel)
    const strengths = valued.filter(({ q, a }) => (q.kind === "factual" ? a === "oui" : a === "fait_doc")).map((x) => x.q);
    const toVerify = valued.filter(({ a }) => a === "ns").map((x) => x.q);
    return { topic: t, score: pr.pct, total: pr.denom, answered: pr.answered,
      gaps, partials, toFormalize, strengths, toVerify };
  }), [ctx, answers, practice]);

  const globalScore = practice.avg === null ? 0 : practice.avg;
  const documentsBase = useMemo(() => computeDocuments(ctx, answers, jediAnswers, gacaAnswers, docStatus, false), [ctx, answers, jediAnswers, gacaAnswers, docStatus]);
  const docRates = useMemo(() => computeDocRates(documentsBase), [documentsBase]);

  // Catégories de chantiers — memoisées (dérivées de topicScores)
  const { criticalGaps, toBuildAll, toFormalizeAll, strengthsAll, toVerifyAll } = useMemo(() => {
    // 1. CRITIQUES : sous-exigences "critique" non en place ou partielles (deal breakers)
    const criticalGaps = topicScores.flatMap((t) =>
      [...t.gaps, ...t.partials].filter((q) => isCritical(q, isRecertV16(ctx))).map((q) => ({ q, topic: t.topic }))
    );
    // 2. À CONSTRUIRE : "non" non critiques + partiels non critiques = chantiers de fond
    const toBuildAll = topicScores.flatMap((t) =>
      [...t.gaps, ...t.partials].filter((q) => !isCritical(q, isRecertV16(ctx))).map((q) => ({ q, topic: t.topic }))
    );
    // 3. À FORMALISER : pratique en place mais sans preuves documentaires (chantier de structuration)
    const toFormalizeAll = topicScores.flatMap((t) =>
      (t.toFormalize || []).map((q) => ({ q, topic: t.topic }))
    );
    // 4. ACQUIS : points solides à valoriser
    const strengthsAll = topicScores.flatMap((t) =>
      (t.strengths || []).map((q) => ({ q, topic: t.topic }))
    );
    // 5. À VÉRIFIER : réponse « ne sait pas », comptée comme non satisfaite
    const toVerifyAll = topicScores.flatMap((t) => (t.toVerify || []).map((q) => ({ q, topic: t.topic })));
    return { criticalGaps, toBuildAll, toFormalizeAll, strengthsAll, toVerifyAll };
  }, [topicScores]);

  // === SYNTHÈSE CONSULTANT ====================================================
  // Agrégation par mode de prise en charge des chantiers à construire/formaliser
  const consultantSummary = useMemo(() => {
    const allChantiers = [...criticalGaps, ...toBuildAll, ...toFormalizeAll];
    const buckets = {
      kiact: { count: 0, charge: 0, items: [] },
      piloting: { count: 0, charge: 0, items: [] },
      client: { count: 0, charge: 0, items: [] },
      unset: { count: 0, charge: 0, items: [] },
    };
    allChantiers.forEach(({ q, topic }) => {
      const note = consultantNotes[q.id] || {};
      const charge = parseFloat(String(note.charge || "").replace(",", ".")) || 0;
      const mode = note.mode || "unset";
      buckets[mode].count++;
      buckets[mode].charge += charge;
      buckets[mode].items.push({ q, topic, note });
    });
    const totalCharge = buckets.kiact.charge + buckets.piloting.charge;
    return { buckets, totalChantiers: allChantiers.length, totalCharge };
  }, [criticalGaps, toBuildAll, toFormalizeAll, consultantNotes]);

  const exportText = () => {
    const lines = [];
    lines.push(`DIAGNOSTIC B CORP V2 · KiAct Consulting`);
    lines.push(`Entreprise : ${ctx.companyName}`);
    lines.push(`Effectif : ${ctx.ftes} ETP (chiffres consolidés du périmètre)`);
    if (ctx.revenue) lines.push(`Revenu : ${ctx.revenue} M ${ctx.revenueCurrency || "CHF"}`);
    lines.push(`Catégorie B Lab : ${sizeObj?.label} (${sizeObj?.rangeFTE} ou ${sizeObj?.rangeUSD})${ctx.sizeOverride ? ", ajustée manuellement" : ", règle de la plus petite catégorie"}`);
    if ((ctx.revenueCurrency || "CHF") !== "USD" && ctx.revenue) lines.push(`Taux de change appliqué : 1 ${ctx.revenueCurrency || "CHF"} = ${getFxRate(ctx)} USD`);
    lines.push(`Secteur : ${sectorObj?.label}`);
    if (ctx.sites && ctx.sites.trim()) lines.push(`Sites et pays : ${ctx.sites.trim()}`);
    lines.push(`Statut : ${STATUS_OPTIONS.find((s) => s.id === ctx.status)?.label}`);
    lines.push(`Date : ${new Date().toLocaleDateString("fr-CH")}`);
    lines.push(``);
    lines.push(`TAUX DE PRATIQUES EN PLACE : ${practice.avg === null ? "-" : practice.avg + " %"} (moyenne des thématiques), ${practice.cumul === null ? "-" : practice.cumul + " %"} (cumul des questions, ${practice.answered} ${practice.answered > 1 ? "évaluées" : "évaluée"} sur ${practice.total})`);
    lines.push(`TAUX DE DOCUMENTS EXISTANTS : ${docRates.avg === null ? "-" : docRates.avg + " %"} (moyenne des thématiques), ${docRates.cumul === null ? "-" : docRates.cumul + " %"} (cumul, ${docRates.ok} documents sur ${docRates.total}, Année 0 hors démarches B Lab)`);
    lines.push(`Les questions sans réponse comptent comme non satisfaites. Cible B Lab, 100 % des exigences applicables en Année 0.`);
    lines.push(``);
    lines.push(`LECTURE PAR THÉMATIQUE`);
    topicScores.forEach((t, idx) => {
      const dr = docRates.topics[idx];
      lines.push(`  ${t.topic.code} ${t.topic.name} : pratiques ${t.score === null ? "-" : t.score + " %"} (${t.answered}/${t.total} questions), documents ${dr.pct === null ? "-" : dr.pct + " %"} (${dr.ok}/${dr.total})`);
    });
    lines.push(``);

    // Profil de risque (Risk Tool FR3.1) — si la grille a été engagée
    {
      const riskTotalAnswered = Object.keys(riskAnswers || {}).filter(
        k => riskAnswers[k] === "yes" || riskAnswers[k] === "no"
      ).length;
      const riskYes = countRiskYes(riskAnswers);
      if (riskTotalAnswered > 0) {
        lines.push(`PROFIL DE RISQUE B CORP (FR3.1) · ${riskTotalAnswered}/${RISK_TOOL_TOTAL_QUESTIONS} questions évaluées`);
        if (riskYes === 0) {
          lines.push(`  Aucune réponse "Oui" déclarée. Aucune sous-exigence additionnelle activée.`);
        } else {
          lines.push(`  ${riskYes} réponse${riskYes > 1 ? "s" : ""} "Oui", exigences additionnelles à anticiper`);
          RISK_TOOL_SECTIONS.forEach((section) => {
            const yesInSection = section.questions.filter(q => riskAnswers[q.id] === "yes");
            if (yesInSection.length > 0) {
              lines.push(`  • ${section.label} : ${yesInSection.length} "Oui"`);
              yesInSection.forEach((q) => {
                lines.push(`    - [${q.ref}] ${q.question}`);
              });
            }
          });
          const eff = riskEffectLines(ctx.req);
          if (eff.length > 0) {
            lines.push(`  Effets sur les exigences de l'Année 0`);
            eff.forEach((l) => lines.push(`  - ${l}`));
          } else {
            lines.push(`  Aucune exigence supplémentaire en Année 0 pour cette taille et ce secteur.`);
          }
          lines.push(`  Les réponses au Risk Tool sont publiées sur le profil B Corp public.`);
        }
        lines.push(``);
      }
    }

    if (criticalGaps.length > 0) {
      lines.push(`CONDITIONS D'ÉLIGIBILITÉ À LEVER · ${criticalGaps.length} exigence(s) de base FR1`);
      lines.push(`(Sans elles, l'entreprise ne peut pas se présenter à la certification)`);
      criticalGaps.forEach(({ q, topic }) => {
        lines.push(`  [${topic.code} · ${q.ref}] ${q.question}`);
      });
      lines.push(``);
    }
    if (documents.length > 0) {
      const d0 = documents.filter((d) => d.y === 0);
      lines.push(`DOCUMENTS ATTENDUS · ${d0.length} pour l'Année 0, ${documents.length - d0.length} pour les Années 3 et 5`);
      ["existant", "a_formaliser", "a_produire", "a_verifier", "sans_objet", "demarche"].forEach((st) => {
        const items = d0.filter((d) => d.status === st);
        if (items.length === 0) return;
        lines.push(`  ${DOC_STATUS[st].label} (${items.length})`);
        items.forEach((d) => lines.push(`    - [${d.c.join(", ")}] ${d.d} · ${d.ty} · ${d.di}${d.manual ? " · statut ajusté" : ""}${d.cond ? " · " + d.cond : ""}${DOC_SUPPORT_OF[d.id] ? " · support possible, " + DOC_SUPPORTS.find((sp) => sp.id === DOC_SUPPORT_OF[d.id]).label : ""}`));
      });
      const later = documents.filter((d) => d.y > 0);
      if (later.length > 0) {
        lines.push(`  À anticiper, Années 3 et 5 (${later.length})`);
        later.forEach((d) => lines.push(`    - [${d.c.join(", ")} · Année ${d.y}] ${d.d} · ${d.ty} · ${d.di}`));
      }
      lines.push(``);
    }
    if (toFormalizeAll.length > 0) {
      lines.push(`À FORMALISER · ${toFormalizeAll.length} pratiques en place mais sans preuves documentaires`);
      lines.push(`(Chantier de structuration : capter l'existant en politiques, processus, indicateurs auditables)`);
      toFormalizeAll.forEach(({ q, topic }) => {
        lines.push(`  [${topic.code} · ${q.ref}] ${q.question}`);
      });
      lines.push(``);
    }
    if (toVerifyAll.length > 0) {
      lines.push(`À VÉRIFIER · ${toVerifyAll.length} ${toVerifyAll.length > 1 ? "questions" : "question"} sans réponse établie (réponse « ne sait pas »)`);
      toVerifyAll.forEach(({ q, topic }) => {
        lines.push(`  [${topic.code} · ${q.ref}] ${q.question}`);
      });
      lines.push(``);
    }
    if (toBuildAll.length > 0) {
      lines.push(`À CONSTRUIRE · ${toBuildAll.length} sous-exigences à développer`);
      lines.push(`(Chantier de fond : définir, déployer, suivre)`);
      toBuildAll.forEach(({ q, topic }) => {
        lines.push(`  [${topic.code} · ${q.ref}] ${q.question}`);
      });
      lines.push(``);
    }
    if (ctx.req && ctx.req.anticipate.length > 0) {
      lines.push(`À ANTICIPER · ${ctx.req.anticipate.length} sous-exigences déclenchées par le Risk Tool pour les Années 3 et 5`);
      lines.push(`(Non comptées dans le diagnostic de l'Année 0)`);
      ctx.req.anticipate.forEach((a) => {
        lines.push(`  [${codeWithFr(a.code)} · Année ${a.year} · ${a.sources.join(", ")}] ${BLAB_SUBREQS[a.code]?.t || ""}${a.replaces.length ? ` Remplace ${a.replaces.join(", ")}.` : ""}`);
      });
      lines.push(``);
    }
    if (strengthsAll.length > 0) {
      lines.push(`POINTS ACQUIS · ${strengthsAll.length} sous-exigences en place et documentées`);
      lines.push(`(À valoriser dans le dossier de certification)`);
      strengthsAll.forEach(({ q, topic }) => {
        lines.push(`  [${topic.code} · ${q.ref}] ${q.question}`);
      });
      lines.push(``);
    }
    lines.push(`---`);
    lines.push(`Evelyne Peeters · KiAct Consulting`);
    lines.push(`epeeters@kiact.ch · +41 79 895 39 38`);
    return lines.join("\n");
  };

  // État d'affichage du panneau d'export
  const [showExportPanel, setShowExportPanel] = useState(false);
  // Message d'information affiché dans le panneau d'export (remplace alert())
  const [exportNotice, setExportNotice] = useState("");
  const [exportContent, setExportContent] = useState("");

  const openExportPanel = () => {
    setExportContent(exportText());
    setExportNotice("");
    setShowExportPanel(true);
    // Scroll vers le panneau après render
    setTimeout(() => {
      const el = document.getElementById("export-panel");
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
  };

  // Construit un HTML formaté pour impression / téléchargement
  const buildPrintableHTML = () => {
    const escape = (s) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const today = new Date().toLocaleDateString("fr-CH", { day: "2-digit", month: "long", year: "numeric" });
    const sections = [];

    // En-tête
    sections.push(`
      <header class="cover">
        <div class="brand">KiAct Consulting</div>
        <h1>Diagnostic B Corp V2</h1>
        <h2>${escape(ctx.companyName || "(sans nom)")}</h2>
        <div class="meta">
          <div><strong>Effectif :</strong> ${escape(ctx.ftes)} ETP (chiffres consolidés du périmètre)</div>
          ${ctx.revenue ? `<div><strong>Revenu :</strong> ${escape(ctx.revenue)} M ${escape(ctx.revenueCurrency || "CHF")}</div>` : ""}
          <div><strong>Catégorie B Lab :</strong> ${escape(sizeObj?.label || "")} (${escape(sizeObj?.rangeFTE || "")} ou ${escape(sizeObj?.rangeUSD || "")})${ctx.sizeOverride ? ", ajustée manuellement" : ", règle de la plus petite catégorie"}</div>
          ${(ctx.revenueCurrency || "CHF") !== "USD" && ctx.revenue ? `<div><strong>Taux de change appliqué :</strong> 1 ${escape(ctx.revenueCurrency || "CHF")} = ${getFxRate(ctx)} USD</div>` : ""}
          <div><strong>Secteur :</strong> ${escape(sectorObj?.label || "")}</div>
          ${ctx.sites && ctx.sites.trim() ? `<div><strong>Sites et pays :</strong> ${escape(ctx.sites.trim())}</div>` : ""}
          <div><strong>Statut :</strong> ${escape(STATUS_OPTIONS.find((s) => s.id === ctx.status)?.label || "")}</div>
          <div class="date">Diagnostic réalisé le ${today}</div>
        </div>
      </header>
    `);

    // Taux de pratiques et de documents
    sections.push(`
      <section class="score-block">
        <div class="score-circle good" style="font-size:26px">${practice.avg === null ? "-" : practice.avg + "&nbsp;%"}</div>
        <div class="score-label">Pratiques en place, moyenne des thématiques<br/><em>Cumul des questions ${practice.cumul === null ? "-" : practice.cumul} %, ${practice.answered} questions évaluées sur ${practice.total}. Les questions sans réponse comptent comme non satisfaites.</em></div>
      </section>
      <section class="score-block">
        <div class="score-circle good" style="border-color:#2D6AA3;color:#2D6AA3;font-size:26px">${docRates.avg === null ? "-" : docRates.avg + "&nbsp;%"}</div>
        <div class="score-label">Documents existants, moyenne des thématiques<br/><em>Cumul ${docRates.ok} documents sur ${docRates.total} (${docRates.cumul === null ? "-" : docRates.cumul} %), Année 0 hors démarches B Lab. Indicateurs de maturité, non assimilables au B Impact Score officiel.</em></div>
      </section>
    `);

    // Lecture par thématique
    sections.push(`<section><h3>Lecture par thématique</h3><table class="scores-tab">`);
    sections.push(`<thead><tr><th>Code</th><th>Thématique</th><th>Questions évaluées</th><th>Pratiques</th><th>Documents</th></tr></thead><tbody>`);
    topicScores.forEach((t, idx) => {
      const dr = docRates.topics[idx];
      const sc = t.score === null ? "—" : `${t.score}%`;
      const dc = dr.pct === null ? "—" : `${dr.pct}% (${dr.ok}/${dr.total})`;
      sections.push(`<tr><td><code>${escape(t.topic.code)}</code></td><td>${escape(t.topic.name)}</td><td>${t.answered}/${t.total}</td><td class="score-cell">${sc}</td><td class="score-cell">${dc}</td></tr>`);
    });
    sections.push(`</tbody></table></section>`);

    // Chantiers par catégorie
    const renderQuestionList = (items, title, cssClass) => {
      if (items.length === 0) return "";
      let html = `<section class="chantier-block ${cssClass}"><h3>${escape(title)} (${items.length})</h3><ul>`;
      items.forEach(({ q, topic }) => {
        html += `<li><strong>[${escape(topic.code)} · ${escape(q.ref)}]</strong> ${escape(q.question)}</li>`;
      });
      html += `</ul></section>`;
      return html;
    };

    {
      const riskTotalAnswered = Object.keys(riskAnswers || {}).filter((k) => riskAnswers[k] === "yes" || riskAnswers[k] === "no").length;
      const riskYes = countRiskYes(riskAnswers);
      if (riskTotalAnswered > 0) {
        let html = `<section class="chantier-block"><h3>Profil de risque B Corp (FR3.1) · ${riskTotalAnswered}/${RISK_TOOL_TOTAL_QUESTIONS} questions évaluées</h3>`;
        if (riskYes === 0) {
          html += `<p style="font-size:12px;margin:0">Aucune réponse « Oui » déclarée. Aucune sous-exigence additionnelle activée.</p>`;
        } else {
          html += `<p style="font-size:12px;margin:0 0 6px">${riskYes} réponse${riskYes > 1 ? "s" : ""} « Oui ». Les réponses au Risk Tool sont publiées sur le profil B Corp public.</p><ul>`;
          RISK_TOOL_SECTIONS.forEach((section) => section.questions.filter((q) => riskAnswers[q.id] === "yes").forEach((q) => {
            html += `<li><strong>[${escape(q.ref)}]</strong> ${escape(q.question)}</li>`;
          }));
          html += `</ul>`;
          const eff = riskEffectLines(ctx.req);
          html += eff.length > 0
            ? `<h4 style="margin:10px 0 4px;font-size:13px">Effets sur les exigences de l'Année 0</h4><ul>${eff.map((l) => `<li>${escape(l)}</li>`).join("")}</ul>`
            : `<p style="font-size:12px;margin:6px 0 0">Aucune exigence supplémentaire en Année 0 pour cette taille et ce secteur.</p>`;
        }
        sections.push(html + `</section>`);
      }
    }
    if (criticalGaps.length > 0) {
      sections.push(renderQuestionList(criticalGaps, "Conditions d'éligibilité à lever", "critical"));
    }
    if (toFormalizeAll.length > 0) {
      sections.push(renderQuestionList(toFormalizeAll, "À formaliser (pratique sans preuves)", "to-formalize"));
    }
    if (toVerifyAll.length > 0) {
      sections.push(renderQuestionList(toVerifyAll, "À vérifier (réponse « ne sait pas »)", "to-verify"));
    }
    if (toBuildAll.length > 0) {
      sections.push(renderQuestionList(toBuildAll, "À construire", "to-build"));
    }
    if (documents.length > 0) {
      const d0 = documents.filter((d) => d.y === 0);
      const later = documents.filter((d) => d.y > 0);
      const supportLabel = (d) => (DOC_SUPPORT_OF[d.id] ? DOC_SUPPORTS.find((sp) => sp.id === DOC_SUPPORT_OF[d.id])?.label : "");
      let html = `<section class="chantier-block"><h3>Documents attendus · ${d0.length} pour l'Année 0, ${later.length} pour les Années 3 et 5</h3>`;
      ["existant", "a_formaliser", "a_produire", "a_verifier", "sans_objet", "demarche"].forEach((st) => {
        const items = d0.filter((d) => d.status === st);
        if (items.length === 0) return;
        html += `<h4 style="margin:10px 0 4px;font-size:13px">${DOC_STATUS[st].label} (${items.length})</h4><ul>`;
        items.forEach((d) => {
          const extra = [d.manual ? "statut ajusté" : "", d.cond || "", supportLabel(d) ? `support possible, ${supportLabel(d)}` : ""].filter(Boolean).join(" · ");
          html += `<li><strong>[${escape(d.c.join(", "))}]</strong> ${escape(d.d)} <span style="color:#6B7670">· ${escape(d.ty)} · ${escape(d.di)}${extra ? " · " + escape(extra) : ""}</span></li>`;
        });
        html += `</ul>`;
      });
      if (later.length > 0) {
        html += `<h4 style="margin:10px 0 4px;font-size:13px">À anticiper, Années 3 et 5 (${later.length})</h4><ul>`;
        later.forEach((d) => { html += `<li><strong>[${escape(d.c.join(", "))} · Année ${d.y}]</strong> ${escape(d.d)} <span style="color:#6B7670">· ${escape(d.ty)} · ${escape(d.di)}</span></li>`; });
        html += `</ul>`;
      }
      sections.push(html + `</section>`);
    }
    if (ctx.req && ctx.req.anticipate.length > 0) {
      let html = `<section class="chantier-block to-build"><h3>À anticiper pour les Années 3 et 5 (${ctx.req.anticipate.length})</h3><p style="font-size:11px;margin:0">Sous-exigences déclenchées par le Risk Tool, non comptées dans le diagnostic de l'Année 0.</p><ul>`;
      ctx.req.anticipate.forEach((a) => {
        html += `<li><strong>[${escape(codeWithFr(a.code))} · Année ${a.year}]</strong> ${escape(BLAB_SUBREQS[a.code]?.t || "")}</li>`;
      });
      sections.push(html + `</ul></section>`);
    }
    if (strengthsAll.length > 0) {
      sections.push(renderQuestionList(strengthsAll, "Acquis", "strengths"));
    }

    // Footer
    sections.push(`
      <footer>
        <hr/>
        <p><em>Document confidentiel · KiAct Consulting · epeeters@kiact.ch · +41 79 895 39 38</em></p>
        <p><em>${STANDARDS_LABEL}. Outil de cadrage stratégique, complémentaire à l'auto-évaluation officielle de B Lab.</em></p>
      </footer>
    `);

    return `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"/>
<title>Diagnostic B Corp · ${escape(ctx.companyName || "")}</title>
<style>
  @page { size: A4; margin: 18mm; }
  body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #0f1f1f; line-height: 1.5; max-width: 210mm; margin: 0 auto; padding: 24px; }
  .cover { border-bottom: 3px solid #388D54; padding-bottom: 20px; margin-bottom: 28px; }
  .brand { font-size: 11px; font-weight: 700; color: #388D54; letter-spacing: 0.15em; text-transform: uppercase; margin-bottom: 6px; }
  h1 { font-size: 28px; font-weight: 600; margin: 0 0 4px 0; color: #0f1f1f; }
  h2 { font-size: 22px; font-weight: 500; margin: 0 0 16px 0; color: #4A5552; }
  h3 { font-size: 16px; font-weight: 600; color: #0f1f1f; margin-top: 24px; margin-bottom: 12px; padding-bottom: 6px; border-bottom: 1px solid rgba(15,31,31,0.1); page-break-after: avoid; }
  .meta { font-size: 12px; color: #4A5552; }
  .meta div { margin-bottom: 3px; }
  .meta .date { margin-top: 12px; color: #6B7670; font-style: italic; }
  .score-block { display: flex; gap: 24px; align-items: center; margin: 24px 0; padding: 20px; background: rgba(56,141,84,0.04); border-radius: 12px; page-break-inside: avoid; }
  .score-circle { width: 100px; height: 100px; border-radius: 50%; border: 6px solid; display: flex; flex-direction: column; align-items: center; justify-content: center; font-size: 32px; font-weight: 700; }
  .score-circle.good { border-color: #388D54; color: #388D54; }
  .score-circle span { font-size: 12px; font-weight: 400; color: #6B7670; }
  .score-label { font-size: 13px; color: #4A5552; }
  .score-label em { font-size: 11px; color: #6B7670; }
  table.scores-tab { width: 100%; border-collapse: collapse; font-size: 12px; }
  table.scores-tab th, table.scores-tab td { padding: 8px 12px; border-bottom: 1px solid rgba(15,31,31,0.08); text-align: left; }
  table.scores-tab th { background: rgba(15,31,31,0.04); font-weight: 700; font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; }
  table.scores-tab code { font-family: 'Courier New', monospace; color: #388D54; font-weight: 700; }
  .score-cell { text-align: right; font-weight: 700; }
  .chantier-block { padding: 14px 18px; border-radius: 8px; margin-top: 16px; page-break-inside: avoid; }
  .chantier-block.critical { background: rgba(220,38,38,0.05); border-left: 4px solid #DC2626; }
  .chantier-block.to-formalize { background: rgba(69,131,212,0.05); border-left: 4px solid #4583D4; }
  .chantier-block.to-build { background: rgba(245,158,11,0.05); border-left: 4px solid #F59E0B; }
  .chantier-block.to-verify { background: rgba(15,31,31,0.04); border-left: 4px solid #6B7670; }
  .chantier-block.strengths { background: rgba(56,141,84,0.05); border-left: 4px solid #388D54; }
  .chantier-block ul { margin: 8px 0 0 0; padding-left: 20px; }
  .chantier-block li { font-size: 12px; margin-bottom: 6px; line-height: 1.4; }
  footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid rgba(15,31,31,0.1); }
  footer p { font-size: 11px; color: #6B7670; margin: 4px 0; }
  hr { border: none; border-top: 1px solid rgba(15,31,31,0.1); }
</style></head>
<body>
${sections.join("\n")}
</body></html>`;
  };

  const tryPrint = () => {
    const html = buildPrintableHTML();
    // Ouvre une nouvelle fenêtre/onglet et lance l'impression dedans
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      // Popup bloqué — fallback : téléchargement du fichier HTML
      try {
        const blob = new Blob([html], { type: "text/html;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `Diagnostic_BCorp_${(ctx.companyName || "rapport").replace(/[^\w-]/g, "_")}.html`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        setExportNotice("La fenêtre d'impression a été bloquée par le navigateur. Le rapport a donc été téléchargé en fichier HTML. Ouvrez ce fichier, puis utilisez Ctrl+P (Cmd+P sur Mac) et choisissez « Enregistrer en PDF ».");
      } catch (err) {
        setExportNotice("L'impression et le téléchargement ont échoué. Utilisez le bouton « Copier le texte ».");
      }
      return;
    }
    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
    // Attendre que les styles s'appliquent avant d'imprimer
    printWindow.onload = () => {
      setTimeout(() => {
        try {
          printWindow.focus();
          printWindow.print();
        } catch (e) {
          // Si print() échoue, l'utilisateur peut imprimer manuellement avec Ctrl+P dans la fenêtre
        }
      }, 250);
    };
  };

  return (
    <div className="fade-up" style={{ maxWidth: 1080, margin: "0 auto", padding: "32px" }}>
      {/* Header restitution */}
      <div style={{ marginBottom: 8, fontSize: 12, color: "#388D54", letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: 700 }}>
        Étape 3 / 3 · Restitution
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 32, flexWrap: "wrap", gap: 16 }}>
        <div>
          <h1 className="kiact-display" style={{ fontSize: 44, fontWeight: 600, lineHeight: 1.05, letterSpacing: "-0.02em", marginBottom: 8 }}>
            {ctx.companyName}
          </h1>
          <div style={{ fontSize: 14, color: "#4A5552" }}>
            {sizeObj?.label} · {sectorObj?.label} · {STATUS_OPTIONS.find((s) => s.id === ctx.status)?.label}
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button onClick={openExportPanel} className="kiact-btn" style={{
            padding: "10px 18px", borderRadius: 10,
            background: "linear-gradient(135deg, #388D54 0%, #2f6b1f 100%)",
            border: "none", fontSize: 13, cursor: "pointer",
            fontWeight: 700, color: "white",
          }}>Exporter le rapport</button>
          <button onClick={onBack} className="kiact-btn" style={{
            padding: "10px 18px", borderRadius: 10, background: "white",
            border: "1.5px solid rgba(15,31,31,0.12)", fontSize: 13, cursor: "pointer",
            fontWeight: 600, color: "#0f1f1f",
          }} title="Revenir au questionnaire pour ajuster une réponse">← Diagnostic</button>
          <button onClick={onRestart} className="kiact-btn" style={{
            padding: "10px 18px", borderRadius: 10, background: "white",
            border: "1.5px solid rgba(15,31,31,0.12)", fontSize: 13, cursor: "pointer",
            fontWeight: 600, color: "#0f1f1f",
          }}>← Mes diagnostics</button>
        </div>
      </div>

      {/* Panneau d'export — apparaît au clic sur "Exporter le rapport" */}
      {showExportPanel && (
        <div id="export-panel" className="kiact-card no-print" style={{
          padding: 0, marginBottom: 32, overflow: "hidden",
          borderColor: "rgba(56,141,84,0.3)",
        }}>
          <div style={{
            padding: "16px 24px",
            background: "linear-gradient(135deg, rgba(56,141,84,0.08) 0%, rgba(69,131,212,0.05) 100%)",
            borderBottom: "1px solid rgba(56,141,84,0.2)",
            display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap",
          }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#388D54", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 4 }}>
                Export du rapport
              </div>
              <div style={{ fontSize: 13, color: "#4A5552" }}>
                Copiez le texte ci-dessous dans Word, Notion ou un courriel. Vous pouvez aussi imprimer le rapport ou l'enregistrer en PDF.
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(exportContent);
                    setExportNotice("Le texte a été copié dans le presse-papiers.");
                  } catch (e) {
                    setExportNotice("La copie automatique a échoué. Sélectionnez le texte (Ctrl+A), puis copiez-le (Ctrl+C).");
                  }
                }}
                className="kiact-btn"
                style={{
                  padding: "8px 14px", borderRadius: 8,
                  background: "#0f1f1f", color: "white", border: "none",
                  fontSize: 12, fontWeight: 700, cursor: "pointer",
                }}
              >Copier le texte</button>
              <button
                onClick={tryPrint}
                className="kiact-btn"
                style={{
                  padding: "8px 14px", borderRadius: 8,
                  background: "white", color: "#0f1f1f",
                  border: "1.5px solid rgba(15,31,31,0.15)",
                  fontSize: 12, fontWeight: 600, cursor: "pointer",
                }}
                title="Ouvre une fenêtre dédiée avec le rapport mis en forme et lance l'impression. Si la fenêtre est bloquée, le rapport sera téléchargé en HTML."
              >Imprimer ou enregistrer en PDF</button>
              {onExportFile && (
                <button
                  onClick={() => { const f = onExportFile(); if (f) setExportNotice(`Fichier ${f} téléchargé. Il se réimporte depuis « Mes diagnostics ».`); }}
                  className="kiact-btn"
                  title="Télécharger le diagnostic complet, réimportable dans l'outil"
                  style={{ padding: "8px 14px", borderRadius: 8, background: "white", color: "#0f1f1f", border: "1.5px solid rgba(15,31,31,0.15)", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
                >Télécharger le fichier du diagnostic</button>
              )}
              <button
                onClick={() => { setShowExportPanel(false); setExportNotice(""); }}
                style={{
                  padding: "8px 12px", borderRadius: 8, background: "transparent",
                  border: "1.5px solid rgba(15,31,31,0.12)", fontSize: 12,
                  color: "#6B7670", cursor: "pointer", fontWeight: 600,
                }}
              >Fermer</button>
            </div>
          </div>
          <div style={{ padding: "8px 12px 4px", background: "rgba(245,158,11,0.08)", borderBottom: "1px solid rgba(245,158,11,0.2)", fontSize: 11.5, color: "#92400E", lineHeight: 1.5 }}>
            Le bouton « Imprimer ou enregistrer en PDF » ouvre le rapport mis en page dans une nouvelle fenêtre.
            Si le navigateur bloque cette fenêtre, le rapport est téléchargé en fichier HTML.
            Pour un copier-coller dans Word ou Notion, utilisez « Copier le texte ».
          </div>
          {exportNotice && (
            <div role="status" style={{ padding: "8px 12px", background: "rgba(56,141,84,0.08)", borderBottom: "1px solid rgba(56,141,84,0.2)", fontSize: 12, color: "#1F5C33", lineHeight: 1.5 }}>
              {exportNotice}
            </div>
          )}
          <textarea
            readOnly
            value={exportContent}
            onClick={(e) => e.target.select()}
            style={{
              width: "100%", minHeight: 320, padding: 16,
              fontFamily: "'Manrope', sans-serif", fontSize: 12.5, lineHeight: 1.6,
              border: "none", resize: "vertical", color: "#0f1f1f", background: "white",
              outline: "none", whiteSpace: "pre-wrap",
            }}
          />
        </div>
      )}

      {/* Deux taux, pratiques et documents */}
      <div className="kiact-card kiact-shadow" style={{ padding: 28, marginBottom: 32 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 24, marginBottom: 28 }}>
          <RateRing label="Pratiques en place" color="#388D54" avg={practice.avg}
            lines={[
              "Moyenne des thématiques",
              practice.cumul === null ? "" : `Cumul des questions, ${practice.cumul} %`,
              `${practice.answered} ${practice.answered > 1 ? "questions évaluées" : "question évaluée"} sur ${practice.total}`,
            ]} />
          <RateRing label="Documents existants" color="#2D6AA3" avg={docRates.avg}
            lines={[
              "Moyenne des thématiques",
              docRates.cumul === null ? "" : `Cumul, ${docRates.ok} ${docRates.ok > 1 ? "documents" : "document"} sur ${docRates.total} (${docRates.cumul} %)`,
              "Année 0, hors démarches B Lab",
            ]} />
        </div>
        <div style={{ fontSize: 11, color: "#6B7670", letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: 700, marginBottom: 12 }}>
          Lecture par thématique
        </div>
        <div style={{ display: "grid", gap: 14 }}>
          {topicScores.map((ts, idx) => {
            const pr = practice.topics[idx];
            const dr = docRates.topics[idx];
            const st = rateState(pr.answered, pr.pct, dr.pct);
            const bar = (pct, color) => (
              <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 44px", gap: 8, alignItems: "center", fontSize: 12.5 }}>
                <div style={{ position: "relative", height: 8, background: "rgba(15,31,31,0.07)", borderRadius: 4 }}>
                  <div style={{ width: `${pct === null ? 0 : pct}%`, height: "100%", background: color, borderRadius: 4, transition: "width 0.6s ease" }} />
                  <span style={{ position: "absolute", right: 0, top: -3, bottom: -3, width: 2, background: "#0f1f1f", opacity: 0.5 }} />
                </div>
                <span style={{ fontWeight: 700, textAlign: "right" }}>{pct === null ? "-" : `${pct} %`}</span>
              </div>
            );
            return (
              <div key={ts.topic.id} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, alignItems: "center" }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ color: ts.topic.color, fontSize: 16 }}>{ts.topic.icon}</span>
                    <span style={{ fontSize: 13, fontWeight: 700 }}>{ts.topic.code}</span>
                    <span style={{ fontSize: 13, color: "#4A5552" }}>{ts.topic.short}</span>
                  </div>
                  <div style={{ fontSize: 11.5, color: "#6B7670", marginTop: 2 }}>
                    {pr.answered} sur {pr.denom} {pr.denom > 1 ? "questions évaluées" : "question évaluée"}
                    {dr.total > 0 ? ` · ${dr.ok} sur ${dr.total} ${dr.total > 1 ? "documents" : "document"}` : ""}
                  </div>
                </div>
                <div style={{ display: "grid", gap: 6 }}>
                  {bar(pr.pct, "#388D54")}
                  {bar(dr.pct, "#2D6AA3")}
                </div>
                <span style={{ justifySelf: "start", fontSize: 12, fontWeight: 600, padding: "3px 10px", borderRadius: 999, background: st.bg, color: st.c }}>{st.l}</span>
              </div>
            );
          })}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 16, fontSize: 12.5, color: "#4A5552", marginTop: 16 }}>
          <span><i style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, background: "#388D54", marginRight: 6 }} />Pratiques en place</span>
          <span><i style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, background: "#2D6AA3", marginRight: 6 }} />Documents existants</span>
          <span>Trait noir, cible de 100 %</span>
        </div>
        <p style={{ fontSize: 11.5, color: "#6B7670", lineHeight: 1.5, marginTop: 10, marginBottom: 0 }}>
          B Lab V2 n'attribue pas de score et ne fixe aucun niveau minimal par thématique. Toute exigence applicable doit être satisfaite en Année 0.
          Les questions sans réponse comptent comme non satisfaites. Prêt, Proche (à partir de 60 %) et Chantier sont des repères KiAct.
          Un indicateur de maturité n'est pas assimilable au B Impact Score officiel.
        </p>
      </div>

      {/* Encadré stratégique : la lecture KiAct du diagnostic */}
      <div className="kiact-card kiact-shadow" style={{ padding: 24, marginBottom: 24, background: "linear-gradient(135deg, rgba(56,141,84,0.04) 0%, rgba(69,131,212,0.04) 100%)", border: "1.5px dashed rgba(56,141,84,0.25)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                    <h4 className="kiact-display" style={{ fontSize: 16, fontWeight: 600 }}>Lecture stratégique</h4>
        </div>
        <p style={{ fontSize: 13, color: "#4A5552", lineHeight: 1.6, margin: 0 }}>
          En V2, toute sous-exigence applicable en Année 0 doit être remplie pour être certifiée. Il n'y a ni score ni hiérarchie.
          <strong style={{ color: "#DC2626" }}> Les conditions d'éligibilité</strong> (exigences de base FR1) conditionnent l'accès même à la certification.
          Le repère <strong style={{ color: "#9A6200" }}>« Délai long »</strong> signale les chantiers à lancer tôt (estimation KiAct).
          La liste des <strong style={{ color: "#388D54" }}>documents attendus</strong> montre ce qui existe, ce qui est à formaliser et ce qui reste à produire.
          <em> Une entreprise qui pratique déjà sans avoir documenté se certifie souvent plus vite qu'une autre encore loin du compte.</em>
        </p>
      </div>

      {/* Profil de risque (Risk Tool) — affiché si la grille a été engagée */}
      {(() => {
        const riskTotalAnswered = Object.keys(riskAnswers || {}).filter(
          k => riskAnswers[k] === "yes" || riskAnswers[k] === "no"
        ).length;
        const riskYes = countRiskYes(riskAnswers);
        if (riskTotalAnswered === 0) return null; // Grille pas engagée → on ne montre rien

        const sectionsWithYes = RISK_TOOL_SECTIONS
          .map(s => ({
            label: s.label,
            icon: s.icon,
            yes: s.questions.filter(q => riskAnswers[q.id] === "yes").length,
          }))
          .filter(s => s.yes > 0);

        return (
          <div className="kiact-card kiact-shadow" style={{
            padding: 24,
            marginBottom: 24,
            background: riskYes > 0
              ? "linear-gradient(135deg, rgba(56,141,84,0.05) 0%, rgba(124,201,86,0.05) 100%)"
              : "white",
            border: riskYes > 0
              ? "1.5px solid rgba(56,141,84,0.25)"
              : "1px solid rgba(15,31,31,0.08)",
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                <h4 className="kiact-display" style={{ fontSize: 16, fontWeight: 600 }}>
                  Profil de risque B Corp (FR3.1)
                </h4>
              </div>
              <div style={{ fontSize: 12, color: "#6B7670" }}>
                {riskTotalAnswered} / {RISK_TOOL_TOTAL_QUESTIONS} questions évaluées
              </div>
            </div>

            {riskYes === 0 ? (
              <div style={{ fontSize: 14, color: "#4A5552", lineHeight: 1.55 }}>
                Aucune réponse <strong>« Oui »</strong> n'a été déclarée sur les {riskTotalAnswered} questions évaluées.
                {riskTotalAnswered < RISK_TOOL_TOTAL_QUESTIONS && (
                  <span> Les {RISK_TOOL_TOTAL_QUESTIONS - riskTotalAnswered} questions restantes sont à compléter.</span>
                )}
                {" "}Aucune sous-exigence additionnelle ne sera donc activée par ce questionnaire.
              </div>
            ) : (
              <>
                <div style={{ fontSize: 14, color: "#4A5552", lineHeight: 1.55, marginBottom: 14 }}>
                  <strong style={{ color: "#388D54", fontSize: 22, marginRight: 6 }}>{riskYes}</strong>
                  réponse{riskYes > 1 ? "s" : ""} <strong>« Oui »</strong> sur {riskTotalAnswered} questions évaluées,
                  {" "}à anticiper en termes de due diligence et de communication publique.
                </div>

                {/* Détail par section avec Oui */}
                <div style={{ display: "grid", gap: 8, marginBottom: 14 }}>
                  {sectionsWithYes.map((s, i) => (
                    <div key={i} style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "8px 12px",
                      background: "white",
                      borderRadius: 8,
                      borderLeft: "3px solid #388D54",
                      fontSize: 13,
                    }}>
                      <span style={{ fontSize: 16 }}>{s.icon}</span>
                      <span style={{ flex: 1, color: "#0f1f1f", fontWeight: 500 }}>{s.label}</span>
                      <span style={{ color: "#388D54", fontWeight: 700 }}>
                        {s.yes} « Oui »
                      </span>
                    </div>
                  ))}
                </div>

                <div style={{
                  padding: 12,
                  background: "rgba(69, 131, 212, 0.06)",
                  borderRadius: 8,
                  borderLeft: "3px solid #4583D4",
                  fontSize: 12,
                  color: "#4A5552",
                  lineHeight: 1.55,
                }}>
                  <strong style={{ color: "#0f1f1f" }}>Effets pour cette entreprise</strong>
                  {riskEffectLines(ctx.req).length > 0 ? (
                    <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                      {riskEffectLines(ctx.req).map((l, i) => <li key={i}>{l}</li>)}
                    </ul>
                  ) : (
                    <div style={{ marginTop: 4 }}>Aucune exigence supplémentaire en Année 0 pour cette taille et ce secteur.</div>
                  )}
                  {ctx.req && ctx.req.anticipate.length > 0 && (
                    <div style={{ marginTop: 6 }}>{ctx.req.anticipate.length} sous-exigence{ctx.req.anticipate.length > 1 ? "s" : ""} à anticiper pour les Années 3 et 5, détaillée{ctx.req.anticipate.length > 1 ? "s" : ""} plus bas.</div>
                  )}
                  <div style={{ marginTop: 6 }}>Les réponses au Risk Tool sont publiées sur le profil B Corp public de l'entreprise.</div>
                </div>
              </>
            )}

            {/* Lien pour reprendre/compléter la grille */}
            {onOpenRiskTool && (
              <div style={{ marginTop: 14, display: "flex", justifyContent: "flex-end" }}>
                <button
                  onClick={onOpenRiskTool}
                  style={{
                    background: "transparent",
                    color: "#388D54",
                    border: "1px solid rgba(56,141,84,0.3)",
                    padding: "6px 14px",
                    borderRadius: 8,
                    cursor: "pointer",
                    fontSize: 12,
                    fontWeight: 600,
                    fontFamily: "inherit",
                  }}
                >
                  {riskTotalAnswered === RISK_TOOL_TOTAL_QUESTIONS ? "↻ Réviser la grille" : "→ Compléter la grille"}
                </button>
              </div>
            )}
          </div>
        );
      })()}

      {/* Documents attendus */}
      <DocumentsSection docs={documents} docStatus={docStatus} setDocStatus={setDocStatus} showSpecial={showSpecialDocs} setShowSpecial={setShowSpecialDocs} />

      {/* Conditions d'éligibilité (exigences de base FR1) */}
      {criticalGaps.length > 0 && (
        <div className="kiact-card kiact-shadow" style={{ padding: 28, marginBottom: 24, border: "1.5px solid rgba(220,38,38,0.2)", background: "linear-gradient(180deg, rgba(220,38,38,0.02) 0%, white 100%)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <span style={{ fontSize: 20, color: "#DC2626" }}>◉</span>
            <h3 className="kiact-display" style={{ fontSize: 22, fontWeight: 600, color: "#0f1f1f" }}>
              Conditions d'éligibilité à lever ({criticalGaps.length})
            </h3>
          </div>
          <p style={{ fontSize: 13, color: "#4A5552", marginBottom: 16, lineHeight: 1.5 }}>
            Exigences de base FR1 non remplies ou partielles. Sans elles, l'entreprise ne peut pas se présenter à la certification.
          </p>
          <div style={{ display: "grid", gap: 10 }}>
            {criticalGaps.map(({ q, topic }, i) => (
              <div key={i} style={{ padding: 14, background: "white", borderRadius: 10, borderLeft: `3px solid ${topic.color}` }}>
                <div style={{ fontSize: 11, color: topic.color, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 4 }}>
                  {topic.code} · {q.ref}
                </div>
                <div style={{ fontSize: 14, color: "#0f1f1f", fontWeight: 600 }}>{q.question}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* À formaliser — pratique sans preuves (mode consultant) */}
      {consultantMode && toFormalizeAll.length > 0 && (
        <div className="kiact-card kiact-shadow" style={{ padding: 28, marginBottom: 24, border: "1.5px solid rgba(69,131,212,0.2)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <span style={{ fontSize: 20, color: "#4583D4" }}>◑</span>
            <h3 className="kiact-display" style={{ fontSize: 22, fontWeight: 600 }}>
              À formaliser ({toFormalizeAll.length})
            </h3>
            <span style={{ fontSize: 11, color: "#4583D4", letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 700, background: "rgba(69,131,212,0.08)", padding: "3px 10px", borderRadius: 999 }}>
              Pratique en place, preuves manquantes
            </span>
          </div>
          <p style={{ fontSize: 13, color: "#4A5552", marginBottom: 16, lineHeight: 1.5 }}>
            <strong>Ce qui n'est pas prouvé n'existe pas</strong> aux yeux de l'audit. Pratiques solides à transcrire en
            politiques, processus, indicateurs et traces auditables. Chantier souvent rapide et à fort levier.
          </p>
          <div style={{ display: "grid", gap: 8 }}>
            {toFormalizeAll.map(({ q, topic }, i) => (
              <div key={i} style={{ padding: "10px 14px", background: "rgba(69,131,212,0.04)", borderRadius: 8, fontSize: 13 }}>
                <span style={{ color: topic.color, fontWeight: 700 }}>{topic.code}</span>
                <span style={{ color: "#6B7670" }}> · {q.ref} · </span>
                <span style={{ color: "#0f1f1f" }}>{q.question}</span>
                {isLongLead(q) && <span title={LONG_LEAD_TITLE} style={{ marginLeft: 8, fontSize: 10.5, color: "#9A6200", fontWeight: 700, background: "rgba(245,158,11,0.12)", padding: "1px 7px", borderRadius: 999 }}>DÉLAI LONG</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* À construire — chantiers de fond (mode consultant) */}
      {consultantMode && toBuildAll.length > 0 && (
        <div className="kiact-card kiact-shadow" style={{ padding: 28, marginBottom: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <span style={{ fontSize: 20, color: "#F59E0B" }}>◐</span>
            <h3 className="kiact-display" style={{ fontSize: 22, fontWeight: 600 }}>
              À construire ({toBuildAll.length})
            </h3>
            <span style={{ fontSize: 11, color: "#F59E0B", letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 700, background: "rgba(245,158,11,0.1)", padding: "3px 10px", borderRadius: 999 }}>
              Chantier de fond
            </span>
          </div>
          <p style={{ fontSize: 13, color: "#4A5552", marginBottom: 16, lineHeight: 1.5 }}>
            Sous-exigences à développer : définir, déployer, suivre. À planifier sur la trajectoire 0–3 ans pour atteindre les seuils par thématique.
          </p>
          <div style={{ display: "grid", gap: 8 }}>
            {toBuildAll.map(({ q, topic }, i) => (
              <div key={i} style={{ padding: "10px 14px", background: "rgba(15,31,31,0.025)", borderRadius: 8, fontSize: 13 }}>
                <span style={{ color: topic.color, fontWeight: 700 }}>{topic.code}</span>
                <span style={{ color: "#6B7670" }}> · {q.ref} · </span>
                <span style={{ color: "#0f1f1f" }}>{q.question}</span>
                {isLongLead(q) && <span title={LONG_LEAD_TITLE} style={{ marginLeft: 8, fontSize: 10.5, color: "#9A6200", fontWeight: 700, background: "rgba(245,158,11,0.12)", padding: "1px 7px", borderRadius: 999 }}>DÉLAI LONG</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* À anticiper : sous-exigences des Années 3 et 5 déclenchées par le Risk Tool */}
      {ctx.req && ctx.req.anticipate.length > 0 && (
        <div className="kiact-card kiact-shadow" style={{ padding: 28, marginBottom: 24, border: "1.5px solid rgba(124,45,82,0.2)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <span style={{ fontSize: 20, color: "#7C2D52" }}>◓</span>
            <h3 className="kiact-display" style={{ fontSize: 22, fontWeight: 600 }}>
              À anticiper ({ctx.req.anticipate.length})
            </h3>
            <span style={{ fontSize: 11, color: "#7C2D52", letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 700, background: "rgba(124,45,82,0.08)", padding: "3px 10px", borderRadius: 999 }}>
              Années 3 et 5
            </span>
          </div>
          <p style={{ fontSize: 13, color: "#4A5552", marginBottom: 16, lineHeight: 1.5 }}>
            Sous-exigences déclenchées par le Risk Tool. Elles ne sont pas dues en Année 0 et ne sont pas comptées dans le diagnostic.
          </p>
          <div style={{ display: "grid", gap: 8 }}>
            {ctx.req.anticipate.map((a) => (
              <div key={a.code} style={{ padding: "10px 14px", background: "rgba(124,45,82,0.04)", borderRadius: 8, fontSize: 13 }}>
                <span style={{ color: "#7C2D52", fontWeight: 700 }}>{codeWithFr(a.code)}</span>
                <span style={{ color: "#6B7670" }}> · Année {a.year} · {a.sources.join(", ")} · </span>
                <span style={{ color: "#0f1f1f" }}>{BLAB_SUBREQS[a.code]?.t}</span>
                {a.replaces.length > 0 && <span style={{ color: "#6B7670" }}> Remplace {a.replaces.join(", ")}.</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Acquis (mode consultant) */}
      {consultantMode && strengthsAll.length > 0 && (
        <div className="kiact-card kiact-shadow" style={{ padding: 28, marginBottom: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <span style={{ fontSize: 20, color: "#388D54" }}>●</span>
            <h3 className="kiact-display" style={{ fontSize: 22, fontWeight: 600 }}>
              Points acquis ({strengthsAll.length})
            </h3>
            <span style={{ fontSize: 11, color: "#388D54", letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 700, background: "rgba(56,141,84,0.08)", padding: "3px 10px", borderRadius: 999 }}>
              Pratique + preuves
            </span>
          </div>
          <p style={{ fontSize: 13, color: "#4A5552", marginBottom: 16, lineHeight: 1.5 }}>
            Sous-exigences en place et documentées. À valoriser dans le dossier de certification et la communication interne.
          </p>
          <div style={{ display: "grid", gap: 8 }}>
            {strengthsAll.map(({ q, topic }, i) => (
              <div key={i} style={{ padding: "10px 14px", background: "rgba(56,141,84,0.04)", borderRadius: 8, fontSize: 13 }}>
                <span style={{ color: topic.color, fontWeight: 700 }}>{topic.code}</span>
                <span style={{ color: "#6B7670" }}> · {q.ref} · </span>
                <span style={{ color: "#0f1f1f" }}>{q.question}</span>
                {isLongLead(q) && <span title={LONG_LEAD_TITLE} style={{ marginLeft: 8, fontSize: 10.5, color: "#9A6200", fontWeight: 700, background: "rgba(245,158,11,0.12)", padding: "1px 7px", borderRadius: 999 }}>DÉLAI LONG</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* === SYNTHÈSE CONSULTANT (mode privé) ================================= */}
      {consultantMode && consultantSummary.totalChantiers > 0 && (
        <div className="kiact-card kiact-shadow-lg no-print" style={{
          padding: 32,
          marginTop: 24,
          background: "linear-gradient(135deg, #0f1f1f 0%, #1a3838 100%)",
          color: "white",
          border: "1px solid rgba(124,201,86,0.3)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
            <span style={{
              fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase",
              color: "#7CC956", padding: "3px 10px", background: "rgba(124,201,86,0.12)",
              borderRadius: 999, border: "1px solid rgba(124,201,86,0.3)",
            }}>
              Espace consultant
            </span>
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>
              Visible uniquement par vous · Non inclus dans le PDF
            </span>
          </div>
          <h3 className="kiact-display" style={{ fontSize: 26, fontWeight: 600, lineHeight: 1.15, marginTop: 8, marginBottom: 6, color: "white" }}>
            Synthèse de la mission
          </h3>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", lineHeight: 1.5, marginBottom: 24, maxWidth: 760 }}>
            Agrégation des {consultantSummary.totalChantiers} chantier{consultantSummary.totalChantiers > 1 ? "s" : ""} (éligibilité, à construire, à formaliser) selon votre prise en charge.
            {consultantSummary.buckets.unset.count > 0 && (
              <>
                {" "}<strong style={{ color: "#F59E0B" }}>
                  {consultantSummary.buckets.unset.count} chantier{consultantSummary.buckets.unset.count > 1 ? "s restent à qualifier" : " reste à qualifier"}
                </strong>. Retournez au questionnaire pour leur attribuer un mode (Je le fais / Je pilote / Le client).
              </>
            )}
            {consultantSummary.totalChantiers > 0 && consultantSummary.buckets.unset.count === 0 && (
              <> Cette vue alimente votre proposition commerciale et la planification du mandat.</>
            )}
          </p>

          {/* 4 buckets */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 20 }}>
            {[
              { id: "kiact", label: "Je le fais", subtitle: "Réalisation KiAct", color: "#7CC956", emoji: "●" },
              { id: "piloting", label: "Je pilote", subtitle: "Le client fait", color: "#4583D4", emoji: "●" },
              { id: "client", label: "Le client", subtitle: "Hors périmètre", color: "#9CA3AF", emoji: "—" },
              { id: "unset", label: "À qualifier", subtitle: "Non défini", color: "#F59E0B", emoji: "?" },
            ].map((bucket) => {
              const data = consultantSummary.buckets[bucket.id];
              return (
                <div key={bucket.id} style={{
                  padding: 16,
                  background: "rgba(255,255,255,0.04)",
                  borderRadius: 10,
                  border: `1px solid ${bucket.color}30`,
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8, fontSize: 11, color: "rgba(255,255,255,0.6)", letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 700 }}>
                    <span style={{ color: bucket.color }}>{bucket.emoji}</span>
                    {bucket.label}
                  </div>
                  <div className="kiact-display" style={{ fontSize: 32, fontWeight: 700, lineHeight: 1, color: bucket.color, letterSpacing: "-0.02em" }}>
                    {data.count}
                  </div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", marginTop: 4 }}>
                    {bucket.subtitle} {data.charge > 0 && <>· <strong style={{ color: "white" }}>{data.charge}j</strong></>}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Total mission */}
          {consultantSummary.totalCharge > 0 && (
            <div style={{
              padding: "14px 18px",
              background: "linear-gradient(90deg, rgba(124,201,86,0.12) 0%, rgba(69,131,212,0.08) 100%)",
              borderRadius: 10,
              border: "1px solid rgba(124,201,86,0.25)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: 12,
            }}>
              <div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 700 }}>
                  Charge totale mandat (réalisation + pilotage)
                </div>
                <div className="kiact-display" style={{ fontSize: 28, fontWeight: 700, color: "#7CC956", marginTop: 4, letterSpacing: "-0.02em" }}>
                  {consultantSummary.totalCharge} jours
                </div>
              </div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", textAlign: "right" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6, marginBottom: 4 }}>
                  <span>Au TJM de</span>
                  <input
                    type="number"
                    min="0"
                    step="50"
                    value={ctx.dailyRate ?? 1800}
                    onChange={(e) => setCtx({ ...ctx, dailyRate: parseInt(e.target.value, 10) || 0 })}
                    style={{
                      width: 80, padding: "3px 6px", borderRadius: 6,
                      fontSize: 12, fontWeight: 700,
                      background: "rgba(255,255,255,0.08)",
                      color: "white",
                      border: "1px solid rgba(124,201,86,0.3)",
                      textAlign: "center", outline: "none",
                      fontFamily: "inherit",
                    }}
                    title="Tarif journalier appliqué pour ce diagnostic"
                  />
                  <span>CHF :</span>
                </div>
                <div className="kiact-display" style={{ fontSize: 22, fontWeight: 700, color: "white", marginTop: 2 }}>
                  {(consultantSummary.totalCharge * (ctx.dailyRate || 1800)).toLocaleString("fr-CH")} CHF
                </div>
              </div>
            </div>
          )}

          {/* Liste détaillée — TOUS les chantiers (édition inline pour ajuster en RDV) */}
          {consultantSummary.totalChantiers > 0 && (
            <details style={{ marginTop: 20 }} open={consultantSummary.buckets.unset.count > 0}>
              <summary style={{ cursor: "pointer", fontSize: 12, color: "rgba(255,255,255,0.7)", fontWeight: 600, padding: "6px 0" }}>
                ▸ Voir et éditer le détail des chantiers ({consultantSummary.totalChantiers})
              </summary>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 6, marginBottom: 10, fontStyle: "italic" }}>
                Ajustez le mode et la charge directement ici. Les totaux se recalculent en temps réel.
              </div>
              <div style={{ marginTop: 12, display: "grid", gap: 6 }}>
                {[
                  ...consultantSummary.buckets.kiact.items,
                  ...consultantSummary.buckets.piloting.items,
                  ...consultantSummary.buckets.client.items,
                  ...consultantSummary.buckets.unset.items,
                ].map((item) => {
                  const mode = item.note.mode || null;
                  const updateNote = (changes) => {
                    setConsultantNotes({
                      ...consultantNotes,
                      [item.q.id]: { ...item.note, ...changes },
                    });
                  };
                  return (
                    <div key={item.q.id} style={{
                      padding: "10px 12px",
                      background: mode ? "rgba(255,255,255,0.04)" : "rgba(245,158,11,0.08)",
                      borderRadius: 8,
                      fontSize: 12,
                      display: "grid",
                      gridTemplateColumns: "1fr auto",
                      gap: 10,
                      alignItems: "center",
                      border: mode ? "1px solid rgba(255,255,255,0.05)" : "1px solid rgba(245,158,11,0.25)",
                    }}>
                      <div style={{ color: "rgba(255,255,255,0.85)", minWidth: 0 }}>
                        <div>
                          <strong style={{ color: item.topic.color === "#0d4f3c" ? "#7CC956" : "white" }}>{item.topic.code}</strong>
                          <span style={{ opacity: 0.5 }}> · {item.q.ref} · </span>
                          <span>{item.q.question}</span>
                        </div>
                        {item.note.notes && (
                          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 2, fontStyle: "italic" }}>
                            → {item.note.notes}
                          </div>
                        )}
                      </div>

                      <div style={{ display: "flex", gap: 4, alignItems: "center", flexShrink: 0 }}>
                        {/* Boutons mode */}
                        {[
                          { id: "kiact", label: "Fait", color: "#7CC956" },
                          { id: "piloting", label: "Pilote", color: "#4583D4" },
                          { id: "client", label: "Client", color: "#9CA3AF" },
                        ].map((opt) => (
                          <button
                            key={opt.id}
                            onClick={() => updateNote({ mode: mode === opt.id ? null : opt.id })}
                            title={opt.id === "kiact" ? "Réalisation par KiAct" : opt.id === "piloting" ? "Le client fait, j'accompagne" : "Hors périmètre KiAct"}
                            style={{
                              padding: "3px 8px", borderRadius: 999, fontSize: 9.5, fontWeight: 700,
                              background: mode === opt.id ? `${opt.color}30` : "transparent",
                              color: mode === opt.id ? opt.color : "rgba(255,255,255,0.5)",
                              border: `1px solid ${mode === opt.id ? opt.color : "rgba(255,255,255,0.15)"}`,
                              cursor: "pointer",
                              textTransform: "uppercase", letterSpacing: "0.04em",
                            }}
                          >
                            {opt.label}
                          </button>
                        ))}
                        {/* Champ charge éditable (uniquement si mode kiact ou piloting) */}
                        {(mode === "kiact" || mode === "piloting") && (
                          <input
                            type="text"
                            value={item.note.charge || ""}
                            onChange={(e) => updateNote({ charge: e.target.value })}
                            placeholder="—"
                            style={{
                              width: 56, padding: "4px 6px", borderRadius: 6,
                              fontSize: 11, fontWeight: 600,
                              background: "rgba(124,201,86,0.08)",
                              color: "#7CC956",
                              border: "1px solid rgba(124,201,86,0.3)",
                              textAlign: "center", outline: "none",
                              fontFamily: "inherit",
                            }}
                            title="Charge en jours (ex: 0.125 = 1h, 1 = 1j, 5 = 5j)"
                          />
                        )}
                        {(mode === "kiact" || mode === "piloting") && (
                          <span style={{ fontSize: 10, color: "rgba(255,255,255,0.5)" }}>j</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </details>
          )}
        </div>
      )}

      {/* CTA KiAct */}
      <div className="kiact-card kiact-shadow-lg" style={{
        padding: 36,
        background: "linear-gradient(135deg, #0f1f1f 0%, #1a3838 100%)",
        color: "white",
        marginTop: 24,
      }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 24, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 280 }}>
            <div style={{ fontSize: 11, color: "#7CC956", letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: 700, marginBottom: 12 }}>
              Prochaine étape
            </div>
            <h3 className="kiact-display" style={{ fontSize: 30, fontWeight: 600, lineHeight: 1.15, marginBottom: 12, color: "white" }}>
              Passer du diagnostic au plan d'action
            </h3>
            <p style={{ fontSize: 15, color: "rgba(255,255,255,0.75)", lineHeight: 1.55, marginBottom: 20 }}>
              Ce diagnostic identifie les écarts. La suite, c'est traduire ces écarts en politiques, processus, indicateurs et preuves auditables. C'est le cœur de l'accompagnement KiAct.
            </p>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <a
                href={`mailto:epeeters@kiact.ch?subject=${encodeURIComponent(`Diagnostic B Corp, ${ctx.companyName}`)}&body=${encodeURIComponent(`Bonjour Evelyne,\n\nSuite au diagnostic B Corp réalisé pour ${ctx.companyName}, j'aimerais échanger sur les chantiers prioritaires.\n\nScore global : ${globalScore}%\n\nCordialement,`)}`}
                className="kiact-btn"
                style={{
                  padding: "14px 24px", borderRadius: 10,
                  background: "linear-gradient(135deg, #7CC956 0%, #388D54 100%)",
                  color: "white", textDecoration: "none", fontSize: 14, fontWeight: 700,
                  display: "inline-flex", alignItems: "center", gap: 8,
                }}
              >
                Échanger avec Evelyne
              </a>
              <a
                href="tel:+41798953938"
                className="kiact-btn"
                style={{
                  padding: "14px 24px", borderRadius: 10,
                  background: "rgba(255,255,255,0.1)",
                  color: "white", textDecoration: "none", fontSize: 14, fontWeight: 700,
                  border: "1.5px solid rgba(255,255,255,0.2)",
                  display: "inline-flex", alignItems: "center", gap: 8,
                }}
              >
                +41 79 895 39 38
              </a>
            </div>
          </div>
          <div style={{ minWidth: 220 }}>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: 700, marginBottom: 12 }}>
              KiAct accompagne
            </div>
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 10 }}>
              <li style={{ fontSize: 13, color: "rgba(255,255,255,0.85)", paddingLeft: 16, position: "relative" }}>
                <span style={{ position: "absolute", left: 0, color: "#7CC956" }}>✓</span>
                Diagnostic B Corp nouvelle génération
              </li>
              <li style={{ fontSize: 13, color: "rgba(255,255,255,0.85)", paddingLeft: 16, position: "relative" }}>
                <span style={{ position: "absolute", left: 0, color: "#7CC956" }}>✓</span>
                Politiques structurantes & gouvernance impact
              </li>
              <li style={{ fontSize: 13, color: "rgba(255,255,255,0.85)", paddingLeft: 16, position: "relative" }}>
                <span style={{ position: "absolute", left: 0, color: "#7CC956" }}>✓</span>
                Bilan Carbone® et trajectoire climat
              </li>
              <li style={{ fontSize: 13, color: "rgba(255,255,255,0.85)", paddingLeft: 16, position: "relative" }}>
                <span style={{ position: "absolute", left: 0, color: "#7CC956" }}>✓</span>
                Préparation à l'audit & dossier de preuves
              </li>
            </ul>
          </div>
        </div>
      </div>

      <div style={{ textAlign: "center", marginTop: 32, fontSize: 11, color: "#6B7670", letterSpacing: "0.05em" }}>
        {STANDARDS_LABEL} · Adapté à la taille et au secteur ·
        Outil propriétaire KiAct Consulting, qui ne remplace pas l'auto-évaluation officielle de B Lab.
      </div>
    </div>
  );
};

// ============================================================================
// APP
// ============================================================================

// ----- Sauvegarde via window.storage (Claude server-side) -------------------
// Utilise l'API window.storage de Claude.ai qui sauvegarde côté serveur
// (persistante entre sessions et entre appareils sur même compte Claude).
//
// Architecture multi-diagnostics :
// - "kbcd_index"     : liste des diagnostics (métadonnées : id, nom, date, étape, score)
// - "kbcd_diag_<id>" : données complètes d'un diagnostic donné
const INDEX_KEY = "kbcd_index";
const DIAG_KEY = (id) => `kbcd_diag_${id}`;

const newId = () => `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

// --- Index management ---
const loadIndex = async () => {
  try {
    if (!window.storage) return [];
    const result = await window.storage.get(INDEX_KEY);
    if (!result || !result.value) return [];
    const parsed = JSON.parse(result.value);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
};

const saveIndex = async (index) => {
  try {
    if (!window.storage) return;
    await window.storage.set(INDEX_KEY, JSON.stringify(index));
  } catch (e) {}
};

// --- Single diagnostic management ---
const loadDiagnostic = async (id) => {
  try {
    if (!window.storage || !id) return null;
    const result = await window.storage.get(DIAG_KEY(id));
    if (!result || !result.value) return null;
    return JSON.parse(result.value);
  } catch (e) {
    return null;
  }
};

const saveDiagnostic = async (id, data) => {
  try {
    if (!window.storage || !id) return;
    await window.storage.set(DIAG_KEY(id), JSON.stringify({ ...data, savedAt: new Date().toISOString() }));
  } catch (e) {}
};

const deleteDiagnostic = async (id) => {
  try {
    if (!window.storage || !id) return;
    await window.storage.delete(DIAG_KEY(id));
  } catch (e) {}
};

// --- Combined operations ---
// Met à jour à la fois le diagnostic complet ET les métadonnées dans l'index
const upsertDiagnosticAndIndex = async (id, data, indexEntry) => {
  await saveDiagnostic(id, data);
  const index = await loadIndex();
  const existingIdx = index.findIndex((d) => d.id === id);
  if (existingIdx >= 0) {
    index[existingIdx] = { ...index[existingIdx], ...indexEntry, savedAt: new Date().toISOString() };
  } else {
    index.push({ id, createdAt: new Date().toISOString(), savedAt: new Date().toISOString(), ...indexEntry });
  }
  await saveIndex(index);
};

// Retire le diagnostic et son entrée d'index
const removeDiagnosticAndIndex = async (id) => {
  await deleteDiagnostic(id);
  const index = await loadIndex();
  const filtered = index.filter((d) => d.id !== id);
  await saveIndex(filtered);
};

// --- Export et import de fichiers ---
// Un fichier JSON unique, pour un ou plusieurs diagnostics. Il sert de sauvegarde,
// de transfert entre postes et de matière pour la rédaction du rapport.
const EXPORT_FORMAT = "kiact-diagnostic-bcorp";
const EXPORT_VERSION = 1;
const fileSlug = (s) => String(s || "sans_nom").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\w-]+/g, "_").replace(/^_+|_+$/g, "") || "sans_nom";
const todayIso = () => new Date().toISOString().slice(0, 10);

const buildExportFile = async (entries) => {
  const diagnostics = [];
  for (const entry of entries) {
    const data = await loadDiagnostic(entry.id);
    if (data) diagnostics.push({ index: entry, data });
  }
  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    referentiel: "Standards B Lab V2.2 du 20 février 2026",
    diagnostics,
  };
};

// Dans un artefact Claude (page encadrée), les téléchargements sont bloqués par la plateforme.
const inFramedPage = () => { try { return window.self !== window.top; } catch (e) { return true; } };

// Renvoie true si le téléchargement a pu être lancé
const downloadJson = (filename, obj) => {
  if (inFramedPage()) return false;
  try {
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  } catch (e) {
    return false;
  }
};

// Importe un fichier exporté. Une version plus récente déjà présente dans ce navigateur est conservée.
const importExportFile = async (obj) => {
  if (!obj || obj.format !== EXPORT_FORMAT || !Array.isArray(obj.diagnostics)) {
    return { error: "Ce fichier n'est pas un export du diagnostic KiAct B Corp." };
  }
  const index = await loadIndex();
  let imported = 0, kept = 0, invalid = 0;
  for (const item of obj.diagnostics) {
    const entry = item && item.index;
    const data = item && item.data;
    if (!entry || !entry.id || !data || typeof data.ctx !== "object") { invalid++; continue; }
    const local = index.find((d) => d.id === entry.id);
    if (local && (local.savedAt || "") > (entry.savedAt || "")) { kept++; continue; }
    await window.storage.set(DIAG_KEY(entry.id), JSON.stringify(data));
    const i = index.findIndex((d) => d.id === entry.id);
    if (i >= 0) index[i] = { ...entry }; else index.push({ ...entry });
    imported++;
  }
  await saveIndex(index);
  return { imported, kept, invalid, index };
};

// Panneau de repli : contenu du fichier à copier, ou texte d'export à coller
const FilePanel = ({ panel, onClose, onPasteImport }) => {
  const [text, setText] = useState(panel.mode === "export" ? panel.text : "");
  const [msg, setMsg] = useState("");
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); setMsg("Contenu copié. Collez-le dans un fichier texte nommé " + panel.filename + "."); }
    catch (e) { const el = document.getElementById("kiact-file-text"); if (el) { el.focus(); el.select(); } setMsg("Copie automatique refusée. Le texte est sélectionné, utilisez Ctrl+C (Cmd+C sur Mac)."); }
  };
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(15,31,31,0.45)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div className="kiact-card" style={{ width: "min(720px, 100%)", maxHeight: "90vh", overflow: "auto", padding: 24, display: "grid", gap: 12 }}>
        <h3 className="kiact-display" style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>
          {panel.mode === "export" ? "Fichier du diagnostic" : "Coller un export"}
        </h3>
        <p style={{ fontSize: 13, color: "#4A5552", margin: 0, lineHeight: 1.5 }}>
          {panel.mode === "export"
            ? "Cette page ne peut pas lancer de téléchargement. Copiez le contenu, puis enregistrez-le dans un fichier " + panel.filename + ". Sur le site en ligne, le fichier se télécharge directement."
            : "Collez ici le contenu d'un fichier exporté depuis cet outil, puis lancez l'import."}
        </p>
        <textarea id="kiact-file-text" value={text} readOnly={panel.mode === "export"} onChange={(e) => setText(e.target.value)}
          style={{ width: "100%", minHeight: 260, fontFamily: "ui-monospace, monospace", fontSize: 11.5, padding: 10, borderRadius: 8, border: "1px solid rgba(15,31,31,0.15)", boxSizing: "border-box" }} />
        {msg && <div role="status" style={{ fontSize: 12.5, color: "#2F7A47" }}>{msg}</div>}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
          {panel.mode === "export"
            ? <button onClick={copy} className="kiact-btn" style={{ padding: "8px 14px", borderRadius: 8, background: "#388D54", color: "white", border: "none", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>Copier le contenu</button>
            : <button onClick={() => onPasteImport(text)} className="kiact-btn" style={{ padding: "8px 14px", borderRadius: 8, background: "#388D54", color: "white", border: "none", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>Importer</button>}
          <button onClick={onClose} className="kiact-btn" style={{ padding: "8px 14px", borderRadius: 8, background: "white", color: "#0f1f1f", border: "1.5px solid rgba(15,31,31,0.15)", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Fermer</button>
        </div>
      </div>
    </div>
  );
};

// Archive ou désarchive un diagnostic (toggle du flag archived dans l'index)
const toggleArchiveDiagnostic = async (id) => {
  const index = await loadIndex();
  const idx = index.findIndex((d) => d.id === id);
  if (idx < 0) return;
  index[idx] = {
    ...index[idx],
    archived: !index[idx].archived,
    archivedAt: !index[idx].archived ? new Date().toISOString() : null,
  };
  await saveIndex(index);
};

// ----- Standards utilisateur (charges personnalisées) -----------------------
const STANDARDS_KEY = "kbcd_standards";

const loadStandards = async () => {
  try {
    if (!window.storage) return null;
    const result = await window.storage.get(STANDARDS_KEY);
    if (!result || !result.value) return null;
    return JSON.parse(result.value);
  } catch (e) {
    return null;
  }
};

const saveStandards = async (standards) => {
  try {
    if (!window.storage) return;
    await window.storage.set(STANDARDS_KEY, JSON.stringify(standards));
  } catch (e) {}
};

const DEFAULT_CTX = {
  companyName: "",
  ftes: "",
  revenue: "",
  revenueCurrency: "CHF",
  fxRate: "",  // taux USD saisi pour ce diagnostic ; vide = taux par défaut
  sizeOverride: null,
  country: "CH",
  sites: "",            // sites et pays du périmètre, texte libre repris dans l'export
  status: "",
  sector: "",
  hasInvestment: null,  // true/false : l'entreprise exerce-t-elle une activité d'investissement ?
  industry: "",         // industrie B Lab (services à faible empreinte), "autre" si aucune
  isMining: false,      // industrie minière (fabrication)
  recertDate: "",
  dailyRate: 1800,  // TJM en CHF — modifiable par diagnostic
};

// ============================================================================
// HOME SCREEN — Liste des diagnostics + nouveau
// ============================================================================
const HomeScreen = ({ index, indexLoaded, onNew, onOpen, onDelete, onArchive, onOpenStandards, onExport, onExportAll, onImport, onPasteOpen, fileNotice }) => {
  // Filtre : "active" (par défaut), "archived", "all"
  const [filter, setFilter] = useState("active");
  // ID du diagnostic en attente de confirmation de suppression (confirmation
  // intégrée à l'UI : confirm() natif est bloqué dans l'iframe sandboxée).
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  const formatDate = (iso) => {
    if (!iso) return "";
    try {
      return new Date(iso).toLocaleString("fr-CH", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
    } catch { return ""; }
  };

  const stepLabel = (s) => {
    if (s === 0) return "Cadrage en cours";
    if (s === 1) return "Diagnostic en cours";
    if (s === 2) return "Diagnostic terminé";
    return "—";
  };

  // Filtrage selon l'onglet sélectionné
  const filteredIndex = useMemo(() => {
    if (filter === "active") return index.filter((d) => !d.archived);
    if (filter === "archived") return index.filter((d) => d.archived);
    return index; // "all"
  }, [index, filter]);

  const counts = useMemo(() => ({
    active: index.filter((d) => !d.archived).length,
    archived: index.filter((d) => d.archived).length,
    all: index.length,
  }), [index]);

  return (
    <div className="fade-up" style={{ maxWidth: 920, margin: "0 auto", padding: "48px 32px" }}>
      <div style={{ marginBottom: 8, fontSize: 12, color: "#388D54", letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: 700 }}>
        Mes diagnostics B Corp
      </div>
      <h1 className="kiact-display" style={{ fontSize: 40, fontWeight: 600, lineHeight: 1.1, marginBottom: 12, letterSpacing: "-0.02em" }}>
        {index.length === 0 && indexLoaded
          ? "Démarrer votre premier diagnostic"
          : "Reprendre ou démarrer un diagnostic"}
      </h1>
      <p style={{ fontSize: 16, color: "#4A5552", marginBottom: 32, maxWidth: 640, lineHeight: 1.5 }}>
        Outil de cadrage stratégique B Corp V2 pour vos rendez-vous prospects et clients.
        Vos diagnostics sont sauvegardés automatiquement dans ce navigateur, sur cet ordinateur. Exportez-les en fichier pour les conserver ou les reprendre sur un autre poste.
      </p>

      {/* Boutons d'action principaux */}
      <div style={{ display: "flex", gap: 12, marginBottom: 40, flexWrap: "wrap" }}>
        <button
          onClick={onNew}
          className="kiact-btn kiact-shadow"
          style={{
            padding: "16px 28px",
            borderRadius: 12,
            background: "linear-gradient(135deg, #388D54 0%, #2f6b1f 100%)",
            color: "white",
            border: "none",
            fontSize: 15,
            fontWeight: 700,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <span style={{ fontSize: 18 }}>＋</span>
          Nouveau diagnostic
        </button>
        <button
          onClick={onOpenStandards}
          className="kiact-btn"
          title="Configurer vos charges par défaut (mode consultant)"
          style={{
            padding: "16px 22px",
            borderRadius: 12,
            background: "white",
            color: "#0f1f1f",
            border: "1.5px solid rgba(15,31,31,0.15)",
            fontSize: 14,
            fontWeight: 600,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          Mes standards de charge
        </button>
        <label
          className="kiact-btn"
          title="Ouvrir un fichier exporté depuis cet outil, sur ce poste ou un autre"
          style={{ padding: "16px 22px", borderRadius: 12, background: "white", color: "#0f1f1f", border: "1.5px solid rgba(15,31,31,0.15)", fontSize: 14, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}
        >
          Importer un fichier
          <input id="kiact-import-file" type="file" accept=".json,application/json" style={{ display: "none" }}
            onChange={(e) => { const f = e.target.files && e.target.files[0]; if (f) onImport(f); e.target.value = ""; }} />
        </label>
        {inFramedPage() && (
          <button
            onClick={onPasteOpen}
            className="kiact-btn"
            title="Importer un export copié sous forme de texte"
            style={{ padding: "16px 22px", borderRadius: 12, background: "white", color: "#0f1f1f", border: "1.5px solid rgba(15,31,31,0.15)", fontSize: 14, fontWeight: 600, cursor: "pointer" }}
          >
            Coller un export
          </button>
        )}
        {index.length > 0 && (
          <button
            onClick={onExportAll}
            className="kiact-btn"
            title="Télécharger tous les diagnostics de ce navigateur dans un seul fichier"
            style={{ padding: "16px 22px", borderRadius: 12, background: "white", color: "#0f1f1f", border: "1.5px solid rgba(15,31,31,0.15)", fontSize: 14, fontWeight: 600, cursor: "pointer" }}
          >
            Tout exporter ({index.length})
          </button>
        )}
      </div>
      {fileNotice && (
        <div role="status" style={{ marginTop: -24, marginBottom: 32, fontSize: 13, lineHeight: 1.5, padding: "10px 14px", borderRadius: 10, background: fileNotice.error ? "rgba(220,38,38,0.08)" : "rgba(56,141,84,0.08)", color: fileNotice.error ? "#B42323" : "#2F7A47" }}>
          {fileNotice.text}
        </div>
      )}

      {/* Loading */}
      {!indexLoaded && (
        <div style={{ padding: 32, textAlign: "center", color: "#6B7670" }}>
          Chargement de vos diagnostics…
        </div>
      )}

      {/* Filtres + liste */}
      {indexLoaded && index.length > 0 && (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
            <div style={{
              fontSize: 11, color: "#6B7670", letterSpacing: "0.08em",
              textTransform: "uppercase", fontWeight: 700,
            }}>
              Diagnostics ({filteredIndex.length})
            </div>
            <div style={{ display: "flex", gap: 4, padding: 4, background: "rgba(15,31,31,0.04)", borderRadius: 999 }}>
              {[
                { id: "active", label: `Actifs (${counts.active})` },
                { id: "archived", label: `Archivés (${counts.archived})` },
                { id: "all", label: `Tous (${counts.all})` },
              ].map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => setFilter(opt.id)}
                  style={{
                    padding: "6px 12px",
                    borderRadius: 999,
                    fontSize: 12,
                    fontWeight: 600,
                    background: filter === opt.id ? "white" : "transparent",
                    color: filter === opt.id ? "#0f1f1f" : "#6B7670",
                    border: filter === opt.id ? "1px solid rgba(15,31,31,0.1)" : "1px solid transparent",
                    cursor: "pointer",
                    boxShadow: filter === opt.id ? "0 1px 3px rgba(0,0,0,0.05)" : "none",
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {filteredIndex.length === 0 && (
            <div style={{
              padding: 32,
              background: "rgba(15,31,31,0.025)",
              border: "1px dashed rgba(15,31,31,0.15)",
              borderRadius: 12,
              textAlign: "center",
              color: "#6B7670",
              fontSize: 13,
            }}>
              {filter === "archived" ? "Aucun diagnostic archivé." : "Aucun diagnostic dans cette vue."}
            </div>
          )}

          <div style={{ display: "grid", gap: 12 }}>
            {filteredIndex.map((d) => (
              <div
                key={d.id}
                className="kiact-card"
                style={{
                  padding: 20,
                  display: "grid",
                  gridTemplateColumns: "1fr auto auto",
                  gap: 16,
                  alignItems: "center",
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                  opacity: d.archived ? 0.7 : 1,
                  background: d.archived ? "rgba(15,31,31,0.02)" : "white",
                }}
                onClick={() => onOpen(d.id)}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = "rgba(56,141,84,0.3)"; e.currentTarget.style.transform = "translateY(-1px)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = "rgba(15,31,31,0.06)"; e.currentTarget.style.transform = "translateY(0)"; }}
              >
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <div className="kiact-display" style={{ fontSize: 18, fontWeight: 600, color: "#0f1f1f" }}>
                      {d.companyName || "(sans nom)"}
                    </div>
                    {d.archived && (
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 999,
                        background: "rgba(15,31,31,0.08)", color: "#6B7670", letterSpacing: "0.05em",
                      }}>ARCHIVÉ</span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: "#6B7670", display: "flex", flexWrap: "wrap", gap: 10 }}>
                    {d.sizeLabel && <span><strong style={{ color: "#0f1f1f" }}>{d.sizeLabel}</strong></span>}
                    {d.sectorLabel && <span>· {d.sectorLabel}</span>}
                    <span>· {stepLabel(d.step)}</span>
                    <span>· Modifié le {formatDate(d.savedAt)}</span>
                  </div>
                </div>

                {/* Score (si disponible) */}
                {typeof d.score === "number" && (
                  <div style={{
                    width: 56, height: 56, borderRadius: "50%",
                    border: "3px solid #388D54",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontFamily: "Fraunces", fontSize: 18, fontWeight: 700, color: "#0f1f1f",
                    flexShrink: 0,
                  }}>
                    {d.score}
                  </div>
                )}

                {/* Actions : exporter, archiver/désarchiver, supprimer */}
                <div style={{ display: "flex", gap: 6 }}>
                  <button
                    onClick={(e) => { e.stopPropagation(); onExport(d); }}
                    title="Télécharger ce diagnostic dans un fichier"
                    className="kiact-btn"
                    style={{ padding: "8px 10px", borderRadius: 8, background: "white", color: "#2F7A47", border: "1px solid rgba(56,141,84,0.3)", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
                  >
                    Exporter
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); onArchive(d.id, d.archived); }}
                    title={d.archived ? "Désarchiver ce diagnostic" : "Archiver (sortir de la vue Actifs)"}
                    className="kiact-btn"
                    style={{
                      padding: "8px 10px",
                      borderRadius: 8,
                      background: "white",
                      color: "#4583D4",
                      border: "1px solid rgba(69,131,212,0.25)",
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    {d.archived ? "Désarchiver" : "Archiver"}
                  </button>
                  {confirmDeleteId === d.id ? (
                    // Confirmation intégrée : deux boutons "Confirmer / Annuler"
                    <>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setConfirmDeleteId(null);
                          onDelete(d.id, d.companyName || "(sans nom)");
                        }}
                        title="Confirmer la suppression définitive"
                        className="kiact-btn"
                        style={{
                          padding: "8px 10px",
                          borderRadius: 8,
                          background: "#DC2626",
                          color: "white",
                          border: "1px solid #DC2626",
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: "pointer",
                        }}
                      >
                        Confirmer
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(null); }}
                        title="Annuler"
                        className="kiact-btn"
                        style={{
                          padding: "8px 10px",
                          borderRadius: 8,
                          background: "white",
                          color: "#4A5552",
                          border: "1px solid rgba(15,31,31,0.2)",
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: "pointer",
                        }}
                      >
                        Annuler
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(d.id); }}
                      title="Supprimer définitivement ce diagnostic"
                      className="kiact-btn"
                      style={{
                        padding: "8px 10px",
                        borderRadius: 8,
                        background: "white",
                        color: "#DC2626",
                        border: "1px solid rgba(220,38,38,0.2)",
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      Supprimer
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {indexLoaded && index.length === 0 && (
        <div style={{
          padding: 40,
          background: "rgba(15,31,31,0.025)",
          border: "1px dashed rgba(15,31,31,0.15)",
          borderRadius: 12,
          textAlign: "center",
          color: "#6B7670",
          fontSize: 14,
        }}>
          Aucun diagnostic pour l'instant. Cliquez sur <strong style={{ color: "#0f1f1f" }}>"+ Nouveau diagnostic"</strong> pour commencer.
        </div>
      )}

      {/* Footer informatif */}
      <div style={{
        marginTop: 48, padding: "20px 24px",
        background: "linear-gradient(135deg, rgba(56,141,84,0.04) 0%, rgba(69,131,212,0.03) 100%)",
        border: "1px solid rgba(56,141,84,0.15)", borderRadius: 12,
        fontSize: 12.5, color: "#4A5552", lineHeight: 1.6,
      }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#388D54", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 8 }}>
          Sauvegarde et confidentialité
        </div>
        Les diagnostics sont enregistrés uniquement dans la mémoire locale de ce navigateur. Aucune donnée n'est transmise à un serveur.
        Ils ne suivent pas d'un ordinateur à l'autre et disparaissent si les données du site sont effacées.
        En navigation privée, ils sont perdus à la fermeture de la fenêtre.
      </div>
    </div>
  );
};

// ============================================================================
// STANDARDS PANEL — Configuration des charges par défaut consultant
// ============================================================================
const StandardsPanel = ({ standards, onSave, onClose }) => {
  // Standards locaux en cours d'édition (copie pour pouvoir annuler)
  const [local, setLocal] = useState(standards || { typeDefaults: {}, questionOverrides: {} });
  // Confirmation de réinitialisation intégrée (confirm() natif bloqué en iframe)
  const [confirmResetAll, setConfirmResetAll] = useState(false);

  // Récupère la valeur (utilisateur ou système) pour une combinaison type × taille × mode
  const getValue = (type, size, mode) => {
    if (local.typeDefaults?.[type]?.[size]?.[mode] !== undefined) {
      return local.typeDefaults[type][size][mode];
    }
    return DEFAULT_CHARGES[type]?.[size]?.[mode] ?? 0;
  };

  const setValue = (type, size, mode, value) => {
    const num = parseFloat(String(value).replace(",", "."));
    if (isNaN(num) || num < 0) return;
    setLocal({
      ...local,
      typeDefaults: {
        ...local.typeDefaults,
        [type]: {
          ...(local.typeDefaults?.[type] || {}),
          [size]: {
            ...(local.typeDefaults?.[type]?.[size] || {}),
            [mode]: num,
          },
        },
      },
    });
  };

  const isUserValue = (type, size, mode) => {
    return local.typeDefaults?.[type]?.[size]?.[mode] !== undefined;
  };

  const resetType = (type) => {
    if (!local.typeDefaults?.[type]) return;
    const { [type]: _removed, ...rest } = local.typeDefaults;
    setLocal({ ...local, typeDefaults: rest });
  };

  const resetAll = () => {
    setLocal({ typeDefaults: {}, questionOverrides: {} });
    setConfirmResetAll(false);
  };

  const handleSave = () => {
    onSave(local);
  };

  // Liste des types de livrables et tailles
  const TYPE_LIST = [
    { id: "document", label: "Document", desc: "Politique, charte, procédure courte" },
    { id: "processus_simple", label: "Processus simple", desc: "Document + déploiement léger" },
    { id: "processus_complet", label: "Processus complet", desc: "Méthode + outils + accompagnement" },
  ];

  const SIZE_LIST = [
    { id: "petite", label: "Petite", desc: "<50 ETP" },
    { id: "moyenne", label: "Moyenne", desc: "50-249 ETP" },
    { id: "grande", label: "Grande+", desc: "250+ ETP" },
  ];

  return (
    <div style={{
      position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
      background: "rgba(15,31,31,0.55)", zIndex: 100,
      display: "flex", justifyContent: "center", alignItems: "flex-start",
      padding: "40px 20px", overflowY: "auto",
    }}>
      <div className="kiact-card kiact-shadow" style={{
        maxWidth: 880, width: "100%", padding: 0, overflow: "hidden",
        background: "white",
      }}>
        {/* En-tête */}
        <div style={{
          padding: "20px 28px",
          background: "linear-gradient(135deg, #0f1f1f 0%, #1a3838 100%)",
          color: "white",
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#7CC956", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 4 }}>
              Configuration
            </div>
            <div className="kiact-display" style={{ fontSize: 22, fontWeight: 600 }}>
              Mes standards de charge
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              padding: "8px 14px", borderRadius: 8,
              background: "rgba(255,255,255,0.08)", color: "white",
              border: "1px solid rgba(255,255,255,0.15)",
              fontSize: 13, fontWeight: 600, cursor: "pointer",
            }}
          >
            ✕ Fermer
          </button>
        </div>

        {/* Description */}
        <div style={{ padding: "16px 28px", background: "rgba(15,31,31,0.02)", borderBottom: "1px solid rgba(15,31,31,0.06)" }}>
          <p style={{ fontSize: 13, color: "#4A5552", lineHeight: 1.5, margin: 0 }}>
            Charges par défaut selon le <strong>type de livrable</strong> et la <strong>taille de l'entreprise</strong>.
            Pendant le diagnostic, le type de chaque question peut être ajusté au cas par cas via le toggle dans le panneau consultant.
          </p>
          <p style={{ fontSize: 11.5, color: "#6B7670", lineHeight: 1.5, margin: "6px 0 0", fontStyle: "italic" }}>
            Repère : 0.125 = 1h · 0.25 = 2h · 0.5 = 4h · 1 = 1 jour entier (8h). Valeurs en italique = système ; en vert = personnalisé.
          </p>
        </div>

        {/* Tableau des standards par type */}
        <div style={{ padding: "16px 28px" }}>
          {TYPE_LIST.map((type, typeIdx) => {
            const typeCustomized = SIZE_LIST.some((s) => isUserValue(type.id, s.id, "kiact") || isUserValue(type.id, s.id, "piloting"));
            return (
              <div key={type.id} style={{ marginBottom: typeIdx < TYPE_LIST.length - 1 ? 20 : 0, paddingBottom: typeIdx < TYPE_LIST.length - 1 ? 16 : 0, borderBottom: typeIdx < TYPE_LIST.length - 1 ? "1px solid rgba(15,31,31,0.06)" : "none" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 10 }}>
                  <div>
                    <div className="kiact-display" style={{ fontSize: 16, fontWeight: 600, color: "#0f1f1f" }}>
                      {type.label}
                    </div>
                    <div style={{ fontSize: 11.5, color: "#6B7670", marginTop: 2 }}>
                      {type.desc}
                    </div>
                  </div>
                  <button
                    onClick={() => resetType(type.id)}
                    disabled={!typeCustomized}
                    style={{
                      padding: "4px 10px", borderRadius: 6, fontSize: 10.5, fontWeight: 600,
                      background: "transparent",
                      color: typeCustomized ? "#6B7670" : "rgba(107,118,112,0.3)",
                      border: "1px solid rgba(15,31,31,0.08)",
                      cursor: typeCustomized ? "pointer" : "not-allowed",
                    }}
                  >
                    ↶ Reset ce type
                  </button>
                </div>

                {/* Tableau des tailles pour ce type */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 110px 110px", gap: 8, alignItems: "center", paddingBottom: 6, borderBottom: "1px solid rgba(15,31,31,0.06)", marginBottom: 6 }}>
                  <div style={{ fontSize: 9.5, fontWeight: 700, color: "#6B7670", letterSpacing: "0.08em", textTransform: "uppercase" }}>Taille</div>
                  <div style={{ fontSize: 9.5, fontWeight: 700, color: "#6B7670", letterSpacing: "0.08em", textTransform: "uppercase", textAlign: "center" }}>Je le fais (j)</div>
                  <div style={{ fontSize: 9.5, fontWeight: 700, color: "#6B7670", letterSpacing: "0.08em", textTransform: "uppercase", textAlign: "center" }}>Je pilote (j)</div>
                </div>

                {SIZE_LIST.map((size) => {
                  const kiactVal = getValue(type.id, size.id, "kiact");
                  const pilotingVal = getValue(type.id, size.id, "piloting");
                  return (
                    <div key={size.id} style={{ display: "grid", gridTemplateColumns: "1fr 110px 110px", gap: 8, alignItems: "center", padding: "6px 0" }}>
                      <div>
                        <span style={{ fontSize: 13, fontWeight: 600, color: "#0f1f1f" }}>{size.label}</span>
                        <span style={{ fontSize: 11, color: "#6B7670", marginLeft: 8 }}>{size.desc}</span>
                      </div>
                      <input
                        type="number"
                        step="0.125"
                        min="0"
                        value={kiactVal}
                        onChange={(e) => setValue(type.id, size.id, "kiact", e.target.value)}
                        style={{
                          padding: "6px 10px", borderRadius: 6, fontSize: 12.5,
                          border: `1.5px solid ${isUserValue(type.id, size.id, "kiact") ? "#388D54" : "rgba(15,31,31,0.12)"}`,
                          background: isUserValue(type.id, size.id, "kiact") ? "rgba(56,141,84,0.04)" : "white",
                          fontStyle: isUserValue(type.id, size.id, "kiact") ? "normal" : "italic",
                          color: isUserValue(type.id, size.id, "kiact") ? "#0f1f1f" : "#6B7670",
                          textAlign: "center", outline: "none",
                        }}
                      />
                      <input
                        type="number"
                        step="0.125"
                        min="0"
                        value={pilotingVal}
                        onChange={(e) => setValue(type.id, size.id, "piloting", e.target.value)}
                        style={{
                          padding: "6px 10px", borderRadius: 6, fontSize: 12.5,
                          border: `1.5px solid ${isUserValue(type.id, size.id, "piloting") ? "#388D54" : "rgba(15,31,31,0.12)"}`,
                          background: isUserValue(type.id, size.id, "piloting") ? "rgba(56,141,84,0.04)" : "white",
                          fontStyle: isUserValue(type.id, size.id, "piloting") ? "normal" : "italic",
                          color: isUserValue(type.id, size.id, "piloting") ? "#0f1f1f" : "#6B7670",
                          textAlign: "center", outline: "none",
                        }}
                      />
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>

        {/* Footer actions */}
        <div style={{
          padding: "16px 28px", background: "rgba(15,31,31,0.025)",
          borderTop: "1px solid rgba(15,31,31,0.08)",
          display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12,
        }}>
          {confirmResetAll ? (
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <span style={{ fontSize: 12, color: "#4A5552" }}>
                Restaurer les valeurs système ?
              </span>
              <button
                onClick={resetAll}
                style={{
                  padding: "8px 14px", borderRadius: 8, fontSize: 12, fontWeight: 700,
                  background: "#DC2626", color: "white",
                  border: "1px solid #DC2626", cursor: "pointer",
                }}
              >
                Confirmer
              </button>
              <button
                onClick={() => setConfirmResetAll(false)}
                style={{
                  padding: "8px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600,
                  background: "white", color: "#4A5552",
                  border: "1px solid rgba(15,31,31,0.2)", cursor: "pointer",
                }}
              >
                Annuler
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmResetAll(true)}
              style={{
                padding: "8px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600,
                background: "white", color: "#DC2626",
                border: "1px solid rgba(220,38,38,0.2)", cursor: "pointer",
              }}
            >
              Tout réinitialiser
            </button>
          )}
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={onClose}
              style={{
                padding: "10px 18px", borderRadius: 8, fontSize: 13, fontWeight: 600,
                background: "white", color: "#6B7670",
                border: "1.5px solid rgba(15,31,31,0.12)", cursor: "pointer",
              }}
            >
              Annuler
            </button>
            <button
              onClick={handleSave}
              style={{
                padding: "10px 22px", borderRadius: 8, fontSize: 13, fontWeight: 700,
                background: "linear-gradient(135deg, #388D54 0%, #2f6b1f 100%)",
                color: "white", border: "none", cursor: "pointer",
              }}
            >
              ✓ Enregistrer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// =============================================================================
// COMPOSANT RiskToolStep — Grille KiAct alignée sur les 14 questions FR3.1.a-n
// =============================================================================
// Page dédiée accessible depuis la question fr_3 du diagnostic principal.
// Permet de réaliser une pré-évaluation des risques avec le client en RDV,
// alignée sur les 14 questions officielles du Risk Tool B Lab (FR3.1.a à FR3.1.n).
// IMPORTANT : ceci n'est PAS l'outil officiel B Lab — c'est une grille
// pédagogique de cadrage. L'évaluation officielle se fait via la plateforme
// B Impact (kb.bimpactassessment.net).
// ----- Codes français des sous-exigences (PDF B Lab en français) ------------
const CODE_FR_PREFIX = { FR: "EB", PSG: "MGPP", FW: "TE", JEDI: "JEDI", HR: "DH", CA: "AC", ESC: "GEC", GACA: "APAC" };
const codeWithFr = (c) => {
  const m = /^([A-Z]+)(.*)$/.exec(c);
  if (!m || !CODE_FR_PREFIX[m[1]] || CODE_FR_PREFIX[m[1]] === m[1]) return c;
  return `${c} (${CODE_FR_PREFIX[m[1]]}${m[2]})`;
};
const yearLabel = (y) => (y === 0 ? "Année 0" : `à anticiper, Année ${y}`);

// Conséquences d'une réponse « Oui » au Risk Tool pour ce diagnostic
const RiskConsequence = ({ refCode, ctx }) => {
  if (!ctx || !ctx.size || !ctx.sector) return null;
  const box = (content) => (
    <div style={{ marginBottom: 14, padding: "10px 14px", borderRadius: 6, background: "rgba(124,45,82,0.06)", borderLeft: "3px solid #7C2D52", fontSize: 13, lineHeight: 1.55, color: "#4A5552" }}>
      <div style={{ fontWeight: 600, color: "#0f1f1f", marginBottom: 4, fontSize: 12 }}>Conséquence pour cette entreprise</div>
      {content}
    </div>
  );
  if (!RISK_SIZES.includes(ctx.size)) {
    return box(<div>Le Risk Tool ne s'applique pas aux Micro ni aux entreprises sans collaborateurs. Cette réponse n'ajoute aucune exigence.</div>);
  }
  const rules = riskRulesFor(refCode, ctx);
  const items = [];
  rules.forEach((r) => {
    (r.add || []).forEach((c) => {
      const sr = BLAB_SUBREQS[c];
      const already = subreqApplies(c, ctx);
      items.push(`${codeWithFr(c)} ${already ? "s'applique déjà" : "est ajoutée"}, ${yearLabel(sr ? sr.y : null)}. ${sr ? sr.t : ""}`);
    });
    Object.entries(r.na || {}).forEach(([c, by]) => items.push(`${codeWithFr(c)} est remplacée par ${codeWithFr(by)}.`));
    if (r.consider) items.push(`L'impact doit être intégré dans l'évaluation ${codeWithFr(r.consider)}${subreqApplies(r.consider, ctx) || (r.add || []).includes(r.consider) ? "" : ", si elle s'applique"}.`);
  });
  if (items.length === 0) return box(<div>Pour cette taille et ce secteur, cette réponse n'ajoute aucune exigence.</div>);
  return box(<ul style={{ margin: 0, paddingLeft: 18 }}>{items.map((it, i) => <li key={i} style={{ marginBottom: 4 }}>{it}</li>)}</ul>);
};

// Profils d'usage de l'IA (aide à la réponse FR3.1.c). Seule la distribution
// d'un produit numérique utilisant l'IA déclenche un « Oui » (fr.pdf p. 63 et 64).
const IA_PROFILES = [
  { id: "outil_interne", label: "L'IA sert d'outil de gestion interne", yes: false },
  { id: "logiciels_tiers", label: "L'entreprise utilise des logiciels de tiers qui intègrent de l'IA", yes: false },
  { id: "dev_assiste", label: "L'entreprise développe avec l'aide de l'IA, sans IA dans le produit livré", yes: false },
  { id: "produit_numerique_ia", label: "L'entreprise vend, licencie ou met à disposition un produit numérique qui intègre de l'IA", yes: true },
  { id: "solution_client_ia", label: "L'entreprise livre à un client une solution numérique qui intègre de l'IA, par exemple un agent conversationnel", yes: true },
  { id: "produit_physique_ia", label: "L'entreprise vend un produit physique qui intègre de l'IA", yes: false },
];

const IaProfiles = ({ riskAnswers, setRiskAnswers, ctx }) => {
  const selected = Array.isArray(riskAnswers._iaProfils) ? riskAnswers._iaProfils : [];
  const toggle = (id) => {
    const next = selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id];
    const answers = { ...riskAnswers, _iaProfils: next };
    if (next.length === 0) delete answers.risk_prod_2;
    else answers.risk_prod_2 = next.some((x) => IA_PROFILES.find((p) => p.id === x)?.yes) ? "yes" : "no";
    setRiskAnswers(answers);
  };
  const nonTriggering = selected.filter((x) => !IA_PROFILES.find((p) => p.id === x)?.yes);
  const isSF = ctx && ctx.sector === "services_faible";
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: "#0f1f1f", marginBottom: 6 }}>
        Usage de l'IA par l'entreprise (plusieurs choix possibles, la réponse se déduit des choix)
      </div>
      <div style={{ display: "grid", gap: 6 }}>
        {IA_PROFILES.map((p) => (
          <label key={p.id} style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 13, color: "#4A5552", cursor: "pointer" }}>
            <input type="checkbox" checked={selected.includes(p.id)} onChange={() => toggle(p.id)} style={{ marginTop: 3 }} />
            <span>{p.label} <span style={{ color: p.yes ? "#7C2D52" : "#6B7670", fontWeight: 600 }}>{p.yes ? "· « Oui »" : "· « Non »"}</span></span>
          </label>
        ))}
      </div>
      {nonTriggering.length > 0 && (
        <div style={{ marginTop: 10, padding: "10px 14px", borderRadius: 6, background: "rgba(56,141,84,0.06)", borderLeft: "3px solid #388D54", fontSize: 13, lineHeight: 1.55, color: "#4A5552" }}>
          <div style={{ fontWeight: 600, color: "#0f1f1f", marginBottom: 4, fontSize: 12 }}>Conseil KiAct, hors exigence B Lab</div>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li>Formaliser une charte d'usage de l'IA qui précise les outils autorisés, les données à ne pas saisir et la relecture humaine.</li>
            <li>Tenir un inventaire des outils qui intègrent de l'IA et des données qu'ils traitent.</li>
            <li>Informer les clients lorsque l'IA contribue aux livrables.</li>
            {isSF && <li>Intégrer l'usage de l'IA dans l'évaluation des clients et des projets lorsque HR3.3 ou ESC2.6 s'appliquent.</li>}
            {selected.includes("produit_physique_ia") && <li>B Lab exclut les produits physiques de FR3.1.c. Leurs risques liés à l'IA peuvent néanmoins être traités dans l'évaluation des enjeux de droits humains lorsqu'elle s'applique.</li>}
          </ul>
        </div>
      )}
    </div>
  );
};

const RiskToolStep = ({ riskAnswers, setRiskAnswers, onBackToDiagnostic, ctx }) => {
  // Confirmation de réinitialisation intégrée (confirm() natif bloqué en iframe)
  const [confirmReset, setConfirmReset] = useState(false);
  const totalAnswered = Object.keys(riskAnswers || {}).filter(
    (k) => riskAnswers[k] === "yes" || riskAnswers[k] === "no"
  ).length;
  const totalYes = countRiskYes(riskAnswers);

  const handleAnswer = (questionId, value) => {
    const newAnswers = { ...riskAnswers };
    if (newAnswers[questionId] === value) {
      // Re-cliquer sur la même réponse = la dé-sélectionner
      delete newAnswers[questionId];
    } else {
      newAnswers[questionId] = value;
    }
    setRiskAnswers(newAnswers);
  };

  const handleReset = () => {
    setRiskAnswers({});
    setConfirmReset(false);
  };

  return (
    <div style={{ maxWidth: 980, margin: "0 auto", padding: "32px 24px" }}>
      {/* En-tête de page */}
      <div style={{ marginBottom: 32 }}>
        <div style={{
          fontSize: 11,
          letterSpacing: 1.5,
          fontWeight: 700,
          color: "#388D54",
          marginBottom: 8,
          textTransform: "uppercase",
        }}>
          ÉTAPE OPTIONNELLE  ·  PRÉ-ÉVALUATION DES RISQUES
        </div>
        <h2 className="kiact-display" style={{
          fontSize: 38,
          fontWeight: 700,
          color: "#0f1f1f",
          margin: 0,
          marginBottom: 12,
          lineHeight: 1.15,
        }}>
          Grille KiAct · Profil de risque B Corp
        </h2>
        {ctx && ctx.companyName && (
          <div style={{ fontSize: 16, color: "#4A5552", marginBottom: 16 }}>
            Pour <strong>{ctx.companyName}</strong>
          </div>
        )}

        {/* Encart pédagogique — distinction non-officiel */}
        <div style={{
          background: "rgba(245, 158, 11, 0.08)",
          border: "1px solid rgba(245, 158, 11, 0.3)",
          borderRadius: 10,
          padding: "16px 20px",
          marginTop: 20,
          fontSize: 14,
          lineHeight: 1.6,
          color: "#4A5552",
        }}>
          <div style={{ fontWeight: 600, color: "#0f1f1f", marginBottom: 6 }}>
            Outil de cadrage KiAct, non officiel B Lab
          </div>
          Cette grille est <strong>alignée sur les 14 questions officielles du Risk Tool B Lab</strong> (FR3.1.a à FR3.1.n)
          mais reformulée pédagogiquement par KiAct. <strong>L'évaluation officielle se fait sur la plateforme B Impact</strong> ;
          cet outil vous aide à anticiper les zones de vigilance avant la soumission.
        </div>

        {/* Encart pédagogique — mental model du Risk Tool */}
        <div style={{
          background: "rgba(69, 131, 212, 0.06)",
          border: "1px solid rgba(69, 131, 212, 0.25)",
          borderRadius: 10,
          padding: "16px 20px",
          marginTop: 12,
          fontSize: 14,
          lineHeight: 1.6,
          color: "#4A5552",
        }}>
          <div style={{ fontWeight: 600, color: "#0f1f1f", marginBottom: 8 }}>
            Comment lire ce questionnaire
          </div>
          <div style={{ marginBottom: 8 }}>
            Ce n'est <strong>pas un test à réussir ou échouer</strong>. Répondre « Oui » à plusieurs questions
            ne disqualifie pas l'entreprise et il n'y a aucun score à atteindre.
          </div>
          <div>
            Chaque réponse « Oui » déclenche deux conséquences automatiques sur la plateforme officielle :
            (1) <strong>activation de sous-exigences additionnelles</strong> de due diligence dans PSG, ESC ou HR
            (proportionnées à votre taille et secteur), et (2) <strong>publication transparente</strong> de la
            réponse sur le profil B Corp public de l'entreprise.
          </div>
          <div style={{ marginTop: 8, fontSize: 13, fontStyle: "italic", color: "#6B7670" }}>
            B Lab ne vérifie pas les réponses elles-mêmes, mais la fausse déclaration peut faire l'objet
            d'une enquête ultérieure (FR1.4, exactitude de l'information).
          </div>
        </div>
      </div>

      {/* Barre de progression */}
      <div style={{
        background: "white",
        border: "1px solid rgba(15,31,31,0.08)",
        borderRadius: 12,
        padding: "16px 20px",
        marginBottom: 24,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: 12,
      }}>
        <div style={{ fontSize: 14, color: "#4A5552" }}>
          <strong style={{ color: "#0f1f1f", fontSize: 16 }}>
            {totalAnswered} / {RISK_TOOL_TOTAL_QUESTIONS}
          </strong> questions répondues
          {totalYes > 0 && (
            <span style={{ marginLeft: 12, color: "#388D54", fontWeight: 600 }}>
              · {totalYes} réponse{totalYes > 1 ? "s" : ""} « Oui »
            </span>
          )}
        </div>
        {totalAnswered > 0 && (
          confirmReset ? (
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <span style={{ fontSize: 13, color: "#4A5552" }}>Tout effacer ?</span>
              <button
                onClick={handleReset}
                style={{
                  background: "#DC2626", border: "1px solid #DC2626", color: "white",
                  padding: "6px 14px", borderRadius: 6, cursor: "pointer",
                  fontSize: 13, fontWeight: 700, fontFamily: "inherit",
                }}
              >
                Confirmer
              </button>
              <button
                onClick={() => setConfirmReset(false)}
                style={{
                  background: "transparent", border: "1px solid rgba(15,31,31,0.15)",
                  color: "#4A5552", padding: "6px 14px", borderRadius: 6, cursor: "pointer",
                  fontSize: 13, fontFamily: "inherit",
                }}
              >
                Annuler
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmReset(true)}
              style={{
                background: "transparent",
                border: "1px solid rgba(15,31,31,0.15)",
                color: "#4A5552",
                padding: "6px 14px",
                borderRadius: 6,
                cursor: "pointer",
                fontSize: 13,
                fontFamily: "inherit",
              }}
            >
              ↺ Tout réinitialiser
            </button>
          )
        )}
      </div>

      {/* Sections */}
      {RISK_TOOL_SECTIONS.map((section) => {
        const sectionYes = section.questions.filter(
          (q) => riskAnswers[q.id] === "yes"
        ).length;
        return (
          <div key={section.id} style={{ marginBottom: 32 }}>
            {/* En-tête section */}
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              marginBottom: 16,
              paddingBottom: 12,
              borderBottom: "2px solid #388D54",
            }}>
              <span style={{ fontSize: 28 }}>{section.icon}</span>
              <div style={{ flex: 1 }}>
                <div className="kiact-display" style={{
                  fontSize: 22,
                  fontWeight: 700,
                  color: "#0f1f1f",
                }}>
                  {section.label}
                </div>
                <div style={{ fontSize: 13, color: "#6B7670", marginTop: 2 }}>
                  {section.description}
                </div>
              </div>
              {sectionYes > 0 && (
                <span style={{
                  background: "#388D54",
                  color: "white",
                  fontWeight: 700,
                  fontSize: 13,
                  padding: "4px 12px",
                  borderRadius: 12,
                }}>
                  {sectionYes} « Oui »
                </span>
              )}
            </div>

            {/* Questions de la section */}
            {section.questions.map((q) => {
              const answer = riskAnswers[q.id];
              const isYes = answer === "yes";
              const isNo = answer === "no";
              return (
                <div
                  key={q.id}
                  style={{
                    background: "white",
                    border: isYes
                      ? "1.5px solid rgba(56, 141, 84, 0.35)"
                      : "1px solid rgba(15,31,31,0.08)",
                    borderLeft: isYes
                      ? "5px solid #388D54"
                      : isNo
                        ? "5px solid rgba(124, 201, 86, 0.55)"
                        : "5px solid rgba(15,31,31,0.08)",
                    borderRadius: 10,
                    padding: "20px 24px",
                    marginBottom: 14,
                    transition: "border-color 0.2s",
                  }}
                >
                  {/* Référence officielle */}
                  <div style={{
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: 0.5,
                    color: "#6B7670",
                    marginBottom: 8,
                  }}>
                    {q.ref}
                  </div>

                  {/* Question */}
                  <div style={{
                    fontSize: 15,
                    lineHeight: 1.5,
                    color: "#0f1f1f",
                    fontWeight: 500,
                    marginBottom: 14,
                  }}>
                    {q.question}
                  </div>

                  {/* Boutons réponse */}
                  <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
                    <button
                      onClick={() => handleAnswer(q.id, "yes")}
                      style={{
                        background: isYes ? "#388D54" : "white",
                        color: isYes ? "white" : "#4A5552",
                        border: isYes
                          ? "1.5px solid #388D54"
                          : "1.5px solid rgba(15,31,31,0.15)",
                        padding: "8px 24px",
                        borderRadius: 8,
                        cursor: "pointer",
                        fontSize: 14,
                        fontWeight: isYes ? 600 : 500,
                        fontFamily: "inherit",
                        minWidth: 100,
                      }}
                    >
                      Oui
                    </button>
                    <button
                      onClick={() => handleAnswer(q.id, "no")}
                      style={{
                        background: isNo ? "#7CC956" : "white",
                        color: isNo ? "white" : "#4A5552",
                        border: isNo
                          ? "1.5px solid #7CC956"
                          : "1.5px solid rgba(15,31,31,0.15)",
                        padding: "8px 24px",
                        borderRadius: 8,
                        cursor: "pointer",
                        fontSize: 14,
                        fontWeight: isNo ? 600 : 500,
                        fontFamily: "inherit",
                        minWidth: 100,
                      }}
                    >
                      Non
                    </button>
                  </div>

                  {q.ref === "FR3.1.c" && (
                    <IaProfiles riskAnswers={riskAnswers} setRiskAnswers={setRiskAnswers} ctx={ctx} />
                  )}
                  {isYes && <RiskConsequence refCode={q.ref} ctx={ctx} />}

                  {/* Note pédagogique */}
                  <div style={{
                    background: "rgba(69, 131, 212, 0.06)",
                    borderLeft: "3px solid #4583D4",
                    padding: "10px 14px",
                    borderRadius: 6,
                    fontSize: 13,
                    lineHeight: 1.55,
                    color: "#4A5552",
                  }}>
                    <div style={{
                      fontWeight: 600,
                      color: "#0f1f1f",
                      marginBottom: 4,
                      fontSize: 12,
                    }}>
                      Pourquoi c'est un signal
                    </div>
                    {q.signal}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}

      {/* Synthèse finale */}
      {totalAnswered === RISK_TOOL_TOTAL_QUESTIONS && (
        <div style={{
          background: "linear-gradient(135deg, #0f1f1f 0%, #1a3838 100%)",
          color: "white",
          borderRadius: 14,
          padding: "28px 32px",
          marginBottom: 24,
        }}>
          <div className="kiact-display" style={{
            fontSize: 22,
            fontWeight: 700,
            marginBottom: 12,
          }}>
            Synthèse · Profil de risque public
          </div>
          {totalYes === 0 ? (
            <div style={{ fontSize: 15, lineHeight: 1.6 }}>
              Sur les 14 questions du Risk Tool, <strong style={{ color: "#7CC956" }}>aucune réponse « Oui »</strong> n'a été déclarée.
              Aucune sous-exigence additionnelle ne sera donc activée par ce questionnaire. Le profil de risque
              public restera vierge.
              <div style={{
                marginTop: 14,
                fontSize: 13,
                fontStyle: "italic",
                color: "rgba(255,255,255,0.75)",
              }}>
                À confirmer sur la plateforme officielle B Impact, où l'évaluation est définitive.
              </div>
            </div>
          ) : (
            <div style={{ fontSize: 15, lineHeight: 1.6 }}>
              <div style={{ marginBottom: 14 }}>
                <strong style={{ color: "#7CC956", fontSize: 28, marginRight: 8 }}>{totalYes}</strong>
                réponse{totalYes > 1 ? "s" : ""} « Oui » sur 14 questions, soit
                {" "}{totalYes} domaine{totalYes > 1 ? "s" : ""} d'exigences additionnelles à anticiper.
              </div>

              <div style={{
                background: "rgba(124,201,86,0.10)",
                border: "1px solid rgba(124,201,86,0.25)",
                borderRadius: 8,
                padding: "12px 16px",
                marginBottom: 14,
                fontSize: 14,
                lineHeight: 1.55,
              }}>
                <strong style={{ color: "#7CC956" }}>Ce n'est pas un score d'échec.</strong> Répondre « Oui »
                ne disqualifie pas l'entreprise et ne change pas son éligibilité (déjà couverte par FR1.2). Les
                « Oui » activent simplement des exigences additionnelles à respecter dans la suite de l'évaluation.
              </div>

              <div style={{ color: "rgba(255,255,255,0.85)", marginBottom: 14 }}>
                <strong style={{ color: "white" }}>Conséquences automatiques sur la plateforme officielle :</strong>
                <ul style={{ marginTop: 8, paddingLeft: 22, lineHeight: 1.7 }}>
                  <li>
                    <strong>Activation de sous-exigences</strong> dans les Impact Topics PSG (Mission &amp; Gouvernance),
                    ESC (Environnement &amp; Circularité) et HR (Droits Humains), proportionnées à la taille
                    et au secteur de l'entreprise.
                  </li>
                  <li>
                    <strong>Publication transparente</strong> des réponses sur le profil B Corp public, visibles
                    par tous les stakeholders après certification.
                  </li>
                </ul>
              </div>

              <div style={{
                marginTop: 16,
                paddingTop: 14,
                borderTop: "1px solid rgba(255,255,255,0.15)",
                fontSize: 13,
                color: "rgba(255,255,255,0.7)",
              }}>
                <strong style={{ color: "rgba(255,255,255,0.9)" }}>À anticiper :</strong> préparer
                la due diligence (politiques, processus, mesures) sur chaque réponse « Oui », et soigner
                la communication publique sur ces points qui seront visibles sur la fiche B Corp.
              </div>
            </div>
          )}
        </div>
      )}

      {/* Bouton retour */}
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 12,
        marginTop: 24,
        flexWrap: "wrap",
      }}>
        <button
          onClick={onBackToDiagnostic}
          style={{
            background: "white",
            color: "#0f1f1f",
            border: "1.5px solid rgba(15,31,31,0.15)",
            padding: "10px 22px",
            borderRadius: 8,
            cursor: "pointer",
            fontSize: 14,
            fontWeight: 500,
            fontFamily: "inherit",
          }}
        >
          ← Retour au diagnostic
        </button>
        <div style={{ fontSize: 12, color: "#6B7670" }}>
          Les réponses sont automatiquement enregistrées
        </div>
      </div>
    </div>
  );
};

// =============================================================================
// COMPOSANT JediMenuStep — Menu interactif des 19 actions JEDI2
// =============================================================================
// Page dédiée accessible depuis la question jedi_2 du diagnostic principal.
// Permet de cocher les actions JEDI2 déjà en place, avec compteur calibré
// sur la taille de l'entreprise (Année 0 vs Années 3/5).
// Source : B Lab Knowledge Hub — Impact Topic Summary for JEDI (art. 43000760403)
const JediMenuStep = ({ jediAnswers, setJediAnswers, onBackToDiagnostic, ctx }) => {
  // Confirmation de réinitialisation intégrée (confirm() natif bloqué en iframe)
  const [confirmReset, setConfirmReset] = useState(false);
  const sizeBucket = sizeToBucket(ctx.size);
  const req = getJedi2Req(sizeBucket);
  const allowedSets = req.sets; // ensembles disponibles selon la taille
  const totalDone = countJediDone(jediAnswers);

  // Libellé lisible de la taille
  const SIZE_LABELS = {
    individuelle: "Entreprise sans collaborateurs",
    micro: "Micro-entreprise",
    petite: "Petite entreprise",
    moyenne: "Moyenne entreprise",
    grande: "Grande entreprise",
    xl: "Très grande entreprise (XL)",
    xxl: "Très grande entreprise (XXL)",
  };

  const handleToggle = (actionRef) => {
    const newAnswers = { ...jediAnswers };
    if (newAnswers[actionRef] === "done") {
      delete newAnswers[actionRef];
    } else {
      newAnswers[actionRef] = "done";
    }
    setJediAnswers(newAnswers);
  };

  const handleReset = () => {
    setJediAnswers({});
    setConfirmReset(false);
  };

  // Statut Année 0 / 3 / 5
  const y0Met = totalDone >= req.y0;
  const y3Met = totalDone >= req.y3;
  const y5Met = totalDone >= req.y5;

  return (
    <div style={{ maxWidth: 980, margin: "0 auto", padding: "32px 24px" }}>
      {/* En-tête */}
      <div style={{ marginBottom: 32 }}>
        <div style={{
          fontSize: 11,
          letterSpacing: 1.5,
          fontWeight: 700,
          color: "#7C5E0E",
          marginBottom: 8,
          textTransform: "uppercase",
        }}>
          JEDI2  ·  MENU DES 19 ACTIONS
        </div>
        <h2 className="kiact-display" style={{
          fontSize: 38,
          fontWeight: 700,
          color: "#0f1f1f",
          margin: 0,
          marginBottom: 12,
          lineHeight: 1.15,
        }}>
          Actions JEDI · Sélection et compteur
        </h2>
        {ctx && ctx.companyName && (
          <div style={{ fontSize: 16, color: "#4A5552", marginBottom: 8 }}>
            Pour <strong>{ctx.companyName}</strong>, {SIZE_LABELS[sizeBucket] || sizeBucket}
            {" "}<span style={{ color: "#6B7670" }}>(barème {req.ref})</span>
          </div>
        )}

        {/* Encart pédagogique */}
        <div style={{
          background: "rgba(124, 94, 14, 0.07)",
          border: "1px solid rgba(124, 94, 14, 0.25)",
          borderRadius: 10,
          padding: "16px 20px",
          marginTop: 16,
          fontSize: 14,
          lineHeight: 1.6,
          color: "#4A5552",
        }}>
          <div style={{ fontWeight: 600, color: "#0f1f1f", marginBottom: 6 }}>
            Comment fonctionne JEDI2
          </div>
          JEDI2 est un <strong>menu de choix</strong>, pas une liste d'obligations. L'entreprise
          ne réalise pas les 19 actions : elle en sélectionne un nombre <strong>calibré sur sa taille</strong>,
          en puisant dans les ensembles disponibles. Une même action peut être maintenue et comptée
          sur plusieurs années (0, 3 et 5).
          {sizeBucket === "individuelle" && (
            <div style={{ marginTop: 8, fontStyle: "italic" }}>
              Pour une entreprise sans collaborateurs (JEDI2.1), seuls les ensembles
              « Socle » et « Au-delà » sont disponibles. L'ensemble « Lieu de travail » ne s'applique pas.
            </div>
          )}
        </div>
      </div>

      {/* Compteur par année */}
      <div style={{
        background: "white",
        border: "1px solid rgba(15,31,31,0.08)",
        borderRadius: 12,
        padding: "20px 24px",
        marginBottom: 24,
      }}>
        <div style={{
          display: "flex",
          alignItems: "baseline",
          gap: 10,
          marginBottom: 16,
          flexWrap: "wrap",
        }}>
          <span style={{ fontSize: 32, fontWeight: 700, color: "#7C5E0E" }}>
            {totalDone}
          </span>
          <span style={{ fontSize: 15, color: "#4A5552" }}>
            action{totalDone > 1 ? "s" : ""} JEDI2 sélectionnée{totalDone > 1 ? "s" : ""} sur {JEDI2_TOTAL_ACTIONS} options
          </span>
        </div>

        {/* 3 jalons */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
          {[
            { label: "Année 0", sub: "Recertification immédiate", n: req.y0, met: y0Met },
            { label: "Année 3", sub: "Premier jalon", n: req.y3, met: y3Met },
            { label: "Année 5", sub: "Second jalon", n: req.y5, met: y5Met },
          ].map((jalon, i) => (
            <div key={i} style={{
              padding: "14px 16px",
              borderRadius: 10,
              background: jalon.met ? "rgba(56,141,84,0.08)" : "rgba(15,31,31,0.03)",
              border: jalon.met ? "1.5px solid rgba(56,141,84,0.35)" : "1px solid rgba(15,31,31,0.1)",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                <span style={{ fontSize: 14 }}>{jalon.met ? "●" : "○"}</span>
                <span style={{ fontWeight: 700, fontSize: 14, color: "#0f1f1f" }}>{jalon.label}</span>
              </div>
              <div style={{ fontSize: 12, color: "#6B7670", marginBottom: 6 }}>{jalon.sub}</div>
              <div style={{ fontSize: 13, color: jalon.met ? "#388D54" : "#4A5552", fontWeight: 600 }}>
                {totalDone} / {jalon.n} action{jalon.n > 1 ? "s" : ""} requise{jalon.n > 1 ? "s" : ""}
              </div>
            </div>
          ))}
        </div>

        {!y0Met && (
          <div style={{
            marginTop: 14,
            padding: "10px 14px",
            background: "rgba(245,158,11,0.08)",
            borderLeft: "3px solid #F59E0B",
            borderRadius: 6,
            fontSize: 13,
            color: "#4A5552",
          }}>
            Pour l'<strong>Année 0</strong>, il manque{" "}
            <strong>{req.y0 - totalDone} action{(req.y0 - totalDone) > 1 ? "s" : ""}</strong>{" "}
            à sélectionner et mettre en œuvre.
          </div>
        )}

        {totalDone > 0 && (
          <div style={{ marginTop: 14, display: "flex", justifyContent: "flex-end" }}>
            {confirmReset ? (
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <span style={{ fontSize: 13, color: "#4A5552" }}>Tout effacer ?</span>
                <button
                  onClick={handleReset}
                  style={{
                    background: "#DC2626", border: "1px solid #DC2626", color: "white",
                    padding: "6px 14px", borderRadius: 6, cursor: "pointer",
                    fontSize: 13, fontWeight: 700, fontFamily: "inherit",
                  }}
                >
                  Confirmer
                </button>
                <button
                  onClick={() => setConfirmReset(false)}
                  style={{
                    background: "transparent", border: "1px solid rgba(15,31,31,0.15)",
                    color: "#4A5552", padding: "6px 14px", borderRadius: 6, cursor: "pointer",
                    fontSize: 13, fontFamily: "inherit",
                  }}
                >
                  Annuler
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmReset(true)}
                style={{
                  background: "transparent",
                  border: "1px solid rgba(15,31,31,0.15)",
                  color: "#4A5552",
                  padding: "6px 14px",
                  borderRadius: 6,
                  cursor: "pointer",
                  fontSize: 13,
                  fontFamily: "inherit",
                }}
              >
                ↺ Tout réinitialiser
              </button>
            )}
          </div>
        )}
      </div>

      {/* Les 3 ensembles d'actions */}
      {JEDI2_SETS.map((set) => {
        const isAllowed = allowedSets.includes(set.id);
        const setDone = set.actions.filter(a => jediAnswers[a.ref] === "done").length;
        return (
          <div key={set.id} style={{ marginBottom: 28, opacity: isAllowed ? 1 : 0.5 }}>
            {/* En-tête de l'ensemble */}
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              marginBottom: 14,
              paddingBottom: 10,
              borderBottom: "2px solid #7C5E0E",
            }}>
              <span style={{ fontSize: 26 }}>{set.icon}</span>
              <div style={{ flex: 1 }}>
                <div className="kiact-display" style={{ fontSize: 20, fontWeight: 700, color: "#0f1f1f" }}>
                  {set.label}
                  <span style={{ fontSize: 13, fontWeight: 500, color: "#6B7670", marginLeft: 8 }}>
                    {set.labelEn} · {set.actions[0].ref}–{set.actions[set.actions.length - 1].ref}
                  </span>
                </div>
                <div style={{ fontSize: 12.5, color: "#6B7670", marginTop: 2, lineHeight: 1.45 }}>
                  {set.description}
                </div>
              </div>
              {isAllowed ? (
                setDone > 0 && (
                  <span style={{
                    background: "#388D54",
                    color: "white",
                    fontWeight: 700,
                    fontSize: 13,
                    padding: "4px 12px",
                    borderRadius: 12,
                    whiteSpace: "nowrap",
                  }}>
                    {setDone} action{setDone > 1 ? "s" : ""}
                  </span>
                )
              ) : (
                <span style={{
                  background: "rgba(15,31,31,0.1)",
                  color: "#6B7670",
                  fontWeight: 600,
                  fontSize: 12,
                  padding: "4px 12px",
                  borderRadius: 12,
                  whiteSpace: "nowrap",
                }}>
                  Non applicable
                </span>
              )}
            </div>

            {/* Liste des actions */}
            {set.actions.map((action) => {
              const isDone = jediAnswers[action.ref] === "done";
              return (
                <div
                  key={action.ref}
                  onClick={() => isAllowed && handleToggle(action.ref)}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 12,
                    padding: "12px 16px",
                    marginBottom: 8,
                    background: "white",
                    border: isDone
                      ? "1.5px solid rgba(56,141,84,0.4)"
                      : "1px solid rgba(15,31,31,0.08)",
                    borderLeft: isDone
                      ? "5px solid #388D54"
                      : "5px solid rgba(15,31,31,0.08)",
                    borderRadius: 8,
                    cursor: isAllowed ? "pointer" : "not-allowed",
                  }}
                >
                  {/* Case à cocher */}
                  <div style={{
                    width: 22,
                    height: 22,
                    borderRadius: 5,
                    flexShrink: 0,
                    marginTop: 1,
                    background: isDone ? "#388D54" : "white",
                    border: isDone ? "1.5px solid #388D54" : "1.5px solid rgba(15,31,31,0.25)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "white",
                    fontSize: 14,
                    fontWeight: 700,
                  }}>
                    {isDone ? "✓" : ""}
                  </div>
                  {/* Texte */}
                  <div style={{ flex: 1 }}>
                    <div style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: "#7C5E0E",
                      marginBottom: 2,
                    }}>
                      {action.ref}
                    </div>
                    <div style={{
                      fontSize: 14,
                      lineHeight: 1.45,
                      color: "#0f1f1f",
                    }}>
                      {action.label}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}

      {/* Synthèse finale */}
      <div style={{
        background: "linear-gradient(135deg, #0f1f1f 0%, #1a3838 100%)",
        color: "white",
        borderRadius: 14,
        padding: "28px 32px",
        marginBottom: 24,
      }}>
        <div className="kiact-display" style={{ fontSize: 22, fontWeight: 700, marginBottom: 12 }}>
          Synthèse · Actions JEDI2
        </div>
        <div style={{ fontSize: 15, lineHeight: 1.6 }}>
          <div style={{ marginBottom: 10 }}>
            <strong style={{ color: "#7CC956", fontSize: 26, marginRight: 8 }}>{totalDone}</strong>
            action{totalDone > 1 ? "s" : ""} sélectionnée{totalDone > 1 ? "s" : ""} sur {JEDI2_TOTAL_ACTIONS} options du menu.
          </div>
          {y0Met ? (
            <div style={{ color: "rgba(255,255,255,0.85)" }}>
              La cible <strong>Année 0</strong> ({req.y0} action{req.y0 > 1 ? "s" : ""}) est atteinte pour l'Année 0.
              {!y3Met && (
                <span> Pour anticiper l'<strong>Année 3</strong>, il faudra atteindre {req.y3} actions
                {" "}(soit {req.y3 - totalDone} de plus).</span>
              )}
              {y3Met && !y5Met && (
                <span> Cible Année 3 également atteinte. Année 5 : {req.y5} actions requises.</span>
              )}
              {y5Met && (
                <span> Les cibles Années 3 et 5 sont également couvertes. La trajectoire JEDI2 est complète.</span>
              )}
            </div>
          ) : (
            <div style={{ color: "rgba(255,255,255,0.85)" }}>
              Pour l'<strong>Année 0</strong>, {req.y0} action{req.y0 > 1 ? "s" : ""} doi{req.y0 > 1 ? "vent" : "t"} être
              mise{req.y0 > 1 ? "s" : ""} en œuvre. Il en manque <strong style={{ color: "#F59E0B" }}>{req.y0 - totalDone}</strong>.
            </div>
          )}
          <div style={{
            marginTop: 14,
            paddingTop: 12,
            borderTop: "1px solid rgba(255,255,255,0.15)",
            fontSize: 13,
            color: "rgba(255,255,255,0.7)",
          }}>
            Rappel : dès la taille Petite, les actions choisies doivent être consignées dans un
            <strong> plan JEDI documenté</strong>, nourri par les données et retours de JEDI1.
          </div>
        </div>
      </div>

      {/* Retour */}
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 12,
        marginTop: 24,
        flexWrap: "wrap",
      }}>
        <button
          onClick={onBackToDiagnostic}
          style={{
            background: "white",
            color: "#0f1f1f",
            border: "1.5px solid rgba(15,31,31,0.15)",
            padding: "10px 22px",
            borderRadius: 8,
            cursor: "pointer",
            fontSize: 14,
            fontWeight: 500,
            fontFamily: "inherit",
          }}
        >
          ← Retour au diagnostic
        </button>
        <div style={{ fontSize: 12, color: "#6B7670" }}>
          Les sélections sont automatiquement enregistrées
        </div>
      </div>
    </div>
  );
};

// =============================================================================
// COMPOSANT GacaMenuStep — Menu interactif des 5 actions collectives GACA2
// =============================================================================
// Page dédiée accessible depuis la question gaca_3 du diagnostic principal.
// Permet de cocher les actions collectives déjà en place, avec compteur calibré
// sur la taille de l'entreprise (Année 0 vs Années 3/5).
// Source : B Lab Knowledge Hub — Impact Topic Summary for GACA (art. 43000759315)
const GacaMenuStep = ({ gacaAnswers, setGacaAnswers, onBackToDiagnostic, ctx }) => {
  // Confirmation de réinitialisation intégrée (confirm() natif bloqué en iframe)
  const [confirmReset, setConfirmReset] = useState(false);
  const sizeBucket = sizeToBucket(ctx.size);
  const req = getGaca2Req(sizeBucket);
  const totalDone = countGacaDone(gacaAnswers);

  const SIZE_LABELS = {
    individuelle: "Entreprise sans collaborateurs",
    micro: "Micro-entreprise",
    petite: "Petite entreprise",
    moyenne: "Moyenne entreprise",
    grande: "Grande entreprise",
    xl: "Très grande entreprise (XL)",
    xxl: "Très grande entreprise (XXL)",
  };

  const handleToggle = (actionId) => {
    const newAnswers = { ...gacaAnswers };
    if (newAnswers[actionId] === "done") {
      delete newAnswers[actionId];
    } else {
      newAnswers[actionId] = "done";
    }
    setGacaAnswers(newAnswers);
  };

  const handleReset = () => {
    setGacaAnswers({});
    setConfirmReset(false);
  };

  const y0Met = totalDone >= req.y0;
  const y3Met = totalDone >= req.y3;
  const y5Met = totalDone >= req.y5;

  // GACA2.6 : pour Large/XL/XXL, au moins une action doit être "collaboration" ou "plaidoyer"
  const hasHighImpact = gacaAnswers["collaboration"] === "done" || gacaAnswers["plaidoyer"] === "done";

  return (
    <div style={{ maxWidth: 980, margin: "0 auto", padding: "32px 24px" }}>
      {/* En-tête */}
      <div style={{ marginBottom: 32 }}>
        <div style={{
          fontSize: 11,
          letterSpacing: 1.5,
          fontWeight: 700,
          color: "#5b3a8a",
          marginBottom: 8,
          textTransform: "uppercase",
        }}>
          GACA2  ·  MENU DES ACTIONS COLLECTIVES
        </div>
        <h2 className="kiact-display" style={{
          fontSize: 38,
          fontWeight: 700,
          color: "#0f1f1f",
          margin: 0,
          marginBottom: 12,
          lineHeight: 1.15,
        }}>
          Actions collectives · Sélection et compteur
        </h2>
        {ctx && ctx.companyName && (
          <div style={{ fontSize: 16, color: "#4A5552", marginBottom: 8 }}>
            Pour <strong>{ctx.companyName}</strong>, {SIZE_LABELS[sizeBucket] || sizeBucket}
            {" "}<span style={{ color: "#6B7670" }}>(barème {req.ref})</span>
          </div>
        )}

        {/* Encart pédagogique */}
        <div style={{
          background: "rgba(91, 58, 138, 0.07)",
          border: "1px solid rgba(91, 58, 138, 0.25)",
          borderRadius: 10,
          padding: "16px 20px",
          marginTop: 16,
          fontSize: 14,
          lineHeight: 1.6,
          color: "#4A5552",
        }}>
          <div style={{ fontWeight: 600, color: "#0f1f1f", marginBottom: 6 }}>
            Comment fonctionne GACA2
          </div>
          GACA2 est un <strong>menu de choix</strong> : l'entreprise sélectionne et met en œuvre
          un nombre d'actions collectives <strong>calibré sur sa taille</strong>, parmi 5 types reconnus.
          Toutes les actions collectives doivent contribuer à un monde plus durable et équitable.
          {req.gaca26 && (
            <div style={{ marginTop: 8, fontStyle: "italic" }}>
              Pour les entreprises Grande, XL et XXL, GACA2.6 ajoute une exigence à partir de l'Année 3 :
              au moins une action collective doit être une <strong>collaboration multi-parties</strong> ou
              du <strong>plaidoyer politique</strong> (les formes les plus structurantes).
            </div>
          )}
        </div>
      </div>

      {/* Compteur par année */}
      <div style={{
        background: "white",
        border: "1px solid rgba(15,31,31,0.08)",
        borderRadius: 12,
        padding: "20px 24px",
        marginBottom: 24,
      }}>
        <div style={{
          display: "flex",
          alignItems: "baseline",
          gap: 10,
          marginBottom: 16,
          flexWrap: "wrap",
        }}>
          <span style={{ fontSize: 32, fontWeight: 700, color: "#5b3a8a" }}>
            {totalDone}
          </span>
          <span style={{ fontSize: 15, color: "#4A5552" }}>
            action{totalDone > 1 ? "s" : ""} collective{totalDone > 1 ? "s" : ""} sélectionnée{totalDone > 1 ? "s" : ""} sur {GACA2_TOTAL_ACTIONS} types
          </span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
          {[
            { label: "Année 0", sub: "Recertification immédiate", n: req.y0, met: y0Met },
            { label: "Année 3", sub: "Premier jalon", n: req.y3, met: y3Met },
            { label: "Année 5", sub: "Second jalon", n: req.y5, met: y5Met },
          ].map((jalon, i) => (
            <div key={i} style={{
              padding: "14px 16px",
              borderRadius: 10,
              background: jalon.met ? "rgba(56,141,84,0.08)" : "rgba(15,31,31,0.03)",
              border: jalon.met ? "1.5px solid rgba(56,141,84,0.35)" : "1px solid rgba(15,31,31,0.1)",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                <span style={{ fontSize: 14 }}>{jalon.met ? "●" : "○"}</span>
                <span style={{ fontWeight: 700, fontSize: 14, color: "#0f1f1f" }}>{jalon.label}</span>
              </div>
              <div style={{ fontSize: 12, color: "#6B7670", marginBottom: 6 }}>{jalon.sub}</div>
              <div style={{ fontSize: 13, color: jalon.met ? "#388D54" : "#4A5552", fontWeight: 600 }}>
                {totalDone} / {jalon.n} action{jalon.n > 1 ? "s" : ""} requise{jalon.n > 1 ? "s" : ""}
              </div>
            </div>
          ))}
        </div>

        {!y0Met && (
          <div style={{
            marginTop: 14,
            padding: "10px 14px",
            background: "rgba(245,158,11,0.08)",
            borderLeft: "3px solid #F59E0B",
            borderRadius: 6,
            fontSize: 13,
            color: "#4A5552",
          }}>
            Pour l'<strong>Année 0</strong>, il manque{" "}
            <strong>{req.y0 - totalDone} action{(req.y0 - totalDone) > 1 ? "s" : ""}</strong>{" "}
            collective{(req.y0 - totalDone) > 1 ? "s" : ""} à sélectionner et mettre en œuvre.
          </div>
        )}

        {req.gaca26 && totalDone > 0 && !hasHighImpact && (
          <div style={{
            marginTop: 10,
            padding: "10px 14px",
            background: "rgba(69,131,212,0.07)",
            borderLeft: "3px solid #4583D4",
            borderRadius: 6,
            fontSize: 13,
            color: "#4A5552",
          }}>
            <strong>GACA2.6 (Années 3-5)</strong> : aucune action « collaboration multi-parties »
            ou « plaidoyer politique » n'est sélectionnée. Pour les Grandes, XL et XXL, au moins
            l'une de ces deux formes sera requise dès l'Année 3.
          </div>
        )}

        {totalDone > 0 && (
          <div style={{ marginTop: 14, display: "flex", justifyContent: "flex-end" }}>
            {confirmReset ? (
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <span style={{ fontSize: 13, color: "#4A5552" }}>Tout effacer ?</span>
                <button
                  onClick={handleReset}
                  style={{
                    background: "#DC2626", border: "1px solid #DC2626", color: "white",
                    padding: "6px 14px", borderRadius: 6, cursor: "pointer",
                    fontSize: 13, fontWeight: 700, fontFamily: "inherit",
                  }}
                >
                  Confirmer
                </button>
                <button
                  onClick={() => setConfirmReset(false)}
                  style={{
                    background: "transparent", border: "1px solid rgba(15,31,31,0.15)",
                    color: "#4A5552", padding: "6px 14px", borderRadius: 6, cursor: "pointer",
                    fontSize: 13, fontFamily: "inherit",
                  }}
                >
                  Annuler
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmReset(true)}
                style={{
                  background: "transparent",
                  border: "1px solid rgba(15,31,31,0.15)",
                  color: "#4A5552",
                  padding: "6px 14px",
                  borderRadius: 6,
                  cursor: "pointer",
                  fontSize: 13,
                  fontFamily: "inherit",
                }}
              >
                ↺ Tout réinitialiser
              </button>
            )}
          </div>
        )}
      </div>

      {/* Les 5 actions collectives */}
      <div style={{ marginBottom: 28 }}>
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          marginBottom: 14,
          paddingBottom: 10,
          borderBottom: "2px solid #5b3a8a",
        }}>
          <span style={{ fontSize: 24 }}>◖</span>
          <div className="kiact-display" style={{ fontSize: 20, fontWeight: 700, color: "#0f1f1f" }}>
            Les 5 types d'action collective
          </div>
        </div>

        {GACA2_ACTIONS.map((action) => {
          const isDone = gacaAnswers[action.id] === "done";
          const isHighImpact = action.id === "collaboration" || action.id === "plaidoyer";
          return (
            <div
              key={action.id}
              onClick={() => handleToggle(action.id)}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 14,
                padding: "16px 18px",
                marginBottom: 10,
                background: "white",
                border: isDone
                  ? "1.5px solid rgba(56,141,84,0.4)"
                  : "1px solid rgba(15,31,31,0.08)",
                borderLeft: isDone
                  ? "5px solid #388D54"
                  : "5px solid rgba(15,31,31,0.08)",
                borderRadius: 10,
                cursor: "pointer",
              }}
            >
              {/* Case à cocher */}
              <div style={{
                width: 24,
                height: 24,
                borderRadius: 6,
                flexShrink: 0,
                marginTop: 2,
                background: isDone ? "#388D54" : "white",
                border: isDone ? "1.5px solid #388D54" : "1.5px solid rgba(15,31,31,0.25)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "white",
                fontSize: 15,
                fontWeight: 700,
              }}>
                {isDone ? "✓" : ""}
              </div>
              {/* Contenu */}
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 18 }}>{action.icon}</span>
                  <span style={{ fontSize: 15, fontWeight: 700, color: "#0f1f1f" }}>
                    {action.label}
                  </span>
                  {isHighImpact && (
                    <span style={{
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: 0.5,
                      textTransform: "uppercase",
                      color: "#4583D4",
                      background: "rgba(69,131,212,0.1)",
                      padding: "2px 8px",
                      borderRadius: 999,
                    }}>
                      Fort impact · GACA2.6
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 13.5, color: "#4A5552", lineHeight: 1.5, marginBottom: 6 }}>
                  {action.description}
                </div>
                <div style={{ fontSize: 12.5, color: "#6B7670", lineHeight: 1.45, fontStyle: "italic" }}>
                  Exemples : {action.examples}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Synthèse finale */}
      <div style={{
        background: "linear-gradient(135deg, #0f1f1f 0%, #1a3838 100%)",
        color: "white",
        borderRadius: 14,
        padding: "28px 32px",
        marginBottom: 24,
      }}>
        <div className="kiact-display" style={{ fontSize: 22, fontWeight: 700, marginBottom: 12 }}>
          Synthèse · Actions collectives GACA2
        </div>
        <div style={{ fontSize: 15, lineHeight: 1.6 }}>
          <div style={{ marginBottom: 10 }}>
            <strong style={{ color: "#7CC956", fontSize: 26, marginRight: 8 }}>{totalDone}</strong>
            action{totalDone > 1 ? "s" : ""} collective{totalDone > 1 ? "s" : ""} sélectionnée{totalDone > 1 ? "s" : ""} sur {GACA2_TOTAL_ACTIONS} types.
          </div>
          {y0Met ? (
            <div style={{ color: "rgba(255,255,255,0.85)" }}>
              La cible <strong>Année 0</strong> ({req.y0} action{req.y0 > 1 ? "s" : ""}) est atteinte pour l'Année 0.
              {!y3Met && (
                <span> Pour anticiper l'<strong>Année 3</strong>, il faudra atteindre {req.y3} actions
                {" "}(soit {req.y3 - totalDone} de plus).</span>
              )}
              {y3Met && y5Met && (
                <span> Les cibles Années 3 et 5 sont également couvertes.</span>
              )}
            </div>
          ) : (
            <div style={{ color: "rgba(255,255,255,0.85)" }}>
              Pour l'<strong>Année 0</strong>, {req.y0} action{req.y0 > 1 ? "s" : ""} collective{req.y0 > 1 ? "s" : ""} doi{req.y0 > 1 ? "vent" : "t"} être
              mise{req.y0 > 1 ? "s" : ""} en œuvre. Il en manque <strong style={{ color: "#F59E0B" }}>{req.y0 - totalDone}</strong>.
            </div>
          )}
          <div style={{
            marginTop: 14,
            paddingTop: 12,
            borderTop: "1px solid rgba(255,255,255,0.15)",
            fontSize: 13,
            color: "rgba(255,255,255,0.7)",
          }}>
            Rappel : une même action collective peut être maintenue et comptée sur plusieurs
            années (0, 3 et 5) si elle reste active et contribue à un impact mesurable.
          </div>
        </div>
      </div>

      {/* Retour */}
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 12,
        marginTop: 24,
        flexWrap: "wrap",
      }}>
        <button
          onClick={onBackToDiagnostic}
          style={{
            background: "white",
            color: "#0f1f1f",
            border: "1.5px solid rgba(15,31,31,0.15)",
            padding: "10px 22px",
            borderRadius: 8,
            cursor: "pointer",
            fontSize: 14,
            fontWeight: 500,
            fontFamily: "inherit",
          }}
        >
          ← Retour au diagnostic
        </button>
        <div style={{ fontSize: 12, color: "#6B7670" }}>
          Les sélections sont automatiquement enregistrées
        </div>
      </div>
    </div>
  );
};

export default function KiActBCorpDiagnostic() {
  // === ARCHITECTURE MULTI-DIAGNOSTICS ===
  // null = écran d'accueil ; string = id du diagnostic actif
  const [activeId, setActiveId] = useState(null);
  // Index des diagnostics (métadonnées légères)
  const [index, setIndex] = useState([]);
  // Drapeau : true une fois l'index chargé depuis storage
  const [indexLoaded, setIndexLoaded] = useState(false);

  // États du diagnostic actif
  const [step, setStep] = useState(0);
  const [ctx, setCtx] = useState(DEFAULT_CTX);
  const [answers, setAnswers] = useState({});
  const [consultantNotes, setConsultantNotes] = useState({});
  const [consultantMode, setConsultantMode] = useState(false);
  // Réponses Risk Tool (FR3.1) : { risk_emp_1: "yes" | "no" | null, ... }
  const [riskAnswers, setRiskAnswers] = useState({});
  // Réponses menu JEDI2 : { "JEDI2.a": "done", "JEDI2.f": "done", ... }
  const [jediAnswers, setJediAnswers] = useState({});
  // Réponses menu GACA2 : { "mentorat": "done", "plaidoyer": "done", ... }
  const [gacaAnswers, setGacaAnswers] = useState({});
  // Statuts ajustés des documents attendus : { d12: "existant", ... }
  const [docStatus, setDocStatus] = useState({});
  // Drapeau : true une fois le diagnostic actif chargé (évite sauvegarde prématurée)
  const [diagLoaded, setDiagLoaded] = useState(false);

  // Standards utilisateur (charges personnalisées)
  const [userStandards, setUserStandards] = useState(null);
  // Panneau standards ouvert ?
  const [showStandards, setShowStandards] = useState(false);

  // Chargement initial de l'index ET des standards
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [idx, std] = await Promise.all([loadIndex(), loadStandards()]);
      if (!cancelled) {
        const sorted = [...idx].sort((a, b) => (b.savedAt || "").localeCompare(a.savedAt || ""));
        setIndex(sorted);
        setUserStandards(std);
        setIndexLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Chargement d'un diagnostic quand activeId change
  useEffect(() => {
    if (!activeId) {
      setDiagLoaded(false);
      return;
    }
    let cancelled = false;
    setDiagLoaded(false);
    (async () => {
      const data = await loadDiagnostic(activeId);
      if (cancelled) return;
      if (data) {
        setStep(typeof data.step === "number" ? data.step : 0);
        setCtx(migrateCtx(data.ctx) || DEFAULT_CTX);
        setAnswers(data.answers || {});
        setConsultantNotes(data.consultantNotes || {});
        setConsultantMode(typeof data.consultantMode === "boolean" ? data.consultantMode : false);
        setRiskAnswers(data.riskAnswers || {});
        setJediAnswers(data.jediAnswers || {});
        setGacaAnswers(data.gacaAnswers || {});
        setDocStatus(data.docStatus || {});
      } else {
        // Nouveau diagnostic
        setStep(0);
        setCtx(DEFAULT_CTX);
        setAnswers({});
        setConsultantNotes({});
        setConsultantMode(false);
        setRiskAnswers({});
        setJediAnswers({});
        setGacaAnswers({});
        setDocStatus({});
      }
      setDiagLoaded(true);
    })();
    return () => { cancelled = true; };
  }, [activeId]);

  // Calcule la taille B Lab effective via la règle Lesser of Two
  const enrichedCtx = useMemo(() => {
    let size;
    if (ctx.sizeOverride) {
      size = ctx.sizeOverride;
    } else {
      const sFTE = sizeFromFTE(ctx.ftes);
      const revenueNum = parseFloat(String(ctx.revenue || "").replace(",", "."));
      const fxRate = getFxRate(ctx);
      const revenueUSD = !isNaN(revenueNum) && revenueNum >= 0 ? revenueNum * fxRate : null;
      const sRev = revenueUSD !== null ? sizeFromRevenueUSD(revenueUSD) : null;
      size = lesserOfTwo(sFTE, sRev)?.id || null;
    }
    const base = { ...ctx, size };
    // Sous-exigences dues en Année 0 et à anticiper, Risk Tool compris
    return { ...base, req: computeRequirements(base, riskAnswers) };
  }, [ctx, riskAnswers]);

  // Score global (pour les métadonnées de l'index)
  const globalScoreForIndex = useMemo(() => {
    if (step !== 2) return null;
    return computePracticeRates(enrichedCtx, answers).avg;
  }, [step, enrichedCtx, answers]);

  // Sauvegarde automatique du diagnostic actif (après chargement complet),
  // avec debounce de 500ms pour limiter les appels réseau pendant la saisie.
  useEffect(() => {
    if (!activeId || !diagLoaded) return;

    const timeoutId = setTimeout(() => {
      const indexEntry = {
        companyName: ctx.companyName || "(sans nom)",
        sizeLabel: SIZE_TIERS.find((t) => t.id === enrichedCtx.size)?.label || null,
        sectorLabel: SECTORS.find((s) => s.id === ctx.sector)?.label || null,
        step,
        score: globalScoreForIndex,
      };
      upsertDiagnosticAndIndex(
        activeId,
        { step, ctx, answers, consultantNotes, consultantMode, riskAnswers, jediAnswers, gacaAnswers, docStatus },
        indexEntry
      );
      // Mise à jour locale de l'index sans recharger depuis le storage
      // (on a déjà toutes les données en mémoire).
      setIndex((prevIndex) => {
        const existingIdx = prevIndex.findIndex((d) => d.id === activeId);
        const now = new Date().toISOString();
        let updated;
        if (existingIdx >= 0) {
          updated = [...prevIndex];
          updated[existingIdx] = { ...updated[existingIdx], ...indexEntry, savedAt: now };
        } else {
          updated = [...prevIndex, { id: activeId, createdAt: now, savedAt: now, ...indexEntry }];
        }
        return updated.sort((a, b) => (b.savedAt || "").localeCompare(a.savedAt || ""));
      });
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [activeId, diagLoaded, step, ctx, answers, consultantNotes, consultantMode, riskAnswers, jediAnswers, gacaAnswers, docStatus, enrichedCtx.size, globalScoreForIndex]);

  const STEPS = [
    { id: "context", label: "Cadrage" },
    { id: "diag", label: "Diagnostic" },
    { id: "results", label: "Restitution" },
  ];

  // Démarrer un nouveau diagnostic (génère un id et bascule dessus)
  const startNewDiagnostic = () => {
    const id = newId();
    setActiveId(id);
  };

  // Ouvrir un diagnostic existant
  const openDiagnostic = (id) => {
    setActiveId(id);
  };

  // Retour à l'écran d'accueil
  const goHome = () => {
    setActiveId(null);
  };

  // Supprimer un diagnostic depuis l'accueil.
  // La confirmation est gérée dans l'UI de HomeScreen (bouton en deux temps),
  // car confirm() natif est bloqué dans l'iframe sandboxée de l'artefact.
  const handleDeleteDiagnostic = async (id) => {
    await removeDiagnosticAndIndex(id);
    // Mise à jour locale (pas de recharge depuis storage)
    setIndex((prev) => prev.filter((d) => d.id !== id));
  };

  // Archiver / désarchiver un diagnostic
  const handleArchiveDiagnostic = async (id) => {
    await toggleArchiveDiagnostic(id);
    // Mise à jour locale du flag archived
    setIndex((prev) => prev.map((d) =>
      d.id === id
        ? { ...d, archived: !d.archived, archivedAt: !d.archived ? new Date().toISOString() : null }
        : d
    ));
  };

  // Export et import de fichiers
  const [fileNotice, setFileNotice] = useState(null);
  const [filePanel, setFilePanel] = useState(null);
  const exportEntries = async (entries, filename) => {
    const file = await buildExportFile(entries);
    const n = file.diagnostics.length;
    if (n === 0) { setFileNotice({ error: true, text: "Aucun diagnostic à exporter." }); return; }
    if (downloadJson(filename, file)) {
      setFileNotice({ text: `${n} diagnostic${n > 1 ? "s" : ""} exporté${n > 1 ? "s" : ""} dans le fichier ${filename}. Classez-le dans le dossier du client.` });
    } else {
      setFilePanel({ mode: "export", filename, text: JSON.stringify(file, null, 2) });
    }
  };
  // Diagnostic ouvert : export construit depuis la mémoire, sans attendre la sauvegarde différée
  const handleExportActive = () => {
    const entry = { ...(index.find((d) => d.id === activeId) || { id: activeId }), companyName: ctx.companyName || "(sans nom)", step, savedAt: new Date().toISOString() };
    const file = {
      format: EXPORT_FORMAT, version: EXPORT_VERSION, exportedAt: new Date().toISOString(),
      referentiel: "Standards B Lab V2.2 du 20 février 2026",
      diagnostics: [{ index: entry, data: { step, ctx, answers, consultantNotes, consultantMode, riskAnswers, jediAnswers, gacaAnswers, docStatus, savedAt: entry.savedAt } }],
    };
    const filename = `KiAct_Diagnostic_${fileSlug(ctx.companyName)}_${todayIso()}.json`;
    if (downloadJson(filename, file)) return filename;
    setFilePanel({ mode: "export", filename, text: JSON.stringify(file, null, 2) });
    return "";
  };
  const handleExportOne = (entry) => exportEntries([entry], `KiAct_Diagnostic_${fileSlug(entry.companyName)}_${todayIso()}.json`);
  const handleExportAll = () => exportEntries(index, `KiAct_Diagnostics_${todayIso()}.json`);
  const handleImport = async (file) => importFromText(await file.text());
  const importFromText = async (raw) => {
    try {
      const obj = JSON.parse(raw);
      const res = await importExportFile(obj);
      if (res.error) { setFileNotice({ error: true, text: res.error }); return; }
      setIndex([...res.index].sort((a, b) => (b.savedAt || "").localeCompare(a.savedAt || "")));
      const parts = [`${res.imported} diagnostic${res.imported > 1 ? "s" : ""} importé${res.imported > 1 ? "s" : ""}`];
      if (res.kept) parts.push(`${res.kept} conservé${res.kept > 1 ? "s" : ""} tel${res.kept > 1 ? "s" : ""} quel${res.kept > 1 ? "s" : ""}, car la version de ce navigateur est plus récente`);
      if (res.invalid) parts.push(`${res.invalid} illisible${res.invalid > 1 ? "s" : ""}`);
      setFileNotice({ error: res.imported === 0, text: parts.join(", ") + "." });
      setFilePanel(null);
    } catch (e) {
      setFileNotice({ error: true, text: "Le fichier n'a pas pu être lu. Vérifiez qu'il s'agit d'un export JSON de cet outil." });
    }
  };

  // Sauvegarder les standards utilisateur
  const handleSaveStandards = async (newStandards) => {
    await saveStandards(newStandards);
    setUserStandards(newStandards);
    setShowStandards(false);
  };

  // ========================================================================
  // ÉCRAN D'ACCUEIL : choix entre ouvrir un diagnostic existant ou en créer un
  // ========================================================================
  if (!activeId) {
    return (
      <div className="kiact-app">
        <style>{STYLES}</style>
        <Header consultantMode={false} onToggleConsultant={() => {}} onNewSession={() => {}} hasSession={false} hideControls />
        <HomeScreen
          index={index}
          indexLoaded={indexLoaded}
          onNew={startNewDiagnostic}
          onOpen={openDiagnostic}
          onDelete={handleDeleteDiagnostic}
          onArchive={handleArchiveDiagnostic}
          onOpenStandards={() => setShowStandards(true)}
          onExport={handleExportOne}
          onExportAll={handleExportAll}
          onImport={handleImport}
          onPasteOpen={() => setFilePanel({ mode: "import" })}
          fileNotice={fileNotice}
        />
        {filePanel && <FilePanel panel={filePanel} onClose={() => setFilePanel(null)} onPasteImport={importFromText} />}
        {showStandards && (
          <StandardsPanel
            standards={userStandards}
            onSave={handleSaveStandards}
            onClose={() => setShowStandards(false)}
          />
        )}
      </div>
    );
  }

  // ========================================================================
  // DIAGNOSTIC ACTIF
  // ========================================================================
  return (
    <div className="kiact-app">
      <style>{STYLES}</style>
      <Header
        consultantMode={consultantMode}
        onToggleConsultant={() => setConsultantMode(!consultantMode)}
        onNewSession={goHome}
        hasSession={true}
        homeButton
      />
      <StepBar steps={STEPS} currentIndex={step} />
      {filePanel && <FilePanel panel={filePanel} onClose={() => setFilePanel(null)} onPasteImport={importFromText} />}
      {!diagLoaded ? (
        <div style={{ padding: 80, textAlign: "center", color: "#6B7670" }}>
          Chargement du diagnostic…
        </div>
      ) : (
        <>
          {step === 0 && (
            <ContextStep ctx={ctx} setCtx={setCtx} onNext={() => setStep(1)} />
          )}
          {step === 1 && (
            <QuestionnaireStep
              ctx={enrichedCtx}
              answers={answers}
              setAnswers={setAnswers}
              onBack={() => setStep(0)}
              onFinish={() => setStep(2)}
              consultantMode={consultantMode}
              consultantNotes={consultantNotes}
              setConsultantNotes={setConsultantNotes}
              userStandards={userStandards}
              onOpenRiskTool={() => setStep(3)}
              riskAnswers={riskAnswers}
              onOpenJediMenu={() => setStep(4)}
              jediAnswers={jediAnswers}
              onOpenGacaMenu={() => setStep(5)}
              gacaAnswers={gacaAnswers}
            />
          )}
          {step === 2 && (
            <ResultsStep
              ctx={enrichedCtx}
              setCtx={setCtx}
              answers={answers}
              onRestart={goHome}
              onBack={() => setStep(1)}
              consultantMode={consultantMode}
              consultantNotes={consultantNotes}
              setConsultantNotes={setConsultantNotes}
              riskAnswers={riskAnswers}
              onOpenRiskTool={() => setStep(3)}
              jediAnswers={jediAnswers}
              onOpenJediMenu={() => setStep(4)}
              gacaAnswers={gacaAnswers}
              onOpenGacaMenu={() => setStep(5)}
              docStatus={docStatus}
              setDocStatus={setDocStatus}
              onExportFile={handleExportActive}
            />
          )}
          {step === 3 && (
            <RiskToolStep
              riskAnswers={riskAnswers}
              setRiskAnswers={setRiskAnswers}
              onBackToDiagnostic={() => setStep(1)}
              ctx={enrichedCtx}
            />
          )}
          {step === 4 && (
            <JediMenuStep
              jediAnswers={jediAnswers}
              setJediAnswers={setJediAnswers}
              onBackToDiagnostic={() => setStep(1)}
              ctx={enrichedCtx}
            />
          )}
          {step === 5 && (
            <GacaMenuStep
              gacaAnswers={gacaAnswers}
              setGacaAnswers={setGacaAnswers}
              onBackToDiagnostic={() => setStep(1)}
              ctx={enrichedCtx}
            />
          )}
        </>
      )}
    </div>
  );
}
