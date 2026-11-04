import { describe, expect, it } from 'vitest';
import { SERVER_INSTRUCTIONS } from '../src/server.js';
import { TOOL_NAMES } from '../src/tools/index.js';
import { connect } from './helpers/connect.js';

describe('server round trip (in-memory)', () => {
  it('exposes the frozen instructions and no listChanged capability', async () => {
    const c = await connect();
    expect(c.init.instructions).toBe(SERVER_INSTRUCTIONS);
    expect(c.init.capabilities.tools?.listChanged).toBeFalsy();
    await c.close();
  });

  it('lists five tools in the stable order, none alwaysLoad', async () => {
    const c = await connect();
    const { result } = await c.request('tools/list', {});
    const names = result.tools.map((t: any) => t.name);
    expect(names).toEqual([...TOOL_NAMES]);
    expect(names).toHaveLength(5);
    for (const t of result.tools) expect(JSON.stringify(t._meta ?? {})).not.toContain('alwaysLoad');
    await c.close();
  });

  it('calls each tool (success path)', async () => {
    const c = await connect();
    const list = await c.call('list_agents', {});
    expect(list.isError).toBeUndefined();
    expect(list.structuredContent).toBeDefined();

    const runRes = await c.call('run_agent_on_pr', { repo: 'acme/shop', pr: 12, agent: 'a1' });
    expect(runRes.isError).toBeUndefined();
    expect(runRes.structuredContent).toBeDefined();

    const found = await c.call('get_findings', { repo: 'acme/shop', pr: 12 });
    expect(found.isError).toBeUndefined();
    expect(found.structuredContent).toBeDefined();

    const conv = await c.call('get_conventions', { repo: 'acme/shop' });
    expect(conv.isError).toBeUndefined();
    expect(conv.structuredContent).toBeDefined();

    const blast = await c.call('get_blast_radius', { repo: 'acme/shop', pr: 12 });
    expect(blast.isError).toBeUndefined();
    expect(blast.structuredContent).toMatchObject({ implemented: false });
    await c.close();
  });

  it('reports invalid input as an isError text result, without calling the API', async () => {
    const c = await connect();
    const res = await c.call('run_agent_on_pr', { repo: 'acme/shop', pr: 'twelve' });
    expect(res.isError).toBe(true);
    expect(res.content[0].type).toBe('text');
    expect(c.api.calls).toEqual([]);
    await c.close();
  });

  it('maps a semantic error to an actionable isError text', async () => {
    const c = await connect();
    const res = await c.call('get_conventions', { repo: 'nobody/nothing' });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('is not imported in DevDigest');
    await c.close();
  });
});
