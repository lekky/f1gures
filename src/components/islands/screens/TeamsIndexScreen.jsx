import { useState } from 'react';
import { MiniChart, urlFor } from '../../../lib/shared.jsx';
import { filterItems, sortItems, paginateItems, uniqueNationalities } from '../../../lib/listingUtils.js';

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

export default function TeamsIndexScreen({ teams }) {
  const [search, setSearch] = useState('');
  const [nationality, setNationality] = useState('');
  const [sortField, setSortField] = useState('championships');
  const [sortDir, setSortDir] = useState('desc');
  const [page, setPage] = useState(1);

  const nationalities = uniqueNationalities(teams);
  const filtered = filterItems(teams, { search, nationality });
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

  const currentYear = new Date().getFullYear();

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

      <div className="listing-controls">
        <input
          type="search"
          placeholder="Search teams…"
          value={search}
          onInput={e => { setSearch(e.target.value); setPage(1); }}
        />
        <select value={nationality} onChange={e => { setNationality(e.target.value); setPage(1); }}>
          <option value="">All nationalities</option>
          {nationalities.map(n => <option key={n} value={n}>{n}</option>)}
        </select>
      </div>

      <div className="sort-bar">
        {SORT_FIELDS.map(({ key, label }) => (
          <button
            key={key}
            className={`sort-btn${sortField === key ? ' active' : ''}`}
            onClick={() => handleSort(key)}
          >
            {label}{sortField === key ? (sortDir === 'desc' ? ' ↓' : ' ↑') : ''}
          </button>
        ))}
      </div>

      <p className="result-count">Showing {Math.min(page * PAGE_SIZE, sorted.length)} of {sorted.length}</p>

      <div className="teams-grid">
        {items.map(team => {
          const lastYear = team.lastYear >= currentYear ? 'present' : team.lastYear;
          const activeYears = team.firstYear === team.lastYear
            ? String(team.firstYear)
            : `${team.firstYear}–${lastYear}`;
          return (
            <a
              key={team.constructorRef}
              className="listing-card"
              href={urlFor({ name: 'team', ref: team.constructorRef })}
              style={{ borderLeftWidth: 4, borderLeftColor: team.color || 'var(--accent)' }}
            >
              <div className="listing-card-head">
                <div className="listing-team-bar" style={{ background: team.color || 'var(--accent)' }} />
                <div>
                  <div className="listing-card-name">{team.name}</div>
                  <div className="listing-card-sub">{team.nationality}</div>
                </div>
              </div>
              <div className="listing-card-sub">{activeYears}</div>
              <div className="listing-stats">
                <span><span className="lbl">🏆</span><span className="val">{team.championships}</span></span>
                <span><span className="lbl">🏁</span><span className="val">{team.wins}</span></span>
              </div>
              {team.last5?.length > 0 && (
                <MiniChart
                  values={team.last5.map(r => r.points)}
                  color={team.color || 'var(--accent)'}
                  width={70}
                  height={20}
                />
              )}
            </a>
          );
        })}
      </div>

      {totalPages > 1 && <Pagination page={page} totalPages={totalPages} onPage={setPage} />}
    </div>
  );
}
