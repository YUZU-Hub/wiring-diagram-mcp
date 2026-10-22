import { describe, expect, it, vi } from 'vitest';
import { trackUmami, createServer } from './index.js';

describe('MCP server and tools', () => {
  it('creates server with expected tools', () => {
    const server = createServer();
    expect(server).toBeDefined();
  });

  it('trackUmami sends payload to Umami endpoint without throwing', async () => {
    const originalFetch = global.fetch;
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ beep: 'boop' }),
    });
    global.fetch = fetchMock;

    try {
      trackUmami('mcp_tool_call_test', { tool: 'calculate_wire_gauge' });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, options] = fetchMock.mock.calls[0];
      expect(url).toContain('/api/send');
      const body = JSON.parse(options.body as string);
      expect(body.type).toBe('event');
      expect(body.payload.name).toBe('mcp_tool_call_test');
      expect(body.payload.data.tool).toBe('calculate_wire_gauge');
      expect(body.payload.url).toBe('/mcp');
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('trackUmami silently catches network errors', async () => {
    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));
    try {
      expect(() => trackUmami('mcp_fail_test')).not.toThrow();
    } finally {
      global.fetch = originalFetch;
    }
  });
});
