import { describe, it, expect } from 'vitest';
import { Sanitizer } from '@bugspotter/common';

describe('utils/sanitizer', () => {
  describe('when enabled', () => {
    const sanitizer = new Sanitizer({ enabled: true });

    it('redacts email addresses', () => {
      expect(sanitizer.sanitizeString('user@example.com')).toBe('[REDACTED-EMAIL]');
    });

    it('redacts credit card numbers', () => {
      expect(sanitizer.sanitizeString('4532-1488-0343-6467')).toBe('[REDACTED-CREDITCARD]');
    });

    it('redacts SSNs', () => {
      expect(sanitizer.sanitizeString('123-45-6789')).toBe('[REDACTED-SSN]');
    });

    it('redacts IP addresses', () => {
      expect(sanitizer.sanitizeString('192.168.1.100')).toBe('[REDACTED-IP]');
    });

    it('redacts phone numbers', () => {
      expect(sanitizer.sanitizeString('+1-555-123-4567')).toBe('[REDACTED-PHONE]');
    });

    it('redacts API keys', () => {
      expect(sanitizer.sanitizeString('sk_live_abc123def456ghi789jkl012')).toBe(
        '[REDACTED-APIKEY]',
      );
    });

    it('redacts password fields', () => {
      const result = sanitizer.sanitizeString('password: MySecret123!');
      expect(result).toContain('[REDACTED-PASSWORD]');
    });

    it('handles multiple patterns in one string', () => {
      const result = sanitizer.sanitizeString('Contact user@test.com at 192.168.0.1');
      expect(result).toContain('[REDACTED-EMAIL]');
      expect(result).toContain('[REDACTED-IP]');
      expect(result).not.toContain('user@test.com');
    });

    it('recursively sanitizes objects', () => {
      const result = sanitizer.sanitize({
        email: 'user@example.com',
        nested: { ip: '10.0.0.1' },
      }) as Record<string, unknown>;
      expect(result.email as string).toContain('[REDACTED-EMAIL]');
      expect((result.nested as Record<string, string>).ip).toContain('[REDACTED-IP]');
    });

    it('recursively sanitizes arrays', () => {
      const result = sanitizer.sanitize(['user@test.com', 'plain text']) as string[];
      expect(result[0]).toContain('[REDACTED-EMAIL]');
      expect(result[1]).toBe('plain text');
    });

    it('passes through primitives', () => {
      expect(sanitizer.sanitize(42)).toBe(42);
      expect(sanitizer.sanitize(true)).toBe(true);
      expect(sanitizer.sanitize(null)).toBe(null);
      expect(sanitizer.sanitize(undefined)).toBe(undefined);
    });

    it('sanitizes console args', () => {
      const result = sanitizer.sanitizeConsoleArgs(['Email: user@test.com', 42]);
      expect(result[0] as string).toContain('[REDACTED-EMAIL]');
      expect(result[1]).toBe(42);
    });
  });

  describe('when disabled', () => {
    const sanitizer = new Sanitizer({ enabled: false });

    it('passes through strings unchanged', () => {
      expect(sanitizer.sanitizeString('user@example.com')).toBe('user@example.com');
    });

    it('passes through objects unchanged', () => {
      const obj = { email: 'user@example.com' };
      expect(sanitizer.sanitize(obj)).toEqual(obj);
    });
  });

  describe('with specific patterns', () => {
    const sanitizer = new Sanitizer({
      enabled: true,
      patterns: ['email', 'creditcard'],
    });

    it('redacts selected patterns', () => {
      expect(sanitizer.sanitizeString('user@example.com')).toContain('[REDACTED-EMAIL]');
    });

    it('does not redact unselected patterns', () => {
      expect(sanitizer.sanitizeString('192.168.1.1')).toBe('192.168.1.1');
    });
  });
});
