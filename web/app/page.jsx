import { cookies } from 'next/headers';
import { verifySessionToken } from '../lib/session.js';
import { supabaseAdmin } from '../lib/supabaseAdmin.js';
import { getMonthDates, getMonthTitle, formatUKTime, formatDateUK, dayLabel, todayISOInUK } from '../lib/calendar.js';
import { getThumbnailMap } from '../lib/gameThumbnails.js';
import {
  joinDay, leaveDay, requestGuest,
  setGame, clearGame, setCapacity, setRecurring,
  approveRequest, denyRequest, uploadThumbnail
} from './actions.js';

export const dynamic = 'force-dynamic';

// TODO: swap in the real URLs
const SOCIAL_LINKS = {
  discord: 'https://discord.gg/XKYRHXPcsU',
  youtube: 'https://youtube.com/c/TNTNerds',
  twitch: 'https://twitch.tv/tntnerds'
};

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

  const thumbnails = await getThumbnailMap();

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

  // Pre-compute per-day stats once, reused by the grid and the next-scheduled-stream panel.
  const dayStats = new Map();

  for (const date of dates) {
    const day = days?.find((d) => d.date === date);
    const attendees = (day?.attendance ?? []).slice().sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    const guestNames = approvedGuests?.filter((g) => g.stream_day_id === day?.id).map((g) => g.display_name) ?? [];
    const capacity = day?.capacity ?? 4;
    const filled = attendees.length + guestNames.length;
    const open = Math.max(capacity - filled, 0);
    const thumbnail = day?.game ? thumbnails[day.game.toLowerCase()] : undefined;

    dayStats.set(date, { day, attendees, guestNames, capacity, filled, open, thumbnail });
  }

  const today = todayISOInUK();
  const nextDate = dates.find((d) => d >= today && dayStats.get(d).day?.game);
  const nextStats = nextDate ? dayStats.get(nextDate) : null;

  return (
    <main>
      <div className="layout">
        <div className="primary">
          <header className="topbar">
            <div className="brand">
              <img src="/logo.png" alt="" className="brand-logo" />
              <div>
                <h1>{getMonthTitle()}</h1>
                <div className="subtitle">Stream schedule</div>
              </div>
            </div>
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

                <form action={uploadThumbnail} className="admin-form" encType="multipart/form-data">
                  <h3>Add game thumbnail</h3>
                  <input type="text" name="tag" placeholder="Game name (must match exactly)" required />
                  <input type="file" name="file" accept="image/*" required />
                  <span className="hint">Square works best (500×500px+) - it's cropped to fit, so keep the subject centered</span>
                  <button type="submit">Upload</button>
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
              const { day, attendees, guestNames, open, thumbnail } = dayStats.get(date);
              const isIn = session ? attendees.some((a) => a.discord_user_id === session.id) : false;
              const showTbc = day?.game || attendees.length > 0;
              const statusClass = !day?.game ? '' : open === 0 ? 'cell-full' : 'cell-scheduled';
              const nextClass = date === nextDate ? 'cell-next' : '';

              const cellStyle = thumbnail
                ? { backgroundImage: `linear-gradient(to top, rgba(10,10,14,0.92) 0%, rgba(10,10,14,0.55) 55%, rgba(10,10,14,0.1) 100%), url(${thumbnail})` }
                : undefined;

              return (
                <div key={date} className={`cell ${statusClass} ${nextClass}`} style={cellStyle}>
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
                    <div className="badges">
                      <span className="badge-count">{attendees.length + guestNames.length}/{dayStats.get(date).capacity}</span>
                      <span className={`badge-status ${open === 0 ? 'full' : 'open'}`}>
                        {open === 0 ? 'FULL' : `${open} OPEN`}
                      </span>
                    </div>
                  )}

                  {session?.isCore && day?.game && (
                    <form action={isIn ? leaveDay.bind(null, date) : joinDay.bind(null, date)}>
                      <button type="submit" className={isIn ? 'btn leave' : 'btn join'}>
                        {isIn ? 'Leave' : 'Join'}
                      </button>
                    </form>
                  )}

                  {session && !session.isCore && day?.game && open > 0 && (
                    <form action={requestGuest.bind(null, date)}>
                      <button type="submit" className="btn guest">Request to guest</button>
                    </form>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <aside className="sidebar">
          <div className="next-card">
            <h3>Next scheduled stream</h3>
            {nextDate ? (
              <>
                <div className="next-date">{dayLabel(nextDate)}</div>
                <div
                  className="next-thumb"
                  style={nextStats.thumbnail ? { backgroundImage: `linear-gradient(to top, rgba(10,10,14,0.9) 0%, rgba(10,10,14,0.3) 60%, transparent 100%), url(${nextStats.thumbnail})` } : undefined}
                >
                  <div className="next-thumb-title">{nextStats.day.game}</div>
                </div>
                <div className="meta">{formatUKTime(nextStats.day.start_time_utc)} UK</div>
                <div className={`badge-status ${nextStats.open === 0 ? 'full' : 'open'}`}>
                  {nextStats.open === 0 ? 'FULL' : `${nextStats.open} OPEN`}
                </div>
              </>
            ) : (
              <div className="next-empty">Nothing left scheduled this month</div>
            )}
          </div>
        </aside>
      </div>

      <footer className="site-footer">
        <div className="social-links">
          <a href={SOCIAL_LINKS.discord} target="_blank" rel="noreferrer" aria-label="Discord">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M20.3 4.9A19.8 19.8 0 0 0 15.6 3.4c-.2.4-.5.9-.6 1.3a18.3 18.3 0 0 0-5.9 0 8.9 8.9 0 0 0-.7-1.3 19.7 19.7 0 0 0-4.7 1.5C1.2 9 .4 13 .8 17a19.9 19.9 0 0 0 6 3c.5-.6.9-1.3 1.2-2a13 13 0 0 1-1.9-.9l.5-.4a14.2 14.2 0 0 0 12 0l.4.4c-.6.4-1.2.6-1.9.9.3.7.7 1.4 1.2 2a19.8 19.8 0 0 0 6-3c.5-4.6-.7-8.6-3-12.1ZM8.5 14.3c-1 0-1.8-.9-1.8-2s.8-2 1.8-2c1 0 1.9.9 1.8 2 0 1.1-.8 2-1.8 2Zm7 0c-1 0-1.8-.9-1.8-2s.8-2 1.8-2c1 0 1.9.9 1.8 2 0 1.1-.8 2-1.8 2Z"/></svg>
          </a>
          <a href={SOCIAL_LINKS.youtube} target="_blank" rel="noreferrer" aria-label="YouTube">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M23 12s0-3.4-.4-5a3 3 0 0 0-2.1-2.1C18.9 4.5 12 4.5 12 4.5s-6.9 0-8.5.4A3 3 0 0 0 1.4 7C1 8.6 1 12 1 12s0 3.4.4 5a3 3 0 0 0 2.1 2.1c1.6.4 8.5.4 8.5.4s6.9 0 8.5-.4A3 3 0 0 0 22.6 17c.4-1.6.4-5 .4-5ZM9.7 15.5V8.5l6 3.5-6 3.5Z"/></svg>
          </a>
          <a href={SOCIAL_LINKS.twitch} target="_blank" rel="noreferrer" aria-label="Twitch">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M4 2 2 6.5v14h5.5V23l3.5-2.5h4L21 15V2H4Zm15 12-3 3h-4l-3 2.5V17H6V4h13v10Z"/><path d="M15.5 7h2v5h-2V7Zm-5 0h2v5h-2V7Z"/></svg>
          </a>
        </div>
      </footer>
    </main>
  );
}
