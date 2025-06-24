// /biblio-patri.js
// Version finale utilisant la fonction serverless "Analyste" et une cartographie détaillée en 3 étapes.

document.addEventListener('DOMContentLoaded', () => {
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
         td a { color: var(--primary); text-decoration: none; font-weight: 500; }
         td a:hover { text-decoration: underline; }
         .legend-color { display: inline-block; width: 12px; height: 12px; border-radius: 50%; margin-right: 8px; vertical-align: middle; }
         .search-controls { display: flex; flex-direction: column; gap: 0.75rem; padding: 1.5rem; background-color: var(--card); border-radius: 8px; border: 1px solid var(--border); margin-bottom: 2rem; }
         .search-group { display: flex; flex-direction: column; gap: 0.5rem; }
         .search-controls input[type="text"] { padding: 12px; font-size: 1rem; border: 1px solid var(--border); border-radius: 4px; }
         .search-controls .action-button { background-color: var(--primary); color: white; border: none; padding: 12px; font-size: 1rem; border-radius: 4px; cursor: pointer; transition: background-color 0.2s; }
         .search-controls .action-button:hover { background-color: #a02020; }
         .search-controls .action-button:disabled { background-color: #999; cursor: not-allowed; }
         .search-controls .separator { text-align: center; font-style: italic; color: #666; }
     `;
     const styleElement = document.createElement('style');
     styleElement.textContent = pageStyles;
     document.head.appendChild(styleElement);

     const statusDiv = document.getElementById('status');
     const resultsContainer = document.getElementById('results');
     const mapContainer = document.getElementById('map');
     const addressInput = document.getElementById('address-input');
     const searchAddressBtn = document.getElementById('search-address-btn');
     const useGeolocationBtn = document.getElementById('use-geolocation-btn');

     let map = null;
     let speciesLayers = new Map();
     const SEARCH_RADIUS_KM = 2;
     const SPECIES_COLORS = ['#E6194B', '#3CB44B', '#FFE119', '#4363D8', '#F58231', '#911EB4', '#46F0F0', '#F032E6', '#BCF60C', '#FABEBE', '#800000', '#AA6E28', '#000075', '#A9A9A9'];
     
     const setStatus = (message, isLoading = false) => {
         statusDiv.innerHTML = '';
         if (isLoading) {
             const spinner = document.createElement('div');
             spinner.className = 'loading';
             statusDiv.appendChild(spinner);
         }
         if (message) statusDiv.innerHTML += `<p>${message}</p>`;
     };

     const initializeMap = (coords) => {
         if (map) map.remove();
         mapContainer.style.display = 'block';
         map = L.map(mapContainer).setView([coords.latitude, coords.longitude], 13);
         L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', { attribution: 'Map data: © OpenStreetMap contributors' }).addTo(map);
         L.circle([coords.latitude, coords.longitude], { radius: SEARCH_RADIUS_KM * 1000, color: '#c62828', weight: 2, fillOpacity: 0.1, interactive: false }).addTo(map);
     };
    
    // *** NOUVEAU *** : Fonction dédiée à la cartographie exhaustive des espèces patrimoniales.
    const fetchAndDisplayAllPatrimonialOccurrences = async (patrimonialMap, wkt, initialOccurrences) => {
        const speciesNames = Object.keys(patrimonialMap);
        if (speciesNames.length === 0) return;

        setStatus("Étape 3/3: Cartographie détaillée des espèces patrimoniales...", true);

        // Effacer les marqueurs de l'inventaire initial pour les remplacer.
        speciesLayers.forEach(layer => map.removeLayer(layer));
        speciesLayers.clear();
        
        // Créer un index rapide pour trouver le taxonKey (plus fiable que le nom pour les requêtes)
        const taxonKeyMap = new Map();
        initialOccurrences.forEach(occ => {
            if (occ.species && occ.speciesKey && !taxonKeyMap.has(occ.species)) {
                taxonKeyMap.set(occ.species, occ.speciesKey);
            }
        });

        for (const [index, speciesName] of speciesNames.entries()) {
            const taxonKey = taxonKeyMap.get(speciesName);
            if (!taxonKey) continue; // On passe si on ne trouve pas de clé de taxon

            let allSpeciesOccurrences = [];
            const maxPages = 10; // On s'autorise plus de pages pour une recherche ciblée.
            const limit = 1000;
            let endOfRecords = false;

            for (let page = 0; page < maxPages && !endOfRecords; page++) {
                const offset = page * limit;
                const gbifUrl = `https://api.gbif.org/v1/occurrence/search?limit=${limit}&offset=${offset}&geometry=${encodeURIComponent(wkt)}&taxonKey=${taxonKey}`;
                try {
                    const resp = await fetch(gbifUrl);
                    if (!resp.ok) break;
                    const pageData = await resp.json();
                    if (pageData.results?.length > 0) {
                        allSpeciesOccurrences = allSpeciesOccurrences.concat(pageData.results);
                    }
                    endOfRecords = pageData.endOfRecords;
                } catch (e) {
                    console.error("Erreur durant la cartographie détaillée pour :", speciesName, e);
                    break; 
                }
            }

            if (allSpeciesOccurrences.length > 0) {
                const color = SPECIES_COLORS[index % SPECIES_COLORS.length];
                const icon = L.divIcon({ html: `<div style="background-color:${color};width:12px;height:12px;border-radius:50%;border:2px solid white;box-shadow:0 0 3px #000;"></div>`, className:'custom-div-icon', iconSize:[16,16] });
                const layerGroup = L.layerGroup();
                allSpeciesOccurrences.forEach(occ => {
                    if (occ.decimalLatitude && occ.decimalLongitude) {
                       L.marker([occ.decimalLatitude, occ.decimalLongitude], { icon }).addTo(layerGroup).bindPopup(`<b><i>${speciesName}</i></b>`);
                    }
                });
                layerGroup.addTo(map);
                speciesLayers.set(speciesName, layerGroup);
            }
        }
        setStatus(`${speciesNames.length} espèce(s) patrimoniale(s) cartographiée(s).`, false);
    };


     const displayResults = (occurrences, patrimonialMap, wkt) => {
         resultsContainer.innerHTML = '';
         if (map) {
             speciesLayers.forEach(layer => map.removeLayer(layer));
         }
         speciesLayers.clear();

         const patrimonialOccurrences = occurrences.filter(occ => occ.species && patrimonialMap[occ.species]);
         
         const speciesSummary = new Map();
         patrimonialOccurrences.forEach(occ => {
             if (!speciesSummary.has(occ.species)) {
                 speciesSummary.set(occ.species, { name: occ.species, label: patrimonialMap[occ.species], occurrences: [] });
             }
             speciesSummary.get(occ.species).occurrences.push({ lat: occ.decimalLatitude, lon: occ.decimalLongitude });
         });

         const sortedSpecies = Array.from(speciesSummary.values()).sort((a,b) => a.name.localeCompare(b.name));
         if (sortedSpecies.length === 0) {
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

         // Lancement de la cartographie exhaustive après affichage du tableau.
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
             const maxPages = 6;
             const limit = 1000;

             for (let page = 0; page < maxPages; page++) {
                 const offset = page * limit;
                 setStatus(`Étape 1/2: Inventaire de la flore locale via GBIF... (Page ${page + 1}/${maxPages})`, true);
                 const gbifUrl = `https://api.gbif.org/v1/occurrence/search?limit=${limit}&offset=${offset}&geometry=${encodeURIComponent(wkt)}&kingdomKey=6`;
                 const gbifResp = await fetch(gbifUrl);
                 if (!gbifResp.ok) throw new Error("L'API GBIF est indisponible.");
                 const pageData = await gbifResp.json();
                 if (pageData.results?.length > 0) {
                     allOccurrences = allOccurrences.concat(pageData.results);
                 }
                 if (pageData.endOfRecords) { break; }
             }
             
             console.log(`Collecte terminée. ${allOccurrences.length} occurrences totales récupérées depuis GBIF.`);
             if (allOccurrences.length === 0) { throw new Error("Aucune occurrence de plante trouvée à proximité."); }
             
             setStatus("Étape 2/2: Qualification patrimoniale par l'Analyste Augmenté...", true);
             const analysisResp = await fetch('/.netlify/functions/analyze-patrimonial-status', {
                 method: 'POST',
                 body: JSON.stringify({ discoveredOccurrences: allOccurrences, coords })
             });
             if (!analysisResp.ok) { const errBody = await analysisResp.text(); throw new Error(`Le service d'analyse a échoué: ${errBody}`); }
             const patrimonialMap = await analysisResp.json();
             
             // On passe le WKT à la fonction d'affichage pour qu'elle puisse le réutiliser.
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
     
     // Initialisation de la page
     setStatus("Prêt. Choisissez une méthode de recherche.");
     searchAddressBtn.addEventListener('click', handleAddressSearch);
     useGeolocationBtn.addEventListener('click', handleGeolocationSearch);
     addressInput.addEventListener('keypress', (e) => e.key === 'Enter' && handleAddressSearch());
});
