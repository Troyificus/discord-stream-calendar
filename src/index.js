import 'dotenv/config';
import { Client, GatewayIntentBits, MessageFlags } from 'discord.js';
import { refreshCalendarMessage } from './embedBuilder.js';
import { startLiveWatcher } from './liveWatcher.js';
import { startReminderLoop, isReminderButton, handleReminderButton } from './reminders.js';
import { startWeeklyLoop, postScheduleNow } from './weeklyPost.js';
import { clipsEnabled, processClips } from './clips.js';

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

function isAdmin(interaction) {
  const roleName = process.env.DISCORD_ADMIN_ROLE_NAME;
  return interaction.member?.roles?.cache?.some((r) => r.name === roleName) ?? false;
}

const REFRESH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

client.once('clientReady', () => {
  console.log(`Logged in as ${client.user.tag}`);

  // The website writes straight to Supabase and has no way to notify the bot,
  // so poll on a timer rather than only refreshing on the /calendar-post command.
  refreshCalendarMessage(client).catch((err) => console.error('Auto-refresh failed:', err));
  setInterval(() => {
    refreshCalendarMessage(client).catch((err) => console.error('Auto-refresh failed:', err));
  }, REFRESH_INTERVAL_MS);

  // Social automation: going live posts, after stream reminder DMs, weekly schedule post.
  startLiveWatcher(client);
  startReminderLoop(client);
  startWeeklyLoop(client);
});

const ADMIN_COMMANDS = {
  'calendar-post': async () => {
    await refreshCalendarMessage(client);
    return 'Calendar posted.';
  },
  'schedule-post': () => postScheduleNow(client),
  clips: async (interaction) => {
    if (!clipsEnabled()) return 'Clips are not set up yet: Twitch, Postiz and clip channels are needed in .env.';
    const hours = interaction.options.getInteger('hours') ?? 12;
    // Rendering and captioning can take longer than Discord lets a reply wait, so the result
    // comes as a DM instead.
    runClipsAndReport(interaction.user, hours).catch((err) => console.error('/clips failed:', err));
    return `Working on clips from the last ${hours} hours. This can take a few minutes per clip; I'll DM you when it's done.`;
  }
};

async function runClipsAndReport(user, hours) {
  let text;
  try {
    const result = await processClips(new Date(Date.now() - hours * 3600 * 1000), new Date());
    if (result.error === 'download permission missing') {
      text = 'Twitch refused the clip downloads. Run `npm run twitch-clips-auth` on the server as TNT Nerds first.';
    } else if (!result.drafted.length) {
      text = result.skipped
        ? `No new clips: ${result.skipped} from the last ${hours} hours were already prepared.`
        : `No clips found from the last ${hours} hours (clips under 5 seconds are ignored).`;
    } else {
      text = `🎬 ${result.drafted.length} clip${result.drafted.length === 1 ? '' : 's'} drafted in Postiz:\n` +
        result.drafted.map((c) => `• ${c.title || 'Untitled'} (${c.views} views)${c.captioned ? '' : ' [no captions]'}`).join('\n');
    }
  } catch (err) {
    console.error(err);
    text = 'Clip processing failed. Check `docker compose logs` on the server.';
  }
  await user.send(text).catch((err) => console.error('Could not DM /clips result:', err));
}

client.on('interactionCreate', async (interaction) => {
  try {
    if (isReminderButton(interaction)) {
      return await handleReminderButton(interaction);
    }

    if (!interaction.isChatInputCommand() || !ADMIN_COMMANDS[interaction.commandName]) return;

    if (!isAdmin(interaction)) {
      return interaction.reply({ content: 'You need the admin role for that.', flags: MessageFlags.Ephemeral });
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const message = await ADMIN_COMMANDS[interaction.commandName](interaction);
    return interaction.editReply(message);
  } catch (err) {
    console.error(err);
    const payload = { content: 'Something went wrong - try again.', flags: MessageFlags.Ephemeral };
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp(payload).catch(() => {});
    } else if (interaction.isRepliable()) {
      await interaction.reply(payload).catch(() => {});
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
