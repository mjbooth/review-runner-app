-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ==========================================
-- BUSINESS CONTEXT MANAGEMENT FUNCTIONS
-- ==========================================

-- Function to set current business context in session
CREATE OR REPLACE FUNCTION set_current_business_id(business_id UUID)
RETURNS VOID AS $$
BEGIN
    -- Set the session variable for business context
    PERFORM set_config('app.current_business_id', business_id::text, false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get current business context from session
CREATE OR REPLACE FUNCTION get_current_business_id()
RETURNS UUID AS $$
BEGIN
    -- Return the current business ID from session variable
    -- Returns NULL if not set
    RETURN COALESCE(
        NULLIF(current_setting('app.current_business_id', true), '')::UUID,
        NULL
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if current user has access to a business
CREATE OR REPLACE FUNCTION user_has_business_access(business_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    -- Check if the requested business_id matches the current session business_id
    RETURN get_current_business_id() = business_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ==========================================
-- ENABLE ROW LEVEL SECURITY ON TABLES
-- ==========================================

-- Enable RLS on multi-tenant tables
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE review_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppressions ENABLE ROW LEVEL SECURITY;

-- Note: businesses table doesn't need RLS as it's accessed directly by business owner

-- ==========================================
-- RLS POLICIES FOR CUSTOMERS TABLE
-- ==========================================

-- Policy for SELECT operations on customers
CREATE POLICY customers_select_policy ON customers
    FOR SELECT
    USING (user_has_business_access(business_id));

-- Policy for INSERT operations on customers
CREATE POLICY customers_insert_policy ON customers
    FOR INSERT
    WITH CHECK (user_has_business_access(business_id));

-- Policy for UPDATE operations on customers
CREATE POLICY customers_update_policy ON customers
    FOR UPDATE
    USING (user_has_business_access(business_id))
    WITH CHECK (user_has_business_access(business_id));

-- Policy for DELETE operations on customers
CREATE POLICY customers_delete_policy ON customers
    FOR DELETE
    USING (user_has_business_access(business_id));

-- ==========================================
-- RLS POLICIES FOR REVIEW_REQUESTS TABLE
-- ==========================================

-- Policy for SELECT operations on review_requests
CREATE POLICY review_requests_select_policy ON review_requests
    FOR SELECT
    USING (user_has_business_access(business_id));

-- Policy for INSERT operations on review_requests
CREATE POLICY review_requests_insert_policy ON review_requests
    FOR INSERT
    WITH CHECK (user_has_business_access(business_id));

-- Policy for UPDATE operations on review_requests
CREATE POLICY review_requests_update_policy ON review_requests
    FOR UPDATE
    USING (user_has_business_access(business_id))
    WITH CHECK (user_has_business_access(business_id));

-- Policy for DELETE operations on review_requests
CREATE POLICY review_requests_delete_policy ON review_requests
    FOR DELETE
    USING (user_has_business_access(business_id));

-- ==========================================
-- RLS POLICIES FOR EVENTS TABLE
-- ==========================================

-- Policy for SELECT operations on events
CREATE POLICY events_select_policy ON events
    FOR SELECT
    USING (user_has_business_access(business_id));

-- Policy for INSERT operations on events
CREATE POLICY events_insert_policy ON events
    FOR INSERT
    WITH CHECK (user_has_business_access(business_id));

-- Policy for UPDATE operations on events
CREATE POLICY events_update_policy ON events
    FOR UPDATE
    USING (user_has_business_access(business_id))
    WITH CHECK (user_has_business_access(business_id));

-- Policy for DELETE operations on events
CREATE POLICY events_delete_policy ON events
    FOR DELETE
    USING (user_has_business_access(business_id));

-- ==========================================
-- RLS POLICIES FOR SUPPRESSIONS TABLE
-- ==========================================

-- Policy for SELECT operations on suppressions
CREATE POLICY suppressions_select_policy ON suppressions
    FOR SELECT
    USING (user_has_business_access(business_id));

-- Policy for INSERT operations on suppressions
CREATE POLICY suppressions_insert_policy ON suppressions
    FOR INSERT
    WITH CHECK (user_has_business_access(business_id));

-- Policy for UPDATE operations on suppressions
CREATE POLICY suppressions_update_policy ON suppressions
    FOR UPDATE
    USING (user_has_business_access(business_id))
    WITH CHECK (user_has_business_access(business_id));

-- Policy for DELETE operations on suppressions
CREATE POLICY suppressions_delete_policy ON suppressions
    FOR DELETE
    USING (user_has_business_access(business_id));

-- ==========================================
-- ADDITIONAL CONSTRAINTS FOR DATA INTEGRITY
-- ==========================================

-- Constraint to ensure customers belong to the same business as review_requests
ALTER TABLE review_requests 
ADD CONSTRAINT fk_review_requests_customer_business_match 
CHECK (
    NOT EXISTS (
        SELECT 1 FROM customers c 
        WHERE c.id = customer_id 
        AND c.business_id != review_requests.business_id
    )
);

-- ==========================================
-- SECURITY FUNCTIONS FOR APPLICATION USE
-- ==========================================

-- Function to safely set business context with validation
CREATE OR REPLACE FUNCTION safe_set_business_context(
    clerk_user_id TEXT,
    requested_business_id UUID DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    business_id UUID;
BEGIN
    -- Get the business_id for the authenticated user
    SELECT b.id INTO business_id
    FROM businesses b
    WHERE b.clerk_user_id = safe_set_business_context.clerk_user_id
    AND b.is_active = true;
    
    -- If no business found, raise exception
    IF business_id IS NULL THEN
        RAISE EXCEPTION 'No active business found for user %', clerk_user_id;
    END IF;
    
    -- If a specific business was requested, validate it matches
    IF requested_business_id IS NOT NULL AND requested_business_id != business_id THEN
        RAISE EXCEPTION 'Access denied: user % cannot access business %', 
            clerk_user_id, requested_business_id;
    END IF;
    
    -- Set the business context
    PERFORM set_current_business_id(business_id);
    
    RETURN business_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to clear business context (for cleanup)
CREATE OR REPLACE FUNCTION clear_business_context()
RETURNS VOID AS $$
BEGIN
    PERFORM set_config('app.current_business_id', '', false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ==========================================
-- INDEXES FOR RLS PERFORMANCE
-- ==========================================

-- Ensure business_id indexes exist for RLS performance
-- (Most should already exist from the schema)

-- Additional indexes for RLS performance if needed
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_customers_business_id_active 
ON customers (business_id, is_active);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_review_requests_business_id_status 
ON review_requests (business_id, status);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_events_business_id_created 
ON events (business_id, created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_suppressions_business_id_active 
ON suppressions (business_id, is_active);

-- ==========================================
-- COMMENTS FOR DOCUMENTATION
-- ==========================================

COMMENT ON FUNCTION set_current_business_id(UUID) IS 
'Sets the current business context for RLS policies. Used internally by application.';

COMMENT ON FUNCTION get_current_business_id() IS 
'Gets the current business context from session. Returns NULL if not set.';

COMMENT ON FUNCTION user_has_business_access(UUID) IS 
'Checks if current session has access to specified business_id. Used by RLS policies.';

COMMENT ON FUNCTION safe_set_business_context(TEXT, UUID) IS 
'Safely sets business context with Clerk user validation. Primary function for app use.';

COMMENT ON FUNCTION clear_business_context() IS 
'Clears business context from session. Used for cleanup between requests.';

-- ==========================================
-- GRANT PERMISSIONS
-- ==========================================

-- Grant execute permissions to the application user
-- Note: Replace 'app_user' with your actual database user
-- GRANT EXECUTE ON FUNCTION set_current_business_id(UUID) TO app_user;
-- GRANT EXECUTE ON FUNCTION get_current_business_id() TO app_user;
-- GRANT EXECUTE ON FUNCTION user_has_business_access(UUID) TO app_user;
-- GRANT EXECUTE ON FUNCTION safe_set_business_context(TEXT, UUID) TO app_user;
-- GRANT EXECUTE ON FUNCTION clear_business_context() TO app_user;