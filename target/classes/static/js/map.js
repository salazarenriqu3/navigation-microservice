const map = L.map('map', { zoomControl: false }).setView([14.5995, 120.9842], 13);
L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { maxZoom: 19 }).addTo(map);

let startMarker, endMarker, routeLayer, userMarker, watchId;
let routeData = null, isNavigating = false;
let routeSteps = []; // Store turn-by-turn steps here
let currentStepIndex = 0;
let voiceOn = false;

// UI Elements
const els = {
    start: document.getElementById('start'),
    end: document.getElementById('end'),
    mainPanel: document.getElementById('mainPanel'),
    navTop: document.getElementById('navTopBar'),
    navBottom: document.getElementById('navBottomBar'),
    navDist: document.getElementById('navDist'),
    navText: document.getElementById('navText'),
    navNext: document.getElementById('navNextText'),
    navETA: document.getElementById('navETA'),
    navRem: document.getElementById('navRem'),
    mobileToggle: document.getElementById('mobileToggle')
};

// Mobile Toggle Logic
if(els.mobileToggle) {
    els.mobileToggle.addEventListener('click', () => {
        els.mainPanel.classList.toggle('collapsed');
        els.mobileToggle.innerHTML = els.mainPanel.classList.contains('collapsed') ? 
            '<i class="bi bi-chevron-up"></i>' : '<i class="bi bi-chevron-down"></i>';
    });
}

// Map Clicks
map.on('click', e => {
    if (isNavigating) return; // Disable pinning during nav
    if (!startMarker) setMarker('start', e.latlng);
    else setMarker('end', e.latlng);
});

function setMarker(type, latlng, name) {
    const color = type === 'start' ? '#3b82f6' : '#ef4444';
    const marker = L.circleMarker(latlng, { radius: 8, color: color, fillColor: color, fillOpacity: 1 });
    
    if (type === 'start') {
        if (startMarker) map.removeLayer(startMarker);
        startMarker = marker.addTo(map);
        els.start.value = name || `${latlng.lat.toFixed(4)}, ${latlng.lng.toFixed(4)}`;
    } else {
        if (endMarker) map.removeLayer(endMarker);
        endMarker = marker.addTo(map);
        els.end.value = name || `${latlng.lat.toFixed(4)}, ${latlng.lng.toFixed(4)}`;
    }
}

// Routing
document.getElementById('routeBtn').addEventListener('click', async () => {
    if (!startMarker || !endMarker) return alert("Select Start and End points");
    const s = startMarker.getLatLng(), e = endMarker.getLatLng();
    const mode = document.getElementById('profile').value;

    const url = `/route?startLat=${s.lat}&startLng=${s.lng}&endLat=${e.lat}&endLng=${e.lng}&profile=${mode}&steps=true`;
    try {
        const res = await fetch(url).then(r => r.json());
        if (!res.routes || !res.routes.length) throw new Error("No route found");
        
        routeData = res.routes[0];
        
        // Parse geometry
        const coords = polyline.decode(routeData.geometry).map(p => [p[0], p[1]]);
        
        if (routeLayer) map.removeLayer(routeLayer);
        routeLayer = L.polyline(coords, { color: '#3b82f6', weight: 6 }).addTo(map);
        map.fitBounds(routeLayer.getBounds(), { padding: [50, 50] });

        // Extract Steps for Navigation
        routeSteps = [];
        routeData.legs.forEach(leg => {
            leg.steps.forEach(step => {
                routeSteps.push({
                    loc: { lat: step.maneuver.location[1], lng: step.maneuver.location[0] },
                    text: step.maneuver.type + (step.maneuver.modifier ? ' ' + step.maneuver.modifier : '') + (step.name ? ' on ' + step.name : ''),
                    dist: step.distance
                });
            });
        });
        
        // Show Stats
        document.getElementById('routeStats').innerHTML = 
            `${(routeData.distance/1000).toFixed(1)}km • ${(routeData.duration/60).toFixed(0)} min`;
        
        // On mobile, collapse panel after route found to show map
        if(window.innerWidth < 768) els.mainPanel.classList.add('collapsed');

    } catch (err) { alert(err.message); }
});

// --- NAVIGATION SYSTEM ---

document.getElementById('voiceToggle').addEventListener('change', (e) => voiceOn = e.target.checked);

document.getElementById('startNavBtn').addEventListener('click', () => {
    if (!routeData) return alert("Plan a route first!");
    if (!navigator.geolocation) return alert("Geolocation not supported");

    isNavigating = true;
    currentStepIndex = 0;
    
    // Switch UI Mode
    document.body.classList.add('navigating');
    map.invalidateSize();
    
    speak("Starting navigation.");
    
    // Start GPS Watch
    watchId = navigator.geolocation.watchPosition(updateNavigation, 
        err => console.error(err), 
        { enableHighAccuracy: true, maximumAge: 1000 }
    );
});

document.getElementById('stopNavBtn').addEventListener('click', () => {
    isNavigating = false;
    document.body.classList.remove('navigating');
    if (watchId) navigator.geolocation.clearWatch(watchId);
    if (userMarker) map.removeLayer(userMarker);
    map.fitBounds(routeLayer.getBounds()); // Reset view
});

function updateNavigation(pos) {
    const lat = pos.coords.latitude;
    const lng = pos.coords.longitude;
    const userLoc = L.latLng(lat, lng);

    // 1. Update User Marker
    if (!userMarker) {
        userMarker = L.circleMarker([lat, lng], { radius: 10, color: 'white', fillColor: '#3b82f6', fillOpacity: 1 }).addTo(map);
    } else {
        userMarker.setLatLng([lat, lng]);
    }

    // 2. Camera Follow (Auto-Center)
    map.setView([lat, lng], 18, { animate: true });

    // 3. Update Navigation Logic
    if (currentStepIndex < routeSteps.length) {
        const nextStep = routeSteps[currentStepIndex];
        const distToStep = userLoc.distanceTo(nextStep.loc); // Leaflet distance in meters

        // Update UI Text
        els.navDist.innerText = distToStep < 1000 ? Math.round(distToStep) + 'm' : (distToStep/1000).toFixed(1) + 'km';
        els.navText.innerText = nextStep.text;
        els.navNext.innerText = routeSteps[currentStepIndex + 1] ? "Then: " + routeSteps[currentStepIndex + 1].text : "Arrive";

        // Voice Trigger (Distance Thresholds)
        if (distToStep < 80 && !nextStep.spoken) {
            speak("In 80 meters, " + nextStep.text);
            nextStep.spoken = true;
        }
        
        // Advance Step if passed (simple logic: very close to point)
        if (distToStep < 20) {
            currentStepIndex++;
            speak("Now, " + nextStep.text);
        }
    } else {
        els.navText.innerText = "Arrived at destination";
        els.navDist.innerText = "0m";
    }
    
    // 4. Update Trip Stats (Rough estimate)
    const speed = pos.coords.speed || 10; // m/s (fallback 36km/h)
    // Simple calc: remaining straight line distance to end (improve this with polyline calc if needed)
    const distToEnd = userLoc.distanceTo(endMarker.getLatLng());
    els.navRem.innerText = (distToEnd/1000).toFixed(1) + " km";
    const secRem = distToEnd / speed;
    const etaDate = new Date(Date.now() + secRem * 1000);
    els.navETA.innerText = `${etaDate.getHours()}:${String(etaDate.getMinutes()).padStart(2,'0')}`;
}

function speak(text) {
    if (!voiceOn) return;
    window.speechSynthesis.cancel(); // Stop current speech
    const u = new SpeechSynthesisUtterance(text);
    window.speechSynthesis.speak(u);
}