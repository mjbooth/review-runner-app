/**
 * Searchable Encryption Service
 *
 * Provides encrypted field management with searchable hash generation
 * for exact and partial matching while maintaining data security.
 */

import crypto from 'crypto';
import { getEncryptionService, type EncryptedField, type EncryptionResult } from './encryption';
import { logger } from './logger';
import { auditLog } from './audit-logger';

// ==========================================
// SEARCHABLE ENCRYPTION TYPES
// ==========================================

export interface SearchableEncryptedData {
  /** Encrypted PII data */
  encrypted: EncryptedField;
  /** Hash for exact matching */
  searchHash: string;
  /** Tokens for partial matching */
  searchTokens?: string[];
  /** Combined hash for multi-field searches */
  combinedHash?: string;
}

export interface FieldEncryptionConfig {
  /** Field name */
  name: string;
  /** Whether to generate search tokens for partial matching */
  enablePartialSearch?: boolean;
  /** Whether to include in combined hash */
  includeCombined?: boolean;
  /** Custom tokenization strategy */
  tokenizer?: (value: string) => string[];
  /** Search optimization settings */
  searchConfig?: {
    minTokenLength?: number;
    maxTokens?: number;
    caseSensitive?: boolean;
  };
}

export interface CustomerPIIData {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
}

export interface EncryptedCustomerPII {
  firstNameEncrypted?: SearchableEncryptedData;
  lastNameEncrypted?: SearchableEncryptedData;
  emailEncrypted?: SearchableEncryptedData;
  phoneEncrypted?: SearchableEncryptedData;

  // Search hashes for database indexing
  emailSearchHash?: string;
  phoneSearchHash?: string;
  firstNameSearchHash?: string;
  lastNameSearchHash?: string;
  fullNameSearchHash?: string;
}

export interface SearchQuery {
  /** Exact match queries */
  exact?: {
    email?: string;
    phone?: string;
    firstName?: string;
    lastName?: string;
    fullName?: string;
  };
  /** Partial match queries */
  partial?: {
    name?: string;
    email?: string;
  };
}

// ==========================================
// FIELD ENCRYPTION CONFIGURATIONS
// ==========================================

const FIELD_CONFIGS: Record<string, FieldEncryptionConfig> = {
  firstName: {
    name: 'firstName',
    enablePartialSearch: true,
    includeCombined: true,
    searchConfig: {
      minTokenLength: 2,
      maxTokens: 10,
      caseSensitive: false,
    },
  },
  lastName: {
    name: 'lastName',
    enablePartialSearch: true,
    includeCombined: true,
    searchConfig: {
      minTokenLength: 2,
      maxTokens: 10,
      caseSensitive: false,
    },
  },
  email: {
    name: 'email',
    enablePartialSearch: true,
    includeCombined: false,
    tokenizer: (email: string) => {
      // Custom email tokenization: split by @ and .
      const [localPart, domain] = email.toLowerCase().split('@');
      const tokens = [localPart];
      if (domain) {
        tokens.push(domain);
        // Add domain parts
        domain.split('.').forEach(part => {
          if (part.length >= 2) tokens.push(part);
        });
      }
      return tokens;
    },
    searchConfig: {
      minTokenLength: 2,
      maxTokens: 15,
      caseSensitive: false,
    },
  },
  phone: {
    name: 'phone',
    enablePartialSearch: false, // Phone numbers are exact match only
    includeCombined: false,
    searchConfig: {
      caseSensitive: false,
    },
  },
};

// ==========================================
// SEARCHABLE ENCRYPTION SERVICE
// ==========================================

export class SearchableEncryptionService {
  private encryptionService = getEncryptionService();

  /**
   * Encrypt a single field with search capabilities
   */
  async encryptField(
    value: string,
    fieldName: string,
    context?: {
      businessId?: string;
      customerId?: string;
    }
  ): Promise<SearchableEncryptedData> {
    if (!value || value.trim() === '') {
      throw new Error(`Cannot encrypt empty ${fieldName}`);
    }

    const config = FIELD_CONFIGS[fieldName];
    if (!config) {
      throw new Error(`No encryption configuration found for field: ${fieldName}`);
    }

    try {
      // Encrypt the data
      const encryptionResult = await this.encryptionService.encrypt(value, {
        fieldName,
        businessId: context?.businessId,
        customerId: context?.customerId,
      });

      // Generate search tokens if enabled
      let searchTokens: string[] | undefined;
      if (config.enablePartialSearch) {
        searchTokens = this.generateSearchTokens(value, config);
      }

      const result: SearchableEncryptedData = {
        encrypted: encryptionResult.encrypted,
        searchHash: encryptionResult.searchHash,
        searchTokens,
      };

      logger.debug('Field encrypted with search capabilities', {
        fieldName,
        hasPartialSearch: !!searchTokens,
        tokenCount: searchTokens?.length || 0,
        businessId: context?.businessId,
        customerId: context?.customerId,
      });

      return result;
    } catch (error) {
      logger.error('Field encryption failed', {
        fieldName,
        error: error instanceof Error ? error.message : String(error),
        businessId: context?.businessId,
        customerId: context?.customerId,
      });
      throw error;
    }
  }

  /**
   * Decrypt a searchable encrypted field
   */
  async decryptField(
    encryptedData: SearchableEncryptedData,
    fieldName: string,
    context?: {
      businessId?: string;
      customerId?: string;
    }
  ): Promise<string> {
    try {
      const decryptionResult = await this.encryptionService.decrypt(encryptedData.encrypted, {
        fieldName,
        businessId: context?.businessId,
        customerId: context?.customerId,
      });

      return decryptionResult.plaintext;
    } catch (error) {
      logger.error('Field decryption failed', {
        fieldName,
        error: error instanceof Error ? error.message : String(error),
        businessId: context?.businessId,
        customerId: context?.customerId,
      });
      throw error;
    }
  }

  /**
   * Encrypt complete customer PII data
   */
  async encryptCustomerPII(
    data: CustomerPIIData,
    context: {
      businessId: string;
      customerId: string;
    }
  ): Promise<EncryptedCustomerPII> {
    const result: EncryptedCustomerPII = {};

    try {
      // Encrypt individual fields
      if (data.firstName) {
        result.firstNameEncrypted = await this.encryptField(data.firstName, 'firstName', context);
        result.firstNameSearchHash = result.firstNameEncrypted.searchHash;
      }

      if (data.lastName) {
        result.lastNameEncrypted = await this.encryptField(data.lastName, 'lastName', context);
        result.lastNameSearchHash = result.lastNameEncrypted.searchHash;
      }

      if (data.email) {
        result.emailEncrypted = await this.encryptField(data.email, 'email', context);
        result.emailSearchHash = result.emailEncrypted.searchHash;
      }

      if (data.phone) {
        result.phoneEncrypted = await this.encryptField(data.phone, 'phone', context);
        result.phoneSearchHash = result.phoneEncrypted.searchHash;
      }

      // Generate combined full name hash
      if (data.firstName && data.lastName) {
        result.fullNameSearchHash = this.generateCombinedHash([data.firstName, data.lastName]);
      } else if (data.firstName) {
        result.fullNameSearchHash = this.generateCombinedHash([data.firstName]);
      }

      // Audit customer PII encryption
      await auditLog({
        category: 'data_modification',
        type: 'DATA_CREATED',
        severity: 'medium',
        description: 'Customer PII encrypted',
        businessId: context.businessId,
        metadata: {
          customerId: context.customerId,
          fieldsEncrypted: Object.keys(data),
          hasFullNameSearch: !!result.fullNameSearchHash,
        },
        flags: {
          personalData: true,
          complianceRelevant: true,
        },
      });

      logger.info('Customer PII encrypted successfully', {
        customerId: context.customerId,
        businessId: context.businessId,
        fieldsEncrypted: Object.keys(data),
      });

      return result;
    } catch (error) {
      logger.error('Customer PII encryption failed', {
        customerId: context.customerId,
        businessId: context.businessId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Decrypt complete customer PII data
   */
  async decryptCustomerPII(
    encryptedData: EncryptedCustomerPII,
    context: {
      businessId: string;
      customerId: string;
    }
  ): Promise<CustomerPIIData> {
    const result: CustomerPIIData = {};

    try {
      if (encryptedData.firstNameEncrypted) {
        result.firstName = await this.decryptField(
          encryptedData.firstNameEncrypted,
          'firstName',
          context
        );
      }

      if (encryptedData.lastNameEncrypted) {
        result.lastName = await this.decryptField(
          encryptedData.lastNameEncrypted,
          'lastName',
          context
        );
      }

      if (encryptedData.emailEncrypted) {
        result.email = await this.decryptField(encryptedData.emailEncrypted, 'email', context);
      }

      if (encryptedData.phoneEncrypted) {
        result.phone = await this.decryptField(encryptedData.phoneEncrypted, 'phone', context);
      }

      // Audit customer PII decryption
      await auditLog({
        category: 'data_access',
        type: 'DATA_READ',
        severity: 'medium',
        description: 'Customer PII decrypted',
        businessId: context.businessId,
        metadata: {
          customerId: context.customerId,
          fieldsDecrypted: Object.keys(result),
        },
        flags: {
          personalData: true,
          complianceRelevant: true,
        },
      });

      logger.debug('Customer PII decrypted successfully', {
        customerId: context.customerId,
        businessId: context.businessId,
        fieldsDecrypted: Object.keys(result),
      });

      return result;
    } catch (error) {
      logger.error('Customer PII decryption failed', {
        customerId: context.customerId,
        businessId: context.businessId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Generate search hashes for query matching
   */
  generateSearchHashes(query: SearchQuery): {
    emailHash?: string;
    phoneHash?: string;
    firstNameHash?: string;
    lastNameHash?: string;
    fullNameHash?: string;
  } {
    const hashes: any = {};

    if (query.exact?.email) {
      hashes.emailHash = this.encryptionService.generateSearchHash(
        query.exact.email.toLowerCase().trim()
      );
    }

    if (query.exact?.phone) {
      // Normalize phone number
      const normalizedPhone = this.normalizePhoneNumber(query.exact.phone);
      hashes.phoneHash = this.encryptionService.generateSearchHash(normalizedPhone);
    }

    if (query.exact?.firstName) {
      hashes.firstNameHash = this.encryptionService.generateSearchHash(
        query.exact.firstName.toLowerCase().trim()
      );
    }

    if (query.exact?.lastName) {
      hashes.lastNameHash = this.encryptionService.generateSearchHash(
        query.exact.lastName.toLowerCase().trim()
      );
    }

    if (query.exact?.fullName) {
      hashes.fullNameHash = this.generateCombinedHash(
        query.exact.fullName.toLowerCase().trim().split(/\s+/)
      );
    }

    return hashes;
  }

  /**
   * Generate search tokens for partial matching
   */
  private generateSearchTokens(value: string, config: FieldEncryptionConfig): string[] {
    const { searchConfig = {}, tokenizer } = config;
    const { minTokenLength = 2, maxTokens = 20, caseSensitive = false } = searchConfig;

    let normalizedValue = caseSensitive ? value : value.toLowerCase();
    normalizedValue = normalizedValue.trim();

    // Use custom tokenizer if provided
    if (tokenizer) {
      return tokenizer(normalizedValue)
        .filter(token => token.length >= minTokenLength)
        .slice(0, maxTokens);
    }

    // Default tokenization strategy
    const tokens = new Set<string>();

    // Word-based tokens
    normalizedValue.split(/\s+/).forEach(word => {
      if (word.length >= minTokenLength) {
        tokens.add(word);

        // Add prefixes for partial matching
        for (let i = minTokenLength; i <= word.length; i++) {
          tokens.add(word.substring(0, i));
        }
      }
    });

    // Character n-grams for fuzzy matching
    if (normalizedValue.length >= minTokenLength) {
      for (let i = 0; i <= normalizedValue.length - minTokenLength; i++) {
        for (let j = i + minTokenLength; j <= normalizedValue.length && j <= i + 6; j++) {
          tokens.add(normalizedValue.substring(i, j));
        }
      }
    }

    return Array.from(tokens).slice(0, maxTokens);
  }

  /**
   * Generate combined hash for multi-field searches
   */
  private generateCombinedHash(values: string[]): string {
    const combinedValue = values
      .map(v => v.toLowerCase().trim())
      .filter(v => v.length > 0)
      .sort()
      .join('|');

    return this.encryptionService.generateSearchHash(combinedValue);
  }

  /**
   * Normalize phone number for consistent searching
   */
  private normalizePhoneNumber(phone: string): string {
    // Remove all non-digit characters
    let normalized = phone.replace(/\D/g, '');

    // Handle UK numbers
    if (normalized.startsWith('44')) {
      // Already international format
      return normalized;
    } else if (normalized.startsWith('0')) {
      // Domestic UK number - convert to international
      return '44' + normalized.substring(1);
    } else if (normalized.length === 10) {
      // Assume UK mobile without leading 0
      return '447' + normalized.substring(1);
    }

    return normalized;
  }

  /**
   * Batch encrypt multiple customer records
   */
  async batchEncryptCustomers(
    customers: Array<{
      id: string;
      businessId: string;
      data: CustomerPIIData;
    }>
  ): Promise<Array<{ id: string; encrypted: EncryptedCustomerPII }>> {
    const results: Array<{ id: string; encrypted: EncryptedCustomerPII }> = [];

    for (const customer of customers) {
      try {
        const encrypted = await this.encryptCustomerPII(customer.data, {
          businessId: customer.businessId,
          customerId: customer.id,
        });

        results.push({
          id: customer.id,
          encrypted,
        });
      } catch (error) {
        logger.error('Batch encryption failed for customer', {
          customerId: customer.id,
          businessId: customer.businessId,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    }

    logger.info('Batch customer encryption completed', {
      processedCount: results.length,
      totalCount: customers.length,
    });

    return results;
  }

  /**
   * Batch decrypt multiple customer records
   */
  async batchDecryptCustomers(
    customers: Array<{
      id: string;
      businessId: string;
      encrypted: EncryptedCustomerPII;
    }>
  ): Promise<Array<{ id: string; data: CustomerPIIData }>> {
    const results: Array<{ id: string; data: CustomerPIIData }> = [];

    for (const customer of customers) {
      try {
        const data = await this.decryptCustomerPII(customer.encrypted, {
          businessId: customer.businessId,
          customerId: customer.id,
        });

        results.push({
          id: customer.id,
          data,
        });
      } catch (error) {
        logger.error('Batch decryption failed for customer', {
          customerId: customer.id,
          businessId: customer.businessId,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    }

    logger.debug('Batch customer decryption completed', {
      processedCount: results.length,
      totalCount: customers.length,
    });

    return results;
  }

  /**
   * Validate encrypted field integrity
   */
  async validateEncryptedField(
    encryptedData: SearchableEncryptedData,
    fieldName: string
  ): Promise<{
    isValid: boolean;
    errors: string[];
  }> {
    const errors: string[] = [];

    try {
      // Validate encrypted field structure
      if (!encryptedData.encrypted?.encryptedData) {
        errors.push('Missing encrypted data');
      }
      if (!encryptedData.encrypted?.iv) {
        errors.push('Missing initialization vector');
      }
      if (!encryptedData.encrypted?.tag) {
        errors.push('Missing authentication tag');
      }
      if (!encryptedData.encrypted?.salt) {
        errors.push('Missing salt');
      }
      if (!encryptedData.searchHash) {
        errors.push('Missing search hash');
      }

      // Validate field configuration
      const config = FIELD_CONFIGS[fieldName];
      if (!config) {
        errors.push(`Unknown field configuration: ${fieldName}`);
      }

      // Try to decrypt to validate integrity
      if (errors.length === 0) {
        try {
          await this.encryptionService.decrypt(encryptedData.encrypted);
        } catch (decryptError) {
          errors.push(
            `Decryption validation failed: ${decryptError instanceof Error ? decryptError.message : 'Unknown error'}`
          );
        }
      }
    } catch (error) {
      errors.push(`Validation error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }
}

// ==========================================
// SINGLETON INSTANCE
// ==========================================

let globalSearchableEncryptionService: SearchableEncryptionService | null = null;

/**
 * Get global searchable encryption service instance
 */
export function getSearchableEncryptionService(): SearchableEncryptionService {
  if (!globalSearchableEncryptionService) {
    globalSearchableEncryptionService = new SearchableEncryptionService();
  }
  return globalSearchableEncryptionService;
}

/**
 * Cleanup searchable encryption service
 */
export function cleanupSearchableEncryptionService(): void {
  if (globalSearchableEncryptionService) {
    globalSearchableEncryptionService = null;
  }
}
