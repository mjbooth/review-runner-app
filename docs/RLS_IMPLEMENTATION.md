# Row Level Security (RLS) Implementation Guide

This document provides comprehensive guidance for implementing and using Row Level Security in Review Runner's multi-tenant architecture.

## Overview

Row Level Security (RLS) is a PostgreSQL feature that allows you to control access to rows in a table based on the characteristics of the user executing a query. In our multi-tenant application, RLS automatically filters all database queries to only return data belonging to the current business context.

## Key Benefits

- **Automatic Multi-tenancy**: No need to manually add `businessId` filters to queries
- **Security by Default**: Impossible to accidentally access other businesses' data
- **Simplified Code**: Cleaner API routes without business filtering logic
- **Performance**: Database-level filtering is more efficient
- **Compliance**: Built-in data isolation for GDPR and privacy requirements

## Architecture

### Components

1. **Database Functions**: Manage business context in PostgreSQL session
2. **RLS Policies**: Automatically filter queries by business context
3. **Business Context Manager**: TypeScript utilities for context management
4. **Middleware**: Automatic context setting for API routes
5. **Constraints**: Additional protection against cross-business data leaks

### Data Flow

```
1. User authenticates → Clerk JWT
2. API middleware → Extract user ID
3. Context manager → Look up business ID
4. Database function → Set session variable
5. RLS policies → Filter all queries automatically
6. API response → Only business-scoped data
7. Cleanup → Clear session context
```

## Database Implementation

### Session Variables

- **`app.current_business_id`**: Stores the current business context as UUID
- **Scope**: Session-level (cleared after each request)
- **Security**: Only accessible through our secure functions

### Key Functions

#### `set_current_business_id(business_id UUID)`

Sets the business context for the current session.

```sql
SELECT set_current_business_id('550e8400-e29b-41d4-a716-446655440000');
```

#### `get_current_business_id()`

Returns the current business context or NULL.

```sql
SELECT get_current_business_id();
```

#### `safe_set_business_context(clerk_user_id TEXT, business_id UUID)`

Validates user access and sets context safely.

```sql
SELECT safe_set_business_context('user_123', '550e8400-e29b-41d4-a716-446655440000');
```

#### `user_has_business_access(business_id UUID)`

Checks if current session can access the specified business.

```sql
SELECT user_has_business_access('550e8400-e29b-41d4-a716-446655440000');
```

### RLS Policies

Each tenant-scoped table has four policies:

- **SELECT**: `USING (user_has_business_access(business_id))`
- **INSERT**: `WITH CHECK (user_has_business_access(business_id))`
- **UPDATE**: `USING` and `WITH CHECK` both check business access
- **DELETE**: `USING (user_has_business_access(business_id))`

### Protected Tables

- ✅ `customers` - Customer data per business
- ✅ `review_requests` - Campaign data per business
- ✅ `events` - Event logs per business
- ✅ `suppressions` - Opt-out data per business
- ❌ `businesses` - Direct access (no RLS needed)
- ❌ `job_executions` - System-wide (no business scope)

## Application Integration

### Business Context Manager

The `BusinessContextManager` class provides type-safe utilities:

```typescript
import { withBusinessContext } from '../lib/business-context';

// Execute database operation with business context
const result = await withBusinessContext(prisma, clerkUserId, async () => {
  // All queries here are automatically filtered by RLS
  return await prisma.customer.findMany({
    where: { isActive: true }, // No businessId needed!
  });
});
```

### API Middleware

The business context middleware automatically:

1. Extracts user from Clerk JWT
2. Sets appropriate business context
3. Adds `businessId` to request object
4. Handles errors and cleanup

```typescript
import { businessContextMiddleware } from '../middleware/business-context';

// Register middleware for all routes
fastify.addHook('preHandler', businessContextMiddleware);
```

### Route Implementation

Updated routes are simpler and more secure:

```typescript
// OLD - Manual business filtering (error-prone)
fastify.get('/customers', async (request, reply) => {
  const customers = await prisma.customer.findMany({
    where: {
      businessId: request.businessId, // Must remember this!
      isActive: true,
    },
  });
});

// NEW - Automatic RLS filtering (secure by default)
fastify.get(
  '/customers',
  withBusinessContextRoute(async (request, reply) => {
    const customers = await executeInBusinessContext(request, async () => {
      return prisma.customer.findMany({
        where: { isActive: true }, // RLS handles businessId automatically!
      });
    });
  })
);
```

## Migration Process

### 1. Backup Database

```bash
pg_dump review_runner > backup_$(date +%Y%m%d).sql
```

### 2. Run Migration

```bash
# Using the migration runner script
npx tsx scripts/migrate-rls.ts

# Or using Prisma (after setting up migration files)
npx prisma migrate dev --name add_rls_policies
```

### 3. Update Application Code

1. **Add middleware registration**:

```typescript
// In your Fastify server setup
fastify.addHook('preHandler', businessContextMiddleware);
```

2. **Update route handlers**:

```typescript
// Wrap routes with business context
fastify.get(
  '/api/customers',
  withBusinessContextRoute(async (request, reply) => {
    // Your existing logic, remove businessId filters
  })
);
```

3. **Remove manual businessId filters**:

```typescript
// Remove these from your where clauses
where: {
  businessId: request.businessId, // DELETE THIS LINE
  // ... other conditions
}
```

### 4. Test Thoroughly

Run comprehensive tests to ensure:

- ✅ Users can only access their own business data
- ✅ All CRUD operations work correctly
- ✅ Cross-business access is blocked
- ✅ Performance is acceptable

## Testing Strategy

### Unit Tests

```typescript
describe('RLS Business Context', () => {
  it('should filter customers by business context', async () => {
    // Set context for business A
    await withBusinessContext(prisma, userAClerkId, async () => {
      const customers = await prisma.customer.findMany();
      // Should only return business A customers
      expect(customers.every(c => c.businessId === businessAId)).toBe(true);
    });
  });

  it('should prevent cross-business access', async () => {
    // Try to access business B data with business A context
    await withBusinessContext(prisma, userAClerkId, async () => {
      const customer = await prisma.customer.findUnique({
        where: { id: businessBCustomerId },
      });
      // Should return null due to RLS filtering
      expect(customer).toBeNull();
    });
  });
});
```

### Integration Tests

```typescript
describe('API Routes with RLS', () => {
  it('should return only business-scoped customers', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/customers',
      headers: {
        authorization: `Bearer ${businessAToken}`,
      },
    });

    const customers = response.json().data;
    expect(customers.every(c => c.businessId === businessAId)).toBe(true);
  });
});
```

## Performance Considerations

### Indexes for RLS

Ensure proper indexing for RLS performance:

```sql
-- Composite indexes for RLS filtering
CREATE INDEX idx_customers_business_id_active ON customers (business_id, is_active);
CREATE INDEX idx_review_requests_business_id_status ON review_requests (business_id, status);
CREATE INDEX idx_events_business_id_created ON events (business_id, created_at DESC);
```

### Query Performance

- RLS policies are applied to every query
- Database can optimize using indexes
- Monitor query performance after implementation
- Use `EXPLAIN ANALYZE` to verify index usage

### Connection Pooling

- Session variables are per-connection
- Use connection pooling carefully
- Ensure context is set for each request
- Clear context after each operation

## Security Considerations

### Defense in Depth

RLS provides automatic protection, but maintain good practices:

1. **Input Validation**: Continue validating all inputs
2. **Authentication**: Ensure proper JWT validation
3. **Authorization**: Verify business ownership in middleware
4. **Audit Logging**: Log all business context changes
5. **Error Handling**: Don't leak business context in errors

### Potential Attack Vectors

- **Session Fixation**: Context cleared after each request
- **SQL Injection**: Use parameterized queries only
- **Context Pollution**: Always clear context in finally blocks
- **Privilege Escalation**: Functions use SECURITY DEFINER carefully

## Monitoring & Debugging

### Logging Business Context

```typescript
logger.info('Business context set', {
  clerkUserId: auth.userId,
  businessId,
  operation: 'customers.list',
  timestamp: new Date().toISOString(),
});
```

### Database Monitoring

```sql
-- Check current business context
SELECT get_current_business_id();

-- Verify RLS policies are active
SELECT schemaname, tablename, rowsecurity
FROM pg_tables pt
JOIN pg_class pc ON pc.relname = pt.tablename
WHERE rowsecurity = true;

-- Monitor RLS policy usage
SELECT * FROM pg_stat_user_tables
WHERE relname IN ('customers', 'review_requests', 'events', 'suppressions');
```

## Troubleshooting

### Common Issues

#### 1. Context Not Set

**Error**: "No active business found for user"
**Solution**: Ensure middleware runs before route handlers

#### 2. Performance Issues

**Error**: Slow queries after RLS
**Solution**: Add composite indexes with business_id

#### 3. Transaction Context

**Error**: Context lost in transactions
**Solution**: Set context before transaction starts

#### 4. Connection Pool Issues

**Error**: Wrong business data returned
**Solution**: Always clear context in finally blocks

### Debug Commands

```typescript
// Check if RLS is working
const result = await prisma.$queryRaw`
  SELECT get_current_business_id() as current_business,
         user_has_business_access('${businessId}') as has_access
`;

// Test RLS policies
await withBusinessContext(prisma, clerkUserId, async () => {
  const count = await prisma.customer.count();
  console.log(`Found ${count} customers for business`);
});
```

## Rollback Plan

If issues arise, you can disable RLS temporarily:

```sql
-- Disable RLS on specific table
ALTER TABLE customers DISABLE ROW LEVEL SECURITY;

-- Or drop policies
DROP POLICY customers_select_policy ON customers;
-- ... drop other policies

-- Re-enable later
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
```

## Best Practices

### DO ✅

- Always use business context middleware
- Clear context after each request
- Test cross-business access thoroughly
- Monitor query performance
- Use composite indexes with business_id
- Log business context changes

### DON'T ❌

- Don't manually add businessId filters (RLS handles it)
- Don't skip context validation
- Don't reuse database connections without clearing context
- Don't expose business context in error messages
- Don't bypass RLS with raw SQL unless necessary

## Next Steps

After implementing RLS:

1. **Remove Legacy Code**: Clean up manual businessId filters
2. **Add Monitoring**: Set up alerts for RLS policy failures
3. **Performance Tuning**: Optimize indexes based on usage patterns
4. **Security Audit**: Review all database access patterns
5. **Documentation**: Update API documentation to reflect changes

## Support

For questions about RLS implementation:

1. Check this documentation first
2. Review the example route implementations
3. Test with the migration runner script
4. Monitor database logs for RLS policy violations

Remember: RLS provides security by default, but proper implementation and testing are crucial for a successful deployment.
