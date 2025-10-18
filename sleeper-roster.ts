/**
 * Represents a single roster object returned by the Sleeper API (example provided by user).
 */
export type SleeperRoster = {
	starters: string[]; // player IDs or team placeholder (e.g. "DET") in starting slots
	settings: {
		wins: number;
		waiver_position: number;
		waiver_budget_used: number;
		total_moves: number;
		ties: number;
		losses: number;
		fpts_decimal: number;
		fpts_against_decimal: number;
		fpts_against: number;
		fpts: number;
        ppts: number;
        ppts_decimal: number;
		// allow other numeric or string settings that might appear
		[key: string]: number | string | undefined;
	};
	roster_id: number;
	reserve: string[]; // list of player ids on the reserve/IR/taxi
	players: string[]; // all player ids on the roster (starters + reserves)
	owner_id: string;
	league_id: string;

	// Optional fields that some responses may include
	co_owners?: string[];
	// any additional properties from the API can be present
	[key: string]: unknown;
};

