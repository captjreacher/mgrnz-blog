import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EventEmitter } from 'events';
import { WebSocketHandler } from '../../src/dashboard/websocket-handler.js';

class MockWebSocket extends EventEmitter {
  constructor() {
    super();
    this.OPEN = 1;
    this.readyState = this.OPEN;
    this.sentMessages = [];
    this.closedWith = null;
  }

  send(message) {
    this.sentMessages.push(message);
  }

  close(code, reason) {
    this.readyState = 3;
    this.closedWith = { code, reason };
    this.emit('close', code, reason);
  }

  ping() {
    this.pingCount = (this.pingCount || 0) + 1;
  }
}

describe('WebSocketHandler', () => {
  let mockWss;
  let mockEngine;
  let handler;

  const connectClient = (remoteAddress = '::1') => {
    const ws = new MockWebSocket();
    mockWss.emit('connection', ws, { socket: { remoteAddress } });
    return ws;
  };

  beforeEach(() => {
    mockWss = new EventEmitter();
    mockEngine = {
      getSystemStatus: vi.fn().mockResolvedValue({ status: 'ok' }),
      getPipelineRuns: vi.fn().mockResolvedValue([{ id: 'run-1' }]),
      getPipelineRun: vi.fn().mockResolvedValue({ id: 'run-1' }),
      getMetrics: vi.fn().mockResolvedValue({ throughput: 42 })
    };

    handler = new WebSocketHandler(mockWss, mockEngine);
  });

  it('should register clients and send welcome message on connection', () => {
    const client = connectClient('127.0.0.1');

    expect(handler.clients.size).toBe(1);
    expect(client.sentMessages).not.toHaveLength(0);

    const welcomeMessage = JSON.parse(client.sentMessages[0]);
    expect(welcomeMessage.type).toBe('welcome');
    expect(welcomeMessage.data.clientId).toBeDefined();
  });

  it('should broadcast alerts only to subscribed clients', () => {
    const subscribedClient = connectClient('127.0.0.1');
    const unsubscribedClient = connectClient('127.0.0.2');

    subscribedClient.emit('message', Buffer.from(JSON.stringify({
      type: 'subscribe',
      events: ['alert_generated']
    })));

    const subscriptionAck = JSON.parse(subscribedClient.sentMessages.at(-1));
    expect(subscriptionAck.type).toBe('subscription_confirmed');

    handler.broadcast('alert_generated', { id: 'alert-1' });

    const lastMessage = JSON.parse(subscribedClient.sentMessages.at(-1));
    expect(lastMessage.type).toBe('alert_generated');
    expect(lastMessage.data).toEqual({ id: 'alert-1' });

    const unsubscribedPayloads = unsubscribedClient.sentMessages
      .map(message => JSON.parse(message))
      .filter(payload => payload.type === 'alert_generated');

    expect(unsubscribedPayloads).toHaveLength(0);
  });

  it('should handle status requests using the monitoring engine', async () => {
    const client = connectClient('127.0.0.3');

    client.emit('message', Buffer.from(JSON.stringify({ type: 'get_status' })));

    await new Promise(resolve => setTimeout(resolve, 0));
    await new Promise(resolve => {
      if (client.sentMessages.length > 1) {
        resolve();
        return;
      }
      const interval = setInterval(() => {
        if (client.sentMessages.length > 1) {
          clearInterval(interval);
          resolve();
        }
      }, 0);
    });

    expect(mockEngine.getSystemStatus).toHaveBeenCalled();

    const response = JSON.parse(client.sentMessages.at(-1));
    expect(response.type).toBe('status_response');
    expect(response.data).toEqual({ status: 'ok' });
  });
});
