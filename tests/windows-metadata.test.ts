import { describe, expect, it } from 'vitest';
import { NtExecutable, NtExecutableResource, Resource } from 'resedit';
import { readBuildPolicy, versionPolicy, verifyPeMetadata } from '../scripts/windows-metadata.mjs';

const policy = { ...versionPolicy('1.0.1'), productName: 'GarageFlows Contract Generator' };
function fixture(options: { codepage?: number; lang?: number; product?: string; file?: string; fixed?: string; name?: string; staleTable?: boolean; noVersion?: boolean; x86?: boolean; missingTranslation?: boolean; missingProduct?: boolean } = {}) {
  const exe = NtExecutable.createEmpty(options.x86 ?? false, false);
  const res = NtExecutableResource.from(exe);
  if (!options.noVersion) {
    const lang = options.lang ?? 1033;
    const codepage = options.codepage ?? 1200;
    const vi = Resource.VersionInfo.create({ lang, fixedInfo: {}, strings: [] });
    vi.setFileVersion(options.fixed ?? '1.0.1.0');
    vi.setProductVersion(options.fixed ?? '1.0.1.0');
    for (const t of vi.getAllLanguagesForStringValues()) vi.removeAllStringValues(t);
    vi.setStringValues({ lang, codepage }, {
      ProductName: options.name ?? policy.productName,
      FileVersion: options.file ?? '1.0.1',
      ...(options.missingProduct ? {} : { ProductVersion: options.product ?? '1.0.1' }),
    });
    if (options.staleTable) vi.setStringValues({ lang: 1036, codepage: 1200 }, { ProductName: policy.productName, FileVersion: '1.0.0', ProductVersion: '1.0.0' });
    if (options.missingTranslation) vi.replaceAvailableLanguages([]);
    vi.outputToResourceEntries(res.entries);
  }
  res.outputResource(exe);
  return Buffer.from(exe.generate());
}

describe('Windows release metadata — real PE resources, not mocks', () => {
  it('uses package.json as the single source', () => {
    const current = readBuildPolicy();
    expect(current.pkg.version).toBe(current.appVersion);
    expect(current.windowsVersion).toBe(`${current.appVersion.replace(/[-+].*$/, '')}.0`);
  });
  it.each([[1033, 1200], [1033, 1252], [1036, 1252], [0, 1200]])('accepts a valid table lang=%i codepage=%i', (lang, codepage) => {
    expect(verifyPeMetadata(fixture({ lang, codepage }), policy, 'application').versions).toHaveLength(1);
  });
  it('reproduces the old false negative on NSIS CP1252', () => {
    const binary = fixture({ codepage: 1252, x86: true });
    const res = NtExecutableResource.from(NtExecutable.from(binary));
    const oldValue = Resource.VersionInfo.fromEntries(res.entries)[0].getStringValues({ lang: 1033, codepage: 1200 }).ProductVersion;
    expect(oldValue).toBeUndefined();
    expect(verifyPeMetadata(binary, policy, 'installer').machine).toBe(0x14c);
  });
  it('accepts .0 notation only when numerically identical', () => {
    expect(() => verifyPeMetadata(fixture({ product: '1.0.1.0', file: '1.0.1.0' }), policy, 'application')).not.toThrow();
  });
  it.each([
    { product: '1.0.10' }, { product: '1.0.1-stale' }, { product: '1.0.1.99' },
    { file: '1.0.0' }, { fixed: '1.0.0.0' }, { fixed: '1.0.1.7' },
    { name: 'Electron' }, { staleTable: true }, { noVersion: true },
    { missingTranslation: true }, { missingProduct: true }, { x86: true },
  ])('rejects incorrect, absent, ambiguous or stale metadata: %j', options => {
    expect(() => verifyPeMetadata(fixture(options), policy, 'application')).toThrow();
  });
  it('does not discard prerelease identity', () => {
    const pre = { ...versionPolicy('1.0.1-beta.2'), productName: policy.productName };
    expect(() => verifyPeMetadata(fixture({ product: pre.appVersion }), pre, 'application')).not.toThrow();
    expect(() => verifyPeMetadata(fixture(), pre, 'application')).toThrow();
  });
  it('preserves SemVer build identity in the product string', () => {
    const build = { ...versionPolicy('1.0.1+build.7'), productName: policy.productName };
    expect(() => verifyPeMetadata(fixture({ product: build.appVersion }), build, 'application')).not.toThrow();
    expect(() => verifyPeMetadata(fixture(), build, 'application')).toThrow();
  });
  it.each(['1.0', 'v1.0.1', '65536.0.0', '1.0.1.9'])('rejects invalid/unrepresentable package version %s', version => {
    expect(() => versionPolicy(version)).toThrow();
  });
});
