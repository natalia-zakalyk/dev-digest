import type { Container } from '../../platform/container.js';
import { SmartDiffService } from './service.js';

/** Composition root of the module: reads through the container's review repository port. */
export function createSmartDiffService(c: Container): SmartDiffService {
  return new SmartDiffService({ source: c.reviewRepo });
}
