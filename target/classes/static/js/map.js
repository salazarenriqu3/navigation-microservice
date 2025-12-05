// --- 1. SETUP ---
const map = L.map('map', { zoomControl: false }).setView([14.5995, 120.9842], 13);
L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', { maxZoom: 19 }).addTo(map);

let startMarker, endMarker, routeLayer, userMarker, watchId;
let routeData = null, isNavigating = false;
let routeSteps = [], currentStepIndex = 0, voiceOn = false;

// Elements
const els = {
    start: document.getElementById('start'),
    end: document.getElementById('end'),
    routeBtn: document.getElementById('routeBtn'),
    mainPanel: document.getElementById('mainPanel'),
    navOverlay: document.getElementById('navOverlay'),
    stepList: document.getElementById('stepList'),
    instructionsPanel: document.getElementById('instructionsPanel'),
    toggleListBtn: document.getElementById('toggleListBtn')
};

// --- 2. LOGIC ---

// Reverse Geocoding on Click
map.on('click', async e => {
    if (isNavigating) return;
    const {lat, lng} = e.latlng;
    
    // Fetch Address
    let address = `${lat.toFixed(4)}, ${lng.toFixed(4)}`; // Default
    try {
        const res = await fetch(`/reverse?lat=${lat}&lon=${lng}`).then(r => r.json());
        if(res.display_name) {
            // Clean up address (First 2 parts)
            address = res.display_name.split(',').slice(0,2).join(',');
        }
    } catch(err){}

    if (!startMarker) setMarker('start', e.latlng, address);
    else setMarker('end', e.latlng, address);
});

function setMarker(type, latlng, text) {
    const isStart = type === 'start';
    const iconClass = isStart ? 'bi-circle-fill text-primary' : 'bi-geo-alt-fill text-danger';
    
    const icon = L.divIcon({
        className: 'custom-pin',
        html: `<i class="bi ${iconClass}" style="font-size: 2rem; filter: drop-shadow(0 4px 6px rgba(0,0,0,0.5));"></i>`,
        iconSize: [32, 32], iconAnchor: [16, 32]
    });

    const marker = L.marker(latlng, { icon: icon, draggable: true });
    
    marker.on('dragend', async () => {
        const pos = marker.getLatLng();
        // Re-reverse geocode on drag end
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
    
    if(startMarker && endMarker && text.includes(',')) els.routeBtn.click();
}

// Routing
els.routeBtn.addEventListener('click', async () => {
    if (!startMarker || !endMarker) return;
    const s = startMarker.getLatLng(), e = endMarker.getLatLng();
    const mode = document.querySelector('input[name="profile"]:checked').value;

    try {
        const res = await fetch(`/route?startLat=${s.lat}&startLng=${s.lng}&endLat=${e.lat}&endLng=${e.lng}&profile=${mode}&steps=true`)
                          .then(r => r.json());
        if (!res.routes || !res.routes.length) throw new Error("No route");
        
        routeData = res.routes[0];
        const coords = polyline.decode(routeData.geometry).map(p => [p[0], p[1]]);
        if (routeLayer) map.removeLayer(routeLayer);
        routeLayer = L.polyline(coords, { color: '#3b82f6', weight: 6 }).addTo(map);
        map.fitBounds(routeLayer.getBounds(), { padding: [50, 50] });

        // Populate Route Stats
        const kms = (routeData.distance/1000).toFixed(1);
        const mins = Math.round(routeData.duration/60);
        document.getElementById('routeStats').innerHTML = 
            `<i class="bi bi-clock"></i> ${mins} min &nbsp; <i class="bi bi-signpost-2"></i> ${kms} km`;

        // Parse Steps for Navigation List
        routeSteps = [];
        els.stepList.innerHTML = '';
        routeData.legs[0].steps.forEach((step, idx) => {
            const instruction = step.maneuver.type + ' ' + (step.maneuver.modifier || '') + (step.name ? ' on ' + step.name : '');
            routeSteps.push({
                loc: L.latLng(step.maneuver.location[1], step.maneuver.location[0]),
                text: instruction,
                dist: step.distance,
                spoken: false
            });
            // Add to list UI
            const li = document.createElement('li');
            li.className = 'step-item';
            li.id = 'step-'+idx;
            li.innerHTML = `<i class="bi bi-arrow-right"></i> <div>${instruction}</div> <div class="ms-auto">${step.distance < 1000 ? Math.round(step.distance)+'m' : (step.distance/1000).toFixed(1)+'km'}</div>`;
            els.stepList.appendChild(li);
        });
        
        // Auto-close mobile panel if route found
        if(window.innerWidth < 768) els.mainPanel.classList.add('collapsed');

    } catch (err) { alert("Route not found"); }
});

// Navigation Start
document.getElementById('startNavBtn').addEventListener('click', () => {
    if (!routeData) return alert("Get a route first");
    if (!navigator.geolocation) return alert("No GPS");
    
    isNavigating = true;
    currentStepIndex = 0;
    document.body.classList.add('navigating');
    
    els.mainPanel.style.display = 'none';
    els.navOverlay.style.display = 'block';
    
    speak("Starting navigation");
    watchId = navigator.geolocation.watchPosition(updateNavigation, null, { enableHighAccuracy: true });
});

// Stop
document.getElementById('stopNavBtn').addEventListener('click', () => {
    isNavigating = false;
    document.body.classList.remove('navigating');
    els.navOverlay.style.display = 'none';
    els.mainPanel.style.display = 'block';
    if(watchId) navigator.geolocation.clearWatch(watchId);
    if(userMarker) map.removeLayer(userMarker);
    if(routeLayer) map.fitBounds(routeLayer.getBounds());
    // Reset map rotation
    document.getElementById('map').style.transform = `rotate(0deg)`;
});

els.toggleListBtn.addEventListener('click', () => {
    els.instructionsPanel.style.display = els.instructionsPanel.style.display === 'none' ? 'block' : 'none';
});

// Navigation Loop
function updateNavigation(pos) {
    const lat = pos.coords.latitude, lng = pos.coords.longitude;
    const heading = pos.coords.heading || 0; // GPS Heading
    const userLoc = L.latLng(lat, lng);

    if (!userMarker) userMarker = L.marker([lat, lng], {
        icon: L.divIcon({ html: '<div style="width:20px;height:20px;background:#3b82f6;border:3px solid white;border-radius:50%;box-shadow:0 0 10px blue;"></div>', className:'' })
    }).addTo(map);
    else userMarker.setLatLng([lat, lng]);

    // POV: Center Map + "Course Up" Rotation
    map.setView([lat, lng], 18, { animate: true });
    
    // NOTE: Rotating the map div is the only way to do "Course Up" in pure Leaflet 2D
    // Ideally this requires a vector map, but we can simulate it:
    // document.getElementById('map').style.transform = `rotate(-${heading}deg)`; 
    // (Disabled by default as it rotates labels too, un-comment if you really want it)

    // Reroute Check (If > 30m away from current step)
    if(routeSteps[currentStepIndex]) {
        const distToPath = userLoc.distanceTo(routeSteps[currentStepIndex].loc);
        if(distToPath > 40) {
           console.log("Off route! Recalculating...");
           // Set current location as start and re-click route
           startMarker.setLatLng(userLoc);
           els.routeBtn.click();
        }
    }

    // Update Instructions
    if (currentStepIndex < routeSteps.length) {
        const nextStep = routeSteps[currentStepIndex];
        const dist = userLoc.distanceTo(nextStep.loc);
        
        document.getElementById('navDist').innerText = dist < 1000 ? Math.round(dist) + 'm' : (dist/1000).toFixed(1) + 'km';
        document.getElementById('navText').innerText = nextStep.text;
        
        // Highlight in list
        document.querySelectorAll('.step-item').forEach(i => i.classList.remove('active'));
        const activeItem = document.getElementById('step-'+currentStepIndex);
        if(activeItem) activeItem.classList.add('active');

        if (dist < 80 && !nextStep.spoken) { speak("In 80 meters, " + nextStep.text); nextStep.spoken = true; }
        if (dist < 20) { currentStepIndex++; speak(nextStep.text); }
    } else {
        document.getElementById('navText').innerText = "Arrived";
    }
}

function speak(text) {
    if (!document.getElementById('voiceToggle').checked) return;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
}

// Setup Autocomplete (Keep your existing logic here, just updated ID references)
// (Assuming searchNominatim function exists from previous code block)