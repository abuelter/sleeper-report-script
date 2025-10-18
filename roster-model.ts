import { IdealRoster } from "./ideal-roster";
import { Player } from "./player-model";

export type Roster = {
    id: number;
    name: string;
    players: Player[];
    pointsFor: number;
    pointsAgainst: number;
    maxPoints: number;
    idealRoster?: IdealRoster;
}