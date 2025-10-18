import { rosterIdToNameMap } from "./rosterIdToNameMap";
import { Roster } from "./roster-model";
import { Player } from "./player-model";
import { IdealRoster } from "./ideal-roster";
import { SleeperRoster } from "./sleeper-roster";
import axios from "axios";
import SleeperPlayer from "./sleeper-player";

const LEAGUE_ID = '1181337237559631872';
const SLEEPER_ROSTER_API_URL = `https://api.sleeper.app/v1/league/${LEAGUE_ID}/rosters`;
const SLEEPER_PLAYER_API_URL = 'https://api.sleeper.com/stats/nfl/player/';

main();

async function main() {
    const rosters = await getRosters();
    const processedRosters = await generateRostersFromSleeperRosterData(rosters);
    writeRostersToFile(processedRosters);
}

async function getRosters() {
    const res = await axios.get<SleeperRoster[]>(SLEEPER_ROSTER_API_URL);
    return res.data;
}

async function getPlayer(playerId: string): Promise<SleeperPlayer> {
    const res = await axios.get<SleeperPlayer>(`${SLEEPER_PLAYER_API_URL}${playerId}?season_type=regular&season=2025`);
    const playerData = res.data;
    return playerData;
}

function getNameFromRosterId(rosterId: number): string {
    return rosterIdToNameMap[rosterId] || `Roster ${rosterId}`;
}

async function getPlayersFromSleeperRoster(sleeperRoster: SleeperRoster): Promise<Player[]> {
    const playerArray: Player[] = [];
    for (const playerId of sleeperRoster.players) {
        const sleeperPlayer = await getPlayer(playerId);
        if (sleeperPlayer) {
            const player: Player = {
                name: `${sleeperPlayer.player.first_name} ${sleeperPlayer.player.last_name}`,
                gamesPlayed: sleeperPlayer.stats.gp || 0,
                half_ppr_points: sleeperPlayer.stats.pts_half_ppr || 0,
                playerId: sleeperPlayer.player_id,
                positions: sleeperPlayer.player.fantasy_positions,
                avgPointsPerGame: sleeperPlayer.stats.gp === 0 ? 0 : (sleeperPlayer.stats.pts_half_ppr || 0) / sleeperPlayer.stats.gp,
            };
            playerArray.push(player);
        } else {
            console.warn(`Player data not found for player ID: ${playerId}`);
        }
    }
    return playerArray;
}

async function generateRostersFromSleeperRosterData(sleeperRosters: SleeperRoster[]): Promise<Roster[]> {
    const rosters: Roster[] = [];
    for (const sRoster of sleeperRosters) {
    const newRoster: Roster = {
            id: sRoster.roster_id,
            name: getNameFromRosterId(sRoster.roster_id),
            players: await getPlayersFromSleeperRoster(sRoster),
            pointsFor: Number(`${sRoster.settings.fpts.toString()}.${sRoster.settings.fpts_decimal.toString()}`),
            pointsAgainst: Number(`${sRoster.settings.fpts_against.toString()}.${sRoster.settings.fpts_against_decimal.toString()}`),
            maxPoints: Number(`${sRoster.settings.ppts.toString()}.${sRoster.settings.ppts_decimal.toString()}`)
    };
    // compute ideal roster for this team
    newRoster.idealRoster = computeIdealRoster(newRoster);
    rosters.push(newRoster);
    }
    return rosters;
}

function createEmptyPlayer(): Player {
    return {
        name: 'Empty',
        gamesPlayed: 0,
        half_ppr_points: 0,
        playerId: '',
        positions: [],
        avgPointsPerGame: 0
    };
}

function pickBest(players: Player[], used: Set<string>, predicate: (p: Player) => boolean): Player | null {
    const sorted = [...players].sort((a, b) => (b.avgPointsPerGame || 0) - (a.avgPointsPerGame || 0));
    for (const p of sorted) {
        if (used.has(p.playerId)) continue;
        if (predicate(p)) return p;
    }
    return null;
}

function computeIdealRoster(roster: Roster): IdealRoster {
    const used = new Set<string>();
    const players = roster.players || [];

    // QB
    const qb = pickBest(players, used, p => p.positions && p.positions.includes('QB')) || createEmptyPlayer();
    if (qb.playerId) used.add(qb.playerId);

    // RB1 and RB2
    const rb1 = pickBest(players, used, p => p.positions && p.positions.includes('RB')) || createEmptyPlayer();
    if (rb1.playerId) used.add(rb1.playerId);
    const rb2 = pickBest(players, used, p => p.positions && p.positions.includes('RB')) || createEmptyPlayer();
    if (rb2.playerId) used.add(rb2.playerId);

    // WR1 WR2 WR3
    const wr1 = pickBest(players, used, p => p.positions && p.positions.includes('WR')) || createEmptyPlayer();
    if (wr1.playerId) used.add(wr1.playerId);
    const wr2 = pickBest(players, used, p => p.positions && p.positions.includes('WR')) || createEmptyPlayer();
    if (wr2.playerId) used.add(wr2.playerId);
    const wr3 = pickBest(players, used, p => p.positions && p.positions.includes('WR')) || createEmptyPlayer();
    if (wr3.playerId) used.add(wr3.playerId);

    // TE
    const te = pickBest(players, used, p => p.positions && p.positions.includes('TE')) || createEmptyPlayer();
    if (te.playerId) used.add(te.playerId);

    // SUPER_FLEX: highest scoring remaining player regardless of position
    const superFlex = pickBest(players, used, _ => true) || createEmptyPlayer();
    if (superFlex.playerId) used.add(superFlex.playerId);

    // FLEX1 and FLEX2: highest scoring remaining players who are NOT QBs
    const flex1 = pickBest(players, used, p => !(p.positions && p.positions.includes('QB'))) || createEmptyPlayer();
    if (flex1.playerId) used.add(flex1.playerId);
    const flex2 = pickBest(players, used, p => !(p.positions && p.positions.includes('QB'))) || createEmptyPlayer();
    if (flex2.playerId) used.add(flex2.playerId);

    // BENCH: next 5 highest scoring players not assigned yet
    const remaining = [...players]
        .filter(p => !used.has(p.playerId))
        .sort((a, b) => (b.avgPointsPerGame || 0) - (a.avgPointsPerGame || 0));
    const BENCH = remaining.slice(0, 5).map(p => p || createEmptyPlayer());

    return {
        QB: qb,
        RB1: rb1,
        RB2: rb2,
        WR1: wr1,
        WR2: wr2,
        WR3: wr3,
        TE: te,
        FLEX1: flex1,
        FLEX2: flex2,
        SUPER_FLEX: superFlex,
        BENCH
    };
}

function writeRostersToFile(rosters: Roster[]) {
    const fs = require('fs');
    fs.writeFileSync('rosters.json', JSON.stringify(rosters, null, 2));
}