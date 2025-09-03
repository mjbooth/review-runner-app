/**
 * Security Integration Helpers
 *
 * Convenient integration functions that combine audit logging, error handling,
 * and security monitoring for easy use throughout the application.
 */

import { type FastifyRequest } from 'fastify';
import {
  auditLog,
  auditAuth,
  auditDataAccess,
  auditSecurity,
  getAuditLogger,
} from './audit-logger';
import { handleError, createErrorContext, getErrorHandler } from './error-handler';
import { logger } from './logger';
import type { AuthenticatedRequest } from '../types/auth';
import type { AuditEventData, AuditEventType, AuditEventCategory } from './audit-logger';

// ==========================================
// OPERATION TRACKING
// ==========================================

export interface OperationContext {
  name: string;
  description: string;
  userId?: string;
  businessId?: string;
  resource?: {
    type: string;
    id: string;
    name?: string;
  };
  metadata?: Record<string, any>;
  sensitive?: boolean;
  requiresAudit?: boolean;
}

/**
 * Track a complete operation with automatic audit logging and error handling
 */
export async function trackOperation<T>(
  context: OperationContext,
  request: FastifyRequest,
  operation: () => Promise<T>
): Promise<T> {
  const startTime = Date.now();
  const correlationId = generateOperationId();
  const authRequest = request as AuthenticatedRequest;

  // Create operation audit event
  if (context.requiresAudit !== false) {
    await auditLog({
      category: 'business_operation',
      type: 'JOB_STARTED',
      severity: 'low',
      description: `Started: ${context.description}`,
      userId: context.userId || authRequest.clerkUserId,
      businessId: context.businessId || authRequest.businessId,
      resource: context.resource,
      context: {
        ip: request.ip,
        userAgent: request.headers['user-agent'],
        endpoint: request.url,
        method: request.method,
      },
      metadata: {
        operationName: context.name,
        ...context.metadata,
      },
      flags: {
        personalData: context.sensitive,
      },
      correlationId,
    });
  }

  try {
    logger.debug('Operation started', {
      operation: context.name,
      correlationId,
      userId: context.userId || authRequest.clerkUserId,
      businessId: context.businessId || authRequest.businessId,
    });

    // Execute the operation
    const result = await operation();
    const duration = Date.now() - startTime;

    // Log successful completion
    if (context.requiresAudit !== false) {
      await auditLog({
        category: 'business_operation',
        type: 'JOB_COMPLETED',
        severity: 'low',
        description: `Completed: ${context.description}`,
        userId: context.userId || authRequest.clerkUserId,
        businessId: context.businessId || authRequest.businessId,
        resource: context.resource,
        context: {
          ip: request.ip,
          userAgent: request.headers['user-agent'],
          endpoint: request.url,
          method: request.method,
          duration,
        },
        metadata: {
          operationName: context.name,
          duration,
          success: true,
          ...context.metadata,
        },
        correlationId,
      });
    }

    logger.info('Operation completed successfully', {
      operation: context.name,
      correlationId,
      duration,
      userId: context.userId || authRequest.clerkUserId,
    });

    return result;
  } catch (error) {
    const duration = Date.now() - startTime;

    // Handle error with centralized error handler
    const classifiedError = await handleError(
      error as Error,
      {
        ...createErrorContext(request, context.name),
        operation: context.name,
        resource: context.resource,
        metadata: {
          ...context.metadata,
          duration,
        },
      },
      request
    );

    // Log operation failure
    if (context.requiresAudit !== false) {
      await auditLog({
        category: 'business_operation',
        type: 'JOB_FAILED',
        severity: 'medium',
        description: `Failed: ${context.description} - ${classifiedError.message}`,
        userId: context.userId || authRequest.clerkUserId,
        businessId: context.businessId || authRequest.businessId,
        resource: context.resource,
        context: {
          ip: request.ip,
          userAgent: request.headers['user-agent'],
          endpoint: request.url,
          method: request.method,
          duration,
        },
        metadata: {
          operationName: context.name,
          duration,
          success: false,
          errorId: classifiedError.id,
          errorCode: classifiedError.code,
          errorCategory: classifiedError.category,
          ...context.metadata,
        },
        flags: {
          requiresReview: classifiedError.severity === 'critical',
        },
        correlationId,
      });
    }

    logger.error('Operation failed', {
      operation: context.name,
      correlationId,
      duration,
      errorId: classifiedError.id,
      error: classifiedError.message,
    });

    throw error;
  }
}

// ==========================================
// SECURITY MONITORING HELPERS
// ==========================================

/**
 * Monitor suspicious activity patterns
 */
export async function monitorSuspiciousActivity(
  request: FastifyRequest,
  activity: {
    type:
      | 'unusual_access'
      | 'repeated_failures'
      | 'bulk_operation'
      | 'privilege_escalation'
      | 'data_export';
    description: string;
    metadata?: Record<string, any>;
    severity?: 'low' | 'medium' | 'high' | 'critical';
  }
): Promise<void> {
  const authRequest = request as AuthenticatedRequest;

  await auditSecurity(
    'SUSPICIOUS_ACTIVITY',
    activity.description,
    activity.severity || 'medium',
    {
      ip: request.ip,
      endpoint: request.url,
      userAgent: request.headers['user-agent'],
    },
    authRequest.clerkUserId,
    authRequest.businessId,
    {
      activityType: activity.type,
      ...activity.metadata,
    }
  );

  logger.warn('Suspicious activity detected', {
    type: activity.type,
    description: activity.description,
    userId: authRequest.clerkUserId,
    businessId: authRequest.businessId,
    ip: request.ip,
    endpoint: request.url,
  });
}

/**
 * Track data access with automatic classification
 */
export async function trackDataAccess(
  request: FastifyRequest,
  resource: {
    type: string;
    id: string;
    name?: string;
    sensitive?: boolean;
  },
  operation: 'read' | 'write' | 'delete' | 'export' = 'read',
  metadata?: Record<string, any>
): Promise<void> {
  const authRequest = request as AuthenticatedRequest;

  // Determine if this involves personal data
  const personalDataTypes = ['customer', 'review_request', 'contact'];
  const isPersonalData = personalDataTypes.includes(resource.type) || resource.sensitive;

  // Map operation to audit event type
  const eventTypeMap = {
    read: 'DATA_READ' as const,
    write: 'DATA_UPDATED' as const,
    delete: 'DATA_DELETED' as const,
    export: 'DATA_EXPORT' as const,
  };

  await auditLog({
    category: 'data_access',
    type: eventTypeMap[operation],
    severity: isPersonalData ? 'medium' : 'low',
    description: `${operation.charAt(0).toUpperCase() + operation.slice(1)} ${resource.type} ${resource.id}`,
    userId: authRequest.clerkUserId,
    businessId: authRequest.businessId,
    resource,
    context: {
      ip: request.ip,
      userAgent: request.headers['user-agent'],
      endpoint: request.url,
      method: request.method,
    },
    metadata: {
      operation,
      isPersonalData,
      ...metadata,
    },
    flags: {
      personalData: isPersonalData,
      complianceRelevant: isPersonalData,
    },
  });

  // Log bulk access patterns
  if (metadata?.bulkOperation || metadata?.count > 10) {
    await monitorSuspiciousActivity(request, {
      type: 'bulk_operation',
      description: `Bulk ${operation} operation on ${metadata?.count || 'multiple'} ${resource.type} records`,
      metadata: {
        resourceType: resource.type,
        operation,
        count: metadata?.count,
      },
      severity: 'medium',
    });
  }
}

/**
 * Track authentication events with enhanced context
 */
export async function trackAuthenticationEvent(
  type: 'login' | 'logout' | 'login_failed' | 'session_expired' | 'mfa_challenge',
  userId: string,
  context: {
    ip: string;
    userAgent?: string;
    businessId?: string;
    sessionId?: string;
    failureReason?: string;
    metadata?: Record<string, any>;
  }
): Promise<void> {
  const eventTypeMap = {
    login: 'LOGIN_SUCCESS' as const,
    logout: 'LOGOUT' as const,
    login_failed: 'LOGIN_FAILED' as const,
    session_expired: 'SESSION_EXPIRED' as const,
    mfa_challenge: 'MFA_ENABLED' as const,
  };

  const severity = type === 'login_failed' ? 'medium' : 'low';

  await auditAuth(
    eventTypeMap[type],
    userId,
    {
      ip: context.ip,
      userAgent: context.userAgent,
    },
    context.businessId
  );

  // Track failed login patterns
  if (type === 'login_failed') {
    logger.warn('Authentication failure', {
      userId,
      ip: context.ip,
      userAgent: context.userAgent,
      reason: context.failureReason,
      businessId: context.businessId,
    });

    // Could implement brute force detection here
    // await checkBruteForcePatterns(userId, context.ip);
  }
}

// ==========================================
// COMPLIANCE HELPERS
// ==========================================

/**
 * Track GDPR-related events
 */
export async function trackGDPREvent(
  type:
    | 'data_request'
    | 'consent_granted'
    | 'consent_withdrawn'
    | 'data_export'
    | 'data_deletion'
    | 'right_to_be_forgotten',
  request: FastifyRequest,
  details: {
    customerId?: string;
    dataTypes?: string[];
    reason?: string;
    metadata?: Record<string, any>;
  }
): Promise<void> {
  const authRequest = request as AuthenticatedRequest;

  const eventTypeMap = {
    data_request: 'GDPR_REQUEST' as const,
    consent_granted: 'CONSENT_GRANTED' as const,
    consent_withdrawn: 'CONSENT_WITHDRAWN' as const,
    data_export: 'DATA_EXPORT' as const,
    data_deletion: 'DATA_DELETED' as const,
    right_to_be_forgotten: 'RIGHT_TO_BE_FORGOTTEN' as const,
  };

  await auditLog({
    category: 'compliance',
    type: eventTypeMap[type],
    severity: 'medium',
    description: `GDPR ${type.replace('_', ' ')}: ${details.reason || 'User request'}`,
    userId: authRequest.clerkUserId,
    businessId: authRequest.businessId,
    resource: details.customerId
      ? {
          type: 'customer',
          id: details.customerId,
        }
      : undefined,
    context: {
      ip: request.ip,
      userAgent: request.headers['user-agent'],
      endpoint: request.url,
      method: request.method,
    },
    metadata: {
      gdprEventType: type,
      dataTypes: details.dataTypes,
      reason: details.reason,
      ...details.metadata,
    },
    flags: {
      complianceRelevant: true,
      personalData: true,
      requiresReview: type === 'right_to_be_forgotten',
    },
  });

  logger.info('GDPR event recorded', {
    type,
    customerId: details.customerId,
    dataTypes: details.dataTypes,
    userId: authRequest.clerkUserId,
    businessId: authRequest.businessId,
  });
}

// ==========================================
// PERFORMANCE MONITORING
// ==========================================

/**
 * Monitor API endpoint performance
 */
export async function monitorEndpointPerformance(
  request: FastifyRequest,
  startTime: number,
  statusCode: number,
  metadata?: Record<string, any>
): Promise<void> {
  const duration = Date.now() - startTime;
  const authRequest = request as AuthenticatedRequest;

  // Only audit slow requests or errors
  if (duration > 5000 || statusCode >= 400) {
    await auditLog({
      category: 'system_event',
      type: statusCode >= 400 ? 'SYSTEM_ERROR' : 'JOB_COMPLETED',
      severity: statusCode >= 500 ? 'high' : statusCode >= 400 ? 'medium' : 'low',
      description: `API ${request.method} ${request.url} - ${statusCode} (${duration}ms)`,
      userId: authRequest.clerkUserId,
      businessId: authRequest.businessId,
      context: {
        ip: request.ip,
        userAgent: request.headers['user-agent'],
        endpoint: request.url,
        method: request.method,
        statusCode,
        duration,
      },
      metadata: {
        endpointPerformance: true,
        ...metadata,
      },
      flags: {
        requiresReview: duration > 10000 || statusCode >= 500,
      },
    });
  }

  // Log performance metrics
  if (duration > 1000) {
    logger.warn('Slow API request detected', {
      method: request.method,
      url: request.url,
      duration,
      statusCode,
      userId: authRequest.clerkUserId,
      businessId: authRequest.businessId,
    });
  }
}

// ==========================================
// INTEGRATION MONITORING
// ==========================================

/**
 * Track external service integration events
 */
export async function trackIntegrationEvent(
  service: 'twilio' | 'sendgrid' | 'google_places' | 'clerk' | 'stripe',
  operation: string,
  success: boolean,
  duration: number,
  metadata?: Record<string, any>,
  businessId?: string
): Promise<void> {
  await auditLog({
    category: 'system_event',
    type: success ? 'JOB_COMPLETED' : 'INTEGRATION_ERROR',
    severity: success ? 'low' : 'medium',
    description: `${service} ${operation} ${success ? 'completed' : 'failed'} (${duration}ms)`,
    businessId,
    context: {
      duration,
    },
    metadata: {
      integrationService: service,
      operation,
      success,
      ...metadata,
    },
    flags: {
      requiresReview: !success,
    },
  });

  if (!success) {
    logger.error('External service integration failed', {
      service,
      operation,
      duration,
      metadata,
      businessId,
    });
  }
}

// ==========================================
// UTILITY FUNCTIONS
// ==========================================

function generateOperationId(): string {
  return `op_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Create security middleware that automatically tracks requests
 */
export function createSecurityTrackingMiddleware() {
  return async function securityTrackingMiddleware(request: FastifyRequest, reply: any) {
    const startTime = Date.now();
    const requestId = (request as any).id || generateOperationId();

    // Add security headers to request context
    (request as any).securityContext = {
      requestId,
      startTime,
      ip: request.ip,
      userAgent: request.headers['user-agent'],
    };

    // Track on response
    reply.addHook('onSend', async (request: FastifyRequest, reply: any, payload: any) => {
      await monitorEndpointPerformance(request, startTime, reply.statusCode, {
        requestId,
        payloadSize: JSON.stringify(payload).length,
      });
    });
  };
}

/**
 * Batch audit logging for high-volume operations
 */
export class BatchAuditLogger {
  private events: AuditEventData[] = [];
  private batchSize: number = 50;
  private flushInterval: number = 10000; // 10 seconds
  private timer?: NodeJS.Timeout;

  constructor(batchSize: number = 50, flushInterval: number = 10000) {
    this.batchSize = batchSize;
    this.flushInterval = flushInterval;
    this.startTimer();
  }

  addEvent(event: AuditEventData): void {
    this.events.push(event);

    if (this.events.length >= this.batchSize) {
      this.flush();
    }
  }

  async flush(): Promise<void> {
    if (this.events.length === 0) return;

    const events = [...this.events];
    this.events = [];

    try {
      const auditLogger = getAuditLogger();
      await auditLogger.logEventGroup(events);
    } catch (error) {
      logger.error('Batch audit logging failed', {
        eventCount: events.length,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private startTimer(): void {
    this.timer = setInterval(() => {
      this.flush();
    }, this.flushInterval);
  }

  cleanup(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
    this.flush();
  }
}

/**
 * Create batch audit logger for high-volume scenarios
 */
export function createBatchAuditLogger(
  batchSize?: number,
  flushInterval?: number
): BatchAuditLogger {
  return new BatchAuditLogger(batchSize, flushInterval);
}
