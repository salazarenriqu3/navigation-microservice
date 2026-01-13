package com.mapapppro.controller;

import com.mapapppro.dto.LocationUpdateDTO;
import com.mapapppro.dto.UserCreateDTO;
import com.mapapppro.model.DriverMessage;
import com.mapapppro.model.Landmark;
import com.mapapppro.model.TripLog;
import com.mapapppro.model.User;
import com.mapapppro.repository.DriverMessageRepository;
import com.mapapppro.repository.LandmarkRepository;
import com.mapapppro.repository.TripLogRepository;
import com.mapapppro.repository.UserRepository;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.*;
import org.springframework.ui.Model;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Controller
public class MapController {

    @Autowired private UserRepository userRepository;
    @Autowired private TripLogRepository tripLogRepository;
    @Autowired private DriverMessageRepository messageRepository;
    @Autowired private LandmarkRepository landmarkRepository;
    @Autowired private PasswordEncoder passwordEncoder;

    // --- HELPER METHOD ---
    private User getCurrentUser() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth != null && auth.isAuthenticated() && !auth.getName().equals("anonymousUser")) {
            return userRepository.findByUsername(auth.getName());
        }
        return null;
    }

    // --- PAGES ---

    @GetMapping({"/", "/index"})
    public String index(Model model) {
        User user = getCurrentUser();
        if (user == null) return "redirect:/login";
        
        model.addAttribute("userRole", user.getRole());
        model.addAttribute("userId", user.getId());
        model.addAttribute("userName", user.getUsername());
        
        return "index";
    }

    @GetMapping("/login")
    public String loginPage() { 
        return "login"; 
    }

    // --- DEBUG ENDPOINTS (REMOVE AFTER FIXING) ---
    @GetMapping("/debug/users")
    @ResponseBody
    public String debugUsers() {
        List<User> users = userRepository.findAll();
        StringBuilder sb = new StringBuilder();
        sb.append("Total users in database: ").append(users.size()).append("\n\n");
        
        for (User u : users) {
            sb.append("ID: ").append(u.getId()).append("\n");
            sb.append("Username: [").append(u.getUsername()).append("]\n");
            sb.append("Role: ").append(u.getRole()).append("\n");
            sb.append("Active: ").append(u.isActive()).append("\n");
            sb.append("Password hash: ").append(u.getPassword().substring(0, 30)).append("...\n");
            sb.append("---\n");
        }
        return sb.toString();
    }

    @GetMapping("/debug/reset-password")
    @ResponseBody
    public String resetPassword(@RequestParam String username, @RequestParam String newPassword) {
        User user = userRepository.findByUsername(username);
        if (user == null) {
            return "User not found: " + username;
        }
        
        String hashedPassword = passwordEncoder.encode(newPassword);
        user.setPassword(hashedPassword);
        userRepository.save(user);
        
        return "Password reset successfully!\n" +
               "Username: " + username + "\n" +
               "New password: " + newPassword + "\n" +
               "New hash: " + hashedPassword + "\n\n" +
               "You can now login with these credentials.";
    }

    @GetMapping("/debug/test-password")
    @ResponseBody
    public String testPassword(@RequestParam String username, @RequestParam String password) {
        User user = userRepository.findByUsername(username);
        if (user == null) {
            return "User not found: " + username;
        }
        
        boolean matches = passwordEncoder.matches(password, user.getPassword());
        return "User: " + username + "\n" +
               "Role: " + user.getRole() + "\n" +
               "Active: " + user.isActive() + "\n" +
               "Password matches: " + matches;
    }

    // REMOVED: Custom @PostMapping("/login") - Now handled by Spring Security

    // --- ADMIN USER MANAGEMENT APIS ---

    @PostMapping("/api/admin/users/create")
    @ResponseBody
    @PreAuthorize("hasRole('DISPATCHER')")
    public ResponseEntity<?> createUser(@Valid @RequestBody UserCreateDTO dto) {
        if (userRepository.findByUsername(dto.getUsername()) != null) {
            return ResponseEntity.badRequest().body(Map.of("error", "Username already exists"));
        }

        User newUser = new User();
        newUser.setUsername(dto.getUsername());
        newUser.setPassword(passwordEncoder.encode(dto.getPassword()));
        newUser.setRole(dto.getRole());
        newUser.setFullName(dto.getFullName());
        newUser.setLicenseNo(dto.getLicenseNo());
        newUser.setPlateNo(dto.getPlateNo());
        newUser.setPhone(dto.getPhone());
        newUser.setShiftSchedule(dto.getShiftSchedule());
        newUser.setActive(true);

        userRepository.save(newUser);
        return ResponseEntity.status(HttpStatus.CREATED).body(newUser);
    }

    @PutMapping("/api/admin/users/{id}")
    @ResponseBody
    @PreAuthorize("hasRole('DISPATCHER')")
    public ResponseEntity<?> updateUser(@PathVariable Long id, @RequestBody Map<String, Object> payload) {
        User user = userRepository.findById(id).orElse(null);
        if (user == null) {
            return ResponseEntity.notFound().build();
        }

        if (payload.containsKey("password")) {
            String password = (String) payload.get("password");
            if (password == null || password.trim().isEmpty() || password.length() < 6) {
                return ResponseEntity.badRequest().body(Map.of("error", "Password must be at least 6 characters"));
            }
            user.setPassword(passwordEncoder.encode(password));
        }
        if (payload.containsKey("fullName")) {
            user.setFullName((String) payload.get("fullName"));
        }
        if (payload.containsKey("licenseNo")) {
            user.setLicenseNo((String) payload.get("licenseNo"));
        }
        if (payload.containsKey("plateNo")) {
            user.setPlateNo((String) payload.get("plateNo"));
        }
        if (payload.containsKey("phone")) {
            user.setPhone((String) payload.get("phone"));
        }
        if (payload.containsKey("shiftSchedule")) {
            user.setShiftSchedule((String) payload.get("shiftSchedule"));
        }

        userRepository.save(user);
        return ResponseEntity.ok(user);
    }

    @DeleteMapping("/api/admin/users/{id}")
    @ResponseBody
    @PreAuthorize("hasRole('DISPATCHER')")
    public ResponseEntity<?> deactivateUser(@PathVariable Long id) {
        User user = userRepository.findById(id).orElse(null);
        if (user == null) {
            return ResponseEntity.notFound().build();
        }

        user.setActive(false);
        userRepository.save(user);
        return ResponseEntity.ok(Map.of("message", "User deactivated"));
    }

    @GetMapping("/api/admin/users")
    @ResponseBody
    @PreAuthorize("hasRole('DISPATCHER')")
    public ResponseEntity<?> listUsers() {
        return ResponseEntity.ok(userRepository.findAll());
    }

    // --- FLEET TRACKING APIS ---

    @PostMapping("/api/driver/update")
    @ResponseBody
    @PreAuthorize("hasRole('DRIVER')")
    public ResponseEntity<?> updateLocation(@Valid @RequestBody LocationUpdateDTO dto) {
        User user = getCurrentUser();
        if (user == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();

        tripLogRepository.save(new TripLog(user.getId(), dto.getLatitude(), dto.getLongitude(), dto.getStatus()));
        return ResponseEntity.ok(Map.of("message", "Location saved"));
    }

    @GetMapping("/api/fleet/status")
    @ResponseBody
    @PreAuthorize("hasRole('DISPATCHER')")
    public ResponseEntity<?> getFleetStatus() {
        List<TripLog> logs = tripLogRepository.findLatestLocations();
        
        List<Map<String, Object>> enrichedData = logs.stream().map(log -> {
            Map<String, Object> data = new HashMap<>();
            data.put("driverId", log.getDriverId());
            data.put("latitude", log.getLatitude());
            data.put("longitude", log.getLongitude());
            data.put("status", log.getStatus());
            data.put("timestamp", log.getTimestamp());
            
            // Add driver details
            User driver = userRepository.findById(log.getDriverId()).orElse(null);
            if (driver != null) {
                data.put("username", driver.getUsername());
                data.put("fullName", driver.getFullName());
                data.put("plateNo", driver.getPlateNo());
            }
            
            return data;
        }).toList();
        
        return ResponseEntity.ok(enrichedData);
    }

    // --- MESSAGING SYSTEM ---

    @PostMapping("/api/admin/send-message")
    @ResponseBody
    @PreAuthorize("hasRole('DISPATCHER')")
    public ResponseEntity<?> sendMessage(@RequestParam Long driverId, @RequestParam String message) {
        if (message == null || message.trim().isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of("error", "Message cannot be empty"));
        }
        if (!userRepository.existsById(driverId)) {
            return ResponseEntity.badRequest().body(Map.of("error", "Driver not found"));
        }

        messageRepository.save(new DriverMessage(driverId, message));
        return ResponseEntity.ok(Map.of("message", "Message sent"));
    }

    @GetMapping("/api/driver/messages")
    @ResponseBody
    @PreAuthorize("hasRole('DRIVER')")
    public ResponseEntity<?> checkMessages() {
        User user = getCurrentUser();
        if (user == null) return ResponseEntity.ok(List.of());
        
        List<DriverMessage> msgs = messageRepository.findByDriverIdAndIsReadFalse(user.getId());
        
        // Mark all as read
        for (DriverMessage m : msgs) {
            m.setRead(true);
            messageRepository.save(m);
        }
        return ResponseEntity.ok(msgs);
    }

    // --- LANDMARKS API ---

    @GetMapping("/api/landmarks")
    @ResponseBody
    public ResponseEntity<?> getLandmarks() {
        return ResponseEntity.ok(landmarkRepository.findAll());
    }

    @PostMapping("/api/admin/landmarks")
    @ResponseBody
    @PreAuthorize("hasRole('DISPATCHER')")
    public ResponseEntity<?> createLandmark(@Valid @RequestBody Landmark landmark) {
        if (landmark.getLatitude() == null || landmark.getLongitude() == null || landmark.getName() == null) {
            return ResponseEntity.badRequest().body(Map.of("error", "Missing required fields"));
        }

        landmarkRepository.save(landmark);
        return ResponseEntity.status(HttpStatus.CREATED).body(landmark);
    }
}