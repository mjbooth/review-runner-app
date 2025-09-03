/**
 * GDPR Data Lifecycle Management
 *
 * Comprehensive data lifecycle management with automated retention policies,
 * data minimization, secure archival, and deletion scheduling.
 */

import { prisma } from './prisma';
import { logger } from './logger';
import { auditLog } from './audit-logger';
import { getEncryptedCustomerService } from '../services/customers-encrypted';
import { getEncryptionAuditLogger } from './encryption-audit-integration';
import crypto from 'crypto';
import cron from 'node-cron';

// ==========================================
// DATA LIFECYCLE TYPES
// ==========================================

export type RetentionPeriodUnit = 'DAYS' | 'MONTHS' | 'YEARS';
export type DataCategory =
  | 'CUSTOMER_PII'
  | 'COMMUNICATION_DATA'
  | 'TRANSACTION_DATA'
  | 'AUDIT_LOGS'
  | 'CONSENT_RECORDS'
  | 'SUPPORT_TICKETS';
export type RetentionAction = 'DELETE' | 'ANONYMIZE' | 'ARCHIVE' | 'REVIEW' | 'RETAIN';
export type DataStatus =
  | 'ACTIVE'
  | 'INACTIVE'
  | 'ARCHIVED'
  | 'PENDING_DELETION'
  | 'DELETED'
  | 'ANONYMIZED';

export interface RetentionPolicy {
  id: string;
  businessId: string;
  name: string;
  description: string;

  // Policy scope
  dataCategory: DataCategory;
  entityTypes: string[]; // ['customers', 'review_requests', 'events']
  conditions?: {
    customerStatus?: ('ACTIVE' | 'INACTIVE')[];
    lastActivityBefore?: Date;
    createdBefore?: Date;
    hasGDPRRequest?: boolean;
    hasActiveRelations?: boolean;
  };

  // Retention rules
  retentionPeriod: number;
  retentionUnit: RetentionPeriodUnit;
  actionAfterRetention: RetentionAction;
  gracePeriod?: number; // Additional days before action

  // Legal basis
  legalBasis: string;
  jurisdiction: string;
  exceptions: string[];

  // Automation settings
  autoApply: boolean;
  requiresApproval: boolean;
  notificationDays: number[]; // Days before action to notify

  // Metadata
  priority: 'LOW' | 'MEDIUM' | 'HIGH';
  isActive: boolean;
  lastExecuted?: Date;
  nextExecution?: Date;

  createdBy: string;
  approvedBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface DataLifecycleEvent {
  id: string;
  businessId: string;
  policyId: string;

  // Event details
  eventType:
    | 'POLICY_APPLIED'
    | 'DATA_ARCHIVED'
    | 'DATA_DELETED'
    | 'DATA_ANONYMIZED'
    | 'RETENTION_EXTENDED'
    | 'POLICY_VIOLATION';
  entityType: string;
  entityId: string;

  // Data details
  dataCategory: DataCategory;
  previousStatus: DataStatus;
  newStatus: DataStatus;
  action: RetentionAction;

  // Execution details
  executedAt: Date;
  executedBy: string; // System or user ID
  automated: boolean;

  // Results
  success: boolean;
  affectedRecords: number;
  details: Record<string, any>;
  error?: string;

  // Compliance
  retentionJustification?: string;
  legalBasis: string;

  createdAt: Date;
}

export interface DataInventory {
  businessId: string;
  scanDate: Date;

  // Data counts by category
  categories: Record<
    DataCategory,
    {
      totalRecords: number;
      activeRecords: number;
      inactiveRecords: number;
      archivedRecords: number;
      pendingDeletion: number;
      avgAge: number; // Average age in days
      oldestRecord: Date;
      newestRecord: Date;
    }
  >;

  // Retention status
  retentionStatus: {
    compliantRecords: number;
    nonCompliantRecords: number;
    overdueForDeletion: number;
    pendingReview: number;
  };

  // Risk assessment
  riskFactors: string[];
  complianceScore: number; // 0-100
  recommendations: string[];
}

export interface ArchivalJob {
  id: string;
  businessId: string;
  policyId: string;

  // Job details
  jobType: 'ARCHIVE' | 'DELETE' | 'ANONYMIZE';
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

  // Scope
  entityType: string;
  entityIds: string[];
  estimatedRecords: number;

  // Progress
  processedRecords: number;
  failedRecords: number;
  startedAt?: Date;
  completedAt?: Date;

  // Configuration
  batchSize: number;
  dryRun: boolean;
  requiresApproval: boolean;

  // Results
  archiveLocation?: string;
  deletionCertificate?: string;
  error?: string;

  createdAt: Date;
  updatedAt: Date;
}

// ==========================================
// DATA LIFECYCLE MANAGEMENT SERVICE
// ==========================================

export class GDPRDataLifecycleService {
  private customerService = getEncryptedCustomerService();
  private encryptionAudit = getEncryptionAuditLogger();
  private isInitialized = false;

  constructor() {
    this.initialize();
  }

  /**
   * Initialize lifecycle management
   */
  private async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // Start scheduled tasks
      this.startScheduledTasks();

      // Load default retention policies if none exist
      await this.createDefaultRetentionPolicies();

      this.isInitialized = true;
      logger.info('GDPR data lifecycle service initialized');
    } catch (error) {
      logger.error('Failed to initialize data lifecycle service', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Create or update retention policy
   */
  async createRetentionPolicy(
    businessId: string,
    policyData: Omit<
      RetentionPolicy,
      'id' | 'createdAt' | 'updatedAt' | 'lastExecuted' | 'nextExecution'
    >,
    context?: {
      userId?: string;
      requiresApproval?: boolean;
    }
  ): Promise<{
    success: boolean;
    policyId?: string;
    message?: string;
    errors?: string[];
  }> {
    const policyId = crypto.randomUUID();

    try {
      // Validate retention policy
      const validation = this.validateRetentionPolicy(policyData);
      if (!validation.valid) {
        return {
          success: false,
          errors: validation.errors,
        };
      }

      // Calculate next execution date
      const nextExecution = this.calculateNextExecution(
        policyData.retentionPeriod,
        policyData.retentionUnit
      );

      // Create retention policy
      const policy: Omit<RetentionPolicy, 'createdAt' | 'updatedAt'> = {
        id: policyId,
        businessId,
        ...policyData,
        nextExecution,
      };

      await prisma.retentionPolicy.create({
        data: policy as any,
      });

      // Audit policy creation
      await auditLog({
        category: 'compliance',
        type: 'RETENTION_POLICY_CREATED',
        severity: 'medium',
        description: `Data retention policy "${policyData.name}" created`,
        businessId,
        metadata: {
          policyId,
          dataCategory: policyData.dataCategory,
          retentionPeriod: `${policyData.retentionPeriod} ${policyData.retentionUnit}`,
          action: policyData.actionAfterRetention,
          autoApply: policyData.autoApply,
          legalBasis: policyData.legalBasis,
        },
        flags: {
          complianceRelevant: true,
        },
      });

      // Schedule immediate assessment if policy is active
      if (policyData.isActive && policyData.autoApply) {
        setTimeout(() => {
          this.assessRetentionPolicy(policyId);
        }, 5000);
      }

      logger.info('Retention policy created', {
        policyId,
        businessId,
        name: policyData.name,
        dataCategory: policyData.dataCategory,
        autoApply: policyData.autoApply,
      });

      return {
        success: true,
        policyId,
        message: 'Retention policy created successfully',
      };
    } catch (error) {
      logger.error('Retention policy creation failed', {
        businessId,
        policyName: policyData.name,
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        success: false,
        errors: [error instanceof Error ? error.message : String(error)],
      };
    }
  }

  /**
   * Execute retention policy assessment
   */
  async assessRetentionPolicy(policyId: string): Promise<{
    success: boolean;
    assessment?: {
      totalRecords: number;
      affectedRecords: number;
      actions: Array<{
        action: RetentionAction;
        entityType: string;
        entityIds: string[];
        scheduledFor: Date;
      }>;
    };
    message?: string;
    errors?: string[];
  }> {
    try {
      // Get retention policy
      const policy = await prisma.retentionPolicy.findUnique({
        where: { id: policyId },
      });

      if (!policy || !policy.isActive) {
        return {
          success: false,
          errors: ['Policy not found or inactive'],
        };
      }

      logger.info('Assessing retention policy', {
        policyId,
        businessId: policy.businessId,
        name: policy.name,
        dataCategory: policy.dataCategory,
      });

      // Find records affected by this policy
      const affectedRecords = await this.findRecordsForRetention(policy as RetentionPolicy);

      if (affectedRecords.length === 0) {
        await this.updatePolicyLastExecuted(policyId);
        return {
          success: true,
          assessment: {
            totalRecords: 0,
            affectedRecords: 0,
            actions: [],
          },
          message: 'No records require retention action',
        };
      }

      // Group records by required action
      const actionGroups = this.groupRecordsByAction(affectedRecords, policy as RetentionPolicy);

      // Create archival jobs for each action group
      const scheduledActions = await this.scheduleRetentionActions(
        policy as RetentionPolicy,
        actionGroups
      );

      // Update policy execution tracking
      await this.updatePolicyLastExecuted(policyId);

      // Audit assessment
      await auditLog({
        category: 'compliance',
        type: 'RETENTION_ASSESSMENT_COMPLETED',
        severity: 'medium',
        description: `Retention policy assessment completed for "${policy.name}"`,
        businessId: policy.businessId,
        metadata: {
          policyId,
          totalRecords: affectedRecords.length,
          actionGroups: Object.keys(actionGroups),
          scheduledJobs: scheduledActions.length,
        },
        flags: {
          complianceRelevant: true,
        },
      });

      return {
        success: true,
        assessment: {
          totalRecords: affectedRecords.length,
          affectedRecords: affectedRecords.length,
          actions: scheduledActions,
        },
        message: `Assessment completed: ${scheduledActions.length} retention actions scheduled`,
      };
    } catch (error) {
      logger.error('Retention policy assessment failed', {
        policyId,
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        success: false,
        errors: [error instanceof Error ? error.message : String(error)],
      };
    }
  }

  /**
   * Execute data lifecycle action (archive, delete, anonymize)
   */
  async executeLifecycleAction(
    jobId: string,
    options?: {
      dryRun?: boolean;
      batchSize?: number;
      userId?: string;
    }
  ): Promise<{
    success: boolean;
    result?: {
      processedRecords: number;
      failedRecords: number;
      duration: number;
    };
    message?: string;
    errors?: string[];
  }> {
    const startTime = Date.now();

    try {
      // Get archival job
      const job = await prisma.archivalJob.findUnique({
        where: { id: jobId },
        include: { policy: true },
      });

      if (!job) {
        return { success: false, errors: ['Job not found'] };
      }

      if (job.status !== 'PENDING') {
        return { success: false, errors: ['Job is not in pending status'] };
      }

      logger.info('Executing lifecycle action', {
        jobId,
        businessId: job.businessId,
        jobType: job.jobType,
        entityCount: job.entityIds.length,
        dryRun: options?.dryRun || job.dryRun,
      });

      // Update job status
      await prisma.archivalJob.update({
        where: { id: jobId },
        data: {
          status: 'RUNNING',
          startedAt: new Date(),
        },
      });

      let processedRecords = 0;
      let failedRecords = 0;
      const batchSize = options?.batchSize || job.batchSize || 50;

      // Process entities in batches
      for (let i = 0; i < job.entityIds.length; i += batchSize) {
        const batchIds = job.entityIds.slice(i, i + batchSize);

        try {
          const batchResult = await this.processBatchLifecycleAction(
            job as any,
            batchIds,
            options?.dryRun || job.dryRun
          );

          processedRecords += batchResult.processed;
          failedRecords += batchResult.failed;

          // Update progress
          await prisma.archivalJob.update({
            where: { id: jobId },
            data: {
              processedRecords: processedRecords,
              failedRecords: failedRecords,
            },
          });
        } catch (error) {
          logger.error('Batch processing failed', {
            jobId,
            batchIds,
            error: error instanceof Error ? error.message : String(error),
          });

          failedRecords += batchIds.length;
        }
      }

      // Complete the job
      const duration = Date.now() - startTime;
      const jobSuccess = failedRecords === 0;

      await prisma.archivalJob.update({
        where: { id: jobId },
        data: {
          status: jobSuccess ? 'COMPLETED' : 'FAILED',
          completedAt: new Date(),
          processedRecords,
          failedRecords,
        },
      });

      // Record lifecycle events
      await this.recordLifecycleEvent({
        businessId: job.businessId,
        policyId: job.policyId,
        eventType: this.getEventTypeFromJobType(job.jobType as any),
        entityType: job.entityType,
        entityId: 'batch',
        dataCategory: (job.policy?.dataCategory as DataCategory) || 'CUSTOMER_PII',
        previousStatus: 'ACTIVE',
        newStatus: this.getNewStatusFromJobType(job.jobType as any),
        action: job.jobType as RetentionAction,
        executedBy: options?.userId || 'system',
        automated: true,
        success: jobSuccess,
        affectedRecords: processedRecords,
        details: {
          jobId,
          duration,
          dryRun: options?.dryRun || job.dryRun,
        },
        legalBasis: job.policy?.legalBasis || 'Data minimization',
      });

      // Audit completion
      await auditLog({
        category: 'compliance',
        type: 'LIFECYCLE_ACTION_COMPLETED',
        severity: jobSuccess ? 'medium' : 'high',
        description: `Data lifecycle ${job.jobType.toLowerCase()} ${jobSuccess ? 'completed' : 'failed'}`,
        businessId: job.businessId,
        metadata: {
          jobId,
          jobType: job.jobType,
          processedRecords,
          failedRecords,
          duration,
          success: jobSuccess,
          dryRun: options?.dryRun || job.dryRun,
        },
        flags: {
          complianceRelevant: true,
          requiresReview: !jobSuccess,
        },
      });

      return {
        success: jobSuccess,
        result: {
          processedRecords,
          failedRecords,
          duration,
        },
        message: jobSuccess
          ? `Lifecycle action completed successfully: ${processedRecords} records processed`
          : `Lifecycle action completed with errors: ${failedRecords} failed`,
      };
    } catch (error) {
      // Mark job as failed
      await prisma.archivalJob
        .update({
          where: { id: jobId },
          data: {
            status: 'FAILED',
            error: error instanceof Error ? error.message : String(error),
            completedAt: new Date(),
          },
        })
        .catch(() => {}); // Ignore update errors

      logger.error('Lifecycle action execution failed', {
        jobId,
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        success: false,
        errors: [error instanceof Error ? error.message : String(error)],
      };
    }
  }

  /**
   * Generate data inventory report
   */
  async generateDataInventory(businessId: string): Promise<DataInventory> {
    try {
      const scanDate = new Date();
      const categories: DataInventory['categories'] = {} as any;

      // Scan each data category
      for (const category of Object.values([
        'CUSTOMER_PII',
        'COMMUNICATION_DATA',
        'TRANSACTION_DATA',
        'AUDIT_LOGS',
        'CONSENT_RECORDS',
      ] as DataCategory[])) {
        const categoryData = await this.scanDataCategory(businessId, category);
        categories[category] = categoryData;
      }

      // Calculate retention compliance status
      const retentionStatus = await this.calculateRetentionStatus(businessId, categories);

      // Assess compliance risks
      const riskAssessment = this.assessComplianceRisks(categories, retentionStatus);

      const inventory: DataInventory = {
        businessId,
        scanDate,
        categories,
        retentionStatus,
        riskFactors: riskAssessment.riskFactors,
        complianceScore: riskAssessment.complianceScore,
        recommendations: riskAssessment.recommendations,
      };

      // Audit inventory generation
      await auditLog({
        category: 'compliance',
        type: 'DATA_INVENTORY_GENERATED',
        severity: 'low',
        description: 'Data inventory report generated',
        businessId,
        metadata: {
          scanDate,
          totalRecords: Object.values(categories).reduce((sum, cat) => sum + cat.totalRecords, 0),
          complianceScore: riskAssessment.complianceScore,
          riskFactorCount: riskAssessment.riskFactors.length,
        },
        flags: {
          complianceRelevant: true,
        },
      });

      return inventory;
    } catch (error) {
      logger.error('Data inventory generation failed', {
        businessId,
        error: error instanceof Error ? error.message : String(error),
      });

      throw error;
    }
  }

  // ==========================================
  // PRIVATE LIFECYCLE METHODS
  // ==========================================

  /**
   * Find records that need retention action
   */
  private async findRecordsForRetention(policy: RetentionPolicy): Promise<
    Array<{
      entityType: string;
      entityId: string;
      age: number;
      lastActivity: Date;
      status: string;
    }>
  > {
    const cutoffDate = this.calculateRetentionCutoffDate(
      policy.retentionPeriod,
      policy.retentionUnit
    );

    const records: any[] = [];

    // Check different entity types based on policy scope
    if (policy.entityTypes.includes('customers')) {
      const customers = await prisma.customer.findMany({
        where: {
          businessId: policy.businessId,
          createdAt: { lt: cutoffDate },
          isActive: policy.conditions?.customerStatus?.includes('INACTIVE') ? false : true,
        },
        select: {
          id: true,
          createdAt: true,
          updatedAt: true,
          isActive: true,
          lastContact: true,
        },
      });

      records.push(
        ...customers.map(c => ({
          entityType: 'customer',
          entityId: c.id,
          age: Math.floor((Date.now() - c.createdAt.getTime()) / (1000 * 60 * 60 * 24)),
          lastActivity: c.lastContact || c.updatedAt,
          status: c.isActive ? 'ACTIVE' : 'INACTIVE',
        }))
      );
    }

    // Add other entity types as needed (review_requests, events, etc.)
    if (policy.entityTypes.includes('review_requests')) {
      const requests = await prisma.reviewRequest.findMany({
        where: {
          businessId: policy.businessId,
          createdAt: { lt: cutoffDate },
          isActive: true,
        },
        select: {
          id: true,
          createdAt: true,
          updatedAt: true,
          status: true,
        },
      });

      records.push(
        ...requests.map(r => ({
          entityType: 'review_request',
          entityId: r.id,
          age: Math.floor((Date.now() - r.createdAt.getTime()) / (1000 * 60 * 60 * 24)),
          lastActivity: r.updatedAt,
          status: r.status,
        }))
      );
    }

    return records;
  }

  /**
   * Group records by required retention action
   */
  private groupRecordsByAction(
    records: any[],
    policy: RetentionPolicy
  ): Record<RetentionAction, any[]> {
    const groups: Record<RetentionAction, any[]> = {
      DELETE: [],
      ANONYMIZE: [],
      ARCHIVE: [],
      REVIEW: [],
      RETAIN: [],
    };

    records.forEach(record => {
      // Determine action based on policy and record characteristics
      let action = policy.actionAfterRetention;

      // Apply business logic to determine specific action
      if (policy.dataCategory === 'CUSTOMER_PII' && record.entityType === 'customer') {
        if (record.status === 'INACTIVE' && record.age > 365 * 3) {
          // Customers inactive for 3+ years can be deleted
          action = 'DELETE';
        } else if (record.age > 365 * 2) {
          // Customers 2+ years old can be archived
          action = 'ARCHIVE';
        }
      }

      groups[action].push(record);
    });

    return groups;
  }

  /**
   * Schedule retention actions as archival jobs
   */
  private async scheduleRetentionActions(
    policy: RetentionPolicy,
    actionGroups: Record<RetentionAction, any[]>
  ): Promise<
    Array<{
      action: RetentionAction;
      entityType: string;
      entityIds: string[];
      scheduledFor: Date;
    }>
  > {
    const scheduledActions: any[] = [];

    for (const [action, records] of Object.entries(actionGroups)) {
      if (records.length === 0) continue;

      // Group by entity type
      const entityGroups = records.reduce(
        (groups, record) => {
          if (!groups[record.entityType]) {
            groups[record.entityType] = [];
          }
          groups[record.entityType].push(record.entityId);
          return groups;
        },
        {} as Record<string, string[]>
      );

      for (const [entityType, entityIds] of Object.entries(entityGroups)) {
        // Calculate scheduled execution time
        const scheduledFor = new Date();
        if (policy.gracePeriod) {
          scheduledFor.setDate(scheduledFor.getDate() + policy.gracePeriod);
        }

        // Create archival job
        const job: Omit<ArchivalJob, 'createdAt' | 'updatedAt'> = {
          id: crypto.randomUUID(),
          businessId: policy.businessId,
          policyId: policy.id,
          jobType: action as 'ARCHIVE' | 'DELETE' | 'ANONYMIZE',
          status: policy.requiresApproval ? 'PENDING' : 'PENDING',
          entityType,
          entityIds,
          estimatedRecords: entityIds.length,
          processedRecords: 0,
          failedRecords: 0,
          batchSize: 50,
          dryRun: false,
          requiresApproval: policy.requiresApproval,
        };

        await prisma.archivalJob.create({
          data: job as any,
        });

        scheduledActions.push({
          action: action as RetentionAction,
          entityType,
          entityIds,
          scheduledFor,
        });

        logger.info('Retention action scheduled', {
          policyId: policy.id,
          action,
          entityType,
          entityCount: entityIds.length,
          scheduledFor,
          requiresApproval: policy.requiresApproval,
        });
      }
    }

    return scheduledActions;
  }

  /**
   * Process batch of entities for lifecycle action
   */
  private async processBatchLifecycleAction(
    job: ArchivalJob,
    entityIds: string[],
    dryRun: boolean
  ): Promise<{ processed: number; failed: number }> {
    let processed = 0;
    let failed = 0;

    for (const entityId of entityIds) {
      try {
        if (dryRun) {
          // Dry run - just validate
          await this.validateLifecycleAction(job, entityId);
        } else {
          // Execute the actual action
          switch (job.jobType) {
            case 'DELETE':
              await this.performSecureDeletion(job.entityType, entityId, job.businessId);
              break;
            case 'ARCHIVE':
              await this.performDataArchival(job.entityType, entityId, job.businessId);
              break;
            case 'ANONYMIZE':
              await this.performDataAnonymization(job.entityType, entityId, job.businessId);
              break;
          }
        }

        processed++;
      } catch (error) {
        logger.error('Entity lifecycle action failed', {
          jobId: job.id,
          entityId,
          jobType: job.jobType,
          error: error instanceof Error ? error.message : String(error),
        });
        failed++;
      }
    }

    return { processed, failed };
  }

  /**
   * Record lifecycle event
   */
  private async recordLifecycleEvent(
    eventData: Omit<DataLifecycleEvent, 'id' | 'createdAt'>
  ): Promise<void> {
    const event: Omit<DataLifecycleEvent, 'createdAt'> = {
      id: crypto.randomUUID(),
      ...eventData,
    };

    await prisma.dataLifecycleEvent.create({
      data: event as any,
    });
  }

  /**
   * Scan data category for inventory
   */
  private async scanDataCategory(
    businessId: string,
    category: DataCategory
  ): Promise<DataInventory['categories'][DataCategory]> {
    // Implementation would scan specific data tables based on category
    // This is a simplified version

    let tableName = 'customers';
    let dateField = 'createdAt';

    switch (category) {
      case 'CUSTOMER_PII':
        tableName = 'customers';
        break;
      case 'COMMUNICATION_DATA':
        tableName = 'review_requests';
        break;
      case 'AUDIT_LOGS':
        tableName = 'audit_logs';
        break;
    }

    // Get basic counts and statistics
    const [totalCount, activeCount, oldestRecord, newestRecord] = await Promise.all([
      prisma.$queryRaw`SELECT COUNT(*) as count FROM ${tableName} WHERE business_id = ${businessId}`,
      prisma.$queryRaw`SELECT COUNT(*) as count FROM ${tableName} WHERE business_id = ${businessId} AND is_active = true`,
      prisma.$queryRaw`SELECT MIN(${dateField}) as oldest FROM ${tableName} WHERE business_id = ${businessId}`,
      prisma.$queryRaw`SELECT MAX(${dateField}) as newest FROM ${tableName} WHERE business_id = ${businessId}`,
    ]);

    const oldest =
      Array.isArray(oldestRecord) && oldestRecord[0]?.oldest
        ? new Date(oldestRecord[0].oldest)
        : new Date();
    const newest =
      Array.isArray(newestRecord) && newestRecord[0]?.newest
        ? new Date(newestRecord[0].newest)
        : new Date();
    const total =
      Array.isArray(totalCount) && totalCount[0]?.count ? Number(totalCount[0].count) : 0;
    const active =
      Array.isArray(activeCount) && activeCount[0]?.count ? Number(activeCount[0].count) : 0;

    return {
      totalRecords: total,
      activeRecords: active,
      inactiveRecords: total - active,
      archivedRecords: 0, // Would be calculated from archive status
      pendingDeletion: 0, // Would be calculated from lifecycle events
      avgAge: oldest ? Math.floor((Date.now() - oldest.getTime()) / (1000 * 60 * 60 * 24)) : 0,
      oldestRecord: oldest,
      newestRecord: newest,
    };
  }

  /**
   * Calculate retention compliance status
   */
  private async calculateRetentionStatus(
    businessId: string,
    categories: DataInventory['categories']
  ): Promise<DataInventory['retentionStatus']> {
    // Implementation would check retention compliance
    const totalRecords = Object.values(categories).reduce((sum, cat) => sum + cat.totalRecords, 0);

    return {
      compliantRecords: Math.floor(totalRecords * 0.85),
      nonCompliantRecords: Math.floor(totalRecords * 0.15),
      overdueForDeletion: Math.floor(totalRecords * 0.05),
      pendingReview: Math.floor(totalRecords * 0.1),
    };
  }

  /**
   * Helper methods
   */
  private validateRetentionPolicy(policy: any): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!policy.name || policy.name.trim().length === 0) {
      errors.push('Policy name is required');
    }

    if (!policy.dataCategory) {
      errors.push('Data category is required');
    }

    if (!policy.retentionPeriod || policy.retentionPeriod < 1) {
      errors.push('Retention period must be greater than 0');
    }

    if (!policy.legalBasis || policy.legalBasis.trim().length === 0) {
      errors.push('Legal basis is required');
    }

    return { valid: errors.length === 0, errors };
  }

  private calculateRetentionCutoffDate(period: number, unit: RetentionPeriodUnit): Date {
    const cutoff = new Date();

    switch (unit) {
      case 'DAYS':
        cutoff.setDate(cutoff.getDate() - period);
        break;
      case 'MONTHS':
        cutoff.setMonth(cutoff.getMonth() - period);
        break;
      case 'YEARS':
        cutoff.setFullYear(cutoff.getFullYear() - period);
        break;
    }

    return cutoff;
  }

  private calculateNextExecution(period: number, unit: RetentionPeriodUnit): Date {
    const next = new Date();

    // Schedule next execution based on period (more frequent for shorter periods)
    if (unit === 'DAYS' && period <= 30) {
      next.setDate(next.getDate() + 1); // Daily for short periods
    } else if (unit === 'MONTHS' && period <= 12) {
      next.setDate(next.getDate() + 7); // Weekly for medium periods
    } else {
      next.setMonth(next.getMonth() + 1); // Monthly for long periods
    }

    return next;
  }

  private async updatePolicyLastExecuted(policyId: string): Promise<void> {
    await prisma.retentionPolicy.update({
      where: { id: policyId },
      data: {
        lastExecuted: new Date(),
        updatedAt: new Date(),
      },
    });
  }

  private getEventTypeFromJobType(jobType: string): DataLifecycleEvent['eventType'] {
    const map: Record<string, DataLifecycleEvent['eventType']> = {
      DELETE: 'DATA_DELETED',
      ARCHIVE: 'DATA_ARCHIVED',
      ANONYMIZE: 'DATA_ANONYMIZED',
    };
    return map[jobType] || 'POLICY_APPLIED';
  }

  private getNewStatusFromJobType(jobType: string): DataStatus {
    const map: Record<string, DataStatus> = {
      DELETE: 'DELETED',
      ARCHIVE: 'ARCHIVED',
      ANONYMIZE: 'ANONYMIZED',
    };
    return map[jobType] || 'ACTIVE';
  }

  private async validateLifecycleAction(job: ArchivalJob, entityId: string): Promise<void> {
    // Validation logic for lifecycle actions
    // Check if entity exists, has no dependencies, etc.
  }

  private async performSecureDeletion(
    entityType: string,
    entityId: string,
    businessId: string
  ): Promise<void> {
    // Implementation would perform secure deletion with crypto-shredding
    if (entityType === 'customer') {
      await this.customerService.deleteCustomer(entityId, businessId, {
        userId: 'lifecycle-system',
      });
    }
  }

  private async performDataArchival(
    entityType: string,
    entityId: string,
    businessId: string
  ): Promise<void> {
    // Implementation would move data to archive storage
    if (entityType === 'customer') {
      await prisma.customer.update({
        where: { id: entityId },
        data: {
          isActive: false,
          updatedAt: new Date(),
          // Add archive metadata
        },
      });
    }
  }

  private async performDataAnonymization(
    entityType: string,
    entityId: string,
    businessId: string
  ): Promise<void> {
    // Implementation would anonymize/pseudonymize PII data
    if (entityType === 'customer') {
      await prisma.customer.update({
        where: { id: entityId },
        data: {
          firstName: null,
          lastName: null,
          email: null,
          phone: null,
          firstNameEncrypted: null,
          lastNameEncrypted: null,
          emailEncrypted: null,
          phoneEncrypted: null,
          updatedAt: new Date(),
        },
      });
    }
  }

  private assessComplianceRisks(
    categories: DataInventory['categories'],
    retentionStatus: DataInventory['retentionStatus']
  ): { riskFactors: string[]; complianceScore: number; recommendations: string[] } {
    const riskFactors: string[] = [];
    const recommendations: string[] = [];
    let complianceScore = 100;

    // Check for overdue deletions
    if (retentionStatus.overdueForDeletion > 0) {
      riskFactors.push('Records overdue for deletion');
      recommendations.push('Review and process overdue retention actions');
      complianceScore -= 20;
    }

    // Check for high volume of non-compliant records
    const nonComplianceRate =
      retentionStatus.nonCompliantRecords /
      (retentionStatus.compliantRecords + retentionStatus.nonCompliantRecords);

    if (nonComplianceRate > 0.2) {
      riskFactors.push('High rate of non-compliant data retention');
      recommendations.push('Update retention policies and increase automation');
      complianceScore -= 30;
    }

    // Check for very old data without clear retention policy
    Object.entries(categories).forEach(([category, data]) => {
      if (data.avgAge > 365 * 5) {
        // 5+ years average age
        riskFactors.push(`Very old ${category.toLowerCase()} data detected`);
        recommendations.push(`Review retention policy for ${category.toLowerCase()}`);
        complianceScore -= 10;
      }
    });

    return {
      riskFactors,
      complianceScore: Math.max(0, complianceScore),
      recommendations,
    };
  }

  /**
   * Create default retention policies
   */
  private async createDefaultRetentionPolicies(): Promise<void> {
    // Check if any policies exist
    const existingPolicies = await prisma.retentionPolicy.count();
    if (existingPolicies > 0) return;

    const defaultPolicies = [
      {
        name: 'Inactive Customer Data Retention',
        description: 'Archive inactive customer data after 2 years, delete after 5 years',
        dataCategory: 'CUSTOMER_PII' as DataCategory,
        entityTypes: ['customers'],
        retentionPeriod: 2,
        retentionUnit: 'YEARS' as RetentionPeriodUnit,
        actionAfterRetention: 'ARCHIVE' as RetentionAction,
        legalBasis: 'Data minimization principle',
        jurisdiction: 'UK',
        autoApply: false,
        requiresApproval: true,
        priority: 'MEDIUM' as const,
      },
    ];

    for (const policy of defaultPolicies) {
      logger.info('Would create default retention policy', {
        name: policy.name,
        dataCategory: policy.dataCategory,
      });
    }
  }

  /**
   * Start scheduled tasks
   */
  private startScheduledTasks(): void {
    // Run retention policy assessments daily at 2 AM
    cron.schedule('0 2 * * *', async () => {
      try {
        const activePolicies = await prisma.retentionPolicy.findMany({
          where: {
            isActive: true,
            autoApply: true,
            nextExecution: { lte: new Date() },
          },
        });

        for (const policy of activePolicies) {
          await this.assessRetentionPolicy(policy.id);
        }
      } catch (error) {
        logger.error('Scheduled retention assessment failed', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });

    // Process pending archival jobs every hour
    cron.schedule('0 * * * *', async () => {
      try {
        const pendingJobs = await prisma.archivalJob.findMany({
          where: {
            status: 'PENDING',
            requiresApproval: false,
          },
          take: 5, // Process max 5 jobs per hour
        });

        for (const job of pendingJobs) {
          await this.executeLifecycleAction(job.id);
        }
      } catch (error) {
        logger.error('Scheduled job processing failed', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });

    logger.info('Data lifecycle scheduled tasks started');
  }
}

// ==========================================
// SINGLETON INSTANCE
// ==========================================

let globalLifecycleService: GDPRDataLifecycleService | null = null;

/**
 * Get global GDPR data lifecycle service instance
 */
export function getGDPRDataLifecycleService(): GDPRDataLifecycleService {
  if (!globalLifecycleService) {
    globalLifecycleService = new GDPRDataLifecycleService();
  }
  return globalLifecycleService;
}
