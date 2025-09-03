/**
 * PII Encryption System
 *
 * AES-256-GCM encryption for customer PII data with searchable encryption,
 * secure key management, rotation support, and performance optimization.
 */

import crypto from 'crypto';
import { logger } from './logger';
import { auditLog } from './audit-logger';

// ==========================================
// ENCRYPTION CONFIGURATION
// ==========================================

const ENCRYPTION_CONFIG = {
  algorithm: 'aes-256-gcm' as const,
  keyLength: 32, // 256 bits
  ivLength: 12, // 96 bits for GCM
  saltLength: 16, // 128 bits
  tagLength: 16, // 128 bits
  keyDerivationIterations: 100000, // PBKDF2 iterations

  // Search hash configuration
  searchHashAlgorithm: 'sha256' as const,
  searchHashIterations: 10000,

  // Cache configuration
  decryptionCacheTTL: 300000, // 5 minutes
  maxCacheSize: 1000,
};

// ==========================================
// ENCRYPTION TYPES
// ==========================================

export interface EncryptedField {
  /** Base64 encoded encrypted data */
  encryptedData: string;
  /** Base64 encoded initialization vector */
  iv: string;
  /** Base64 encoded authentication tag */
  tag: string;
  /** Base64 encoded salt for key derivation */
  salt: string;
  /** Key version for rotation support */
  keyVersion: number;
  /** Timestamp when encrypted */
  encryptedAt: Date;
}

export interface SearchableEncryptedField extends EncryptedField {
  /** Hash for exact matching searches */
  searchHash: string;
  /** Tokenized version for partial searches (if applicable) */
  searchTokens?: string[];
}

export interface EncryptionResult {
  /** Full encrypted field data */
  encrypted: SearchableEncryptedField;
  /** Search hash for indexing */
  searchHash: string;
  /** Original data length for audit */
  originalLength: number;
}

export interface DecryptionResult {
  /** Decrypted plaintext data */
  plaintext: string;
  /** Metadata about the encrypted field */
  metadata: {
    keyVersion: number;
    encryptedAt: Date;
    algorithm: string;
  };
}

export interface EncryptionMetrics {
  totalEncryptions: number;
  totalDecryptions: number;
  cacheHits: number;
  cacheMisses: number;
  keyRotations: number;
  errors: number;
  averageEncryptionTime: number;
  averageDecryptionTime: number;
}

// ==========================================
// KEY MANAGEMENT
// ==========================================

class EncryptionKeyManager {
  private currentKeyVersion: number = 1;
  private keys: Map<number, Buffer> = new Map();
  private masterKey: Buffer;

  constructor() {
    this.masterKey = this.deriveMasterKey();
    this.initializeKeys();
  }

  /**
   * Derive master key from environment variables
   */
  private deriveMasterKey(): Buffer {
    const passphrase = process.env.ENCRYPTION_PASSPHRASE;
    const keyId = process.env.ENCRYPTION_KEY_ID || 'review-runner-v1';

    if (!passphrase) {
      throw new Error('ENCRYPTION_PASSPHRASE environment variable is required');
    }

    if (passphrase.length < 32) {
      throw new Error('ENCRYPTION_PASSPHRASE must be at least 32 characters');
    }

    // Use PBKDF2 to derive a consistent key from passphrase
    const salt = crypto.createHash('sha256').update(keyId).digest();
    return crypto.pbkdf2Sync(
      passphrase,
      salt,
      ENCRYPTION_CONFIG.keyDerivationIterations,
      ENCRYPTION_CONFIG.keyLength,
      'sha256'
    );
  }

  /**
   * Initialize encryption keys for current version
   */
  private initializeKeys(): void {
    // Generate current key from master key
    const keyVersionBuffer = Buffer.alloc(4);
    keyVersionBuffer.writeUInt32BE(this.currentKeyVersion, 0);

    const currentKey = crypto
      .createHmac('sha256', this.masterKey)
      .update(keyVersionBuffer)
      .digest();

    this.keys.set(this.currentKeyVersion, currentKey);

    logger.info('Encryption keys initialized', {
      currentVersion: this.currentKeyVersion,
      availableVersions: Array.from(this.keys.keys()),
    });
  }

  /**
   * Get encryption key for specific version
   */
  getKey(version: number): Buffer {
    let key = this.keys.get(version);

    if (!key) {
      // Generate key for older version on demand
      const keyVersionBuffer = Buffer.alloc(4);
      keyVersionBuffer.writeUInt32BE(version, 0);

      key = crypto.createHmac('sha256', this.masterKey).update(keyVersionBuffer).digest();

      this.keys.set(version, key);

      logger.info('Generated key for version', { version });
    }

    return key;
  }

  /**
   * Get current key version
   */
  getCurrentVersion(): number {
    return this.currentKeyVersion;
  }

  /**
   * Rotate to new key version
   */
  async rotateKey(): Promise<number> {
    const oldVersion = this.currentKeyVersion;
    this.currentKeyVersion += 1;

    // Generate new key
    const keyVersionBuffer = Buffer.alloc(4);
    keyVersionBuffer.writeUInt32BE(this.currentKeyVersion, 0);

    const newKey = crypto.createHmac('sha256', this.masterKey).update(keyVersionBuffer).digest();

    this.keys.set(this.currentKeyVersion, newKey);

    // Audit key rotation
    await auditLog({
      category: 'security_event',
      type: 'SYSTEM_EVENT',
      severity: 'medium',
      description: `Encryption key rotated from version ${oldVersion} to ${this.currentKeyVersion}`,
      metadata: {
        oldKeyVersion: oldVersion,
        newKeyVersion: this.currentKeyVersion,
        rotationReason: 'manual',
      },
      flags: {
        requiresReview: true,
      },
    });

    logger.warn('Encryption key rotated', {
      oldVersion,
      newVersion: this.currentKeyVersion,
    });

    return this.currentKeyVersion;
  }

  /**
   * Clear old keys (for security)
   */
  clearOldKeys(retainVersions: number = 2): void {
    const versionsToKeep = Array.from(
      { length: retainVersions },
      (_, i) => this.currentKeyVersion - i
    ).filter(v => v > 0);

    for (const [version, key] of this.keys.entries()) {
      if (!versionsToKeep.includes(version)) {
        // Securely clear the key
        key.fill(0);
        this.keys.delete(version);

        logger.info('Cleared old encryption key', { version });
      }
    }
  }
}

// ==========================================
// DECRYPTION CACHE
// ==========================================

interface CacheEntry {
  plaintext: string;
  timestamp: number;
  accessCount: number;
}

class DecryptionCache {
  private cache: Map<string, CacheEntry> = new Map();
  private metrics = {
    hits: 0,
    misses: 0,
    evictions: 0,
  };

  /**
   * Generate cache key from encrypted field
   */
  private getCacheKey(encrypted: EncryptedField): string {
    return crypto
      .createHash('sha256')
      .update(encrypted.encryptedData + encrypted.iv + encrypted.tag)
      .digest('hex');
  }

  /**
   * Get cached plaintext
   */
  get(encrypted: EncryptedField): string | null {
    const key = this.getCacheKey(encrypted);
    const entry = this.cache.get(key);

    if (!entry) {
      this.metrics.misses++;
      return null;
    }

    // Check TTL
    if (Date.now() - entry.timestamp > ENCRYPTION_CONFIG.decryptionCacheTTL) {
      this.cache.delete(key);
      this.metrics.misses++;
      return null;
    }

    entry.accessCount++;
    this.metrics.hits++;
    return entry.plaintext;
  }

  /**
   * Cache decrypted plaintext
   */
  set(encrypted: EncryptedField, plaintext: string): void {
    // Evict oldest entries if cache is full
    if (this.cache.size >= ENCRYPTION_CONFIG.maxCacheSize) {
      this.evictLeastRecentlyUsed();
    }

    const key = this.getCacheKey(encrypted);
    this.cache.set(key, {
      plaintext,
      timestamp: Date.now(),
      accessCount: 1,
    });
  }

  /**
   * Clear cache (for security)
   */
  clear(): void {
    // Securely clear plaintext data
    for (const entry of this.cache.values()) {
      if (typeof entry.plaintext === 'string') {
        // Clear string content (best effort in JavaScript)
        (entry as any).plaintext = '\0'.repeat(entry.plaintext.length);
      }
    }
    this.cache.clear();

    logger.debug('Decryption cache cleared');
  }

  /**
   * Get cache metrics
   */
  getMetrics(): { hits: number; misses: number; size: number; hitRate: number } {
    const total = this.metrics.hits + this.metrics.misses;
    return {
      hits: this.metrics.hits,
      misses: this.metrics.misses,
      size: this.cache.size,
      hitRate: total > 0 ? this.metrics.hits / total : 0,
    };
  }

  /**
   * Evict least recently used entries
   */
  private evictLeastRecentlyUsed(): void {
    let oldestKey: string | null = null;
    let oldestTimestamp = Date.now();

    for (const [key, entry] of this.cache.entries()) {
      if (entry.timestamp < oldestTimestamp) {
        oldestTimestamp = entry.timestamp;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
      this.metrics.evictions++;
    }
  }
}

// ==========================================
// CORE ENCRYPTION SERVICE
// ==========================================

export class PIIEncryptionService {
  private keyManager: EncryptionKeyManager;
  private cache: DecryptionCache;
  private metrics: EncryptionMetrics;

  constructor() {
    this.keyManager = new EncryptionKeyManager();
    this.cache = new DecryptionCache();
    this.metrics = {
      totalEncryptions: 0,
      totalDecryptions: 0,
      cacheHits: 0,
      cacheMisses: 0,
      keyRotations: 0,
      errors: 0,
      averageEncryptionTime: 0,
      averageDecryptionTime: 0,
    };

    logger.info('PII Encryption Service initialized', {
      algorithm: ENCRYPTION_CONFIG.algorithm,
      keyVersion: this.keyManager.getCurrentVersion(),
    });
  }

  /**
   * Encrypt plaintext data with searchable hash
   */
  async encrypt(
    plaintext: string,
    context?: {
      fieldName?: string;
      businessId?: string;
      customerId?: string;
    }
  ): Promise<EncryptionResult> {
    const startTime = Date.now();

    try {
      if (!plaintext || plaintext.length === 0) {
        throw new Error('Cannot encrypt empty or null data');
      }

      // Generate cryptographically random salt and IV
      const salt = crypto.randomBytes(ENCRYPTION_CONFIG.saltLength);
      const iv = crypto.randomBytes(ENCRYPTION_CONFIG.ivLength);

      // Get current encryption key
      const keyVersion = this.keyManager.getCurrentVersion();
      const key = this.keyManager.getKey(keyVersion);

      // Create cipher
      const cipher = crypto.createCipher(ENCRYPTION_CONFIG.algorithm, key);
      cipher.setAutoPadding(true);

      // Encrypt data
      let encrypted = cipher.update(plaintext, 'utf8');
      encrypted = Buffer.concat([encrypted, cipher.final()]);

      // Get authentication tag
      const tag = cipher.getAuthTag();

      // Generate search hash
      const searchHash = this.generateSearchHash(plaintext, salt);

      // Create encrypted field
      const encryptedField: SearchableEncryptedField = {
        encryptedData: encrypted.toString('base64'),
        iv: iv.toString('base64'),
        tag: tag.toString('base64'),
        salt: salt.toString('base64'),
        keyVersion,
        encryptedAt: new Date(),
        searchHash,
      };

      const duration = Date.now() - startTime;
      this.updateMetrics('encryption', duration);

      // Audit encryption event
      if (context) {
        await auditLog({
          category: 'data_modification',
          type: 'DATA_CREATED',
          severity: 'low',
          description: `PII field ${context.fieldName || 'unknown'} encrypted`,
          businessId: context.businessId,
          metadata: {
            fieldName: context.fieldName,
            customerId: context.customerId,
            keyVersion,
            dataLength: plaintext.length,
            encryptionDuration: duration,
          },
          flags: {
            personalData: true,
          },
        });
      }

      logger.debug('PII data encrypted', {
        fieldName: context?.fieldName,
        keyVersion,
        dataLength: plaintext.length,
        duration,
      });

      return {
        encrypted: encryptedField,
        searchHash,
        originalLength: plaintext.length,
      };
    } catch (error) {
      this.metrics.errors++;

      logger.error('PII encryption failed', {
        error: error instanceof Error ? error.message : String(error),
        fieldName: context?.fieldName,
        dataLength: plaintext?.length || 0,
      });

      throw new Error(
        `Encryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Decrypt encrypted field data
   */
  async decrypt(
    encrypted: EncryptedField,
    context?: {
      fieldName?: string;
      businessId?: string;
      customerId?: string;
    }
  ): Promise<DecryptionResult> {
    const startTime = Date.now();

    try {
      // Check cache first
      const cached = this.cache.get(encrypted);
      if (cached) {
        this.metrics.cacheHits++;
        logger.debug('PII decryption cache hit', {
          fieldName: context?.fieldName,
        });

        return {
          plaintext: cached,
          metadata: {
            keyVersion: encrypted.keyVersion,
            encryptedAt: encrypted.encryptedAt,
            algorithm: ENCRYPTION_CONFIG.algorithm,
          },
        };
      }

      this.metrics.cacheMisses++;

      // Get decryption key
      const key = this.keyManager.getKey(encrypted.keyVersion);

      // Parse encrypted components
      const encryptedData = Buffer.from(encrypted.encryptedData, 'base64');
      const iv = Buffer.from(encrypted.iv, 'base64');
      const tag = Buffer.from(encrypted.tag, 'base64');

      // Create decipher
      const decipher = crypto.createDecipher(ENCRYPTION_CONFIG.algorithm, key);
      decipher.setAuthTag(tag);

      // Decrypt data
      let decrypted = decipher.update(encryptedData);
      decrypted = Buffer.concat([decrypted, decipher.final()]);

      const plaintext = decrypted.toString('utf8');

      // Cache the result
      this.cache.set(encrypted, plaintext);

      const duration = Date.now() - startTime;
      this.updateMetrics('decryption', duration);

      // Audit decryption event
      if (context) {
        await auditLog({
          category: 'data_access',
          type: 'DATA_READ',
          severity: 'low',
          description: `PII field ${context.fieldName || 'unknown'} decrypted`,
          businessId: context.businessId,
          metadata: {
            fieldName: context.fieldName,
            customerId: context.customerId,
            keyVersion: encrypted.keyVersion,
            decryptionDuration: duration,
            fromCache: false,
          },
          flags: {
            personalData: true,
          },
        });
      }

      logger.debug('PII data decrypted', {
        fieldName: context?.fieldName,
        keyVersion: encrypted.keyVersion,
        duration,
      });

      return {
        plaintext,
        metadata: {
          keyVersion: encrypted.keyVersion,
          encryptedAt: encrypted.encryptedAt,
          algorithm: ENCRYPTION_CONFIG.algorithm,
        },
      };
    } catch (error) {
      this.metrics.errors++;

      logger.error('PII decryption failed', {
        error: error instanceof Error ? error.message : String(error),
        fieldName: context?.fieldName,
        keyVersion: encrypted.keyVersion,
      });

      throw new Error(
        `Decryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Generate search hash for exact matching
   */
  generateSearchHash(plaintext: string, salt?: Buffer): string {
    const searchSalt = salt || crypto.randomBytes(ENCRYPTION_CONFIG.saltLength);

    return crypto
      .pbkdf2Sync(
        plaintext.toLowerCase().trim(),
        searchSalt,
        ENCRYPTION_CONFIG.searchHashIterations,
        32,
        ENCRYPTION_CONFIG.searchHashAlgorithm
      )
      .toString('hex');
  }

  /**
   * Verify search hash matches plaintext
   */
  verifySearchHash(plaintext: string, searchHash: string, salt: Buffer): boolean {
    try {
      const expectedHash = this.generateSearchHash(plaintext, salt);
      return crypto.timingSafeEqual(
        Buffer.from(searchHash, 'hex'),
        Buffer.from(expectedHash, 'hex')
      );
    } catch (error) {
      logger.error('Search hash verification failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Batch encrypt multiple fields
   */
  async encryptBatch(
    fields: Array<{
      value: string;
      fieldName: string;
      businessId?: string;
      customerId?: string;
    }>
  ): Promise<Array<EncryptionResult>> {
    const results: Array<EncryptionResult> = [];

    for (const field of fields) {
      try {
        const result = await this.encrypt(field.value, {
          fieldName: field.fieldName,
          businessId: field.businessId,
          customerId: field.customerId,
        });
        results.push(result);
      } catch (error) {
        logger.error('Batch encryption failed for field', {
          fieldName: field.fieldName,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    }

    return results;
  }

  /**
   * Batch decrypt multiple fields
   */
  async decryptBatch(
    fields: Array<{
      encrypted: EncryptedField;
      fieldName: string;
      businessId?: string;
      customerId?: string;
    }>
  ): Promise<Array<DecryptionResult>> {
    const results: Array<DecryptionResult> = [];

    for (const field of fields) {
      try {
        const result = await this.decrypt(field.encrypted, {
          fieldName: field.fieldName,
          businessId: field.businessId,
          customerId: field.customerId,
        });
        results.push(result);
      } catch (error) {
        logger.error('Batch decryption failed for field', {
          fieldName: field.fieldName,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    }

    return results;
  }

  /**
   * Rotate encryption key
   */
  async rotateKey(): Promise<number> {
    const newVersion = await this.keyManager.rotateKey();
    this.metrics.keyRotations++;
    return newVersion;
  }

  /**
   * Clear sensitive caches
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get encryption service metrics
   */
  getMetrics(): EncryptionMetrics & { cache: ReturnType<DecryptionCache['getMetrics']> } {
    const cacheMetrics = this.cache.getMetrics();
    return {
      ...this.metrics,
      cacheHits: cacheMetrics.hits,
      cacheMisses: cacheMetrics.misses,
      cache: cacheMetrics,
    };
  }

  /**
   * Update performance metrics
   */
  private updateMetrics(operation: 'encryption' | 'decryption', duration: number): void {
    if (operation === 'encryption') {
      this.metrics.totalEncryptions++;
      this.metrics.averageEncryptionTime = (this.metrics.averageEncryptionTime + duration) / 2;
    } else {
      this.metrics.totalDecryptions++;
      this.metrics.averageDecryptionTime = (this.metrics.averageDecryptionTime + duration) / 2;
    }
  }
}

// ==========================================
// SINGLETON INSTANCE
// ==========================================

let globalEncryptionService: PIIEncryptionService | null = null;

/**
 * Get global PII encryption service instance
 */
export function getEncryptionService(): PIIEncryptionService {
  if (!globalEncryptionService) {
    globalEncryptionService = new PIIEncryptionService();
  }
  return globalEncryptionService;
}

/**
 * Cleanup encryption service (for testing or shutdown)
 */
export function cleanupEncryptionService(): void {
  if (globalEncryptionService) {
    globalEncryptionService.clearCache();
    globalEncryptionService = null;
  }
}
