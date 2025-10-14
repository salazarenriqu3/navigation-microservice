const map = L.map('map').setView([14.5995, 120.9842], 13);
const baseLayers = {
  voyager: L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap, © CARTO'
  }),
  positron: L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap, © CARTO'
  }),
  dark: L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap, © CARTO'
  }),
  osm: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap contributors'
  })
};
baseLayers.voyager.addTo(map);

let startMarker=null, endMarker=null, routeLayer=null;
let navigating=false, watchId=null, userMarker=null, lastRouteData=null, voiceOn=false;
let landmarkLayer = L.markerClusterGroup ? L.markerClusterGroup({ disableClusteringAtZoom: 16 }) : L.layerGroup();
landmarkLayer.addTo(map);
L.control.scale({imperial:false}).addTo(map);
// Collapsible panel
const controlPanel = document.getElementById('controlPanel');
const togglePanelBtn = document.getElementById('togglePanel');
if(controlPanel && togglePanelBtn){
  togglePanelBtn.addEventListener('click', ()=>{
    controlPanel.classList.toggle('collapsed');
  });
}

// Floating actions
const fabLocate = document.getElementById('fabLocate');
if(fabLocate){
  fabLocate.addEventListener('click', ()=>{
    const btn = document.getElementById('locateBtn');
    if(btn) btn.click();
  });
}

const fabStreet = document.getElementById('fabStreet');
let streetViewMode = false;
if(fabStreet){
  fabStreet.addEventListener('click', ()=>{
    streetViewMode = !streetViewMode;
    fabStreet.classList.toggle('active', streetViewMode);
  });
}

map.on('click', function(e){
  if(streetViewMode){
    const url = `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${e.latlng.lat},${e.latlng.lng}`;
    window.open(url, '_blank');
    return;
  }
});

// Voice toggle
const voiceToggle = document.getElementById('voiceToggle');
if(voiceToggle){ voiceToggle.addEventListener('change', ()=>{ voiceOn = voiceToggle.checked; }); }

function setMarker(kind, lat, lon, popup){
  if(kind==='start'){
    if(startMarker) startMarker.remove();
    const icon = L.divIcon({className:'', html:'<div style="background:#1f6feb;color:#fff;border:2px solid #0e4fb2;border-radius:12px;padding:2px 6px;font-weight:700">S</div>'});
    startMarker = L.marker([lat,lon],{draggable:true, icon}).addTo(map).bindPopup(popup||'Start').openPopup();
    document.getElementById('start').value = popup||'Pinned location';
  } else {
    if(endMarker) endMarker.remove();
    const icon = L.divIcon({className:'', html:'<div style="background:#33c77a;color:#07210f;border:2px solid #1ea863;border-radius:12px;padding:2px 6px;font-weight:700">E</div>'});
    endMarker = L.marker([lat,lon],{draggable:true, icon}).addTo(map).bindPopup(popup||'End').openPopup();
    document.getElementById('end').value = popup||'Pinned location';
  }
}

document.getElementById('locateBtn').addEventListener('click', ()=>{
  if(navigator.geolocation){
    navigator.geolocation.getCurrentPosition(pos=>{
      const lat=pos.coords.latitude, lon=pos.coords.longitude;
      map.setView([lat,lon],15);
      setMarker('start',lat,lon,'My Location');
    }, err=> alert('Geolocation error: '+err.message), {enableHighAccuracy:true});
  } else alert('Geolocation not supported');
});

map.on('click', function(e){
  if(!startMarker){
    setMarker('start', e.latlng.lat, e.latlng.lng, 'Start');
  } else if(!endMarker){
    setMarker('end', e.latlng.lat, e.latlng.lng, 'End');
  }
});

async function searchNominatim(q){
  const resp = await fetch('/search?q='+encodeURIComponent(q));
  return resp.json();
}

function attachAutocomplete(inputId, listId){
  const input = document.getElementById(inputId);
  const list = document.getElementById(listId);
  let t=null;
  let activeIndex = -1;
  input.addEventListener('input', ()=>{
    const q=input.value.trim();
    if(t) clearTimeout(t);
    if(q.length<2){ list.style.display='none'; return; }
    t=setTimeout(async ()=>{
      const results = await searchNominatim(q);
      list.innerHTML='';
      activeIndex = -1;
      const sliced = results.slice(0,8);
      sliced.forEach((r, idx)=>{
        const item=document.createElement('div');
        item.className='autocomplete-item';
        item.textContent=r.display_name;
        item.addEventListener('click', ()=>{
          input.value=r.display_name;
          list.style.display='none';
          const lat=parseFloat(r.lat), lon=parseFloat(r.lon);
          setMarker(inputId==='start'?'start':'end', lat, lon, r.display_name);
          map.setView([lat,lon],14);
        });
        list.appendChild(item);
      });
      list.style.display = results.length? 'block':'none';
    }, 250);
  });
  input.addEventListener('keydown', (e)=>{
    const items = Array.from(list.querySelectorAll('.autocomplete-item'));
    if(!items.length || list.style.display==='none') return;
    if(e.key==='ArrowDown'){
      e.preventDefault();
      activeIndex = (activeIndex + 1) % items.length;
    } else if(e.key==='ArrowUp'){
      e.preventDefault();
      activeIndex = (activeIndex - 1 + items.length) % items.length;
    } else if(e.key==='Enter'){
      e.preventDefault();
      if(activeIndex>=0){ items[activeIndex].click(); }
    } else if(e.key==='Escape'){
      list.style.display='none';
      return;
    } else { return; }
    items.forEach((it,i)=> it.classList.toggle('active', i===activeIndex));
    const active=items[activeIndex];
    if(active){ active.scrollIntoView({block:'nearest'}); }
  });
  document.addEventListener('click',(e)=>{ if(!input.contains(e.target) && !list.contains(e.target)) list.style.display='none'; });
}
attachAutocomplete('start','start-list');
attachAutocomplete('end','end-list');

const activeCategories = new Set();

function iconForCategory(cat){
  const className = 'poi-icon poi-' + cat;
  return L.divIcon({ className, html: `<span>${cat}</span>`, iconAnchor:[16,24], popupAnchor:[0,-18] });
}

async function fetchAndRenderLandmarks(center){
  const catsParam = activeCategories.size ? ('&cats=' + Array.from(activeCategories).join(',')) : '';
  const resp = await fetch('/landmarks?lat='+center.lat+'&lon='+center.lng + catsParam + '&radius=2000');
  const data = await resp.json();
  if(landmarkLayer.clearLayers) { landmarkLayer.clearLayers(); }
  const items = (data.elements||[]).map(el=>({
    lat:el.lat,
    lon:el.lon,
    name:(el.tags && (el.tags.name || el.tags.amenity || el.tags.tourism))||'Unnamed',
    cat:(el.tags && (el.tags.amenity || el.tags.tourism || el.tags.leisure))||'poi'
  }));
  items.forEach(it=>{
    const uid = (it.lat.toFixed(5)+'-'+it.lon.toFixed(5)).replace(/\./g,'_');
    const html = '<div class="small"><strong>'+it.name+'</strong><div class="text-secondary">'+it.cat+'</div><div class="mt-1" id="img-'+uid+'">Loading image…</div></div>';
    const m=L.marker([it.lat,it.lon], { icon: iconForCategory(it.cat) }).bindPopup(html);
    landmarkLayer.addLayer(m);
    m.on('popupopen', ()=> tryLoadImageFor(it, uid));
  });
  return items.length;
}
document.getElementById('landmarkBtn').addEventListener('click', async ()=>{
  const c = map.getCenter();
  const count = await fetchAndRenderLandmarks(c);
  alert(count + ' landmarks found near map center.');
});

const autoLandmarksToggle = document.getElementById('autoLandmarks');
// Fullscreen control (using browser Fullscreen API)
const fsBtn = L.control({position:'topleft'});
fsBtn.onAdd = function(){
  const btn = L.DomUtil.create('button','btn btn-outline-light btn-sm');
  btn.innerHTML = '<i class="bi bi-arrows-fullscreen"></i>';
  btn.style.margin = '10px';
  L.DomEvent.on(btn,'click', (e)=>{
    e.preventDefault();
    const container = document.getElementById('map');
    if(!document.fullscreenElement){ container.requestFullscreen && container.requestFullscreen(); }
    else { document.exitFullscreen && document.exitFullscreen(); }
  });
  return btn;
};
fsBtn.addTo(map);
if(autoLandmarksToggle){
  let debounce=null;
  autoLandmarksToggle.addEventListener('change', ()=>{
    if(autoLandmarksToggle.checked){
      fetchAndRenderLandmarks(map.getCenter());
      map.on('moveend', onMove);
    } else {
      map.off('moveend', onMove);
      if(landmarkLayer.clearLayers) landmarkLayer.clearLayers();
    }
  });
  function onMove(){
    if(debounce) clearTimeout(debounce);
    debounce=setTimeout(()=> fetchAndRenderLandmarks(map.getCenter()), 350);
  }
}

function decodePolyline(encoded){
  try { return polyline.decode(encoded).map(p=>[p[0],p[1]]); } catch(e){ return []; }
}

function profileColor(profile){
  if(profile==='driving') return '#2b7cff';
  if(profile==='walking') return '#33c77a';
  if(profile==='cycling') return '#ff9f1c';
  return '#3388ff';
}

function formatDistance(m){
  if(!m || isNaN(m)) return '';
  if(m < 1000) return Math.round(m) + ' m';
  return (m/1000).toFixed(m<5000? 2:1) + ' km';
}

function formatDuration(sec){
  if(!sec || isNaN(sec)) return '';
  const minutes = Math.round(sec/60);
  if(minutes < 60) return minutes + ' min';
  const hours = Math.floor(minutes/60);
  const rem = minutes % 60;
  return hours + ' hr' + (rem ? ' ' + rem + ' min' : '');
}

function formatETA(sec){
  if(!sec || isNaN(sec)) return '';
  const d = new Date(Date.now() + sec*1000);
  const hh = d.getHours().toString().padStart(2,'0');
  const mm = d.getMinutes().toString().padStart(2,'0');
  return hh + ':' + mm;
}

function instructionText(step){
  const man = step.maneuver || {};
  const name = step.name || '';
  const modifier = man.modifier || '';
  const type = man.type || '';
  const road = name ? (' onto ' + name) : '';
  switch(type){
    case 'depart': return 'Head ' + (modifier||'straight') + road;
    case 'arrive': return 'Arrive at destination';
    case 'turn': return 'Turn ' + (modifier||'') + road;
    case 'new name': return 'Continue' + road;
    case 'roundabout': return 'Enter roundabout' + road;
    case 'merge': return 'Merge' + road;
    case 'fork': return 'Keep ' + (modifier||'') + road;
    case 'end of road': return 'Turn ' + (modifier||'') + road;
    case 'use lane': return 'Use lane' + road;
    default: return (name || 'Continue');
  }
}

document.getElementById('routeBtn').addEventListener('click', async ()=>{
  if(!startMarker || !endMarker) return alert('Set both start and end markers (click map or search).');
  const s = startMarker.getLatLng(), e = endMarker.getLatLng();
  const profile = document.getElementById('profile').value; // driving, walking, cycling
  const resp = await fetch('/route?startLat='+s.lat+'&startLng='+s.lng+'&endLat='+e.lat+'&endLng='+e.lng+'&profile='+profile+'&steps=true');
  const data = await resp.json();
  if(!data.routes || !data.routes.length) return alert('No route found or routing error.');
  const route = data.routes[0];
  const coords = decodePolyline(route.geometry);
  if(routeLayer) routeLayer.remove();
  routeLayer = L.polyline(coords, {color: profileColor(profile), weight:6}).addTo(map);
  map.fitBounds(routeLayer.getBounds(), {padding:[20,20]});
  const totalDist = formatDistance(route.distance);
  const totalDur = formatDuration(route.duration);
  const eta = formatETA(route.duration);
  document.getElementById('info').innerHTML = `<i class="bi bi-signpost-2 me-1"></i><span>${totalDist}</span> — <i class="bi bi-clock me-1"></i><span>${totalDur}</span> · ETA <span>${eta}</span>`;

  // Steps panel
  const stepsPanel = document.getElementById('stepsPanel');
  const stepsList = document.getElementById('stepsList');
  const legs = route.legs || [];
  stepsList.innerHTML = '';
  legs.forEach(leg=>{
    (leg.steps||[]).forEach(st=>{
      const li = document.createElement('li');
      const text = instructionText(st);
      const dist = formatDistance(st.distance || 0);
      li.innerHTML = `<div>${text}</div><div class="text-secondary" style="font-size:12px">${dist}</div>`;
      stepsList.appendChild(li);
    });
  });
  if(stepsList.children.length){ stepsPanel.style.display='block'; }
  lastRouteData = route;

  // Save history if logged in
  try{
    fetch('/history', { method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'},
      body: 'startLat='+encodeURIComponent(s.lat)+'&startLng='+encodeURIComponent(s.lng)+'&endLat='+encodeURIComponent(e.lat)+'&endLng='+encodeURIComponent(e.lng)+'&profile='+encodeURIComponent(profile)
    });
  }catch(err){ /* ignore */ }
});

const basemapSelect = document.getElementById('basemap');
if(basemapSelect){
  basemapSelect.addEventListener('change', ()=>{
    const val = basemapSelect.value;
    Object.values(baseLayers).forEach(l=> map.removeLayer(l));
    baseLayers[val].addTo(map);
  });
}

const chipsContainer = document.getElementById('categoryChips');
if(chipsContainer){
  chipsContainer.querySelectorAll('button[data-cat]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const cat = btn.getAttribute('data-cat');
      if(activeCategories.has(cat)){
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

// Close steps panel
const closeStepsBtn = document.getElementById('closeSteps');
if(closeStepsBtn){ closeStepsBtn.addEventListener('click', ()=>{ document.getElementById('stepsPanel').style.display='none'; }); }

// Live navigation
function speak(text){
  try{ if(!voiceOn) return; const u = new SpeechSynthesisUtterance(text); speechSynthesis.speak(u); }catch(e){}
}

function haversine(a, b){
  const R = 6371000; // m
  const toRad = d=> d*Math.PI/180;
  const dLat = toRad(b.lat - a.lat), dLon = toRad(b.lng - a.lng);
  const s1 = Math.sin(dLat/2), s2 = Math.sin(dLon/2);
  const c = 2 * Math.asin(Math.sqrt(s1*s1 + Math.cos(toRad(a.lat))*Math.cos(toRad(b.lat))*s2*s2));
  return R * c;
}

function nearestPointDistance(poly, point){
  let min = Infinity;
  for(let i=0;i<poly.length;i++){
    const d = haversine({lat:poly[i][0], lng:poly[i][1]}, point);
    if(d<min) min=d;
  }
  return min;
}

function remainingDistance(poly, from){
  let total=0; let started=false;
  for(let i=0;i<poly.length-1;i++){
    const a={lat:poly[i][0], lng:poly[i][1]}, b={lat:poly[i+1][0], lng:poly[i+1][1]};
    if(!started){
      if(haversine(a, from) < 20){ started=true; total += haversine(a,b); }
    } else {
      total += haversine(a,b);
    }
  }
  return total;
}

const startNavBtn = document.getElementById('startNavBtn');
if(startNavBtn){
  startNavBtn.addEventListener('click', ()=>{
    if(!lastRouteData){ alert('Get a route first.'); return; }
    if(!navigator.geolocation){ alert('Geolocation not supported'); return; }
    navigating = true;
    speak('Navigation started');
    watchId = navigator.geolocation.watchPosition(pos=>{
      const lat = pos.coords.latitude, lon = pos.coords.longitude; const acc = pos.coords.accuracy;
      if(!userMarker){ userMarker = L.circleMarker([lat,lon], { radius:6, color:'#33c77a' }).addTo(map); }
      else { userMarker.setLatLng([lat,lon]); }
      map.setView([lat,lon], Math.max(15, map.getZoom()));
      // Reroute if far from route
      const coords = decodePolyline(lastRouteData.geometry);
      const off = nearestPointDistance(coords, {lat, lng:lon});
      if(off > 60 && startMarker && endMarker){
        // trigger reroute from current position
        setMarker('start', lat, lon, 'You');
        document.getElementById('routeBtn').click();
        speak('Rerouting');
      }
      // Update live ETA
      const rem = remainingDistance(coords, {lat, lng:lon});
      const speed = pos.coords.speed && !isNaN(pos.coords.speed) ? Math.max(pos.coords.speed, 0.5) : 4; // m/s default ~walking
      const etaSec = rem / speed;
      const etaStr = formatETA(etaSec);
      const info = document.getElementById('info');
      if(info){ info.innerHTML = info.innerHTML.replace(/ETA <span>.*?<\/span>/, 'ETA <span>'+etaStr+'</span>'); }
    }, err=>{
      console.log('watchPosition error', err);
    }, {enableHighAccuracy:true, maximumAge:1000});
  });
}

async function tryLoadImageFor(item, uid){
  const node = document.getElementById('img-'+uid);
  if(!node) return;
  try{
    const resp = await fetch('https://en.wikipedia.org/w/api.php?action=query&prop=pageimages&format=json&origin=*&piprop=thumbnail&pithumbsize=240&generator=search&gsrlimit=1&gsrsearch='+encodeURIComponent(item.name));
    const data = await resp.json();
    const pages = data.query && data.query.pages ? Object.values(data.query.pages) : [];
    const page = pages[0];
    if(page && page.thumbnail && page.thumbnail.source){
      node.innerHTML = `<img src="${page.thumbnail.source}" alt="${item.name}" style="width:100%;border-radius:8px"/>`;
    } else {
      node.innerHTML = '<span class="text-secondary">No image available</span>';
    }
  }catch(e){ node.innerHTML = '<span class="text-secondary">No image available</span>'; }
}
