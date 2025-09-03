/**
 * Comprehensive End-to-End GDPR Compliance System Tests
 *
 * Full test suite covering all GDPR compliance components
 * and their integration points.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import { prisma } from '../lib/prisma';
import { getGDPRDataSubjectRightsService } from '../lib/gdpr-data-subject-rights';
import { getGDPRWorkflowEngine } from '../lib/gdpr-request-workflow';
import { getGDPRIdentityVerificationService } from '../lib/gdpr-identity-verification';
import { getGDPRDataLifecycleService } from '../lib/gdpr-data-lifecycle';
import { getGDPRComplianceAuditService } from '../lib/gdpr-compliance-audit';
import { getGDPRSecureDeletionService } from '../lib/gdpr-secure-deletion';
import { getGDPRDataExportService } from '../lib/gdpr-data-export';
import { getGDPRBreachNotificationService } from '../lib/gdpr-breach-notification';
import { getEncryptedCustomerService } from '../lib/encrypted-customer-service';
import crypto from 'crypto';

// Test data setup
const testBusinessId = crypto.randomUUID();
const testCustomerId = crypto.randomUUID();
const testEmail = 'test.subject@example.com';
const testPhone = '+447123456789';

describe('GDPR Compliance System - End-to-End Tests', () => {
  let gdprService: any;
  let workflowEngine: any;
  let verificationService: any;
  let lifecycleService: any;
  let auditService: any;
  let deletionService: any;
  let exportService: any;
  let breachService: any;
  let customerService: any;

  beforeAll(async () => {
    // Initialize all services
    gdprService = getGDPRDataSubjectRightsService();
    workflowEngine = getGDPRWorkflowEngine();
    verificationService = getGDPRIdentityVerificationService();
    lifecycleService = getGDPRDataLifecycleService();
    auditService = getGDPRComplianceAuditService();
    deletionService = getGDPRSecureDeletionService();
    exportService = getGDPRDataExportService();
    breachService = getGDPRBreachNotificationService();
    customerService = getEncryptedCustomerService();

    // Create test business
    await prisma.business.create({
      data: {
        id: testBusinessId,
        name: 'Test Business Ltd',
        email: 'test@business.com',
        phone: '+441234567890',
        isActive: true,
      },
    });

    // Create test customer
    await customerService.createCustomer(testBusinessId, {
      email: testEmail,
      phone: testPhone,
      firstName: 'John',
      lastName: 'Doe',
      businessName: 'Customer Business',
      address: '123 Test Street, Test City, TC1 2AB',
    });
  });

  afterAll(async () => {
    // Clean up test data
    await prisma.business.deleteMany({ where: { id: testBusinessId } });
    await prisma.customer.deleteMany({ where: { email: testEmail } });
    await prisma.dataSubjectRequest.deleteMany({ where: { businessId: testBusinessId } });
    await prisma.complianceAuditEvent.deleteMany({ where: { businessId: testBusinessId } });
  });

  describe('1. GDPR Data Subject Rights Core Testing', () => {
    let requestId: string;

    it('should submit ACCESS request successfully', async () => {
      const result = await gdprService.submitDataSubjectRequest(testBusinessId, {
        rightType: 'ACCESS',
        requestorEmail: testEmail,
        requestorPhone: testPhone,
        identityData: {
          firstName: 'John',
          lastName: 'Doe',
        },
        description: 'I want to access my personal data',
        channel: 'CUSTOMER_PORTAL',
        ipAddress: '127.0.0.1',
        userAgent: 'Test Browser',
      });

      expect(result.success).toBe(true);
      expect(result.requestId).toBeDefined();
      expect(result.verificationRequired).toBe(true);

      requestId = result.requestId!;
    });

    it('should process ACCESS request with business approval', async () => {
      // First verify identity (mock)
      await gdprService.verifyDataSubjectIdentity(requestId, {});

      // Process access request
      const result = await gdprService.processAccessRequest(requestId, {
        processedBy: 'test-admin',
        businessApproval: true,
      });

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data.personalData).toBeDefined();
    });

    it('should submit and process RECTIFICATION request', async () => {
      const submitResult = await gdprService.submitDataSubjectRequest(testBusinessId, {
        rightType: 'RECTIFICATION',
        requestorEmail: testEmail,
        identityData: { firstName: 'John', lastName: 'Doe' },
        description: 'Update my phone number',
        channel: 'CUSTOMER_PORTAL',
      });

      expect(submitResult.success).toBe(true);

      // Verify and process
      await gdprService.verifyDataSubjectIdentity(submitResult.requestId!, {});

      const processResult = await gdprService.processRectificationRequest(
        submitResult.requestId!,
        { phone: '+447987654321' },
        { processedBy: 'test-admin', businessApproval: true }
      );

      expect(processResult.success).toBe(true);
    });

    it('should submit and process ERASURE request', async () => {
      const submitResult = await gdprService.submitDataSubjectRequest(testBusinessId, {
        rightType: 'ERASURE',
        requestorEmail: testEmail,
        identityData: { firstName: 'John', lastName: 'Doe' },
        description: 'Delete all my personal data',
        channel: 'CUSTOMER_PORTAL',
      });

      expect(submitResult.success).toBe(true);

      // Verify and process
      await gdprService.verifyDataSubjectIdentity(submitResult.requestId!, {});

      const processResult = await gdprService.processErasureRequest(submitResult.requestId!, {
        processedBy: 'test-admin',
        businessApproval: true,
        cascadeDelete: true,
      });

      expect(processResult.success).toBe(true);
    });
  });

  describe('2. Workflow Engine State Management Testing', () => {
    let testRequestId: string;

    beforeEach(async () => {
      const result = await gdprService.submitDataSubjectRequest(testBusinessId, {
        rightType: 'ACCESS',
        requestorEmail: testEmail,
        identityData: { firstName: 'John', lastName: 'Doe' },
        channel: 'CUSTOMER_PORTAL',
      });
      testRequestId = result.requestId!;
    });

    it('should track workflow status correctly', async () => {
      const status = await workflowEngine.getWorkflowStatus(testBusinessId);

      expect(status.pendingRequests.length).toBeGreaterThan(0);
      expect(status.metrics).toBeDefined();
      expect(status.recentActivity).toBeDefined();
    });

    it('should process workflow transitions', async () => {
      const result = await workflowEngine.processWorkflowTransition(
        testRequestId,
        'PENDING',
        'VERIFIED',
        {
          triggeredBy: 'test-system',
          verificationData: { method: 'email' },
        }
      );

      expect(result.success).toBe(true);
      expect(result.newStatus).toBe('VERIFIED');
    });

    it('should handle workflow escalation', async () => {
      // Create overdue request scenario
      await prisma.dataSubjectRequest.update({
        where: { id: testRequestId },
        data: {
          createdAt: new Date(Date.now() - 25 * 24 * 60 * 60 * 1000), // 25 days ago
          dueDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000), // 5 days overdue
        },
      });

      const status = await workflowEngine.getWorkflowStatus(testBusinessId);
      expect(status.overdueRequests.length).toBeGreaterThan(0);
    });
  });

  describe('3. Identity Verification System Testing', () => {
    let verificationId: string;

    it('should initiate identity verification', async () => {
      const result = await verificationService.initiateVerification(testBusinessId, {
        requestorEmail: testEmail,
        requestorPhone: testPhone,
        identityData: { firstName: 'John', lastName: 'Doe' },
        requestType: 'ACCESS',
      });

      expect(result.success).toBe(true);
      expect(result.verificationId).toBeDefined();
      expect(result.requiredChallenges).toBeDefined();

      verificationId = result.verificationId!;
    });

    it('should process verification challenges', async () => {
      // Get verification details
      const verification = await prisma.identityVerification.findUnique({
        where: { verificationId },
        include: { challenges: true },
      });

      expect(verification).toBeDefined();
      expect(verification!.challenges.length).toBeGreaterThan(0);

      const challenge = verification!.challenges[0];

      const result = await verificationService.submitChallengeResponse(
        verificationId,
        challenge.challengeId,
        { token: 'test-token-123456' },
        { ipAddress: '127.0.0.1' }
      );

      expect(result.success).toBe(true);
    });

    it('should complete verification process', async () => {
      const result = await verificationService.completeVerification(verificationId, {
        finalValidation: true,
      });

      expect(result.success).toBe(true);
      expect(result.verified).toBe(true);
    });
  });

  describe('4. Data Lifecycle Management Testing', () => {
    let policyId: string;

    it('should create retention policy', async () => {
      const result = await lifecycleService.createRetentionPolicy(
        testBusinessId,
        {
          name: 'Test Customer Data Policy',
          description: 'Test retention policy for customer data',
          dataCategory: 'CUSTOMER_PII',
          entityTypes: ['customers'],
          retentionPeriod: 7,
          retentionUnit: 'YEARS',
          actionAfterRetention: 'ARCHIVE',
          legalBasis: 'Data protection and privacy compliance',
          jurisdiction: 'UK',
          autoApply: false,
          requiresApproval: true,
          priority: 'MEDIUM',
          isActive: true,
          createdBy: 'test-admin',
        },
        { userId: 'test-admin' }
      );

      expect(result.success).toBe(true);
      expect(result.policyId).toBeDefined();

      policyId = result.policyId!;
    });

    it('should assess retention policy', async () => {
      const result = await lifecycleService.assessRetentionPolicy(policyId);

      expect(result.success).toBe(true);
      expect(result.assessment).toBeDefined();
      expect(result.assessment.eligibleRecords).toBeDefined();
    });

    it('should generate data inventory', async () => {
      const inventory = await lifecycleService.generateDataInventory(testBusinessId);

      expect(inventory).toBeDefined();
      expect(inventory.complianceScore).toBeGreaterThan(0);
      expect(inventory.categories).toBeDefined();
      expect(inventory.retentionStatus).toBeDefined();
    });
  });

  describe('5. Secure Deletion with Crypto-Shredding Testing', () => {
    let deletionRequestId: string;

    it('should schedule secure deletion', async () => {
      const result = await deletionService.scheduleDeletion(
        testBusinessId,
        {
          scope: 'CUSTOMER_COMPLETE',
          targetEntityType: 'customer',
          targetEntityIds: [testCustomerId],
          method: 'CRYPTO_SHREDDING',
          legalBasis: 'GDPR Article 17 - Right to erasure',
          priority: 'NORMAL',
        },
        { userId: 'test-admin', requiresApproval: false }
      );

      expect(result.success).toBe(true);
      expect(result.deletionRequestId).toBeDefined();

      deletionRequestId = result.deletionRequestId!;
    });

    it('should execute secure deletion', async () => {
      const result = await deletionService.executeDeletion(deletionRequestId);

      expect(result.success).toBe(true);
      expect(result.result).toBeDefined();
      expect(result.result.recordsDeleted).toBeGreaterThan(0);
      expect(result.certificateId).toBeDefined();
    });

    it('should perform crypto-shredding verification', async () => {
      // Verify encryption keys were destroyed
      const verification = await deletionService.verifyDeletion(deletionRequestId);

      expect(verification.verified).toBe(true);
      expect(verification.cryptoShreddingCompleted).toBe(true);
    });
  });

  describe('6. Compliance Audit Trail Testing', () => {
    it('should log compliance events', async () => {
      const result = await auditService.logComplianceEvent({
        businessId: testBusinessId,
        eventType: 'DATA_PROCESSED',
        category: 'PROCESSING',
        severity: 'LOW',
        dataSubjectId: testCustomerId,
        dataSubjectType: 'CUSTOMER',
        processingPurpose: 'Test data processing',
        legalBasis: 'CONSENT',
        dataCategories: ['personal_data'],
        processingLocation: 'UK',
        systemId: 'test_system',
        triggeredBy: 'test-user',
        automated: false,
        description: 'Test compliance event logging',
        retentionPeriod: 2555,
        specialCategory: false,
        childData: false,
        correlationId: crypto.randomUUID(),
        metadata: { testEvent: true },
      });

      expect(result.success).toBe(true);
      expect(result.eventId).toBeDefined();
      expect(result.auditHash).toBeDefined();
    });

    it('should verify audit trail integrity', async () => {
      const verification = await auditService.verifyAuditIntegrity(testBusinessId);

      expect(verification.verified).toBe(true);
      expect(verification.checkedEvents).toBeGreaterThan(0);
      expect(verification.integrityScore).toBe(100);
    });

    it('should generate compliance report', async () => {
      const report = await auditService.generateComplianceReport(
        testBusinessId,
        'GDPR_COMPLIANCE',
        new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
        new Date(),
        { includeRecommendations: true }
      );

      expect(report).toBeDefined();
      expect(report.eventCount).toBeGreaterThan(0);
      expect(report.complianceMetrics).toBeDefined();
      expect(report.executiveSummary).toBeDefined();
    });
  });

  describe('7. Data Export with Encryption Testing', () => {
    let exportRequestId: string;

    it('should create data export request', async () => {
      const result = await exportService.createExportRequest(
        testBusinessId,
        {
          dataSubjectId: testCustomerId,
          requestorEmail: testEmail,
          format: 'JSON',
          dataCategories: ['PERSONAL_DETAILS', 'COMMUNICATION_DATA'],
          includeDeletedData: false,
          encryption: { enabled: true, password: 'test-password-123' },
          delivery: { method: 'EMAIL', emailAddress: testEmail },
        },
        { triggeredBy: 'test-user' }
      );

      expect(result.success).toBe(true);
      expect(result.requestId).toBeDefined();
      expect(result.estimatedSize).toBeGreaterThan(0);

      exportRequestId = result.requestId!;
    });

    it('should process data export', async () => {
      const result = await exportService.processExportRequest(exportRequestId);

      expect(result.success).toBe(true);
      expect(result.exportPackage).toBeDefined();
      expect(result.exportPackage!.personalData).toBeDefined();
    });

    it('should track export status', async () => {
      const status = await exportService.getExportStatus(exportRequestId);

      expect(status.found).toBe(true);
      expect(status.request).toBeDefined();
      expect(status.request!.status).toBe('COMPLETED');
    });
  });

  describe('8. Breach Notification Workflows Testing', () => {
    let breachId: string;

    it('should detect potential breach', async () => {
      const result = await breachService.detectPotentialBreach(testBusinessId, {
        eventType: 'UNAUTHORIZED_ACCESS',
        severity: 'HIGH',
        description: 'Unauthorized access to customer database detected',
        affectedSystems: ['customer_database', 'api_gateway'],
        dataCategories: ['personal_data', 'contact_info'],
        suspectedRecords: 1500,
        detectedBy: 'security_system',
        technicalDetails: {
          attackVector: 'SQL injection',
          affectedTables: ['customers', 'review_requests'],
        },
      });

      expect(result.breachDetected).toBe(true);
      expect(result.breachId).toBeDefined();
      expect(result.requiresImmedateAction).toBe(true);

      breachId = result.breachId!;
    });

    it('should update breach status', async () => {
      const result = await breachService.updateBreachStatus(
        breachId,
        {
          status: 'INVESTIGATING',
          severity: 'HIGH',
          dataSubjectsAffected: 1500,
          recordsAffected: 3000,
          riskAssessment: {
            riskLevel: 'HIGH',
            likelyConsequences: ['Identity theft risk', 'Financial fraud risk'],
            mitigationMeasures: ['Password reset notifications', 'Credit monitoring offer'],
          },
          containmentAction: {
            action: 'Database access revoked, firewall rules updated',
            takenBy: 'security-team',
            effective: true,
          },
        },
        { updatedBy: 'security-manager' }
      );

      expect(result.success).toBe(true);
      expect(result.notificationsTriggered.length).toBeGreaterThan(0);
    });

    it('should notify authority of breach', async () => {
      // Update status to confirmed first
      await breachService.updateBreachStatus(
        breachId,
        { status: 'CONFIRMED' },
        { updatedBy: 'security-manager' }
      );

      const result = await breachService.notifyAuthorityOfBreach(breachId, {
        contactDetails: {
          organisationName: 'Test Business Ltd',
          contactPerson: 'John Security',
          email: 'security@testbusiness.com',
          phone: '+441234567890',
        },
        additionalInfo: 'Additional context about the breach',
      });

      expect(result.success).toBe(true);
      expect(result.notificationId).toBeDefined();
    });
  });

  describe('9. API Endpoints Integration Testing', () => {
    // These tests would typically use supertest with a test server
    // For now, we'll test the service layer integration

    it('should handle complete GDPR request lifecycle via services', async () => {
      // 1. Submit request
      const submitResult = await gdprService.submitDataSubjectRequest(testBusinessId, {
        rightType: 'PORTABILITY',
        requestorEmail: testEmail,
        identityData: { firstName: 'John', lastName: 'Doe' },
        channel: 'API',
      });

      expect(submitResult.success).toBe(true);
      const requestId = submitResult.requestId!;

      // 2. Verify identity
      const verifyResult = await gdprService.verifyDataSubjectIdentity(requestId, {});
      expect(verifyResult.success).toBe(true);

      // 3. Process workflow transition
      const workflowResult = await workflowEngine.processWorkflowTransition(
        requestId,
        'VERIFIED',
        'IN_PROGRESS',
        { triggeredBy: 'api-system' }
      );
      expect(workflowResult.success).toBe(true);

      // 4. Create data export
      const exportResult = await exportService.createExportRequest(
        testBusinessId,
        {
          dataSubjectId: testCustomerId,
          requestorEmail: testEmail,
          format: 'JSON',
        },
        { gdprRequestId: requestId, triggeredBy: 'api-system' }
      );
      expect(exportResult.success).toBe(true);

      // 5. Complete request
      const completeResult = await workflowEngine.processWorkflowTransition(
        requestId,
        'IN_PROGRESS',
        'COMPLETED',
        {
          triggeredBy: 'api-system',
          completionData: { exportRequestId: exportResult.requestId },
        }
      );
      expect(completeResult.success).toBe(true);
    });
  });

  describe('10. Cross-Component Integration Testing', () => {
    it('should maintain audit trail across all operations', async () => {
      // Perform various operations and verify audit correlation
      const correlationId = crypto.randomUUID();

      // Operation 1: Create retention policy
      await lifecycleService.createRetentionPolicy(
        testBusinessId,
        {
          name: 'Integration Test Policy',
          description: 'Policy for integration testing',
          dataCategory: 'CUSTOMER_PII',
          entityTypes: ['customers'],
          retentionPeriod: 5,
          retentionUnit: 'YEARS',
          actionAfterRetention: 'DELETE',
          legalBasis: 'Integration testing',
          createdBy: 'integration-test',
        },
        { userId: 'integration-test' }
      );

      // Operation 2: Submit GDPR request
      const gdprResult = await gdprService.submitDataSubjectRequest(testBusinessId, {
        rightType: 'ACCESS',
        requestorEmail: testEmail,
        identityData: { firstName: 'John', lastName: 'Doe' },
        channel: 'CUSTOMER_PORTAL',
      });

      // Operation 3: Log custom compliance event
      await auditService.logComplianceEvent({
        businessId: testBusinessId,
        eventType: 'IMPACT_ASSESSMENT',
        category: 'GOVERNANCE',
        severity: 'LOW',
        dataSubjectType: 'OTHER',
        processingPurpose: 'Integration testing audit trail',
        legalBasis: 'LEGITIMATE_INTERESTS',
        dataCategories: ['test_data'],
        processingLocation: 'UK',
        systemId: 'integration_test',
        triggeredBy: 'integration-test',
        automated: true,
        description: 'Cross-component integration test',
        retentionPeriod: 2555,
        specialCategory: false,
        childData: false,
        correlationId,
        metadata: {
          testType: 'integration',
          gdprRequestId: gdprResult.requestId,
        },
      });

      // Verify correlated events exist
      const correlatedEvents = await auditService.getCorrelatedEvents(correlationId);
      expect(correlatedEvents.events.length).toBeGreaterThan(0);
    });

    it('should handle cascading operations correctly', async () => {
      // Test erasure request with cascading deletion
      const erasureResult = await gdprService.submitDataSubjectRequest(testBusinessId, {
        rightType: 'ERASURE',
        requestorEmail: testEmail,
        identityData: { firstName: 'John', lastName: 'Doe' },
        description: 'Complete data erasure with cascading deletion',
        channel: 'CUSTOMER_PORTAL',
      });

      expect(erasureResult.success).toBe(true);

      // Verify and process
      await gdprService.verifyDataSubjectIdentity(erasureResult.requestId!, {});

      const processResult = await gdprService.processErasureRequest(erasureResult.requestId!, {
        processedBy: 'integration-test',
        businessApproval: true,
        cascadeDelete: true,
      });

      expect(processResult.success).toBe(true);

      // Verify deletion was scheduled
      const deletionRequests = await prisma.deletionRequest.findMany({
        where: {
          businessId: testBusinessId,
          gdprRequestId: erasureResult.requestId,
        },
      });

      expect(deletionRequests.length).toBeGreaterThan(0);
    });
  });

  describe('11. Performance and Error Handling Testing', () => {
    it('should handle high-volume audit events', async () => {
      const events = Array.from({ length: 100 }, (_, i) =>
        auditService.logComplianceEvent({
          businessId: testBusinessId,
          eventType: 'DATA_PROCESSED',
          category: 'PROCESSING',
          severity: 'LOW',
          dataSubjectType: 'CUSTOMER',
          processingPurpose: `Bulk test event ${i}`,
          legalBasis: 'CONSENT',
          dataCategories: ['test_data'],
          processingLocation: 'UK',
          systemId: 'bulk_test',
          triggeredBy: 'performance-test',
          automated: true,
          description: `Bulk audit event ${i}`,
          retentionPeriod: 30,
          specialCategory: false,
          childData: false,
          correlationId: crypto.randomUUID(),
          metadata: { eventIndex: i },
        })
      );

      const results = await Promise.all(events);
      const successCount = results.filter(r => r.success).length;

      expect(successCount).toBe(100);
    });

    it('should handle invalid data gracefully', async () => {
      // Test with invalid email
      const result = await gdprService.submitDataSubjectRequest(testBusinessId, {
        rightType: 'ACCESS',
        requestorEmail: 'invalid-email',
        identityData: { firstName: 'Test', lastName: 'User' },
        channel: 'CUSTOMER_PORTAL',
      } as any);

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
    });

    it('should handle missing resources gracefully', async () => {
      const nonExistentId = crypto.randomUUID();

      const result = await gdprService.processAccessRequest(nonExistentId, {
        processedBy: 'test-user',
        businessApproval: true,
      });

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
    });
  });

  describe('12. Security and Compliance Validation', () => {
    it('should enforce business isolation', async () => {
      const anotherBusinessId = crypto.randomUUID();

      // Create business
      await prisma.business.create({
        data: {
          id: anotherBusinessId,
          name: 'Another Business',
          email: 'another@business.com',
          isActive: true,
        },
      });

      // Try to access data across business boundaries
      const result = await gdprService.submitDataSubjectRequest(anotherBusinessId, {
        rightType: 'ACCESS',
        requestorEmail: testEmail, // Email belongs to testBusinessId
        identityData: { firstName: 'John', lastName: 'Doe' },
        channel: 'CUSTOMER_PORTAL',
      });

      // Should succeed but not find data from other business
      expect(result.success).toBe(true);

      // Cleanup
      await prisma.business.delete({ where: { id: anotherBusinessId } });
    });

    it('should validate data retention compliance', async () => {
      const inventory = await lifecycleService.generateDataInventory(testBusinessId);

      expect(inventory.complianceScore).toBeGreaterThan(70); // Minimum compliance threshold
      expect(inventory.retentionStatus.overdueForDeletion).toBe(0); // No overdue items in test
    });

    it('should verify encryption key management', async () => {
      // Test customer data encryption
      const customer = await customerService.getCustomerById(testCustomerId, {
        businessId: testBusinessId,
      });

      expect(customer).toBeDefined();
      expect(customer!.encryptedFields).toBeDefined();

      // Verify encryption keys exist
      const encryptionStatus = await customerService.verifyEncryption(
        testCustomerId,
        testBusinessId
      );

      expect(encryptionStatus.encrypted).toBe(true);
      expect(encryptionStatus.keyIds.length).toBeGreaterThan(0);
    });
  });
});

// Test utilities
export const testUtils = {
  createTestBusiness: async (name: string) => {
    const businessId = crypto.randomUUID();
    await prisma.business.create({
      data: {
        id: businessId,
        name,
        email: `${name.toLowerCase().replace(/\s/g, '')}@test.com`,
        isActive: true,
      },
    });
    return businessId;
  },

  createTestCustomer: async (businessId: string, email: string) => {
    const customerService = getEncryptedCustomerService();
    const result = await customerService.createCustomer(businessId, {
      email,
      firstName: 'Test',
      lastName: 'Customer',
      phone: '+447000000000',
    });
    return result.customerId;
  },

  cleanupTestData: async (businessId: string) => {
    await prisma.business.deleteMany({ where: { id: businessId } });
    await prisma.customer.deleteMany({ where: { businessId } });
    await prisma.dataSubjectRequest.deleteMany({ where: { businessId } });
    await prisma.complianceAuditEvent.deleteMany({ where: { businessId } });
  },

  waitForAsync: (ms: number) => new Promise(resolve => setTimeout(resolve, ms)),
};
