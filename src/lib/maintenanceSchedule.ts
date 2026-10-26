/** Shared by every route that advances a MaintenanceSchedule's due date. */
export function calcNextDue(frequencyDays: number, from: Date = new Date()): Date {
  const d = new Date(from);
  d.setDate(d.getDate() + frequencyDays);
  return d;
}
