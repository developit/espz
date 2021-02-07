import http from 'http';
import Storage from 'Storage';

/** Sortof a fetch polyfill */
export function fetch(url, options) {
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


/** Collect a stream into a String */
export function buffer(stream) {
	return new Promise((resolve, reject) => {
		let data = '', fulfilled = false;
		stream.on('data', c => { data += c; });
		const done = () => {
			if (fulfilled) return;
			fulfilled = true;
			resolve(data);
		};
		stream.on('end', done);
		stream.on('close', done);
		stream.on('error', reject);
	});
}


/** Pipe a Storage file to an output stream */
export function pipe(fileName, to, chunkSize = 1024) {
	return new Promise(resolve => {
		let offset = 0;
		// const start = Date.now();
		// let b = 0;
		while (1) {
			let d = Storage.read(fileName, offset, chunkSize);
			if (d === undefined) break;
			// b += d.length;
			// console.log('writing ' + d.length + 'b...');
			to.write(d);
			offset += chunkSize;
			if (d.length < chunkSize) break;
		}
		// console.log('wrote ' + b + 'b in ' + (Date.now() - start) + 'ms');
		resolve();
	});
}
// function pipe(file, to) {
// 	return new Promise(resolve => {
// 		//E.pipe(file, to, { complete: resolve })
// 		let d, b;
// 		while ((d = file.read(64)) !== undefined) {
// 			b += d.length;
// 			console.log('writing ' + d.length + 'b...');
// 			to.write(d);
// 			if (d.length < 64) break;
// 		}
// 		console.log('wrote ' + b + 'b.');
// 		resolve();
// 	});
// }


// it's very important to use regex to parse xml
export function xmlToJson(xml) {
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
