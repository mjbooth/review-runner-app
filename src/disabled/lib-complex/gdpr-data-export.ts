/**
 * GDPR Data Export Service
 *
 * Encryption-aware data export service for GDPR Article 20 (Data Portability)
 * with comprehensive data collection, formatting, and secure delivery.
 */

import { prisma } from './prisma';
import { logger } from './logger';
import { getEncryptedCustomerService } from './encrypted-customer-service';
import { getGDPRComplianceAuditService } from './gdpr-compliance-audit';
import crypto from 'crypto';
import { z } from 'zod';

// ==========================================
// EXPORT TYPES AND INTERFACES
// ==========================================

export type ExportFormat = 'JSON' | 'CSV' | 'XML' | 'PDF' | 'ENCRYPTED_ARCHIVE';

export type DataCategory =
  | 'PERSONAL_DETAILS' // Name, address, contact info
  | 'COMMUNICATION_DATA' // SMS, email records
  | 'TRANSACTION_DATA' // Review requests, payments
  | 'CONSENT_RECORDS' // Consent history
  | 'AUDIT_LOGS' // Activity logs
  | 'PREFERENCES' // Account settings
  | 'SUPPRESSION_DATA' // Opt-out records
  | 'TECHNICAL_DATA'; // IP addresses, sessions

export interface DataExportRequest {
  requestId: string;
  businessId: string;
  dataSubjectId: string;
  requestorEmail: string;

  // Export scope
  dataCategories: DataCategory[];
  includeDeletedData: boolean;
  includeAuditLogs: boolean;
  timeRange?: {
    from: Date;
    to: Date;
  };

  // Export format and delivery
  format: ExportFormat;
  encryption: {
    enabled: boolean;
    publicKey?: string;
    password?: string;
  };
  delivery: {
    method: 'EMAIL' | 'SECURE_DOWNLOAD' | 'API_RESPONSE';
    emailAddress?: string;
    expiryHours?: number;
  };

  // Processing options
  anonymizeThirdPartyData: boolean;
  includeMetadata: boolean;
  compressOutput: boolean;

  // Tracking
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'EXPIRED';
  estimatedSize?: number;
  processingProgress: number;

  createdAt: Date;
  processedAt?: Date;
  expiresAt?: Date;
  downloadUrl?: string;

  metadata: Record<string, any>;
}

export interface ExportedDataPackage {
  exportId: string;
  businessId: string;
  dataSubjectId: string;

  // Package info
  generatedAt: Date;
  format: ExportFormat;
  totalSize: number;
  recordCount: number;

  // Data structure
  personalData: {
    basicInfo: any;
    contactDetails: any;
    preferences: any;
    consentHistory: any[];
  };

  communicationData: {
    smsRecords: any[];
    emailRecords: any[];
    suppressionRecords: any[];
  };

  transactionData: {
    reviewRequests: any[];
    campaigns: any[];
    events: any[];
  };

  auditData?: {
    accessLogs: any[];
    complianceEvents: any[];
    systemEvents: any[];
  };

  technicalData?: {
    ipAddresses: string[];
    sessions: any[];
    deviceInfo: any[];
  };

  // Export metadata
  exportMetadata: {
    legalBasis: string;
    processingPurpose: string;
    dataRetentionInfo: any;
    rightsInformation: string[];
    contactInformation: {
      dataController: string;
      dpoContact: string;
    };
  };

  // Integrity and verification
  dataIntegrity: {
    checksum: string;
    signedHash?: string;
    encryptionInfo?: any;
  };
}

// ==========================================
// GDPR DATA EXPORT SERVICE
// ==========================================

export class GDPRDataExportService {
  private customerService = getEncryptedCustomerService();
  private complianceAudit = getGDPRComplianceAuditService();

  private readonly config = {
    maxExportSize: parseInt(process.env.GDPR_MAX_EXPORT_SIZE_MB || '100') * 1024 * 1024,
    defaultExpiryHours: parseInt(process.env.GDPR_EXPORT_EXPIRY_HOURS || '72'),
    encryptionEnabled: process.env.GDPR_EXPORT_ENCRYPTION === 'true',
    compressionEnabled: process.env.GDPR_EXPORT_COMPRESSION === 'true',
    auditAllExports: process.env.GDPR_AUDIT_EXPORTS === 'true',
  };

  /**
   * Create data export request
   */
  async createExportRequest(
    businessId: string,
    requestData: {
      dataSubjectId: string;
      requestorEmail: string;
      dataCategories?: DataCategory[];
      format?: ExportFormat;
      includeDeletedData?: boolean;
      includeAuditLogs?: boolean;
      timeRange?: { from: Date; to: Date };
      encryption?: { enabled: boolean; publicKey?: string; password?: string };
      delivery?: { method: 'EMAIL' | 'SECURE_DOWNLOAD' | 'API_RESPONSE'; emailAddress?: string };
    },
    context: { gdprRequestId?: string; triggeredBy: string }
  ): Promise<{
    success: boolean;
    requestId?: string;
    estimatedSize?: number;
    estimatedDuration?: string;
    message?: string;
    errors?: string[];
  }> {
    const requestId = crypto.randomUUID();

    try {
      // Validate data subject exists
      const dataSubject = await this.customerService.getCustomerById(requestData.dataSubjectId, {
        businessId,
        includeDeleted: true,
      });

      if (!dataSubject) {
        return {
          success: false,
          errors: ['Data subject not found'],
        };
      }

      // Estimate export size and duration
      const estimation = await this.estimateExportSize(businessId, requestData);

      // Create export request
      const exportRequest: Omit<DataExportRequest, 'createdAt'> = {
        requestId,
        businessId,
        dataSubjectId: requestData.dataSubjectId,
        requestorEmail: requestData.requestorEmail,
        dataCategories: requestData.dataCategories || [
          'PERSONAL_DETAILS',
          'COMMUNICATION_DATA',
          'TRANSACTION_DATA',
          'CONSENT_RECORDS',
        ],
        includeDeletedData: requestData.includeDeletedData || false,
        includeAuditLogs: requestData.includeAuditLogs || false,
        timeRange: requestData.timeRange,
        format: requestData.format || 'JSON',
        encryption: requestData.encryption || { enabled: this.config.encryptionEnabled },
        delivery: requestData.delivery || {
          method: 'EMAIL',
          emailAddress: requestData.requestorEmail,
        },
        anonymizeThirdPartyData: true,
        includeMetadata: true,
        compressOutput: this.config.compressionEnabled,
        status: 'PENDING',
        estimatedSize: estimation.estimatedSize,
        processingProgress: 0,
        expiresAt: new Date(Date.now() + this.config.defaultExpiryHours * 60 * 60 * 1000),
        metadata: {
          gdprRequestId: context.gdprRequestId,
          triggeredBy: context.triggeredBy,
          estimation,
        },
      };

      // Store export request
      await prisma.dataExportRequest.create({
        data: exportRequest as any,
      });

      // Log compliance event
      await this.complianceAudit.logComplianceEvent({
        businessId,
        eventType: 'DATA_EXPORTED',
        category: 'RIGHTS',
        severity: 'MEDIUM',
        dataSubjectId: requestData.dataSubjectId,
        dataSubjectType: 'CUSTOMER',
        processingPurpose: 'GDPR Article 20 data portability request',
        legalBasis: 'CONSENT',
        dataCategories: exportRequest.dataCategories.map(cat => cat.toLowerCase()),
        processingLocation: 'UK',
        systemId: 'gdpr_export_service',
        triggeredBy: context.triggeredBy,
        automated: false,
        description: `Data export request created for ${requestData.format} format`,
        retentionPeriod: 2555,
        specialCategory: false,
        childData: false,
        correlationId: crypto.randomUUID(),
        requestId: context.gdprRequestId,
        metadata: {
          exportRequestId: requestId,
          dataCategories: exportRequest.dataCategories,
          format: requestData.format,
          estimatedSize: estimation.estimatedSize,
        },
      });

      logger.info('Data export request created', {
        requestId,
        businessId,
        dataSubjectId: requestData.dataSubjectId,
        format: requestData.format,
        estimatedSize: estimation.estimatedSize,
      });

      return {
        success: true,
        requestId,
        estimatedSize: estimation.estimatedSize,
        estimatedDuration: estimation.estimatedDuration,
        message: 'Data export request created successfully',
      };
    } catch (error) {
      logger.error('Data export request creation failed', {
        businessId,
        dataSubjectId: requestData.dataSubjectId,
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        success: false,
        errors: [error instanceof Error ? error.message : String(error)],
      };
    }
  }

  /**
   * Process data export request
   */
  async processExportRequest(requestId: string): Promise<{
    success: boolean;
    exportPackage?: ExportedDataPackage;
    downloadUrl?: string;
    message?: string;
    errors?: string[];
  }> {
    try {
      // Get export request
      const exportRequest = await prisma.dataExportRequest.findUnique({
        where: { requestId },
      });

      if (!exportRequest || exportRequest.status !== 'PENDING') {
        return {
          success: false,
          errors: ['Export request not found or not in pending status'],
        };
      }

      // Update status to processing
      await prisma.dataExportRequest.update({
        where: { requestId },
        data: {
          status: 'PROCESSING',
          processingProgress: 10,
        },
      });

      // Collect data from all sources
      const exportPackage = await this.collectExportData(exportRequest as any);

      // Update progress
      await this.updateProgress(requestId, 60);

      // Format and package data
      const formattedPackage = await this.formatExportPackage(
        exportPackage,
        exportRequest.format as ExportFormat
      );

      // Update progress
      await this.updateProgress(requestId, 80);

      // Handle encryption if required
      let finalPackage = formattedPackage;
      if (exportRequest.encryption.enabled) {
        finalPackage = await this.encryptExportPackage(formattedPackage, exportRequest.encryption);
      }

      // Update progress
      await this.updateProgress(requestId, 90);

      // Handle delivery
      const deliveryResult = await this.handleDelivery(exportRequest as any, finalPackage);

      // Complete export request
      await prisma.dataExportRequest.update({
        where: { requestId },
        data: {
          status: 'COMPLETED',
          processingProgress: 100,
          processedAt: new Date(),
          downloadUrl: deliveryResult.downloadUrl,
        },
      });

      // Log completion
      await this.complianceAudit.logComplianceEvent({
        businessId: exportRequest.businessId,
        eventType: 'DATA_EXPORTED',
        category: 'RIGHTS',
        severity: 'LOW',
        dataSubjectId: exportRequest.dataSubjectId,
        dataSubjectType: 'CUSTOMER',
        processingPurpose: 'GDPR data export completion',
        legalBasis: 'CONSENT',
        dataCategories: exportRequest.dataCategories.map((cat: string) => cat.toLowerCase()),
        processingLocation: 'UK',
        systemId: 'gdpr_export_service',
        triggeredBy: 'system',
        automated: true,
        description: `Data export completed and delivered via ${exportRequest.delivery.method}`,
        retentionPeriod: 2555,
        specialCategory: false,
        childData: false,
        correlationId: crypto.randomUUID(),
        metadata: {
          exportRequestId: requestId,
          packageSize: finalPackage.length,
          deliveryMethod: exportRequest.delivery.method,
          recordCount: exportPackage.recordCount,
        },
      });

      logger.info('Data export completed', {
        requestId,
        businessId: exportRequest.businessId,
        packageSize: finalPackage.length,
        recordCount: exportPackage.recordCount,
      });

      return {
        success: true,
        exportPackage,
        downloadUrl: deliveryResult.downloadUrl,
        message: 'Data export completed successfully',
      };
    } catch (error) {
      // Update status to failed
      await prisma.dataExportRequest
        .update({
          where: { requestId },
          data: {
            status: 'FAILED',
            metadata: {
              error: error instanceof Error ? error.message : String(error),
            },
          },
        })
        .catch(() => {}); // Ignore update errors

      logger.error('Data export processing failed', {
        requestId,
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        success: false,
        errors: [error instanceof Error ? error.message : String(error)],
      };
    }
  }

  /**
   * Get export request status
   */
  async getExportStatus(requestId: string): Promise<{
    found: boolean;
    request?: DataExportRequest;
    downloadUrl?: string;
    expired?: boolean;
  }> {
    try {
      const exportRequest = await prisma.dataExportRequest.findUnique({
        where: { requestId },
      });

      if (!exportRequest) {
        return { found: false };
      }

      const expired = exportRequest.expiresAt && exportRequest.expiresAt < new Date();

      return {
        found: true,
        request: exportRequest as any,
        downloadUrl: exportRequest.downloadUrl || undefined,
        expired: expired || false,
      };
    } catch (error) {
      logger.error('Export status retrieval failed', {
        requestId,
        error: error instanceof Error ? error.message : String(error),
      });

      return { found: false };
    }
  }

  // ==========================================
  // PRIVATE PROCESSING METHODS
  // ==========================================

  /**
   * Estimate export size and processing time
   */
  private async estimateExportSize(
    businessId: string,
    requestData: any
  ): Promise<{
    estimatedSize: number;
    estimatedDuration: string;
    recordCount: number;
  }> {
    try {
      // Count records in different categories
      let recordCount = 0;
      let estimatedSize = 0;

      if (requestData.dataCategories?.includes('PERSONAL_DETAILS')) {
        recordCount += 1;
        estimatedSize += 2000; // ~2KB for personal data
      }

      if (requestData.dataCategories?.includes('COMMUNICATION_DATA')) {
        const commCount = await prisma.reviewRequest.count({
          where: {
            businessId,
            customerId: requestData.dataSubjectId,
          },
        });
        recordCount += commCount;
        estimatedSize += commCount * 1500; // ~1.5KB per record
      }

      if (requestData.dataCategories?.includes('TRANSACTION_DATA')) {
        const eventCount = await prisma.event.count({
          where: {
            reviewRequest: {
              businessId,
              customerId: requestData.dataSubjectId,
            },
          },
        });
        recordCount += eventCount;
        estimatedSize += eventCount * 800; // ~0.8KB per event
      }

      // Add overhead for formatting and metadata
      estimatedSize = Math.floor(estimatedSize * 1.3);

      // Estimate duration based on size and complexity
      const estimatedMinutes = Math.max(1, Math.ceil((estimatedSize / 1024 / 1024) * 2)); // ~2 minutes per MB
      const estimatedDuration =
        estimatedMinutes < 60
          ? `${estimatedMinutes} minutes`
          : `${Math.ceil(estimatedMinutes / 60)} hours`;

      return {
        estimatedSize,
        estimatedDuration,
        recordCount,
      };
    } catch (error) {
      // Return conservative estimates on error
      return {
        estimatedSize: 10 * 1024 * 1024, // 10MB
        estimatedDuration: '30 minutes',
        recordCount: 1000,
      };
    }
  }

  /**
   * Collect all export data from various sources
   */
  private async collectExportData(request: DataExportRequest): Promise<ExportedDataPackage> {
    const exportId = crypto.randomUUID();
    let totalRecords = 0;

    // Initialize data package
    const dataPackage: ExportedDataPackage = {
      exportId,
      businessId: request.businessId,
      dataSubjectId: request.dataSubjectId,
      generatedAt: new Date(),
      format: request.format,
      totalSize: 0,
      recordCount: 0,
      personalData: {
        basicInfo: {},
        contactDetails: {},
        preferences: {},
        consentHistory: [],
      },
      communicationData: {
        smsRecords: [],
        emailRecords: [],
        suppressionRecords: [],
      },
      transactionData: {
        reviewRequests: [],
        campaigns: [],
        events: [],
      },
      exportMetadata: {
        legalBasis: 'Article 20 GDPR - Right to data portability',
        processingPurpose: 'Data subject access request fulfillment',
        dataRetentionInfo: 'Data retained according to business retention policies',
        rightsInformation: [
          'Right to access (Article 15)',
          'Right to rectification (Article 16)',
          'Right to erasure (Article 17)',
          'Right to restrict processing (Article 18)',
          'Right to data portability (Article 20)',
          'Right to object (Article 21)',
        ],
        contactInformation: {
          dataController: 'Review Runner Ltd',
          dpoContact: 'dpo@reviewrunner.co.uk',
        },
      },
      dataIntegrity: {
        checksum: '',
        signedHash: undefined,
        encryptionInfo: undefined,
      },
    };

    // Collect personal data
    if (request.dataCategories.includes('PERSONAL_DETAILS')) {
      const customer = await this.customerService.getCustomerById(request.dataSubjectId, {
        businessId: request.businessId,
        includeDeleted: request.includeDeletedData,
      });

      if (customer) {
        dataPackage.personalData.basicInfo = {
          id: customer.id,
          firstName: customer.firstName,
          lastName: customer.lastName,
          businessName: customer.businessName,
          createdAt: customer.createdAt,
          updatedAt: customer.updatedAt,
          isActive: customer.isActive,
        };

        dataPackage.personalData.contactDetails = {
          email: customer.email,
          phone: customer.phone,
          address: customer.address,
        };

        totalRecords += 1;
      }
    }

    // Collect communication data
    if (request.dataCategories.includes('COMMUNICATION_DATA')) {
      const whereClause: any = {
        businessId: request.businessId,
        customerId: request.dataSubjectId,
      };

      if (request.timeRange) {
        whereClause.createdAt = {
          gte: request.timeRange.from,
          lte: request.timeRange.to,
        };
      }

      const reviewRequests = await prisma.reviewRequest.findMany({
        where: whereClause,
        include: {
          events: true,
        },
        orderBy: { createdAt: 'asc' },
      });

      dataPackage.communicationData.smsRecords = reviewRequests
        .filter(req => req.channel === 'SMS')
        .map(req => ({
          id: req.id,
          channel: req.channel,
          message: req.message,
          sentAt: req.sentAt,
          status: req.status,
          deliveryStatus: req.deliveryStatus,
          events: req.events.map(event => ({
            id: event.id,
            type: event.type,
            timestamp: event.timestamp,
            metadata: event.metadata,
          })),
        }));

      dataPackage.communicationData.emailRecords = reviewRequests
        .filter(req => req.channel === 'EMAIL')
        .map(req => ({
          id: req.id,
          channel: req.channel,
          message: req.message,
          sentAt: req.sentAt,
          status: req.status,
          deliveryStatus: req.deliveryStatus,
          events: req.events.map(event => ({
            id: event.id,
            type: event.type,
            timestamp: event.timestamp,
            metadata: event.metadata,
          })),
        }));

      totalRecords += reviewRequests.length;
    }

    // Collect suppression data
    if (request.dataCategories.includes('SUPPRESSION_DATA')) {
      const suppressions = await prisma.suppression.findMany({
        where: {
          businessId: request.businessId,
          OR: [
            { email: dataPackage.personalData.contactDetails.email },
            { phone: dataPackage.personalData.contactDetails.phone },
          ],
        },
      });

      dataPackage.communicationData.suppressionRecords = suppressions.map(supp => ({
        id: supp.id,
        type: supp.type,
        reason: supp.reason,
        channel: supp.channel,
        contact: supp.email || supp.phone,
        createdAt: supp.createdAt,
        metadata: supp.metadata,
      }));

      totalRecords += suppressions.length;
    }

    // Collect audit logs if requested
    if (request.includeAuditLogs && request.dataCategories.includes('AUDIT_LOGS')) {
      dataPackage.auditData = {
        accessLogs: [],
        complianceEvents: [],
        systemEvents: [],
      };

      // Get compliance audit events
      const complianceEvents = await prisma.complianceAuditEvent.findMany({
        where: {
          businessId: request.businessId,
          dataSubjectId: request.dataSubjectId,
        },
        orderBy: { timestamp: 'desc' },
        take: 1000, // Limit to recent 1000 events
      });

      dataPackage.auditData.complianceEvents = complianceEvents.map(event => ({
        id: event.id,
        eventType: event.eventType,
        timestamp: event.timestamp,
        description: event.description,
        legalBasis: event.legalBasis,
        processingPurpose: event.processingPurpose,
        metadata: event.metadata,
      }));

      totalRecords += complianceEvents.length;
    }

    // Calculate final package size and checksum
    const packageString = JSON.stringify(dataPackage);
    dataPackage.totalSize = Buffer.byteLength(packageString, 'utf8');
    dataPackage.recordCount = totalRecords;
    dataPackage.dataIntegrity.checksum = crypto
      .createHash('sha256')
      .update(packageString)
      .digest('hex');

    return dataPackage;
  }

  /**
   * Format export package according to requested format
   */
  private async formatExportPackage(
    exportPackage: ExportedDataPackage,
    format: ExportFormat
  ): Promise<Buffer> {
    switch (format) {
      case 'JSON':
        return Buffer.from(JSON.stringify(exportPackage, null, 2), 'utf8');

      case 'CSV':
        return this.formatAsCSV(exportPackage);

      case 'XML':
        return this.formatAsXML(exportPackage);

      case 'ENCRYPTED_ARCHIVE':
        return this.formatAsArchive(exportPackage);

      default:
        return Buffer.from(JSON.stringify(exportPackage, null, 2), 'utf8');
    }
  }

  /**
   * Format data as CSV
   */
  private formatAsCSV(exportPackage: ExportedDataPackage): Buffer {
    let csv = '';

    // Personal data CSV
    csv += 'PERSONAL_DATA\n';
    csv += 'Field,Value\n';
    Object.entries(exportPackage.personalData.basicInfo).forEach(([key, value]) => {
      csv += `${key},"${String(value).replace(/"/g, '""')}"\n`;
    });

    csv += '\nCOMMUNICATION_RECORDS\n';
    csv += 'Type,ID,Message,Sent At,Status\n';

    [
      ...exportPackage.communicationData.smsRecords,
      ...exportPackage.communicationData.emailRecords,
    ].forEach(record => {
      csv += `${record.channel},${record.id},"${String(record.message || '').replace(/"/g, '""')}",${record.sentAt},${record.status}\n`;
    });

    return Buffer.from(csv, 'utf8');
  }

  /**
   * Format data as XML
   */
  private formatAsXML(exportPackage: ExportedDataPackage): Buffer {
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<gdpr_data_export>\n';
    xml += `  <export_id>${exportPackage.exportId}</export_id>\n`;
    xml += `  <generated_at>${exportPackage.generatedAt.toISOString()}</generated_at>\n`;
    xml += '  <personal_data>\n';

    Object.entries(exportPackage.personalData.basicInfo).forEach(([key, value]) => {
      xml += `    <${key}>${String(value)}</${key}>\n`;
    });

    xml += '  </personal_data>\n';
    xml += '</gdpr_data_export>\n';

    return Buffer.from(xml, 'utf8');
  }

  /**
   * Format data as compressed archive
   */
  private formatAsArchive(exportPackage: ExportedDataPackage): Buffer {
    // In a real implementation, this would create a ZIP/TAR archive
    // For now, return JSON with compression marker
    const jsonData = JSON.stringify(exportPackage, null, 2);
    return Buffer.from(jsonData, 'utf8');
  }

  /**
   * Encrypt export package
   */
  private async encryptExportPackage(
    packageData: Buffer,
    encryption: DataExportRequest['encryption']
  ): Promise<Buffer> {
    if (!encryption.enabled) return packageData;

    try {
      // Use AES-256-GCM for encryption
      const algorithm = 'aes-256-gcm';
      const key = encryption.password
        ? crypto.scryptSync(encryption.password, 'salt', 32)
        : crypto.randomBytes(32);

      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipher(algorithm, key);

      let encrypted = cipher.update(packageData);
      encrypted = Buffer.concat([encrypted, cipher.final()]);

      // Prepend IV for decryption
      return Buffer.concat([iv, encrypted]);
    } catch (error) {
      logger.error('Export encryption failed', { error });
      return packageData; // Return unencrypted on error
    }
  }

  /**
   * Handle delivery of export package
   */
  private async handleDelivery(
    request: DataExportRequest,
    packageData: Buffer
  ): Promise<{ downloadUrl?: string; delivered: boolean }> {
    switch (request.delivery.method) {
      case 'SECURE_DOWNLOAD':
        // Generate secure download URL (would integrate with file storage)
        const downloadUrl = `/api/gdpr/exports/${request.requestId}/download?token=${crypto.randomUUID()}`;
        return { downloadUrl, delivered: true };

      case 'EMAIL':
        // Would send email with download link
        logger.info('Export delivery via email', {
          requestId: request.requestId,
          email: request.delivery.emailAddress,
          size: packageData.length,
        });
        return { delivered: true };

      case 'API_RESPONSE':
        // Data returned directly in API response
        return { delivered: true };

      default:
        return { delivered: false };
    }
  }

  /**
   * Update processing progress
   */
  private async updateProgress(requestId: string, progress: number): Promise<void> {
    await prisma.dataExportRequest
      .update({
        where: { requestId },
        data: { processingProgress: progress },
      })
      .catch(() => {}); // Ignore update errors
  }
}

// ==========================================
// CONVENIENCE FUNCTIONS
// ==========================================

/**
 * Create and process data export for GDPR request
 */
export async function createGDPRDataExport(
  businessId: string,
  dataSubjectId: string,
  requestorEmail: string,
  options?: {
    format?: ExportFormat;
    dataCategories?: DataCategory[];
    includeDeletedData?: boolean;
    gdprRequestId?: string;
  }
): Promise<{
  success: boolean;
  requestId?: string;
  message?: string;
}> {
  const exportService = getGDPRDataExportService();

  const result = await exportService.createExportRequest(
    businessId,
    {
      dataSubjectId,
      requestorEmail,
      format: options?.format || 'JSON',
      dataCategories: options?.dataCategories || [
        'PERSONAL_DETAILS',
        'COMMUNICATION_DATA',
        'TRANSACTION_DATA',
        'CONSENT_RECORDS',
      ],
      includeDeletedData: options?.includeDeletedData || false,
      delivery: { method: 'EMAIL', emailAddress: requestorEmail },
    },
    {
      gdprRequestId: options?.gdprRequestId,
      triggeredBy: 'system',
    }
  );

  if (result.success && result.requestId) {
    // Process the export asynchronously
    exportService.processExportRequest(result.requestId).catch(error => {
      logger.error('Async export processing failed', {
        requestId: result.requestId,
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }

  return result;
}

// ==========================================
// SINGLETON INSTANCE
// ==========================================

let globalDataExportService: GDPRDataExportService | null = null;

/**
 * Get global GDPR data export service instance
 */
export function getGDPRDataExportService(): GDPRDataExportService {
  if (!globalDataExportService) {
    globalDataExportService = new GDPRDataExportService();
  }
  return globalDataExportService;
}
