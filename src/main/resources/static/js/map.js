// --- 1. SETUP ---
const map = L.map('map', { zoomControl: false }).setView([14.5995, 120.9842], 13);
L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { 
    maxZoom: 19, 
    attribution: 'OpenTrack' 
}).addTo(map);

// FIXED ROUTES
const BUS_ROUTES = {
    'PITX-LAWTON': [
        [14.5113, 120.9926], [14.5332, 120.9892], 
        [14.5550, 120.9850], [14.5936, 120.9806]
    ],
    'CUBAO-MAKATI': [
        [14.6178, 121.0572], [14.5866, 121.0567], [14.5547, 121.0244]
    ]
};

let routePolyline = null;
let driverWatchId = null;
const fleetMarkers = {};

// --- 2. INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    if (CURRENT_USER_ROLE === 'DRIVER') {
        initDriverMode();
    } else if (CURRENT_USER_ROLE === 'DISPATCHER') {
        initDispatcherMode();
    }
});

// --- 3. DRIVER MODE ---
function initDriverMode() {
    document.getElementById('driverControls').style.display = 'block';

    // Route Selector
    document.getElementById('routeSelect').addEventListener('change', (e) => {
        const coords = BUS_ROUTES[e.target.value];
        if(coords) {
            if(routePolyline) map.removeLayer(routePolyline);
            routePolyline = L.polyline(coords, {color: '#3b82f6', weight: 6}).addTo(map);
            map.fitBounds(routePolyline.getBounds(), {padding: [50,50]});
            
            const btn = document.getElementById('startNavBtn');
            btn.disabled = false;
            btn.innerHTML = '<i class="bi bi-cursor-fill me-2"></i> START TRIP';
            btn.classList.remove('btn-secondary');
            btn.classList.add('btn-warning');
        }
    });

    document.getElementById('startNavBtn').addEventListener('click', toggleDriverTracking);

    // Poll for Messages every 5 seconds
    setInterval(checkForMessages, 5000);
}

function toggleDriverTracking() {
    const btn = document.getElementById('startNavBtn');
    
    if (driverWatchId) {
        navigator.geolocation.clearWatch(driverWatchId);
        driverWatchId = null;
        btn.innerHTML = 'START TRIP';
        btn.classList.remove('btn-danger', 'pulse');
        btn.classList.add('btn-warning');
    } else {
        if (!navigator.geolocation) return alert("No GPS!");
        btn.innerHTML = 'TRACKING ON... (TAP TO END)';
        btn.classList.remove('btn-warning');
        btn.classList.add('btn-danger');

        driverWatchId = navigator.geolocation.watchPosition(pos => {
            const {latitude, longitude} = pos.coords;
            
            fetch('/api/driver/update', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ lat: latitude, lng: longitude, status: "MOVING" })
            });
            
            map.setView([latitude, longitude], 17);
        }, null, {enableHighAccuracy: true});
    }
}

function checkForMessages() {
    fetch('/api/driver/messages')
        .then(r => r.json())
        .then(msgs => {
            if (msgs.length > 0) {
                msgs.forEach(m => {
                    alert("📢 DISPATCHER: " + m.message);
                    // Text to Speech
                    let u = new SpeechSynthesisUtterance(m.message);
                    window.speechSynthesis.speak(u);
                });
            }
        });
}

// --- 4. ADMIN MODE ---
function initDispatcherMode() {
    document.getElementById('dispatcherPanel').style.display = 'block';
    setInterval(fetchFleet, 3000);
}

async function fetchFleet() {
    try {
        const res = await fetch('/api/fleet/status');
        const buses = await res.json();
        const list = document.getElementById('fleetList');
        list.innerHTML = '';

        buses.forEach(bus => {
            // Update Map
            if(fleetMarkers[bus.driverId]) {
                fleetMarkers[bus.driverId].setLatLng([bus.latitude, bus.longitude]);
            } else {
                const icon = L.divIcon({
                    className: 'bus-icon',
                    html: `<div style="background:#ef4444; color:white; width:30px; height:30px; border-radius:50%; display:flex; align-items:center; justify-content:center; border:2px solid white; font-weight:bold;">${bus.driverId}</div>`,
                    iconSize: [30,30]
                });
                fleetMarkers[bus.driverId] = L.marker([bus.latitude, bus.longitude], {icon}).addTo(map);
            }
            
            // Update List
            const item = document.createElement('div');
            item.className = "p-2 border-bottom border-secondary";
            item.innerHTML = `<i class="bi bi-bus-front"></i> Driver #${bus.driverId} <span class="badge bg-success float-end">ACTIVE</span>`;
            item.onclick = () => {
                document.getElementById('adminDriverId').value = bus.driverId;
            };
            list.appendChild(item);
        });
    } catch(e){}
}

function sendAdminMessage() {
    const id = document.getElementById('adminDriverId').value;
    const msg = document.getElementById('adminMsgInput').value;
    if(!id || !msg) return alert("Enter ID and Message");

    fetch(`/api/admin/send-message?driverId=${id}&message=${encodeURIComponent(msg)}`, {method: 'POST'})
        .then(() => {
            alert("Message Sent!");
            document.getElementById('adminMsgInput').value = '';
        });
}

// --- 5. UTILS ---
async function findNearby(type) {
    if(!map.getCenter()) return;
    const {lat, lng} = map.getCenter();
    let queryKey = type === 'gas' ? '"amenity"="fuel"' : '"shop"="car_repair"';
    const query = `[out:json][timeout:25];(node[${queryKey}](around:3000,${lat},${lng}););out;`;
    
    try {
        const res = await fetch('https://overpass-api.de/api/interpreter?data=' + encodeURIComponent(query));
        const data = await res.json();
        data.elements.forEach(el => {
            L.marker([el.lat, el.lon]).addTo(map).bindPopup(el.tags.name || "Service");
        });
        alert(`Found ${data.elements.length} nearby.`);
    } catch(e){ alert("Error fetching services"); }
}