import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useLive } from '../state.jsx';
import { km, timeLeft } from '../util.js';
import { Icon, Sheet } from './ui.jsx';

/** Receiver picks how many meals they need and sends the request to the provider. */
export function RequestSheet({ post, open, onClose, onSent }) {
  const { toast } = useLive();
  const max = post?.remaining ?? 1;
  const [quantity, setQuantity] = useState(1);
  const [people, setPeople] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (open) {
      setQuantity(Math.min(10, max));
      setPeople('');
      setNote('');
      setError(null);
    }
  }, [open, max]);

  if (!post) return null;
  const step = (d) => setQuantity((q) => Math.max(1, Math.min(max, q + d)));

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { request } = await api(`/posts/${post.id}/requests`, {
        method: 'POST',
        body: { quantity, people: people || quantity, note },
      });
      toast(`Request sent for ${quantity} meals. You'll be notified when ${post.provider.name} accepts.`);
      onSent?.(request);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="Request food">
      <form onSubmit={submit} className="stack">
        <p className="muted">
          {post.title} · {post.provider.name}
          {post.distance_km != null && <> · <span className="mono">{km(post.distance_km)}</span></>} · {timeLeft(post.available_until)}
        </p>

        <div className="stepper" role="group" aria-label="Meals needed">
          <button type="button" onClick={() => step(-5)} disabled={quantity <= 1} aria-label="5 fewer meals">
            −5
          </button>
          <button type="button" onClick={() => step(-1)} disabled={quantity <= 1} aria-label="1 fewer meal">
            −
          </button>
          <label className="stepper-value">
            <input
              id="req-qty"
              type="number"
              inputMode="numeric"
              min="1"
              max={max}
              value={quantity}
              onChange={(e) => setQuantity(Math.max(1, Math.min(max, Number(e.target.value) || 1)))}
            />
            <small>of {max} meals left</small>
          </label>
          <button type="button" onClick={() => step(1)} disabled={quantity >= max} aria-label="1 more meal">
            +
          </button>
          <button type="button" onClick={() => step(5)} disabled={quantity >= max} aria-label="5 more meals">
            +5
          </button>
        </div>

        <label className="field">
          <span>People this will feed</span>
          <input id="req-people" type="number" min="1" inputMode="numeric" placeholder={String(quantity)} value={people} onChange={(e) => setPeople(e.target.value)} />
        </label>
        <label className="field">
          <span>Note to the provider (optional)</span>
          <textarea id="req-note" rows="2" maxLength={300} placeholder="e.g. We'll bring our own containers and can come in 20 minutes." value={note} onChange={(e) => setNote(e.target.value)} />
        </label>

        {error && <p className="field-error">{error}</p>}
        <div className="row-btns">
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn grow" disabled={busy}>
            <Icon name="send" size={18} />
            {busy ? 'Sending…' : `Request ${quantity} meals`}
          </button>
        </div>
        <p className="fine">The exact pickup address is shared once the provider accepts.</p>
      </form>
    </Sheet>
  );
}
