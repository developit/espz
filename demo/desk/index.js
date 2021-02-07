import Storage from 'Storage';
import { connect, connectionInfo } from '../lib/wifi.js';
import createServer from '../lib/server.js';
import { Desk } from './desk.js';
import * as config from './config.json';
import uiHtml from 'storage:./ui.html';

/** @type {ReturnType<createServer>} */
var server;

/** @type {Desk} */
var desk;

E.setConsole("Telnet");

E.on('kill', () => {
	try { server.close(); } catch (e) {}
	server = null;
	if (desk) desk.disconnect();
	desk = null;
});

const ROUTES = {
	'GET /'(req, res) {
		res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
		res.write(Storage.read(uiHtml));
		res.end();
	},
	'GET /api/info'(req, res) {
		const wifi = connectionInfo();
		return Object.assign({
			signal: 150 + 5/3*wifi.rssi|0,
			status: wifi.status,
			ssid: wifi.ssid
		}, desk.stats());
	},
	'GET /api/height'(req, res) {
		return desk.stats();
	},
	'POST /api/height'(req, res) {
		const height = req.body.height;
		if (String(Math.round(height)) !== height) return { error: 'Invalid height' };
		return desk.goToHeight(height)
			.then(stats => Object.assign({ done: true }, stats))
			.catch(err => Object.assign({ error: String(err) }, desk.stats()));
	},
	'POST /api/up'(req, res) {
		desk.up();
		return desk.stats();
	},
	'POST /api/down'(req, res) {
		desk.down();
		return desk.stats();
	},
	'POST /api/mem'(req, res) {
		desk.memory(req.body.button);
		return desk.stats();
	}
};

const wait = t => new Promise(r => setTimeout(r, t));

function start() {
	console.log('Desk starting');
	const errors = E.getErrorFlags();
	if (errors && errors.length) console.log('Error flags: ', errors);

	console.log('Connecting to: ', config.wifi);
	connect(config.wifi)
		.then(({ ssid, addr }) => {
			console.log('Connected: ', ssid, addr);

			server = createServer(ROUTES);
		
			const host = addr.ip + (server.port == 80 ? '' : ':' + server.port);
			console.log(`Listening on http://${host}`);
		})
		.then(() => wait(1000))
		.then(() => {
			console.log('Connecting to desk...');

			// LoopbackA.setConsole();
			E.setConsole("Telnet", { force: true });

			desk = new Desk({ serial: Serial1 });

			console.log('Running.');
		}).catch(err => {
			console.log('Error connecting to wifi:', err);
		});
}

process.on('uncaughtException', e => {
	print(`Uncaught error: ${e}${e.stack ? '\n' + e.stack : ''}`);
	if (desk) {
		console.log('Reconnecting to desk...');
		desk.reconnect();
	}
})

var didStart = false;
function boot() {
	if (didStart) return;
	didStart = true;
	setTimeout(start, 1000);
}
// fallback
// setTimeout(boot, 5000);
try {
	E.on('init', boot);
} catch (e) {}
