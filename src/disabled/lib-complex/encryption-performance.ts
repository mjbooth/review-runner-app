/**
 * Encryption Performance Optimization
 *
 * Performance optimizations for PII encryption including lazy decryption,
 * smart caching, batch operations, and performance monitoring.
 */

import { Redis } from 'ioredis';
import { logger } from './logger';
import { auditLog } from './audit-logger';
import { getEncryptionService, type EncryptedField, type DecryptionResult } from './encryption';
import {
  getSearchableEncryptionService,
  type CustomerPIIData,
  type EncryptedCustomerPII,
} from './searchable-encryption';

// ==========================================
// PERFORMANCE CONFIGURATION
// ==========================================

const PERFORMANCE_CONFIG = {
  // Cache configuration
  decryptionCacheEnabled: process.env.ENCRYPTION_CACHE_ENABLED !== 'false',
  cachePrefix: 'enc:decrypt:',
  cacheTTL: parseInt(process.env.ENCRYPTION_CACHE_TTL || '300'), // 5 minutes
  maxCacheSize: parseInt(process.env.ENCRYPTION_CACHE_SIZE || '1000'),

  // Batch processing
  batchSize: parseInt(process.env.ENCRYPTION_BATCH_SIZE || '50'),
  maxConcurrency: parseInt(process.env.ENCRYPTION_MAX_CONCURRENCY || '10'),

  // Performance monitoring
  slowDecryptionThreshold: parseInt(process.env.SLOW_DECRYPTION_THRESHOLD || '100'), // ms
  metricsReportInterval: parseInt(process.env.METRICS_REPORT_INTERVAL || '300000'), // 5 minutes

  // Lazy loading
  lazyDecryptionEnabled: process.env.LAZY_DECRYPTION_ENABLED !== 'false',
  preloadFrequentlyAccessed: process.env.PRELOAD_FREQUENT_DATA === 'true',
};

// ==========================================
// TYPES
// ==========================================

export interface PerformanceMetrics {
  // Operation counters
  totalEncryptions: number;
  totalDecryptions: number;
  totalBatchOperations: number;

  // Timing metrics
  averageEncryptionTime: number;
  averageDecryptionTime: number;
  slowOperations: number;

  // Cache metrics
  cacheHits: number;
  cacheMisses: number;
  cacheEvictions: number;
  cacheHitRate: number;

  // Batch metrics
  averageBatchSize: number;
  maxBatchSize: number;
  batchSuccessRate: number;

  // Memory and resource usage
  memoryUsage: number;
  activeBatches: number;
  queueSize: number;
}

export interface CacheEntry {
  plaintext: string;
  fieldName: string;
  customerId: string;
  businessId: string;
  timestamp: number;
  accessCount: number;
}

export interface BatchRequest {
  id: string;
  businessId: string;
  customerId: string;
  operation: 'encrypt' | 'decrypt';
  fields: Array<{
    name: string;
    value: string | EncryptedField;
  }>;
  priority: 'low' | 'normal' | 'high';
  callback: (error: Error | null, result?: any) => void;
}

// ==========================================
// PERFORMANCE-OPTIMIZED CACHE
// ==========================================

export class EncryptionCache {
  private cache: Map<string, CacheEntry> = new Map();
  private redis?: Redis;
  private metrics = {
    hits: 0,
    misses: 0,
    evictions: 0,
    totalSize: 0,
  };

  constructor(redisUrl?: string) {
    if (redisUrl) {
      this.redis = new Redis(redisUrl);
      logger.info('Redis cache initialized for encryption performance');
    } else {
      logger.info('In-memory cache initialized for encryption performance');
    }
  }

  /**
   * Generate cache key for encrypted field
   */
  private getCacheKey(
    businessId: string,
    customerId: string,
    fieldName: string,
    encryptedHash: string
  ): string {
    return `${PERFORMANCE_CONFIG.cachePrefix}${businessId}:${customerId}:${fieldName}:${encryptedHash.substring(0, 16)}`;
  }

  /**
   * Get cached decrypted value
   */
  async get(
    businessId: string,
    customerId: string,
    fieldName: string,
    encrypted: EncryptedField
  ): Promise<string | null> {
    try {
      const hash = encrypted.encryptedData.substring(0, 32);
      const key = this.getCacheKey(businessId, customerId, fieldName, hash);

      let entry: CacheEntry | null = null;

      // Try Redis first if available
      if (this.redis) {
        const cached = await this.redis.get(key);
        if (cached) {
          entry = JSON.parse(cached);
        }
      } else {
        // Use in-memory cache
        entry = this.cache.get(key) || null;
      }

      if (!entry) {
        this.metrics.misses++;
        return null;
      }

      // Check TTL
      const age = Date.now() - entry.timestamp;
      if (age > PERFORMANCE_CONFIG.cacheTTL * 1000) {
        await this.delete(key);
        this.metrics.misses++;
        return null;
      }

      // Update access count
      entry.accessCount++;
      entry.timestamp = Date.now();

      if (this.redis) {
        await this.redis.setex(key, PERFORMANCE_CONFIG.cacheTTL, JSON.stringify(entry));
      } else {
        this.cache.set(key, entry);
      }

      this.metrics.hits++;
      return entry.plaintext;
    } catch (error) {
      logger.error('Encryption cache get failed', {
        error: error instanceof Error ? error.message : String(error),
        businessId,
        customerId,
        fieldName,
      });
      this.metrics.misses++;
      return null;
    }
  }

  /**
   * Cache decrypted value
   */
  async set(
    businessId: string,
    customerId: string,
    fieldName: string,
    encrypted: EncryptedField,
    plaintext: string
  ): Promise<void> {
    try {
      const hash = encrypted.encryptedData.substring(0, 32);
      const key = this.getCacheKey(businessId, customerId, fieldName, hash);

      const entry: CacheEntry = {
        plaintext,
        fieldName,
        customerId,
        businessId,
        timestamp: Date.now(),
        accessCount: 1,
      };

      if (this.redis) {
        await this.redis.setex(key, PERFORMANCE_CONFIG.cacheTTL, JSON.stringify(entry));
      } else {
        // Evict if over size limit
        if (this.cache.size >= PERFORMANCE_CONFIG.maxCacheSize) {
          await this.evictLeastRecentlyUsed();
        }
        this.cache.set(key, entry);
      }

      this.metrics.totalSize++;
    } catch (error) {
      logger.error('Encryption cache set failed', {
        error: error instanceof Error ? error.message : String(error),
        businessId,
        customerId,
        fieldName,
      });
    }
  }

  /**
   * Preload frequently accessed data
   */
  async preloadFrequentCustomers(businessId: string, customerIds: string[]): Promise<void> {
    if (!PERFORMANCE_CONFIG.preloadFrequentlyAccessed) return;

    try {
      logger.debug('Preloading frequently accessed customer data', {
        businessId,
        customerCount: customerIds.length,
      });

      // This would typically query for customers that are accessed frequently
      // and pre-decrypt their data into cache
      // Implementation depends on usage patterns and business logic
    } catch (error) {
      logger.error('Cache preload failed', {
        error: error instanceof Error ? error.message : String(error),
        businessId,
        customerCount: customerIds.length,
      });
    }
  }

  /**
   * Evict least recently used entries
   */
  private async evictLeastRecentlyUsed(): Promise<void> {
    if (this.redis) return; // Redis handles its own eviction

    let oldestKey: string | null = null;
    let oldestTime = Date.now();

    for (const [key, entry] of this.cache.entries()) {
      if (entry.timestamp < oldestTime) {
        oldestTime = entry.timestamp;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
      this.metrics.evictions++;
    }
  }

  /**
   * Delete cache entry
   */
  private async delete(key: string): Promise<void> {
    if (this.redis) {
      await this.redis.del(key);
    } else {
      this.cache.delete(key);
    }
  }

  /**
   * Get cache metrics
   */
  getMetrics(): typeof this.metrics & { hitRate: number; size: number } {
    const total = this.metrics.hits + this.metrics.misses;
    return {
      ...this.metrics,
      hitRate: total > 0 ? this.metrics.hits / total : 0,
      size: this.redis ? 0 : this.cache.size, // Redis size not tracked
    };
  }

  /**
   * Clear cache
   */
  async clear(): Promise<void> {
    if (this.redis) {
      const keys = await this.redis.keys(`${PERFORMANCE_CONFIG.cachePrefix}*`);
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
    } else {
      this.cache.clear();
    }

    this.metrics = { hits: 0, misses: 0, evictions: 0, totalSize: 0 };
    logger.info('Encryption cache cleared');
  }
}

// ==========================================
// BATCH PROCESSING ENGINE
// ==========================================

export class BatchProcessor {
  private queue: BatchRequest[] = [];
  private activeBatches: Map<string, BatchRequest[]> = new Map();
  private processing = false;
  private metrics = {
    totalBatches: 0,
    successfulBatches: 0,
    failedBatches: 0,
    averageProcessingTime: 0,
  };

  constructor() {
    // Start periodic batch processing
    setInterval(() => {
      if (!this.processing) {
        this.processBatches();
      }
    }, 100); // Process every 100ms
  }

  /**
   * Add request to batch queue
   */
  addRequest(request: BatchRequest): void {
    this.queue.push(request);

    // Process high priority requests immediately
    if (request.priority === 'high') {
      setImmediate(() => this.processBatches());
    }
  }

  /**
   * Process queued batch requests
   */
  private async processBatches(): Promise<void> {
    if (this.processing || this.queue.length === 0) return;

    this.processing = true;
    const startTime = Date.now();

    try {
      // Group requests by business and operation type
      const batches = this.groupRequestsIntoBatches();

      // Process batches with limited concurrency
      const promises = Array.from(batches.entries()).map(([key, requests]) =>
        this.processBatch(key, requests)
      );

      await Promise.allSettled(promises);

      const duration = Date.now() - startTime;
      this.metrics.averageProcessingTime = (this.metrics.averageProcessingTime + duration) / 2;

      logger.debug('Batch processing completed', {
        batchCount: batches.size,
        requestCount: this.queue.length,
        duration,
      });
    } catch (error) {
      logger.error('Batch processing failed', {
        error: error instanceof Error ? error.message : String(error),
        queueSize: this.queue.length,
      });
    } finally {
      this.processing = false;
    }
  }

  /**
   * Group requests into batches by business and operation
   */
  private groupRequestsIntoBatches(): Map<string, BatchRequest[]> {
    const batches = new Map<string, BatchRequest[]>();
    const processedRequests: BatchRequest[] = [];

    // Sort by priority
    this.queue.sort((a, b) => {
      const priorityOrder = { high: 3, normal: 2, low: 1 };
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    });

    for (const request of this.queue) {
      const key = `${request.businessId}:${request.operation}`;

      if (!batches.has(key)) {
        batches.set(key, []);
      }

      const batch = batches.get(key)!;
      if (batch.length < PERFORMANCE_CONFIG.batchSize) {
        batch.push(request);
        processedRequests.push(request);
      }
    }

    // Remove processed requests from queue
    this.queue = this.queue.filter(req => !processedRequests.includes(req));

    return batches;
  }

  /**
   * Process a single batch
   */
  private async processBatch(batchKey: string, requests: BatchRequest[]): Promise<void> {
    const [businessId, operation] = batchKey.split(':');
    this.activeBatches.set(batchKey, requests);
    this.metrics.totalBatches++;

    try {
      if (operation === 'encrypt') {
        await this.processBatchEncryption(businessId, requests);
      } else if (operation === 'decrypt') {
        await this.processBatchDecryption(businessId, requests);
      }

      this.metrics.successfulBatches++;
    } catch (error) {
      this.metrics.failedBatches++;

      // Call error callbacks for all requests in batch
      requests.forEach(request => {
        request.callback(error as Error);
      });

      logger.error('Batch processing failed', {
        batchKey,
        requestCount: requests.length,
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      this.activeBatches.delete(batchKey);
    }
  }

  /**
   * Process batch encryption requests
   */
  private async processBatchEncryption(
    businessId: string,
    requests: BatchRequest[]
  ): Promise<void> {
    const encryptionService = getSearchableEncryptionService();

    for (const request of requests) {
      try {
        const piiData: CustomerPIIData = {};

        // Collect PII fields from request
        request.fields.forEach(field => {
          if (typeof field.value === 'string') {
            (piiData as any)[field.name] = field.value;
          }
        });

        // Encrypt customer PII
        const encryptedPII = await encryptionService.encryptCustomerPII(piiData, {
          businessId,
          customerId: request.customerId,
        });

        request.callback(null, encryptedPII);
      } catch (error) {
        request.callback(error as Error);
      }
    }
  }

  /**
   * Process batch decryption requests
   */
  private async processBatchDecryption(
    businessId: string,
    requests: BatchRequest[]
  ): Promise<void> {
    const encryptionService = getSearchableEncryptionService();

    for (const request of requests) {
      try {
        const encryptedPII: EncryptedCustomerPII = {};

        // Collect encrypted fields from request
        request.fields.forEach(field => {
          if (typeof field.value === 'object' && field.value !== null) {
            (encryptedPII as any)[`${field.name}Encrypted`] = field.value;
          }
        });

        // Decrypt customer PII
        const decryptedPII = await encryptionService.decryptCustomerPII(encryptedPII, {
          businessId,
          customerId: request.customerId,
        });

        request.callback(null, decryptedPII);
      } catch (error) {
        request.callback(error as Error);
      }
    }
  }

  /**
   * Get batch processing metrics
   */
  getMetrics(): typeof this.metrics & {
    queueSize: number;
    activeBatches: number;
    successRate: number;
  } {
    const total = this.metrics.successfulBatches + this.metrics.failedBatches;
    return {
      ...this.metrics,
      queueSize: this.queue.length,
      activeBatches: this.activeBatches.size,
      successRate: total > 0 ? this.metrics.successfulBatches / total : 1,
    };
  }
}

// ==========================================
// LAZY DECRYPTION PROXY
// ==========================================

export class LazyDecryptionProxy {
  private cache: EncryptionCache;
  private batchProcessor: BatchProcessor;

  constructor(cache: EncryptionCache, batchProcessor: BatchProcessor) {
    this.cache = cache;
    this.batchProcessor = batchProcessor;
  }

  /**
   * Create lazy customer object that decrypts fields on access
   */
  createLazyCustomer(
    businessId: string,
    customerId: string,
    encryptedFields: {
      firstNameEncrypted?: string;
      lastNameEncrypted?: string;
      emailEncrypted?: string;
      phoneEncrypted?: string;
    }
  ): any {
    const customer: any = {
      id: customerId,
      businessId,
      _encrypted: encryptedFields,
      _decrypted: {},
    };

    // Create lazy property getters
    const fieldMappings = {
      firstName: 'firstNameEncrypted',
      lastName: 'lastNameEncrypted',
      email: 'emailEncrypted',
      phone: 'phoneEncrypted',
    };

    Object.entries(fieldMappings).forEach(([publicField, encryptedField]) => {
      Object.defineProperty(customer, publicField, {
        get: async function () {
          // Return cached value if available
          if (this._decrypted[publicField] !== undefined) {
            return this._decrypted[publicField];
          }

          // Return null if no encrypted data
          if (!this._encrypted[encryptedField]) {
            return null;
          }

          try {
            // Parse encrypted field
            const encrypted = JSON.parse(this._encrypted[encryptedField]);

            // Check cache first
            const cached = await this.cache.get(businessId, customerId, publicField, encrypted);

            if (cached !== null) {
              this._decrypted[publicField] = cached;
              return cached;
            }

            // Decrypt field
            const encryptionService = getEncryptionService();
            const decryptionResult = await encryptionService.decrypt(encrypted);
            const plaintext = decryptionResult.plaintext;

            // Cache result
            await this.cache.set(businessId, customerId, publicField, encrypted, plaintext);

            this._decrypted[publicField] = plaintext;
            return plaintext;
          } catch (error) {
            logger.error('Lazy decryption failed', {
              error: error instanceof Error ? error.message : String(error),
              businessId,
              customerId,
              field: publicField,
            });
            this._decrypted[publicField] = null;
            return null;
          }
        },
        enumerable: true,
        configurable: true,
      });
    });

    return customer;
  }
}

// ==========================================
// PERFORMANCE MONITOR
// ==========================================

export class EncryptionPerformanceMonitor {
  private metrics: PerformanceMetrics = {
    totalEncryptions: 0,
    totalDecryptions: 0,
    totalBatchOperations: 0,
    averageEncryptionTime: 0,
    averageDecryptionTime: 0,
    slowOperations: 0,
    cacheHits: 0,
    cacheMisses: 0,
    cacheEvictions: 0,
    cacheHitRate: 0,
    averageBatchSize: 0,
    maxBatchSize: 0,
    batchSuccessRate: 0,
    memoryUsage: 0,
    activeBatches: 0,
    queueSize: 0,
  };

  private cache: EncryptionCache;
  private batchProcessor: BatchProcessor;
  private reportInterval?: NodeJS.Timeout;

  constructor(cache: EncryptionCache, batchProcessor: BatchProcessor) {
    this.cache = cache;
    this.batchProcessor = batchProcessor;

    // Start periodic metrics reporting
    this.startMetricsReporting();
  }

  /**
   * Record encryption operation
   */
  recordEncryption(duration: number): void {
    this.metrics.totalEncryptions++;
    this.metrics.averageEncryptionTime = (this.metrics.averageEncryptionTime + duration) / 2;

    if (duration > PERFORMANCE_CONFIG.slowDecryptionThreshold) {
      this.metrics.slowOperations++;
    }
  }

  /**
   * Record decryption operation
   */
  recordDecryption(duration: number): void {
    this.metrics.totalDecryptions++;
    this.metrics.averageDecryptionTime = (this.metrics.averageDecryptionTime + duration) / 2;

    if (duration > PERFORMANCE_CONFIG.slowDecryptionThreshold) {
      this.metrics.slowOperations++;
    }
  }

  /**
   * Get current performance metrics
   */
  getMetrics(): PerformanceMetrics {
    // Update with current cache and batch metrics
    const cacheMetrics = this.cache.getMetrics();
    const batchMetrics = this.batchProcessor.getMetrics();

    return {
      ...this.metrics,
      cacheHits: cacheMetrics.hits,
      cacheMisses: cacheMetrics.misses,
      cacheEvictions: cacheMetrics.evictions,
      cacheHitRate: cacheMetrics.hitRate,
      queueSize: batchMetrics.queueSize,
      activeBatches: batchMetrics.activeBatches,
      batchSuccessRate: batchMetrics.successRate,
      memoryUsage: process.memoryUsage().heapUsed,
    };
  }

  /**
   * Start periodic metrics reporting
   */
  private startMetricsReporting(): void {
    this.reportInterval = setInterval(() => {
      const metrics = this.getMetrics();

      logger.info('Encryption performance metrics', metrics);

      // Report to audit system
      auditLog({
        category: 'system_event',
        type: 'SYSTEM_EVENT',
        severity: 'low',
        description: 'Encryption performance metrics report',
        metadata: {
          performanceMetrics: metrics,
          reportType: 'periodic',
        },
      });
    }, PERFORMANCE_CONFIG.metricsReportInterval);
  }

  /**
   * Stop metrics reporting
   */
  cleanup(): void {
    if (this.reportInterval) {
      clearInterval(this.reportInterval);
      this.reportInterval = undefined;
    }
  }
}

// ==========================================
// SINGLETON INSTANCES
// ==========================================

let globalCache: EncryptionCache | null = null;
let globalBatchProcessor: BatchProcessor | null = null;
let globalPerformanceMonitor: EncryptionPerformanceMonitor | null = null;

/**
 * Get global encryption cache instance
 */
export function getEncryptionCache(): EncryptionCache {
  if (!globalCache) {
    globalCache = new EncryptionCache(process.env.REDIS_URL);
  }
  return globalCache;
}

/**
 * Get global batch processor instance
 */
export function getBatchProcessor(): BatchProcessor {
  if (!globalBatchProcessor) {
    globalBatchProcessor = new BatchProcessor();
  }
  return globalBatchProcessor;
}

/**
 * Get global performance monitor instance
 */
export function getPerformanceMonitor(): EncryptionPerformanceMonitor {
  if (!globalPerformanceMonitor) {
    const cache = getEncryptionCache();
    const batchProcessor = getBatchProcessor();
    globalPerformanceMonitor = new EncryptionPerformanceMonitor(cache, batchProcessor);
  }
  return globalPerformanceMonitor;
}

/**
 * Cleanup performance optimization services
 */
export function cleanupPerformanceOptimization(): void {
  if (globalPerformanceMonitor) {
    globalPerformanceMonitor.cleanup();
    globalPerformanceMonitor = null;
  }

  if (globalCache) {
    globalCache.clear();
    globalCache = null;
  }

  globalBatchProcessor = null;
}
