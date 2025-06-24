// /biblio-patri.js
// Version finale avec indexation côté client et regroupement des occurrences par point GPS.

document.addEventListener('DOMContentLoaded', async () => {
    // --- 1. Injection des styles ---
    const pageStyles = `
        :root { --primary:#c62828; --bg:#f6f9fb; --card:#ffffff; --border:#e0e0e0; --text:#202124; --max-width:900px; }
        html[data-theme="dark"] { --bg:#181a1b; --card:#262b2f; --border:#333; --text:#ececec; }
        * { box-sizing: border-box; }
        body { background: var(--bg); color: var(--text); font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; margin: 0; padding: 0; display: flex; flex-direction: column; min-height: 100vh; }
        .main-content { padding: 1rem; max-width: var(--max-width); margin: 2rem auto; width: 95%; }
        h1 { color: var(--primary); margin: 0 0 1rem; font-size: 1.8rem; text-align: center; }
        .status-container { text-align: center; margin: 2rem 0; font-size: 1rem; min-height: 24px; }
        .loading::after { content: ''; display: inline-block; width: 24px; height: 24px; border: 3px solid var(--border); border-top-color: var(--primary); border-radius: 50%; animation: spin 1s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
        #map { height: 500px; width: 100%; border-radius: 8px; border: 1px solid var(--border); box-shadow: 0 2px 6px rgba(0,0,0,.1); margin-top: 1.5rem; margin-bottom: 1.5rem; }
        .results-container { overflow-x: auto; -webkit-overflow-scrolling:touch; }
        table { width:100%; border-collapse:collapse; background:var(--card); border:1px solid var(--border); border-radius:8px; box-shadow:0 2px 6px rgba(0,0,0,.05); margin:1rem 0; }
        th, td { padding: 10px 12px; border-bottom:1px solid var(--border); text-align:left; vertical-align: middle; }
        th { font-weight: 600; background: #f5f5f5; color: #202124; }
        html[data-theme="dark"] th { background: #333; color: #ececec; }
        tbody tr:last-child td { border-bottom:none; }
        tbody tr:hover { background-color: rgba(198, 40, 40, 0.05); cursor: pointer; }
        html[data-theme="dark"] tbody tr:hover { background-color: rgba(198, 40, 40, 0.15); }
        .legend-color { display: inline-block; width: 12px; height: 12px; border-radius: 50%; margin-right: 8px; vertical-align: middle; }
        .search-controls { display: flex; flex-direction: column; gap: 0.75rem; padding: 1.5rem; background-color: var(--card); border-radius: 8px; border: 1px solid var(--border); margin-bottom: 2rem; }
        /* *** NOUVEAU : Styles pour les marqueurs groupés et la pop-up *** */
        .marker-cluster-icon {
            border-radius: 50%;
            border: 2px solid white;
            box-shadow: 0 0 5px rgba(0,0,0,0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-weight: bold;
            font-size: 12px;
            text-shadow: 1px 1px 2px rgba(0,0,0,0.7);
        }
        .custom-popup b { display: block; margin-bottom: 5px; font-size: 1.1em; color: var(--primary); }
        .custom-popup ul { list-style: none; padding: 0; margin: 0; }
        .custom-popup li { padding: 3px 0; }
    `;
    const styleElement = document.createElement('style');
    styleElement.textContent = pageStyles;
    document.head.appendChild(styleElement);
    
    // --- 2. Déclaration des variables et constantes globales ---
    const statusDiv = document.getElementById('status');
    const resultsContainer = document.getElementById('results');
    const mapContainer = document.getElementById('map');
    const addressInput = document.getElementById('address-input');
    const searchAddressBtn = document.getElementById('search-address-btn');
    const useGeolocationBtn = document.getElementById('use-geolocation-btn');

    let map = null;
    let patrimonialLayerGroup = L.layerGroup(); // Un seul groupe de calques pour tous les marqueurs.
    let rulesByTaxonIndex = new Map();
    const SEARCH_RADIUS_KM = 2;
    const SPECIES_COLORS = ['#E6194B', '#3CB44B', '#FFE119', '#4363D8', '#F58231', '#911EB4', '#46F0F0', '#F032E6', '#BCF60C', '#FABEBE', '#800000', '#AA6E28', '#000075', '#A9A9A9'];
    const nonPatrimonialLabels = new Set(["Liste des espèces végétales sauvages pouvant faire l'objet d'une réglementation préfectorale dans les départements d'outre-mer : Article 1"]);
    const nonPatrimonialRedlistCodes = new Set(['LC', 'DD', 'NA', 'NE']);
    const OLD_REGIONS_TO_DEPARTMENTS = { 'Alsace': ['67', '68'], 'Aquitaine': ['24', '33', '40', '47', '64'], 'Auvergne': ['03', '15', '43', '63'], 'Basse-Normandie': ['14', '50', '61'], 'Bourgogne': ['21', '58', '71', '89'], 'Champagne-Ardenne': ['08', '10', '51', '52'], 'Franche-Comté': ['25', '39', '70', '90'], 'Haute-Normandie': ['27', '76'], 'Languedoc-Roussillon': ['11', '30', '34', '48', '66'], 'Limousin': ['19', '23', '87'], 'Lorraine': ['54', '55', '57', '88'], 'Midi-Pyrénées': ['09', '12', '31', '32', '46', '65', '81', '82'], 'Nord-Pas-de-Calais': ['59', '62'], 'Picardie': ['02', '60', '80'], 'Poitou-Charentes': ['16', '17', '79', '86'], 'Rhône-Alpes': ['01', '07', '26', '38', '42', '69', '73', '74'] };
    const ADMIN_NAME_TO_CODE_MAP = { "France": "FR", "Ain": "01", "Aisne": "02", "Allier": "03", "Alpes-de-Haute-Provence": "04", "Hautes-Alpes": "05", "Alpes-Maritimes": "06", "Ardèche": "07", "Ardennes": "08", "Ariège": "09", "Aube": "10", "Aude": "11", "Aveyron": "12", "Bouches-du-Rhône": "13", "Calvados": "14", "Cantal": "15", "Charente": "16", "Charente-Maritime": "17", "Cher": "18", "Corrèze": "19", "Corse-du-Sud": "2A", "Haute-Corse": "2B", "Côte-d'Or": "21", "Côtes-d'Armor": "22", "Creuse": "23", "Dordogne": "24", "Doubs": "25", "Drôme": "26", "Eure": "27", "Eure-et-Loir": "28", "Finistère": "29", "Gard": "30", "Haute-Garonne": "31", "Gers": "32", "Gironde": "33", "Hérault": "34", "Ille-et-Vilaine": "35", "Indre": "36", "Indre-et-Loire": "37", "Isère": "38", "Jura": "39", "Landes": "40", "Loir-et-Cher": "41", "Loire": "42", "Haute-Loire": "43", "Loire-Atlantique": "44", "Loiret": "45", "Lot": "46", "Lot-et-Garonne": "47", "Lozère": "48", "Maine-et-Loire": "49", "Manche": "50", "Marne": "51", "Haute-Marne": "52", "Mayenne": "53", "Meurthe-et-Moselle": "54", "Meuse": "55", "Morbihan": "56", "Moselle": "57", "Nièvre": "58", "Nord": "59", "Oise": "60", "Orne": "61", "Pas-de-Calais": "62", "Puy-de-Dôme": "63", "Pyrénées-Atlantiques": "64", "Hautes-Pyrénées": "65", "Pyrénées-Orientales": "66", "Bas-Rhin": "67", "Haut-Rhin": "68", "Rhône": "69", "Haute-Saône": "70", "Saône-et-Loire": "71", "Sarthe": "72", "Savoie": "73", "Haute-Savoie": "74", "Paris": "75", "Seine-Maritime": "76", "Seine-et-Marne": "77", "Yvelines": "78", "Deux-Sèvres": "79", "Somme": "80", "Tarn": "81", "Tarn-et-Garonne": "82", "Var": "83", "Vaucluse": "84", "Vendée": "85", "Vienne": "86", "Haute-Vienne": "87", "Vosges": "88", "Yonne": "89", "Territoire de Belfort": "90", "Essonne": "91", "Hauts-de-Seine": "92", "Seine-Saint-Denis": "93", "Val-de-Marne": "94", "Val-d'Oise": "95", "Auvergne-Rhône-Alpes": "84", "Bourgogne-Franche-Comté": "27", "Bretagne": "53", "Centre-Val de Loire": "24", "Corse": "94", "Grand Est": "44", "Hauts-de-France": "32", "Île-de-France": "11", "Normandie": "28", "Nouvelle-Aquitaine": "75", "Occitanie": "76", "Pays de la Loire": "52", "Provence-Alpes-Côte d'Azur": "93", "Guadeloupe": "01", "Martinique": "02", "Guyane": "03", "La Réunion": "04", "Mayotte": "06" };

    const setStatus = (message, isLoading = false) => { /* ... (inchangé) ... */ };
    const indexRulesFromCSV = (csvText) => { /* ... (inchangé) ... */ };
    const initializeApp = async () => { /* ... (inchangé) ... */ };
    const initializeMap = (coords) => { /* ... (inchangé) ... */ };
   
    // *** REFACTORING MAJEUR : Logique de cartographie et de regroupement ***
    const fetchAndDisplayAllPatrimonialOccurrences = async (patrimonialMap, wkt, initialOccurrences) => {
        const speciesNames = Object.keys(patrimonialMap);
        if (speciesNames.length === 0) return;

        setStatus("Étape 3/3: Cartographie détaillée des espèces patrimoniales...", true);

        // --- PHASE 1: COLLECTE TOTALE ---
        let allOccurrencesWithContext = [];
        const taxonKeyMap = new Map();
        initialOccurrences.forEach(occ => {
            if (occ.species && occ.speciesKey && !taxonKeyMap.has(occ.species)) {
                taxonKeyMap.set(occ.species, occ.speciesKey);
            }
        });

        for (const [index, speciesName] of speciesNames.entries()) {
            const taxonKey = taxonKeyMap.get(speciesName);
            if (!taxonKey) continue;

            const color = SPECIES_COLORS[index % SPECIES_COLORS.length];
            let speciesOccs = [];
            let endOfRecords = false;
            for (let page = 0; page < 10 && !endOfRecords; page++) {
                const gbifUrl = `https://api.gbif.org/v1/occurrence/search?limit=1000&offset=${page*1000}&geometry=${encodeURIComponent(wkt)}&taxonKey=${taxonKey}`;
                try {
                    const resp = await fetch(gbifUrl);
                    if (!resp.ok) break;
                    const pageData = await resp.json();
                    if (pageData.results?.length > 0) {
                        pageData.results.forEach(occ => {
                            occ.speciesName = speciesName; // Ajout du contexte pour l'agrégation
                            occ.color = color;
                        });
                        speciesOccs = speciesOccs.concat(pageData.results);
                    }
                    endOfRecords = pageData.endOfRecords;
                } catch (e) { break; }
            }
            allOccurrencesWithContext = allOccurrencesWithContext.concat(speciesOccs);
        }

        // --- PHASE 2: AGRÉGATION PAR LOCALISATION ---
        const locations = new Map();
        allOccurrencesWithContext.forEach(occ => {
            if (occ.decimalLatitude && occ.decimalLongitude) {
                const coordKey = `${occ.decimalLatitude.toFixed(5)},${occ.decimalLongitude.toFixed(5)}`;
                if (!locations.has(coordKey)) {
                    locations.set(coordKey, { lat: occ.decimalLatitude, lon: occ.decimalLongitude, speciesList: [] });
                }
                const locationData = locations.get(coordKey);
                if (!locationData.speciesList.some(s => s.name === occ.speciesName)) {
                    locationData.speciesList.push({ name: occ.speciesName, color: occ.color });
                }
            }
        });

        // --- PHASE 3: AFFICHAGE INTELLIGENT ---
        patrimonialLayerGroup.clearLayers(); // Vider les anciens marqueurs
        for (const location of locations.values()) {
            const count = location.speciesList.length;
            const iconHtml = `<div class="marker-cluster-icon" style="background-color: ${count > 1 ? '#c62828' : location.speciesList[0].color};"><span>${count}</span></div>`;
            const icon = L.divIcon({ html: iconHtml, className: 'custom-cluster', iconSize: [28, 28], iconAnchor: [14, 14] });
            
            let popupContent = `<div class="custom-popup"><b>${count} espèce(s) patrimoniale(s) :</b><ul>`;
            location.speciesList.forEach(s => {
                popupContent += `<li><span class="legend-color" style="background-color:${s.color};"></span><i>${s.name}</i></li>`;
            });
            popupContent += '</ul></div>';
            
            const marker = L.marker([location.lat, location.lon], { icon }).bindPopup(popupContent);
            patrimonialLayerGroup.addLayer(marker);
        }
        patrimonialLayerGroup.addTo(map);

        setStatus(`${speciesNames.length} espèce(s) patrimoniale(s) cartographiée(s) sur ${locations.size} points.`, false);
    };

    const displayResults = (occurrences, patrimonialMap, wkt) => {
        resultsContainer.innerHTML = '';
        patrimonialLayerGroup.clearLayers();
        
        if (Object.keys(patrimonialMap).length === 0) {
            setStatus(`Aucune occurrence d'espèce patrimoniale trouvée dans ce rayon de ${SEARCH_RADIUS_KM} km.`);
            return;
        }
        
        setStatus(`${Object.keys(patrimonialMap).length} espèce(s) patrimoniale(s) trouvée(s). Lancement de la cartographie détaillée...`);
        
        const tableBody = document.createElement('tbody');
        Object.keys(patrimonialMap).sort().forEach((speciesName, index) => {
            const color = SPECIES_COLORS[index % SPECIES_COLORS.length];
            const row = tableBody.insertRow();
            const statusCellContent = Array.isArray(patrimonialMap[speciesName]) ? patrimonialMap[speciesName].join('<br>') : patrimonialMap[speciesName];
            row.innerHTML = `<td><span class="legend-color" style="background-color:${color};"></span><i>${speciesName}</i></td><td>${statusCellContent}</td>`;
        });

        const table = document.createElement('table');
        table.innerHTML = `<thead><tr><th>Nom scientifique</th><th>Statut de patrimonialité</th></tr></thead>`;
        table.appendChild(tableBody);
        resultsContainer.appendChild(table);

        fetchAndDisplayAllPatrimonialOccurrences(patrimonialMap, wkt, occurrences);
    };

    const runAnalysis = async (coords) => {
        // ... (Cette fonction reste inchangée)
    };
     
    const handleAddressSearch = async () => {
        // ... (Cette fonction reste inchangée)
    };
    
    const handleGeolocationSearch = async () => {
        // ... (Cette fonction reste inchangée)
    };
    
    // --- 6. DÉMARRAGE DE L'APPLICATION ---
    await initializeApp();
    searchAddressBtn.addEventListener('click', handleAddressSearch);
    useGeolocationBtn.addEventListener('click', handleGeolocationSearch);
    addressInput.addEventListener('keypress', (e) => e.key === 'Enter' && handleAddressSearch());
});
