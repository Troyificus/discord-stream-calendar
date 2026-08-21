'use client';

export default function Error({ error, reset }) {
  return (
    <main>
      <div className="admin-panel">
        <h2>Something went wrong</h2>
        <p style={{ color: '#f2b8b5' }}>{error?.message || 'Unknown error.'}</p>
        <button className="btn join" onClick={() => reset()}>Try again</button>
      </div>
    </main>
  );
}
