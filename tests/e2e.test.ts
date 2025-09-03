import { buildApp } from '../src/api/server';
import type { FastifyInstance } from 'fastify';

describe('End-to-End Review Request Flow', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
  });

  beforeEach(async () => {
    await global.testUtils.cleanup();
  });

  afterAll(async () => {
    await app.close();
  });

  it('should complete full review request workflow', async () => {
    // Step 1: Create a customer
    const customerData = {
      firstName: 'John',
      lastName: 'Doe',
      email: 'john.doe@example.com',
      phone: '+447123456789',
      address: '123 Test Street',
    };

    const createCustomerResponse = await app.inject({
      method: 'POST',
      url: '/api/customers',
      payload: customerData,
    });

    expect(createCustomerResponse.statusCode).toBe(201);
    const customer = JSON.parse(createCustomerResponse.payload).data;

    // Step 2: Create a review request
    const reviewRequestData = {
      customerId: customer.id,
      channel: 'EMAIL',
      subject: 'Please share your experience with {{businessName}}',
      messageContent: 'Hi {{firstName}}, we would love to hear about your experience!',
      reviewUrl: 'https://g.page/test-business/review',
    };

    const createRequestResponse = await app.inject({
      method: 'POST',
      url: '/api/review-requests',
      payload: reviewRequestData,
    });

    expect(createRequestResponse.statusCode).toBe(201);
    const reviewRequest = JSON.parse(createRequestResponse.payload).data;

    expect(reviewRequest.status).toBe('QUEUED');
    expect(reviewRequest.trackingUuid).toBeDefined();
    expect(reviewRequest.trackingUrl).toContain('/r/');

    // Step 3: Verify customer can be retrieved with review request count
    const getCustomerResponse = await app.inject({
      method: 'GET',
      url: `/api/customers/${customer.id}`,
    });

    expect(getCustomerResponse.statusCode).toBe(200);
    const customerWithStats = JSON.parse(getCustomerResponse.payload).data;
    expect(customerWithStats._count.reviewRequests).toBe(1);

    // Step 4: Test click tracking
    const clickTrackingResponse = await app.inject({
      method: 'GET',
      url: `/r/${reviewRequest.trackingUuid}`,
      headers: {
        'user-agent': 'Test Browser/1.0',
        'x-forwarded-for': '192.168.1.100',
      },
    });

    expect(clickTrackingResponse.statusCode).toBe(302);
    expect(clickTrackingResponse.headers.location).toBe(reviewRequest.reviewUrl);

    // Step 5: Verify click was tracked
    const getRequestResponse = await app.inject({
      method: 'GET',
      url: `/api/review-requests/${reviewRequest.id}`,
    });

    expect(getRequestResponse.statusCode).toBe(200);
    const updatedRequest = JSON.parse(getRequestResponse.payload).data;

    expect(updatedRequest.status).toBe('CLICKED');
    expect(updatedRequest.clickedAt).toBeDefined();

    // Verify click event was logged
    const clickEvent = updatedRequest.events.find((e: any) => e.type === 'REQUEST_CLICKED');
    expect(clickEvent).toBeDefined();
    expect(clickEvent.metadata.ipAddress).toBe('192.168.1.100');
    expect(clickEvent.metadata.userAgent).toBe('Test Browser/1.0');

    // Step 6: Test analytics endpoint
    const analyticsResponse = await app.inject({
      method: 'GET',
      url: '/api/analytics/overview',
    });

    expect(analyticsResponse.statusCode).toBe(200);
    const analytics = JSON.parse(analyticsResponse.payload).data;

    expect(analytics.totalCustomers).toBe(1);
    expect(analytics.totalRequests).toBe(1);
    expect(analytics.clickRate).toBeGreaterThan(0); // Should have clicks now

    // Step 7: Test unsubscribe functionality
    const unsubscribeResponse = await app.inject({
      method: 'GET',
      url: `/r/unsubscribe/${reviewRequest.trackingUuid}`,
    });

    expect(unsubscribeResponse.statusCode).toBe(200);
    expect(unsubscribeResponse.payload).toContain('Successfully Unsubscribed');

    // Verify suppression was created
    const suppressions = await global.testUtils.prisma.suppression.findMany({
      where: {
        contact: customer.email,
        channel: 'EMAIL',
      },
    });

    expect(suppressions).toHaveLength(1);
    expect(suppressions[0].reason).toBe('EMAIL_UNSUBSCRIBE');

    // Step 8: Test customer update
    const updateCustomerResponse = await app.inject({
      method: 'PUT',
      url: `/api/customers/${customer.id}`,
      payload: {
        firstName: 'Jane',
        phone: '+447999888777',
      },
    });

    expect(updateCustomerResponse.statusCode).toBe(200);
    const updatedCustomer = JSON.parse(updateCustomerResponse.payload).data;
    expect(updatedCustomer.firstName).toBe('Jane');
    expect(updatedCustomer.phone).toBe('+447999888777');

    // Step 9: Test customer deletion (soft delete)
    const deleteCustomerResponse = await app.inject({
      method: 'DELETE',
      url: `/api/customers/${customer.id}`,
    });

    expect(deleteCustomerResponse.statusCode).toBe(200);

    // Verify customer is soft deleted but review request still exists
    const deletedCustomer = await global.testUtils.prisma.customer.findUnique({
      where: { id: customer.id },
    });
    expect(deletedCustomer?.isActive).toBe(false);

    const reviewRequestStillExists = await global.testUtils.prisma.reviewRequest.findUnique({
      where: { id: reviewRequest.id },
    });
    expect(reviewRequestStillExists).toBeDefined();
  });

  it('should handle validation errors gracefully', async () => {
    // Test customer validation
    const invalidCustomerResponse = await app.inject({
      method: 'POST',
      url: '/api/customers',
      payload: {
        // Missing required firstName
        email: 'test@example.com',
      },
    });

    expect(invalidCustomerResponse.statusCode).toBe(400);
    const customerError = JSON.parse(invalidCustomerResponse.payload);
    expect(customerError.success).toBe(false);
    expect(customerError.error.code).toBe('VALIDATION_ERROR');

    // Test review request validation
    const invalidRequestResponse = await app.inject({
      method: 'POST',
      url: '/api/review-requests',
      payload: {
        // Missing required fields
        channel: 'EMAIL',
      },
    });

    expect(invalidRequestResponse.statusCode).toBe(400);
    const requestError = JSON.parse(invalidRequestResponse.payload);
    expect(requestError.success).toBe(false);
    expect(requestError.error.code).toBe('VALIDATION_ERROR');
  });

  it('should handle non-existent resources correctly', async () => {
    // Test 404 for non-existent customer
    const notFoundCustomerResponse = await app.inject({
      method: 'GET',
      url: '/api/customers/non-existent-id',
    });

    expect(notFoundCustomerResponse.statusCode).toBe(404);

    // Test 404 for non-existent review request
    const notFoundRequestResponse = await app.inject({
      method: 'GET',
      url: '/api/review-requests/non-existent-id',
    });

    expect(notFoundRequestResponse.statusCode).toBe(404);

    // Test 404 for invalid tracking UUID
    const notFoundTrackingResponse = await app.inject({
      method: 'GET',
      url: '/r/invalid-tracking-uuid',
    });

    expect(notFoundTrackingResponse.statusCode).toBe(404);
    expect(notFoundTrackingResponse.payload).toContain('Link Not Found');
  });

  it('should handle pagination correctly', async () => {
    // Create test business and multiple customers
    const business = await global.testUtils.createTestBusiness();

    // Create 25 customers
    const customers = [];
    for (let i = 0; i < 25; i++) {
      const customer = await global.testUtils.createTestCustomer(business.id, {
        firstName: `Customer${i}`,
        email: `customer${i}@example.com`,
      });
      customers.push(customer);
    }

    // Test first page
    const page1Response = await app.inject({
      method: 'GET',
      url: '/api/customers?page=1&limit=10',
    });

    expect(page1Response.statusCode).toBe(200);
    const page1Data = JSON.parse(page1Response.payload);
    expect(page1Data.data).toHaveLength(10);
    expect(page1Data.meta.pagination.page).toBe(1);
    expect(page1Data.meta.pagination.totalCount).toBe(25);
    expect(page1Data.meta.pagination.totalPages).toBe(3);
    expect(page1Data.meta.pagination.hasNextPage).toBe(true);

    // Test last page
    const page3Response = await app.inject({
      method: 'GET',
      url: '/api/customers?page=3&limit=10',
    });

    expect(page3Response.statusCode).toBe(200);
    const page3Data = JSON.parse(page3Response.payload);
    expect(page3Data.data).toHaveLength(5); // Remaining 5 customers
    expect(page3Data.meta.pagination.hasNextPage).toBe(false);
    expect(page3Data.meta.pagination.hasPrevPage).toBe(true);
  });
});
