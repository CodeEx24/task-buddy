import { MAX_NOTES_LENGTH, MAX_TITLE_LENGTH } from './schema';
import {
  changedTaskFields,
  INVALID_DATE_MESSAGE,
  INVALID_TIME_MESSAGE,
  MIDNIGHT_TIME_MESSAGE,
  TIME_NEEDS_DATE_MESSAGE,
  NOTES_TOO_LONG_MESSAGE,
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
      notes: '  Landlord: Ana\n',
    });
    expect(toTaskFields(parsed)).toEqual({
      title: 'Pay rent',
      dueAt: midnight(2026, 11, 1),
      priority: 3,
      // Notes are kept as typed.
      notes: '  Landlord: Ana\n',
    });
    expect(
      toTaskFields(taskFormSchema.parse({ title: 'x', dueDate: '', priority: 0, notes: ' \n ' })),
    ).toEqual({ title: 'x', dueAt: null, priority: 0, notes: null });
  });

  it('rejects a blank or too-long title, a bad date and a bad priority', () => {
    const base = { title: 'x', dueDate: '', priority: 0, notes: '' };
    expect(issues({ ...base, title: '   ' })).toEqual([['title', TITLE_REQUIRED_MESSAGE]]);
    const long = issues({ ...base, title: 'x'.repeat(MAX_TITLE_LENGTH + 1) });
    expect(long?.[0]?.[0]).toBe('title');
    expect(issues({ ...base, dueDate: '2026-02-30' })).toEqual([['dueDate', INVALID_DATE_MESSAGE]]);
    expect(issues({ ...base, priority: 4 })?.[0]?.[0]).toBe('priority');
    expect(issues({ ...base, notes: 'n'.repeat(MAX_NOTES_LENGTH) })).toBeUndefined();
    expect(issues({ ...base, notes: 'n'.repeat(MAX_NOTES_LENGTH + 1) })).toEqual([
      ['notes', NOTES_TOO_LONG_MESSAGE],
    ]);
    expect(NOTES_TOO_LONG_MESSAGE).toBe('Use at most 10,000 characters');
  });

  it('turns a stored task into form values', () => {
    expect(
      toTaskFormValues({ title: 'a', dueAt: midnight(2026, 1, 5), priority: 2, notes: 'n' }),
    ).toEqual({ title: 'a', dueDate: '2026-01-05', dueTime: '', priority: 2, notes: 'n' });
    const empty = toTaskFormValues({ title: 'a', dueAt: null, priority: 0, notes: null });
    expect(empty).toMatchObject({ dueDate: '', notes: '' });
  });

  it('lists only the fields that differ from the stored task (autosave, TB-28)', () => {
    const stored = { title: 'a', dueAt: null, priority: 0, notes: null };
    expect(changedTaskFields({ ...stored }, stored)).toEqual({});
    expect(changedTaskFields({ ...stored, notes: 'n', priority: 2 }, stored)).toEqual({
      notes: 'n',
      priority: 2,
    });
    expect(changedTaskFields({ ...stored, title: 'b', dueAt: 5 }, stored)).toEqual({
      title: 'b',
      dueAt: 5,
    });
  });

  // TB-40: due time.
  it('combines a due date and time into due_at, and back', () => {
    const at = new Date(2026, 10, 1, 14, 30).getTime();
    const parsed = taskFormSchema.parse({
      title: 'x',
      dueDate: '2026-11-01',
      dueTime: ' 14:30 ',
      priority: 0,
      notes: '',
    });
    expect(toTaskFields(parsed).dueAt).toBe(at);
    expect(toTaskFormValues({ title: 'x', dueAt: at, priority: 0, notes: null })).toMatchObject({
      dueDate: '2026-11-01',
      dueTime: '14:30',
    });
    // No time: local midnight, as before TB-40.
    const dateOnly = taskFormSchema.parse({
      title: 'x',
      dueDate: '2026-11-01',
      priority: 0,
      notes: '',
    });
    expect(toTaskFields(dateOnly).dueAt).toBe(midnight(2026, 11, 1));
  });

  it('rejects a bad time, midnight, and a time without a date', () => {
    const base = { title: 'x', dueDate: '2026-11-01', priority: 0, notes: '' };
    expect(issues({ ...base, dueTime: '25:00' })).toEqual([['dueTime', INVALID_TIME_MESSAGE]]);
    expect(issues({ ...base, dueTime: '2pm' })).toEqual([['dueTime', INVALID_TIME_MESSAGE]]);
    expect(issues({ ...base, dueTime: '00:00' })).toEqual([['dueTime', MIDNIGHT_TIME_MESSAGE]]);
    expect(issues({ ...base, dueTime: '00:01' })).toBeUndefined();
    expect(issues({ ...base, dueDate: '', dueTime: '09:00' })).toEqual([
      ['dueTime', TIME_NEEDS_DATE_MESSAGE],
    ]);
  });
});
