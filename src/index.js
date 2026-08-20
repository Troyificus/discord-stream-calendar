import 'dotenv/config';
import {
  Client,
  GatewayIntentBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  EmbedBuilder,
  MessageFlags
} from 'discord.js';
import { supabase } from './supabaseClient.js';
import {
  refreshCalendarMessage,
  getMonthDates,
  getOpenDates,
  chunkArray,
  dayLabel,
  formatDateUK,
  parseDateUK,
  parseDatesList
} from './embedBuilder.js';

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

const WEEKDAY_INDEX = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };

function isAdmin(interaction) {
  const roleName = process.env.DISCORD_ADMIN_ROLE_NAME;
  return interaction.member?.roles?.cache?.some((r) => r.name === roleName) ?? false;
}

async function getOrCreateDay(date) {
  const { data: existing } = await supabase.from('stream_days').select('*').eq('date', date).single();
  if (existing) return existing;
  const { data: created } = await supabase.from('stream_days').insert({ date }).select().single();
  return created;
}

function chunkLabel(chunk) {
  return chunk.length === 1 ? dayLabel(chunk[0]) : `${formatDateUK(chunk[0])} - ${formatDateUK(chunk[chunk.length - 1])}`;
}

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

client.on('interactionCreate', async (interaction) => {
  try {
    // ---------- Slash commands (admin only) ----------
    if (interaction.isChatInputCommand()) {
      if (!isAdmin(interaction)) {
        return interaction.reply({ content: 'You need the admin role for that.', flags: MessageFlags.Ephemeral });
      }

      if (interaction.commandName === 'calendar-post') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        await refreshCalendarMessage(client);
        return interaction.editReply('Calendar posted.');
      }

      if (interaction.commandName === 'calendar-setgame') {
        let dates;
        try {
          dates = parseDatesList(interaction.options.getString('dates'));
        } catch (err) {
          return interaction.reply({ content: err.message, flags: MessageFlags.Ephemeral });
        }
        const game = interaction.options.getString('game');
        const time = interaction.options.getString('time');
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        for (const date of dates) {
          const startTimeUtc = new Date(`${date}T${time}:00Z`).toISOString();
          const day = await getOrCreateDay(date);
          await supabase.from('stream_days').update({ game, start_time_utc: startTimeUtc }).eq('id', day.id);
        }

        await refreshCalendarMessage(client);
        const dateList = dates.map(formatDateUK).join(', ');
        return interaction.editReply(`Set ${game} at ${time} UTC for ${dates.length} day${dates.length === 1 ? '' : 's'}: ${dateList}.`);
      }

      if (interaction.commandName === 'calendar-cleargame') {
        let dates;
        try {
          dates = parseDatesList(interaction.options.getString('dates'));
        } catch (err) {
          return interaction.reply({ content: err.message, flags: MessageFlags.Ephemeral });
        }
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        for (const date of dates) {
          const day = await getOrCreateDay(date);
          await supabase.from('stream_days').update({ game: null, start_time_utc: null }).eq('id', day.id);
        }

        await refreshCalendarMessage(client);
        const dateList = dates.map(formatDateUK).join(', ');
        return interaction.editReply(`Cleared the game/time for ${dates.length} day${dates.length === 1 ? '' : 's'}: ${dateList}. Signups are untouched.`);
      }

      if (interaction.commandName === 'calendar-setrecurring') {
        const weekday = interaction.options.getString('weekday');
        const game = interaction.options.getString('game');
        const time = interaction.options.getString('time');
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const targetIndex = WEEKDAY_INDEX[weekday];
        const matches = getMonthDates().filter((d) => new Date(`${d}T00:00:00Z`).getUTCDay() === targetIndex);

        for (const date of matches) {
          const startTimeUtc = new Date(`${date}T${time}:00Z`).toISOString();
          const day = await getOrCreateDay(date);
          await supabase.from('stream_days').update({ game, start_time_utc: startTimeUtc }).eq('id', day.id);
        }

        await refreshCalendarMessage(client);
        return interaction.editReply(`Set ${game} at ${time} UTC for every ${weekday} this month (${matches.length} day${matches.length === 1 ? '' : 's'}).`);
      }

      if (interaction.commandName === 'calendar-setcapacity') {
        let date;
        try {
          date = parseDateUK(interaction.options.getString('date'));
        } catch (err) {
          return interaction.reply({ content: err.message, flags: MessageFlags.Ephemeral });
        }
        const capacity = interaction.options.getInteger('capacity');
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const day = await getOrCreateDay(date);
        await supabase.from('stream_days').update({ capacity }).eq('id', day.id);
        await refreshCalendarMessage(client);
        return interaction.editReply(`Set capacity for ${formatDateUK(date)} to ${capacity}.`);
      }

      if (interaction.commandName === 'calendar-requests') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const { data: pending } = await supabase
          .from('guest_requests')
          .select('*, stream_days(date)')
          .eq('status', 'pending')
          .order('created_at', { ascending: true });

        if (!pending?.length) return interaction.editReply('No pending requests.');

        for (const req of pending) {
          const embed = new EmbedBuilder()
            .setDescription(`${req.display_name} wants to guest on ${formatDateUK(req.stream_days.date)}\nRequested <t:${Math.floor(new Date(req.created_at).getTime() / 1000)}:R>`);
          const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`approve_request_${req.id}`).setLabel('Approve').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`deny_request_${req.id}`).setLabel('Deny').setStyle(ButtonStyle.Danger)
          );
          await interaction.followUp({ embeds: [embed], components: [row], flags: MessageFlags.Ephemeral });
        }
        return;
      }
    }

    // ---------- Buttons ----------
    if (interaction.isButton()) {
      if (interaction.customId === 'manage_days') {
        const { data: member } = await supabase
          .from('members')
          .select('*')
          .eq('discord_user_id', interaction.user.id)
          .single();

        if (!member) {
          return interaction.reply({ content: 'You\'re not on the core roster, so this button isn\'t for you - try "Request to guest" instead.', flags: MessageFlags.Ephemeral });
        }

        const chunks = chunkArray(getMonthDates());
        const menu = new StringSelectMenuBuilder()
          .setCustomId('select_chunk_manage')
          .setPlaceholder('Pick a week')
          .addOptions(chunks.map((chunk, i) => ({ label: chunkLabel(chunk), value: String(i) })));

        return interaction.reply({ components: [new ActionRowBuilder().addComponents(menu)], flags: MessageFlags.Ephemeral });
      }

      if (interaction.customId === 'request_guest') {
        const openDates = await getOpenDates(getMonthDates());

        if (!openDates.length) {
          return interaction.reply({ content: 'No open slots this month.', flags: MessageFlags.Ephemeral });
        }

        const chunks = chunkArray(openDates);
        const menu = new StringSelectMenuBuilder()
          .setCustomId('select_chunk_guest')
          .setPlaceholder('Pick a week')
          .addOptions(chunks.map((chunk, i) => ({ label: chunkLabel(chunk), value: String(i) })));

        return interaction.reply({ components: [new ActionRowBuilder().addComponents(menu)], flags: MessageFlags.Ephemeral });
      }

      if (interaction.customId.startsWith('join_day_')) {
        const date = interaction.customId.replace('join_day_', '');
        const { data: member } = await supabase.from('members').select('*').eq('discord_user_id', interaction.user.id).single();
        const day = await getOrCreateDay(date);
        await supabase.from('attendance').upsert({ stream_day_id: day.id, member_id: member.id });
        await refreshCalendarMessage(client);
        return interaction.update({ content: `You're in for ${formatDateUK(date)}.`, components: [] });
      }

      if (interaction.customId.startsWith('leave_day_')) {
        const date = interaction.customId.replace('leave_day_', '');
        const { data: member } = await supabase.from('members').select('*').eq('discord_user_id', interaction.user.id).single();
        const day = await getOrCreateDay(date);
        await supabase.from('attendance').delete().eq('stream_day_id', day.id).eq('member_id', member.id);
        await refreshCalendarMessage(client);
        return interaction.update({ content: `Removed you from ${formatDateUK(date)}.`, components: [] });
      }

      if (interaction.customId.startsWith('confirm_guest_')) {
        const date = interaction.customId.replace('confirm_guest_', '');
        const day = await getOrCreateDay(date);
        await supabase.from('guest_requests').insert({
          stream_day_id: day.id,
          discord_user_id: interaction.user.id,
          display_name: interaction.user.username
        });
        return interaction.update({ content: `Request sent for ${formatDateUK(date)}. You'll hear back once it's reviewed.`, components: [] });
      }

      if (interaction.customId.startsWith('approve_request_')) {
        if (!isAdmin(interaction)) return interaction.reply({ content: 'Admin only.', flags: MessageFlags.Ephemeral });
        const id = interaction.customId.replace('approve_request_', '');
        await supabase.from('guest_requests').update({ status: 'approved' }).eq('id', id);
        await refreshCalendarMessage(client);
        return interaction.update({ content: 'Approved.', embeds: [], components: [] });
      }

      if (interaction.customId.startsWith('deny_request_')) {
        if (!isAdmin(interaction)) return interaction.reply({ content: 'Admin only.', flags: MessageFlags.Ephemeral });
        const id = interaction.customId.replace('deny_request_', '');
        await supabase.from('guest_requests').update({ status: 'denied' }).eq('id', id);
        return interaction.update({ content: 'Denied.', embeds: [], components: [] });
      }
    }

    // ---------- Select menus ----------
    if (interaction.isStringSelectMenu()) {
      if (interaction.customId === 'select_chunk_manage') {
        const chunks = chunkArray(getMonthDates());
        const chunk = chunks[Number(interaction.values[0])];
        const menu = new StringSelectMenuBuilder()
          .setCustomId('select_day_manage')
          .setPlaceholder('Pick a date')
          .addOptions(chunk.map((d) => ({ label: dayLabel(d), value: d })));
        return interaction.update({ content: 'Pick a date:', components: [new ActionRowBuilder().addComponents(menu)] });
      }

      if (interaction.customId === 'select_chunk_guest') {
        const openDates = await getOpenDates(getMonthDates());
        const chunks = chunkArray(openDates);
        const chunk = chunks[Number(interaction.values[0])];
        const menu = new StringSelectMenuBuilder()
          .setCustomId('select_day_guest')
          .setPlaceholder('Pick a date')
          .addOptions(chunk.map((d) => ({ label: dayLabel(d), value: d })));
        return interaction.update({ content: 'Pick a date:', components: [new ActionRowBuilder().addComponents(menu)] });
      }

      const date = interaction.values[0];

      if (interaction.customId === 'select_day_manage') {
        const { data: member } = await supabase.from('members').select('*').eq('discord_user_id', interaction.user.id).single();
        const day = await getOrCreateDay(date);
        const { data: existing } = await supabase
          .from('attendance')
          .select('*')
          .eq('stream_day_id', day.id)
          .eq('member_id', member.id)
          .single();

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`join_day_${date}`).setLabel('Join this day').setStyle(ButtonStyle.Success).setDisabled(!!existing),
          new ButtonBuilder().setCustomId(`leave_day_${date}`).setLabel('Leave this day').setStyle(ButtonStyle.Danger).setDisabled(!existing)
        );
        return interaction.update({ content: `${formatDateUK(date)}: ${existing ? 'you\'re in' : 'you\'re not signed up yet'}`, components: [row] });
      }

      if (interaction.customId === 'select_day_guest') {
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`confirm_guest_${date}`).setLabel(`Request ${formatDateUK(date)}`).setStyle(ButtonStyle.Primary)
        );
        return interaction.update({ content: `Confirm your guest request for ${formatDateUK(date)}:`, components: [row] });
      }
    }
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
