import type { Job } from 'bullmq';
import { prisma } from '../lib/prisma';
import { logger, loggers } from '../lib/logger';
import { getReviewRequestById, updateReviewRequest } from '../services/review-requests';
import { checkSuppressions } from '../services/suppressions';
import {
  renderMessage,
  createPersonalizationData,
  getDefaultTemplate,
} from '../services/messaging';
import { sendSMS, formatPhoneNumberForTwilio } from '../services/twilio';
import { sendEmail, createEmailContent, htmlToText } from '../services/sendgrid';
import { getContactForChannel } from '../lib/utils';
import type { SendRequestJobData } from '../types/external';

/**
 * Process send-request job
 */
export async function processSendRequestJob(job: Job<SendRequestJobData>): Promise<{
  success: boolean;
  messageId?: string;
  status?: string;
  error?: string;
}> {
  const { requestId, retryCount = 0 } = job.data;

  try {
    logger.info('Processing send request job', {
      jobId: job.id,
      requestId,
      retryCount,
    });

    // Get review request with full details
    const requestResult = await getReviewRequestById(requestId);

    if (!requestResult.success || !requestResult.data) {
      throw new Error('Review request not found');
    }

    const reviewRequest = requestResult.data;

    // Skip if already processed
    if (reviewRequest.status !== 'QUEUED') {
      logger.warn('Review request already processed', {
        requestId,
        currentStatus: reviewRequest.status,
      });
      return {
        success: true,
        status: reviewRequest.status,
      };
    }

    // Get business details
    const business = await prisma.business.findUnique({
      where: { id: reviewRequest.businessId },
      select: {
        name: true,
        isActive: true,
        smsCreditsUsed: true,
        smsCreditsLimit: true,
        emailCreditsUsed: true,
        emailCreditsLimit: true,
      },
    });

    if (!business || !business.isActive) {
      throw new Error('Business not found or inactive');
    }

    // Check credit limits
    if (reviewRequest.channel === 'SMS') {
      if (business.smsCreditsUsed >= business.smsCreditsLimit) {
        throw new Error('SMS credit limit exceeded');
      }
    } else if (reviewRequest.channel === 'EMAIL') {
      if (business.emailCreditsUsed >= business.emailCreditsLimit) {
        throw new Error('Email credit limit exceeded');
      }
    }

    // Get contact info
    const contact = getContactForChannel(reviewRequest.customer, reviewRequest.channel);

    if (!contact) {
      throw new Error(`Customer does not have ${reviewRequest.channel.toLowerCase()} contact`);
    }

    // Final suppression check
    const suppressionResult = await checkSuppressions(
      reviewRequest.businessId,
      contact,
      reviewRequest.channel
    );

    if (suppressionResult.success && suppressionResult.data.isSuppressed) {
      // Mark as opted out and don't send
      await updateReviewRequest(requestId, {
        status: 'OPTED_OUT',
        errorMessage: `Contact suppressed: ${suppressionResult.data.reason}`,
      });

      await prisma.event.create({
        data: {
          businessId: reviewRequest.businessId,
          reviewRequestId: requestId,
          type: 'REQUEST_OPTED_OUT',
          source: 'system',
          description: 'Request blocked by suppression',
          metadata: suppressionResult.data,
        },
      });

      return {
        success: true,
        status: 'OPTED_OUT',
      };
    }

    // Get stored message from database or use default template
    const template = {
      content: reviewRequest.messageContent,
      subject: reviewRequest.subject,
    };

    // Create personalization data
    const personalizationData = createPersonalizationData(
      reviewRequest.customer,
      business,
      reviewRequest.reviewUrl,
      reviewRequest.trackingUrl,
      reviewRequest.trackingUuid
    );

    // Render message
    const messageResult = await renderMessage(template, personalizationData, reviewRequest.channel);

    if (!messageResult.success) {
      throw new Error(`Message rendering failed: ${messageResult.error}`);
    }

    const renderedMessage = messageResult.data;

    // Send message based on channel
    let sendResult: { success: boolean; data?: any; error?: string };
    let externalId = '';

    if (reviewRequest.channel === 'SMS') {
      // Send SMS via Twilio
      const phoneNumber = formatPhoneNumberForTwilio(contact);

      sendResult = await sendSMS(
        {
          to: phoneNumber,
          body: renderedMessage.content,
          statusCallback: `${process.env.NEXT_PUBLIC_API_URL}/webhooks/twilio`,
        },
        {
          requestId,
          businessId: reviewRequest.businessId,
        }
      );

      if (sendResult.success) {
        externalId = sendResult.data.sid;
      }
    } else {
      // Send Email via SendGrid
      const fromEmail = process.env.SENDGRID_FROM_EMAIL!;
      const fromName = business.name;

      // Create both HTML and text content
      const htmlContent = renderedMessage.content;
      const textContent = htmlToText(htmlContent);

      sendResult = await sendEmail(
        {
          to: {
            email: contact,
            name: `${reviewRequest.customer.firstName} ${reviewRequest.customer.lastName || ''}`.trim(),
          },
          from: {
            email: fromEmail,
            name: fromName,
          },
          subject: renderedMessage.subject!,
          content: createEmailContent(htmlContent, textContent),
          trackingSettings: {
            clickTracking: { enable: true },
            openTracking: { enable: true },
          },
          customArgs: {
            requestId,
            businessId: reviewRequest.businessId,
            trackingUuid: reviewRequest.trackingUuid,
          },
        },
        {
          requestId,
          businessId: reviewRequest.businessId,
        }
      );

      if (sendResult.success) {
        // SendGrid doesn't return a direct message ID in the response
        // We'll get it from the webhook later
        externalId = `sg_${Date.now()}`;
      }
    }

    // Handle send result
    if (sendResult.success) {
      // Update request status
      await updateReviewRequest(requestId, {
        status: 'SENT',
        sentAt: new Date(),
        externalId,
        retryCount,
      });

      // Update business credit usage
      const creditUpdate =
        reviewRequest.channel === 'SMS'
          ? { smsCreditsUsed: { increment: 1 } }
          : { emailCreditsUsed: { increment: 1 } };

      await prisma.business.update({
        where: { id: reviewRequest.businessId },
        data: creditUpdate,
      });

      // Log success event
      await prisma.event.create({
        data: {
          businessId: reviewRequest.businessId,
          reviewRequestId: requestId,
          type: 'REQUEST_SENT',
          source: 'system',
          description: `${reviewRequest.channel} message sent successfully`,
          metadata: {
            externalId,
            channel: reviewRequest.channel,
            contact: contact.slice(0, 5) + '***',
          },
        },
      });

      loggers.business.reviewRequestSent({
        requestId,
        businessId: reviewRequest.businessId,
        channel: reviewRequest.channel,
        externalId,
      });

      return {
        success: true,
        messageId: externalId,
        status: 'SENT',
      };
    } else {
      // Handle send failure
      const errorMessage = sendResult.error || 'Message sending failed';

      await updateReviewRequest(requestId, {
        status: 'FAILED',
        errorMessage,
        retryCount,
      });

      // Log failure event
      await prisma.event.create({
        data: {
          businessId: reviewRequest.businessId,
          reviewRequestId: requestId,
          type: 'ERROR_OCCURRED',
          source: 'system',
          description: `${reviewRequest.channel} sending failed: ${errorMessage}`,
          metadata: {
            error: errorMessage,
            channel: reviewRequest.channel,
            retryCount,
          },
        },
      });

      throw new Error(errorMessage);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    logger.error('Send request job failed', {
      jobId: job.id,
      requestId,
      retryCount,
      error: errorMessage,
    });

    // Update request status on failure
    try {
      await updateReviewRequest(requestId, {
        status: 'FAILED',
        errorMessage,
        retryCount,
      });
    } catch (updateError) {
      logger.error('Failed to update request status after error', {
        requestId,
        error: updateError,
      });
    }

    return {
      success: false,
      error: errorMessage,
    };
  }
}
