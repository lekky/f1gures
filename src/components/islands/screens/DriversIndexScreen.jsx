import { useState } from 'react';
import { MiniChart, SectionHead, urlFor, useIsMobile } from '../../../lib/shared.jsx';
import { filterItems, sortItems, paginateItems } from '../../../lib/listingUtils.js';

const PAGE_SIZE = 24;
const SORT_FIELDS = [
  { key: 'surname',       label: 'Name' },
  { key: 'nationality',   label: 'Nationality' },
  { key: 'firstYear',     label: 'First Year' },
  { key: 'championships', label: 'Titles' },
  { key: 'wins',          label: 'Wins' },
];

function DriverPhoto({ driverRef, size = 52, round = true }) {
  const [failed, setFailed] = useState(false);
  const dim = { width: size, height: size, flexShrink: 0 };
  if (failed || !driverRef) {
    return <div style={{ ...dim, borderRadius: round ? '50%' : 6, background: 'var(--bg-3)' }} />;
  }
  return (
    <img
      src={`/images/drivers/${driverRef}.webp`}
      width={size}
      height={size}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
      style={{ ...dim, borderRadius: round ? '50%' : 6, objectFit: 'cover' }}
    />
  );
}

function Pagination({ page, totalPages, onPage }) {
  const pages = Array.from({ length: totalPages }, (_, i) => i + 1);
  const visible = pages.filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 2);
  return (
    <div className="pagination">
      <button className="page-btn" onClick={() => onPage(page - 1)} disabled={page === 1}>←</button>
      {visible.map((p, i) => {
        const prev = visible[i - 1];
        return (
          <span key={p}>
            {prev && p - prev > 1 && <span style={{ padding: '0 4px', color: 'var(--fg-3)' }}>…</span>}
            <button className={`page-btn${p === page ? ' active' : ''}`} onClick={() => onPage(p)}>{p}</button>
          </span>
        );
      })}
      <button className="page-btn" onClick={() => onPage(page + 1)} disabled={page === totalPages}>→</button>
    </div>
  );
}

function FeatureCard({ driver }) {
  const color = driver.teamColor || 'var(--accent)';
  return (
    <a
      className="f1-card-link"
      href={urlFor({ name: 'driver', ref: driver.driverRef })}
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        padding: 20,
        border: '1px solid var(--line-1)',
        borderLeft: `4px solid ${color}`,
        background: 'var(--bg-2)',
        textDecoration: 'none',
        color: 'inherit',
        minHeight: 160,
        gap: 14,
      }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <DriverPhoto driverRef={driver.driverRef} size={64} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="t-eyebrow" style={{ color, marginBottom: 2 }}>
            {driver.teamName || driver.nationality}
          </div>
          <div style={{ fontFamily: 'var(--f-display)', fontWeight: 800, fontSize: 22, letterSpacing: '0.02em', textTransform: 'uppercase', lineHeight: 1.05, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {driver.forename} {driver.surname}
          </div>
          {driver.number != null && (
            <div style={{ fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--fg-3)', marginTop: 3, letterSpacing: '0.06em' }}>
              #{driver.number} · {driver.nationality}
            </div>
          )}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 20, marginTop: 'auto' }}>
        <div>
          <div className="t-eyebrow" style={{ fontSize: 10, color: 'var(--fg-3)' }}>Titles</div>
          <div style={{ fontFamily: 'var(--f-display)', fontWeight: 800, fontSize: 30, lineHeight: 1, color: driver.championships > 0 ? 'var(--accent)' : 'var(--fg-1)' }}>
            {driver.championships}
          </div>
        </div>
        <div>
          <div className="t-eyebrow" style={{ fontSize: 10, color: 'var(--fg-3)' }}>Wins</div>
          <div style={{ fontFamily: 'var(--f-display)', fontWeight: 800, fontSize: 30, lineHeight: 1 }}>
            {driver.wins}
          </div>
        </div>
        {driver.last5?.length > 0 && (
          <div>
            <div className="t-eyebrow" style={{ fontSize: 10, color: 'var(--fg-3)', marginBottom: 4 }}>Last {driver.last5.length}</div>
            <MiniChart values={driver.last5.map(r => r.points)} color={color} width={110} height={28} />
          </div>
        )}
      </div>
    </a>
  );
}

function CompactRow({ driver, mob }) {
  const color = driver.teamColor || 'var(--accent)';
  return (
    <a
      className="f1-row-link"
      href={urlFor({ name: 'driver', ref: driver.driverRef })}
      style={{
        display: 'grid',
        gridTemplateColumns: mob ? '40px 1fr auto' : '48px minmax(0, 2fr) minmax(0, 1fr) auto',
        alignItems: 'center',
        gap: mob ? 10 : 16,
        padding: mob ? '10px 12px' : '12px 16px',
        borderTop: '1px solid var(--line-1)',
        borderLeft: `3px solid ${color}`,
        textDecoration: 'none',
        color: 'inherit',
        background: 'var(--bg-2)',
      }}>
      <div style={{ width: mob ? 40 : 48, height: mob ? 40 : 48, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <DriverPhoto driverRef={driver.driverRef} size={mob ? 40 : 48} />
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontFamily: 'var(--f-display)', fontWeight: 700, fontSize: 15, letterSpacing: '0.02em', textTransform: 'uppercase', lineHeight: 1.1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {driver.forename} {driver.surname}
        </div>
        <div style={{ fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--fg-3)', marginTop: 2, letterSpacing: '0.05em' }}>
          {driver.nationality} · {driver.firstYear}–{driver.lastYear}
        </div>
      </div>
      {!mob ? (
        <div style={{ fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--fg-3)', letterSpacing: '0.05em' }}>
          {driver.wins} wins
        </div>
      ) : null}
      <div style={{ textAlign: 'right', minWidth: 50 }}>
        <div style={{ fontFamily: 'var(--f-display)', fontWeight: 800, fontSize: 20, lineHeight: 1, color: driver.championships > 0 ? 'var(--accent)' : 'var(--fg-1)' }}>
          {driver.championships}
        </div>
        <div className="t-eyebrow" style={{ fontSize: 9, color: 'var(--fg-3)', marginTop: 3 }}>Titles</div>
      </div>
    </a>
  );
}

export default function DriversIndexScreen({ drivers }) {
  const mob = useIsMobile();
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState('championships');
  const [sortDir, setSortDir] = useState('desc');
  const [page, setPage] = useState(1);

  const currentYear = new Date().getFullYear();
  const currentDrivers = drivers
    .filter(d => d.lastYear >= currentYear)
    .sort((a, b) => b.championships - a.championships || b.wins - a.wins);

  const filtered = filterItems(drivers, { search });
  const sorted = (() => {
    if (sortField === 'championships') {
      const mult = sortDir === 'desc' ? 1 : -1;
      return [...filtered].sort((a, b) => {
        const cd = (b.championships - a.championships) * mult;
        return cd !== 0 ? cd : b.wins - a.wins;
      });
    }
    return sortItems(filtered, { field: sortField, dir: sortDir });
  })();
  const { items, totalPages } = paginateItems(sorted, { page, pageSize: PAGE_SIZE });

  function handleSort(field) {
    if (sortField === field) {
      if (sortDir === 'desc') setSortDir('asc');
      else { setSortField('championships'); setSortDir('desc'); }
    } else {
      setSortField(field);
      setSortDir('desc');
    }
    setPage(1);
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Drivers</h1>
          <div className="page-sub">{drivers.length} drivers · all time</div>
        </div>
      </div>

      {currentDrivers.length > 0 && (
        <>
          <SectionHead title={`${currentYear} Grid`} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 12, marginBottom: 28 }}>
            {currentDrivers.map(driver => <FeatureCard key={driver.driverRef} driver={driver} />)}
          </div>
        </>
      )}

      <SectionHead title="All Drivers" />

      <div className="listing-controls">
        <input
          type="search"
          placeholder="Search drivers…"
          value={search}
          onInput={e => { setSearch(e.target.value); setPage(1); }}
        />
      </div>

      <div className="sort-bar">
        <span className="sort-bar-label">Sort by</span>
        <div className="sort-group">
          {SORT_FIELDS.map(({ key, label }) => (
            <button
              key={key}
              className={`sort-btn${sortField === key ? ' active' : ''}`}
              onClick={() => handleSort(key)}
            >
              {label}{sortField === key && <span className="sort-arrow">{sortDir === 'desc' ? '↓' : '↑'}</span>}
            </button>
          ))}
        </div>
      </div>

      <p className="result-count">Showing {Math.min(page * PAGE_SIZE, sorted.length)} of {sorted.length}</p>

      <div style={{ marginBottom: 24, border: '1px solid var(--line-1)', borderTopWidth: 0 }}>
        {items.map(driver => <CompactRow key={driver.driverRef} driver={driver} mob={mob} />)}
      </div>

      {totalPages > 1 && <Pagination page={page} totalPages={totalPages} onPage={setPage} />}
    </div>
  );
}
