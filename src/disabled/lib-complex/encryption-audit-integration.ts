/**
 * Encryption Audit Logging Integration
 *
 * Enhanced audit logging specifically for encryption operations,
 * compliance reporting, and security monitoring of PII encryption system.
 */

import { logger } from './logger';
import { auditLog, getAuditLogger, type AuditEventData } from './audit-logger';
import { getEncryptionService } from './encryption';
import { getSearchableEncryptionService } from './searchable-encryption';
import { getEncryptionCache, getPerformanceMonitor } from './encryption-performance';
import { getMigrationOrchestrator } from './encryption-migration';

// ==========================================
// ENCRYPTION-SPECIFIC AUDIT TYPES
// ==========================================

export type EncryptionAuditEventType =
  | 'PII_FIELD_ENCRYPTED'
  | 'PII_FIELD_DECRYPTED'
  | 'PII_BATCH_ENCRYPTED'
  | 'PII_BATCH_DECRYPTED'
  | 'ENCRYPTION_KEY_ROTATED'
  | 'ENCRYPTION_CACHE_ACCESSED'
  | 'ENCRYPTION_PERFORMANCE_ALERT'
  | 'ENCRYPTION_MIGRATION_STARTED'
  | 'ENCRYPTION_MIGRATION_COMPLETED'
  | 'ENCRYPTION_MIGRATION_FAILED'
  | 'ENCRYPTION_INTEGRITY_CHECK'
  | 'ENCRYPTION_POLICY_VIOLATION'
  | 'ENCRYPTION_SERVICE_ERROR';

export interface EncryptionAuditContext {
  // Operation context
  operationType: 'encrypt' | 'decrypt' | 'search' | 'migrate' | 'manage';
  fieldName?: string;
  fieldType?: 'firstName' | 'lastName' | 'email' | 'phone';

  // Security context
  keyVersion: number;
  algorithm: string;

  // Performance context
  operationDuration: number;
  cacheHit?: boolean;
  batchSize?: number;

  // Data context
  businessId: string;
  customerId?: string;
  recordCount?: number;

  // Compliance context
  gdprRelevant: boolean;
  dataResidency?: string;
  retentionPeriod?: number;
}

export interface EncryptionComplianceReport {
  reportId: string;
  businessId: string;
  reportPeriod: {
    startDate: Date;
    endDate: Date;
  };

  // Encryption metrics
  encryptionMetrics: {
    totalEncryptions: number;
    totalDecryptions: number;
    averageOperationTime: number;
    errorRate: number;
  };

  // Data protection metrics
  dataProtectionMetrics: {
    piiRecordsEncrypted: number;
    encryptedDataAccess: number;
    unauthorizedAccessAttempts: number;
    keyRotations: number;
  };

  // Compliance events
  complianceEvents: {
    gdprRequests: number;
    dataExports: number;
    rightToBeErasedRequests: number;
    consentWithdrawals: number;
  };

  // Security incidents
  securityIncidents: {
    encryptionFailures: number;
    decryptionFailures: number;
    integrityCheckFailures: number;
    suspiciousAccess: number;
  };

  // Risk assessment
  riskAssessment: {
    overallRiskLevel: 'low' | 'medium' | 'high' | 'critical';
    riskFactors: string[];
    recommendations: string[];
  };
}

// ==========================================
// ENHANCED ENCRYPTION AUDIT LOGGER
// ==========================================

export class EncryptionAuditLogger {
  private auditLogger = getAuditLogger();
  private encryptionService = getEncryptionService();
  private performanceMonitor = getPerformanceMonitor();

  /**
   * Log encryption operation with enhanced context
   */
  async logEncryptionOperation(
    eventType: EncryptionAuditEventType,
    context: EncryptionAuditContext,
    additionalMetadata?: Record<string, any>
  ): Promise<void> {
    try {
      // Determine severity based on event type
      const severity = this.getEventSeverity(eventType);

      // Build audit event
      const auditEvent: AuditEventData = {
        category: 'data_modification',
        type: 'PII_ENCRYPTED',
        severity,
        description: this.buildEventDescription(eventType, context),
        businessId: context.businessId,
        metadata: {
          encryptionAudit: true,
          eventType,
          operationType: context.operationType,
          fieldName: context.fieldName,
          fieldType: context.fieldType,
          keyVersion: context.keyVersion,
          algorithm: context.algorithm,
          operationDuration: context.operationDuration,
          cacheHit: context.cacheHit,
          batchSize: context.batchSize,
          recordCount: context.recordCount,
          performanceMetrics: this.getPerformanceSnapshot(),
          ...additionalMetadata,
        },
        flags: {
          personalData: true,
          complianceRelevant: context.gdprRelevant,
          suspicious: this.isSuspiciousActivity(eventType, context),
        },
      };

      // Log the audit event
      await this.auditLogger.logEvent(auditEvent);

      // Additional processing for specific event types
      await this.handleSpecialEventTypes(eventType, context, auditEvent);
    } catch (error) {
      logger.error('Encryption audit logging failed', {
        eventType,
        context,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Log field-level encryption activity
   */
  async logFieldEncryption(
    fieldName: string,
    fieldType: 'firstName' | 'lastName' | 'email' | 'phone',
    operation: 'encrypt' | 'decrypt',
    context: {
      businessId: string;
      customerId: string;
      keyVersion: number;
      duration: number;
      cacheHit?: boolean;
      userId?: string;
    }
  ): Promise<void> {
    await this.logEncryptionOperation(
      operation === 'encrypt' ? 'PII_FIELD_ENCRYPTED' : 'PII_FIELD_DECRYPTED',
      {
        operationType: operation,
        fieldName,
        fieldType,
        keyVersion: context.keyVersion,
        algorithm: 'aes-256-gcm',
        operationDuration: context.duration,
        cacheHit: context.cacheHit,
        businessId: context.businessId,
        customerId: context.customerId,
        gdprRelevant: true,
      },
      {
        userId: context.userId,
        timestamp: new Date().toISOString(),
      }
    );
  }

  /**
   * Log batch encryption operations
   */
  async logBatchEncryption(
    operation: 'encrypt' | 'decrypt',
    context: {
      businessId: string;
      recordCount: number;
      batchSize: number;
      duration: number;
      successCount: number;
      errorCount: number;
      userId?: string;
    }
  ): Promise<void> {
    await this.logEncryptionOperation(
      operation === 'encrypt' ? 'PII_BATCH_ENCRYPTED' : 'PII_BATCH_DECRYPTED',
      {
        operationType: operation,
        keyVersion: 1, // Current version
        algorithm: 'aes-256-gcm',
        operationDuration: context.duration,
        batchSize: context.batchSize,
        businessId: context.businessId,
        recordCount: context.recordCount,
        gdprRelevant: true,
      },
      {
        successCount: context.successCount,
        errorCount: context.errorCount,
        errorRate: context.errorCount / context.recordCount,
        userId: context.userId,
        bulkOperation: true,
      }
    );
  }

  /**
   * Log encryption key rotation
   */
  async logKeyRotation(
    oldVersion: number,
    newVersion: number,
    reason: string,
    context: {
      initiatedBy?: string;
      automated?: boolean;
      affectedRecords?: number;
    }
  ): Promise<void> {
    await this.logEncryptionOperation(
      'ENCRYPTION_KEY_ROTATED',
      {
        operationType: 'manage',
        keyVersion: newVersion,
        algorithm: 'aes-256-gcm',
        operationDuration: 0,
        businessId: 'system',
        gdprRelevant: true,
      },
      {
        oldVersion,
        newVersion,
        reason,
        initiatedBy: context.initiatedBy,
        automated: context.automated,
        affectedRecords: context.affectedRecords,
        securityCritical: true,
      }
    );
  }

  /**
   * Log encryption migration events
   */
  async logMigrationEvent(
    eventType: 'started' | 'completed' | 'failed',
    migrationId: string,
    context: {
      businessId?: string;
      totalRecords: number;
      processedRecords: number;
      duration?: number;
      errorCount?: number;
    }
  ): Promise<void> {
    const auditEventType =
      eventType === 'started'
        ? 'ENCRYPTION_MIGRATION_STARTED'
        : eventType === 'completed'
          ? 'ENCRYPTION_MIGRATION_COMPLETED'
          : 'ENCRYPTION_MIGRATION_FAILED';

    await this.logEncryptionOperation(
      auditEventType,
      {
        operationType: 'migrate',
        keyVersion: 1,
        algorithm: 'aes-256-gcm',
        operationDuration: context.duration || 0,
        businessId: context.businessId || 'system',
        recordCount: context.totalRecords,
        gdprRelevant: true,
      },
      {
        migrationId,
        eventType,
        totalRecords: context.totalRecords,
        processedRecords: context.processedRecords,
        errorCount: context.errorCount,
        migrationStatus: eventType,
      }
    );
  }

  /**
   * Generate encryption compliance report
   */
  async generateComplianceReport(
    businessId: string,
    startDate: Date,
    endDate: Date
  ): Promise<EncryptionComplianceReport> {
    try {
      // Query encryption-related audit events
      const events = await this.auditLogger.queryEvents({
        businessId,
        dateFrom: startDate,
        dateTo: endDate,
        category: 'data_modification',
      });

      // Filter encryption events
      const encryptionEvents = events.events.filter(
        event => event.metadata && (event.metadata as any).encryptionAudit === true
      );

      // Calculate metrics
      const encryptionOps = encryptionEvents.filter(e =>
        ['PII_FIELD_ENCRYPTED', 'PII_BATCH_ENCRYPTED'].includes((e.metadata as any).eventType)
      );
      const decryptionOps = encryptionEvents.filter(e =>
        ['PII_FIELD_DECRYPTED', 'PII_BATCH_DECRYPTED'].includes((e.metadata as any).eventType)
      );

      const encryptionMetrics = {
        totalEncryptions: encryptionOps.length,
        totalDecryptions: decryptionOps.length,
        averageOperationTime: this.calculateAverageOperationTime(encryptionEvents),
        errorRate: this.calculateErrorRate(encryptionEvents),
      };

      // Data protection metrics
      const dataProtectionMetrics = {
        piiRecordsEncrypted: this.countPIIRecordsEncrypted(encryptionEvents),
        encryptedDataAccess: decryptionOps.length,
        unauthorizedAccessAttempts: this.countUnauthorizedAccess(encryptionEvents),
        keyRotations: encryptionEvents.filter(
          e => (e.metadata as any).eventType === 'ENCRYPTION_KEY_ROTATED'
        ).length,
      };

      // Compliance events (would integrate with existing GDPR audit events)
      const complianceEvents = {
        gdprRequests: 0,
        dataExports: 0,
        rightToBeErasedRequests: 0,
        consentWithdrawals: 0,
      };

      // Security incidents
      const securityIncidents = {
        encryptionFailures: encryptionEvents.filter(
          e =>
            (e.metadata as any).eventType === 'ENCRYPTION_SERVICE_ERROR' &&
            (e.metadata as any).operationType === 'encrypt'
        ).length,
        decryptionFailures: encryptionEvents.filter(
          e =>
            (e.metadata as any).eventType === 'ENCRYPTION_SERVICE_ERROR' &&
            (e.metadata as any).operationType === 'decrypt'
        ).length,
        integrityCheckFailures: encryptionEvents.filter(
          e => (e.metadata as any).eventType === 'ENCRYPTION_INTEGRITY_CHECK'
        ).length,
        suspiciousAccess: encryptionEvents.filter(e => (e.flags as any)?.suspicious === true)
          .length,
      };

      // Risk assessment
      const riskAssessment = this.performRiskAssessment({
        encryptionMetrics,
        dataProtectionMetrics,
        securityIncidents,
      });

      const report: EncryptionComplianceReport = {
        reportId: `enc_report_${Date.now()}`,
        businessId,
        reportPeriod: { startDate, endDate },
        encryptionMetrics,
        dataProtectionMetrics,
        complianceEvents,
        securityIncidents,
        riskAssessment,
      };

      // Audit report generation
      await auditLog({
        category: 'compliance',
        type: 'DATA_EXPORT',
        severity: 'medium',
        description: 'Encryption compliance report generated',
        businessId,
        metadata: {
          reportId: report.reportId,
          reportPeriod: report.reportPeriod,
          eventCount: encryptionEvents.length,
        },
        flags: {
          complianceRelevant: true,
        },
      });

      return report;
    } catch (error) {
      logger.error('Compliance report generation failed', {
        businessId,
        startDate,
        endDate,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  // ==========================================
  // PRIVATE HELPER METHODS
  // ==========================================

  private getEventSeverity(
    eventType: EncryptionAuditEventType
  ): 'low' | 'medium' | 'high' | 'critical' {
    const severityMap: Record<EncryptionAuditEventType, 'low' | 'medium' | 'high' | 'critical'> = {
      PII_FIELD_ENCRYPTED: 'low',
      PII_FIELD_DECRYPTED: 'low',
      PII_BATCH_ENCRYPTED: 'medium',
      PII_BATCH_DECRYPTED: 'medium',
      ENCRYPTION_KEY_ROTATED: 'high',
      ENCRYPTION_CACHE_ACCESSED: 'low',
      ENCRYPTION_PERFORMANCE_ALERT: 'medium',
      ENCRYPTION_MIGRATION_STARTED: 'high',
      ENCRYPTION_MIGRATION_COMPLETED: 'medium',
      ENCRYPTION_MIGRATION_FAILED: 'high',
      ENCRYPTION_INTEGRITY_CHECK: 'medium',
      ENCRYPTION_POLICY_VIOLATION: 'high',
      ENCRYPTION_SERVICE_ERROR: 'high',
    };

    return severityMap[eventType] || 'medium';
  }

  private buildEventDescription(
    eventType: EncryptionAuditEventType,
    context: EncryptionAuditContext
  ): string {
    const descriptions: Record<EncryptionAuditEventType, string> = {
      PII_FIELD_ENCRYPTED: `${context.fieldType} field encrypted for customer`,
      PII_FIELD_DECRYPTED: `${context.fieldType} field decrypted for customer`,
      PII_BATCH_ENCRYPTED: `Batch encryption of ${context.recordCount} records`,
      PII_BATCH_DECRYPTED: `Batch decryption of ${context.recordCount} records`,
      ENCRYPTION_KEY_ROTATED: 'Encryption key rotated',
      ENCRYPTION_CACHE_ACCESSED: 'Encryption cache accessed',
      ENCRYPTION_PERFORMANCE_ALERT: 'Encryption performance alert triggered',
      ENCRYPTION_MIGRATION_STARTED: 'PII encryption migration started',
      ENCRYPTION_MIGRATION_COMPLETED: 'PII encryption migration completed',
      ENCRYPTION_MIGRATION_FAILED: 'PII encryption migration failed',
      ENCRYPTION_INTEGRITY_CHECK: 'Encryption integrity check performed',
      ENCRYPTION_POLICY_VIOLATION: 'Encryption policy violation detected',
      ENCRYPTION_SERVICE_ERROR: 'Encryption service error occurred',
    };

    return descriptions[eventType] || 'Encryption operation performed';
  }

  private getPerformanceSnapshot(): any {
    try {
      return this.performanceMonitor.getMetrics();
    } catch (error) {
      return { error: 'Performance metrics unavailable' };
    }
  }

  private isSuspiciousActivity(
    eventType: EncryptionAuditEventType,
    context: EncryptionAuditContext
  ): boolean {
    // Define suspicious activity patterns
    const suspiciousPatterns = [
      // High frequency access from single source
      context.operationDuration > 5000, // Very slow operations
      eventType === 'ENCRYPTION_POLICY_VIOLATION',
      eventType === 'ENCRYPTION_SERVICE_ERROR',
      // Large batch operations outside business hours
      context.batchSize && context.batchSize > 1000,
    ];

    return suspiciousPatterns.some(pattern => pattern);
  }

  private async handleSpecialEventTypes(
    eventType: EncryptionAuditEventType,
    context: EncryptionAuditContext,
    auditEvent: AuditEventData
  ): Promise<void> {
    // Handle specific event types that need additional processing
    switch (eventType) {
      case 'ENCRYPTION_PERFORMANCE_ALERT':
        // Could trigger alerting systems
        logger.warn('Encryption performance alert', { context, auditEvent });
        break;

      case 'ENCRYPTION_POLICY_VIOLATION':
        // Could trigger security team notifications
        logger.error('Encryption policy violation', { context, auditEvent });
        break;

      case 'ENCRYPTION_SERVICE_ERROR':
        // Could trigger operational alerts
        logger.error('Encryption service error', { context, auditEvent });
        break;
    }
  }

  private calculateAverageOperationTime(events: any[]): number {
    const operationTimes = events
      .map(e => (e.metadata as any)?.operationDuration)
      .filter(duration => typeof duration === 'number');

    return operationTimes.length > 0
      ? operationTimes.reduce((a, b) => a + b, 0) / operationTimes.length
      : 0;
  }

  private calculateErrorRate(events: any[]): number {
    const errorEvents = events.filter(
      e => (e.metadata as any)?.eventType === 'ENCRYPTION_SERVICE_ERROR'
    );

    return events.length > 0 ? errorEvents.length / events.length : 0;
  }

  private countPIIRecordsEncrypted(events: any[]): number {
    return events.filter(e => (e.metadata as any)?.eventType === 'PII_FIELD_ENCRYPTED').length;
  }

  private countUnauthorizedAccess(events: any[]): number {
    return events.filter(e => (e.flags as any)?.suspicious === true).length;
  }

  private performRiskAssessment(metrics: {
    encryptionMetrics: any;
    dataProtectionMetrics: any;
    securityIncidents: any;
  }): EncryptionComplianceReport['riskAssessment'] {
    const riskFactors: string[] = [];
    let riskLevel: 'low' | 'medium' | 'high' | 'critical' = 'low';

    // Evaluate risk factors
    if (metrics.encryptionMetrics.errorRate > 0.05) {
      riskFactors.push('High encryption error rate');
      riskLevel = 'medium';
    }

    if (metrics.securityIncidents.suspiciousAccess > 0) {
      riskFactors.push('Suspicious access attempts detected');
      riskLevel = 'high';
    }

    if (metrics.securityIncidents.integrityCheckFailures > 0) {
      riskFactors.push('Integrity check failures detected');
      riskLevel = 'critical';
    }

    // Generate recommendations
    const recommendations: string[] = [];
    if (riskFactors.length > 0) {
      recommendations.push('Review encryption operation logs');
      recommendations.push('Monitor encryption performance metrics');
    }

    if (metrics.dataProtectionMetrics.keyRotations === 0) {
      recommendations.push('Consider implementing regular key rotation');
    }

    return {
      overallRiskLevel: riskLevel,
      riskFactors,
      recommendations,
    };
  }
}

// ==========================================
// SINGLETON INSTANCE
// ==========================================

let globalEncryptionAuditLogger: EncryptionAuditLogger | null = null;

/**
 * Get global encryption audit logger instance
 */
export function getEncryptionAuditLogger(): EncryptionAuditLogger {
  if (!globalEncryptionAuditLogger) {
    globalEncryptionAuditLogger = new EncryptionAuditLogger();
  }
  return globalEncryptionAuditLogger;
}
