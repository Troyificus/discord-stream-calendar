import 'dotenv/config';
import { REST, Routes, SlashCommandBuilder } from 'discord.js';

const commands = [
  new SlashCommandBuilder()
    .setName('calendar-post')
    .setDescription('Post or refresh this month\'s calendar (admin)'),
  new SlashCommandBuilder()
    .setName('schedule-post')
    .setDescription('Post the stream schedule to Discord and socials now, replacing any not yet published (admin)'),
  new SlashCommandBuilder()
    .setName('clips')
    .setDescription('Turn recent Twitch clips into vertical shorts, saved as drafts in Postiz (admin)')
    .addIntegerOption((o) => o.setName('hours').setDescription('How far back to look, in hours (default 12)').setMinValue(1).setMaxValue(168))
].map((c) => c.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

const result = await rest.put(
  Routes.applicationGuildCommands(process.env.DISCORD_CLIENT_ID, process.env.DISCORD_GUILD_ID),
  { body: commands }
);

console.log(`Registered ${result.length} commands.`);
