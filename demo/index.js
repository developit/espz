import esp from 'ESP8266';
import wifi from 'Wifi';
import http from 'http';
import Storage from 'Storage';

const HOSTNAME = 'wemod1mini';
const SSID = 'developit';
const PASSWORD = 'blowgun76?reappointed';

// Disable logging (frees 1.2kb of heap)
esp.setLog(0);

const ROUTES = {
	'GET /': function(req, res) {
		//const f = E.openFile('index.html', 'r');
		const f = Storage.read('ui.html');
		res.writeHead(200, { 'content-type': 'text/html' });
		res.end(f);
		//f.pipe(res);
		//E.pipe(f, res);
	},
	'GET /api/receiver': function(req, res) {
		const f = `<Main_Zone><Basic_Status>GetParam</Basic_Status></Main_Zone>`;
		return yamaha('192.168.86.194', 'GET', f);
	},
	'POST /api/receiver/power': function(req, res) {
		const f = `<Main_Zone><Power_Control><Power>
			${req.body.on ? 'On' : 'Standby'}
		</Power></Power_Control></Main_Zone>`;
		return yamaha('192.168.86.194', 'PUT', f);
	},
	'GET /api/info': () => {
		const info = {};
		for (let i in INFO) info[i] = INFO[i]();
		return info;
	},
	'GET /api/info/device': () => INFO.device(),
	'GET /api/info/memory': () => INFO.memory(),
	'GET /api/info/wifi': () => INFO.wifi(),
	'GET /api/info/storage': () => INFO.storage(),
	fallback(req, res) {
		res.writeHead(404);
		res.end('Not found');
	}
};

function yamaha(ip, cmd, body) {
	return fetch(`http://${ip}/YamahaRemoteControl/ctrl`, {
		method: 'POST',
		body: `
			<?xml version="1.0" encoding="utf-8"?>
			<YAMAHA_AV cmd="${cmd}">
				${body}
			</YAMAHA_AV>
		`.replace(/\n+\s*/g, '')
	}).then(r => r.text()).then(xml => {
		xml = xml.replace(/^.*<YAMAHA_AV[^>]*>/, '').replace(/<\/YAMAHA_AV>$/, '');
		return xmlToJson(xml);
	});
}

const INFO = {
	device(req, res) {
		return {
			state: esp.getState(),
			flash: esp.getFreeFlash(),
			reset: esp.getResetInfo(),
			sockets: esp.dumpSocketInfo()
		};
	},
	memory(req, res) {
		return process.memory();
	},
	wifi(req, res) {
		const hostname = wifi.getHostname();
		const status = wifi.getStatus();
		const details = wifi.getDetails();
		delete details.password;
		return { hostname, status, details };
	},
	storage(req, res) {
		return { free: Storage.getFree(), list: Storage.list() };
	}
};



var server;

function startup() {
	console.log('Booting', E.getErrorFlags());
	connect((err, ssid, addr) => {
		if (err) return console.log('Error connecting to wifi:', err);
		console.log('Connected to', ssid);

		server = http.createServer(handle);
		try {
			server.listen(80);
		} catch (e) {
			console.log('Unable to use port 80:', e);
			server.listen(8080);
		}

		console.log('Listening on http://'+addr.ip+(server.port==80?'':':'+server.port));
	});
}

E.on('kill', () => {
	try {
		server.close();
	} catch (e) {
		console.log('Error shutting down server:', e);
	}
});

function handle(req, res) {
	const method = (req.method || 'GET').toUpperCase();
	let fn = ROUTES[method + ' ' + req.url];
	if (!fn) fn = ROUTES.fallback;
	let p = Promise.resolve();
	if (req.method && !/^(GET|HEAD|OPTIONS)$/.test(req.method)) {
		p = buffer(req).then(data => {
			try { data = JSON.parse(data); } catch (e) {}
			req.body = data;
		});
	}
	p.then(() => fn(req, res)).then(result => {
		if (res.cls) return;

		let type = 'text/plain';
		if (result != null) {
			try {
				result = JSON.stringify(result);
				type = 'text/javascript';
			} catch (e) {}
			try {
				res.writeHead(200, { 'content-type': type });
			} catch (e) {}
			res.write(result);
		}
		res.end();
	}).catch(err => {
		try {
			res.writeHead(500, { 'content-type': 'text/plain' });
		} catch (e) {}
		err = err && err.stack ? `${err}\n\n${err.stack}` : String(err);
		res.end(/text\/html/.test(req.headers.Accept) ? err : JSON.stringify({ $error: err }));
	});
}

function connect(callback) {
	var start;
	function check() {
		const addr = wifi.getIP();
		if (addr && addr.ip !== '0.0.0.0') {
			//wifi.save();
			return callback(null, SSID, addr);
		}
		if (Date.now() > start + 5000) {
			return callback('Timed out waiting for IP');
		}
		setTimeout(check, 50);
	}
	function c() {
		const details = wifi.getDetails();
		if (details.status === 'connected' && details.ssid === SSID) {
			start = Date.now();
			return setTimeout(check, 1);
		}
		console.log('Connecting to', SSID);
		wifi.connect(SSID, {password:PASSWORD}, e => {
			if (e) return callback(e);
			start = Date.now();
			setTimeout(check, 1);
		});
	}
	if (wifi.getHostname() !== HOSTNAME) {
		wifi.setHostname(HOSTNAME, c);
	} else {
		setTimeout(c, 1);
	}
}

function buffer(stream) {
	return new Promise((resolve, reject) => {
		let data = '', fulfilled = false;
		stream.on('data', c => { data += c; });
		function done() {
			if (fulfilled) return;
			fulfilled = true;
			resolve(data);
		}
		stream.on('end', done);
		stream.on('close', done);
		stream.on('error', reject);
	});
}

function fetch(url, options) {
	return new Promise((resolve, reject) => {
		options = options || {};
		const parsed = global.url.parse(url);
		const r = http.request({
			host: parsed.host,
			port: parsed.port || 80,
			path: parsed.path || '/',
			method: options.method || 'GET'
		}, resolve);
		r.on('error', reject);
		if (options.method && !/^(GET|HEAD)$/.test(options.method)) {
			r.write(options.body || '');
		}
		r.end();
	}).then(res => {
		let b;
		/** @returns {Promise<string>} */
		let text = () => b || (b = buffer(res));
		return {
			text,
			json: () => text().then(JSON.parse),
			status: res.statusCode | 0,
			ok: (res.statusCode/100|0) == 2,
			headers: Object.assign({ get: E.lookupNoCase.bind(res.headers) }, res.headers),
			response: res
		};
	});
}

// it's very important to use regex to parse xml
function xmlToJson(xml) {
	let reg = /([^<>]*)<([\/]*)([a-z0-9_]+)([^>]*)>/gi;
	let t;
	let last = {};
	let stack = [last];
	let value = '';
	while ((t = reg.exec(xml))) {
		if (t[1]) value += t[1].trim();
		if (t[2]) {  // end tag
			stack.pop();
			let n = stack[stack.length-1];
			n[t[3]] = Object.keys(last).length > 0 ? last : value;
			last = n;
		} else {
			value = '';
			last = {};
			//if (t[4]) last.attrs = t[4];
			stack.push(last);
		}
	}
	return last;
}

startup();
