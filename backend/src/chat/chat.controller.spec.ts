import { HttpException, HttpStatus } from '@nestjs/common';
import { ChatController } from './chat.controller';
import { ChatSessionService } from './chat-session.service';
import { WebCommandHandlerService } from './web-command-handler.service';
import { ErrorHandlerService, ChatErrorCode } from './error-handler.service';

describe('ChatController', () => {
  const chatSessionService = {
    getOrCreateSession: jest.fn(),
    getSessionStats: jest.fn(),
    getSessionById: jest.fn(),
    getMessagesSince: jest.fn(),
    markSessionRecovered: jest.fn(),
    getSessionTimeoutConfig: jest.fn(),
  } as unknown as jest.Mocked<ChatSessionService>;

  const webCommandHandler = {
    handleWebMessage: jest.fn(),
  } as unknown as jest.Mocked<WebCommandHandlerService>;

  const errorHandler = {
    createError: jest.fn(),
    handleRestError: jest.fn(),
    getErrorCount: jest.fn(),
    resetErrorCount: jest.fn(),
    getErrorStats: jest.fn(),
  } as unknown as jest.Mocked<ErrorHandlerService>;

  let controller: ChatController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new ChatController(chatSessionService, webCommandHandler, errorHandler);
  });

  it('returns mapped session data', async () => {
    chatSessionService.getOrCreateSession = jest.fn().mockResolvedValue({
      id: 'session-1',
      userId: 'user-1',
      messageCount: 3,
      activeProjectId: 'project-1',
      preferences: { autoComplete: true },
      createdAt: new Date('2026-01-01T00:00:00Z'),
      lastActivity: new Date('2026-01-02T00:00:00Z'),
    } as any);

    const result = await controller.getSession({ user: { id: 'user-1', email: 'u@test.com', role: 'user' } } as any);

    expect(result).toMatchObject({
      sessionId: 'session-1',
      userId: 'user-1',
      messageCount: 3,
      activeProject: 'project-1',
    });
  });

  it('rejects invalid message limits', async () => {
    await expect(controller.getMessages({ user: { id: 'user-1' } } as any, 'abc')).rejects.toMatchObject({
      status: HttpStatus.BAD_REQUEST,
    });
  });

  it('rejects empty messages', async () => {
    await expect(
      controller.sendMessage({ user: { id: 'user-1' } } as any, { content: '   ', type: 'message' }),
    ).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST });
  });

  it('returns session stats from the service', async () => {
    const lastActivity = new Date('2026-01-02T00:00:00Z');
    chatSessionService.getSessionStats = jest.fn().mockResolvedValue({
      sessionId: 'session-1',
      messageCount: 12,
      lastActivity,
      activeProject: 'project-2',
      createdAt: new Date('2026-01-01T00:00:00Z'),
    });

    const result = await controller.getSessionStats({ user: { id: 'user-1' } } as any);

    expect(result).toEqual({
      messageCount: 12,
      lastActivity,
      activeProject: 'project-2',
      createdAt: new Date('2026-01-01T00:00:00Z'),
    });
  });

  it('returns recoverable session info using lastActivity', async () => {
    const lastActivity = new Date(Date.now() - 5 * 60 * 1000);
    chatSessionService.getSessionById = jest.fn().mockResolvedValue({
      id: 'session-1',
      userId: 'user-1',
      lastActivity,
    } as any);
    chatSessionService.getSessionTimeoutConfig = jest.fn().mockReturnValue({
      timeoutHours: 24,
      inactiveDays: 30,
      maxMessages: 100,
    });

    const result = await controller.isSessionRecoverable(
      { user: { id: 'user-1' } } as any,
      'session-1',
    );

    expect(result.recoverable).toBe(true);
    expect(result.lastActivity).toBe(lastActivity);
  });

  it('returns 404 when recovering another user session', async () => {
    errorHandler.createError = jest.fn().mockReturnValue({
      code: ChatErrorCode.SESSION_NOT_FOUND,
      message: 'Session not found or unauthorized',
      timestamp: new Date(),
      recoverable: false,
    });
    chatSessionService.getSessionById = jest.fn().mockResolvedValue({
      id: 'session-1',
      userId: 'different-user',
    } as any);

    await expect(
      controller.recoverSession({ user: { id: 'user-1' } } as any, { sessionId: 'session-1' }),
    ).rejects.toBeInstanceOf(HttpException);

    try {
      await controller.recoverSession({ user: { id: 'user-1' } } as any, { sessionId: 'session-1' });
    } catch (error) {
      expect((error as HttpException).getStatus()).toBe(HttpStatus.NOT_FOUND);
    }
  });
});