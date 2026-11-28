import { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js';
import { supabase } from './supabaseClient.js';

const CHECK_MS = 60 * 1000;
const FOLLOW_UP_MS = 2 * 60 * 60 * 1000; // one nudge, 2 hours after the first ping
const SNOOZE_MS = 60 * 60 * 1000;

const FIRST_MESSAGE =
  "🎬 Stream's over. Your 15 minutes: open Postiz and drop **2 clips** from tonight into the queue. That's the whole job.";
const FOLLOW_UP_MESSAGE =
  'Quick nudge: **2 clips** into the Postiz queue and you are done. Or hit Skip, no guilt.';

let running = false;

function buttons(reminderId) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`reminder:done:${reminderId}`).setLabel('Done').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`reminder:snooze:${reminderId}`).setLabel('Snooze 1 hour').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`reminder:skip:${reminderId}`).setLabel('Skip this time').setStyle(ButtonStyle.Secondary)
  );
  if (process.env.POSTIZ_APP_URL) {
    row.addComponents(new ButtonBuilder().setLabel('Open Postiz').setStyle(ButtonStyle.Link).setURL(process.env.POSTIZ_APP_URL));
  }
  return [row];
}

// note: optional first message (e.g. the list of clips waiting in Postiz); the standard
// message is used when it's left out. Follow up nudges always use the short standard one.
export async function createReminder(client, streamId, note = null) {
  // Only ever one live reminder: a new stream replaces any you never answered.
  await supabase.from('reminders').update({ status: 'superseded', next_send_at: null }).eq('status', 'active');
  const { error } = await supabase
    .from('reminders')
    .insert({ stream_id: streamId, status: 'active', sends: 0, note, next_send_at: new Date().toISOString() });
  if (error && error.code !== '23505') throw error;
  await processDueReminders(client);
}

export async function processDueReminders(client) {
  const target = process.env.REMINDER_DISCORD_USER_ID;
  if (!target || running) return;
  running = true;
  try {
    const { data: due, error } = await supabase
      .from('reminders')
      .select('*')
      .eq('status', 'active')
      .lte('next_send_at', new Date().toISOString());
    if (error) throw error;

    for (const reminder of due ?? []) {
      const sends = reminder.sends + 1;
      const next = sends === 1 ? new Date(Date.now() + FOLLOW_UP_MS).toISOString() : null;
      // Conditional update so two overlapping checks can't both send the same ping.
      const { data: claimed } = await supabase
        .from('reminders')
        .update({ sends, next_send_at: next })
        .eq('id', reminder.id)
        .eq('sends', reminder.sends)
        .select('id');
      if (!claimed?.length) continue;

      try {
        const user = await client.users.fetch(target);
        await user.send({ content: sends === 1 ? reminder.note || FIRST_MESSAGE : FOLLOW_UP_MESSAGE, components: buttons(reminder.id) });
      } catch (err) {
        console.error('Sending reminder DM failed (are DMs from server members allowed?):', err);
      }
    }
  } catch (err) {
    console.error('Reminder check failed:', err);
  } finally {
    running = false;
  }
}

export function startReminderLoop(client) {
  if (!process.env.REMINDER_DISCORD_USER_ID) {
    console.log('REMINDER_DISCORD_USER_ID not set: after stream reminders are off.');
    return;
  }
  setInterval(() => processDueReminders(client), CHECK_MS);
}

export function isReminderButton(interaction) {
  return interaction.isButton() && interaction.customId.startsWith('reminder:');
}

export async function handleReminderButton(interaction) {
  const [, action, id] = interaction.customId.split(':');

  if (interaction.user.id !== process.env.REMINDER_DISCORD_USER_ID) {
    return interaction.reply({ content: "That button isn't for you.", flags: MessageFlags.Ephemeral });
  }

  const { data: reminder } = await supabase.from('reminders').select('*').eq('id', id).maybeSingle();
  if (!reminder || reminder.status !== 'active') {
    return interaction.update({ content: 'This one is already sorted.', components: [] });
  }

  if (action === 'done') {
    await supabase.from('reminders').update({ status: 'done', next_send_at: null }).eq('id', id);
    return interaction.update({ content: '✅ Nice one. Queue topped up.', components: [] });
  }
  if (action === 'skip') {
    await supabase.from('reminders').update({ status: 'skipped', next_send_at: null }).eq('id', id);
    return interaction.update({ content: 'Skipped. See you next stream.', components: [] });
  }
  if (action === 'snooze') {
    await supabase
      .from('reminders')
      .update({ next_send_at: new Date(Date.now() + SNOOZE_MS).toISOString(), sends: 0 })
      .eq('id', id);
    return interaction.update({ content: '⏰ Snoozed. I will ping you again in an hour.', components: [] });
  }
}
