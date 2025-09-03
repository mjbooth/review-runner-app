import type { RequestChannel } from '@prisma/client';
import { logger } from '../lib/logger';
import { prisma } from '../lib/prisma';

// Simple direct messaging service - no job queue complexity
export interface SendMessageParams {
  reviewRequestId: string;
  businessId: string;
  customerId: string;
  channel: RequestChannel;
  content: string;
  subject?: string;
  contactInfo: string; // email or phone
  reviewUrl: string;
  trackingUrl: string;
}

export interface SendMessageResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

// Direct SMS sending via Twilio
export async function sendSMS(params: SendMessageParams): Promise<SendMessageResult> {
  try {
    const twilio = require('twilio');
    const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

    const message = await client.messages.create({
      to: params.contactInfo,
      from: process.env.TWILIO_PHONE_NUMBER,
      body: params.content,
    });

    // Update request status immediately
    await prisma.reviewRequest.update({
      where: { id: params.reviewRequestId },
      data: {
        status: 'SENT',
        sentAt: new Date(),
        externalId: message.sid,
      },
    });

    // Log event
    await prisma.event.create({
      data: {
        businessId: params.businessId,
        reviewRequestId: params.reviewRequestId,
        type: 'REQUEST_SENT',
        source: 'twilio',
        description: `SMS sent to ${params.contactInfo}`,
        metadata: { messageSid: message.sid },
      },
    });

    logger.info('SMS sent successfully', {
      requestId: params.reviewRequestId,
      messageSid: message.sid,
      phone: params.contactInfo,
    });

    return {
      success: true,
      messageId: message.sid,
    };
  } catch (error) {
    logger.error('Failed to send SMS', {
      requestId: params.reviewRequestId,
      error: error.message,
      phone: params.contactInfo,
    });

    // Update request status with error
    await prisma.reviewRequest.update({
      where: { id: params.reviewRequestId },
      data: {
        status: 'FAILED',
        errorMessage: error.message,
        retryCount: { increment: 1 },
      },
    });

    return {
      success: false,
      error: error.message,
    };
  }
}

// Direct email sending via SendGrid
export async function sendEmail(params: SendMessageParams): Promise<SendMessageResult> {
  try {
    const sgMail = require('@sendgrid/mail');
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);

    const msg = {
      to: params.contactInfo,
      from: process.env.SENDGRID_FROM_EMAIL,
      subject: params.subject || 'Share your experience with us',
      html: params.content,
    };

    const response = await sgMail.send(msg);
    const messageId = response[0]?.headers?.['x-message-id'] || 'unknown';

    // Update request status immediately
    await prisma.reviewRequest.update({
      where: { id: params.reviewRequestId },
      data: {
        status: 'SENT',
        sentAt: new Date(),
        externalId: messageId,
      },
    });

    // Log event
    await prisma.event.create({
      data: {
        businessId: params.businessId,
        reviewRequestId: params.reviewRequestId,
        type: 'REQUEST_SENT',
        source: 'sendgrid',
        description: `Email sent to ${params.contactInfo}`,
        metadata: { messageId },
      },
    });

    logger.info('Email sent successfully', {
      requestId: params.reviewRequestId,
      messageId,
      email: params.contactInfo,
    });

    return {
      success: true,
      messageId,
    };
  } catch (error) {
    logger.error('Failed to send email', {
      requestId: params.reviewRequestId,
      error: error.message,
      email: params.contactInfo,
    });

    // Update request status with error
    await prisma.reviewRequest.update({
      where: { id: params.reviewRequestId },
      data: {
        status: 'FAILED',
        errorMessage: error.message,
        retryCount: { increment: 1 },
      },
    });

    return {
      success: false,
      error: error.message,
    };
  }
}

// Simple message processing - called directly from API
export async function processReviewRequest(reviewRequestId: string): Promise<SendMessageResult> {
  try {
    // Get full request data
    const request = await prisma.reviewRequest.findUnique({
      where: { id: reviewRequestId },
      include: {
        customer: {
          select: {
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
          },
        },
        business: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!request) {
      throw new Error('Review request not found');
    }

    // Check suppression list
    const contactInfo = request.channel === 'SMS' ? request.customer.phone : request.customer.email;
    if (!contactInfo) {
      throw new Error(`No ${request.channel.toLowerCase()} contact info for customer`);
    }

    const suppression = await prisma.suppression.findFirst({
      where: {
        businessId: request.businessId,
        contact: contactInfo,
        OR: [
          { channel: request.channel },
          { channel: null }, // Global suppression
        ],
        isActive: true,
      },
    });

    if (suppression) {
      await prisma.reviewRequest.update({
        where: { id: reviewRequestId },
        data: {
          status: 'OPTED_OUT',
          errorMessage: `Contact suppressed: ${suppression.reason}`,
        },
      });

      return {
        success: false,
        error: 'Contact is suppressed',
      };
    }

    // Send the message
    const params: SendMessageParams = {
      reviewRequestId: request.id,
      businessId: request.businessId,
      customerId: request.customerId,
      channel: request.channel,
      content: request.messageContent,
      subject: request.subject,
      contactInfo,
      reviewUrl: request.reviewUrl,
      trackingUrl: request.trackingUrl,
    };

    if (request.channel === 'SMS') {
      return await sendSMS(params);
    } else {
      return await sendEmail(params);
    }
  } catch (error) {
    logger.error('Failed to process review request', {
      requestId: reviewRequestId,
      error: error.message,
    });

    return {
      success: false,
      error: error.message,
    };
  }
}

// Simple template rendering
export function renderMessageTemplate(
  template: string,
  data: {
    firstName: string;
    lastName?: string;
    businessName: string;
    reviewUrl: string;
    trackingUrl: string;
  }
): string {
  return template
    .replace(/\{\{firstName\}\}/g, data.firstName)
    .replace(/\{\{lastName\}\}/g, data.lastName || '')
    .replace(/\{\{businessName\}\}/g, data.businessName)
    .replace(/\{\{reviewUrl\}\}/g, data.trackingUrl) // Use tracking URL
    .replace(/\{\{trackingUrl\}\}/g, data.trackingUrl);
}
