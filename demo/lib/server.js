import http from 'http';
import { buffer } from './util.js';

const TIMEOUT = 10000;

export default function createServer(routes) {
	let server = http.createServer(handle);
	try {
		server.listen(80);
	} catch (e) {
		console.log('Unable to use port 80:', e);
		server.listen(8080);
	}

	function handle(req, res) {
		const method = (req.method || 'GET').toUpperCase();
		let fn = routes[method + ' ' + req.url];
		if (!fn) fn = routes.fallback;
		if (!fn) {
			res.writeHead(403, { 'content-type': 'text/plain' });
			return res.end('');
		}
		let timer = setTimeout(() => {
			clearTimer();
			try { res.end(); } catch (e) {}
		}, TIMEOUT);
		function clearTimer() {
			if (timer != null) clearTimeout(timer);
			timer = null;
		}
		let p = Promise.resolve();
		if (req.method && !/^(GET|HEAD|OPTIONS)$/.test(req.method)) {
			p = buffer(req).then(data => {
				try { data = JSON.parse(data); } catch (e) {}
				req.body = data;
			});
		}
		p.then(() => {
			if (res.cls) return Promise.reject('Request timed out');
			return fn(req, res);
		}).then(result => {
			if (res.cls) return clearTimer();
	
			let type = 'text/plain';
			if (result != null) {
				try {
					result = JSON.stringify(result);
					type = 'text/javascript';
				} catch (e) {}
				try {
					res.writeHead(200, { 'content-type': type });
				} catch (e) {}
				try {
					res.write(result);
				} catch (e) {}
			}
			try {
				res.end();
			} catch (e) {}
			clearTimer();
		}).catch(err => {
			try {
				res.writeHead(500, { 'content-type': 'text/plain' });
			} catch (e) {}
			err = err && err.stack ? `${err}\n\n${err.stack}` : String(err);
			res.end(/text\/html/.test(req.headers.Accept) ? err : JSON.stringify({ $error: err }));
			clearTimer();
		});
	}
	
	return server;
}
