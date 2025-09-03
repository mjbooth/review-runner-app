# Security Integration Guide

This document provides comprehensive guidance on integrating and using the Review Runner security system components.

## Overview

The security system consists of several integrated components:

1. **Row Level Security (RLS)** - Database-level multi-tenant isolation
2. **Authentication Pipeline** - Clerk JWT validation with business context
3. **Input Validation** - Zod schemas with security validation
4. **Rate Limiting** - Business-scoped progressive rate limiting
5. **Resource Ownership** - Additional validation beyond RLS
6. **Business Rules** - Complex validation logic and compliance
7. **API Security** - Headers, response control, error sanitization
8. **Audit Logging** - Comprehensive event tracking and compliance
9. **Error Handling** - Centralized error classification and response

## Quick Start Integration

### 1. Basic Route Security

```typescript
// src/api/routes/example.ts
import { FastifyPluginAsync } from 'fastify';
import { requireAuth, requirePermissions } from '../../lib/auth-helpers';
import { createRateLimitMiddleware } from '../../lib/business-rate-limiter';
import { createValidationMiddleware } from '../../lib/security-validation';
import { createOwnershipMiddleware } from '../../lib/resource-ownership-validation';
import { trackOperation } from '../../lib/security-integration';

const exampleRoutes: FastifyPluginAsync = async function (fastify) {
  // GET /api/example/:id - Read with full security
  fastify.get(
    '/:id',
    {
      preHandler: [
        createRateLimitMiddleware('data.read'),
        createOwnershipMiddleware('example', { resourceIdParam: 'id', operation: 'read' }),
        createValidationMiddleware(idParamsSchema, { source: 'params' }),
      ],
    },
    requirePermissions(['example:read'])(async (request, reply) => {
      return await trackOperation(
        {
          name: 'get_example',
          description: 'Retrieve example resource',
          resource: { type: 'example', id: request.params.id },
          requiresAudit: true,
        },
        request,
        async () => {
          // Your business logic here
          return await getExampleById(request.params.id);
        }
      );
    })
  );
};
```

### 2. Error Handling Integration

```typescript
// src/api/server.ts
import fastify from 'fastify';
import { createFastifyErrorHandler } from '../lib/error-handler';
import apiSecurityPlugin from '../lib/api-security';

const server = fastify();

// Register security middleware
await server.register(apiSecurityPlugin);

// Register centralized error handler
server.setErrorHandler(createFastifyErrorHandler());
```

### 3. Audit Logging Examples

```typescript
import {
  trackDataAccess,
  trackAuthenticationEvent,
  trackGDPREvent,
} from '../lib/security-integration';

// Track data access
await trackDataAccess(
  request,
  {
    type: 'customer',
    id: customerId,
    sensitive: true,
  },
  'read'
);

// Track authentication
await trackAuthenticationEvent('login', userId, {
  ip: request.ip,
  userAgent: request.headers['user-agent'],
  businessId: businessId,
});

// Track GDPR event
await trackGDPREvent('data_export', request, {
  customerId: 'customer_123',
  dataTypes: ['personal_info', 'contact_info'],
  reason: 'User requested data export',
});
```

## Component Details

### Authentication Pipeline

The auth pipeline automatically handles:

- JWT token validation
- Business context resolution
- Session management
- Rate limit context

```typescript
// Automatically applied to authenticated routes
const authRequest = request as AuthenticatedRequest;
console.log(authRequest.businessId); // Available after auth
console.log(authRequest.clerkUserId); // Available after auth
console.log(authRequest.businessContext); // Available after business rules middleware
```

### Input Validation

```typescript
import {
  createCustomerSchema,
  createReviewRequestSchema,
  createValidationMiddleware,
} from '../lib/validation-schemas';

// Apply validation middleware
fastify.post(
  '/',
  {
    preHandler: [
      createValidationMiddleware(createCustomerSchema, {
        source: 'body',
        sanitize: true,
      }),
    ],
  },
  async (request, reply) => {
    // request.body is now validated and sanitized
  }
);
```

### Rate Limiting

```typescript
import { createRateLimitMiddleware, getRateLimiter } from '../lib/business-rate-limiter';

// Simple rate limiting
fastify.get(
  '/',
  {
    preHandler: [createRateLimitMiddleware('data.read')],
  },
  handler
);

// Dynamic rate limiting
fastify.post(
  '/bulk',
  {
    preHandler: [
      createRateLimitMiddleware('bulk.create', {
        quantity: request => request.body?.items?.length || 1,
      }),
    ],
  },
  handler
);

// Manual rate limit checking
const rateLimiter = getRateLimiter();
const result = await rateLimiter.checkRateLimit(businessId, 'sms.send', {
  tier: 'professional',
  userId: userId,
  ip: request.ip,
});
```

### Business Rules Validation

```typescript
import {
  createBusinessRulesMiddleware,
  getBusinessRulesValidator,
} from '../lib/business-rules-validation';

// Apply business rules middleware
fastify.post(
  '/',
  {
    preHandler: [createBusinessRulesMiddleware(['message_content', 'campaign_frequency'])],
  },
  async (request, reply) => {
    const validator = request.businessRulesValidator;
    const businessContext = request.businessContext;

    // Manual validation
    const result = await validator.validateMessageContent(messageContent, 'SMS', businessContext);
  }
);
```

### Resource Ownership

```typescript
import { createOwnershipMiddleware, checkOwnership } from '../lib/resource-ownership-validation';

// Middleware approach
fastify.get(
  '/:id',
  {
    preHandler: [
      createOwnershipMiddleware('customer', {
        resourceIdParam: 'id',
        operation: 'read',
      }),
    ],
  },
  handler
);

// Manual checking
const isOwner = await checkOwnership(businessId, userId, 'customer', customerId, 'write');
```

## Security Monitoring

### Real-time Monitoring

```typescript
import { monitorSuspiciousActivity } from '../lib/security-integration';

// Track suspicious patterns
await monitorSuspiciousActivity(request, {
  type: 'unusual_access',
  description: 'User accessing unusual number of records',
  metadata: { recordCount: 1000 },
  severity: 'high',
});
```

### Performance Monitoring

```typescript
import { monitorEndpointPerformance } from '../lib/security-integration';

// Track in route handler
const startTime = Date.now();
// ... do work
await monitorEndpointPerformance(request, startTime, reply.statusCode);
```

### Integration Monitoring

```typescript
import { trackIntegrationEvent } from '../lib/security-integration';

// Track external service calls
const startTime = Date.now();
try {
  const result = await twilioClient.messages.create(messageData);
  await trackIntegrationEvent('twilio', 'send_sms', true, Date.now() - startTime, {
    messageId: result.sid,
  });
} catch (error) {
  await trackIntegrationEvent('twilio', 'send_sms', false, Date.now() - startTime, {
    error: error.message,
  });
}
```

## Compliance Features

### GDPR Compliance

```typescript
// Automatic personal data flagging
await trackDataAccess(
  request,
  {
    type: 'customer',
    id: customerId,
    sensitive: true, // Automatically flags as personal data
  },
  'read'
);

// GDPR event tracking
await trackGDPREvent('right_to_be_forgotten', request, {
  customerId: customerId,
  dataTypes: ['contact_info', 'campaign_history'],
  reason: 'Customer request via support ticket #123',
});
```

### Audit Queries

```typescript
import { getAuditLogger } from '../lib/audit-logger';

const auditLogger = getAuditLogger();

// Query audit events
const events = await auditLogger.queryEvents({
  businessId: 'business_123',
  category: 'data_access',
  dateFrom: new Date('2024-01-01'),
  dateTo: new Date('2024-01-31'),
  page: 1,
  limit: 50,
});

// Generate compliance report
const report = await auditLogger.generateComplianceReport(
  'business_123',
  new Date('2024-01-01'),
  new Date('2024-01-31')
);
```

### Security Reporting

```typescript
import { getAuditLogger } from '../lib/audit-logger';

const auditLogger = getAuditLogger();

// Get security summary
const summary = await auditLogger.getSecuritySummary('business_123', 30);

console.log(summary.criticalEvents); // Number of critical security events
console.log(summary.suspiciousEvents); // Number of suspicious activities
console.log(summary.topRisks); // Top security risks by frequency
```

## Error Handling Patterns

### Custom Error Types

```typescript
import { handleError, createErrorContext } from '../lib/error-handler';

// In route handler
try {
  // Business logic
} catch (error) {
  const classifiedError = await handleError(
    error,
    createErrorContext(request, 'create_customer'),
    request
  );

  // Error is automatically logged and categorized
  throw error; // Re-throw for Fastify error handler
}
```

### Error Recovery

```typescript
import { getErrorHandler } from '../lib/error-handler';

const errorHandler = getErrorHandler();

// Get error statistics for monitoring
const stats = errorHandler.getErrorStatistics();
console.log(stats.errorsByCategory);
console.log(stats.topErrors);
```

## Configuration

### Environment Variables

```bash
# Audit logging
AUDIT_BATCH_SIZE=10
AUDIT_FLUSH_INTERVAL=5000

# Error handling
ERROR_ALERT_ENABLED=true
ERROR_STACK_TRACES=development

# Security
SECURITY_HEADERS_ENABLED=true
RESPONSE_SIZE_LIMIT=52428800
RATE_LIMIT_STRICT_MODE=true
```

### Security Settings

```typescript
// src/config/security.ts
export const securityConfig = {
  // Rate limiting
  rateLimits: {
    free: { sms: { daily: 10 }, email: { daily: 50 } },
    starter: { sms: { daily: 100 }, email: { daily: 500 } },
    professional: { sms: { daily: 1000 }, email: { daily: 5000 } },
  },

  // Audit retention
  auditRetention: {
    lowSeverity: 90, // days
    mediumSeverity: 180,
    highSeverity: 365,
    criticalSeverity: 2555, // 7 years
  },

  // Alert thresholds
  alertThresholds: {
    criticalErrors: 1,
    failedLogins: 5,
    suspiciousActivity: 3,
  },
};
```

## Testing Security Components

### Unit Tests

```typescript
import { describe, it, expect } from 'vitest';
import { checkOwnership } from '../lib/resource-ownership-validation';
import { getBusinessRulesValidator } from '../lib/business-rules-validation';

describe('Resource Ownership', () => {
  it('should validate ownership correctly', async () => {
    const isOwner = await checkOwnership('business_123', 'user_456', 'customer', 'customer_789');
    expect(isOwner).toBe(true);
  });
});

describe('Business Rules', () => {
  it('should validate message content', async () => {
    const validator = getBusinessRulesValidator();
    const result = await validator.validateMessageContent(
      'Hello {{firstName}}!',
      'SMS',
      mockBusinessContext
    );
    expect(result.isValid).toBe(true);
  });
});
```

### Integration Tests

```typescript
import { testClient } from './test-setup';

describe('Secure Customer Routes', () => {
  it('should require authentication', async () => {
    const response = await testClient.get('/api/customers');
    expect(response.status).toBe(401);
  });

  it('should enforce rate limits', async () => {
    // Make requests up to rate limit
    for (let i = 0; i < 100; i++) {
      await testClient.get('/api/customers', { headers: authHeaders });
    }

    const response = await testClient.get('/api/customers', { headers: authHeaders });
    expect(response.status).toBe(429);
  });
});
```

## Production Deployment

### Health Checks

```typescript
// src/api/health.ts
import { getAuditLogger } from '../lib/audit-logger';
import { getErrorHandler } from '../lib/error-handler';

fastify.get('/health', async (request, reply) => {
  const auditLogger = getAuditLogger();
  const errorHandler = getErrorHandler();

  // Check component health
  const health = {
    status: 'healthy',
    timestamp: new Date(),
    components: {
      audit: await checkAuditHealth(auditLogger),
      errors: await checkErrorHandlerHealth(errorHandler),
      database: await checkDatabaseHealth(),
      redis: await checkRedisHealth(),
    },
  };

  return reply.send(health);
});
```

### Monitoring Integration

```typescript
// Integration with DataDog, NewRelic, etc.
import { getAuditLogger, getErrorHandler } from '../lib/security-integration';

// Export metrics
setInterval(async () => {
  const auditLogger = getAuditLogger();
  const errorStats = getErrorHandler().getErrorStatistics();

  // Send to monitoring service
  await metricsClient.gauge('security.total_errors', errorStats.totalErrors);
  await metricsClient.gauge('security.critical_events', securitySummary.criticalEvents);
}, 60000);
```

## Best Practices

1. **Always use trackOperation() for business operations**
2. **Apply rate limiting to all user-facing endpoints**
3. **Use business rules middleware for content validation**
4. **Track all data access with audit logging**
5. **Monitor suspicious activity patterns**
6. **Implement proper error handling with classification**
7. **Use resource ownership validation for sensitive operations**
8. **Generate regular compliance reports**
9. **Monitor error statistics and trends**
10. **Test security components thoroughly**

## Troubleshooting

### Common Issues

1. **RLS not working**: Check `app.current_business_id` session variable
2. **Rate limits too strict**: Adjust business tier limits
3. **Audit events not persisting**: Check database connectivity and event queue
4. **Validation failing**: Review Zod schema definitions
5. **Ownership checks failing**: Verify resource configuration

### Debug Commands

```bash
# Check RLS status
SELECT current_setting('app.current_business_id');

# View recent audit events
SELECT * FROM events WHERE metadata->>'auditEvent' = 'true' ORDER BY created_at DESC LIMIT 10;

# Check error handler statistics
# (Available via API endpoint or logs)
```

This comprehensive security system provides production-ready multi-tenant security with full audit capabilities, compliance features, and monitoring integration.
