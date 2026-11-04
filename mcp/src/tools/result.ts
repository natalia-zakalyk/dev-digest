import type { CallToolResult } from '@modelcontextprotocol/server';
import { toToolError } from './to-tool-error.js';

/** Success: the object as `structuredContent` plus the identical JSON as one text block. */
export function ok(value: object): CallToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(value) }],
    structuredContent: value as Record<string, unknown>,
  };
}

/** Runs one use case; semantic errors become actionable `isError:true` results. */
export async function respond(useCase: () => object | Promise<object>): Promise<CallToolResult> {
  try {
    return ok(await useCase());
  } catch (err) {
    return toToolError(err);
  }
}
