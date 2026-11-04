import { z } from 'zod';
import { MAX_LIMIT } from '../constants.js';
import { DetailLevel } from '../shape/index.js';

/** Flat input fields shared by the tools (spec "Arguments"). Only `repo` carries a description. */

export const REPO_PATTERN = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/;
export const MAX_ID_LENGTH = 128;

export const repoField = z.string().max(200).regex(REPO_PATTERN).describe('owner/name');
export const prField = z.number().int().min(1);
export const agentField = z.string().min(1).max(MAX_ID_LENGTH);
export const runIdField = z.string().min(1).max(MAX_ID_LENGTH);
export const detailField = DetailLevel.optional();
export const limitField = z.number().int().min(1).max(MAX_LIMIT).optional();
