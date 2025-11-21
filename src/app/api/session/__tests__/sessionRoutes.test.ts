import { describe, expect, it, beforeEach, vi } from 'vitest';
import { POST as createSession } from '../route';
import { POST as forwardEvent } from '../[sessionId]/event/route';
import { DELETE as deleteSession } from '../[sessionId]/route';
import { GET as resolveSession } from '../resolve/route';

const sessionHostMock = vi.hoisted(() => ({
  createSession: vi.fn(),
  handleCommand: vi.fn(),
  destroySession: vi.fn(),
  subscribe: vi.fn(),
  resolveSessionByClientTag: vi.fn(),
}));

vi.mock('../../../../../services/api/bff/sessionHost', async () => {
  const actual = await vi.importActual<
    typeof import('../../../../../services/api/bff/sessionHost')
  >('../../../../../services/api/bff/sessionHost');
  return {
    ...actual,
    sessionHost: sessionHostMock,
  };
});

describe('session API routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.BFF_SERVICE_SHARED_SECRET;
  });

  it('creates a session via POST /api/session', async () => {
    sessionHostMock.createSession.mockResolvedValue({
      sessionId: 'sess_test',
      streamUrl: '/api/session/sess_test/stream',
      expiresAt: new Date().toISOString(),
      heartbeatIntervalMs: 25000,
      allowedModalities: ['text'],
      textOutputEnabled: true,
      memoryKey: 'demo-memory-key',
      capabilityWarnings: [],
      agentSet: { key: 'demo', primary: 'demo-agent' },
    });

    const request = new Request('http://localhost/api/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentSetKey: 'demo' }),
    });

    const response = await createSession(request);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.sessionId).toBe('sess_test');
    expect(payload.memoryKey).toBe('demo-memory-key');
    expect(sessionHostMock.createSession).toHaveBeenCalledWith({ agentSetKey: 'demo' });
  });

  it('rejects unauthorized requests when secret mismatch', async () => {
    process.env.BFF_SERVICE_SHARED_SECRET = 'secret';

    const request = new Request('http://localhost/api/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentSetKey: 'demo' }),
    });

    const response = await createSession(request);
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload.error).toBe('unauthorized');
  });

  it('forwards commands to the host via POST /api/session/:id/event', async () => {
    sessionHostMock.handleCommand.mockResolvedValue('CONNECTED');
    const request = new Request('http://localhost/api/session/sess_test/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'input_text', text: 'hello' }),
    });

    const response = await forwardEvent(request, { params: { sessionId: 'sess_test' } });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.accepted).toBe(true);
    expect(sessionHostMock.handleCommand).toHaveBeenCalledWith('sess_test', {
      kind: 'input_text',
      text: 'hello',
    });
  });

  it('accepts multipart image uploads and forwards base64 payload', async () => {
    sessionHostMock.handleCommand.mockResolvedValue('CONNECTED');
    const file = new File([Buffer.from('hello-image')], 'photo.png', { type: 'image/png' });
    const formData = new FormData();
    formData.append('file', file);
    formData.append('text', 'describe this');
    const request = new Request('http://localhost/api/session/sess_test/event', {
      method: 'POST',
      body: formData,
    });

    const response = await forwardEvent(request, { params: { sessionId: 'sess_test' } });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.accepted).toBe(true);
    expect(payload.imageMetadata.mimeType).toBe('image/png');
    expect(sessionHostMock.handleCommand).toHaveBeenCalledWith(
      'sess_test',
      expect.objectContaining({
        kind: 'input_image',
        mimeType: 'image/png',
        encoding: 'base64',
        text: 'describe this',
      }),
    );
  });

  it('deletes sessions via DELETE /api/session/:id', async () => {
    sessionHostMock.destroySession.mockResolvedValue(true);
    const request = new Request('http://localhost/api/session/sess_test', {
      method: 'DELETE',
    });

    const response = await deleteSession(request, { params: { sessionId: 'sess_test' } });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(sessionHostMock.destroySession).toHaveBeenCalledWith('sess_test', {
      reason: 'client_request',
      initiatedBy: 'client',
    });
  });

  it('resolves session by clientTag via GET /api/session/resolve', async () => {
    sessionHostMock.resolveSessionByClientTag.mockReturnValue({
      sessionId: 'sess_from_tag',
      streamUrl: '/api/session/sess_from_tag/stream',
      expiresAt: new Date().toISOString(),
      status: 'CONNECTED',
      agentSetKey: 'demo',
      preferredAgentName: 'agent1',
    });

    const request = new Request('http://localhost/api/session/resolve?clientTag=tag1', {
      method: 'GET',
    });

    const response = await resolveSession(request);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.sessionId).toBe('sess_from_tag');
    expect(sessionHostMock.resolveSessionByClientTag).toHaveBeenCalledWith('tag1');
  });

  it('returns 404 when resolve target does not exist', async () => {
    sessionHostMock.resolveSessionByClientTag.mockImplementation(() => {
      const error: any = new Error('Session not found for clientTag');
      error.code = 'session_not_found';
      error.status = 404;
      error.name = 'SessionHostError';
      throw error;
    });

    const request = new Request('http://localhost/api/session/resolve?clientTag=missing', {
      method: 'GET',
    });

    const response = await resolveSession(request);
    const payload = await response.json();

    expect(response.status).toBe(404);
    expect(payload.error).toBe('session_not_found');
  });
});
