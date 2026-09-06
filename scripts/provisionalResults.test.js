import { describe, it, expect } from 'vitest';
import { buildProvisionalResults } from './provisionalResults.mjs';

const session = () => ({
  drivers: [
    { code: 'RUS', ref: 'russell', name: 'George Russell', team: 'Mercedes', teamId: 'mercedes', color: '#27F4D2', position: 2 },
    { code: 'ANT', ref: 'antonelli', name: 'Kimi Antonelli', team: 'Mercedes', teamId: 'mercedes', color: '#27F4D2', position: 1 },
    { code: 'VER', ref: 'max_verstappen', name: 'Max Verstappen', team: 'Red Bull', teamId: 'redbull', color: '#3671C6', position: 3 },
  ],
  laps: {
    ANT: [[1], [2], [3]],
    RUS: [[1], [2], [3]],
  },
});

describe('buildProvisionalResults', () => {
  it('maps FastF1 drivers to archive-shaped rows sorted by finishing position', () => {
    const rows = buildProvisionalResults(session());
    expect(rows.map((r) => r.code)).toEqual(['ANT', 'RUS', 'VER']);
    expect(rows[0]).toMatchObject({
      position: 1,
      positionText: '1',
      driverRef: 'antonelli',
      driverName: 'Kimi Antonelli',
      code: 'ANT',
      constructorRef: 'mercedes',
      constructorName: 'Mercedes',
      constructorColor: '#27F4D2',
    });
  });

  it('never invents points, grid, status, gap or fastest lap', () => {
    for (const row of buildProvisionalResults(session())) {
      expect(row.points).toBeNull();
      expect(row.grid).toBeNull();
      expect(row.status).toBeNull();
      expect(row.time).toBeNull();
      expect(row.fastestLapTime).toBeNull();
      expect(row.fastestLapRank).toBeNull();
    }
  });

  it('counts laps where the session has them and leaves the rest null', () => {
    const rows = buildProvisionalResults(session());
    expect(rows.find((r) => r.code === 'ANT').laps).toBe(3);
    // VER has no lap rows in this session
    expect(rows.find((r) => r.code === 'VER').laps).toBeNull();
  });

  it('drops drivers with no usable finishing position', () => {
    const s = session();
    s.drivers.push(
      { code: 'HUL', ref: 'hulkenberg', name: 'Nico Hulkenberg', position: null },
      { code: 'BOR', ref: 'bortoleto', name: 'Gabriel Bortoleto', position: 0 },
      { code: null, ref: 'nobody', name: 'No Code', position: 4 },
    );
    expect(buildProvisionalResults(s).map((r) => r.code)).toEqual(['ANT', 'RUS', 'VER']);
  });

  it('coerces string positions', () => {
    const rows = buildProvisionalResults({ drivers: [{ code: 'LEC', ref: 'leclerc', name: 'Charles Leclerc', position: '4' }] });
    expect(rows[0].position).toBe(4);
    expect(rows[0].positionText).toBe('4');
  });

  it('falls back to the code when a name is missing', () => {
    const rows = buildProvisionalResults({ drivers: [{ code: 'XYZ', position: 1 }] });
    expect(rows[0].driverName).toBe('XYZ');
    expect(rows[0].driverRef).toBeNull();
  });

  it('returns an empty array for missing, empty or malformed sessions', () => {
    expect(buildProvisionalResults(undefined)).toEqual([]);
    expect(buildProvisionalResults(null)).toEqual([]);
    expect(buildProvisionalResults({})).toEqual([]);
    expect(buildProvisionalResults({ drivers: [] })).toEqual([]);
    expect(buildProvisionalResults({ drivers: 'nope' })).toEqual([]);
    expect(buildProvisionalResults({ drivers: [{ code: 'ANT', position: 'x' }] })).toEqual([]);
  });

  it('tolerates a session with no laps map', () => {
    const s = session();
    delete s.laps;
    expect(buildProvisionalResults(s).every((r) => r.laps === null)).toBe(true);
  });
});
