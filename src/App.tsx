import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  Activity, BarChart3, Bell, CalendarDays, Check, CheckCircle2,  Clock3, Code2, Download, Flame, Focus, Heart, History,
  Infinity as InfinityIcon, Leaf, Menu, Moon, Pause, Play,
  RotateCcw, Settings2, ShieldCheck, SlidersHorizontal, Sparkles, Target,
  Trash2, Upload, Volume2, VolumeX, Waves, X,
} from 'lucide-react';
import {
  calculateStreak, DEFAULT_PREFERENCES, isSession, lastSevenDays,
  loadValue, localDate, saveValue, type Preferences, type Session,
} from './storage';

type Mode = 'focus' | 'deep' | 'break';
type Panel = 'focus' | 'insights' | 'history' | 'settings';
type ClockState = {
  mode: Mode;
  minutes: number;
  remainingSeconds: number;
  endAt: number | null;
  taskAtStart: string;
};

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

const presets: { id: Mode; title: string; subtitle: string; icon: typeof Focus }[] = [
  { id: 'focus', title: 'Focus', subtitle: '25 min', icon: Focus },
  { id: 'deep', title: 'Deep Work', subtitle: '50 min', icon: Waves },
  { id: 'break', title: 'Short Break', subtitle: '5 min', icon: Leaf },
];

const durationFor = (mode: Mode) => mode === 'focus' ? 25 : mode === 'deep' ? 50 : 5;
const initialClock: ClockState = { mode: 'focus', minutes: 25, remainingSeconds: 1500, endAt: null, taskAtStart: '' };
const formatClock = (seconds: number) => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
const formatMinutes = (total: number) => `${Math.floor(total / 60)}h ${Math.round(total % 60)}m`;

function Logo({ large = false }: { large?: boolean }) {
  return <span className={`logo-mark${large ? ' logo-mark-large' : ''}`} aria-hidden="true">
    <svg viewBox="0 0 56 34" fill="none" role="img"><path d="M4 27C12 5 18 5 27 26C34 10 42 9 52 27" stroke="currentColor" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" /></svg>
  </span>;
}

function useLocalState<T>(key: string, fallback: T) {
  const [value, setValue] = useState<T>(() => loadValue(key, fallback));
  useEffect(() => saveValue(key, value), [key, value]);
  return [value, setValue] as const;
}

function playChime() {
  try {
    const AudioContextClass = window.AudioContext;
    const ctx = new AudioContextClass();
    const notes = [523.25, 659.25, 783.99];
    notes.forEach((frequency, i) => {
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = frequency;
      const start = ctx.currentTime + i * 0.13;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.12, start + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.28);
      oscillator.connect(gain).connect(ctx.destination);
      oscillator.start(start);
      oscillator.stop(start + 0.3);
    });
    window.setTimeout(() => void ctx.close(), 1200);
  } catch {
    // Audio is optional; some browsers block sound outside a user gesture.
  }
}

export default function App() {
  const [panel, setPanel] = useState<Panel>('focus');
  const [task, setTask] = useLocalState('task', 'Build something meaningful');
  const [sessions, setSessions] = useLocalState<Session[]>('sessions', []);
  const [preferences, setPreferences] = useLocalState<Preferences>('preferences', DEFAULT_PREFERENCES);
  const [clock, setClock] = useLocalState<ClockState>('clock', initialClock);
  const [now, setNow] = useState(() => Date.now());
  const [promptEvent, setPromptEvent] = useState<InstallPromptEvent | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [apiInsights, setApiInsights] = useState<string | null>(null);
  const [loadingInsights, setLoadingInsights] = useState(false);
  const inputFileRef = useRef<HTMLInputElement>(null);
  const finishedEndAt = useRef<number | null>(null);
  const completionRef = useRef<() => void>(() => {});

  const running = clock.endAt !== null;
  const remaining = running ? Math.max(0, Math.ceil((clock.endAt! - now) / 1000)) : clock.remainingSeconds;
  const progress = 100 * (1 - remaining / Math.max(1, clock.minutes * 60));
  const today = localDate(new Date());
  const todaySessions = useMemo(() => sessions.filter((s) => localDate(s.completedAt) === today), [sessions, today]);
  const totalToday = todaySessions.reduce((sum, s) => sum + s.minutes, 0);
  const totalAll = sessions.reduce((sum, s) => sum + s.minutes, 0);
  const streak = calculateStreak(sessions);
  const lastWeek = lastSevenDays(sessions);
  const weeklyTotal = lastWeek.reduce((sum, day) => sum + day.minutes, 0);
  const maxDay = Math.max(25, ...lastWeek.map((day) => day.minutes));
  const goal = Math.max(1, Number(preferences.dailyGoal) || 4);

  useEffect(() => {
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setPromptEvent(event as InstallPromptEvent);
    };
    const onInstalled = () => setPromptEvent(null);
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  useEffect(() => {
    if (!feedback) return;
    const timeout = window.setTimeout(() => setFeedback(''), 3800);
    return () => window.clearTimeout(timeout);
  }, [feedback]);

  const completeSession = useCallback(() => {
    const endAt = clock.endAt;
    if (endAt === null || finishedEndAt.current === endAt) return;
    if (Date.now() < endAt) return;
    finishedEndAt.current = endAt;
    if (clock.mode !== 'break') {
      const session: Session = {
        id: String(endAt),
        completedAt: new Date(endAt).toISOString(),
        minutes: clock.minutes,
        task: clock.taskAtStart.trim() || 'Untitled focus session',
      };
      setSessions((current) => current.some((item) => item.id === session.id) ? current : [session, ...current]);
    }
    setClock((current) => current.endAt === endAt ? {
      ...current, endAt: null, remainingSeconds: current.minutes * 60,
    } : current);
    setFeedback(clock.mode === 'break' ? 'Break finished. Ready to focus?' : 'Session complete. Great work!');
    if (preferences.sound) playChime();
    if (preferences.notifications && 'Notification' in window && Notification.permission === 'granted') {
      try { new Notification('Monoflow', { body: 'Your session is complete. One thing. One flow.', icon: './pwa-192x192.png' }); } catch { /* no-op */ }
    }
  }, [clock, setClock, setSessions, preferences.sound, preferences.notifications]);

  completionRef.current = completeSession;
  useEffect(() => {
    if (clock.endAt === null) return;
    const tick = () => {
      setNow(Date.now());
      if (Date.now() >= clock.endAt!) completionRef.current();
    };
    tick();
    const interval = window.setInterval(tick, 250);
    return () => window.clearInterval(interval);
  }, [clock.endAt]);

  useEffect(() => {
    document.title = running ? `${formatClock(remaining)} · Monoflow` : 'Monoflow · One thing. One flow.';
  }, [remaining, running]);

  function selectMode(mode: Mode) {
    if (running) { setFeedback('Pause or reset your current timer first.'); return; }
    const minutes = durationFor(mode);
    setClock({ mode, minutes, remainingSeconds: minutes * 60, endAt: null, taskAtStart: '' });
  }

  function startPause() {
    if (running) {
      setClock((previous) => ({ ...previous, remainingSeconds: Math.max(1, Math.ceil((previous.endAt! - Date.now()) / 1000)), endAt: null }));
    } else {
      const seconds = clock.remainingSeconds > 0 ? clock.remainingSeconds : clock.minutes * 60;
      setClock((previous) => ({ ...previous, remainingSeconds: seconds, endAt: Date.now() + seconds * 1000, taskAtStart: previous.taskAtStart || task }));
    }
    setNow(Date.now());
  }

  function resetTimer() {
    setClock((previous) => ({ ...previous, remainingSeconds: previous.minutes * 60, endAt: null, taskAtStart: '' }));
    setNow(Date.now());
  }

  function navigate(next: Panel) {
    setPanel(next);
    setMobileMenuOpen(false);
    setApiInsights(null);
  }

  async function enableNotifications() {
    if (!('Notification' in window)) { setFeedback('Notifications are not available in this browser.'); return; }
    const permission = await Notification.requestPermission();
    setPreferences((prev) => ({ ...prev, notifications: permission === 'granted' }));
    if (permission !== 'granted') setFeedback('Browser notifications were not enabled.');
  }

  async function installApp() {
    if (!promptEvent) { setFeedback('On iPhone: Share → Add to Home Screen. In Chrome: use Install in the address bar.'); return; }
    await promptEvent.prompt();
    await promptEvent.userChoice;
    setPromptEvent(null);
  }

  function exportData() {
    const blob = new Blob([JSON.stringify({ app: 'monoflow', version: 1, exportedAt: new Date().toISOString(), sessions, preferences }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `monoflow-backup-${localDate(new Date())}.json`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 5000);
    setFeedback('Your focus history was exported.');
  }

  async function importData(file: File | undefined) {
    if (!file) return;
    try {
      if (file.size > 2_000_000) throw new Error('That backup is too large.');
      const parsed: unknown = JSON.parse(await file.text());
      if (!parsed || typeof parsed !== 'object' || !('sessions' in parsed) || !Array.isArray(parsed.sessions) || !parsed.sessions.every(isSession)) {
        throw new Error('This does not look like a Monoflow backup.');
      }
      const items = parsed.sessions as Session[];
      const merged = new Map(sessions.map((s) => [s.id, s]));
      items.forEach((s) => merged.set(s.id, s));
      setSessions([...merged.values()].sort((a, b) => b.completedAt.localeCompare(a.completedAt)));
      setFeedback(`Imported ${items.length} sessions. Existing sessions were preserved.`);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Import failed.');
    } finally {
      if (inputFileRef.current) inputFileRef.current.value = '';
    }
  }

  function clearHistory() {
    if (!window.confirm('Delete all saved focus sessions on this device? This cannot be undone.')) return;
    setSessions([]);
    setFeedback('Focus history cleared.');
  }

  async function askPythonForInsights() {
    const url = import.meta.env.VITE_API_URL as string | undefined;
    if (!url) { setFeedback('Optional Python service is not configured. See README.'); return; }
    setLoadingInsights(true);
    setApiInsights(null);
    try {
      const response = await fetch(`${url.replace(/\/$/, '')}/insights`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessions: sessions.map(({ completedAt, minutes }) => ({ completed_at: completedAt, minutes })) }),
      });
      if (!response.ok) throw new Error(`API status ${response.status}`);
      const data = await response.json() as { total_sessions: number; total_minutes: number; most_productive_day: string | null };
      setApiInsights(`Python insights: ${data.total_sessions} sessions · ${formatMinutes(data.total_minutes)} tracked · most active day: ${data.most_productive_day ?? 'none'}`);
    } catch {
      setApiInsights('Python API is unavailable. Local tracking still works offline.');
    } finally {
      setLoadingInsights(false);
    }
  }

  const navigation: { key: Panel; icon: typeof Focus; title: string }[] = [
    { key: 'focus', icon: Focus, title: 'Focus' },
    { key: 'insights', icon: BarChart3, title: 'Insights' },
    { key: 'history', icon: History, title: 'History' },
    { key: 'settings', icon: Settings2, title: 'Settings' },
  ];

  return <div className={`site ${preferences.reducedMotion ? 'reduced-motion' : ''}`}>
    <div className="ambient ambient-left" /><div className="ambient ambient-right" />
    <header className="site-header">
      <div className="brand-hero"><Logo large /><span>Monoflow</span></div>
      <p>One thing. One flow.</p>
      <div className="hero-rule" />
      <div className="hero-tags">
        <span><Code2 size={17} /> Deep Work</span><i />
        <span><Target size={17} /> Single-Tasking</span><i />
        <span><InfinityIcon size={19} /> Flow State</span>
      </div>
    </header>

    <main className="app-shell">
      <div className="app-topbar">
        <button className="top-brand" type="button" onClick={() => navigate('focus')} aria-label="Go to focus dashboard"><Logo /><span>Monoflow</span></button>
        <div className="top-actions">
          <span className="today-tag"><span className="pulse-dot" /> Your focus space</span>
          <button type="button" className="icon-button" title="Insights" onClick={() => navigate('insights')}><BarChart3 size={19} /></button>
          <button type="button" className="icon-button" title="Settings" onClick={() => navigate('settings')}><Settings2 size={19} /></button>
          <button type="button" className="icon-button menu-toggle" title="Menu" aria-label="Toggle menu" onClick={() => setMobileMenuOpen((open) => !open)}><Menu size={20} /></button>
        </div>
      </div>

      <div className="app-body">
        <aside className={`sidebar ${mobileMenuOpen ? 'sidebar-open' : ''}`}>
          <span className="sidebar-heading">WORKSPACE</span>
          <nav aria-label="Main navigation">
            {navigation.map((item) => <button key={item.key} type="button" className={`nav-link ${panel === item.key ? 'nav-active' : ''}`} onClick={() => navigate(item.key)}><item.icon size={18}/><span>{item.title}</span>{panel === item.key && <span className="nav-marker"/>}</button>)}
          </nav>
          <div className="sidebar-bottom">
            <span className="decor-orbit"><span/><span/><span/></span>
            <span>Progress is a practice.</span>
          </div>
        </aside>

        <div className="content-area">
          {panel === 'focus' && <>
            <div className="section-intro"><div><span className="eyebrow"><Sparkles size={13} /> YOUR FOCUS SPACE</span><h1>Find your flow<span className="period">.</span></h1><p>Clear your mind. Focus on what matters.</p></div><div className="day-label"><CalendarDays size={16} /> {new Date().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</div></div>
            <div className="focus-grid">
              <div className="timer-area">
                <div className="timer-ring" style={{ '--progress': `${progress}%` } as CSSProperties}>
                  <div className="timer-inner"><span className="timer-lotus"><Leaf size={27} strokeWidth={1.5} /></span><span className="timer-label">{clock.mode === 'break' ? 'Time to recharge' : 'Focus Time'}</span><strong className="timer-value" role="timer" aria-live="off">{formatClock(remaining)}</strong><span className="timer-mode">{clock.mode === 'deep' ? 'Deep Work' : clock.mode === 'break' ? 'Short Break' : 'Focus Session'}</span></div>
                </div>
                <div className="timer-controls"><button type="button" className="control-icon" title="Reset timer" aria-label="Reset timer" onClick={resetTimer}><RotateCcw size={20}/></button><button type="button" className="control-primary" onClick={startPause}>{running ? <Pause size={19} fill="currentColor" /> : <Play size={19} fill="currentColor" />} {running ? 'Pause' : 'Start focus'}</button><button type="button" className="control-icon" title="Timer settings" aria-label="Timer settings" onClick={() => navigate('settings')}><SlidersHorizontal size={19}/></button></div>
                <div className="mode-tabs" aria-label="Focus modes">{presets.map((preset) => <button key={preset.id} type="button" className={`mode-button ${clock.mode === preset.id ? 'mode-selected' : ''}`} onClick={() => selectMode(preset.id)}><preset.icon size={16}/><span>{preset.title}</span><small>{preset.subtitle}</small></button>)}</div>
              </div>
              <div className="task-area"><div className="task-card"><div className="task-card-head"><div className="task-icon"><CheckCircle2 size={19}/></div><span>My Focus Task</span><span className="task-small-badge">ONE AT A TIME</span></div><label htmlFor="focus-task" className="field-label">What are you working on?</label><input id="focus-task" type="text" maxLength={120} placeholder="e.g. Build my next project" value={task} onChange={(e) => setTask(e.target.value)} aria-label="Focus task" /><p className="task-hint">A clear intention makes every session count.</p><div className="task-divider"/><div className="focus-tip"><Target size={17}/><span>One task at a time</span></div><div className="focus-tip"><Activity size={17}/><span>Stay in flow</span></div><div className="focus-tip"><Heart size={17}/><span>Make meaningful progress</span></div></div><div className="quote-card"><span className="quote-symbol">“</span><p>Great things are done by a series of small things brought together.</p><span>— Vincent van Gogh</span><div className="quote-glow" /></div></div>
            </div>
            <div className="stats-row"><div className="stat-card"><div className="stat-icon"><CalendarDays size={21}/></div><div><span>Sessions today</span><strong>{todaySessions.length} <small>/{goal} goal</small></strong></div><div className="stat-spark spark-1"><b/><b/><b/><b/></div></div><div className="stat-card"><div className="stat-icon"><Flame size={22}/></div><div><span>Current streak</span><strong>{streak} <small>{streak === 1 ? 'day' : 'days'}</small></strong></div><div className="stat-spark spark-2"><b/><b/><b/><b/></div></div><div className="stat-card"><div className="stat-icon"><Clock3 size={21}/></div><div><span>Focus time today</span><strong>{formatMinutes(totalToday)}</strong></div><div className="stat-spark spark-3"><b/><b/><b/><b/></div></div></div>
          </>}

          {panel === 'insights' && <section className="panel-page"><span className="eyebrow"><BarChart3 size={14}/> YOUR PROGRESS</span><h1>Focus insights<span className="period">.</span></h1><p className="panel-lead">Small, consistent steps add up. Your stats live on this device.</p><div className="insight-summary"><div><span>Total focus time</span><strong>{formatMinutes(totalAll)}</strong></div><div><span>Completed sessions</span><strong>{sessions.length}</strong></div><div><span>Current streak</span><strong>{streak} days</strong></div></div><div className="insight-card"><div className="card-title-row"><div><h2>Last 7 days</h2><p>{formatMinutes(weeklyTotal)} focused this week</p></div><BarChart3 size={20}/></div><div className="weekly-chart">{lastWeek.map((entry) => <div key={entry.date} className="chart-col"><span>{entry.minutes ? formatMinutes(entry.minutes) : '0m'}</span><div className="chart-track"><div style={{ height: `${100 * entry.minutes / maxDay}%` }} /></div><small>{entry.day}</small></div>)}</div></div><div className="help-line"><ShieldCheck size={17}/> Focus data remains in your browser unless you export it.</div>{import.meta.env.VITE_API_URL && <div className="python-box"><button type="button" className="button-outline" onClick={() => void askPythonForInsights()} disabled={loadingInsights}><Code2 size={16}/> {loadingInsights ? 'Analyzing…' : 'Analyze with Python API'}</button>{apiInsights && <p>{apiInsights}</p>}</div>}</section>}

          {panel === 'history' && <section className="panel-page"><span className="eyebrow"><History size={14}/> YOUR JOURNEY</span><h1>Session history<span className="period">.</span></h1><p className="panel-lead">Every completed session is a small win worth remembering.</p>{sessions.length === 0 ? <div className="empty-state"><Moon size={30}/><h2>A fresh start</h2><p>Complete your first focus session and it will appear here.</p><button className="button-outline" type="button" onClick={() => navigate('focus')}>Start focusing <Play size={16}/></button></div> : <div className="history-list">{[...sessions].sort((a,b)=>b.completedAt.localeCompare(a.completedAt)).map((session) => <div key={session.id} className="history-item"><div className="history-check"><Check size={17}/></div><div className="history-main"><strong>{session.task}</strong><span>{new Date(session.completedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</span></div><span className="history-duration">{session.minutes} min</span></div>)}</div>}</section>}

          {panel === 'settings' && <section className="panel-page"><span className="eyebrow"><Settings2 size={14}/> MAKE IT YOURS</span><h1>Preferences<span className="period">.</span></h1><p className="panel-lead">Keep your focus experience comfortable and personal.</p><div className="settings-card"><h2>Focus preferences</h2><label className="setting-row"><span><Volume2 size={20}/><span><strong>Completion sound</strong><small>Play a gentle chime after each session</small></span></span><input type="checkbox" checked={preferences.sound} onChange={(e) => setPreferences((prev) => ({ ...prev, sound: e.target.checked }))}/></label><label className="setting-row"><span><Bell size={20}/><span><strong>Browser notifications</strong><small>Notify when a timer finishes</small></span></span><input type="checkbox" checked={preferences.notifications} onChange={(e) => { if (e.target.checked) void enableNotifications(); else setPreferences((prev) => ({ ...prev, notifications: false })); }}/></label><label className="setting-row"><span><Waves size={20}/><span><strong>Reduce motion</strong><small>Turn off background animations</small></span></span><input type="checkbox" checked={preferences.reducedMotion} onChange={(e) => setPreferences((prev) => ({ ...prev, reducedMotion: e.target.checked }))}/></label><label className="setting-row"><span><Target size={20}/><span><strong>Daily goal</strong><small>Completed focus sessions each day</small></span></span><select value={goal} onChange={(e) => setPreferences((prev) => ({ ...prev, dailyGoal: Number(e.target.value) }))} aria-label="Daily focus session goal">{[1,2,3,4,5,6,8,10,12].map((value) => <option key={value} value={value}>{value} sessions</option>)}</select></label></div><div className="settings-card"><h2>Your data</h2><p>Monoflow saves tasks and sessions to this browser. Back up your history if you plan to switch devices.</p><div className="settings-buttons"><button className="button-outline" type="button" onClick={exportData}><Download size={16}/> Export backup</button><button className="button-outline" type="button" onClick={() => inputFileRef.current?.click()}><Upload size={16}/> Import backup</button><button className="button-outline danger" type="button" onClick={clearHistory}><Trash2 size={16}/> Clear history</button></div><input ref={inputFileRef} hidden type="file" accept="application/json,.json" onChange={(e) => void importData(e.target.files?.[0])}/></div><div className="settings-card"><h2>Install Monoflow</h2><p>Use Monoflow as a standalone app, even offline. On iOS, select Share → Add to Home Screen.</p><button className="button-outline" type="button" onClick={() => void installApp()}><Download size={16}/> {promptEvent ? 'Install app' : 'Installation instructions'}</button></div><p className="about-note"><VolumeX size={15}/> No accounts. No tracking pixels. No required backend.</p></section>}
        </div>
      </div>
    </main>
    <footer className="site-footer"><span><Logo/> Monoflow</span><span>Stay present. Keep building.</span><a href="https://github.com/MattBoneo-30/MonoFlow" target="_blank" rel="noopener noreferrer"><Code2 size={16}/> Open source</a></footer>
    {feedback && <div className="toast" role="status"><CheckCircle2 size={17}/>{feedback}<button type="button" aria-label="Dismiss notification" onClick={()=>setFeedback('')}><X size={15}/></button></div>}
  </div>;
}
