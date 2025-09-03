import { processSendRequestJob } from '../send-request';
import { prisma } from '@/lib/prisma';
import { sendSms } from '@/services/twilio';
import { sendEmail } from '@/services/sendgrid';
import { checkSuppressions } from '@/services/suppressions';
import { replaceVariablesWithData } from '@/components/dashboard/customers/data/personalizationVariables';
import { logger } from '@/lib/logger';
import type { Job } from 'bullmq';

// Mock dependencies
jest.mock('@/lib/prisma');
jest.mock('@/services/twilio');
jest.mock('@/services/sendgrid');
jest.mock('@/services/suppressions');
jest.mock('@/components/dashboard/customers/data/personalizationVariables');
jest.mock('@/lib/logger');

describe('Send Request Job', () => {
  const mockRequestId = 'request-123';
  const mockBusinessId = 'business-123';
  const mockCustomerId = 'customer-123';

  const mockReviewRequest = {
    id: mockRequestId,
    businessId: mockBusinessId,
    customerId: mockCustomerId,
    channel: 'SMS',
    status: 'QUEUED',
    messageContent: 'Hi {{firstName}}, please review us at {{reviewUrl}}',
    subject: null,
    reviewUrl: 'https://example.com/review',
    trackingUrl: 'https://example.com/r/tracking-uuid',
    trackingUuid: 'tracking-uuid',
    personalizedMessage: null,
    scheduledFor: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    customer: {
      id: mockCustomerId,
      businessId: mockBusinessId,
      firstName: 'John',
      lastName: 'Doe',
      email: 'john.doe@example.com',
      phone: '+447123456789',
      isActive: true,
    },
    business: {
      id: mockBusinessId,
      name: 'Test Business',
      isActive: true,
    },
  };

  const mockJob = {
    data: {
      requestId: mockRequestId,
      retryCount: 0,
    },
    id: 'job-123',
    attemptsMade: 0,
    updateProgress: jest.fn(),
  } as unknown as Job;

  beforeEach(() => {
    jest.clearAllMocks();

    // Default mocks
    (prisma.reviewRequest.findUnique as jest.Mock) = jest.fn();
    (prisma.reviewRequest.update as jest.Mock) = jest.fn();
    (prisma.event.create as jest.Mock) = jest.fn();
    (prisma.$transaction as jest.Mock) = jest.fn(async callback => callback(prisma));

    (checkSuppressions as jest.Mock).mockResolvedValue({ isSuppressed: false });
    (replaceVariablesWithData as jest.Mock).mockImplementation(content =>
      content
        .replace('{{firstName}}', 'John')
        .replace('{{reviewUrl}}', 'https://example.com/review')
    );

    (logger.info as jest.Mock) = jest.fn();
    (logger.error as jest.Mock) = jest.fn();
    (logger.warn as jest.Mock) = jest.fn();
  });

  describe('SMS Sending', () => {
    beforeEach(() => {
      (prisma.reviewRequest.findUnique as jest.Mock).mockResolvedValue(mockReviewRequest);
    });

    it('should successfully send SMS review request', async () => {
      const mockSmsResult = {
        success: true,
        messageId: 'sms-123',
        status: 'sent',
      };

      (sendSms as jest.Mock).mockResolvedValue(mockSmsResult);

      await processSendRequestJob(mockJob);

      // Verify SMS was sent with correct parameters
      expect(sendSms).toHaveBeenCalledWith({
        to: '+447123456789',
        message: 'Hi John, please review us at https://example.com/review',
        businessId: mockBusinessId,
      });

      // Verify request was updated
      expect(prisma.reviewRequest.update).toHaveBeenCalledWith({
        where: { id: mockRequestId },
        data: expect.objectContaining({
          status: 'SENT',
          personalizedMessage: 'Hi John, please review us at https://example.com/review',
          sentAt: expect.any(Date),
          externalId: 'sms-123',
          retryCount: 0,
        }),
      });

      // Verify event was created
      expect(prisma.event.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          businessId: mockBusinessId,
          reviewRequestId: mockRequestId,
          type: 'REQUEST_SENT',
          source: 'system',
          description: expect.stringContaining('SMS sent successfully'),
        }),
      });

      // Verify progress was updated
      expect(mockJob.updateProgress).toHaveBeenCalledWith(100);
    });

    it('should handle SMS sending failure', async () => {
      const mockError = new Error('Twilio API error');
      (sendSms as jest.Mock).mockRejectedValue(mockError);

      await expect(processSendRequestJob(mockJob)).rejects.toThrow('Twilio API error');

      // Verify request was marked as failed
      expect(prisma.reviewRequest.update).toHaveBeenCalledWith({
        where: { id: mockRequestId },
        data: expect.objectContaining({
          status: 'FAILED',
          errorMessage: 'Twilio API error',
          retryCount: 0,
        }),
      });

      // Verify failure event was created
      expect(prisma.event.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          type: 'REQUEST_FAILED',
          description: expect.stringContaining('Failed to send SMS'),
          metadata: expect.objectContaining({
            error: 'Twilio API error',
          }),
        }),
      });
    });
  });

  describe('Email Sending', () => {
    beforeEach(() => {
      const emailRequest = {
        ...mockReviewRequest,
        channel: 'EMAIL',
        subject: 'Review Request from {{businessName}}',
      };
      (prisma.reviewRequest.findUnique as jest.Mock).mockResolvedValue(emailRequest);
      (replaceVariablesWithData as jest.Mock).mockImplementation(content =>
        content
          .replace('{{firstName}}', 'John')
          .replace('{{reviewUrl}}', 'https://example.com/review')
          .replace('{{businessName}}', 'Test Business')
      );
    });

    it('should successfully send email review request', async () => {
      const mockEmailResult = {
        success: true,
        messageId: 'email-123',
        status: 'sent',
      };

      (sendEmail as jest.Mock).mockResolvedValue(mockEmailResult);

      await processSendRequestJob(mockJob);

      // Verify email was sent with correct parameters
      expect(sendEmail).toHaveBeenCalledWith({
        to: 'john.doe@example.com',
        subject: 'Review Request from Test Business',
        html: 'Hi John, please review us at https://example.com/review',
        businessId: mockBusinessId,
      });

      // Verify request was updated
      expect(prisma.reviewRequest.update).toHaveBeenCalledWith({
        where: { id: mockRequestId },
        data: expect.objectContaining({
          status: 'SENT',
          personalizedMessage: 'Hi John, please review us at https://example.com/review',
          sentAt: expect.any(Date),
          externalId: 'email-123',
        }),
      });
    });

    it('should handle missing email address', async () => {
      const noEmailRequest = {
        ...mockReviewRequest,
        channel: 'EMAIL',
        customer: {
          ...mockReviewRequest.customer,
          email: null,
        },
      };
      (prisma.reviewRequest.findUnique as jest.Mock).mockResolvedValue(noEmailRequest);

      await expect(processSendRequestJob(mockJob)).rejects.toThrow('Customer has no email address');

      expect(sendEmail).not.toHaveBeenCalled();
    });
  });

  describe('Suppression Checking', () => {
    beforeEach(() => {
      (prisma.reviewRequest.findUnique as jest.Mock).mockResolvedValue(mockReviewRequest);
    });

    it('should skip sending if customer is suppressed', async () => {
      (checkSuppressions as jest.Mock).mockResolvedValue({
        isSuppressed: true,
        reason: 'CUSTOMER_REQUEST',
        suppressionId: 'suppression-123',
      });

      await processSendRequestJob(mockJob);

      // Verify no message was sent
      expect(sendSms).not.toHaveBeenCalled();
      expect(sendEmail).not.toHaveBeenCalled();

      // Verify request was marked as suppressed
      expect(prisma.reviewRequest.update).toHaveBeenCalledWith({
        where: { id: mockRequestId },
        data: expect.objectContaining({
          status: 'SUPPRESSED',
          suppressionReason: 'CUSTOMER_REQUEST',
        }),
      });

      // Verify suppression event was created
      expect(prisma.event.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          type: 'REQUEST_SUPPRESSED',
          description: expect.stringContaining('suppressed'),
          metadata: expect.objectContaining({
            reason: 'CUSTOMER_REQUEST',
            suppressionId: 'suppression-123',
          }),
        }),
      });
    });
  });

  describe('Request Validation', () => {
    it('should throw error if request not found', async () => {
      (prisma.reviewRequest.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(processSendRequestJob(mockJob)).rejects.toThrow('Review request not found');
    });

    it('should skip if request is already sent', async () => {
      const sentRequest = {
        ...mockReviewRequest,
        status: 'SENT',
        sentAt: new Date(),
      };
      (prisma.reviewRequest.findUnique as jest.Mock).mockResolvedValue(sentRequest);

      await processSendRequestJob(mockJob);

      expect(sendSms).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledWith(
        'Request already sent, skipping',
        expect.any(Object)
      );
    });

    it('should throw error if customer is inactive', async () => {
      const inactiveCustomerRequest = {
        ...mockReviewRequest,
        customer: {
          ...mockReviewRequest.customer,
          isActive: false,
        },
      };
      (prisma.reviewRequest.findUnique as jest.Mock).mockResolvedValue(inactiveCustomerRequest);

      await expect(processSendRequestJob(mockJob)).rejects.toThrow('Customer is not active');
    });

    it('should throw error if business is inactive', async () => {
      const inactiveBusinessRequest = {
        ...mockReviewRequest,
        business: {
          ...mockReviewRequest.business,
          isActive: false,
        },
      };
      (prisma.reviewRequest.findUnique as jest.Mock).mockResolvedValue(inactiveBusinessRequest);

      await expect(processSendRequestJob(mockJob)).rejects.toThrow('Business is not active');
    });

    it('should handle missing phone number for SMS', async () => {
      const noPhoneRequest = {
        ...mockReviewRequest,
        customer: {
          ...mockReviewRequest.customer,
          phone: null,
        },
      };
      (prisma.reviewRequest.findUnique as jest.Mock).mockResolvedValue(noPhoneRequest);

      await expect(processSendRequestJob(mockJob)).rejects.toThrow('Customer has no phone number');
    });
  });

  describe('Personalization', () => {
    beforeEach(() => {
      (prisma.reviewRequest.findUnique as jest.Mock).mockResolvedValue(mockReviewRequest);
    });

    it('should personalize message with customer data', async () => {
      const complexMessage =
        'Hi {{firstName}} {{lastName}}, {{businessName}} would love your review at {{reviewUrl}}';
      const requestWithComplexMessage = {
        ...mockReviewRequest,
        messageContent: complexMessage,
      };
      (prisma.reviewRequest.findUnique as jest.Mock).mockResolvedValue(requestWithComplexMessage);

      (replaceVariablesWithData as jest.Mock).mockReturnValue(
        'Hi John Doe, Test Business would love your review at https://example.com/review'
      );
      (sendSms as jest.Mock).mockResolvedValue({ success: true, messageId: 'sms-123' });

      await processSendRequestJob(mockJob);

      expect(replaceVariablesWithData).toHaveBeenCalledWith(
        complexMessage,
        expect.objectContaining({
          firstName: 'John',
          lastName: 'Doe',
        })
      );

      expect(sendSms).toHaveBeenCalledWith({
        to: '+447123456789',
        message: 'Hi John Doe, Test Business would love your review at https://example.com/review',
        businessId: mockBusinessId,
      });
    });
  });

  describe('Retry Logic', () => {
    it('should increment retry count on failure', async () => {
      (prisma.reviewRequest.findUnique as jest.Mock).mockResolvedValue(mockReviewRequest);
      (sendSms as jest.Mock).mockRejectedValue(new Error('Network error'));

      const jobWithRetries = {
        ...mockJob,
        data: {
          requestId: mockRequestId,
          retryCount: 2,
        },
        attemptsMade: 2,
      };

      await expect(processSendRequestJob(jobWithRetries)).rejects.toThrow('Network error');

      expect(prisma.reviewRequest.update).toHaveBeenCalledWith({
        where: { id: mockRequestId },
        data: expect.objectContaining({
          status: 'FAILED',
          retryCount: 2,
        }),
      });
    });

    it('should mark as permanently failed after max retries', async () => {
      (prisma.reviewRequest.findUnique as jest.Mock).mockResolvedValue(mockReviewRequest);
      (sendSms as jest.Mock).mockRejectedValue(new Error('Permanent failure'));

      const maxRetriesJob = {
        ...mockJob,
        data: {
          requestId: mockRequestId,
          retryCount: 5,
        },
        attemptsMade: 5,
      };

      await expect(processSendRequestJob(maxRetriesJob)).rejects.toThrow('Permanent failure');

      expect(prisma.event.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          type: 'REQUEST_FAILED',
          description: expect.stringContaining('Max retries reached'),
        }),
      });
    });
  });

  describe('Progress Tracking', () => {
    beforeEach(() => {
      (prisma.reviewRequest.findUnique as jest.Mock).mockResolvedValue(mockReviewRequest);
      (sendSms as jest.Mock).mockResolvedValue({ success: true, messageId: 'sms-123' });
    });

    it('should update job progress', async () => {
      await processSendRequestJob(mockJob);

      expect(mockJob.updateProgress).toHaveBeenCalledWith(10); // Request loaded
      expect(mockJob.updateProgress).toHaveBeenCalledWith(30); // Suppression checked
      expect(mockJob.updateProgress).toHaveBeenCalledWith(50); // Message personalized
      expect(mockJob.updateProgress).toHaveBeenCalledWith(80); // Message sent
      expect(mockJob.updateProgress).toHaveBeenCalledWith(100); // Complete
    });
  });

  describe('Transaction Handling', () => {
    it('should use transaction for database updates', async () => {
      (prisma.reviewRequest.findUnique as jest.Mock).mockResolvedValue(mockReviewRequest);
      (sendSms as jest.Mock).mockResolvedValue({ success: true, messageId: 'sms-123' });

      let transactionCalled = false;
      (prisma.$transaction as jest.Mock).mockImplementation(async callback => {
        transactionCalled = true;
        return callback(prisma);
      });

      await processSendRequestJob(mockJob);

      expect(transactionCalled).toBe(true);
    });
  });
});
