import wifi from 'Wifi';

export function connectionInfo() {
	return wifi.getDetails();
}

let reconnectTimer;

let conn;

export function reconnect() {
	if (conn) return connect(conn);
}

wifi.on('disconnected', details => {
	console.log('Wifi disconnected: ' + details.reason);
	if (conn && conn.keepalive) {
		if (reconnectTimer) clearInterval(reconnectTimer);
		reconnectTimer = setInterval(reconnect, 60*1000);
	}
});

export function isConnected() {
	const details = wifi.getDetails();
	if (details.status !== 'connected' && details.status !== 'connecting') return false;
	return !conn || details.ssid === conn.ssid;
}

/**
 * Ensure a WiFi connection is established with the given credentials.
 * @returns {Promise<{ ssid: string, addr: { ip: string } }>}
 */
export function connect({ hostname, ssid, password, keepalive = true }) {
	return new Promise((resolve, reject) => {
		conn = { hostname, ssid, password, keepalive };
		var start, done;
		function check() {
			if (done) return;
			const addr = wifi.getIP();
			if (addr && addr.ip !== '0.0.0.0') {
				if (reconnectTimer) clearInterval(reconnectTimer);
				reconnectTimer = undefined;
				done = true;
				wifi.save();
				return resolve({ ssid, addr });
			}
			const now = Date.now();
			const elapsed = now - start;
			if (elapsed > 30*1000) {
				done = true;
				return reject(new Error('Timed out waiting for IP'));
			}
			setTimeout(check, elapsed >= 1000 ? 500 : 100);
		}
		function connected(e) {
			if (e) return reject(e);
			start = Date.now();
			setTimeout(check, 1);
		}
		function c() {
			const details = wifi.getDetails();
			if (details.status === 'connected' && details.ssid === ssid) {
				start = Date.now();
				return setTimeout(check, 50);
			}
			console.log('Connecting to', ssid);
			wifi.connect(ssid, {password}, connected);
		}
		if (wifi.getHostname() !== hostname) {
			wifi.setHostname(hostname, c);
		} else {
			setTimeout(c, 50);
		}
	});
}