ALTER TABLE `user`
    ADD COLUMN username VARCHAR(64) NULL AFTER email;

UPDATE `user`
SET username = SUBSTRING_INDEX(email, '@', 1)
WHERE username IS NULL OR username = '';

ALTER TABLE `user`
    MODIFY COLUMN username VARCHAR(64) NOT NULL;

CREATE UNIQUE INDEX uq_user_username ON `user` (username);
