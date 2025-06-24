// /biblio-patri.js
// Version finale avec indexation côté client et contrôle des fonds de carte.

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
        .tabs { display: flex; justify-content: center; gap: 1rem; margin-bottom: 1rem; }
        .tab-button { background: var(--card); border: 1px solid var(--border); padding: 0.5rem 1rem; cursor: pointer; border-radius: 4px; }
        .tab-button.active { background: var(--primary); color: #fff; }
        .tab-content { display: none; }
        #observations-map { height: 500px; width: 100%; border-radius: 8px; border: 1px solid var(--border); box-shadow: 0 2px 6px rgba(0,0,0,.1); margin-top: 1.5rem; margin-bottom: 1.5rem; }
        .marker-cluster-icon { border-radius: 50%; border: 2px solid white; box-shadow: 0 0 5px rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 12px; text-shadow: 1px 1px 2px rgba(0,0,0,0.7); }
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
    const analysisTabBtn = document.getElementById('analysis-tab-btn');
    const observationsTabBtn = document.getElementById('observations-tab-btn');
    const analysisTab = document.getElementById('analysis-tab');
    const observationsTab = document.getElementById('observations-tab');
    const obsStatusDiv = document.getElementById('obs-status');
    const obsMapContainer = document.getElementById('observations-map');

    let map = null;
    let patrimonialLayerGroup = L.layerGroup();
    let obsMap = null;
    let observationsLayerGroup = L.layerGroup();
    let rulesByTaxonIndex = new Map();
    const SEARCH_RADIUS_KM = 2;
    const OBS_RADIUS_KM = 0.2;
    const SPECIES_COLORS = ['#E6194B', '#3CB44B', '#FFE119', '#4363D8', '#F58231', '#911EB4', '#46F0F0', '#F032E6', '#BCF60C', '#FABEBE', '#800000', '#AA6E28', '#000075', '#A9A9A9'];
    const nonPatrimonialLabels = new Set(["Liste des espèces végétales sauvages pouvant faire l'objet d'une réglementation préfectorale dans les départements d'outre-mer : Article 1"]);
    const nonPatrimonialRedlistCodes = new Set(['LC', 'DD', 'NA', 'NE']);
    const OLD_REGIONS_TO_DEPARTMENTS = { 'Alsace': ['67', '68'], 'Aquitaine': ['24', '33', '40', '47', '64'], 'Auvergne': ['03', '15', '43', '63'], 'Basse-Normandie': ['14', '50', '61'], 'Bourgogne': ['21', '58', '71', '89'], 'Champagne-Ardenne': ['08', '10', '51', '52'], 'Franche-Comté': ['25', '39', '70', '90'], 'Haute-Normandie': ['27', '76'], 'Languedoc-Roussillon': ['11', '30', '34', '48', '66'], 'Limousin': ['19', '23', '87'], 'Lorraine': ['54', '55', '57', '88'], 'Midi-Pyrénées': ['09', '12', '31', '32', '46', '65', '81', '82'], 'Nord-Pas-de-Calais': ['59', '62'], 'Picardie': ['02', '60', '80'], 'Poitou-Charentes': ['16', '17', '79', '86'], 'Rhône-Alpes': ['01', '07', '26', '38', '42', '69', '73', '74'] };
    const ADMIN_NAME_TO_CODE_MAP = { "France": "FR", "Ain": "01", "Aisne": "02", "Allier": "03", "Alpes-de-Haute-Provence": "04", "Hautes-Alpes": "05", "Alpes-Maritimes": "06", "Ardèche": "07", "Ardennes": "08", "Ariège": "09", "Aube": "10", "Aude": "11", "Aveyron": "12", "Bouches-du-Rhône": "13", "Calvados": "14", "Cantal": "15", "Charente": "16", "Charente-Maritime": "17", "Cher": "18", "Corrèze": "19", "Corse-du-Sud": "2A", "Haute-Corse": "2B", "Côte-d'Or": "21", "Côtes-d'Armor": "22", "Creuse": "23", "Dordogne": "24", "Doubs": "25", "Drôme": "26", "Eure": "27", "Eure-et-Loir": "28", "Finistère": "29", "Gard": "30", "Haute-Garonne": "31", "Gers": "32", "Gironde": "33", "Hérault": "34", "Ille-et-Vilaine": "35", "Indre": "36", "Indre-et-Loire": "37", "Isère": "38", "Jura": "39", "Landes": "40", "Loir-et-Cher": "41", "Loire": "42", "Haute-Loire": "43", "Loire-Atlantique": "44", "Loiret": "45", "Lot": "46", "Lot-et-Garonne": "47", "Lozère": "48", "Maine-et-Loire": "49", "Manche": "50", "Marne": "51", "Haute-Marne": "52", "Mayenne": "53", "Meurthe-et-Moselle": "54", "Meuse": "55", "Morbihan": "56", "Moselle": "57", "Nièvre": "58", "Nord": "59", "Oise": "60", "Orne": "61", "Pas-de-Calais": "62", "Puy-de-Dôme": "63", "Pyrénées-Atlantiques": "64", "Hautes-Pyrénées": "65", "Pyrénées-Orientales": "66", "Bas-Rhin": "67", "Haut-Rhin": "68", "Rhône": "69", "Haute-Saône": "70", "Saône-et-Loire": "71", "Sarthe": "72", "Savoie": "73", "Haute-Savoie": "74", "Paris": "75", "Seine-Maritime": "76", "Seine-et-Marne": "77", "Yvelines": "78", "Deux-Sèvres": "79", "Somme": "80", "Tarn": "81", "Tarn-et-Garonne": "82", "Var": "83", "Vaucluse": "84", "Vendée": "85", "Vienne": "86", "Haute-Vienne": "87", "Vosges": "88", "Yonne": "89", "Territoire de Belfort": "90", "Essonne": "91", "Hauts-de-Seine": "92", "Seine-Saint-Denis": "93", "Val-de-Marne": "94", "Val-d'Oise": "95", "Auvergne-Rhône-Alpes": "84", "Bourgogne-Franche-Comté": "27", "Bretagne": "53", "Centre-Val de Loire": "24", "Corse": "94", "Grand Est": "44", "Hauts-de-France": "32", "Île-de-France": "11", "Normandie": "28", "Nouvelle-Aquitaine": "75", "Occitanie": "76", "Pays de la Loire": "52", "Provence-Alpes-Côte d'Azur": "93", "Guadeloupe": "01", "Martinique": "02", "Guyane": "03", "La Réunion": "04", "Mayotte": "06" };

    const setStatus = (message, isLoading = false) => {
        statusDiv.innerHTML = '';
        if (isLoading) {
            const spinner = document.createElement('div');
            spinner.className = 'loading';
            statusDiv.appendChild(spinner);
        }
        if (message) statusDiv.innerHTML += `<p>${message}</p>`;
    };
    
    const indexRulesFromCSV = (csvText) => {
        const lines = csvText.trim().split(/\r?\n/);
        const header = lines.shift().split(';').map(h => h.trim().replace(/"/g, ''));
        const indices = { adm: header.indexOf('LB_ADM_TR'), nom: header.indexOf('LB_NOM'), code: header.indexOf('CODE_STATUT'), type: header.indexOf('LB_TYPE_STATUT'), label: header.indexOf('LABEL_STATUT') };
        
        const index = new Map();
        lines.forEach(line => {
            const cols = line.split(';');
            const rowData = {
                adm: cols[indices.adm]?.trim().replace(/"/g, '') || '', nom: cols[indices.nom]?.trim().replace(/"/g, '') || '',
                code: cols[indices.code]?.trim().replace(/"/g, '') || '', type: cols[indices.type]?.trim().replace(/"/g, '') || '',
                label: cols[indices.label]?.trim().replace(/"/g, '') || ''
            };
            if (rowData.nom && rowData.type) {
                if (!index.has(rowData.nom)) { index.set(rowData.nom, []); }
                index.get(rowData.nom).push(rowData);
            }
        });
        return index;
    };

    const initializeApp = async () => {
        try {
            setStatus("Chargement du référentiel BDCstatut...", true);
            const response = await fetch('/BDCstatut.csv');
            if (!response.ok) throw new Error("Le référentiel BDCstatut.csv est introuvable.");
            const csvText = await response.text();
            rulesByTaxonIndex = indexRulesFromCSV(csvText);
            setStatus("Prêt. Choisissez une méthode de recherche.");
            console.log(`Référentiel chargé, ${rulesByTaxonIndex.size} taxons indexés.`);
        } catch (error) {
            setStatus(`Erreur critique au chargement : ${error.message}`);
            console.error(error);
        }
    };

    // --- *** MODIFICATION MAJEURE : Ajout du contrôle des couches *** ---
    const initializeMap = (coords) => {
        if (map) {
            map.remove();
        }
    
        // 1. Définition des couches de base
        const topoMap = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
            attribution: 'Map data: © OpenStreetMap contributors, SRTM | Map style: © OpenTopoMap (CC-BY-SA)'
        });
    
        const satelliteMap = L.tileLayer('https://wxs.ign.fr/essentiels/geoportail/wmts?REQUEST=GetTile&SERVICE=WMTS&VERSION=1.0.0&STYLE=normal&TILEMATRIXSET=PM&FORMAT=image/jpeg&LAYER=ORTHOIMAGERY.ORTHOPHOTOS&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}', {
            attribution: '&copy; <a href="https://www.ign.fr/">IGN</a>',
            maxZoom: 19
        });
    
        // 2. Création de la carte avec une couche par défaut
        mapContainer.style.display = 'block';
        map = L.map(mapContainer, {
            center: [coords.latitude, coords.longitude],
            zoom: 13,
            layers: [topoMap] // La carte topographique est affichée par défaut
        });
    
        // 3. Définition des objets pour le contrôle des couches
        const baseMaps = {
            "Topographique": topoMap,
            "Satellite (IGN)": satelliteMap
        };
    
        const overlayMaps = {
            "Espèces Patrimoniales": patrimonialLayerGroup
        };
    
        // 4. Ajout du contrôle à la carte
        L.control.layers(baseMaps, overlayMaps).addTo(map);
        
        // 5. Ajout du cercle de recherche
        L.circle([coords.latitude, coords.longitude], { radius: SEARCH_RADIUS_KM * 1000, color: '#c62828', weight: 2, fillOpacity: 0.1, interactive: false }).addTo(map);
    };
   
    const fetchAndDisplayAllPatrimonialOccurrences = async (patrimonialMap, wkt, initialOccurrences) => {
        const speciesNames = Object.keys(patrimonialMap);
        if (speciesNames.length === 0) return;
        setStatus("Étape 3/3: Cartographie détaillée des espèces patrimoniales...", true);
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
                            occ.speciesName = speciesName;
                            occ.color = color;
                        });
                        speciesOccs = speciesOccs.concat(pageData.results);
                    }
                    endOfRecords = pageData.endOfRecords;
                } catch (e) { console.error("Erreur durant la cartographie détaillée pour :", speciesName, e); break; }
            }
            allOccurrencesWithContext = allOccurrencesWithContext.concat(speciesOccs);
        }
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
        patrimonialLayerGroup.clearLayers();
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
        if(!map.hasLayer(patrimonialLayerGroup)) {
            patrimonialLayerGroup.addTo(map);
        }
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
        try {
            resultsContainer.innerHTML = '';
            mapContainer.style.display = 'none';
            initializeMap(coords);
            setStatus("Étape 1/2: Inventaire de la flore locale via GBIF...", true);
            const wkt = `POLYGON((${Array.from({length:33},(_,i)=>{const a=i*2*Math.PI/32,r=111.32*Math.cos(coords.latitude*Math.PI/180);return`${(coords.longitude+SEARCH_RADIUS_KM/r*Math.cos(a)).toFixed(5)} ${(coords.latitude+SEARCH_RADIUS_KM/111.132*Math.sin(a)).toFixed(5)}`}).join(', ')}))`;
            let allOccurrences = [];
            const maxPages = 12;
            const limit = 1000;
            for (let page = 0; page < maxPages; page++) {
                const offset = page * limit;
                setStatus(`Étape 1/2: Inventaire de la flore locale via GBIF... (Page ${page + 1}/${maxPages})`, true);
                const gbifUrl = `https://api.gbif.org/v1/occurrence/search?limit=${limit}&offset=${offset}&geometry=${encodeURIComponent(wkt)}&kingdomKey=6`;
                const gbifResp = await fetch(gbifUrl);
                if (!gbifResp.ok) throw new Error("L'API GBIF est indisponible.");
                const pageData = await gbifResp.json();
                if (pageData.results?.length > 0) { allOccurrences = allOccurrences.concat(pageData.results); }
                if (pageData.endOfRecords) { break; }
            }
            if (allOccurrences.length === 0) { throw new Error("Aucune occurrence de plante trouvée à proximité."); }
            setStatus("Étape 2/2: Analyse des données...", true);
            const uniqueSpeciesNames = [...new Set(allOccurrences.map(o => o.species).filter(Boolean))];
            const relevantRules = new Map();
            const { departement, region } = (await (await fetch(`https://geo.api.gouv.fr/communes?lat=${coords.latitude}&lon=${coords.longitude}&fields=departement,region`)).json())[0];
            for (const speciesName of uniqueSpeciesNames) {
                const rulesForThisTaxon = rulesByTaxonIndex.get(speciesName);
                if (rulesForThisTaxon) {
                    for (const row of rulesForThisTaxon) {
                        let ruleApplies = false;
                        const type = row.type.toLowerCase();
                        if (ADMIN_NAME_TO_CODE_MAP[row.adm] === 'FR' || type.includes('nationale')) { ruleApplies = true; } 
                        else if (OLD_REGIONS_TO_DEPARTMENTS[row.adm]?.includes(departement.code)) { ruleApplies = true; } 
                        else { const adminCode = ADMIN_NAME_TO_CODE_MAP[row.adm]; if (adminCode === departement.code || adminCode === region.code) { ruleApplies = true; } }
                        if (ruleApplies) {
                            if (nonPatrimonialLabels.has(row.label) || type.includes('déterminante znieff')) { continue; }
                            const isRedList = type.includes('liste rouge');
                            if (isRedList && nonPatrimonialRedlistCodes.has(row.code)) { continue; }
                            const ruleKey = `${row.nom}|${row.type}|${row.adm}`;
                            if (!relevantRules.has(ruleKey)) {
                                const descriptiveStatus = isRedList ? `${row.type} (${row.code}) (${row.adm})` : row.label;
                                relevantRules.set(ruleKey, { species: row.nom, status: descriptiveStatus });
                            }
                        }
                    }
                }
            }
            const analysisResp = await fetch('/.netlify/functions/analyze-patrimonial-status', {
                method: 'POST',
                body: JSON.stringify({ 
                    relevantRules: Array.from(relevantRules.values()), 
                    uniqueSpeciesNames, 
                    coords 
                })
            });
            if (!analysisResp.ok) { const errBody = await analysisResp.text(); throw new Error(`Le service d'analyse a échoué: ${errBody}`); }
            const patrimonialMap = await analysisResp.json();
            displayResults(allOccurrences, patrimonialMap, wkt);
        } catch (error) {
            console.error("Erreur durant l'analyse:", error);
            setStatus(`Erreur : ${error.message}`);
            if (mapContainer) mapContainer.style.display = 'none';
        }
    };
     
    const handleAddressSearch = async () => {
        const address = addressInput.value.trim();
        if (!address) return alert("Veuillez saisir une adresse.");
        try {
            setStatus(`Géocodage de l'adresse...`, true);
            const resp = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}`);
            if (!resp.ok) throw new Error("Service de géocodage indisponible.");
            const data = await resp.json();
            if (data.length === 0) throw new Error("Adresse non trouvée.");
            runAnalysis({ latitude: parseFloat(data[0].lat), longitude: parseFloat(data[0].lon) });
        } catch (error) { setStatus(`Erreur : ${error.message}`); }
    };
    
    const handleGeolocationSearch = async () => {
        try {
            setStatus("Récupération de votre position...", true);
            const { coords } = await new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10000 }));
            runAnalysis(coords);
        } catch(error) { setStatus(`Erreur de géolocalisation : ${error.message}`); }
    };

    const switchTab = (tab) => {
        if (tab === 'analysis') {
            analysisTab.style.display = 'block';
            observationsTab.style.display = 'none';
            analysisTabBtn.classList.add('active');
            observationsTabBtn.classList.remove('active');
        } else {
            analysisTab.style.display = 'none';
            observationsTab.style.display = 'block';
            analysisTabBtn.classList.remove('active');
            observationsTabBtn.classList.add('active');
            loadObservations();
        }
    };

    const initializeObservationMap = (coords) => {
        if (obsMap) obsMap.remove();
        obsMapContainer.style.display = 'block';
        const base = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap contributors' });
        obsMap = L.map(obsMapContainer, { center: [coords.latitude, coords.longitude], zoom: 18, layers: [base] });
        observationsLayerGroup = L.layerGroup().addTo(obsMap);
        L.circle([coords.latitude, coords.longitude], { radius: OBS_RADIUS_KM * 1000, color: '#c62828', weight: 2, fillOpacity: 0.1, interactive: false }).addTo(obsMap);
    };

    const displayObservations = (occurrences) => {
        observationsLayerGroup.clearLayers();
        occurrences.forEach(o => {
            if (o.decimalLatitude && o.decimalLongitude && o.species) {
                const m = L.marker([o.decimalLatitude, o.decimalLongitude]);
                m.bindTooltip(`<i>${o.species}</i>`, { permanent: true, direction: 'right', offset: [8,0] });
                observationsLayerGroup.addLayer(m);
            }
        });
        obsStatusDiv.innerHTML = `${occurrences.length} observation(s) trouvée(s).`;
    };

    const loadObservations = async () => {
        try {
            obsStatusDiv.textContent = 'Récupération de votre position...';
            obsMapContainer.style.display = 'none';
            const { coords } = await new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10000 }));
            initializeObservationMap(coords);
            obsStatusDiv.textContent = 'Recherche des occurrences GBIF...';
            const wkt = `POLYGON((${Array.from({length:33},(_,i)=>{const a=i*2*Math.PI/32,r=111.32*Math.cos(coords.latitude*Math.PI/180);return`${(coords.longitude+OBS_RADIUS_KM/r*Math.cos(a)).toFixed(5)} ${(coords.latitude+OBS_RADIUS_KM/111.132*Math.sin(a)).toFixed(5)}`}).join(', ')}))`;
            const url = `https://api.gbif.org/v1/occurrence/search?limit=300&geometry=${encodeURIComponent(wkt)}`;
            const resp = await fetch(url);
            if (!resp.ok) throw new Error("L'API GBIF est indisponible.");
            const data = await resp.json();
            if (!data.results || data.results.length === 0) { obsStatusDiv.textContent = 'Aucune observation trouvée.'; return; }
            displayObservations(data.results);
        } catch(error) {
            obsStatusDiv.textContent = `Erreur : ${error.message}`;
            obsMapContainer.style.display = 'none';
        }
    };
    
    // --- 6. DÉMARRAGE DE L'APPLICATION ---
    await initializeApp();
    switchTab('analysis');
    searchAddressBtn.addEventListener('click', handleAddressSearch);
    useGeolocationBtn.addEventListener('click', handleGeolocationSearch);
    addressInput.addEventListener('keypress', (e) => e.key === 'Enter' && handleAddressSearch());
    analysisTabBtn.addEventListener('click', () => switchTab('analysis'));
    observationsTabBtn.addEventListener('click', () => switchTab('observations'));
});
