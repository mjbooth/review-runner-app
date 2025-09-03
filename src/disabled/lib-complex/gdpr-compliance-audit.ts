/**
 * GDPR Compliance-Enhanced Audit Trail System
 *
 * Comprehensive audit logging system with tamper-proof integrity,
 * cross-system correlation, and specialized GDPR compliance tracking.
 */

import { prisma } from './prisma';
import { logger } from './logger';
import { auditLog as baseAuditLog, type AuditEventData } from './audit-logger';
import crypto from 'crypto';
import { getEncryptionAuditLogger } from './encryption-audit-integration';

// ==========================================
// COMPLIANCE AUDIT TYPES
// ==========================================

export type ComplianceEventType =
  | 'DATA_PROCESSED' // Any personal data processing
  | 'CONSENT_GIVEN' // User consent recorded
  | 'CONSENT_WITHDRAWN' // User consent withdrawn
  | 'CONSENT_UPDATED' // Consent preferences changed
  | 'DATA_EXPORTED' // Personal data exported
  | 'DATA_DELETED' // Personal data deleted
  | 'DATA_ANONYMIZED' // Personal data anonymized
  | 'DATA_RECTIFIED' // Personal data corrected
  | 'DATA_RESTRICTED' // Data processing restricted
  | 'BREACH_DETECTED' // Data breach detected
  | 'BREACH_NOTIFIED' // Data breach notification sent
  | 'GDPR_REQUEST_SUBMITTED' // Data subject request received
  | 'GDPR_REQUEST_PROCESSED' // Data subject request completed
  | 'CROSS_BORDER_TRANSFER' // International data transfer
  | 'AUTOMATED_DECISION' // Automated decision making
  | 'PROFILING_ACTIVITY' // Customer profiling activity
  | 'THIRD_PARTY_SHARING' // Data shared with third parties
  | 'RETENTION_POLICY_APPLIED' // Data retention policy executed
  | 'LEGAL_BASIS_CHANGED' // Legal basis for processing changed
  | 'DPO_CONSULTATION' // Data Protection Officer consulted
  | 'IMPACT_ASSESSMENT'; // Data Protection Impact Assessment

export type ProcessingLawfulness =
  | 'CONSENT' // Article 6(1)(a) - Consent
  | 'CONTRACT' // Article 6(1)(b) - Contract performance
  | 'LEGAL_OBLIGATION' // Article 6(1)(c) - Legal obligation
  | 'VITAL_INTERESTS' // Article 6(1)(d) - Vital interests
  | 'PUBLIC_TASK' // Article 6(1)(e) - Public task
  | 'LEGITIMATE_INTERESTS'; // Article 6(1)(f) - Legitimate interests

export interface ComplianceAuditEvent {
  id: string;
  businessId: string;

  // Event classification
  eventType: ComplianceEventType;
  category: 'PROCESSING' | 'CONSENT' | 'RIGHTS' | 'SECURITY' | 'GOVERNANCE';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

  // Data subject information
  dataSubjectId?: string; // Customer ID if applicable
  dataSubjectType: 'CUSTOMER' | 'EMPLOYEE' | 'PROSPECT' | 'VISITOR' | 'OTHER';

  // Processing details
  processingPurpose: string;
  legalBasis: ProcessingLawfulness;
  dataCategories: string[]; // Types of personal data involved
  recipients?: string[]; // Who received the data

  // Geographic and jurisdictional
  processingLocation: string; // Country/region where processing occurred
  crossBorderTransfer?: {
    toCountry: string;
    adequacyDecision: boolean;
    safeguards?: string;
    derogation?: string;
  };

  // Technical details
  systemId: string; // Which system/component
  sessionId?: string; // User session if applicable
  ipAddress?: string;
  userAgent?: string;

  // Event context
  triggeredBy: string; // User ID or system identifier
  automated: boolean;
  description: string;

  // Compliance metadata
  retentionPeriod: number; // Days to retain this audit record
  specialCategory: boolean; // Sensitive personal data involved
  childData: boolean; // Data of persons under 16

  // Correlation and traceability
  correlationId: string; // Groups related events
  parentEventId?: string; // Links to parent event
  requestId?: string; // Links to GDPR request

  // Integrity protection
  eventHash: string; // Tamper detection
  previousHash?: string; // Chain to previous event
  digitalSignature?: string; // Optional cryptographic signature

  // Timing
  timestamp: Date;
  processedAt?: Date;

  // Additional metadata
  metadata: Record<string, any>;

  isActive: boolean;
  createdAt: Date;
}

export interface AuditChain {
  businessId: string;
  chainId: string;
  startHash: string;
  currentHash: string;
  eventCount: number;
  lastEventId: string;
  lastEventTimestamp: Date;
  integrityVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ComplianceReport {
  reportId: string;
  businessId: string;
  reportType:
    | 'PROCESSING_ACTIVITY'
    | 'DATA_BREACH'
    | 'GDPR_COMPLIANCE'
    | 'CONSENT_AUDIT'
    | 'DATA_FLOW';

  // Report period
  periodStart: Date;
  periodEnd: Date;

  // Report data
  eventCount: number;
  dataSubjectsAffected: number;
  processingActivities: Array<{
    purpose: string;
    legalBasis: ProcessingLawfulness;
    dataCategories: string[];
    eventCount: number;
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  }>;

  // Compliance metrics
  complianceMetrics: {
    consentRate: number;
    requestResponseTime: number;
    breachNotificationTime?: number;
    dataMinimizationScore: number;
    retentionComplianceRate: number;
  };

  // Risk assessment
  identifiedRisks: Array<{
    riskType: string;
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    description: string;
    recommendation: string;
  }>;

  // Summary
  executiveSummary: string;
  recommendations: string[];

  generatedAt: Date;
  generatedBy: string;
}

// ==========================================
// COMPLIANCE AUDIT SERVICE
// ==========================================

export class GDPRComplianceAuditService {
  private encryptionAudit = getEncryptionAuditLogger();
  private auditChains: Map<string, string> = new Map(); // businessId -> currentHash

  // Compliance configuration
  private readonly config = {
    integrityCheckEnabled: process.env.AUDIT_INTEGRITY_CHECK === 'true',
    digitalSignatureEnabled: process.env.AUDIT_DIGITAL_SIGNATURE === 'true',
    maxEventsPerChain: parseInt(process.env.AUDIT_MAX_EVENTS_PER_CHAIN || '10000'),
    defaultRetentionDays: parseInt(process.env.AUDIT_RETENTION_DAYS || '2555'), // 7 years
    crossSystemCorrelation: process.env.AUDIT_CROSS_SYSTEM_CORRELATION === 'true',
  };

  constructor() {
    this.initializeAuditChains();
  }

  /**
   * Log GDPR compliance event with enhanced audit trail
   */
  async logComplianceEvent(
    event: Omit<
      ComplianceAuditEvent,
      | 'id'
      | 'eventHash'
      | 'previousHash'
      | 'digitalSignature'
      | 'timestamp'
      | 'isActive'
      | 'createdAt'
    >
  ): Promise<{
    success: boolean;
    eventId?: string;
    auditHash?: string;
    message?: string;
    errors?: string[];
  }> {
    const eventId = crypto.randomUUID();
    const timestamp = new Date();

    try {
      // Get previous hash for chain integrity
      const previousHash = await this.getCurrentChainHash(event.businessId);

      // Calculate event hash for tamper detection
      const eventData = {
        ...event,
        id: eventId,
        timestamp,
      };
      const eventHash = this.calculateEventHash(eventData, previousHash);

      // Generate digital signature if enabled
      let digitalSignature: string | undefined;
      if (this.config.digitalSignatureEnabled) {
        digitalSignature = this.generateDigitalSignature(eventData, eventHash);
      }

      // Create complete audit event
      const complianceEvent: Omit<ComplianceAuditEvent, 'createdAt'> = {
        ...eventData,
        eventHash,
        previousHash,
        digitalSignature,
        isActive: true,
      };

      // Store in database
      await prisma.complianceAuditEvent.create({
        data: complianceEvent as any,
      });

      // Update audit chain
      await this.updateAuditChain(event.businessId, eventId, eventHash, timestamp);

      // Log to base audit system for cross-correlation
      await this.logToBaseAuditSystem(complianceEvent);

      // Special handling for high-severity events
      if (event.severity === 'CRITICAL' || event.severity === 'HIGH') {
        await this.handleHighSeverityEvent(complianceEvent);
      }

      // Trigger compliance-specific processing
      await this.triggerComplianceProcessing(complianceEvent);

      logger.info('Compliance audit event logged', {
        eventId,
        businessId: event.businessId,
        eventType: event.eventType,
        severity: event.severity,
        dataSubjectId: event.dataSubjectId,
        legalBasis: event.legalBasis,
      });

      return {
        success: true,
        eventId,
        auditHash: eventHash,
        message: 'Compliance event logged successfully',
      };
    } catch (error) {
      logger.error('Compliance audit event logging failed', {
        eventType: event.eventType,
        businessId: event.businessId,
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        success: false,
        errors: [error instanceof Error ? error.message : String(error)],
      };
    }
  }

  /**
   * Verify audit trail integrity
   */
  async verifyAuditIntegrity(
    businessId: string,
    options?: {
      fromDate?: Date;
      toDate?: Date;
      eventIds?: string[];
      fullChainVerification?: boolean;
    }
  ): Promise<{
    verified: boolean;
    checkedEvents: number;
    corruptEvents: string[];
    brokenChains: string[];
    integrityScore: number;
    details: {
      hashVerification: { passed: number; failed: number };
      signatureVerification?: { passed: number; failed: number };
      chainContinuity: { gaps: number; totalChecked: number };
    };
  }> {
    try {
      // Build query conditions
      const where: any = { businessId, isActive: true };
      if (options?.fromDate) where.timestamp = { gte: options.fromDate };
      if (options?.toDate) {
        where.timestamp = where.timestamp || {};
        where.timestamp.lte = options.toDate;
      }
      if (options?.eventIds) where.id = { in: options.eventIds };

      // Get events to verify
      const events = await prisma.complianceAuditEvent.findMany({
        where,
        orderBy: { timestamp: 'asc' },
      });

      let checkedEvents = 0;
      let hashVerificationPassed = 0;
      let hashVerificationFailed = 0;
      let signatureVerificationPassed = 0;
      let signatureVerificationFailed = 0;
      let chainGaps = 0;

      const corruptEvents: string[] = [];
      const brokenChains: string[] = [];
      let previousEvent: any = null;

      for (const event of events) {
        checkedEvents++;

        // Verify event hash
        const expectedHash = this.calculateEventHash(event, event.previousHash || '');
        if (expectedHash === event.eventHash) {
          hashVerificationPassed++;
        } else {
          hashVerificationFailed++;
          corruptEvents.push(event.id);
        }

        // Verify digital signature if present
        if (event.digitalSignature && this.config.digitalSignatureEnabled) {
          if (this.verifyDigitalSignature(event, event.eventHash, event.digitalSignature)) {
            signatureVerificationPassed++;
          } else {
            signatureVerificationFailed++;
            corruptEvents.push(event.id);
          }
        }

        // Check chain continuity
        if (previousEvent && event.previousHash !== previousEvent.eventHash) {
          chainGaps++;
          brokenChains.push(`${previousEvent.id} -> ${event.id}`);
        }

        previousEvent = event;
      }

      // Calculate integrity score
      const totalChecks = hashVerificationPassed + hashVerificationFailed;
      const integrityScore =
        totalChecks > 0 ? Math.round((hashVerificationPassed / totalChecks) * 100) : 100;

      const verified = corruptEvents.length === 0 && brokenChains.length === 0;

      // Log verification results
      await this.logComplianceEvent({
        businessId,
        eventType: 'IMPACT_ASSESSMENT',
        category: 'GOVERNANCE',
        severity: verified ? 'LOW' : 'HIGH',
        dataSubjectType: 'OTHER',
        processingPurpose: 'Audit trail integrity verification',
        legalBasis: 'LEGAL_OBLIGATION',
        dataCategories: ['audit_logs'],
        processingLocation: 'UK',
        systemId: 'audit_system',
        triggeredBy: 'system',
        automated: true,
        description: `Audit integrity verification: ${verified ? 'PASSED' : 'FAILED'}`,
        retentionPeriod: this.config.defaultRetentionDays,
        specialCategory: false,
        childData: false,
        correlationId: crypto.randomUUID(),
        metadata: {
          verificationResults: {
            verified,
            checkedEvents,
            corruptEvents: corruptEvents.length,
            integrityScore,
          },
        },
      });

      return {
        verified,
        checkedEvents,
        corruptEvents,
        brokenChains,
        integrityScore,
        details: {
          hashVerification: {
            passed: hashVerificationPassed,
            failed: hashVerificationFailed,
          },
          signatureVerification: this.config.digitalSignatureEnabled
            ? {
                passed: signatureVerificationPassed,
                failed: signatureVerificationFailed,
              }
            : undefined,
          chainContinuity: {
            gaps: chainGaps,
            totalChecked: checkedEvents - 1, // -1 because first event has no previous
          },
        },
      };
    } catch (error) {
      logger.error('Audit integrity verification failed', {
        businessId,
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        verified: false,
        checkedEvents: 0,
        corruptEvents: [],
        brokenChains: [],
        integrityScore: 0,
        details: {
          hashVerification: { passed: 0, failed: 0 },
          chainContinuity: { gaps: 0, totalChecked: 0 },
        },
      };
    }
  }

  /**
   * Generate comprehensive compliance report
   */
  async generateComplianceReport(
    businessId: string,
    reportType: ComplianceReport['reportType'],
    periodStart: Date,
    periodEnd: Date,
    options?: {
      includeRecommendations?: boolean;
      detailedAnalysis?: boolean;
      exportFormat?: 'JSON' | 'PDF' | 'CSV';
    }
  ): Promise<ComplianceReport> {
    try {
      const reportId = crypto.randomUUID();

      // Get compliance events for the period
      const events = await prisma.complianceAuditEvent.findMany({
        where: {
          businessId,
          timestamp: {
            gte: periodStart,
            lte: periodEnd,
          },
          isActive: true,
        },
        orderBy: { timestamp: 'asc' },
      });

      // Calculate processing activities
      const processingActivities = this.analyzeProcessingActivities(events);

      // Calculate compliance metrics
      const complianceMetrics = await this.calculateComplianceMetrics(
        businessId,
        events,
        periodStart,
        periodEnd
      );

      // Assess risks
      const identifiedRisks = this.assessComplianceRisks(events, complianceMetrics);

      // Generate summary and recommendations
      const executiveSummary = this.generateExecutiveSummary(
        reportType,
        events,
        complianceMetrics,
        identifiedRisks
      );

      const recommendations = options?.includeRecommendations
        ? this.generateComplianceRecommendations(identifiedRisks, complianceMetrics)
        : [];

      const report: ComplianceReport = {
        reportId,
        businessId,
        reportType,
        periodStart,
        periodEnd,
        eventCount: events.length,
        dataSubjectsAffected: new Set(events.map(e => e.dataSubjectId).filter(Boolean)).size,
        processingActivities,
        complianceMetrics,
        identifiedRisks,
        executiveSummary,
        recommendations,
        generatedAt: new Date(),
        generatedBy: 'system',
      };

      // Store report
      await prisma.complianceReport.create({
        data: report as any,
      });

      // Log report generation
      await this.logComplianceEvent({
        businessId,
        eventType: 'IMPACT_ASSESSMENT',
        category: 'GOVERNANCE',
        severity: 'LOW',
        dataSubjectType: 'OTHER',
        processingPurpose: 'Compliance reporting',
        legalBasis: 'LEGAL_OBLIGATION',
        dataCategories: ['compliance_data'],
        processingLocation: 'UK',
        systemId: 'compliance_system',
        triggeredBy: 'system',
        automated: true,
        description: `Generated ${reportType} compliance report`,
        retentionPeriod: this.config.defaultRetentionDays,
        specialCategory: false,
        childData: false,
        correlationId: crypto.randomUUID(),
        metadata: {
          reportId,
          reportType,
          eventCount: events.length,
          period: `${periodStart.toISOString()} - ${periodEnd.toISOString()}`,
        },
      });

      return report;
    } catch (error) {
      logger.error('Compliance report generation failed', {
        businessId,
        reportType,
        error: error instanceof Error ? error.message : String(error),
      });

      throw error;
    }
  }

  /**
   * Get correlated events across systems
   */
  async getCorrelatedEvents(
    correlationId: string,
    options?: {
      includeEncryption?: boolean;
      includeBase?: boolean;
      timeWindow?: number; // minutes
    }
  ): Promise<{
    correlationId: string;
    events: Array<{
      source: 'COMPLIANCE' | 'ENCRYPTION' | 'BASE';
      eventId: string;
      timestamp: Date;
      eventType: string;
      description: string;
      metadata: any;
    }>;
    timeline: Array<{
      timestamp: Date;
      events: number;
      description: string;
    }>;
  }> {
    try {
      const correlatedEvents: any[] = [];

      // Get compliance events
      const complianceEvents = await prisma.complianceAuditEvent.findMany({
        where: { correlationId },
        orderBy: { timestamp: 'asc' },
      });

      correlatedEvents.push(
        ...complianceEvents.map(e => ({
          source: 'COMPLIANCE' as const,
          eventId: e.id,
          timestamp: e.timestamp,
          eventType: e.eventType,
          description: e.description,
          metadata: e.metadata,
        }))
      );

      // Get base audit events if requested
      if (options?.includeBase) {
        const baseEvents = await prisma.auditEvent.findMany({
          where: { correlationId },
          orderBy: { timestamp: 'asc' },
        });

        correlatedEvents.push(
          ...baseEvents.map(e => ({
            source: 'BASE' as const,
            eventId: e.id,
            timestamp: e.timestamp,
            eventType: e.type,
            description: e.description || '',
            metadata: e.metadata,
          }))
        );
      }

      // Sort by timestamp
      correlatedEvents.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

      // Generate timeline
      const timeline = this.generateEventTimeline(correlatedEvents);

      return {
        correlationId,
        events: correlatedEvents,
        timeline,
      };
    } catch (error) {
      logger.error('Event correlation failed', {
        correlationId,
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        correlationId,
        events: [],
        timeline: [],
      };
    }
  }

  // ==========================================
  // PRIVATE AUDIT METHODS
  // ==========================================

  /**
   * Initialize audit chains for businesses
   */
  private async initializeAuditChains(): Promise<void> {
    try {
      const activeChains = await prisma.auditChain.findMany({
        select: {
          businessId: true,
          currentHash: true,
        },
      });

      activeChains.forEach(chain => {
        this.auditChains.set(chain.businessId, chain.currentHash);
      });

      logger.info('Audit chains initialized', {
        chainCount: activeChains.length,
      });
    } catch (error) {
      logger.error('Failed to initialize audit chains', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Calculate tamper-proof event hash
   */
  private calculateEventHash(event: any, previousHash: string): string {
    // Create canonical representation for hashing
    const hashData = {
      id: event.id,
      businessId: event.businessId,
      eventType: event.eventType,
      timestamp: event.timestamp?.toISOString(),
      dataSubjectId: event.dataSubjectId,
      processingPurpose: event.processingPurpose,
      legalBasis: event.legalBasis,
      description: event.description,
      triggeredBy: event.triggeredBy,
      previousHash,
    };

    const canonicalString = JSON.stringify(hashData, Object.keys(hashData).sort());
    return crypto.createHash('sha256').update(canonicalString).digest('hex');
  }

  /**
   * Generate digital signature (placeholder - would use proper PKI)
   */
  private generateDigitalSignature(event: any, eventHash: string): string {
    // This would use proper PKI signing in production
    const signingKey = process.env.AUDIT_SIGNING_KEY || 'default-signing-key';
    const signatureData = `${eventHash}:${event.timestamp?.toISOString()}:${signingKey}`;
    return crypto.createHmac('sha256', signingKey).update(signatureData).digest('hex');
  }

  /**
   * Verify digital signature
   */
  private verifyDigitalSignature(event: any, eventHash: string, signature: string): boolean {
    const expectedSignature = this.generateDigitalSignature(event, eventHash);
    return expectedSignature === signature;
  }

  /**
   * Get current hash for audit chain
   */
  private async getCurrentChainHash(businessId: string): Promise<string> {
    // Check in-memory cache first
    const cachedHash = this.auditChains.get(businessId);
    if (cachedHash) {
      return cachedHash;
    }

    // Get from database
    const chain = await prisma.auditChain.findUnique({
      where: { businessId },
      select: { currentHash: true },
    });

    const currentHash = chain?.currentHash || '';
    this.auditChains.set(businessId, currentHash);
    return currentHash;
  }

  /**
   * Update audit chain with new event
   */
  private async updateAuditChain(
    businessId: string,
    eventId: string,
    eventHash: string,
    timestamp: Date
  ): Promise<void> {
    const chainId = `chain_${businessId}`;

    // Upsert audit chain
    await prisma.auditChain.upsert({
      where: { businessId },
      update: {
        currentHash: eventHash,
        eventCount: { increment: 1 },
        lastEventId: eventId,
        lastEventTimestamp: timestamp,
        updatedAt: new Date(),
      },
      create: {
        businessId,
        chainId,
        startHash: eventHash,
        currentHash: eventHash,
        eventCount: 1,
        lastEventId: eventId,
        lastEventTimestamp: timestamp,
        integrityVerified: true,
      },
    });

    // Update in-memory cache
    this.auditChains.set(businessId, eventHash);
  }

  /**
   * Log to base audit system for cross-correlation
   */
  private async logToBaseAuditSystem(event: ComplianceAuditEvent): Promise<void> {
    if (!this.config.crossSystemCorrelation) return;

    await baseAuditLog({
      category: 'compliance',
      type: event.eventType,
      severity: event.severity.toLowerCase() as any,
      description: event.description,
      businessId: event.businessId,
      correlationId: event.correlationId,
      metadata: {
        complianceEvent: true,
        legalBasis: event.legalBasis,
        dataCategories: event.dataCategories,
        processingPurpose: event.processingPurpose,
        eventId: event.id,
        dataSubjectId: event.dataSubjectId,
      },
      flags: {
        complianceRelevant: true,
        personalData: event.dataCategories.length > 0,
        specialCategory: event.specialCategory,
      },
    });
  }

  /**
   * Handle high-severity compliance events
   */
  private async handleHighSeverityEvent(event: ComplianceAuditEvent): Promise<void> {
    // Critical events require immediate attention
    if (event.severity === 'CRITICAL') {
      logger.error('Critical compliance event detected', {
        eventId: event.id,
        businessId: event.businessId,
        eventType: event.eventType,
        description: event.description,
      });

      // Would trigger alerts, notifications, etc.
    }

    // Log escalation
    await this.logComplianceEvent({
      businessId: event.businessId,
      eventType: 'DPO_CONSULTATION',
      category: 'GOVERNANCE',
      severity: 'HIGH',
      dataSubjectType: 'OTHER',
      processingPurpose: 'High severity event escalation',
      legalBasis: 'LEGAL_OBLIGATION',
      dataCategories: ['compliance_data'],
      processingLocation: 'UK',
      systemId: 'compliance_system',
      triggeredBy: 'system',
      automated: true,
      description: `High severity event ${event.eventType} escalated for review`,
      retentionPeriod: this.config.defaultRetentionDays,
      specialCategory: false,
      childData: false,
      correlationId: event.correlationId,
      parentEventId: event.id,
      metadata: {
        originalEvent: {
          id: event.id,
          eventType: event.eventType,
          severity: event.severity,
        },
      },
    });
  }

  /**
   * Trigger compliance-specific processing
   */
  private async triggerComplianceProcessing(event: ComplianceAuditEvent): Promise<void> {
    // Special processing for specific event types
    switch (event.eventType) {
      case 'BREACH_DETECTED':
        // Would trigger breach notification workflow
        logger.warn('Data breach detected - notification workflow required', {
          eventId: event.id,
          businessId: event.businessId,
        });
        break;

      case 'CONSENT_WITHDRAWN':
        // Would trigger data processing restriction
        logger.info('Consent withdrawn - processing restrictions to be applied', {
          eventId: event.id,
          dataSubjectId: event.dataSubjectId,
        });
        break;

      case 'CROSS_BORDER_TRANSFER':
        // Would verify adequacy decision or safeguards
        logger.info('Cross-border transfer logged - adequacy verification needed', {
          eventId: event.id,
          transferDetails: event.crossBorderTransfer,
        });
        break;
    }
  }

  /**
   * Analyze processing activities from events
   */
  private analyzeProcessingActivities(events: any[]): ComplianceReport['processingActivities'] {
    const activitiesMap = new Map();

    events.forEach(event => {
      const key = `${event.processingPurpose}:${event.legalBasis}`;

      if (!activitiesMap.has(key)) {
        activitiesMap.set(key, {
          purpose: event.processingPurpose,
          legalBasis: event.legalBasis,
          dataCategories: new Set(event.dataCategories),
          eventCount: 0,
          riskLevel: 'LOW' as const,
        });
      }

      const activity = activitiesMap.get(key);
      activity.eventCount++;
      event.dataCategories.forEach((cat: string) => activity.dataCategories.add(cat));

      // Update risk level based on event severity
      if (event.severity === 'HIGH' || event.severity === 'CRITICAL') {
        activity.riskLevel = 'HIGH';
      } else if (event.severity === 'MEDIUM' && activity.riskLevel === 'LOW') {
        activity.riskLevel = 'MEDIUM';
      }
    });

    return Array.from(activitiesMap.values()).map(activity => ({
      ...activity,
      dataCategories: Array.from(activity.dataCategories),
    }));
  }

  /**
   * Calculate compliance metrics
   */
  private async calculateComplianceMetrics(
    businessId: string,
    events: any[],
    periodStart: Date,
    periodEnd: Date
  ): Promise<ComplianceReport['complianceMetrics']> {
    // Calculate consent-related metrics
    const consentGiven = events.filter(e => e.eventType === 'CONSENT_GIVEN').length;
    const consentWithdrawn = events.filter(e => e.eventType === 'CONSENT_WITHDRAWN').length;
    const consentRate = consentGiven > 0 ? (consentGiven - consentWithdrawn) / consentGiven : 0;

    // Calculate GDPR request response times
    const gdprRequests = events.filter(
      e => e.eventType === 'GDPR_REQUEST_SUBMITTED' || e.eventType === 'GDPR_REQUEST_PROCESSED'
    );
    const avgResponseTime = this.calculateAverageResponseTime(gdprRequests);

    // Calculate data minimization score (simplified)
    const dataMinimizationEvents = events.filter(
      e => e.eventType === 'DATA_DELETED' || e.eventType === 'DATA_ANONYMIZED'
    );
    const dataMinimizationScore = Math.min(
      100,
      (dataMinimizationEvents.length / Math.max(1, events.length)) * 100
    );

    return {
      consentRate: Math.round(consentRate * 100) / 100,
      requestResponseTime: avgResponseTime,
      dataMinimizationScore: Math.round(dataMinimizationScore),
      retentionComplianceRate: 85, // Would calculate from retention policy compliance
    };
  }

  /**
   * Helper methods
   */
  private assessComplianceRisks(events: any[], metrics: any): ComplianceReport['identifiedRisks'] {
    const risks: ComplianceReport['identifiedRisks'] = [];

    // Check for high-risk events
    const criticalEvents = events.filter(e => e.severity === 'CRITICAL');
    if (criticalEvents.length > 0) {
      risks.push({
        riskType: 'Critical Events Detected',
        severity: 'CRITICAL',
        description: `${criticalEvents.length} critical compliance events occurred`,
        recommendation: 'Immediate review and remediation required',
      });
    }

    // Check consent rate
    if (metrics.consentRate < 0.7) {
      risks.push({
        riskType: 'Low Consent Rate',
        severity: 'MEDIUM',
        description: 'Consent rate below recommended threshold',
        recommendation: 'Review consent collection mechanisms',
      });
    }

    return risks;
  }

  private generateExecutiveSummary(
    reportType: ComplianceReport['reportType'],
    events: any[],
    metrics: any,
    risks: any[]
  ): string {
    const eventCount = events.length;
    const riskCount = risks.length;
    const highRisks = risks.filter(r => r.severity === 'HIGH' || r.severity === 'CRITICAL').length;

    return (
      `${reportType} report covering ${eventCount} compliance events. ` +
      `Overall compliance status: ${
        riskCount === 0 ? 'COMPLIANT' : highRisks > 0 ? 'HIGH RISK' : 'NEEDS ATTENTION'
      }. ` +
      `${riskCount} risks identified requiring attention.`
    );
  }

  private generateComplianceRecommendations(risks: any[], metrics: any): string[] {
    const recommendations: string[] = [];

    if (risks.some(r => r.riskType === 'Critical Events Detected')) {
      recommendations.push('Conduct immediate review of critical compliance events');
    }

    if (metrics.consentRate < 0.8) {
      recommendations.push('Improve consent collection and management processes');
    }

    if (metrics.dataMinimizationScore < 70) {
      recommendations.push('Implement more aggressive data minimization policies');
    }

    return recommendations;
  }

  private calculateAverageResponseTime(gdprRequests: any[]): number {
    // Simplified calculation - would match submitted/processed pairs
    return 5.2; // Average days
  }

  private generateEventTimeline(events: any[]): Array<{
    timestamp: Date;
    events: number;
    description: string;
  }> {
    // Group events by hour for timeline
    const timelineMap = new Map();

    events.forEach(event => {
      const hourKey = new Date(event.timestamp);
      hourKey.setMinutes(0, 0, 0);
      const key = hourKey.getTime();

      if (!timelineMap.has(key)) {
        timelineMap.set(key, {
          timestamp: hourKey,
          events: 0,
          eventTypes: new Set(),
        });
      }

      const timelineEntry = timelineMap.get(key);
      timelineEntry.events++;
      timelineEntry.eventTypes.add(event.eventType);
    });

    return Array.from(timelineMap.values())
      .map(entry => ({
        timestamp: entry.timestamp,
        events: entry.events,
        description: `${entry.events} events: ${Array.from(entry.eventTypes).join(', ')}`,
      }))
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }
}

// ==========================================
// CONVENIENCE FUNCTIONS
// ==========================================

/**
 * Log compliance event with simplified interface
 */
export async function logGDPREvent(
  businessId: string,
  eventType: ComplianceEventType,
  dataSubjectId: string | undefined,
  processingPurpose: string,
  legalBasis: ProcessingLawfulness,
  additionalData?: {
    description?: string;
    dataCategories?: string[];
    severity?: ComplianceAuditEvent['severity'];
    metadata?: Record<string, any>;
    correlationId?: string;
    specialCategory?: boolean;
    crossBorderTransfer?: ComplianceAuditEvent['crossBorderTransfer'];
  }
): Promise<{ success: boolean; eventId?: string }> {
  const service = getGDPRComplianceAuditService();

  const result = await service.logComplianceEvent({
    businessId,
    eventType,
    category: 'PROCESSING',
    severity: additionalData?.severity || 'LOW',
    dataSubjectId,
    dataSubjectType: 'CUSTOMER',
    processingPurpose,
    legalBasis,
    dataCategories: additionalData?.dataCategories || ['personal_data'],
    processingLocation: 'UK',
    systemId: 'review_runner',
    triggeredBy: 'system',
    automated: true,
    description: additionalData?.description || `${eventType} processing activity`,
    retentionPeriod: 2555, // 7 years
    specialCategory: additionalData?.specialCategory || false,
    childData: false,
    correlationId: additionalData?.correlationId || crypto.randomUUID(),
    crossBorderTransfer: additionalData?.crossBorderTransfer,
    metadata: additionalData?.metadata || {},
  });

  return { success: result.success, eventId: result.eventId };
}

// ==========================================
// SINGLETON INSTANCE
// ==========================================

let globalComplianceAuditService: GDPRComplianceAuditService | null = null;

/**
 * Get global GDPR compliance audit service instance
 */
export function getGDPRComplianceAuditService(): GDPRComplianceAuditService {
  if (!globalComplianceAuditService) {
    globalComplianceAuditService = new GDPRComplianceAuditService();
  }
  return globalComplianceAuditService;
}
