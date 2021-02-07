import esp from 'ESP8266';
import wifi from 'Wifi';
import Storage from 'Storage';
import htmlPage from 'storage:./index.html';
import createServer from '../lib/server.js';
import { fetch, pipe, xmlToJson } from '../lib/util.js';
import { connect } from '../lib/wifi.js';
import config from './config.json';

// Disable logging (frees 1.2kb of heap)
esp.setLog(0);

let LED = 1;
setInterval(() => {
	digitalWrite(D2, LED ^= 1);
}, 1000);

const ROUTES = {
	'GET /': function(req, res) {
		res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
		return pipe(htmlPage, res);
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

/** @type {ReturnType<createServer>} */
var server;

// E.setConsole("Telnet");

E.on('kill', () => {
	try { server.close(); } catch (e) {}
	server = null;
});

function startup() {
	console.log('Booting', E.getErrorFlags());
	connect(config.wifi).then(({ ssid, addr }) => {
		console.log('Connected to', ssid);

		server = createServer(ROUTES);

		const host = addr.ip + (server.port == 80 ? '' : ':' + server.port);
		console.log(`Listening on http://${host}`);
	}).catch(err => {
		console.log('Error connecting to wifi:', err);
	});
}

var didStart = false;
function boot() {
	if (didStart) return;
	didStart = true;
	setTimeout(startup, 1000);
}
try {
	E.on('init', boot);
} catch (e) {}
