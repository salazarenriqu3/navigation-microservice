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
    private static final String WEATHER_API_KEY = "ef0446724a6a17a6f1ca725993771aa8";
    
    // TomTom API Key - Get free key from https://developer.tomtom.com/
    // Free tier: 2,500 requests/day
    private static final String TOMTOM_API_KEY = "YOUR_TOMTOM_API_KEY_HERE";
    
    // GraphHopper API Key - Get free key from https://www.graphhopper.com/
    // Free tier: 500 requests/day
    private static final String GRAPHHOPPER_API_KEY = "YOUR_GRAPHHOPPER_API_KEY_HERE";

    @GetMapping({"/", "/index"})
    public String index() { 
        return "index"; 
    }

    @GetMapping("/login")
    public String loginPage() { 
        return "login"; 
    }

    @PostMapping("/login")
    public String doLogin(@RequestParam String username, HttpSession session){
        session.setAttribute("user", username);
        if(session.getAttribute("history")==null){ 
            session.setAttribute("history", new ArrayList<Map<String,Object>>()); 
        }
        return "redirect:/";
    }

    @PostMapping("/logout")
    public String logout(HttpSession session){ 
        session.invalidate(); 
        return "redirect:/"; 
    }

    @PostMapping("/history")
    @ResponseBody
    public ResponseEntity<?> addHistory(@RequestParam double startLat, @RequestParam double startLng,
                                        @RequestParam double endLat, @RequestParam double endLng,
                                        @RequestParam String profile,
                                        HttpSession session){
        List<Map<String,Object>> history = (List<Map<String,Object>>) session.getAttribute("history");
        if(history==null){ 
            history = new ArrayList<>(); 
            session.setAttribute("history", history); 
        }
        
        Map<String,Object> entry = new HashMap<>();
        entry.put("startLat", startLat); 
        entry.put("startLng", startLng);
        entry.put("endLat", endLat);
        entry.put("endLng", endLng);
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
        } catch (Exception e) { 
            return ResponseEntity.badRequest().body("[]"); 
        }
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
        } catch (Exception e) { 
            return ResponseEntity.badRequest().body("{}"); 
        }
    }

    @GetMapping("/weather")
    @ResponseBody
    public ResponseEntity<String> weather(@RequestParam double lat, @RequestParam double lon) {
        try {
            URI uri = UriComponentsBuilder.fromUriString("https://api.openweathermap.org/data/2.5/weather")
                    .queryParam("lat", lat)
                    .queryParam("lon", lon)
                    .queryParam("appid", WEATHER_API_KEY)
                    .queryParam("units", "metric")
                    .build().toUri();
            
            return rest.exchange(uri, HttpMethod.GET, new HttpEntity<>(new HttpHeaders()), String.class);
        } catch (Exception e) { 
            System.err.println("Weather API Error: " + e.getMessage());
            return ResponseEntity.badRequest().body("{\"error\":\"Weather service unavailable\"}"); 
        }
    }

    @GetMapping("/landmarks")
    @ResponseBody
    public ResponseEntity<String> landmarks(@RequestParam double lat, @RequestParam double lon, 
                                           @RequestParam(defaultValue = "1500") int radius, 
                                           @RequestParam(required = false) String cats) {
        try {
            String filter = "";
            
            if (cats != null && !cats.isEmpty()) {
                String[] requested = cats.split(",");
                StringBuilder unions = new StringBuilder();
                for (String c : requested) {
                    unions.append(mapCategoryToOverpass(c.trim(), radius, lat, lon));
                }
                filter = unions.toString();
            } else {
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

            String query = String.format("[out:json][timeout:25];%sout center;", filter);
            
            URI uri = UriComponentsBuilder.fromUriString("https://overpass-api.de/api/interpreter")
                    .queryParam("data", query)
                    .build()
                    .toUri();

            return rest.exchange(uri, HttpMethod.GET, new HttpEntity<>(new HttpHeaders()), String.class);
        } catch (Exception e) { 
            return ResponseEntity.ok("{\"elements\":[]}"); 
        }
    }

    private String mapCategoryToOverpass(String category, int r, double lat, double lon) {
        String tag = "";
        switch (category.toLowerCase()) {
            case "cafe": 
                tag = "\"amenity\"=\"cafe\""; 
                break;
            case "food": 
            case "restaurant": 
                tag = "\"amenity\"~\"restaurant|fast_food\""; 
                break;
            case "park": 
                tag = "\"leisure\"=\"park\""; 
                break;
            case "bank": 
            case "atm": 
                tag = "\"amenity\"~\"bank|atm\""; 
                break;
            case "hotel": 
                tag = "\"tourism\"=\"hotel\""; 
                break;
            case "hospital": 
                tag = "\"amenity\"~\"hospital|clinic\""; 
                break;
            case "gas": 
                tag = "\"amenity\"=\"fuel\""; 
                break;
            case "government": 
                tag = "\"amenity\"~\"townhall|courthouse\""; 
                break;
            case "police": 
                tag = "\"amenity\"=\"police\""; 
                break;
            case "fire": 
                tag = "\"amenity\"=\"fire_station\""; 
                break;
            case "school": 
                tag = "\"amenity\"~\"school|university|college\""; 
                break;
            default: 
                return ""; 
        }
        return String.format(Locale.US, "nwr[%s](around:%d,%f,%f);", tag, r, lat, lon);
    }

    // OSRM Routing (fallback, no traffic)
    @GetMapping("/route")
    @ResponseBody
    public ResponseEntity<String> route(
            @RequestParam double startLat, @RequestParam double startLng,
            @RequestParam double endLat, @RequestParam double endLng,
            @RequestParam(defaultValue = "driving") String profile,
            @RequestParam(required = false, defaultValue = "false") boolean steps) {

        System.out.println("OSRM ROUTE REQUEST: " + profile);

        String baseUrl = "http://router.project-osrm.org/route/v1/driving/";
        
        if (profile.toLowerCase().contains("walk") || profile.toLowerCase().contains("foot")) {
            baseUrl = "http://routing.openstreetmap.de/routed-foot/route/v1/driving/";
        } else if (profile.toLowerCase().contains("cycl") || profile.toLowerCase().contains("bike")) {
            baseUrl = "http://routing.openstreetmap.de/routed-bike/route/v1/driving/";
        }

        String coords = String.format(Locale.US, "%f,%f;%f,%f", startLng, startLat, endLng, endLat);
        String finalUrl = baseUrl + coords;

        UriComponentsBuilder builder = UriComponentsBuilder.fromUriString(finalUrl)
                .queryParam("overview", "full")
                .queryParam("geometries", "polyline")
                .queryParam("annotations", "true")
                .queryParam("steps", String.valueOf(steps));

        try {
            HttpHeaders headers = new HttpHeaders();
            headers.set("User-Agent", "MapAppProSpring/1.0");
            return rest.exchange(builder.build().toUri(), HttpMethod.GET, new HttpEntity<>(headers), String.class);
        } catch (Exception e) {
            System.err.println("OSRM Routing Error: " + e.getMessage());
            return ResponseEntity.badRequest().body("{\"error\":\"Routing service unavailable\"}");
        }
    }

    // TomTom Routing with Real-Time Traffic
    @GetMapping("/route/tomtom")
    @ResponseBody
    public ResponseEntity<String> routeTomTom(
            @RequestParam double startLat, @RequestParam double startLng,
            @RequestParam double endLat, @RequestParam double endLng,
            @RequestParam(defaultValue = "car") String profile,
            @RequestParam(required = false, defaultValue = "true") boolean traffic,
            @RequestParam(required = false, defaultValue = "false") boolean avoidTolls,
            @RequestParam(required = false, defaultValue = "false") boolean avoidHighways) {

        try {
            String travelMode = "car";
            if (profile.contains("walk")) travelMode = "pedestrian";
            else if (profile.contains("bike")) travelMode = "bicycle";
            else if (profile.contains("motorcycle")) travelMode = "motorcycle";

            String coords = String.format(Locale.US, "%f,%f:%f,%f", startLat, startLng, endLat, endLng);
            
            UriComponentsBuilder builder = UriComponentsBuilder
                    .fromUriString("https://api.tomtom.com/routing/1/calculateRoute/" + coords + "/json")
                    .queryParam("key", TOMTOM_API_KEY)
                    .queryParam("travelMode", travelMode)
                    .queryParam("traffic", traffic)
                    .queryParam("instructionsType", "text")
                    .queryParam("language", "en-US");

            // Route preferences
            List<String> avoid = new ArrayList<>();
            if (avoidTolls) avoid.add("tollRoads");
            if (avoidHighways) avoid.add("motorways");
            if (!avoid.isEmpty()) {
                builder.queryParam("avoid", String.join(",", avoid));
            }

            URI uri = builder.build().toUri();
            return rest.exchange(uri, HttpMethod.GET, new HttpEntity<>(new HttpHeaders()), String.class);
        } catch (Exception e) {
            System.err.println("TomTom Routing Error: " + e.getMessage());
            return ResponseEntity.badRequest().body("{\"error\":\"TomTom routing failed: " + e.getMessage() + "\"}");
        }
    }

    // GraphHopper Routing (Alternative with traffic support)
    @GetMapping("/route/graphhopper")
    @ResponseBody
    public ResponseEntity<String> routeGraphHopper(
            @RequestParam double startLat, @RequestParam double startLng,
            @RequestParam double endLat, @RequestParam double endLng,
            @RequestParam(defaultValue = "car") String profile,
            @RequestParam(required = false, defaultValue = "false") boolean avoidTolls,
            @RequestParam(required = false, defaultValue = "false") boolean avoidHighways) {

        try {
            String vehicle = "car";
            if (profile.contains("walk")) vehicle = "foot";
            else if (profile.contains("bike")) vehicle = "bike";
            else if (profile.contains("motorcycle")) vehicle = "motorcycle";

            UriComponentsBuilder builder = UriComponentsBuilder
                    .fromUriString("https://graphhopper.com/api/1/route")
                    .queryParam("key", GRAPHHOPPER_API_KEY)
                    .queryParam("point", startLat + "," + startLng)
                    .queryParam("point", endLat + "," + endLng)
                    .queryParam("vehicle", vehicle)
                    .queryParam("locale", "en")
                    .queryParam("instructions", "true")
                    .queryParam("calc_points", "true")
                    .queryParam("points_encoded", "true");

            // Route preferences
            List<String> avoid = new ArrayList<>();
            if (avoidTolls) avoid.add("toll");
            if (avoidHighways) avoid.add("motorway");
            if (!avoid.isEmpty()) {
                builder.queryParam("avoid", String.join(",", avoid));
            }

            URI uri = builder.build().toUri();
            return rest.exchange(uri, HttpMethod.GET, new HttpEntity<>(new HttpHeaders()), String.class);
        } catch (Exception e) {
            System.err.println("GraphHopper Routing Error: " + e.getMessage());
            return ResponseEntity.badRequest().body("{\"error\":\"GraphHopper routing failed: " + e.getMessage() + "\"}");
        }
    }

    // TomTom Traffic Flow
    @GetMapping("/traffic/flow")
    @ResponseBody
    public ResponseEntity<String> trafficFlow(
            @RequestParam double lat, @RequestParam double lon,
            @RequestParam(defaultValue = "10") int zoom) {
        try {
            URI uri = UriComponentsBuilder
                    .fromUriString("https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/" + zoom + "/json")
                    .queryParam("key", TOMTOM_API_KEY)
                    .queryParam("point", lat + "," + lon)
                    .build().toUri();

            return rest.exchange(uri, HttpMethod.GET, new HttpEntity<>(new HttpHeaders()), String.class);
        } catch (Exception e) {
            System.err.println("TomTom Traffic Error: " + e.getMessage());
            return ResponseEntity.ok("{\"currentSpeed\":50,\"freeFlowSpeed\":50}");
        }
    }

    // TomTom Traffic Incidents
    @GetMapping("/traffic/incidents")
    @ResponseBody
    public ResponseEntity<String> trafficIncidents(
            @RequestParam double minLat, @RequestParam double minLon,
            @RequestParam double maxLat, @RequestParam double maxLon) {
        try {
            String bbox = String.format(Locale.US, "%f,%f,%f,%f", minLon, minLat, maxLon, maxLat);
            
            URI uri = UriComponentsBuilder
                    .fromUriString("https://api.tomtom.com/traffic/services/5/incidentDetails")
                    .queryParam("key", TOMTOM_API_KEY)
                    .queryParam("bbox", bbox)
                    .queryParam("fields", "{incidents{type,geometry{type,coordinates},properties{iconCategory,magnitudeOfDelay,delay}}}")
                    .queryParam("language", "en-US")
                    .build().toUri();

            return rest.exchange(uri, HttpMethod.GET, new HttpEntity<>(new HttpHeaders()), String.class);
        } catch (Exception e) {
            System.err.println("TomTom Incidents Error: " + e.getMessage());
            return ResponseEntity.ok("{\"incidents\":[]}");
        }
    }
    
    private double calculateDistance(double lat1, double lon1, double lat2, double lon2) {
        final int R = 6371;
        double latDistance = Math.toRadians(lat2 - lat1);
        double lonDistance = Math.toRadians(lon2 - lon1);
        double a = Math.sin(latDistance / 2) * Math.sin(latDistance / 2)
                + Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2))
                * Math.sin(lonDistance / 2) * Math.sin(lonDistance / 2);
        double c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }
}