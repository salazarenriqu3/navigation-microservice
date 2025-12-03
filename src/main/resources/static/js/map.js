// --- 1. INITIALIZATION ---
// FIX: Switch to a 'Light' map theme (Carto Voyager) so it's not "just black"
const map = L.map('map', { zoomControl: false }).setView([14.5995, 120.9842], 13);
L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
    maxZoom: 19, attribution: '&copy; OpenStreetMap &copy; CARTO'
}).addTo(map);

// Layer Groups
let landmarkLayer = L.markerClusterGroup({ disableClusteringAtZoom: 16 });
landmarkLayer.addTo(map);

// State Variables
let startMarker, endMarker, routeLayer, userMarker, watchId;
let routeData = null, isNavigating = false;
let routeSteps = [], currentStepIndex = 0, voiceOn = false;
const activeCategories = new Set();

// UI References
const els = {
    start: document.getElementById('start'),
    end: document.getElementById('end'),
    mainPanel: document.getElementById('mainPanel'),
    mobileToggle: document.getElementById('mobileToggle'),
    navTop: document.getElementById('navTopBar'),
    navBottom: document.getElementById('navBottomBar'),
    navDist: document.getElementById('navDist'),
    navText: document.getElementById('navText'),
    navNext: document.getElementById('navNextText'),
    navETA: document.getElementById('navETA'),
    navRem: document.getElementById('navRem')
};

// --- 2. SEARCH & AUTOCOMPLETE ---
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
    let t = null;
    
    input.addEventListener('input', () => {
        const q = input.value.trim();
        if(t) clearTimeout(t);
        if(q.length < 2) { list.style.display='none'; return; }
        
        t = setTimeout(async () => {
            const results = await searchNominatim(q);
            list.innerHTML = '';
            
            if (results.length === 0) { list.style.display = 'none'; return; }

            results.slice(0, 5).forEach(r => {
                const item = document.createElement('div');
                item.className = 'autocomplete-item';
                let mainText = r.name || r.display_name.split(',')[0];
                let subText = r.address ? 
                    [r.address.city || r.address.town || r.address.municipality, r.address.state || r.address.region].filter(Boolean).join(', ') : 
                    r.display_name.substring(mainText.length).replace(/^, /, '');

                item.innerHTML = `<strong>${mainText}</strong><br><small class="text-secondary">${subText}</small>`;
                
                item.onclick = () => {
                    input.value = mainText;
                    list.style.display = 'none';
                    const lat = parseFloat(r.lat), lon = parseFloat(r.lon);
                    // Set marker and zoom
                    setMarker(inputId === 'start' ? 'start' : 'end', {lat, lng:lon}, mainText);
                    map.setView([lat, lon], 16);
                };
                list.appendChild(item);
            });
            list.style.display = 'block';
        }, 300);
    });
    
    document.addEventListener('click', (e) => {
        if(!input.contains(e.target) && !list.contains(e.target)) list.style.display='none';
    });
}
attachAutocomplete('start', 'start-list');
attachAutocomplete('end', 'end-list');

// --- 3. LANDMARKS & POI ---
function iconForCategory(cat) {
    return L.divIcon({ 
        className: 'poi-icon poi-' + cat, 
        html: `<span>${cat}</span>`, 
        iconAnchor: [16, 24], popupAnchor: [0, -18] 
    });
}

async function fetchAndRenderLandmarks(center) {
    const catsParam = activeCategories.size ? ('&cats=' + Array.from(activeCategories).join(',')) : '';
    try {
        const resp = await fetch('/landmarks?lat=' + center.lat + '&lon=' + center.lng + catsParam + '&radius=2000');
        const data = await resp.json();
        landmarkLayer.clearLayers();
        
        (data.elements || []).forEach(el => {
            const name = (el.tags && (el.tags.name || el.tags.amenity || el.tags.tourism)) || 'Unnamed';
            const cat = (el.tags && (el.tags.amenity || el.tags.tourism || el.tags.leisure)) || 'poi';
            const m = L.marker([el.lat, el.lon], { icon: iconForCategory(cat) })
                       .bindPopup(`<strong>${name}</strong><br><span class="text-secondary">${cat}</span>`);
            landmarkLayer.addLayer(m);
        });
        return (data.elements || []).length;
    } catch(e) { return 0; }
}

document.getElementById('landmarkBtn').addEventListener('click', async () => {
    const count = await fetchAndRenderLandmarks(map.getCenter());
    alert(count + ' places found nearby.');
});

document.querySelectorAll('#categoryChips button').forEach(btn => {
    btn.addEventListener('click', () => {
        const cat = btn.getAttribute('data-cat');
        if(activeCategories.has(cat)) {
            activeCategories.delete(cat);
            btn.classList.remove('active');
            btn.classList.replace('btn-light', 'btn-outline-light');
        } else {
            activeCategories.add(cat);
            btn.classList.add('active');
            btn.classList.replace('btn-outline-light', 'btn-light');
        }
        fetchAndRenderLandmarks(map.getCenter());
    });
});

const autoLandmarksToggle = document.getElementById('autoLandmarks');
if(autoLandmarksToggle){
    let debounce=null;
    autoLandmarksToggle.addEventListener('change', ()=>{
        if(autoLandmarksToggle.checked){
            fetchAndRenderLandmarks(map.getCenter());
            map.on('moveend', onMove);
        } else {
            map.off('moveend', onMove);
            landmarkLayer.clearLayers();
        }
    });
    function onMove(){
        if(debounce) clearTimeout(debounce);
        debounce=setTimeout(()=> fetchAndRenderLandmarks(map.getCenter()), 500);
    }
}

// --- 4. MARKERS & ROUTING (FIXED DRAGGING) ---
map.on('click', e => {
    if (isNavigating) return;
    if (!startMarker) setMarker('start', e.latlng);
    else if (!endMarker) setMarker('end', e.latlng);
});

// FIX: This function now creates DRAGGABLE markers
function setMarker(type, latlng, text) {
    const isStart = type === 'start';
    const color = isStart ? '#3b82f6' : '#ef4444'; // Blue or Red

    // Create a Custom Icon that looks like a dot but behaves like a marker
    const customIcon = L.divIcon({
        className: 'custom-marker-icon',
        html: `<div style="
            background-color: ${color};
            width: 24px;
            height: 24px;
            border: 3px solid white;
            border-radius: 50%;
            box-shadow: 0 4px 8px rgba(0,0,0,0.4);
            cursor: grab;
        "></div>`,
        iconSize: [24, 24],
        iconAnchor: [12, 12]
    });

    const marker = L.marker(latlng, { 
        icon: customIcon, 
        draggable: true // ENABLE DRAGGING
    });
    
    // Handle Drag Events
    marker.on('dragend', function(e) {
        const newPos = marker.getLatLng();
        const coordString = `${newPos.lat.toFixed(4)}, ${newPos.lng.toFixed(4)}`;
        if (isStart) els.start.value = coordString;
        else els.end.value = coordString;
    });

    if (isStart) {
        if (startMarker) map.removeLayer(startMarker);
        startMarker = marker.addTo(map);
        els.start.value = text || `${latlng.lat.toFixed(4)}, ${latlng.lng.toFixed(4)}`;
    } else {
        if (endMarker) map.removeLayer(endMarker);
        endMarker = marker.addTo(map);
        els.end.value = text || `${latlng.lat.toFixed(4)}, ${latlng.lng.toFixed(4)}`;
    }
}

document.getElementById('locateBtn').addEventListener('click', () => {
    navigator.geolocation.getCurrentPosition(pos => {
        const lat = pos.coords.latitude, lng = pos.coords.longitude;
        map.setView([lat, lng], 15);
        setMarker('start', {lat, lng}, "My Location");
    });
});

document.getElementById('routeBtn').addEventListener('click', async () => {
    if (!startMarker || !endMarker) return alert("Set Start and End points first.");
    const s = startMarker.getLatLng(), e = endMarker.getLatLng();
    const mode = document.getElementById('profile').value;

    try {
        const res = await fetch(`/route?startLat=${s.lat}&startLng=${s.lng}&endLat=${e.lat}&endLng=${e.lng}&profile=${mode}&steps=true`)
                          .then(r => r.json());
        if (!res.routes || !res.routes.length) throw new Error("No route found.");
        
        routeData = res.routes[0];
        const coords = polyline.decode(routeData.geometry).map(p => [p[0], p[1]]);
        if (routeLayer) map.removeLayer(routeLayer);
        routeLayer = L.polyline(coords, { color: '#3b82f6', weight: 6, opacity: 0.8 }).addTo(map);
        map.fitBounds(routeLayer.getBounds(), { padding: [50, 50] });

        const kms = (routeData.distance/1000).toFixed(1);
        const mins = Math.round(routeData.duration/60);
        document.getElementById('routeStats').innerHTML = `<i class="bi bi-info-circle"></i> ${kms} km • ${mins} min`;
        
        fetch('/history', { 
            method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'},
            body: `startLat=${s.lat}&startLng=${s.lng}&endLat=${e.lat}&endLng=${e.lng}&profile=${mode}`
        }).catch(()=>{});

        routeSteps = [];
        routeData.legs.forEach(leg => {
            leg.steps.forEach(step => {
                routeSteps.push({
                    loc: L.latLng(step.maneuver.location[1], step.maneuver.location[0]),
                    text: step.maneuver.type + (step.maneuver.modifier ? ' ' + step.maneuver.modifier : ''),
                    dist: step.distance, spoken: false
                });
            });
        });

        if(window.innerWidth < 768) {
             els.mainPanel.classList.add('collapsed');
             if(els.mobileToggle) els.mobileToggle.querySelector('i').classList.replace('bi-chevron-down', 'bi-chevron-up');
        }

    } catch (err) { alert(err.message); }
});

// --- 5. NAVIGATION ---
document.getElementById('voiceToggle').addEventListener('change', (e) => voiceOn = e.target.checked);

document.getElementById('startNavBtn').addEventListener('click', () => {
    if (!routeData) return alert("Get a route first.");
    if (!navigator.geolocation) return alert("Geolocation not supported.");
    
    isNavigating = true;
    currentStepIndex = 0;
    document.body.classList.add('navigating');
    map.invalidateSize();
    speak("Starting navigation.");
    
    watchId = navigator.geolocation.watchPosition(updateNavigation, console.error, { enableHighAccuracy: true });
});

document.getElementById('stopNavBtn').addEventListener('click', () => {
    isNavigating = false;
    document.body.classList.remove('navigating');
    if (watchId) navigator.geolocation.clearWatch(watchId);
    if (userMarker) map.removeLayer(userMarker);
    if (routeLayer) map.fitBounds(routeLayer.getBounds());
    window.speechSynthesis.cancel();
});

function updateNavigation(pos) {
    const lat = pos.coords.latitude, lng = pos.coords.longitude;
    const userLoc = L.latLng(lat, lng);

    if (!userMarker) userMarker = L.circleMarker([lat, lng], { radius: 8, color: 'white', fillColor: '#3b82f6', fillOpacity: 1 }).addTo(map);
    else userMarker.setLatLng([lat, lng]);

    map.setView([lat, lng], 18, { animate: true });

    if (currentStepIndex < routeSteps.length) {
        const nextStep = routeSteps[currentStepIndex];
        const dist = userLoc.distanceTo(nextStep.loc);
        
        els.navDist.innerText = dist < 1000 ? Math.round(dist) + 'm' : (dist/1000).toFixed(1) + 'km';
        els.navText.innerText = nextStep.text;
        els.navNext.innerText = routeSteps[currentStepIndex + 1] ? "Then: " + routeSteps[currentStepIndex + 1].text : "Then: Arrive";

        if (dist < 80 && !nextStep.spoken) { speak("In 80 meters, " + nextStep.text); nextStep.spoken = true; }
        if (dist < 20) { currentStepIndex++; speak("Now, " + nextStep.text); }
    } else {
        els.navText.innerText = "Arrived!";
        els.navDist.innerText = "0m";
    }
    
    const speed = Math.max(pos.coords.speed || 10, 1);
    const distToEnd = userLoc.distanceTo(endMarker.getLatLng());
    els.navRem.innerText = (distToEnd/1000).toFixed(1) + " km";
    const eta = new Date(Date.now() + (distToEnd/speed) * 1000);
    els.navETA.innerText = `${eta.getHours()}:${String(eta.getMinutes()).padStart(2,'0')}`;
}

function speak(text) {
    if (!voiceOn) return;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
}

if(els.mobileToggle) {
    els.mobileToggle.addEventListener('click', () => {
        els.mainPanel.classList.toggle('collapsed');
        const icon = els.mobileToggle.querySelector('i');
        if(els.mainPanel.classList.contains('collapsed')) icon.classList.replace('bi-chevron-down', 'bi-chevron-up');
        else icon.classList.replace('bi-chevron-up', 'bi-chevron-down');
    });
}