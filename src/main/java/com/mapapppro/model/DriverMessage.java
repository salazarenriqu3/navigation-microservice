package com.mapapppro.model;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "driver_messages")
public class DriverMessage {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    
    private Long driverId;
    private String message;
    private boolean isRead = false;
    private LocalDateTime timestamp;

    public DriverMessage() {
        this.timestamp = LocalDateTime.now();
    }
    
    public DriverMessage(Long driverId, String message) {
        this.driverId = driverId;
        this.message = message;
        this.timestamp = LocalDateTime.now();
    }

    public Long getId() { return id; }
    public Long getDriverId() { return driverId; }
    public String getMessage() { return message; }
    public boolean isRead() { return isRead; }
    public void setRead(boolean read) { isRead = read; }
    public LocalDateTime getTimestamp() { return timestamp; }
}