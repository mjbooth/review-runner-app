/**
 * Customer Encryption Service Layer
 *
 * Transparent encryption/decryption layer for customer PII data that
 * integrates seamlessly with existing customer service without breaking
 * existing API endpoints or business logic.
 */

import { prisma } from './prisma';
import { logger } from './logger';
import { auditLog } from './audit-logger';
import crypto from 'crypto';
import {
  getSearchableEncryptionService,
  type CustomerPIIData,
  type EncryptedCustomerPII,
  type SearchQuery,
} from './searchable-encryption';

// ==========================================
// TYPES AND INTERFACES
// ==========================================

export interface CustomerRecord {
  id: string;
  businessId: string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  notes?: string | null;
  tags: string[];
  lastContact?: Date | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface EncryptedCustomerRecord
  extends Omit<CustomerRecord, 'firstName' | 'lastName' | 'email' | 'phone'> {
  // Encrypted fields (internal storage format)
  firstNameEncrypted?: string | null;
  lastNameEncrypted?: string | null;
  emailEncrypted?: string | null;
  phoneEncrypted?: string | null;

  // Search hashes (for database queries)
  emailSearchHash?: string | null;
  phoneSearchHash?: string | null;
  firstNameSearchHash?: string | null;
  lastNameSearchHash?: string | null;
  fullNameSearchHash?: string | null;

  // Encryption metadata
  encryptionVersion?: number | null;
  encryptedAt?: Date | null;

  // Decrypted fields (populated on demand)
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
}

export interface CustomerSearchOptions {
  search?: string;
  email?: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
  tags?: string[];
  status?: 'active' | 'inactive' | 'all';
  page?: number;
  limit?: number;
  sortBy?: 'name' | 'email' | 'createdAt' | 'lastContact';
  sortOrder?: 'asc' | 'desc';
}

export interface CustomerSearchResult {
  customers: CustomerRecord[];
  totalCount: number;
  page: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface CustomerCreateInput {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  address?: string;
  notes?: string;
  tags?: string[];
}

export interface CustomerUpdateInput {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  address?: string;
  notes?: string;
  tags?: string[];
}

// ==========================================
// ENCRYPTION STRATEGY INTERFACE
// ==========================================

interface EncryptionStrategy {
  isEnabled: boolean;
  fallbackToLegacy: boolean;
  encryptOnWrite: boolean;
  decryptOnRead: boolean;
  migrateOnAccess: boolean;
}

// ==========================================
// CUSTOMER ENCRYPTION SERVICE
// ==========================================

export class CustomerEncryptionService {
  private searchableEncryption = getSearchableEncryptionService();
  private strategy: EncryptionStrategy;
  private performanceMetrics = {
    encryptionTime: 0,
    decryptionTime: 0,
    cacheHits: 0,
    cacheMisses: 0,
    totalQueries: 0,
  };

  constructor(strategy?: Partial<EncryptionStrategy>) {
    this.strategy = {
      isEnabled: process.env.PII_ENCRYPTION_ENABLED === 'true',
      fallbackToLegacy: true,
      encryptOnWrite: process.env.PII_ENCRYPT_ON_WRITE !== 'false',
      decryptOnRead: true,
      migrateOnAccess: process.env.PII_MIGRATE_ON_ACCESS === 'true',
      ...strategy,
    };

    logger.info('Customer encryption service initialized', {
      strategy: this.strategy,
    });
  }

  /**
   * Create a new customer with encrypted PII
   */
  async createCustomer(
    businessId: string,
    input: CustomerCreateInput,
    context?: {
      userId?: string;
      auditContext?: Record<string, any>;
    }
  ): Promise<CustomerRecord> {
    const startTime = Date.now();

    try {
      // Validate input
      this.validateCustomerInput(input);

      // Prepare data for storage
      let customerData: any = {
        businessId,
        address: input.address,
        notes: input.notes,
        tags: input.tags || [],
        isActive: true,
      };

      // Handle PII encryption
      if (this.strategy.isEnabled && this.strategy.encryptOnWrite) {
        // Encrypt PII fields
        const piiData: CustomerPIIData = {};
        if (input.firstName) piiData.firstName = input.firstName;
        if (input.lastName) piiData.lastName = input.lastName;
        if (input.email) piiData.email = input.email;
        if (input.phone) piiData.phone = input.phone;

        if (Object.keys(piiData).length > 0) {
          const tempCustomerId = crypto.randomUUID(); // Temporary ID for encryption context
          const encryptedPII = await this.searchableEncryption.encryptCustomerPII(piiData, {
            businessId,
            customerId: tempCustomerId,
          });

          // Store encrypted data as JSON strings
          if (encryptedPII.firstNameEncrypted) {
            customerData.firstNameEncrypted = JSON.stringify(encryptedPII.firstNameEncrypted);
            customerData.firstNameSearchHash = encryptedPII.firstNameSearchHash;
          }
          if (encryptedPII.lastNameEncrypted) {
            customerData.lastNameEncrypted = JSON.stringify(encryptedPII.lastNameEncrypted);
            customerData.lastNameSearchHash = encryptedPII.lastNameSearchHash;
          }
          if (encryptedPII.emailEncrypted) {
            customerData.emailEncrypted = JSON.stringify(encryptedPII.emailEncrypted);
            customerData.emailSearchHash = encryptedPII.emailSearchHash;
          }
          if (encryptedPII.phoneEncrypted) {
            customerData.phoneEncrypted = JSON.stringify(encryptedPII.phoneEncrypted);
            customerData.phoneSearchHash = encryptedPII.phoneSearchHash;
          }
          if (encryptedPII.fullNameSearchHash) {
            customerData.fullNameSearchHash = encryptedPII.fullNameSearchHash;
          }

          customerData.encryptionVersion = 1;
          customerData.encryptedAt = new Date();
        }

        // Store legacy fields as null (encrypted data is primary)
        customerData.firstName = null;
        customerData.lastName = null;
        customerData.email = null;
        customerData.phone = null;
      } else {
        // Store in legacy fields (fallback mode or migration period)
        customerData.firstName = input.firstName || null;
        customerData.lastName = input.lastName || null;
        customerData.email = input.email || null;
        customerData.phone = input.phone || null;
      }

      // Create customer record
      const dbCustomer = await prisma.customer.create({
        data: customerData,
      });

      // Convert to public format
      const customer = await this.convertToPublicFormat(dbCustomer);

      this.updatePerformanceMetrics('create', Date.now() - startTime);

      // Audit customer creation
      await auditLog({
        category: 'data_modification',
        type: 'DATA_CREATED',
        severity: 'low',
        description: `Customer ${customer.firstName} ${customer.lastName} created`,
        businessId,
        metadata: {
          customerId: customer.id,
          encrypted: this.strategy.isEnabled && this.strategy.encryptOnWrite,
          hasEmail: !!input.email,
          hasPhone: !!input.phone,
          createdBy: context?.userId,
          ...context?.auditContext,
        },
        flags: {
          personalData: true,
        },
      });

      logger.info('Customer created with encryption support', {
        customerId: customer.id,
        businessId,
        encrypted: this.strategy.isEnabled && this.strategy.encryptOnWrite,
        piiFieldCount: [input.firstName, input.lastName, input.email, input.phone].filter(Boolean)
          .length,
      });

      return customer;
    } catch (error) {
      logger.error('Customer creation failed', {
        businessId,
        error: error instanceof Error ? error.message : String(error),
        encrypted: this.strategy.isEnabled && this.strategy.encryptOnWrite,
      });
      throw error;
    }
  }

  /**
   * Get customer by ID with automatic decryption
   */
  async getCustomerById(
    customerId: string,
    businessId: string,
    options?: {
      decrypt?: boolean;
      migrateOnAccess?: boolean;
    }
  ): Promise<CustomerRecord | null> {
    const startTime = Date.now();
    const shouldDecrypt = options?.decrypt !== false && this.strategy.decryptOnRead;
    const shouldMigrate = options?.migrateOnAccess ?? this.strategy.migrateOnAccess;

    try {
      // Get customer from database
      const dbCustomer = await prisma.customer.findUnique({
        where: { id: customerId },
        include: {
          _count: {
            select: {
              reviewRequests: { where: { isActive: true } },
            },
          },
        },
      });

      if (!dbCustomer || dbCustomer.businessId !== businessId) {
        return null;
      }

      // Check if migration is needed and allowed
      if (shouldMigrate && this.needsMigration(dbCustomer)) {
        await this.migrateCustomerRecord(dbCustomer);
        // Re-fetch updated record
        const updatedCustomer = await prisma.customer.findUnique({
          where: { id: customerId },
        });
        if (updatedCustomer) {
          Object.assign(dbCustomer, updatedCustomer);
        }
      }

      // Convert to public format (with decryption if needed)
      const customer = await this.convertToPublicFormat(dbCustomer, { decrypt: shouldDecrypt });

      this.updatePerformanceMetrics('read', Date.now() - startTime);
      this.performanceMetrics.totalQueries++;

      return customer;
    } catch (error) {
      logger.error('Customer retrieval failed', {
        customerId,
        businessId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Search customers with encrypted field support
   */
  async searchCustomers(
    businessId: string,
    options: CustomerSearchOptions = {}
  ): Promise<CustomerSearchResult> {
    const startTime = Date.now();
    const { page = 1, limit = 20 } = options;
    const offset = (page - 1) * limit;

    try {
      // Build search query
      const where = await this.buildSearchQuery(businessId, options);
      const orderBy = this.buildOrderByClause(options);

      // Execute search
      const [customers, totalCount] = await Promise.all([
        prisma.customer.findMany({
          where,
          orderBy,
          skip: offset,
          take: limit,
        }),
        prisma.customer.count({ where }),
      ]);

      // Convert to public format
      const publicCustomers = await Promise.all(
        customers.map(customer => this.convertToPublicFormat(customer))
      );

      const totalPages = Math.ceil(totalCount / limit);

      this.updatePerformanceMetrics('search', Date.now() - startTime);
      this.performanceMetrics.totalQueries++;

      return {
        customers: publicCustomers,
        totalCount,
        page,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      };
    } catch (error) {
      logger.error('Customer search failed', {
        businessId,
        options,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Update customer with encrypted PII handling
   */
  async updateCustomer(
    customerId: string,
    businessId: string,
    updates: CustomerUpdateInput,
    context?: {
      userId?: string;
      auditContext?: Record<string, any>;
    }
  ): Promise<CustomerRecord> {
    const startTime = Date.now();

    try {
      // Get current customer
      const currentCustomer = await prisma.customer.findUnique({
        where: { id: customerId },
      });

      if (!currentCustomer || currentCustomer.businessId !== businessId) {
        throw new Error('Customer not found');
      }

      // Prepare update data
      let updateData: any = {};

      // Handle non-PII fields
      if (updates.address !== undefined) updateData.address = updates.address;
      if (updates.notes !== undefined) updateData.notes = updates.notes;
      if (updates.tags !== undefined) updateData.tags = updates.tags;

      // Handle PII fields
      const hasPIIUpdates =
        updates.firstName !== undefined ||
        updates.lastName !== undefined ||
        updates.email !== undefined ||
        updates.phone !== undefined;

      if (hasPIIUpdates) {
        if (this.strategy.isEnabled && this.strategy.encryptOnWrite) {
          // Update encrypted PII fields
          const currentPII = await this.getCurrentPIIData(currentCustomer);
          const updatedPII = { ...currentPII };

          if (updates.firstName !== undefined)
            updatedPII.firstName = updates.firstName || undefined;
          if (updates.lastName !== undefined) updatedPII.lastName = updates.lastName || undefined;
          if (updates.email !== undefined) updatedPII.email = updates.email || undefined;
          if (updates.phone !== undefined) updatedPII.phone = updates.phone || undefined;

          // Re-encrypt all PII data
          if (Object.values(updatedPII).some(v => v)) {
            const encryptedPII = await this.searchableEncryption.encryptCustomerPII(updatedPII, {
              businessId,
              customerId,
            });

            // Update encrypted fields
            updateData.firstNameEncrypted = encryptedPII.firstNameEncrypted
              ? JSON.stringify(encryptedPII.firstNameEncrypted)
              : null;
            updateData.lastNameEncrypted = encryptedPII.lastNameEncrypted
              ? JSON.stringify(encryptedPII.lastNameEncrypted)
              : null;
            updateData.emailEncrypted = encryptedPII.emailEncrypted
              ? JSON.stringify(encryptedPII.emailEncrypted)
              : null;
            updateData.phoneEncrypted = encryptedPII.phoneEncrypted
              ? JSON.stringify(encryptedPII.phoneEncrypted)
              : null;

            // Update search hashes
            updateData.firstNameSearchHash = encryptedPII.firstNameSearchHash;
            updateData.lastNameSearchHash = encryptedPII.lastNameSearchHash;
            updateData.emailSearchHash = encryptedPII.emailSearchHash;
            updateData.phoneSearchHash = encryptedPII.phoneSearchHash;
            updateData.fullNameSearchHash = encryptedPII.fullNameSearchHash;

            updateData.encryptionVersion = 1;
            updateData.encryptedAt = new Date();
          }

          // Clear legacy fields
          updateData.firstName = null;
          updateData.lastName = null;
          updateData.email = null;
          updateData.phone = null;
        } else {
          // Update legacy fields
          if (updates.firstName !== undefined) updateData.firstName = updates.firstName;
          if (updates.lastName !== undefined) updateData.lastName = updates.lastName;
          if (updates.email !== undefined) updateData.email = updates.email;
          if (updates.phone !== undefined) updateData.phone = updates.phone;
        }
      }

      // Update customer record
      const updatedCustomer = await prisma.customer.update({
        where: { id: customerId },
        data: {
          ...updateData,
          updatedAt: new Date(),
        },
      });

      // Convert to public format
      const customer = await this.convertToPublicFormat(updatedCustomer);

      this.updatePerformanceMetrics('update', Date.now() - startTime);

      // Audit customer update
      await auditLog({
        category: 'data_modification',
        type: 'DATA_UPDATED',
        severity: 'low',
        description: `Customer ${customer.firstName} ${customer.lastName} updated`,
        businessId,
        metadata: {
          customerId: customer.id,
          updatedFields: Object.keys(updates),
          encrypted: this.strategy.isEnabled && this.strategy.encryptOnWrite,
          updatedBy: context?.userId,
          ...context?.auditContext,
        },
        flags: {
          personalData: hasPIIUpdates,
        },
      });

      logger.info('Customer updated with encryption support', {
        customerId: customer.id,
        businessId,
        updatedFields: Object.keys(updates),
        encrypted: this.strategy.isEnabled && this.strategy.encryptOnWrite,
      });

      return customer;
    } catch (error) {
      logger.error('Customer update failed', {
        customerId,
        businessId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Get customers for messaging (with decryption for contact details)
   */
  async getCustomersForMessaging(
    businessId: string,
    customerIds: string[]
  ): Promise<
    Array<{
      id: string;
      firstName?: string;
      lastName?: string;
      email?: string;
      phone?: string;
    }>
  > {
    const startTime = Date.now();

    try {
      const customers = await prisma.customer.findMany({
        where: {
          id: { in: customerIds },
          businessId,
          isActive: true,
        },
      });

      // Always decrypt for messaging purposes
      const messagingCustomers = await Promise.all(
        customers.map(async customer => {
          const decryptedCustomer = await this.convertToPublicFormat(customer, { decrypt: true });
          return {
            id: decryptedCustomer.id,
            firstName: decryptedCustomer.firstName,
            lastName: decryptedCustomer.lastName,
            email: decryptedCustomer.email,
            phone: decryptedCustomer.phone,
          };
        })
      );

      this.updatePerformanceMetrics('messaging', Date.now() - startTime);

      // Audit bulk PII access for messaging
      await auditLog({
        category: 'data_access',
        type: 'DATA_READ',
        severity: 'medium',
        description: `Bulk customer PII accessed for messaging`,
        businessId,
        metadata: {
          customerCount: messagingCustomers.length,
          purpose: 'messaging',
          decrypted: true,
        },
        flags: {
          personalData: true,
        },
      });

      return messagingCustomers;
    } catch (error) {
      logger.error('Messaging customer data retrieval failed', {
        businessId,
        customerCount: customerIds.length,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  // ==========================================
  // PRIVATE HELPER METHODS
  // ==========================================

  /**
   * Convert database record to public format
   */
  private async convertToPublicFormat(
    dbCustomer: any,
    options?: { decrypt?: boolean }
  ): Promise<CustomerRecord> {
    const shouldDecrypt = options?.decrypt !== false && this.strategy.decryptOnRead;

    // Base customer data
    const customer: CustomerRecord = {
      id: dbCustomer.id,
      businessId: dbCustomer.businessId,
      firstName: null,
      lastName: null,
      email: null,
      phone: null,
      address: dbCustomer.address,
      notes: dbCustomer.notes,
      tags: dbCustomer.tags || [],
      lastContact: dbCustomer.lastContact,
      isActive: dbCustomer.isActive,
      createdAt: dbCustomer.createdAt,
      updatedAt: dbCustomer.updatedAt,
    };

    // Handle PII fields
    if (this.hasEncryptedPII(dbCustomer) && shouldDecrypt) {
      // Decrypt encrypted PII
      const encryptedPII = this.extractEncryptedPII(dbCustomer);
      const decryptedPII = await this.searchableEncryption.decryptCustomerPII(encryptedPII, {
        businessId: dbCustomer.businessId,
        customerId: dbCustomer.id,
      });

      customer.firstName = decryptedPII.firstName;
      customer.lastName = decryptedPII.lastName;
      customer.email = decryptedPII.email;
      customer.phone = decryptedPII.phone;
    } else if (!this.hasEncryptedPII(dbCustomer) && this.strategy.fallbackToLegacy) {
      // Use legacy fields
      customer.firstName = dbCustomer.firstName;
      customer.lastName = dbCustomer.lastName;
      customer.email = dbCustomer.email;
      customer.phone = dbCustomer.phone;
    }

    return customer;
  }

  /**
   * Build search query with encrypted field support
   */
  private async buildSearchQuery(businessId: string, options: CustomerSearchOptions): Promise<any> {
    const where: any = { businessId };

    // Status filter
    if (options.status === 'active') {
      where.isActive = true;
    } else if (options.status === 'inactive') {
      where.isActive = false;
    }

    // Tags filter
    if (options.tags && options.tags.length > 0) {
      where.tags = { hasSome: options.tags };
    }

    // Handle search filters
    if (options.search || options.email || options.phone || options.firstName || options.lastName) {
      // Generate search hashes for encrypted lookups
      const searchQuery: SearchQuery = {
        exact: {},
      };

      if (options.email) searchQuery.exact!.email = options.email;
      if (options.phone) searchQuery.exact!.phone = options.phone;
      if (options.firstName) searchQuery.exact!.firstName = options.firstName;
      if (options.lastName) searchQuery.exact!.lastName = options.lastName;
      if (options.search) {
        // Try to parse as full name
        const nameParts = options.search.trim().split(/\s+/);
        if (nameParts.length >= 2) {
          searchQuery.exact!.fullName = options.search;
        } else {
          searchQuery.exact!.firstName = options.search;
        }
      }

      const searchHashes = this.searchableEncryption.generateSearchHashes(searchQuery);

      // Build OR conditions for encrypted and legacy fields
      const orConditions: any[] = [];

      if (searchHashes.emailHash && options.email) {
        orConditions.push({ emailSearchHash: searchHashes.emailHash });
      }
      if (searchHashes.phoneHash && options.phone) {
        orConditions.push({ phoneSearchHash: searchHashes.phoneHash });
      }
      if (searchHashes.firstNameHash && (options.firstName || options.search)) {
        orConditions.push({ firstNameSearchHash: searchHashes.firstNameHash });
      }
      if (searchHashes.lastNameHash && options.lastName) {
        orConditions.push({ lastNameSearchHash: searchHashes.lastNameHash });
      }
      if (searchHashes.fullNameHash && options.search) {
        orConditions.push({ fullNameSearchHash: searchHashes.fullNameHash });
      }

      // Fallback to legacy field searches
      if (this.strategy.fallbackToLegacy) {
        if (options.email) {
          orConditions.push({ email: { contains: options.email, mode: 'insensitive' } });
        }
        if (options.phone) {
          orConditions.push({ phone: { contains: options.phone } });
        }
        if (options.firstName) {
          orConditions.push({ firstName: { contains: options.firstName, mode: 'insensitive' } });
        }
        if (options.lastName) {
          orConditions.push({ lastName: { contains: options.lastName, mode: 'insensitive' } });
        }
        if (options.search) {
          orConditions.push(
            { firstName: { contains: options.search, mode: 'insensitive' } },
            { lastName: { contains: options.search, mode: 'insensitive' } },
            { email: { contains: options.search, mode: 'insensitive' } }
          );
        }
      }

      if (orConditions.length > 0) {
        where.OR = orConditions;
      }
    }

    return where;
  }

  /**
   * Build order by clause
   */
  private buildOrderByClause(options: CustomerSearchOptions): any {
    const { sortBy = 'createdAt', sortOrder = 'desc' } = options;

    switch (sortBy) {
      case 'name':
        return [{ firstName: sortOrder }, { lastName: sortOrder }];
      case 'email':
        return { email: sortOrder };
      case 'lastContact':
        return { lastContact: sortOrder };
      default:
        return { createdAt: sortOrder };
    }
  }

  /**
   * Check if customer record has encrypted PII
   */
  private hasEncryptedPII(dbCustomer: any): boolean {
    return !!(
      dbCustomer.firstNameEncrypted ||
      dbCustomer.lastNameEncrypted ||
      dbCustomer.emailEncrypted ||
      dbCustomer.phoneEncrypted
    );
  }

  /**
   * Extract encrypted PII data from database record
   */
  private extractEncryptedPII(dbCustomer: any): EncryptedCustomerPII {
    const encryptedPII: EncryptedCustomerPII = {};

    if (dbCustomer.firstNameEncrypted) {
      encryptedPII.firstNameEncrypted = JSON.parse(dbCustomer.firstNameEncrypted);
    }
    if (dbCustomer.lastNameEncrypted) {
      encryptedPII.lastNameEncrypted = JSON.parse(dbCustomer.lastNameEncrypted);
    }
    if (dbCustomer.emailEncrypted) {
      encryptedPII.emailEncrypted = JSON.parse(dbCustomer.emailEncrypted);
    }
    if (dbCustomer.phoneEncrypted) {
      encryptedPII.phoneEncrypted = JSON.parse(dbCustomer.phoneEncrypted);
    }

    return encryptedPII;
  }

  /**
   * Get current PII data from customer record
   */
  private async getCurrentPIIData(dbCustomer: any): Promise<CustomerPIIData> {
    if (this.hasEncryptedPII(dbCustomer)) {
      const encryptedPII = this.extractEncryptedPII(dbCustomer);
      return await this.searchableEncryption.decryptCustomerPII(encryptedPII, {
        businessId: dbCustomer.businessId,
        customerId: dbCustomer.id,
      });
    } else {
      return {
        firstName: dbCustomer.firstName,
        lastName: dbCustomer.lastName,
        email: dbCustomer.email,
        phone: dbCustomer.phone,
      };
    }
  }

  /**
   * Check if customer record needs migration
   */
  private needsMigration(dbCustomer: any): boolean {
    return (
      !this.hasEncryptedPII(dbCustomer) &&
      (dbCustomer.firstName || dbCustomer.lastName || dbCustomer.email || dbCustomer.phone)
    );
  }

  /**
   * Migrate customer record from legacy to encrypted format
   */
  private async migrateCustomerRecord(dbCustomer: any): Promise<void> {
    logger.info('Migrating customer to encrypted format', {
      customerId: dbCustomer.id,
      businessId: dbCustomer.businessId,
    });

    // This would trigger the migration process
    // Implementation depends on migration strategy
  }

  /**
   * Validate customer input data
   */
  private validateCustomerInput(input: CustomerCreateInput | CustomerUpdateInput): void {
    if (input.email && !this.isValidEmail(input.email)) {
      throw new Error('Invalid email format');
    }

    if (input.phone && !this.isValidPhone(input.phone)) {
      throw new Error('Invalid phone format');
    }
  }

  /**
   * Validate email format
   */
  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Validate phone format
   */
  private isValidPhone(phone: string): boolean {
    const phoneRegex = /^[\+]?[\d\s\-\(\)]{7,}$/;
    return phoneRegex.test(phone);
  }

  /**
   * Update performance metrics
   */
  private updatePerformanceMetrics(operation: string, duration: number): void {
    switch (operation) {
      case 'create':
      case 'update':
        this.performanceMetrics.encryptionTime =
          (this.performanceMetrics.encryptionTime + duration) / 2;
        break;
      case 'read':
      case 'search':
      case 'messaging':
        this.performanceMetrics.decryptionTime =
          (this.performanceMetrics.decryptionTime + duration) / 2;
        break;
    }
  }

  /**
   * Get performance metrics
   */
  getPerformanceMetrics(): typeof this.performanceMetrics {
    return { ...this.performanceMetrics };
  }
}

// ==========================================
// SINGLETON INSTANCE
// ==========================================

let globalCustomerEncryptionService: CustomerEncryptionService | null = null;

/**
 * Get global customer encryption service instance
 */
export function getCustomerEncryptionService(): CustomerEncryptionService {
  if (!globalCustomerEncryptionService) {
    globalCustomerEncryptionService = new CustomerEncryptionService();
  }
  return globalCustomerEncryptionService;
}

/**
 * Create customer encryption service with custom strategy
 */
export function createCustomerEncryptionService(
  strategy?: Partial<EncryptionStrategy>
): CustomerEncryptionService {
  return new CustomerEncryptionService(strategy);
}
