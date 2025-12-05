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
import java.util.Locale;
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
        List<Map<String,Object>> history = (List<Map<String,Object>>) session.getAttribute("history");
        if(history==null){ history = new ArrayList<>(); session.setAttribute("history", history); }
        
        Map<String,Object> entry = new HashMap<>();
        entry.put("startLat", startLat); 
        entry.put("endLat", endLat);
        entry.put("profile", profile); 
        entry.put("ts", System.currentTimeMillis());
        history.add(entry);
        return ResponseEntity.ok(entry);
    }

    @GetMapping("/history")
    @ResponseBody
    public ResponseEntity<?> getHistory(HttpSession session){
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
                    .queryParam("limit", 5)
                    .queryParam("countrycodes", "ph");
            
            if (viewbox != null && !viewbox.isEmpty()) {
                builder.queryParam("viewbox", viewbox).queryParam("bounded", "0");
            }
            
            URI uri = builder.build().toUri();
            HttpHeaders headers = new HttpHeaders();
            headers.set("User-Agent", "MapAppProSpring/1.0");
            return rest.exchange(uri, HttpMethod.GET, new HttpEntity<>(headers), String.class);
        } catch (Exception e) { return ResponseEntity.badRequest().body("[]"); }
    }

    @GetMapping("/reverse")
    @ResponseBody
    public ResponseEntity<String> reverse(@RequestParam double lat, @RequestParam double lon) {
        try {
            URI uri = UriComponentsBuilder.fromUriString("https://nominatim.openstreetmap.org/reverse")
                    .queryParam("format", "json")
                    .queryParam("lat", lat)
                    .queryParam("lon", lon)
                    .queryParam("zoom", 18)
                    .build().toUri();
            
            HttpHeaders headers = new HttpHeaders();
            headers.set("User-Agent", "MapAppProSpring/1.0");
            return rest.exchange(uri, HttpMethod.GET, new HttpEntity<>(headers), String.class);
        } catch (Exception e) { return ResponseEntity.badRequest().body("{}"); }
    }

    @GetMapping("/landmarks")
    @ResponseBody
    public ResponseEntity<String> landmarks(@RequestParam double lat, @RequestParam double lon, @RequestParam(defaultValue = "1500") int radius, @RequestParam(required = false) String cats) {
        try {
            // FIX: Define a STRICT list of allowed categories. 
            // If the user doesn't select anything, we only show these defaults.
            String filter = "";
            
            if (cats != null && !cats.isEmpty()) {
                String[] requested = cats.split(",");
                StringBuilder unions = new StringBuilder();
                for (String c : requested) {
                    unions.append(mapCategoryToOverpass(c.trim(), radius, lat, lon));
                }
                filter = unions.toString();
            } else {
                // Default: ONLY show major amenities (Food, ATM, Sights)
                filter = String.format(Locale.US, 
                    "(nwr[\"amenity\"=\"cafe\"](around:%d,%f,%f);" +
                    "nwr[\"amenity\"=\"restaurant\"](around:%d,%f,%f);" +
                    "nwr[\"amenity\"=\"fast_food\"](around:%d,%f,%f);" +
                    "nwr[\"amenity\"=\"bank\"](around:%d,%f,%f);" +
                    "nwr[\"amenity\"=\"atm\"](around:%d,%f,%f);" +
                    "nwr[\"leisure\"=\"park\"](around:%d,%f,%f);" +
                    "nwr[\"tourism\"=\"hotel\"](around:%d,%f,%f);)", 
                    radius, lat, lon, radius, lat, lon, radius, lat, lon,
                    radius, lat, lon, radius, lat, lon, radius, lat, lon, radius, lat, lon);
            }

            // Construct final query [out:json][timeout:25];( ... );out center;
            String query = String.format("[out:json][timeout:25];%sout center;", filter);
            
            URI uri = UriComponentsBuilder.fromUriString("https://overpass-api.de/api/interpreter")
                    .queryParam("data", query)
                    .build()
                    .toUri();

            return rest.exchange(uri, HttpMethod.GET, new HttpEntity<>(new HttpHeaders()), String.class);
        } catch (Exception e) { 
            return ResponseEntity.ok("[]"); 
        }
    }

    // Helper to map UI names to Overpass tags
    private String mapCategoryToOverpass(String category, int r, double lat, double lon) {
        String tag = "";
        switch (category.toLowerCase()) {
            case "cafe": tag = "\"amenity\"=\"cafe\""; break;
            case "food": 
            case "restaurant": tag = "\"amenity\"~\"restaurant|fast_food\""; break;
            case "park": tag = "\"leisure\"=\"park\""; break;
            case "bank": 
            case "atm": tag = "\"amenity\"~\"bank|atm\""; break;
            case "hotel": tag = "\"tourism\"=\"hotel\""; break;
            case "hospital": tag = "\"amenity\"~\"hospital|clinic\""; break;
            case "gas": tag = "\"amenity\"=\"fuel\""; break;
            default: return ""; 
        }
        return String.format(Locale.US, "nwr[%s](around:%d,%f,%f);", tag, r, lat, lon);
    }

    @GetMapping("/route")
    @ResponseBody
    public ResponseEntity<String> route(
            @RequestParam double startLat, @RequestParam double startLng,
            @RequestParam double endLat, @RequestParam double endLng,
            @RequestParam(defaultValue = "driving") String profile,
            @RequestParam(required = false, defaultValue = "false") boolean steps) {

        System.out.println("ROUTE REQUEST: " + profile);

        String baseUrl = "http://router.project-osrm.org/route/v1/driving/"; // Default Car
        
        if (profile.toLowerCase().contains("walk") || profile.toLowerCase().contains("foot")) {
            baseUrl = "http://routing.openstreetmap.de/routed-foot/route/v1/driving/"; // Foot Server
        } else if (profile.toLowerCase().contains("cycl") || profile.toLowerCase().contains("bike")) {
            baseUrl = "http://routing.openstreetmap.de/routed-bike/route/v1/driving/"; // Bike Server
        }

        // FIX: Force US Locale to avoid "121,000" format in some regions
        String coords = String.format(Locale.US, "%f,%f;%f,%f", startLng, startLat, endLng, endLat);
        String finalUrl = baseUrl + coords;

        UriComponentsBuilder builder = UriComponentsBuilder.fromUriString(finalUrl)
                .queryParam("overview", "full")
                .queryParam("geometries", "polyline")
                .queryParam("steps", String.valueOf(steps));

        try {
            HttpHeaders headers = new HttpHeaders();
            headers.set("User-Agent", "MapAppProSpring/1.0");
            return rest.exchange(builder.build().toUri(), HttpMethod.GET, new HttpEntity<>(headers), String.class);
        } catch (Exception e) {
            return ResponseEntity.badRequest().body("{}");
        }
    }
}