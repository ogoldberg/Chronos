import { useState } from 'react';

/**
 * Upvote/downvote widget for discovered events.
 * Posts to /api/community/vote. Requires auth.
 */
export default function EventVoting({ eventId }: { eventId: string }) {
  const [votes, setVotes] = useState(0);
  const [userVote, setUserVote] = useState<1 | -1 | 0>(0);
  const [submitting, setSubmitting] = useState(false);

  const castVote = async (vote: 1 | -1) => {
    if (submitting) return;
    const newVote = userVote === vote ? 0 : vote;
    setSubmitting(true);
    try {
      const res = await fetch('/api/community/vote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId, vote: newVote === 0 ? -userVote : vote }),
      });
      if (res.ok) {
        const data = await res.json();
        setVotes(data.netVotes ?? votes + (newVote - userVote));
        setUserVote(newVote);
      }
    } catch { /* ignore */ }
    setSubmitting(false);
  };

  return (
    <div style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      background: 'rgba(255,255,255,0.06)',
      borderRadius: 8,
      padding: '4px 8px',
      fontSize: 12,
    }}>
      <button
        onClick={() => castVote(1)}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          fontSize: 14,
          padding: '0 2px',
          color: userVote === 1 ? '#22c55e' : '#ffffff50',
          transition: 'color 0.2s',
        }}
        aria-label="Upvote"
      >
        ▲
      </button>
      <span style={{
        color: votes > 0 ? '#22c55e' : votes < 0 ? '#ef4444' : '#ffffff60',
        fontWeight: 600,
        fontSize: 11,
        minWidth: 16,
        textAlign: 'center',
      }}>
        {votes}
      </span>
      <button
        onClick={() => castVote(-1)}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          fontSize: 14,
          padding: '0 2px',
          color: userVote === -1 ? '#ef4444' : '#ffffff50',
          transition: 'color 0.2s',
        }}
        aria-label="Downvote"
      >
        ▼
      </button>
    </div>
  );
}
