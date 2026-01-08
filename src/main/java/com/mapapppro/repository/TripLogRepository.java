package com.mapapppro.repository;

import com.mapapppro.model.TripLog;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import java.util.List;

public interface TripLogRepository extends JpaRepository<TripLog, Long> {
    
    // Custom query to get the LATEST location of every driver
    // This is the magic query for the "Live Map"
    @Query("SELECT t FROM TripLog t WHERE t.id IN (SELECT MAX(t2.id) FROM TripLog t2 GROUP BY t2.driverId)")
    List<TripLog> findLatestLocations();
}