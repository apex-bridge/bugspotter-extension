import { describe, it, expect, vi } from 'vitest';
import { retryWithBackoff } from '@bugspotter/common';

describe('utils/retry', () => {
  it('returns on first successful response', async () => {
    const operation = vi.fn().mockResolvedValue({
      status: 200,
      headers: new Headers(),
    });

    const response = await retryWithBackoff(operation, { maxRetries: 3, baseDelay: 10 });
    expect(response.status).toBe(200);
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('retries on retryable status codes', async () => {
    const operation = vi
      .fn()
      .mockResolvedValueOnce({ status: 503, headers: new Headers() })
      .mockResolvedValueOnce({ status: 503, headers: new Headers() })
      .mockResolvedValue({ status: 200, headers: new Headers() });

    const response = await retryWithBackoff(operation, {
      maxRetries: 3,
      baseDelay: 10,
      maxDelay: 50,
    });
    expect(response.status).toBe(200);
    expect(operation).toHaveBeenCalledTimes(3);
  });

  it('does not retry on non-retryable status', async () => {
    const operation = vi.fn().mockResolvedValue({
      status: 400,
      headers: new Headers(),
    });

    const response = await retryWithBackoff(operation, { maxRetries: 3, baseDelay: 10 });
    expect(response.status).toBe(400);
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('retries on network errors', async () => {
    const operation = vi
      .fn()
      .mockRejectedValueOnce(new Error('Failed to fetch'))
      .mockResolvedValue({ status: 200, headers: new Headers() });

    const response = await retryWithBackoff(operation, { maxRetries: 3, baseDelay: 10 });
    expect(response.status).toBe(200);
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it('throws after exhausting retries', async () => {
    const operation = vi.fn().mockRejectedValue(new Error('Network failure'));

    await expect(
      retryWithBackoff(operation, { maxRetries: 2, baseDelay: 10, maxDelay: 20 }),
    ).rejects.toThrow('Network failure');
    expect(operation).toHaveBeenCalledTimes(3); // initial + 2 retries
  });

  it('does not retry auth errors', async () => {
    const operation = vi.fn().mockRejectedValue(new Error('Invalid API key'));

    await expect(retryWithBackoff(operation, { maxRetries: 3, baseDelay: 10 })).rejects.toThrow(
      'Invalid API key',
    );
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('returns retryable status if retries exhausted', async () => {
    const operation = vi.fn().mockResolvedValue({
      status: 429,
      headers: new Headers(),
    });

    const response = await retryWithBackoff(operation, {
      maxRetries: 2,
      baseDelay: 10,
      maxDelay: 20,
    });
    // After exhausting retries, the last response is returned
    expect(response.status).toBe(429);
    expect(operation).toHaveBeenCalledTimes(3);
  });
});
