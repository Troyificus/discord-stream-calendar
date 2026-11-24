// Lists the channels connected in Postiz with their IDs, so you can copy them into
// POSTIZ_LIVE_CHANNELS / POSTIZ_WEEKLY_CHANNELS in .env.
// Run: npm run postiz-channels   (or: docker compose run --rm discord-stream-calendar npm run postiz-channels)
import 'dotenv/config';
import { postizConfigured, listIntegrations } from './postiz.js';

if (!postizConfigured()) {
  console.error('Set POSTIZ_API_URL and POSTIZ_API_KEY in .env first.');
  process.exit(1);
}

const integrations = await listIntegrations({ fresh: true });
if (!integrations.length) {
  console.log('No channels connected in Postiz yet.');
} else {
  for (const i of integrations) {
    console.log(`${i.id}  ${i.identifier.padEnd(12)} ${i.name}${i.profile ? ` (@${i.profile})` : ''}${i.disabled ? '  [disabled]' : ''}`);
  }
}
