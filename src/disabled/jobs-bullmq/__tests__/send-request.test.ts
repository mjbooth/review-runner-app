import { processSendRequestJob } from '../send-request';
import type { Job } from 'bullmq';

// Mock external services
jest.mock('../services/sendgrid', () => ({
  sendEmail: jest.fn(),
}));

jest.mock('../services/twilio', () => ({
  sendSMS: jest.fn(),
  formatPhoneNumberForTwilio: jest.fn(),
}));

describe('Send Request Job Processor', () => {
  let businessId: string;
  let customerId: string;
  let reviewRequestId: string;

  beforeEach(async () => {
    await global.testUtils.cleanup();

    // Reset mocks
    jest.clearAllMocks();

    const business = await global.testUtils.createTestBusiness();
    businessId = business.id;

    const customer = await global.testUtils.createTestCustomer(businessId);
    customerId = customer.id;

    const reviewRequest = await global.testUtils.createTestReviewRequest(businessId, customerId, {
      status: 'QUEUED',
    });
    reviewRequestId = reviewRequest.id;
  });

  describe('Email Processing', () => {
    it('should process email job successfully', async () => {
      // Mock SendGrid success
      const { sendEmail } = require('../services/sendgrid');
      sendEmail.mockResolvedValue({
        success: true,
        data: { message_id: 'sg_message_123' },
      });

      const mockJob = {
        id: 'job-123',
        data: {
          requestId: reviewRequestId,
          retryCount: 0,
        },
      } as Job<any>;

      const result = await processSendRequestJob(mockJob);

      expect(result.success).toBe(true);
      expect(result.status).toBe('SENT');
      expect(result.messageId).toBeDefined();

      // Verify database updates
      const updatedRequest = await global.testUtils.prisma.reviewRequest.findUnique({
        where: { id: reviewRequestId },
      });

      expect(updatedRequest?.status).toBe('SENT');
      expect(updatedRequest?.sentAt).toBeDefined();
      expect(updatedRequest?.externalId).toBeDefined();

      // Verify business credit was incremented
      const business = await global.testUtils.prisma.business.findUnique({
        where: { id: businessId },
      });

      expect(business?.emailCreditsUsed).toBe(1);

      // Verify event was logged
      const events = await global.testUtils.prisma.event.findMany({
        where: {
          reviewRequestId,
          type: 'REQUEST_SENT',
        },
      });

      expect(events).toHaveLength(1);
    });

    it('should handle SendGrid failures', async () => {
      // Mock SendGrid failure
      const { sendEmail } = require('../services/sendgrid');
      sendEmail.mockResolvedValue({
        success: false,
        error: 'Email sending failed',
      });

      const mockJob = {
        id: 'job-123',
        data: {
          requestId: reviewRequestId,
          retryCount: 0,
        },
      } as Job<any>;

      const result = await processSendRequestJob(mockJob);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Email sending failed');

      // Verify request was marked as failed
      const updatedRequest = await global.testUtils.prisma.reviewRequest.findUnique({
        where: { id: reviewRequestId },
      });

      expect(updatedRequest?.status).toBe('FAILED');
      expect(updatedRequest?.errorMessage).toContain('Email sending failed');
    });

    it('should validate customer has email for EMAIL channel', async () => {
      // Create customer without email
      const customerWithoutEmail = await global.testUtils.createTestCustomer(businessId, {
        email: null,
      });

      const reviewRequestWithoutEmail = await global.testUtils.createTestReviewRequest(
        businessId,
        customerWithoutEmail.id,
        { channel: 'EMAIL', status: 'QUEUED' }
      );

      const mockJob = {
        id: 'job-123',
        data: {
          requestId: reviewRequestWithoutEmail.id,
          retryCount: 0,
        },
      } as Job<any>;

      const result = await processSendRequestJob(mockJob);

      expect(result.success).toBe(false);
      expect(result.error).toContain('email contact');
    });

    it('should check email credit limits', async () => {
      // Set business to credit limit
      await global.testUtils.prisma.business.update({
        where: { id: businessId },
        data: {
          emailCreditsUsed: 500,
          emailCreditsLimit: 500,
        },
      });

      const mockJob = {
        id: 'job-123',
        data: {
          requestId: reviewRequestId,
          retryCount: 0,
        },
      } as Job<any>;

      const result = await processSendRequestJob(mockJob);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Email credit limit exceeded');
    });
  });

  describe('SMS Processing', () => {
    beforeEach(async () => {
      // Create SMS review request
      const smsRequest = await global.testUtils.createTestReviewRequest(businessId, customerId, {
        channel: 'SMS',
        status: 'QUEUED',
        subject: null, // SMS doesn't need subject
      });
      reviewRequestId = smsRequest.id;
    });

    it('should process SMS job successfully', async () => {
      // Mock Twilio success
      const { sendSMS, formatPhoneNumberForTwilio } = require('../services/twilio');
      formatPhoneNumberForTwilio.mockReturnValue('+447123456789');
      sendSMS.mockResolvedValue({
        success: true,
        data: { sid: 'twilio_message_123' },
      });

      const mockJob = {
        id: 'job-123',
        data: {
          requestId: reviewRequestId,
          retryCount: 0,
        },
      } as Job<any>;

      const result = await processSendRequestJob(mockJob);

      expect(result.success).toBe(true);
      expect(result.status).toBe('SENT');
      expect(result.messageId).toBe('twilio_message_123');

      // Verify SMS credits were incremented
      const business = await global.testUtils.prisma.business.findUnique({
        where: { id: businessId },
      });

      expect(business?.smsCreditsUsed).toBe(1);
    });

    it('should validate customer has phone for SMS channel', async () => {
      // Create customer without phone
      const customerWithoutPhone = await global.testUtils.createTestCustomer(businessId, {
        phone: null,
      });

      const reviewRequestWithoutPhone = await global.testUtils.createTestReviewRequest(
        businessId,
        customerWithoutPhone.id,
        { channel: 'SMS', status: 'QUEUED' }
      );

      const mockJob = {
        id: 'job-123',
        data: {
          requestId: reviewRequestWithoutPhone.id,
          retryCount: 0,
        },
      } as Job<any>;

      const result = await processSendRequestJob(mockJob);

      expect(result.success).toBe(false);
      expect(result.error).toContain('phone number');
    });
  });

  describe('Error Handling', () => {
    it('should handle non-existent review request', async () => {
      const mockJob = {
        id: 'job-123',
        data: {
          requestId: 'non-existent',
          retryCount: 0,
        },
      } as Job<any>;

      const result = await processSendRequestJob(mockJob);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Review request not found');
    });

    it('should skip already processed requests', async () => {
      // Mark request as already sent
      await global.testUtils.prisma.reviewRequest.update({
        where: { id: reviewRequestId },
        data: { status: 'SENT' },
      });

      const mockJob = {
        id: 'job-123',
        data: {
          requestId: reviewRequestId,
          retryCount: 0,
        },
      } as Job<any>;

      const result = await processSendRequestJob(mockJob);

      expect(result.success).toBe(true);
      expect(result.status).toBe('SENT');

      // Should not call external services
      const { sendEmail } = require('../services/sendgrid');
      expect(sendEmail).not.toHaveBeenCalled();
    });

    it('should handle inactive business', async () => {
      // Deactivate business
      await global.testUtils.prisma.business.update({
        where: { id: businessId },
        data: { isActive: false },
      });

      const mockJob = {
        id: 'job-123',
        data: {
          requestId: reviewRequestId,
          retryCount: 0,
        },
      } as Job<any>;

      const result = await processSendRequestJob(mockJob);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Business not found or inactive');
    });
  });

  describe('Message Templating', () => {
    it('should replace template variables correctly', async () => {
      // Mock SendGrid to capture the message content
      const { sendEmail } = require('../services/sendgrid');
      let capturedEmailData: any;

      sendEmail.mockImplementation((emailData: any) => {
        capturedEmailData = emailData;
        return Promise.resolve({
          success: true,
          data: { message_id: 'sg_message_123' },
        });
      });

      // Update request with template variables
      await global.testUtils.prisma.reviewRequest.update({
        where: { id: reviewRequestId },
        data: {
          messageContent: 'Hi {{firstName}}, {{businessName}} would love your feedback!',
          subject: 'Review request from {{businessName}}',
        },
      });

      const mockJob = {
        id: 'job-123',
        data: {
          requestId: reviewRequestId,
          retryCount: 0,
        },
      } as Job<any>;

      await processSendRequestJob(mockJob);

      expect(sendEmail).toHaveBeenCalled();
      expect(capturedEmailData.subject).toContain('Test Business'); // Business name
      expect(capturedEmailData.content[0].value).toContain('John'); // Customer name
      expect(capturedEmailData.content[0].value).toContain('Test Business');
    });
  });
});
