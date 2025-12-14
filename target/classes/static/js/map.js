// --- 1. SETUP ---
const map = L.map('map', { zoomControl: false }).setView([14.5995, 120.9842], 13);
L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', { 
    maxZoom: 19, 
    attribution: '&copy; OpenStreetMap &copy; CARTO' 
}).addTo(map);

let landmarkLayer = L.markerClusterGroup({ disableClusteringAtZoom: 16 });
landmarkLayer.addTo(map);

let startMarker, endMarker, routeLayer, userMarker, watchId;
let routeData = null, isNavigating = false;
let routeSteps = [], currentStepIndex = 0;
let voiceOn = false;
const activeCategories = new Set(); 
let userHeading = 0;
let isFollowingUser = true;

// Traffic-aware navigation state (simplified)
let totalDistance = 0, totalDuration = 0, traveledDistance = 0;
let navigationStartTime = null;
let currentProfile = 'driving';

let currentWeather = null;

const els = {
    start: document.getElementById('start'),
    end: document.getElementById('end'),
    routeBtn: document.getElementById('routeBtn'),
    clearBtn: document.getElementById('clearBtn'),
    profileSelect: document.getElementById('profile'),
    mainPanel: document.getElementById('mainPanel'),
    navOverlay: document.getElementById('navOverlay'),
    stepList: document.getElementById('stepList'),
    toggleListBtn: document.getElementById('toggleListBtn'),
    locateBtn: document.getElementById('locateBtn'),
    landmarkBtn: document.getElementById('landmarkBtn'),
    chips: document.querySelectorAll('#categoryChips button'),
    weatherWidget: document.getElementById('weatherWidget')
};

// --- 2. WEATHER FUNCTIONALITY ---
async function fetchWeather(lat, lng) {
    try {
        const resp = await fetch(`/weather?lat=${lat}&lon=${lng}`);
        const data = await resp.json();
        
        if (data && data.cod === 200) {
            currentWeather = data;
            displayWeather(data);
            return data;
        } else {
            console.error('Weather API error:', data);
            return null;
        }
    } catch(e) {
        console.error('Weather fetch failed:', e);
        return null;
    }
}

function displayWeather(data) {
    if (!els.weatherWidget || !data || !data.main) return;
    
    const temp = Math.round(data.main.temp);
    const desc = data.weather[0].description;
    const icon = getWeatherIcon(data.weather[0].main);
    const feelsLike = Math.round(data.main.feels_like);
    
    let alertHTML = '';
    const mainWeather = data.weather[0].main.toLowerCase();
    if (mainWeather.includes('rain') || mainWeather.includes('storm') || mainWeather.includes('thunder')) {
        alertHTML = `
            <div class="weather-alert">
                <i class="bi bi-exclamation-triangle-fill"></i>
                <span>Adverse weather detected! Drive carefully.</span>
            </div>
        `;
    }
    
    els.weatherWidget.innerHTML = `
        ${alertHTML}
        <div class="weather-content">
            <div class="weather-icon">${icon}</div>
            <div class="weather-info">
                <div class="weather-temp">${temp}°C</div>
                <div class="weather-desc">${desc}</div>
                <div class="weather-feels">Feels like ${feelsLike}°C</div>
            </div>
        </div>
    `;
    els.weatherWidget.classList.add('active');
}

function getWeatherIcon(condition) {
    const icons = {
        'Clear': '☀️',
        'Clouds': '☁️',
        'Rain': '🌧️',
        'Drizzle': '🌦️',
        'Thunderstorm': '⛈️',
        'Snow': '❄️',
        'Mist': '🌫️',
        'Fog': '🌫️',
        'Haze': '🌫️'
    };
    return icons[condition] || '🌤️';
}

// --- 3. REMOVED TRAFFIC VISUALIZATION (keeping simple blue route) ---

function drawSimpleRoute(coords) {
    if (routeLayer) map.removeLayer(routeLayer);
    routeLayer = L.polyline(coords, { 
        color: '#3b82f6', 
        weight: 6, 
        opacity: 0.8 
    }).addTo(map);
}

// --- 4. CLEAR FUNCTIONALITY ---
if (els.clearBtn) {
    els.clearBtn.addEventListener('click', () => {
        if (startMarker) map.removeLayer(startMarker);
        if (endMarker) map.removeLayer(endMarker);
        if (routeLayer) map.removeLayer(routeLayer);
        
        startMarker = null;
        endMarker = null;
        routeLayer = null;
        routeData = null;
        routeSteps = [];
        totalDistance = 0;
        totalDuration = 0;
        
        els.start.value = '';
        els.end.value = '';
        document.getElementById('routeStats').innerHTML = '';
        if (els.stepList) els.stepList.innerHTML = '';
    });
}

// --- 5. TRANSPORT MODE LOGIC ---
const radios = document.querySelectorAll('input[name="profile"]');
radios.forEach(radio => {
    radio.addEventListener('change', (e) => {
        currentProfile = e.target.value;
        if(startMarker && endMarker) els.routeBtn.click();
    });
});

if(els.profileSelect) {
    els.profileSelect.addEventListener('change', (e) => {
        currentProfile = e.target.value;
        if(startMarker && endMarker) els.routeBtn.click();
    });
}

// --- 6. MARKERS & REVERSE GEOCODING ---
map.on('click', async e => {
    if (isNavigating) return;
    const {lat, lng} = e.latlng;
    let address = `${lat.toFixed(4)}, ${lng.toFixed(4)}`; 
    
    try {
        const res = await fetch(`/reverse?lat=${lat}&lon=${lng}`).then(r => r.json());
        if(res.display_name) address = res.display_name.split(',').slice(0,2).join(',');
    } catch(err){}

    if (!startMarker) {
        setMarker('start', e.latlng, address);
        fetchWeather(lat, lng);
    } else {
        setMarker('end', e.latlng, address);
    }
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
        if (isStart) {
            els.start.value = addr;
            fetchWeather(pos.lat, pos.lng);
        } else {
            els.end.value = addr;
        }
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

// --- 7. BOTTOM BUTTONS ---
if(els.locateBtn) {
    els.locateBtn.addEventListener('click', () => {
        if(!navigator.geolocation) return alert("Geolocation not supported");
        navigator.geolocation.getCurrentPosition(pos => {
            const lat = pos.coords.latitude, lng = pos.coords.longitude;
            map.setView([lat, lng], 16);
            setMarker('start', {lat, lng}, "My Location");
            fetchWeather(lat, lng);
        }, err => alert("Could not get location"));
    });
}

async function fetchAndRenderLandmarks(center) {
    const catsParam = activeCategories.size ? ('&cats=' + Array.from(activeCategories).join(',')) : '';
    try {
        const resp = await fetch('/landmarks?lat=' + center.lat + '&lon=' + center.lng + catsParam + '&radius=1500');
        const data = await resp.json();
        landmarkLayer.clearLayers();
        
        (data.elements || []).forEach(el => {
            const lat = el.lat || (el.center && el.center.lat);
            const lon = el.lon || (el.center && el.center.lon);
            
            if (lat && lon) {
                const tags = el.tags || {};
                const name = tags.name || tags.amenity || tags.leisure || 'Spot';
                const type = tags.amenity || tags.leisure || tags.tourism || 'poi';
                
                let color = '#3b82f6';
                if(type === 'park' || type === 'garden') color = '#22c55e';
                if(type === 'restaurant' || type === 'cafe' || type === 'fast_food') color = '#f59e0b';
                if(type === 'bank' || type === 'atm') color = '#6366f1';
                if(type === 'hospital' || type === 'pharmacy' || type === 'clinic') color = '#ef4444';
                if(type === 'police') color = '#1e40af';
                if(type === 'fire_station') color = '#dc2626';
                if(type === 'school' || type === 'university' || type === 'college') color = '#7c3aed';
                if(type === 'townhall' || type === 'courthouse') color = '#059669';

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
    } catch(e) { 
        console.error(e); 
        return 0; 
    }
}

if(els.landmarkBtn) {
    els.landmarkBtn.addEventListener('click', async () => {
        const count = await fetchAndRenderLandmarks(map.getCenter());
        if(count === 0) alert("No major landmarks found nearby.");
    });
}

if(els.chips) {
    els.chips.forEach(btn => {
        btn.addEventListener('click', () => {
            const cat = btn.getAttribute('data-cat');
            if(activeCategories.has(cat)) {
                activeCategories.delete(cat);
                btn.classList.remove('active');
            } else {
                activeCategories.add(cat);
                btn.classList.add('active');
            }
            fetchAndRenderLandmarks(map.getCenter());
        });
    });
}

// --- 8. ROUTING (SIMPLIFIED - NO TRAFFIC VISUALIZATION) ---
if (els.routeBtn) {
    els.routeBtn.addEventListener('click', async () => {
        if (!startMarker || !endMarker) return;
        
        let mode = currentProfile;
        const checkedRadio = document.querySelector('input[name="profile"]:checked');
        if (checkedRadio) mode = checkedRadio.value;
        else if (els.profileSelect) mode = els.profileSelect.value;
        
        currentProfile = mode;

        try {
            const url = `/route?startLat=${startMarker.getLatLng().lat}&startLng=${startMarker.getLatLng().lng}&endLat=${endMarker.getLatLng().lat}&endLng=${endMarker.getLatLng().lng}&profile=${mode}&steps=true`;
            const res = await fetch(url).then(r => r.json());
            
            if (!res.routes || !res.routes.length) throw new Error("No route");
            routeData = res.routes[0];
            
            totalDistance = routeData.distance;
            totalDuration = routeData.duration;
            
            const coords = polyline.decode(routeData.geometry).map(p => [p[0], p[1]]);
            
            // Draw simple blue route
            drawSimpleRoute(coords);
            
            map.fitBounds(L.polyline(coords).getBounds(), { padding: [50, 50] });

            const kms = (totalDistance/1000).toFixed(1);
            const mins = Math.round(totalDuration/60);
            
            const statsEl = document.getElementById('routeStats');
            if(statsEl) {
                statsEl.innerHTML = `
                    <i class="bi bi-clock"></i> ${mins} min &nbsp; 
                    <i class="bi bi-signpost-2"></i> ${kms} km
                `;
            }

            if(els.stepList) els.stepList.innerHTML = '';
            routeSteps = [];
            routeData.legs[0].steps.forEach((step, idx) => {
                const maneuver = step.maneuver.type;
                const modifier = step.maneuver.modifier || '';
                const roadName = step.name || '';
                const instruction = `${maneuver} ${modifier} ${roadName}`.trim();
                
                routeSteps.push({
                    loc: L.latLng(step.maneuver.location[1], step.maneuver.location[0]),
                    text: instruction,
                    roadName: roadName,
                    maneuver: maneuver,
                    modifier: modifier,
                    dist: step.distance, 
                    spoken: false
                });
                
                if(els.stepList) {
                    const li = document.createElement('li');
                    li.className = 'step-item';
                    li.innerHTML = `<i class="bi bi-arrow-right"></i> <div>${instruction}</div> <div class="ms-auto">${Math.round(step.distance)}m</div>`;
                    els.stepList.appendChild(li);
                }
            });
            
            if(window.innerWidth < 768 && els.mainPanel) els.mainPanel.classList.add('collapsed');
        } catch (err) { 
            console.error(err);
            alert("Route calculation failed."); 
        }
    });
}

// --- 9. NAVIGATION ---
const startNavBtn = document.getElementById('startNavBtn');
if (startNavBtn) {
    startNavBtn.addEventListener('click', () => {
        if (!routeData) return alert("Please get a route first");
        if (!navigator.geolocation) return alert("GPS not available");
        
        isNavigating = true;
        currentStepIndex = 0;
        traveledDistance = 0;
        navigationStartTime = Date.now();
        isFollowingUser = true;
        document.body.classList.add('navigating');
        
        if(els.mainPanel) els.mainPanel.style.display = 'none';
        if(els.navOverlay) els.navOverlay.style.display = 'block';
        
        if (currentWeather) {
            displayNavWeather();
        }
        
        speak("Starting navigation");
        
        watchId = navigator.geolocation.watchPosition(
            updateNavigation, 
            (error) => {
                console.error('GPS Error:', error);
                alert('GPS tracking error. Please check your location settings.');
            },
            { 
                enableHighAccuracy: true,
                maximumAge: 1000,
                timeout: 5000
            }
        );
    });
}

const stopNavBtn = document.getElementById('stopNavBtn');
if (stopNavBtn) {
    stopNavBtn.addEventListener('click', () => {
        stopNavigation();
    });
}

function stopNavigation() {
    isNavigating = false;
    isFollowingUser = false;
    document.body.classList.remove('navigating');
    if(els.navOverlay) els.navOverlay.style.display = 'none';
    if(els.mainPanel) els.mainPanel.style.display = 'block';
    if(watchId) navigator.geolocation.clearWatch(watchId);
    if(userMarker) map.removeLayer(userMarker);
    if(routeLayer) {
        map.fitBounds(routeLayer.getBounds());
    }
    
    const navWeather = document.getElementById('navWeather');
    if(navWeather) navWeather.classList.remove('active');
}

function displayNavWeather() {
    const navWeather = document.getElementById('navWeather');
    if (!navWeather || !currentWeather) return;
    
    const temp = Math.round(currentWeather.main.temp);
    const icon = getWeatherIcon(currentWeather.weather[0].main);
    const desc = currentWeather.weather[0].description;
    
    navWeather.innerHTML = `
        <span class="nav-weather-icon">${icon}</span>
        <div>
            <span class="nav-weather-temp">${temp}°C</span>
            <span class="nav-weather-desc"> • ${desc}</span>
        </div>
    `;
    navWeather.classList.add('active');
}

function getTurnIcon(maneuver, modifier) {
    const type = maneuver.toLowerCase();
    const mod = (modifier || '').toLowerCase();
    
    if (type.includes('arrive')) return 'bi-flag-fill';
    if (type.includes('depart')) return 'bi-arrow-up-circle';
    if (mod.includes('left')) return 'bi-arrow-left';
    if (mod.includes('right')) return 'bi-arrow-right';
    if (mod.includes('straight') || type.includes('continue')) return 'bi-arrow-up';
    if (type.includes('turn')) {
        if (mod.includes('sharp left')) return 'bi-arrow-up-left';
        if (mod.includes('sharp right')) return 'bi-arrow-up-right';
        if (mod.includes('slight left')) return 'bi-arrow-bar-left';
        if (mod.includes('slight right')) return 'bi-arrow-bar-right';
    }
    if (type.includes('roundabout')) return 'bi-arrow-clockwise';
    if (type.includes('merge')) return 'bi-arrows-collapse';
    
    return 'bi-arrow-up';
}

function updateNavigation(pos) {
    const lat = pos.coords.latitude, lng = pos.coords.longitude;
    const userLoc = L.latLng(lat, lng);
    const heading = pos.coords.heading || userHeading;
    
    if (heading !== null && heading !== undefined) {
        userHeading = heading;
    }

    if (!userMarker) {
        userMarker = L.marker([lat, lng], {
            icon: L.divIcon({ 
                className: 'navigation-arrow',
                html: '',
                iconSize: [40, 40],
                iconAnchor: [20, 20]
            }),
            rotationAngle: userHeading,
            rotationOrigin: 'center'
        }).addTo(map);
    } else {
        userMarker.setLatLng([lat, lng]);
        if (userHeading !== null) {
            userMarker.setRotationAngle(userHeading);
        }
    }

    if (isFollowingUser) {
        map.setView([lat, lng], 18, { animate: true, duration: 0.5 });
    }

    if(routeSteps[currentStepIndex]) {
        const distToPath = userLoc.distanceTo(routeSteps[currentStepIndex].loc);
        if(distToPath > 50) { 
           console.log('Off route, recalculating...');
           startMarker.setLatLng(userLoc);
           if(els.routeBtn) els.routeBtn.click();
           return;
        }
    }

    let remainingDist = 0;
    for (let i = currentStepIndex; i < routeSteps.length; i++) {
        remainingDist += routeSteps[i].dist;
    }
    
    if (currentStepIndex < routeSteps.length) {
        const nextStep = routeSteps[currentStepIndex];
        const distToNext = userLoc.distanceTo(nextStep.loc);
        remainingDist += distToNext;
        
        const distEl = document.getElementById('navDist');
        if(distEl) {
            if (distToNext < 1000) {
                distEl.innerText = Math.round(distToNext) + 'm';
            } else {
                distEl.innerText = (distToNext/1000).toFixed(1) + ' km';
            }
        }
        
        const textEl = document.getElementById('navText');
        if(textEl) textEl.innerText = nextStep.text;
        
        const iconBox = document.getElementById('turnIcon');
        if(iconBox) {
            const iconClass = getTurnIcon(nextStep.maneuver, nextStep.modifier);
            iconBox.innerHTML = `<i class="bi ${iconClass}"></i>`;
        }
        
        const roadNameEl = document.getElementById('navRoadName');
        if(roadNameEl && nextStep.roadName) {
            roadNameEl.innerHTML = `<i class="bi bi-sign-turn-right"></i> ${nextStep.roadName}`;
            roadNameEl.style.display = 'flex';
        } else if(roadNameEl) {
            roadNameEl.style.display = 'none';
        }

        if (distToNext < 100 && !nextStep.spoken) { 
            speak(`In ${Math.round(distToNext)} meters, ${nextStep.text}`); 
            nextStep.spoken = true; 
        }
        
        if (distToNext < 20) { 
            traveledDistance += nextStep.dist;
            currentStepIndex++; 
            speak(nextStep.text); 
            
            if(els.stepList && els.stepList.children[currentStepIndex-1]) {
                const items = els.stepList.querySelectorAll('.step-item');
                items.forEach(item => item.classList.remove('active'));
                if(els.stepList.children[currentStepIndex]) {
                    els.stepList.children[currentStepIndex].classList.add('active');
                    els.stepList.children[currentStepIndex].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                }
            }
        }
    } else {
        const textEl = document.getElementById('navText');
        if(textEl) textEl.innerText = "You have arrived!";
        const distEl = document.getElementById('navDist');
        if(distEl) distEl.innerText = "0m";
        speak("You have arrived at your destination");
        
        setTimeout(() => {
            if(isNavigating) stopNavigation();
        }, 3000);
    }

    const remainingKm = remainingDist / 1000;
    const navRemEl = document.getElementById('navRem');
    if (navRemEl) {
        if (remainingKm < 1) {
            navRemEl.innerText = Math.round(remainingDist) + ' m';
        } else {
            navRemEl.innerText = remainingKm.toFixed(1) + ' km';
        }
    }

    const elapsedSeconds = (Date.now() - navigationStartTime) / 1000;
    const progressRatio = traveledDistance / totalDistance;
    const remainingRatio = 1 - progressRatio;
    
    let etaSeconds = totalDuration * remainingRatio;
    
    // Refine estimate based on actual speed
    if (elapsedSeconds > 30 && traveledDistance > 100) {
        const actualSpeed = traveledDistance / elapsedSeconds;
        const estimatedBySpeed = remainingDist / actualSpeed;
        etaSeconds = (etaSeconds * 0.7) + (estimatedBySpeed * 0.3);
    }
    
    const etaDate = new Date(Date.now() + etaSeconds * 1000);
    const etaHours = String(etaDate.getHours()).padStart(2, '0');
    const etaMinutes = String(etaDate.getMinutes()).padStart(2, '0');
    
    const navETAEl = document.getElementById('navETA');
    if (navETAEl) {
        navETAEl.innerText = `${etaHours}:${etaMinutes}`;
    }
}

const recenterBtn = document.getElementById('recenterBtn');
if (recenterBtn) {
    recenterBtn.addEventListener('click', () => {
        isFollowingUser = true;
        if (userMarker) {
            map.setView(userMarker.getLatLng(), 18, { animate: true });
        }
    });
}

map.on('dragstart', () => {
    if (isNavigating) {
        isFollowingUser = false;
    }
});

const voiceToggle = document.getElementById('voiceToggle');
if(voiceToggle) voiceToggle.addEventListener('change', (e) => voiceOn = e.target.checked);

function speak(text) {
    if (!voiceOn) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.9;
    utterance.pitch = 1.0;
    window.speechSynthesis.speak(utterance);
}

if(els.toggleListBtn) {
    els.toggleListBtn.addEventListener('click', () => {
        const panel = document.getElementById('instructionsPanel');
        if(panel) {
            panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
        }
    });
}

// --- 10. AUTOCOMPLETE ---
async function searchNominatim(q) {
    try {
        const b = map.getBounds();
        const viewbox = [b.getWest(), b.getNorth(), b.getEast(), b.getSouth()].join(',');
        const resp = await fetch(`/search?q=${encodeURIComponent(q)}&viewbox=${viewbox}`);
        return await resp.json();
    } catch(e) { 
        return []; 
    }
}

function attachAutocomplete(inputId, listId) {
    const input = document.getElementById(inputId);
    const list = document.getElementById(listId);
    if (!input || !list) return;
    let t = null;
    
    input.addEventListener('input', () => {
        const q = input.value.trim();
        if(t) clearTimeout(t);
        if(q.length < 2) { 
            list.style.display='none'; 
            return; 
        }
        
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
                    const latLng = {lat: parseFloat(r.lat), lng: parseFloat(r.lon)};
                    setMarker(inputId === 'start' ? 'start' : 'end', latLng, main);
                    map.setView([r.lat, r.lon], 16);
                    
                    if(inputId === 'start') {
                        fetchWeather(r.lat, r.lon);
                    }
                };
                list.appendChild(item);
            });
            list.style.display = results.length ? 'block' : 'none';
        }, 300);
    });
    
    document.addEventListener('click', e => { 
        if(!input.contains(e.target) && !list.contains(e.target)) list.style.display='none'; 
    });
}

attachAutocomplete('start', 'start-list');
attachAutocomplete('end', 'end-list');

setTimeout(() => {
    const center = map.getCenter();
    fetchWeather(center.lat, center.lng);
}, 1000);