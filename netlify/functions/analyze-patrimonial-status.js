// /netlify/functions/analyze-patrimonial-status.js
const fetch = (...args) => import('node-fetch').then(({default: f}) => f(...args));
const fs = require('fs');
const path = require('path');

// --- 1. Clé API intégrée directement dans le script (selon la demande) ---
const GEMINI_API_KEY = "AIzaSyDDv4amCchpTXGqz6FGuY8mxPClkw-uwMs";

// --- 2. LECTURE ET PARSING DES DONNÉES DE STATUT ---
const csvPath = path.join(__dirname, 'BDCstatut.csv');
const statusDataRaw = fs.readFileSync(csvPath, 'utf8');

// --- 3. STRUCTURES DE DONNÉES PRÉ-CALCULÉES (POUR L'OPTIMISATION) ---

const OLD_REGIONS_TO_DEPARTMENTS = {
    'Alsace': ['67', '68'], 'Aquitaine': ['24', '33', '40', '47', '64'], 'Auvergne': ['03', '15', '43', '63'],
    'Basse-Normandie': ['14', '50', '61'], 'Bourgogne': ['21', '58', '71', '89'], 'Champagne-Ardenne': ['08', '10', '51', '52'],
    'Franche-Comté': ['25', '39', '70', '90'], 'Haute-Normandie': ['27', '76'], 'Languedoc-Roussillon': ['11', '30', '34', '48', '66'],
    'Limousin': ['19', '23', '87'], 'Lorraine': ['54', '55', '57', '88'], 'Midi-Pyrénées': ['09', '12', '31', '32', '46', '65', '81', '82'],
    'Nord-Pas-de-Calais': ['59', '62'], 'Picardie': ['02', '60', '80'], 'Poitou-Charentes': ['16', '17', '79', '86'],
    'Rhône-Alpes': ['01', '07', '26', '38', '42', '69', '73', '74']
};

const ADMIN_NAME_TO_CODE_MAP = {
    "France": "FR", "Ain": "01", "Aisne": "02", "Allier": "03", "Alpes-de-Haute-Provence": "04", "Hautes-Alpes": "05",
    "Alpes-Maritimes": "06", "Ardèche": "07", "Ardennes": "08", "Ariège": "09", "Aube": "10", "Aude": "11", "Aveyron": "12",
    "Bouches-du-Rhône": "13", "Calvados": "14", "Cantal": "15", "Charente": "16", "Charente-Maritime": "17", "Cher": "18",
    "Corrèze": "19", "Corse-du-Sud": "2A", "Haute-Corse": "2B", "Côte-d'Or": "21", "Côtes-d'Armor": "22", "Creuse": "23",
    "Dordogne": "24", "Doubs": "25", "Drôme": "26", "Eure": "27", "Eure-et-Loir": "28", "Finistère": "29", "Gard": "30",
    "Haute-Garonne": "31", "Gers": "32", "Gironde": "33", "Hérault": "34", "Ille-et-Vilaine": "35", "Indre": "36",
    "Indre-et-Loire": "37", "Isère": "38", "Jura": "39", "Landes": "40", "Loir-et-Cher": "41", "Loire": "42", "Haute-Loire": "43",
    "Loire-Atlantique": "44", "Loiret": "45", "Lot": "46", "Lot-et-Garonne": "47", "Lozère": "48", "Maine-et-Loire": "49",
    "Manche": "50", "Marne": "51", "Haute-Marne": "52", "Mayenne": "53", "Meurthe-et-Moselle": "54", "Meuse": "55", "Morbihan": "56",
    "Moselle": "57", "Nièvre": "58", "Nord": "59", "Oise": "60", "Orne": "61", "Pas-de-Calais": "62", "Puy-de-Dôme": "63",
    "Pyrénées-Atlantiques": "64", "Hautes-Pyrénées": "65", "Pyrénées-Orientales": "66", "Bas-Rhin": "67", "Haut-Rhin": "68",
    "Rhône": "69", "Haute-Saône": "70", "Saône-et-Loire": "71", "Sarthe": "72", "Savoie": "73", "Haute-Savoie": "74", "Paris": "75",
    "Seine-Maritime": "76", "Seine-et-Marne": "77", "Yvelines": "78", "Deux-Sèvres": "79", "Somme": "80", "Tarn": "81",
    "Tarn-et-Garonne": "82", "Var": "83", "Vaucluse": "84", "Vendée": "85", "Vienne": "86", "Haute-Vienne": "87", "Vosges": "88",
    "Yonne": "89", "Territoire de Belfort": "90", "Essonne": "91", "Hauts-de-Seine": "92", "Seine-Saint-Denis": "93",
    "Val-de-Marne": "94", "Val-d'Oise": "95", "Auvergne-Rhône-Alpes": "84", "Bourgogne-Franche-Comté": "27", "Bretagne": "53",
    "Centre-Val de Loire": "24", "Corse": "94", "Grand Est": "44", "Hauts-de-France": "32", "Île-de-France": "11", "Normandie": "28",
    "Nouvelle-Aquitaine": "75", "Occitanie": "76", "Pays de la Loire": "52", "Provence-Alpes-Côte d'Azur": "93",
    "Guadeloupe": "01", "Martinique": "02", "Guyane": "03", "La Réunion": "04", "Mayotte": "06",
};

/**
 * @description Indexe les règles du CSV par nom de taxon pour un accès ultra-rapide.
 * C'est la clé de l'optimisation pour éviter les timeouts.
 * @returns {Map<string, Object[]>} - Une map où la clé est le nom du taxon et la valeur est un tableau de ses règles.
 */
const indexRulesByTaxon = () => {
    const lines = statusDataRaw.trim().split(/\r?\n/);
    const header = lines.shift().split(';').map(h => h.trim().replace(/"/g, ''));
    const indices = { 
        adm: header.indexOf('LB_ADM_TR'), 
        nom: header.indexOf('LB_NOM'), 
        code: header.indexOf('CODE_STATUT'), 
        type: header.indexOf('LB_TYPE_STATUT'), 
        label: header.indexOf('LABEL_STATUT') 
    };

    if (Object.values(indices).some(i => i === -1)) {
        throw new Error(`Le format du fichier CSV BDCstatut.csv est invalide. Colonnes manquantes.`);
    }
    
    const rulesIndex = new Map();
    lines.forEach(line => {
        const cols = line.split(';');
        const rowData = {
            adm: cols[indices.adm]?.trim().replace(/"/g, '') || '',
            nom: cols[indices.nom]?.trim().replace(/"/g, '') || '',
            code: cols[indices.code]?.trim().replace(/"/g, '') || '',
            type: cols[indices.type]?.trim().replace(/"/g, '') || '',
            label: cols[indices.label]?.trim().replace(/"/g, '') || ''
        };

        if (rowData.nom && rowData.type) {
            if (!rulesIndex.has(rowData.nom)) {
                rulesIndex.set(rowData.nom, []);
            }
            rulesIndex.get(rowData.nom).push(rowData);
        }
    });
    return rulesIndex;
};

// --- Indexation exécutée une seule fois au démarrage de la fonction (cold start) ---
const rulesByTaxonIndex = indexRulesByTaxon();


exports.handler = async function(event) {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

    try {
        const { discoveredOccurrences, coords } = JSON.parse(event.body);
        if (!discoveredOccurrences || !coords) return { statusCode: 400, body: 'Données d\'entrée invalides.' };

        // --- 1. Obtention du contexte géographique (inchangé) ---
        const geoApiUrl = `https://geo.api.gouv.fr/communes?lat=${coords.latitude}&lon=${coords.longitude}&fields=departement,region`;
        const geoResp = await fetch(geoApiUrl);
        if (!geoResp.ok) throw new Error("Service de géolocalisation administrative indisponible.");
        const geoData = await geoResp.json();
        if (geoData.length === 0) throw new Error(`Aucune information administrative trouvée pour les coordonnées.`);
        const { departement, region } = geoData[0];
        const departmentCode = departement.code;
        const newRegionCode = region.code;

        // --- 2. Construction de la liste de règles pertinentes (logique optimisée) ---
        const uniqueSpeciesNames = [...new Set(discoveredOccurrences.map(o => o.species).filter(Boolean))];
        const relevantRules = new Map();

        // On itère sur les espèces trouvées (petite liste) au lieu de tout le CSV.
        for (const speciesName of uniqueSpeciesNames) {
            // On récupère les règles uniquement pour cette espèce via l'index rapide.
            const rulesForThisTaxon = rulesByTaxonIndex.get(speciesName);

            if (rulesForThisTaxon) {
                // On applique le filtre géographique sur ce petit sous-ensemble de règles.
                for (const row of rulesForThisTaxon) {
                    let ruleApplies = false;
                    const type = row.type.toLowerCase();
                    if (ADMIN_NAME_TO_CODE_MAP[row.adm] === 'FR' || type.includes('nationale')) {
                        ruleApplies = true;
                    } else if (OLD_REGIONS_TO_DEPARTMENTS[row.adm]?.includes(departmentCode)) {
                        ruleApplies = true;
                    } else {
                        const adminCode = ADMIN_NAME_TO_CODE_MAP[row.adm];
                        if (adminCode === departmentCode || adminCode === newRegionCode) {
                            ruleApplies = true;
                        }
                    }

                    if (ruleApplies) {
                        const ruleKey = `${row.nom}|${row.type}|${row.adm}`;
                        if (!relevantRules.has(ruleKey)) {
                            const isRedList = type.includes('liste rouge');
                            const descriptiveStatus = isRedList ? `${row.type} (${row.code}) (${row.adm})` : row.label;
                            relevantRules.set(ruleKey, { species: row.nom, status: descriptiveStatus });
                        }
                    }
                }
            }
        }
        
        console.log(`${relevantRules.size} règles pertinentes trouvées après pré-filtrage.`);

        if (relevantRules.size === 0) {
            return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) };
        }

        const patrimonialityRules = Array.from(relevantRules.values()).map(rule => `- ${rule.species}: ${rule.status}`).join('\n');
        
        // --- 3. Appel à l'IA avec un prompt court et ciblé (inchangé en logique, mais bien plus court) ---
        const prompt = `Tu es un expert botaniste pour la zone administrative française (département ${departmentCode}, région ${newRegionCode}). Ta mission est d'analyser une liste d'espèces observées et de déterminer lesquelles sont patrimoniales en te basant sur la réglementation locale fournie. Tu dois appliquer les règles suivantes avec la plus grande rigueur.

**Règles Impératives d'Analyse :**

1.  **Règle d'Or de Précision Taxonomique (Priorité Haute) :**
    * Un statut de protection ou de menace s'applique **UNIQUEMENT** au taxon exact (espèce, sous-espèce, variété) mentionné dans la règle.
    * Le statut d'une sous-espèce (ex: \`subsp.\`) ou d'une variété (ex: \`var.\`) **NE DOIT PAS** être appliqué à l'espèce parente.
    * **Exemple concret :** Si une espèce observée est \`Anacamptis pyramidalis\` et qu'une règle concerne \`Anacamptis pyramidalis var. tanayensis\`, cette règle ne s'applique PAS. L'espèce \`Anacamptis pyramidalis\` n'hérite pas du statut de sa variété.

2.  **Règles de Définition de la Patrimonialité :**
    * Une espèce est considérée comme patrimoniale si elle est protégée, réglementée, ou listée comme menacée (NT, VU, EN, CR) sur une liste rouge pertinente.
    * Le statut "Préoccupation mineure" (LC) n'est **PAS** un statut patrimonial.

3.  **Règle de Gestion des Conflits :**
    * Si, pour un **MÊME NOM DE TAXON EXACT**, tu trouves des statuts contradictoires au sein d'une même liste (ex: un statut 'LC' et un statut 'VU' pour la liste rouge de la même région), tu dois **ignorer le statut de menace** et ne retenir que le statut 'LC'. Cette situation indique une erreur dans la source de données. Ne rapporte cette espèce comme patrimoniale que si un autre statut (ex: protection nationale) le justifie.

**Réglementation et Statuts pour la Zone (pré-filtrés pour les espèces observées) :**
${patrimonialityRules}

**Liste des espèces observées sur le terrain (via GBIF) :**
${uniqueSpeciesNames.join(', ')}

**Tâche Finale :**
En appliquant strictement les règles ci-dessus, compare la liste des espèces observées avec la réglementation. Retourne UNIQUEMENT un objet JSON valide contenant les espèces de la liste observée qui sont **effectivement patrimoniales**. Le format doit être: { "Nom de l'espèce observée": "Statut patrimonial justifié" }. Si aucune espèce n'est patrimoniale après analyse, retourne un objet JSON vide {}.`;
        
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${GEMINI_API_KEY}`;
        const geminiResp = await fetch(geminiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        });

        if (!geminiResp.ok) {
            const errorBody = await geminiResp.text();
            console.error("Erreur de l'API Gemini:", errorBody);
            throw new Error(`L'API d'analyse a retourné une erreur: ${geminiResp.statusText}`);
        }
        
        const geminiData = await geminiResp.json();
        let patrimonialMap = {};
        if (geminiData.candidates && geminiData.candidates[0].content && geminiData.candidates[0].content.parts[0]) {
            const jsonString = geminiData.candidates[0].content.parts[0].text.replace(/```json|```/g, '').trim();
            try {
                patrimonialMap = JSON.parse(jsonString);
            } catch (parseError) {
                console.error("Erreur de parsing de la réponse JSON de Gemini:", parseError, "Réponse brute:", jsonString);
                throw new Error("L'API d'analyse a retourné une réponse mal formée.");
            }
        } else {
            console.warn("Réponse de Gemini inattendue ou vide:", JSON.stringify(geminiData, null, 2));
        }

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(patrimonialMap)
        };

    } catch (error) {
        console.error("Erreur dans la fonction analyze-patrimonial-status:", error);
        return { 
            statusCode: 500, 
            body: JSON.stringify({ error: error.message }) 
        };
    }
};
