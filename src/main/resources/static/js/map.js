// OpenTrack Fleet Management System - map.js
// Get global variables set by index.html
const CURRENT_USER_ROLE = window.CURRENT_USER_ROLE;
const CURRENT_USER_ID = window.CURRENT_USER_ID;

// --- 1. SETUP ---
const map = L.map("map", { zoomControl: false }).setView([14.5995, 120.9842], 13);
L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
  maxZoom: 19,
  attribution: "OpenTrack",
}).addTo(map);

// FIXED ROUTES
const BUS_ROUTES = {
  "PITX-LAWTON": [
    [14.5113, 120.9926],
    [14.5332, 120.9892],
    [14.555, 120.985],
    [14.5936, 120.9806],
  ],
  "CUBAO-MAKATI": [
    [14.6178, 121.0572],
    [14.5866, 121.0567],
    [14.5547, 121.0244],
  ],
};

const LANDMARK_ICONS = {
  GAS: L.divIcon({
    className: "landmark-icon",
    html: '<div style="background:#f59e0b; color:white; width:32px; height:32px; border-radius:50%; display:flex; align-items:center; justify-content:center; border:2px solid white; box-shadow:0 2px 8px rgba(0,0,0,0.3);"><i class="bi bi-fuel-pump"></i></div>',
    iconSize: [32, 32],
  }),
  TERMINAL: L.divIcon({
    className: "landmark-icon",
    html: '<div style="background:#3b82f6; color:white; width:32px; height:32px; border-radius:50%; display:flex; align-items:center; justify-content:center; border:2px solid white; box-shadow:0 2px 8px rgba(0,0,0,0.3);"><i class="bi bi-building"></i></div>',
    iconSize: [32, 32],
  }),
  REPAIR: L.divIcon({
    className: "landmark-icon",
    html: '<div style="background:#ef4444; color:white; width:32px; height:32px; border-radius:50%; display:flex; align-items:center; justify-content:center; border:2px solid white; box-shadow:0 2px 8px rgba(0,0,0,0.3);"><i class="bi bi-wrench-adjustable"></i></div>',
    iconSize: [32, 32],
  }),
};

let routePolyline = null;
let driverWatchId = null;
const fleetMarkers = {};

let followedDriverId = null;
let isFollowing = false;

// --- 2. INITIALIZATION ---
document.addEventListener("DOMContentLoaded", () => {
  console.log("[OpenTrack] System starting...");
  console.log("[OpenTrack] User Role:", CURRENT_USER_ROLE);
  console.log("[OpenTrack] User ID:", CURRENT_USER_ID);

  if (CURRENT_USER_ROLE === "DRIVER") {
    initDriverMode();
  } else if (CURRENT_USER_ROLE === "DISPATCHER") {
    initDispatcherMode();
  }

  // Load landmarks
  loadLandmarks();

  // Disable follow mode when user manually drags map
  map.on("dragstart", () => {
    if (isFollowing) {
      console.log("[OpenTrack] Manual drag detected, disabling follow mode");
      disableFollowMode();
    }
  });
});

// --- 3. DRIVER MODE ---
function initDriverMode() {
  console.log("[OpenTrack] Initializing DRIVER mode");
  document.getElementById("driverControls").style.display = "block";

  document.getElementById("routeSelect").addEventListener("change", (e) => {
    const coords = BUS_ROUTES[e.target.value];
    if (coords) {
      if (routePolyline) map.removeLayer(routePolyline);
      routePolyline = L.polyline(coords, { color: "#3b82f6", weight: 6 }).addTo(map);
      map.fitBounds(routePolyline.getBounds(), { padding: [50, 50] });

      const btn = document.getElementById("startNavBtn");
      btn.disabled = false;
      btn.innerHTML = '<i class="bi bi-cursor-fill me-2"></i> START TRIP';
      btn.classList.remove("btn-secondary");
      btn.classList.add("btn-warning");
    }
  });

  document.getElementById("startNavBtn").addEventListener("click", toggleDriverTracking);
  setInterval(checkForMessages, 5000);
}

function toggleDriverTracking() {
  const btn = document.getElementById("startNavBtn");

  if (driverWatchId) {
    navigator.geolocation.clearWatch(driverWatchId);
    driverWatchId = null;
    btn.innerHTML = '<i class="bi bi-cursor-fill me-2"></i> START TRIP';
    btn.classList.remove("btn-danger", "pulse");
    btn.classList.add("btn-warning");
    console.log("[OpenTrack] Tracking stopped");
  } else {
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by your browser!");
      return;
    }

    btn.innerHTML = '<i class="bi bi-broadcast me-2"></i> TRACKING ON... (TAP TO END)';
    btn.classList.remove("btn-warning");
    btn.classList.add("btn-danger");

    console.log("[OpenTrack] Starting location tracking...");

    driverWatchId = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        console.log("[OpenTrack] Location update:", latitude, longitude);

        fetch("/api/driver/update", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lat: latitude, lng: longitude, status: "MOVING" }),
        })
        .then(() => console.log("[OpenTrack] Location sent to server"))
        .catch((err) => console.error("[OpenTrack] Error sending location:", err));

        map.setView([latitude, longitude], 17);
      },
      (error) => {
        console.error("[OpenTrack] Geolocation error:", error);
        alert("Error getting location: " + error.message);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  }
}

function checkForMessages() {
  fetch("/api/driver/messages")
    .then((r) => r.json())
    .then((msgs) => {
      if (msgs.length > 0) {
        msgs.forEach((m) => {
          alert("📢 DISPATCHER: " + m.message);
          if (window.speechSynthesis) {
            const u = new SpeechSynthesisUtterance(m.message);
            window.speechSynthesis.speak(u);
          }
        });
      }
    })
    .catch((err) => console.error("[OpenTrack] Error checking messages:", err));
}

// --- 4. DISPATCHER MODE ---
function initDispatcherMode() {
  console.log("[OpenTrack] Initializing DISPATCHER mode");
  document.getElementById("dispatcherPanel").style.display = "block";
  fetchFleet(); // Initial fetch
  setInterval(fetchFleet, 3000); // Update every 3 seconds
}

async function fetchFleet() {
  try {
    const res = await fetch("/api/fleet/status");
    const buses = await res.json();
    const list = document.getElementById("fleetList");
    list.innerHTML = "";

    console.log("[OpenTrack] Fetched", buses.length, "buses");

    buses.forEach((bus) => {
      // Update or create marker
      if (fleetMarkers[bus.driverId]) {
        fleetMarkers[bus.driverId].setLatLng([bus.latitude, bus.longitude]);
      } else {
        const icon = L.divIcon({
          className: "bus-icon",
          html: `<div style="background:#ef4444; color:white; width:36px; height:36px; border-radius:50%; display:flex; align-items:center; justify-content:center; border:3px solid white; font-weight:bold; box-shadow:0 2px 10px rgba(0,0,0,0.4);">${bus.driverId}</div>`,
          iconSize: [36, 36],
        });
        fleetMarkers[bus.driverId] = L.marker([bus.latitude, bus.longitude], { icon }).addTo(map);
      }

      // Auto-follow if enabled
      if (isFollowing && followedDriverId === bus.driverId) {
        map.panTo([bus.latitude, bus.longitude], { animate: true, duration: 0.5 });
      }

      // Create list item
      const item = document.createElement("div");
      item.className = "p-2 border-bottom border-secondary d-flex justify-content-between align-items-center";
      if (isFollowing && followedDriverId === bus.driverId) {
        item.style.background = "rgba(59, 130, 246, 0.2)";
        item.style.borderLeft = "4px solid #3b82f6";
      }

      const info = document.createElement("div");
      info.innerHTML = `
        <div><i class="bi bi-bus-front"></i> ${bus.fullName || "Driver #" + bus.driverId}</div>
        <small class="text-white-50">${bus.plateNo || "No plate"}</small>
      `;

      const actions = document.createElement("div");
      actions.className = "d-flex gap-1";

      const followBtn = document.createElement("button");
      followBtn.className =
        "btn btn-sm " + (isFollowing && followedDriverId === bus.driverId ? "btn-warning" : "btn-outline-primary");
      followBtn.innerHTML = '<i class="bi bi-crosshair"></i>';
      followBtn.title = "Follow Driver";
      followBtn.onclick = () => toggleFollowMode(bus.driverId, bus.latitude, bus.longitude);

      const msgBtn = document.createElement("button");
      msgBtn.className = "btn btn-sm btn-outline-success";
      msgBtn.innerHTML = '<i class="bi bi-chat-dots"></i>';
      msgBtn.title = "Send Message";
      msgBtn.onclick = () => {
        document.getElementById("adminDriverId").value = bus.driverId;
        document.getElementById("adminMsgInput").focus();
      };

      actions.appendChild(followBtn);
      actions.appendChild(msgBtn);

      item.appendChild(info);
      item.appendChild(actions);
      list.appendChild(item);
    });

    if (buses.length === 0) {
      list.innerHTML = '<div class="text-center py-3 text-white-50">No active drivers</div>';
    }
  } catch (e) {
    console.error("[OpenTrack] Error fetching fleet:", e);
  }
}

function toggleFollowMode(driverId, lat, lng) {
  if (isFollowing && followedDriverId === driverId) {
    disableFollowMode();
  } else {
    followedDriverId = driverId;
    isFollowing = true;
    map.setView([lat, lng], 16, { animate: true });
    console.log("[OpenTrack] Following driver:", driverId);
  }
}

function disableFollowMode() {
  followedDriverId = null;
  isFollowing = false;
  console.log("[OpenTrack] Follow mode disabled");
}

function sendAdminMessage() {
  const id = document.getElementById("adminDriverId").value;
  const msg = document.getElementById("adminMsgInput").value;
  if (!id || !msg) {
    alert("Please enter both Driver ID and Message");
    return;
  }

  fetch(`/api/admin/send-message?driverId=${id}&message=${encodeURIComponent(msg)}`, { method: "POST" })
    .then(() => {
      alert("Message Sent!");
      document.getElementById("adminMsgInput").value = "";
    })
    .catch((err) => {
      console.error("[OpenTrack] Error sending message:", err);
      alert("Error sending message");
    });
}

// --- 5. LANDMARKS ---
async function loadLandmarks() {
  try {
    const res = await fetch("/api/landmarks");
    const landmarks = await res.json();

    landmarks.forEach((lm) => {
      const icon = LANDMARK_ICONS[lm.type] || LANDMARK_ICONS.GAS;
      L.marker([lm.latitude, lm.longitude], { icon })
        .addTo(map)
        .bindPopup(`<strong>${lm.name}</strong><br/>${lm.type}`);
    });
    console.log("[OpenTrack] Loaded", landmarks.length, "landmarks");
  } catch (e) {
    console.error("[OpenTrack] Error loading landmarks:", e);
  }
}

// --- 6. ADMIN UI ---
function openManageDriversModal() {
  loadDriversList();
  const modal = new bootstrap.Modal(document.getElementById("manageDriversModal"));
  modal.show();
}

async function loadDriversList() {
  try {
    const res = await fetch("/api/admin/users");
    const users = await res.json();
    const list = document.getElementById("driversList");
    list.innerHTML = "";

    users
      .filter((u) => u.role === "DRIVER")
      .forEach((driver) => {
        const item = document.createElement("div");
        item.className = "list-group-item bg-dark text-white border-secondary mb-2";
        item.innerHTML = `
          <div class="d-flex justify-content-between align-items-start">
            <div>
              <strong>${driver.fullName || driver.username}</strong>
              <div class="small text-white-50">
                License: ${driver.licenseNo || "N/A"} | Plate: ${driver.plateNo || "N/A"}<br/>
                Phone: ${driver.phone || "N/A"} | Shift: ${driver.shiftSchedule || "N/A"}
              </div>
            </div>
            <span class="badge ${driver.active ? "bg-success" : "bg-danger"}">${driver.active ? "Active" : "Inactive"}</span>
          </div>
        `;
        list.appendChild(item);
      });
  } catch (e) {
    console.error("[OpenTrack] Error loading drivers:", e);
  }
}

document.getElementById("createDriverForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();

  const data = {
    username: document.getElementById("newUsername").value,
    password: document.getElementById("newPassword").value,
    role: "DRIVER",
    fullName: document.getElementById("newFullName").value,
    licenseNo: document.getElementById("newLicenseNo").value,
    plateNo: document.getElementById("newPlateNo").value,
    phone: document.getElementById("newPhone").value,
    shiftSchedule: document.getElementById("newShift").value,
  };

  try {
    const res = await fetch("/api/admin/users/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    if (res.ok) {
      alert("Driver created successfully!");
      e.target.reset();
      loadDriversList();
    } else {
      const error = await res.text();
      alert("Error: " + error);
    }
  } catch (e) {
    console.error("[OpenTrack] Error creating driver:", e);
    alert("Error creating driver");
  }
});

// --- 7. UTILS ---
async function findNearby(type) {
  if (!map.getCenter()) return;
  const { lat, lng } = map.getCenter();
  const queryKey = type === "gas" ? '"amenity"="fuel"' : '"shop"="car_repair"';
  const query = `[out:json][timeout:25];(node[${queryKey}](around:3000,${lat},${lng}););out;`;

  try {
    const res = await fetch("https://overpass-api.de/api/interpreter?data=" + encodeURIComponent(query));
    const data = await res.json();
    data.elements.forEach((el) => {
      L.marker([el.lat, el.lon])
        .addTo(map)
        .bindPopup(el.tags.name || "Service");
    });
    alert(`Found ${data.elements.length} nearby.`);
  } catch (e) {
    console.error("[OpenTrack] Error fetching services:", e);
    alert("Error fetching services");
  }
}

console.log("[OpenTrack] map.js loaded successfully");