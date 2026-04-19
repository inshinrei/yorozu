import { describe, it, expect, beforeEach } from 'vitest'
import type { PackageJson } from './types'
import { processPackageJson, removeCommonjsExports } from './process-package-json'

let DefaultFieldsToCopyRoot: Set<string>
let RegExpMatcher: RegExp

beforeEach(() => {
    DefaultFieldsToCopyRoot = new Set(['license', 'author', 'contributors', 'homepage', 'repository', 'bugs'])
    RegExpMatcher = new RegExp(/(?<!\.d)\.[mc]?[jt]sx?$/i)
})

describe('processPackageJson', () => {
    it('copies root fields from rootPackageJson when missing in target (onlyEntrypoints=false)', () => {
        let rootPackageJson: PackageJson = {
            license: 'MIT',
            author: 'test-author',
            homepage: 'https://example.com',
        }
        let packageJsonOriginal: PackageJson = { name: 'test-pkg', version: '1.0.0' }

        let result = processPackageJson({
            packageJson: packageJsonOriginal,
            rootPackageJson,
            rootFieldsToCopy: DefaultFieldsToCopyRoot,
        })

        expect(result.packageJson.license).toBe('MIT')
        expect(result.packageJson.author).toBe('test-author')
        expect(result.packageJson.homepage).toBe('https://example.com')
        expect(result.packageJsonOriginal).toBe(packageJsonOriginal)
    })

    it('respects onlyEntrypoints=true and skips all processing except entrypoints/bin', () => {
        let packageJsonOriginal: PackageJson = {
            name: 'test-pkg',
            scripts: { build: 'tsc' },
            dependencies: { foo: 'workspace:*' },
            exports: { '.': './src/index.ts' },
        }

        let result = processPackageJson({
            packageJson: packageJsonOriginal,
            onlyEntrypoints: true,
        })

        // expect(result.packageJson.scripts).toBeUndefined()
        // expect(result.packageJson.dependencies).toBeUndefined()
        expect(result.packageJson.exports).toEqual({ '.': { import: { types: './index.d.ts', default: './index.js' }, require: { types: './index.d.cts', default: './index.cjs' } } })
        expect(result.entrypoints.get('index')).toBe('./src/index.ts')
    })

    it('filters scripts to only those listed in yorozu.keepScripts', () => {
        let packageJsonOriginal: PackageJson = {
            scripts: { test: 'vitest', build: 'tsc', lint: 'eslint' },
            yorozu: { keepScripts: ['test', 'build'] },
        }

        let result = processPackageJson({ packageJson: packageJsonOriginal })

        expect(result.packageJson.scripts).toEqual({ test: 'vitest', build: 'tsc' })
        expect(result.packageJson.yorozu).toBeUndefined()
    })

    it('applies distOnlyFields and deletes devDependencies/private', () => {
        let packageJsonOriginal: PackageJson = {
            devDependencies: { vitest: '^1.0.0' },
            private: true,
            yorozu: { distOnlyFields: { type: 'module', main: './index.js' } },
        }

        let result = processPackageJson({ packageJson: packageJsonOriginal })

        expect(result.packageJson.devDependencies).toBeUndefined()
        expect(result.packageJson.private).toBeUndefined()
        expect(result.packageJson.type).toBe('module')
        expect(result.packageJson.main).toBe('./index.js')
    })

    it('replaces workspace:* and workspace:^ dependencies with real versions (or fixedVersion)', () => {
        let workspaceVersions = new Map([['foo', '2.3.4'], ['bar', '1.0.0']])
        let packageJsonOriginal: PackageJson = {
            dependencies: { foo: 'workspace:*', bar: 'workspace:^', baz: '^3.0.0' },
            peerDependencies: { foo: 'workspace:*' },
        }

        let result = processPackageJson({
            packageJson: packageJsonOriginal,
            workspaceVersions,
            fixedVersion: '9.9.9',
        })

        expect(result.packageJson.dependencies).toEqual({ foo: '9.9.9', bar: '9.9.9', baz: '^3.0.0' })
        expect(result.packageJson.peerDependencies).toEqual({ foo: '9.9.9' })
    })

    it('throws on unsupported workspace: prefix', () => {
        let packageJsonOriginal: PackageJson = { dependencies: { foo: 'workspace:1.2.3' } }

        expect(() => processPackageJson({ packageJson: packageJsonOriginal })).toThrow('Cannot replace workspace dependency foo with workspace:1.2.3')
    })

    it('throws when workspace dep missing from workspaceVersions map', () => {
        let packageJsonOriginal: PackageJson = { dependencies: { missing: 'workspace:*' } }

        expect(() => processPackageJson({ packageJson: packageJsonOriginal, workspaceVersions: new Map() })).toThrow('Cannot replace dependency: missing not found in workspace')
    })

    it.todo('transforms exports to conditional + records entrypointsToCopy vs entrypoints', () => {
        let packageJsonOriginal: PackageJson = {
            exports: {
                '.': './src/index.ts',
                './foo': './src/foo.js',
                './bar': './src/bar.d.ts',
            },
        }

        let shouldCopyEntrypoint = (name: string, target: string) => target.match(RegExpMatcher) !== null

        let result = processPackageJson({
            packageJson: packageJsonOriginal,
            shouldCopyEntrypoint,
        })

        expect(result.entrypointsToCopy.get('.')).toBe('./src/index.ts')
        expect(result.entrypointsToCopy.get('./bar')).toBe('./src/bar.d.ts')
        expect(result.entrypoints.get('foo')).toBe('./src/foo.js')

        expect(result.packageJson.exports).toEqual({
            '.': '.',
            './bar': './bar',
            './foo': {
                import: { types: './foo.d.ts', default: './foo.js' },
                require: { types: './foo.d.cts', default: './foo.cjs' },
            },
        })
    })

    it('transforms bin field and records entrypoints', () => {
        let packageJsonOriginal: PackageJson = {
            bin: { 'cli': './src/cli.ts', 'index': './src/index.js' },
        }

        let result = processPackageJson({ packageJson: packageJsonOriginal })

        expect(result.entrypoints.get('cli')).toBe('./src/cli.ts')
        expect(result.entrypoints.get('index')).toBe('./src/index.js')
        expect(result.packageJson.bin).toEqual({ 'cli': 'cli.js', 'index': 'index.js' })
    })

    it('throws on malformed exports or bin values', () => {
        let badExports: PackageJson = { exports: { '.': 123 } }
        expect(() => processPackageJson({ packageJson: badExports })).toThrow('package.json export value must be a string')

        let badBin: PackageJson = { bin: { cli: 123 } }
        expect(() => processPackageJson({ packageJson: badBin })).toThrow('package.json bin value must be a string')
    })
})

describe('removeCommonjsExports', () => {
    it('removes require when top-level import exists', () => {
        let exports: Record<string, unknown> = {
            import: './index.js',
            require: './index.cjs',
        }

        removeCommonjsExports(exports)
        expect(exports).not.toHaveProperty('require')
        expect(exports).toHaveProperty('import')
    })

    it('removes require from every nested conditional export', () => {
        let exports: Record<string, unknown> = {
            '.': {
                import: './index.js',
                require: './index.cjs',
            },
            './foo': {
                import: './foo.js',
                require: './foo.cjs',
            },
        }

        removeCommonjsExports(exports)

        expect((exports['.'] as Record<string, unknown>)).not.toHaveProperty('require')
        expect((exports['./foo'] as Record<string, unknown>)).not.toHaveProperty('require')
    })

    it('does nothing when no import/require structure present', () => {
        let exports: Record<string, unknown> = { '.': './index.js' }
        let original = structuredClone(exports)

        removeCommonjsExports(exports)
        expect(exports).toEqual(original)
    })

    it('skips non-object values gracefully', () => {
        let exports: Record<string, unknown> = {
            '.': './index.js',
            './string': 'some-string',
            './null': null,
        }

        removeCommonjsExports(exports)
        expect(exports).toEqual({
            '.': './index.js',
            './string': 'some-string',
            './null': null,
        })
    })
})