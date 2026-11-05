/**
 * Spot Win back end (Habesha engagement payment records).
 *
 * One Apps Script file, deployed as a web app (Execute as: Me, access: Anyone).
 * The phone app sends every request as a POST of plain JSON with an `action`
 * and gets back {ok, data, error}.
 *
 * Script properties (Project Settings > Script properties):
 *   SHEET_ID         the "Spot Win" Google Sheet (paymentSetup creates one if empty)
 *   OUTLET_SHEET_ID  the "Habesha Survey" sheet with the National Outlet tab (read only)
 *   PHOTO_FOLDER_ID  the "Spot Win Photos" Drive folder (paymentSetup creates one if empty)
 *   TOKEN_SECRET     signing secret for sessions (paymentSetup creates it)
 *
 * After any code change: Deploy > Manage deployments > Edit > New version,
 * so the /exec URL stays the same.
 */

/* ================= entry points ================= */

function doPost(e) {
  var body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return json_({ ok: false, error: 'Bad request.' });
  }
  return json_(route_(body));
}

// Opening the /exec URL in a browser shows this: a quick check that the deployment is live.
function doGet() {
  return ContentService.createTextOutput('ok · Spot Win · ' + now_()).setMimeType(ContentService.MimeType.TEXT);
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

var HANDLERS = {
  paymentLogin: paymentLogin_,
  changePassword: changePassword_,
  ping: ping_,
  flag: flag_,
  outletPack: outletPack_,
  lookupOutlet: lookupOutlet_,
  outlets: outlets_,
  requestOutlet: requestOutlet_,
  notifications: notifications_,
  uploadPhoto: uploadPhoto_,
  addVisit: addVisit_,
  myVisits: myVisits_,
  getPhoto: getPhoto_,
  managerData: managerData_,
  visitDetail: visitDetail_,
  exportVisits: exportVisits_,
  resolveFlag: resolveFlag_,
  adminData: adminData_,
  saveUser: saveUser_,
  saveOutlet: saveOutlet_,
  importOutlets: importOutlets_,
  sendNotice: sendNotice_,
  voidVisit: voidVisit_,
  saveSettings: saveSettings_
};

function route_(body) {
  var fn = body && HANDLERS[body.action];
  if (!fn) return { ok: false, error: 'Unknown action.' };
  try {
    return { ok: true, data: fn(body) || {} };
  } catch (err) {
    return { ok: false, error: String((err && err.message) || err) };
  }
}

function fail_(message) {
  throw new Error(message);
}

/* ================= configuration ================= */

// The Habesha Survey sheet. Used when OUTLET_SHEET_ID is not set.
var DEFAULT_OUTLET_SHEET_ID = '1tf0oQTnZG7a0zxZcYFzYXpeDf5Y57e_1fyvHLEdxcOk';
var NATIONAL_TAB = 'National Outlet';

var ACTIVITIES = ['Bar Staff Engagement', 'Waitress Engagement', 'Consumer Onspot Engagement', 'Outlet Owner Engagement'];
var DEFAULT_SETTINGS = { birrLimit: 20000, crateLimit: 200, distanceLimitM: 100 };
var SHORT_VISIT_MS = 60 * 1000;
var EXPORT_PAGE = 2000;
var MAX_PHOTO_BYTES = 3 * 1024 * 1024;
var MAX_THUMB_CHARS = 45000;

var HEADERS = {
  Users: ['id', 'username', 'password', 'name', 'staffId', 'role', 'region', 'agent', 'active', 'passwordChanged'],
  Visits: ['id', 'status', 'date', 'userId', 'userName', 'staffId', 'outletId', 'outletName', 'division', 'agent', 'parentTerritory', 'territory',
    'activity', 'investmentUnit', 'amount',
    'receiptPhotoId', 'receiptUrl', 'receiptSource', 'receiptHash', 'receiptAt',
    'engagementPhotoId', 'engagementUrl', 'engagementHash', 'engagementAt', 'engagementLat', 'engagementLng',
    'startedAt', 'startLat', 'startLng', 'startAccuracy', 'lat', 'lng', 'accuracy', 'distanceM',
    'device', 'appVersion', 'uploadedAt', 'voidReason', 'voidBy', 'voidAt'],
  Photos: ['id', 'visitId', 'kind', 'fileId', 'url', 'hash', 'source', 'takenAt', 'lat', 'lng', 'sizeKb', 'uploadedAt', 'userId', 'thumb'],
  Presence: ['userId', 'userName', 'lastSeen', 'state', 'activity', 'lat', 'lng', 'accuracy', 'locTime', 'device'],
  Track: ['date', 'userId', 'userName', 'lat', 'lng', 'accuracy', 'activity'],
  Logins: ['date', 'userId', 'userName', 'role', 'lat', 'lng', 'accuracy', 'device'],
  Flags: ['id', 'date', 'userId', 'userName', 'visitId', 'type', 'detail', 'status', 'resolvedBy', 'resolvedAt'],
  Outlets: ['key', 'outletId', 'outletName', 'status', 'requestedBy', 'requestedByName', 'lat', 'lng', 'createdAt', 'updatedAt'],
  Notifications: ['id', 'date', 'fromId', 'fromName', 'target', 'kind', 'title', 'body'],
  Exports: ['date', 'userId', 'userName', 'role', 'filters', 'rowCount'],
  Settings: ['key', 'value']
};

// Columns kept as text, so "0012" keeps its zeros and ISO dates stay as written
var TEXT_COLS = ['id', 'username', 'password', 'name', 'staffId', 'role', 'region', 'active', 'status', 'date', 'userId', 'userName',
  'outletId', 'outletName', 'division', 'agent', 'parentTerritory', 'territory', 'activity', 'investmentUnit',
  'receiptPhotoId', 'receiptUrl', 'receiptSource', 'receiptHash', 'receiptAt', 'engagementPhotoId', 'engagementUrl', 'engagementHash', 'engagementAt',
  'startedAt', 'device', 'appVersion', 'uploadedAt', 'voidReason', 'voidBy', 'voidAt', 'visitId', 'kind', 'fileId', 'url', 'hash', 'source', 'takenAt',
  'lastSeen', 'state', 'locTime', 'type', 'detail', 'resolvedBy', 'resolvedAt', 'key', 'requestedBy', 'requestedByName', 'createdAt', 'updatedAt',
  'fromId', 'fromName', 'target', 'title', 'body', 'filters', 'thumb'];

function props_() { return PropertiesService.getScriptProperties(); }

var ss_cache_ = null;
function ss_() {
  if (ss_cache_) return ss_cache_;
  var id = props_().getProperty('SHEET_ID');
  if (id) ss_cache_ = SpreadsheetApp.openById(id);
  else {
    ss_cache_ = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss_cache_) fail_('SHEET_ID is not set. Run paymentSetup once in the Apps Script editor.');
  }
  return ss_cache_;
}

var outlet_ss_cache_ = null;
function outletSs_() {
  if (!outlet_ss_cache_) outlet_ss_cache_ = SpreadsheetApp.openById(props_().getProperty('OUTLET_SHEET_ID') || DEFAULT_OUTLET_SHEET_ID);
  return outlet_ss_cache_;
}

// The National Outlet tab. Looked for in the Spot Win sheet first, then in the
// Habesha Survey sheet (OUTLET_SHEET_ID). The tab name is matched loosely:
// "National Outlet", "National Outlets", "national_outlet" all work.
var national_cache_ = undefined;
function nationalSheet_() {
  if (national_cache_ !== undefined) return national_cache_;
  var want = function (name) { return /^national\s*_?\s*outlets?(\s*list)?$/i.test(String(name).trim()); };
  var find = function (book) {
    if (!book) return null;
    var tabs = book.getSheets();
    for (var i = 0; i < tabs.length; i++) if (want(tabs[i].getName()) && tabs[i].getLastRow() > 1) return tabs[i];
    return null;
  };
  var own = null;
  try { own = find(ss_()); } catch (e) { own = null; }
  var other = null;
  if (!own) { try { other = find(outletSs_()); } catch (e) { other = null; } }
  national_cache_ = own || other || null;
  return national_cache_;
}

function photoFolder_() {
  var id = props_().getProperty('PHOTO_FOLDER_ID');
  if (!id) fail_('PHOTO_FOLDER_ID is not set. Run paymentSetup once in the Apps Script editor.');
  return DriveApp.getFolderById(id);
}

/* ================= tokens ================= */
// A token holds the user ID and role and is signed with TOKEN_SECRET, so it
// can't be forged by editing the phone. No expiry: blocking the user ends it.

function secret_() {
  var s = props_().getProperty('TOKEN_SECRET');
  if (!s) {
    s = Utilities.getUuid() + Utilities.getUuid();
    props_().setProperty('TOKEN_SECRET', s);
  }
  return s;
}

function sign_(text) {
  return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(text, secret_()));
}

function makeToken_(u) {
  var payload = [u.id, u.role, Date.now()].join('|');
  return Utilities.base64EncodeWebSafe(payload) + '.' + sign_(payload);
}

function readToken_(token) {
  if (!token || String(token).indexOf('.') < 0) return null;
  var parts = String(token).split('.');
  var payload;
  try {
    payload = Utilities.newBlob(Utilities.base64DecodeWebSafe(parts[0])).getDataAsString();
  } catch (e) {
    return null;
  }
  if (sign_(payload) !== parts[1]) return null;
  var p = payload.split('|');
  return { id: p[0], role: p[1] };
}

// Checks the token and the Users tab (cached 60 s), so a blocked or changed
// account loses access within about a minute.
function requireUser_(token, roles) {
  var t = readToken_(token);
  if (!t) fail_('Session not valid. Sign in again.');
  var u = findUser_(t.id);
  if (!u || !u.active) fail_('This account is no longer active.');
  if (roles && roles.indexOf(u.role) < 0) fail_('This account does not have access to that.');
  return u;
}

/* ================= users ================= */

function usersTable_() {
  var sheet = sheet_('Users');
  var values = sheet.getDataRange().getValues();
  var head = values[0].map(function (h) { return String(h).trim().toLowerCase().replace(/[\s_]/g, ''); });
  var col = function (names) {
    for (var i = 0; i < names.length; i++) { var x = head.indexOf(names[i]); if (x > -1) return x; }
    return -1;
  };
  var c = {
    user: col(['username', 'user', 'login']), pass: col(['password', 'pass', 'pin']), id: col(['id', 'userid']),
    name: col(['name', 'fullname']), staff: col(['staffid', 'staff']), role: col(['role', 'type']),
    region: col(['region', 'division']), agent: col(['agent', 'agents']), active: col(['active', 'status']),
    changed: col(['passwordchanged'])
  };
  if (c.user < 0 || c.pass < 0) fail_('Users tab needs username and password columns.');
  var users = [];
  for (var r = 1; r < values.length; r++) {
    var row = values[r];
    var un = String(row[c.user]).trim();
    if (!un) continue;
    var role = c.role > -1 ? String(row[c.role]).trim().toLowerCase() : '';
    var act = c.active > -1 ? String(row[c.active]).trim().toLowerCase() : '';
    users.push({
      row: r + 1,
      username: un,
      password: String(row[c.pass]).trim(),
      id: c.id > -1 && String(row[c.id]).trim() ? String(row[c.id]).trim() : un,
      name: c.name > -1 && String(row[c.name]).trim() ? String(row[c.name]).trim() : un,
      staffId: c.staff > -1 ? String(row[c.staff]).trim() : '',
      role: roleOf_(role),
      region: c.region > -1 ? String(row[c.region]).trim() : '',
      agent: c.agent > -1 ? String(row[c.agent]).trim() : '',
      active: ['no', 'false', 'inactive', 'blocked', '0'].indexOf(act) < 0,
      // Blank until the user picks their own password; an admin setting a password clears it
      // passwordChanged: blank = never asked, "reset ..." = an admin set a new
      // password (ask again), anything else = already asked (changed, kept or offered)
      changed: c.changed > -1 && String(row[c.changed]).trim() !== '' && !/^reset/i.test(String(row[c.changed]).trim()),
      reset: c.changed > -1 && /^reset/i.test(String(row[c.changed]).trim())
    });
  }
  return { sheet: sheet, c: c, users: users };
}

function readUsers_() {
  var cache = CacheService.getScriptCache();
  var hit = cache.get('users_v2');
  if (hit) return JSON.parse(hit);
  var users = usersTable_().users;
  try { cache.put('users_v2', JSON.stringify(users), 60); } catch (e) { /* too big to cache */ }
  return users;
}
function clearUsersCache_() { CacheService.getScriptCache().remove('users_v2'); }

function findUser_(id) {
  var users = readUsers_();
  for (var i = 0; i < users.length; i++) if (users[i].id === String(id)) return users[i];
  return null;
}

// Role from the Users tab. "asm" or "area sales" = ASM, "rtm" or "trade
// marketing" = RTM. Both are checked before "manager", so "Area Sales
// Manager" is an ASM and "Regional Trade Marketing Manager" is an RTM.
function roleOf_(text) {
  var r = String(text || '').toLowerCase();
  if (r.indexOf('admin') > -1) return 'admin';
  if (/\basm\b|area\s*sales/.test(r)) return 'asm';
  if (/\brtm\b|trade\s*marketing/.test(r)) return 'rtm';
  if (r.indexOf('manager') > -1) return 'manager';
  return 'sales';
}

var VIEWERS = ['manager', 'rtm', 'asm', 'admin'];
// Roles that record visits: sales people, and ASMs and RTMs in the field
var RECORDERS = ['sales', 'asm', 'rtm'];

function publicUser_(u) {
  return { id: u.id, name: u.name, username: u.username, staffId: u.staffId || '', role: u.role, region: u.region || '', agent: u.agent || '', active: u.active, passwordSet: !!u.changed };
}

/* ================= divisions and agents ================= */
// A manager's or RTM's region in Users is their division: they see sales users
// of that region and visits to outlets in that division. An ASM's agent in Users
// (one, or several separated by commas) limits them to sales users of that
// agent and visits to that agent's outlets. Admins see everything.

function sameDiv_(a, b) { return String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase(); }
function agentsOf_(text) { return String(text || '').split(/[,;]/).map(function (a) { return a.trim().toLowerCase(); }).filter(String); }
function anyAgent_(list, value) { var v = String(value || '').trim().toLowerCase(); return !!v && list.indexOf(v) > -1; }

function scopeFor_(me) {
  var ids = {};
  if (me.role === 'asm') {
    var agents = agentsOf_(me.agent);
    readUsers_().forEach(function (u) {
      if (u.id === me.id || (u.role === 'sales' && agentsOf_(u.agent).some(function (a) { return agents.indexOf(a) > -1; }))) ids[u.id] = true;
    });
    return { kind: 'agent', agents: agents, label: 'ASM · ' + (me.agent || 'no agent set'), ids: ids };
  }
  // Managers and RTMs: their division (region). Blank region = all divisions.
  if ((me.role !== 'manager' && me.role !== 'rtm') || !String(me.region || '').trim()) return null;
  readUsers_().forEach(function (u) { if (RECORDERS.indexOf(u.role) > -1 && (u.id === me.id || sameDiv_(u.region, me.region))) ids[u.id] = true; });
  return { kind: 'division', division: me.region, label: (me.role === 'rtm' ? 'RTM · ' : 'Manager · ') + me.region, ids: ids };
}

function visitInScope_(scope, v) {
  if (!scope) return true;
  if (scope.kind === 'agent') return String(v.agent || '').trim() ? anyAgent_(scope.agents, v.agent) : !!scope.ids[String(v.userId)];
  return String(v.division || '').trim() ? sameDiv_(v.division, scope.division) : !!scope.ids[String(v.userId)];
}

// Division and agent pairs from National Outlet, for the admin's user form. Cached 6 h.
function agentList_() {
  var cache = CacheService.getScriptCache();
  var hit = cache.get('agents_v1');
  if (hit) return JSON.parse(hit);
  var out = [];
  var sheet = nationalSheet_();
  if (sheet && sheet.getLastRow() > 1) {
    var c = nationalCols_(sheet);
    if (c.agent > -1) {
      var seen = {};
      var n = sheet.getLastRow() - 1;
      var ag = sheet.getRange(2, c.agent + 1, n, 1).getValues();
      var dv = c.division > -1 ? sheet.getRange(2, c.division + 1, n, 1).getValues() : null;
      for (var i = 0; i < n; i++) {
        var a = String(ag[i][0]).trim();
        var d = dv ? String(dv[i][0]).trim() : '';
        if (a && !seen[d + '|' + a]) { seen[d + '|' + a] = true; out.push([d, a]); }
      }
      out.sort(function (x, y) { return (x[0] + x[1]).localeCompare(y[0] + y[1]); });
    }
  }
  try { cache.put('agents_v1', JSON.stringify(out), 21600); } catch (e) { /* too big */ }
  return out;
}

function divisionList_() {
  var cache = CacheService.getScriptCache();
  var hit = cache.get('divisions_v2');
  if (hit) return JSON.parse(hit);
  var out = [];
  var sheet = nationalSheet_();
  if (sheet && sheet.getLastRow() > 1) {
    var c = nationalCols_(sheet);
    if (c.division > -1) {
      var seen = {};
      sheet.getRange(2, c.division + 1, sheet.getLastRow() - 1, 1).getValues().forEach(function (r) {
        var v = String(r[0]).trim();
        if (v && !seen[v]) { seen[v] = true; out.push(v); }
      });
      out.sort();
    }
  }
  CacheService.getScriptCache().put('divisions_v2', JSON.stringify(out), 21600);
  return out;
}

/* ================= settings ================= */

function readSettings_() {
  var cache = CacheService.getScriptCache();
  var hit = cache.get('settings_v1');
  if (hit) return JSON.parse(hit);
  var s = {};
  for (var k in DEFAULT_SETTINGS) s[k] = DEFAULT_SETTINGS[k];
  readRows_('Settings', 0).forEach(function (r) {
    var key = String(r.key).trim();
    if (key in DEFAULT_SETTINGS && r.value !== '' && !isNaN(Number(r.value))) s[key] = Number(r.value);
  });
  cache.put('settings_v1', JSON.stringify(s), 600);
  return s;
}

function saveSettings_(b) {
  requireUser_(b.token, ['admin']);
  var s = b.settings || {};
  withLock_(function () {
    var sheet = sheet_('Settings');
    Object.keys(DEFAULT_SETTINGS).forEach(function (k) {
      if (s[k] == null || isNaN(Number(s[k])) || Number(s[k]) <= 0) return;
      if (!updateWhere_(sheet, 'key', k, { value: Number(s[k]) })) appendByHeader_(sheet, { key: k, value: Number(s[k]) });
    });
  });
  CacheService.getScriptCache().remove('settings_v1');
  return { settings: readSettings_() };
}

/* ================= sign-in and presence ================= */

function paymentLogin_(b) {
  var username = String(b.username || '').trim().toLowerCase();
  var password = String(b.password || '').trim().toLowerCase();
  if (!username || !password) fail_('Enter your username and password.');
  var loc = b.location || {};
  var users = readUsers_();
  var u = null;
  for (var i = 0; i < users.length; i++) {
    if (users[i].username.toLowerCase() === username && users[i].password.toLowerCase() === password) { u = users[i]; break; }
  }
  if (!u) fail_('Wrong username or password.');
  if (!u.active) fail_('This account is blocked. Contact your admin.');
  // Sales users can't sign in without a GPS fix. Managers and admins on a PC may not have one.
  if (u.role === 'sales' && (loc.lat == null || loc.lng == null)) fail_('Location is required to sign in.');

  // The new-password step shows once only. It shows when an admin has just set
  // the password, or when this is the user's very first sign-in. The moment it
  // is offered it is marked as asked, so the next sign-in never shows it again,
  // whether or not their Save or Skip reached the server.
  var ask = false;
  if (!u.changed) {
    ask = u.reset || !findRow_(sheet_('Logins'), 'userId', u.id);
    markPassword_(u.id, 'offered ' + now_());
  }

  // One atomic row, no lock, so sign-in never queues behind other users
  appendFast_(sheet_('Logins'), {
    date: now_(), userId: u.id, userName: u.name, role: u.role,
    lat: num_(loc.lat), lng: num_(loc.lng), accuracy: num_(loc.accuracy), device: String(b.device || '').slice(0, 200)
  });
  if (RECORDERS.indexOf(u.role) > -1 && loc.lat != null && loc.lng != null) {
    appendTrack_(u, loc, 'Signed in');
    tryLock_(3000, function () { upsertPresence_(u, { state: 'online', activity: 'Signed in', location: loc, device: b.device }); });
  }
  var pub = publicUser_(u);
  pub.token = makeToken_(u);
  pub.mustChange = ask;
  return { user: pub, settings: readSettings_() };
}

// Writes the passwordChanged cell for one user, adding the column if needed
function markPassword_(id, value) {
  var tb = usersTable_();
  if (tb.c.changed < 0) {
    tb.sheet.getRange(1, tb.sheet.getLastColumn() + 1).setValue('passwordChanged').setFontWeight('bold');
    tb = usersTable_();
  }
  var u = tb.users.filter(function (x) { return x.id === String(id); })[0];
  if (!u) return false;
  var cell = tb.sheet.getRange(u.row, tb.c.changed + 1);
  cell.setNumberFormat('@');
  cell.setValue(value);
  clearUsersCache_();
  return true;
}

// First sign-in (or after an admin reset): the user picks their own password,
// or keeps the one they were given (keep: true). Either way they aren't asked again.
function changePassword_(b) {
  var t = readToken_(b.token);
  if (!t) fail_('Session not valid. Sign in again.');
  if (b.keep) {
    var who = findUser_(t.id);
    if (!who || !who.active) fail_('This account is no longer active.');
    markPassword_(t.id, 'kept ' + now_());
    return {};
  }
  var np = String(b.newPassword || '').trim();
  if (np.length < 6) fail_('Use at least 6 characters.');
  if (/\s/.test(np)) fail_('Leave out spaces.');
  if (np.length > 40) fail_('Use 40 characters or fewer.');
  var msg = null;
  withLock_(function () {
    var tb = usersTable_();
    if (tb.c.changed < 0) {
      tb.sheet.getRange(1, tb.sheet.getLastColumn() + 1).setValue('passwordChanged').setFontWeight('bold');
      tb = usersTable_();
    }
    var u = tb.users.filter(function (x) { return x.id === t.id; })[0];
    if (!u || !u.active) { msg = 'This account is no longer active.'; return; }
    if (np.toLowerCase() === u.password.toLowerCase()) { msg = 'Pick a password different from the one you were given.'; return; }
    if (np.toLowerCase() === u.username.toLowerCase()) { msg = 'Your password cannot be your username.'; return; }
    var pass = tb.sheet.getRange(u.row, tb.c.pass + 1);
    pass.setNumberFormat('@');
    pass.setValue(safe_(np));
    var when = tb.sheet.getRange(u.row, tb.c.changed + 1);
    when.setNumberFormat('@');
    when.setValue(now_());
  });
  if (msg) fail_(msg);
  clearUsersCache_();
  return {};
}

function ping_(b) {
  var t = readToken_(b.token);
  if (!t) fail_('Session not valid. Sign in again.');
  var real = findUser_(t.id);
  if (!real || !real.active) fail_('This account is no longer active.');
  var u = { id: real.id, name: real.name, role: real.role };
  var loc = b.location || {};
  if (loc.lat != null && loc.lng != null) appendTrack_(u, loc, b.activity);
  tryLock_(3000, function () {
    upsertPresence_(u, { state: b.state === 'offline' ? 'offline' : 'online', activity: b.activity, location: loc, device: b.device });
  });
  if (b.state === 'offline') return {};
  // The bell, the outlet data version and the limits ride along, so the phone needs no extra calls
  return { notes: notesFor_(u), packVersion: packVersion_(), settings: readSettings_() };
}

function flag_(b) {
  var t = readToken_(b.token);
  if (!t) fail_('Session not valid.');
  addFlag_({ id: t.id, name: String(b.userName || t.id) }, '', String(b.type || '').slice(0, 40), String(b.detail || '').slice(0, 300), true);
  return {};
}

function upsertPresence_(u, p) {
  var sheet = sheet_('Presence');
  var loc = p.location || {};
  var row = { userId: u.id, userName: u.name, lastSeen: now_(), state: p.state, activity: String(p.activity || '').slice(0, 200) };
  if (p.device) row.device = String(p.device).slice(0, 200);
  if (loc.lat != null && loc.lng != null) {
    row.lat = num_(loc.lat); row.lng = num_(loc.lng); row.accuracy = num_(loc.accuracy);
    row.locTime = loc.at ? new Date(loc.at).toISOString() : now_();
  }
  if (!updateWhere_(sheet, 'userId', u.id, row)) appendByHeader_(sheet, row);
}

function appendTrack_(u, loc, activity) {
  if (loc.lat == null || loc.lng == null) return;
  appendFast_(sheet_('Track'), {
    date: now_(), userId: u.id, userName: u.name, lat: num_(loc.lat), lng: num_(loc.lng),
    accuracy: num_(loc.accuracy), activity: String(activity || '').slice(0, 200)
  });
}

/* ================= alerts and notifications ================= */

var FLAG_TEXT = {
  devtools: 'Developer tools detected', 'location-off': 'Location switched off', 'away-from-outlet': 'Away from outlet',
  'high-amount': 'High amount', 'duplicate-receipt': 'Duplicate receipt', 'short-visit': 'Very short visit'
};

// fast = one atomic append without the lock (for flags sent from phones)
function addFlag_(user, visitId, type, detail, fast) {
  var row = {
    id: 'FLG-' + Date.now() + '-' + Utilities.getUuid().slice(0, 4), date: now_(), userId: user.id, userName: user.name,
    visitId: visitId || '', type: type, detail: detail, status: 'open'
  };
  if (fast) appendFast_(sheet_('Flags'), row);
  else appendByHeader_(sheet_('Flags'), row);
}

function notifications_(b) {
  var u = requireUser_(b.token);
  return { notes: notesFor_(u) };
}

function notesFor_(u) {
  var since = new Date(Date.now() - 30 * 864e5).toISOString();
  var role = VIEWERS.indexOf(u.role) > -1 ? u.role : 'sales';
  var notes = readRows_('Notifications', 400).filter(function (n) {
    var tg = String(n.target);
    return String(n.date) >= since && (tg === 'all' || tg === role || tg === 'user:' + u.id);
  }).map(function (n) {
    return { id: String(n.id), date: String(n.date), kind: String(n.kind || 'notice'), title: String(n.title), body: String(n.body || ''), from: String(n.fromName || '') };
  });
  if (role !== 'sales') {
    var fSince = new Date(Date.now() - 14 * 864e5).toISOString();
    var scope = role !== 'admin' ? scopeFor_(findUser_(u.id) || u) : null;
    readRows_('Flags', 300).forEach(function (f) {
      if (String(f.status) === 'resolved' || String(f.date) < fSince) return;
      if (scope && !scope.ids[String(f.userId)]) return;
      notes.push({ id: 'flag:' + f.id, date: String(f.date), kind: 'flag', title: String(f.userName) + ': ' + (FLAG_TEXT[f.type] || f.type), body: String(f.detail || '') });
    });
  }
  if (role === 'admin') {
    readRows_('Outlets', 0).forEach(function (o) {
      if (String(o.status) !== 'pending') return;
      notes.push({ id: 'req:' + o.key, date: String(o.createdAt), kind: 'request', title: 'New outlet request', body: String(o.outletName) + ' from ' + String(o.requestedByName) });
    });
  }
  notes.sort(function (a, b) { return a.date < b.date ? 1 : -1; });
  return notes.slice(0, 60);
}

function addNotice_(from, target, kind, title, body) {
  appendByHeader_(sheet_('Notifications'), {
    id: 'NTF-' + Date.now() + '-' + Utilities.getUuid().slice(0, 4), date: now_(), fromId: from.id, fromName: from.name,
    target: target, kind: kind, title: String(title).slice(0, 120), body: String(body || '').slice(0, 1000)
  });
}

function resolveFlag_(b) {
  var me = requireUser_(b.token, VIEWERS);
  var done = false;
  withLock_(function () {
    done = updateWhere_(sheet_('Flags'), 'id', String(b.id), { status: 'resolved', resolvedBy: me.name, resolvedAt: now_() });
  });
  if (!done) fail_('Alert not found.');
  return {};
}

function sendNotice_(b) {
  var me = requireUser_(b.token, ['admin']);
  var target = String(b.target || 'all');
  if (['all', 'sales', 'asm', 'rtm', 'manager', 'admin'].indexOf(target) < 0 && target.indexOf('user:') !== 0) fail_('Pick who should get it.');
  if (!String(b.title || '').trim()) fail_('Add a title.');
  withLock_(function () { addNotice_(me, target, 'notice', String(b.title).trim(), String(b.body || '').trim()); });
  return {};
}

/* ================= outlets ================= */

function normId_(v) { return String(v == null ? '' : v).trim().toUpperCase().replace(/^'/, '').replace(/\s+/g, ''); }

function outletsVersion_() { return props_().getProperty('OUTLETS_VERSION') || '0'; }
function bumpOutlets_() { props_().setProperty('OUTLETS_VERSION', String(Date.now())); }

function nationalCols_(sheet) {
  var head = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]
    .map(function (h) { return String(h).trim().toLowerCase().replace(/[^a-z0-9]/g, ''); });
  var col = function (names) {
    for (var i = 0; i < names.length; i++) { var x = head.indexOf(names[i]); if (x > -1) return x; }
    return -1;
  };
  return {
    width: head.length,
    id: col(['id', 'outletid', 'accountid', 'customerid', 'outletcode', 'customercode', 'accountcode', 'outletno', 'customerno', 'accountno', 'accountnumber', 'sapid', 'sapcode', 'code']),
    name: col(['account', 'accountname', 'outletname', 'customername', 'name', 'outlet', 'customer']),
    division: col(['division']), agent: col(['agent']), parent: col(['parentterritory']), territory: col(['territory']),
    lat: col(['latitude', 'lat']), lng: col(['longitude', 'lng', 'long'])
  };
}

// Changes when rows are added or removed, the first or last row changes, or
// an admin edits the approved Outlets list. Phones also refresh once a day.
function packVersion_() {
  var cache = CacheService.getScriptCache();
  var hit = cache.get('packver_v2');
  if (hit) return hit;
  var v = '0';
  var sheet = nationalSheet_();
  if (sheet && sheet.getLastRow() > 1) {
    var last = sheet.getLastRow(), cols = sheet.getLastColumn();
    var a = sheet.getRange(2, 1, 1, cols).getValues()[0].join('|');
    var z = sheet.getRange(last, 1, 1, cols).getValues()[0].join('|');
    v = last + '-' + Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, a + '#' + z)).slice(0, 10);
  }
  v = v + '-' + outletsVersion_();
  cache.put('packver_v2', v, 300);
  return v;
}

// One outlet from National Outlet by ID. Hits are cached 6 hours; misses
// only 60 seconds, so outlets added to the tab show up straight away.
function nationalLookup_(id) {
  id = normId_(id);
  if (!id) return null;
  var cache = CacheService.getScriptCache();
  var hit = cache.get('nat2_' + id);
  if (hit) return hit === '-' ? null : JSON.parse(hit);
  var sheet = nationalSheet_();
  if (!sheet) return null;
  var c = nationalCols_(sheet);
  if (c.id < 0) return null;
  var n = sheet.getLastRow() - 1;
  var r = 0;
  var found = sheet.getRange(2, c.id + 1, n, 1).createTextFinder(id).matchEntireCell(true).matchCase(false).findNext();
  if (found) r = found.getRow();
  else {
    // IDs stored as numbers with separators, as text with spaces or an apostrophe
    var ids = sheet.getRange(2, c.id + 1, n, 1).getValues();
    for (var i = 0; i < ids.length; i++) if (normId_(ids[i][0]) === id) { r = i + 2; break; }
  }
  var out = null;
  if (r) {
    var row = sheet.getRange(r, 1, 1, c.width).getValues()[0];
    var at = function (i) { return i < 0 ? '' : String(row[i]).trim(); };
    out = {
      outletId: id, outletName: at(c.name), division: at(c.division), agent: at(c.agent), parentTerritory: at(c.parent), territory: at(c.territory),
      lat: c.lat > -1 ? coord_(row[c.lat], 90) : '', lng: c.lng > -1 ? coord_(row[c.lng], 180) : ''
    };
  }
  cache.put('nat2_' + id, out ? JSON.stringify(out) : '-', out ? 21600 : 60);
  return out;
}

function activeOutletMap_() {
  var map = {};
  readRows_('Outlets', 0).forEach(function (o) { if (String(o.status) === 'active') map[normId_(o.outletId)] = o; });
  return map;
}

// National Outlet first, then outlets the admin approved
function findOutlet_(id) {
  var n = nationalLookup_(id);
  var o = activeOutletMap_()[normId_(id)];
  if (n) {
    // Coordinates for the distance check: the Outlets tab wins if it has them
    if (o && coord_(o.lat, 90) !== '' && coord_(o.lng, 180) !== '') { n.lat = coord_(o.lat, 90); n.lng = coord_(o.lng, 180); }
    return n;
  }
  if (!o) return null;
  return { outletId: normId_(id), outletName: String(o.outletName).replace(/^'/, ''), division: '', agent: '', parentTerritory: '', territory: '', lat: coord_(o.lat, 90), lng: coord_(o.lng, 180) };
}

function lookupOutlet_(b) {
  requireUser_(b.token);
  var id = normId_(b.outletId);
  if (!id) fail_('Enter the Outlet ID.');
  var o = findOutlet_(id);
  if (!o) return { found: false };
  return { found: true, outlet: { outletId: o.outletId, outletName: o.outletName, division: o.division, agent: o.agent, parentTerritory: o.parentTerritory, territory: o.territory } };
}

/* The user's division of National Outlet, packed small for the phone: names
   that repeat are sent once and referred to by number. Approved outlets from
   the Outlets tab are added at the end. A user with a blank or unmatched
   region gets every outlet. */
function outletPack_(b) {
  var u = requireUser_(b.token);
  var version = packVersion_();
  var agents = agentsOf_(u.agent);
  var region = String(u.region || '').trim().toLowerCase();
  var key = version + '|' + region + '|' + agents.join(',');
  if (b.version && b.version === key) return { same: true, version: key };
  var hit = cacheGetBig_('pack_' + key);
  if (hit) return JSON.parse(hit);

  var dict = [], index = {};
  var ref = function (v) {
    v = String(v == null ? '' : v).trim();
    if (!(v in index)) { index[v] = dict.length; dict.push(v); }
    return index[v];
  };
  var rows = [], seen = {}, label = '';
  var sheet = nationalSheet_();
  if (sheet && sheet.getLastRow() > 1) {
    var c = nationalCols_(sheet);
    if (c.id > -1) {
      var values = sheet.getRange(2, 1, sheet.getLastRow() - 1, c.width).getValues();
      var lower = function (r, i) { return i < 0 ? '' : String(r[i]).trim().toLowerCase(); };
      // The user's agent if it matches any outlets, else their division, else everything
      var byAgent = agents.length && c.agent > -1 && values.some(function (r) { return agents.indexOf(lower(r, c.agent)) > -1; });
      var byDiv = !byAgent && !!region && c.division > -1 && values.some(function (r) { return lower(r, c.division) === region; });
      label = byAgent ? u.agent : byDiv ? u.region : '';
      var cell = function (r, i) { return i < 0 ? '' : r[i]; };
      for (var r = 0; r < values.length; r++) {
        var row = values[r];
        var id = normId_(row[c.id]);
        if (!id || seen[id]) continue;
        if (byAgent && agents.indexOf(lower(row, c.agent)) < 0) continue;
        if (byDiv && lower(row, c.division) !== region) continue;
        seen[id] = true;
        rows.push([id, String(cell(row, c.name)).trim(), ref(cell(row, c.division)), ref(cell(row, c.agent)), ref(cell(row, c.parent)), ref(cell(row, c.territory))]);
      }
    }
  }
  var empty = ref('');
  readRows_('Outlets', 0).forEach(function (o) {
    var id = normId_(o.outletId);
    if (String(o.status) !== 'active' || !id || seen[id]) return;
    seen[id] = true;
    rows.push([id, String(o.outletName).replace(/^'/, ''), empty, empty, empty, empty]);
  });
  var out = { version: key, division: label, dict: dict, rows: rows };
  cachePutBig_('pack_' + key, JSON.stringify(out), 21600);
  return out;
}

// CacheService holds 100 KB per entry, so big values are stored in pieces
function cachePutBig_(key, text, ttl) {
  var cache = CacheService.getScriptCache();
  var size = 90000, parts = {}, n = Math.ceil(text.length / size);
  if (n > 200) return;
  var tag = Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, key)).slice(0, 16);
  for (var i = 0; i < n; i++) parts['big_' + tag + '_' + i] = text.slice(i * size, (i + 1) * size);
  parts['big_' + tag + '_n'] = String(n);
  try { cache.putAll(parts, ttl); } catch (e) { /* cache full: next request rebuilds */ }
}

function cacheGetBig_(key) {
  var cache = CacheService.getScriptCache();
  var tag = Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, key)).slice(0, 16);
  var n = Number(cache.get('big_' + tag + '_n') || 0);
  if (!n) return null;
  var keys = [];
  for (var i = 0; i < n; i++) keys.push('big_' + tag + '_' + i);
  var got = cache.getAll(keys);
  var text = '';
  for (var j = 0; j < n; j++) {
    if (got[keys[j]] == null) return null;
    text += got[keys[j]];
  }
  return text;
}

// The approved Outlets list
function outlets_(b) {
  requireUser_(b.token);
  var list = readRows_('Outlets', 0).filter(function (o) { return String(o.status) === 'active'; })
    .map(function (o) { return [normId_(o.outletId), String(o.outletName).replace(/^'/, ''), coord_(o.lat, 90), coord_(o.lng, 180)]; });
  return { version: outletsVersion_(), list: list };
}

function requestOutlet_(b) {
  var u = requireUser_(b.token);
  var name = String(b.outletName || '').trim();
  var id = normId_(b.outletId);
  if (!name) fail_('Enter the outlet name.');
  if (id && findOutlet_(id)) fail_(id + ' is already in the outlet data.');
  var loc = b.location || {};
  withLock_(function () {
    appendByHeader_(sheet_('Outlets'), {
      key: 'OUT-' + Utilities.getUuid().slice(0, 8).toUpperCase(), outletId: id, outletName: name, status: 'pending',
      requestedBy: u.id, requestedByName: u.name, lat: num_(loc.lat), lng: num_(loc.lng), createdAt: now_(), updatedAt: now_()
    });
  });
  return {};
}

function saveOutlet_(b) {
  var me = requireUser_(b.token, ['admin']);
  var o = b.outlet || {};
  var id = normId_(o.outletId);
  var name = String(o.outletName || '').trim();
  var status = ['active', 'inactive', 'pending', 'rejected'].indexOf(o.status) > -1 ? o.status : 'active';
  if (status !== 'rejected' && (!id || !name)) fail_('Outlet ID and name are both required.');
  var result = null;
  withLock_(function () {
    var sheet = sheet_('Outlets');
    var rows = readRows_('Outlets', 0);
    var clash = rows.filter(function (r) { return normId_(r.outletId) === id && r.key !== o.key && (r.status === 'active' || r.status === 'inactive'); })[0];
    if (id && status !== 'rejected' && clash) { result = id + ' is already used by ' + clash.outletName + '.'; return; }
    var before = rows.filter(function (r) { return o.key && r.key === o.key; })[0];
    var row = { outletId: id, outletName: name, status: status, updatedAt: now_() };
    if (o.lat !== undefined) row.lat = coord_(o.lat, 90);
    if (o.lng !== undefined) row.lng = coord_(o.lng, 180);
    if (before) {
      if (status === 'rejected') { delete row.outletId; delete row.outletName; }
      updateWhere_(sheet, 'key', o.key, row);
      if (before.status === 'pending' && before.requestedBy) {
        if (status === 'active') addNotice_(me, 'user:' + before.requestedBy, 'approved', 'Outlet approved', name + ' (' + id + ') is on the list. You can record visits there now.');
        if (status === 'rejected') addNotice_(me, 'user:' + before.requestedBy, 'rejected', 'Outlet request declined', String(before.outletName) + (o.reason ? ': ' + String(o.reason).slice(0, 300) : ''));
      }
    } else {
      row.key = 'OUT-' + Utilities.getUuid().slice(0, 8).toUpperCase();
      row.createdAt = now_();
      appendByHeader_(sheet, row);
    }
    bumpOutlets_();
  });
  if (result) fail_(result);
  CacheService.getScriptCache().remove('packver_v2');
  return {};
}

// Paste from Excel: one [id, name, lat, lng] per row
function importOutlets_(b) {
  requireUser_(b.token, ['admin']);
  var rows = (b.rows || []).map(function (r) { return [normId_(r[0]), String(r[1] || '').trim(), coord_(r[2], 90), coord_(r[3], 180)]; })
    .filter(function (r) { return r[0] && r[1]; });
  var added = 0, updated = 0, skipped = (b.rows || []).length - rows.length;
  withLock_(function () {
    var sheet = sheet_('Outlets');
    var headers = headers_(sheet);
    var existing = {};
    readRows_('Outlets', 0).forEach(function (o) { if (o.status !== 'rejected' && o.outletId) existing[normId_(o.outletId)] = o; });
    var seen = {}, fresh = [];
    rows.forEach(function (r) {
      if (seen[r[0]]) { skipped++; return; }
      seen[r[0]] = true;
      var hit = existing[r[0]];
      if (hit) {
        var patch = {};
        if (String(hit.outletName) !== r[1]) patch.outletName = r[1];
        if (r[2] !== '' && r[3] !== '' && (Number(hit.lat) !== r[2] || Number(hit.lng) !== r[3])) { patch.lat = r[2]; patch.lng = r[3]; }
        if (Object.keys(patch).length) { patch.updatedAt = now_(); updateWhere_(sheet, 'key', hit.key, patch); updated++; } else skipped++;
      } else {
        var o = { key: 'OUT-' + Utilities.getUuid().slice(0, 8).toUpperCase(), outletId: r[0], outletName: r[1], lat: r[2], lng: r[3], status: 'active', createdAt: now_(), updatedAt: now_() };
        fresh.push(headers.map(function (h) { return Object.prototype.hasOwnProperty.call(o, h) ? safe_(o[h]) : ''; }));
        added++;
      }
    });
    if (fresh.length) {
      var start = sheet.getLastRow() + 1;
      headers.forEach(function (h, i) { if (TEXT_COLS.indexOf(h) > -1) sheet.getRange(start, i + 1, fresh.length, 1).setNumberFormat('@'); });
      sheet.getRange(start, 1, fresh.length, headers.length).setValues(fresh);
    }
    bumpOutlets_();
  });
  CacheService.getScriptCache().remove('packver_v2');
  return { added: added, updated: updated, skipped: skipped };
}

/* ================= photos ================= */

function cleanVisitId_(v) {
  var id = String(v || '').trim();
  if (!/^PAY-[A-Z0-9-]{6,40}$/.test(id)) fail_('Visit ID is not valid.');
  return id;
}

// Drive subfolder per month (Addis time): 2026-10, 2026-11...
function monthFolder_() {
  var name = Utilities.formatDate(new Date(), 'Africa/Addis_Ababa', 'yyyy-MM');
  var root = photoFolder_();
  var it = root.getFoldersByName(name);
  return it.hasNext() ? it.next() : root.createFolder(name);
}

function photoRow_(id) {
  var sheet = sheet_('Photos');
  var r = findRow_(sheet, 'id', id);
  if (!r) return null;
  var h = headers_(sheet);
  var row = sheet.getRange(r, 1, 1, h.length).getValues()[0];
  var o = { row: r };
  h.forEach(function (k, i) { if (k !== 'thumb') o[k] = row[i]; });
  return o;
}

// Saves one photo to Drive and the Photos tab. A repeat for the same visit
// and kind returns the first one. The Drive file is written before the lock,
// so the lock is held only for the sheet row.
function uploadPhoto_(b) {
  var t = readToken_(b.token);
  if (!t) fail_('Photo has no valid sign-in. Sign out and in again.');
  var user = findUser_(t.id);
  if (!user || !user.active) fail_('This account is no longer active.');
  var visitId = cleanVisitId_(b.visitId);
  var kind = b.kind === 'engagement' ? 'engagement' : b.kind === 'receipt' ? 'receipt' : fail_('Photo kind is not valid.');
  var photoId = visitId + '_' + kind;

  var have = photoRow_(photoId);
  if (have) return { photoId: photoId, url: String(have.url), duplicate: true };

  var bytes = Utilities.base64Decode(String(b.data || ''));
  if (!bytes.length) fail_('The photo is empty.');
  if (bytes.length > MAX_PHOTO_BYTES) fail_('The photo is too big.');
  var file = monthFolder_().createFile(Utilities.newBlob(bytes, 'image/jpeg', photoId + '.jpg'));
  var thumb = String(b.thumb || '');
  var row = {
    id: photoId, visitId: visitId, kind: kind, fileId: file.getId(), url: 'https://drive.google.com/file/d/' + file.getId() + '/view',
    hash: String(b.hash || '').slice(0, 80), source: kind === 'engagement' ? 'camera' : b.source === 'gallery' ? 'gallery' : 'camera',
    takenAt: String(b.takenAt || ''), lat: num_(b.lat), lng: num_(b.lng), sizeKb: Math.round(bytes.length / 1024),
    uploadedAt: now_(), userId: user.id, thumb: thumb.length <= MAX_THUMB_CHARS ? thumb : ''
  };

  var kept = null;
  withLock_(function () {
    var again = photoRow_(photoId);
    if (again) { kept = again; return; }
    appendByHeader_(sheet_('Photos'), row);
  });
  if (kept) {
    file.setTrashed(true);
    return { photoId: photoId, url: String(kept.url), duplicate: true };
  }

  // The same receipt file on another visit
  if (kind === 'receipt' && row.hash) {
    var sheet = sheet_('Photos');
    var h = headers_(sheet);
    var hc = h.indexOf('hash') + 1;
    var others = sheet.getRange(2, hc, Math.max(1, sheet.getLastRow() - 1), 1).createTextFinder(row.hash).matchEntireCell(true).findAll()
      .map(function (cell) { return sheet.getRange(cell.getRow(), 1, 1, h.length).getValues()[0]; })
      .filter(function (r) { return String(r[h.indexOf('kind')]) === 'receipt' && String(r[h.indexOf('visitId')]) !== visitId; })
      .map(function (r) { return String(r[h.indexOf('visitId')]); });
    if (others.length) {
      withLock_(function () { addFlag_(user, visitId, 'duplicate-receipt', 'Same receipt as ' + others.join(', ') + ' (this visit ' + visitId + ')'); });
    }
  }
  return { photoId: photoId, url: row.url };
}

// Photos load in the app only through here. Managers get photos of their division only.
function getPhoto_(b) {
  var me = requireUser_(b.token, VIEWERS);
  var scope = scopeFor_(me);
  var divisions = null;
  var allowed = function (visitId) {
    if (!scope) return true;
    if (!divisions) {
      divisions = {};
      var vs = sheet_('Visits');
      var h = headers_(vs);
      if (vs.getLastRow() > 1) {
        var ic = h.indexOf('id'), dc = h.indexOf('division'), ac = h.indexOf('agent'), uc = h.indexOf('userId');
        vs.getRange(2, 1, vs.getLastRow() - 1, h.length).getValues().forEach(function (r) { divisions[String(r[ic])] = { division: r[dc], agent: r[ac], userId: r[uc] }; });
      }
    }
    var v = divisions[visitId];
    return !!v && visitInScope_(scope, v);
  };

  if (b.ids) {
    var sheet = sheet_('Photos');
    var h = headers_(sheet);
    var out = {};
    if (sheet.getLastRow() > 1) {
      var ids = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
      var rowOf = {};
      ids.forEach(function (r, i) { rowOf[String(r[0])] = i + 2; });
      var tc = h.indexOf('thumb') + 1, vc = h.indexOf('visitId') + 1;
      (b.ids || []).slice(0, 60).forEach(function (id) {
        var r = rowOf[String(id)];
        if (!r) return;
        if (!allowed(String(sheet.getRange(r, vc).getValue()))) return;
        out[id] = tc > 0 ? String(sheet.getRange(r, tc).getValue() || '') : '';
      });
    }
    return { photos: out };
  }

  var p = photoRow_(String(b.id || ''));
  if (!p) fail_('Photo not found.');
  if (!allowed(String(p.visitId))) fail_('This photo is outside your area.');
  var blob = DriveApp.getFileById(String(p.fileId)).getBlob();
  return { data: Utilities.base64Encode(blob.getBytes()), mime: blob.getContentType() || 'image/jpeg' };
}

/* ================= visits ================= */

function addVisit_(b) {
  var v = b.visit || {};
  // The token travels inside the visit, so a queued visit is credited to the
  // user who recorded it even if someone else is signed in when it uploads.
  var t = readToken_(v.token);
  if (!t || t.id !== String(v.userId)) fail_('Visit has no valid sign-in. Sign out and in again.');
  var user = findUser_(t.id);
  if (!user || !user.active) fail_('This account is no longer active.');
  var id = cleanVisitId_(v.id);
  var visits = sheet_('Visits');
  if (findRow_(visits, 'id', id)) return { id: id, duplicate: true };

  var outletId = normId_(v.outletId);
  var outlet = findOutlet_(outletId);
  if (!outlet) fail_('Outlet ID ' + outletId + ' is not in the outlet data.');
  if (ACTIVITIES.indexOf(v.activity) < 0) fail_('Choose one of the four activities.');
  var unit = v.investmentUnit === 'Crate' ? 'Crate' : v.investmentUnit === 'Birr' ? 'Birr' : fail_('Choose Birr or Crate.');
  var amount = Number(v.amount);
  if (!(amount > 0)) fail_('The amount must be above zero.');
  if (unit === 'Crate' && Math.round(amount) !== amount) fail_('Crates must be a whole number.');
  if (unit === 'Birr') amount = Math.round(amount * 100) / 100;

  var receipt = photoRow_(id + '_receipt');
  var engagement = photoRow_(id + '_engagement');
  if (!receipt) fail_('The visit has no receipt photo. Sync again.');
  if (!engagement) fail_('The visit has no engagement photo. Sync again.');

  var settings = readSettings_();
  var r = v.receipt || {}, e = v.engagement || {};
  var row = {
    id: id, status: 'Saved', date: isoOr_(v.finishedAt, now_()), userId: user.id, userName: user.name, staffId: user.staffId || '',
    outletId: outletId, outletName: outlet.outletName, division: outlet.division, agent: outlet.agent, parentTerritory: outlet.parentTerritory, territory: outlet.territory,
    activity: v.activity, investmentUnit: unit, amount: amount,
    receiptPhotoId: receipt.id, receiptUrl: String(receipt.url), receiptSource: String(receipt.source), receiptHash: String(receipt.hash), receiptAt: isoOr_(r.at, String(receipt.takenAt)),
    engagementPhotoId: engagement.id, engagementUrl: String(engagement.url), engagementHash: String(engagement.hash), engagementAt: isoOr_(e.at, String(engagement.takenAt)),
    engagementLat: num_(e.lat), engagementLng: num_(e.lng),
    startedAt: isoOr_(v.startedAt, ''), startLat: num_(v.startLat), startLng: num_(v.startLng), startAccuracy: num_(v.startAccuracy),
    lat: num_(v.lat), lng: num_(v.lng), accuracy: num_(v.accuracy), distanceM: '',
    device: String(v.device || '').slice(0, 200), appVersion: String(v.appVersion || '').slice(0, 20), uploadedAt: now_()
  };
  if (outlet.lat !== '' && outlet.lng !== '' && outlet.lat != null && row.lat !== '' && row.lng !== '') {
    row.distanceM = Math.round(distanceM_(row.lat, row.lng, Number(outlet.lat), Number(outlet.lng)));
  }

  var alerts = [];
  var limit = unit === 'Crate' ? settings.crateLimit : settings.birrLimit;
  if (amount > limit) alerts.push(['high-amount', amount.toLocaleString() + ' ' + (unit === 'Crate' ? 'crates' : 'Birr') + ' is above the ' + limit.toLocaleString() + ' limit']);
  if (row.distanceM !== '' && row.distanceM > settings.distanceLimitM) alerts.push(['away-from-outlet', outlet.outletName + ' (' + outletId + ') ' + row.distanceM + ' m away']);
  var mins = (new Date(row.date).getTime() - new Date(row.startedAt).getTime());
  if (row.startedAt && !isNaN(mins) && mins < SHORT_VISIT_MS) alerts.push(['short-visit', 'Finished ' + Math.max(0, Math.round(mins / 1000)) + ' seconds after start']);

  var duplicate = false;
  withLock_(function () {
    if (findRow_(visits, 'id', id)) { duplicate = true; return; }
    appendByHeader_(visits, row);
    alerts.forEach(function (a) { addFlag_(user, id, a[0], a[1]); });
  });
  return { id: id, duplicate: duplicate };
}

function isoOr_(v, fallback) {
  var d = v ? new Date(v) : null;
  return d && !isNaN(d.getTime()) ? d.toISOString() : fallback;
}

var VISIT_LIST_FIELDS = ['id', 'status', 'date', 'userId', 'userName', 'staffId', 'outletId', 'outletName', 'division', 'agent', 'parentTerritory', 'territory',
  'activity', 'investmentUnit', 'amount', 'receiptPhotoId', 'engagementPhotoId', 'lat', 'lng', 'distanceM', 'startedAt'];

function pickFields_(o, fields) {
  var out = {};
  fields.forEach(function (f) { out[f] = o[f] === undefined ? '' : o[f]; });
  return out;
}

function visitsBetween_(from, to) {
  return readRows_('Visits', 0).filter(function (r) {
    var d = String(r.date);
    return (!from || d >= from) && (!to || d < to);
  });
}

// The user's own visits for the last 7 days, for Today's visits after a reinstall
function myVisits_(b) {
  var me = requireUser_(b.token);
  var since = new Date(Date.now() - 7 * 864e5).toISOString();
  var list = visitsBetween_(since, '').filter(function (r) { return String(r.userId) === me.id && String(r.status) !== 'Void'; })
    .map(function (r) { return { id: r.id, finishedAt: r.date, outletId: r.outletId, outletName: r.outletName, activity: r.activity, investmentUnit: r.investmentUnit, amount: r.amount }; });
  return { visits: list };
}

function managerData_(b) {
  var me = requireUser_(b.token, VIEWERS);
  var scope = scopeFor_(me);
  var from = b.from ? String(b.from) : '';
  var to = b.to ? String(b.to) : '';
  var visits = visitsBetween_(from, to).filter(function (v) { return visitInScope_(scope, v); })
    .map(function (v) { return pickFields_(v, VISIT_LIST_FIELDS); });
  if (b.lite) return { serverTime: now_(), visits: visits };

  var mine = function (id) { return !scope || scope.ids[String(id)]; };
  var trackFrom = b.trackFrom ? String(b.trackFrom) : new Date(Date.now() - 864e5).toISOString();
  var flagFrom = from && from < trackFrom ? from : trackFrom;
  return {
    serverTime: now_(),
    division: scope && scope.kind === 'division' ? scope.division : '',
    scopeLabel: scope ? scope.label : '',
    users: readUsers_().filter(function (u) { return RECORDERS.indexOf(u.role) > -1 && u.active && mine(u.id); })
      .map(function (u) { return { id: u.id, name: u.name, username: u.username, staffId: u.staffId, region: u.region, agent: u.agent, role: u.role }; }),
    presence: readRows_('Presence', 0).filter(function (p) { return mine(p.userId); }),
    visits: visits,
    track: readRows_('Track', 8000).filter(function (r) { return String(r.date) >= trackFrom && mine(r.userId); }),
    flags: readRows_('Flags', 1000).filter(function (r) { return String(r.date) >= flagFrom && mine(r.userId); }),
    notes: notesFor_(me)
  };
}

function visitDetail_(b) {
  var me = requireUser_(b.token, VIEWERS);
  var sheet = sheet_('Visits');
  var r = findRow_(sheet, 'id', String(b.id || ''));
  if (!r) fail_('Visit not found.');
  var h = headers_(sheet);
  var vals = sheet.getRange(r, 1, 1, h.length).getValues()[0];
  var v = {};
  h.forEach(function (k, i) { v[k] = vals[i] instanceof Date ? vals[i].toISOString() : vals[i]; });
  if (!visitInScope_(scopeFor_(me), v)) fail_('This visit is outside your area.');
  var flags = readRows_('Flags', 0).filter(function (f) { return String(f.visitId) === String(v.id); });
  var o = findOutlet_(v.outletId);
  return { visit: v, flags: flags, outlet: o && o.lat !== '' ? { lat: o.lat, lng: o.lng } : null };
}

function voidVisit_(b) {
  var me = requireUser_(b.token, ['admin']);
  var reason = String(b.reason || '').trim();
  if (!reason) fail_('Give a reason.');
  var done = false;
  withLock_(function () {
    done = updateWhere_(sheet_('Visits'), 'id', String(b.id || ''), { status: 'Void', voidReason: reason.slice(0, 300), voidBy: me.name, voidAt: now_() });
  });
  if (!done) fail_('Visit not found.');
  return {};
}

// Filtered rows in pages of 2,000. The first page is logged in Exports.
function exportVisits_(b) {
  var me = requireUser_(b.token, VIEWERS);
  var scope = scopeFor_(me);
  var f = b.filters || {};
  var page = Math.max(0, Number(b.page) || 0);
  var q = String(f.q || '').trim().toLowerCase();
  var rows = visitsBetween_(f.from ? String(f.from) : '', f.to ? String(f.to) : '').filter(function (v) {
    if (!visitInScope_(scope, v)) return false;
    if (f.division && !sameDiv_(v.division, f.division)) return false;
    if (f.userId && String(v.userId) !== String(f.userId)) return false;
    if (f.agent && !sameDiv_(v.agent, f.agent)) return false;
    if (f.territory && !sameDiv_(v.territory, f.territory)) return false;
    if (f.outletId && normId_(v.outletId) !== normId_(f.outletId)) return false;
    if (f.activity && String(v.activity) !== String(f.activity)) return false;
    if (f.unit && String(v.investmentUnit) !== String(f.unit)) return false;
    if (f.status && String(v.status || 'Saved') !== String(f.status)) return false;
    if (q && [v.outletId, v.outletName, v.userName, v.id].join(' ').toLowerCase().indexOf(q) < 0) return false;
    return true;
  }).sort(function (a, z) { return String(a.date) < String(z.date) ? -1 : 1; });

  var slice = rows.slice(page * EXPORT_PAGE, (page + 1) * EXPORT_PAGE);
  var ids = {};
  slice.forEach(function (v) { ids[String(v.id)] = []; });
  readRows_('Flags', 0).forEach(function (fl) {
    var list = ids[String(fl.visitId)];
    if (list) list.push(FLAG_TEXT[fl.type] || String(fl.type));
  });
  slice.forEach(function (v) { v.alerts = (ids[String(v.id)] || []).join(', '); });

  if (page === 0) {
    appendFast_(sheet_('Exports'), {
      date: now_(), userId: me.id, userName: me.name, role: me.role,
      filters: JSON.stringify({ from: f.from || '', to: f.to || '', division: scope ? scope.label : f.division || '', agent: f.agent || '', territory: f.territory || '', outletId: f.outletId || '', userId: f.userId || '', activity: f.activity || '', unit: f.unit || '', status: f.status || '', q: q }),
      rowCount: rows.length
    });
  }
  return { total: rows.length, pages: Math.max(1, Math.ceil(rows.length / EXPORT_PAGE)), page: page, rows: slice };
}

/* ================= admin ================= */

function adminData_(b) {
  var me = requireUser_(b.token, ['admin']);
  var since = new Date(Date.now() - 60 * 864e5).toISOString();
  var presence = {};
  readRows_('Presence', 0).forEach(function (p) { presence[p.userId] = String(p.lastSeen); });
  return {
    serverTime: now_(),
    users: readUsers_().map(function (u) { var p = publicUser_(u); p.lastSeen = presence[u.id] || ''; return p; }),
    outlets: readRows_('Outlets', 0).map(function (o) {
      return { key: o.key, outletId: normId_(o.outletId), outletName: String(o.outletName).replace(/^'/, ''), status: o.status, requestedBy: o.requestedBy,
        requestedByName: o.requestedByName, lat: o.lat, lng: o.lng, createdAt: o.createdAt, updatedAt: o.updatedAt };
    }),
    flags: readRows_('Flags', 1000).filter(function (f) { return String(f.date) >= since; }),
    notices: readRows_('Notifications', 200).filter(function (n) { return n.kind === 'notice'; }),
    settings: readSettings_(),
    divisions: divisionList_(),
    agents: agentList_(),
    notes: notesFor_(me)
  };
}

function saveUser_(b) {
  var me = requireUser_(b.token, ['admin']);
  var u = b.user || {};
  var username = String(u.username || '').trim();
  var name = String(u.name || '').trim();
  var staffId = String(u.staffId || '').trim().toUpperCase();
  var role = ['sales', 'asm', 'rtm', 'manager', 'admin'].indexOf(u.role) > -1 ? u.role : 'sales';
  var agent = String(u.agent || '').trim();
  var active = u.active !== false;
  var password = String(u.password || '').trim();
  var region = String(u.region || '').trim();
  if (!username || !name) fail_('Name and username are required.');
  if (/\s/.test(username)) fail_('Usernames cannot contain spaces.');
  if (role === 'asm' && !agent) fail_('Choose the agent this ASM covers.');

  var msg = null;
  withLock_(function () {
    var t = usersTable_();
    // Add any missing columns at the end before writing to them
    var need = [['id', 'id'], ['name', 'name'], ['staff', 'staffId'], ['role', 'role'], ['region', 'region'], ['agent', 'agent'], ['active', 'active'], ['changed', 'passwordChanged']].filter(function (p) { return t.c[p[0]] < 0; });
    if (need.length) {
      t.sheet.getRange(1, t.sheet.getLastColumn() + 1, 1, need.length).setValues([need.map(function (p) { return p[1]; })]).setFontWeight('bold');
      t = usersTable_();
    }
    var editing = u.originalId ? t.users.filter(function (x) { return x.id === String(u.originalId); })[0] : null;
    if (u.originalId && !editing) { msg = 'That user no longer exists.'; return; }
    if (t.users.some(function (x) { return x !== editing && x.username.toLowerCase() === username.toLowerCase(); })) { msg = 'Username ' + username + ' is already taken.'; return; }
    if (staffId && t.users.some(function (x) { return x !== editing && x.staffId && x.staffId.toUpperCase() === staffId; })) { msg = 'Staff ID ' + staffId + ' is already used.'; return; }
    if (!editing && !password) { msg = 'Set a password for the new user.'; return; }
    if (editing && editing.id === me.id && (role !== 'admin' || !active)) { msg = 'You cannot remove your own admin access.'; return; }

    // The internal ID is set once and never changes, so history stays linked
    var id = editing ? editing.id : staffId || username;
    if (!editing && t.users.some(function (x) { return x.id === id; })) id = id + '-' + Utilities.getUuid().slice(0, 4).toUpperCase();
    var r = editing ? editing.row : t.sheet.getLastRow() + 1;
    var put = function (ci, v) {
      if (ci < 0) return;
      var cell = t.sheet.getRange(r, ci + 1);
      cell.setNumberFormat('@');
      cell.setValue(safe_(v));
    };
    put(t.c.user, username);
    put(t.c.id, id);
    put(t.c.name, name);
    put(t.c.staff, staffId);
    // The role cell stays as typed unless the role changed. Sales is written blank.
    if (!editing || editing.role !== role) put(t.c.role, role === 'sales' ? '' : role);
    put(t.c.active, active ? 'yes' : 'no');
    put(t.c.region, region);
    put(t.c.agent, agent);
    // A password set by an admin is temporary: the user picks their own at the next sign-in
    if (password) {
      put(t.c.pass, password);
      put(t.c.changed, 'reset ' + now_());
    }
    clearUsersCache_();
  });
  if (msg) fail_(msg);
  return {};
}

/* ================= sheet helpers ================= */

// A tab as objects keyed by header. tail > 0 reads only the last N rows.
function readRows_(name, tail) {
  var sheet = ss_().getSheetByName(name);
  if (!sheet || sheet.getLastRow() < 2) return [];
  var headers = headers_(sheet);
  var last = sheet.getLastRow();
  var start = tail > 0 ? Math.max(2, last - tail + 1) : 2;
  var skip = headers.indexOf('thumb'); // thumbnails are big and never needed in lists
  var values = sheet.getRange(start, 1, last - start + 1, headers.length).getValues();
  return values.map(function (v) {
    var o = {};
    headers.forEach(function (h, i) {
      if (!h || i === skip) return;
      var x = v[i] instanceof Date ? v[i].toISOString() : v[i];
      o[h] = typeof x === 'string' && x.charAt(0) === "'" ? x.slice(1) : x;
    });
    return o;
  });
}

// Opens a tab, creating it with its headers on first use. New columns are
// added at the end; existing columns are never moved.
var sheetCache_ = {};
function sheet_(name) {
  if (sheetCache_[name]) return sheetCache_[name];
  var ss = ss_();
  var sheet = ss.getSheetByName(name) || ss.insertSheet(name);
  var want = HEADERS[name];
  if (want) {
    if (sheet.getLastRow() === 0) {
      sheet.getRange(1, 1, 1, want.length).setValues([want]).setFontWeight('bold');
      sheet.setFrozenRows(1);
    } else {
      var have = headers_(sheet);
      var missing = want.filter(function (h) { return have.indexOf(h) < 0; });
      if (missing.length) sheet.getRange(1, have.length + 1, 1, missing.length).setValues([missing]).setFontWeight('bold');
    }
  }
  sheetCache_[name] = sheet;
  return sheet;
}

function headers_(sheet) {
  return sheet.getRange(1, 1, 1, Math.max(1, sheet.getLastColumn())).getValues()[0].map(function (h) { return String(h).trim(); });
}

function findRow_(sheet, header, value) {
  var col = headers_(sheet).indexOf(header) + 1;
  if (col < 1 || sheet.getLastRow() < 2 || !String(value)) return 0;
  var hit = sheet.getRange(2, col, sheet.getLastRow() - 1, 1).createTextFinder(String(value)).matchEntireCell(true).findNext();
  return hit ? hit.getRow() : 0;
}

function updateWhere_(sheet, header, value, obj) {
  var r = findRow_(sheet, header, value);
  if (!r) return false;
  headers_(sheet).forEach(function (h, i) {
    if (!Object.prototype.hasOwnProperty.call(obj, h)) return;
    var cell = sheet.getRange(r, i + 1);
    if (TEXT_COLS.indexOf(h) > -1) cell.setNumberFormat('@');
    cell.setValue(safe_(obj[h]));
  });
  return true;
}

function appendByHeader_(sheet, obj) {
  var headers = headers_(sheet);
  var values = headers.map(function (h) { return Object.prototype.hasOwnProperty.call(obj, h) ? safe_(obj[h]) : ''; });
  var r = sheet.getLastRow() + 1;
  headers.forEach(function (h, i) { if (TEXT_COLS.indexOf(h) > -1) sheet.getRange(r, i + 1).setNumberFormat('@'); });
  sheet.getRange(r, 1, 1, headers.length).setValues([values]);
}

// One atomic appendRow, safe without the lock. Text columns get a leading
// apostrophe so IDs and ISO dates stay as typed.
function appendFast_(sheet, obj) {
  var headers = headers_(sheet);
  sheet.appendRow(headers.map(function (h) {
    if (!Object.prototype.hasOwnProperty.call(obj, h)) return '';
    var v = safe_(obj[h]);
    return TEXT_COLS.indexOf(h) > -1 && typeof v === 'string' && v !== '' && v.charAt(0) !== "'" ? "'" + v : v;
  }));
}

// Text starting with = + - @ would be read as a formula
function safe_(v) { return typeof v === 'string' && /^[=+\-@]/.test(v) ? "'" + v : v; }
function num_(v) { return v == null || v === '' || isNaN(Number(v)) ? '' : Number(v); }
function coord_(v, limit) {
  if (v == null || String(v).trim() === '') return '';
  var n = Number(String(v).trim().replace(',', '.'));
  return isNaN(n) || Math.abs(n) > limit || n === 0 ? '' : n;
}
function distanceM_(lat1, lng1, lat2, lng2) {
  var R = 6371000, toRad = Math.PI / 180;
  var dLat = (lat2 - lat1) * toRad, dLng = (lng2 - lng1) * toRad;
  var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * R * Math.asin(Math.sqrt(h));
}
function now_() { return new Date().toISOString(); }

// Presence only: skipped if the sheet is busy, the next report catches up
function tryLock_(ms, fn) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(ms)) return false;
  try { fn(); } finally { lock.releaseLock(); }
  return true;
}

function withLock_(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { fn(); } finally { lock.releaseLock(); }
}

/* ================= run from the editor ================= */

// Creates the sheet and photo folder if their IDs aren't set, every tab, the
// signing secret and default settings. Adds an admin only if Users is empty.
function paymentSetup() {
  var p = props_();
  if (!p.getProperty('SHEET_ID')) {
    var active = null;
    try { active = SpreadsheetApp.getActiveSpreadsheet(); } catch (e) { active = null; }
    var ss = active || SpreadsheetApp.create('Spot Win');
    p.setProperty('SHEET_ID', ss.getId());
    Logger.log('Sheet: ' + ss.getUrl());
  }
  if (!p.getProperty('OUTLET_SHEET_ID')) p.setProperty('OUTLET_SHEET_ID', DEFAULT_OUTLET_SHEET_ID);
  if (!p.getProperty('PHOTO_FOLDER_ID')) {
    var folder = DriveApp.createFolder('Spot Win Photos');
    p.setProperty('PHOTO_FOLDER_ID', folder.getId());
    Logger.log('Photo folder: ' + folder.getUrl());
  }
  secret_();
  ss_cache_ = null;
  Object.keys(HEADERS).forEach(sheet_);
  var s = sheet_('Settings');
  var have = readRows_('Settings', 0).map(function (r) { return String(r.key); });
  Object.keys(DEFAULT_SETTINGS).forEach(function (k) { if (have.indexOf(k) < 0) appendByHeader_(s, { key: k, value: DEFAULT_SETTINGS[k] }); });
  if (usersTable_().users.length === 0) {
    var pass = Utilities.getUuid().slice(0, 8);
    appendByHeader_(sheet_('Users'), { id: 'ADMIN1', username: 'admin', password: pass, name: 'Admin', staffId: '', role: 'admin', region: '', active: 'yes' });
    Logger.log('Admin account created. Username: admin  Password: ' + pass);
  }
  // Reads the outlet sheet once so its permission is granted now
  checkOutletData();
  Logger.log('Setup done.');
}

// Copies users (with passwords, roles and regions) from the Habesha Survey
// sheet. Usernames already here are skipped, so it is safe to run again.
function importSurveyUsers() {
  var src = outletSs_().getSheetByName('Users');
  if (!src) throw new Error('Users tab not found in the Habesha Survey sheet.');
  var values = src.getDataRange().getValues();
  var head = values[0].map(function (h) { return String(h).trim().toLowerCase(); });
  var at = function (row, names) {
    for (var i = 0; i < names.length; i++) { var x = head.indexOf(names[i]); if (x > -1) return String(row[x]).trim(); }
    return '';
  };
  var target = sheet_('Users');
  var have = {}, ids = {};
  usersTable_().users.forEach(function (u) { have[u.username.toLowerCase()] = true; ids[u.id] = true; });
  var added = 0, skipped = 0;
  withLock_(function () {
    for (var r = 1; r < values.length; r++) {
      var username = at(values[r], ['username']);
      if (!username) continue;
      if (have[username.toLowerCase()]) { skipped++; continue; }
      var id = at(values[r], ['id']) || username;
      if (ids[id]) id = id + '-' + r;
      var role = at(values[r], ['role']).toLowerCase();
      var act = at(values[r], ['active']).toLowerCase();
      appendByHeader_(target, {
        id: id, username: username, password: at(values[r], ['password']), name: at(values[r], ['name']) || username,
        staffId: at(values[r], ['staffid', 'id']), region: at(values[r], ['region', 'division']),
        role: roleOf_(role) === 'sales' ? '' : roleOf_(role), agent: at(values[r], ['agent']),
        active: ['no', 'false', 'inactive', 'blocked', '0'].indexOf(act) > -1 ? 'no' : 'yes'
      });
      have[username.toLowerCase()] = true; ids[id] = true; added++;
    }
  });
  clearUsersCache_();
  Logger.log('Imported ' + added + ' users. Skipped ' + skipped + ' already here.');
}

// Run from the editor to see which outlet tab and columns the app uses.
// Pass an ID to test a lookup, or set TEST_ID below.
function checkOutletData(testId) {
  var sheet = nationalSheet_();
  if (!sheet) {
    Logger.log('No National Outlet tab found. Put a tab named "National Outlet" in the Spot Win sheet, or in the Habesha Survey sheet (OUTLET_SHEET_ID).');
    return;
  }
  var c = nationalCols_(sheet);
  var head = sheet.getRange(1, 1, 1, c.width).getValues()[0];
  var name = function (i) { return i < 0 ? 'NOT FOUND' : '"' + head[i] + '"'; };
  Logger.log('Using tab "' + sheet.getName() + '" in "' + sheet.getParent().getName() + '" with ' + (sheet.getLastRow() - 1) + ' rows.');
  Logger.log('ID column ' + name(c.id) + ', name ' + name(c.name) + ', division ' + name(c.division) + ', agent ' + name(c.agent) +
    ', parent territory ' + name(c.parent) + ', territory ' + name(c.territory));
  if (c.id < 0) Logger.log('The ID column was not found. Name its header "ID" or "Outlet ID".');
  var first = c.id > -1 && sheet.getLastRow() > 1 ? sheet.getRange(2, c.id + 1).getValue() : '';
  var id = testId || first;
  if (id !== '') Logger.log('Lookup ' + id + ': ' + JSON.stringify(nationalLookup_(id)));
}

/* A Spot Win menu on the sheet, when the script is bound to it */
function onOpen() {
  try {
    SpreadsheetApp.getUi().createMenu('Spot Win').addItem('Run setup', 'paymentSetupFromMenu').addItem('Import survey users', 'importSurveyUsers').addToUi();
  } catch (e) { /* not bound to a sheet */ }
}

function paymentSetupFromMenu() {
  paymentSetup();
  SpreadsheetApp.getUi().alert('Setup done. All tabs, the photo folder and the settings are ready.');
}
