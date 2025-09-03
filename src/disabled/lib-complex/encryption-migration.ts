/**
 * Safe PII Encryption Migration Strategy
 *
 * Gradual, safe migration of existing customer PII data to encrypted format
 * with rollback capability, integrity verification, and minimal downtime.
 */

import { prisma } from './prisma';
import { logger } from './logger';
import { auditLog } from './audit-logger';
import { getSearchableEncryptionService } from './searchable-encryption';
import { getEncryptionCache } from './encryption-performance';

// ==========================================
// MIGRATION TYPES AND INTERFACES
// ==========================================

export interface MigrationConfig {
  // Migration strategy
  batchSize: number;
  maxConcurrency: number;
  delayBetweenBatches: number;
  businessFilter?: string[]; // Limit to specific businesses

  // Safety settings
  dryRun: boolean;
  backupBeforeMigration: boolean;
  verifyAfterMigration: boolean;
  rollbackOnFailure: boolean;

  // Performance settings
  skipValidation: boolean;
  enableParallelProcessing: boolean;
  cacheDecryption: boolean;

  // Monitoring
  progressReportInterval: number;
  errorThreshold: number; // Max errors before stopping
}

export interface MigrationStatus {
  id: string;
  tableName: string;
  fieldName: string;
  businessId?: string;

  // Progress tracking
  totalRecords: number;
  migratedRecords: number;
  failedRecords: number;
  skippedRecords: number;

  // Status
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  startedAt?: Date;
  completedAt?: Date;
  lastError?: string;

  // Performance metrics
  recordsPerSecond: number;
  estimatedTimeRemaining: number;

  // Verification results
  integrityCheckPassed?: boolean;
  verificationErrors?: string[];
}

export interface MigrationResult {
  success: boolean;
  migrationId: string;
  summary: {
    totalProcessed: number;
    successfullyMigrated: number;
    failed: number;
    skipped: number;
    duration: number;
  };
  errors: Array<{
    customerId: string;
    field: string;
    error: string;
    data?: any;
  }>;
  verificationResults?: {
    passed: boolean;
    checkedRecords: number;
    failedVerifications: number;
    issues: string[];
  };
}

// ==========================================
// MIGRATION ORCHESTRATOR
// ==========================================

export class EncryptionMigrationOrchestrator {
  private searchableEncryption = getSearchableEncryptionService();
  private cache = getEncryptionCache();
  private activeMigrations: Map<string, MigrationStatus> = new Map();

  /**
   * Start PII encryption migration for customers table
   */
  async migrateCustomerPII(config: MigrationConfig): Promise<MigrationResult> {
    const migrationId = this.generateMigrationId();
    const startTime = Date.now();

    try {
      // Initialize migration status
      const migrationStatus: MigrationStatus = {
        id: migrationId,
        tableName: 'customers',
        fieldName: 'pii_fields',
        totalRecords: 0,
        migratedRecords: 0,
        failedRecords: 0,
        skippedRecords: 0,
        status: 'pending',
        recordsPerSecond: 0,
        estimatedTimeRemaining: 0,
      };

      this.activeMigrations.set(migrationId, migrationStatus);

      logger.info('Starting PII encryption migration', {
        migrationId,
        config: {
          ...config,
          // Don't log sensitive config details
          businessFilter: config.businessFilter
            ? `${config.businessFilter.length} businesses`
            : 'all',
        },
      });

      // Audit migration start
      await auditLog({
        category: 'data_modification',
        type: 'ENCRYPTION_MIGRATED',
        severity: 'high',
        description: 'PII encryption migration started',
        metadata: {
          migrationId,
          tableName: 'customers',
          dryRun: config.dryRun,
          batchSize: config.batchSize,
          businessFilter: config.businessFilter?.length || 'all',
        },
        flags: {
          requiresReview: true,
          personalData: true,
        },
      });

      // Phase 1: Pre-migration validation
      if (!config.skipValidation) {
        await this.validateMigrationReadiness(config, migrationStatus);
      }

      // Phase 2: Create backup if requested
      if (config.backupBeforeMigration && !config.dryRun) {
        await this.createMigrationBackup(migrationStatus);
      }

      // Phase 3: Execute migration
      migrationStatus.status = 'running';
      migrationStatus.startedAt = new Date();

      const migrationResult = await this.executePIIMigration(config, migrationStatus);

      // Phase 4: Post-migration verification
      if (config.verifyAfterMigration && !config.dryRun) {
        migrationResult.verificationResults = await this.verifyMigrationIntegrity(
          migrationStatus,
          migrationResult
        );
      }

      // Phase 5: Complete migration
      migrationStatus.status = migrationResult.success ? 'completed' : 'failed';
      migrationStatus.completedAt = new Date();

      const duration = Date.now() - startTime;
      migrationResult.summary.duration = duration;

      logger.info('PII encryption migration completed', {
        migrationId,
        success: migrationResult.success,
        summary: migrationResult.summary,
        duration,
      });

      // Audit migration completion
      await auditLog({
        category: 'data_modification',
        type: 'ENCRYPTION_MIGRATED',
        severity: migrationResult.success ? 'medium' : 'high',
        description: `PII encryption migration ${migrationResult.success ? 'completed' : 'failed'}`,
        metadata: {
          migrationId,
          result: migrationResult.summary,
          verificationPassed: migrationResult.verificationResults?.passed,
          duration,
        },
        flags: {
          requiresReview: !migrationResult.success,
          personalData: true,
        },
      });

      return migrationResult;
    } catch (error) {
      const migrationStatus = this.activeMigrations.get(migrationId);
      if (migrationStatus) {
        migrationStatus.status = 'failed';
        migrationStatus.lastError = error instanceof Error ? error.message : String(error);
        migrationStatus.completedAt = new Date();
      }

      logger.error('PII encryption migration failed', {
        migrationId,
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        success: false,
        migrationId,
        summary: {
          totalProcessed: migrationStatus?.totalRecords || 0,
          successfullyMigrated: migrationStatus?.migratedRecords || 0,
          failed: migrationStatus?.failedRecords || 0,
          skipped: migrationStatus?.skippedRecords || 0,
          duration: Date.now() - startTime,
        },
        errors: [
          {
            customerId: 'system',
            field: 'migration',
            error: error instanceof Error ? error.message : String(error),
          },
        ],
      };
    } finally {
      this.activeMigrations.delete(migrationId);
    }
  }

  /**
   * Get migration status
   */
  getMigrationStatus(migrationId: string): MigrationStatus | null {
    return this.activeMigrations.get(migrationId) || null;
  }

  /**
   * Cancel active migration
   */
  async cancelMigration(migrationId: string): Promise<boolean> {
    const migration = this.activeMigrations.get(migrationId);
    if (!migration || migration.status !== 'running') {
      return false;
    }

    migration.status = 'cancelled';

    logger.warn('Migration cancelled by request', { migrationId });

    await auditLog({
      category: 'data_modification',
      type: 'ENCRYPTION_MIGRATED',
      severity: 'medium',
      description: 'PII encryption migration cancelled',
      metadata: { migrationId, reason: 'user_request' },
    });

    return true;
  }

  // ==========================================
  // PRIVATE MIGRATION METHODS
  // ==========================================

  /**
   * Validate migration readiness
   */
  private async validateMigrationReadiness(
    config: MigrationConfig,
    status: MigrationStatus
  ): Promise<void> {
    logger.info('Validating migration readiness', { migrationId: status.id });

    // Check encryption service health
    const encryptionMetrics = this.searchableEncryption.getPerformanceMetrics?.() || {};

    // Count total records to migrate
    const whereClause: any = {
      OR: [
        { firstName: { not: null } },
        { lastName: { not: null } },
        { email: { not: null } },
        { phone: { not: null } },
      ],
      // Only migrate records that aren't already encrypted
      encryptionVersion: null,
    };

    if (config.businessFilter) {
      whereClause.businessId = { in: config.businessFilter };
    }

    status.totalRecords = await prisma.customer.count({ where: whereClause });

    if (status.totalRecords === 0) {
      throw new Error('No records found for migration');
    }

    // Estimate time and resources
    const estimatedDuration =
      (status.totalRecords / config.batchSize) * (config.delayBetweenBatches + 1000); // Assume 1s per batch

    logger.info('Migration validation completed', {
      migrationId: status.id,
      totalRecords: status.totalRecords,
      estimatedDurationMinutes: Math.ceil(estimatedDuration / 60000),
    });
  }

  /**
   * Create migration backup
   */
  private async createMigrationBackup(status: MigrationStatus): Promise<void> {
    logger.info('Creating migration backup', { migrationId: status.id });

    // This would typically export current customer data to a backup location
    // For this implementation, we'll create a backup table
    const backupTableName = `customers_backup_${Date.now()}`;

    await prisma.$executeRawUnsafe(`
      CREATE TABLE ${backupTableName} AS 
      SELECT * FROM customers 
      WHERE first_name IS NOT NULL 
         OR last_name IS NOT NULL 
         OR email IS NOT NULL 
         OR phone IS NOT NULL
    `);

    await auditLog({
      category: 'data_modification',
      type: 'DATA_EXPORT',
      severity: 'medium',
      description: 'Customer PII backup created before migration',
      metadata: {
        migrationId: status.id,
        backupTableName,
        purpose: 'pre_migration_backup',
      },
      flags: { personalData: true },
    });

    logger.info('Migration backup created', {
      migrationId: status.id,
      backupTableName,
    });
  }

  /**
   * Execute the main PII migration
   */
  private async executePIIMigration(
    config: MigrationConfig,
    status: MigrationStatus
  ): Promise<MigrationResult> {
    const errors: MigrationResult['errors'] = [];
    let processedCount = 0;

    try {
      // Get customers to migrate in batches
      const whereClause: any = {
        OR: [
          { firstName: { not: null } },
          { lastName: { not: null } },
          { email: { not: null } },
          { phone: { not: null } },
        ],
        encryptionVersion: null,
      };

      if (config.businessFilter) {
        whereClause.businessId = { in: config.businessFilter };
      }

      let skip = 0;
      const startTime = Date.now();

      while (true) {
        // Check for cancellation
        if (status.status === 'cancelled') {
          logger.info('Migration cancelled', { migrationId: status.id });
          break;
        }

        // Get batch of customers
        const customers = await prisma.customer.findMany({
          where: whereClause,
          skip,
          take: config.batchSize,
          orderBy: { createdAt: 'asc' },
        });

        if (customers.length === 0) {
          break; // No more customers to process
        }

        // Process batch
        await this.processMigrationBatch(customers, config, status, errors);

        processedCount += customers.length;
        skip += config.batchSize;

        // Update status
        status.migratedRecords = processedCount - status.failedRecords - status.skippedRecords;

        const elapsed = Date.now() - startTime;
        status.recordsPerSecond = processedCount / (elapsed / 1000);

        if (status.recordsPerSecond > 0) {
          const remaining = status.totalRecords - processedCount;
          status.estimatedTimeRemaining = remaining / status.recordsPerSecond;
        }

        // Report progress
        if (processedCount % config.progressReportInterval === 0) {
          logger.info('Migration progress', {
            migrationId: status.id,
            processed: processedCount,
            total: status.totalRecords,
            percentage: Math.round((processedCount / status.totalRecords) * 100),
            recordsPerSecond: Math.round(status.recordsPerSecond),
            errors: status.failedRecords,
          });
        }

        // Check error threshold
        if (status.failedRecords > config.errorThreshold) {
          throw new Error(
            `Error threshold exceeded: ${status.failedRecords} > ${config.errorThreshold}`
          );
        }

        // Delay between batches
        if (config.delayBetweenBatches > 0) {
          await new Promise(resolve => setTimeout(resolve, config.delayBetweenBatches));
        }
      }

      const success = status.failedRecords === 0 && status.status !== 'cancelled';

      return {
        success,
        migrationId: status.id,
        summary: {
          totalProcessed: processedCount,
          successfullyMigrated: status.migratedRecords,
          failed: status.failedRecords,
          skipped: status.skippedRecords,
          duration: Date.now() - startTime,
        },
        errors,
      };
    } catch (error) {
      status.lastError = error instanceof Error ? error.message : String(error);
      throw error;
    }
  }

  /**
   * Process a batch of customers for migration
   */
  private async processMigrationBatch(
    customers: any[],
    config: MigrationConfig,
    status: MigrationStatus,
    errors: MigrationResult['errors']
  ): Promise<void> {
    const batchPromises = customers.map(async customer => {
      try {
        await this.migrateCustomerRecord(customer, config);
      } catch (error) {
        status.failedRecords++;
        errors.push({
          customerId: customer.id,
          field: 'all_pii',
          error: error instanceof Error ? error.message : String(error),
          data: {
            businessId: customer.businessId,
            hasFirstName: !!customer.firstName,
            hasLastName: !!customer.lastName,
            hasEmail: !!customer.email,
            hasPhone: !!customer.phone,
          },
        });

        logger.error('Customer migration failed', {
          customerId: customer.id,
          businessId: customer.businessId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });

    // Process with limited concurrency
    if (config.enableParallelProcessing) {
      // Process in smaller concurrent batches
      const concurrencyLimit = Math.min(config.maxConcurrency, customers.length);
      const chunks = this.chunkArray(batchPromises, concurrencyLimit);

      for (const chunk of chunks) {
        await Promise.allSettled(chunk);
      }
    } else {
      // Process sequentially
      await Promise.allSettled(batchPromises);
    }
  }

  /**
   * Migrate a single customer record
   */
  private async migrateCustomerRecord(customer: any, config: MigrationConfig): Promise<void> {
    // Extract PII data
    const piiData: any = {};
    if (customer.firstName) piiData.firstName = customer.firstName;
    if (customer.lastName) piiData.lastName = customer.lastName;
    if (customer.email) piiData.email = customer.email;
    if (customer.phone) piiData.phone = customer.phone;

    if (Object.keys(piiData).length === 0) {
      return; // No PII to migrate
    }

    if (config.dryRun) {
      // Dry run: just validate encryption without storing
      await this.searchableEncryption.encryptCustomerPII(piiData, {
        businessId: customer.businessId,
        customerId: customer.id,
      });
      return;
    }

    // Encrypt PII data
    const encryptedPII = await this.searchableEncryption.encryptCustomerPII(piiData, {
      businessId: customer.businessId,
      customerId: customer.id,
    });

    // Prepare update data
    const updateData: any = {
      encryptionVersion: 1,
      encryptedAt: new Date(),
      updatedAt: new Date(),

      // Clear legacy fields
      firstName: null,
      lastName: null,
      email: null,
      phone: null,
    };

    // Set encrypted fields
    if (encryptedPII.firstNameEncrypted) {
      updateData.firstNameEncrypted = JSON.stringify(encryptedPII.firstNameEncrypted);
      updateData.firstNameSearchHash = encryptedPII.firstNameSearchHash;
    }
    if (encryptedPII.lastNameEncrypted) {
      updateData.lastNameEncrypted = JSON.stringify(encryptedPII.lastNameEncrypted);
      updateData.lastNameSearchHash = encryptedPII.lastNameSearchHash;
    }
    if (encryptedPII.emailEncrypted) {
      updateData.emailEncrypted = JSON.stringify(encryptedPII.emailEncrypted);
      updateData.emailSearchHash = encryptedPII.emailSearchHash;
    }
    if (encryptedPII.phoneEncrypted) {
      updateData.phoneEncrypted = JSON.stringify(encryptedPII.phoneEncrypted);
      updateData.phoneSearchHash = encryptedPII.phoneSearchHash;
    }
    if (encryptedPII.fullNameSearchHash) {
      updateData.fullNameSearchHash = encryptedPII.fullNameSearchHash;
    }

    // Update customer record
    await prisma.customer.update({
      where: { id: customer.id },
      data: updateData,
    });

    // Record migration in tracking table
    await this.recordMigrationProgress(customer.id, piiData);
  }

  /**
   * Verify migration integrity
   */
  private async verifyMigrationIntegrity(
    status: MigrationStatus,
    result: MigrationResult
  ): Promise<NonNullable<MigrationResult['verificationResults']>> {
    logger.info('Verifying migration integrity', { migrationId: status.id });

    const verificationResult = {
      passed: true,
      checkedRecords: 0,
      failedVerifications: 0,
      issues: [] as string[],
    };

    try {
      // Sample verification - check 10% of migrated records
      const sampleSize = Math.max(10, Math.floor(result.summary.successfullyMigrated * 0.1));

      const migratedCustomers = await prisma.customer.findMany({
        where: {
          encryptionVersion: { not: null },
          OR: [
            { firstNameEncrypted: { not: null } },
            { lastNameEncrypted: { not: null } },
            { emailEncrypted: { not: null } },
            { phoneEncrypted: { not: null } },
          ],
        },
        take: sampleSize,
        orderBy: { encryptedAt: 'desc' },
      });

      for (const customer of migratedCustomers) {
        try {
          // Try to decrypt encrypted fields
          const encryptedPII: any = {};

          if (customer.firstNameEncrypted) {
            encryptedPII.firstNameEncrypted = JSON.parse(customer.firstNameEncrypted);
          }
          if (customer.lastNameEncrypted) {
            encryptedPII.lastNameEncrypted = JSON.parse(customer.lastNameEncrypted);
          }
          if (customer.emailEncrypted) {
            encryptedPII.emailEncrypted = JSON.parse(customer.emailEncrypted);
          }
          if (customer.phoneEncrypted) {
            encryptedPII.phoneEncrypted = JSON.parse(customer.phoneEncrypted);
          }

          if (Object.keys(encryptedPII).length > 0) {
            // Verify decryption works
            await this.searchableEncryption.decryptCustomerPII(encryptedPII, {
              businessId: customer.businessId,
              customerId: customer.id,
            });
          }

          verificationResult.checkedRecords++;
        } catch (error) {
          verificationResult.failedVerifications++;
          verificationResult.issues.push(
            `Customer ${customer.id}: ${error instanceof Error ? error.message : String(error)}`
          );

          if (verificationResult.failedVerifications > 5) {
            verificationResult.passed = false;
          }
        }
      }

      logger.info('Migration integrity verification completed', {
        migrationId: status.id,
        checkedRecords: verificationResult.checkedRecords,
        failedVerifications: verificationResult.failedVerifications,
        passed: verificationResult.passed,
      });
    } catch (error) {
      verificationResult.passed = false;
      verificationResult.issues.push(
        `Verification system error: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    return verificationResult;
  }

  // ==========================================
  // UTILITY METHODS
  // ==========================================

  private generateMigrationId(): string {
    return `migration_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }

  private chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }

  private async recordMigrationProgress(customerId: string, piiData: any): Promise<void> {
    // Record in the migration tracking table created in the migration SQL
    await prisma.$executeRaw`
      INSERT INTO encryption_migrations (table_name, field_name, total_records, migrated_records, status)
      VALUES ('customers', 'pii_migration', 1, 1, 'completed')
      ON CONFLICT (table_name, field_name, business_id) 
      DO UPDATE SET 
        migrated_records = encryption_migrations.migrated_records + 1,
        completed_at = CASE WHEN encryption_migrations.migrated_records + 1 >= encryption_migrations.total_records 
                           THEN NOW() 
                           ELSE encryption_migrations.completed_at 
                      END
    `;
  }

  /**
   * Rollback migration for a specific customer
   */
  async rollbackCustomerMigration(customerId: string, businessId: string): Promise<boolean> {
    try {
      // This would restore from backup and clear encrypted fields
      logger.warn('Customer migration rollback requested', { customerId, businessId });

      // Implementation would depend on backup strategy
      // For now, just clear encrypted fields
      await prisma.customer.update({
        where: { id: customerId },
        data: {
          firstNameEncrypted: null,
          lastNameEncrypted: null,
          emailEncrypted: null,
          phoneEncrypted: null,
          firstNameSearchHash: null,
          lastNameSearchHash: null,
          emailSearchHash: null,
          phoneSearchHash: null,
          fullNameSearchHash: null,
          encryptionVersion: null,
          encryptedAt: null,
        },
      });

      await auditLog({
        category: 'data_modification',
        type: 'ENCRYPTION_MIGRATED',
        severity: 'high',
        description: 'Customer encryption rollback completed',
        businessId,
        metadata: { customerId, reason: 'rollback_request' },
        flags: { personalData: true, requiresReview: true },
      });

      return true;
    } catch (error) {
      logger.error('Customer migration rollback failed', {
        customerId,
        businessId,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }
}

// ==========================================
// MIGRATION UTILITIES
// ==========================================

/**
 * Create default migration configuration
 */
export function createDefaultMigrationConfig(
  overrides?: Partial<MigrationConfig>
): MigrationConfig {
  return {
    batchSize: 50,
    maxConcurrency: 5,
    delayBetweenBatches: 1000, // 1 second
    businessFilter: undefined,

    dryRun: false,
    backupBeforeMigration: true,
    verifyAfterMigration: true,
    rollbackOnFailure: true,

    skipValidation: false,
    enableParallelProcessing: true,
    cacheDecryption: true,

    progressReportInterval: 100,
    errorThreshold: 10,

    ...overrides,
  };
}

/**
 * Get migration status from database
 */
export async function getMigrationStatusFromDB(
  tableName: string = 'customers',
  fieldName: string = 'pii_fields'
): Promise<any[]> {
  return await prisma.$queryRaw`
    SELECT * FROM encryption_migrations 
    WHERE table_name = ${tableName} AND field_name = ${fieldName}
    ORDER BY started_at DESC
  `;
}

// ==========================================
// SINGLETON INSTANCE
// ==========================================

let globalMigrationOrchestrator: EncryptionMigrationOrchestrator | null = null;

/**
 * Get global migration orchestrator instance
 */
export function getMigrationOrchestrator(): EncryptionMigrationOrchestrator {
  if (!globalMigrationOrchestrator) {
    globalMigrationOrchestrator = new EncryptionMigrationOrchestrator();
  }
  return globalMigrationOrchestrator;
}
