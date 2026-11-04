import { InMemoryTransport, type JSONRPCMessage } from '@modelcontextprotocol/server';
import { createServer } from '../../src/server.js';
import { createDeps } from '../../src/use-cases/index.js';
import { FakeApi, FakeClock } from '../use-cases/fakes.js';

const REQUEST_TIMEOUT_MS = 5_000;

export interface JsonRpcResponse {
  id: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- tool results are asserted by the tests
  result?: any;
  error?: { code: number; message: string };
}

/** Minimal JSON-RPC client over the SDK's linked in-memory transport (no client package installed). */
export async function connect(api = new FakeApi()) {
  const server = createServer(createDeps({ api, clock: new FakeClock() }));
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const pending = new Map<number, (m: JsonRpcResponse) => void>();
  clientSide.onmessage = (m: JSONRPCMessage) => {
    const id = (m as { id?: unknown }).id;
    if (typeof id === 'number') pending.get(id)?.(m as unknown as JsonRpcResponse);
  };
  await server.connect(serverSide);
  await clientSide.start();
  let nextId = 1;
  const request = (method: string, params?: unknown) =>
    new Promise<JsonRpcResponse>((resolve, reject) => {
      const id = nextId++;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`no response to "${method}" within ${REQUEST_TIMEOUT_MS} ms`));
      }, REQUEST_TIMEOUT_MS);
      pending.set(id, (m) => {
        clearTimeout(timer);
        pending.delete(id);
        resolve(m);
      });
      void clientSide.send({ jsonrpc: '2.0', id, method, params } as JSONRPCMessage);
    });
  const init = await request('initialize', {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'test', version: '0' },
  });
  await clientSide.send({ jsonrpc: '2.0', method: 'notifications/initialized' } as JSONRPCMessage);
  const call = async (name: string, args: unknown) => (await request('tools/call', { name, arguments: args })).result;
  return { api, init: init.result, request, call, close: () => server.close() };
}
