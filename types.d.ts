/// <reference no-default-lib="true" />
/// <reference lib="ES5" />
/// <reference lib="ES2015.Core" />
/// <reference lib="ES2015.Promise" />
/// <reference lib="ES2016.Array.include" />
/// <reference lib="ES2017.Object" />
/// <reference lib="ES2017.String" />
/// <reference lib="ES2017.TypedArrays" />
/// <reference types="@types/espruino" />


/** Types used by ESPZ */
declare module 'storage:*' {
	const storageFileName: string;
	export = storageFileName;
}

// Poison unsupported standard library methods to indicate they are not available in Espruino's runtime:
declare interface Array<T> {
	/** @deprecated Unsupported in Espruino */
	copyWithin(target: number, start: number, end?: number): never;
}
declare interface ObjectConstructor {
	/** @deprecated Unsupported in Espruino */
	is(o: any, o2: any): never;
	/** @deprecated Unsupported in Espruino */
	getOwnPropertySymbols(o: any): never;
	/** @deprecated Unsupported in Espruino */
	getOwnPropertyDescriptors(o: any): never;
	/** @deprecated Unsupported in Espruino */
	entries(o: any): never;
}

/** @private */
interface Emitter<Types=string> {
	on(type: Types, handler: Function): this;
	removeListener(type: Types, handler: () => void): void;
	removeAllListeners(type?: Types): void;
	emit(type: Types, ...args: any[]): void;
}

// Globals (avoids bringing in DOM types, which are wildly incorrect for this)
declare function setTimeout(fn: Function|string, delay?: number, ...arguments: any[]): number;
declare function clearTimeout(timeout: number): void;
declare function setInterval(fn: Function|string, delay?: number, ...arguments: any[]): number;
declare function clearInterval(interval: number): void;

declare interface url {
	parse(url: string): { method: string, host: string, port: string|null, path: string, pathname: string, search: string|null, query: string|null }
}

declare namespace console {
	function log(...args: any): void;
}

declare namespace process {
	function memory(): { free: number, usage: number, total: number, history: number, gc: number, gctime: number, blocksize: number };
	type env = Record<string, string>;
	type version = string;
	function on(type: 'uncaughtException', handler: (e: Error) => void): void;
	function on(type: 'exit', handler: () => void): void;
}

declare namespace E {
	function on(type: 'init'|'kill', handler: () => void): void;
	function removeListener(type: 'init'|'kill', handler: () => void): void;
	function removeAllListeners(type?: 'init'|'kill'): void;
	/** @deprecated Internal to Espruino */
	function emit(type: 'init'|'kill', ...args: any[]): void;
	function lookupNoCase(o: object, key: string): any;
	// function lookupNoCase<T = object, K = string>(o: T, key: K): Lower<T>[Lowercase<K>];
	// type Lower<T> = { [X in keyof T as Lowercase<X>]: T[X] };
	function setConsole(interfaceName: string, { force: boolean }?): void;
}

// Built-in Modules

declare module 'ESP8266' {
	export = ESP8266;
}
declare namespace ESP8266 {
	function getResetInfo(): { reason: string, exccause: number, epc1: number, epc2: number, epc3: number, excvaddr: number, depc: number };
	function getState(): { sdkVersion: string, cpuFrequency: number, freeHeap: number, maxCon: number, flashMap: string, flashKB: number, flashChip: string };
	function getFreeFlash(): ({ addr: number, length: number })[];
}

declare module 'Storage' {
	function list(): string[];
	function getFree(): number;
	function open(file: string, mode?: 'r'|'w'|'a'): File | undefined;
	function read(file: string, offset?: number, length?: number): string | undefined;
}

declare module 'Wifi' {
	function getHostname(): string | undefined;
	function setHostname(hostname: string, callback?: () => void): any;
	function getStatus(): any;
	function getDetails(): any;
	function getIP(): any;
	function save(): any;
}

declare module 'http' {
	export = http;
}
declare namespace http {
	function request(options: any, callback?: (res: httpCRs) => void): httpCRq;
}
declare interface httpCRq extends Emitter {
	end(): void;
}
declare interface httpCRs extends Emitter {
	end(): void;
}
declare interface httpSrv extends Emitter {
	port?: number;
}
