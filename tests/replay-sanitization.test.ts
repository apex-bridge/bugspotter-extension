import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createSanitizer } from '@bugspotter/common';
import type { ReplayEvent } from '@bugspotter/common';
import type { ReplayInputMasking } from '@/types';

// Asserts on the serialized rrweb events, not on the sanitizer in isolation:
// calling sanitizeTextNode directly passes even when rrweb never invokes it.
// See apex-bridge/bugspotter-extension#33.

const EMAIL = 'jane.doe@example.com';
const CONTROL = 'Checkout total updated';
const PASSWORD = 'hunter2secret';

const flush = () => new Promise((resolve) => setTimeout(resolve, 50));

const type = (id: string, value: string) => {
  const input = document.getElementById(id) as HTMLInputElement;
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
};

describe('replay recorder sanitization', () => {
  let recorder: typeof import('@/content/replay-recorder');
  let events: ReplayEvent[];

  // Recorder state is module-level, so load a fresh copy per test.
  const start = async (inputMasking: ReplayInputMasking) => {
    recorder = await import('@/content/replay-recorder');
    recorder.startReplayRecording({
      sanitizer: createSanitizer({ enabled: true }),
      inputMasking,
      onBatch: (batch) => events.push(...batch),
    });
  };

  const serialized = () => {
    recorder.forceFlushReplayBatch();
    return JSON.stringify(events);
  };

  beforeEach(() => {
    vi.resetModules();
    events = [];
    document.body.innerHTML = '';
  });

  afterEach(() => {
    recorder.stopReplayRecording();
    document.body.innerHTML = '';
  });

  it('redacts PII in text present at snapshot time', async () => {
    document.body.innerHTML = `<p>Contact ${EMAIL}</p><p>${CONTROL}</p>`;
    await start('pii-only');

    expect(serialized()).not.toContain(EMAIL);
    expect(serialized()).toContain(CONTROL);
  });

  it('redacts PII in text added after recording starts', async () => {
    await start('pii-only');
    const p = document.createElement('p');
    p.textContent = `Contact ${EMAIL}`;
    document.body.appendChild(p);
    await flush();

    expect(serialized()).not.toContain(EMAIL);
  });

  it('redacts PII in text changed after recording starts', async () => {
    document.body.innerHTML = `<p id="msg">${CONTROL}</p>`;
    await start('pii-only');
    document.getElementById('msg')!.firstChild!.textContent = `Contact ${EMAIL}`;
    await flush();

    expect(serialized()).not.toContain(EMAIL);
  });

  // rrweb's needMaskingText() returns false for a text node with no parent
  // element, so text sitting directly under a ShadowRoot skips maskTextFn on
  // the mutation path. Each test also asserts the non-PII part is present, so
  // a pass proves rrweb recorded the shadow text rather than dropping it.
  describe('text directly under a shadow root', () => {
    const host = () => {
      const el = document.createElement('div');
      document.body.appendChild(el);
      return el.attachShadow({ mode: 'open' });
    };

    it('redacts PII present at snapshot time', async () => {
      host().append(`${CONTROL} ${EMAIL}`);
      await start('pii-only');

      expect(serialized()).toContain(CONTROL);
      expect(serialized()).not.toContain(EMAIL);
    });

    it('redacts PII appended after recording starts', async () => {
      const root = host();
      await start('pii-only');
      root.append(`${CONTROL} ${EMAIL}`);
      await flush();

      expect(serialized()).toContain(CONTROL);
      expect(serialized()).not.toContain(EMAIL);
    });

    it('redacts PII in a host added after recording starts', async () => {
      await start('pii-only');
      host().append(`${CONTROL} ${EMAIL}`);
      await flush();

      expect(serialized()).toContain(CONTROL);
      expect(serialized()).not.toContain(EMAIL);
    });

    it('redacts PII when the text data changes', async () => {
      const text = document.createTextNode('placeholder');
      host().append(text);
      await start('pii-only');
      text.data = `Shipped to ${EMAIL}`;
      await flush();

      expect(serialized()).toContain('Shipped to');
      expect(serialized()).not.toContain(EMAIL);
    });
  });

  describe("inputMasking 'pii-only'", () => {
    it('redacts PII in input values and keeps non-PII values readable', async () => {
      document.body.innerHTML = '<input id="email" type="text"><input id="q" type="search">';
      (document.getElementById('email') as HTMLInputElement).value = EMAIL;
      await start('pii-only');
      type('q', CONTROL);
      await flush();

      expect(serialized()).not.toContain(EMAIL);
      expect(serialized()).toContain(CONTROL);
    });

    it('redacts PII typed after recording starts', async () => {
      document.body.innerHTML = '<input id="email" type="email">';
      await start('pii-only');
      type('email', EMAIL);
      await flush();

      expect(serialized()).not.toContain(EMAIL);
    });

    it('masks password values at snapshot and on input', async () => {
      document.body.innerHTML = '<input id="pw" type="password">';
      (document.getElementById('pw') as HTMLInputElement).value = PASSWORD;
      await start('pii-only');
      type('pw', `${PASSWORD}2`);
      await flush();

      expect(serialized()).not.toContain(PASSWORD);
    });
  });

  describe("inputMasking 'all'", () => {
    it('masks every input value', async () => {
      document.body.innerHTML = '<input id="q" type="search"><input id="pw" type="password">';
      await start('all');
      type('q', CONTROL);
      type('pw', PASSWORD);
      await flush();

      expect(serialized()).not.toContain(CONTROL);
      expect(serialized()).not.toContain(PASSWORD);
    });
  });
});
