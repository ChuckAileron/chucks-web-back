import {
  buildItemPatch,
  buildResultCsvRows,
  candidateQueries,
  cleanName,
  detectCsvKeyColumns,
  detectMetadataColumns,
  matchRowsToItems,
  normalize,
  parseCsv,
  RESULT_CSV_HEADERS,
  scoreMatch,
  stringifyCsv,
} from './launchbox-metadata.js';

describe('launchbox-metadata', () => {
  it('normalize quita acentos, marcadores y símbolos', () => {
    expect(normalize('Pokémon™ Red/Blue (USA)')).toBe(
      'pokemon red blue usa',
    );
  });

  it('cleanName corta lo que está tras el paréntesis', () => {
    expect(cleanName('Super Metroid (Japan)')).toBe('Super Metroid');
  });

  it('candidateQueries propone recortes sin repetir', () => {
    expect(candidateQueries('Final Fantasy VII Remake Intergrade')).toEqual([
      'Final Fantasy VII Remake Intergrade',
      'Final Fantasy VII',
      'Final Fantasy',
    ]);
  });

  it('scoreMatch premia coincidencia exacta y de plataforma', () => {
    const score = scoreMatch(
      { href: '/games/details/1', title: 'Super Metroid', platform: 'Super Nintendo' },
      'Super Metroid',
      'Super Metroid',
      'Super Nintendo',
    );
    expect(score.nameScore).toBe(200);
    expect(score.platformMatch).toBe(true);
    expect(score.total).toBe(240);
  });

  it('parseCsv respeta comillas y comas embebidas', () => {
    const parsed = parseCsv(
      'Name,Platform,Publisher\r\n"Chrono, Trigger",SNES,"Square, Inc."\r\n',
    );
    expect(parsed.headers).toEqual(['Name', 'Platform', 'Publisher']);
    expect(parsed.rows).toEqual([
      {
        Name: 'Chrono, Trigger',
        Platform: 'SNES',
        Publisher: 'Square, Inc.',
      },
    ]);
  });

  it('detectCsvKeyColumns exige nombre y plataforma', () => {
    expect(detectCsvKeyColumns(['Name', 'Platform'])).toEqual({
      nameColumn: 'Name',
      platformColumn: 'Platform',
    });
    expect(detectCsvKeyColumns(['Nombre', 'Plataforma'])).toEqual({
      nameColumn: 'Nombre',
      platformColumn: 'Plataforma',
    });
    expect(detectCsvKeyColumns(['Name'])).toBeNull();
  });

  it('detectMetadataColumns reconoce las columnas de resultados', () => {
    const columns = detectMetadataColumns([
      'Name',
      'Platform',
      'Boxart_URL',
      'Release_Date',
      'Publisher',
      'Developer',
    ]);
    expect(columns).toEqual({
      boxartColumn: 'Boxart_URL',
      releaseDateColumn: 'Release_Date',
      publisherColumn: 'Publisher',
      developerColumn: 'Developer',
    });
  });

  it('matchRowsToItems cruza nombre y plataforma exactos', () => {
    const items = [
      {
        id: 1,
        name: 'Super Metroid',
        values: { Plataforma: 'Super Nintendo' },
      },
    ];
    const { matched, missing } = matchRowsToItems({
      items,
      rows: [
        { name: 'Super Metroid', platform: 'Super Nintendo' },
        { name: 'Super Metroid', platform: 'SNES' },
      ],
      platformColumn: 'Plataforma',
    });
    expect(matched).toHaveLength(1);
    expect(matched[0].itemId).toBe(1);
    expect(missing).toEqual([
      { name: 'Super Metroid', platform: 'SNES' },
    ]);
  });

  it('buildItemPatch escribe solo los campos disponibles', () => {
    const patch = buildItemPatch({
      current: { values: { Plataforma: 'SNES' } },
      mapping: {
        platformColumn: 'Plataforma',
        releaseDateColumn: 'Fecha',
        publisherColumn: 'Editor',
      },
      metadata: {
        releaseDate: '1994-03-19T00:00:00',
        publisher: 'Nintendo',
        boxartUrl: 'https://images.launchbox-app.com//box.jpg',
      },
    });
    expect(patch.values).toEqual({
      Plataforma: 'SNES',
      Fecha: '1994-03-19',
      Editor: 'Nintendo',
    });
    expect(patch.imageUrl).toBe('https://images.launchbox-app.com//box.jpg');
  });

  it('stringifyCsv + buildResultCsvRows genera el CSV de resultados', () => {
    const rows = buildResultCsvRows([
      {
        name: 'Super Metroid',
        platform: 'SNES',
        found: true,
        title: 'Super Metroid',
        metadata: {
          boxartUrl: 'https://example.com/box.jpg',
          releaseDate: '1994-03-19',
          publisher: 'Nintendo',
          developer: 'Nintendo R&D1',
        },
      },
      { name: 'Juego "raro"', platform: 'PC', found: false },
    ]);
    const csv = stringifyCsv(rows, RESULT_CSV_HEADERS);
    expect(csv.split('\r\n')[0]).toBe(RESULT_CSV_HEADERS.join(','));
    expect(csv).toContain('"Juego ""raro""",PC,No');
    expect(csv).toContain('Nintendo R&D1');
  });
});
