type Board = InstanceType<typeof import('./board').default>;

declare interface Context {
	board: Board;
	boardInfo: ReturnType<Board['info']>;
	files: string[];
}
