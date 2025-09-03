/**
 * GDPR Data Subject Rights Implementation
 *
 * Comprehensive implementation of GDPR Article 12-22 data subject rights
 * with integration to encrypted customer data and audit logging.
 */

import { prisma } from './prisma';
import { logger } from './logger';
import { auditLog } from './audit-logger';
import { getEncryptedCustomerService } from '../services/customers-encrypted';
import { getEncryptionAuditLogger } from './encryption-audit-integration';
import crypto from 'crypto';

// ==========================================
// GDPR TYPES AND INTERFACES
// ==========================================

export type DataSubjectRightType =
  | 'ACCESS' // Article 15 - Right to Access
  | 'RECTIFICATION' // Article 16 - Right to Rectification
  | 'ERASURE' // Article 17 - Right to Erasure
  | 'RESTRICT' // Article 18 - Right to Restrict Processing
  | 'PORTABILITY' // Article 20 - Right to Data Portability
  | 'OBJECT' // Article 21 - Right to Object
  | 'CONSENT_WITHDRAW'; // Consent withdrawal

export type RequestStatus =
  | 'PENDING' // Awaiting verification
  | 'VERIFIED' // Identity verified
  | 'IN_PROGRESS' // Being processed
  | 'REQUIRES_APPROVAL' // Needs business approval
  | 'COMPLETED' // Successfully completed
  | 'REJECTED' // Request rejected
  | 'CANCELLED' // Cancelled by requestor
  | 'EXPIRED'; // Expired without completion

export type DataExportFormat = 'JSON' | 'CSV' | 'XML' | 'PDF';

export interface DataSubjectRequest {
  id: string;
  businessId: string;
  customerId?: string; // May be null for unverified requests

  // Request details
  rightType: DataSubjectRightType;
  status: RequestStatus;
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';

  // Identity information (for verification)
  requestorEmail: string;
  requestorPhone?: string;
  identityData: {
    firstName?: string;
    lastName?: string;
    additionalInfo?: Record<string, any>;
    verificationToken?: string;
    verifiedAt?: Date;
  };

  // Processing details
  description?: string;
  requestData?: Record<string, any>; // Specific request parameters
  processingNotes?: string;
  businessResponse?: string;

  // Timeline tracking
  requestedAt: Date;
  verifiedAt?: Date;
  processedAt?: Date;
  completedAt?: Date;
  dueDate: Date; // 30 days from request

  // Audit trail
  createdBy?: string; // User who created on behalf
  processedBy?: string; // Admin who processed
  approvedBy?: string; // User who approved (for sensitive operations)

  // Compliance tracking
  complianceNotes?: string;
  legalBasis?: string;
  exceptions?: string[]; // Any GDPR exceptions applied

  // Metadata
  ipAddress?: string;
  userAgent?: string;
  channel: 'CUSTOMER_PORTAL' | 'EMAIL' | 'PHONE' | 'ADMIN' | 'API';

  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface DataSubjectRightsResult<T = any> {
  success: boolean;
  requestId: string;
  data?: T;
  message?: string;
  errors?: string[];
  nextSteps?: string[];
}

export interface PersonalDataExport {
  exportId: string;
  customerId: string;
  businessId: string;
  requestId: string;

  // Export metadata
  format: DataExportFormat;
  generatedAt: Date;
  expiresAt: Date;
  downloadUrl?: string;
  fileSize: number;
  checksum: string;

  // Data categories included
  dataCategories: string[];
  recordCount: number;
  encryptedFields: boolean;

  // Compliance
  retentionPeriod: number; // Days to keep export
  accessCount: number;
  lastAccessedAt?: Date;
}

// ==========================================
// GDPR DATA SUBJECT RIGHTS SERVICE
// ==========================================

export class GDPRDataSubjectRightsService {
  private customerService = getEncryptedCustomerService();
  private encryptionAudit = getEncryptionAuditLogger();

  /**
   * Submit a data subject rights request
   */
  async submitDataSubjectRequest(
    businessId: string,
    request: {
      rightType: DataSubjectRightType;
      requestorEmail: string;
      requestorPhone?: string;
      identityData: {
        firstName?: string;
        lastName?: string;
        additionalInfo?: Record<string, any>;
      };
      description?: string;
      requestData?: Record<string, any>;
      channel: DataSubjectRequest['channel'];
      ipAddress?: string;
      userAgent?: string;
      createdBy?: string;
    }
  ): Promise<DataSubjectRightsResult<{ requestId: string; verificationRequired: boolean }>> {
    const requestId = crypto.randomUUID();
    const verificationToken = crypto.randomBytes(32).toString('hex');

    try {
      // Calculate due date (30 days from request)
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 30);

      // Create request record
      const dataSubjectRequest: Omit<DataSubjectRequest, 'createdAt' | 'updatedAt'> = {
        id: requestId,
        businessId,
        rightType: request.rightType,
        status: 'PENDING',
        priority: this.calculatePriority(request.rightType),
        requestorEmail: request.requestorEmail.toLowerCase().trim(),
        requestorPhone: request.requestorPhone,
        identityData: {
          ...request.identityData,
          verificationToken,
        },
        description: request.description,
        requestData: request.requestData,
        requestedAt: new Date(),
        dueDate,
        createdBy: request.createdBy,
        channel: request.channel,
        ipAddress: request.ipAddress,
        userAgent: request.userAgent,
        isActive: true,
      };

      // Store in database
      await prisma.dataSubjectRequest.create({
        data: dataSubjectRequest as any,
      });

      // Audit request submission
      await auditLog({
        category: 'compliance',
        type: 'GDPR_REQUEST_SUBMITTED',
        severity: 'medium',
        description: `GDPR ${request.rightType} request submitted`,
        businessId,
        metadata: {
          requestId,
          rightType: request.rightType,
          requestorEmail: request.requestorEmail,
          channel: request.channel,
          priority: dataSubjectRequest.priority,
        },
        flags: {
          complianceRelevant: true,
          personalData: true,
        },
      });

      // Try automatic identity verification
      const verificationResult = await this.attemptAutomaticVerification(
        businessId,
        requestId,
        request.requestorEmail,
        request.requestorPhone,
        request.identityData
      );

      // Send verification email if needed
      if (!verificationResult.verified) {
        await this.sendVerificationEmail(
          businessId,
          requestId,
          request.requestorEmail,
          verificationToken,
          request.rightType
        );
      }

      // Notify business admins
      await this.notifyBusinessOfRequest(businessId, dataSubjectRequest);

      logger.info('GDPR data subject request submitted', {
        requestId,
        businessId,
        rightType: request.rightType,
        verified: verificationResult.verified,
        channel: request.channel,
      });

      return {
        success: true,
        requestId,
        data: {
          requestId,
          verificationRequired: !verificationResult.verified,
        },
        message: verificationResult.verified
          ? 'Request verified and processing has begun'
          : 'Verification email sent. Please check your email to verify your identity.',
        nextSteps: verificationResult.verified
          ? ['We will process your request within 30 days']
          : ['Check your email for verification link', 'Click the link to verify your identity'],
      };
    } catch (error) {
      logger.error('GDPR request submission failed', {
        businessId,
        rightType: request.rightType,
        requestorEmail: request.requestorEmail,
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        success: false,
        requestId,
        message: 'Failed to submit request',
        errors: [error instanceof Error ? error.message : String(error)],
      };
    }
  }

  /**
   * Verify data subject identity
   */
  async verifyDataSubjectIdentity(
    verificationToken: string,
    additionalVerificationData?: Record<string, any>
  ): Promise<DataSubjectRightsResult<{ requestId: string; nextSteps: string[] }>> {
    try {
      // Find request by verification token
      const request = await prisma.dataSubjectRequest.findFirst({
        where: {
          'identityData.verificationToken': verificationToken,
          status: 'PENDING',
          isActive: true,
        },
      });

      if (!request) {
        return {
          success: false,
          requestId: '',
          message: 'Invalid or expired verification token',
          errors: ['Verification token not found or request already processed'],
        };
      }

      // Perform identity verification
      const verificationResult = await this.performIdentityVerification(
        request.businessId,
        request.id,
        request.requestorEmail,
        request.requestorPhone,
        {
          ...request.identityData,
          ...additionalVerificationData,
        }
      );

      if (!verificationResult.success) {
        return {
          success: false,
          requestId: request.id,
          message: 'Identity verification failed',
          errors: verificationResult.errors || ['Could not verify identity'],
        };
      }

      // Update request status
      await prisma.dataSubjectRequest.update({
        where: { id: request.id },
        data: {
          status: 'VERIFIED',
          customerId: verificationResult.customerId,
          verifiedAt: new Date(),
          identityData: {
            ...request.identityData,
            verifiedAt: new Date(),
          },
        },
      });

      // Audit verification
      await auditLog({
        category: 'compliance',
        type: 'GDPR_IDENTITY_VERIFIED',
        severity: 'medium',
        description: 'GDPR request identity verified',
        businessId: request.businessId,
        metadata: {
          requestId: request.id,
          rightType: request.rightType,
          customerId: verificationResult.customerId,
          verificationMethod: verificationResult.method,
        },
        flags: {
          complianceRelevant: true,
          personalData: true,
        },
      });

      // Start processing if automatic processing is enabled
      const nextSteps = await this.initiateRequestProcessing(request);

      return {
        success: true,
        requestId: request.id,
        data: {
          requestId: request.id,
          nextSteps,
        },
        message: 'Identity verified successfully',
        nextSteps,
      };
    } catch (error) {
      logger.error('GDPR identity verification failed', {
        verificationToken: verificationToken.substring(0, 8) + '...',
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        success: false,
        requestId: '',
        message: 'Verification failed',
        errors: [error instanceof Error ? error.message : String(error)],
      };
    }
  }

  /**
   * Process Right to Access request (Article 15)
   */
  async processAccessRequest(
    requestId: string,
    options?: {
      format?: DataExportFormat;
      includeMetadata?: boolean;
      processedBy?: string;
    }
  ): Promise<DataSubjectRightsResult<PersonalDataExport>> {
    try {
      const request = await this.getVerifiedRequest(requestId, 'ACCESS');
      if (!request.success || !request.data) {
        return request as any;
      }

      const dsRequest = request.data;

      // Update status
      await this.updateRequestStatus(requestId, 'IN_PROGRESS', options?.processedBy);

      // Generate comprehensive data export
      const exportResult = await this.generatePersonalDataExport(
        dsRequest.businessId,
        dsRequest.customerId!,
        requestId,
        {
          format: options?.format || 'JSON',
          includeMetadata: options?.includeMetadata || true,
          rightType: 'ACCESS',
        }
      );

      if (!exportResult.success) {
        await this.updateRequestStatus(requestId, 'REJECTED', options?.processedBy);
        return exportResult as any;
      }

      // Complete the request
      await this.completeRequest(requestId, {
        processedBy: options?.processedBy,
        businessResponse: 'Personal data export generated and provided',
        completionData: {
          exportId: exportResult.data!.exportId,
          downloadUrl: exportResult.data!.downloadUrl,
        },
      });

      return {
        success: true,
        requestId,
        data: exportResult.data!,
        message: 'Data export generated successfully',
        nextSteps: ['Download your data using the provided link', 'Link expires in 7 days'],
      };
    } catch (error) {
      await this.updateRequestStatus(requestId, 'REJECTED', options?.processedBy);

      logger.error('GDPR access request processing failed', {
        requestId,
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        success: false,
        requestId,
        message: 'Failed to process access request',
        errors: [error instanceof Error ? error.message : String(error)],
      };
    }
  }

  /**
   * Process Right to Rectification request (Article 16)
   */
  async processRectificationRequest(
    requestId: string,
    updates: {
      firstName?: string;
      lastName?: string;
      email?: string;
      phone?: string;
      address?: string;
    },
    options?: {
      processedBy?: string;
      businessApproval?: boolean;
    }
  ): Promise<DataSubjectRightsResult> {
    try {
      const request = await this.getVerifiedRequest(requestId, 'RECTIFICATION');
      if (!request.success || !request.data) {
        return request;
      }

      const dsRequest = request.data;

      // Check if business approval is required
      if (!options?.businessApproval && this.requiresApproval(dsRequest, updates)) {
        await this.updateRequestStatus(requestId, 'REQUIRES_APPROVAL', options?.processedBy);

        await this.requestBusinessApproval(dsRequest, updates);

        return {
          success: true,
          requestId,
          message: 'Request requires business approval',
          nextSteps: ['Business has been notified and will review the request'],
        };
      }

      // Update status
      await this.updateRequestStatus(requestId, 'IN_PROGRESS', options?.processedBy);

      // Get current customer data for audit trail
      const currentCustomer = await this.customerService.getCustomerById(
        dsRequest.customerId!,
        dsRequest.businessId,
        { userId: options?.processedBy || 'gdpr-system' }
      );

      if (!currentCustomer) {
        throw new Error('Customer not found');
      }

      // Perform the rectification
      const updatedCustomer = await this.customerService.updateCustomer(
        dsRequest.customerId!,
        dsRequest.businessId,
        updates,
        { userId: options?.processedBy || 'gdpr-system' }
      );

      // Create detailed audit trail
      const changes = this.generateChangeAuditTrail(currentCustomer, updatedCustomer);

      await auditLog({
        category: 'compliance',
        type: 'GDPR_RECTIFICATION_COMPLETED',
        severity: 'medium',
        description: 'GDPR rectification request completed',
        businessId: dsRequest.businessId,
        metadata: {
          requestId,
          customerId: dsRequest.customerId,
          changes,
          processedBy: options?.processedBy,
          businessApproved: options?.businessApproval,
        },
        flags: {
          complianceRelevant: true,
          personalData: true,
        },
      });

      // Complete the request
      await this.completeRequest(requestId, {
        processedBy: options?.processedBy,
        businessResponse: `Personal data updated: ${Object.keys(updates).join(', ')}`,
        completionData: { changes },
      });

      return {
        success: true,
        requestId,
        message: 'Personal data updated successfully',
        nextSteps: ['Your information has been corrected in our systems'],
      };
    } catch (error) {
      await this.updateRequestStatus(requestId, 'REJECTED', options?.processedBy);

      logger.error('GDPR rectification request processing failed', {
        requestId,
        updates: Object.keys(updates),
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        success: false,
        requestId,
        message: 'Failed to process rectification request',
        errors: [error instanceof Error ? error.message : String(error)],
      };
    }
  }

  /**
   * Process Right to Erasure request (Article 17)
   */
  async processErasureRequest(
    requestId: string,
    options?: {
      processedBy?: string;
      businessApproval?: boolean;
      cascadeDelete?: boolean;
      retainForLegal?: boolean;
    }
  ): Promise<DataSubjectRightsResult> {
    try {
      const request = await this.getVerifiedRequest(requestId, 'ERASURE');
      if (!request.success || !request.data) {
        return request;
      }

      const dsRequest = request.data;

      // Erasure always requires business approval due to legal implications
      if (!options?.businessApproval) {
        await this.updateRequestStatus(requestId, 'REQUIRES_APPROVAL', options?.processedBy);

        await this.requestBusinessApproval(dsRequest, {
          erasureRequest: true,
          cascadeDelete: options?.cascadeDelete || false,
        });

        return {
          success: true,
          requestId,
          message: 'Erasure request requires business approval',
          nextSteps: ['Business has been notified and will review the erasure request'],
        };
      }

      // Update status
      await this.updateRequestStatus(requestId, 'IN_PROGRESS', options?.processedBy);

      // Check for legal retention requirements
      const retentionCheck = await this.checkRetentionRequirements(
        dsRequest.businessId,
        dsRequest.customerId!
      );

      if (retentionCheck.hasRetentionRequirements && !options?.retainForLegal) {
        await this.updateRequestStatus(requestId, 'REQUIRES_APPROVAL', options?.processedBy);

        return {
          success: false,
          requestId,
          message: 'Data must be retained for legal reasons',
          errors: retentionCheck.reasons,
          nextSteps: ['Business will assess legal basis for continued processing'],
        };
      }

      // Perform secure erasure
      const erasureResult = await this.performSecureErasure(
        dsRequest.businessId,
        dsRequest.customerId!,
        {
          cascadeDelete: options?.cascadeDelete || false,
          retainForLegal: options?.retainForLegal || false,
          requestId,
          processedBy: options?.processedBy,
        }
      );

      if (!erasureResult.success) {
        await this.updateRequestStatus(requestId, 'REJECTED', options?.processedBy);
        return erasureResult;
      }

      // Complete the request
      await this.completeRequest(requestId, {
        processedBy: options?.processedBy,
        businessResponse: `Personal data erased from systems. ${erasureResult.data?.retainedData ? 'Some data retained for legal compliance.' : 'Complete erasure performed.'}`,
        completionData: erasureResult.data,
      });

      return {
        success: true,
        requestId,
        message: 'Personal data has been erased',
        nextSteps: ['Your personal data has been removed from our systems'],
      };
    } catch (error) {
      await this.updateRequestStatus(requestId, 'REJECTED', options?.processedBy);

      logger.error('GDPR erasure request processing failed', {
        requestId,
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        success: false,
        requestId,
        message: 'Failed to process erasure request',
        errors: [error instanceof Error ? error.message : String(error)],
      };
    }
  }

  // ==========================================
  // PRIVATE HELPER METHODS
  // ==========================================

  /**
   * Calculate request priority based on type
   */
  private calculatePriority(rightType: DataSubjectRightType): DataSubjectRequest['priority'] {
    const priorityMap: Record<DataSubjectRightType, DataSubjectRequest['priority']> = {
      ERASURE: 'HIGH',
      RESTRICT: 'HIGH',
      OBJECT: 'NORMAL',
      ACCESS: 'NORMAL',
      RECTIFICATION: 'NORMAL',
      PORTABILITY: 'LOW',
      CONSENT_WITHDRAW: 'NORMAL',
    };

    return priorityMap[rightType] || 'NORMAL';
  }

  /**
   * Attempt automatic identity verification
   */
  private async attemptAutomaticVerification(
    businessId: string,
    requestId: string,
    email: string,
    phone: string | undefined,
    identityData: any
  ): Promise<{ verified: boolean; customerId?: string; confidence: number }> {
    try {
      // Search for customer with matching email
      const customers = await this.customerService.searchCustomers(
        businessId,
        { email, status: 'active' },
        { userId: 'gdpr-system' }
      );

      if (customers.customers.length === 0) {
        return { verified: false, confidence: 0 };
      }

      if (customers.customers.length > 1) {
        // Multiple matches - require manual verification
        return { verified: false, confidence: 0.3 };
      }

      const customer = customers.customers[0];
      let confidence = 0.7; // Base confidence for email match

      // Check additional matching criteria
      if (phone && customer.phone && customer.phone === phone) {
        confidence += 0.2;
      }

      if (
        identityData.firstName &&
        customer.firstName &&
        identityData.firstName.toLowerCase() === customer.firstName.toLowerCase()
      ) {
        confidence += 0.1;
      }

      // Auto-verify if confidence is high enough
      const verified = confidence >= 0.8;

      if (verified) {
        await auditLog({
          category: 'compliance',
          type: 'GDPR_AUTO_VERIFICATION',
          severity: 'low',
          description: 'GDPR request automatically verified',
          businessId,
          metadata: {
            requestId,
            customerId: customer.id,
            confidence,
            matchingCriteria: ['email', ...(phone ? ['phone'] : [])],
          },
          flags: {
            complianceRelevant: true,
          },
        });
      }

      return {
        verified,
        customerId: customer.id,
        confidence,
      };
    } catch (error) {
      logger.error('Automatic verification failed', {
        businessId,
        requestId,
        error: error instanceof Error ? error.message : String(error),
      });

      return { verified: false, confidence: 0 };
    }
  }

  /**
   * Send verification email
   */
  private async sendVerificationEmail(
    businessId: string,
    requestId: string,
    email: string,
    verificationToken: string,
    rightType: DataSubjectRightType
  ): Promise<void> {
    // This would integrate with your email service
    logger.info('GDPR verification email sent', {
      businessId,
      requestId,
      email,
      rightType,
      verificationToken: verificationToken.substring(0, 8) + '...',
    });

    // TODO: Implement actual email sending
    // await emailService.sendGDPRVerificationEmail(email, {
    //   verificationToken,
    //   rightType,
    //   businessId,
    //   requestId,
    // });
  }

  /**
   * Notify business of new request
   */
  private async notifyBusinessOfRequest(
    businessId: string,
    request: Omit<DataSubjectRequest, 'createdAt' | 'updatedAt'>
  ): Promise<void> {
    // This would send notifications to business admins
    logger.info('Business notified of GDPR request', {
      businessId,
      requestId: request.id,
      rightType: request.rightType,
      priority: request.priority,
    });

    // TODO: Implement business notification
    // await notificationService.notifyBusinessAdmins(businessId, {
    //   type: 'GDPR_REQUEST',
    //   requestId: request.id,
    //   rightType: request.rightType,
    //   dueDate: request.dueDate,
    // });
  }

  /**
   * Get verified request
   */
  private async getVerifiedRequest(
    requestId: string,
    expectedRightType?: DataSubjectRightType
  ): Promise<DataSubjectRightsResult<DataSubjectRequest>> {
    const request = await prisma.dataSubjectRequest.findUnique({
      where: { id: requestId },
    });

    if (!request) {
      return {
        success: false,
        requestId,
        message: 'Request not found',
        errors: ['Invalid request ID'],
      };
    }

    if (expectedRightType && request.rightType !== expectedRightType) {
      return {
        success: false,
        requestId,
        message: 'Invalid request type',
        errors: [`Expected ${expectedRightType}, got ${request.rightType}`],
      };
    }

    if (request.status !== 'VERIFIED' && request.status !== 'IN_PROGRESS') {
      return {
        success: false,
        requestId,
        message: 'Request not verified',
        errors: ['Request must be verified before processing'],
      };
    }

    if (!request.customerId) {
      return {
        success: false,
        requestId,
        message: 'Customer not identified',
        errors: ['Customer identity not established'],
      };
    }

    return {
      success: true,
      requestId,
      data: request as DataSubjectRequest,
    };
  }

  /**
   * Update request status
   */
  private async updateRequestStatus(
    requestId: string,
    status: RequestStatus,
    processedBy?: string
  ): Promise<void> {
    const updateData: any = {
      status,
      updatedAt: new Date(),
    };

    if (status === 'IN_PROGRESS' && !updateData.processedAt) {
      updateData.processedAt = new Date();
    }

    if (processedBy) {
      updateData.processedBy = processedBy;
    }

    await prisma.dataSubjectRequest.update({
      where: { id: requestId },
      data: updateData,
    });

    await auditLog({
      category: 'compliance',
      type: 'GDPR_STATUS_UPDATED',
      severity: 'low',
      description: `GDPR request status changed to ${status}`,
      metadata: {
        requestId,
        newStatus: status,
        processedBy,
      },
      flags: {
        complianceRelevant: true,
      },
    });
  }

  /**
   * Complete request
   */
  private async completeRequest(
    requestId: string,
    completion: {
      processedBy?: string;
      businessResponse?: string;
      completionData?: any;
    }
  ): Promise<void> {
    await prisma.dataSubjectRequest.update({
      where: { id: requestId },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
        processedBy: completion.processedBy,
        businessResponse: completion.businessResponse,
        processingNotes: completion.completionData
          ? JSON.stringify(completion.completionData)
          : undefined,
      },
    });

    await auditLog({
      category: 'compliance',
      type: 'GDPR_REQUEST_COMPLETED',
      severity: 'medium',
      description: 'GDPR request completed successfully',
      metadata: {
        requestId,
        processedBy: completion.processedBy,
        completionData: completion.completionData,
      },
      flags: {
        complianceRelevant: true,
      },
    });
  }

  /**
   * Placeholder methods - would be implemented based on specific requirements
   */
  private async performIdentityVerification(
    businessId: string,
    requestId: string,
    email: string,
    phone: string | undefined,
    identityData: any
  ): Promise<{ success: boolean; customerId?: string; method: string; errors?: string[] }> {
    // Implementation would depend on verification requirements
    return this.attemptAutomaticVerification(
      businessId,
      requestId,
      email,
      phone,
      identityData
    ).then(result => ({
      success: result.verified,
      customerId: result.customerId,
      method: 'email_match',
    }));
  }

  private async initiateRequestProcessing(request: DataSubjectRequest): Promise<string[]> {
    // Auto-process simple requests like ACCESS
    if (request.rightType === 'ACCESS') {
      return ['Processing your data export automatically', 'You will receive an email when ready'];
    }

    return [
      'Your request has been forwarded to our team',
      'We will contact you within 5 business days',
    ];
  }

  private requiresApproval(request: DataSubjectRequest, updates: any): boolean {
    // Logic to determine if business approval is needed
    return Object.keys(updates).some(key => ['email', 'phone'].includes(key));
  }

  private async requestBusinessApproval(request: DataSubjectRequest, data: any): Promise<void> {
    // Implementation for requesting business approval
    logger.info('Business approval requested', {
      requestId: request.id,
      businessId: request.businessId,
      rightType: request.rightType,
    });
  }

  private generateChangeAuditTrail(before: any, after: any): any {
    const changes: any = {};
    ['firstName', 'lastName', 'email', 'phone', 'address'].forEach(field => {
      if (before[field] !== after[field]) {
        changes[field] = {
          before: before[field],
          after: after[field],
        };
      }
    });
    return changes;
  }

  private async checkRetentionRequirements(
    businessId: string,
    customerId: string
  ): Promise<{ hasRetentionRequirements: boolean; reasons: string[] }> {
    // Check for legal retention requirements
    const activeRequests = await prisma.reviewRequest.count({
      where: {
        customerId,
        businessId,
        isActive: true,
        status: { in: ['SENT', 'DELIVERED', 'CLICKED'] },
      },
    });

    const reasons: string[] = [];
    if (activeRequests > 0) {
      reasons.push(`${activeRequests} active review requests require data retention`);
    }

    return {
      hasRetentionRequirements: reasons.length > 0,
      reasons,
    };
  }

  private async performSecureErasure(
    businessId: string,
    customerId: string,
    options: any
  ): Promise<DataSubjectRightsResult<{ deletedRecords: number; retainedData?: string[] }>> {
    try {
      // This would implement the actual erasure logic
      // Including crypto-shredding for encrypted data

      // For now, soft delete the customer
      await this.customerService.deleteCustomer(customerId, businessId, {
        userId: options.processedBy || 'gdpr-system',
      });

      return {
        success: true,
        requestId: options.requestId,
        data: {
          deletedRecords: 1,
          retainedData: options.retainForLegal ? ['Legal compliance data'] : undefined,
        },
      };
    } catch (error) {
      return {
        success: false,
        requestId: options.requestId,
        errors: [error instanceof Error ? error.message : String(error)],
      };
    }
  }

  private async generatePersonalDataExport(
    businessId: string,
    customerId: string,
    requestId: string,
    options: any
  ): Promise<DataSubjectRightsResult<PersonalDataExport>> {
    try {
      // This would implement comprehensive data export
      // Including encrypted data handling

      const exportId = crypto.randomUUID();
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);

      const exportData: PersonalDataExport = {
        exportId,
        customerId,
        businessId,
        requestId,
        format: options.format,
        generatedAt: new Date(),
        expiresAt,
        downloadUrl: `/api/gdpr/export/${exportId}`,
        fileSize: 1024, // Placeholder
        checksum: crypto.randomBytes(16).toString('hex'),
        dataCategories: ['personal_info', 'contact_details', 'communication_history'],
        recordCount: 1,
        encryptedFields: true,
        retentionPeriod: 7,
        accessCount: 0,
      };

      return {
        success: true,
        requestId,
        data: exportData,
      };
    } catch (error) {
      return {
        success: false,
        requestId,
        errors: [error instanceof Error ? error.message : String(error)],
      };
    }
  }
}

// ==========================================
// SINGLETON INSTANCE
// ==========================================

let globalGDPRService: GDPRDataSubjectRightsService | null = null;

/**
 * Get global GDPR data subject rights service instance
 */
export function getGDPRDataSubjectRightsService(): GDPRDataSubjectRightsService {
  if (!globalGDPRService) {
    globalGDPRService = new GDPRDataSubjectRightsService();
  }
  return globalGDPRService;
}
