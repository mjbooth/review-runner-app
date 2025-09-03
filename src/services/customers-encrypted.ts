/**
 * Updated Customer Service with PII Encryption
 *
 * Drop-in replacement for existing customer service with transparent
 * encryption/decryption support. Maintains API compatibility while
 * adding encryption capabilities.
 */

import {
  getCustomerEncryptionService,
  type CustomerRecord,
  type CustomerCreateInput,
  type CustomerUpdateInput,
  type CustomerSearchOptions,
  type CustomerSearchResult,
} from '../lib/customer-encryption-service';
import { logger } from '../lib/logger';
import { auditDataAccess, trackOperation } from '../lib/security-integration';
import { prisma } from '../lib/prisma';
import type { AuthenticatedRequest } from '../types/auth';

// ==========================================
// CUSTOMER SERVICE WITH ENCRYPTION
// ==========================================

export class EncryptedCustomerService {
  private encryptionService = getCustomerEncryptionService();

  /**
   * Create a new customer
   */
  async createCustomer(
    businessId: string,
    customerData: CustomerCreateInput,
    context: {
      userId: string;
      request?: AuthenticatedRequest;
    }
  ): Promise<CustomerRecord> {
    const { userId, request } = context;

    return await trackOperation(
      {
        name: 'create_customer',
        description: 'Create new customer with PII encryption',
        businessId,
        userId,
        requiresAudit: true,
      },
      request!,
      async () => {
        // Validate duplicate contacts
        if (customerData.email || customerData.phone) {
          await this.checkForDuplicates(businessId, customerData.email, customerData.phone);
        }

        // Create customer with encryption
        const customer = await this.encryptionService.createCustomer(businessId, customerData, {
          userId,
          auditContext: {
            endpoint: request?.url,
            method: request?.method,
            ip: request?.ip,
          },
        });

        // Track data creation
        if (request) {
          await auditDataAccess(
            request,
            {
              type: 'customer',
              id: customer.id,
              name: `${customer.firstName} ${customer.lastName}`,
              sensitive: true,
            },
            'write',
            {
              operation: 'create',
              fieldsCreated: Object.keys(customerData),
            }
          );
        }

        return customer;
      }
    );
  }

  /**
   * Get customer by ID
   */
  async getCustomerById(
    customerId: string,
    businessId: string,
    context: {
      userId: string;
      request?: AuthenticatedRequest;
      decrypt?: boolean;
    }
  ): Promise<CustomerRecord | null> {
    const { userId, request, decrypt = true } = context;

    const customer = await this.encryptionService.getCustomerById(customerId, businessId, {
      decrypt,
    });

    if (customer && request) {
      await auditDataAccess(
        request,
        {
          type: 'customer',
          id: customer.id,
          name: `${customer.firstName} ${customer.lastName}`,
          sensitive: true,
        },
        'read',
        {
          decrypted: decrypt,
        }
      );
    }

    return customer;
  }

  /**
   * Search customers with advanced filtering
   */
  async searchCustomers(
    businessId: string,
    searchOptions: CustomerSearchOptions,
    context: {
      userId: string;
      request?: AuthenticatedRequest;
    }
  ): Promise<CustomerSearchResult> {
    const { userId, request } = context;

    const result = await this.encryptionService.searchCustomers(businessId, searchOptions);

    // Track bulk data access
    if (request && result.customers.length > 0) {
      await auditDataAccess(
        request,
        {
          type: 'customer',
          id: 'bulk',
          name: `${result.customers.length} customers`,
          sensitive: true,
        },
        'read',
        {
          searchCriteria: searchOptions,
          resultCount: result.customers.length,
          totalCount: result.totalCount,
          bulkOperation: true,
        }
      );
    }

    return result;
  }

  /**
   * Update customer information
   */
  async updateCustomer(
    customerId: string,
    businessId: string,
    updates: CustomerUpdateInput,
    context: {
      userId: string;
      request?: AuthenticatedRequest;
    }
  ): Promise<CustomerRecord> {
    const { userId, request } = context;

    return await trackOperation(
      {
        name: 'update_customer',
        description: 'Update customer with PII encryption',
        businessId,
        userId,
        resource: { type: 'customer', id: customerId },
        requiresAudit: true,
      },
      request!,
      async () => {
        // Validate duplicate contacts if email/phone is being updated
        if (updates.email || updates.phone) {
          await this.checkForDuplicates(businessId, updates.email, updates.phone, customerId);
        }

        // Update customer with encryption
        const customer = await this.encryptionService.updateCustomer(
          customerId,
          businessId,
          updates,
          {
            userId,
            auditContext: {
              endpoint: request?.url,
              method: request?.method,
              ip: request?.ip,
            },
          }
        );

        // Track data modification
        if (request) {
          await auditDataAccess(
            request,
            {
              type: 'customer',
              id: customer.id,
              name: `${customer.firstName} ${customer.lastName}`,
              sensitive: true,
            },
            'write',
            {
              operation: 'update',
              fieldsUpdated: Object.keys(updates),
            }
          );
        }

        return customer;
      }
    );
  }

  /**
   * Delete customer (soft delete)
   */
  async deleteCustomer(
    customerId: string,
    businessId: string,
    context: {
      userId: string;
      request?: AuthenticatedRequest;
    }
  ): Promise<void> {
    const { userId, request } = context;

    await trackOperation(
      {
        name: 'delete_customer',
        description: 'Soft delete customer',
        businessId,
        userId,
        resource: { type: 'customer', id: customerId },
        requiresAudit: true,
      },
      request!,
      async () => {
        // Get customer info for audit before deletion
        const customer = await this.encryptionService.getCustomerById(
          customerId,
          businessId,
          { decrypt: false } // Don't decrypt for deletion
        );

        if (!customer) {
          throw new Error('Customer not found');
        }

        // Check for active campaigns
        const activeCampaigns = await prisma.reviewRequest.count({
          where: {
            customerId,
            isActive: true,
            status: {
              in: ['QUEUED', 'SENT', 'DELIVERED'],
            },
          },
        });

        if (activeCampaigns > 0) {
          throw new Error(`Cannot delete customer with ${activeCampaigns} active campaigns`);
        }

        // Soft delete customer
        await prisma.customer.update({
          where: { id: customerId },
          data: {
            isActive: false,
            updatedAt: new Date(),
          },
        });

        // Track deletion
        if (request) {
          await auditDataAccess(
            request,
            {
              type: 'customer',
              id: customerId,
              name: `${customer.firstName} ${customer.lastName}`,
              sensitive: true,
            },
            'delete',
            {
              operation: 'soft_delete',
              activeCampaigns,
            }
          );
        }

        logger.info('Customer soft deleted', {
          customerId,
          businessId,
          userId,
        });
      }
    );
  }

  /**
   * Get customers for messaging (always decrypted)
   */
  async getCustomersForMessaging(
    businessId: string,
    customerIds: string[],
    context: {
      userId: string;
      request?: AuthenticatedRequest;
    }
  ): Promise<
    Array<{
      id: string;
      firstName?: string;
      lastName?: string;
      email?: string;
      phone?: string;
    }>
  > {
    const customers = await this.encryptionService.getCustomersForMessaging(
      businessId,
      customerIds
    );

    // Track bulk PII access for messaging
    if (context.request) {
      await auditDataAccess(
        context.request,
        {
          type: 'customer',
          id: 'messaging_batch',
          name: `${customers.length} customers for messaging`,
          sensitive: true,
        },
        'read',
        {
          purpose: 'messaging',
          customerCount: customers.length,
          bulkOperation: true,
          decrypted: true,
        }
      );
    }

    return customers;
  }

  /**
   * Import customers from CSV with encryption
   */
  async importCustomers(
    businessId: string,
    customerData: CustomerCreateInput[],
    context: {
      userId: string;
      request?: AuthenticatedRequest;
      skipDuplicates?: boolean;
    }
  ): Promise<{
    created: CustomerRecord[];
    skipped: Array<{ index: number; reason: string; data: CustomerCreateInput }>;
    errors: Array<{ index: number; error: string; data: CustomerCreateInput }>;
  }> {
    const { userId, request, skipDuplicates = true } = context;

    return await trackOperation(
      {
        name: 'import_customers',
        description: `Import ${customerData.length} customers with encryption`,
        businessId,
        userId,
        requiresAudit: true,
      },
      request!,
      async () => {
        const result = {
          created: [] as CustomerRecord[],
          skipped: [] as Array<{ index: number; reason: string; data: CustomerCreateInput }>,
          errors: [] as Array<{ index: number; error: string; data: CustomerCreateInput }>,
        };

        // Process customers in batches to manage performance
        const batchSize = 50;
        for (let i = 0; i < customerData.length; i += batchSize) {
          const batch = customerData.slice(i, i + batchSize);

          await Promise.all(
            batch.map(async (customer, batchIndex) => {
              const globalIndex = i + batchIndex;

              try {
                // Check for duplicates
                if (skipDuplicates && (customer.email || customer.phone)) {
                  const duplicate = await this.checkForDuplicates(
                    businessId,
                    customer.email,
                    customer.phone,
                    undefined,
                    true // return boolean instead of throwing
                  );

                  if (duplicate) {
                    result.skipped.push({
                      index: globalIndex,
                      reason: 'Duplicate email or phone',
                      data: customer,
                    });
                    return;
                  }
                }

                // Create customer
                const createdCustomer = await this.encryptionService.createCustomer(
                  businessId,
                  customer,
                  {
                    userId,
                    auditContext: {
                      operation: 'bulk_import',
                      batchIndex: globalIndex,
                    },
                  }
                );

                result.created.push(createdCustomer);
              } catch (error) {
                result.errors.push({
                  index: globalIndex,
                  error: error instanceof Error ? error.message : String(error),
                  data: customer,
                });
              }
            })
          );
        }

        // Track bulk import
        if (request) {
          await auditDataAccess(
            request,
            {
              type: 'customer',
              id: 'bulk_import',
              name: `${result.created.length} customers imported`,
              sensitive: true,
            },
            'write',
            {
              operation: 'bulk_import',
              totalAttempted: customerData.length,
              created: result.created.length,
              skipped: result.skipped.length,
              errors: result.errors.length,
            }
          );
        }

        logger.info('Customer bulk import completed', {
          businessId,
          userId,
          totalAttempted: customerData.length,
          created: result.created.length,
          skipped: result.skipped.length,
          errors: result.errors.length,
        });

        return result;
      }
    );
  }

  /**
   * Export customers for GDPR or data export
   */
  async exportCustomers(
    businessId: string,
    options: {
      customerIds?: string[];
      includeInactive?: boolean;
      decrypt?: boolean;
    },
    context: {
      userId: string;
      request?: AuthenticatedRequest;
    }
  ): Promise<CustomerRecord[]> {
    const { customerIds, includeInactive = false, decrypt = true } = options;
    const { userId, request } = context;

    return await trackOperation(
      {
        name: 'export_customers',
        description: 'Export customer data with encryption support',
        businessId,
        userId,
        requiresAudit: true,
      },
      request!,
      async () => {
        // Build query
        const where: any = { businessId };
        if (customerIds) {
          where.id = { in: customerIds };
        }
        if (!includeInactive) {
          where.isActive = true;
        }

        // Get customers from database
        const dbCustomers = await prisma.customer.findMany({
          where,
          orderBy: { createdAt: 'desc' },
        });

        // Convert to public format with optional decryption
        const customers = await Promise.all(
          dbCustomers.map(async dbCustomer => {
            if (decrypt) {
              return await this.encryptionService.getCustomerById(dbCustomer.id, businessId, {
                decrypt: true,
              });
            } else {
              // Return without decryption for performance
              return {
                id: dbCustomer.id,
                businessId: dbCustomer.businessId,
                firstName: null,
                lastName: null,
                email: null,
                phone: null,
                address: dbCustomer.address,
                notes: dbCustomer.notes,
                tags: dbCustomer.tags,
                lastContact: dbCustomer.lastContact,
                isActive: dbCustomer.isActive,
                createdAt: dbCustomer.createdAt,
                updatedAt: dbCustomer.updatedAt,
              } as CustomerRecord;
            }
          })
        );

        // Filter out null results
        const validCustomers = customers.filter(Boolean) as CustomerRecord[];

        // Track data export
        if (request) {
          await auditDataAccess(
            request,
            {
              type: 'customer',
              id: 'data_export',
              name: `${validCustomers.length} customers exported`,
              sensitive: decrypt,
            },
            'read',
            {
              operation: 'bulk_export',
              exported: validCustomers.length,
              decrypted: decrypt,
              includeInactive,
            }
          );
        }

        return validCustomers;
      }
    );
  }

  /**
   * Get encryption service performance metrics
   */
  getPerformanceMetrics(): {
    encryption: ReturnType<typeof this.encryptionService.getPerformanceMetrics>;
  } {
    return {
      encryption: this.encryptionService.getPerformanceMetrics(),
    };
  }

  // ==========================================
  // PRIVATE HELPER METHODS
  // ==========================================

  /**
   * Check for duplicate customers
   */
  private async checkForDuplicates(
    businessId: string,
    email?: string,
    phone?: string,
    excludeCustomerId?: string,
    returnBoolean = false
  ): Promise<boolean> {
    if (!email && !phone) {
      return false;
    }

    // Search for existing customers with same email or phone
    const searchOptions: CustomerSearchOptions = {
      status: 'active',
    };

    let duplicateFound = false;

    // Check email duplicates
    if (email) {
      searchOptions.email = email;
      const emailResult = await this.encryptionService.searchCustomers(businessId, {
        ...searchOptions,
        limit: 1,
      });

      if (emailResult.customers.length > 0) {
        const duplicate = emailResult.customers[0];
        if (duplicate.id !== excludeCustomerId) {
          duplicateFound = true;
          if (!returnBoolean) {
            throw new Error(`Customer with email ${email} already exists`);
          }
        }
      }
    }

    // Check phone duplicates
    if (phone && !duplicateFound) {
      searchOptions.phone = phone;
      searchOptions.email = undefined;
      const phoneResult = await this.encryptionService.searchCustomers(businessId, {
        ...searchOptions,
        limit: 1,
      });

      if (phoneResult.customers.length > 0) {
        const duplicate = phoneResult.customers[0];
        if (duplicate.id !== excludeCustomerId) {
          duplicateFound = true;
          if (!returnBoolean) {
            throw new Error(`Customer with phone ${phone} already exists`);
          }
        }
      }
    }

    return duplicateFound;
  }
}

// ==========================================
// SINGLETON INSTANCE
// ==========================================

let globalEncryptedCustomerService: EncryptedCustomerService | null = null;

/**
 * Get global encrypted customer service instance
 */
export function getEncryptedCustomerService(): EncryptedCustomerService {
  if (!globalEncryptedCustomerService) {
    globalEncryptedCustomerService = new EncryptedCustomerService();
  }
  return globalEncryptedCustomerService;
}

/**
 * Create encrypted customer service instance
 */
export function createEncryptedCustomerService(): EncryptedCustomerService {
  return new EncryptedCustomerService();
}
