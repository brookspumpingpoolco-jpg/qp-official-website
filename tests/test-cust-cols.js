'use strict';

const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'invoice-netlify', 'SchedulingScript.gs'), 'utf8');

function extractFunction(name) {
  const needle = 'function ' + name + '(';
  const start = src.indexOf(needle);
  if (start === -1) throw new Error('missing function ' + name);
  const brace = src.indexOf('{', start);
  let depth = 0;
  for (let i = brace; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  throw new Error('unclosed function ' + name);
}

function extractConst(name) {
  const re = new RegExp('const ' + name + ' = \\{[^}]+\\};');
  const match = src.match(re);
  if (!match) throw new Error('missing const ' + name);
  return match[0];
}

const code = [
  extractConst('CUST_COL'),
  extractFunction('getCustomersHeaders'),
  extractFunction('getCustColIndex'),
  extractFunction('getCustCols_'),
  extractFunction('buildCustomerRow_')
].join('\n\n');

const api = new Function(
  code + '\nreturn { getCustCols_: getCustCols_, buildCustomerRow_: buildCustomerRow_, getCustomersHeaders: getCustomersHeaders, CUST_COL: CUST_COL };'
)();

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

assert(src.indexOf('function getCustCustomJsonCol_') === -1, 'getCustCustomJsonCol_ must stay deleted so tags stay on column 12');

['updateCustomerSpending', 'updateCustomerTags', 'getCustomerTags', 'getAllCustomerTags'].forEach(function(name) {
  const body = extractFunction(name);
  assert(body.indexOf('const jsonCol = 12;') !== -1, name + ' must keep jsonCol at index 12 (Service Data JSON)');
  assert(body.indexOf('getCustCustomJsonCol_') === -1, name + ' must not call getCustCustomJsonCol_');
});

const LIVE = [
  'Company ID', 'Name', 'Email', 'Phone', 'Address', 'City', 'State', 'Zip Code',
  'Notes', 'Created Date', 'Last Updated', 'Pool Data JSON', 'Service Data JSON',
  'Custom Data JSON', 'Custom Data JSON', 'Equipment', 'Profile', 'Google Drive Folder'
];

const liveCol = api.getCustCols_(LIVE);
assert(liveCol.email === 2, 'live email column expected 2, got ' + liveCol.email);
assert(liveCol.name === 1, 'live name column expected 1, got ' + liveCol.name);
assert(liveCol.id === -1, 'live id column expected -1, got ' + liveCol.id);
assert(liveCol.company === 0, 'live company column expected 0, got ' + liveCol.company);
assert(liveCol.zip === 7, 'live zip column expected 7, got ' + liveCol.zip);

const built = api.buildCustomerRow_(LIVE, 18, {
  companyId: 'CMP',
  custId: 'CUST-SHOULD-NOT-APPEAR',
  name: 'Ada',
  email: 'a@b.com',
  phone: '555',
  address: '1 Main',
  city: 'Richmond',
  state: 'KY',
  zip: '40475',
  notes: 'n',
  created: 'c',
  updated: 'u'
});
assert(built.row.length === 18, 'live row length expected 18, got ' + built.row.length);
assert(built.row[2] === 'a@b.com', 'email should land in slot 2, got ' + built.row[2]);
assert(built.row[1] === 'Ada', 'name should land in slot 1, got ' + built.row[1]);
assert(built.row.indexOf('CUST-SHOULD-NOT-APPEAR') === -1, 'phantom customer id was written into the row');
assert(built.id === 'a@b.com', 'id fallback should be the email, got ' + built.id);
assert(built.col.id === -1, 'built.col.id expected -1, got ' + built.col.id);

const legacy = api.getCustomersHeaders();
const legacyCol = api.getCustCols_(legacy);
assert(legacyCol.id === 1, 'legacy id column expected 1, got ' + legacyCol.id);
assert(legacyCol.name === 2, 'legacy name column expected 2, got ' + legacyCol.name);
assert(legacyCol.email === 3, 'legacy email column expected 3, got ' + legacyCol.email);
const legacyBuilt = api.buildCustomerRow_(legacy, legacy.length, {
  companyId: 'CMP',
  custId: 'CUST-1',
  name: 'Ada',
  email: 'a@b.com'
});
assert(legacyBuilt.row.length === legacy.length, 'legacy row length expected ' + legacy.length + ', got ' + legacyBuilt.row.length);
assert(legacyBuilt.row[1] === 'CUST-1', 'legacy id should land in slot 1, got ' + legacyBuilt.row[1]);
assert(legacyBuilt.row[2] === 'Ada', 'legacy name should land in slot 2, got ' + legacyBuilt.row[2]);
assert(legacyBuilt.row[3] === 'a@b.com', 'legacy email should land in slot 3, got ' + legacyBuilt.row[3]);
assert(legacyBuilt.id === 'CUST-1', 'legacy id return expected CUST-1, got ' + legacyBuilt.id);

const emptyCol = api.getCustCols_([]);
assert(emptyCol.id === -1, 'empty headers id expected -1, got ' + emptyCol.id);
assert(emptyCol.email === api.CUST_COL.EMAIL, 'empty headers email expected CUST_COL.EMAIL (' + api.CUST_COL.EMAIL + '), got ' + emptyCol.email);

const padded = api.buildCustomerRow_(LIVE, 20, { name: 'Ada', email: 'a@b.com' });
assert(padded.row.length === 20, 'padded row length expected 20, got ' + padded.row.length);
assert(padded.row[1] === 'Ada', 'padded name slot changed');
assert(padded.row[2] === 'a@b.com', 'padded email slot changed');

console.log('test-cust-cols: ok');
