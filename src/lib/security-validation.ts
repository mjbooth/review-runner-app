/**
 * Security Validation and Input Sanitization Utilities
 *
 * Comprehensive security validation, input sanitization, and business rule
 * enforcement to prevent XSS, injection attacks, and data integrity issues.
 */

import { z } from 'zod';
import DOMPurify from 'isomorphic-dompurify';
import { logger } from './logger';
import { SECURITY_LIMITS } from './validation-schemas';

// ==========================================
// SECURITY VALIDATION ERROR TYPES
// ==========================================

export class SecurityValidationError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly field?: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'SecurityValidationError';
  }
}

// ==========================================
// INPUT SANITIZATION UTILITIES
// ==========================================

/**
 * Sanitize HTML content to prevent XSS attacks
 */
export function sanitizeHtml(input: string, allowedTags: string[] = []): string {
  if (!input || typeof input !== 'string') {
    return '';
  }

  // Configure DOMPurify for strict sanitization
  const cleanHtml = DOMPurify.sanitize(input, {
    ALLOWED_TAGS: allowedTags,
    ALLOWED_ATTR: [],
    REMOVE_DATA_URI_FROM_TAGS: ['img', 'source', 'video', 'audio'],
    FORBID_SCRIPT: true,
    FORBID_TAGS: ['script', 'object', 'embed', 'form', 'input', 'button'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur', 'style'],
    REMOVE_UNSAFE_DATA_URI: true,
  });

  return cleanHtml;
}

/**
 * Sanitize plain text input
 */
export function sanitizeText(input: string): string {
  if (!input || typeof input !== 'string') {
    return '';
  }

  // Remove all HTML tags and scripts
  let cleaned = input
    .replace(/<[^>]*>/g, '') // Remove HTML tags
    .replace(/javascript:/gi, '') // Remove javascript: protocol
    .replace(/data:/gi, '') // Remove data: protocol
    .replace(/vbscript:/gi, '') // Remove vbscript: protocol
    .trim();

  // Normalize whitespace
  cleaned = cleaned.replace(/\s+/g, ' ');

  return cleaned;
}

/**
 * Sanitize email address
 */
export function sanitizeEmail(email: string): string {
  if (!email || typeof email !== 'string') {
    return '';
  }

  return email
    .toLowerCase()
    .trim()
    .replace(/[<>"'&]/g, ''); // Remove potential injection characters
}

/**
 * Sanitize phone number
 */
export function sanitizePhone(phone: string): string {
  if (!phone || typeof phone !== 'string') {
    return '';
  }

  // Keep only digits, +, spaces, hyphens, parentheses, and dots
  return phone.replace(/[^\d\+\s\-\(\)\.]/g, '');
}

/**
 * Sanitize URL for safety
 */
export function sanitizeUrl(url: string): string {
  if (!url || typeof url !== 'string') {
    return '';
  }

  try {
    const parsed = new URL(url.trim());

    // Only allow http and https protocols
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new SecurityValidationError(
        'Only HTTP and HTTPS URLs are allowed',
        'INVALID_URL_PROTOCOL',
        'url'
      );
    }

    // Check for suspicious patterns
    const suspiciousPatterns = [
      /javascript:/i,
      /data:/i,
      /vbscript:/i,
      /<script/i,
      /on\w+=/i, // Event handlers like onclick=
    ];

    const fullUrl = parsed.toString();
    if (suspiciousPatterns.some(pattern => pattern.test(fullUrl))) {
      throw new SecurityValidationError(
        'URL contains suspicious content',
        'SUSPICIOUS_URL_CONTENT',
        'url'
      );
    }

    return fullUrl;
  } catch (error) {
    if (error instanceof SecurityValidationError) {
      throw error;
    }
    throw new SecurityValidationError('Invalid URL format', 'INVALID_URL_FORMAT', 'url', error);
  }
}

// ==========================================
// CONTENT VALIDATION UTILITIES
// ==========================================

/**
 * Validate message content based on channel and business rules
 */
export function validateMessageContent(
  content: string,
  channel: 'SMS' | 'EMAIL',
  businessId: string
): {
  isValid: boolean;
  sanitizedContent: string;
  warnings: string[];
  errors: string[];
} {
  const warnings: string[] = [];
  const errors: string[] = [];

  if (!content || typeof content !== 'string') {
    errors.push('Message content is required');
    return { isValid: false, sanitizedContent: '', warnings, errors };
  }

  // Sanitize content
  const sanitizedContent = sanitizeText(content);

  // Channel-specific validation
  if (channel === 'SMS') {
    if (sanitizedContent.length > SECURITY_LIMITS.SMS_MAX_LENGTH) {
      errors.push(`SMS messages cannot exceed ${SECURITY_LIMITS.SMS_MAX_LENGTH} characters`);
    }

    // Check for SMS-specific issues
    if (sanitizedContent.includes('http://')) {
      warnings.push('HTTP links in SMS may be flagged as spam. Consider using HTTPS.');
    }

    // Check for excessive capitalization
    const upperCaseCount = (sanitizedContent.match(/[A-Z]/g) || []).length;
    const upperCaseRatio = upperCaseCount / sanitizedContent.length;
    if (upperCaseRatio > 0.5) {
      warnings.push('Excessive capitalization may trigger spam filters');
    }
  }

  if (channel === 'EMAIL') {
    if (sanitizedContent.length > SECURITY_LIMITS.EMAIL_BODY_MAX_LENGTH) {
      errors.push(
        `Email content cannot exceed ${SECURITY_LIMITS.EMAIL_BODY_MAX_LENGTH} characters`
      );
    }

    // Check for spam-like content
    const spamPatterns = [
      /\b(free|win|winner|urgent|act now|limited time)\b/gi,
      /\$\$+/g, // Multiple dollar signs
      /!!+/g, // Multiple exclamation marks
    ];

    spamPatterns.forEach((pattern, index) => {
      if (pattern.test(sanitizedContent)) {
        const spamWarnings = [
          'Content contains words commonly flagged as spam',
          'Multiple currency symbols may trigger spam filters',
          'Excessive punctuation may trigger spam filters',
        ];
        warnings.push(spamWarnings[index]);
      }
    });
  }

  // Common validation for both channels

  // Check for suspicious links
  const urlPattern = /https?:\/\/[^\s]+/gi;
  const urls = sanitizedContent.match(urlPattern) || [];

  for (const url of urls) {
    try {
      sanitizeUrl(url);
    } catch (error) {
      if (error instanceof SecurityValidationError) {
        errors.push(`Invalid URL detected: ${error.message}`);
      }
    }
  }

  // Log security validation attempt
  logger.debug('Message content validation', {
    businessId,
    channel,
    contentLength: sanitizedContent.length,
    urlCount: urls.length,
    warningsCount: warnings.length,
    errorsCount: errors.length,
  });

  return {
    isValid: errors.length === 0,
    sanitizedContent,
    warnings,
    errors,
  };
}

/**
 * Validate CSV import data
 */
export function validateCsvImportData(
  data: any[],
  expectedHeaders: string[],
  businessId: string
): {
  isValid: boolean;
  validRows: any[];
  invalidRows: Array<{ row: number; errors: string[]; data: any }>;
  warnings: string[];
} {
  const validRows: any[] = [];
  const invalidRows: Array<{ row: number; errors: string[]; data: any }> = [];
  const warnings: string[] = [];

  // Check row count limits
  if (data.length > SECURITY_LIMITS.MAX_IMPORT_ROWS) {
    return {
      isValid: false,
      validRows: [],
      invalidRows: [],
      warnings: [`Import exceeds maximum ${SECURITY_LIMITS.MAX_IMPORT_ROWS} rows limit`],
    };
  }

  // Validate each row
  data.forEach((row, index) => {
    const rowNumber = index + 1;
    const rowErrors: string[] = [];

    // Check required headers
    const missingHeaders = expectedHeaders.filter(
      header =>
        !row.hasOwnProperty(header) ||
        (typeof row[header] === 'string' && row[header].trim() === '')
    );

    if (missingHeaders.length > 0) {
      rowErrors.push(`Missing required fields: ${missingHeaders.join(', ')}`);
    }

    // Sanitize and validate each field
    const sanitizedRow: any = {};

    for (const [key, value] of Object.entries(row)) {
      if (typeof value === 'string') {
        const sanitized = sanitizeText(value);

        // Check for excessively long values
        if (sanitized.length > 1000) {
          // General limit for CSV fields
          rowErrors.push(`Field '${key}' is too long (max 1000 characters)`);
          continue;
        }

        sanitizedRow[key] = sanitized;

        // Specific field validation
        if (key === 'email' && sanitized) {
          try {
            sanitizedRow[key] = sanitizeEmail(sanitized);
            // Basic email format check
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(sanitizedRow[key])) {
              rowErrors.push(`Invalid email format: ${sanitized}`);
            }
          } catch {
            rowErrors.push(`Invalid email: ${sanitized}`);
          }
        }

        if (key === 'phone' && sanitized) {
          try {
            sanitizedRow[key] = sanitizePhone(sanitized);
            if (sanitizedRow[key].replace(/[^\d]/g, '').length < 7) {
              rowErrors.push(`Phone number too short: ${sanitized}`);
            }
          } catch {
            rowErrors.push(`Invalid phone number: ${sanitized}`);
          }
        }
      } else {
        sanitizedRow[key] = value;
      }
    }

    // Check for at least one contact method
    if (!sanitizedRow.email && !sanitizedRow.phone) {
      rowErrors.push('Each customer must have at least email or phone');
    }

    if (rowErrors.length === 0) {
      validRows.push(sanitizedRow);
    } else {
      invalidRows.push({
        row: rowNumber,
        errors: rowErrors,
        data: sanitizedRow,
      });
    }
  });

  // Add warnings for common issues
  if (invalidRows.length > 0) {
    warnings.push(`${invalidRows.length} rows have validation errors and will be skipped`);
  }

  if (validRows.length === 0 && data.length > 0) {
    warnings.push('No valid rows found in import data');
  }

  // Log import validation
  logger.info('CSV import validation completed', {
    businessId,
    totalRows: data.length,
    validRows: validRows.length,
    invalidRows: invalidRows.length,
    warningsCount: warnings.length,
  });

  return {
    isValid: validRows.length > 0,
    validRows,
    invalidRows,
    warnings,
  };
}

// ==========================================
// BUSINESS RULE VALIDATION
// ==========================================

/**
 * Validate business-specific rules and limits
 */
export async function validateBusinessRules(
  businessId: string,
  operation: string,
  data: any,
  context?: {
    currentUsage?: {
      smsUsed?: number;
      emailUsed?: number;
      customersCount?: number;
      requestsCount?: number;
    };
    limits?: {
      smsLimit?: number;
      emailLimit?: number;
      maxCustomers?: number;
      maxRequestsPerHour?: number;
    };
  }
): Promise<{
  isValid: boolean;
  errors: string[];
  warnings: string[];
}> {
  const errors: string[] = [];
  const warnings: string[] = [];

  try {
    switch (operation) {
      case 'send_sms':
        if (context?.currentUsage?.smsUsed !== undefined && context?.limits?.smsLimit) {
          if (context.currentUsage.smsUsed >= context.limits.smsLimit) {
            errors.push('SMS credit limit exceeded');
          } else if (context.currentUsage.smsUsed / context.limits.smsLimit > 0.9) {
            warnings.push('Approaching SMS credit limit');
          }
        }
        break;

      case 'send_email':
        if (context?.currentUsage?.emailUsed !== undefined && context?.limits?.emailLimit) {
          if (context.currentUsage.emailUsed >= context.limits.emailLimit) {
            errors.push('Email credit limit exceeded');
          } else if (context.currentUsage.emailUsed / context.limits.emailLimit > 0.9) {
            warnings.push('Approaching email credit limit');
          }
        }
        break;

      case 'import_customers':
        const importCount = Array.isArray(data) ? data.length : 1;
        if (context?.limits?.maxCustomers && context?.currentUsage?.customersCount) {
          if (context.currentUsage.customersCount + importCount > context.limits.maxCustomers) {
            errors.push(`Import would exceed customer limit (${context.limits.maxCustomers})`);
          }
        }
        break;

      case 'bulk_requests':
        const requestCount = Array.isArray(data) ? data.length : 1;
        if (context?.limits?.maxRequestsPerHour && context?.currentUsage?.requestsCount) {
          if (
            context.currentUsage.requestsCount + requestCount >
            context.limits.maxRequestsPerHour
          ) {
            errors.push('Would exceed hourly request limit');
          }
        }
        break;
    }

    logger.debug('Business rules validation', {
      businessId,
      operation,
      isValid: errors.length === 0,
      errorsCount: errors.length,
      warningsCount: warnings.length,
    });
  } catch (error) {
    logger.error('Business rules validation error', {
      businessId,
      operation,
      error: error instanceof Error ? error.message : String(error),
    });

    errors.push('Business rules validation failed');
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

// ==========================================
// FILE VALIDATION UTILITIES
// ==========================================

/**
 * Validate uploaded file for security
 */
export function validateFileUpload(
  file: {
    filename: string;
    mimetype: string;
    size: number;
  },
  allowedTypes: string[] = ['text/csv', 'application/csv']
): {
  isValid: boolean;
  sanitizedFilename: string;
  errors: string[];
} {
  const errors: string[] = [];

  // Sanitize filename
  const sanitizedFilename = file.filename
    .replace(/[^a-zA-Z0-9\-_\.]/g, '_') // Replace invalid chars with underscore
    .replace(/\.+/g, '.') // Replace multiple dots with single dot
    .replace(/_+/g, '_') // Replace multiple underscores with single underscore
    .slice(0, 255); // Limit length

  // Validate file extension matches mimetype
  const extension = sanitizedFilename.split('.').pop()?.toLowerCase();
  const expectedExtensions: Record<string, string[]> = {
    'text/csv': ['csv'],
    'application/csv': ['csv'],
    'text/plain': ['txt'],
    'application/vnd.ms-excel': ['xls'],
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['xlsx'],
  };

  if (!allowedTypes.includes(file.mimetype)) {
    errors.push(`File type ${file.mimetype} is not allowed`);
  }

  const allowedExtensions = allowedTypes.flatMap(type => expectedExtensions[type] || []);
  if (extension && !allowedExtensions.includes(extension)) {
    errors.push(`File extension .${extension} is not allowed`);
  }

  // Size validation
  if (file.size > SECURITY_LIMITS.MAX_FILE_SIZE) {
    errors.push(`File size ${file.size} exceeds limit of ${SECURITY_LIMITS.MAX_FILE_SIZE} bytes`);
  }

  if (file.size === 0) {
    errors.push('File is empty');
  }

  return {
    isValid: errors.length === 0,
    sanitizedFilename,
    errors,
  };
}

// ==========================================
// VALIDATION MIDDLEWARE UTILITIES
// ==========================================

/**
 * Create a validation middleware for Zod schemas with security
 */
export function createValidationMiddleware<T>(
  schema: z.ZodSchema<T>,
  options: {
    source?: 'body' | 'query' | 'params';
    sanitize?: boolean;
    logValidation?: boolean;
  } = {}
) {
  const { source = 'body', sanitize = true, logValidation = true } = options;

  return async function validationMiddleware(request: any, reply: any) {
    try {
      const data = request[source];

      if (logValidation) {
        logger.debug('Validation started', {
          source,
          path: request.url,
          method: request.method,
          businessId: request.businessId,
        });
      }

      // Apply sanitization if requested
      let sanitizedData = data;
      if (sanitize && data && typeof data === 'object') {
        sanitizedData = applySanitization(data);
      }

      // Validate with schema
      const result = await schema.parseAsync(sanitizedData);

      // Replace original data with validated/sanitized data
      request[source] = result;

      if (logValidation) {
        logger.debug('Validation successful', {
          source,
          path: request.url,
          businessId: request.businessId,
        });
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        const validationErrors = error.errors.map(err => ({
          field: err.path.join('.'),
          message: err.message,
          code: err.code,
        }));

        logger.warn('Validation failed', {
          source,
          path: request.url,
          method: request.method,
          businessId: request.businessId,
          errors: validationErrors,
        });

        return reply.status(400).send({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Request validation failed',
            details: validationErrors,
          },
        });
      }

      logger.error('Validation middleware error', {
        source,
        path: request.url,
        businessId: request.businessId,
        error: error instanceof Error ? error.message : String(error),
      });

      return reply.status(500).send({
        success: false,
        error: {
          code: 'VALIDATION_SYSTEM_ERROR',
          message: 'Validation system error',
        },
      });
    }
  };
}

/**
 * Apply sanitization to an object recursively
 */
function applySanitization(obj: any): any {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === 'string') {
    return sanitizeText(obj);
  }

  if (Array.isArray(obj)) {
    return obj.map(applySanitization);
  }

  if (typeof obj === 'object') {
    const sanitized: any = {};
    for (const [key, value] of Object.entries(obj)) {
      sanitized[key] = applySanitization(value);
    }
    return sanitized;
  }

  return obj;
}

// ==========================================
// EXPORT TYPES
// ==========================================

export type ValidationResult = {
  isValid: boolean;
  errors: string[];
  warnings: string[];
};

export type SanitizationOptions = {
  allowedTags?: string[];
  preserveFormatting?: boolean;
  strictMode?: boolean;
};
