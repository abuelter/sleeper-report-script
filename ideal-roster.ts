import { Player } from "./player-model";

export type IdealRoster = {
    QB: Player;
    RB1: Player;
    RB2: Player;
    WR1: Player;
    WR2: Player;
    WR3: Player;
    TE: Player;
    FLEX1: Player;
    FLEX2: Player;
    SUPER_FLEX: Player;
    BENCH: Player[];
}