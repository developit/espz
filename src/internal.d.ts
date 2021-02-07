type Board = InstanceType<typeof import('./board').default>;

declare interface Context {
	board: Board;
	boardInfo: {
		[key: string]: string;
		BOARD: string,
		MODULES: string
	};
	files: string[];
	tail?: boolean;
	reset?: boolean | 'hard' | 'full';
	save?: boolean;
	boot?: boolean;
}
