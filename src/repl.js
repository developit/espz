import { inspect } from 'util';
import kleur from 'kleur';
import readline from 'readline';
import { transpile } from './compile.js';

/**
 * @param {object} options
 * @param {Board} [options.board]
 */
export async function repl({ board }) {
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
			// @ts-ignore-next
			return process.emit('SIGINT');
		}
		process.stdout.write('\b\b' + kleur.dim('↤ ') + kleur.cyan(`Ctrl+C`) + kleur.dim(` sent reset. ${kleur.italic(`(press Ctrl+C again to exit)`)}`) + '\n');
		reset();
	});
	return new Promise(resolve => {
		rl.on('close', resolve);
	});
}