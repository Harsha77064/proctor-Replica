import { useEffect, useState } from 'react';
import { useStore } from '../context/StoreContext.jsx';
import { Building2, ClipboardCheck, ShieldCheck, Bell, RotateCcw, Save, CheckCircle2 } from 'lucide-react';
import { PageHeader, Field, Toggle, Toast } from '../components/UI.jsx';

const SECTIONS = [
  { key: 'organization', label: 'Organization', desc: 'Company profile & branding', icon: Building2 },
  { key: 'exam', label: 'Exam Details', desc: 'Defaults for new exams', icon: ClipboardCheck },
  { key: 'security', label: 'Security', desc: 'Proctoring & integrity', icon: ShieldCheck },
  { key: 'notifications', label: 'Notifications', desc: 'Emails & alerts', icon: Bell },
];

export default function Settings() {
  const { settings, updateSettings, resetDemoData } = useStore();
  const [section, setSection] = useState('organization');
  const [draft, setDraft] = useState(settings[section]);
  const [saved, setSaved] = useState(false);

  useEffect(() => setDraft(settings[section]), [section, settings]);

  const set = (k, v) => setDraft((d) => ({ ...d, [k]: v }));
  const num = (k) => (e) => set(k, Number(e.target.value));
  const save = (e) => {
    e.preventDefault();
    updateSettings(section, draft);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <>
      <PageHeader title="Settings" subtitle="Organization profile, exam defaults, security and notifications" crumb="System">
        <button
          className="btn danger-ghost"
          onClick={() => confirm('Reset all demo data? Your changes will be lost.') && resetDemoData()}
        >
          <RotateCcw size={15} /> Reset Demo Data
        </button>
      </PageHeader>

      <div className="settings-layout">
      <nav className="card settings-nav" aria-label="Settings sections">
        {SECTIONS.map((s) => (
          <button key={s.key} className={section === s.key ? 'active' : ''} onClick={() => setSection(s.key)}>
            <s.icon size={18} />
            <span>{s.label}<small>{s.desc}</small></span>
          </button>
        ))}
      </nav>

      <form className="card settings-card" onSubmit={save}>
        {section === 'organization' && (
          <>
            <h2>Organization</h2>
            <div className="org-preview">
              <img src={draft.logoUrl} alt="Logo preview" onError={(e) => (e.currentTarget.style.visibility = 'hidden')} />
              <div>
                <div className="strong">{draft.name}</div>
                <a href={draft.companyUrl} target="_blank" rel="noreferrer" className="small">{draft.companyUrl}</a>
              </div>
            </div>
            <Field label="Organization name"><input className="input" required value={draft.name} onChange={(e) => set('name', e.target.value)} /></Field>
            <Field label="Company URL"><input className="input" type="url" required value={draft.companyUrl} onChange={(e) => set('companyUrl', e.target.value)} /></Field>
            <Field label="Logo URL"><input className="input" type="url" value={draft.logoUrl} onChange={(e) => set('logoUrl', e.target.value)} /></Field>
            <Field label="Support email"><input className="input" type="email" required value={draft.supportEmail} onChange={(e) => set('supportEmail', e.target.value)} /></Field>
            <Field label="Time zone">
              <select className="input" value={draft.timezone} onChange={(e) => set('timezone', e.target.value)}>
                {['Asia/Kolkata', 'UTC', 'America/New_York', 'Europe/London', 'Asia/Singapore'].map((t) => <option key={t}>{t}</option>)}
              </select>
            </Field>
          </>
        )}

        {section === 'exam' && (
          <>
            <h2>Exam Details</h2>
            <div className="two-col">
              <Field label="Default duration (minutes)"><input className="input" type="number" min="5" value={draft.defaultDuration} onChange={num('defaultDuration')} /></Field>
              <Field label="Default pass mark (%)"><input className="input" type="number" min="1" max="100" value={draft.passMark} onChange={num('passMark')} /></Field>
              <Field label="Maximum attempts"><input className="input" type="number" min="1" value={draft.maxAttempts} onChange={num('maxAttempts')} /></Field>
            </div>
            <Toggle label="Shuffle questions" description="Randomize question order per candidate" checked={draft.shuffleQuestions} onChange={(v) => set('shuffleQuestions', v)} />
            <Toggle label="Shuffle options" description="Randomize answer option order" checked={draft.shuffleOptions} onChange={(v) => set('shuffleOptions', v)} />
            <Toggle label="Show results to candidate" description="Candidates see their score right after submission" checked={draft.showResultsToCandidate} onChange={(v) => set('showResultsToCandidate', v)} />
            <Toggle label="Negative marking" description="Deduct marks for wrong answers" checked={draft.negativeMarking} onChange={(v) => set('negativeMarking', v)} />
          </>
        )}

        {section === 'security' && (
          <>
            <h2>Security & Proctoring</h2>
            <Toggle label="Webcam required" checked={draft.webcamRequired} onChange={(v) => set('webcamRequired', v)} />
            <Toggle label="Microphone required" checked={draft.microphoneRequired} onChange={(v) => set('microphoneRequired', v)} />
            <Toggle label="Screen recording" checked={draft.screenRecording} onChange={(v) => set('screenRecording', v)} />
            <Toggle label="Browser lockdown" description="Block tab switching, copy/paste and right-click" checked={draft.browserLockdown} onChange={(v) => set('browserLockdown', v)} />
            <Toggle label="ID verification" description="Verify government ID before the exam starts" checked={draft.idVerification} onChange={(v) => set('idVerification', v)} />
            <Toggle label="Auto-submit when flagged" description="Submit the exam automatically once the warning limit is reached" checked={draft.autoSubmitOnFlag} onChange={(v) => set('autoSubmitOnFlag', v)} />
            <Field label="Warnings before cheating flag">
              <input className="input" type="number" min="1" max="20" value={draft.maxWarningsBeforeFlag} onChange={num('maxWarningsBeforeFlag')} />
            </Field>
          </>
        )}

        {section === 'notifications' && (
          <>
            <h2>Notifications</h2>
            <Toggle label="Email candidates when an exam is scheduled" checked={draft.emailOnExamScheduled} onChange={(v) => set('emailOnExamScheduled', v)} />
            <Toggle label="Email candidates when results are published" checked={draft.emailOnResultPublished} onChange={(v) => set('emailOnResultPublished', v)} />
            <Toggle label="Alert admins on cheating flag" checked={draft.alertOnCheatingFlag} onChange={(v) => set('alertOnCheatingFlag', v)} />
            <Toggle label="Daily summary email" checked={draft.dailySummary} onChange={(v) => set('dailySummary', v)} />
            <Field label="Exam reminder (hours before)">
              <input className="input" type="number" min="0" value={draft.reminderHoursBefore} onChange={num('reminderHoursBefore')} />
            </Field>
          </>
        )}

        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={() => setDraft(settings[section])}>Discard</button>
          <button className="btn primary"><Save size={15} /> Save Changes</button>
        </div>
      </form>
      </div>
      {saved && <Toast><CheckCircle2 size={16} color="#22c55e" /> Settings saved</Toast>}
    </>
  );
}
