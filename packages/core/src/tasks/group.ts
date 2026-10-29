/**
 * Groups tasks by the file they come from, following `order` (the files of the project) and
 * keeping the order the tasks came in inside each group. Files not in `order` go last, by path.
 */
export function groupByFile<T extends { path: string }>(
  tasks: readonly T[],
  order: readonly string[],
): { path: string; tasks: T[] }[] {
  const groups = new Map<string, T[]>();
  for (const task of tasks) groups.set(task.path, [...(groups.get(task.path) ?? []), task]);
  const rank = new Map(order.map((path, index) => [path, index]));
  return [...groups.entries()]
    .sort(([a], [b]) => {
      const ra = rank.get(a) ?? Number.MAX_SAFE_INTEGER;
      const rb = rank.get(b) ?? Number.MAX_SAFE_INTEGER;
      return ra - rb || a.localeCompare(b);
    })
    .map(([path, list]) => ({ path, tasks: list }));
}
