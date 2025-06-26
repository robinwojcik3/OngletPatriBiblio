// /biblio-patri.js
// Version finale avec indexation côté client et contrôle des fonds de carte.

document.addEventListener('DOMContentLoaded', async () => {
    // --- 1. Injection des styles ---

    // Définir la projection Lambert-93 pour proj4
    if (typeof proj4 !== 'undefined') {
        proj4.defs('EPSG:2154', '+proj=lcc +lat_1=49 +lat_2=44 +lat_0=46.5 +lon_0=3 +x_0=700000 +y_0=6600000 +ellps=GRS80 +units=m +no_defs');
    }
    
    
    // --- 2. Déclaration des variables et constantes globales ---
    const statusDiv = document.getElementById('status');
    const resultsContainer = document.getElementById('results');
    const mapContainer = document.getElementById('map');
    const addressInput = document.getElementById('address-input');
    const searchAddressBtn = document.getElementById('search-address-btn');
    const useGeolocationBtn = document.getElementById('use-geolocation-btn');
    const selectOnMapBtn = document.getElementById('select-on-map-btn');
    const analysisTabBtn = document.getElementById('analysis-tab-btn');
    const observationsTabBtn = document.getElementById('observations-tab-btn');
    const analysisTab = document.getElementById('analysis-tab');
    const observationsTab = document.getElementById('observations-tab');
    const obsStatusDiv = document.getElementById('obs-status');
    const obsMapContainer = document.getElementById('observations-map');
    const obsGeolocBtn = document.getElementById('obs-geoloc-btn');
    const downloadShapefileBtn = document.getElementById('download-shapefile-btn');
    const downloadContainer = document.getElementById('download-container');

    let currentShapefileData = null;

    let map = null;
    let patrimonialLayerGroup = L.layerGroup();
    let obsMap = null;
    let observationsLayerGroup = L.layerGroup();
    let rulesByTaxonIndex = new Map();
    const SEARCH_RADIUS_KM = 2;
    const OBS_RADIUS_KM = 0.2;
    const TRACHEOPHYTA_TAXON_KEY = 7707728; // GBIF taxonKey for vascular plants
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
    
        const satelliteMap = L.tileLayer(
            'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
            {
                attribution:
                    'Tiles © Esri — Source: Esri, Earthstar Geographics, and the GIS User Community',
                maxZoom: 19,
                crossOrigin: true
            }
        );
    
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
            "Satellite": satelliteMap
        };
    
        const overlayMaps = {
            "Espèces Patrimoniales": patrimonialLayerGroup
        };
    
        // 4. Ajout du contrôle à la carte
        L.control.layers(baseMaps, overlayMaps).addTo(map);

        // 5. Ajout du cercle de recherche
        L.circle([coords.latitude, coords.longitude], { radius: SEARCH_RADIUS_KM * 1000, color: '#c62828', weight: 2, fillOpacity: 0.1, interactive: false }).addTo(map);
    };

    const initializeSelectionMap = (coords) => {
        if (map) { map.remove(); }
        const topoMap = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
            attribution: 'Map data: © OpenStreetMap contributors, SRTM | Map style: © OpenTopoMap (CC-BY-SA)'
        });
        const satelliteMap = L.tileLayer(
            'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
            {
                attribution: 'Tiles © Esri — Source: Esri, Earthstar Geographics, and the GIS User Community',
                maxZoom: 19,
                crossOrigin: true
            }
        );
        mapContainer.style.display = 'block';
        map = L.map(mapContainer, { center: [coords.latitude, coords.longitude], zoom: 6, layers: [topoMap] });
        L.control.layers({ "Topographique": topoMap, "Satellite": satelliteMap }).addTo(map);
    };
   
    const fetchAndDisplayAllPatrimonialOccurrences = async (patrimonialMap, wkt, initialOccurrences) => {
        const speciesNames = Object.keys(patrimonialMap);
        if (speciesNames.length === 0) return;
        setStatus(`Étape 4/4: Cartographie détaillée des espèces patrimoniales... (0/${speciesNames.length})`, true);
        let allOccurrencesWithContext = [];
        const taxonKeyMap = new Map();
        initialOccurrences.forEach(occ => {
            if (occ.species && occ.speciesKey && !taxonKeyMap.has(occ.species)) {
                taxonKeyMap.set(occ.species, occ.speciesKey);
            }
        });
        for (const [index, speciesName] of speciesNames.entries()) {
            setStatus(`Étape 4/4: Cartographie détaillée des espèces patrimoniales... (${index + 1}/${speciesNames.length})`, true);
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
        const features = [];
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
            if (typeof proj4 !== 'undefined') {
                const coords2154 = proj4('EPSG:4326', 'EPSG:2154', [location.lon, location.lat]);
                features.push({
                    type: 'Feature',
                    properties: { species: location.speciesList.map(s => s.name).join('; ') },
                    geometry: { type: 'Point', coordinates: coords2154 }
                });
            }
        }
        if (features.length > 0) {
            currentShapefileData = { type: 'FeatureCollection', features };
            downloadContainer.style.display = 'block';
        } else {
            currentShapefileData = null;
            downloadContainer.style.display = 'none';
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
        setStatus(`${Object.keys(patrimonialMap).length} espèce(s) patrimoniale(s) trouvée(s). Lancement de l'étape 4/4 : cartographie détaillée...`);
        const tableBody = document.createElement('tbody');
        Object.keys(patrimonialMap).sort().forEach((speciesName, index) => {
            const color = SPECIES_COLORS[index % SPECIES_COLORS.length];
            const row = tableBody.insertRow();
            const statusCellContent = Array.isArray(patrimonialMap[speciesName]) 
                ? '<ul>' + patrimonialMap[speciesName].map(s => `<li>${s}</li>`).join('') + '</ul>'
                : patrimonialMap[speciesName];
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
            setStatus("Étape 1/4: Initialisation de la carte...", true);
            const wkt = `POLYGON((${Array.from({length:33},(_,i)=>{const a=i*2*Math.PI/32,r=111.32*Math.cos(coords.latitude*Math.PI/180);return`${(coords.longitude+SEARCH_RADIUS_KM/r*Math.cos(a)).toFixed(5)} ${(coords.latitude+SEARCH_RADIUS_KM/111.132*Math.sin(a)).toFixed(5)}`}).join(', ')}))`;
            let allOccurrences = [];
            const maxPages = 12;
            const limit = 1000;
            setStatus(`Étape 2/4: Inventaire de la flore locale via GBIF... (Page 0/${maxPages})`, true);
            for (let page = 0; page < maxPages; page++) {
                const offset = page * limit;
                setStatus(`Étape 2/4: Inventaire de la flore locale via GBIF... (Page ${page + 1}/${maxPages})`, true);
                const gbifUrl = `https://api.gbif.org/v1/occurrence/search?limit=${limit}&offset=${offset}&geometry=${encodeURIComponent(wkt)}&kingdomKey=6`;
                const gbifResp = await fetch(gbifUrl);
                if (!gbifResp.ok) throw new Error("L'API GBIF est indisponible.");
                const pageData = await gbifResp.json();
                if (pageData.results?.length > 0) { allOccurrences = allOccurrences.concat(pageData.results); }
                if (pageData.endOfRecords) { break; }
            }
            if (allOccurrences.length === 0) { throw new Error("Aucune occurrence de plante trouvée à proximité."); }
            setStatus("Étape 3/4: Analyse des données...", true);
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

    const startMapSelection = async () => {
        resultsContainer.innerHTML = '';
        downloadContainer.style.display = 'none';
        let center = { latitude: 46.5, longitude: 2 };
        try {
            const { coords } = await new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 }));
            center = { latitude: coords.latitude, longitude: coords.longitude };
        } catch (e) {}
        initializeSelectionMap(center);
        setStatus('Cliquez sur la carte pour choisir un lieu.', false);
        const onClick = (e) => {
            if (confirm("Voulez-vous lancer l'analyse sur ce lieu ?")) {
                map.off('click', onClick);
                runAnalysis({ latitude: e.latlng.lat, longitude: e.latlng.lng });
            }
        };
        map.on('click', onClick);
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
            initializeObservationMap();
            obsStatusDiv.textContent = "Double-cliquez sur la carte ou faites un long appui pour choisir un endroit, ou utilisez la géolocalisation.";
        }
    };

    let obsSearchCircle = null;

    const initializeObservationMap = () => {
        if (obsMap) return;
        obsMapContainer.style.display = 'block';
        const planMap = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors'
        });

        const satelliteMap = L.tileLayer(
            'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
            {
                attribution:
                    'Tiles © Esri — Source: Esri, Earthstar Geographics, and the GIS User Community',
                maxZoom: 19,
                crossOrigin: true
            }
        );

        obsMap = L.map(obsMapContainer, { center: [46.5, 2], zoom: 6, layers: [planMap] });

        observationsLayerGroup = L.layerGroup().addTo(obsMap);

        const baseMaps = {
            "Plan": planMap,
            "Satellite": satelliteMap
        };

        const overlayMaps = {
            "Observations": observationsLayerGroup
        };

        L.control.layers(baseMaps, overlayMaps).addTo(obsMap);

        let pressTimer;
        const handleSelect = (latlng) => loadObservationsAt({ latitude: latlng.lat, longitude: latlng.lng });
        obsMap.on('dblclick', (e) => handleSelect(e.latlng));
        obsMap.on('mousedown touchstart', (e) => {
            pressTimer = setTimeout(() => handleSelect(e.latlng), 600);
        });
        obsMap.on('mouseup touchend', () => clearTimeout(pressTimer));
    };

    const displayObservations = (occurrences) => {
        observationsLayerGroup.clearLayers();
        const floraOccs = occurrences.filter(o =>
            (o.phylum && /tracheophyta/i.test(o.phylum)) ||
            (o.kingdom && /plantae/i.test(o.kingdom))
        );
        floraOccs.forEach(o => {
            if (o.decimalLatitude && o.decimalLongitude && o.species) {
                const m = L.marker([o.decimalLatitude, o.decimalLongitude]);
                m.bindTooltip(`<i>${o.species}</i>`, { permanent: true, direction: 'right', offset: [8,0] });
                observationsLayerGroup.addLayer(m);
            }
        });
        obsStatusDiv.innerHTML = `${floraOccs.length} observation(s) de flore trouvée(s).`;
    };

    const downloadShapefile = () => {
        if (!currentShapefileData) return;
        try {
            shpwrite.download(currentShapefileData, { folder: 'patrimonial_data', types: { point: 'occurrences' } });
        } catch (e) {
            if (typeof showNotification === 'function') {
                showNotification("Erreur lors de la génération du shapefile", 'error');
            }
        }
    };

    const loadObservationsAt = async (coords) => {
        try {
            if (!obsMap) initializeObservationMap();
            obsMapContainer.style.display = 'block';
            obsMap.setView([coords.latitude, coords.longitude], 18);
            if (obsSearchCircle) obsMap.removeLayer(obsSearchCircle);
            obsSearchCircle = L.circle([coords.latitude, coords.longitude], { radius: OBS_RADIUS_KM * 1000, color: '#c62828', weight: 2, fillOpacity: 0.1, interactive: false }).addTo(obsMap);
            obsStatusDiv.textContent = 'Recherche des occurrences GBIF...';
            const wkt = `POLYGON((${Array.from({length:33},(_,i)=>{const a=i*2*Math.PI/32,r=111.32*Math.cos(coords.latitude*Math.PI/180);return`${(coords.longitude+OBS_RADIUS_KM/r*Math.cos(a)).toFixed(5)} ${(coords.latitude+OBS_RADIUS_KM/111.132*Math.sin(a)).toFixed(5)}`}).join(', ')}))`;
            const url = `https://api.gbif.org/v1/occurrence/search?limit=300&geometry=${encodeURIComponent(wkt)}&taxonKey=${TRACHEOPHYTA_TAXON_KEY}`;
            const resp = await fetch(url);
            if (!resp.ok) throw new Error("L'API GBIF est indisponible.");
            const data = await resp.json();
            if (!data.results || data.results.length === 0) { obsStatusDiv.textContent = 'Aucune observation trouvée.'; return; }
            displayObservations(data.results);
        } catch(error) {
            obsStatusDiv.textContent = `Erreur : ${error.message}`;
        }
    };

    const geolocateAndLoadObservations = async () => {
        try {
            obsStatusDiv.textContent = 'Récupération de votre position...';
            const { coords } = await new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10000 }));
            loadObservationsAt(coords);
        } catch(error) {
            obsStatusDiv.textContent = `Erreur : ${error.message}`;
        }
    };
    
    // --- 6. DÉMARRAGE DE L'APPLICATION ---
    await initializeApp();
    switchTab('analysis');
    searchAddressBtn.addEventListener('click', handleAddressSearch);
    useGeolocationBtn.addEventListener('click', handleGeolocationSearch);
    selectOnMapBtn.addEventListener('click', startMapSelection);
    addressInput.addEventListener('keypress', (e) => e.key === 'Enter' && handleAddressSearch());
    analysisTabBtn.addEventListener('click', () => switchTab('analysis'));
    observationsTabBtn.addEventListener('click', () => switchTab('observations'));
    obsGeolocBtn.addEventListener('click', geolocateAndLoadObservations);
    downloadShapefileBtn.addEventListener('click', downloadShapefile);
});
