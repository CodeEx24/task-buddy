import { MAX_TITLE_LENGTH } from './schema';
import {
  INVALID_DATE_MESSAGE,
  TITLE_REQUIRED_MESSAGE,
  taskFormSchema,
  toTaskFields,
  toTaskFormValues,
} from './task-form';

const midnight = (y: number, m: number, d: number) => new Date(y, m - 1, d).getTime();

const issues = (values: unknown) =>
  taskFormSchema.safeParse(values).error?.issues.map((i) => [i.path.join('.'), i.message]);

describe('task form', () => {
  it('maps valid values to repository fields', () => {
    const parsed = taskFormSchema.parse({
      title: '  Pay rent ',
      dueDate: '2026-11-01',
      priority: 3,
    });
    expect(toTaskFields(parsed)).toEqual({
      title: 'Pay rent',
      dueAt: midnight(2026, 11, 1),
      priority: 3,
    });
    expect(toTaskFields(taskFormSchema.parse({ title: 'x', dueDate: '', priority: 0 }))).toEqual({
      title: 'x',
      dueAt: null,
      priority: 0,
    });
  });

  it('rejects a blank or too-long title, a bad date and a bad priority', () => {
    expect(issues({ title: '   ', dueDate: '', priority: 0 })).toEqual([
      ['title', TITLE_REQUIRED_MESSAGE],
    ]);
    const long = issues({ title: 'x'.repeat(MAX_TITLE_LENGTH + 1), dueDate: '', priority: 0 });
    expect(long?.[0]?.[0]).toBe('title');
    expect(issues({ title: 'x', dueDate: '2026-02-30', priority: 0 })).toEqual([
      ['dueDate', INVALID_DATE_MESSAGE],
    ]);
    expect(issues({ title: 'x', dueDate: '', priority: 4 })?.[0]?.[0]).toBe('priority');
  });

  it('turns a stored task into form values', () => {
    expect(toTaskFormValues({ title: 'a', dueAt: midnight(2026, 1, 5), priority: 2 })).toEqual({
      title: 'a',
      dueDate: '2026-01-05',
      priority: 2,
    });
    expect(toTaskFormValues({ title: 'a', dueAt: null, priority: 0 }).dueDate).toBe('');
  });
});
