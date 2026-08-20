import 'dotenv/config';
import {
  Client,
  GatewayIntentBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  EmbedBuilder
} from 'discord.js';
import { supabase } from './supabaseClient.js';
import { pushSegmentToTwitch } from './twitchClient.js';
import { buildWeeklyEmbed, refreshCalendarMessage, getWeekDates, formatDateUK } from './embedBuilder.js';

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

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

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

client.on('interactionCreate', async (interaction) => {
  try {
    // ---------- Slash commands (admin only) ----------
    if (interaction.isChatInputCommand()) {
      if (!isAdmin(interaction)) {
        return interaction.reply({ content: 'You need the admin role for that.', ephemeral: true });
      }

      if (interaction.commandName === 'calendar-post') {
        await interaction.deferReply({ ephemeral: true });
        await refreshCalendarMessage(client);
        return interaction.editReply('Calendar posted.');
      }

      if (interaction.commandName === 'calendar-setgame') {
        const date = interaction.options.getString('date');
        const game = interaction.options.getString('game');
        const time = interaction.options.getString('time');
        await interaction.deferReply({ ephemeral: true });

        const startTimeUtc = new Date(`${date}T${time}:00Z`).toISOString();
        const day = await getOrCreateDay(date);

        const { data: updated } = await supabase
          .from('stream_days')
          .update({ game, start_time_utc: startTimeUtc })
          .eq('id', day.id)
          .select()
          .single();

        try {
          const segmentId = await pushSegmentToTwitch(updated);
          if (segmentId !== updated.twitch_segment_id) {
            await supabase.from('stream_days').update({ twitch_segment_id: segmentId }).eq('id', updated.id);
          }
        } catch (err) {
          console.error('Twitch push failed:', err);
          await interaction.followUp({ content: `Saved, but the Twitch push failed: ${err.message}`, ephemeral: true });
        }

        await refreshCalendarMessage(client);
        return interaction.editReply(`Set ${formatDateUK(date)} to ${game} at ${time} UTC.`);
      }

      if (interaction.commandName === 'calendar-setcapacity') {
        const date = interaction.options.getString('date');
        const capacity = interaction.options.getInteger('capacity');
        await interaction.deferReply({ ephemeral: true });

        const day = await getOrCreateDay(date);
        await supabase.from('stream_days').update({ capacity }).eq('id', day.id);
        await refreshCalendarMessage(client);
        return interaction.editReply(`Set capacity for ${formatDateUK(date)} to ${capacity}.`);
      }

      if (interaction.commandName === 'calendar-requests') {
        await interaction.deferReply({ ephemeral: true });
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
          await interaction.followUp({ embeds: [embed], components: [row], ephemeral: true });
        }
        return;
      }
    }

    // ---------- Buttons ----------
    if (interaction.isButton()) {
      const [action, ...rest] = interaction.customId.split('_');

      if (interaction.customId === 'manage_days') {
        const { data: member } = await supabase
          .from('members')
          .select('*')
          .eq('discord_user_id', interaction.user.id)
          .single();

        if (!member) {
          return interaction.reply({ content: 'You\'re not on the core roster, so this button isn\'t for you - try "Request to guest" instead.', ephemeral: true });
        }

        const dates = getWeekDates();
        const menu = new StringSelectMenuBuilder()
          .setCustomId('select_day_manage')
          .setPlaceholder('Pick a date')
          .addOptions(dates.map((d) => ({ label: formatDateUK(d), value: d })));

        return interaction.reply({ components: [new ActionRowBuilder().addComponents(menu)], ephemeral: true });
      }

      if (interaction.customId === 'request_guest') {
        const dates = getWeekDates();
        const { data: days } = await supabase.from('stream_days').select('*, attendance(id)').in('date', dates);
        const { data: approved } = await supabase.from('guest_requests').select('stream_day_id').eq('status', 'approved');

        const openDates = dates.filter((date) => {
          const day = days?.find((d) => d.date === date);
          if (!day) return true;
          const filled = (day.attendance?.length ?? 0) + (approved?.filter((g) => g.stream_day_id === day.id).length ?? 0);
          return filled < day.capacity;
        });

        if (!openDates.length) {
          return interaction.reply({ content: 'No open slots this week.', ephemeral: true });
        }

        const menu = new StringSelectMenuBuilder()
          .setCustomId('select_day_guest')
          .setPlaceholder('Pick a date')
          .addOptions(openDates.map((d) => ({ label: formatDateUK(d), value: d })));

        return interaction.reply({ components: [new ActionRowBuilder().addComponents(menu)], ephemeral: true });
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
        if (!isAdmin(interaction)) return interaction.reply({ content: 'Admin only.', ephemeral: true });
        const id = interaction.customId.replace('approve_request_', '');
        await supabase.from('guest_requests').update({ status: 'approved' }).eq('id', id);
        await refreshCalendarMessage(client);
        return interaction.update({ content: 'Approved.', embeds: [], components: [] });
      }

      if (interaction.customId.startsWith('deny_request_')) {
        if (!isAdmin(interaction)) return interaction.reply({ content: 'Admin only.', ephemeral: true });
        const id = interaction.customId.replace('deny_request_', '');
        await supabase.from('guest_requests').update({ status: 'denied' }).eq('id', id);
        return interaction.update({ content: 'Denied.', embeds: [], components: [] });
      }
    }

    // ---------- Select menus ----------
    if (interaction.isStringSelectMenu()) {
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
    const payload = { content: 'Something went wrong - try again.', ephemeral: true };
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp(payload).catch(() => {});
    } else {
      await interaction.reply(payload).catch(() => {});
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
