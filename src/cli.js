#!/usr/bin/env node

import path from 'path';
import { promises as fs } from 'fs';
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
		for (const filename of files) {
			const to = JSON.stringify(path.basename(filename));
			const contents = await fs.readFile(filename, 'utf-8');
			console.log(`Writing ${to} (${Buffer.byteLength(contents)}b) ...`)
			await board._exec(`require('Storage').write(${to},${JSON.stringify(contents)});`);
			console.log(`... written.`)
		}
		console.log(`Finished writing ${files.length} files.`);
	},
	async info({ boardInfo }) {
		console.log(boardInfo);
	},
	async repl(ctx) {
		return repl(ctx);
	},
	async build(ctx) {
		await compile(ctx);
	},
	async send(ctx) {
		const { board } = ctx;
		const { code, assets } = await compile(ctx);
		function onData(data) {
			process.stdout.write(kleur.white(data));
		}
		board.output.on('data', onData);
		const wait = t => new Promise(r => setTimeout(r, t));
		try {
			await board._exec('42');
		} catch (e) {
			try {
				await board.resetPrompt();
			} catch (e) {
				console.log('failed to reset prompt: ', e);
			}
		}
		if (ctx.reset) {
			const hard = ctx.reset === 'hard' || ctx.reset === 'full';
			console.log(`Sending${hard?' hard':''} reset...`);
			try {
				await board._exec(hard ? 'reset(true)' : 'reset()');
				await wait(hard ? 2000 : 1000);
			} catch (e) {}
		}
		await board._exec('42');
		try {
			// await board._exec('reset()');
			for (const asset of assets) {
				const str = typeof asset.source === 'string' ? asset.source : Buffer.from(asset.source).toString('utf-8');
				console.log(`Writing ${asset.fileName} (${Buffer.byteLength(str)}b) ...`);
				await board._exec(`require('Storage').write(${JSON.stringify(asset.fileName)},${JSON.stringify(str)})`);
				process.stdout.write('\b ✅\n');
				await wait(1000);
				await board._exec('42');
			}
			if (ctx.reset) {
				try {
					await board._exec('reset()');
					await wait(1000);
					await board._exec('42');
				} catch (e) {}
			}
	
			console.log(`Sending compiled code (${Buffer.byteLength(code)}b)...`);
			if (ctx.boot) {
				console.log(await board._exec(`(global.BOOTCODE=${JSON.stringify(code)}, "done")`));
				console.log(`Writing code to ".bootcde" file...`);
				try {
					console.log(await board._exec(`setTimeout(function(){ E.setBootCode(global.BOOTCODE); delete global.BOOTCODE; print('rebooting'); E.reboot(); }, 1000) && "done"`));
					console.log('Setting bootcode (may take a few seconds)');
					await wait(10000);

					if (ctx.tail) {
						ctx.board = new Board(ctx);
						const info = ctx.boardInfo = await ctx.board.init();
						console.log(`Reconnected to ${info.BOARD}`);
					}
				} catch (e) {
					console.error('Error setting bootcode: ', e);
				}
				// } finally {
				// 	try {
				// 		console.log(await board._exec(`delete global.BOOTCODE`));
				// 	} catch (e) {
				// 		console.error(`Error cleaning BOOTCODE global: ${e}`);
				// 	}
				// }
				// console.log(`Rebooting device...`);
				// console.log(await board._exec(`E.reboot()`));
			} else {
				// console.log(await board._exec(code + (ctx.save ? '\n\nsave();' : '')));
				// console.log(await board._exec('\x10' + code));
				// console.log(await board._exec(code));
				console.log(await board._write('\x10' + code));
				console.log('transmitted, waiting 5s...');
				await wait(5000);
				console.log('Code sent, checking...');
				console.log(await board._exec('process.memory()'));
				console.log('Executed.');
				// await board._exec(`if (typeof onInit === 'function') onInit(); E.emit('init')`);
				await wait(500);
				if (ctx.save) {
					console.log('Saving...');
					console.log(await board._exec('save()'));
					await wait(2000);
					console.log('Save complete');
					console.log(await board._exec('process.memory()'));
				}
			}
		} catch (e) {
			process.stderr.write(kleur.red('Error:') + ' ' + e);
		} finally {
			board.output.removeListener('data', onData);
		}
		// ctx.board._exec(`require('Storage').write('.bootcde',${JSON.stringify(code)});`);
		console.log(`Done!`);

		if (ctx.tail) {
			return commands.repl(ctx);
		}
	}
};

const prog = sade('espz')
	.option('address', 'TCP host to connect to (espruino.local:23)', 'espruino.local:23');

const run = cmd => async (str, opts) => {
	if (!opts) [opts, str] = [str, opts];
	opts._ = [].concat(str || [], opts._).filter(Boolean);
	opts.reset = opts.reset !== 'false' && opts.reset || false;
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

prog.command('send [...files]', 'Compile and send modules to espruino')
	.option('files', 'One or more entry modules to be bundled together')
	.option('compress', 'Minify the result using Terser', true)
	.option('tail', 'Stay connected to the device in a REPL', false)
	.option('reset', 'Reset before sending (default is soft, "hard" for full reset)')
	.option('boot', 'Save code to be run at bootup, then reboot', false)
	.option('save', 'Call save() after sending code', false)
	.action(run(async opts => {
		opts.files = opts._.length ? opts._ : ['index.js'];
		return commands.send(opts);
	}));

prog.command('info', 'Print device information').action(run(commands.info));

prog.command('repl', 'Start Espruino REPL for the device').action(run(commands.repl));

prog.command('write [...files]', 'Write file to device storage').action(run(commands.write));

prog.parse(process.argv);
