// --- 1. SETUP ---
const map = L.map('map', { zoomControl: false }).setView([14.5995, 120.9842], 13);
L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', { 
    maxZoom: 19, 
    attribution: '&copy; OpenStreetMap &copy; CARTO' 
}).addTo(map);

// Layer Group for Landmarks
let landmarkLayer = L.markerClusterGroup({ disableClusteringAtZoom: 16 });
landmarkLayer.addTo(map);

// Variables
let startMarker, endMarker, routeLayer, userMarker, watchId;
let routeData = null, isNavigating = false;
let routeSteps = [], currentStepIndex = 0;
let voiceOn = false;
const activeCategories = new Set(); 

// UI Elements
const els = {
    start: document.getElementById('start'),
    end: document.getElementById('end'),
    routeBtn: document.getElementById('routeBtn'),
    clearBtn: document.getElementById('clearBtn'), // NEW
    profileSelect: document.getElementById('profile'),
    mainPanel: document.getElementById('mainPanel'),
    navOverlay: document.getElementById('navOverlay'),
    stepList: document.getElementById('stepList'),
    toggleListBtn: document.getElementById('toggleListBtn'),
    locateBtn: document.getElementById('locateBtn'),
    landmarkBtn: document.getElementById('landmarkBtn'),
    chips: document.querySelectorAll('#categoryChips button')
};

// --- 2. CLEAR FUNCTIONALITY (NEW) ---
if (els.clearBtn) {
    els.clearBtn.addEventListener('click', () => {
        // Remove Markers
        if (startMarker) map.removeLayer(startMarker);
        if (endMarker) map.removeLayer(endMarker);
        if (routeLayer) map.removeLayer(routeLayer);
        
        // Reset Variables
        startMarker = null;
        endMarker = null;
        routeLayer = null;
        routeData = null;
        routeSteps = [];
        
        // Clear Inputs & UI
        els.start.value = '';
        els.end.value = '';
        document.getElementById('routeStats').innerHTML = '';
        if (els.stepList) els.stepList.innerHTML = '';
        
        // Reset View (Optional: keep current view or reset to default)
        // map.setView([14.5995, 120.9842], 13);
    });
}

// --- 3. TRANSPORT MODE LOGIC ---
const radios = document.querySelectorAll('input[name="profile"]');
radios.forEach(radio => {
    radio.addEventListener('change', (e) => {
        if(startMarker && endMarker) els.routeBtn.click();
    });
});
if(els.profileSelect) {
    els.profileSelect.addEventListener('change', () => {
        if(startMarker && endMarker) els.routeBtn.click();
    });
}

// --- 4. MARKERS & REVERSE GEOCODING ---
map.on('click', async e => {
    if (isNavigating) return;
    const {lat, lng} = e.latlng;
    let address = `${lat.toFixed(4)}, ${lng.toFixed(4)}`; 
    try {
        const res = await fetch(`/reverse?lat=${lat}&lon=${lng}`).then(r => r.json());
        if(res.display_name) address = res.display_name.split(',').slice(0,2).join(',');
    } catch(err){}

    if (!startMarker) setMarker('start', e.latlng, address);
    else setMarker('end', e.latlng, address);
});

function setMarker(type, latlng, text) {
    const isStart = type === 'start';
    const icon = L.divIcon({
        className: 'custom-pin',
        html: `<div style="background-color: ${isStart ? '#3b82f6' : '#ef4444'}; width: 24px; height: 24px; border: 3px solid white; border-radius: 50%; box-shadow: 0 4px 8px rgba(0,0,0,0.4);"></div>`,
        iconSize: [24, 24], iconAnchor: [12, 12]
    });

    const marker = L.marker(latlng, { icon: icon, draggable: true });
    marker.on('dragend', async () => {
        const pos = marker.getLatLng();
        let addr = `${pos.lat.toFixed(4)}, ${pos.lng.toFixed(4)}`;
        try {
            const r = await fetch(`/reverse?lat=${pos.lat}&lon=${pos.lng}`).then(j=>j.json());
            if(r.display_name) addr = r.display_name.split(',').slice(0,2).join(',');
        } catch(e){}
        if (isStart) els.start.value = addr; else els.end.value = addr;
        if(startMarker && endMarker) els.routeBtn.click();
    });

    if (isStart) {
        if (startMarker) map.removeLayer(startMarker);
        startMarker = marker.addTo(map);
        els.start.value = text;
    } else {
        if (endMarker) map.removeLayer(endMarker);
        endMarker = marker.addTo(map);
        els.end.value = text;
    }
    if(startMarker && endMarker) els.routeBtn.click();
}

// --- 5. BOTTOM BUTTONS ---

// My Location
if(els.locateBtn) {
    els.locateBtn.addEventListener('click', () => {
        if(!navigator.geolocation) return alert("Geolocation not supported");
        navigator.geolocation.getCurrentPosition(pos => {
            const lat = pos.coords.latitude, lng = pos.coords.longitude;
            map.setView([lat, lng], 16);
            setMarker('start', {lat, lng}, "My Location");
        }, err => alert("Could not get location"));
    });
}

// Landmarks / Explore
async function fetchAndRenderLandmarks(center) {
    const catsParam = activeCategories.size ? ('&cats=' + Array.from(activeCategories).join(',')) : '';
    try {
        const resp = await fetch('/landmarks?lat=' + center.lat + '&lon=' + center.lng + catsParam + '&radius=1500');
        const data = await resp.json();
        landmarkLayer.clearLayers();
        
        (data.elements || []).forEach(el => {
            // Get coordinates (handle Nodes vs Ways/Buildings)
            const lat = el.lat || (el.center && el.center.lat);
            const lon = el.lon || (el.center && el.center.lon);
            
            if (lat && lon) {
                const tags = el.tags || {};
                const name = tags.name || tags.amenity || tags.leisure || 'Spot';
                const type = tags.amenity || tags.leisure || tags.tourism || 'poi';
                
                // Color code
                let color = '#3b82f6';
                if(type === 'park' || type === 'garden') color = '#22c55e';
                if(type === 'restaurant' || type === 'cafe' || type === 'fast_food') color = '#f59e0b';
                if(type === 'bank' || type === 'atm') color = '#6366f1';
                if(type === 'hospital' || type === 'pharmacy') color = '#ef4444';

                const icon = L.divIcon({ 
                    className: 'poi-icon', 
                    html: `<div style="background:${color}; color:white; padding:4px 8px; border-radius:12px; font-size:11px; font-weight:bold; box-shadow:0 2px 5px rgba(0,0,0,0.3); border:1px solid white; white-space:nowrap;">${name}</div>`,
                    iconAnchor: [20, 20]
                });

                const m = L.marker([lat, lon], { icon: icon }).bindPopup(`<strong>${name}</strong><br><span class="text-secondary">${type}</span>`);
                landmarkLayer.addLayer(m);
            }
        });
        return (data.elements || []).length;
    } catch(e) { console.error(e); return 0; }
}

if(els.landmarkBtn) {
    els.landmarkBtn.addEventListener('click', async () => {
        const count = await fetchAndRenderLandmarks(map.getCenter());
        if(count === 0) alert("No major landmarks found nearby.");
    });
}

// Chips
if(els.chips) {
    els.chips.forEach(btn => {
        btn.addEventListener('click', () => {
            const cat = btn.getAttribute('data-cat');
            if(activeCategories.has(cat)) {
                activeCategories.delete(cat);
                btn.classList.remove('active');
                btn.style.background = 'transparent';
                btn.style.color = '#cbd5e1';
            } else {
                activeCategories.add(cat);
                btn.classList.add('active');
                btn.style.background = '#3b82f6';
                btn.style.color = 'white';
            }
            fetchAndRenderLandmarks(map.getCenter());
        });
    });
}

// --- 6. ROUTING ---
if (els.routeBtn) {
    els.routeBtn.addEventListener('click', async () => {
        if (!startMarker || !endMarker) return;
        
        let mode = 'driving';
        const checkedRadio = document.querySelector('input[name="profile"]:checked');
        if (checkedRadio) mode = checkedRadio.value;
        else if (els.profileSelect) mode = els.profileSelect.value;

        try {
            const url = `/route?startLat=${startMarker.getLatLng().lat}&startLng=${startMarker.getLatLng().lng}&endLat=${endMarker.getLatLng().lat}&endLng=${endMarker.getLatLng().lng}&profile=${mode}&steps=true&_t=${Date.now()}`;
            const res = await fetch(url).then(r => r.json());
            
            if (!res.routes || !res.routes.length) throw new Error("No route");
            routeData = res.routes[0];
            
            const coords = polyline.decode(routeData.geometry).map(p => [p[0], p[1]]);
            if (routeLayer) map.removeLayer(routeLayer);
            routeLayer = L.polyline(coords, { color: '#3b82f6', weight: 6 }).addTo(map);
            map.fitBounds(routeLayer.getBounds(), { padding: [50, 50] });

            const kms = (routeData.distance/1000).toFixed(1);
            const mins = Math.round(routeData.duration/60);
            const statsEl = document.getElementById('routeStats');
            if(statsEl) statsEl.innerHTML = `<i class="bi bi-clock"></i> ${mins} min &nbsp; <i class="bi bi-signpost-2"></i> ${kms} km`;

            if(els.stepList) els.stepList.innerHTML = '';
            routeSteps = [];
            routeData.legs[0].steps.forEach((step, idx) => {
                const instruction = step.maneuver.type + ' ' + (step.maneuver.modifier || '') + (step.name ? ' on ' + step.name : '');
                routeSteps.push({
                    loc: L.latLng(step.maneuver.location[1], step.maneuver.location[0]),
                    text: instruction,
                    dist: step.distance, spoken: false
                });
                if(els.stepList) {
                    const li = document.createElement('li');
                    li.className = 'step-item';
                    li.innerHTML = `<i class="bi bi-arrow-right"></i> <div>${instruction}</div> <div class="ms-auto">${Math.round(step.distance)}m</div>`;
                    els.stepList.appendChild(li);
                }
            });
            if(window.innerWidth < 768 && els.mainPanel) els.mainPanel.classList.add('collapsed');
        } catch (err) { alert("Route calculation failed."); }
    });
}

// --- 7. NAVIGATION ---
const startNavBtn = document.getElementById('startNavBtn');
if (startNavBtn) {
    startNavBtn.addEventListener('click', () => {
        if (!routeData) return alert("Please get a route first");
        if (!navigator.geolocation) return alert("GPS not available");
        
        isNavigating = true;
        currentStepIndex = 0;
        document.body.classList.add('navigating');
        
        if(els.mainPanel) els.mainPanel.style.display = 'none';
        if(els.navOverlay) els.navOverlay.style.display = 'block';
        
        speak("Starting navigation");
        watchId = navigator.geolocation.watchPosition(updateNavigation, null, { enableHighAccuracy: true });
    });
}

const stopNavBtn = document.getElementById('stopNavBtn');
if (stopNavBtn) {
    stopNavBtn.addEventListener('click', () => {
        isNavigating = false;
        document.body.classList.remove('navigating');
        if(els.navOverlay) els.navOverlay.style.display = 'none';
        if(els.mainPanel) els.mainPanel.style.display = 'block';
        if(watchId) navigator.geolocation.clearWatch(watchId);
        if(userMarker) map.removeLayer(userMarker);
        if(routeLayer) map.fitBounds(routeLayer.getBounds());
    });
}

function updateNavigation(pos) {
    const lat = pos.coords.latitude, lng = pos.coords.longitude;
    const userLoc = L.latLng(lat, lng);

    if (!userMarker) userMarker = L.marker([lat, lng], {
        icon: L.divIcon({ html: '<div style="width:20px;height:20px;background:#3b82f6;border:3px solid white;border-radius:50%;box-shadow:0 0 10px blue;"></div>' })
    }).addTo(map);
    else userMarker.setLatLng([lat, lng]);

    map.setView([lat, lng], 18, { animate: true });

    if(routeSteps[currentStepIndex]) {
        const distToPath = userLoc.distanceTo(routeSteps[currentStepIndex].loc);
        if(distToPath > 50) { 
           startMarker.setLatLng(userLoc);
           if(els.routeBtn) els.routeBtn.click();
        }
    }

    if (currentStepIndex < routeSteps.length) {
        const nextStep = routeSteps[currentStepIndex];
        const dist = userLoc.distanceTo(nextStep.loc);
        
        const distEl = document.getElementById('navDist');
        if(distEl) distEl.innerText = dist < 1000 ? Math.round(dist) + 'm' : (dist/1000).toFixed(1) + 'km';
        
        const textEl = document.getElementById('navText');
        if(textEl) textEl.innerText = nextStep.text;

        if (dist < 80 && !nextStep.spoken) { speak("In 80 meters, " + nextStep.text); nextStep.spoken = true; }
        if (dist < 20) { currentStepIndex++; speak(nextStep.text); }
    } else {
        const textEl = document.getElementById('navText');
        if(textEl) textEl.innerText = "Arrived";
    }
}

// Voice Toggle
const voiceToggle = document.getElementById('voiceToggle');
if(voiceToggle) voiceToggle.addEventListener('change', (e) => voiceOn = e.target.checked);

function speak(text) {
    if (!voiceOn) return;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
}

// Autocomplete
async function searchNominatim(q) {
    try {
        const b = map.getBounds();
        const viewbox = [b.getWest(), b.getNorth(), b.getEast(), b.getSouth()].join(',');
        const resp = await fetch(`/search?q=${encodeURIComponent(q)}&viewbox=${viewbox}`);
        return await resp.json();
    } catch(e) { return []; }
}
function attachAutocomplete(inputId, listId) {
    const input = document.getElementById(inputId);
    const list = document.getElementById(listId);
    if (!input || !list) return;
    let t = null;
    input.addEventListener('input', () => {
        const q = input.value.trim();
        if(t) clearTimeout(t);
        if(q.length < 2) { list.style.display='none'; return; }
        t = setTimeout(async () => {
            const results = await searchNominatim(q);
            list.innerHTML = '';
            results.slice(0, 5).forEach(r => {
                const item = document.createElement('div');
                item.className = 'autocomplete-item';
                let main = r.name || r.display_name.split(',')[0];
                item.innerHTML = `<strong>${main}</strong>`;
                item.onclick = () => {
                    input.value = main;
                    list.style.display = 'none';
                    setMarker(inputId === 'start' ? 'start' : 'end', {lat: parseFloat(r.lat), lng: parseFloat(r.lon)}, main);
                    map.setView([r.lat, r.lon], 16);
                };
                list.appendChild(item);
            });
            list.style.display = results.length ? 'block' : 'none';
        }, 300);
    });
    document.addEventListener('click', e => { if(!input.contains(e.target) && !list.contains(e.target)) list.style.display='none'; });
}
attachAutocomplete('start', 'start-list');
attachAutocomplete('end', 'end-list');