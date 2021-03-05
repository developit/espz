import shebangPlugin from 'rollup-plugin-preserve-shebang';
import commonjs from '@rollup/plugin-commonjs';
import nodeResolve from '@rollup/plugin-node-resolve';
import json from '@rollup/plugin-json';
import builtins from 'builtin-modules';
import terser from 'terser';

const external = [
	'fsevents',
	'@serialport/bindings',
	...builtins
]

/** @type {import('rollup').RollupOptions} */
const config = {
	input: 'src/cli.js',
	inlineDynamicImports: true,
	output: {
		file: 'dist/espz.cjs',
		format: 'cjs',
		compact: true,
		freeze: false,
		interop: false,
		namespaceToStringTag: false,
		externalLiveBindings: false,
		preferConst: true,
		plugins: [
			{
				name: 'minify',
				async renderChunk(code) {
					const result = await terser.minify(code, {
						ecma: 2019,
						compress: false,
						mangle: false,
						sourceMap: false,
						output: {
							comments: false,
							inline_script: false
						}
					});
					return { code: result.code || null };
				}
			}
		]
	},
	external,
	plugins: [
		shebangPlugin(),
		commonjs({
			sourceMap: false,
			ignore: external,
			transformMixedEsModules: true,
			requireReturnsDefault: 'auto',
			esmExternals: true
		}),
		nodeResolve({
			dedupe: Boolean,
			exportConditions: ['import', 'module', 'node', 'default'],
			preferBuiltins: true
		}),
		json()
	]
};

export default config;
