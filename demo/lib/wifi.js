import wifi from 'Wifi';

// try {
// 	wifi.restore();
// } catch (e) {}

export function connectionInfo() {
	return wifi.getDetails();
}

/**
 * Ensure a WiFi connection is established with the given credentials.
 * @returns {Promise<{ ssid: string, addr: { ip: string } }>}
 */
export function connect({ hostname, ssid, password }) {
	const retry = () => connect({ hostname, ssid, password });

	wifi.on('disconnected', details => {
		console.log('disconnected', details);
		// details.reason === 'auth_fail' ??
		if (details.ssid === ssid) {
			wifi.disconnect(retry);
		}
	});

	return new Promise((resolve, reject) => {
		var start, done;
		function check() {
			if (done) return;
			const addr = wifi.getIP();
			if (addr && addr.ip !== '0.0.0.0') {
				done = true;
				wifi.save();
				return resolve({ ssid, addr });
			}
			if (Date.now() > start + 5000) {
				done = true;
				return reject(new Error('Timed out waiting for IP'));
			}
			setTimeout(check, 50);
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
				return setTimeout(check, 1);
			}
			console.log('Connecting to', ssid);
			wifi.connect(ssid, {password}, connected);
		}
		if (wifi.getHostname() !== hostname) {
			wifi.setHostname(hostname, c);
		} else {
			setTimeout(c, 1);
		}
	});
}