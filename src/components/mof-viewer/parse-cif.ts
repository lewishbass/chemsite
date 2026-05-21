/**
 * parse-cif.ts
 * TypeScript port of parse_cif.py — extracts atoms (Cartesian Å) and bonds
 * from a CIF (Crystallographic Information File) string.
 *
 * Targets P1 space-group CIF files from the CSD MOF Collection.
 */

// ── Data types ────────────────────────────────────────────────────────────── //

export interface Atom {
  label:   string;                            // site label, e.g. 'C1', 'Zn2'
  element: string;                            // element symbol, e.g. 'C', 'Zn'
  fract:   [number, number, number];          // fractional coordinates
  cart:    [number, number, number];          // Cartesian coordinates (Å)
}

export interface Bond {
  label1: string;
  label2: string;
  sym1:   string;   // '1_555' = same unit cell
  sym2:   string;
}

export interface Molecule {
  name:      string;
  filename:  string;
  cellA:     number;
  cellB:     number;
  cellC:     number;
  cellAlpha: number;
  cellBeta:  number;
  cellGamma: number;
  atoms:     Atom[];
  bonds:     Bond[];
}

// ── Helpers ───────────────────────────────────────────────────────────────── //

/** Strip parenthesised ESD suffix: '0.52674(6)' → '0.52674' */
function stripEsd(s: string): string {
  return s.replace(/\([^)]*\)/g, '');
}

function parseNum(s: string): number {
  return parseFloat(stripEsd(s.replace(/['"]/g, '')));
}

/** Flat list of CIF tokens (quoted strings kept whole, comments skipped). */
function tokenize(text: string): string[] {
  const tokens: string[] = [];
  // Handle semicolon-delimited text blocks (;...;) as a single token
  const lines = text.split('\n');
  let inTextBlock = false;
  let blockLines: string[] = [];

  for (const raw of lines) {
    const line = raw.trimEnd();

    if (inTextBlock) {
      if (line.startsWith(';')) {
        tokens.push(blockLines.join(' '));
        blockLines = [];
        inTextBlock = false;
      } else {
        blockLines.push(line);
      }
      continue;
    }
    if (line.startsWith(';')) {
      inTextBlock = true;
      continue;
    }
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    for (const m of trimmed.matchAll(/'[^']*'|"[^"]*"|\S+/g)) {
      tokens.push(m[0]);
    }
  }
  return tokens;
}

// ── Fractional → Cartesian conversion ─────────────────────────────────────── //

/**
 * Build the 3×3 row-major fractional→Cartesian transform M.
 * Cartesian point = (fx, fy, fz) × M
 * Convention: a-axis along +X, b-axis in XY plane.
 */
function fracToCartMatrix(
  a: number, b: number, c: number,
  alphaDeg: number, betaDeg: number, gammaDeg: number,
): number[][] {
  const toRad = Math.PI / 180;
  const ar = alphaDeg * toRad, br = betaDeg * toRad, gr = gammaDeg * toRad;
  const ca = Math.cos(ar), cb = Math.cos(br), cg = Math.cos(gr), sg = Math.sin(gr);
  const n2 = (ca - cb * cg) / sg;
  const cz = Math.sqrt(Math.max(0, Math.sin(br) ** 2 - n2 ** 2));
  return [
    [a,       0,      0    ],
    [b * cg,  b * sg, 0    ],
    [c * cb,  c * n2, c * cz],
  ];
}

function applyMatrix(fx: number, fy: number, fz: number, M: number[][]): [number, number, number] {
  return [
    fx * M[0][0] + fy * M[1][0] + fz * M[2][0],
    fx * M[0][1] + fy * M[1][1] + fz * M[2][1],
    fx * M[0][2] + fy * M[1][2] + fz * M[2][2],
  ];
}

// ── Main parser ───────────────────────────────────────────────────────────── //

export function parseCif(text: string, filename = ''): Molecule {
  const tokens = tokenize(text);
  const n = tokens.length;
  let pos = 0;

  const mol: Molecule = {
    name: '', filename,
    cellA: 1, cellB: 1, cellC: 1,
    cellAlpha: 90, cellBeta: 90, cellGamma: 90,
    atoms: [], bonds: [],
  };

  const take  = (): string => tokens[pos++];
  const isSec = (t: string): boolean => {
    const tl = t.toLowerCase();
    return tl.startsWith('_') || tl === 'loop_' || tl.startsWith('data_');
  };
  const takeScalar = (): string =>
    pos < n && !isSec(tokens[pos]) ? take() : '';

  while (pos < n) {
    const tok = take();
    const tl  = tok.toLowerCase();

    if (tl.startsWith('data_')) {
      mol.name = tok.slice(5);

    } else if (tl === '_cell_length_a')    { mol.cellA     = parseNum(takeScalar()); }
    else if   (tl === '_cell_length_b')    { mol.cellB     = parseNum(takeScalar()); }
    else if   (tl === '_cell_length_c')    { mol.cellC     = parseNum(takeScalar()); }
    else if   (tl === '_cell_angle_alpha') { mol.cellAlpha = parseNum(takeScalar()); }
    else if   (tl === '_cell_angle_beta')  { mol.cellBeta  = parseNum(takeScalar()); }
    else if   (tl === '_cell_angle_gamma') { mol.cellGamma = parseNum(takeScalar()); }

    else if (tl === 'loop_') {
      // Collect column names
      const cols: string[] = [];
      while (pos < n && tokens[pos].startsWith('_')) cols.push(take().toLowerCase());
      if (!cols.length) continue;

      // Collect data rows
      const rows: string[][] = [];
      while (pos < n && !isSec(tokens[pos])) {
        const row: string[] = [];
        for (let _ = 0; _ < cols.length; _++) {
          row.push(pos < n && !isSec(tokens[pos]) ? take() : '.');
        }
        rows.push(row);
      }

      // ── atom_site loop ──────────────────────────────────────────── //
      if (cols.includes('_atom_site_label') && cols.includes('_atom_site_fract_x')) {
        const ciLbl = cols.indexOf('_atom_site_label');
        const ciSym = cols.indexOf('_atom_site_type_symbol');
        const ciX   = cols.indexOf('_atom_site_fract_x');
        const ciY   = cols.indexOf('_atom_site_fract_y');
        const ciZ   = cols.indexOf('_atom_site_fract_z');
        const need  = Math.max(ciLbl, ciX, ciY, ciZ);

        for (const row of rows) {
          if (row.length <= need) continue;
          const label = row[ciLbl].replace(/['"]/g, '');

          let element: string;
          if (ciSym >= 0 && ciSym < row.length && row[ciSym] !== '.') {
            element = row[ciSym].replace(/['"]/g, '');
          } else {
            const m = label.match(/([A-Za-z]+)/);
            const raw = m ? m[1] : label.slice(0, 2);
            element = raw.length > 1
              ? raw[0].toUpperCase() + raw.slice(1).toLowerCase()
              : raw.toUpperCase();
          }

          const fx = parseNum(row[ciX]);
          const fy = parseNum(row[ciY]);
          const fz = parseNum(row[ciZ]);
          if (isNaN(fx) || isNaN(fy) || isNaN(fz)) continue;

          mol.atoms.push({ label, element, fract: [fx, fy, fz], cart: [0, 0, 0] });
        }

      // ── geom_bond loop ──────────────────────────────────────────── //
      } else if (cols.includes('_geom_bond_atom_site_label_1')) {
        const ciL1 = cols.indexOf('_geom_bond_atom_site_label_1');
        const ciL2 = cols.indexOf('_geom_bond_atom_site_label_2');
        const ciS1 = cols.indexOf('_geom_bond_site_symmetry_1');
        const ciS2 = cols.indexOf('_geom_bond_site_symmetry_2');

        for (const row of rows) {
          if (row.length <= Math.max(ciL1, ciL2)) continue;
          mol.bonds.push({
            label1: row[ciL1].replace(/['"]/g, ''),
            label2: row[ciL2].replace(/['"]/g, ''),
            sym1: ciS1 >= 0 && ciS1 < row.length ? row[ciS1] : '1_555',
            sym2: ciS2 >= 0 && ciS2 < row.length ? row[ciS2] : '1_555',
          });
        }
      }
    }
  }

  // Convert fractional → Cartesian
  const M = fracToCartMatrix(
    mol.cellA, mol.cellB, mol.cellC,
    mol.cellAlpha, mol.cellBeta, mol.cellGamma,
  );
  for (const atom of mol.atoms) {
    atom.cart = applyMatrix(...atom.fract, M);
  }

  return mol;
}
