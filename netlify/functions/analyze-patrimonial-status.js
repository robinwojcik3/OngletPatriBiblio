// /netlify/functions/analyze-patrimonial-status.js
const fetch = (...args) => import('node-fetch').then(({default: f}) => f(...args));
const fs = require('fs');
const path = require('path');

const csvPath = path.join(__dirname, 'BDCstatut.csv');
const statusDataRaw = fs.readFileSync(csvPath, 'utf8');

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
        const uniqueSpeciesNames = [...new Set(discoveredOccurrences.map(o => o.species))];

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
                    localRules.set(row.LB_NOM, row.LABEL_STATUT);
                }
            }
        });

        const prompt = `Tu es un expert botaniste pour la région française '${regionName}'. Ta mission est d'analyser une liste d'espèces observées sur le terrain et de déterminer lesquelles sont patrimoniales en te basant sur un extrait de la réglementation locale.

Règles de patrimonialité pour la zone (extrait du référentiel BDCstatut) :
${Array.from(localRules.entries()).map(([name, status]) => `- ${name}: ${status}`).join('\n')}

Liste des espèces observées sur le terrain (via GBIF) :
${uniqueSpeciesNames.join(', ')}

Tâche : Compare la liste des espèces observées avec les règles de patrimonialité. Prends en compte les variations taxonomiques (ex: un nom avec ou sans l'auteur comme 'L.' doit correspondre). Retourne UNIQUEMENT un objet JSON valide contenant les espèces de la liste observée qui sont patrimoniales. Le format doit être: { "Nom de l'espèce": "Statut de patrimonialité" }. Si aucune espèce ne correspond, retourne un objet JSON vide {}.`;

        // Clé API Gemini directement intégrée dans le code.
        const GEMINI_API_KEY = "AIzaSyDDv4amCchpTXGqz6FGuY8mxPClkw-uwMs";
        if (!GEMINI_API_KEY) throw new Error("La clé d'API Gemini n'est pas configurée.");
        
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${GEMINI_API_KEY}`;
        
        const geminiResp = await fetch(geminiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        });

        if (!geminiResp.ok) {
            const errorBody = await geminiResp.text();
            console.error("Erreur de l'API Gemini:", errorBody);
            throw new Error('Erreur de l\'API Gemini.');
        }
        
        const geminiData = await geminiResp.json();
        const jsonString = geminiData.candidates[0].content.parts[0].text.replace(/```json|```/g, '').trim();
        const patrimonialMap = JSON.parse(jsonString);

        return {
            statusCode: 200,
            body: JSON.stringify(patrimonialMap)
        };

    } catch (error) {
        console.error("Erreur dans la fonction analyze-patrimonial-status:", error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};
