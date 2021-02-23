// import { promises as fs, constants, openSync, closeSync } from 'fs';
// import { connect, createConnection, Socket } from 'net';
// import { ReadStream, WriteStream } from 'tty';
// import { connect, Socket } from 'net';
import { connect } from 'net';
import { Readable } from 'stream';
// import SerialPort from 'serialport';
import SerialPort from '@serialport/stream';
import Binding from '@serialport/bindings';
SerialPort.Binding = Binding;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

export default class Board {
	cmdCache = new Map();
	cmdId = 0;
	/** @type {{ expression: string, resolve(v: any): void, reject(e: any): void, timeout?: number }[]} */
	cmdQueue = [];

	/** @type {import('net').Socket} */
	connection = null;
	/** @type {Promise<import('net').Socket>} */
	pendingConnection = null;

	constructor({ type, address }) {
		this.type = type;
		this.address = address;
		this.outputBuffer = '';
		this.output = new Readable({ encoding: 'ascii', read(){} });
	}

	async init() {
		try {
			await this._ensureConnection();
			try { await this._exec('42', { timeout: 5000 }); } catch (e) {}
			try {
				return await this.info({ cache: false, timeout: 2000 });
			} catch (e) {}
			console.log('Trying to reset before connecting...');
			try {
				await sleep(50);
				await this._exec('\x03', { timeout: 5000 });
				await sleep(500);
				return await this.info({ cache: false, timeout: 2000 });
			} catch (e) {}
			console.log('Still trying to connect...');
			await this._write('\x03');
			await sleep(1000);
			return await this.info({ cache: false, timeout: 5000 });
		} finally {
			await sleep(500);
		}
	}

	/** @returns {Promise<{ [key: string]: string, BOARD: string, MODULES: string }>} */
	async info(opts) {
		return this._execCached('process.env', opts);
	}

	async gc() {
		return this._exec(`global['\\xFF'].history=[];process.memory();undefined;`);
	}

	async sendCode(code) {
		
	}

	/** @param {string} fileName @param {string} contents */
	async writeFile(fileName, contents) {
		const f = JSON.stringify(fileName);
		const large = contents.length > 1000;
		const after = large ? `,0,${contents.length}` : '';
		const substr = contents.substring(0, 1000);
		await this._exec(`require('Storage').write(${f},${JSON.stringify(substr)}${after})`);
		// @TODO - make this loop synchronous and get sequenced buffered writes?
		for (let i = 1000; i < contents.length; i += 1000) {
			const substr = contents.substring(i, i + 1000);
			await this._exec(`require('Storage').write(${f},${JSON.stringify(substr)},${i})`);
		}
	}


	_ensureConnection() {
		return this.connection || this.pendingConnection || this._connect();
	}

	_connect() {
		return this.pendingConnection = new Promise((resolve, reject) => {
			let parsed, host, port, conn;

			const connected = () => {
				if (this.connection) this.connection.end();
				this.cmdCache.clear();
				this.pendingConnection = null;
				this.connection = conn;
				conn.on('data', this._handleData.bind(this));
				resolve(conn);
			};

			try {
				if (this.address[0] === '/') {
					// console.log(this.address);
					// const desc = await fs.open(this.address, constants.O_RDONLY | constants.O_NONBLOCK);
					// console.log(this.address, desc);
					// const fd = openSync(this.address, constants.O_NOCTTY | constants.O_NONBLOCK | constants.O_DIRECT);
					// conn = {
					// 	// fd,
					// 	host: 'tcp://' + this.address,
					// 	port: 23
					// 	// fd: desc.fd,
					// 	// path: this.address,
					// 	// readable: true,
					// 	// writable: true
					// };

					// let fd = openSync(this.address, constants.O_RDONLY | constants.O_NONBLOCK);
					// const cleanup = () => {
					// 	if (fd == null) return;
					// 	console.log('releasing fd ' + fd);
					// 	try { closeSync(fd); } catch (e) { console.error(e); }
					// 	fd = null;
					// };
					// process.on('beforeExit', cleanup);
					// process.on('exit', cleanup);
					// conn = new ReadStream(fd, { writable: true, readable: true, allowHalfOpen: true });
					// conn.resume();
					// conn = new Socket({ fd, allowHalfOpen: true, readable: true, writable: true });

					// conn.setEncoding('utf8');
					// setTimeout(() => conn.resume());

					conn = new SerialPort(this.address, {
						baudRate: 115200,
						lock: false,
						// rtscts: true,
						// xon: true,
						// xoff: true,
						// xany: true,
						// highWaterMark: 999999
						highWaterMark: 23
					}, connected);
					// conn.on('readable', () => conn.resume());
					// conn.on('drain', () => conn.resume());
				} else {
					parsed = new URL(`http://${this.address}`);
					host = parsed.hostname;
					port = parseInt(parsed.port, 10) || 23;
					conn = connect({ host, port }, connected);
				}
			} catch (e) {
				console.error(e);
			}
			conn.on('error', err => {
				console.log('Connection Error: ', err);
				// @ts-ignore-next
				if (err.code === 'ENOTFOUND') {
					return reject(Error(`Failed to connect to address ${host}:${port}`));
				}
				reject(err);
			});
		});
	}

	_handleData(data) {
		// console.log(data.toString('ascii'));
		this.outputBuffer += data.toString('ascii');
		// don't commit until the device returns a prompt:
		if (this.outputBuffer[this.outputBuffer.length-1] !== '>') return;
		// this.outputBuffer = this.outputBuffer.replace(/(^|\n)(?:>.*?\r\n(?:\:.*?\r\n)*|Execution Interrupted during event processing\.\r\n)/g, '$1')
		// this.lastBuffer = this.outputBuffer;
		this.outputBuffer = this.outputBuffer.replace(/(^|\n)>.*?\r\n(?:\:.*?\r\n)*/g, '$1');
		// this.lastBufferMassaged = this.outputBuffer;
		const lines = /.*?\r\n/g;
		const isRepl = /^(?:=|(?:\x1b\[J)?\$[RE]\$\d+ )/;
		let line;
		let index = 0;
		while (line = lines.exec(this.outputBuffer)) {
			index = lines.lastIndex;
			if (isRepl.test(line[0])) continue;
			this.output.push(line[0]);
		}
		if (index) this.outputBuffer = this.outputBuffer.substring(index);
	}

	_execCached(expression, opts) {
		const allowCache = !opts || opts.cache !== false;
		if (allowCache && this.cmdCache.has(expression)) return this.cmdCache.get(expression);
		const r = this._exec(expression, opts);
		this.cmdCache.set(expression, r);
		return r;
	}

	_exec(/**@type {string}*/ expression, { timeout = 0 } = {}) {
		return new Promise((resolve, reject) => {
			if (this.cmdQueue.push({ expression, resolve, reject, timeout }) === 1) {
				this._processQueue();
			}
		});
	}

	_written = [];
	_write(/**@type {string}*/ expression, { timeout = 0 } = {}) {
		return new Promise((resolve, reject) => {
			let timer;
			if (timeout && timeout > 0) {
				timer = setTimeout(() => {
					reject(Error('Timed out'));
				}, timeout);
			}
			this._written.push(expression);
			this.connection.write(expression, err => {
				clearTimeout(timer);
				if (err) reject(err);
				else resolve();
			});
		});
	}

	// Attempst to send Ctrl+C to reset the prompt
	async resetPrompt() {
		try {
			await this._write(`\x03`);
		} catch (e) { }
	}

	async recover(opts) {
		return this._write('\x03\x03echo(1)\n', opts);
	}

	async _processQueue() {
		if (!this.cmdQueue.length) return;

		let c;
		try {
			c = await this._ensureConnection();
		} catch (e) {
			console.error(`Failed to connect (retrying in 5s): ${e}`);
			return setTimeout(this._processQueue.bind(this), 5000);
		}

		// await this.resetPrompt();

		const cmd = this.cmdQueue.shift();
		const id = ++this.cmdId;

		let timer;
		if (cmd.timeout && cmd.timeout > 0) {
			timer = setTimeout(() => {
				done(Error('Timed out'));
			}, cmd.timeout);
		}

		const done = (err, data) => {
			clearTimeout(timer);
			c.off('data', handler);
			if (err) cmd.reject(err);
			else cmd.resolve(data);
			setTimeout(() => this._processQueue(), 20);
		};

		let buffer = '';
		const reg = new RegExp('(?:\\r\\n|\\r\\x1b\\[J|^)\\$(R|E)\\$' + id + ' (.*?)\\r\\n');
		const handler = data => {
			buffer += data.toString('ascii');
			// console.log('DATA: ', JSON.stringify(buffer));
			reg.lastIndex = 0;
			const result = reg.exec(buffer);
			if (!result) return;
			let value, parseError;
			if (result[2] !== 'undefined') {
				try {
					value = JSON.parse(result[2]);
				} catch (e) {
					parseError = e;
					// console.log(this.lastBuffer);
					// console.log(this.lastBufferMassaged);
				}
			}
			if (parseError) {
				const err = new Error('Failed to parse response: ' + parseError.message + '\n  ' + result[2]);
				done(err);
			} else if (result[1] === 'E') {
				const err = new Error(value.message);
				err.stack = value.stack;
				done(err);
			} else {
				done(null, value);
			}
		};
		c.on('data', handler);

		// const handleData = data => console.log('OUTPUT: ', data);
		// this.output.on('data', handleData);

		// Notes:
		// - leading "\x10" turns off line echo
		// - initial print() avoids returned output including a prompt and line clear escape code (">\x1b[J")
		try {
			// await this._write(`\x10_$=eval.bind(null,${JSON.stringify(cmd.expression.replace(/[\s;]+$/g, ''))});Promise.resolve().then(function(){try{return _$()}catch(e){return Promise.reject(e);}}).then(r=>print('$R$${id}',JSON.stringify(r))).catch(e=>print('$E$${id}',JSON.stringify({message:e.message,stack:e.stack})))\n`);
			const expr = cmd.expression.replace(/[\s;]+$/g, '');
			// if (expr[0] === '\x10') {
			// 	await this._write(`\x10try{\n${expr.slice(1)}\nprint('$R$${id}',JSON.stringify(null))}catch(e){print('$E$${id}',JSON.stringify({message:e.message,stack:e.stack}))}\n`);
			// } else {
			await this._write(`\x10Promise.resolve().then(function(){try{return global.eval(${JSON.stringify(expr)})}catch(e){return Promise.reject(e);}}).then(r=>print('$R$${id}',JSON.stringify(r))).catch(e=>print('$E$${id}',JSON.stringify({message:e.message,stack:e.stack})))\n`);
			// }
			// await this._write(`try{let $_=eval(${JSON.stringify(cmd.expression)});Promise.resolve().then(()=>$_).then(r=>print('$R$${id}',JSON.stringify(r)));}catch(e){print('$E$${id}',JSON.stringify({message:e.message,stack:e.stack}));}\n`);
			// await this._write(`try{print('$R$${id}',JSON.stringify(eval(${JSON.stringify(cmd.expression)})));}catch(e){print('$E$${id}',JSON.stringify({message:e.message,stack:e.stack}));}\n`);
		} catch (e) {
			console.error(`Failed to execute command ${cmd.expression}: ${e}`);
			done(e);
		}
	}
}
