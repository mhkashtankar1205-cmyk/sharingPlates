import { useState } from 'react';
import { Link } from 'react-router';
import { api } from '../api.js';
import { useLive } from '../state.jsx';
import { ACCOUNT_LABEL, SOURCE_LABEL, copyText, dayClock, isUrgent, km, timeLeft } from '../util.js';
import { Avatar, FoodImage, FoodMark, Icon, StatusPill } from './ui.jsx';

export function PostActionButton({ post, onRequest }) {
  if (post.is_mine) {
    return (
      <Link className="insta-btn ghost" to={`/posts/${post.id}`}>
        Manage{post.pending > 0 && <span className="count">{post.pending}</span>}
      </Link>
    );
  }
  if (post.my_request === 'pending') return <Link className="insta-btn ghost" to={`/posts/${post.id}`}>Requested · waiting</Link>;
  if (post.my_request === 'accepted') return <Link className="insta-btn warn" to={`/posts/${post.id}`}>Ready · pickup details</Link>;
  if (post.my_request === 'completed') return <span className="insta-btn ghost static">Picked up</span>;
  if (!post.open) return <span className="insta-btn static">{post.status === 'claimed' ? 'Fully claimed' : 'Unavailable'}</span>;
  return (
    <button className="insta-btn primary" onClick={() => onRequest(post)}>
      <Icon name="bowl" size={18} />
      Request food
    </button>
  );
}

/** Instagram-style feed card for one food post. */
export function PostCard({ post, now, onRequest, onChange }) {
  const { toast } = useLive();
  const [saved, setSaved] = useState(false);
  const [showHeartAnim, setShowHeartAnim] = useState(false);
  const urgent = isUrgent(post, now);

  async function like() {
    onChange({ ...post, liked: !post.liked, likes: post.likes + (post.liked ? -1 : 1) });
    try {
      const r = await api(`/posts/${post.id}/like`, { method: 'POST' });
      onChange({ ...post, liked: r.liked, likes: r.likes });
    } catch (e) {
      onChange(post);
      toast(e.message, { tone: 'urgent' });
    }
  }

  function handleDoubleTap() {
    if (!post.liked) like();
    setShowHeartAnim(true);
    setTimeout(() => setShowHeartAnim(false), 800);
  }

  async function share() {
    const ok = await copyText(`${location.origin}/posts/${post.id}`);
    toast(ok ? 'Link copied — share it with someone who can use this food.' : 'Could not copy the link.');
  }

  function toggleSave() {
    setSaved(!saved);
    toast(!saved ? 'Saved post to your bookmarks.' : 'Removed from bookmarks.');
  }

  return (
    <article className="insta-card">
      <header className="insta-card-head">
        <div className={`insta-avatar-wrap ${urgent ? 'urgent-ring' : ''}`}>
          <Avatar name={post.provider.name} size={36} />
        </div>
        <div className="insta-card-who">
          <div className="insta-user-row">
            <span className="insta-username">{post.is_mine ? 'You' : post.provider.name}</span>
            <Icon name="verified" size={14} className="insta-verified" />
            <span className="insta-dot">·</span>
            <span className="insta-account-type">{ACCOUNT_LABEL[post.provider.account_type]}</span>
          </div>
          <small className="insta-location">
            <Icon name="pin" size={12} /> {post.locality || 'Nearby'}
          </small>
        </div>
        <div className="insta-card-head-right">
          {urgent && post.status !== 'requested' ? <StatusPill status="urgent" label="Urgent" /> : <StatusPill status={post.status} />}
          <Link to={`/posts/${post.id}`} className="icon-btn insta-more-btn" aria-label="More options">
            <Icon name="dots" size={18} />
          </Link>
        </div>
      </header>

      <div className="insta-card-media" onDoubleClick={handleDoubleTap}>
        <Link to={`/posts/${post.id}`} aria-label={`Open ${post.title}`}>
          <FoodImage post={post} />
        </Link>
        {showHeartAnim && (
          <div className="insta-heart-anim">
            <Icon name="heart" size={72} />
          </div>
        )}
        <div className="media-chips">
          <span className="chip-o">
            <FoodMark type={post.food_type} />
          </span>
          <span className={`chip-o ${urgent ? 'hot' : ''}`}>
            <Icon name="clock" size={14} />
            {timeLeft(post.available_until, now)}
          </span>
        </div>
      </div>

      <div className="insta-card-body">
        <div className="insta-actions">
          <button className={`icon-btn like ${post.liked ? 'on' : ''}`} onClick={like} aria-pressed={post.liked} aria-label="Appreciate this post">
            <Icon name="heart" size={24} />
          </button>
          <button className="icon-btn" onClick={() => onRequest?.(post)} aria-label="Request food">
            <Icon name="bowl" size={24} />
          </button>
          <button className="icon-btn" onClick={share} aria-label="Share post link">
            <Icon name="share" size={22} />
          </button>
          <span className="grow" />
          <button className={`icon-btn ${saved ? 'saved' : ''}`} onClick={toggleSave} aria-label="Bookmark post">
            <Icon name="bookmark" size={22} />
          </button>
        </div>

        <div className="insta-likes-line">
          <b>{post.likes === 0 ? 'Be the first to appreciate this' : `Liked by ${post.likes} ${post.likes === 1 ? 'person' : 'people'}`}</b>
        </div>

        <div className="insta-caption">
          <span className="insta-caption-user">{post.is_mine ? 'You' : post.provider.name}</span>{' '}
          <Link to={`/posts/${post.id}`} className="insta-caption-title">{post.title}</Link>
          {post.description && <p className="insta-caption-text">{post.description}</p>}
        </div>

        <div className="insta-meta-tags">
          <span className="meta-tag highlight">
            <Icon name="bowl" size={14} /> <b>{post.remaining}</b> / {post.quantity} meals left
          </span>
          {post.distance_km != null && (
            <span className="meta-tag">
              <Icon name="pin" size={14} /> {post.is_mine ? 'Your post' : km(post.distance_km)}
            </span>
          )}
          <span className={`meta-tag ${urgent ? 'urgent-tag' : ''}`}>
            <Icon name="clock" size={14} /> Until {dayClock(post.available_until, now)}
          </span>
          <span className="meta-tag muted-tag">{SOURCE_LABEL[post.source]}</span>
        </div>

        <div className="insta-cta-row">
          <PostActionButton post={post} onRequest={onRequest} />
        </div>
      </div>
    </article>
  );
}

