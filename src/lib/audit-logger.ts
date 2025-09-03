/**
 * Comprehensive Audit Logging System
 *
 * Centralized audit logging for security events, data access, modifications,
 * and compliance tracking with structured logging and event categorization.
 */

import { prisma } from './prisma';
import { logger } from './logger';

// ==========================================
// AUDIT EVENT TYPES AND CATEGORIES
// ==========================================

export type AuditEventCategory =
  | 'authentication'
  | 'authorization'
  | 'data_access'
  | 'data_modification'
  | 'security_event'
  | 'business_operation'
  | 'compliance'
  | 'system_event';

export type AuditEventType =
  // Authentication events
  | 'LOGIN_SUCCESS'
  | 'LOGIN_FAILED'
  | 'LOGOUT'
  | 'SESSION_EXPIRED'
  | 'PASSWORD_CHANGE'
  | 'MFA_ENABLED'
  | 'MFA_DISABLED'

  // Authorization events
  | 'ACCESS_GRANTED'
  | 'ACCESS_DENIED'
  | 'PERMISSION_CHANGED'
  | 'ROLE_ASSIGNED'
  | 'ROLE_REMOVED'

  // Data access events
  | 'DATA_READ'
  | 'DATA_EXPORT'
  | 'BULK_DATA_ACCESS'
  | 'SENSITIVE_DATA_ACCESS'
  | 'DATA_SEARCH'

  // Data modification events
  | 'DATA_CREATED'
  | 'DATA_UPDATED'
  | 'DATA_DELETED'
  | 'BULK_DATA_IMPORT'
  | 'BULK_DATA_UPDATE'
  | 'BULK_DATA_DELETE'

  // Security events
  | 'RATE_LIMIT_EXCEEDED'
  | 'SUSPICIOUS_ACTIVITY'
  | 'SECURITY_VIOLATION'
  | 'IP_BLOCKED'
  | 'MALICIOUS_REQUEST'
  | 'VALIDATION_FAILED'

  // Business operations
  | 'CAMPAIGN_CREATED'
  | 'CAMPAIGN_SENT'
  | 'CAMPAIGN_CANCELLED'
  | 'CUSTOMER_IMPORTED'
  | 'SUPPRESSION_ADDED'
  | 'CREDIT_CONSUMED'

  // Compliance events
  | 'GDPR_REQUEST'
  | 'DATA_RETENTION_CLEANUP'
  | 'CONSENT_GRANTED'
  | 'CONSENT_WITHDRAWN'
  | 'RIGHT_TO_BE_FORGOTTEN'

  // System events
  | 'SYSTEM_ERROR'
  | 'INTEGRATION_ERROR'
  | 'WEBHOOK_RECEIVED'
  | 'JOB_STARTED'
  | 'JOB_COMPLETED'
  | 'JOB_FAILED';

export interface AuditEventData {
  // Core identification
  businessId?: string;
  userId?: string;
  sessionId?: string;
  requestId?: string;

  // Event classification
  category: AuditEventCategory;
  type: AuditEventType;
  severity: 'low' | 'medium' | 'high' | 'critical';

  // Event details
  description: string;
  resource?: {
    type: string;
    id: string;
    name?: string;
  };

  // Context information
  context: {
    ip?: string;
    userAgent?: string;
    endpoint?: string;
    method?: string;
    statusCode?: number;
    duration?: number;
    location?: string;
  };

  // Event-specific metadata
  metadata?: Record<string, any>;

  // Security flags
  flags?: {
    suspicious?: boolean;
    requiresReview?: boolean;
    complianceRelevant?: boolean;
    personalData?: boolean;
  };

  // Related events
  correlationId?: string;
  parentEventId?: string;
}

export interface AuditQueryOptions {
  businessId?: string;
  userId?: string;
  category?: AuditEventCategory;
  type?: AuditEventType;
  severity?: Array<'low' | 'medium' | 'high' | 'critical'>;
  dateFrom?: Date;
  dateTo?: Date;
  resourceType?: string;
  resourceId?: string;
  suspicious?: boolean;
  page?: number;
  limit?: number;
  correlationId?: string;
}

// ==========================================
// AUDIT LOGGER CLASS
// ==========================================

export class AuditLogger {
  private batchSize: number = 10;
  private flushInterval: number = 5000; // 5 seconds
  private eventQueue: AuditEventData[] = [];
  private flushTimer?: NodeJS.Timeout;

  constructor() {
    // Start periodic flush
    this.startPeriodicFlush();
  }

  /**
   * Log a single audit event
   */
  async logEvent(eventData: AuditEventData): Promise<string | null> {
    try {
      // Generate correlation ID if not provided
      if (!eventData.correlationId) {
        eventData.correlationId = this.generateCorrelationId();
      }

      // Validate event data
      const validationResult = this.validateEventData(eventData);
      if (!validationResult.isValid) {
        logger.error({
          event: 'Invalid audit event data',
          errors: validationResult.errors,
          eventData: { ...eventData, metadata: '[REDACTED]' },
        });
        return null;
      }

      // Add to queue for batch processing
      this.eventQueue.push(eventData);

      // Flush immediately for critical events
      if (eventData.severity === 'critical' || this.eventQueue.length >= this.batchSize) {
        await this.flushEvents();
      }

      // Log to application logger for immediate visibility
      this.logToApplicationLogger(eventData);

      return eventData.correlationId;
    } catch (error) {
      logger.error({
        event: 'Failed to log audit event',
        error: error instanceof Error ? error.message : String(error),
        eventType: eventData.type,
        businessId: eventData.businessId,
      });
      return null;
    }
  }

  /**
   * Log multiple related events with same correlation ID
   */
  async logEventGroup(events: Omit<AuditEventData, 'correlationId'>[]): Promise<string | null> {
    try {
      const correlationId = this.generateCorrelationId();

      const eventPromises = events.map(eventData => this.logEvent({ ...eventData, correlationId }));

      await Promise.all(eventPromises);
      return correlationId;
    } catch (error) {
      logger.error('Failed to log audit event group', {
        error: error instanceof Error ? error.message : String(error),
        eventCount: events.length,
      });
      return null;
    }
  }

  /**
   * Query audit events
   */
  async queryEvents(options: AuditQueryOptions): Promise<{
    events: any[];
    totalCount: number;
    page: number;
    hasNext: boolean;
  }> {
    try {
      const {
        businessId,
        userId,
        category,
        type,
        severity,
        dateFrom,
        dateTo,
        resourceType,
        resourceId,
        suspicious,
        page = 1,
        limit = 50,
        correlationId,
      } = options;

      const offset = (page - 1) * limit;

      // Build where clause
      const where: any = {};

      if (businessId) where.businessId = businessId;
      if (correlationId) where.metadata = { path: ['correlationId'], equals: correlationId };

      // Date range
      if (dateFrom || dateTo) {
        where.createdAt = {};
        if (dateFrom) where.createdAt.gte = dateFrom;
        if (dateTo) where.createdAt.lte = dateTo;
      }

      // Type filtering (using metadata for now since we're using existing events table)
      if (
        category ||
        type ||
        severity ||
        userId ||
        resourceType ||
        resourceId ||
        suspicious !== undefined
      ) {
        const metadataFilters: any = {};

        if (category) metadataFilters.category = category;
        if (type) metadataFilters.eventType = type;
        if (severity) metadataFilters.severity = { in: severity };
        if (userId) metadataFilters.userId = userId;
        if (resourceType) metadataFilters.resourceType = resourceType;
        if (resourceId) metadataFilters.resourceId = resourceId;
        if (suspicious !== undefined) metadataFilters.suspicious = suspicious;

        // This is a simplified approach - in production you'd want proper indexing
        where.metadata = { path: [], contains: metadataFilters };
      }

      // Execute query
      const [events, totalCount] = await Promise.all([
        prisma.event.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: offset,
          take: limit,
          select: {
            id: true,
            type: true,
            source: true,
            description: true,
            metadata: true,
            createdAt: true,
            businessId: true,
            reviewRequestId: true,
          },
        }),
        prisma.event.count({ where }),
      ]);

      return {
        events,
        totalCount,
        page,
        hasNext: offset + limit < totalCount,
      };
    } catch (error) {
      logger.error('Failed to query audit events', {
        error: error instanceof Error ? error.message : String(error),
        options,
      });
      throw error;
    }
  }

  /**
   * Get security summary for business
   */
  async getSecuritySummary(
    businessId: string,
    days: number = 30
  ): Promise<{
    totalEvents: number;
    criticalEvents: number;
    suspiciousEvents: number;
    failedLogins: number;
    accessDenials: number;
    eventsByCategory: Record<string, number>;
    topRisks: Array<{ type: string; count: number; severity: string }>;
  }> {
    try {
      const dateFrom = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

      // Get all security-related events
      const events = await prisma.event.findMany({
        where: {
          businessId,
          createdAt: { gte: dateFrom },
          OR: [
            { source: 'security' },
            { source: 'auth' },
            {
              metadata: {
                path: ['category'],
                in: ['security_event', 'authentication', 'authorization'],
              },
            },
          ],
        },
        select: {
          type: true,
          metadata: true,
          createdAt: true,
        },
      });

      // Analyze events
      const summary = {
        totalEvents: events.length,
        criticalEvents: 0,
        suspiciousEvents: 0,
        failedLogins: 0,
        accessDenials: 0,
        eventsByCategory: {} as Record<string, number>,
        topRisks: [] as Array<{ type: string; count: number; severity: string }>,
      };

      const riskCounts: Record<string, { count: number; severity: string }> = {};

      events.forEach(event => {
        const metadata = event.metadata as any;

        // Count by severity
        if (metadata?.severity === 'critical') summary.criticalEvents++;
        if (metadata?.suspicious) summary.suspiciousEvents++;
        if (metadata?.eventType === 'LOGIN_FAILED') summary.failedLogins++;
        if (metadata?.eventType === 'ACCESS_DENIED') summary.accessDenials++;

        // Count by category
        const category = metadata?.category || 'unknown';
        summary.eventsByCategory[category] = (summary.eventsByCategory[category] || 0) + 1;

        // Track risk types
        const riskType = metadata?.eventType || event.type;
        if (!riskCounts[riskType]) {
          riskCounts[riskType] = { count: 0, severity: metadata?.severity || 'low' };
        }
        riskCounts[riskType].count++;
      });

      // Get top risks
      summary.topRisks = Object.entries(riskCounts)
        .map(([type, data]) => ({ type, ...data }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      return summary;
    } catch (error) {
      logger.error('Failed to get security summary', {
        error: error instanceof Error ? error.message : String(error),
        businessId,
        days,
      });
      throw error;
    }
  }

  /**
   * Generate compliance report
   */
  async generateComplianceReport(
    businessId: string,
    dateFrom: Date,
    dateTo: Date
  ): Promise<{
    period: { from: Date; to: Date };
    dataAccess: { total: number; personalData: number; exports: number };
    dataModifications: { created: number; updated: number; deleted: number };
    gdprEvents: { requests: number; fulfilled: number; pending: number };
    securityIncidents: { total: number; resolved: number; pending: number };
    accessEvents: { successful: number; denied: number; suspicious: number };
  }> {
    try {
      const events = await prisma.event.findMany({
        where: {
          businessId,
          createdAt: { gte: dateFrom, lte: dateTo },
        },
        select: {
          type: true,
          metadata: true,
          createdAt: true,
        },
      });

      const report = {
        period: { from: dateFrom, to: dateTo },
        dataAccess: { total: 0, personalData: 0, exports: 0 },
        dataModifications: { created: 0, updated: 0, deleted: 0 },
        gdprEvents: { requests: 0, fulfilled: 0, pending: 0 },
        securityIncidents: { total: 0, resolved: 0, pending: 0 },
        accessEvents: { successful: 0, denied: 0, suspicious: 0 },
      };

      events.forEach(event => {
        const metadata = event.metadata as any;
        const eventType = metadata?.eventType || event.type;

        // Data access events
        if (metadata?.category === 'data_access') {
          report.dataAccess.total++;
          if (metadata?.flags?.personalData) report.dataAccess.personalData++;
          if (eventType === 'DATA_EXPORT') report.dataAccess.exports++;
        }

        // Data modification events
        if (metadata?.category === 'data_modification') {
          if (eventType === 'DATA_CREATED') report.dataModifications.created++;
          if (eventType === 'DATA_UPDATED') report.dataModifications.updated++;
          if (eventType === 'DATA_DELETED') report.dataModifications.deleted++;
        }

        // GDPR events
        if (metadata?.category === 'compliance') {
          report.gdprEvents.requests++;
          // Would need status tracking in metadata
        }

        // Security incidents
        if (metadata?.category === 'security_event') {
          report.securityIncidents.total++;
          // Would need status tracking
        }

        // Access events
        if (metadata?.category === 'authorization') {
          if (eventType === 'ACCESS_GRANTED') report.accessEvents.successful++;
          if (eventType === 'ACCESS_DENIED') report.accessEvents.denied++;
          if (metadata?.flags?.suspicious) report.accessEvents.suspicious++;
        }
      });

      return report;
    } catch (error) {
      logger.error('Failed to generate compliance report', {
        error: error instanceof Error ? error.message : String(error),
        businessId,
        period: { from: dateFrom, to: dateTo },
      });
      throw error;
    }
  }

  // ==========================================
  // PRIVATE METHODS
  // ==========================================

  private async flushEvents(): Promise<void> {
    if (this.eventQueue.length === 0) return;

    const events = [...this.eventQueue];
    this.eventQueue = [];

    try {
      // Create database events in batch
      const dbEvents = events.map(event => ({
        businessId: event.businessId || null,
        type: 'REQUEST_CREATED', // Map to existing enum or extend
        source: event.category,
        description: event.description,
        metadata: {
          auditEvent: true,
          category: event.category,
          eventType: event.type,
          severity: event.severity,
          userId: event.userId,
          sessionId: event.sessionId,
          requestId: event.requestId,
          resource: event.resource,
          context: event.context,
          flags: event.flags,
          correlationId: event.correlationId,
          parentEventId: event.parentEventId,
          ...event.metadata,
        },
        reviewRequestId: event.resource?.type === 'review_request' ? event.resource.id : null,
      }));

      await prisma.event.createMany({
        data: dbEvents,
      });

      logger.debug('Audit events flushed to database', {
        eventCount: events.length,
      });
    } catch (error) {
      logger.error('Failed to flush audit events', {
        error: error instanceof Error ? error.message : String(error),
        eventCount: events.length,
      });

      // Re-queue events for retry (with limit to prevent infinite growth)
      if (this.eventQueue.length < 1000) {
        this.eventQueue.unshift(...events);
      }
    }
  }

  private validateEventData(eventData: AuditEventData): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!eventData.category) errors.push('Category is required');
    if (!eventData.type) errors.push('Event type is required');
    if (!eventData.severity) errors.push('Severity is required');
    if (!eventData.description) errors.push('Description is required');

    // Validate enums
    const validCategories: AuditEventCategory[] = [
      'authentication',
      'authorization',
      'data_access',
      'data_modification',
      'security_event',
      'business_operation',
      'compliance',
      'system_event',
    ];

    if (eventData.category && !validCategories.includes(eventData.category)) {
      errors.push(`Invalid category: ${eventData.category}`);
    }

    const validSeverities = ['low', 'medium', 'high', 'critical'];
    if (eventData.severity && !validSeverities.includes(eventData.severity)) {
      errors.push(`Invalid severity: ${eventData.severity}`);
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  private logToApplicationLogger(eventData: AuditEventData): void {
    const logLevel = this.getLogLevel(eventData.severity);
    const logData = {
      audit: true,
      category: eventData.category,
      type: eventData.type,
      businessId: eventData.businessId,
      userId: eventData.userId,
      resource: eventData.resource,
      correlationId: eventData.correlationId,
      flags: eventData.flags,
    };

    logger[logLevel](eventData.description, logData);
  }

  private getLogLevel(severity: string): 'debug' | 'info' | 'warn' | 'error' {
    switch (severity) {
      case 'critical':
        return 'error';
      case 'high':
        return 'error';
      case 'medium':
        return 'warn';
      case 'low':
        return 'info';
      default:
        return 'debug';
    }
  }

  private generateCorrelationId(): string {
    return `audit_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  }

  private startPeriodicFlush(): void {
    this.flushTimer = setInterval(() => {
      if (this.eventQueue.length > 0) {
        this.flushEvents().catch(error => {
          logger.error('Periodic audit flush failed', {
            error: error instanceof Error ? error.message : String(error),
          });
        });
      }
    }, this.flushInterval);
  }

  /**
   * Cleanup method to stop periodic flush
   */
  cleanup(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = undefined;
    }

    // Flush remaining events
    this.flushEvents().catch(error => {
      logger.error('Final audit flush failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }
}

// ==========================================
// SINGLETON INSTANCE AND CONVENIENCE FUNCTIONS
// ==========================================

let globalAuditLogger: AuditLogger | null = null;

/**
 * Get global audit logger instance
 */
export function getAuditLogger(): AuditLogger {
  if (!globalAuditLogger) {
    globalAuditLogger = new AuditLogger();
  }
  return globalAuditLogger;
}

/**
 * Quick audit logging function
 */
export async function auditLog(eventData: AuditEventData): Promise<string | null> {
  const auditLogger = getAuditLogger();
  return auditLogger.logEvent(eventData);
}

/**
 * Log authentication event
 */
export async function auditAuth(
  type: 'LOGIN_SUCCESS' | 'LOGIN_FAILED' | 'LOGOUT' | 'SESSION_EXPIRED',
  userId: string,
  context: { ip: string; userAgent?: string },
  businessId?: string
): Promise<string | null> {
  return auditLog({
    category: 'authentication',
    type,
    severity: type === 'LOGIN_FAILED' ? 'medium' : 'low',
    description: `User ${type.toLowerCase().replace('_', ' ')}`,
    userId,
    businessId,
    context,
    flags: {
      suspicious: type === 'LOGIN_FAILED',
    },
  });
}

/**
 * Log data access event
 */
export async function auditDataAccess(
  resource: { type: string; id: string; name?: string },
  userId: string,
  businessId: string,
  context: { endpoint: string; method: string; ip: string },
  metadata?: any
): Promise<string | null> {
  return auditLog({
    category: 'data_access',
    type: 'DATA_READ',
    severity: 'low',
    description: `Accessed ${resource.type} ${resource.id}`,
    userId,
    businessId,
    resource,
    context,
    metadata,
    flags: {
      personalData: ['customer', 'review_request'].includes(resource.type),
    },
  });
}

/**
 * Log security event
 */
export async function auditSecurity(
  type: AuditEventType,
  description: string,
  severity: 'low' | 'medium' | 'high' | 'critical',
  context: { ip: string; endpoint?: string; userAgent?: string },
  userId?: string,
  businessId?: string,
  metadata?: any
): Promise<string | null> {
  return auditLog({
    category: 'security_event',
    type,
    severity,
    description,
    userId,
    businessId,
    context,
    metadata,
    flags: {
      suspicious: true,
      requiresReview: severity === 'critical',
    },
  });
}

/**
 * Cleanup audit logger
 */
export function cleanupAuditLogger(): void {
  if (globalAuditLogger) {
    globalAuditLogger.cleanup();
    globalAuditLogger = null;
  }
}
