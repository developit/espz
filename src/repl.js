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
	let info = {};
	async function updateStats() {
		try {
			info = await board._exec('('+function(process, wifi, esp, Storage){
				return {
					memory: process.memory(),
					state: esp.getState(),
					flash: esp.getFreeFlash(),
					reset: esp.getResetInfo(),
					wifi: wifi.getDetails(),
					wifiStatus: wifi.getStatus(),
					hostname: wifi.getHostname(),
					storage: Storage.getFree()
				};
			}+')(process, require("Wifi"), require("ESP8266"), require("Storage"))');
		} catch (e) {
			e.count = (info.error && info.error.count || 0) + 1;
			info.error = e;
		}
		drawStats();
		setTimeout(updateStats, 2000);
	}
	setTimeout(updateStats, 1000);
	function drawStats() {
		let stats = '';
		try {
			if (info.memory) {
				const cpu = info.state.cpuFrequency;
				stats += `${cpu}${kleur.dim('mHz')}`;
				const memPercent = (info.memory.usage / info.memory.total) * 100 | 0;
				const memColor = memPercent>80 ? 'red' : memPercent>50 ? 'yellow' : 'green';
				const mem = `${kleur[memColor](info.memory.usage)}${kleur.dim('/'+info.memory.total)}b`;
				stats += ` ${mem}`;
				const wifi = '◢' + (150 + 5/3*info.wifi.rssi|0) + kleur.dim('%');  // 2 * info.wifi.rssi + 200
				stats += ` ${kleur.blue(wifi)}`;
				stats += ` | ${kleur.dim('💾')}${info.storage/1000|0}k${kleur.dim('/'+(info.state.flashKB/1000|0)+'M')}`;
				stats += ` ${kleur.dim('heap:')}${info.state.freeHeap}`;
				stats += ` ${kleur.dim('conn:')}${info.state.maxCon}`;
				// `SDK:${info.state.sdkVersion.replace(/\(.+\)/,'')}`
			}
		} catch (e) {}
		if (info && info.error) {
			stats += ` ⚠️ ${info.error.count}`;
		}
		process.stdout.write(`\u001B[s\u001B[${process.stdout.rows+1};1H⌬ ${stats}\u001B[u`);
		// rl.setPrompt(`\u001B[E${cpu}${stats}\u001B[F${kleur.magenta('>')} `);
		// rl.setPrompt(`${kleur.magenta('>')} \u001B[E${stats}\u001B[F`);
		// rl.prompt(true);
	}
	rl.on('line', async line => {
		if (line.trim() === 'exit') {
			rl.close();
			process.stdout.write('\n');
			// @ts-ignore-next
			return process.emit('SIGINT');
		}
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
			drawStats();
			return;
		}
		let timer = setTimeout(() => {
			process.stdout.write(kleur.red('No reponse in 5 seconds, terminating.') + '\n');
			board.resetPrompt();
			rl.resume();
			rl.prompt(false);
			drawStats();
		}, 5000);
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
		clearTimeout(timer);
		rl.resume();
		rl.prompt(false);
		drawStats();
	});
	let count = 0;
	let pos;
	// rl.on('SIGCONT', () => {
	// 	console.log('SIGCONT');
	// });
	async function reset() {
		rl.pause();
		await board.resetPrompt();
		rl.resume();
		rl.prompt(false);
		drawStats();
	}
	board.output.on('data', data => {
		process.stdout.write(kleur.white(data));
		drawStats();
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
		// process.stdout.write('\b\b' + kleur.dim('↤ ') + kleur.cyan(`Ctrl+C`) + kleur.italic(`(press Ctrl+C again to exit)`) + '\n');
	});
	return new Promise(resolve => {
		rl.on('close', resolve);
	});
}