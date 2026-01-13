package com.mapapppro.dto;

import jakarta.validation.constraints.*;

public class LocationUpdateDTO {
    
    @NotNull(message = "Latitude is required")
    @DecimalMin(value = "-90.0", message = "Latitude must be between -90 and 90")
    @DecimalMax(value = "90.0", message = "Latitude must be between -90 and 90")
    private Double lat;
    
    @NotNull(message = "Longitude is required")
    @DecimalMin(value = "-180.0", message = "Longitude must be between -180 and 180")
    @DecimalMax(value = "180.0", message = "Longitude must be between -180 and 180")
    private Double lng;
    
    @Pattern(regexp = "^(MOVING|IDLE|STOPPED)$", message = "Status must be MOVING, IDLE, or STOPPED")
    private String status = "MOVING";
    
    // Default constructor
    public LocationUpdateDTO() {}
    
    // Getters and Setters
    public Double getLat() { return lat; }
    public void setLat(Double lat) { this.lat = lat; }
    
    public Double getLatitude() { return lat; }
    public void setLatitude(Double latitude) { this.lat = latitude; }
    
    public Double getLng() { return lng; }
    public void setLng(Double lng) { this.lng = lng; }
    
    public Double getLongitude() { return lng; }
    public void setLongitude(Double longitude) { this.lng = longitude; }
    
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
}
