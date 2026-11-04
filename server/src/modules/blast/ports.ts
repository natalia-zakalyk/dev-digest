import type { RepoIntel } from '../repo-intel/types.js';

/** Read port owned by the service. `ReviewRepository` satisfies it structurally. */
export interface BlastSource {
  getPull(workspaceId: string, prId: string): Promise<{ id: string; repoId: string } | undefined>;
  getPrFiles(prId: string): Promise<{ path: string }[]>;
}

/** The slice of the repo-intel facade this feature reads. */
export type BlastIntel = Pick<RepoIntel, 'getBlastRadius' | 'getIndexState'>;

/** Narrow log port (satisfied by the request's pino logger). */
export interface BlastLog {
  info(obj: object, msg: string): void;
}
