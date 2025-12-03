package com.mapapppro.controller;

import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseBody;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.util.UriComponentsBuilder;

import java.net.URI;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import jakarta.servlet.http.HttpSession;

@Controller
public class MapController {

    private final RestTemplate rest = new RestTemplate();

    @GetMapping({"/", "/index"})
    public String index() {
        return "index";
    }

    @GetMapping("/login")
    public String loginPage() { return "login"; }

    @PostMapping("/login")
    public String doLogin(@RequestParam String username, HttpSession session){
        session.setAttribute("user", username);
        if(session.getAttribute("history")==null){ session.setAttribute("history", new ArrayList<Map<String,Object>>()); }
        return "redirect:/";
    }

    @PostMapping("/logout")
    public String logout(HttpSession session){ session.invalidate(); return "redirect:/"; }

    @PostMapping("/history")
    @ResponseBody
    public ResponseEntity<?> addHistory(@RequestParam double startLat, @RequestParam double startLng,
                                        @RequestParam double endLat, @RequestParam double endLng,
                                        @RequestParam String profile,
                                        HttpSession session){
        Object user = session.getAttribute("user");
        if(user==null){ return ResponseEntity.status(401).body("Not logged in"); }
        List<Map<String,Object>> history = (List<Map<String,Object>>) session.getAttribute("history");
        if(history==null){ history = new ArrayList<>(); session.setAttribute("history", history); }
        Map<String,Object> entry = new HashMap<>();
        entry.put("startLat", startLat); entry.put("startLng", startLng);
        entry.put("endLat", endLat); entry.put("endLng", endLng);
        entry.put("profile", profile); entry.put("ts", System.currentTimeMillis());
        history.add(entry);
        return ResponseEntity.ok(entry);
    }

    @GetMapping("/history")
    @ResponseBody
    public ResponseEntity<?> getHistory(HttpSession session){
        Object user = session.getAttribute("user");
        if(user==null){ return ResponseEntity.status(401).body("Not logged in"); }
        List<Map<String,Object>> history = (List<Map<String,Object>>) session.getAttribute("history");
        return ResponseEntity.ok(history==null? new ArrayList<>(): history);
    }

    @GetMapping("/search")
    @ResponseBody
    public ResponseEntity<String> search(@RequestParam String q, @RequestParam(required = false) String viewbox) {
        try {
            UriComponentsBuilder builder = UriComponentsBuilder.fromUriString("https://nominatim.openstreetmap.org/search")
                    .queryParam("format", "json")
                    .queryParam("q", q)
                    .queryParam("limit", 8)
                    .queryParam("countrycodes", "ph")
                    .queryParam("addressdetails", "1")
                    .queryParam("dedupe", "1");

            if (viewbox != null && !viewbox.isEmpty()) {
                builder.queryParam("viewbox", viewbox);
                builder.queryParam("bounded", "0");
            }

            URI uri = builder.build().toUri();

            HttpHeaders headers = new HttpHeaders();
            headers.set("User-Agent", "MapAppProSpring/1.0");

            HttpEntity<?> entity = new HttpEntity<>(headers);
            ResponseEntity<String> response = rest.exchange(uri, HttpMethod.GET, entity, String.class);

            return ResponseEntity.status(response.getStatusCode()).body(response.getBody());
        } catch (Exception e) {
            return ResponseEntity.badRequest().body("[]");
        }
    }

    @GetMapping("/landmarks")
    @ResponseBody
    public ResponseEntity<String> landmarks(
            @RequestParam double lat,
            @RequestParam double lon,
            @RequestParam(required = false, defaultValue = "2000") int radius,
            @RequestParam(required = false) String cats
    ) {
        try {
            String[] defaults = new String[]{
                    "tourism=museum", "amenity=hospital", "shop=mall",
                    "amenity=school", "leisure=park", "amenity=restaurant",
                    "amenity=cafe", "amenity=atm", "amenity=pharmacy", "tourism=hotel"
            };

            String[] selected;
            if (cats != null && !cats.isEmpty()) {
                String[] requested = cats.split(",");
                selected = new String[requested.length];
                for (int i = 0; i < requested.length; i++) {
                    String c = requested[i].trim().toLowerCase();
                    switch (c) {
                        case "cafe": selected[i] = "amenity=cafe"; break;
                        case "restaurant": selected[i] = "amenity=restaurant"; break;
                        case "park": selected[i] = "leisure=park"; break;
                        case "atm": selected[i] = "amenity=atm"; break;
                        case "pharmacy": selected[i] = "amenity=pharmacy"; break;
                        case "hotel": selected[i] = "tourism=hotel"; break;
                        case "hospital": selected[i] = "amenity=hospital"; break;
                        case "school": selected[i] = "amenity=school"; break;
                        case "museum": selected[i] = "tourism=museum"; break;
                        default: selected[i] = "amenity=" + c; break;
                    }
                }
            } else {
                selected = defaults;
            }

            StringBuilder sb = new StringBuilder("[out:json][timeout:25];(");
            for (String kv : selected) {
                String[] p = kv.split("=");
                if (p.length != 2) continue;
                sb.append("node[\"").append(p[0]).append("\"=\"").append(p[1]).append("\"](around:")
                        .append(radius).append(",").append(lat).append(",").append(lon).append(");");
            }
            sb.append(");out body;");
            String query = sb.toString();

            URI uri = UriComponentsBuilder.fromUriString("https://overpass-api.de/api/interpreter")
                    .queryParam("data", query)
                    .build()
                    .toUri();

            HttpHeaders headers = new HttpHeaders();
            headers.set("User-Agent", "MapAppProSpring/1.0");

            HttpEntity<?> entity = new HttpEntity<>(headers);
            ResponseEntity<String> response = rest.exchange(uri, HttpMethod.GET, entity, String.class);

            return ResponseEntity.status(response.getStatusCode()).body(response.getBody());
        } catch (Exception e) {
            return ResponseEntity.badRequest().body("[]");
        }
    }

    @GetMapping("/route")
    @ResponseBody
    public ResponseEntity<String> route(
            @RequestParam double startLat,
            @RequestParam double startLng,
            @RequestParam double endLat,
            @RequestParam double endLng,
            @RequestParam(defaultValue = "driving") String profile,
            @RequestParam(required = false, defaultValue = "false") boolean steps) {

        try {
            // FIX: THIS IS THE IMPORTANT PART
            // We translate the UI names (walking/cycling) to OSRM API names (foot/bike)
            String osrmProfile = "driving";
            if (profile.equalsIgnoreCase("walking")) {
                osrmProfile = "foot";
            } else if (profile.equalsIgnoreCase("cycling")) {
                osrmProfile = "bike";
            } else {
                osrmProfile = "driving";
            }

            String coords = String.format("%f,%f;%f,%f", startLng, startLat, endLng, endLat);
            
            // Use the translated 'osrmProfile' in the URL
            String base = String.format("http://router.project-osrm.org/route/v1/%s/%s", osrmProfile, coords);

            UriComponentsBuilder builder = UriComponentsBuilder.fromUriString(base)
                    .queryParam("overview", "full")
                    .queryParam("geometries", "polyline")
                    .queryParam("steps", String.valueOf(steps));

            URI uri = builder.build().toUri();

            HttpHeaders headers = new HttpHeaders();
            headers.set("User-Agent", "MapAppProSpring/1.0");

            HttpEntity<?> entity = new HttpEntity<>(headers);
            ResponseEntity<String> response = rest.exchange(uri, HttpMethod.GET, entity, String.class);

            return ResponseEntity.status(response.getStatusCode()).body(response.getBody());
        } catch (Exception e) {
            return ResponseEntity.badRequest().body("{}");
        }
    }
}