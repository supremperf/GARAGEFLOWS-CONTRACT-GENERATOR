const fs = require('fs');

const nsisTarget = 'node_modules/app-builder-lib/out/targets/nsis/NsisTarget.js';
const nsisUtil = 'node_modules/app-builder-lib/out/targets/nsis/nsisUtil.js';
const updateInfo = 'node_modules/app-builder-lib/out/publish/updateInfoBuilder.js';

let target = fs.readFileSync(nsisTarget, 'utf8');
if (!target.includes('GARAGEFLOWS_NO_WINE')) {
  target = target.replace(
    'if ((0, macosVersion_1.isMacOsCatalina)()) {',
    'if (true /* GARAGEFLOWS_NO_WINE */) {'
  );
  fs.writeFileSync(nsisTarget, target);
}

let util = fs.readFileSync(nsisUtil, 'utf8');
if (!util.includes('case ".idata"')) {
  util = util.replace(
    'case ".rsrc": {',
    'case ".rsrc":\n                case ".idata":\n                case ".ndata":\n                case ".reloc": {'
  );
  fs.writeFileSync(nsisUtil, util);
}

let info = fs.readFileSync(updateInfo, 'utf8');
if (!info.includes('GARAGEFLOWS_NULL_PUBLISH')) {
  info = info.replace(
    'function computeChannelNames(packager, publishConfig) {',
    'function computeChannelNames(packager, publishConfig) {\n    if (publishConfig == null) return ["latest"]; // GARAGEFLOWS_NULL_PUBLISH'
  );
  fs.writeFileSync(updateInfo, info);
}

console.log('electron-builder préparé pour une compilation NSIS sans Wine.');
