import http from 'http';
import https from 'https';

/**
 * @param {string | URL} url
 * @param {{ method?: string, body?: string, headers?: Record<string,string>, maxRedirects?: number }} [options]
 */
export async function fetch(url, options) {
	options = options || {};
	const parsedUrl = new URL(String(url));
	/**@type {import('http').IncomingMessage}*/
	const res = await new Promise((resolve, reject) => {
		const r = (parsedUrl.protocol === 'http:' ? http : https).request({
			host: parsedUrl.host,
			port: parsedUrl.port || 80,
			path: parsedUrl.pathname || '/',
			method: options.method || 'GET',
			headers: options.headers
		}, resolve);
		r.on('error', reject);
		// if (options.method && !/^(GET|HEAD)$/i.test(options.method)) r.write(options.body || '');
		r.end(options.body);
	});
	if (res.headers.location) {
		const redirect = new URL(res.headers.location, url).href;
		if (redirect !== parsedUrl.href) {
			const count = options.maxRedirects || 10;
			if (!count) throw Error('Maximum redirects reached.');
			res.destroy();
			return fetch(redirect, { ...options, method: 'GET', body: undefined, maxRedirects: count-1 });
		}
	}
	/**@type {Promise<string>}*/
	let b, text = () => b || (b = buffer(res));
	const headers = Object.defineProperty({}, 'get', { value: k => res.headers[k.toLowerCase()] });
	Object.assign(headers, res.headers);
	return {
		url: parsedUrl.href,
		text,
		json: () => text().then(JSON.parse),
		status: res.statusCode,
		statusText: res.statusMessage,
		ok: (res.statusCode/100|0) == 2,
		headers,
		response: res
	};
}

/**
 * @param {import('stream').Stream} stream
 * @returns {Promise<string>}
 */
export function buffer(stream) {
	return new Promise((resolve, reject) => {
		let data = '';
		const done = () => resolve(data);
		stream.on('data', c => { data += c; });
		stream.on('end', done);
		// stream.on('end', () => { done(); if (close) stream.close(); });
		// stream.on('close', done);
		stream.on('error', reject);
	});
}  
