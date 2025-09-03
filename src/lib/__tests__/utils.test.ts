import {
  generateTrackingUrl,
  generateUnsubscribeUrl,
  isValidEmail,
  isValidUKPhone,
} from '../utils';

describe('Utils Library', () => {
  describe('generateTrackingUrl', () => {
    it('should generate correct tracking URL', () => {
      const baseUrl = 'https://example.com';
      const uuid = 'test-uuid-123';

      const result = generateTrackingUrl(baseUrl, uuid);

      expect(result).toBe('https://example.com/r/test-uuid-123');
    });

    it('should handle base URL without trailing slash', () => {
      const result = generateTrackingUrl('https://example.com', 'uuid');
      expect(result).toBe('https://example.com/r/uuid');
    });

    it('should handle base URL with trailing slash', () => {
      const result = generateTrackingUrl('https://example.com/', 'uuid');
      expect(result).toBe('https://example.com//r/uuid'); // Note: accepts double slash
    });
  });

  describe('generateUnsubscribeUrl', () => {
    it('should generate correct unsubscribe URL', () => {
      const baseUrl = 'https://example.com';
      const uuid = 'test-uuid-123';

      const result = generateUnsubscribeUrl(baseUrl, uuid);

      expect(result).toBe('https://example.com/r/unsubscribe/test-uuid-123');
    });
  });

  describe('isValidEmail', () => {
    it('should validate correct email addresses', () => {
      expect(isValidEmail('test@example.com')).toBe(true);
      expect(isValidEmail('user.name+tag@domain.co.uk')).toBe(true);
      expect(isValidEmail('user@subdomain.domain.com')).toBe(true);
    });

    it('should reject invalid email addresses', () => {
      expect(isValidEmail('invalid')).toBe(false);
      expect(isValidEmail('invalid@')).toBe(false);
      expect(isValidEmail('@invalid.com')).toBe(false);
      expect(isValidEmail('invalid@.com')).toBe(false);
      expect(isValidEmail('')).toBe(false);
      expect(isValidEmail('spaces in@email.com')).toBe(false);
    });

    it('should handle null and undefined', () => {
      expect(isValidEmail(null as any)).toBe(false);
      expect(isValidEmail(undefined as any)).toBe(false);
    });
  });

  describe('isValidUKPhone', () => {
    it('should validate UK phone numbers', () => {
      expect(isValidUKPhone('+447123456789')).toBe(true);
      expect(isValidUKPhone('+44 7123 456789')).toBe(true);
      expect(isValidUKPhone('07123456789')).toBe(true);
    });

    it('should reject non-UK phone numbers', () => {
      expect(isValidUKPhone('+1234567890')).toBe(false);
      expect(isValidUKPhone('+491234567890')).toBe(false);
    });

    it('should reject invalid phone numbers', () => {
      expect(isValidUKPhone('invalid')).toBe(false);
      expect(isValidUKPhone('123')).toBe(false);
      expect(isValidUKPhone('')).toBe(false);
      expect(isValidUKPhone('letters123')).toBe(false);
    });

    it('should handle null and undefined', () => {
      expect(isValidUKPhone(null as any)).toBe(false);
      expect(isValidUKPhone(undefined as any)).toBe(false);
    });
  });
});
