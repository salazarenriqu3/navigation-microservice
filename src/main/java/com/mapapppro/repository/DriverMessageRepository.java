package com.mapapppro.repository;

import com.mapapppro.model.DriverMessage;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface DriverMessageRepository extends JpaRepository<DriverMessage, Long> {
    List<DriverMessage> findByDriverIdAndIsReadFalse(Long driverId);
}