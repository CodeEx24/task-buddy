import { MAX_TASK_ID_LENGTH, parseTaskIdParam } from './task-id';

describe('parseTaskIdParam', () => {
  it('accepts a UUIDv7 task id', () => {
    const id = '0190f3b2-7c1a-7d4e-9b2f-3a6c8e1d5f42';
    expect(parseTaskIdParam(id)).toEqual({ ok: true, id });
  });

  it('accepts the sample task id used by the Today showcase', () => {
    expect(parseTaskIdParam('sample-task')).toEqual({ ok: true, id: 'sample-task' });
  });

  it('takes the only element of a one-element array', () => {
    expect(parseTaskIdParam(['abc-123'])).toEqual({ ok: true, id: 'abc-123' });
  });

  it('accepts an id at the maximum length', () => {
    const id = 'a'.repeat(MAX_TASK_ID_LENGTH);
    expect(parseTaskIdParam(id)).toEqual({ ok: true, id });
  });

  it.each([
    ['undefined', undefined],
    ['an empty string', ''],
    ['an empty array', []],
    ['an array with two values', ['a', 'b']],
    ['an id over the maximum length', 'a'.repeat(MAX_TASK_ID_LENGTH + 1)],
    ['a null byte', 'abc\u0000'],
    ['an encoded null byte', '%00'],
    ['a space', 'abc def'],
    ['a slash', 'abc/def'],
    ['an emoji', 'task-😀'],
    ['markup', '<script>'],
  ])('rejects %s', (_label, raw) => {
    expect(parseTaskIdParam(raw)).toEqual({ ok: false });
  });
});
