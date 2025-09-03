/**
 * GDPR Breach Notification System
 *
 * Automated breach detection, assessment, and notification system
 * compliant with GDPR Articles 33 and 34 requirements.
 */

import { prisma } from './prisma';
import { logger } from './logger';
import { getGDPRComplianceAuditService } from './gdpr-compliance-audit';
import crypto from 'crypto';
import { z } from 'zod';

// ==========================================
// BREACH NOTIFICATION TYPES
// ==========================================

export type BreachType =
  | 'CONFIDENTIALITY' // Unauthorized access/disclosure
  | 'INTEGRITY' // Data alteration/corruption
  | 'AVAILABILITY' // Data loss/inaccessibility
  | 'COMBINED'; // Multiple breach types

export type BreachSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type BreachStatus =
  | 'DETECTED' // Initial detection
  | 'INVESTIGATING' // Under investigation
  | 'CONFIRMED' // Breach confirmed
  | 'CONTAINED' // Breach contained
  | 'NOTIFIED_AUTHORITY' // ICO notified
  | 'NOTIFIED_SUBJECTS' // Data subjects notified
  | 'RESOLVED' // Fully resolved
  | 'FALSE_POSITIVE'; // Not actually a breach

export interface PersonalDataBreach {
  breachId: string;
  businessId: string;

  // Breach classification
  breachType: BreachType;
  severity: BreachSeverity;
  status: BreachStatus;

  // Detection details
  detectedAt: Date;
  detectionMethod: 'AUTOMATED' | 'MANUAL' | 'THIRD_PARTY' | 'DATA_SUBJECT';
  detectedBy: string;

  // Breach details
  title: string;
  description: string;
  affectedSystems: string[];

  // Data involved
  dataCategories: string[];
  specialCategories: string[];
  dataSubjectsAffected: number;
  recordsAffected: number;
  approximateNumbers: boolean;

  // Risk assessment
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  likelyConsequences: string[];
  riskMitigated: boolean;
  mitigationMeasures: string[];

  // Timeline requirements
  authorityNotificationRequired: boolean;
  authorityNotificationDeadline?: Date;
  subjectNotificationRequired: boolean;

  // Investigation
  causeAnalysis?: string;
  rootCause?: string;
  technicalDetails?: Record<string, any>;

  // Containment and recovery
  containmentActions: Array<{
    action: string;
    takenAt: Date;
    takenBy: string;
    effective: boolean;
  }>;

  recoveryActions: Array<{
    action: string;
    plannedAt?: Date;
    completedAt?: Date;
    assignedTo: string;
    status: 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  }>;

  // Notifications
  notifications: {
    authority?: {
      notifiedAt?: Date;
      notificationId?: string;
      responseReceived?: Date;
      followUpRequired?: boolean;
    };
    dataSubjects?: {
      notificationSent?: Date;
      recipientCount?: number;
      method?: 'EMAIL' | 'POST' | 'PHONE' | 'WEBSITE' | 'MEDIA';
      content?: string;
    };
    internal?: {
      managementNotified?: Date;
      dpoNotified?: Date;
      legalNotified?: Date;
    };
  };

  // Compliance tracking
  regulatoryCompliance: {
    articlesBreach: string[]; // Which GDPR articles breached
    lawfulBasisAffected: string[]; // Legal basis for affected processing
    retentionCompliance: boolean;
    consentAffected: boolean;
  };

  // Documentation
  evidenceCollected: Array<{
    type: string;
    description: string;
    collectedAt: Date;
    location: string;
  }>;

  lessons: Array<{
    lesson: string;
    actionRequired: string;
    priority: 'LOW' | 'MEDIUM' | 'HIGH';
  }>;

  // Metadata
  correlationId: string;
  createdAt: Date;
  updatedAt: Date;
  resolvedAt?: Date;

  metadata: Record<string, any>;
}

export interface BreachNotificationTemplate {
  templateId: string;
  templateType: 'AUTHORITY' | 'DATA_SUBJECT' | 'INTERNAL';
  title: string;

  content: {
    subject: string;
    body: string;
    requiredFields: string[];
    optionalFields: string[];
  };

  compliance: {
    gdprArticles: string[];
    requiredInformation: string[];
    timelineRequirements: string;
  };

  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// ==========================================
// BREACH NOTIFICATION SERVICE
// ==========================================

export class GDPRBreachNotificationService {
  private complianceAudit = getGDPRComplianceAuditService();

  private readonly config = {
    authorityNotificationHours: 72,
    subjectNotificationWithoutDelay: true,
    autoDetectionEnabled: process.env.GDPR_AUTO_BREACH_DETECTION === 'true',
    notificationIntegration: process.env.GDPR_NOTIFICATION_INTEGRATION || 'EMAIL',
    escalationEnabled: process.env.GDPR_BREACH_ESCALATION === 'true',
  };

  // ICO notification endpoints (UK)
  private readonly icoConfig = {
    notificationEndpoint:
      process.env.ICO_NOTIFICATION_ENDPOINT || 'https://ico.org.uk/breach-notify',
    organisationId: process.env.ICO_ORGANISATION_ID,
    apiKey: process.env.ICO_API_KEY,
  };

  /**
   * Detect potential data breach from system events
   */
  async detectPotentialBreach(
    businessId: string,
    indicators: {
      eventType: string;
      severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
      description: string;
      affectedSystems: string[];
      dataCategories?: string[];
      suspectedRecords?: number;
      detectedBy: string;
      technicalDetails?: Record<string, any>;
    }
  ): Promise<{
    breachDetected: boolean;
    breachId?: string;
    requiresImmedateAction: boolean;
    message: string;
  }> {
    const breachId = crypto.randomUUID();

    try {
      // Assess if this qualifies as a personal data breach
      const breachAssessment = await this.assessBreachQualification(indicators);

      if (!breachAssessment.isPersonalDataBreach) {
        logger.info('Event assessed - not a personal data breach', {
          businessId,
          eventType: indicators.eventType,
          assessment: breachAssessment,
        });

        return {
          breachDetected: false,
          requiresImmedateAction: false,
          message: 'Event does not qualify as a personal data breach',
        };
      }

      // Create breach record
      const breach = await this.createBreachRecord(
        businessId,
        breachId,
        indicators,
        breachAssessment
      );

      // Log compliance event
      await this.complianceAudit.logComplianceEvent({
        businessId,
        eventType: 'BREACH_DETECTED',
        category: 'SECURITY',
        severity: indicators.severity,
        dataSubjectType: 'OTHER',
        processingPurpose: 'Data breach detection and response',
        legalBasis: 'LEGAL_OBLIGATION',
        dataCategories: indicators.dataCategories || ['personal_data'],
        processingLocation: 'UK',
        systemId: 'breach_detection_system',
        triggeredBy: indicators.detectedBy,
        automated: indicators.detectedBy === 'system',
        description: `Personal data breach detected: ${indicators.description}`,
        retentionPeriod: 2555,
        specialCategory: false,
        childData: false,
        correlationId: breach.correlationId,
        metadata: {
          breachId,
          breachType: breach.breachType,
          affectedSystems: indicators.affectedSystems,
          estimatedRecords: indicators.suspectedRecords,
        },
      });

      // Trigger immediate response workflow
      await this.triggerBreachResponse(breach);

      logger.warn('Personal data breach detected', {
        breachId,
        businessId,
        severity: breach.severity,
        type: breach.breachType,
        affectedSystems: breach.affectedSystems,
      });

      return {
        breachDetected: true,
        breachId,
        requiresImmedateAction: breach.severity === 'HIGH' || breach.severity === 'CRITICAL',
        message: `Personal data breach detected and response initiated`,
      };
    } catch (error) {
      logger.error('Breach detection failed', {
        businessId,
        eventType: indicators.eventType,
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        breachDetected: false,
        requiresImmedateAction: true,
        message: 'Breach detection system error - manual review required',
      };
    }
  }

  /**
   * Update breach status and trigger notifications as required
   */
  async updateBreachStatus(
    breachId: string,
    updates: {
      status?: BreachStatus;
      severity?: BreachSeverity;
      dataSubjectsAffected?: number;
      recordsAffected?: number;
      riskAssessment?: {
        riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
        likelyConsequences: string[];
        mitigationMeasures: string[];
      };
      investigationFindings?: {
        causeAnalysis: string;
        rootCause: string;
        technicalDetails: Record<string, any>;
      };
      containmentAction?: {
        action: string;
        takenBy: string;
        effective: boolean;
      };
      recoveryAction?: {
        action: string;
        assignedTo: string;
        plannedAt?: Date;
        status: 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
      };
    },
    context: { updatedBy: string }
  ): Promise<{
    success: boolean;
    notificationsTriggered: string[];
    message: string;
    errors?: string[];
  }> {
    try {
      const breach = await prisma.personalDataBreach.findUnique({
        where: { breachId },
      });

      if (!breach) {
        return {
          success: false,
          notificationsTriggered: [],
          message: 'Breach not found',
          errors: ['Breach record not found'],
        };
      }

      // Prepare update data
      const updateData: any = {
        updatedAt: new Date(),
      };

      if (updates.status) updateData.status = updates.status;
      if (updates.severity) updateData.severity = updates.severity;
      if (updates.dataSubjectsAffected)
        updateData.dataSubjectsAffected = updates.dataSubjectsAffected;
      if (updates.recordsAffected) updateData.recordsAffected = updates.recordsAffected;

      if (updates.riskAssessment) {
        updateData.riskLevel = updates.riskAssessment.riskLevel;
        updateData.likelyConsequences = updates.riskAssessment.likelyConsequences;
        updateData.mitigationMeasures = updates.riskAssessment.mitigationMeasures;
        updateData.riskMitigated = updates.riskAssessment.riskLevel === 'LOW';
      }

      if (updates.investigationFindings) {
        updateData.causeAnalysis = updates.investigationFindings.causeAnalysis;
        updateData.rootCause = updates.investigationFindings.rootCause;
        updateData.technicalDetails = updates.investigationFindings.technicalDetails;
      }

      if (updates.containmentAction) {
        const containmentActions = breach.containmentActions || [];
        containmentActions.push({
          ...updates.containmentAction,
          takenAt: new Date(),
        });
        updateData.containmentActions = containmentActions;
      }

      if (updates.recoveryAction) {
        const recoveryActions = breach.recoveryActions || [];
        recoveryActions.push(updates.recoveryAction);
        updateData.recoveryActions = recoveryActions;
      }

      // Update breach record
      const updatedBreach = await prisma.personalDataBreach.update({
        where: { breachId },
        data: updateData,
      });

      // Check if notifications need to be triggered
      const notificationsTriggered = await this.checkNotificationTriggers(
        updatedBreach as any,
        breach as any
      );

      // Log status update
      await this.complianceAudit.logComplianceEvent({
        businessId: breach.businessId,
        eventType: 'BREACH_DETECTED', // Reuse event type for breach updates
        category: 'SECURITY',
        severity: updates.severity || (breach.severity as any),
        dataSubjectType: 'OTHER',
        processingPurpose: 'Data breach status update',
        legalBasis: 'LEGAL_OBLIGATION',
        dataCategories: breach.dataCategories,
        processingLocation: 'UK',
        systemId: 'breach_management_system',
        triggeredBy: context.updatedBy,
        automated: false,
        description: `Breach status updated to ${updates.status || breach.status}`,
        retentionPeriod: 2555,
        specialCategory: false,
        childData: false,
        correlationId: breach.correlationId,
        parentEventId: breachId,
        metadata: {
          breachId,
          statusUpdate: updates.status,
          updatedFields: Object.keys(updates),
          notificationsTriggered,
        },
      });

      logger.info('Breach status updated', {
        breachId,
        businessId: breach.businessId,
        oldStatus: breach.status,
        newStatus: updates.status,
        notificationsTriggered,
      });

      return {
        success: true,
        notificationsTriggered,
        message: `Breach status updated successfully`,
      };
    } catch (error) {
      logger.error('Breach status update failed', {
        breachId,
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        success: false,
        notificationsTriggered: [],
        message: 'Failed to update breach status',
        errors: [error instanceof Error ? error.message : String(error)],
      };
    }
  }

  /**
   * Send breach notification to supervisory authority (ICO)
   */
  async notifyAuthorityOfBreach(
    breachId: string,
    notificationData: {
      contactDetails: {
        organisationName: string;
        contactPerson: string;
        email: string;
        phone: string;
      };
      additionalInfo?: string;
      delayJustification?: string; // If notifying after 72 hours
    }
  ): Promise<{
    success: boolean;
    notificationId?: string;
    message: string;
    errors?: string[];
  }> {
    try {
      const breach = await prisma.personalDataBreach.findUnique({
        where: { breachId },
      });

      if (!breach) {
        return {
          success: false,
          message: 'Breach not found',
          errors: ['Breach record not found'],
        };
      }

      // Check if notification is required
      if (!breach.authorityNotificationRequired) {
        return {
          success: false,
          message: 'Authority notification not required for this breach',
        };
      }

      // Check if already notified
      if (breach.notifications.authority?.notifiedAt) {
        return {
          success: false,
          message: 'Authority already notified of this breach',
        };
      }

      // Prepare notification payload
      const notificationPayload = await this.prepareAuthorityNotification(
        breach as any,
        notificationData
      );

      // Send notification to ICO
      const notificationResult = await this.sendAuthorityNotification(notificationPayload);

      // Update breach record with notification details
      const notifications = breach.notifications || {};
      notifications.authority = {
        notifiedAt: new Date(),
        notificationId: notificationResult.notificationId,
        followUpRequired: notificationResult.followUpRequired,
      };

      await prisma.personalDataBreach.update({
        where: { breachId },
        data: {
          status: 'NOTIFIED_AUTHORITY',
          notifications,
          updatedAt: new Date(),
        },
      });

      // Log compliance event
      await this.complianceAudit.logComplianceEvent({
        businessId: breach.businessId,
        eventType: 'BREACH_NOTIFIED',
        category: 'GOVERNANCE',
        severity: 'HIGH',
        dataSubjectType: 'OTHER',
        processingPurpose: 'Regulatory breach notification',
        legalBasis: 'LEGAL_OBLIGATION',
        dataCategories: breach.dataCategories,
        processingLocation: 'UK',
        systemId: 'breach_notification_system',
        triggeredBy: 'system',
        automated: true,
        description: 'Data breach notified to supervisory authority (ICO)',
        retentionPeriod: 2555,
        specialCategory: false,
        childData: false,
        correlationId: breach.correlationId,
        metadata: {
          breachId,
          notificationId: notificationResult.notificationId,
          notifiedAt: new Date().toISOString(),
          withinTimeLimit: this.isWithinNotificationDeadline(breach as any),
        },
      });

      logger.info('Authority notified of data breach', {
        breachId,
        businessId: breach.businessId,
        notificationId: notificationResult.notificationId,
        withinTimeLimit: this.isWithinNotificationDeadline(breach as any),
      });

      return {
        success: true,
        notificationId: notificationResult.notificationId,
        message: 'Authority successfully notified of breach',
      };
    } catch (error) {
      logger.error('Authority notification failed', {
        breachId,
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        success: false,
        message: 'Failed to notify authority of breach',
        errors: [error instanceof Error ? error.message : String(error)],
      };
    }
  }

  /**
   * Send breach notification to affected data subjects
   */
  async notifyDataSubjectsOfBreach(
    breachId: string,
    notificationDetails: {
      method: 'EMAIL' | 'POST' | 'PHONE' | 'WEBSITE' | 'MEDIA';
      customMessage?: string;
      contactDetails: {
        organisationName: string;
        contactPerson: string;
        email: string;
        phone: string;
      };
    }
  ): Promise<{
    success: boolean;
    recipientCount: number;
    message: string;
    errors?: string[];
  }> {
    try {
      const breach = await prisma.personalDataBreach.findUnique({
        where: { breachId },
      });

      if (!breach) {
        return {
          success: false,
          recipientCount: 0,
          message: 'Breach not found',
          errors: ['Breach record not found'],
        };
      }

      // Check if notification is required
      if (!breach.subjectNotificationRequired) {
        return {
          success: false,
          recipientCount: 0,
          message: 'Data subject notification not required for this breach',
        };
      }

      // Check if already notified
      if (breach.notifications.dataSubjects?.notificationSent) {
        return {
          success: false,
          recipientCount: 0,
          message: 'Data subjects already notified of this breach',
        };
      }

      // Generate notification content
      const notificationContent = await this.generateDataSubjectNotification(
        breach as any,
        notificationDetails
      );

      // Send notifications (would integrate with actual notification system)
      const recipientCount = await this.sendDataSubjectNotifications(
        breach as any,
        notificationContent,
        notificationDetails.method
      );

      // Update breach record
      const notifications = breach.notifications || {};
      notifications.dataSubjects = {
        notificationSent: new Date(),
        recipientCount,
        method: notificationDetails.method,
        content: notificationContent,
      };

      await prisma.personalDataBreach.update({
        where: { breachId },
        data: {
          status: 'NOTIFIED_SUBJECTS',
          notifications,
          updatedAt: new Date(),
        },
      });

      // Log compliance event
      await this.complianceAudit.logComplianceEvent({
        businessId: breach.businessId,
        eventType: 'BREACH_NOTIFIED',
        category: 'RIGHTS',
        severity: 'MEDIUM',
        dataSubjectType: 'CUSTOMER',
        processingPurpose: 'Data subject breach notification',
        legalBasis: 'LEGAL_OBLIGATION',
        dataCategories: breach.dataCategories,
        processingLocation: 'UK',
        systemId: 'breach_notification_system',
        triggeredBy: 'system',
        automated: true,
        description: `Data subjects notified of breach via ${notificationDetails.method}`,
        retentionPeriod: 2555,
        specialCategory: false,
        childData: false,
        correlationId: breach.correlationId,
        metadata: {
          breachId,
          recipientCount,
          notificationMethod: notificationDetails.method,
          notifiedAt: new Date().toISOString(),
        },
      });

      logger.info('Data subjects notified of breach', {
        breachId,
        businessId: breach.businessId,
        recipientCount,
        method: notificationDetails.method,
      });

      return {
        success: true,
        recipientCount,
        message: `Successfully notified ${recipientCount} data subjects`,
      };
    } catch (error) {
      logger.error('Data subject notification failed', {
        breachId,
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        success: false,
        recipientCount: 0,
        message: 'Failed to notify data subjects',
        errors: [error instanceof Error ? error.message : String(error)],
      };
    }
  }

  // ==========================================
  // PRIVATE METHODS
  // ==========================================

  /**
   * Assess if an event qualifies as a personal data breach
   */
  private async assessBreachQualification(indicators: any): Promise<{
    isPersonalDataBreach: boolean;
    breachType: BreachType;
    severity: BreachSeverity;
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
    reasoning: string;
  }> {
    // Simplified assessment logic - would be more sophisticated in production
    const hasPersonalData = indicators.dataCategories && indicators.dataCategories.length > 0;
    const isSecurityEvent =
      indicators.eventType.includes('SECURITY') ||
      indicators.eventType.includes('BREACH') ||
      indicators.eventType.includes('UNAUTHORIZED');

    const isPersonalDataBreach = hasPersonalData && isSecurityEvent;

    // Determine breach type based on event characteristics
    let breachType: BreachType = 'CONFIDENTIALITY';
    if (indicators.eventType.includes('CORRUPTION') || indicators.eventType.includes('ALTERED')) {
      breachType = 'INTEGRITY';
    } else if (
      indicators.eventType.includes('LOSS') ||
      indicators.eventType.includes('UNAVAILABLE')
    ) {
      breachType = 'AVAILABILITY';
    }

    // Map severity
    const severity = indicators.severity;

    // Assess risk level
    let riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' = 'LOW';
    if (indicators.suspectedRecords && indicators.suspectedRecords > 1000) riskLevel = 'MEDIUM';
    if (indicators.severity === 'HIGH' || indicators.severity === 'CRITICAL') riskLevel = 'HIGH';

    return {
      isPersonalDataBreach,
      breachType,
      severity,
      riskLevel,
      reasoning: isPersonalDataBreach
        ? 'Event involves personal data and security compromise'
        : 'Event does not qualify as personal data breach',
    };
  }

  /**
   * Create breach record in database
   */
  private async createBreachRecord(
    businessId: string,
    breachId: string,
    indicators: any,
    assessment: any
  ): Promise<PersonalDataBreach> {
    const now = new Date();
    const correlationId = crypto.randomUUID();

    // Calculate notification deadlines
    const authorityDeadline = new Date(
      now.getTime() + this.config.authorityNotificationHours * 60 * 60 * 1000
    );

    const breachRecord: Omit<PersonalDataBreach, 'createdAt' | 'updatedAt'> = {
      breachId,
      businessId,
      breachType: assessment.breachType,
      severity: assessment.severity,
      status: 'DETECTED',
      detectedAt: now,
      detectionMethod: indicators.detectedBy === 'system' ? 'AUTOMATED' : 'MANUAL',
      detectedBy: indicators.detectedBy,
      title: `${assessment.breachType} breach - ${indicators.eventType}`,
      description: indicators.description,
      affectedSystems: indicators.affectedSystems,
      dataCategories: indicators.dataCategories || ['personal_data'],
      specialCategories: [],
      dataSubjectsAffected: indicators.suspectedRecords || 0,
      recordsAffected: indicators.suspectedRecords || 0,
      approximateNumbers: true,
      riskLevel: assessment.riskLevel,
      likelyConsequences: [],
      riskMitigated: false,
      mitigationMeasures: [],
      authorityNotificationRequired: assessment.riskLevel !== 'LOW',
      authorityNotificationDeadline: assessment.riskLevel !== 'LOW' ? authorityDeadline : undefined,
      subjectNotificationRequired: assessment.riskLevel === 'HIGH',
      containmentActions: [],
      recoveryActions: [],
      notifications: {},
      regulatoryCompliance: {
        articlesBreach: ['Article 32'],
        lawfulBasisAffected: [],
        retentionCompliance: true,
        consentAffected: false,
      },
      evidenceCollected: [],
      lessons: [],
      correlationId,
      resolvedAt: undefined,
      metadata: {
        detectionIndicators: indicators,
        assessment,
        technicalDetails: indicators.technicalDetails || {},
      },
    };

    await prisma.personalDataBreach.create({
      data: breachRecord as any,
    });

    return breachRecord as PersonalDataBreach;
  }

  /**
   * Trigger immediate breach response workflow
   */
  private async triggerBreachResponse(breach: PersonalDataBreach): Promise<void> {
    // Log to system administrators
    logger.error('GDPR BREACH ALERT', {
      breachId: breach.breachId,
      businessId: breach.businessId,
      severity: breach.severity,
      type: breach.breachType,
      detectedAt: breach.detectedAt,
      affectedSystems: breach.affectedSystems,
    });

    // Trigger escalation for high-severity breaches
    if (breach.severity === 'HIGH' || breach.severity === 'CRITICAL') {
      await this.escalateHighSeverityBreach(breach);
    }

    // Start containment procedures if automated
    if (this.config.autoDetectionEnabled) {
      await this.initiateAutomatedContainment(breach);
    }
  }

  /**
   * Check if notifications should be triggered based on status changes
   */
  private async checkNotificationTriggers(
    updatedBreach: PersonalDataBreach,
    previousBreach: PersonalDataBreach
  ): Promise<string[]> {
    const triggered: string[] = [];

    // Authority notification trigger
    if (
      updatedBreach.status === 'CONFIRMED' &&
      updatedBreach.authorityNotificationRequired &&
      !updatedBreach.notifications.authority?.notifiedAt
    ) {
      triggered.push('AUTHORITY_NOTIFICATION');
      // Would trigger authority notification workflow
    }

    // Data subject notification trigger
    if (
      updatedBreach.status === 'CONTAINED' &&
      updatedBreach.subjectNotificationRequired &&
      !updatedBreach.notifications.dataSubjects?.notificationSent
    ) {
      triggered.push('DATA_SUBJECT_NOTIFICATION');
      // Would trigger data subject notification workflow
    }

    return triggered;
  }

  /**
   * Prepare notification payload for supervisory authority
   */
  private async prepareAuthorityNotification(
    breach: PersonalDataBreach,
    contactData: any
  ): Promise<any> {
    return {
      organisationDetails: contactData.contactDetails,
      breachDetails: {
        breachId: breach.breachId,
        title: breach.title,
        description: breach.description,
        detectedAt: breach.detectedAt,
        breachType: breach.breachType,
        affectedSystems: breach.affectedSystems,
      },
      dataDetails: {
        categoriesAffected: breach.dataCategories,
        specialCategories: breach.specialCategories,
        dataSubjectsAffected: breach.dataSubjectsAffected,
        recordsAffected: breach.recordsAffected,
      },
      riskAssessment: {
        riskLevel: breach.riskLevel,
        likelyConsequences: breach.likelyConsequences,
        mitigationMeasures: breach.mitigationMeasures,
      },
      responseActions: {
        containmentActions: breach.containmentActions,
        recoveryActions: breach.recoveryActions,
      },
      additionalInfo: contactData.additionalInfo,
      delayJustification: contactData.delayJustification,
    };
  }

  /**
   * Send notification to supervisory authority (mock implementation)
   */
  private async sendAuthorityNotification(payload: any): Promise<{
    notificationId: string;
    followUpRequired: boolean;
  }> {
    // This would integrate with actual ICO notification system
    const notificationId = `ICO-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    logger.info('Authority notification sent (mock)', {
      notificationId,
      breachId: payload.breachDetails.breachId,
    });

    return {
      notificationId,
      followUpRequired: payload.riskAssessment.riskLevel === 'HIGH',
    };
  }

  /**
   * Generate data subject notification content
   */
  private async generateDataSubjectNotification(
    breach: PersonalDataBreach,
    details: any
  ): Promise<string> {
    const template = `
Dear Customer,

We are writing to inform you of a data security incident that may have affected your personal information.

WHAT HAPPENED:
${breach.description}

INFORMATION INVOLVED:
The following categories of your personal data may have been affected:
${breach.dataCategories.map(cat => `• ${cat}`).join('\n')}

WHAT WE ARE DOING:
We have taken immediate steps to contain this incident and are working with cybersecurity experts and law enforcement where appropriate. We have also notified the relevant regulatory authorities.

WHAT YOU CAN DO:
${
  breach.riskLevel === 'HIGH'
    ? 'As a precautionary measure, we recommend you monitor your accounts and report any suspicious activity.'
    : 'No immediate action is required on your part, but we encourage you to remain vigilant.'
}

CONTACT INFORMATION:
If you have any questions or concerns, please contact us at:
• Email: ${details.contactDetails.email}
• Phone: ${details.contactDetails.phone}

We sincerely apologize for this incident and any inconvenience it may cause.

Sincerely,
${details.contactDetails.organisationName}
`;

    return template.trim();
  }

  /**
   * Send notifications to data subjects (mock implementation)
   */
  private async sendDataSubjectNotifications(
    breach: PersonalDataBreach,
    content: string,
    method: string
  ): Promise<number> {
    // This would integrate with actual notification systems
    logger.info('Data subject notifications sent (mock)', {
      breachId: breach.breachId,
      method,
      estimatedRecipients: breach.dataSubjectsAffected,
    });

    return breach.dataSubjectsAffected || 0;
  }

  /**
   * Check if breach notification is within required timeline
   */
  private isWithinNotificationDeadline(breach: PersonalDataBreach): boolean {
    if (!breach.authorityNotificationDeadline) return true;
    return new Date() <= breach.authorityNotificationDeadline;
  }

  /**
   * Escalate high-severity breach
   */
  private async escalateHighSeverityBreach(breach: PersonalDataBreach): Promise<void> {
    logger.error('HIGH SEVERITY BREACH - ESCALATION REQUIRED', {
      breachId: breach.breachId,
      businessId: breach.businessId,
      severity: breach.severity,
    });

    // Would send alerts to management, DPO, legal team, etc.
  }

  /**
   * Initiate automated containment procedures
   */
  private async initiateAutomatedContainment(breach: PersonalDataBreach): Promise<void> {
    logger.info('Initiating automated containment', {
      breachId: breach.breachId,
      affectedSystems: breach.affectedSystems,
    });

    // Would trigger automated security responses
  }
}

// ==========================================
// CONVENIENCE FUNCTIONS
// ==========================================

/**
 * Report potential data breach from system event
 */
export async function reportDataBreach(
  businessId: string,
  eventType: string,
  description: string,
  severity: BreachSeverity,
  affectedSystems: string[],
  options?: {
    dataCategories?: string[];
    suspectedRecords?: number;
    detectedBy?: string;
    technicalDetails?: Record<string, any>;
  }
): Promise<{
  breachDetected: boolean;
  breachId?: string;
  requiresImmedateAction: boolean;
}> {
  const service = getGDPRBreachNotificationService();

  const result = await service.detectPotentialBreach(businessId, {
    eventType,
    severity,
    description,
    affectedSystems,
    dataCategories: options?.dataCategories,
    suspectedRecords: options?.suspectedRecords,
    detectedBy: options?.detectedBy || 'system',
    technicalDetails: options?.technicalDetails,
  });

  return {
    breachDetected: result.breachDetected,
    breachId: result.breachId,
    requiresImmedateAction: result.requiresImmedateAction,
  };
}

// ==========================================
// SINGLETON INSTANCE
// ==========================================

let globalBreachNotificationService: GDPRBreachNotificationService | null = null;

/**
 * Get global GDPR breach notification service instance
 */
export function getGDPRBreachNotificationService(): GDPRBreachNotificationService {
  if (!globalBreachNotificationService) {
    globalBreachNotificationService = new GDPRBreachNotificationService();
  }
  return globalBreachNotificationService;
}
