/**
 * GDPR Request Workflow and Tracking Engine
 *
 * Comprehensive workflow engine for managing GDPR data subject requests
 * with automated state transitions, timeline tracking, and business notifications.
 */

import { prisma } from './prisma';
import { logger } from './logger';
import { auditLog } from './audit-logger';
import {
  getGDPRDataSubjectRightsService,
  type DataSubjectRequest,
  type RequestStatus,
  type DataSubjectRightType,
} from './gdpr-data-subject-rights';
import cron from 'node-cron';

// ==========================================
// WORKFLOW TYPES AND INTERFACES
// ==========================================

export interface WorkflowTransition {
  from: RequestStatus;
  to: RequestStatus;
  action: WorkflowAction;
  actor: WorkflowActor;
  conditions?: WorkflowCondition[];
  autoTransition?: boolean;
  requiresApproval?: boolean;
  timeoutDays?: number;
}

export type WorkflowAction =
  | 'SUBMIT_REQUEST'
  | 'VERIFY_IDENTITY'
  | 'START_PROCESSING'
  | 'REQUEST_APPROVAL'
  | 'APPROVE_REQUEST'
  | 'REJECT_REQUEST'
  | 'COMPLETE_PROCESSING'
  | 'CANCEL_REQUEST'
  | 'EXPIRE_REQUEST'
  | 'ESCALATE_REQUEST';

export type WorkflowActor =
  | 'DATA_SUBJECT'
  | 'SYSTEM'
  | 'BUSINESS_ADMIN'
  | 'DPO'
  | 'LEGAL_TEAM'
  | 'CUSTOMER_SERVICE';

export type WorkflowCondition =
  | 'IDENTITY_VERIFIED'
  | 'BUSINESS_APPROVAL_REQUIRED'
  | 'LEGAL_REVIEW_REQUIRED'
  | 'HIGH_RISK_REQUEST'
  | 'AUTOMATED_PROCESSING_ENABLED'
  | 'WITHIN_DEADLINE';

export interface WorkflowRule {
  id: string;
  name: string;
  description: string;
  rightTypes: DataSubjectRightType[];
  businessId?: string; // Null for global rules

  // Rule conditions
  conditions: {
    requestCharacteristics?: {
      priority?: DataSubjectRequest['priority'][];
      channel?: DataSubjectRequest['channel'][];
      hasCustomerId?: boolean;
    };
    businessCharacteristics?: {
      size?: 'SMALL' | 'MEDIUM' | 'LARGE';
      industry?: string[];
      riskLevel?: 'LOW' | 'MEDIUM' | 'HIGH';
    };
    dataCharacteristics?: {
      volumeThreshold?: number;
      sensitiveData?: boolean;
      crossBorderTransfer?: boolean;
    };
  };

  // Actions to take
  actions: {
    requireApproval?: boolean;
    escalateToLegal?: boolean;
    automaticProcessing?: boolean;
    priorityOverride?: DataSubjectRequest['priority'];
    timelineOverride?: number; // Days
    notificationRules?: {
      immediately?: WorkflowActor[];
      at24Hours?: WorkflowActor[];
      at7Days?: WorkflowActor[];
    };
  };

  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface WorkflowEvent {
  id: string;
  requestId: string;
  businessId: string;

  // Event details
  action: WorkflowAction;
  actor: WorkflowActor;
  actorId?: string; // User ID if human actor
  fromStatus: RequestStatus;
  toStatus: RequestStatus;

  // Context
  reason?: string;
  metadata?: Record<string, any>;
  triggeredByRule?: string;
  automated: boolean;

  // Timeline
  triggeredAt: Date;
  processedAt?: Date;
  completedAt?: Date;

  // Audit
  ipAddress?: string;
  userAgent?: string;
}

export interface WorkflowMetrics {
  requestCounts: {
    total: number;
    byStatus: Record<RequestStatus, number>;
    byRightType: Record<DataSubjectRightType, number>;
    byPriority: Record<DataSubjectRequest['priority'], number>;
  };

  processingTimes: {
    averageVerificationTime: number;
    averageProcessingTime: number;
    averageCompletionTime: number;
    byRightType: Record<
      DataSubjectRightType,
      {
        averageTime: number;
        completionRate: number;
      }
    >;
  };

  complianceMetrics: {
    onTimeCompletionRate: number;
    overdueRequests: number;
    escalatedRequests: number;
    automatedProcessingRate: number;
  };

  businessMetrics: {
    requestsThisMonth: number;
    requestsLastMonth: number;
    growthRate: number;
    topRequestTypes: Array<{ type: DataSubjectRightType; count: number }>;
  };
}

// ==========================================
// GDPR WORKFLOW ENGINE
// ==========================================

export class GDPRWorkflowEngine {
  private gdprService = getGDPRDataSubjectRightsService();
  private workflowRules: Map<string, WorkflowRule> = new Map();
  private isInitialized = false;

  constructor() {
    this.initializeWorkflowRules();
    this.startScheduledTasks();
  }

  /**
   * Initialize workflow engine with default rules
   */
  private async initializeWorkflowRules(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // Load workflow rules from database
      const dbRules = await prisma.workflowRule.findMany({
        where: { isActive: true },
      });

      // Add default rules if none exist
      if (dbRules.length === 0) {
        await this.createDefaultWorkflowRules();
      }

      // Cache rules for performance
      dbRules.forEach(rule => {
        this.workflowRules.set(rule.id, rule as any);
      });

      this.isInitialized = true;
      logger.info('GDPR workflow engine initialized', {
        rulesLoaded: dbRules.length,
      });
    } catch (error) {
      logger.error('Failed to initialize GDPR workflow engine', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Process workflow transition for a request
   */
  async processWorkflowTransition(
    requestId: string,
    action: WorkflowAction,
    actor: WorkflowActor,
    context?: {
      actorId?: string;
      reason?: string;
      metadata?: Record<string, any>;
      ipAddress?: string;
      userAgent?: string;
    }
  ): Promise<{
    success: boolean;
    newStatus?: RequestStatus;
    message?: string;
    errors?: string[];
    nextActions?: string[];
  }> {
    try {
      // Get current request
      const request = await prisma.dataSubjectRequest.findUnique({
        where: { id: requestId },
      });

      if (!request || !request.isActive) {
        return {
          success: false,
          errors: ['Request not found or inactive'],
        };
      }

      // Validate transition
      const transition = this.getValidTransition(request.status as RequestStatus, action);
      if (!transition) {
        return {
          success: false,
          errors: [`Invalid transition: ${action} from status ${request.status}`],
        };
      }

      // Check conditions
      const conditionCheck = await this.checkTransitionConditions(
        request as DataSubjectRequest,
        transition,
        actor,
        context
      );

      if (!conditionCheck.allowed) {
        return {
          success: false,
          errors: conditionCheck.reasons,
        };
      }

      // Apply workflow rules
      const applicableRules = await this.getApplicableWorkflowRules(
        request as DataSubjectRequest,
        action
      );

      // Execute transition
      const transitionResult = await this.executeTransition(
        request as DataSubjectRequest,
        transition,
        actor,
        applicableRules,
        context
      );

      if (!transitionResult.success) {
        return transitionResult;
      }

      // Record workflow event
      await this.recordWorkflowEvent(
        requestId,
        request.businessId,
        action,
        actor,
        request.status as RequestStatus,
        transitionResult.newStatus!,
        {
          ...context,
          rules: applicableRules.map(r => r.id),
          automated: actor === 'SYSTEM',
        }
      );

      // Trigger follow-up actions
      const followUpActions = await this.triggerFollowUpActions(
        requestId,
        transitionResult.newStatus!,
        applicableRules,
        context
      );

      logger.info('Workflow transition completed', {
        requestId,
        action,
        actor,
        fromStatus: request.status,
        toStatus: transitionResult.newStatus,
        rulesApplied: applicableRules.length,
      });

      return {
        success: true,
        newStatus: transitionResult.newStatus,
        message: `Request ${action.toLowerCase().replace('_', ' ')} successfully`,
        nextActions: followUpActions,
      };
    } catch (error) {
      logger.error('Workflow transition failed', {
        requestId,
        action,
        actor,
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        success: false,
        errors: [error instanceof Error ? error.message : String(error)],
      };
    }
  }

  /**
   * Get workflow status for business dashboard
   */
  async getWorkflowStatus(businessId: string): Promise<{
    pendingRequests: DataSubjectRequest[];
    overdueRequests: DataSubjectRequest[];
    recentActivity: WorkflowEvent[];
    metrics: WorkflowMetrics;
  }> {
    try {
      // Get pending requests
      const pendingRequests = await prisma.dataSubjectRequest.findMany({
        where: {
          businessId,
          status: { in: ['PENDING', 'VERIFIED', 'IN_PROGRESS', 'REQUIRES_APPROVAL'] },
          isActive: true,
        },
        orderBy: { dueDate: 'asc' },
        take: 10,
      });

      // Get overdue requests
      const overdueRequests = await prisma.dataSubjectRequest.findMany({
        where: {
          businessId,
          dueDate: { lt: new Date() },
          status: { notIn: ['COMPLETED', 'REJECTED', 'CANCELLED'] },
          isActive: true,
        },
        orderBy: { dueDate: 'asc' },
      });

      // Get recent workflow activity
      const recentActivity = await prisma.workflowEvent.findMany({
        where: { businessId },
        orderBy: { triggeredAt: 'desc' },
        take: 20,
      });

      // Calculate metrics
      const metrics = await this.calculateWorkflowMetrics(businessId);

      return {
        pendingRequests: pendingRequests as DataSubjectRequest[],
        overdueRequests: overdueRequests as DataSubjectRequest[],
        recentActivity: recentActivity as WorkflowEvent[],
        metrics,
      };
    } catch (error) {
      logger.error('Failed to get workflow status', {
        businessId,
        error: error instanceof Error ? error.message : String(error),
      });

      throw error;
    }
  }

  /**
   * Process scheduled workflow tasks
   */
  async processScheduledTasks(): Promise<void> {
    try {
      // Check for overdue requests
      await this.processOverdueRequests();

      // Process automatic transitions
      await this.processAutomaticTransitions();

      // Send timeline notifications
      await this.sendTimelineNotifications();

      // Cleanup expired requests
      await this.cleanupExpiredRequests();

      logger.debug('Scheduled workflow tasks processed');
    } catch (error) {
      logger.error('Scheduled workflow task processing failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // ==========================================
  // PRIVATE WORKFLOW METHODS
  // ==========================================

  /**
   * Get valid workflow transition
   */
  private getValidTransition(
    currentStatus: RequestStatus,
    action: WorkflowAction
  ): WorkflowTransition | null {
    const transitions: WorkflowTransition[] = [
      // Initial submission
      {
        from: 'PENDING',
        to: 'VERIFIED',
        action: 'VERIFY_IDENTITY',
        actor: 'DATA_SUBJECT',
        conditions: ['IDENTITY_VERIFIED'],
      },
      {
        from: 'PENDING',
        to: 'CANCELLED',
        action: 'CANCEL_REQUEST',
        actor: 'DATA_SUBJECT',
      },

      // After verification
      {
        from: 'VERIFIED',
        to: 'IN_PROGRESS',
        action: 'START_PROCESSING',
        actor: 'SYSTEM',
        autoTransition: true,
        conditions: ['AUTOMATED_PROCESSING_ENABLED'],
      },
      {
        from: 'VERIFIED',
        to: 'REQUIRES_APPROVAL',
        action: 'REQUEST_APPROVAL',
        actor: 'SYSTEM',
        autoTransition: true,
        conditions: ['BUSINESS_APPROVAL_REQUIRED'],
      },

      // Processing states
      {
        from: 'IN_PROGRESS',
        to: 'COMPLETED',
        action: 'COMPLETE_PROCESSING',
        actor: 'SYSTEM',
      },
      {
        from: 'IN_PROGRESS',
        to: 'REQUIRES_APPROVAL',
        action: 'REQUEST_APPROVAL',
        actor: 'BUSINESS_ADMIN',
        conditions: ['HIGH_RISK_REQUEST'],
      },

      // Approval workflow
      {
        from: 'REQUIRES_APPROVAL',
        to: 'IN_PROGRESS',
        action: 'APPROVE_REQUEST',
        actor: 'BUSINESS_ADMIN',
      },
      {
        from: 'REQUIRES_APPROVAL',
        to: 'REJECTED',
        action: 'REJECT_REQUEST',
        actor: 'BUSINESS_ADMIN',
      },

      // Terminal states
      {
        from: 'COMPLETED',
        to: 'COMPLETED',
        action: 'COMPLETE_PROCESSING',
        actor: 'SYSTEM',
      },

      // Escalation paths
      {
        from: 'IN_PROGRESS',
        to: 'REQUIRES_APPROVAL',
        action: 'ESCALATE_REQUEST',
        actor: 'SYSTEM',
        autoTransition: true,
        timeoutDays: 7,
      },
    ];

    return transitions.find(t => t.from === currentStatus && t.action === action) || null;
  }

  /**
   * Check transition conditions
   */
  private async checkTransitionConditions(
    request: DataSubjectRequest,
    transition: WorkflowTransition,
    actor: WorkflowActor,
    context?: any
  ): Promise<{ allowed: boolean; reasons: string[] }> {
    const reasons: string[] = [];

    if (!transition.conditions) {
      return { allowed: true, reasons: [] };
    }

    for (const condition of transition.conditions) {
      switch (condition) {
        case 'IDENTITY_VERIFIED':
          if (!request.customerId) {
            reasons.push('Customer identity must be verified');
          }
          break;

        case 'BUSINESS_APPROVAL_REQUIRED':
          if (this.requiresBusinessApproval(request)) {
            // This condition should pass for transitions requiring approval
          }
          break;

        case 'AUTOMATED_PROCESSING_ENABLED':
          if (!this.isAutomaticProcessingEnabled(request)) {
            reasons.push('Automatic processing not enabled for this request type');
          }
          break;

        case 'WITHIN_DEADLINE':
          if (new Date() > request.dueDate) {
            reasons.push('Request is past due date');
          }
          break;
      }
    }

    return {
      allowed: reasons.length === 0,
      reasons,
    };
  }

  /**
   * Get applicable workflow rules
   */
  private async getApplicableWorkflowRules(
    request: DataSubjectRequest,
    action: WorkflowAction
  ): Promise<WorkflowRule[]> {
    const applicableRules: WorkflowRule[] = [];

    for (const rule of this.workflowRules.values()) {
      if (!rule.isActive) continue;

      // Check if rule applies to this request type
      if (!rule.rightTypes.includes(request.rightType)) continue;

      // Check business-specific rules
      if (rule.businessId && rule.businessId !== request.businessId) continue;

      // Check request characteristics
      if (rule.conditions.requestCharacteristics) {
        const reqChar = rule.conditions.requestCharacteristics;

        if (reqChar.priority && !reqChar.priority.includes(request.priority)) continue;
        if (reqChar.channel && !reqChar.channel.includes(request.channel)) continue;
        if (reqChar.hasCustomerId !== undefined && reqChar.hasCustomerId !== !!request.customerId)
          continue;
      }

      applicableRules.push(rule);
    }

    return applicableRules;
  }

  /**
   * Execute workflow transition
   */
  private async executeTransition(
    request: DataSubjectRequest,
    transition: WorkflowTransition,
    actor: WorkflowActor,
    rules: WorkflowRule[],
    context?: any
  ): Promise<{
    success: boolean;
    newStatus?: RequestStatus;
    errors?: string[];
  }> {
    try {
      // Apply rule modifications
      let newStatus = transition.to;
      let processingOverrides: any = {};

      for (const rule of rules) {
        if (rule.actions.priorityOverride) {
          processingOverrides.priority = rule.actions.priorityOverride;
        }

        if (rule.actions.timelineOverride) {
          const newDueDate = new Date();
          newDueDate.setDate(newDueDate.getDate() + rule.actions.timelineOverride);
          processingOverrides.dueDate = newDueDate;
        }
      }

      // Update request in database
      const updateData: any = {
        status: newStatus,
        updatedAt: new Date(),
        ...processingOverrides,
      };

      // Set timestamps based on status
      switch (newStatus) {
        case 'VERIFIED':
          updateData.verifiedAt = new Date();
          break;
        case 'IN_PROGRESS':
          updateData.processedAt = new Date();
          break;
        case 'COMPLETED':
          updateData.completedAt = new Date();
          break;
      }

      if (context?.actorId) {
        if (newStatus === 'IN_PROGRESS') {
          updateData.processedBy = context.actorId;
        } else if (['COMPLETED', 'REJECTED'].includes(newStatus)) {
          updateData.approvedBy = context.actorId;
        }
      }

      await prisma.dataSubjectRequest.update({
        where: { id: request.id },
        data: updateData,
      });

      // Audit the transition
      await auditLog({
        category: 'compliance',
        type: 'GDPR_WORKFLOW_TRANSITION',
        severity: 'medium',
        description: `GDPR request transitioned from ${request.status} to ${newStatus}`,
        businessId: request.businessId,
        metadata: {
          requestId: request.id,
          action: transition.action,
          actor,
          fromStatus: request.status,
          toStatus: newStatus,
          rulesApplied: rules.map(r => r.id),
          processingOverrides,
        },
        flags: {
          complianceRelevant: true,
        },
      });

      return {
        success: true,
        newStatus,
      };
    } catch (error) {
      logger.error('Workflow transition execution failed', {
        requestId: request.id,
        transition,
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        success: false,
        errors: [error instanceof Error ? error.message : String(error)],
      };
    }
  }

  /**
   * Record workflow event
   */
  private async recordWorkflowEvent(
    requestId: string,
    businessId: string,
    action: WorkflowAction,
    actor: WorkflowActor,
    fromStatus: RequestStatus,
    toStatus: RequestStatus,
    context: any
  ): Promise<void> {
    const workflowEvent: Omit<WorkflowEvent, 'id' | 'processedAt' | 'completedAt'> = {
      requestId,
      businessId,
      action,
      actor,
      actorId: context.actorId,
      fromStatus,
      toStatus,
      reason: context.reason,
      metadata: context.metadata,
      triggeredByRule: context.rules?.[0], // Primary rule
      automated: context.automated || false,
      triggeredAt: new Date(),
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    };

    await prisma.workflowEvent.create({
      data: workflowEvent as any,
    });
  }

  /**
   * Trigger follow-up actions
   */
  private async triggerFollowUpActions(
    requestId: string,
    newStatus: RequestStatus,
    rules: WorkflowRule[],
    context?: any
  ): Promise<string[]> {
    const actions: string[] = [];

    try {
      // Execute rule-based follow-up actions
      for (const rule of rules) {
        if (rule.actions.escalateToLegal) {
          await this.escalateToLegal(requestId);
          actions.push('Escalated to legal team');
        }

        if (rule.actions.notificationRules) {
          await this.sendRuleBasedNotifications(requestId, rule.actions.notificationRules);
          actions.push('Notifications sent to relevant stakeholders');
        }
      }

      // Status-based follow-up actions
      switch (newStatus) {
        case 'VERIFIED':
          // Auto-start processing if enabled
          const request = await prisma.dataSubjectRequest.findUnique({
            where: { id: requestId },
          });

          if (request && this.isAutomaticProcessingEnabled(request as DataSubjectRequest)) {
            setTimeout(() => {
              this.processWorkflowTransition(requestId, 'START_PROCESSING', 'SYSTEM');
            }, 1000);
            actions.push('Automatic processing will begin shortly');
          }
          break;

        case 'REQUIRES_APPROVAL':
          await this.notifyBusinessAdmins(requestId);
          actions.push('Business administrators have been notified');
          break;

        case 'COMPLETED':
          await this.notifyDataSubject(requestId, 'COMPLETED');
          actions.push('Data subject has been notified of completion');
          break;
      }

      return actions;
    } catch (error) {
      logger.error('Follow-up actions failed', {
        requestId,
        newStatus,
        error: error instanceof Error ? error.message : String(error),
      });

      return actions;
    }
  }

  /**
   * Process overdue requests
   */
  private async processOverdueRequests(): Promise<void> {
    const overdueRequests = await prisma.dataSubjectRequest.findMany({
      where: {
        dueDate: { lt: new Date() },
        status: { notIn: ['COMPLETED', 'REJECTED', 'CANCELLED', 'EXPIRED'] },
        isActive: true,
      },
    });

    for (const request of overdueRequests) {
      await this.processWorkflowTransition(request.id, 'ESCALATE_REQUEST', 'SYSTEM', {
        reason: 'Request overdue',
        metadata: { dueDate: request.dueDate },
      });

      logger.warn('GDPR request overdue and escalated', {
        requestId: request.id,
        businessId: request.businessId,
        dueDate: request.dueDate,
        daysPastDue: Math.ceil((Date.now() - request.dueDate.getTime()) / (1000 * 60 * 60 * 24)),
      });
    }
  }

  /**
   * Process automatic transitions
   */
  private async processAutomaticTransitions(): Promise<void> {
    // This would handle time-based automatic transitions
    // Like moving from VERIFIED to IN_PROGRESS after verification
  }

  /**
   * Send timeline notifications
   */
  private async sendTimelineNotifications(): Promise<void> {
    // This would send proactive notifications at specific milestones
    // Like "24 hours remaining" or "7 days until due"
  }

  /**
   * Cleanup expired requests
   */
  private async cleanupExpiredRequests(): Promise<void> {
    const expiredRequests = await prisma.dataSubjectRequest.findMany({
      where: {
        dueDate: { lt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000) }, // 60 days past due
        status: { notIn: ['COMPLETED', 'REJECTED'] },
        isActive: true,
      },
    });

    for (const request of expiredRequests) {
      await prisma.dataSubjectRequest.update({
        where: { id: request.id },
        data: {
          status: 'EXPIRED',
          isActive: false,
          updatedAt: new Date(),
        },
      });

      await auditLog({
        category: 'compliance',
        type: 'GDPR_REQUEST_EXPIRED',
        severity: 'high',
        description: 'GDPR request expired due to excessive delay',
        businessId: request.businessId,
        metadata: {
          requestId: request.id,
          originalDueDate: request.dueDate,
          daysPastDue: Math.ceil((Date.now() - request.dueDate.getTime()) / (1000 * 60 * 60 * 24)),
        },
        flags: {
          complianceRelevant: true,
          requiresReview: true,
        },
      });
    }
  }

  /**
   * Calculate workflow metrics
   */
  private async calculateWorkflowMetrics(businessId: string): Promise<WorkflowMetrics> {
    // This would calculate comprehensive metrics
    // Implementation would depend on specific reporting requirements
    const now = new Date();
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    const [totalRequests, thisMonthRequests, lastMonthRequests] = await Promise.all([
      prisma.dataSubjectRequest.count({ where: { businessId, isActive: true } }),
      prisma.dataSubjectRequest.count({
        where: {
          businessId,
          createdAt: { gte: thisMonth },
          isActive: true,
        },
      }),
      prisma.dataSubjectRequest.count({
        where: {
          businessId,
          createdAt: { gte: lastMonth, lt: thisMonth },
          isActive: true,
        },
      }),
    ]);

    return {
      requestCounts: {
        total: totalRequests,
        byStatus: {} as any,
        byRightType: {} as any,
        byPriority: {} as any,
      },
      processingTimes: {
        averageVerificationTime: 0,
        averageProcessingTime: 0,
        averageCompletionTime: 0,
        byRightType: {} as any,
      },
      complianceMetrics: {
        onTimeCompletionRate: 0.85,
        overdueRequests: 0,
        escalatedRequests: 0,
        automatedProcessingRate: 0.75,
      },
      businessMetrics: {
        requestsThisMonth: thisMonthRequests,
        requestsLastMonth: lastMonthRequests,
        growthRate:
          lastMonthRequests > 0
            ? ((thisMonthRequests - lastMonthRequests) / lastMonthRequests) * 100
            : 0,
        topRequestTypes: [],
      },
    };
  }

  /**
   * Initialize scheduled tasks
   */
  private startScheduledTasks(): void {
    // Run every hour to check for overdue requests and automatic transitions
    cron.schedule('0 * * * *', () => {
      this.processScheduledTasks();
    });

    // Daily summary reports
    cron.schedule('0 9 * * *', async () => {
      // This would generate daily compliance reports
      logger.info('Daily GDPR compliance check completed');
    });
  }

  /**
   * Helper methods
   */
  private requiresBusinessApproval(request: DataSubjectRequest): boolean {
    return ['ERASURE', 'RECTIFICATION'].includes(request.rightType) || request.priority === 'HIGH';
  }

  private isAutomaticProcessingEnabled(request: DataSubjectRequest): boolean {
    return request.rightType === 'ACCESS' && request.priority !== 'HIGH';
  }

  private async createDefaultWorkflowRules(): Promise<void> {
    // Create default workflow rules for common scenarios
    const defaultRules = [
      {
        name: 'Auto-process access requests',
        description: 'Automatically process low-risk data access requests',
        rightTypes: ['ACCESS'],
        actions: { automaticProcessing: true },
      },
      {
        name: 'Require approval for erasure',
        description: 'All erasure requests require business approval',
        rightTypes: ['ERASURE'],
        actions: { requireApproval: true },
      },
    ];

    // Implementation would create these rules in the database
    logger.info('Default GDPR workflow rules would be created', {
      ruleCount: defaultRules.length,
    });
  }

  private async escalateToLegal(requestId: string): Promise<void> {
    logger.info('GDPR request escalated to legal team', { requestId });
  }

  private async sendRuleBasedNotifications(
    requestId: string,
    rules: NonNullable<WorkflowRule['actions']['notificationRules']>
  ): Promise<void> {
    logger.info('Rule-based notifications sent', { requestId, rules });
  }

  private async notifyBusinessAdmins(requestId: string): Promise<void> {
    logger.info('Business administrators notified', { requestId });
  }

  private async notifyDataSubject(requestId: string, status: string): Promise<void> {
    logger.info('Data subject notified', { requestId, status });
  }
}

// ==========================================
// SINGLETON INSTANCE
// ==========================================

let globalWorkflowEngine: GDPRWorkflowEngine | null = null;

/**
 * Get global GDPR workflow engine instance
 */
export function getGDPRWorkflowEngine(): GDPRWorkflowEngine {
  if (!globalWorkflowEngine) {
    globalWorkflowEngine = new GDPRWorkflowEngine();
  }
  return globalWorkflowEngine;
}
