import { buildApp } from '../../server';
import type { FastifyInstance } from 'fastify';

describe('Review Request API Routes', () => {
  let app: FastifyInstance;
  let businessId: string;
  let customerId: string;

  beforeAll(async () => {
    app = await buildApp();
  });

  beforeEach(async () => {
    await global.testUtils.cleanup();

    // Create test business and customer
    const business = await global.testUtils.createTestBusiness();
    businessId = business.id;

    const customer = await global.testUtils.createTestCustomer(businessId);
    customerId = customer.id;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /api/review-requests', () => {
    it('should return empty list when no requests exist', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/review-requests',
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.payload);
      expect(data.success).toBe(true);
      expect(data.data).toEqual([]);
    });

    it('should return review requests with pagination', async () => {
      // Create test review requests
      await global.testUtils.createTestReviewRequest(businessId, customerId);
      await global.testUtils.createTestReviewRequest(businessId, customerId, {
        subject: 'Second Request',
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/review-requests',
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.payload);
      expect(data.success).toBe(true);
      expect(data.data).toHaveLength(2);
      expect(data.meta.pagination.totalCount).toBe(2);
    });

    it('should filter by status', async () => {
      await global.testUtils.createTestReviewRequest(businessId, customerId, {
        status: 'SENT',
      });
      await global.testUtils.createTestReviewRequest(businessId, customerId, {
        status: 'QUEUED',
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/review-requests?status=SENT',
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.payload);
      expect(data.success).toBe(true);
      expect(data.data).toHaveLength(1);
      expect(data.data[0].status).toBe('SENT');
    });
  });

  describe('POST /api/review-requests', () => {
    it('should create a review request successfully', async () => {
      const requestData = {
        customerId,
        channel: 'EMAIL' as const,
        subject: 'Please review us',
        messageContent: 'Hi {{firstName}}, please leave a review!',
        reviewUrl: 'https://g.page/business/review',
      };

      const response = await app.inject({
        method: 'POST',
        url: '/api/review-requests',
        payload: requestData,
      });

      expect(response.statusCode).toBe(201);
      const data = JSON.parse(response.payload);
      expect(data.success).toBe(true);
      expect(data.data.status).toBe('QUEUED');
      expect(data.data.customerId).toBe(customerId);
      expect(data.data.trackingUuid).toBeDefined();
      expect(data.data.trackingUrl).toContain('/r/');
    });

    it('should validate required fields', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/review-requests',
        payload: {
          // Missing required fields
          channel: 'EMAIL',
        },
      });

      expect(response.statusCode).toBe(400);
      const data = JSON.parse(response.payload);
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('VALIDATION_ERROR');
    });

    it('should validate customer exists', async () => {
      const requestData = {
        customerId: 'non-existent-customer',
        channel: 'EMAIL' as const,
        subject: 'Test',
        messageContent: 'Test message',
        reviewUrl: 'https://example.com',
      };

      const response = await app.inject({
        method: 'POST',
        url: '/api/review-requests',
        payload: requestData,
      });

      expect(response.statusCode).toBe(400);
      const data = JSON.parse(response.payload);
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('CUSTOMER_NOT_FOUND');
    });

    it('should validate email channel requires email address', async () => {
      // Create customer without email
      const customerWithoutEmail = await global.testUtils.createTestCustomer(businessId, {
        email: null,
      });

      const requestData = {
        customerId: customerWithoutEmail.id,
        channel: 'EMAIL' as const,
        subject: 'Test',
        messageContent: 'Test message',
        reviewUrl: 'https://example.com',
      };

      const response = await app.inject({
        method: 'POST',
        url: '/api/review-requests',
        payload: requestData,
      });

      expect(response.statusCode).toBe(400);
      const data = JSON.parse(response.payload);
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('INVALID_CONTACT');
    });

    it('should require subject for email channel', async () => {
      const requestData = {
        customerId,
        channel: 'EMAIL' as const,
        // Missing subject
        messageContent: 'Test message',
        reviewUrl: 'https://example.com',
      };

      const response = await app.inject({
        method: 'POST',
        url: '/api/review-requests',
        payload: requestData,
      });

      expect(response.statusCode).toBe(400);
      const data = JSON.parse(response.payload);
      expect(data.success).toBe(false);
      expect(data.error.message).toContain('Subject is required');
    });
  });

  describe('GET /api/review-requests/:id', () => {
    it('should return review request details', async () => {
      const reviewRequest = await global.testUtils.createTestReviewRequest(businessId, customerId);

      const response = await app.inject({
        method: 'GET',
        url: `/api/review-requests/${reviewRequest.id}`,
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.payload);
      expect(data.success).toBe(true);
      expect(data.data.id).toBe(reviewRequest.id);
      expect(data.data.customer).toBeDefined();
      expect(data.data.events).toBeDefined();
    });

    it('should return 404 for non-existent request', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/review-requests/non-existent-id',
      });

      expect(response.statusCode).toBe(404);
      const data = JSON.parse(response.payload);
      expect(data.success).toBe(false);
    });
  });
});
