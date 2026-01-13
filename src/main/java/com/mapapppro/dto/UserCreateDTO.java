package com.mapapppro.dto;

import jakarta.validation.constraints.*;

public class UserCreateDTO {

    @NotBlank(message = "Username is required")
    @Size(min = 3, max = 50, message = "Username must be between 3 and 50 characters")
    @Pattern(regexp = "^[a-zA-Z0-9_-]+$", message = "Username can only contain letters, numbers, underscores, and hyphens")
    private String username;

    @NotBlank(message = "Password is required")
    @Size(min = 6, message = "Password must be at least 6 characters")
    private String password;

    @NotBlank(message = "Role is required")
    @Pattern(regexp = "^(DRIVER|DISPATCHER)$", message = "Role must be DRIVER or DISPATCHER")
    private String role;

    @NotBlank(message = "Full name is required")
    @Size(min = 2, max = 100, message = "Full name must be between 2 and 100 characters")
    private String fullName;

    // FIXED: Allow hyphens and mixed case
    @Pattern(regexp = "^[A-Za-z0-9-]{6,20}$|^$", message = "License number must be 6-20 alphanumeric characters (hyphens allowed)")
    private String licenseNo;

    // FIXED: Allow mixed case
    @Pattern(regexp = "^[A-Za-z0-9]{4,10}$|^$", message = "Plate number must be 4-10 alphanumeric characters")
    private String plateNo;

    // FIXED: Escape the hyphen or put it at the end
    @Pattern(regexp = "^[0-9+()\\s-]{8,20}$|^$", message = "Phone must be 8-20 digits")
    private String phone;

    // FIXED: Allow "AM Shift" and "PM Shift"
    @Pattern(regexp = "^(AM|PM)(\\s+Shift)?$|^$", message = "Shift schedule must be AM or PM")
    private String shiftSchedule;

    // Getters and Setters
    public String getUsername() { return username; }
    public void setUsername(String username) { this.username = username; }

    public String getPassword() { return password; }
    public void setPassword(String password) { this.password = password; }

    public String getRole() { return role; }
    public void setRole(String role) { this.role = role; }

    public String getFullName() { return fullName; }
    public void setFullName(String fullName) { this.fullName = fullName; }

    public String getLicenseNo() { return licenseNo; }
    public void setLicenseNo(String licenseNo) { this.licenseNo = licenseNo; }

    public String getPlateNo() { return plateNo; }
    public void setPlateNo(String plateNo) { this.plateNo = plateNo; }

    public String getPhone() { return phone; }
    public void setPhone(String phone) { this.phone = phone; }

    public String getShiftSchedule() { return shiftSchedule; }
    public void setShiftSchedule(String shiftSchedule) { this.shiftSchedule = shiftSchedule; }
}