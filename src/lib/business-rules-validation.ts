/**
 * Business Rules Validation System
 *
 * Comprehensive business logic validation including message length limits,
 * contact format validation, credit limits, campaign frequency rules,
 * and regulatory compliance checks.
 */

import { z } from 'zod';
import { prisma } from './prisma';
import { logger } from './logger';
import { SECURITY_LIMITS } from './validation-schemas';
import { validateMessageContent } from './security-validation';
import type { AuthenticatedRequest } from '../types/auth';

// ==========================================
// BUSINESS RULE TYPES
// ==========================================

export type BusinessRuleType =
  | 'message_content'
  | 'contact_validation'
  | 'credit_limits'
  | 'campaign_frequency'
  | 'suppression_compliance'
  | 'data_retention'
  | 'gdpr_compliance'
  | 'channel_restrictions'
  | 'bulk_operation_limits'
  | 'working_hours';

export interface BusinessRuleResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  metadata?: Record<string, any>;
}

export interface BusinessContext {
  businessId: string;
  tier: 'free' | 'starter' | 'professional' | 'enterprise';
  settings: {
    timezone: string;
    workingHours?: { start: string; end: string };
    allowWeekends?: boolean;
    maxCampaignsPerDay?: number;
    customRules?: Record<string, any>;
  };
  usage: {
    smsUsed: number;
    smsLimit: number;
    emailUsed: number;
    emailLimit: number;
    customersCount: number;
    campaignsThisMonth: number;
  };
  features: {
    bulkOperations: boolean;
    advancedScheduling: boolean;
    customTemplates: boolean;
    analytics: boolean;
  };
}

// ==========================================
// BUSINESS RULES ENGINE
// ==========================================

export class BusinessRulesValidator {
  /**
   * Validate message content according to business rules
   */
  async validateMessageContent(
    content: string,
    channel: 'SMS' | 'EMAIL',
    businessContext: BusinessContext,
    options: {
      customerId?: string;
      templateId?: string;
      scheduledFor?: Date;
    } = {}
  ): Promise<BusinessRuleResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const metadata: Record<string, any> = {};

    try {
      // Basic content validation
      const contentValidation = validateMessageContent(
        content,
        channel,
        businessContext.businessId
      );
      errors.push(...contentValidation.errors);
      warnings.push(...contentValidation.warnings);

      // Channel-specific business rules
      if (channel === 'SMS') {
        await this.validateSMSBusinessRules(content, businessContext, errors, warnings, metadata);
      } else if (channel === 'EMAIL') {
        await this.validateEmailBusinessRules(content, businessContext, errors, warnings, metadata);
      }

      // Check for personalization requirements
      if (businessContext.tier !== 'free') {
        this.validatePersonalization(content, errors, warnings);
      }

      // Validate scheduling if specified
      if (options.scheduledFor) {
        await this.validateSchedulingRules(options.scheduledFor, businessContext, errors, warnings);
      }

      logger.debug('Message content validation completed', {
        businessId: businessContext.businessId,
        channel,
        contentLength: content.length,
        errorsCount: errors.length,
        warningsCount: warnings.length,
      });

      return {
        isValid: errors.length === 0,
        errors,
        warnings,
        metadata,
      };
    } catch (error) {
      logger.error('Message content validation failed', {
        businessId: businessContext.businessId,
        channel,
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        isValid: false,
        errors: ['Message content validation system error'],
        warnings: [],
      };
    }
  }

  /**
   * Validate SMS-specific business rules
   */
  private async validateSMSBusinessRules(
    content: string,
    businessContext: BusinessContext,
    errors: string[],
    warnings: string[],
    metadata: Record<string, any>
  ): Promise<void> {
    // SMS length optimization
    if (content.length > 160) {
      const segments = Math.ceil(content.length / 153); // 153 chars per segment for multi-part SMS
      metadata.smsSegments = segments;

      if (segments > 3) {
        warnings.push(`SMS will be split into ${segments} segments, consider shortening`);
      }

      if (segments > 5) {
        errors.push('SMS too long - maximum 5 segments allowed');
      }
    }

    // Check for SMS-specific forbidden content
    const smsRestrictions = [
      { pattern: /\bclick here\b/gi, message: 'Avoid "click here" - may trigger spam filters' },
      { pattern: /\bfree\s+money\b/gi, message: 'Promotional language may trigger spam filters' },
      { pattern: /\$\$+/g, message: 'Excessive dollar signs may trigger spam filters' },
      { pattern: /!!{2,}/g, message: 'Excessive exclamation marks may trigger spam filters' },
    ];

    smsRestrictions.forEach(restriction => {
      if (restriction.pattern.test(content)) {
        warnings.push(restriction.message);
      }
    });

    // Check for required SMS compliance
    if (businessContext.tier !== 'free' && !content.includes('STOP')) {
      warnings.push('Consider including opt-out instructions (STOP) for compliance');
    }

    // Validate URL shortening requirements
    const urlPattern = /https?:\/\/[^\s]+/gi;
    const urls = content.match(urlPattern);
    if (urls && urls.length > 0) {
      metadata.urlCount = urls.length;

      urls.forEach(url => {
        if (url.length > 30) {
          warnings.push('Long URLs in SMS should be shortened');
        }
      });
    }
  }

  /**
   * Validate email-specific business rules
   */
  private async validateEmailBusinessRules(
    content: string,
    businessContext: BusinessContext,
    errors: string[],
    warnings: string[],
    metadata: Record<string, any>
  ): Promise<void> {
    // Email content analysis
    const wordCount = content.split(/\s+/).length;
    metadata.wordCount = wordCount;

    if (wordCount < 20) {
      warnings.push('Email content is quite short - consider adding more context');
    }

    if (wordCount > 1000) {
      warnings.push('Long emails may have lower engagement - consider shortening');
    }

    // Check image-to-text ratio (basic heuristic)
    const imagePattern = /<img[^>]*>/gi;
    const imageCount = (content.match(imagePattern) || []).length;
    const textLength = content.replace(/<[^>]*>/g, '').length;

    if (imageCount > 0 && textLength < imageCount * 100) {
      warnings.push('High image-to-text ratio may trigger spam filters');
    }

    // Validate email compliance requirements
    if (businessContext.tier !== 'free') {
      if (!content.toLowerCase().includes('unsubscribe')) {
        errors.push('Email must include unsubscribe option for compliance');
      }

      // Check for required business information
      const hasAddress =
        content.toLowerCase().includes('address') || content.toLowerCase().includes('contact');
      if (!hasAddress) {
        warnings.push('Consider including business contact information');
      }
    }

    // Check for spam trigger words
    const spamWords = [
      'guaranteed',
      'earn money fast',
      'no obligation',
      'risk free',
      'amazing deal',
      'limited time',
      'act now',
      "don't delay",
    ];

    let spamScore = 0;
    spamWords.forEach(word => {
      const regex = new RegExp(`\\b${word}\\b`, 'gi');
      const matches = content.match(regex);
      if (matches) {
        spamScore += matches.length;
      }
    });

    if (spamScore > 3) {
      warnings.push('Content contains multiple spam trigger words');
    }

    metadata.spamScore = spamScore;
  }

  /**
   * Validate personalization in content
   */
  private validatePersonalization(content: string, errors: string[], warnings: string[]): void {
    const personalizationTokens = [
      '{{firstName}}',
      '{{lastName}}',
      '{{name}}',
      '{{businessName}}',
      '{firstName}',
      '{lastName}',
      '{name}',
      '{businessName}',
    ];

    const hasPersonalization = personalizationTokens.some(token => content.includes(token));

    if (!hasPersonalization) {
      warnings.push('Consider personalizing your message for better engagement');
    }

    // Check for proper token format
    const invalidTokens = content.match(/\{[^}]*\}/g);
    if (invalidTokens) {
      const validTokens = ['firstName', 'lastName', 'name', 'businessName', 'email', 'phone'];
      invalidTokens.forEach(token => {
        const tokenName = token.replace(/[{}]/g, '');
        if (!validTokens.includes(tokenName)) {
          errors.push(`Invalid personalization token: ${token}`);
        }
      });
    }
  }

  /**
   * Validate scheduling rules
   */
  private async validateSchedulingRules(
    scheduledFor: Date,
    businessContext: BusinessContext,
    errors: string[],
    warnings: string[]
  ): Promise<void> {
    const now = new Date();

    // Check if scheduled time is in the future
    if (scheduledFor <= now) {
      errors.push('Scheduled time must be in the future');
      return;
    }

    // Check if scheduling too far in advance
    const maxAdvanceDays = businessContext.tier === 'free' ? 7 : 365;
    const maxAdvanceTime = new Date(now.getTime() + maxAdvanceDays * 24 * 60 * 60 * 1000);

    if (scheduledFor > maxAdvanceTime) {
      errors.push(`Cannot schedule more than ${maxAdvanceDays} days in advance`);
    }

    // Validate working hours if configured
    if (businessContext.settings.workingHours) {
      const scheduledHour = scheduledFor.getHours();
      const workingStart = parseInt(businessContext.settings.workingHours.start.split(':')[0]);
      const workingEnd = parseInt(businessContext.settings.workingHours.end.split(':')[0]);

      if (scheduledHour < workingStart || scheduledHour >= workingEnd) {
        warnings.push(
          `Scheduled outside working hours (${businessContext.settings.workingHours.start}-${businessContext.settings.workingHours.end})`
        );
      }
    }

    // Check weekend scheduling
    const isWeekend = scheduledFor.getDay() === 0 || scheduledFor.getDay() === 6;
    if (isWeekend && !businessContext.settings.allowWeekends) {
      warnings.push('Scheduled for weekend - consider business hours');
    }
  }

  /**
   * Validate contact information according to business rules
   */
  async validateContactInfo(
    email?: string,
    phone?: string,
    businessContext?: BusinessContext
  ): Promise<BusinessRuleResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const metadata: Record<string, any> = {};

    try {
      // Must have at least one contact method
      if (!email && !phone) {
        errors.push('Customer must have at least email or phone number');
      }

      // Email validation
      if (email) {
        // Check against suppression list
        const emailSuppressed = await this.checkSuppressionStatus(
          email,
          'EMAIL',
          businessContext?.businessId
        );

        if (emailSuppressed.isSuppressed) {
          errors.push(`Email is suppressed: ${emailSuppressed.reason}`);
        }

        // Domain validation for business rules
        const domain = email.split('@')[1]?.toLowerCase();
        if (domain) {
          metadata.emailDomain = domain;

          // Check for common typos
          const commonDomains = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com'];
          const typoPatterns = [
            { pattern: /gmai\.com$/, suggestion: 'gmail.com' },
            { pattern: /yahooo\.com$/, suggestion: 'yahoo.com' },
            { pattern: /hotmial\.com$/, suggestion: 'hotmail.com' },
          ];

          typoPatterns.forEach(({ pattern, suggestion }) => {
            if (pattern.test(domain)) {
              warnings.push(`Possible email typo: did you mean ${suggestion}?`);
            }
          });

          // Warn about disposable email domains
          const disposableDomains = [
            '10minutemail.com',
            'tempmail.org',
            'guerrillamail.com',
            'mailinator.com',
            'throwaway.email',
          ];

          if (disposableDomains.includes(domain)) {
            warnings.push('Email appears to be from a disposable email service');
          }
        }
      }

      // Phone validation
      if (phone) {
        // Check against suppression list
        const phoneSuppressed = await this.checkSuppressionStatus(
          phone,
          'SMS',
          businessContext?.businessId
        );

        if (phoneSuppressed.isSuppressed) {
          errors.push(`Phone number is suppressed: ${phoneSuppressed.reason}`);
        }

        // Validate phone format and region
        const cleanPhone = phone.replace(/[^\d+]/g, '');
        metadata.cleanPhone = cleanPhone;

        // Basic UK phone validation (since it's UK-focused)
        if (cleanPhone.startsWith('+44') || cleanPhone.startsWith('44')) {
          // UK number format validation
          if (cleanPhone.length < 12 || cleanPhone.length > 13) {
            warnings.push('UK phone number length appears incorrect');
          }
        } else if (cleanPhone.startsWith('0')) {
          // Domestic UK number
          if (cleanPhone.length !== 11) {
            warnings.push('UK domestic number should be 11 digits');
          }
        } else {
          warnings.push('Phone number format not recognized - verify for SMS delivery');
        }
      }

      return {
        isValid: errors.length === 0,
        errors,
        warnings,
        metadata,
      };
    } catch (error) {
      logger.error('Contact info validation failed', {
        businessId: businessContext?.businessId,
        hasEmail: !!email,
        hasPhone: !!phone,
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        isValid: false,
        errors: ['Contact validation system error'],
        warnings: [],
      };
    }
  }

  /**
   * Validate campaign frequency rules
   */
  async validateCampaignFrequency(
    customerId: string,
    channel: 'SMS' | 'EMAIL',
    businessContext: BusinessContext,
    proposedSendTime?: Date
  ): Promise<BusinessRuleResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const metadata: Record<string, any> = {};

    try {
      // Get recent campaign history
      const recentCampaigns = await prisma.reviewRequest.findMany({
        where: {
          customerId,
          channel,
          isActive: true,
          createdAt: {
            gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
          },
        },
        select: {
          id: true,
          status: true,
          createdAt: true,
          sentAt: true,
        },
        orderBy: { createdAt: 'desc' },
      });

      metadata.recentCampaignCount = recentCampaigns.length;

      // Check daily limits
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const campaignsToday = recentCampaigns.filter(campaign => {
        const campaignDate = new Date(campaign.createdAt);
        campaignDate.setHours(0, 0, 0, 0);
        return campaignDate.getTime() === today.getTime();
      });

      if (campaignsToday.length >= 3) {
        errors.push('Maximum 3 campaigns per customer per day exceeded');
      }

      // Check minimum interval between campaigns
      const lastCampaign = recentCampaigns[0];
      if (lastCampaign) {
        const lastSentTime = lastCampaign.sentAt || lastCampaign.createdAt;
        const minInterval = channel === 'SMS' ? 4 * 60 * 60 * 1000 : 2 * 60 * 60 * 1000; // 4h for SMS, 2h for email
        const timeSinceLastCampaign = Date.now() - lastSentTime.getTime();

        if (timeSinceLastCampaign < minInterval) {
          const hoursRemaining = Math.ceil(
            (minInterval - timeSinceLastCampaign) / (60 * 60 * 1000)
          );
          errors.push(
            `Must wait ${hoursRemaining} hours between ${channel} campaigns to same customer`
          );
        }
      }

      // Check weekly limits based on business tier
      const weeklyLimits = {
        free: { SMS: 5, EMAIL: 10 },
        starter: { SMS: 15, EMAIL: 30 },
        professional: { SMS: 50, EMAIL: 100 },
        enterprise: { SMS: 200, EMAIL: 500 },
      };

      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const campaignsThisWeek = recentCampaigns.filter(
        campaign => campaign.createdAt > weekAgo
      ).length;

      const weeklyLimit = weeklyLimits[businessContext.tier][channel];
      if (campaignsThisWeek >= weeklyLimit) {
        errors.push(`Weekly limit of ${weeklyLimit} ${channel} campaigns per customer exceeded`);
      }

      // Check for campaign fatigue patterns
      if (recentCampaigns.length >= 5) {
        const responseRate =
          recentCampaigns.filter(c => c.status === 'CLICKED' || c.status === 'COMPLETED').length /
          recentCampaigns.length;
        if (responseRate < 0.1) {
          warnings.push(
            'Low response rate detected - customer may be experiencing campaign fatigue'
          );
        }
      }

      return {
        isValid: errors.length === 0,
        errors,
        warnings,
        metadata,
      };
    } catch (error) {
      logger.error('Campaign frequency validation failed', {
        businessId: businessContext.businessId,
        customerId,
        channel,
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        isValid: false,
        errors: ['Campaign frequency validation system error'],
        warnings: [],
      };
    }
  }

  /**
   * Validate bulk operation limits
   */
  async validateBulkOperationLimits(
    operation: 'customer_import' | 'bulk_campaign' | 'bulk_export',
    itemCount: number,
    businessContext: BusinessContext
  ): Promise<BusinessRuleResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const metadata: Record<string, any> = { itemCount };

    try {
      // Check if bulk operations are allowed for tier
      if (!businessContext.features.bulkOperations && itemCount > 10) {
        errors.push('Bulk operations not available for your plan');
      }

      // Tier-based limits
      const bulkLimits = {
        free: { customer_import: 50, bulk_campaign: 10, bulk_export: 100 },
        starter: { customer_import: 200, bulk_campaign: 50, bulk_export: 500 },
        professional: { customer_import: 1000, bulk_campaign: 200, bulk_export: 2000 },
        enterprise: { customer_import: 10000, bulk_campaign: 1000, bulk_export: 10000 },
      };

      const limit = bulkLimits[businessContext.tier][operation];
      if (itemCount > limit) {
        errors.push(
          `Bulk operation limit exceeded: ${itemCount} > ${limit} for ${businessContext.tier} plan`
        );
      }

      // Warning thresholds
      if (itemCount > limit * 0.8) {
        warnings.push(`Approaching bulk operation limit (${itemCount}/${limit})`);
      }

      // Check daily bulk operation quota
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // This would require tracking bulk operations in the database
      // For now, we'll implement a simple check
      if (operation === 'bulk_campaign' && itemCount > 100) {
        warnings.push('Large bulk campaigns may take longer to process');
      }

      return {
        isValid: errors.length === 0,
        errors,
        warnings,
        metadata,
      };
    } catch (error) {
      logger.error('Bulk operation validation failed', {
        businessId: businessContext.businessId,
        operation,
        itemCount,
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        isValid: false,
        errors: ['Bulk operation validation system error'],
        warnings: [],
      };
    }
  }

  /**
   * Check suppression status for contact
   */
  private async checkSuppressionStatus(
    contact: string,
    channel: 'SMS' | 'EMAIL',
    businessId?: string
  ): Promise<{
    isSuppressed: boolean;
    reason?: string;
    expiresAt?: Date;
  }> {
    if (!businessId) {
      return { isSuppressed: false };
    }

    try {
      const suppression = await prisma.suppression.findFirst({
        where: {
          businessId,
          contact,
          OR: [
            { channel },
            { channel: null }, // Global suppression
          ],
          isActive: true,
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
        select: {
          reason: true,
          expiresAt: true,
        },
      });

      return {
        isSuppressed: !!suppression,
        reason: suppression?.reason,
        expiresAt: suppression?.expiresAt || undefined,
      };
    } catch (error) {
      logger.error('Suppression check failed', {
        businessId,
        contact: contact.substring(0, 5) + '***', // Partially mask for logging
        channel,
        error: error instanceof Error ? error.message : String(error),
      });

      return { isSuppressed: false };
    }
  }

  /**
   * Get business context for validation
   */
  async getBusinessContext(businessId: string): Promise<BusinessContext | null> {
    try {
      const business = await prisma.business.findUnique({
        where: { id: businessId },
        select: {
          id: true,
          timezone: true,
          smsCreditsUsed: true,
          smsCreditsLimit: true,
          emailCreditsUsed: true,
          emailCreditsLimit: true,
          isActive: true,
          _count: {
            select: {
              customers: { where: { isActive: true } },
            },
          },
        },
      });

      if (!business) {
        return null;
      }

      // Get campaign count for this month
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const campaignsThisMonth = await prisma.reviewRequest.count({
        where: {
          businessId,
          createdAt: { gte: startOfMonth },
        },
      });

      // Default business context (would be enhanced with actual tier/settings)
      return {
        businessId,
        tier: 'free', // This should be fetched from business record
        settings: {
          timezone: business.timezone,
          workingHours: { start: '09:00', end: '17:00' },
          allowWeekends: false,
          maxCampaignsPerDay: 10,
        },
        usage: {
          smsUsed: business.smsCreditsUsed,
          smsLimit: business.smsCreditsLimit,
          emailUsed: business.emailCreditsUsed,
          emailLimit: business.emailCreditsLimit,
          customersCount: business._count.customers,
          campaignsThisMonth,
        },
        features: {
          bulkOperations: true, // Should be based on tier
          advancedScheduling: true,
          customTemplates: false,
          analytics: true,
        },
      };
    } catch (error) {
      logger.error('Failed to get business context', {
        businessId,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }
}

// ==========================================
// MIDDLEWARE FUNCTIONS
// ==========================================

/**
 * Create business rules validation middleware
 */
export function createBusinessRulesMiddleware(
  validationRules: BusinessRuleType[],
  options: {
    skipIf?: (request: AuthenticatedRequest) => boolean;
    onFailure?: (request: AuthenticatedRequest, result: BusinessRuleResult) => void;
  } = {}
) {
  return async function businessRulesMiddleware(request: AuthenticatedRequest, reply: any) {
    try {
      const { skipIf, onFailure } = options;

      // Skip validation if condition met
      if (skipIf && skipIf(request)) {
        return;
      }

      const businessId = request.businessId;
      if (!businessId) {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'MISSING_BUSINESS_CONTEXT',
            message: 'Business context required for validation',
          },
        });
      }

      const validator = new BusinessRulesValidator();
      const businessContext = await validator.getBusinessContext(businessId);

      if (!businessContext) {
        return reply.status(404).send({
          success: false,
          error: {
            code: 'BUSINESS_NOT_FOUND',
            message: 'Business not found',
          },
        });
      }

      // Store business context in request for use by route handlers
      (request as any).businessContext = businessContext;
      (request as any).businessRulesValidator = validator;
    } catch (error) {
      logger.error('Business rules middleware error', {
        businessId: request.businessId,
        error: error instanceof Error ? error.message : String(error),
      });

      return reply.status(500).send({
        success: false,
        error: {
          code: 'BUSINESS_RULES_ERROR',
          message: 'Business rules validation system error',
        },
      });
    }
  };
}

// ==========================================
// SINGLETON INSTANCE
// ==========================================

let globalValidator: BusinessRulesValidator | null = null;

/**
 * Get global business rules validator
 */
export function getBusinessRulesValidator(): BusinessRulesValidator {
  if (!globalValidator) {
    globalValidator = new BusinessRulesValidator();
  }
  return globalValidator;
}
