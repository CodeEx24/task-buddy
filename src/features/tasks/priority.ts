// Task priority levels (TB-26). The `tasks.priority` column holds 0..3 (TB-21 check constraint).

export type TaskPriority = 0 | 1 | 2 | 3;

export const TASK_PRIORITIES: readonly { value: TaskPriority; label: string }[] = [
  { value: 0, label: 'None' },
  { value: 1, label: 'Low' },
  { value: 2, label: 'Medium' },
  { value: 3, label: 'High' },
];

/** Display label for a stored priority; unknown values read as None. */
export function priorityLabel(priority: number): string {
  return TASK_PRIORITIES.find((p) => p.value === priority)?.label ?? 'None';
}
