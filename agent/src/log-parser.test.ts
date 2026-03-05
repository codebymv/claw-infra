import test from 'node:test';
import assert from 'node:assert/strict';
import { ZeroClawLogParser, LlmCallEvent } from './log-parser';

function collectLlmEvents(line: string): LlmCallEvent[] {
  const parser = new ZeroClawLogParser();
  const events: LlmCallEvent[] = [];
  parser.on('llm_call', (event: LlmCallEvent) => events.push(event));
  parser.feed(`${line}\n`);
  parser.flush();
  return events;
}

test('emits llm_call for OpenRouter-style llm_response payload tokens', () => {
  const events = collectLlmEvents(
    JSON.stringify({
      timestamp: '2026-03-05T05:21:29.284459816+00:00',
      event_type: 'llm_response',
      provider: 'openrouter',
      model: 'openai/gpt-5.3-codex',
      payload: {
        duration_ms: 4191,
        input_tokens: 4021,
        output_tokens: 137,
      },
    }),
  );

  assert.equal(events.length, 1);
  assert.equal(events[0].provider, 'openrouter');
  assert.equal(events[0].model, 'openai/gpt-5.3-codex');
  assert.equal(events[0].tokensIn, 4021);
  assert.equal(events[0].tokensOut, 137);
});

test('emits llm_call when usage.prompt_tokens/completion_tokens are present', () => {
  const events = collectLlmEvents(
    JSON.stringify({
      message: 'provider call completed',
      fields: { provider: 'openrouter', model: 'anthropic/claude-sonnet-4-6' },
      usage: {
        prompt_tokens: 1200,
        completion_tokens: 88,
      },
    }),
  );

  assert.equal(events.length, 1);
  assert.equal(events[0].provider, 'openrouter');
  assert.equal(events[0].model, 'anthropic/claude-sonnet-4-6');
  assert.equal(events[0].tokensIn, 1200);
  assert.equal(events[0].tokensOut, 88);
});

test('does not emit llm_call for unrelated log lines', () => {
  const events = collectLlmEvents(
    JSON.stringify({
      level: 'INFO',
      message: 'health check passed',
      target: 'system::health',
    }),
  );

  assert.equal(events.length, 0);
});
