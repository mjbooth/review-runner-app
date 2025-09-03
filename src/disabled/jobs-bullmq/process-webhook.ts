import type { Job } from 'bullmq';
import { prisma } from '../lib/prisma';
import { logger, loggers } from '../lib/logger';
import { handleWebhookSuppression } from '../services/suppressions';
import type {
  ProcessWebhookJobData,
  TwilioWebhookPayload,
  SendGridWebhookEvent,
} from '../types/external';

/**
 * Process webhook job
 * Handles webhooks from external services (Twilio, SendGrid) in the background
 */
export async function processWebhookJob(job: Job<ProcessWebhookJobData>): Promise<{
  success: boolean;
  eventsProcessed?: number;
  error?: string;
}> {
  const { source, payload, timestamp } = job.data;

  try {
    logger.info(`Processing webhook job (${job.id}) from ${source} at ${timestamp}`);

    loggers.external.webhookReceived({
      source,
    });

    let eventsProcessed = 0;

    if (source === 'twilio') {
      eventsProcessed = await processTwilioWebhook(payload as TwilioWebhookPayload);
    } else if (source === 'sendgrid') {
      eventsProcessed = await processSendGridWebhook(payload as SendGridWebhookEvent[]);
    } else {
      throw new Error(`Unknown webhook source: ${source}`);
    }

    logger.info(`Webhook processing completed: ${source}, processed ${eventsProcessed} events`);

    return {
      success: true,
      eventsProcessed,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    logger.error('Process webhook job failed', {
      jobId: job.id,
      source,
      error: errorMessage,
    });

    return {
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Process Twilio webhook payload
 */
async function processTwilioWebhook(payload: TwilioWebhookPayload): Promise<number> {
  const {
    MessageSid: messageId,
    MessageStatus: status,
    To: to,
    From: from,
    ErrorCode: errorCode,
    ErrorMessage: errorMessage,
  } = payload;

  if (!messageId) {
    throw new Error('MessageSid is required');
  }

  // Find the review request by external ID
  const reviewRequest = await prisma.reviewRequest.findFirst({
    where: { externalId: messageId },
    select: {
      id: true,
      businessId: true,
      status: true,
      customer: {
        select: {
          phone: true,
        },
      },
    },
  });

  if (!reviewRequest) {
    logger.warn('Review request not found for Twilio webhook', { messageId });
    return 0; // Not an error - might be a different message
  }

  // Update request status based on Twilio status
  let newStatus = reviewRequest.status;
  const updateData: any = {};

  switch (status) {
    case 'delivered':
      newStatus = 'DELIVERED';
      updateData.deliveredAt = new Date();
      break;
    case 'sent':
      newStatus = 'SENT';
      updateData.sentAt = new Date();
      break;
    case 'failed':
    case 'undelivered':
      newStatus = 'FAILED';
      updateData.errorMessage = errorMessage || `SMS ${status}`;
      break;
  }

  // Handle SMS STOP (opt-out)
  if (payload.Body?.toLowerCase().trim() === 'stop') {
    await handleWebhookSuppression(
      reviewRequest.businessId,
      reviewRequest.customer.phone!,
      'SMS',
      'SMS_STOP',
      'twilio',
      {
        messageId,
        originalMessage: payload.Body,
      }
    );

    newStatus = 'OPTED_OUT';
  }

  // Update review request and create event
  await prisma.$transaction([
    prisma.reviewRequest.update({
      where: { id: reviewRequest.id },
      data: {
        status: newStatus,
        ...updateData,
      },
    }),
    prisma.event.create({
      data: {
        businessId: reviewRequest.businessId,
        reviewRequestId: reviewRequest.id,
        type: 'WEBHOOK_RECEIVED',
        source: 'twilio',
        description: `SMS status updated to ${status}`,
        metadata: {
          messageId,
          status,
          to: to?.slice(0, 5) + '***',
          from: from?.slice(0, 5) + '***',
          errorCode,
          errorMessage,
        },
      },
    }),
  ]);

  logger.info('Twilio webhook processed', {
    messageId,
    status,
    newStatus,
    requestId: reviewRequest.id,
  });

  return 1;
}

/**
 * Process SendGrid webhook events
 */
async function processSendGridWebhook(events: SendGridWebhookEvent[]): Promise<number> {
  if (!Array.isArray(events)) {
    throw new Error('SendGrid events must be an array');
  }

  let processedCount = 0;

  for (const event of events) {
    try {
      const processed = await processSingleSendGridEvent(event);
      if (processed) processedCount++;
    } catch (error) {
      logger.error('Failed to process SendGrid event', { event, error });
      // Continue processing other events
    }
  }

  return processedCount;
}

/**
 * Process a single SendGrid webhook event
 */
async function processSingleSendGridEvent(event: SendGridWebhookEvent): Promise<boolean> {
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
    logger.warn('SendGrid event missing sg_message_id', { event });
    return false;
  }

  // Find the review request by external ID or custom args
  let reviewRequest = await prisma.reviewRequest.findFirst({
    where: {
      OR: [
        { externalId: messageId },
        // For SendGrid, we might need to match by custom args if available
        ...(event.requestId ? [{ id: event.requestId }] : []),
      ],
    },
    select: {
      id: true,
      businessId: true,
      status: true,
      customer: {
        select: {
          email: true,
        },
      },
    },
  });

  if (!reviewRequest && email) {
    // Try to find by customer email if direct match fails
    reviewRequest = await prisma.reviewRequest.findFirst({
      where: {
        customer: { email },
        externalId: { startsWith: 'sg_' }, // SendGrid external IDs
        status: { in: ['SENT', 'DELIVERED'] },
      },
      select: {
        id: true,
        businessId: true,
        status: true,
        customer: {
          select: {
            email: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 1,
    });
  }

  if (!reviewRequest) {
    logger.debug('Review request not found for SendGrid event', {
      messageId: messageId.slice(0, 20) + '***',
      eventType,
      email: email?.slice(0, 5) + '***',
    });
    return false;
  }

  // Update request status based on SendGrid event
  let newStatus = reviewRequest.status;
  const updateData: any = {};
  let createSuppressionFor: 'EMAIL_UNSUBSCRIBE' | 'EMAIL_BOUNCE' | 'EMAIL_SPAM_COMPLAINT' | null =
    null;

  switch (eventType) {
    case 'delivered':
      newStatus = 'DELIVERED';
      updateData.deliveredAt = new Date(timestamp * 1000);
      break;
    case 'bounce':
    case 'dropped':
      newStatus = 'BOUNCED';
      updateData.errorMessage = reason || `Email ${eventType}`;
      createSuppressionFor = 'EMAIL_BOUNCE';
      break;
    case 'click':
      if (url && url.includes('/r/')) {
        // This is a click on our tracking link
        newStatus = 'CLICKED';
        updateData.clickedAt = new Date(timestamp * 1000);
      }
      break;
    case 'unsubscribe':
    case 'group_unsubscribe':
      newStatus = 'OPTED_OUT';
      createSuppressionFor = 'EMAIL_UNSUBSCRIBE';
      break;
    case 'spamreport':
      newStatus = 'OPTED_OUT';
      createSuppressionFor = 'EMAIL_SPAM_COMPLAINT';
      break;
  }

  // Handle suppressions
  if (createSuppressionFor && email) {
    await handleWebhookSuppression(
      reviewRequest.businessId,
      email,
      'EMAIL',
      createSuppressionFor,
      'sendgrid',
      {
        messageId,
        eventType,
        reason,
        timestamp,
      }
    );
  }

  // Update review request and create event
  await prisma.$transaction([
    prisma.reviewRequest.update({
      where: { id: reviewRequest.id },
      data: {
        status: newStatus,
        ...updateData,
      },
    }),
    prisma.event.create({
      data: {
        businessId: reviewRequest.businessId,
        reviewRequestId: reviewRequest.id,
        type: 'WEBHOOK_RECEIVED',
        source: 'sendgrid',
        description: `Email event: ${eventType}`,
        metadata: {
          messageId,
          eventType,
          email: email?.slice(0, 5) + '***',
          timestamp,
          reason,
          url: url?.slice(0, 50),
          useragent: useragent?.slice(0, 50),
          ip,
        },
      },
    }),
  ]);

  logger.info('SendGrid webhook event processed', {
    messageId: messageId.slice(0, 20) + '***',
    eventType,
    newStatus,
    requestId: reviewRequest.id,
    suppression: createSuppressionFor,
  });

  return true;
}
