#!/usr/bin/env node

import { inspect } from 'util';
import sade from 'sade';
import kleur from 'kleur';
import Board from './board.js';
import compile, { transpile } from './compile.js';

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
	rl.setPrompt(kleur.magenta('>') + ' ');
	rl.prompt();
	rl.on('line', async line => {
		count = 0;
		rl.pause();
		let code = line;
		try {
			code = transpile(code, null, false);
		} catch (e) {
			process.stdout.write(kleur.red('─'.repeat(e.loc.column) + '⌃') + '\n');
			process.stdout.write(kleur.red('ⓧ  ' + e.message.split('\n')[0].replace(/^unknown: /,'')) + '\n');
			rl.resume();
			rl.prompt(true);
			return;
		}
		try {
			process.stdout.write(kleur.dim('↤ ') + inspect(await board._exec(code), true, undefined, process.stdout.hasColors()) + '\n');
		} catch (e) {
			let msg = kleur.red('ⓧ  ' + e);
			if (e && e.stack) {
				const m = e.stack.match(/^\s*at line (\d+) col (\d+)\n.*\n\s*\^\s*\n(at line 1 col \d+\n.*eval\(".*|in function called from system)\n/);
				if (m) {
					process.stdout.write(kleur.red('┌' + '─'.repeat(m[2]|0) + '⌃') + '\n');
				} else {
					msg += '\n' + kleur.red(kleur.dim(e.stack));
				}
			}
			process.stdout.write(`${msg}\n`);
		}
		rl.resume();
		rl.prompt(false);
	});
	let count = 0;
	let pos;
	rl.on('SIGCONT', () => {
		console.log('SIGCONT');
	});
	async function reset() {
		rl.pause();
		await board._write(`\x03`);
		rl.resume();
		rl.prompt(false);
	}
	board.output.on('data', data => {
		process.stdout.write(kleur.white(data));
	});
	rl.on("SIGINT", async () => {
		// console.log(pos, { cursor: rl.cursor, line: rl.line });
		if (pos && (pos.cursor !== rl.cursor || pos.line !== rl.line)) {
			count = 0;
		}
		pos = { cursor: rl.cursor, line: rl.line };
		if (++count >= 2) {
			rl.close();
			process.stdout.write('\n');
			return process.emit('SIGINT');
		}
		process.stdout.write('\b\b' + kleur.dim('↤ ') + kleur.cyan(`Ctrl+C`) + kleur.dim(` sent reset. ${kleur.italic(`(press Ctrl+C again to exit)`)}`) + '\n');
		reset();
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
