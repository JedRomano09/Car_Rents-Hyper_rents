ALTER TABLE `user`
    MODIFY COLUMN role ENUM('customer', 'admin') NOT NULL DEFAULT 'customer';
