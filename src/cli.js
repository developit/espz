#!/usr/bin/env node

import sade from 'sade';
import kleur from 'kleur';
import Board from './board.js';
import compile from './compile.js';

const DOCS_URL = 'http://www.espruino.com/json/espruino.json';
const BOARDS_URL = 'http://www.espruino.com/json/boards.json';
const BOARD_URL = 'http://www.espruino.com/json/%BOARD%.json';

/**
 * @typedef Context
 * @property {Board} board
 * @property {ReturnType<Board['info']>} boardInfo
 * @property {string[]} [files]
 */

/** @param {Context} ctx */
async function writeFile({ board, boardInfo, files }) {
	console.log(files);
	throw 'Not Implemented';
}

/** @param {Context} ctx */
async function info({ boardInfo }) {
	console.log(boardInfo);
}

import readline from 'readline';

/** @param {Context} ctx */
async function repl({ board }) {
	// board.connection.pipe(process.stdout);
	// const stdin = process.openStdin();
	// stdin.pipe(board.connection);
	const rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout
	});
	rl.setPrompt('> ');
	rl.prompt();
	rl.on('line', async line => {
		rl.pause();
		try {
			console.log(await board._exec(line));
		} catch (e) {
			console.error(e);
		}
		rl.resume();
		rl.prompt(false);
	})
	let count = 0;
	rl.on("SIGINT", () => {
		if (++count >= 2) process.emit('SIGINT');
		else board._write(`\x03`);
		//process.emit("SIGINT");
	});
	return new Promise(resolve => {
		rl.on('close', resolve);
	});
}

/** @param {Context} ctx */
async function build(ctx) {
	await compile(ctx);
}

const prog = sade('espruino')
	.option('address', 'TCP host to connect to (espruino.local:23)', 'espruino.local:23');

const run = cmd => async (str, opts) => {
	if (!opts) [opts, str] = [str, opts];
	opts._ = [].concat(str || [], opts._).filter(Boolean);
	try {
		opts.board = new Board(opts);
		const info = opts.boardInfo = await opts.board.init();
		process.stdout.write(`🔌 Connected to ${kleur.cyan(info.BOARD)} running Espruino ${kleur.cyan(info.VERSION)}\n`);
		const result = await cmd(opts);
		if (result != null) {
			console.log(result);
		}
		process.exit(0);
	} catch (err) {
		let msg = err && err.message || err;
		if (process.env.DEBUG) msg = err.stack;
		process.stderr.write(`\n${kleur.bold(kleur.red('Error:'))} ${msg}\n\n`);
		process.exit(1);
	}
}

prog.command('build [...files]', 'Compile modern JS modules for espruino', {alias:'compile', default:true})
	.option('files', 'One or more entry modules to be bundled together')
	.option('out', 'Filename to write bundled code to in device storage', 'index.js')
	.option('compress', 'Minify the result using Terser', true)
	.action(run(async opts => {
		opts.files = opts._.length ? opts._ : ['index.js'];
		return build(opts);
	}));

prog.command('info', 'Print device information').action(run(info));

prog.command('repl', 'Start Espruino REPL for the device').action(run(repl));

prog.command('write [...files]', 'Write file to device storage').action(run(writeFile));

prog.parse(process.argv);
