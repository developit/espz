import path from 'path';
import { promises as fs } from 'fs';
import kleur from 'kleur';
import { rollup } from 'rollup';
import jsonPlugin from '@rollup/plugin-json';
import { minify } from 'terser';
import babel from '@babel/standalone';
import transformAsyncToPromises from 'babel-plugin-transform-async-to-promises';
import asyncHelpers from 'babel-plugin-transform-async-to-promises/helpers-string.js';
import { fetch } from "./util.js";

const MODULES_URL = 'http://www.espruino.com/modules/';

let modulesList;
function getModulesList() {
	if (modulesList) return modulesList;
	return modulesList = fetch(MODULES_URL).then(async r => {
		const text = await r.text();
		const urls = text.match(/[a-zA-Z0-9_-]+\.min\.js/g);
		return urls.reduce((modules, url) => {
			modules.set(url.replace('.min.js', ''), MODULES_URL + url);
			return modules;
		}, new Map());
	});
}

export function transpile(code, filename, compress) {
	return babel.transform(code, {
		// sourceType: 'unambiguous',
		babelrc: false,
		configFile: false,
		filename: filename || undefined,
		compact: compress,
		minified: compress,
		comments: false,
		// retainLines: true,
		presets: [
			//'typescript',
			['env', {
				targets: {
					node: 1
					// ie: 11
				},
				modules: false,
				bugfixes: true,
				loose: true,
				useBuiltIns: false,
				ignoreBrowserslistConfig: true,
				exclude: [
					'transform-regenerator',
					'transform-async-to-generator',
					'proposal-async-generator-functions',
					// 'transform-arrow-functions',
					// 'transform-block-scoping',
					'transform-function-name',
					'transform-for-of',
				]
			}]
		],
		plugins: [
			// [transformAsyncToPromises, { inlineHelpers: true }]
			transformAsyncToPromises
		]
	}).code;
}

export async function compile({ board, files = ['index.js'], out = 'index.js', compress = false, wrap = false }) {
	const env = await board.info();

	const build = await rollup({
		external: env.MODULES.split(','),
		input: files,
		plugins: [
			{
				name: 'entry-notreeshake',
				async resolveId(id, importer) {
					// if (!importer) return { moduleSideEffects: true, meta: { treeshake: false } };
					if (!importer) {
						const resolved = await this.resolve(id, importer, { skipSelf: true });
						return resolved && { ...resolved, moduleSideEffects: 'no-treeshake' };
					}
				},
				// load(id) {
				// 	if (this.getModuleInfo(id).isEntry) return { }
				// }
			},
			jsonPlugin({ compact: true }),
			{
				name: 'storage',
				resolveFileUrl({ fileName }) {
					return JSON.stringify(fileName);
				},
				async resolveId(id, importer) {
					const matches = id.match(/^(file|url|storage):(.+)$/);
					if (!matches) return;
					const [, prefix, spec] = matches;
					const resolved = await this.resolve(spec, importer);
					if (resolved) return `\0storage:${resolved.id}`;
				},
				async load(id) {
					if (!id.startsWith('\0storage:')) return;
					id = id.slice('\0storage:'.length);
					this.addWatchFile(id);
					const fileId = this.emitFile({
						type: 'asset',
						fileName: path.basename(id),
						source: await fs.readFile(id, 'utf-8')
					});
					return `export default import.meta.ROLLUP_FILE_URL_${fileId}`;
				}
			},
			{
				name: 'espruino-modules',
				async resolveId(source) {
					if (!/^[a-zA-Z0-9_-]+$/.test(source)) return;
					const url = (await getModulesList()).get(source);
					if (url) return `\0espruino:${url}`;
					// if (url) return url;
				},
				async load(id) {
					// if (!/https?:\/\//.test(id)) return;
					if (!id.startsWith('\0espruino:')) return;
					console.log('fetching module ' + id.slice(10));
					const res = await fetch(id.slice(10));
					const specs = new Map();
					let code = await res.text();
					let before = '';
					code = code.replace(/\brequire\s*\(\s*(['"])([a-zA-Z0-9_-]+)\1\s*\)/g, (str, q, spec) => {
						let id = specs.get(spec);
						if (!id) {
							id = '_$im_' + spec.replace(/-/g, '$$');
							specs.set(spec, id);
							before += `import ${id} from${q}${spec}${q};`;
						}
						return id;
					});
					return `var exports={};export default exports;${before}\n${code}`;
				}
			},
			// {
			// 	name: 'node_modules',
			// 	async resolveId(id, importer) {
			// 		if (!importer || /^(?:\.*\/|\w+:|\0)/.test(id)) return null;
			// 		console.log(id);
			// 		if (id === 'babel-plugin-transform-async-to-promises/helpers') {
			// 			return asyncHelpers.code;
			// 		}
			// 		return `./node_modules/${id}`;
			// 	}
			// }
		]
	});

	const bundle = await build.generate({
		format: 'cjs',
		interop: false,
		freeze: false,
		hoistTransitiveImports: true,
		indent: false,
		inlineDynamicImports: true,
		preferConst: false,
		sourcemap: false,
		strict: false,
		compact: true,
		exports: 'none',
		externalLiveBindings: false,
		file: out,
		// file: path.basename(out),
		// dir: path.resolve(process.cwd(), path.dirname(out)),
		plugins: [
			{
				name: 'downlevel-and-minify',
				async renderChunk(code, chunk) {
					code = transpile(code, out, compress);

					if (compress) {
						code = (await minify(code, {
							// toplevel: false,
							ecma: 2015,
							compress: {
								top_retain: ['onInit', 'onKill', 'E', 'global'],
								ecma: 5,
								passes: 10,
								// inline: 3,
								// arrows: true,
								sequences: false,
								unsafe: true,
								hoist_props: true,
								pure_getters: true,
								hoist_funs: true,
								hoist_vars: true,
								reduce_vars: false
							},
							mangle: {
								toplevel: false
							},
							safari10: true,
							format: {
								ecma: 5,
								ascii_only: true,
								semicolons: true,
								shorthand: false,
								comments: false,
								preserve_annotations: false
							}
						})).code;
					}

					if (wrap) {
						code = `(function(){${code}})()`;
					}

					return { code };
				}
			}
		]
	});

	printStats(bundle);

	// make TS happy
	const assets = [];
	for (const c of bundle.output) if (c.type==='asset') assets.push(c);

	const bundleCode = bundle.output[0].code;
	const outFile = path.resolve('.', '.out', out);
	await fs.mkdir(path.dirname(outFile), { recursive: true });
	await fs.writeFile(outFile, bundleCode);

	return { bundle, assets, file: outFile, code: bundleCode };
}

function printStats(bundle) {
	const chunks = [];
	let nameLen = 0;
	for (const c of bundle.output) {
		if (c.type !== 'chunk') continue;
		nameLen = Math.max(nameLen, c.fileName.length);
		chunks.push(c);
	}
	console.log(chunks.reduce((s, c) => `${s}\n  ${c.fileName.padEnd(nameLen)} ${kleur.dim('┆')} ${c.code.length}${kleur.dim('b')}`, kleur.dim(`  ${kleur.italic('File'.padEnd(nameLen))} ┆ ${kleur.italic('Size')}`)));
}