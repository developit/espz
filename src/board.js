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

export default class Board {
	cmdCache = new Map();
	cmdId = 0;
	/** @type {{ expression: string, resolve(v: any): void, reject(e: any): void }[]} */
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
		return await this.info();
	}

	/** @returns {Promise<{ [key: string]: string, MODULES: string }>} */
	async info() {
		return await this._execCached(`process.env`);
	}

	async sendCode(code) {
		
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

					conn = new SerialPort(this.address, { baudRate: 115200 }, connected);
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
				console.log('error', err);
				// @ts-ignore-next
				if (err.code === 'ENOTFOUND') {
					return reject(Error(`Failed to connect to address ${host}:${port}`));
				}
				reject(err);
			});
		});
	}

	_handleData(data) {
		this.outputBuffer += data.toString('ascii');
		// don't commit until the device returns a prompt:
		if (this.outputBuffer[this.outputBuffer.length-1] !== '>') return;
		// this.outputBuffer = this.outputBuffer.replace(/(^|\n)(?:>.*?\r\n(?:\:.*?\r\n)*|Execution Interrupted during event processing\.\r\n)/g, '$1')
		this.outputBuffer = this.outputBuffer.replace(/(^|\n)>.*?\r\n(?:\:.*?\r\n)*/g, '$1')
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

	_execCached(expression) {
		if (this.cmdCache.has(expression)) return this.cmdCache.get(expression);
		const r = this._exec(expression);
		this.cmdCache.set(expression, r);
		return r;
	}

	_exec(/**@type {string}*/ expression) {
		return new Promise((resolve, reject) => {
			if (this.cmdQueue.push({ expression, resolve, reject }) === 1) {
				this._processQueue();
			}
		});
	}

	_written = [];
	_write(/**@type {string}*/ expression) {
		return new Promise((resolve, reject) => {
			this._written.push(expression);
			this.connection.write(expression, err => {
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

	async _recover() {
		return this._write('\x03\x03echo(1)\n');
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

		let buffer = '';
		const reg = new RegExp('(?:\\r\\n|\\r\\x1b\\[J|^)\\$(R|E)\\$' + id + ' (.*?)\\r\\n');
		const handler = data => {
			buffer += data.toString('ascii');
			// console.log('DATA: ', JSON.stringify(buffer));
			reg.lastIndex = 0;
			const result = reg.exec(buffer);
			if (!result) return;
			const value = result[2] === 'undefined' ? undefined : JSON.parse(result[2]);
			if (result[1] === 'E') {
				const err = new Error(value.message);
				err.stack = value.stack;
				cmd.reject(err);
			} else {
				cmd.resolve(value);
			}
			c.off('data', handler);
			setTimeout(() => this._processQueue(), 10);
		};
		c.on('data', handler);

		// const handleData = data => console.log('OUTPUT: ', data);
		// this.output.on('data', handleData);

		// Notes:
		// - leading "\x10" turns off line echo
		// - initial print() avoids returned output including a prompt and line clear escape code (">\x1b[J")
		try {
			await this._write(`\x10Promise.resolve().then(()=>eval(${JSON.stringify(cmd.expression)})).then(r=>print('$R$${id}',JSON.stringify(r))).catch(e=>print('$E$${id}',JSON.stringify({message:e.message,stack:e.stack})));\n`);
			// await this._write(`try{let $_=eval(${JSON.stringify(cmd.expression)});Promise.resolve().then(()=>$_).then(r=>print('$R$${id}',JSON.stringify(r)));}catch(e){print('$E$${id}',JSON.stringify({message:e.message,stack:e.stack}));}\n`);
			// await this._write(`try{print('$R$${id}',JSON.stringify(eval(${JSON.stringify(cmd.expression)})));}catch(e){print('$E$${id}',JSON.stringify({message:e.message,stack:e.stack}));}\n`);
		} catch (e) {
			c.off('data', handler);
			console.error(`Failed to execute command ${cmd.expression}: ${e}`);
			cmd.reject(e);
			return setTimeout(() => this._processQueue(), 10);
		}
	}
}
