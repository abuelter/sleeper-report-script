// ...existing code...
import fs from 'fs';
import path from 'path';
import { Roster } from './roster-model';

type PosGroup = 'QB' | 'RB' | 'WR' | 'TE' | 'SUPER_FLEX' | 'FLEX' ;

const ROSTERS_FILE = path.resolve(__dirname, 'rosters.json');
const OUT_FILE = path.resolve(__dirname, 'team-report.md');

function readRosters(): Roster[] {
  const raw = fs.readFileSync(ROSTERS_FILE, 'utf8');
  return JSON.parse(raw) as Roster[];
}

function avg(nums: number[]) {
  const filtered = nums.filter(n => typeof n === 'number' && !isNaN(n));
  if (filtered.length === 0) return 0;
  return filtered.reduce((a, b) => a + b, 0) / filtered.length;
}

function formatNum(n: number, digits = 2) {
  return Number.isFinite(n) ? n.toFixed(digits) : '0.00';
}

function compute() {
  const rosters = readRosters();
  // league-wide averages
  const avgPointsFor = avg(rosters.map(r => r.pointsFor));
  const avgMaxPoints = avg(rosters.map(r => r.maxPoints));

  // per-position averages across ideal roster excluding bench
  // Treat FLEX and SUPER_FLEX as their own buckets and DO NOT add them to RB/WR/TE/QB averages
  const posGroups: Record<string, number[]> = { QB: [], RB: [], WR: [], TE: [], FLEX: [], SUPER_FLEX: [] };
  for (const r of rosters) {
    const ir = r.idealRoster as any;
    if (!ir) continue;
    if (ir.QB && typeof ir.QB.avgPointsPerGame === 'number') posGroups.QB.push(ir.QB.avgPointsPerGame);
    // RBs only from RB1, RB2
    ['RB1', 'RB2'].forEach((k: any) => {
      const p = ir[k];
      if (!p) return;
      if (typeof p.avgPointsPerGame === 'number') posGroups.RB.push(p.avgPointsPerGame);
    });
    // WRs only from WR1, WR2, WR3
    ['WR1', 'WR2', 'WR3'].forEach((k: any) => {
      const p = ir[k];
      if (!p) return;
      if (typeof p.avgPointsPerGame === 'number') posGroups.WR.push(p.avgPointsPerGame);
    });
    if (ir.TE && typeof ir.TE.avgPointsPerGame === 'number') posGroups.TE.push(ir.TE.avgPointsPerGame);
    // FLEX slots counted only in FLEX bucket
    ['FLEX1', 'FLEX2'].forEach((k: any) => {
      const p = ir[k];
      if (!p) return;
      if (typeof p.avgPointsPerGame === 'number') posGroups.FLEX.push(p.avgPointsPerGame);
    });
    // SUPER_FLEX counted only in SUPER_FLEX bucket
    const sf = ir.SUPER_FLEX;
    if (sf && typeof sf.avgPointsPerGame === 'number') posGroups.SUPER_FLEX.push(sf.avgPointsPerGame);
  }

  const avgByPos: Record<string, number> = {
    QB: avg(posGroups.QB),
    RB: avg(posGroups.RB),
    WR: avg(posGroups.WR),
    TE: avg(posGroups.TE),
    FLEX: avg(posGroups.FLEX),
    SUPER_FLEX: avg(posGroups.SUPER_FLEX),
  };

  // prepare ranks for pointsFor (desc), maxPoints (desc), percentMax (desc), pointsAgainst (asc)
  const pointsForSorted = [...rosters].sort((a, b) => b.pointsFor - a.pointsFor);
  const maxPointsSorted = [...rosters].sort((a, b) => b.maxPoints - a.maxPoints);
  const percentMax = rosters.map(r => ({ r, pct: r.pointsFor / (r.maxPoints || 1) }));
  const percentMaxSorted = [...percentMax].sort((a, b) => b.pct - a.pct);
  const pointsAgainstSorted = [...rosters].sort((a, b) => a.pointsAgainst - b.pointsAgainst); // lower is better

  function rankIn(sorted: Roster[], id: number) {
    return sorted.findIndex(s => s.id === id) + 1;
  }

  function rankPctIn(sorted: { r: Roster; pct: number }[], id: number) {
    return sorted.findIndex(s => s.r.id === id) + 1;
  }

  // compute per-team per-position totals (starting slots only, exclude bench)
  // FLEX and SUPER_FLEX are separate and do not contribute to RB/WR/TE/QB totals
  const teamPosTotals: Record<number, Record<string, number>> = {};
  for (const r of rosters) {
    const ir = r.idealRoster as any;
    const totals: Record<string, number> = { QB: 0, RB: 0, WR: 0, TE: 0, FLEX: 0, SUPER_FLEX: 0 };
    if (ir) {
      if (ir.QB && typeof ir.QB.avgPointsPerGame === 'number') totals.QB += ir.QB.avgPointsPerGame;
      ['RB1', 'RB2'].forEach((k: any) => { if (ir[k]) totals.RB += (ir[k].avgPointsPerGame || 0); });
      ['WR1', 'WR2', 'WR3'].forEach((k: any) => { if (ir[k]) totals.WR += (ir[k].avgPointsPerGame || 0); });
      if (ir.TE && typeof ir.TE.avgPointsPerGame === 'number') totals.TE += ir.TE.avgPointsPerGame;
      // FLEX slots go to FLEX total only
      ['FLEX1', 'FLEX2'].forEach((k: any) => {
        const p = ir[k];
        if (!p) return;
        totals.FLEX += p.avgPointsPerGame || 0;
      });
      // SUPER_FLEX goes to SUPER_FLEX total only
      if (ir.SUPER_FLEX) {
        totals.SUPER_FLEX += ir.SUPER_FLEX.avgPointsPerGame || 0;
      }
    }
    teamPosTotals[r.id] = totals;
  }

  // for each pos, create sorted ranking (include FLEX and SUPER_FLEX)
  const posRankings: Record<string, number[]> = {};
  for (const pos of ['QB', 'RB', 'WR', 'TE', 'FLEX', 'SUPER_FLEX']) {
    const arr = rosters.map(r => ({ id: r.id, val: teamPosTotals[r.id][pos] || 0 }));
    arr.sort((a, b) => b.val - a.val);
    posRankings[pos] = arr.map(a => a.id);
  }

  // helper to get pos rank
  function getPosRank(teamId: number, pos: string) {
    const list = posRankings[pos];
    return list.indexOf(teamId) + 1;
  }

  // build markdown
  const lines: string[] = [];
  lines.push(`# Team report`);
  lines.push('');
  lines.push(`Average Points For: ${formatNum(avgPointsFor)}`);
  lines.push(`Average Max Points: ${formatNum(avgMaxPoints)}`);
  lines.push('');
  lines.push(`Average by position:`);
  for (const pos of ['QB', 'RB', 'WR', 'TE', 'FLEX', 'SUPER_FLEX']) {
    lines.push(`- ${pos}: ${formatNum(avgByPos[pos])}`);
  }
  lines.push('');

  for (const r of rosters) {
    lines.push(`## ${r.name}`);
    const pfRank = rankIn(pointsForSorted, r.id);
    const mpRank = rankIn(maxPointsSorted, r.id);
    const pctRank = rankPctIn(percentMaxSorted, r.id);
    const paRank = rankIn(pointsAgainstSorted, r.id);
    const pct = (r.pointsFor / (r.maxPoints || 1)) * 100;

    lines.push(`Points For: ${formatNum(r.pointsFor)} (Rank ${pfRank})`);
    lines.push(`Max Points: ${formatNum(r.maxPoints)} (Rank ${mpRank})`);
    lines.push(`% of Max: ${formatNum(pct, 1)}% (Rank ${pctRank})`);
    lines.push(`Points Against: ${formatNum(r.pointsAgainst)} (Rank ${paRank})`);

    // ideal roster listing
    const ir = r.idealRoster as any;
    if (ir) {
      const orderedSlots = ['QB','RB1','RB2','WR1','WR2','WR3','TE','FLEX1','FLEX2','SUPER_FLEX'];
      const slotLines: string[] = [];
      for (const s of orderedSlots) {
        const p = ir[s];
        if (!p) continue;
        const posLabel = s.startsWith('BENCH') || s === 'BENCH' ? `BENCH-${(p.positions && p.positions[0]) || ''}` : `${s.replace(/[0-9]/g,'')}`;
        slotLines.push(`${posLabel} - ${p.name} - ${formatNum(p.avgPointsPerGame || 0)}`);
      }
      // bench
      if (Array.isArray(ir.BENCH)) {
        for (const bp of ir.BENCH) {
          const bpos = (bp.positions && bp.positions[0]) || 'UNK';
          slotLines.push(`BENCH-${bpos} - ${bp.name} - ${formatNum(bp.avgPointsPerGame || 0)}`);
        }
      }
      lines.push('Ideal roster:');
      for (const sl of slotLines) lines.push(`- ${sl}`);
    }

    // position ranks for this team (now includes FLEX and SUPER_FLEX)
    lines.push('');
    lines.push(`Position Ranks: QB Rank - ${getPosRank(r.id, 'QB')}, RB Rank - ${getPosRank(r.id, 'RB')}, WR Rank - ${getPosRank(r.id, 'WR')}, TE Rank - ${getPosRank(r.id, 'TE')}, FLEX Rank - ${getPosRank(r.id, 'FLEX')}, SUPER_FLEX Rank - ${getPosRank(r.id, 'SUPER_FLEX')}`);
    lines.push('');
  }

  fs.writeFileSync(OUT_FILE, lines.join('\n'));
  console.log(`Wrote report to ${OUT_FILE}`);
}

compute();
// ...existing code...