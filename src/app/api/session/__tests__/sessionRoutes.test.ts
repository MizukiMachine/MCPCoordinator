import { describe, expect, it, beforeEach, vi } from 'vitest';

import { POST as createSession } from '../route';
import { POST as forwardEvent } from '../[sessionId]/event/route';
import { DELETE as deleteSession } from '../[sessionId]/route';

const sessionHostMock = {
  createSession: vi.fn(),
  handleCommand: vi.fn(),
  destroySession: vi.fn(),
  subscribe: vi.fn(),
};

vi.mock('../../../../../services/api/bff/sessionHost', () => ({
  sessionHost: sessionHostMock,
}));

describe('session API routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.BFF_SERVICE_SHARED_SECRET;
  });

  it('creates a session via POST /api/session', async () => {
    sessionHostMock.createSession.mockResolvedValue({ sessionId: 'sess_test' });

    const request = new Request('http://localhost/api/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentSetKey: 'demo' }),
    });

    const response = await createSession(request);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({ sessionId: 'sess_test' });
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

  it('deletes sessions via DELETE /api/session/:id', async () => {
    sessionHostMock.destroySession.mockResolvedValue(true);
    const request = new Request('http://localhost/api/session/sess_test', {
      method: 'DELETE',
    });

    const response = await deleteSession(request, { params: { sessionId: 'sess_test' } });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(sessionHostMock.destroySession).toHaveBeenCalledWith('sess_test');
  });
});
