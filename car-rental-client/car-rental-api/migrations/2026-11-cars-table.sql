ALTER TABLE cars
    DROP COLUMN owner_id,
    MODIFY COLUMN car_model VARCHAR(100) NULL,
    ADD COLUMN year YEAR NULL AFTER car_model,
    ADD COLUMN location VARCHAR(100) NULL AFTER year,
    ADD COLUMN engine VARCHAR(100) NULL AFTER location,
    MODIFY COLUMN plate_number VARCHAR(50) NULL,
    MODIFY COLUMN seating_capacity INT(11) NULL,
    MODIFY COLUMN daily_rate DECIMAL(10,2) NULL,
    MODIFY COLUMN status ENUM('Available', 'Rented', 'Maintenance') NOT NULL DEFAULT 'Available';
