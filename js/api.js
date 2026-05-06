// f1gures — live data loader from the Jolpica F1 API.
//
// Runs after data.js. data.js has already populated window.F1_DATA with the
// bundled fallback. We now try to fetch the current season from Jolpica and
// REPLACE window.F1_DATA with live data. window.F1_READY resolves either way,
// so pages can render against whichever F1_DATA is current.
//
// Strategy:
//   1. Fetch the season schedule, drivers, constructors, driver standings.
//   2. Determine which rounds are completed (race date < today).
//   3. Fetch results / qualifying / sprint per completed round in parallel.
//   4. Reshape everything into the F1_DATA contract data.js already exposes.
//   5. Merge the static circuit characteristics from data.js (length, corners,
//      lap record, blurb — Jolpica doesn't carry these).
//   6. Replace window.F1_DATA and resolve.
//
// On any failure we keep the bundled fallback. The site stays functional offline.
//
// Cache: each unique endpoint URL is cached in localStorage with a 1-hour TTL
// so navigation between pages doesn't re-hit the API.
//
// Pass ?offline=1 in the URL to skip the API entirely (always use the fallback).

(function () {
  // Default Jolpica F1 base. Can be overridden by:
  //   - <body data-api="https://your-proxy.example.com/ergast/f1">
  //   - window.F1_API_BASE = '...' before window.F1_READY resolves
  // Useful if you want to proxy the API through your own server, or for testing.
  const DEFAULT_BASE = 'https://api.jolpi.ca/ergast/f1';
  function pickBase() {
    if (typeof window !== 'undefined' && typeof window.F1_API_BASE === 'string' && window.F1_API_BASE) {
      return window.F1_API_BASE.replace(/\/+$/, '');
    }
    if (typeof document !== 'undefined' && document.body) {
      const attr = document.body.getAttribute('data-api');
      if (attr) return attr.replace(/\/+$/, '');
    }
    return DEFAULT_BASE;
  }
  const TTL_MS = 60 * 60 * 1000;
  const CACHE_PREFIX = 'f1gures.api.v1.';

  // ---------- localStorage cache (gracefully no-op if unavailable) ----------
  function cacheGet(key) {
    try {
      const raw = localStorage.getItem(CACHE_PREFIX + key);
      if (!raw) return null;
      const obj = JSON.parse(raw);
      if (!obj || typeof obj.t !== 'number') return null;
      if (Date.now() - obj.t > TTL_MS) return null;
      return obj.v;
    } catch (e) { return null; }
  }
  function cacheSet(key, value) {
    try {
      localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ t: Date.now(), v: value }));
    } catch (e) { /* quota or private mode — fine */ }
  }
  async function fetchJSON(path) {
    const cached = cacheGet(path);
    if (cached) return cached;
    const res = await fetch(pickBase() + path, { headers: { 'Accept': 'application/json' } });
    if (!res.ok) throw new Error('Jolpica ' + path + ' returned HTTP ' + res.status);
    const json = await res.json();
    cacheSet(path, json);
    return json;
  }

  // ---------- ID translations (Jolpica → our domain) ----------
  // Jolpica constructorId → the team id we use internally
  const TEAM_ID_MAP = {
    mclaren: 'mclaren',
    ferrari: 'ferrari',
    mercedes: 'mercedes',
    red_bull: 'redbull',
    aston_martin: 'aston',
    alpine: 'alpine',
    williams: 'williams',
    rb: 'rb',
    racing_bulls: 'rb',
    sauber: 'sauber',
    haas: 'haas',
  };

  // Driver nationality string (Jolpica) → ISO alpha-2 (we use this for flags)
  const COUNTRY_BY_NATIONALITY = {
    'British': 'GB', 'Dutch': 'NL', 'Spanish': 'ES',
    'Monégasque': 'MC', 'Monegasque': 'MC',
    'French': 'FR', 'German': 'DE', 'Italian': 'IT',
    'Australian': 'AU', 'Japanese': 'JP', 'American': 'US',
    'Canadian': 'CA', 'Mexican': 'MX', 'Brazilian': 'BR',
    'Finnish': 'FI', 'Danish': 'DK', 'Thai': 'TH',
    'Chinese': 'CN', 'New Zealander': 'NZ', 'Argentine': 'AR',
    'Belgian': 'BE', 'Polish': 'PL', 'Russian': 'RU',
    'Swiss': 'CH', 'Austrian': 'AT',
  };
  const FLAG_BY_COUNTRY = {
    GB: '🇬🇧', NL: '🇳🇱', ES: '🇪🇸', MC: '🇲🇨', FR: '🇫🇷', DE: '🇩🇪', IT: '🇮🇹',
    AU: '🇦🇺', JP: '🇯🇵', US: '🇺🇸', CA: '🇨🇦', MX: '🇲🇽', BR: '🇧🇷', FI: '🇫🇮',
    DK: '🇩🇰', TH: '🇹🇭', CN: '🇨🇳', NZ: '🇳🇿', AR: '🇦🇷', BE: '🇧🇪', PL: '🇵🇱',
    RU: '🇷🇺', CH: '🇨🇭', AT: '🇦🇹', BH: '🇧🇭', SA: '🇸🇦', AZ: '🇦🇿', SG: '🇸🇬',
    AE: '🇦🇪', QA: '🇶🇦', HU: '🇭🇺',
  };
  const ISO_BY_COUNTRY_NAME = {
    'Bahrain': 'BH', 'Saudi Arabia': 'SA', 'Australia': 'AU', 'Japan': 'JP',
    'China': 'CN', 'United States': 'US', 'USA': 'US', 'Italy': 'IT', 'Monaco': 'MC',
    'Spain': 'ES', 'Canada': 'CA', 'Austria': 'AT', 'United Kingdom': 'GB', 'UK': 'GB',
    'Belgium': 'BE', 'Hungary': 'HU', 'Netherlands': 'NL', 'Azerbaijan': 'AZ',
    'Singapore': 'SG', 'Mexico': 'MX', 'Brazil': 'BR', 'Qatar': 'QA',
    'United Arab Emirates': 'AE', 'UAE': 'AE',
  };

  // Jolpica circuitId → our circuits-table key (so we can look up length, blurb, etc.)
  const CIRCUIT_ID_ALIASES = {
    bahrain: 'bahrain',
    jeddah: 'jeddah',
    albert_park: 'albert',
    suzuka: 'suzuka',
    shanghai: 'shanghai',
    miami: 'miami',
    imola: 'imola',
    monaco: 'monaco',
    catalunya: 'catalunya',
    villeneuve: 'montreal',
    red_bull_ring: 'spielberg',
    silverstone: 'silverstone',
    spa: 'spa',
    hungaroring: 'hungaroring',
    zandvoort: 'zandvoort',
    monza: 'monza',
    baku: 'baku',
    marina_bay: 'marina',
    americas: 'cota',
    rodriguez: 'rodriguez',
    interlagos: 'interlagos',
    vegas: 'lasvegas',
    losail: 'losail',
    yas_marina: 'yas',
  };

  // ---------- Reshape helpers ----------
  function reshapeDrivers(driversTable) {
    const drivers = driversTable.MRData.DriverTable.Drivers;
    return drivers.map(d => {
      const cc = COUNTRY_BY_NATIONALITY[d.nationality] || '';
      return {
        id: d.code,
        jolpicaId: d.driverId,
        num: parseInt(d.permanentNumber, 10) || 0,
        first: d.givenName,
        last: d.familyName,
        code: d.code,
        country: cc,
        flag: FLAG_BY_COUNTRY[cc] || '🏳',
        team: '', // filled in once we know constructor for each driver
        nationality: d.nationality,
        dateOfBirth: d.dateOfBirth,
      };
    });
  }

  function reshapeTeams(constructorsTable, fallbackTeams) {
    const constructors = constructorsTable.MRData.ConstructorTable.Constructors;
    return constructors.map(c => {
      const ourId = TEAM_ID_MAP[c.constructorId] || c.constructorId;
      const fallback = fallbackTeams.find(t => t.id === ourId);
      return {
        id: ourId,
        jolpicaId: c.constructorId,
        name: c.name,
        short: (fallback && fallback.short) || c.name.slice(0, 3).toUpperCase(),
        color: (fallback && fallback.color) || '#888888',
        nationality: c.nationality,
      };
    });
  }

  function reshapeCalendar(scheduleTable) {
    const races = scheduleTable.MRData.RaceTable.Races;
    return races.map(r => {
      const round = parseInt(r.round, 10);
      const circuitKey = CIRCUIT_ID_ALIASES[r.Circuit.circuitId] || r.Circuit.circuitId;
      const cc = ISO_BY_COUNTRY_NAME[r.Circuit.Location.country] || '';
      return {
        round,
        name: r.raceName,
        circuit: circuitKey,
        circuitId: r.Circuit.circuitId,
        country: cc,
        flag: FLAG_BY_COUNTRY[cc] || '🏳',
        date: r.date,
        time: r.time || null,
        sprint: !!r.Sprint,
        status: 'upcoming',
        sessions: {
          fp1: r.FirstPractice || null,
          fp2: r.SecondPractice || null,
          fp3: r.ThirdPractice || null,
          q:   r.Qualifying || null,
          sprint: r.Sprint || null,
          sprintQuali: r.SprintQualifying || null,
          race: r.date ? { date: r.date, time: r.time || null } : null,
        },
      };
    }).sort((a, b) => a.round - b.round);
  }

  function patchCalendarStatus(calendar, results) {
    const completedSet = new Set(Object.keys(results).map(Number));
    let nextSet = false;
    return calendar.map(r => {
      if (completedSet.has(r.round)) return Object.assign({}, r, { status: 'completed' });
      if (!nextSet) { nextSet = true; return Object.assign({}, r, { status: 'next' }); }
      return Object.assign({}, r, { status: 'upcoming' });
    });
  }

  function reshapeRaceResults(raceTable) {
    const races = raceTable.MRData.RaceTable.Races;
    if (!races || !races.length) return null;
    const race = races[0];
    if (!race.Results || !race.Results.length) return null;

    const results = race.Results.slice().sort((a, b) => {
      const ap = parseInt(a.position, 10);
      const bp = parseInt(b.position, 10);
      return (isNaN(ap) ? 99 : ap) - (isNaN(bp) ? 99 : bp);
    });

    const order = results.map(r => r.Driver.code);
    const grid = results.slice()
      .sort((a, b) => parseInt(a.grid, 10) - parseInt(b.grid, 10))
      .map(r => r.Driver.code);
    const dnfs = results
      .filter(r => r.positionText === 'R' || r.positionText === 'D')
      .map(r => r.Driver.code);

    const polesitter = results.find(r => parseInt(r.grid, 10) === 1);
    const fastestLap = results.find(r => r.FastestLap && r.FastestLap.rank === '1');

    const detail = {};
    results.forEach(r => {
      detail[r.Driver.code] = {
        position: r.positionText,
        grid: parseInt(r.grid, 10) || null,
        points: parseFloat(r.points) || 0,
        laps: parseInt(r.laps, 10) || null,
        status: r.status,
        time: r.Time ? r.Time.time : null,
        fastestLap: r.FastestLap ? r.FastestLap.Time.time : null,
        fastestLapNumber: r.FastestLap ? parseInt(r.FastestLap.lap, 10) : null,
      };
    });

    return {
      pole: polesitter ? polesitter.Driver.code : null,
      fastest: fastestLap ? fastestLap.Driver.code : null,
      order, grid, dnfs, detail,
    };
  }

  function reshapeQualifying(raceTable) {
    const races = raceTable.MRData.RaceTable.Races;
    if (!races || !races.length) return null;
    const qr = races[0].QualifyingResults;
    if (!qr || !qr.length) return null;
    const out = {};
    qr.forEach(q => {
      out[q.Driver.code] = {
        q1: q.Q1 || null,
        q2: q.Q2 || null,
        q3: q.Q3 || null,
        position: parseInt(q.position, 10) || null,
      };
    });
    return out;
  }

  function reshapeSprint(raceTable) {
    const races = raceTable.MRData.RaceTable.Races;
    if (!races || !races.length) return null;
    const sr = races[0].SprintResults;
    if (!sr || !sr.length) return null;
    const sorted = sr.slice().sort((a, b) => parseInt(a.position, 10) - parseInt(b.position, 10));
    const detail = {};
    sorted.forEach(r => {
      detail[r.Driver.code] = {
        position: r.positionText,
        grid: parseInt(r.grid, 10) || null,
        points: parseFloat(r.points) || 0,
        time: r.Time ? r.Time.time : null,
        status: r.status,
      };
    });
    return {
      winner: sorted[0].Driver.code,
      order: sorted.map(r => r.Driver.code),
      detail,
    };
  }

  // ---------- Main loader ----------
  async function loadFromAPI() {
    // Schedule
    const scheduleData = await fetchJSON('/current/?limit=100');
    const calendarRaw = reshapeCalendar(scheduleData);
    const seasonYear = scheduleData.MRData.RaceTable.season;

    // Drivers, constructors, driver standings (the latter gives us driver→team)
    const [driversData, constructorsData, driverStandingsData] = await Promise.all([
      fetchJSON('/current/drivers/?limit=100'),
      fetchJSON('/current/constructors/?limit=100'),
      fetchJSON('/current/driverstandings/?limit=100'),
    ]);

    // Per-round race / qualifying / sprint for completed rounds
    // The driver standings response tells us which round it's "as of", which is
    // strictly the latest round Jolpica has results for. Trust that as the upper
    // bound — it avoids spamming 404s for rounds whose race-day has passed
    // but whose results haven't been ingested yet.
    const standingsList0 = driverStandingsData.MRData.StandingsTable.StandingsLists[0];
    const lastCompletedRound = standingsList0 ? parseInt(standingsList0.round, 10) : 0;

    const todayISO = new Date().toISOString().slice(0, 10);
    const completedRounds = calendarRaw
      .filter(r => r.date && r.date < todayISO && r.round <= lastCompletedRound)
      .map(r => r.round);

    const fetches = [];
    completedRounds.forEach(round => {
      fetches.push(
        fetchJSON('/current/' + round + '/results/')
          .then(j => ({ round, kind: 'race', data: j }))
          .catch(() => null)
      );
      fetches.push(
        fetchJSON('/current/' + round + '/qualifying/')
          .then(j => ({ round, kind: 'quali', data: j }))
          .catch(() => null)
      );
      const isSprint = calendarRaw.find(r => r.round === round && r.sprint);
      if (isSprint) {
        fetches.push(
          fetchJSON('/current/' + round + '/sprint/')
            .then(j => ({ round, kind: 'sprint', data: j }))
            .catch(() => null)
        );
      }
    });

    const perRound = (await Promise.all(fetches)).filter(Boolean);

    // Drivers + team mapping (from driver standings)
    const drivers = reshapeDrivers(driversData);
    const teamByDriverCode = {};
    const standingsList = driverStandingsData.MRData.StandingsTable.StandingsLists[0];
    const driverStandingsRows = (standingsList && standingsList.DriverStandings) || [];
    driverStandingsRows.forEach(ds => {
      const code = ds.Driver.code;
      const c = ds.Constructors && ds.Constructors[ds.Constructors.length - 1];
      if (c) teamByDriverCode[code] = TEAM_ID_MAP[c.constructorId] || c.constructorId;
    });
    drivers.forEach(d => { d.team = teamByDriverCode[d.id] || ''; });

    // Teams
    const fallbackTeams = (window.F1_DATA && window.F1_DATA.__statics && window.F1_DATA.__statics.teams) || [];
    const teams = reshapeTeams(constructorsData, fallbackTeams);

    // Results
    const resultsByRound = {};
    perRound.forEach(({ round, kind, data }) => {
      if (!resultsByRound[round]) resultsByRound[round] = {};
      if (kind === 'race') {
        const r = reshapeRaceResults(data);
        if (r) Object.assign(resultsByRound[round], r);
      } else if (kind === 'quali') {
        const q = reshapeQualifying(data);
        if (q) resultsByRound[round].quali = q;
      } else if (kind === 'sprint') {
        const s = reshapeSprint(data);
        if (s) {
          resultsByRound[round].sprintWinner = s.winner;
          resultsByRound[round].sprintResults = s;
        }
      }
    });
    const cleanResults = {};
    Object.keys(resultsByRound).forEach(k => {
      if (resultsByRound[k].order && resultsByRound[k].order.length) {
        cleanResults[k] = resultsByRound[k];
      }
    });

    const calendar = patchCalendarStatus(calendarRaw, cleanResults);

    return { seasonYear, teams, drivers, calendar, results: cleanResults };
  }

  // ---------- Build the F1_DATA contract from a raw season payload ----------
  function buildF1Data(raw) {
    const statics = (window.F1_DATA && window.F1_DATA.__statics) || {};
    const circuits = statics.circuits || {};
    const POINTS = statics.POINTS || [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];
    const fmtLap = statics.fmtLap || function (s) { return String(s); };
    const fmtGap = statics.fmtGap || function () { return ''; };

    const { teams, drivers, calendar, results, seasonYear } = raw;

    function driverById(code) { return drivers.find(d => d.id === code); }
    function teamById(id) { return teams.find(t => t.id === id); }
    function genQuali(round) {
      const r = results[round];
      if (!r) return null;
      return r.quali || null;
    }

    function computeStandings() {
      const driverPts = {}, driverWins = {}, driverPodiums = {},
            driverFastest = {}, driverPoles = {}, driverDnfs = {};
      drivers.forEach(d => {
        driverPts[d.id] = 0; driverWins[d.id] = 0; driverPodiums[d.id] = 0;
        driverFastest[d.id] = 0; driverPoles[d.id] = 0; driverDnfs[d.id] = 0;
      });

      const completedRounds = Object.keys(results).map(Number).sort((a, b) => a - b);
      const lastRound = completedRounds[completedRounds.length - 1];
      const prevRound = completedRounds[completedRounds.length - 2];
      const snapshots = {};

      completedRounds.forEach(r => {
        const res = results[r];
        if (res.detail) {
          // API path — use the points the API tells us (handles half-points,
          // fastest-lap point, disqualifications, etc).
          res.order.forEach((code, i) => {
            const det = res.detail[code];
            if (det && typeof det.points === 'number') driverPts[code] = (driverPts[code] || 0) + det.points;
            if (i === 0) driverWins[code] = (driverWins[code] || 0) + 1;
            if (i < 3) driverPodiums[code] = (driverPodiums[code] || 0) + 1;
          });
        } else {
          // Fallback path — same logic the prototype used
          res.order.forEach((code, i) => {
            if (i < 10) driverPts[code] = (driverPts[code] || 0) + POINTS[i];
            if (i === 0) driverWins[code] = (driverWins[code] || 0) + 1;
            if (i < 3) driverPodiums[code] = (driverPodiums[code] || 0) + 1;
          });
          if (res.fastest && res.order.indexOf(res.fastest) < 10) {
            driverPts[res.fastest] = (driverPts[res.fastest] || 0) + 1;
          }
        }
        if (res.fastest) driverFastest[res.fastest] = (driverFastest[res.fastest] || 0) + 1;
        if (res.pole) driverPoles[res.pole] = (driverPoles[res.pole] || 0) + 1;

        if (res.sprintResults && res.sprintResults.detail) {
          Object.entries(res.sprintResults.detail).forEach(([c, det]) => {
            if (typeof det.points === 'number') driverPts[c] = (driverPts[c] || 0) + det.points;
          });
        }

        (res.dnfs || []).forEach(c => { driverDnfs[c] = (driverDnfs[c] || 0) + 1; });
        snapshots[r] = Object.assign({}, driverPts);
      });

      const ranked = drivers.map(d => ({
        driver: d,
        points: driverPts[d.id] || 0,
        wins: driverWins[d.id] || 0,
        podiums: driverPodiums[d.id] || 0,
        fastestLaps: driverFastest[d.id] || 0,
        poles: driverPoles[d.id] || 0,
        dnfs: driverDnfs[d.id] || 0,
      })).sort((a, b) => b.points - a.points || b.wins - a.wins);

      const prevPts = prevRound ? snapshots[prevRound] : null;
      const prevRanked = prevPts
        ? drivers.map(d => ({ id: d.id, points: prevPts[d.id] || 0 })).sort((a, b) => b.points - a.points)
        : null;
      const prevRankMap = {};
      if (prevRanked) prevRanked.forEach((row, i) => prevRankMap[row.id] = i + 1);

      ranked.forEach((row, i) => {
        row.position = i + 1;
        const prevP = prevRankMap[row.driver.id];
        row.change = prevP ? prevP - row.position : 0;
      });

      const teamPts = {}, teamWins = {}, teamPodiums = {};
      teams.forEach(t => { teamPts[t.id] = 0; teamWins[t.id] = 0; teamPodiums[t.id] = 0; });
      ranked.forEach(r => {
        if (r.driver.team) {
          teamPts[r.driver.team] = (teamPts[r.driver.team] || 0) + r.points;
          teamWins[r.driver.team] = (teamWins[r.driver.team] || 0) + r.wins;
          teamPodiums[r.driver.team] = (teamPodiums[r.driver.team] || 0) + r.podiums;
        }
      });
      const teamRanked = teams.map(t => ({
        team: t,
        points: teamPts[t.id] || 0,
        wins: teamWins[t.id] || 0,
        podiums: teamPodiums[t.id] || 0,
        drivers: drivers.filter(d => d.team === t.id),
      })).sort((a, b) => b.points - a.points || b.wins - a.wins);
      teamRanked.forEach((t, i) => t.position = i + 1);

      const progression = {};
      drivers.forEach(d => progression[d.id] = []);
      completedRounds.forEach(r => {
        drivers.forEach(d => {
          progression[d.id].push({ round: r, points: snapshots[r][d.id] || 0 });
        });
      });

      const teamProgression = {};
      teams.forEach(t => teamProgression[t.id] = []);
      completedRounds.forEach(r => {
        const snap = snapshots[r];
        teams.forEach(t => {
          const pts = drivers
            .filter(d => d.team === t.id)
            .reduce((sum, d) => sum + (snap[d.id] || 0), 0);
          teamProgression[t.id].push({ round: r, points: pts });
        });
      });

      return { drivers: ranked, teams: teamRanked, progression, teamProgression, completedRounds, lastRound };
    }

    return {
      seasonYear,
      teams, drivers, calendar, circuits, results, POINTS,
      driverById, teamById, computeStandings, genQuali,
      fmtLap, fmtGap,
      _source: 'api',
      __statics: statics, // preserve so subsequent calls can re-build
    };
  }

  // ---------- Boot ----------
  window.F1_READY = new Promise((resolve) => {
    const offline = /[?&]offline=1\b/.test(window.location.search || '');
    if (offline) {
      // F1_DATA is already set to the bundled fallback by data.js
      resolve(window.F1_DATA);
      return;
    }

    loadFromAPI()
      .then(raw => {
        try {
          const built = buildF1Data(raw);
          window.F1_DATA = built;
          resolve(built);
        } catch (err) {
          console.warn('[f1gures] reshape failed, keeping bundled fallback:', err);
          resolve(window.F1_DATA);
        }
      })
      .catch(err => {
        console.warn('[f1gures] API fetch failed, keeping bundled fallback:', err);
        resolve(window.F1_DATA);
      });
  });

  // Expose for debugging
  window.__F1_API_DEBUG__ = { fetchJSON, buildF1Data, loadFromAPI };
})();
