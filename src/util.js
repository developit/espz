import http from 'http';
import https from 'https';

const HEADERS_GET = { value(k) { return this[k.toLowerCase()]; } };

class Response {
	constructor(url, res) {
		this.url = url;
		this.status = res.statusCode;
		this.statusText = res.statusMessage;
		this.ok = (res.statusCode/100|0) == 2;
		this.status = res.statusCode;
		this.headers = Object.defineProperty({}, 'get', HEADERS_GET);
		Object.assign(this.headers, res.headers);
		let text;
		this._use = () => {
			if (text == null) {
				text = buffer(res);
				res = null;
			}
			return text;
		};
	}
	text() {
		return this._use();
	}
	json() {
		return this._use().then(JSON.parse);
	}
}


/**
 * @param {string | URL} url
 * @param {{ method?: string, body?: string, headers?: Record<string,string>, maxRedirects?: number }} [options]
 * @returns {Promise<Response>}
 */
export async function fetch(url, options) {
	return new Promise((resolve, reject) => {
		options = options || {};
		const parsedUrl = new URL(String(url));
		const req = (parsedUrl.protocol === 'http:' ? http : https).request({
			host: parsedUrl.host,
			port: parsedUrl.port || 80,
			path: parsedUrl.pathname || '/',
			method: options.method || 'GET',
			headers: options.headers
		}, res => {
			if (res.headers.location) {
				const redirect = new URL(res.headers.location, url).href;
				if (redirect !== parsedUrl.href) {
					const count = options.maxRedirects || 10;
					if (!count) throw Error('Maximum redirects reached.');
					res.destroy();
					return resolve(fetch(redirect, { ...options, method: 'GET', body: undefined, maxRedirects: count-1 }));
				}
			}
			resolve(new Response(parsedUrl.href, res));
		});
		req.on('error', reject);
		req.end(options.body);
	});
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
		stream.on('error', reject);
	});
}  
