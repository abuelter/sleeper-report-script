// ...existing code...
import fs from 'fs';
import path from 'path';
import { Roster } from './roster-model';

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
  const teamPosCounts: Record<number, Record<string, number>> = {};
  for (const r of rosters) {
    const ir = r.idealRoster as any;
    const totals: Record<string, number> = { QB: 0, RB: 0, WR: 0, TE: 0, FLEX: 0, SUPER_FLEX: 0 };
    const counts: Record<string, number> = { QB: 0, RB: 0, WR: 0, TE: 0, FLEX: 0, SUPER_FLEX: 0 };
    if (ir) {
      if (ir.QB && typeof ir.QB.avgPointsPerGame === 'number') { totals.QB += ir.QB.avgPointsPerGame; counts.QB += 1; }
      ['RB1', 'RB2'].forEach((k: any) => { if (ir[k] && typeof ir[k].avgPointsPerGame === 'number') { totals.RB += ir[k].avgPointsPerGame; counts.RB += 1; } });
      ['WR1', 'WR2', 'WR3'].forEach((k: any) => { if (ir[k] && typeof ir[k].avgPointsPerGame === 'number') { totals.WR += ir[k].avgPointsPerGame; counts.WR += 1; } });
      if (ir.TE && typeof ir.TE.avgPointsPerGame === 'number') { totals.TE += ir.TE.avgPointsPerGame; counts.TE += 1; }
      // FLEX slots go to FLEX total only
      ['FLEX1', 'FLEX2'].forEach((k: any) => {
        const p = ir[k];
        if (!p) return;
        if (typeof p.avgPointsPerGame === 'number') { totals.FLEX += p.avgPointsPerGame; counts.FLEX += 1; }
      });
      // SUPER_FLEX goes to SUPER_FLEX total only
      if (ir.SUPER_FLEX) {
        if (typeof ir.SUPER_FLEX.avgPointsPerGame === 'number') { totals.SUPER_FLEX += ir.SUPER_FLEX.avgPointsPerGame; counts.SUPER_FLEX += 1; }
      }
    }
    teamPosTotals[r.id] = totals;
    teamPosCounts[r.id] = counts;
  }

  // for each pos, create sorted ranking (include FLEX and SUPER_FLEX)
  const posRankings: Record<string, number[]> = {};
  for (const pos of ['QB', 'RB', 'WR', 'TE', 'FLEX', 'SUPER_FLEX']) {
    const arr = rosters.map(r => ({ id: r.id, val: teamPosTotals[r.id][pos] || 0 }));
    arr.sort((a, b) => b.val - a.val);
    posRankings[pos] = arr.map(a => a.id);
  }

  // compute ideal roster total per team (sum of starting slots excluding bench)
  const teamIdealTotals: Record<number, number> = {};
  for (const r of rosters) {
    const t = teamPosTotals[r.id] || { QB: 0, RB: 0, WR: 0, TE: 0, FLEX: 0, SUPER_FLEX: 0 };
    const total = (t.QB || 0) + (t.RB || 0) + (t.WR || 0) + (t.TE || 0) + (t.FLEX || 0) + (t.SUPER_FLEX || 0);
    teamIdealTotals[r.id] = total;
  }
  const idealTotalsSorted = [...rosters].map(r => ({ id: r.id, total: teamIdealTotals[r.id] || 0 })).sort((a, b) => b.total - a.total);

  function rankIdealIn(id: number) {
    return idealTotalsSorted.findIndex(x => x.id === id) + 1;
  }

  // --- New: compute AVG Bench Player Score Distance per team ---
  // For the 5 bench players, compute average of (benchPlayer.avgPointsPerGame - avgByPos[benchPos])
  // If bench has fewer than 5 players, average over however many are present. Missing avgByPos for a position will treat that position average as 0.
  const benchDistanceByTeam: Record<number, number> = {};
  for (const r of rosters) {
    const ir = r.idealRoster as any;
    const bench = (ir && Array.isArray(ir.BENCH)) ? ir.BENCH.slice(0, 5) : [];
    const diffs: number[] = [];
    for (const bp of bench) {
      const bpos = (bp.positions && bp.positions[0]) || 'UNK';
      const posKey = (bpos === 'FLEX' || bpos === 'SUPER_FLEX') ? bpos : bpos; // keep as-is
      const leagueAvg = typeof avgByPos[posKey] === 'number' ? avgByPos[posKey] : 0;
      const val = (typeof bp.avgPointsPerGame === 'number' ? bp.avgPointsPerGame : 0) - leagueAvg;
      diffs.push(val);
    }
    benchDistanceByTeam[r.id] = diffs.length > 0 ? diffs.reduce((a, b) => a + b, 0) / diffs.length : 0;
  }

  // rank teams by bench distance
  const benchRanking = [...rosters].map(r => ({ id: r.id, val: benchDistanceByTeam[r.id] || 0 })).sort((a, b) => b.val - a.val);
  const benchRankByTeam: Record<number, number> = {};
  benchRanking.forEach((x, idx) => { benchRankByTeam[x.id] = idx + 1; });

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

    // position totals and averages for this team
    const totals = teamPosTotals[r.id];
    const counts = teamPosCounts[r.id];
    lines.push('');
    lines.push('Position totals and averages:');
    for (const pos of ['QB', 'RB', 'WR', 'TE', 'FLEX', 'SUPER_FLEX']) {
      const total = totals[pos] || 0;
      const count = counts[pos] || 0;
      const average = count > 0 ? total / count : 0;
      lines.push(`- ${pos}: Total = ${formatNum(total)}, Count = ${count}, Average = ${formatNum(average)}`);
    }

  // AVG Bench Player Score Distance and rank
  const benchMetric = benchDistanceByTeam[r.id] || 0;
  const benchRank = benchRankByTeam[r.id] || 0;
  lines.push('');
  lines.push(`AVG Bench Player Score Distance: ${formatNum(benchMetric)} (Rank ${benchRank})`);

  // position ranks for this team (now includes FLEX and SUPER_FLEX)
  lines.push('');
  lines.push(`Position Ranks: QB Rank - ${getPosRank(r.id, 'QB')}, RB Rank - ${getPosRank(r.id, 'RB')}, WR Rank - ${getPosRank(r.id, 'WR')}, TE Rank - ${getPosRank(r.id, 'TE')}, FLEX Rank - ${getPosRank(r.id, 'FLEX')}, SUPER_FLEX Rank - ${getPosRank(r.id, 'SUPER_FLEX')}`);
  // ideal roster total and rank
  const idealTotal = teamIdealTotals[r.id] || 0;
  const idealRank = rankIdealIn(r.id);
  lines.push(`Ideal roster total (starting slots): ${formatNum(idealTotal)} (Rank ${idealRank})`);
  lines.push('');
  }

  fs.writeFileSync(OUT_FILE, lines.join('\n'));
  console.log(`Wrote report to ${OUT_FILE}`);
}

compute();
// ...existing code...