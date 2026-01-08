package com.mapapppro.model;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "trip_logs")
public class TripLog {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private Long driverId;
    private Double latitude;
    private Double longitude;
    private String status; // "MOVING", "STOPPED", "SOS"
    private LocalDateTime timestamp;

    // Constructors
    public TripLog() {}
    
    public TripLog(Long driverId, Double latitude, Double longitude, String status) {
        this.driverId = driverId;
        this.latitude = latitude;
        this.longitude = longitude;
        this.status = status;
        this.timestamp = LocalDateTime.now();
    }

    // Getters
    public Long getDriverId() { return driverId; }
    public Double getLatitude() { return latitude; }
    public Double getLongitude() { return longitude; }
    public String getStatus() { return status; }
    public LocalDateTime getTimestamp() { return timestamp; }
}