import { useEffect, useRef, useState } from 'react';
import { rpc, type ProfileHit } from '../lib/rpc';
import { errorText } from '../lib/errors';

// Search-by-username picker (replaces "find a user's id" SQL). Calls onPick with the chosen profile.
export function UserPicker({
  onPick,
  placeholder = 'Search username…',
  excludeIds = [],
}: {
  onPick: (p: ProfileHit) => void;
  placeholder?: string;
  excludeIds?: string[];
}) {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<ProfileHit[]>([]);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setHits([]);
      return;
    }
    const my = ++seq.current;
    const t = setTimeout(() => {
      rpc
        .searchProfiles(term)
        .then((r) => {
          if (my === seq.current) {
            setHits(r);
            setError(null);
          }
        })
        .catch((e) => {
          if (my === seq.current) setError(errorText(e));
        });
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  const shown = hits.filter((h) => !excludeIds.includes(h.id));

  return (
    <div className="picker">
      <input
        value={q}
        placeholder={placeholder}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && (error || q.trim().length >= 2) && (
        <div className="picker-list">
          {error && <div className="picker-item error">{error}</div>}
          {!error && shown.length === 0 && <div className="picker-item muted">No users found</div>}
          {shown.map((h) => (
            <button
              type="button"
              key={h.id}
              className="picker-item"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onPick(h);
                setQ('');
                setHits([]);
                setOpen(false);
              }}
            >
              {h.avatar_url ? <img className="avatar" src={h.avatar_url} alt="" /> : <span className="avatar" />}
              <span>{h.username}</span>
              {h.platform_role && <span className="chip">{h.platform_role.replace('_', ' ')}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
