import 'dotenv/config';
import { Client, GatewayIntentBits, MessageFlags } from 'discord.js';
import { refreshCalendarMessage } from './embedBuilder.js';

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

function isAdmin(interaction) {
  const roleName = process.env.DISCORD_ADMIN_ROLE_NAME;
  return interaction.member?.roles?.cache?.some((r) => r.name === roleName) ?? false;
}

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand() || interaction.commandName !== 'calendar-post') return;

  try {
    if (!isAdmin(interaction)) {
      return interaction.reply({ content: 'You need the admin role for that.', flags: MessageFlags.Ephemeral });
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    await refreshCalendarMessage(client);
    return interaction.editReply('Calendar posted.');
  } catch (err) {
    console.error(err);
    const payload = { content: 'Something went wrong - try again.', flags: MessageFlags.Ephemeral };
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp(payload).catch(() => {});
    } else {
      await interaction.reply(payload).catch(() => {});
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
