import { connect } from 'net';
import { Readable } from 'stream';

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

	_ensureConnection() {
		return this.connection || this.pendingConnection || this._connect();
	}

	_connect() {
		return this.pendingConnection = new Promise((resolve, reject) => {
			const parsed = new URL(`http://${this.address}`);
			const host = parsed.hostname;
			const port = parseInt(parsed.port, 10) || 23;
			// console.log({ address, host, port });
			const c = connect({ host, port }, () => {
				if (this.connection)
					this.connection.end();

				this.cmdCache.clear();
				this.pendingConnection = null;
				this.connection = c;
				c.on('data', this._handleData.bind(this));
				resolve(c);
			});
			c.on('error', err => {
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
		this.outputBuffer = this.outputBuffer
			.replace(/(^|\n)(?:>.*?\r\n(?:\:.*?\r\n)*|Execution Interrupted during event processing\.\r\n)/g, '$1')
		const lines = /.*?\r\n/g;
		const isRepl = /^(?:=|\$[RE]\$\d+ )/;
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
			if (this.cmdQueue.push({ expression, resolve, reject }) === 1)
				this._processQueue();
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

	async _processQueue() {
		if (!this.cmdQueue.length)
			return;

		let c;
		try {
			c = await this._ensureConnection();
		} catch (e) {
			console.error(`Failed to connect (retrying in 5s): ${e}`);
			return setTimeout(this._processQueue.bind(this), 5000);
		}

		// sent Ctrl+C to reset the prompt
		try {
			await this._write(`\x03`);
		} catch (e) { }

		const cmd = this.cmdQueue.shift();
		const id = ++this.cmdId;
		try {
			//console.log(`WRITE: try{print('$R$${id}',JSON.stringify(\n${cmd.expression}\n));}catch(e){print('$E$${id}',JSON.stringify({message:e.message,stack:e.stack}));}`);
			await this._write(`Promise.resolve().then(()=>eval(${JSON.stringify(cmd.expression)})).then(r=>print('$R$${id}',JSON.stringify(r))).catch(e=>print('$E$${id}',JSON.stringify({message:e.message,stack:e.stack})));\n`);
			// await this._write(`try{let $_=eval(${JSON.stringify(cmd.expression)});Promise.resolve().then(()=>$_).then(r=>print('$R$${id}',JSON.stringify(r)));}catch(e){print('$E$${id}',JSON.stringify({message:e.message,stack:e.stack}));}\n`);
			// await this._write(`try{print('$R$${id}',JSON.stringify(eval(${JSON.stringify(cmd.expression)})));}catch(e){print('$E$${id}',JSON.stringify({message:e.message,stack:e.stack}));}\n`);
		} catch (e) {
			console.error(`Failed to execute command ${cmd.expression}: ${e}`);
			cmd.reject(e);
			return this._processQueue();
		}
		let buffer = '';
		const reg = new RegExp('(?:\\r\\n|^)\\$(R|E)\\$' + id + ' (.*?)\\r\\n');
		const handler = data => {
			buffer += data.toString('ascii');
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
			this._processQueue();
		};
		c.on('data', handler);
	}
}
