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

  // Pre-compute per-day stats once, reused by the grid, the next-deployment panel, and the stats card.
  const dayStats = new Map();
  let missionsPlanned = 0;
  let totalSlots = 0;
  let slotsOpen = 0;

  for (const date of dates) {
    const day = days?.find((d) => d.date === date);
    const attendees = (day?.attendance ?? []).slice().sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    const guestNames = approvedGuests?.filter((g) => g.stream_day_id === day?.id).map((g) => g.display_name) ?? [];
    const capacity = day?.capacity ?? 4;
    const filled = attendees.length + guestNames.length;
    const open = Math.max(capacity - filled, 0);
    const thumbnail = day?.game ? thumbnails[day.game.toLowerCase()] : undefined;

    dayStats.set(date, { day, attendees, guestNames, capacity, filled, open, thumbnail });

    if (day?.game) {
      missionsPlanned += 1;
      totalSlots += capacity;
      slotsOpen += open;
    }
  }

  const today = todayISOInUK();
  const nextDate = dates.find((d) => d >= today);
  const nextStats = nextDate ? dayStats.get(nextDate) : null;

  return (
    <main>
      <div className="layout">
        <div className="primary">
          <header className="topbar">
            <div>
              <h1>{getMonthTitle()}</h1>
              <div className="subtitle">Stream schedule</div>
              <div className="legend">
                <span className="legend-item legend-open">Open slots</span>
                <span className="legend-item legend-none">No stream</span>
                <span className="legend-item legend-full">Full</span>
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
            <h3>Next deployment</h3>
            {nextDate ? (
              <>
                <div className="next-date">{dayLabel(nextDate)}</div>
                {nextStats.day?.game ? (
                  <>
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
                  <div className="next-empty">
                    <div>No stream scheduled</div>
                    <span className="hint">Check back for updates</span>
                  </div>
                )}
              </>
            ) : (
              <div className="next-empty">Nothing left scheduled this month</div>
            )}
          </div>

          <div className="stats-card">
            <h3>This month</h3>
            <div className="stat-row"><span>Missions planned</span><strong>{missionsPlanned}</strong></div>
            <div className="stat-row"><span>Total slots</span><strong>{totalSlots}</strong></div>
            <div className="stat-row"><span>Slots open</span><strong>{slotsOpen}</strong></div>
          </div>
        </aside>
      </div>

      <footer className="site-footer">
        <span>Rated 16-bit</span>
        <div className="social-links">
          <a href={SOCIAL_LINKS.discord} target="_blank" rel="noreferrer">Discord</a>
          <a href={SOCIAL_LINKS.youtube} target="_blank" rel="noreferrer">YouTube</a>
          <a href={SOCIAL_LINKS.twitch} target="_blank" rel="noreferrer">Twitch</a>
        </div>
      </footer>
    </main>
  );
}
