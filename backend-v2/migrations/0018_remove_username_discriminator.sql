-- Save current public usernames (base.N) into the username column.
UPDATE auth.users
SET username = username || '.' || username_discriminator::text;

-- Increase username length to fit existing base.N values.
ALTER TABLE auth.users
    ALTER COLUMN username TYPE VARCHAR(64);

-- Enforce unique lowercase username at the database level.
CREATE UNIQUE INDEX auth_users_username_lower_key
    ON auth.users (lower(username));

-- Drop the discriminator machinery.
ALTER TABLE auth.users
    DROP CONSTRAINT auth_users_username_discriminator_key;

ALTER TABLE auth.users
    DROP COLUMN username_discriminator;
