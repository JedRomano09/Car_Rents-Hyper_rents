ALTER TABLE `user`
    ADD COLUMN location VARCHAR(255) NULL AFTER role,
    ADD COLUMN valid_id_mime VARCHAR(32) NULL AFTER location,
    ADD COLUMN valid_id_image MEDIUMBLOB NULL AFTER valid_id_mime;
