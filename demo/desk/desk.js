
const SEND_FIRST = 0xD8;
const SEND_SECOND = 0x66;
const SEND_LENGTH = 5;

// const RECEIVE_FIRST = 0x98;
// const RECEIVE_SECOND = 0x00;
// const RECEIVE_SECOND_ALT = 0x03;
// const RECEIVE_LENGTH = 6;

function cmd(a, b) {
	const arr = new Uint8Array(SEND_LENGTH);
	arr[0] = arr[1] = SEND_FIRST;
	arr[2] = SEND_SECOND;
	arr[3] = a;
	arr[4] = b;
	return arr;
}

const CMD = {
	NOOP: cmd(0x00, 0x00),
	UP: cmd(0x02, 0x02),
	DOWN: cmd(0x01, 0x01),
	M1: cmd(0x04, 0x04),
	M2: cmd(0x08, 0x08),
	M3: cmd(0x10, 0x10),
	M4: cmd(0x20, 0x20),
	M: cmd(0x40, 0x40)
};

// Height range in cm/bytes
const HEIGHT_MIN = 75;  // 0x4B
const HEIGHT_MAX = 123; // 0x7B

export class Desk {
	constructor({ serial }) {
		this.lastSerialData = '';
		this.height = -1;
		this.moveTimer = null;
		this.serial = serial;
		this._onSerial = e => {
			try {
				this._handleSerialData(e);
			} catch (e) {
				console.log('Serial handler error: ', e);
			}
		};
		this.connect();

		this._scheduleId = 0;
		this.scheduledEvents = [];
		this.scheduleTimer = setInterval(this.runSchedule.bind(this), 60 * 1000);
	}

	runSchedule() {
		const now = Date.now();
		for (let i=0; i<this.scheduledEvents.length; i++) {
			const ev = this.scheduledEvents[i];
			if (ev.time <= now) {
				this.scheduledEvents.splice(i, 1);
				this.goTo(ev.height);
				return;
			}
		}
	}

	reconnect() {
		try { this.disconnect(); } catch (e) {}
		this.connect();
	}

	connect() {
		this.serial.setup(9600);
		this.serial.on('data', this._onSerial);
	}

	disconnect() {
		this.serial.removeListener('data', this._onSerial);
		try {
			this.serial.unsetup();
		} catch (e) {
			console.log('Failed to unsetup Serial: ' + e);
		}
	}

	stats() {
		return { height: this.height };
	}

	up() {
		return this._cmd('UP');
	}

	down() {
		return this._cmd('DOWN');
	}

	memory(button) {
		return this._cmd('M' + button);
	}

	goToHeight(height) {
		let start = Date.now();
		this._cancelMove();
		height = Math.min(HEIGHT_MAX, Math.max(HEIGHT_MIN, height));
		if (Math.abs(height - this.height) < 1) {
			// console.log('Already at height: ', height);
			return Promise.resolve(this.stats());
		}
		const direction = height > this.height ? 'UP' : 'DOWN';
		return new Promise((resolve, reject) => {
			this.serial.write(CMD.NOOP);
			this.serial.write(CMD[direction]);
			const frame = () => {
				if (direction === 'UP' ? (this.height >= (height - 1)) : (this.height <= (height + 1))) {
					this._cancelMove();
					setTimeout(() => {
						resolve(this.stats());
					}, 200);
				} else if (Date.now() - start > 10000) {
					reject(Error('Safety time-out'));
				} else {
					// console.log('moving ' + direction + ' (' + this.height + ')');
					this.serial.write(CMD[direction]);
				}
			};
			this.moveTimer = setInterval(frame, 500);
		});
	}

	async goTo(presetOrHeight) {
		if (typeof presetOrHeight === 'string') {
			return this.memory(presetOrHeight.substring(1));
		} else {
			return this.goToHeight(presetOrHeight);
		}
	}

	async schedule(height, time) {
		time -= time % 60000;
		for (let i = 0; i < this.scheduledEvents.length; i++) {
			const ev = this.scheduledEvents[i];
			if (ev.time === time) {
				ev.height = height;
				return { updated: ev };
			}
		}
		const ev = {
			id: ++this._scheduleId,
			height,
			time
		};
		this.scheduledEvents.push(ev);
		return { scheduled: ev };
	}

	async goToForMinutes(height, minutes) {
		const time = (Math.ceil(Date.now() / 60000) * 60000) + minutes * 60000;
		const oldHeight = this.height;
		this.goTo(height);
		return this.schedule(oldHeight, time);
	}

	// async goToForTime(height, time) {
	// 	time = Math.min(1, Math.round(time)) * 60 * 1000;
	// 	this._previousHeight = this.height;
	// 	this.goTo(height);
	// 	this._routineTimer = setTimeout(this._restorePreviousHeight, time);
	// }
	// _restorePreviousHeight() {
	// 	if (this._routineTimer) {
	// 		clearTimeout(this._routineTimer);
	// 		this._routineTimer = null;
	// 	}
	// 	const prev = this._previousHeight;
	// 	this._previousHeight = undefined;
	// 	return this.goToHeight(prev);
	// }

	_cancelMove() {
		if (this.moveTimer != null) {
			clearInterval(this.moveTimer);
			this.moveTimer = null;
		}
	}

	_cmd(name) {
		this._cancelMove();
		this.serial.write(CMD.NOOP);
		this.serial.write(CMD[name]);
	}

	_updateHeight(height) {
		// if (height !== this.height) console.log(`Height: ${height}`);
		this.height = height;
	}

	_handleSerialData(data) {
		if (data === this.lastSerialData) {
			// global.SKIPS = (global.SKIPS || 0) + 1;
			return;
		}
		this.lastSerialData = data;
		// global.lastSerialData = data;
		// global.RECVS = (global.RECVS || 0) + 1;
		try {
			let index = 0;
			while ((index = data.indexOf('\x98\x98', index)) !== -1) {
				index += 2;
				let op = data[index];
				if (op !== '\x00' && op !== '\x03') continue;
				if (data[index+1] !== op) continue;
				let b1 = data.charCodeAt(index+2);
				index += 4;
				this._updateHeight(b1);
			}
		} catch (e) {
			if (String(e) !== String(global.lastError)) console.log('read error: ', e);
			global.lastError = e;
		}
	}
}
