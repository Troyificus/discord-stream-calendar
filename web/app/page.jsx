import { cookies } from 'next/headers';
import { verifySessionToken } from '../lib/session.js';
import { supabaseAdmin } from '../lib/supabaseAdmin.js';
import { getMonthDates, getMonthTitle, formatUKTime } from '../lib/calendar.js';
import { joinDay, leaveDay, requestGuest } from './actions.js';

export default async function CalendarPage() {
  const cookieStore = await cookies();
  const session = verifySessionToken(cookieStore.get('session')?.value);

  const dates = getMonthDates();
  const { data: days } = await supabaseAdmin
    .from('stream_days')
    .select('*, attendance(member_id, members(display_name, discord_user_id))')
    .in('date', dates);
  const { data: approvedGuests } = await supabaseAdmin
    .from('guest_requests')
    .select('stream_day_id, display_name')
    .eq('status', 'approved');

  let isMember = false;
  if (session) {
    const { data: member } = await supabaseAdmin.from('members').select('id').eq('discord_user_id', session.id).single();
    isMember = !!member;
  }

  const firstWeekday = (new Date(`${dates[0]}T00:00:00Z`).getUTCDay() + 6) % 7;

  return (
    <main>
      <header className="topbar">
        <h1>{getMonthTitle()}</h1>
        {session ? (
          <div className="account">
            <span>{session.username}</span>
            <a href="/api/auth/logout">Sign out</a>
          </div>
        ) : (
          <a className="signin" href="/api/auth/login">Sign in with Discord</a>
        )}
      </header>

      <div className="grid">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
          <div key={d} className="weekday">{d}</div>
        ))}

        {Array.from({ length: firstWeekday }).map((_, i) => (
          <div key={`blank-${i}`} className="cell blank" />
        ))}

        {dates.map((date) => {
          const day = days?.find((d) => d.date === date);
          const attendees = day?.attendance?.map((a) => a.members).filter(Boolean) ?? [];
          const guestNames = approvedGuests?.filter((g) => g.stream_day_id === day?.id).map((g) => g.display_name) ?? [];
          const capacity = day?.capacity ?? 4;
          const open = Math.max(capacity - attendees.length - guestNames.length, 0);
          const isIn = session ? attendees.some((a) => a.discord_user_id === session.id) : false;
          const showTbc = day?.game || attendees.length > 0;

          return (
            <div key={date} className="cell">
              <div className="daynum">{Number(date.slice(-2))}</div>

              {day?.game && <div className="game">{day.game}</div>}
              {!day?.game && showTbc && <div className="game tbc">game tbc</div>}

              {day?.start_time_utc && <div className="meta">{formatUKTime(day.start_time_utc)} UK</div>}
              {!day?.start_time_utc && showTbc && <div className="meta">time tbc</div>}

              {(attendees.length > 0 || guestNames.length > 0) && (
                <div className="meta who">
                  {[...attendees.map((a) => a.display_name), ...guestNames.map((g) => `${g} (guest)`)].join(', ')}
                </div>
              )}

              {showTbc && (
                <div className={`status ${open === 0 ? 'full' : 'open'}`}>
                  {open === 0 ? 'FULL' : `${open} OPEN`}
                </div>
              )}

              {session && isMember && (
                <form action={isIn ? leaveDay.bind(null, date) : joinDay.bind(null, date)}>
                  <button type="submit" className={isIn ? 'btn leave' : 'btn join'}>
                    {isIn ? 'Leave' : 'Join'}
                  </button>
                </form>
              )}

              {session && !isMember && open > 0 && (
                <form action={requestGuest.bind(null, date)}>
                  <button type="submit" className="btn guest">Request to guest</button>
                </form>
              )}
            </div>
          );
        })}
      </div>
    </main>
  );
}
