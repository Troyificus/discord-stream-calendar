import 'dotenv/config';
import { REST, Routes, SlashCommandBuilder } from 'discord.js';

const WEEKDAY_CHOICES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
  .map((name) => ({ name, value: name.toLowerCase() }));

const commands = [
  new SlashCommandBuilder()
    .setName('calendar-post')
    .setDescription('Post or refresh this month\'s calendar (admin)'),

  new SlashCommandBuilder()
    .setName('calendar-setgame')
    .setDescription('Set the game and time for one or more days (admin)')
    .addStringOption((o) => o.setName('dates').setDescription('DD/MM/YYYY, or comma-separated for multiple').setRequired(true))
    .addStringOption((o) => o.setName('game').setDescription('Game name').setRequired(true))
    .addStringOption((o) => o.setName('time').setDescription('24hr UTC time, e.g. 19:00').setRequired(true)),

  new SlashCommandBuilder()
    .setName('calendar-cleargame')
    .setDescription('Remove the game/time from one or more days, leaving signups intact (admin)')
    .addStringOption((o) => o.setName('dates').setDescription('DD/MM/YYYY, or comma-separated for multiple').setRequired(true)),

  new SlashCommandBuilder()
    .setName('calendar-setrecurring')
    .setDescription('Set the game and time for every occurrence of a weekday this month (admin)')
    .addStringOption((o) => o.setName('weekday').setDescription('Day of the week').setRequired(true).addChoices(...WEEKDAY_CHOICES))
    .addStringOption((o) => o.setName('game').setDescription('Game name').setRequired(true))
    .addStringOption((o) => o.setName('time').setDescription('24hr UTC time, e.g. 19:00').setRequired(true)),

  new SlashCommandBuilder()
    .setName('calendar-setcapacity')
    .setDescription('Set how many people can play on a day (admin)')
    .addStringOption((o) => o.setName('date').setDescription('DD/MM/YYYY').setRequired(true))
    .addIntegerOption((o) => o.setName('capacity').setDescription('Number of slots').setRequired(true)),

  new SlashCommandBuilder()
    .setName('calendar-requests')
    .setDescription('Review pending guest requests, oldest first (admin)')
].map((c) => c.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

const result = await rest.put(
  Routes.applicationGuildCommands(process.env.DISCORD_CLIENT_ID, process.env.DISCORD_GUILD_ID),
  { body: commands }
);

console.log(`Registered ${result.length} commands.`);
