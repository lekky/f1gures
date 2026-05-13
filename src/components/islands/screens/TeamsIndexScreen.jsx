import { useState } from 'react';
import { MiniChart, SectionHead, urlFor, TeamLogo, useIsMobile } from '../../../lib/shared.jsx';
import { filterItems, sortItems, paginateItems } from '../../../lib/listingUtils.js';

const PAGE_SIZE = 24;
const SORT_FIELDS = [
  { key: 'name',          label: 'Name' },
  { key: 'nationality',   label: 'Nationality' },
  { key: 'firstYear',     label: 'First Year' },
  { key: 'championships', label: 'Titles' },
  { key: 'wins',          label: 'Wins' },
];

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

function FeatureCard({ team }) {
  const teamColor = team.color || 'var(--accent)';
  return (
    <a
      href={urlFor({ name: 'team', ref: team.constructorRef })}
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        padding: 20,
        border: '1px solid var(--line-1)',
        borderLeft: `4px solid ${teamColor}`,
        background: 'var(--bg-2)',
        textDecoration: 'none',
        color: 'inherit',
        minHeight: 160,
        gap: 14,
      }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <TeamLogo team={team} size={64} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="t-eyebrow" style={{ color: teamColor, marginBottom: 2 }}>
            {team.nationality}
          </div>
          <div style={{ fontFamily: 'var(--f-display)', fontWeight: 800, fontSize: 22, letterSpacing: '0.02em', textTransform: 'uppercase', lineHeight: 1.05, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {team.name}
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 20, marginTop: 'auto' }}>
        <div>
          <div className="t-eyebrow" style={{ fontSize: 10, color: 'var(--fg-3)' }}>Titles</div>
          <div style={{ fontFamily: 'var(--f-display)', fontWeight: 800, fontSize: 30, lineHeight: 1, color: team.championships > 0 ? 'var(--accent)' : 'var(--fg-1)' }}>
            {team.championships}
          </div>
        </div>
        <div>
          <div className="t-eyebrow" style={{ fontSize: 10, color: 'var(--fg-3)' }}>Wins</div>
          <div style={{ fontFamily: 'var(--f-display)', fontWeight: 800, fontSize: 30, lineHeight: 1 }}>
            {team.wins}
          </div>
        </div>
        {team.last5?.length > 0 && (
          <div>
            <div className="t-eyebrow" style={{ fontSize: 10, color: 'var(--fg-3)', marginBottom: 4 }}>Last {team.last5.length}</div>
            <MiniChart values={team.last5.map(r => r.points)} color={teamColor} width={110} height={28} />
          </div>
        )}
      </div>
    </a>
  );
}

function CompactRow({ team, mob }) {
  const teamColor = team.color || 'var(--accent)';
  return (
    <a
      href={urlFor({ name: 'team', ref: team.constructorRef })}
      style={{
        display: 'grid',
        gridTemplateColumns: mob ? '40px 1fr auto' : '48px minmax(0, 2fr) minmax(0, 1fr) auto',
        alignItems: 'center',
        gap: mob ? 10 : 16,
        padding: mob ? '10px 12px' : '12px 16px',
        borderTop: '1px solid var(--line-1)',
        borderLeft: `3px solid ${teamColor}`,
        textDecoration: 'none',
        color: 'inherit',
        background: 'var(--bg-2)',
      }}>
      <div style={{ width: mob ? 40 : 48, height: mob ? 40 : 48, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <TeamLogo team={team} size={mob ? 40 : 48} />
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontFamily: 'var(--f-display)', fontWeight: 700, fontSize: 15, letterSpacing: '0.02em', textTransform: 'uppercase', lineHeight: 1.1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {team.name}
        </div>
        <div style={{ fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--fg-3)', marginTop: 2, letterSpacing: '0.05em' }}>
          {team.nationality} · {team.firstYear}–{team.lastYear}
        </div>
      </div>
      {!mob ? (
        <div style={{ fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--fg-3)', letterSpacing: '0.05em' }}>
          {team.wins} wins
        </div>
      ) : null}
      <div style={{ textAlign: 'right', minWidth: 50 }}>
        <div style={{ fontFamily: 'var(--f-display)', fontWeight: 800, fontSize: 20, lineHeight: 1, color: team.championships > 0 ? 'var(--accent)' : 'var(--fg-1)' }}>
          {team.championships}
        </div>
        <div className="t-eyebrow" style={{ fontSize: 9, color: 'var(--fg-3)', marginTop: 3 }}>Titles</div>
      </div>
    </a>
  );
}

export default function TeamsIndexScreen({ teams }) {
  const mob = useIsMobile();
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState('championships');
  const [sortDir, setSortDir] = useState('desc');
  const [page, setPage] = useState(1);

  const currentYear = new Date().getFullYear();
  const currentTeams = teams
    .filter(t => t.lastYear >= currentYear)
    .sort((a, b) => b.championships - a.championships || b.wins - a.wins);

  const filtered = filterItems(teams, { search });
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
          <h1 className="page-title">Teams</h1>
          <div className="page-sub">{teams.length} constructors · all time</div>
        </div>
      </div>

      {currentTeams.length > 0 && (
        <>
          <SectionHead title={`${currentYear} Grid`} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 12, marginBottom: 28 }}>
            {currentTeams.map(team => <FeatureCard key={team.constructorRef} team={team} />)}
          </div>
        </>
      )}

      <SectionHead title="All Teams" />

      <div className="listing-controls">
        <input
          type="search"
          placeholder="Search teams…"
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
        {items.map(team => <CompactRow key={team.constructorRef} team={team} mob={mob} />)}
      </div>

      {totalPages > 1 && <Pagination page={page} totalPages={totalPages} onPage={setPage} />}
    </div>
  );
}
