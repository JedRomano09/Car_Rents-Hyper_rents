-- Password change requests are queued here until an admin approves them.
-- To approve: copy the requested row's password into the matching `user` row.
-- The request stops being pending once both password hashes match.
-- To reject: delete the request row.
CREATE TABLE IF NOT EXISTS password_change_requests (
    id INT(11) NOT NULL AUTO_INCREMENT,
    email VARCHAR(100) NOT NULL,
    username VARCHAR(64) NOT NULL,
    password VARCHAR(200) NOT NULL,
    role ENUM('customer', 'admin') NOT NULL DEFAULT 'customer',
    location VARCHAR(255) NULL DEFAULT NULL,
    valid_id_mime VARCHAR(32) NULL DEFAULT NULL,
    valid_id_image MEDIUMBLOB NULL,
    PRIMARY KEY (id),
    INDEX idx_password_change_requests_username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
