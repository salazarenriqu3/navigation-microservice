package com.mapapppro.controller;

import com.mapapppro.model.DriverMessage;
import com.mapapppro.model.TripLog;
import com.mapapppro.model.User;
import com.mapapppro.repository.DriverMessageRepository;
import com.mapapppro.repository.TripLogRepository;
import com.mapapppro.repository.UserRepository;
import jakarta.servlet.http.HttpSession;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.RestTemplate;

import java.util.List;
import java.util.Map;

@Controller
public class MapController {

    @Autowired private UserRepository userRepository;
    @Autowired private TripLogRepository tripLogRepository;
    @Autowired private DriverMessageRepository messageRepository;
    @Autowired private PasswordEncoder passwordEncoder;

    // --- PAGES ---

    @GetMapping({"/", "/index"})
    public String index(HttpSession session) {
        if (session.getAttribute("user") == null) return "redirect:/login";
        return "index";
    }

    @GetMapping("/login")
    public String loginPage() { return "login"; }

    // --- SECURE AUTHENTICATION ---

    @PostMapping("/login")
    public String doLogin(@RequestParam String username, @RequestParam String password, 
                          @RequestParam(required=false) String role, HttpSession session) {
        User user = userRepository.findByUsername(username);

        // 1. REGISTER (If not found)
        if (user == null) {
            user = new User();
            user.setUsername(username);
            user.setRole(role);
            user.setPassword(passwordEncoder.encode(password)); // HASH IT
            userRepository.save(user);
        } 
        // 2. LOGIN (Check Hash)
        else {
            if (!passwordEncoder.matches(password, user.getPassword())) {
                return "redirect:/login?error=bad_creds";
            }
        }

        session.setAttribute("user", user);
        return "redirect:/";
    }

    @PostMapping("/logout")
    public String logout(HttpSession session) {
        session.invalidate();
        return "redirect:/login";
    }

    // --- FLEET TRACKING APIS ---

    @PostMapping("/api/driver/update")
    @ResponseBody
    public ResponseEntity<?> updateLocation(@RequestBody Map<String, Object> payload, HttpSession session) {
        User user = (User) session.getAttribute("user");
        // For simulation/ghosts, we might skip the user check or mock it.
        // But for real app: if (user == null) return ResponseEntity.status(403).build();

        Long driverId = user != null ? user.getId() : 999L; // Fallback for ghosts
        Double lat = Double.valueOf(payload.get("lat").toString());
        Double lng = Double.valueOf(payload.get("lng").toString());
        String status = (String) payload.getOrDefault("status", "MOVING");

        tripLogRepository.save(new TripLog(driverId, lat, lng, status));
        return ResponseEntity.ok("Saved");
    }

    @GetMapping("/api/fleet/status")
    @ResponseBody
    public ResponseEntity<?> getFleetStatus() {
        return ResponseEntity.ok(tripLogRepository.findLatestLocations());
    }

    // --- MESSAGING SYSTEM ---

    // Admin sends message
    @PostMapping("/api/admin/send-message")
    @ResponseBody
    public ResponseEntity<?> sendMessage(@RequestParam Long driverId, @RequestParam String message) {
        messageRepository.save(new DriverMessage(driverId, message));
        return ResponseEntity.ok("Sent");
    }

    // Driver checks messages
    @GetMapping("/api/driver/messages")
    @ResponseBody
    public ResponseEntity<?> checkMessages(HttpSession session) {
        User user = (User) session.getAttribute("user");
        if (user == null) return ResponseEntity.ok(List.of());
        
        List<DriverMessage> msgs = messageRepository.findByDriverIdAndIsReadFalse(user.getId());
        
        // Mark as read
        for (DriverMessage m : msgs) {
            m.setRead(true);
            messageRepository.save(m);
        }
        return ResponseEntity.ok(msgs);
    }
}