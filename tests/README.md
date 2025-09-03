# Testing Suite

This directory contains the comprehensive testing suite for Review Runner.

## Test Structure

### Test Types

1. **Unit Tests** (`*.test.ts`): Test individual functions and modules in isolation
2. **Integration Tests** (`__tests__/*.test.ts`): Test API routes and service interactions
3. **End-to-End Tests** (`e2e.test.ts`): Test complete user workflows

### Test Organization

```
tests/
├── setup.ts          # Global test setup and utilities
├── teardown.ts       # Global test cleanup
├── e2e.test.ts       # End-to-end workflow tests
└── README.md         # This file

src/
├── api/routes/__tests__/    # API route integration tests
├── services/__tests__/      # Service layer unit tests
└── jobs/__tests__/          # Job processor tests
```

## Running Tests

### All Tests

```bash
npm test
```

### Test Categories

```bash
# Unit tests only
npm run test:unit

# Integration tests only
npm run test:integration

# End-to-end tests only
npm run test:e2e

# Watch mode for development
npm run test:watch

# Coverage report
npm run test:coverage
```

## Test Database

Tests use a separate test database to avoid interfering with development data:

- **Setup**: Each test run creates a unique test database
- **Isolation**: Each test case cleans up its data
- **Utilities**: Global test utilities for creating test data

## Test Utilities

The global `testUtils` object provides:

- `prisma`: Direct database access for test setup/verification
- `createTestBusiness()`: Creates a test business
- `createTestCustomer()`: Creates a test customer
- `createTestReviewRequest()`: Creates a test review request
- `cleanup()`: Removes all test data

## Mocking External Services

External services are mocked in tests:

- **SendGrid**: Email sending mocked for isolation
- **Twilio**: SMS sending mocked for isolation
- **Redis**: Uses separate database (DB 15) for queue tests

## Test Coverage

The test suite covers:

✅ **API Endpoints**

- Customer CRUD operations
- Review request creation and management
- Click tracking and redirects
- Analytics endpoints
- Error handling and validation

✅ **Business Logic**

- Review request processing
- Template variable replacement
- Click tracking
- Statistics calculation
- Suppression handling

✅ **Job Processing**

- Email sending jobs
- SMS sending jobs
- Error handling and retries
- Credit limit validation

✅ **End-to-End Workflows**

- Complete review request lifecycle
- Customer management flows
- Analytics and reporting
- Error scenarios

## Writing New Tests

### 1. Unit Tests

```typescript
import { functionToTest } from '../module';

describe('Module Name', () => {
  it('should do something', () => {
    const result = functionToTest('input');
    expect(result).toBe('expected');
  });
});
```

### 2. API Integration Tests

```typescript
import { buildApp } from '../../server';

describe('API Route', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('should handle request', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/endpoint',
    });

    expect(response.statusCode).toBe(200);
  });
});
```

### 3. Using Test Utilities

```typescript
beforeEach(async () => {
  await global.testUtils.cleanup();

  const business = await global.testUtils.createTestBusiness();
  const customer = await global.testUtils.createTestCustomer(business.id);
  // ... use in tests
});
```

## Best Practices

1. **Isolation**: Each test should be independent
2. **Cleanup**: Always clean up test data
3. **Mocking**: Mock external services appropriately
4. **Assertions**: Use specific, meaningful assertions
5. **Naming**: Use descriptive test names
6. **Documentation**: Comment complex test scenarios

## Continuous Integration

Tests are designed to run in CI environments:

- Database setup is automated
- External service mocking prevents network calls
- Deterministic test data ensures consistent results
- Coverage reporting tracks test quality
