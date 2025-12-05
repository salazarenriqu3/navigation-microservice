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
    public String index() { return "index"; }

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

    // --- SEARCH (Nominatim) ---
    @GetMapping("/search")
    @ResponseBody
    public ResponseEntity<String> search(@RequestParam String q, @RequestParam(required = false) String viewbox) {
        try {
            UriComponentsBuilder builder = UriComponentsBuilder.fromUriString("https://nominatim.openstreetmap.org/search")
                    .queryParam("format", "json")
                    .queryParam("q", q)
                    .queryParam("limit", 5)
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

    // --- REVERSE GEOCODING (New!) ---
    @GetMapping("/reverse")
    @ResponseBody
    public ResponseEntity<String> reverse(@RequestParam double lat, @RequestParam double lon) {
        try {
            URI uri = UriComponentsBuilder.fromUriString("https://nominatim.openstreetmap.org/reverse")
                    .queryParam("format", "json")
                    .queryParam("lat", lat)
                    .queryParam("lon", lon)
                    .queryParam("zoom", 18)
                    .queryParam("addressdetails", "1")
                    .build().toUri();

            HttpHeaders headers = new HttpHeaders();
            headers.set("User-Agent", "MapAppProSpring/1.0");
            HttpEntity<?> entity = new HttpEntity<>(headers);
            ResponseEntity<String> response = rest.exchange(uri, HttpMethod.GET, entity, String.class);
            return ResponseEntity.status(response.getStatusCode()).body(response.getBody());
        } catch (Exception e) {
            return ResponseEntity.badRequest().body("{}");
        }
    }

    // --- LANDMARKS ---
    @GetMapping("/landmarks")
    @ResponseBody
    public ResponseEntity<String> landmarks(
            @RequestParam double lat, @RequestParam double lon,
            @RequestParam(required = false, defaultValue = "2000") int radius,
            @RequestParam(required = false) String cats
    ) {
        try {
            String[] defaults = new String[]{ "tourism=museum", "amenity=hospital", "shop=mall", "amenity=restaurant" };
            String[] selected = (cats != null && !cats.isEmpty()) ? 
                java.util.Arrays.stream(cats.split(",")).map(c -> mapCategory(c.trim())).toArray(String[]::new) : defaults;

            StringBuilder sb = new StringBuilder("[out:json][timeout:25];(");
            for (String kv : selected) {
                String[] p = kv.split("=");
                if (p.length == 2) sb.append("node[\"").append(p[0]).append("\"=\"").append(p[1]).append("\"](around:")
                        .append(radius).append(",").append(lat).append(",").append(lon).append(");");
            }
            sb.append(");out body;");

            URI uri = UriComponentsBuilder.fromUriString("https://overpass-api.de/api/interpreter")
                    .queryParam("data", sb.toString()).build().toUri();
            return rest.exchange(uri, HttpMethod.GET, new HttpEntity<>(new HttpHeaders()), String.class);
        } catch (Exception e) { return ResponseEntity.badRequest().body("[]"); }
    }

    private String mapCategory(String c) {
        switch (c.toLowerCase()) {
            case "cafe": return "amenity=cafe";
            case "restaurant": return "amenity=restaurant";
            case "park": return "leisure=park";
            case "atm": return "amenity=atm";
            case "pharmacy": return "amenity=pharmacy";
            case "hotel": return "tourism=hotel";
            case "hospital": return "amenity=hospital";
            default: return "amenity=" + c;
        }
    }

    // --- ROUTING ---
    @GetMapping("/route")
    @ResponseBody
    public ResponseEntity<String> route(
            @RequestParam double startLat, @RequestParam double startLng,
            @RequestParam double endLat, @RequestParam double endLng,
            @RequestParam(defaultValue = "driving") String profile,
            @RequestParam(required = false, defaultValue = "false") boolean steps) {
        try {
            String osrmProfile = "driving";
            if (profile.equalsIgnoreCase("walking")) osrmProfile = "foot";
            else if (profile.equalsIgnoreCase("cycling")) osrmProfile = "bike";

            String coords = String.format("%f,%f;%f,%f", startLng, startLat, endLng, endLat);
            String base = String.format("http://router.project-osrm.org/route/v1/%s/%s", osrmProfile, coords);

            URI uri = UriComponentsBuilder.fromUriString(base)
                    .queryParam("overview", "full")
                    .queryParam("geometries", "polyline")
                    .queryParam("steps", String.valueOf(steps))
                    .build().toUri();

            return rest.exchange(uri, HttpMethod.GET, new HttpEntity<>(new HttpHeaders()), String.class);
        } catch (Exception e) { return ResponseEntity.badRequest().body("{}"); }
    }
}