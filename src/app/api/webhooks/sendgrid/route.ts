import { type NextRequest, NextResponse } from 'next/server';
import { sendGridService } from '@/services/messaging';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import type { EmailEventData } from '@/services/messaging';

export async function POST(request: NextRequest) {
  try {
    logger.info('Received SendGrid webhook request', {
      timestamp: new Date().toISOString(),
      headers: Object.fromEntries(request.headers.entries()),
    });

    // Parse the webhook payload
    const events: EmailEventData[] = await request.json();

    if (!Array.isArray(events)) {
      logger.error('Invalid SendGrid webhook payload - expected array', {
        payload: events,
      });
      return NextResponse.json({ error: 'Invalid payload format' }, { status: 400 });
    }

    logger.info('Processing SendGrid webhook events', {
      eventCount: events.length,
      eventTypes: events.map(e => e.event),
    });

    // Process each event
    const results = [];
    for (const eventData of events) {
      try {
        // First, let the service process the event (for logging, etc.)
        const result = await sendGridService.processWebhookEvent(eventData);

        // Then update our database records
        await updateReviewRequestFromEvent(eventData);

        results.push({
          messageId: eventData.sg_message_id,
          event: eventData.event,
          processed: result.success,
          error: result.success ? null : result.error,
        });
      } catch (error) {
        logger.error('Failed to process individual SendGrid event', {
          eventData,
          error,
        });
        results.push({
          messageId: eventData.sg_message_id,
          event: eventData.event,
          processed: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    logger.info('SendGrid webhook processing completed', {
      totalEvents: events.length,
      successfulEvents: results.filter(r => r.processed).length,
      failedEvents: results.filter(r => !r.processed).length,
    });

    return NextResponse.json({
      success: true,
      processed: events.length,
      results,
    });
  } catch (error) {
    logger.error('SendGrid webhook processing failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });

    return NextResponse.json(
      {
        success: false,
        error: 'Webhook processing failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * Update review request status based on SendGrid event
 */
async function updateReviewRequestFromEvent(event: EmailEventData): Promise<void> {
  try {
    // Extract custom args that should contain requestId and businessId
    const customArgs = (event as any).requestId || (event as any).businessId ? (event as any) : {};

    const requestId = customArgs.requestId;
    const businessId = customArgs.businessId;

    if (!requestId) {
      logger.warn('SendGrid event missing requestId custom arg', {
        messageId: event.sg_message_id,
        event: event.event,
      });
      return;
    }

    // Find the review request
    const reviewRequest = await prisma.reviewRequest.findUnique({
      where: { id: requestId },
      select: {
        id: true,
        businessId: true,
        status: true,
        customerId: true,
      },
    });

    if (!reviewRequest) {
      logger.warn('Review request not found for SendGrid event', {
        requestId,
        messageId: event.sg_message_id,
      });
      return;
    }

    // Create event record based on event type
    const eventData: any = {
      businessId: reviewRequest.businessId,
      reviewRequestId: reviewRequest.id,
      source: 'webhook',
      metadata: {
        sendgridMessageId: event.sg_message_id,
        email: event.email,
        eventType: event.event,
        timestamp: new Date(event.timestamp * 1000).toISOString(),
      },
    };

    switch (event.event) {
      case 'processed':
        eventData.type = 'EMAIL_PROCESSED';
        eventData.description = 'Email accepted by SendGrid for delivery';
        break;

      case 'delivered':
        eventData.type = 'REQUEST_DELIVERED';
        eventData.description = 'Email delivered successfully';

        // Update review request status if not already in a terminal state
        if (['SENT', 'QUEUED'].includes(reviewRequest.status)) {
          await prisma.reviewRequest.update({
            where: { id: reviewRequest.id },
            data: {
              status: 'DELIVERED',
              deliveredAt: new Date(),
            },
          });
        }
        break;

      case 'open':
        eventData.type = 'EMAIL_OPENED';
        eventData.description = 'Email opened by recipient';
        eventData.metadata.ip = event.ip;
        eventData.metadata.useragent = event.useragent;
        eventData.ipAddress = event.ip;
        eventData.userAgent = event.useragent;
        break;

      case 'click':
        eventData.type = 'REQUEST_CLICKED';
        eventData.description = 'Email link clicked by recipient';
        eventData.metadata.url = event.url;
        eventData.metadata.ip = event.ip;
        eventData.metadata.useragent = event.useragent;
        eventData.ipAddress = event.ip;
        eventData.userAgent = event.useragent;

        // Update review request status if not already marked as clicked
        if (['DELIVERED', 'SENT'].includes(reviewRequest.status)) {
          await prisma.reviewRequest.update({
            where: { id: reviewRequest.id },
            data: {
              status: 'CLICKED',
              clickedAt: new Date(),
            },
          });
        }
        break;

      case 'bounce':
        eventData.type = 'REQUEST_BOUNCED';
        eventData.description = `Email bounced: ${event.reason || 'Unknown reason'}`;
        eventData.metadata.bounceReason = event.reason;

        // Update review request status
        await prisma.reviewRequest.update({
          where: { id: reviewRequest.id },
          data: {
            status: 'BOUNCED',
            errorMessage: event.reason || 'Email bounced',
          },
        });

        // Add email to suppression list
        await prisma.suppression.create({
          data: {
            businessId: reviewRequest.businessId,
            contact: event.email,
            channel: 'EMAIL',
            reason: 'BOUNCE',
            source: 'sendgrid_webhook',
            metadata: {
              bounceReason: event.reason,
              messageId: event.sg_message_id,
            },
          },
        });
        break;

      case 'dropped':
        eventData.type = 'REQUEST_DROPPED';
        eventData.description = `Email dropped: ${event.reason || 'Unknown reason'}`;
        eventData.metadata.dropReason = event.reason;

        // Update review request status
        await prisma.reviewRequest.update({
          where: { id: reviewRequest.id },
          data: {
            status: 'FAILED',
            errorMessage: `Email dropped: ${event.reason || 'Unknown reason'}`,
          },
        });
        break;

      case 'spamreport':
        eventData.type = 'EMAIL_SPAM_REPORT';
        eventData.description = 'Email marked as spam by recipient';

        // Add email to suppression list
        await prisma.suppression.create({
          data: {
            businessId: reviewRequest.businessId,
            contact: event.email,
            channel: 'EMAIL',
            reason: 'SPAM_COMPLAINT',
            source: 'sendgrid_webhook',
            metadata: {
              messageId: event.sg_message_id,
            },
          },
        });
        break;

      case 'unsubscribe':
        eventData.type = 'REQUEST_OPTED_OUT';
        eventData.description = 'Recipient unsubscribed from emails';

        // Update review request status
        await prisma.reviewRequest.update({
          where: { id: reviewRequest.id },
          data: {
            status: 'OPTED_OUT',
          },
        });

        // Add email to suppression list
        await prisma.suppression.create({
          data: {
            businessId: reviewRequest.businessId,
            contact: event.email,
            channel: 'EMAIL',
            reason: 'UNSUBSCRIBE',
            source: 'sendgrid_webhook',
            metadata: {
              messageId: event.sg_message_id,
            },
          },
        });
        break;

      default:
        logger.info('Unhandled SendGrid event type', { eventType: event.event });
        return;
    }

    // Create the event record
    await prisma.event.create({ data: eventData });

    logger.info('Review request updated from SendGrid event', {
      requestId: reviewRequest.id,
      eventType: event.event,
      messageId: event.sg_message_id,
    });
  } catch (error) {
    logger.error('Failed to update review request from SendGrid event', {
      event,
      error,
    });
    throw error;
  }
}

// Support for webhook signature verification (recommended for production)
async function verifyWebhookSignature(request: NextRequest, payload: string): Promise<boolean> {
  try {
    const signature = request.headers.get('x-twilio-email-event-webhook-signature');
    const timestamp = request.headers.get('x-twilio-email-event-webhook-timestamp');

    if (!signature || !timestamp) {
      logger.warn('Missing SendGrid webhook signature headers');
      return false;
    }

    // TODO: Implement signature verification
    // This would use the webhook's public key to verify the signature
    // For now, we'll log and return true (implement in production)

    logger.info('SendGrid webhook signature verification', {
      hasSignature: !!signature,
      hasTimestamp: !!timestamp,
      // Don't log actual signature for security
    });

    return true;
  } catch (error) {
    logger.error('SendGrid webhook signature verification failed', { error });
    return false;
  }
}
