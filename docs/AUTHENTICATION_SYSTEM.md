# Complete Authentication System Documentation

This document provides comprehensive guidance for using Review Runner's authentication system that integrates Clerk JWT validation with business context management and Row Level Security policies.

## 🏗️ System Architecture

```
Client Request → JWT Token → Clerk Validation → Business Context → RLS → Route Handler
     ↓              ↓            ↓                ↓              ↓         ↓
  Bearer Token → Extract User → Map to Business → Set DB Context → Filter Data → Response
```

### Components

1. **Clerk JWT Validation**: Validates and decodes Clerk JWT tokens
2. **Business Context Manager**: Maps users to businesses and sets RLS context
3. **Authentication Pipeline**: Orchestrates the complete auth flow
4. **Route Protection**: Decorators and helpers for protecting routes
5. **Row Level Security**: Database-level data filtering

## 🔧 Setup and Configuration

### 1. Environment Variables

```bash
# Clerk Configuration
CLERK_SECRET_KEY="sk_test_..."
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="pk_test_..."

# Optional: JWT Configuration
CLERK_JWT_KEY="..."  # If using custom JWT keys

# Optional: Security Configuration
ENABLE_RATE_LIMIT=true
ENABLE_GLOBAL_AUTH=false
ALLOW_NO_BUSINESS=false
MAX_FAILED_ATTEMPTS=10

# CORS Configuration
CORS_ORIGIN="http://localhost:3000,https://yourdomain.com"
```

### 2. Server Registration

```typescript
import authPipelinePlugin from './middleware/auth-pipeline';
import { registerAuthHelpers } from '../lib/auth-helpers';

// Register authentication system
await fastify.register(authPipelinePlugin, {
  skipPaths: ['/health', '/r/', '/webhooks/'],
  enableRateLimit: true,
  rateLimit: {
    max: 100,
    windowMs: 15 * 60 * 1000,
  },
  businessContext: {
    allowNoBusiness: false,
    cacheDuration: 5 * 60 * 1000,
  },
  security: {
    enableLogging: true,
    blockSuspicious: true,
    maxFailedAttempts: 10,
  },
});

await registerAuthHelpers(fastify);
```

## 🔐 Authentication Levels

The system supports different authentication levels:

### `none` - Public Routes

```typescript
// No authentication required
fastify.get(
  '/public',
  publicRoute(async (request, reply) => {
    // Public endpoint logic
  })
);
```

### `optional` - Optional Authentication

```typescript
// Auth is optional, provides context if available
fastify.get(
  '/analytics',
  optionalAuth(async (request, reply) => {
    if (AuthUtils.isAuthenticated(request)) {
      // Show authenticated user data
    } else {
      // Show public data
    }
  })
);
```

### `required` - Authentication Required

```typescript
// Must be authenticated with valid business context
fastify.get(
  '/customers',
  requireAuth()(async (request, reply) => {
    // Authenticated user logic - RLS automatically filters data
  })
);
```

### `admin` - Admin/Owner Required

```typescript
// Must be business admin or owner
fastify.delete(
  '/customers/:id',
  requireAdmin()(async (request, reply) => {
    // Admin-only logic
  })
);
```

## 🛡️ Route Protection Patterns

### Basic Authentication

```typescript
import { requireAuth, requireAdmin, AuthUtils } from '../lib/auth-helpers';

// Simple authentication requirement
fastify.get(
  '/protected',
  requireAuth()(async (request: AuthenticatedRequest, reply) => {
    // User is authenticated, business context is set
    console.log('Business ID:', request.businessId);
    console.log('User ID:', request.clerkUserId);
  })
);
```

### Permission-Based Protection

```typescript
import { requirePermissions } from '../lib/auth-helpers';

// Require specific permissions
fastify.post(
  '/customers',
  requirePermissions(['customers:write'])(async (request, reply) => {
    // User has customers:write permission
  })
);

// Multiple permissions (user needs ALL)
fastify.delete(
  '/business',
  requirePermissions(['business:delete', 'admin:full'])(async (request, reply) => {
    // User has both permissions
  })
);
```

### Custom Validation

```typescript
fastify.put(
  '/sensitive',
  requireAuth({
    validator: async authContext => {
      // Custom business logic validation
      const userRole = authContext.business.role;
      const hasSpecialAccess = await checkSpecialAccess(authContext.user.clerkUserId);

      return userRole === 'owner' && hasSpecialAccess;
    },
  })(async (request, reply) => {
    // Custom validation passed
  })
);
```

### Business Owner Only

```typescript
import { requireBusinessOwner } from '../lib/auth-helpers';

fastify.post(
  '/business/settings',
  requireBusinessOwner(async (request, reply) => {
    // Only business owners can access this
  })
);
```

## 🎯 Working with Business Context

### Automatic Context Setting

The authentication system automatically:

- Validates JWT tokens
- Maps users to businesses
- Sets Row Level Security context
- Provides typed request objects

```typescript
fastify.get(
  '/customers',
  requireAuth()(async (request: AuthenticatedRequest, reply) => {
    // These are automatically available:
    const businessId = request.businessId; // string
    const clerkUserId = request.clerkUserId; // string
    const userInfo = request.user; // AuthenticatedUser
    const businessInfo = request.business; // BusinessContext
    const fullAuth = request.auth; // AuthContext

    // Database queries are automatically filtered by RLS
    const customers = await prisma.customer.findMany({
      where: {
        isActive: true,
        // No need to add businessId - RLS handles it!
      },
    });
  })
);
```

### Multiple Business Support

For users who belong to multiple businesses:

```typescript
// Get all businesses for a user
const userBusinesses = await getAuthBusinessContextManager().getUserBusinesses(clerkUserId);

// Validate access to specific business
const access = await getAuthBusinessContextManager().validateBusinessAccess(
  clerkUserId,
  requestedBusinessId
);

if (access.hasAccess) {
  // User can access this business
  const businessContext = access.business;
}
```

## 📊 Permission System

### Built-in Permissions

The system includes role-based permissions:

#### Owner Permissions

- `business:read`, `business:write`, `business:delete`
- `customers:read`, `customers:write`, `customers:delete`
- `campaigns:read`, `campaigns:write`, `campaigns:delete`
- `analytics:read`
- `settings:read`, `settings:write`

#### Admin Permissions

- `business:read`
- `customers:read`, `customers:write`
- `campaigns:read`, `campaigns:write`
- `analytics:read`
- `settings:read`

#### Member Permissions

- `business:read`
- `customers:read`
- `campaigns:read`
- `analytics:read`

### Checking Permissions

```typescript
import { AuthUtils } from '../lib/auth-helpers';

fastify.get(
  '/data',
  requireAuth()(async (request, reply) => {
    // Check single permission
    if (AuthUtils.hasPermission(request, 'customers:write')) {
      // User can write customers
    }

    // Check multiple permissions (ANY)
    if (AuthUtils.hasAnyPermission(request, ['customers:read', 'campaigns:read'])) {
      // User can read customers OR campaigns
    }

    // Check multiple permissions (ALL)
    if (AuthUtils.hasAllPermissions(request, ['customers:write', 'analytics:read'])) {
      // User can write customers AND read analytics
    }

    // Check role
    if (AuthUtils.isBusinessOwner(request)) {
      // User is business owner
    }
  })
);
```

## 🚨 Error Handling

### Authentication Errors

The system provides detailed error responses:

```typescript
// No token provided
{
  "success": false,
  "error": {
    "code": "NO_TOKEN",
    "message": "No authorization token provided"
  }
}

// Invalid token
{
  "success": false,
  "error": {
    "code": "INVALID_TOKEN",
    "message": "Invalid token signature or format",
    "details": "jwt signature verification failed"
  }
}

// Insufficient permissions
{
  "success": false,
  "error": {
    "code": "INSUFFICIENT_PERMISSIONS",
    "message": "Insufficient permissions for this operation",
    "details": "Required: customers:write"
  }
}
```

### Error Codes Reference

| Code                        | Description                      | Status Code |
| --------------------------- | -------------------------------- | ----------- |
| `NO_TOKEN`                  | No authorization token provided  | 401         |
| `INVALID_TOKEN`             | Token is malformed or invalid    | 401         |
| `EXPIRED_TOKEN`             | Token has expired                | 401         |
| `TOKEN_VERIFICATION_FAILED` | Clerk verification failed        | 401         |
| `USER_NOT_FOUND`            | User not found in Clerk          | 401         |
| `BUSINESS_NOT_FOUND`        | No business found for user       | 404         |
| `BUSINESS_INACTIVE`         | Business account is inactive     | 403         |
| `BUSINESS_ACCESS_DENIED`    | User cannot access this business | 403         |
| `INSUFFICIENT_PERMISSIONS`  | Missing required permissions     | 403         |
| `RATE_LIMITED`              | Too many requests                | 429         |

## 📈 Performance Considerations

### Business Context Caching

The system caches business context to improve performance:

```typescript
// Default cache: 5 minutes
const manager = getAuthBusinessContextManager(prisma, {
  cacheDuration: 5 * 60 * 1000,
});

// Clear cache when needed
manager.clearCache(); // All cache
manager.clearUserCache(clerkUserId); // User-specific cache
```

### Database Query Optimization

RLS policies are optimized with proper indexing:

```sql
-- These indexes support RLS performance
CREATE INDEX idx_customers_business_id_active ON customers (business_id, is_active);
CREATE INDEX idx_review_requests_business_id_status ON review_requests (business_id, status);
CREATE INDEX idx_events_business_id_created ON events (business_id, created_at DESC);
```

### Rate Limiting

Configure rate limiting based on your needs:

```typescript
// Per-endpoint rate limiting
fastify.post(
  '/expensive',
  rateLimited(
    {
      max: 10,
      windowMs: 60 * 1000, // 1 minute
      level: 'required',
    },
    async (request, reply) => {
      // Expensive operation
    }
  )
);
```

## 🔍 Monitoring and Logging

### Authentication Events

The system logs all authentication events:

```typescript
// Successful authentication
logger.info('Auth event', {
  type: 'login',
  userId: 'user_123',
  businessId: 'biz_456',
  ipAddress: '192.168.1.1',
  path: '/api/customers',
  timestamp: new Date(),
});

// Failed authentication
logger.warn('Auth event', {
  type: 'access_denied',
  ipAddress: '192.168.1.1',
  path: '/api/admin',
  error: { code: 'INSUFFICIENT_PERMISSIONS', message: 'Admin required' },
  timestamp: new Date(),
});
```

### Monitoring Authentication Stats

```typescript
import { getAuthPipeline } from './middleware/auth-pipeline';

// Get authentication statistics
const stats = getAuthPipeline()?.getStats();
console.log({
  totalRequests: stats.totalRequests,
  successfulAuth: stats.successfulAuth,
  failedAuth: stats.failedAuth,
  rateLimited: stats.rateLimited,
  businessContextErrors: stats.businessContextErrors,
});
```

## 🧪 Testing

### Unit Tests

```typescript
describe('Authentication System', () => {
  it('should authenticate valid JWT token', async () => {
    const token = await createValidJWT();
    const { payload, user } = await validateClerkJWT(token);

    expect(user.clerkUserId).toBeDefined();
    expect(payload.exp).toBeGreaterThan(Date.now() / 1000);
  });

  it('should set business context correctly', async () => {
    const manager = new AuthBusinessContextManager(prisma);
    const context = await manager.getBusinessContext(mockUser);

    expect(context.businessId).toBeDefined();
    expect(context.role).toEqual('owner');
  });
});
```

### Integration Tests

```typescript
describe('Protected Routes', () => {
  it('should require authentication', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/customers',
      // No authorization header
    });

    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe('NO_TOKEN');
  });

  it('should allow access with valid token', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/customers',
      headers: {
        authorization: `Bearer ${validToken}`,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().success).toBe(true);
  });
});
```

## 🔧 Troubleshooting

### Common Issues

#### 1. "No business found for user"

- **Cause**: User exists in Clerk but no business record in database
- **Solution**: Create business record or enable `allowNoBusiness` option

#### 2. "Token verification failed"

- **Cause**: Invalid Clerk configuration or expired keys
- **Solution**: Verify `CLERK_SECRET_KEY` and ensure it's current

#### 3. "RLS context not set"

- **Cause**: Business context middleware not running
- **Solution**: Ensure middleware is registered and runs before route handlers

#### 4. "Performance issues with RLS"

- **Cause**: Missing database indexes
- **Solution**: Add composite indexes with `business_id` as first column

### Debug Mode

Enable debug logging:

```typescript
// Environment variable
LOG_LEVEL = debug;

// Or programmatically
logger.level = 'debug';
```

Debug output includes:

- JWT token validation steps
- Business context resolution
- RLS context setting
- Permission checks
- Cache hits/misses

## 🔗 Integration Examples

### Frontend Integration (Next.js)

```typescript
// pages/api/customers.ts
import { withAuth } from '../lib/auth-wrapper';

export default withAuth(async (req, res) => {
  const response = await fetch(`${process.env.API_URL}/api/customers`, {
    headers: {
      Authorization: `Bearer ${req.auth.token}`,
    },
  });

  return res.json(await response.json());
});
```

### Mobile App Integration

```javascript
// React Native / Mobile
const apiCall = async (endpoint, options = {}) => {
  const token = await getClerkToken();

  return fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
};
```

This authentication system provides enterprise-grade security with multi-tenancy, fine-grained permissions, and comprehensive monitoring while maintaining simplicity for developers.
