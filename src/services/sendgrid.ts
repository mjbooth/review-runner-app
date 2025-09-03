import sgMail from '@sendgrid/mail';
import { logger, loggers } from '../lib/logger';
import { getRequiredEnvVar, isValidEmail } from '../lib/utils';
import type { Result } from '../types/database';
import type {
  SendGridEmailRequest,
  SendGridEmailResponse,
  SendGridWebhookEvent,
} from '../types/external';

// Initialize SendGrid
let isInitialized = false;

/**
 * Initialize SendGrid client
 */
function initializeSendGrid(): void {
  if (!isInitialized) {
    const apiKey = getRequiredEnvVar('SENDGRID_API_KEY');
    sgMail.setApiKey(apiKey);
    isInitialized = true;

    logger.info('SendGrid client initialized');
  }
}

/**
 * Send email via SendGrid
 */
export async function sendEmail(
  request: SendGridEmailRequest,
  metadata?: { requestId?: string; businessId?: string }
): Promise<Result<SendGridEmailResponse>> {
  try {
    initializeSendGrid();

    const { to, from, subject, content, trackingSettings, customArgs } = request;

    loggers.external.sendgridRequest({
      to: to.email.slice(0, 5) + '***',
      subject,
      requestId: metadata?.requestId,
      businessId: metadata?.businessId,
    });

    // Validate email addresses
    if (!isValidEmail(to.email)) {
      return { success: false, error: 'Invalid recipient email address' };
    }

    if (!isValidEmail(from.email)) {
      return { success: false, error: 'Invalid sender email address' };
    }

    // Prepare email data
    const emailData = {
      to: {
        email: to.email,
        name: to.name,
      },
      from: {
        email: from.email,
        name: from.name || getRequiredEnvVar('SENDGRID_FROM_NAME'),
      },
      subject,
      content,
      trackingSettings: {
        clickTracking: {
          enable: true,
          enableText: false,
        },
        openTracking: {
          enable: true,
        },
        ...trackingSettings,
      },
      customArgs: {
        source: 'review-runner',
        ...customArgs,
        ...(metadata?.requestId && { requestId: metadata.requestId }),
        ...(metadata?.businessId && { businessId: metadata.businessId }),
      },
    };

    // Send email
    const [response] = await sgMail.send(emailData);

    const result: SendGridEmailResponse = {
      statusCode: response.statusCode,
      body: response.body,
      headers: response.headers,
    };

    loggers.external.sendgridResponse({
      statusCode: response.statusCode,
      requestId: metadata?.requestId,
      businessId: metadata?.businessId,
    });

    logger.info('Email sent successfully', {
      to: to.email.slice(0, 5) + '***',
      subject: subject.slice(0, 50),
      statusCode: response.statusCode,
      requestId: metadata?.requestId,
    });

    return { success: true, data: result };
  } catch (error) {
    const sgError = error as any;
    const statusCode = sgError.code || sgError.statusCode;
    const message = sgError.message || 'Unknown SendGrid error';
    const body = sgError.response?.body;

    loggers.external.sendgridResponse({
      statusCode: statusCode || 500,
      requestId: metadata?.requestId,
      businessId: metadata?.businessId,
      error: message,
    });

    logger.error('Failed to send email', {
      to: request.to.email.slice(0, 5) + '***',
      subject: request.subject.slice(0, 50),
      statusCode,
      error: message,
      body,
      requestId: metadata?.requestId,
    });

    // Handle specific SendGrid error codes
    if (statusCode) {
      const friendlyError = getSendGridErrorMessage(statusCode, message);
      return { success: false, error: friendlyError };
    }

    return {
      success: false,
      error: `Email sending failed: ${message}`,
    };
  }
}

/**
 * Get user-friendly error messages for common SendGrid error codes
 */
function getSendGridErrorMessage(statusCode: number, originalMessage: string): string {
  const errorMap: Record<number, string> = {
    400: 'Invalid email request format',
    401: 'SendGrid API authentication failed',
    403: 'SendGrid API access forbidden - check permissions',
    413: 'Email content too large',
    429: 'Rate limit exceeded - too many emails sent',
    500: 'SendGrid server error',
    502: 'SendGrid service temporarily unavailable',
    503: 'SendGrid service temporarily unavailable',
  };

  const friendlyMessage = errorMap[statusCode];
  return friendlyMessage || `Email delivery failed: ${originalMessage} (${statusCode})`;
}

/**
 * Handle SendGrid webhook events
 */
export async function handleSendGridWebhook(
  events: SendGridWebhookEvent[]
): Promise<Result<{ processedEvents: number; errors: string[] }>> {
  try {
    if (!Array.isArray(events)) {
      return { success: false, error: 'Invalid webhook payload format' };
    }

    logger.info('SendGrid webhook received', { eventCount: events.length });

    const errors: string[] = [];
    let processedEvents = 0;

    for (const event of events) {
      try {
        const {
          sg_message_id: messageId,
          event: eventType,
          email,
          timestamp,
          reason,
          url,
          useragent,
          ip,
        } = event;

        if (!messageId) {
          errors.push('Event missing sg_message_id');
          continue;
        }

        logger.info('Processing SendGrid event', {
          messageId: messageId.slice(0, 20) + '***',
          eventType,
          email: email?.slice(0, 5) + '***',
          timestamp,
        });

        // Process different event types
        switch (eventType) {
          case 'delivered':
            logger.info('Email delivered', { messageId, email: email?.slice(0, 5) + '***' });
            break;

          case 'bounce':
          case 'dropped':
            logger.warn('Email bounced/dropped', {
              messageId,
              email: email?.slice(0, 5) + '***',
              reason,
            });
            break;

          case 'click':
            logger.info('Email clicked', {
              messageId,
              email: email?.slice(0, 5) + '***',
              url: url?.slice(0, 50),
            });
            break;

          case 'open':
            logger.info('Email opened', {
              messageId,
              email: email?.slice(0, 5) + '***',
              useragent: useragent?.slice(0, 50),
              ip,
            });
            break;

          case 'unsubscribe':
          case 'group_unsubscribe':
            logger.info('Email unsubscribed', {
              messageId,
              email: email?.slice(0, 5) + '***',
            });
            break;

          case 'spamreport':
            logger.warn('Email marked as spam', {
              messageId,
              email: email?.slice(0, 5) + '***',
            });
            break;

          default:
            logger.debug('Unknown SendGrid event type', { eventType, messageId });
        }

        processedEvents++;
      } catch (eventError) {
        const error = `Failed to process event: ${eventError}`;
        errors.push(error);
        logger.error('Failed to process SendGrid event', { event, error: eventError });
      }
    }

    return {
      success: true,
      data: { processedEvents, errors },
    };
  } catch (error) {
    logger.error('Failed to handle SendGrid webhook', { events, error });
    return { success: false, error: 'Failed to process webhook events' };
  }
}

/**
 * Verify SendGrid webhook signature (for security)
 */
export function verifySendGridSignature(
  payload: string,
  signature: string,
  timestamp: string
): boolean {
  try {
    // SendGrid webhook signature verification
    // This is a simplified version - implement proper HMAC verification if needed
    const webhookSecret = process.env.SENDGRID_WEBHOOK_SECRET;

    if (!webhookSecret) {
      logger.warn('SendGrid webhook secret not configured');
      return true; // Allow webhook if secret not configured
    }

    // Implement HMAC-SHA256 verification here
    // const crypto = require('crypto');
    // const expectedSignature = crypto
    //   .createHmac('sha256', webhookSecret)
    //   .update(timestamp + payload)
    //   .digest('base64');

    // return signature === expectedSignature;

    return true; // Placeholder - implement proper verification
  } catch (error) {
    logger.error('Failed to verify SendGrid signature', { error });
    return false;
  }
}

/**
 * Get email delivery statistics from SendGrid
 */
export async function getEmailStats(
  startDate: string,
  endDate?: string
): Promise<
  Result<{
    delivered: number;
    bounces: number;
    opens: number;
    clicks: number;
    unsubscribes: number;
    spam_reports: number;
  }>
> {
  try {
    initializeSendGrid();

    // Note: SendGrid Stats API requires different setup than the Mail API
    // This is a placeholder for the actual stats API implementation

    logger.info('Fetching SendGrid email stats', { startDate, endDate });

    // Placeholder response - implement actual API call
    const stats = {
      delivered: 0,
      bounces: 0,
      opens: 0,
      clicks: 0,
      unsubscribes: 0,
      spam_reports: 0,
    };

    return { success: true, data: stats };
  } catch (error) {
    logger.error('Failed to get SendGrid stats', { startDate, endDate, error });
    return { success: false, error: 'Failed to fetch email statistics' };
  }
}

/**
 * Send test email for validation
 */
export async function sendTestEmail(
  toEmail: string,
  customSubject?: string,
  customContent?: string
): Promise<Result<{ statusCode: number }>> {
  const fromEmail = getRequiredEnvVar('SENDGRID_FROM_EMAIL');
  const fromName = getRequiredEnvVar('SENDGRID_FROM_NAME');

  const subject = customSubject || 'Test Email from Review Runner';
  const htmlContent =
    customContent ||
    `
    <h2>Test Email</h2>
    <p>This is a test email from Review Runner to verify SendGrid integration.</p>
    <p>If you receive this email, the integration is working correctly.</p>
    <p>Best regards,<br>The Review Runner Team</p>
  `;

  const request: SendGridEmailRequest = {
    to: {
      email: toEmail,
      name: 'Test Recipient',
    },
    from: {
      email: fromEmail,
      name: fromName,
    },
    subject,
    content: [
      {
        type: 'text/html',
        value: htmlContent,
      },
    ],
    customArgs: {
      test: 'true',
    },
  };

  const result = await sendEmail(request);

  if (result.success) {
    return {
      success: true,
      data: { statusCode: result.data.statusCode },
    };
  }

  return result;
}

/**
 * Validate email template content
 */
export function validateEmailContent(
  content: Array<{ type: string; value: string }>
): Result<{ warnings: string[] }> {
  const warnings: string[] = [];

  try {
    for (const contentItem of content) {
      if (contentItem.type === 'text/html') {
        const html = contentItem.value;

        // Check for common issues
        if (!html.includes('{{unsubscribeUrl}}') && !html.includes('unsubscribe')) {
          warnings.push('Email should include an unsubscribe link');
        }

        if (!html.includes('{{trackingUrl}}') && !html.includes('{{reviewUrl}}')) {
          warnings.push('Email should include a tracking or review URL');
        }

        if (html.length > 102400) {
          // 100KB limit
          warnings.push('Email content may be too large (>100KB)');
        }

        // Check for missing alt tags on images
        const imgTags = html.match(/<img[^>]*>/gi) || [];
        const imagesWithoutAlt = imgTags.filter(tag => !tag.includes('alt='));

        if (imagesWithoutAlt.length > 0) {
          warnings.push(`${imagesWithoutAlt.length} images missing alt text`);
        }
      }
    }

    return { success: true, data: { warnings } };
  } catch (error) {
    logger.error('Failed to validate email content', { error });
    return { success: false, error: 'Failed to validate email content' };
  }
}

/**
 * Create email content from template
 */
export function createEmailContent(
  htmlContent: string,
  textContent?: string
): Array<{ type: 'text/plain' | 'text/html'; value: string }> {
  const content: Array<{ type: 'text/plain' | 'text/html'; value: string }> = [];

  // Add text content if provided
  if (textContent) {
    content.push({
      type: 'text/plain',
      value: textContent,
    });
  }

  // Add HTML content
  content.push({
    type: 'text/html',
    value: htmlContent,
  });

  return content;
}

/**
 * Extract text content from HTML for fallback
 */
export function htmlToText(html: string): string {
  return html
    .replace(/<style[^>]*>.*?<\/style>/gis, '') // Remove style blocks
    .replace(/<script[^>]*>.*?<\/script>/gis, '') // Remove script blocks
    .replace(/<br\s*\/?>/gi, '\n') // Convert <br> to newlines
    .replace(/<\/p>/gi, '\n\n') // Convert </p> to double newlines
    .replace(/<[^>]*>/g, '') // Remove all HTML tags
    .replace(/&nbsp;/g, ' ') // Convert &nbsp; to spaces
    .replace(/&amp;/g, '&') // Convert &amp; to &
    .replace(/&lt;/g, '<') // Convert &lt; to <
    .replace(/&gt;/g, '>') // Convert &gt; to >
    .replace(/&quot;/g, '"') // Convert &quot; to "
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();
}
