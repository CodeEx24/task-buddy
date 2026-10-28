import { parseNewTaskDueParam } from './task-routes';

describe('parseNewTaskDueParam (TB-27)', () => {
  it('accepts only "today"; anything else means no preset', () => {
    expect(parseNewTaskDueParam('today')).toBe('today');
    expect(parseNewTaskDueParam(undefined)).toBeNull();
    expect(parseNewTaskDueParam('Today')).toBeNull();
    expect(parseNewTaskDueParam('2026-10-28')).toBeNull();
    expect(parseNewTaskDueParam(['today'])).toBeNull();
  });
});
