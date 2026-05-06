// Circuits index + Circuit detail

function CircuitsIndexScreen() {
  const F_cir = window.F1_DATA;
  const mob = useIsMobile();
  return (
    <div className={`page ${mob ? 'page-mob' : ''}`}>
      <div className="page-head">
        <div>
          <div className="t-eyebrow" style={{ marginBottom: 6 }}>{(window.F1_DATA && window.F1_DATA.seasonYear) || '2026'} Calendar</div>
          <h1 className="page-title">Circuits</h1>
          <div className="page-sub">{F_cir.calendar.length} venues · select a circuit to view profile</div>
        </div>
      </div>
      <div className="grid" style={{ gridTemplateColumns: mob ? '1fr' : 'repeat(auto-fill, minmax(260px, 1fr))' }}>
        {F_cir.calendar.map(race => {
          const c = F_cir.circuits[race.circuit] || { name: race.circuit, city: '—', country: '—', type: '—', length: 0, corners: 0, lapRecord: { time: '—' } };
          return (
            <a key={race.round} className="race-card"
               style={{ textDecoration: 'none', color: 'inherit' }}
               href={urlFor({ name: 'circuit', id: race.circuit })}>
              <div className="race-card-head">
                <div className="race-round">RD {String(race.round).padStart(2,'0')}{c.type && c.type !== '—' ? ` · ${c.type.toUpperCase()}` : ''}</div>
                <span style={{ fontSize: 18 }}>{race.flag}</span>
              </div>
              <div>
                <div className="race-name">{c.name.replace('Circuit', '').replace('Autodromo','').trim()}</div>
                <div className="race-circuit">{c.city}, {c.country}</div>
              </div>
              <div className="race-card-foot">
                {c.length ? <div className="race-mini-row"><span className="lbl">Length</span><span className="val">{c.length.toFixed(3)} km</span></div> : null}
                {c.corners ? <div className="race-mini-row"><span className="lbl">Corners</span><span className="val">{c.corners}</span></div> : null}
                {c.lapRecord && c.lapRecord.time !== '—' ? <div className="race-mini-row"><span className="lbl">Lap Record</span><span className="val">{c.lapRecord.time}</span></div> : null}
              </div>
            </a>
          );
        })}
      </div>
    </div>
  );
}

function CircuitDetailScreen() {
  const F_cir = window.F1_DATA;
  const mob = useIsMobile();
  const id = getParam('id');
  const circuit = F_cir.circuits[id];
  const race = F_cir.calendar.find(r => r.circuit === id);

  if (!circuit) {
    return (
      <div className={`page ${mob ? 'page-mob' : ''}`}>
        <Panel><div style={{ padding: 24 }}>Circuit not found.</div></Panel>
      </div>
    );
  }

  const ratingFill = { Low: 33, Medium: 66, High: 100 };
  // Skip rows whose underlying value is missing — historic circuits synthesized
  // from the API only have name/city/country, no length/corners/etc.
  const stats = [
    circuit.length && { lbl: 'Length', val: `${circuit.length.toFixed(3)} km`, type: 'val' },
    circuit.laps && { lbl: 'Laps', val: circuit.laps, type: 'val' },
    circuit.corners && { lbl: 'Corners', val: circuit.corners, type: 'val' },
    circuit.longestStraight && { lbl: 'Longest Straight', val: `${circuit.longestStraight} m`, type: 'val' },
    circuit.drsZones && { lbl: 'DRS Zones', val: circuit.drsZones, type: 'val' },
    circuit.type && circuit.type !== '—' && { lbl: 'Track Type', val: circuit.type, type: 'val' },
    ratingFill[circuit.tyreDeg] && { lbl: 'Tyre Degradation', val: circuit.tyreDeg, type: 'rating' },
    ratingFill[circuit.overtaking] && { lbl: 'Overtaking', val: circuit.overtaking, type: 'rating' },
  ].filter(Boolean);

  // Generate fake historical winners (last 5)
  const winnerPool = ['VER','HAM','LEC','NOR','PIA','RUS','ALO','SAI'];
  const historic = [];
  for (let y = 2025; y >= 2021; y--) {
    const wcode = winnerPool[(y * 7 + race.round) % winnerPool.length];
    const w = F_cir.driverById(wcode);
    historic.push({ year: y, driver: w, team: F_cir.teamById(w.team), time: `1:${30 + ((y * 3) % 10)}:${String((y * 7) % 60).padStart(2, '0')}.${String((y * 11) % 1000).padStart(3, '0')}` });
  }

  return (
    <div className={`page ${mob ? 'page-mob' : ''}`}>
      <a className="btn btn-ghost btn-sm" style={{ marginBottom: 12 }} href={urlFor({ name: 'circuits' })}>← Circuits</a>

      <div className="grid" style={{ gridTemplateColumns: mob ? '1fr' : '1.2fr 1fr', gap: 20 }}>
        <div>
          <div className="t-eyebrow" style={{ color: 'var(--accent)', marginBottom: 6 }}>Circuit Profile</div>
          <h1 className="page-title" style={{ fontSize: mob ? 32 : 42, marginBottom: 8 }}>{circuit.name}</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--fg-2)', marginBottom: 14 }}>
            <span style={{ fontSize: 18 }}>{race.flag}</span>
            <span className="t-mono" style={{ fontSize: 13 }}>{circuit.city.toUpperCase()}, {circuit.country.toUpperCase()}</span>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
            {circuit.firstYear ? <span className="pill">First F1: {circuit.firstYear}</span> : null}
            {circuit.races ? <span className="pill">{circuit.races} races held</span> : null}
            {circuit.weather && circuit.weather !== '—'
              ? <span className="pill" style={{ color: 'var(--accent)', borderColor: 'var(--accent)' }}>{circuit.weather}</span>
              : null}
          </div>
          <p style={{ color: 'var(--fg-2)', fontSize: 14, lineHeight: 1.6, textWrap: 'pretty' }}>{circuit.blurb}</p>
        </div>

        <div>
          <div className="image-placeholder" style={{ width: '100%', height: mob ? 200 : 280 }}>
            Circuit map / aerial<br />{circuit.name}
          </div>
        </div>
      </div>

      <SectionHead title="Track Characteristics" />
      <Panel>
        <div className="barset">
          {stats.map(s => (
            <div key={s.lbl} className="bar-row">
              <div className="bar-lbl">{s.lbl}</div>
              {s.type === 'rating' ? (
                <>
                  <div className="bar-track"><div className="bar-fill" style={{ width: `${ratingFill[s.val]}%`, background: s.val === 'High' ? 'var(--neg)' : s.val === 'Medium' ? 'var(--warn)' : 'var(--pos)' }}></div></div>
                  <div className={`bar-rating ${s.val.toLowerCase()}`}>{s.val}</div>
                </>
              ) : (
                <>
                  <div className="bar-track"><div className="bar-fill" style={{ width: '70%' }}></div></div>
                  <div className="bar-val t-mono">{s.val}</div>
                </>
              )}
            </div>
          ))}
        </div>
      </Panel>

      <div className="grid" style={{ gridTemplateColumns: mob ? '1fr' : '1fr 1fr', marginTop: 16, gap: 16 }}>
        {circuit.lapRecord && circuit.lapRecord.driver !== '—' ? (
          <div className="callout">
            <div className="callout-icon">◷</div>
            <div className="callout-body">
              <div className="callout-lbl">Lap Record</div>
              <div className="callout-driver">{circuit.lapRecord.driver}</div>
              <div className="callout-time">{circuit.lapRecord.time} · {circuit.lapRecord.year}</div>
            </div>
          </div>
        ) : null}
        <div className="stat">
          <div className="stat-lbl">Next Race</div>
          <div className="stat-val" style={{ fontSize: 22 }}>{race.name.replace(' Grand Prix','')}</div>
          <div className="stat-sub">{fmtDateLong(race.date)} · Round {race.round}</div>
        </div>
      </div>

      <SectionHead title="Historical Winners" />
      <Panel tight>
        <div className="tbl-wrap">
          <table className="tbl" style={{ minWidth: 480 }}>
            <thead>
              <tr><th>Year</th><th>Driver</th><th>Team</th><th className="right">Time</th></tr>
            </thead>
            <tbody>
              {historic.map(h => (
                <tr key={h.year}>
                  <td className="num t-mono" style={{ fontSize: 14 }}>{h.year}</td>
                  <td><DriverCell driver={h.driver} /></td>
                  <td>{h.team.name}</td>
                  <td className="right num t-mono">{h.time}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

window.CircuitsIndexScreen = CircuitsIndexScreen;
window.CircuitDetailScreen = CircuitDetailScreen;
