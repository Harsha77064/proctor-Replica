// API checks: auth, roles, invites, candidate exam flow, server-side scoring, recordings.
// Run with `npm test` (tests/run.mjs starts a throwaway server first).
const B = process.argv[2];
const jars = {};
async function call(who, method, path, body, headers = {}) {
  const h = { ...headers };
  if (jars[who]) h.cookie = jars[who];
  let payload = body;
  if (body && !(body instanceof Uint8Array)) { h['content-type'] = 'application/json'; payload = JSON.stringify(body); }
  const r = await fetch(B + path, { method, headers: h, body: payload });
  const sc = r.headers.getSetCookie?.() || [];
  if (sc.length) jars[who] = sc.map((c) => c.split(';')[0]).join('; ');
  let data = null; try { data = await r.json(); } catch {}
  return { status: r.status, data };
}
let fails = 0;
const check = (name, cond, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  ' + extra}`); if (!cond) fails++; };

let r = await call('admin', 'POST', '/api/auth/login', { email: 'admin@example.com', password: 'wrong-password1' });
check('wrong password rejected', r.status === 401);
r = await call('admin', 'POST', '/api/auth/login', { email: 'admin@example.com', password: 'Str0ngPassw0rd' });
check('admin login', r.status === 200 && r.data.user.role === 'admin');
r = await call('admin', 'POST', '/api/users', { name: 'Pat Proctor', email: 'proctor@example.com', role: 'proctor', password: 'weak' });
check('weak password rejected', r.status === 400, JSON.stringify(r.data));
r = await call('admin', 'POST', '/api/users', { name: 'Pat Proctor', email: 'proctor@example.com', role: 'proctor', password: 'Pr0ctorPassw0rd' });
check('create proctor', r.status === 201);
r = await call('proctor', 'POST', '/api/auth/login', { email: 'proctor@example.com', password: 'Pr0ctorPassw0rd' });
check('proctor login', r.status === 200);
r = await call('proctor', 'GET', '/api/data?only=questionBanks');
check('proctor cannot see answer keys', r.status === 200 && !('answer' in r.data.questionBanks[0].questions[0]));
r = await call('proctor', 'POST', '/api/candidates', { name: 'X', email: 'x@example.com' });
check('proctor cannot add candidates (403)', r.status === 403);
r = await call('proctor', 'GET', '/api/users');
check('proctor cannot list users (403)', r.status === 403);
r = await call('anon', 'GET', '/api/recordings');
check('anonymous blocked (401)', r.status === 401);

// Exam with a question bank, assigned candidate, live.
r = await call('admin', 'POST', '/api/candidates', { name: 'Test Candidate', email: 'test.candidate@example.com', department: 'QA' });
const cid = r.data.id; check('create candidate', r.status === 201 && cid);
r = await call('admin', 'POST', '/api/exams', { title: 'API Test Exam', bankId: 'QB-101', startTime: new Date().toISOString(), duration: 30, passMark: 50 });
const exId = r.data.id; check('create exam', r.status === 201);
r = await call('admin', 'POST', `/api/candidates/${cid}/assign`, { examId: exId });
check('assign exam', r.status === 200);
r = await call('admin', 'POST', `/api/exams/${exId}/invites`, { candidateIds: [cid] });
const inv = r.data.invites[0]; check('create invite with link + code', r.status === 201 && inv.link && /^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(inv.code), JSON.stringify(r.data));
const token = new URL(inv.link).searchParams.get('t');

r = await call('cand', 'POST', '/api/candidate/lookup', { token: 'x'.repeat(30) });
check('bad token rejected', r.status === 404);
r = await call('cand', 'POST', '/api/candidate/lookup', { token });
check('lookup shows exam', r.status === 200 && r.data.exam.title === 'API Test Exam');
r = await call('cand', 'POST', '/api/candidate/login', { token, code: 'AAAA-AAAA' });
check('wrong code rejected with tries left', r.status === 401 && /tries left/.test(r.data.error));
r = await call('cand', 'POST', '/api/candidate/login', { token, code: inv.code.toLowerCase().replace('-', ' ') });
check('right code (case/spacing tolerant) signs in', r.status === 200);
r = await call('cand', 'GET', '/api/data');
check('candidate cannot read staff data', r.status === 401);
r = await call('cand', 'POST', '/api/candidate/start');
check('cannot start before exam is live', r.status === 409);
await call('admin', 'PATCH', `/api/exams/${exId}`, { status: 'Live' });
r = await call('cand', 'POST', '/api/candidate/start');
const qs = r.data.attempt?.questions || [];
check('start returns questions without answer keys', r.status === 200 && qs.length === 6 && !JSON.stringify(qs).includes('"answer"'));
check('timer is server-controlled', r.data.attempt.secondsLeft > 1700 && r.data.attempt.secondsLeft <= 1800);

// Answer every question correctly using the admin's answer key.
const keys = {};
(await call('admin', 'GET', '/api/data?only=questionBanks')).data.questionBanks.find((b) => b.id === 'QB-101').questions.forEach((q) => (keys[q.id] = q.answer));
for (const q of qs.slice(0, 4)) await call('cand', 'PUT', '/api/candidate/answers', { questionId: q.id, value: keys[q.id] });
for (const q of qs.slice(4)) await call('cand', 'PUT', '/api/candidate/answers', { questionId: q.id, value: q.options.find((o) => o.value !== keys[q.id]).value });
r = await call('cand', 'PUT', '/api/candidate/answers', { questionId: 'Q-999', value: 0 });
check('unknown question rejected', r.status === 400);
r = await call('cand', 'GET', '/api/candidate/me');
check('answers saved on server (resume works)', Object.keys(r.data.attempt.answers).length === 6);
r = await call('cand', 'POST', '/api/candidate/submit');
check('submit', r.status === 200 && r.data.attempt.status === 'Submitted');
r = await call('admin', 'GET', '/api/data?only=results');
const res = r.data.results.find((x) => x.candidateId === cid && x.examId === exId);
check('server scored 4/6 = 67% Pass', res && res.correct === 4 && res.total === 6 && res.score === 67 && res.result === 'Pass', JSON.stringify(res));
r = await call('cand', 'PUT', '/api/candidate/answers', { questionId: qs[0].id, value: 0 });
check('no answers after submit', r.status === 409);
r = await call('cand2', 'POST', '/api/candidate/login', { token, code: inv.code });
check('used invite cannot sign in again', r.status === 409);

// Recordings
const bytes = new Uint8Array(2048).fill(7);
r = await call('proctor', 'POST', `/api/recordings?candidateId=${cid}&examId=${exId}&duration=3`, bytes, { 'content-type': 'video/webm' });
check('proctor uploads recording', r.status === 201, JSON.stringify(r.data));
const recId = r.data?.recording?.id;
let fr = await fetch(B + `/api/recordings/${recId}/file`, { headers: { cookie: jars.proctor } });
check('recording downloads (2048 bytes)', fr.status === 200 && (await fr.arrayBuffer()).byteLength === 2048);
fr = await fetch(B + `/api/recordings/${recId}/file`);
check('recording blocked without login', fr.status === 401);
r = await call('proctor', 'POST', `/api/recordings?candidateId=${cid}`, bytes, { 'content-type': 'text/html' });
check('non-video upload rejected', r.status === 400);
r = await call('proctor', 'DELETE', `/api/recordings/${recId}`);
check('proctor cannot delete recordings', r.status === 403);
r = await call('admin', 'GET', '/api/ice');
check('ICE config served', r.status === 200 && Array.isArray(r.data.iceServers));

// Last admin protection + deactivation
r = await call('admin', 'GET', '/api/users');
const adminId = r.data.users.find((u) => u.role === 'admin').id;
r = await call('admin', 'PATCH', `/api/users/${adminId}`, { active: false });
check('cannot deactivate the last admin', r.status === 400);
const procId = (await call('admin', 'GET', '/api/users')).data.users.find((u) => u.role === 'proctor').id;
await call('admin', 'PATCH', `/api/users/${procId}`, { active: false });
r = await call('proctor', 'GET', '/api/data?only=settings');
check('deactivated proctor is signed out', r.status === 401);

// Headers
fr = await fetch(B + '/api/health');
check('security headers', fr.headers.get('content-security-policy')?.includes("frame-ancestors 'none'") && fr.headers.get('x-content-type-options') === 'nosniff');
console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
process.exit(fails ? 1 : 0);
