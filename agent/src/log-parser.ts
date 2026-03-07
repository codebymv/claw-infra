import { EventEmitter } from 'events';

// ── Event types emitted by the parser ──

export interface RunStartEvent {
  type: 'run_start';
  taskId?: string;
  message: string;
  channel?: string;
  sender?: string;
  timestamp: Date;
}

export interface RunCompleteEvent {
  type: 'run_complete';
  taskId?: string;
  success: boolean;
  durationMs?: number;
  error?: string;
  replySummary?: string;
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

// ── Patterns for ZeroClaw's actual output ──

const PATTERNS = {
  jsonLine: /^\{.*\}$/,

  // ZeroClaw channel output (emoji-prefixed)
  channelMessage: /💬\s*\[(\w+)\]\s*from\s+(\S+):\s*(.*)/,
  processing: /⏳\s*Processing/i,
  reply: /🤖\s*Reply\s*\((\d+)ms\):\s*(.*)/,
  replyError: /❌\s*(?:Error|Failed|Reply failed)(?:\s*\((\d+)ms\))?:\s*(.*)/i,

  // ZeroClaw tracing (Rust structured logs)
  tracingLine: /^\s*(\d{4}-\d{2}-\d{2}T[\d:.]+Z?)\s+(TRACE|DEBUG|INFO|WARN|ERROR)\s+(\S+):\s+(.*)$/,
  tracingSimple: /^\s*(TRACE|DEBUG|INFO|WARN|ERROR)\s+(\S+):\s+(.*)$/,

  // ZeroClaw tool-call tracing patterns (from runtime logs)
  toolInvoke: /(?:tool[_\s](?:call|invoke|exec)|calling|invoking|executing)\s+[`"']?(\w+)[`"']?/i,
  toolComplete: /(?:tool[_\s](?:result|output|done|completed|finished))\s*(?:for\s+)?[`"']?(\w+)?[`"']?/i,
  toolFailed: /(?:tool[_\s](?:error|failed|failure))\s*(?:for\s+)?[`"']?(\w+)?[`"']?/i,
  toolUse: /Tool\s+use:\s+(\w+)/,
  toolResult: /Tool\s+result:\s+(\w+)/i,

  // LLM / provider tracing
  llmRequest: /(?:provider|llm|api)\s*(?:call|request|completion)|sending\s+(?:request|prompt)\s+to/i,
  providerWarmup: /Warming up provider.*provider="(\w+)"/i,
  llmProvider: /provider[=:\s]+[`"']?(\w+)[`"']?/i,
  llmModel: /model[=:\s]+[`"']?([\w./-]+)[`"']?/i,
  llmTokensIn: /(?:input_tokens|tokens_in|prompt_tokens)[=:\s]+(?:Some\()?(\d+)\)?/i,
  llmTokensOut: /(?:output_tokens|tokens_out|completion_tokens)[=:\s]+(?:Some\()?(\d+)\)?/i,
  llmCost: /cost[=:\s]+(?:Some\()?\$?([\d.]+)\)?/i,
  duration: /(?:duration|took|elapsed|latency)[=:\s]+(\d+(?:\.\d+)?)\s*(ms|s|sec)/i,

  // Task ID
  taskId: /(?:task_id|run_id|request_id|id)[=:\s]+[`"']?([a-f0-9-]{8,36})[`"']?/i,
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
    // Try JSON structured output first (RUST_LOG_FORMAT=json)
    if (PATTERNS.jsonLine.test(line)) {
      try {
        const json = JSON.parse(line);
        this.handleJsonEvent(json, line);
        return;
      } catch {
        // Not valid JSON, fall through
      }
    }

    // Check for ZeroClaw channel emoji output
    if (this.handleChannelLine(line)) return;

    // Handle Rust tracing text lines
    this.handleTextLine(line);
  }

  private handleChannelLine(line: string): boolean {
    // 💬 [telegram] from rusty_chain: List the files in the workspace
    const msgMatch = PATTERNS.channelMessage.exec(line);
    if (msgMatch) {
      this.emitEvent({
        type: 'run_start',
        channel: msgMatch[1],
        sender: msgMatch[2],
        message: msgMatch[3],
        timestamp: new Date(),
      });
      this.emitEvent({
        type: 'log',
        level: 'info',
        message: line,
        target: 'zeroclaw::channels',
        timestamp: new Date(),
        raw: line,
      });
      return true;
    }

    // 🤖 Reply (6068ms): The workspace currently contains...
    const replyMatch = PATTERNS.reply.exec(line);
    if (replyMatch) {
      this.emitEvent({
        type: 'run_complete',
        success: true,
        durationMs: parseInt(replyMatch[1], 10),
        replySummary: replyMatch[2].substring(0, 500),
        timestamp: new Date(),
      });
      this.emitEvent({
        type: 'log',
        level: 'info',
        message: line,
        target: 'zeroclaw::channels',
        timestamp: new Date(),
        raw: line,
      });
      return true;
    }

    // ❌ Error (Xms): ...
    const errMatch = PATTERNS.replyError.exec(line);
    if (errMatch) {
      this.emitEvent({
        type: 'run_complete',
        success: false,
        durationMs: errMatch[1] ? parseInt(errMatch[1], 10) : undefined,
        error: errMatch[2],
        timestamp: new Date(),
      });
      this.emitEvent({
        type: 'log',
        level: 'error',
        message: line,
        target: 'zeroclaw::channels',
        timestamp: new Date(),
        raw: line,
      });
      return true;
    }

    // ⏳ Processing message... (just log it)
    if (PATTERNS.processing.test(line)) {
      this.emitEvent({
        type: 'log',
        level: 'info',
        message: line,
        target: 'zeroclaw::channels',
        timestamp: new Date(),
        raw: line,
      });
      return true;
    }

    return false;
  }

  private handleJsonEvent(json: Record<string, unknown>, raw: string): void {
    const fields = json.fields as Record<string, unknown> | undefined;
    const span = json.span as Record<string, unknown> | undefined;

    const level = mapLevel(String(json.level || json.severity || 'info'));
    const message = String(json.message || json.msg || fields?.message || '');
    const target = String(json.target || json.module || '');
    const timestamp = json.timestamp ? new Date(String(json.timestamp)) : new Date();
    const taskId = String(json.task_id || json.run_id || span?.task_id || '');

    this.emitEvent({
      type: 'log',
      level,
      message: message || raw,
      target,
      timestamp,
      raw,
    });

    // Check if JSON contains channel message data
    if (this.handleChannelLine(message)) return;

    this.matchTracingEvents(message, level, taskId || undefined, timestamp, json);
  }

  private handleTextLine(line: string): void {
    let level: 'debug' | 'info' | 'warn' | 'error' = 'info';
    let target = '';
    let message = line;
    let timestamp = new Date();

    const fullMatch = PATTERNS.tracingLine.exec(line);
    if (fullMatch) {
      timestamp = new Date(fullMatch[1]);
      level = mapLevel(fullMatch[2]);
      target = fullMatch[3];
      message = fullMatch[4];
    } else {
      const simpleMatch = PATTERNS.tracingSimple.exec(line);
      if (simpleMatch) {
        level = mapLevel(simpleMatch[1]);
        target = simpleMatch[2];
        message = simpleMatch[3];
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

    this.matchTracingEvents(message, level, taskId, timestamp);
  }

  private matchTracingEvents(
    message: string,
    level: string,
    taskId: string | undefined,
    timestamp: Date,
    json?: Record<string, unknown>,
  ): void {
    // Tool invocation
    const toolInvokeMatch = PATTERNS.toolInvoke.exec(message) || PATTERNS.toolUse.exec(message);
    if (toolInvokeMatch) {
      this.emitEvent({
        type: 'tool_call',
        toolName: toolInvokeMatch[1],
        taskId,
        input: message,
        timestamp,
      });
    }

    // Tool result / completion
    const toolCompleteMatch = PATTERNS.toolComplete.exec(message) || PATTERNS.toolResult.exec(message);
    if (toolCompleteMatch) {
      const durationMatch = PATTERNS.duration.exec(message);
      this.emitEvent({
        type: 'tool_result',
        toolName: toolCompleteMatch[1] || 'unknown',
        taskId,
        success: level !== 'error',
        durationMs: durationMatch ? parseDurationMs(durationMatch[1], durationMatch[2]) : undefined,
        output: message,
        timestamp,
      });
    }

    // Tool failure
    const toolFailMatch = PATTERNS.toolFailed.exec(message);
    if (toolFailMatch) {
      this.emitEvent({
        type: 'tool_result',
        toolName: toolFailMatch[1] || 'unknown',
        taskId,
        success: false,
        error: message,
        timestamp,
      });
    }

    // LLM API calls
    const j = json as any;
    const jsonTokensIn =
      (typeof j?.tokens_in === 'number' ? j.tokens_in : undefined) ??
      (typeof j?.input_tokens === 'number' ? j.input_tokens : undefined) ??
      (typeof j?.prompt_tokens === 'number' ? j.prompt_tokens : undefined) ??
      (typeof j?.usage?.input_tokens === 'number' ? j.usage.input_tokens : undefined) ??
      (typeof j?.usage?.prompt_tokens === 'number' ? j.usage.prompt_tokens : undefined) ??
      (typeof j?.payload?.input_tokens === 'number' ? j.payload.input_tokens : undefined) ??
      (typeof j?.payload?.prompt_tokens === 'number' ? j.payload.prompt_tokens : undefined);

    const jsonTokensOut =
      (typeof j?.tokens_out === 'number' ? j.tokens_out : undefined) ??
      (typeof j?.output_tokens === 'number' ? j.output_tokens : undefined) ??
      (typeof j?.completion_tokens === 'number' ? j.completion_tokens : undefined) ??
      (typeof j?.usage?.output_tokens === 'number' ? j.usage.output_tokens : undefined) ??
      (typeof j?.usage?.completion_tokens === 'number' ? j.usage.completion_tokens : undefined) ??
      (typeof j?.payload?.output_tokens === 'number' ? j.payload.output_tokens : undefined) ??
      (typeof j?.payload?.completion_tokens === 'number' ? j.payload.completion_tokens : undefined);

    const jsonCost =
      (typeof j?.cost === 'number' ? j.cost : undefined) ??
      (typeof j?.cost_usd === 'number' ? j.cost_usd : undefined) ??
      (typeof j?.payload?.cost === 'number' ? j.payload.cost : undefined) ??
      (typeof j?.payload?.cost_usd === 'number' ? j.payload.cost_usd : undefined);

    if (
      PATTERNS.llmRequest.test(message) ||
      jsonTokensIn !== undefined ||
      jsonTokensOut !== undefined ||
      jsonCost !== undefined ||
      !!j?.provider ||
      !!j?.model ||
      !!j?.payload?.provider ||
      !!j?.payload?.model
    ) {
      const providerMatch = PATTERNS.llmProvider.exec(message);
      const modelMatch = PATTERNS.llmModel.exec(message);
      const tokensInMatch = PATTERNS.llmTokensIn.exec(message);
      const tokensOutMatch = PATTERNS.llmTokensOut.exec(message);
      const costMatch = PATTERNS.llmCost.exec(message);
      const durationMatch = PATTERNS.duration.exec(message);

      const provider =
        providerMatch?.[1] ||
        String(j?.provider || j?.fields?.provider || j?.payload?.provider || 'unknown');
      const model =
        modelMatch?.[1] ||
        String(j?.model || j?.fields?.model || j?.payload?.model || 'unknown');
      const tokensIn = tokensInMatch ? parseInt(tokensInMatch[1]) : jsonTokensIn;
      const tokensOut = tokensOutMatch ? parseInt(tokensOutMatch[1]) : jsonTokensOut;

      if (provider !== 'unknown' || model !== 'unknown' || tokensIn || tokensOut) {
        this.emitEvent({
          type: 'llm_call',
          provider,
          model,
          tokensIn,
          tokensOut,
          costUsd: costMatch ? parseFloat(costMatch[1]) : jsonCost,
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
