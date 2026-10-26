export const HEARTBEAT_KEY = 'cron:last_run';

/** Records the last cron run so the admin "Salute" page can show it. */
export async function recordHeartbeat(db: D1Database, now: Date): Promise<void> {
  await db
    .prepare(
      'insert into app_meta (key, value, updated_at) values (?1, ?2, ?3) ' +
        'on conflict(key) do update set value = excluded.value, updated_at = excluded.updated_at',
    )
    .bind(HEARTBEAT_KEY, now.toISOString(), now.getTime())
    .run();
}
