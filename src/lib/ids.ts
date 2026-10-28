import './polyfills';

import { uuidv7 } from 'uuidv7';

/** New row id: a UUIDv7 (time-ordered, generated on the device, sync-safe). */
export function newId(): string {
  return uuidv7();
}
