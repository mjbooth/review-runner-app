// Jest setup for GDPR testing
import '@testing-library/jest-dom';

// Global test configuration
global.fetch = require('jest-fetch-mock');

// Mock crypto for Node.js environment
const crypto = require('crypto');

Object.defineProperty(global, 'crypto', {
  value: {
    randomUUID: () => crypto.randomUUID(),
    createHash: algorithm => crypto.createHash(algorithm),
    createHmac: (algorithm, key) => crypto.createHmac(algorithm, key),
    randomBytes: size => crypto.randomBytes(size),
    scryptSync: (password, salt, keylen) => crypto.scryptSync(password, salt, keylen),
  },
});

// Mock next/router
jest.mock('next/router', () => ({
  useRouter: () => ({
    route: '/',
    pathname: '/',
    query: {},
    asPath: '/',
    push: jest.fn(),
    pop: jest.fn(),
    reload: jest.fn(),
    back: jest.fn(),
    prefetch: jest.fn(() => Promise.resolve()),
    beforePopState: jest.fn(),
    events: {
      on: jest.fn(),
      off: jest.fn(),
      emit: jest.fn(),
    },
  }),
}));

// Global test utilities
global.testUtils = {
  createMockBusiness: () => ({
    id: crypto.randomUUID(),
    name: 'Test Business',
    email: 'test@business.com',
    isActive: true,
  }),

  createMockCustomer: () => ({
    id: crypto.randomUUID(),
    email: 'customer@test.com',
    firstName: 'John',
    lastName: 'Doe',
    phone: '+447123456789',
  }),

  createMockGDPRRequest: () => ({
    id: crypto.randomUUID(),
    rightType: 'ACCESS',
    status: 'PENDING',
    requestorEmail: 'customer@test.com',
    createdAt: new Date(),
  }),
};

// Configure test timeout
jest.setTimeout(30000);

// Suppress console warnings during tests (unless explicitly needed)
const originalConsoleWarn = console.warn;
console.warn = (...args) => {
  if (args[0]?.includes('Warning: ReactDOM.render is no longer supported')) {
    return;
  }
  originalConsoleWarn.call(console, ...args);
};

// Setup and teardown for tests
beforeEach(() => {
  // Clear all mocks before each test
  jest.clearAllMocks();
  fetch.resetMocks();
});

afterEach(() => {
  // Cleanup after each test
  jest.restoreAllMocks();
});

// Global error handling
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', error => {
  console.error('Uncaught Exception:', error);
});
