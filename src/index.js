import 'dotenv/config';
import { Client, GatewayIntentBits, MessageFlags } from 'discord.js';
import { refreshCalendarMessage } from './embedBuilder.js';
import { startLiveWatcher } from './liveWatcher.js';
import { startReminderLoop, isReminderButton, handleReminderButton } from './reminders.js';
import { startWeeklyLoop, postScheduleNow } from './weeklyPost.js';

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

function isAdmin(interaction) {
  const roleName = process.env.DISCORD_ADMIN_ROLE_NAME;
  return interaction.member?.roles?.cache?.some((r) => r.name === roleName) ?? false;
}

const REFRESH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

client.once('ready', () => {
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
  'schedule-post': () => postScheduleNow(client)
};

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
    const message = await ADMIN_COMMANDS[interaction.commandName]();
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
