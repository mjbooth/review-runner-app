/**
 * GDPR Compliance API Endpoints
 *
 * Comprehensive REST API for GDPR compliance operations including
 * data subject requests, identity verification, and compliance reporting.
 */

import { type FastifyPluginAsync } from 'fastify';
import { getGDPRDataSubjectRightsService } from '../lib/gdpr-data-subject-rights';
import { getGDPRWorkflowEngine } from '../lib/gdpr-request-workflow';
import { getGDPRIdentityVerificationService } from '../lib/gdpr-identity-verification';
import { getGDPRDataLifecycleService } from '../lib/gdpr-data-lifecycle';
import { getGDPRComplianceAuditService } from '../lib/gdpr-compliance-audit';
import { getGDPRSecureDeletionService } from '../lib/gdpr-secure-deletion';
import { authenticate } from '../middleware/auth';
import { validateBusinessAccess } from '../middleware/business-access';
import { z } from 'zod';

// ==========================================
// REQUEST VALIDATION SCHEMAS
// ==========================================

const submitDataSubjectRequestSchema = z.object({
  rightType: z.enum([
    'ACCESS',
    'RECTIFICATION',
    'ERASURE',
    'RESTRICT',
    'PORTABILITY',
    'OBJECT',
    'CONSENT_WITHDRAW',
  ]),
  requestorEmail: z.string().email(),
  requestorPhone: z.string().optional(),
  identityData: z.object({
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    additionalInfo: z.record(z.any()).optional(),
  }),
  description: z.string().optional(),
  requestData: z.record(z.any()).optional(),
  channel: z.enum(['CUSTOMER_PORTAL', 'EMAIL', 'PHONE', 'ADMIN', 'API']),
});

const verifyIdentitySchema = z.object({
  verificationToken: z.string(),
  additionalVerificationData: z.record(z.any()).optional(),
});

const submitChallengeResponseSchema = z.object({
  challengeId: z.string(),
  response: z.any(),
});

const processRequestSchema = z.object({
  processedBy: z.string().optional(),
  businessApproval: z.boolean().optional(),
  cascadeDelete: z.boolean().optional(),
  retainForLegal: z.boolean().optional(),
});

const rectificationRequestSchema = z.object({
  updates: z.object({
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    email: z.string().email().optional(),
    phone: z.string().optional(),
    address: z.string().optional(),
  }),
  processedBy: z.string().optional(),
  businessApproval: z.boolean().optional(),
});

const createRetentionPolicySchema = z.object({
  name: z.string().min(1),
  description: z.string(),
  dataCategory: z.enum([
    'CUSTOMER_PII',
    'COMMUNICATION_DATA',
    'TRANSACTION_DATA',
    'AUDIT_LOGS',
    'CONSENT_RECORDS',
    'SUPPORT_TICKETS',
  ]),
  entityTypes: z.array(z.string()),
  retentionPeriod: z.number().positive(),
  retentionUnit: z.enum(['DAYS', 'MONTHS', 'YEARS']),
  actionAfterRetention: z.enum(['DELETE', 'ANONYMIZE', 'ARCHIVE', 'REVIEW', 'RETAIN']),
  legalBasis: z.string().min(1),
  jurisdiction: z.string().default('UK'),
  autoApply: z.boolean().default(false),
  requiresApproval: z.boolean().default(true),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH']).default('MEDIUM'),
  isActive: z.boolean().default(true),
});

const scheduleDeletionSchema = z.object({
  scope: z.enum([
    'CUSTOMER_COMPLETE',
    'CUSTOMER_PII_ONLY',
    'COMMUNICATION_DATA',
    'BACKUP_DATA',
    'CACHE_DATA',
    'TEMPORARY_FILES',
  ]),
  targetEntityType: z.enum(['customer', 'review_request', 'event', 'backup']),
  targetEntityIds: z.array(z.string().uuid()),
  method: z
    .enum(['CRYPTO_SHREDDING', 'SECURE_OVERWRITE', 'LOGICAL_DELETE', 'HYBRID', 'AUDIT_PRESERVE'])
    .optional(),
  legalBasis: z.string().min(1),
  gdprRequestId: z.string().uuid().optional(),
  scheduledFor: z.string().datetime().optional(),
  priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']).optional(),
  retentionOverride: z.string().optional(),
});

const generateComplianceReportSchema = z.object({
  reportType: z.enum([
    'PROCESSING_ACTIVITY',
    'DATA_BREACH',
    'GDPR_COMPLIANCE',
    'CONSENT_AUDIT',
    'DATA_FLOW',
  ]),
  periodStart: z.string().datetime(),
  periodEnd: z.string().datetime(),
  includeRecommendations: z.boolean().default(true),
  detailedAnalysis: z.boolean().default(false),
  exportFormat: z.enum(['JSON', 'PDF', 'CSV']).default('JSON'),
});

// ==========================================
// GDPR COMPLIANCE ROUTES
// ==========================================

const gdprComplianceRoutes: FastifyPluginAsync = async fastify => {
  const gdprService = getGDPRDataSubjectRightsService();
  const workflowEngine = getGDPRWorkflowEngine();
  const verificationService = getGDPRIdentityVerificationService();
  const lifecycleService = getGDPRDataLifecycleService();
  const complianceAudit = getGDPRComplianceAuditService();
  const secureDeletion = getGDPRSecureDeletionService();

  // ==========================================
  // PUBLIC ENDPOINTS (No Authentication Required)
  // ==========================================

  /**
   * Submit GDPR data subject request
   * POST /api/gdpr/requests
   */
  fastify.post(
    '/requests',
    {
      schema: {
        body: submitDataSubjectRequestSchema,
        response: {
          200: z.object({
            success: z.boolean(),
            requestId: z.string().optional(),
            verificationRequired: z.boolean().optional(),
            message: z.string().optional(),
            nextSteps: z.array(z.string()).optional(),
          }),
        },
      },
    },
    async (request, reply) => {
      const { businessId } = request.params as { businessId: string };
      const requestData = request.body;

      try {
        const result = await gdprService.submitDataSubjectRequest(businessId, {
          ...requestData,
          ipAddress: request.ip,
          userAgent: request.headers['user-agent'],
        });

        return reply.send({
          success: result.success,
          requestId: result.data?.requestId,
          verificationRequired: result.data?.verificationRequired,
          message: result.message,
          nextSteps: result.nextSteps,
        });
      } catch (error) {
        fastify.log.error('GDPR request submission failed', { error, businessId });

        return reply.status(500).send({
          success: false,
          message: 'Failed to submit GDPR request',
        });
      }
    }
  );

  /**
   * Verify identity for GDPR request
   * POST /api/gdpr/verify-identity
   */
  fastify.post(
    '/verify-identity',
    {
      schema: {
        body: verifyIdentitySchema,
        response: {
          200: z.object({
            success: z.boolean(),
            requestId: z.string().optional(),
            message: z.string().optional(),
            nextSteps: z.array(z.string()).optional(),
          }),
        },
      },
    },
    async (request, reply) => {
      const { verificationToken, additionalVerificationData } = request.body;

      try {
        const result = await gdprService.verifyDataSubjectIdentity(
          verificationToken,
          additionalVerificationData
        );

        return reply.send({
          success: result.success,
          requestId: result.data?.requestId,
          message: result.message,
          nextSteps: result.data?.nextSteps || result.nextSteps,
        });
      } catch (error) {
        fastify.log.error('Identity verification failed', { error });

        return reply.status(500).send({
          success: false,
          message: 'Identity verification failed',
        });
      }
    }
  );

  /**
   * Submit verification challenge response
   * POST /api/gdpr/verification/:verificationId/challenges/:challengeId
   */
  fastify.post(
    '/verification/:verificationId/challenges/:challengeId',
    {
      schema: {
        params: z.object({
          verificationId: z.string().uuid(),
          challengeId: z.string().uuid(),
        }),
        body: submitChallengeResponseSchema,
        response: {
          200: z.object({
            success: z.boolean(),
            verified: z.boolean().optional(),
            message: z.string().optional(),
            nextSteps: z.array(z.string()).optional(),
          }),
        },
      },
    },
    async (request, reply) => {
      const { verificationId, challengeId } = request.params;
      const { response: challengeResponse } = request.body;

      try {
        const result = await verificationService.submitChallengeResponse(
          verificationId,
          challengeId,
          challengeResponse,
          {
            ipAddress: request.ip,
            userAgent: request.headers['user-agent'],
          }
        );

        return reply.send({
          success: result.success,
          verified: result.success && !result.requiredChallenges,
          message: result.message,
          nextSteps: result.nextSteps,
        });
      } catch (error) {
        fastify.log.error('Challenge response failed', { error, verificationId, challengeId });

        return reply.status(500).send({
          success: false,
          message: 'Challenge verification failed',
        });
      }
    }
  );

  // ==========================================
  // BUSINESS ADMIN ENDPOINTS (Authentication Required)
  // ==========================================

  /**
   * Get business GDPR requests
   * GET /api/gdpr/business/:businessId/requests
   */
  fastify.get(
    '/business/:businessId/requests',
    {
      preHandler: [authenticate, validateBusinessAccess],
      schema: {
        params: z.object({ businessId: z.string().uuid() }),
        querystring: z.object({
          status: z.string().optional(),
          rightType: z.string().optional(),
          page: z.string().optional(),
          limit: z.string().optional(),
        }),
      },
    },
    async (request, reply) => {
      const { businessId } = request.params;
      const { status, rightType, page = '1', limit = '20' } = request.query;

      try {
        // Get workflow status with filtering
        const workflowStatus = await workflowEngine.getWorkflowStatus(businessId);

        // Apply filters
        let requests = [...workflowStatus.pendingRequests, ...workflowStatus.overdueRequests];

        if (status) {
          requests = requests.filter(r => r.status === status);
        }

        if (rightType) {
          requests = requests.filter(r => r.rightType === rightType);
        }

        // Pagination
        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        const startIdx = (pageNum - 1) * limitNum;
        const paginatedRequests = requests.slice(startIdx, startIdx + limitNum);

        return reply.send({
          requests: paginatedRequests,
          totalCount: requests.length,
          page: pageNum,
          totalPages: Math.ceil(requests.length / limitNum),
          metrics: workflowStatus.metrics,
          recentActivity: workflowStatus.recentActivity.slice(0, 10),
        });
      } catch (error) {
        fastify.log.error('Failed to get GDPR requests', { error, businessId });

        return reply.status(500).send({
          success: false,
          message: 'Failed to retrieve GDPR requests',
        });
      }
    }
  );

  /**
   * Process GDPR access request
   * POST /api/gdpr/business/:businessId/requests/:requestId/process-access
   */
  fastify.post(
    '/business/:businessId/requests/:requestId/process-access',
    {
      preHandler: [authenticate, validateBusinessAccess],
      schema: {
        params: z.object({
          businessId: z.string().uuid(),
          requestId: z.string().uuid(),
        }),
        body: processRequestSchema,
      },
    },
    async (request, reply) => {
      const { requestId } = request.params;
      const { processedBy, ...options } = request.body;
      const userId = request.user?.id || 'unknown';

      try {
        const result = await gdprService.processAccessRequest(requestId, {
          processedBy: processedBy || userId,
          ...options,
        });

        return reply.send({
          success: result.success,
          exportData: result.data,
          message: result.message,
          nextSteps: result.nextSteps,
        });
      } catch (error) {
        fastify.log.error('Access request processing failed', { error, requestId });

        return reply.status(500).send({
          success: false,
          message: 'Failed to process access request',
        });
      }
    }
  );

  /**
   * Process GDPR rectification request
   * POST /api/gdpr/business/:businessId/requests/:requestId/process-rectification
   */
  fastify.post(
    '/business/:businessId/requests/:requestId/process-rectification',
    {
      preHandler: [authenticate, validateBusinessAccess],
      schema: {
        params: z.object({
          businessId: z.string().uuid(),
          requestId: z.string().uuid(),
        }),
        body: rectificationRequestSchema,
      },
    },
    async (request, reply) => {
      const { requestId } = request.params;
      const { updates, processedBy, ...options } = request.body;
      const userId = request.user?.id || 'unknown';

      try {
        const result = await gdprService.processRectificationRequest(requestId, updates, {
          processedBy: processedBy || userId,
          ...options,
        });

        return reply.send({
          success: result.success,
          message: result.message,
          nextSteps: result.nextSteps,
        });
      } catch (error) {
        fastify.log.error('Rectification request processing failed', { error, requestId });

        return reply.status(500).send({
          success: false,
          message: 'Failed to process rectification request',
        });
      }
    }
  );

  /**
   * Process GDPR erasure request
   * POST /api/gdpr/business/:businessId/requests/:requestId/process-erasure
   */
  fastify.post(
    '/business/:businessId/requests/:requestId/process-erasure',
    {
      preHandler: [authenticate, validateBusinessAccess],
      schema: {
        params: z.object({
          businessId: z.string().uuid(),
          requestId: z.string().uuid(),
        }),
        body: processRequestSchema,
      },
    },
    async (request, reply) => {
      const { requestId } = request.params;
      const { processedBy, ...options } = request.body;
      const userId = request.user?.id || 'unknown';

      try {
        const result = await gdprService.processErasureRequest(requestId, {
          processedBy: processedBy || userId,
          ...options,
        });

        return reply.send({
          success: result.success,
          message: result.message,
          nextSteps: result.nextSteps,
        });
      } catch (error) {
        fastify.log.error('Erasure request processing failed', { error, requestId });

        return reply.status(500).send({
          success: false,
          message: 'Failed to process erasure request',
        });
      }
    }
  );

  // ==========================================
  // DATA LIFECYCLE MANAGEMENT
  // ==========================================

  /**
   * Create retention policy
   * POST /api/gdpr/business/:businessId/retention-policies
   */
  fastify.post(
    '/business/:businessId/retention-policies',
    {
      preHandler: [authenticate, validateBusinessAccess],
      schema: {
        params: z.object({ businessId: z.string().uuid() }),
        body: createRetentionPolicySchema,
      },
    },
    async (request, reply) => {
      const { businessId } = request.params;
      const policyData = request.body;
      const userId = request.user?.id || 'unknown';

      try {
        const result = await lifecycleService.createRetentionPolicy(
          businessId,
          {
            ...policyData,
            createdBy: userId,
          },
          { userId }
        );

        return reply.send({
          success: result.success,
          policyId: result.policyId,
          message: result.message,
        });
      } catch (error) {
        fastify.log.error('Retention policy creation failed', { error, businessId });

        return reply.status(500).send({
          success: false,
          message: 'Failed to create retention policy',
        });
      }
    }
  );

  /**
   * Assess retention policy
   * POST /api/gdpr/business/:businessId/retention-policies/:policyId/assess
   */
  fastify.post(
    '/business/:businessId/retention-policies/:policyId/assess',
    {
      preHandler: [authenticate, validateBusinessAccess],
      schema: {
        params: z.object({
          businessId: z.string().uuid(),
          policyId: z.string().uuid(),
        }),
      },
    },
    async (request, reply) => {
      const { policyId } = request.params;

      try {
        const result = await lifecycleService.assessRetentionPolicy(policyId);

        return reply.send({
          success: result.success,
          assessment: result.assessment,
          message: result.message,
        });
      } catch (error) {
        fastify.log.error('Retention assessment failed', { error, policyId });

        return reply.status(500).send({
          success: false,
          message: 'Failed to assess retention policy',
        });
      }
    }
  );

  /**
   * Generate data inventory
   * GET /api/gdpr/business/:businessId/data-inventory
   */
  fastify.get(
    '/business/:businessId/data-inventory',
    {
      preHandler: [authenticate, validateBusinessAccess],
      schema: {
        params: z.object({ businessId: z.string().uuid() }),
      },
    },
    async (request, reply) => {
      const { businessId } = request.params;

      try {
        const inventory = await lifecycleService.generateDataInventory(businessId);

        return reply.send({
          success: true,
          inventory,
        });
      } catch (error) {
        fastify.log.error('Data inventory generation failed', { error, businessId });

        return reply.status(500).send({
          success: false,
          message: 'Failed to generate data inventory',
        });
      }
    }
  );

  // ==========================================
  // SECURE DELETION
  // ==========================================

  /**
   * Schedule secure deletion
   * POST /api/gdpr/business/:businessId/secure-deletion
   */
  fastify.post(
    '/business/:businessId/secure-deletion',
    {
      preHandler: [authenticate, validateBusinessAccess],
      schema: {
        params: z.object({ businessId: z.string().uuid() }),
        body: scheduleDeletionSchema,
      },
    },
    async (request, reply) => {
      const { businessId } = request.params;
      const deletionRequest = request.body;
      const userId = request.user?.id || 'unknown';

      try {
        const result = await secureDeletion.scheduleDeletion(
          businessId,
          {
            ...deletionRequest,
            scheduledFor: deletionRequest.scheduledFor
              ? new Date(deletionRequest.scheduledFor)
              : undefined,
          },
          { userId, requiresApproval: true }
        );

        return reply.send({
          success: result.success,
          deletionRequestId: result.deletionRequestId,
          message: result.message,
          estimatedCompletion: result.estimatedCompletion,
        });
      } catch (error) {
        fastify.log.error('Secure deletion scheduling failed', { error, businessId });

        return reply.status(500).send({
          success: false,
          message: 'Failed to schedule secure deletion',
        });
      }
    }
  );

  /**
   * Execute secure deletion
   * POST /api/gdpr/business/:businessId/secure-deletion/:deletionRequestId/execute
   */
  fastify.post(
    '/business/:businessId/secure-deletion/:deletionRequestId/execute',
    {
      preHandler: [authenticate, validateBusinessAccess],
      schema: {
        params: z.object({
          businessId: z.string().uuid(),
          deletionRequestId: z.string().uuid(),
        }),
        body: z.object({
          dryRun: z.boolean().optional(),
          batchSize: z.number().positive().optional(),
        }),
      },
    },
    async (request, reply) => {
      const { deletionRequestId } = request.params;
      const options = request.body;
      const userId = request.user?.id || 'unknown';

      try {
        const result = await secureDeletion.executeDeletion(deletionRequestId);

        return reply.send({
          success: result.success,
          result: result.result,
          certificateId: result.certificateId,
          message: result.message,
        });
      } catch (error) {
        fastify.log.error('Secure deletion execution failed', { error, deletionRequestId });

        return reply.status(500).send({
          success: false,
          message: 'Failed to execute secure deletion',
        });
      }
    }
  );

  // ==========================================
  // COMPLIANCE REPORTING
  // ==========================================

  /**
   * Generate compliance report
   * POST /api/gdpr/business/:businessId/compliance-reports
   */
  fastify.post(
    '/business/:businessId/compliance-reports',
    {
      preHandler: [authenticate, validateBusinessAccess],
      schema: {
        params: z.object({ businessId: z.string().uuid() }),
        body: generateComplianceReportSchema,
      },
    },
    async (request, reply) => {
      const { businessId } = request.params;
      const {
        reportType,
        periodStart,
        periodEnd,
        includeRecommendations,
        detailedAnalysis,
        exportFormat,
      } = request.body;

      try {
        const report = await complianceAudit.generateComplianceReport(
          businessId,
          reportType,
          new Date(periodStart),
          new Date(periodEnd),
          {
            includeRecommendations,
            detailedAnalysis,
            exportFormat,
          }
        );

        return reply.send({
          success: true,
          report,
        });
      } catch (error) {
        fastify.log.error('Compliance report generation failed', { error, businessId });

        return reply.status(500).send({
          success: false,
          message: 'Failed to generate compliance report',
        });
      }
    }
  );

  /**
   * Verify audit integrity
   * POST /api/gdpr/business/:businessId/audit-integrity/verify
   */
  fastify.post(
    '/business/:businessId/audit-integrity/verify',
    {
      preHandler: [authenticate, validateBusinessAccess],
      schema: {
        params: z.object({ businessId: z.string().uuid() }),
        body: z.object({
          fromDate: z.string().datetime().optional(),
          toDate: z.string().datetime().optional(),
          eventIds: z.array(z.string().uuid()).optional(),
          fullChainVerification: z.boolean().optional(),
        }),
      },
    },
    async (request, reply) => {
      const { businessId } = request.params;
      const { fromDate, toDate, eventIds, fullChainVerification } = request.body;

      try {
        const verificationResult = await complianceAudit.verifyAuditIntegrity(businessId, {
          fromDate: fromDate ? new Date(fromDate) : undefined,
          toDate: toDate ? new Date(toDate) : undefined,
          eventIds,
          fullChainVerification,
        });

        return reply.send({
          success: true,
          verificationResult,
        });
      } catch (error) {
        fastify.log.error('Audit integrity verification failed', { error, businessId });

        return reply.status(500).send({
          success: false,
          message: 'Failed to verify audit integrity',
        });
      }
    }
  );

  /**
   * Get correlated events
   * GET /api/gdpr/business/:businessId/events/:correlationId
   */
  fastify.get(
    '/business/:businessId/events/:correlationId',
    {
      preHandler: [authenticate, validateBusinessAccess],
      schema: {
        params: z.object({
          businessId: z.string().uuid(),
          correlationId: z.string().uuid(),
        }),
        querystring: z.object({
          includeEncryption: z.string().optional(),
          includeBase: z.string().optional(),
          timeWindow: z.string().optional(),
        }),
      },
    },
    async (request, reply) => {
      const { correlationId } = request.params;
      const { includeEncryption = 'false', includeBase = 'true', timeWindow } = request.query;

      try {
        const correlatedEvents = await complianceAudit.getCorrelatedEvents(correlationId, {
          includeEncryption: includeEncryption === 'true',
          includeBase: includeBase === 'true',
          timeWindow: timeWindow ? parseInt(timeWindow) : undefined,
        });

        return reply.send({
          success: true,
          events: correlatedEvents,
        });
      } catch (error) {
        fastify.log.error('Event correlation failed', { error, correlationId });

        return reply.status(500).send({
          success: false,
          message: 'Failed to retrieve correlated events',
        });
      }
    }
  );

  // ==========================================
  // HEALTH AND STATUS
  // ==========================================

  /**
   * Get GDPR compliance status
   * GET /api/gdpr/business/:businessId/status
   */
  fastify.get(
    '/business/:businessId/status',
    {
      preHandler: [authenticate, validateBusinessAccess],
      schema: {
        params: z.object({ businessId: z.string().uuid() }),
      },
    },
    async (request, reply) => {
      const { businessId } = request.params;

      try {
        // Get overall compliance status
        const [workflowStatus, dataInventory] = await Promise.all([
          workflowEngine.getWorkflowStatus(businessId),
          lifecycleService.generateDataInventory(businessId),
        ]);

        const status = {
          gdprRequests: {
            pending: workflowStatus.pendingRequests.length,
            overdue: workflowStatus.overdueRequests.length,
            completedThisMonth: workflowStatus.metrics.businessMetrics.requestsThisMonth,
            avgResponseTime: workflowStatus.metrics.processingTimes.averageCompletionTime,
          },
          dataCompliance: {
            complianceScore: dataInventory.complianceScore,
            riskFactors: dataInventory.riskFactors.length,
            totalDataRecords: Object.values(dataInventory.categories).reduce(
              (sum, cat) => sum + cat.totalRecords,
              0
            ),
            pendingRetention: dataInventory.retentionStatus.pendingReview,
          },
          recentActivity: workflowStatus.recentActivity.slice(0, 5),
        };

        return reply.send({
          success: true,
          status,
        });
      } catch (error) {
        fastify.log.error('Status retrieval failed', { error, businessId });

        return reply.status(500).send({
          success: false,
          message: 'Failed to retrieve compliance status',
        });
      }
    }
  );
};

export default gdprComplianceRoutes;
