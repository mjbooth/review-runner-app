-- Migration: Add PII Encryption Support
-- Adds encrypted columns and search hash indexes for customer PII data
-- Maintains backward compatibility during transition period

-- Add encrypted PII columns to customers table
ALTER TABLE customers 
ADD COLUMN first_name_encrypted TEXT,
ADD COLUMN last_name_encrypted TEXT,
ADD COLUMN email_encrypted TEXT,
ADD COLUMN phone_encrypted TEXT;

-- Add search hash columns for encrypted field lookups
ALTER TABLE customers 
ADD COLUMN email_search_hash VARCHAR(64),
ADD COLUMN phone_search_hash VARCHAR(64),
ADD COLUMN first_name_search_hash VARCHAR(64),
ADD COLUMN last_name_search_hash VARCHAR(64),
ADD COLUMN full_name_search_hash VARCHAR(64);

-- Add encryption metadata columns
ALTER TABLE customers 
ADD COLUMN encryption_version INTEGER DEFAULT 1,
ADD COLUMN encrypted_at TIMESTAMP;

-- Create indexes for fast encrypted field lookups
CREATE INDEX CONCURRENTLY idx_customers_email_search_hash ON customers (email_search_hash) WHERE email_search_hash IS NOT NULL;
CREATE INDEX CONCURRENTLY idx_customers_phone_search_hash ON customers (phone_search_hash) WHERE phone_search_hash IS NOT NULL;
CREATE INDEX CONCURRENTLY idx_customers_first_name_search_hash ON customers (first_name_search_hash) WHERE first_name_search_hash IS NOT NULL;
CREATE INDEX CONCURRENTLY idx_customers_last_name_search_hash ON customers (last_name_search_hash) WHERE last_name_search_hash IS NOT NULL;
CREATE INDEX CONCURRENTLY idx_customers_full_name_search_hash ON customers (full_name_search_hash) WHERE full_name_search_hash IS NOT NULL;

-- Create composite indexes for business-scoped searches
CREATE INDEX CONCURRENTLY idx_customers_business_email_hash ON customers (business_id, email_search_hash) WHERE email_search_hash IS NOT NULL;
CREATE INDEX CONCURRENTLY idx_customers_business_phone_hash ON customers (business_id, phone_search_hash) WHERE phone_search_hash IS NOT NULL;

-- Create index for encryption version (for key rotation queries)
CREATE INDEX CONCURRENTLY idx_customers_encryption_version ON customers (encryption_version) WHERE encryption_version IS NOT NULL;

-- Add search hash column to suppressions for encrypted contact matching
ALTER TABLE suppressions 
ADD COLUMN contact_search_hash VARCHAR(64);

-- Create index for suppression contact hash lookups
CREATE INDEX CONCURRENTLY idx_suppressions_contact_search_hash ON suppressions (contact_search_hash) WHERE contact_search_hash IS NOT NULL;

-- Add unique constraint for encrypted contact suppressions
ALTER TABLE suppressions 
ADD CONSTRAINT uq_suppressions_business_contact_hash_channel 
UNIQUE (business_id, contact_search_hash, channel);

-- Add new encryption-related event types to enum
ALTER TYPE "EventType" ADD VALUE 'PII_ENCRYPTED';
ALTER TYPE "EventType" ADD VALUE 'PII_DECRYPTED';
ALTER TYPE "EventType" ADD VALUE 'KEY_ROTATED';
ALTER TYPE "EventType" ADD VALUE 'ENCRYPTION_MIGRATED';

-- Create encryption key version tracking table
CREATE TABLE encryption_key_versions (
    id SERIAL PRIMARY KEY,
    version INTEGER UNIQUE NOT NULL,
    algorithm VARCHAR(50) NOT NULL DEFAULT 'aes-256-gcm',
    key_derivation_alg VARCHAR(50) NOT NULL DEFAULT 'pbkdf2',
    iterations INTEGER NOT NULL DEFAULT 100000,
    is_active BOOLEAN NOT NULL DEFAULT false,
    rotated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    deactivated_at TIMESTAMP,
    rotated_by VARCHAR(255),
    reason TEXT,
    affected_records INTEGER DEFAULT 0
);

-- Create indexes for key version tracking
CREATE INDEX idx_encryption_key_versions_version ON encryption_key_versions (version);
CREATE INDEX idx_encryption_key_versions_active ON encryption_key_versions (is_active);
CREATE INDEX idx_encryption_key_versions_rotated_at ON encryption_key_versions (rotated_at);

-- Insert initial key version
INSERT INTO encryption_key_versions (version, is_active, rotated_by, reason) 
VALUES (1, true, 'system', 'Initial encryption deployment');

-- Create encryption migration tracking table
CREATE TABLE encryption_migrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    table_name VARCHAR(100) NOT NULL,
    field_name VARCHAR(100) NOT NULL,
    business_id UUID,
    total_records INTEGER NOT NULL,
    migrated_records INTEGER NOT NULL DEFAULT 0,
    failed_records INTEGER NOT NULL DEFAULT 0,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    started_at TIMESTAMP NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMP,
    last_error TEXT,
    metadata JSONB
);

-- Create indexes for migration tracking
CREATE INDEX idx_encryption_migrations_table_field ON encryption_migrations (table_name, field_name);
CREATE INDEX idx_encryption_migrations_status ON encryption_migrations (status);
CREATE INDEX idx_encryption_migrations_started_at ON encryption_migrations (started_at);

-- Add unique constraint for migration tracking
ALTER TABLE encryption_migrations 
ADD CONSTRAINT uq_encryption_migrations_table_field_business 
UNIQUE (table_name, field_name, business_id);

-- Create function to validate encrypted field JSON structure
CREATE OR REPLACE FUNCTION validate_encrypted_field(field_data TEXT) 
RETURNS BOOLEAN AS $$
DECLARE
    field_json JSONB;
BEGIN
    -- Check if it's valid JSON
    BEGIN
        field_json := field_data::JSONB;
    EXCEPTION WHEN OTHERS THEN
        RETURN FALSE;
    END;
    
    -- Check required fields
    IF NOT (
        field_json ? 'encryptedData' AND
        field_json ? 'iv' AND
        field_json ? 'tag' AND
        field_json ? 'salt' AND
        field_json ? 'keyVersion' AND
        field_json ? 'encryptedAt' AND
        field_json ? 'searchHash'
    ) THEN
        RETURN FALSE;
    END IF;
    
    -- Validate key version is a number
    IF NOT (field_json->>'keyVersion' ~ '^[0-9]+$') THEN
        RETURN FALSE;
    END IF;
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Add check constraints to ensure encrypted fields are valid JSON
ALTER TABLE customers 
ADD CONSTRAINT chk_first_name_encrypted_valid 
CHECK (first_name_encrypted IS NULL OR validate_encrypted_field(first_name_encrypted));

ALTER TABLE customers 
ADD CONSTRAINT chk_last_name_encrypted_valid 
CHECK (last_name_encrypted IS NULL OR validate_encrypted_field(last_name_encrypted));

ALTER TABLE customers 
ADD CONSTRAINT chk_email_encrypted_valid 
CHECK (email_encrypted IS NULL OR validate_encrypted_field(email_encrypted));

ALTER TABLE customers 
ADD CONSTRAINT chk_phone_encrypted_valid 
CHECK (phone_encrypted IS NULL OR validate_encrypted_field(phone_encrypted));

-- Add constraint to ensure search hashes are properly formatted (hex string)
ALTER TABLE customers 
ADD CONSTRAINT chk_search_hash_format 
CHECK (
    (email_search_hash IS NULL OR email_search_hash ~ '^[a-f0-9]{64}$') AND
    (phone_search_hash IS NULL OR phone_search_hash ~ '^[a-f0-9]{64}$') AND
    (first_name_search_hash IS NULL OR first_name_search_hash ~ '^[a-f0-9]{64}$') AND
    (last_name_search_hash IS NULL OR last_name_search_hash ~ '^[a-f0-9]{64}$') AND
    (full_name_search_hash IS NULL OR full_name_search_hash ~ '^[a-f0-9]{64}$')
);

-- Add constraint to ensure suppression search hash is properly formatted
ALTER TABLE suppressions 
ADD CONSTRAINT chk_suppression_search_hash_format 
CHECK (contact_search_hash IS NULL OR contact_search_hash ~ '^[a-f0-9]{64}$');

-- Create function to check encryption consistency
CREATE OR REPLACE FUNCTION check_encryption_consistency() 
RETURNS TABLE(
    customer_id UUID,
    field_name TEXT,
    has_encrypted_data BOOLEAN,
    has_search_hash BOOLEAN,
    issue_description TEXT
) AS $$
BEGIN
    -- Check email field consistency
    RETURN QUERY
    SELECT 
        c.id,
        'email'::TEXT,
        (c.email_encrypted IS NOT NULL),
        (c.email_search_hash IS NOT NULL),
        CASE 
            WHEN c.email_encrypted IS NOT NULL AND c.email_search_hash IS NULL THEN 'Missing search hash for encrypted email'
            WHEN c.email_encrypted IS NULL AND c.email_search_hash IS NOT NULL THEN 'Search hash without encrypted data for email'
            ELSE NULL
        END
    FROM customers c
    WHERE (c.email_encrypted IS NULL) != (c.email_search_hash IS NULL);
    
    -- Check phone field consistency
    RETURN QUERY
    SELECT 
        c.id,
        'phone'::TEXT,
        (c.phone_encrypted IS NOT NULL),
        (c.phone_search_hash IS NOT NULL),
        CASE 
            WHEN c.phone_encrypted IS NOT NULL AND c.phone_search_hash IS NULL THEN 'Missing search hash for encrypted phone'
            WHEN c.phone_encrypted IS NULL AND c.phone_search_hash IS NOT NULL THEN 'Search hash without encrypted data for phone'
            ELSE NULL
        END
    FROM customers c
    WHERE (c.phone_encrypted IS NULL) != (c.phone_search_hash IS NULL);
    
    -- Check first name field consistency
    RETURN QUERY
    SELECT 
        c.id,
        'firstName'::TEXT,
        (c.first_name_encrypted IS NOT NULL),
        (c.first_name_search_hash IS NOT NULL),
        CASE 
            WHEN c.first_name_encrypted IS NOT NULL AND c.first_name_search_hash IS NULL THEN 'Missing search hash for encrypted first name'
            WHEN c.first_name_encrypted IS NULL AND c.first_name_search_hash IS NOT NULL THEN 'Search hash without encrypted data for first name'
            ELSE NULL
        END
    FROM customers c
    WHERE (c.first_name_encrypted IS NULL) != (c.first_name_search_hash IS NULL);
    
    -- Check last name field consistency
    RETURN QUERY
    SELECT 
        c.id,
        'lastName'::TEXT,
        (c.last_name_encrypted IS NOT NULL),
        (c.last_name_search_hash IS NOT NULL),
        CASE 
            WHEN c.last_name_encrypted IS NOT NULL AND c.last_name_search_hash IS NULL THEN 'Missing search hash for encrypted last name'
            WHEN c.last_name_encrypted IS NULL AND c.last_name_search_hash IS NOT NULL THEN 'Search hash without encrypted data for last name'
            ELSE NULL
        END
    FROM customers c
    WHERE (c.last_name_encrypted IS NULL) != (c.last_name_search_hash IS NULL);
END;
$$ LANGUAGE plpgsql;

-- Create view for encrypted customer data statistics
CREATE OR REPLACE VIEW encryption_statistics AS
SELECT 
    'customers' as table_name,
    COUNT(*) as total_records,
    COUNT(first_name_encrypted) as first_name_encrypted_count,
    COUNT(last_name_encrypted) as last_name_encrypted_count,
    COUNT(email_encrypted) as email_encrypted_count,
    COUNT(phone_encrypted) as phone_encrypted_count,
    COUNT(encryption_version) as records_with_encryption_version,
    AVG(encryption_version) as avg_encryption_version,
    MIN(encrypted_at) as first_encrypted_at,
    MAX(encrypted_at) as last_encrypted_at
FROM customers;

-- Create function to safely migrate a customer's PII to encrypted format
-- This will be used by the application layer during migration
CREATE OR REPLACE FUNCTION prepare_customer_for_encryption(customer_uuid UUID)
RETURNS JSONB AS $$
DECLARE
    customer_record RECORD;
    result JSONB;
BEGIN
    -- Get current customer data
    SELECT * INTO customer_record FROM customers WHERE id = customer_uuid;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object('error', 'Customer not found');
    END IF;
    
    -- Check if already encrypted
    IF customer_record.encryption_version IS NOT NULL THEN
        RETURN jsonb_build_object('error', 'Customer already encrypted');
    END IF;
    
    -- Prepare data for encryption
    result := jsonb_build_object(
        'customerId', customer_record.id,
        'businessId', customer_record.business_id,
        'pii', jsonb_build_object(
            'firstName', customer_record.first_name,
            'lastName', customer_record.last_name,
            'email', customer_record.email,
            'phone', customer_record.phone
        ),
        'metadata', jsonb_build_object(
            'createdAt', customer_record.created_at,
            'updatedAt', customer_record.updated_at
        )
    );
    
    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Grant necessary permissions
GRANT SELECT, UPDATE ON customers TO application_role;
GRANT SELECT, INSERT, UPDATE ON encryption_key_versions TO application_role;
GRANT SELECT, INSERT, UPDATE ON encryption_migrations TO application_role;
GRANT SELECT ON encryption_statistics TO application_role;
GRANT EXECUTE ON FUNCTION validate_encrypted_field TO application_role;
GRANT EXECUTE ON FUNCTION check_encryption_consistency TO application_role;
GRANT EXECUTE ON FUNCTION prepare_customer_for_encryption TO application_role;

-- Add comments for documentation
COMMENT ON COLUMN customers.first_name_encrypted IS 'JSON string containing encrypted first name data with search hash';
COMMENT ON COLUMN customers.last_name_encrypted IS 'JSON string containing encrypted last name data with search hash';
COMMENT ON COLUMN customers.email_encrypted IS 'JSON string containing encrypted email data with search hash';
COMMENT ON COLUMN customers.phone_encrypted IS 'JSON string containing encrypted phone data with search hash';
COMMENT ON COLUMN customers.email_search_hash IS 'SHA-256 hash of email for exact matching without decryption';
COMMENT ON COLUMN customers.phone_search_hash IS 'SHA-256 hash of normalized phone for exact matching without decryption';
COMMENT ON COLUMN customers.first_name_search_hash IS 'SHA-256 hash of first name for exact matching without decryption';
COMMENT ON COLUMN customers.last_name_search_hash IS 'SHA-256 hash of last name for exact matching without decryption';
COMMENT ON COLUMN customers.full_name_search_hash IS 'SHA-256 hash of combined first and last name for full name searches';
COMMENT ON COLUMN customers.encryption_version IS 'Version of encryption key used for this customer record';
COMMENT ON COLUMN customers.encrypted_at IS 'Timestamp when PII was encrypted';

COMMENT ON TABLE encryption_key_versions IS 'Tracks encryption key versions for key rotation management';
COMMENT ON TABLE encryption_migrations IS 'Tracks progress of PII encryption migration per business/field';
COMMENT ON FUNCTION validate_encrypted_field IS 'Validates JSON structure of encrypted field data';
COMMENT ON FUNCTION check_encryption_consistency IS 'Checks consistency between encrypted fields and search hashes';
COMMENT ON FUNCTION prepare_customer_for_encryption IS 'Prepares customer record for PII encryption migration';
COMMENT ON VIEW encryption_statistics IS 'Provides statistics on encryption adoption across customer records';