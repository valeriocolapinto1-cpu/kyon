import { getCloudflareContext } from '@opennextjs/cloudflare';

export async function getEnv(): Promise<CloudflareEnv> {
  return (await getCloudflareContext({ async: true })).env;
}
