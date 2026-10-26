import { recordHeartbeat } from './heartbeat';

export interface CronEnv {
  DB: D1Database;
}

export default {
  async scheduled(controller, env, ctx) {
    // Reconciliation of GitHub state and due-date reminders arrive in Phases 4 and 9.
    ctx.waitUntil(recordHeartbeat(env.DB, new Date(controller.scheduledTime)));
  },
} satisfies ExportedHandler<CronEnv>;
