import { z } from 'zod';
import { MAX_LIMIT } from '../constants.js';
import { DetailLevel } from '../shape/index.js';

/** Flat input fields shared by the tools (spec "Arguments"). Every field carries a short description with an example. */

export const REPO_PATTERN = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/;
export const MAX_ID_LENGTH = 128;

export const repoField = z.string().max(200).regex(REPO_PATTERN).describe('owner/name');
export const prField = z.number().int().min(1).describe('PR number on GitHub, e.g. 42');
export const agentField = z.string().min(1).max(MAX_ID_LENGTH).describe('agent id from list_agents, a UUID');
export const runIdField = z.string().min(1).max(MAX_ID_LENGTH).describe('run_id returned by run_agent_on_pr');
export const detailField = DetailLevel.optional().describe('concise (default) or full, e.g. full to add rationale');
export const limitField = z
  .number()
  .int()
  .min(1)
  .max(MAX_LIMIT)
  .optional()
  .describe('max items to return, 1-100, default 20, e.g. 10');
