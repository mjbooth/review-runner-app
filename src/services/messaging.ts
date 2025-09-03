import type { RequestChannel } from '@prisma/client';
import { logger } from '../lib/logger';
import { generateUnsubscribeUrl } from '../lib/utils';
import type { Result } from '../types/database';
import sgMail from '@sendgrid/mail';

export interface MessageTemplate {
  content: string;
  subject?: string;
}

export interface PersonalizationData {
  customer: {
    firstName: string;
    lastName?: string;
  };
  business: {
    name: string;
  };
  reviewUrl: string;
  trackingUrl: string;
  unsubscribeUrl?: string;
}

export interface RenderedMessage {
  content: string;
  subject?: string;
  trackingUrl: string;
  unsubscribeUrl?: string;
}

// SendGrid Types
export interface SendGridConfig {
  apiKey: string;
  fromEmail: string;
  fromName: string;
  replyTo?: string;
  enableOpenTracking?: boolean;
  enableClickTracking?: boolean;
  maxRetries?: number;
  timeoutMs?: number;
}

export interface EmailAddress {
  email: string;
  name?: string;
}

export interface EmailContent {
  type: 'text/plain' | 'text/html';
  value: string;
}

export interface SendGridEmailData {
  personalizations: {
    to: EmailAddress[];
    subject: string;
    custom_args?: Record<string, string>;
  }[];
  from: EmailAddress;
  reply_to?: EmailAddress;
  content: EmailContent[];
  tracking_settings?: {
    click_tracking?: { enable: boolean; enable_text: boolean };
    open_tracking?: { enable: boolean; substitution_tag?: string };
  };
  custom_args?: Record<string, string>;
}

export interface SendGridResponse {
  statusCode: number;
  body: string;
  headers: Record<string, string>;
}

export interface EmailDeliveryResult {
  success: boolean;
  messageId?: string;
  error?: string;
  statusCode?: number;
  deliveryTime?: number;
  retryCount?: number;
}

export interface EmailEventData {
  email: string;
  event:
    | 'processed'
    | 'delivered'
    | 'open'
    | 'click'
    | 'bounce'
    | 'dropped'
    | 'spamreport'
    | 'unsubscribe';
  timestamp: number;
  sg_message_id: string;
  ip?: string;
  useragent?: string;
  url?: string;
  reason?: string;
}

const DEFAULT_SMS_TEMPLATE = `Hi {{firstName}}, {{businessName}} would love your feedback! Please leave us a review: {{reviewUrl}}

Reply STOP to opt out.`;

const DEFAULT_EMAIL_TEMPLATE = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Share Your Experience</title>
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f9f9f9;
        }
        .container {
            background: white;
            border-radius: 12px;
            padding: 40px;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        }
        .header {
            text-align: center;
            margin-bottom: 30px;
        }
        .button {
            display: inline-block;
            background: #0ea5e9;
            color: white;
            padding: 16px 32px;
            text-decoration: none;
            border-radius: 8px;
            font-weight: bold;
            margin: 20px 0;
        }
        .footer {
            margin-top: 40px;
            padding-top: 20px;
            border-top: 1px solid #eee;
            font-size: 14px;
            color: #666;
            text-align: center;
        }
        .unsubscribe {
            font-size: 12px;
            color: #999;
            text-align: center;
            margin-top: 20px;
        }
        .unsubscribe a {
            color: #999;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h2>Hi {{firstName}},</h2>
            <p>Thank you for choosing {{businessName}}!</p>
        </div>
        
        <p>We hope you had a great experience with us. Your feedback means everything to us and helps other customers make informed decisions.</p>
        
        <p>Would you mind taking a moment to share your experience?</p>
        
        <div style="text-align: center;">
            <a href="{{trackingUrl}}" class="button">Leave a Review</a>
        </div>
        
        <p>Thank you for your time!</p>
        
        <div class="footer">
            <p>Best regards,<br>The {{businessName}} Team</p>
        </div>
        
        <div class="unsubscribe">
            <p>
                Don't want to receive these emails? 
                <a href="{{unsubscribeUrl}}">Unsubscribe here</a>
            </p>
        </div>
    </div>
</body>
</html>`;

const DEFAULT_EMAIL_SUBJECT = 'Share your experience with {{businessName}}';

/**
 * Template variable replacements
 */
function replaceVariables(template: string, data: PersonalizationData): string {
  const { customer, business, reviewUrl, trackingUrl, unsubscribeUrl } = data;

  return template
    .replace(/\{\{firstName\}\}/g, customer.firstName)
    .replace(/\{\{lastName\}\}/g, customer.lastName || '')
    .replace(/\{\{fullName\}\}/g, `${customer.firstName} ${customer.lastName || ''}`.trim())
    .replace(/\{\{businessName\}\}/g, business.name)
    .replace(/\{\{reviewUrl\}\}/g, reviewUrl)
    .replace(/\{\{trackingUrl\}\}/g, trackingUrl)
    .replace(/\{\{unsubscribeUrl\}\}/g, unsubscribeUrl || '#');
}

/**
 * Render a message template with personalization data
 */
export async function renderMessage(
  template: MessageTemplate,
  data: PersonalizationData,
  channel: RequestChannel
): Promise<Result<RenderedMessage>> {
  try {
    const { customer, business } = data;

    // Validate required data
    if (!customer.firstName) {
      return { success: false, error: 'Customer first name is required for personalization' };
    }

    if (!business.name) {
      return { success: false, error: 'Business name is required for personalization' };
    }

    // Use provided template or default
    const messageContent =
      template.content || (channel === 'SMS' ? DEFAULT_SMS_TEMPLATE : DEFAULT_EMAIL_TEMPLATE);

    const subject = template.subject || (channel === 'EMAIL' ? DEFAULT_EMAIL_SUBJECT : undefined);

    // Render content
    const renderedContent = replaceVariables(messageContent, data);
    const renderedSubject = subject ? replaceVariables(subject, data) : undefined;

    // Validate rendered message length for SMS
    if (channel === 'SMS') {
      const maxLength = 1600; // SMS character limit
      if (renderedContent.length > maxLength) {
        logger.warn('SMS message exceeds character limit', {
          length: renderedContent.length,
          maxLength,
          customer: customer.firstName,
        });

        return {
          success: false,
          error: `SMS message too long (${renderedContent.length} characters, max ${maxLength})`,
        };
      }
    }

    return {
      success: true,
      data: {
        content: renderedContent,
        subject: renderedSubject,
        trackingUrl: data.trackingUrl,
        unsubscribeUrl: data.unsubscribeUrl,
      },
    };
  } catch (error) {
    logger.error('Failed to render message template', {
      channel,
      customer: data.customer.firstName,
      error,
    });

    return {
      success: false,
      error: 'Failed to render message template',
    };
  }
}

/**
 * Create personalization data from database records
 */
export function createPersonalizationData(
  customer: { firstName: string; lastName?: string | null },
  business: { name: string },
  reviewUrl: string,
  trackingUrl: string,
  trackingUuid: string,
  baseUrl: string = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
): PersonalizationData {
  return {
    customer: {
      firstName: customer.firstName,
      lastName: customer.lastName || undefined,
    },
    business: {
      name: business.name,
    },
    reviewUrl,
    trackingUrl,
    unsubscribeUrl: generateUnsubscribeUrl(baseUrl, trackingUuid),
  };
}

/**
 * Validate message template for potential issues
 */
export function validateMessageTemplate(
  template: MessageTemplate,
  channel: RequestChannel
): Result<{ warnings: string[] }> {
  const warnings: string[] = [];

  try {
    // Check for required placeholders
    const requiredPlaceholders = ['{{firstName}}', '{{businessName}}'];
    const channelPlaceholders = channel === 'SMS' ? ['{{reviewUrl}}'] : ['{{trackingUrl}}'];

    const allRequired = [...requiredPlaceholders, ...channelPlaceholders];

    for (const placeholder of allRequired) {
      if (!template.content.includes(placeholder)) {
        warnings.push(`Missing required placeholder: ${placeholder}`);
      }
    }

    // Channel-specific validations
    if (channel === 'SMS') {
      if (template.content.length > 1600) {
        warnings.push(`SMS template may be too long (${template.content.length} characters)`);
      }

      if (!template.content.includes('STOP')) {
        warnings.push('SMS template should include opt-out instructions (STOP)');
      }
    } else if (channel === 'EMAIL') {
      if (!template.subject) {
        warnings.push('Email template should include a subject line');
      }

      if (!template.content.includes('{{unsubscribeUrl}}')) {
        warnings.push('Email template should include unsubscribe link');
      }

      if (
        template.content.includes('{{reviewUrl}}') &&
        template.content.includes('{{trackingUrl}}')
      ) {
        warnings.push('Email template should use either reviewUrl or trackingUrl, not both');
      }
    }

    return { success: true, data: { warnings } };
  } catch (error) {
    logger.error('Failed to validate message template', { template, channel, error });
    return { success: false, error: 'Failed to validate template' };
  }
}

/**
 * Generate preview of rendered message with sample data
 */
export async function generateMessagePreview(
  template: MessageTemplate,
  channel: RequestChannel,
  businessName: string = 'Sample Business'
): Promise<Result<RenderedMessage>> {
  const sampleData: PersonalizationData = {
    customer: {
      firstName: 'John',
      lastName: 'Smith',
    },
    business: {
      name: businessName,
    },
    reviewUrl: 'https://example.com/review',
    trackingUrl: 'https://example.com/r/sample-uuid',
    unsubscribeUrl: 'https://example.com/r/unsubscribe/sample-uuid',
  };

  return await renderMessage(template, sampleData, channel);
}

/**
 * Extract and sanitize text content from HTML (for email previews)
 */
export function extractTextFromHtml(html: string): string {
  return html
    .replace(/<style[^>]*>.*?<\/style>/gis, '') // Remove style blocks
    .replace(/<script[^>]*>.*?<\/script>/gis, '') // Remove script blocks
    .replace(/<[^>]*>/g, '') // Remove HTML tags
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();
}

/**
 * Get default templates for a channel
 */
export function getDefaultTemplate(channel: RequestChannel): MessageTemplate {
  if (channel === 'SMS') {
    return {
      content: DEFAULT_SMS_TEMPLATE,
    };
  } else {
    return {
      content: DEFAULT_EMAIL_TEMPLATE,
      subject: DEFAULT_EMAIL_SUBJECT,
    };
  }
}

/**
 * SendGrid Email Service Class
 */
export class SendGridService {
  private config: SendGridConfig;
  private initialized: boolean = false;
  private retryDelays: number[] = [1000, 3000, 5000]; // ms delays between retries
  private rateLimitTracker: Map<string, { count: number; resetTime: number }> = new Map();

  // SendGrid plan limits (requests per second)
  private readonly RATE_LIMITS = {
    free: 100, // 100 emails/day
    essentials: 40000, // 40,000 emails/month
    pro: 100000, // 100,000 emails/month
    premier: 1500000, // 1.5M emails/month
  };

  constructor(config?: Partial<SendGridConfig>) {
    this.config = {
      apiKey: process.env.SENDGRID_API_KEY || '',
      fromEmail: process.env.SENDGRID_FROM_EMAIL || 'noreply@reviewrunner.co.uk',
      fromName: process.env.SENDGRID_FROM_NAME || 'Review Runner',
      replyTo: process.env.SENDGRID_REPLY_TO,
      enableOpenTracking: true,
      enableClickTracking: true,
      maxRetries: 3,
      timeoutMs: 30000,
      ...config,
    };
  }

  /**
   * Check and enforce rate limiting based on SendGrid plan
   */
  private checkRateLimit(businessId: string): boolean {
    const now = Date.now();
    const hour = Math.floor(now / (1000 * 60 * 60)); // Current hour bucket
    const key = `${businessId}-${hour}`;

    const current = this.rateLimitTracker.get(key) || { count: 0, resetTime: now + 60 * 60 * 1000 };

    // Clean up old entries (older than 2 hours)
    for (const [k, v] of this.rateLimitTracker.entries()) {
      if (v.resetTime < now - 2 * 60 * 60 * 1000) {
        this.rateLimitTracker.delete(k);
      }
    }

    // For MVP, assume essentials plan (40k/month = ~55/hour average, but allow bursts)
    const hourlyLimit = 200; // Conservative limit to prevent hitting monthly cap

    if (current.count >= hourlyLimit) {
      logger.warn('SendGrid rate limit reached', {
        businessId,
        currentCount: current.count,
        hourlyLimit,
        resetTime: new Date(current.resetTime).toISOString(),
      });
      return false;
    }

    current.count++;
    this.rateLimitTracker.set(key, current);
    return true;
  }

  /**
   * Validate and sanitize HTML content, with plain text fallback
   */
  private validateEmailContent(htmlContent: string): {
    htmlContent: string;
    textContent: string;
    isValid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];
    let isValid = true;
    let processedHtml = htmlContent;
    let textContent = '';

    try {
      // Basic HTML validation
      if (!htmlContent.trim()) {
        errors.push('Email content is empty');
        isValid = false;
        return { htmlContent: '', textContent: '', isValid, errors };
      }

      // Check for basic HTML structure
      const hasHtmlTags = /<[^>]+>/.test(htmlContent);

      if (hasHtmlTags) {
        // Validate HTML structure
        const hasBody = /<body[^>]*>/i.test(htmlContent) || !/<html[^>]*>/i.test(htmlContent);
        const hasValidStructure = htmlContent.includes('{{') || htmlContent.length > 0;

        if (!hasValidStructure) {
          errors.push('Invalid HTML structure detected');
        }

        // Check for potentially problematic content
        if (htmlContent.includes('<script')) {
          errors.push('Script tags not allowed in email content');
          processedHtml = htmlContent.replace(/<script[^>]*>.*?<\/script>/gis, '');
        }

        if (htmlContent.includes('<iframe')) {
          errors.push('Iframe tags not supported in email');
          processedHtml = processedHtml.replace(/<iframe[^>]*>.*?<\/iframe>/gis, '');
        }

        // Generate text content from HTML using the existing function
        textContent = extractTextFromHtml(processedHtml);
      } else {
        // Plain text content
        textContent = htmlContent.trim();
        // Wrap plain text in basic HTML for consistency
        processedHtml = `<html><body><pre>${htmlContent.replace(/\n/g, '<br>')}</pre></body></html>`;
      }

      // Validate content length (SendGrid limits)
      if (processedHtml.length > 1048576) {
        // 1MB limit
        errors.push('HTML content exceeds 1MB limit');
        isValid = false;
      }

      if (textContent.length > 1048576) {
        errors.push('Text content exceeds 1MB limit');
        isValid = false;
      }

      // Check for template variables that should be replaced
      const unreplacedVars = (processedHtml.match(/{{[^}]+}}/g) || []).filter(
        v => !['{{unsubscribeUrl}}', '{{trackingUrl}}'].includes(v)
      );

      if (unreplacedVars.length > 0) {
        logger.warn('Unreplaced template variables detected', {
          variables: unreplacedVars,
          contentSample: processedHtml.substring(0, 200),
        });
        // This is a warning, not an error - variables might be intentional
      }
    } catch (error) {
      logger.error('Email content validation failed', { error, contentLength: htmlContent.length });
      errors.push('Content validation failed');
      isValid = false;

      // Fallback to plain text
      textContent = extractTextFromHtml(htmlContent);
      processedHtml = `<html><body><pre>${textContent}</pre></body></html>`;
    }

    return {
      htmlContent: processedHtml,
      textContent,
      isValid,
      errors,
    };
  }

  /**
   * Parse SendGrid-specific error codes and provide actionable messages
   */
  private parseSendGridError(error: any): { code: string; message: string; isRetryable: boolean } {
    const statusCode = error?.response?.statusCode || error?.code;
    const responseBody = error?.response?.body;
    const errors = responseBody?.errors || [];

    // Map SendGrid error codes to actionable messages
    const sendGridErrors: Record<number, { message: string; isRetryable: boolean }> = {
      400: { message: 'Invalid request data - check email format and content', isRetryable: false },
      401: {
        message: 'Invalid API key - check SENDGRID_API_KEY configuration',
        isRetryable: false,
      },
      403: {
        message: 'Forbidden - insufficient permissions or suspended account',
        isRetryable: false,
      },
      413: { message: 'Request too large - reduce email content size', isRetryable: false },
      429: { message: 'Rate limit exceeded - too many requests', isRetryable: true },
      500: { message: 'SendGrid server error - temporary issue', isRetryable: true },
      502: { message: 'SendGrid gateway error - temporary connectivity issue', isRetryable: true },
      503: { message: 'SendGrid service unavailable - temporary outage', isRetryable: true },
      504: { message: 'SendGrid gateway timeout - request took too long', isRetryable: true },
    };

    const errorInfo = sendGridErrors[statusCode] || {
      message: `Unknown SendGrid error (${statusCode})`,
      isRetryable: false,
    };

    // Extract specific error details from SendGrid response
    let detailedMessage = errorInfo.message;
    if (errors.length > 0) {
      const specificError = errors[0];
      detailedMessage = `${errorInfo.message}: ${specificError.message || specificError.field}`;

      // Check for specific field errors
      if (specificError.field === 'from.email') {
        detailedMessage = 'Invalid sender email address - verify SENDGRID_FROM_EMAIL';
      } else if (specificError.field === 'personalizations.to') {
        detailedMessage = 'Invalid recipient email address format';
      } else if (specificError.field === 'content') {
        detailedMessage = 'Invalid email content - check HTML format and size';
      }
    }

    return {
      code: `SENDGRID_${statusCode}`,
      message: detailedMessage,
      isRetryable: errorInfo.isRetryable,
    };
  }

  /**
   * Initialize SendGrid service with API key validation
   */
  async initialize(): Promise<Result<boolean>> {
    try {
      if (!this.config.apiKey) {
        return {
          success: false,
          error: 'SendGrid API key not configured. Set SENDGRID_API_KEY environment variable.',
        };
      }

      if (!this.config.fromEmail) {
        return {
          success: false,
          error:
            'SendGrid from email not configured. Set SENDGRID_FROM_EMAIL environment variable.',
        };
      }

      // Set API key and mark as initialized
      try {
        sgMail.setApiKey(this.config.apiKey);
        this.initialized = true;

        logger.info('SendGrid service initialized successfully', {
          fromEmail: this.config.fromEmail,
          fromName: this.config.fromName,
          trackingEnabled: {
            open: this.config.enableOpenTracking,
            click: this.config.enableClickTracking,
          },
        });

        return { success: true, data: true };
      } catch (apiError: any) {
        logger.error('SendGrid API key validation failed', {
          error: apiError?.response?.body || apiError.message,
          statusCode: apiError?.response?.statusCode,
        });

        return {
          success: false,
          error: `SendGrid API key validation failed: ${apiError?.response?.body?.errors?.[0]?.message || apiError.message}`,
        };
      }
    } catch (error) {
      logger.error('SendGrid service initialization failed', { error });
      return {
        success: false,
        error: 'Failed to initialize SendGrid service',
      };
    }
  }

  /**
   * Send a single email with comprehensive validation, rate limiting, and retry logic
   */
  async sendEmail(emailData: {
    to: EmailAddress;
    subject: string;
    htmlContent: string;
    textContent?: string;
    customArgs?: Record<string, string>;
    businessId?: string;
    requestId?: string;
  }): Promise<EmailDeliveryResult> {
    const startTime = Date.now();

    if (!this.initialized) {
      const initResult = await this.initialize();
      if (!initResult.success) {
        return {
          success: false,
          error: initResult.error,
          deliveryTime: Date.now() - startTime,
          retryCount: 0,
        };
      }
    }

    // Check rate limits
    if (emailData.businessId && !this.checkRateLimit(emailData.businessId)) {
      return {
        success: false,
        error: 'Rate limit exceeded - too many emails sent this hour',
        statusCode: 429,
        deliveryTime: Date.now() - startTime,
        retryCount: 0,
      };
    }

    // Validate email address format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(emailData.to.email)) {
      return {
        success: false,
        error: `Invalid recipient email address: ${emailData.to.email}`,
        deliveryTime: Date.now() - startTime,
        retryCount: 0,
      };
    }

    // Validate and process email content
    const contentValidation = this.validateEmailContent(emailData.htmlContent);
    if (!contentValidation.isValid) {
      logger.error('Email content validation failed', {
        errors: contentValidation.errors,
        businessId: emailData.businessId,
        requestId: emailData.requestId,
      });

      // Try to use the sanitized version if available
      if (contentValidation.htmlContent && contentValidation.textContent) {
        logger.warn('Using sanitized email content after validation errors', {
          originalErrors: contentValidation.errors,
          businessId: emailData.businessId,
        });
      } else {
        return {
          success: false,
          error: `Email content validation failed: ${contentValidation.errors.join(', ')}`,
          deliveryTime: Date.now() - startTime,
          retryCount: 0,
        };
      }
    }

    // Use validated and sanitized content
    const finalHtmlContent = contentValidation.htmlContent;
    const finalTextContent = emailData.textContent || contentValidation.textContent;

    // Build SendGrid email payload with validated content
    const sendGridEmail: SendGridEmailData = {
      personalizations: [
        {
          to: [emailData.to],
          subject: emailData.subject.substring(0, 998), // SendGrid subject line limit
          custom_args: {
            ...emailData.customArgs,
            businessId: emailData.businessId || 'unknown',
            requestId: emailData.requestId || 'unknown',
            timestamp: Date.now().toString(),
            contentValidated: contentValidation.isValid.toString(),
            hasTemplateVars: (finalHtmlContent.match(/{{[^}]+}}/g) || []).length.toString(),
          },
        },
      ],
      from: {
        email: this.config.fromEmail,
        name: this.config.fromName,
      },
      content: [],
      tracking_settings: {
        click_tracking: {
          enable: this.config.enableClickTracking || false,
          enable_text: true,
        },
        open_tracking: {
          enable: this.config.enableOpenTracking || false,
        },
      },
    };

    // Always include text content first (SendGrid recommendation)
    sendGridEmail.content.push({
      type: 'text/plain',
      value: finalTextContent,
    });

    // Add HTML content if available and different from text
    if (finalHtmlContent && finalHtmlContent.trim() !== finalTextContent.trim()) {
      sendGridEmail.content.push({
        type: 'text/html',
        value: finalHtmlContent,
      });
    }

    // Add reply-to if configured
    if (this.config.replyTo) {
      sendGridEmail.reply_to = {
        email: this.config.replyTo,
      };
    }

    // Attempt delivery with retry logic
    let lastError: any = null;
    for (let attempt = 0; attempt <= (this.config.maxRetries || 3); attempt++) {
      try {
        logger.info('Sending email via SendGrid', {
          attempt: attempt + 1,
          to: emailData.to.email,
          subject: emailData.subject,
          businessId: emailData.businessId,
          requestId: emailData.requestId,
        });

        const [response] = await sgMail.send(sendGridEmail);
        const messageId = response.headers['x-message-id'] || response.messageId;

        logger.info('Email sent successfully via SendGrid', {
          messageId,
          to: emailData.to.email,
          statusCode: response.statusCode,
          deliveryTime: Date.now() - startTime,
          attempt: attempt + 1,
          businessId: emailData.businessId,
          requestId: emailData.requestId,
        });

        return {
          success: true,
          messageId,
          statusCode: response.statusCode,
          deliveryTime: Date.now() - startTime,
          retryCount: attempt,
        };
      } catch (error: any) {
        lastError = error;
        const isLastAttempt = attempt === (this.config.maxRetries || 3);
        const parsedError = this.parseSendGridError(error);

        logger.warn('Email sending attempt failed', {
          attempt: attempt + 1,
          errorCode: parsedError.code,
          errorMessage: parsedError.message,
          isRetryable: parsedError.isRetryable,
          statusCode: error?.response?.statusCode,
          to: emailData.to.email,
          isLastAttempt,
          businessId: emailData.businessId,
          requestId: emailData.requestId,
          sendGridResponse: error?.response?.body,
        });

        // Don't retry on non-retryable errors
        if (!parsedError.isRetryable) {
          logger.error('Non-retryable SendGrid error, stopping attempts', {
            errorCode: parsedError.code,
            errorMessage: parsedError.message,
            attempt: attempt + 1,
            to: emailData.to.email,
          });
          break;
        }

        // For rate limit errors, use longer delay
        const delay =
          parsedError.code === 'SENDGRID_429'
            ? Math.min(this.retryDelays[attempt] * 3, 15000) // Up to 15 seconds for rate limits
            : this.retryDelays[attempt];

        // Wait before retry (except on last attempt)
        if (!isLastAttempt && delay) {
          logger.info('Waiting before retry', {
            delay,
            attempt: attempt + 1,
            errorCode: parsedError.code,
          });
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    // All retries failed
    logger.error('Email delivery failed after all retry attempts', {
      error: lastError?.response?.body || lastError?.message,
      statusCode: lastError?.response?.statusCode,
      to: emailData.to.email,
      deliveryTime: Date.now() - startTime,
      totalAttempts: (this.config.maxRetries || 3) + 1,
      businessId: emailData.businessId,
      requestId: emailData.requestId,
    });

    return {
      success: false,
      error:
        lastError?.response?.body?.errors?.[0]?.message ||
        lastError?.message ||
        'Unknown SendGrid error',
      statusCode: lastError?.response?.statusCode,
      deliveryTime: Date.now() - startTime,
      retryCount: this.config.maxRetries || 3,
    };
  }

  /**
   * Send review request email using existing template system
   */
  async sendReviewRequestEmail(
    customerEmail: string,
    customerName: string,
    renderedMessage: RenderedMessage,
    businessId: string,
    requestId: string
  ): Promise<EmailDeliveryResult> {
    try {
      const result = await this.sendEmail({
        to: {
          email: customerEmail,
          name: customerName,
        },
        subject: renderedMessage.subject || 'Share your experience with us',
        htmlContent: renderedMessage.content,
        textContent: extractTextFromHtml(renderedMessage.content),
        customArgs: {
          type: 'review_request',
          trackingUrl: renderedMessage.trackingUrl,
          unsubscribeUrl: renderedMessage.unsubscribeUrl || '',
        },
        businessId,
        requestId,
      });

      return result;
    } catch (error) {
      logger.error('Review request email sending failed', {
        error,
        customerEmail,
        businessId,
        requestId,
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        deliveryTime: 0,
        retryCount: 0,
      };
    }
  }

  /**
   * Send follow-up email campaign
   */
  async sendFollowUpEmail(
    customerEmail: string,
    customerName: string,
    followUpContent: string,
    subject: string,
    businessId: string,
    requestId: string
  ): Promise<EmailDeliveryResult> {
    try {
      const result = await this.sendEmail({
        to: {
          email: customerEmail,
          name: customerName,
        },
        subject,
        htmlContent: followUpContent,
        textContent: extractTextFromHtml(followUpContent),
        customArgs: {
          type: 'follow_up',
        },
        businessId,
        requestId,
      });

      return result;
    } catch (error) {
      logger.error('Follow-up email sending failed', {
        error,
        customerEmail,
        businessId,
        requestId,
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        deliveryTime: 0,
        retryCount: 0,
      };
    }
  }

  /**
   * Process SendGrid webhook events
   */
  async processWebhookEvent(eventData: EmailEventData): Promise<Result<{ processed: boolean }>> {
    try {
      logger.info('Processing SendGrid webhook event', {
        event: eventData.event,
        email: eventData.email,
        messageId: eventData.sg_message_id,
        timestamp: eventData.timestamp,
      });

      // TODO: Update review request status based on event type
      // This would typically update the database record with delivery status

      switch (eventData.event) {
        case 'processed':
          logger.info('Email processed by SendGrid', { messageId: eventData.sg_message_id });
          break;
        case 'delivered':
          logger.info('Email delivered successfully', {
            messageId: eventData.sg_message_id,
            email: eventData.email,
          });
          break;
        case 'open':
          logger.info('Email opened by recipient', {
            messageId: eventData.sg_message_id,
            email: eventData.email,
            ip: eventData.ip,
            useragent: eventData.useragent,
          });
          break;
        case 'click':
          logger.info('Email link clicked by recipient', {
            messageId: eventData.sg_message_id,
            email: eventData.email,
            url: eventData.url,
            ip: eventData.ip,
          });
          break;
        case 'bounce':
        case 'dropped':
          logger.warn('Email delivery failed', {
            messageId: eventData.sg_message_id,
            email: eventData.email,
            event: eventData.event,
            reason: eventData.reason,
          });
          break;
        case 'spamreport':
        case 'unsubscribe':
          logger.warn('Email marked as spam or unsubscribed', {
            messageId: eventData.sg_message_id,
            email: eventData.email,
            event: eventData.event,
          });
          break;
        default:
          logger.info('Unknown SendGrid event type', { event: eventData.event });
      }

      return { success: true, data: { processed: true } };
    } catch (error) {
      logger.error('Failed to process SendGrid webhook event', {
        error,
        eventData,
      });

      return {
        success: false,
        error: 'Failed to process webhook event',
      };
    }
  }

  /**
   * Get service health status
   */
  async getHealthStatus(): Promise<
    Result<{
      status: 'healthy' | 'unhealthy';
      initialized: boolean;
      apiKeyValid: boolean;
      config: Omit<SendGridConfig, 'apiKey'>;
    }>
  > {
    try {
      const initResult = await this.initialize();

      return {
        success: true,
        data: {
          status: initResult.success ? 'healthy' : 'unhealthy',
          initialized: this.initialized,
          apiKeyValid: initResult.success,
          config: {
            fromEmail: this.config.fromEmail,
            fromName: this.config.fromName,
            replyTo: this.config.replyTo,
            enableOpenTracking: this.config.enableOpenTracking,
            enableClickTracking: this.config.enableClickTracking,
            maxRetries: this.config.maxRetries,
            timeoutMs: this.config.timeoutMs,
          },
        },
      };
    } catch (error) {
      return {
        success: false,
        error: 'Failed to check health status',
      };
    }
  }
}

// Export singleton instance
export const sendGridService = new SendGridService();
