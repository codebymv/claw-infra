import { EventEmitter } from 'events';

// ── Event types emitted by the parser ──

export interface RunStartEvent {
  type: 'run_start';
  taskId?: string;
  message: string;
  timestamp: Date;
}

export interface RunCompleteEvent {
  type: 'run_complete';
  taskId?: string;
  success: boolean;
  durationMs?: number;
  error?: string;
  timestamp: Date;
}

export interface ToolCallEvent {
  type: 'tool_call';
  toolName: string;
  taskId?: string;
  input?: string;
  timestamp: Date;
}

export interface ToolResultEvent {
  type: 'tool_result';
  toolName: string;
  taskId?: string;
  success: boolean;
  durationMs?: number;
  output?: string;
  error?: string;
  timestamp: Date;
}

export interface LlmCallEvent {
  type: 'llm_call';
  provider: string;
  model: string;
  tokensIn?: number;
  tokensOut?: number;
  costUsd?: number;
  durationMs?: number;
  taskId?: string;
  timestamp: Date;
}

export interface LogLineEvent {
  type: 'log';
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  target?: string;
  timestamp: Date;
  raw: string;
}

export type ZeroClawEvent =
  | RunStartEvent
  | RunCompleteEvent
  | ToolCallEvent
  | ToolResultEvent
  | LlmCallEvent
  | LogLineEvent;

// ── Patterns for ZeroClaw's tracing output ──

const PATTERNS = {
  jsonLine: /^\{.*\}$/,

  // Rust tracing plain-text patterns
  levelPrefix: /^\s*(\d{4}-\d{2}-\d{2}T[\d:.]+Z?)\s+(TRACE|DEBUG|INFO|WARN|ERROR)\s+(\S+):\s+(.*)$/,
  levelSimple: /^\s*(TRACE|DEBUG|INFO|WARN|ERROR)\s+(\S+):\s+(.*)$/,
  nestLevel: /^\[?(\w+)\]?\s+(.*)$/,

  // Task lifecycle
  taskStart: /(?:starting task|task started|begin(?:ning)? (?:task|run|execution))/i,
  taskComplete: /(?:task (?:completed|finished|done)|run (?:completed|succeeded))/i,
  taskFailed: /(?:task (?:failed|error|aborted)|run (?:failed|error))/i,

  // Tool usage
  toolCall: /(?:calling tool|tool invocation|executing tool|invoking)\s+[`"']?(\w+)[`"']?/i,
  toolResult: /(?:tool (?:result|output|completed|finished|failed))\s*(?:for\s+)?[`"']?(\w+)?[`"']?/i,
  toolDuration: /(?:duration|took|elapsed)[=:\s]+(\d+(?:\.\d+)?)\s*(ms|s|sec)/i,

  // LLM API
  llmCall: /(?:provider|llm|api)\s*(?:call|request|completion)/i,
  llmProvider: /provider[=:\s]+[`"']?(\w+)[`"']?/i,
  llmModel: /model[=:\s]+[`"']?([\w./-]+)[`"']?/i,
  llmTokensIn: /(?:input_tokens|tokens_in|prompt_tokens)[=:\s]+(\d+)/i,
  llmTokensOut: /(?:output_tokens|tokens_out|completion_tokens)[=:\s]+(\d+)/i,
  llmCost: /cost[=:\s]+\$?([\d.]+)/i,
  llmDuration: /(?:latency|duration)[=:\s]+(\d+(?:\.\d+)?)\s*(ms|s)/i,

  // Task ID extraction
  taskId: /(?:task_id|run_id|id)[=:\s]+[`"']?([a-f0-9-]{8,36})[`"']?/i,
};

function mapLevel(level: string): 'debug' | 'info' | 'warn' | 'error' {
  switch (level.toUpperCase()) {
    case 'TRACE':
    case 'DEBUG':
      return 'debug';
    case 'WARN':
      return 'warn';
    case 'ERROR':
      return 'error';
    default:
      return 'info';
  }
}

function parseDurationMs(value: string, unit: string): number {
  const num = parseFloat(value);
  if (unit === 's' || unit === 'sec') return Math.round(num * 1000);
  return Math.round(num);
}

// ── Parser class ──

export class ZeroClawLogParser extends EventEmitter {
  private buffer = '';

  feed(chunk: string): void {
    this.buffer += chunk;
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      this.parseLine(trimmed);
    }
  }

  flush(): void {
    if (this.buffer.trim()) {
      this.parseLine(this.buffer.trim());
      this.buffer = '';
    }
  }

  private parseLine(line: string): void {
    // Try JSON structured output first
    if (PATTERNS.jsonLine.test(line)) {
      try {
        const json = JSON.parse(line);
        this.handleJsonEvent(json, line);
        return;
      } catch {
        // Not valid JSON, fall through to text parsing
      }
    }

    this.handleTextLine(line);
  }

  private handleJsonEvent(json: Record<string, unknown>, raw: string): void {
    const fields = json.fields as Record<string, unknown> | undefined;
    const span = json.span as Record<string, unknown> | undefined;

    const level = mapLevel(String(json.level || json.severity || 'info'));
    const message = String(json.message || json.msg || fields?.message || '');
    const target = String(json.target || json.module || '');
    const timestamp = json.timestamp ? new Date(String(json.timestamp)) : new Date();
    const taskId = String(json.task_id || json.run_id || span?.task_id || '');

    // Always emit as log
    this.emitEvent({
      type: 'log',
      level,
      message: message || raw,
      target,
      timestamp,
      raw,
    });

    this.matchSemanticEvents(message, level, taskId || undefined, timestamp, json);
  }

  private handleTextLine(line: string): void {
    let level: 'debug' | 'info' | 'warn' | 'error' = 'info';
    let target = '';
    let message = line;
    let timestamp = new Date();

    // Try structured tracing format: 2024-01-01T00:00:00Z INFO target: message
    const fullMatch = PATTERNS.levelPrefix.exec(line);
    if (fullMatch) {
      timestamp = new Date(fullMatch[1]);
      level = mapLevel(fullMatch[2]);
      target = fullMatch[3];
      message = fullMatch[4];
    } else {
      // Try simpler: INFO target: message
      const simpleMatch = PATTERNS.levelSimple.exec(line);
      if (simpleMatch) {
        level = mapLevel(simpleMatch[1]);
        target = simpleMatch[2];
        message = simpleMatch[3];
      } else {
        // Try [LEVEL] message
        const nestMatch = PATTERNS.nestLevel.exec(line);
        if (nestMatch && ['TRACE', 'DEBUG', 'INFO', 'WARN', 'ERROR'].includes(nestMatch[1].toUpperCase())) {
          level = mapLevel(nestMatch[1]);
          message = nestMatch[2];
        }
      }
    }

    const taskIdMatch = PATTERNS.taskId.exec(message);
    const taskId = taskIdMatch?.[1];

    this.emitEvent({
      type: 'log',
      level,
      message,
      target,
      timestamp,
      raw: line,
    });

    this.matchSemanticEvents(message, level, taskId, timestamp);
  }

  private matchSemanticEvents(
    message: string,
    level: string,
    taskId: string | undefined,
    timestamp: Date,
    json?: Record<string, unknown>,
  ): void {
    // Task lifecycle
    if (PATTERNS.taskStart.test(message)) {
      this.emitEvent({ type: 'run_start', taskId, message, timestamp });
    }

    if (PATTERNS.taskComplete.test(message)) {
      const durationMatch = PATTERNS.toolDuration.exec(message);
      this.emitEvent({
        type: 'run_complete',
        taskId,
        success: true,
        durationMs: durationMatch ? parseDurationMs(durationMatch[1], durationMatch[2]) : undefined,
        timestamp,
      });
    }

    if (PATTERNS.taskFailed.test(message)) {
      this.emitEvent({
        type: 'run_complete',
        taskId,
        success: false,
        error: message,
        timestamp,
      });
    }

    // Tool calls
    const toolCallMatch = PATTERNS.toolCall.exec(message);
    if (toolCallMatch) {
      this.emitEvent({
        type: 'tool_call',
        toolName: toolCallMatch[1],
        taskId,
        input: message,
        timestamp,
      });
    }

    const toolResultMatch = PATTERNS.toolResult.exec(message);
    if (toolResultMatch) {
      const durationMatch = PATTERNS.toolDuration.exec(message);
      this.emitEvent({
        type: 'tool_result',
        toolName: toolResultMatch[1] || 'unknown',
        taskId,
        success: level !== 'error',
        durationMs: durationMatch ? parseDurationMs(durationMatch[1], durationMatch[2]) : undefined,
        output: message,
        timestamp,
      });
    }

    // LLM API calls
    if (PATTERNS.llmCall.test(message) || json?.tokens_in || json?.tokens_out) {
      const providerMatch = PATTERNS.llmProvider.exec(message);
      const modelMatch = PATTERNS.llmModel.exec(message);
      const tokensInMatch = PATTERNS.llmTokensIn.exec(message);
      const tokensOutMatch = PATTERNS.llmTokensOut.exec(message);
      const costMatch = PATTERNS.llmCost.exec(message);
      const durationMatch = PATTERNS.llmDuration.exec(message);

      const provider = providerMatch?.[1] || String(json?.provider || 'unknown');
      const model = modelMatch?.[1] || String(json?.model || 'unknown');
      const tokensIn = tokensInMatch ? parseInt(tokensInMatch[1]) : (json?.tokens_in as number | undefined);
      const tokensOut = tokensOutMatch ? parseInt(tokensOutMatch[1]) : (json?.tokens_out as number | undefined);

      if (provider !== 'unknown' || model !== 'unknown' || tokensIn || tokensOut) {
        this.emitEvent({
          type: 'llm_call',
          provider,
          model,
          tokensIn,
          tokensOut,
          costUsd: costMatch ? parseFloat(costMatch[1]) : (json?.cost as number | undefined),
          durationMs: durationMatch ? parseDurationMs(durationMatch[1], durationMatch[2]) : undefined,
          taskId,
          timestamp,
        });
      }
    }
  }

  private emitEvent(event: ZeroClawEvent): void {
    this.emit(event.type, event);
    this.emit('*', event);
  }
}
