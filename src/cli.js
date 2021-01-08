#!/usr/bin/env node

import sade from 'sade';
import kleur from 'kleur';
import Board from './board.js';
import { repl } from './repl.js';
import { compile } from './compile.js';

const DOCS_URL = 'http://www.espruino.com/json/espruino.json';
const BOARDS_URL = 'http://www.espruino.com/json/boards.json';
const BOARD_URL = 'http://www.espruino.com/json/%BOARD%.json';

/** @type {{ [key: string]: (ctx: Context) => Promise }} */
const commands = {
	async write({ board, boardInfo, files }) {
		console.log(files);
		throw 'Not Implemented';
	},
	async info({ boardInfo }) {
		console.log(boardInfo);
	},
	async repl(ctx) {
		return repl(ctx);
	},
	async build(ctx) {
		await compile(ctx);
	}
};

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
		return commands.build(opts);
	}));

prog.command('info', 'Print device information').action(run(commands.info));

prog.command('repl', 'Start Espruino REPL for the device').action(run(commands.repl));

prog.command('write [...files]', 'Write file to device storage').action(run(commands.write));

prog.parse(process.argv);
