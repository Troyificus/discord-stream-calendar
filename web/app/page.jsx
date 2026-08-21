import { cookies } from 'next/headers';
import { verifySessionToken } from '../lib/session.js';
import { supabaseAdmin } from '../lib/supabaseAdmin.js';
import { getMonthDates, getMonthTitle, formatUKTime, formatDateUK } from '../lib/calendar.js';
import { joinDay, leaveDay, requestGuest, setGame, clearGame, setCapacity, setRecurring, approveRequest, denyRequest } from './actions.js';

export const dynamic = 'force-dynamic';

export default async function CalendarPage() {
  const cookieStore = await cookies();
  const session = verifySessionToken(cookieStore.get('session')?.value);

  const dates = getMonthDates();
  const { data: days, error: daysError } = await supabaseAdmin
    .from('stream_days')
    .select('*, attendance(discord_user_id, display_name, created_at)')
    .in('date', dates);
  if (daysError) throw new Error(`Loading the calendar failed: ${daysError.message}`);

  const { data: approvedGuests, error: guestsError } = await supabaseAdmin
    .from('guest_requests')
    .select('stream_day_id, display_name')
    .eq('status', 'approved');
  if (guestsError) throw new Error(`Loading guest data failed: ${guestsError.message}`);

  const admin = session?.isAdmin ?? false;
  let pendingRequests = [];
  if (admin) {
    const { data } = await supabaseAdmin
      .from('guest_requests')
      .select('*, stream_days(date)')
      .eq('status', 'pending')
      .order('created_at', { ascending: true });
    pendingRequests = data ?? [];
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

      {admin && (
        <section className="admin-panel">
          <h2>Admin</h2>

          <div className="admin-forms">
            <form action={setGame} className="admin-form">
              <h3>Set a day</h3>
              <input type="date" name="date" min={dates[0]} max={dates[dates.length - 1]} required />
              <input type="text" name="game" placeholder="Game" required />
              <input type="time" name="time" required />
              <span className="hint">Time is UK time</span>
              <button type="submit">Save</button>
            </form>

            <form action={clearGame} className="admin-form">
              <h3>Clear a day</h3>
              <input type="date" name="date" min={dates[0]} max={dates[dates.length - 1]} required />
              <button type="submit">Clear</button>
            </form>

            <form action={setCapacity} className="admin-form">
              <h3>Set capacity</h3>
              <input type="date" name="date" min={dates[0]} max={dates[dates.length - 1]} required />
              <input type="number" name="capacity" min="1" max="20" defaultValue="4" required />
              <button type="submit">Save</button>
            </form>

            <form action={setRecurring} className="admin-form">
              <h3>Set every weekday this month</h3>
              <select name="weekday" required defaultValue="monday">
                <option value="monday">Monday</option>
                <option value="tuesday">Tuesday</option>
                <option value="wednesday">Wednesday</option>
                <option value="thursday">Thursday</option>
                <option value="friday">Friday</option>
                <option value="saturday">Saturday</option>
                <option value="sunday">Sunday</option>
              </select>
              <input type="text" name="game" placeholder="Game" required />
              <input type="time" name="time" required />
              <span className="hint">Time is UK time</span>
              <button type="submit">Save</button>
            </form>
          </div>

          {pendingRequests.length > 0 && (
            <div className="requests">
              <h3>Pending guest requests</h3>
              {pendingRequests.map((r) => (
                <div key={r.id} className="request-row">
                  <span>{r.display_name} — {formatDateUK(r.stream_days.date)}</span>
                  <form action={approveRequest.bind(null, r.id)}>
                    <button type="submit" className="btn join">Approve</button>
                  </form>
                  <form action={denyRequest.bind(null, r.id)}>
                    <button type="submit" className="btn leave">Deny</button>
                  </form>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      <div className="grid">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
          <div key={d} className="weekday">{d}</div>
        ))}

        {Array.from({ length: firstWeekday }).map((_, i) => (
          <div key={`blank-${i}`} className="cell blank" />
        ))}

        {dates.map((date) => {
          const day = days?.find((d) => d.date === date);
          const attendees = (day?.attendance ?? []).slice().sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
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
                <div className="who">
                  {attendees.map((a) => (
                    <div key={a.discord_user_id} className="who-row">{a.display_name}</div>
                  ))}
                  {guestNames.map((g, i) => (
                    <div key={`guest-${i}`} className="who-row who-guest">{g} (guest)</div>
                  ))}
                </div>
              )}

              {showTbc && (
                <div className={`status ${open === 0 ? 'full' : 'open'}`}>
                  {open === 0 ? 'FULL' : `${open} OPEN`}
                </div>
              )}

              {session?.isCore && day?.game && (
                <form action={isIn ? leaveDay.bind(null, date) : joinDay.bind(null, date)}>
                  <button type="submit" className={isIn ? 'btn leave' : 'btn join'}>
                    {isIn ? 'Leave' : 'Join'}
                  </button>
                </form>
              )}

              {session && !session.isCore && open > 0 && (
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
