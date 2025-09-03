import { buildApp } from '../../server';
import type { FastifyInstance } from 'fastify';

describe('Customer API Routes', () => {
  let app: FastifyInstance;
  let businessId: string;

  beforeAll(async () => {
    app = await buildApp();

    // Create test business
    const business = await global.testUtils.createTestBusiness();
    businessId = business.id;
  });

  beforeEach(async () => {
    await global.testUtils.cleanup();

    // Recreate business for each test
    const business = await global.testUtils.createTestBusiness();
    businessId = business.id;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /api/customers', () => {
    it('should return empty list when no customers exist', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/customers',
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.payload);
      expect(data.success).toBe(true);
      expect(data.data).toEqual([]);
    });

    it('should return customers with pagination', async () => {
      // Create test customers
      await global.testUtils.createTestCustomer(businessId, { firstName: 'Alice' });
      await global.testUtils.createTestCustomer(businessId, { firstName: 'Bob' });

      const response = await app.inject({
        method: 'GET',
        url: '/api/customers?page=1&limit=10',
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.payload);
      expect(data.success).toBe(true);
      expect(data.data).toHaveLength(2);
      expect(data.meta.pagination.totalCount).toBe(2);
    });
  });

  describe('POST /api/customers', () => {
    it('should create a new customer successfully', async () => {
      const customerData = {
        firstName: 'Jane',
        lastName: 'Smith',
        email: 'jane.smith@example.com',
        phone: '+447987654321',
        address: '123 Test Street',
      };

      const response = await app.inject({
        method: 'POST',
        url: '/api/customers',
        payload: customerData,
      });

      expect(response.statusCode).toBe(201);
      const data = JSON.parse(response.payload);
      expect(data.success).toBe(true);
      expect(data.data.firstName).toBe('Jane');
      expect(data.data.email).toBe('jane.smith@example.com');
    });

    it('should validate required fields', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/customers',
        payload: {
          // Missing firstName
          email: 'test@example.com',
        },
      });

      expect(response.statusCode).toBe(400);
      const data = JSON.parse(response.payload);
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('VALIDATION_ERROR');
    });

    it('should allow duplicate emails (no unique constraint)', async () => {
      const customerData = {
        firstName: 'John',
        email: 'duplicate@example.com',
      };

      // Create first customer
      const response1 = await app.inject({
        method: 'POST',
        url: '/api/customers',
        payload: customerData,
      });

      expect(response1.statusCode).toBe(201);

      // Create second customer with same email - should succeed
      const response2 = await app.inject({
        method: 'POST',
        url: '/api/customers',
        payload: { ...customerData, firstName: 'Jane' },
      });

      expect(response2.statusCode).toBe(201);
      const data = JSON.parse(response2.payload);
      expect(data.success).toBe(true);
    });
  });

  describe('GET /api/customers/:id', () => {
    it('should return customer details', async () => {
      const customer = await global.testUtils.createTestCustomer(businessId);

      const response = await app.inject({
        method: 'GET',
        url: `/api/customers/${customer.id}`,
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.payload);
      expect(data.success).toBe(true);
      expect(data.data.id).toBe(customer.id);
    });

    it('should return 404 for non-existent customer', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/customers/non-existent-id',
      });

      expect(response.statusCode).toBe(404);
      const data = JSON.parse(response.payload);
      expect(data.success).toBe(false);
    });
  });

  describe('PUT /api/customers/:id', () => {
    it('should update customer successfully', async () => {
      const customer = await global.testUtils.createTestCustomer(businessId);

      const updateData = {
        firstName: 'Updated Name',
        phone: '+447999888777',
      };

      const response = await app.inject({
        method: 'PUT',
        url: `/api/customers/${customer.id}`,
        payload: updateData,
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.payload);
      expect(data.success).toBe(true);
      expect(data.data.firstName).toBe('Updated Name');
      expect(data.data.phone).toBe('+447999888777');
    });
  });

  describe('DELETE /api/customers/:id', () => {
    it('should soft delete customer', async () => {
      const customer = await global.testUtils.createTestCustomer(businessId);

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/customers/${customer.id}`,
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.payload);
      expect(data.success).toBe(true);

      // Verify customer is soft deleted
      const deletedCustomer = await global.testUtils.prisma.customer.findUnique({
        where: { id: customer.id },
      });
      expect(deletedCustomer?.isActive).toBe(false);
    });
  });
});
