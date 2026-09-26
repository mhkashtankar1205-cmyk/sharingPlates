import { useEffect, useState } from 'react';
import L from 'leaflet';
import { Circle, MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import { Icon } from './ui.jsx';
import { currentPosition } from '../util.js';

const TILES = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
export const DEFAULT_CENTER = { lat: 12.9352, lng: 77.6245 };

const youIcon = L.divIcon({ className: 'map-you', html: '<span></span>', iconSize: [18, 18] });

function foodIcon(post, selected) {
  const tone = !post.open ? 'muted' : post.urgent ? 'urgent' : 'good';
  const label = post.open ? post.remaining : '✓';
  return L.divIcon({
    className: `map-pin ${tone} ${selected ? 'selected' : ''}`,
    html: `<span><b>${label}</b></span>`,
    iconSize: [34, 42],
    iconAnchor: [17, 40],
  });
}

function Recenter({ center, zoom }) {
  const map = useMap();
  useEffect(() => {
    if (center) map.setView([center.lat, center.lng], zoom ?? map.getZoom());
  }, [center?.lat, center?.lng]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

/** Keeps the whole search radius in view. */
function FitRadius({ center, radiusKm }) {
  const map = useMap();
  useEffect(() => {
    map.fitBounds(L.latLng(center.lat, center.lng).toBounds(radiusKm * 2000), { padding: [12, 12] });
  }, [center.lat, center.lng, radiusKm]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

/** Map of food posts around an origin, with the viewer's alert radius. */
export function FoodMap({ origin, radiusKm, posts, selectedId, onSelect, height = 340 }) {
  const center = origin || DEFAULT_CENTER;
  return (
    <div className="map" style={{ height }}>
      <MapContainer center={[center.lat, center.lng]} zoom={13} scrollWheelZoom={false} style={{ height: '100%' }}>
        <TileLayer url={TILES} attribution={ATTRIBUTION} />
        <FitRadius center={center} radiusKm={radiusKm} />
        {radiusKm && <Circle center={[center.lat, center.lng]} radius={radiusKm * 1000} className="map-radius" interactive={false} />}
        <Marker position={[center.lat, center.lng]} icon={youIcon} interactive={false} />
        {posts.map((p) => (
          <Marker
            key={p.id}
            position={[p.lat, p.lng]}
            icon={foodIcon(p, p.id === selectedId)}
            zIndexOffset={p.id === selectedId ? 1000 : 0}
            eventHandlers={{ click: () => onSelect?.(p.id) }}
            title={p.title}
          />
        ))}
      </MapContainer>
    </div>
  );
}

/** Single pickup point. When `approximate`, shows a 150 m circle instead of an exact pin. */
export function PickupMap({ post, approximate, height = 220 }) {
  return (
    <div className="map" style={{ height }}>
      <MapContainer center={[post.lat, post.lng]} zoom={15} scrollWheelZoom={false} style={{ height: '100%' }}>
        <TileLayer url={TILES} attribution={ATTRIBUTION} />
        {approximate ? (
          <Circle center={[post.lat, post.lng]} radius={150} className="map-approx" interactive={false} />
        ) : (
          <Marker position={[post.lat, post.lng]} icon={foodIcon({ ...post, urgent: false }, true)} />
        )}
      </MapContainer>
    </div>
  );
}

function ClickToPlace({ onPick }) {
  useMapEvents({ click: (e) => onPick({ lat: e.latlng.lat, lng: e.latlng.lng }) });
  return null;
}

/** Pick a location by tapping the map or using the device location. */
export function LocationPicker({ value, onChange, height = 240, hint = 'Tap the map to place the pin, or drag it.' }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [focus, setFocus] = useState(value || DEFAULT_CENTER);
  const point = value || DEFAULT_CENTER;

  async function locate() {
    setBusy(true);
    setError(null);
    try {
      const pos = await currentPosition();
      onChange(pos);
      setFocus(pos);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="picker">
      <div className="map" style={{ height }}>
        <MapContainer center={[point.lat, point.lng]} zoom={15} scrollWheelZoom={false} style={{ height: '100%' }}>
          <TileLayer url={TILES} attribution={ATTRIBUTION} />
          <Recenter center={focus} />
          <ClickToPlace onPick={onChange} />
          <Marker
            position={[point.lat, point.lng]}
            draggable
            icon={foodIcon({ open: true, remaining: '', urgent: false }, true)}
            eventHandlers={{ dragend: (e) => onChange(e.target.getLatLng()) }}
          />
        </MapContainer>
      </div>
      <div className="picker-bar">
        <span className="hint">{hint}</span>
        <button type="button" className="btn ghost sm" onClick={locate} disabled={busy}>
          <Icon name="locate" size={16} />
          {busy ? 'Locating…' : 'Use my location'}
        </button>
      </div>
      {error && <p className="field-error">{error}</p>}
    </div>
  );
}
