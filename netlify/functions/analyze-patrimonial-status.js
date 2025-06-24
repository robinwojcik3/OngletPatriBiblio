// /netlify/functions/analyze-patrimonial-status.js
const fetch = (...args) => import('node-fetch').then(({default: f}) => f(...args));
const fs = require('fs');
const path = require('path');

// --- 1. Clé API intégrée directement dans le script (selon la demande) ---
const GEMINI_API_KEY = "AIzaSyDDv4amCchpTXGqz6FGuY8mxPClkw-uwMs";

// --- 2. LECTURE ET PARSING DES DONNÉES DE STATUT ---
const csvPath = path.join(__dirname, 'BDCstatut.csv');
const statusDataRaw = fs.readFileSync(csvPath, 'utf8');

// --- 3. STRUCTURES DE DONNÉES POUR LA CORRESPONDANCE ADMINISTRATIVE ---

// Structure A : Mapping des anciennes régions à leurs départements constitutifs.
// Essentielle pour appliquer les statuts des anciennes régions à leur territoire d'origine uniquement.
const OLD_REGIONS_TO_DEPARTMENTS = {
    'Alsace': ['67', '68'],
    'Aquitaine': ['24', '33', '40', '47', '64'],
    'Auvergne': ['03', '15', '43', '63'],
    'Basse-Normandie': ['14', '50', '61'],
    'Bourgogne': ['21', '58', '71', '89'],
    'Champagne-Ardenne': ['08', '10', '51', '52'],
    'Franche-Comté': ['25', '39', '70', '90'],
    'Haute-Normandie': ['27', '76'],
    'Languedoc-Roussillon': ['11', '30', '34', '48', '66'],
    'Limousin': ['19', '23', '87'],
    'Lorraine': ['54', '55', '57', '88'],
    'Midi-Pyrénées': ['09', '12', '31', '32', '46', '65', '81', '82'],
    'Nord-Pas-de-Calais': ['59', '62'],
    'Picardie': ['02', '60', '80'],
    'Poitou-Charentes': ['16', '17', '79', '86'],
    'Rhône-Alpes': ['01', '07', '26', '38', '42', '69', '73', '74']
};

// Structure B : Mapping de tous les noms administratifs connus du CSV vers un code officiel.
// Sert de traducteur universel pour standardiser les données.
const ADMIN_NAME_TO_CODE_MAP = {
    "France": "FR", // Ajout d'un code pour le niveau national
    "Ain": "01", "Aisne": "02", "Allier": "03", "Alpes-de-Haute-Provence": "04",
    "Hautes-Alpes": "05", "Alpes-Maritimes": "06", "Ardèche": "07", "Ardennes": "08",
    "Ariège": "09", "Aube": "10", "Aude": "11", "Aveyron": "12", "Bouches-du-Rhône": "13",
    "Calvados": "14", "Cantal": "15", "Charente": "16", "Charente-Maritime": "17",
    "Cher": "18", "Corrèze": "19", "Corse-du-Sud": "2A", "Haute-Corse": "2B",
    "Côte-d'Or": "21", "Côtes-d'Armor": "22", "Creuse": "23", "Dordogne": "24",
    "Doubs": "25", "Drôme": "26", "Eure": "27", "Eure-et-Loir": "28", "Finistère": "29",
    "Gard": "30", "Haute-Garonne": "31", "Gers": "32", "Gironde": "33", "Hérault": "34",
    "Ille-et-Vilaine": "35", "Indre": "36", "Indre-et-Loire": "37", "Isère": "38",
    "Jura": "39", "Landes": "40", "Loir-et-Cher": "41", "Loire": "42", "Haute-Loire": "43",
    "Loire-Atlantique": "44", "Loiret": "45", "Lot": "46", "Lot-et-Garonne": "47",
    "Lozère": "48", "Maine-et-Loire": "49", "Manche": "50", "Marne": "51", "Haute-Marne": "52",
    "Mayenne": "53", "Meurthe-et-Moselle": "54", "Meuse": "55", "Morbihan": "56",
    "Moselle": "57", "Nièvre": "58", "Nord": "59", "Oise": "60", "Orne": "61",
    "Pas-de-Calais": "62", "Puy-de-Dôme": "63", "Pyrénées-Atlantiques": "64",
    "Hautes-Pyrénées": "65", "Pyrénées-Orientales": "66", "Bas-Rhin": "67",
    "Haut-Rhin": "68", "Rhône": "69", "Haute-Saône": "70", "Saône-et-Loire": "71",
    "Sarthe": "72", "Savoie": "73", "Haute-Savoie": "74", "Paris": "75",
    "Seine-Maritime": "76", "Seine-et-Marne": "77", "Yvelines": "78", "Deux-Sèvres": "79",
    "Somme": "80", "Tarn": "81", "Tarn-et-Garonne": "82", "Var": "83", "Vaucluse": "84",
    "Vendée": "85", "Vienne": "86", "Haute-Vienne": "87", "Vosges": "88", "Yonne": "89",
    "Territoire de Belfort": "90", "Essonne": "91", "Hauts-de-Seine": "92",
    "Seine-Saint-Denis": "93", "Val-de-Marne": "94", "Val-d'Oise": "95",
    "Auvergne-Rhône-Alpes": "84", "Bourgogne-Franche-Comté": "27", "Bretagne": "53",
    "Centre-Val de Loire": "24", "Corse": "94", "Grand Est": "44",
    "Hauts-de-France": "32", "Île-de-France": "11", "Normandie": "28",
    "Nouvelle-Aquitaine": "75", "Occitanie": "76", "Pays de la Loire": "52",
    "Provence-Alpes-Côte d'Azur": "93",
    "Guadeloupe": "01", "Martinique": "02", "Guyane": "03", "La Réunion": "04", "Mayotte": "06",
};

const parseStatusData = () => {
    const lines = statusDataRaw.trim().split(/\r?\n/);
    const header = lines.shift().split(';').map(h => h.trim().replace(/"/g, ''));
    const required = { adm: 'LB_ADM_TR', nom: 'LB_NOM', code: 'CODE_STATUT', type: 'LB_TYPE_STATUT', label: 'LABEL_STATUT' };
    const indices = Object.keys(required).reduce((acc, key) => ({...acc, [key]: header.indexOf(required[key]) }), {});

    if (Object.values(indices).some(i => i === -1)) {
        console.error("Colonnes CSV manquantes:", required, header);
        throw new Error(`Le format du fichier CSV BDCstatut.csv est invalide.`);
    }
    
    return lines.map(line => {
        const cols = line.split(';');
        const rowData = {};
        for (const key in indices) {
            rowData[key] = cols[indices[key]]?.trim().replace(/"/g, '') || '';
        }
        return rowData;
    }).filter(row => row.nom && row.type);
};

const statusData = parseStatusData();

exports.handler = async function(event) {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

    try {
        const { discoveredOccurrences, coords } = JSON.parse(event.body);
        if (!discoveredOccurrences || !coords) return { statusCode: 400, body: 'Données d\'entrée invalides.' };

        const geoApiUrl = `https://geo.api.gouv.fr/communes?lat=${coords.latitude}&lon=${coords.longitude}&fields=departement,region`;
        const geoResp = await fetch(geoApiUrl);
        if (!geoResp.ok) throw new Error("Service de géolocalisation administrative indisponible.");
        
        const geoData = await geoResp.json();
        if (geoData.length === 0) throw new Error(`Aucune information administrative trouvée pour les coordonnées.`);
        
        const { departement, region } = geoData[0];
        const departmentCode = departement.code;
        const newRegionCode = region.code;
        console.log(`Localisation: Dpt ${departmentCode} (${departement.nom}), Région ${newRegionCode} (${region.nom})`);

        const threatCodes = new Set(['NT', 'VU', 'EN', 'CR']);
        const localRules = new Map();

        // --- LOGIQUE DE FILTRAGE ADMINISTRATIVE RENFORCÉE ---
        statusData.forEach(row => {
            const type = row.type.toLowerCase();
            const adminName = row.adm;

            // Étape 1 : Vérifier si le statut est patrimonial
            const isRedList = type.includes('liste rouge') && threatCodes.has(row.code);
            const isProtection = type.includes('protection');
            const isDirective = type.includes('directive');
            if (!isRedList && !isProtection && !isDirective) {
                return; // Statut non pertinent, on passe au suivant.
            }

            let ruleApplies = false;

            // Étape 2 : Vérifier la portée géographique du statut
            // Cas 1 : Statuts à portée NATIONALE (prioritaire)
            if (ADMIN_NAME_TO_CODE_MAP[adminName] === 'FR' || type.includes('nationale')) {
                ruleApplies = true;
            }
            // Cas 2 : Statuts à portée LOCALE (non-nationaux)
            else {
                if (OLD_REGIONS_TO_DEPARTMENTS[adminName]) { // Statut d'une ancienne région
                    if (OLD_REGIONS_TO_DEPARTMENTS[adminName].includes(departmentCode)) {
                        ruleApplies = true;
                    }
                } else { // Statut départemental ou de nouvelle région
                    const adminCode = ADMIN_NAME_TO_CODE_MAP[adminName];
                    if (adminCode === departmentCode || adminCode === newRegionCode) {
                        ruleApplies = true;
                    }
                }
            }
            
            // Étape 3 : Ajouter la règle si elle s'applique
            if (ruleApplies) {
                if (!localRules.has(row.nom)) {
                    // *** MODIFICATION POUR DÉTAIL DU STATUT ***
                    // Construction de la chaîne de caractères du statut avec plus de détails.
                    let descriptiveStatus;
                    if (isRedList) {
                        // Pour les listes rouges, on inclut le code de menace (NT, VU, etc.).
                        descriptiveStatus = `${row.type} (${row.code}) (${row.adm})`;
                    } else {
                        // Pour les protections et directives, on utilise le label complet qui contient la référence réglementaire.
                        descriptiveStatus = row.label;
                    }
                    localRules.set(row.nom, descriptiveStatus);
                }
            }
        });

        console.log(`${localRules.size} règles de patrimonialité pertinentes trouvées pour la zone.`);

        const uniqueSpeciesNames = [...new Set(discoveredOccurrences.map(o => o.species).filter(Boolean))];
        if (uniqueSpeciesNames.length === 0) return { statusCode: 200, body: JSON.stringify({}) };

        const prompt = `Tu es un expert botaniste pour la zone administrative française (département ${departmentCode}, région ${newRegionCode}). Ta mission est d'analyser une liste d'espèces observées et de déterminer lesquelles sont patrimoniales en te basant sur un extrait de la réglementation locale.

Règles de patrimonialité pour la zone (extrait du référentiel BDCstatut) :
${localRules.size > 0 ? Array.from(localRules.entries()).map(([name, status]) => `- ${name}: ${status}`).join('\n') : "Aucune règle de protection ou de menace spécifique n'a été trouvée pour cette zone précise dans notre extrait."}

Liste des espèces observées sur le terrain (via GBIF) :
${uniqueSpeciesNames.join(', ')}

Tâche : Compare la liste des espèces observées avec les règles de patrimonialité. Prends en compte les variations taxonomiques (ex: un nom avec ou sans l'auteur comme 'L.' doit correspondre). Retourne UNIQUEMENT un objet JSON valide contenant les espèces de la liste observée qui sont patrimoniales. Le format doit être: { "Nom de l'espèce": "Statut de patrimonialité" }. Si aucune espèce ne correspond ou si aucune règle n'est fournie, retourne un objet JSON vide {}.`;
        
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
