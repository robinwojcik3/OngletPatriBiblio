// /netlify/functions/analyze-patrimonial-status.js
const fetch = (...args) => import('node-fetch').then(({default: f}) => f(...args));
const fs = require('fs');
const path = require('path');

const csvPath = path.join(__dirname, 'BDCstatut.csv');
const statusDataRaw = fs.readFileSync(csvPath, 'utf8');

/**
 * Normalise un nom d'espèce pour faciliter la comparaison.
 * Utilise une regex pour extraire le nom binomial/trinomial (ex: "genus species", "genus species subspecies")
 * et ignorer les auteurs, années, et autres informations qui suivent.
 * @param {string} name - Le nom scientifique complet.
 * @returns {string} Le nom taxonomique de base, normalisé.
 */
const normalizeSpeciesName = (name) => {
    if (!name) return '';
    const lowerCaseName = name.toLowerCase();
    // Regex pour capturer le nom en 1, 2 ou 3 parties (Genre, Genre espece, Genre espece ssp)
    const match = lowerCaseName.match(/^([a-z]+\s[a-z]+(\s[a-z]+)?)/);
    
    // Si une correspondance est trouvée, la retourner. Sinon, retourner le nom nettoyé comme fallback.
    return match ? match[0] : lowerCaseName.replace(/\s+/g, ' ').trim();
};

const parseStatusData = () => {
    const lines = statusDataRaw.trim().split(/\r?\n/);
    const header = lines.shift().split(';').map(h => h.trim().replace(/"/g, ''));
    const required = { adm: 'LB_ADM_TR', nom: 'LB_NOM', code: 'CODE_STATUT', type: 'LB_TYPE_STATUT', label: 'LABEL_STATUT' };
    const indices = Object.keys(required).reduce((acc, key) => ({...acc, [key]: header.indexOf(required[key]) }), {});
    if (Object.values(indices).some(i => i === -1)) throw new Error(`CSV Invalide`);
    
    return lines.map(line => {
        const cols = line.split(';');
        const rowData = {};
        for (const key in indices) rowData[key] = cols[indices[key]]?.trim().replace(/"/g, '');
        return rowData;
    }).filter(row => row.LB_NOM && row.LB_TYPE_STATUT);
};

const statusData = parseStatusData();
const OLD_REGION_MAP = { 'Alsace': 'Grand Est', 'Aquitaine': 'Nouvelle-Aquitaine', 'Auvergne': 'Auvergne-Rhône-Alpes', 'Basse-Normandie': 'Normandie', 'Bourgogne': 'Bourgogne-Franche-Comté', 'Centre': 'Centre-Val de Loire', 'Champagne-Ardenne': 'Grand Est', 'Franche-Comté': 'Bourgogne-Franche-Comté', 'Haute-Normandie': 'Normandie', 'Limousin': 'Nouvelle-Aquitaine', 'Lorraine': 'Grand Est', 'Languedoc-Roussillon': 'Occitanie', 'Midi-Pyrénées': 'Occitanie', 'Nord-Pas-de-Calais': 'Hauts-de-France', 'Poitou-Charentes': 'Nouvelle-Aquitaine', 'Rhône-Alpes': 'Auvergne-Rhône-Alpes' };

exports.handler = async function(event) {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const { discoveredOccurrences, coords } = JSON.parse(event.body);
        // Obtenir la liste des noms d'espèces uniques, en filtrant les entrées invalides.
        const uniqueSpeciesNames = [...new Set(discoveredOccurrences.map(o => o.species).filter(Boolean))];

        const geoResp = await fetch(`https://geo.api.gouv.fr/communes?lat=${coords.latitude}&lon=${coords.longitude}&fields=departement,region`);
        const [info] = await geoResp.json();
        const regionName = OLD_REGION_MAP[info.region.nom] || info.region.nom;
        const departementName = info.departement.nom;

        const threatCodes = new Set(['NT', 'VU', 'EN', 'CR']);
        const localRules = new Map();
        statusData.forEach(row => {
            const adm = OLD_REGION_MAP[row.LB_ADM_TR] || row.LB_ADM_TR;
            if (adm === regionName || adm === departementName) {
                const type = (row.LB_TYPE_STATUT || '').toLowerCase();
                if ((type.includes('liste rouge') && threatCodes.has(row.CODE_STATUT)) || type.includes('protection') || type.includes('directive')) {
                    const normalizedName = normalizeSpeciesName(row.LB_NOM);
                    if (normalizedName && !localRules.has(normalizedName)) {
                        localRules.set(normalizedName, { originalName: row.LB_NOM, label: row.LABEL_STATUT });
                    }
                }
            }
        });
        
        const patrimonialMap = {};
        const speciesForAIAnalysis = [];

        // Étape 1 & 2: Normalisation et Correspondance Directe
        uniqueSpeciesNames.forEach(speciesName => {
            const normalizedOccName = normalizeSpeciesName(speciesName);
            if (localRules.has(normalizedOccName)) {
                patrimonialMap[speciesName] = localRules.get(normalizedOccName).label;
            } else {
                speciesForAIAnalysis.push(speciesName);
            }
        });

        // Étape 3: Analyse par IA (uniquement si nécessaire et sur les cas restants)
        if (speciesForAIAnalysis.length > 0) {
            const prompt = `Tu es un expert botaniste. Compare une liste d'espèces observées avec une liste de référence d'espèces patrimoniales. Identifie les correspondances même en cas de synonymie ou de variations taxonomiques.

Liste des espèces patrimoniales de référence (nom normalisé: statut):
${Array.from(localRules.entries()).map(([name, data]) => `- ${name}: ${data.label}`).join('\n')}

Liste des espèces observées à analyser:
${speciesForAIAnalysis.join(', ')}

Tâche : Retourne UNIQUEMENT un objet JSON valide contenant les espèces observées qui correspondent à la liste de référence. Le format doit être: { "Nom de l'espèce observée": "Statut de l'espèce de référence correspondante" }. Si aucune ne correspond, retourne {}.`;

            const GEMINI_API_KEY = "AIzaSyDDv4amCchpTXGqz6FGuY8mxPClkw-uwMs";
            const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${GEMINI_API_KEY}`;
            
            const geminiResp = await fetch(geminiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: { "temperature": 0 }
                })
            });

            if (geminiResp.ok) {
                const geminiData = await geminiResp.json();
                if (geminiData.candidates && geminiData.candidates.length > 0 && geminiData.candidates[0].content.parts[0].text) {
                   const jsonString = geminiData.candidates[0].content.parts[0].text.replace(/```json|```/g, '').trim();
                   try {
                       const aiResults = JSON.parse(jsonString);
                       // Étape 4: Agrégation
                       Object.assign(patrimonialMap, aiResults);
                   } catch(e) {
                       console.error("Erreur de parsing du JSON de Gemini:", e, jsonString);
                   }
                }
            } else {
                 console.error("Erreur de l'API Gemini:", await geminiResp.text());
            }
        }

        return {
            statusCode: 200,
            body: JSON.stringify(patrimonialMap)
        };

    } catch (error) {
        console.error("Erreur dans la fonction analyze-patrimonial-status:", error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};
