import {
  createReviewRequest,
  getReviewRequestById,
  markReviewRequestClicked,
  getReviewRequestStats,
} from '../review-requests';

describe('Review Request Service', () => {
  let businessId: string;
  let customerId: string;

  beforeEach(async () => {
    await global.testUtils.cleanup();

    const business = await global.testUtils.createTestBusiness();
    businessId = business.id;

    const customer = await global.testUtils.createTestCustomer(businessId);
    customerId = customer.id;
  });

  describe('createReviewRequest', () => {
    it('should create a review request successfully', async () => {
      const params = {
        businessId,
        customerId,
        channel: 'EMAIL' as const,
        subject: 'Test Review Request',
        messageContent: 'Please leave us a review!',
        reviewUrl: 'https://example.com/review',
      };

      const result = await createReviewRequest(params);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data?.businessId).toBe(businessId);
      expect(result.data?.customerId).toBe(customerId);
      expect(result.data?.status).toBe('QUEUED');
      expect(result.data?.trackingUuid).toBeDefined();
      expect(result.data?.trackingUrl).toContain('/r/');
    });

    it('should fail for non-existent customer', async () => {
      const params = {
        businessId,
        customerId: 'non-existent',
        channel: 'EMAIL' as const,
        subject: 'Test',
        messageContent: 'Test',
        reviewUrl: 'https://example.com',
      };

      const result = await createReviewRequest(params);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Customer not found');
    });

    it('should fail when customer lacks required contact method', async () => {
      // Create customer without email
      const customerWithoutEmail = await global.testUtils.createTestCustomer(businessId, {
        email: null,
      });

      const params = {
        businessId,
        customerId: customerWithoutEmail.id,
        channel: 'EMAIL' as const,
        subject: 'Test',
        messageContent: 'Test',
        reviewUrl: 'https://example.com',
      };

      const result = await createReviewRequest(params);

      expect(result.success).toBe(false);
      expect(result.error).toContain('email address');
    });

    it('should fail when email channel missing subject', async () => {
      const params = {
        businessId,
        customerId,
        channel: 'EMAIL' as const,
        // Missing subject
        messageContent: 'Test',
        reviewUrl: 'https://example.com',
      };

      const result = await createReviewRequest(params);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Subject is required');
    });

    it('should create event log entry', async () => {
      const params = {
        businessId,
        customerId,
        channel: 'EMAIL' as const,
        subject: 'Test',
        messageContent: 'Test',
        reviewUrl: 'https://example.com',
      };

      const result = await createReviewRequest(params);
      expect(result.success).toBe(true);

      // Check event was created
      const events = await global.testUtils.prisma.event.findMany({
        where: {
          businessId,
          reviewRequestId: result.data?.id,
          type: 'REQUEST_CREATED',
        },
      });

      expect(events).toHaveLength(1);
      expect(events[0].description).toContain('Review request created');
    });
  });

  describe('getReviewRequestById', () => {
    it('should retrieve review request by ID', async () => {
      const reviewRequest = await global.testUtils.createTestReviewRequest(businessId, customerId);

      const result = await getReviewRequestById(reviewRequest.id);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data?.id).toBe(reviewRequest.id);
      expect(result.data?.customer).toBeDefined();
    });

    it('should return null for non-existent request', async () => {
      const result = await getReviewRequestById('non-existent');

      expect(result.success).toBe(true);
      expect(result.data).toBeNull();
    });

    it('should filter by business ID when provided', async () => {
      const reviewRequest = await global.testUtils.createTestReviewRequest(businessId, customerId);

      // Try to get with wrong business ID
      const result = await getReviewRequestById(reviewRequest.id, 'wrong-business-id');

      expect(result.success).toBe(true);
      expect(result.data).toBeNull();
    });
  });

  describe('markReviewRequestClicked', () => {
    it('should mark request as clicked with metadata', async () => {
      const reviewRequest = await global.testUtils.createTestReviewRequest(businessId, customerId, {
        status: 'SENT',
      });

      const metadata = {
        userAgent: 'Test Browser/1.0',
        ipAddress: '192.168.1.1',
      };

      const result = await markReviewRequestClicked(reviewRequest.id, metadata);

      expect(result.success).toBe(true);

      // Verify database update
      const updated = await global.testUtils.prisma.reviewRequest.findUnique({
        where: { id: reviewRequest.id },
      });

      expect(updated?.status).toBe('CLICKED');
      expect(updated?.clickedAt).toBeDefined();

      // Verify event was logged
      const events = await global.testUtils.prisma.event.findMany({
        where: {
          reviewRequestId: reviewRequest.id,
          type: 'REQUEST_CLICKED',
        },
      });

      expect(events).toHaveLength(1);
      expect(events[0].metadata).toEqual(metadata);
    });
  });

  describe('getReviewRequestStats', () => {
    beforeEach(async () => {
      // Create sample review requests with different statuses
      await global.testUtils.createTestReviewRequest(businessId, customerId, { status: 'SENT' });
      await global.testUtils.createTestReviewRequest(businessId, customerId, { status: 'SENT' });
      await global.testUtils.createTestReviewRequest(businessId, customerId, { status: 'CLICKED' });
      await global.testUtils.createTestReviewRequest(businessId, customerId, {
        status: 'DELIVERED',
        channel: 'SMS',
      });
    });

    it('should calculate stats correctly', async () => {
      const result = await getReviewRequestStats(businessId);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();

      const stats = result.data!;
      expect(stats.total).toBe(4);
      expect(stats.byStatus.SENT).toBe(2);
      expect(stats.byStatus.CLICKED).toBe(1);
      expect(stats.byStatus.DELIVERED).toBe(1);
      expect(stats.byChannel.EMAIL).toBe(3);
      expect(stats.byChannel.SMS).toBe(1);
    });

    it('should filter by date range', async () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);

      const result = await getReviewRequestStats(businessId, {
        from: yesterday,
        to: tomorrow,
      });

      expect(result.success).toBe(true);
      expect(result.data?.total).toBe(4); // All requests should be in range
    });

    it('should calculate delivery and click rates', async () => {
      // Add more specific test data for rate calculations
      await global.testUtils.cleanup();

      // Create fresh business and customer
      const business = await global.testUtils.createTestBusiness();
      const customer = await global.testUtils.createTestCustomer(business.id);

      // Create requests with specific statuses for rate calculation
      await global.testUtils.createTestReviewRequest(business.id, customer.id, { status: 'SENT' });
      await global.testUtils.createTestReviewRequest(business.id, customer.id, {
        status: 'DELIVERED',
      });
      await global.testUtils.createTestReviewRequest(business.id, customer.id, {
        status: 'CLICKED',
      });

      const result = await getReviewRequestStats(business.id);

      expect(result.success).toBe(true);
      const stats = result.data!;

      // With 1 SENT, 1 DELIVERED, 1 CLICKED:
      // Delivery rate: 1 delivered / 1 sent = 100%
      // Click rate: 1 clicked / 1 delivered = 100%
      expect(stats.deliveryRate).toBe(100);
      expect(stats.clickRate).toBe(100);
    });
  });
});
