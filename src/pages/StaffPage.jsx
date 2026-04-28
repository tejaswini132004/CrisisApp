import React, { useState, useEffect, useRef } from 'react';
import { db, ref, onValue, update, set } from '../firebase';
import { getAIStaffCommand } from '../utils/gemini';

const beepSound = () => {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator(), gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = 'square'; osc.frequency.setValueAtTime(880, ctx.currentTime);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.5);
    osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 1.5);
  } catch (e) {}
};

const THEME = {
  FIRE:     { bg:'bg-red-50',    border:'border-red-400',    text:'text-red-700',    badge:'text-red-600 bg-red-100 border-red-300',   icon:'🔥' },
  MEDICAL:  { bg:'bg-blue-50',   border:'border-blue-400',   text:'text-blue-700',   badge:'text-blue-600 bg-blue-100 border-blue-300', icon:'🚑' },
  INTRUDER: { bg:'bg-amber-50',  border:'border-amber-400',  text:'text-amber-700',  badge:'text-amber-600 bg-amber-100 border-amber-300', icon:'🛡️' },
  OTHER:    { bg:'bg-gray-50',   border:'border-gray-400',   text:'text-gray-700',   badge:'text-gray-600 bg-gray-100 border-gray-300',  icon:'⚠️' },
};

export default function StaffPage({ staffName }) {
  const [alerts, setAlerts] = useState([]);
  const [timeline, setTimeline] = useState([]);
  const [zones, setZones] = useState([]);
  const [notif, setNotif] = useState(false);
  const [aiCommands, setAiCommands] = useState({});
  const [staffPos, setStaffPos] = useState({ x: 250, y: 180 });
  const [broadcastMsg, setBroadcastMsg] = useState('');
  const [broadcastSent, setBroadcastSent] = useState(false);
  const [broadcasts, setBroadcasts] = useState([]);
  const seenIds = useRef(new Set());

  const displayName = staffName || localStorage.getItem('gg_staff_name') || 'Staff';

  useEffect(() => {
    if ('Notification' in window) Notification.requestPermission().then(p => setNotif(p === 'granted'));

    onValue(ref(db, 'infrastructure/'), (snap) => {
      const d = snap.val();
      if (d) setZones(d.zones || []);
    });

    onValue(ref(db, 'live_alerts/'), (snap) => {
      const data = snap.val();
      if (!data) { setAlerts([]); return; }
      const arr = Object.entries(data).map(([id, v]) => ({ id, ...v })).sort((a, b) => b.id - a.id);
      arr.forEach(a => {
        if (!seenIds.current.has(a.id) && a.status === 'CRITICAL') {
          seenIds.current.add(a.id);
          beepSound();
          if (Notification.permission === 'granted') {
            new Notification(`🚨 ${a.type} Emergency`, { body: `${a.hotelName || 'Hotel'} · Room: ${a.roomLabel || 'Unknown'} · ${a.timestamp}` });
          }
          setTimeline(p => [{ time: a.timestamp, msg: `🚨 SOS ${a.type} — ${a.roomLabel || '?'}`, color: 'text-red-600' }, ...p]);
        }
      });
      setAlerts(arr);
    });

    // Listen to broadcasts so staff sees them too
    onValue(ref(db, 'broadcasts/'), (snap) => {
      const data = snap.val();
      if (!data) { setBroadcasts([]); return; }
      const arr = Object.entries(data).map(([id, v]) => ({ id, ...v })).sort((a, b) => b.id - a.id).slice(0, 5);
      setBroadcasts(arr);
    });

    // GPS position
    let geoWatch = null;
    if (navigator.geolocation) {
      geoWatch = navigator.geolocation.watchPosition(
        () => {
          // On real device, update dot. For demo use simulated movement.
        },
        null, { enableHighAccuracy: true }
      );
    }
    // Simulated position drift
    const posInt = setInterval(() => {
      setStaffPos(prev => ({
        x: Math.max(40, Math.min(860, prev.x + (Math.random() - 0.5) * 18)),
        y: Math.max(40, Math.min(460, prev.y + (Math.random() - 0.5) * 12)),
      }));
    }, 3500);

    return () => {
      clearInterval(posInt);
      if (geoWatch) navigator.geolocation.clearWatch(geoWatch);
    };
  }, []);

  const acknowledge = async (alert) => {
    await update(ref(db, `live_alerts/${alert.id}`), { status: 'ACKNOWLEDGED', staffName: displayName });
    setTimeline(p => [{ time: new Date().toLocaleTimeString(), msg: `✋ ${displayName} acknowledged ${alert.type}`, color: 'text-amber-600' }, ...p]);
    getStaffAI(alert);
  };

  const resolve = (alert) => {
    update(ref(db, `live_alerts/${alert.id}`), { status: 'RESOLVED', resolvedBy: displayName });
    setTimeline(p => [{ time: new Date().toLocaleTimeString(), msg: `✓ ${displayName} resolved ${alert.type}`, color: 'text-emerald-600' }, ...p]);
  };

  const getStaffAI = async (alert) => {
    setAiCommands(p => ({ ...p, [alert.id]: { ...(p[alert.id] || {}), loading: true } }));
    const result = await getAIStaffCommand(alert, zones, displayName, staffPos);
    setAiCommands(p => ({ ...p, [alert.id]: { cmd: result.command, reason: result.reason, loading: false } }));
  };

  const sendBroadcast = () => {
    if (!broadcastMsg.trim()) return;
    set(ref(db, `broadcasts/${Date.now()}`), {
      message: broadcastMsg.trim(),
      timestamp: new Date().toLocaleTimeString(),
      sentBy: displayName
    });
    setBroadcastMsg('');
    setBroadcastSent(true);
    setTimeout(() => setBroadcastSent(false), 2500);
  };

  // Map render for each alert
  const renderMiniMap = (alert) => {
    if (!zones.length) return (
      <div className="bg-gray-100 rounded-xl p-3 mt-3 text-center">
        <p className="text-gray-400 text-xs font-bold">No map — Admin needs to Deploy Sync first</p>
      </div>
    );
    const MAP_W = 900, MAP_H = 500;
    const containerW = 280, containerH = 155;
    const sw = containerW / MAP_W, sh = containerH / MAP_H;
    const roomZone = zones.find(z => z.label === alert.roomLabel);
    return (
      <div className="mt-3 relative bg-gray-900 rounded-xl overflow-hidden" style={{ width: '100%', maxWidth: containerW, height: containerH }}>
        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'linear-gradient(#fff 1px,transparent 1px),linear-gradient(90deg,#fff 1px,transparent 1px)', backgroundSize: '20px 20px' }} />
        {zones.map(z => {
          const isRoom = z.id === roomZone?.id;
          const isExit = z.color === '#10b981';
          return (
            <div key={z.id} style={{
              left: z.x * sw, top: z.y * sh,
              width: Math.abs(z.w) * sw, height: Math.abs(z.h) * sh,
              borderColor: isRoom ? '#ef4444' : isExit ? '#4ade80' : z.color,
              backgroundColor: isRoom ? 'rgba(239,68,68,0.25)' : isExit ? 'rgba(74,222,128,0.15)' : `${z.color}12`,
              animation: isRoom ? 'emergencyBlink 0.8s ease-in-out infinite' : 'none',
              boxShadow: isRoom ? '0 0 10px rgba(239,68,68,0.8)' : 'none',
            }} className="absolute border-2 flex items-center justify-center overflow-hidden">
              <span style={{ fontSize: 4.5, color: isRoom ? '#ef4444' : isExit ? '#4ade80' : z.color }} className="font-black text-center px-0.5 leading-none">{isRoom ? '🚨' : isExit ? '🚪' : ''}{z.label}</span>
            </div>
          );
        })}
        {/* Staff live dot */}
        <div style={{ left: Math.max(3, staffPos.x * sw - 5), top: Math.max(3, staffPos.y * sh - 5), width: 10, height: 10 }}
          className="absolute bg-cyan-400 rounded-full z-20 shadow-lg ring-2 ring-white" title={`${displayName}`} />
        {/* Path from staff to room */}
        {roomZone && (
          <svg className="absolute inset-0 pointer-events-none" width="100%" height="100%">
            <defs>
              <marker id="arrowStaff" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
                <path d="M0,0 L6,3 L0,6 Z" fill="#f59e0b" />
              </marker>
            </defs>
            <line
              x1={staffPos.x * sw} y1={staffPos.y * sh}
              x2={(roomZone.x + roomZone.w / 2) * sw} y2={(roomZone.y + roomZone.h / 2) * sh}
              stroke="#f59e0b" strokeWidth="2" strokeDasharray="5,4"
              markerEnd="url(#arrowStaff)" opacity="0.9"
            />
          </svg>
        )}
        <style>{`@keyframes emergencyBlink { 0%,100%{opacity:1}50%{opacity:0.25} }`}</style>
      </div>
    );
  };

  const critical = alerts.filter(a => a.status === 'CRITICAL').length;

  return (
    <div className="max-w-5xl mx-auto p-3 sm:p-6 font-sans pb-10 bg-white min-h-screen">
      <style>{`@keyframes emergencyBlink { 0%,100%{opacity:1}50%{opacity:0.25} }`}</style>

      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-5 bg-gray-50 border-2 border-gray-200 p-4 sm:p-5 rounded-2xl">
        <div>
          <h1 className="text-2xl font-black italic uppercase tracking-tighter text-gray-900">Staff Command</h1>
          <p className="text-xs text-blue-600 font-black tracking-widest mt-1 uppercase">👮 {displayName} · Live Dashboard</p>
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          {critical > 0 && (
            <div className="flex items-center gap-2 bg-red-100 border-2 border-red-400 px-3 py-2 rounded-xl animate-pulse">
              <div className="w-2.5 h-2.5 bg-red-500 rounded-full"></div>
              <span className="text-red-700 text-xs font-black uppercase tracking-widest">{critical} Critical</span>
            </div>
          )}
          <div className={`px-3 py-2 rounded-xl text-xs font-black uppercase tracking-widest border-2 ${notif ? 'bg-emerald-50 border-emerald-300 text-emerald-700' : 'bg-red-50 border-red-300 text-red-700'}`}>
            {notif ? '🔔 Notifs' : '🔕 Off'}
          </div>
        </div>
      </div>

      {/* Received broadcasts */}
      {broadcasts.length > 0 && (
        <div className="mb-5 space-y-2">
          <p className="text-xs font-black uppercase tracking-widest text-amber-600 mb-2">📢 Recent Broadcasts</p>
          {broadcasts.map(b => (
            <div key={b.id} className="bg-amber-50 border-2 border-amber-300 rounded-2xl px-4 py-3 flex items-start gap-3">
              <span className="text-lg shrink-0">📢</span>
              <div>
                <p className="text-gray-800 text-sm font-semibold">{b.message}</p>
                <p className="text-gray-400 text-[10px] mt-0.5">From: {b.sentBy || 'Admin'} · {b.timestamp}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Broadcast sender */}
      <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-4 mb-5">
        <p className="text-xs font-black uppercase tracking-widest text-amber-700 mb-3">📢 Send Broadcast to All Guests</p>
        <div className="flex gap-2">
          <input value={broadcastMsg} onChange={e => setBroadcastMsg(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && sendBroadcast()}
            placeholder="e.g. Fire drill on floor 3, please stay calm..."
            className="flex-1 bg-white border-2 border-amber-200 rounded-xl px-3 py-2.5 text-sm font-medium outline-none text-gray-900 placeholder:text-gray-400 min-w-0 focus:border-amber-500"
          />
          <button onClick={sendBroadcast}
            className={`px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all shrink-0 border-2 ${
              broadcastSent ? 'bg-emerald-500 border-emerald-500 text-white' : 'bg-amber-500 border-amber-500 text-white hover:bg-amber-600'
            }`}>
            {broadcastSent ? '✓ Sent!' : 'Send'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Alerts */}
        <div className="lg:col-span-2 space-y-4">
          <h3 className="text-sm font-black uppercase tracking-widest text-red-600 flex items-center gap-2">
            <span className="w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse inline-block"></span> Live SOS Alerts
          </h3>
          {alerts.length === 0 && (
            <div className="bg-gray-50 border-2 border-gray-200 rounded-2xl p-12 text-center">
              <p className="text-emerald-500 text-3xl mb-2">✓</p>
              <p className="text-gray-400 text-sm font-bold uppercase tracking-widest">All Clear</p>
            </div>
          )}
          {alerts.map(a => {
            const t = THEME[a.type] || THEME.OTHER;
            const ai = aiCommands[a.id];
            return (
              <div key={a.id} className={`${t.bg} border-2 ${t.border} rounded-2xl p-4 sm:p-5`}>
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex items-start gap-3">
                    <span className="text-3xl shrink-0">{t.icon}</span>
                    <div>
                      <p className={`font-black text-base uppercase tracking-widest ${t.text}`}>{a.type} Emergency</p>
                      <p className="text-gray-500 text-xs font-bold uppercase tracking-widest mt-1">
                        🏨 <span className="text-gray-700">{a.hotelName || 'Hotel'}</span> · 📍 <span className="text-gray-700">{a.roomLabel || 'Unknown'}</span> · {a.timestamp}
                      </p>
                      {a.hotelCode && <p className="text-gray-400 text-[10px] mt-0.5">Code: {a.hotelCode}</p>}
                      {a.staffName && a.status === 'ACKNOWLEDGED' && (
                        <p className="text-amber-600 text-xs font-bold mt-1">✋ Acknowledged by {a.staffName}</p>
                      )}
                    </div>
                  </div>
                  <span className={`text-xs font-black uppercase tracking-widest px-3 py-1 rounded-full border-2 shrink-0 ${
                    a.status === 'CRITICAL' ? 'bg-red-100 border-red-400 text-red-600 animate-pulse' :
                    a.status === 'ACKNOWLEDGED' ? 'bg-amber-100 border-amber-400 text-amber-600' :
                    'bg-emerald-100 border-emerald-400 text-emerald-600'
                  }`}>{a.status}</span>
                </div>

                {/* Mini Map */}
                {renderMiniMap(a)}
                <p className="text-[10px] text-gray-400 mt-1.5 font-medium">🔵 You (live) · 🟡 Your path · 🚨 Blinking = emergency room</p>

                {/* AI Command box */}
                {ai && !ai.loading && (
                  <div className="mt-3 bg-white border-2 border-blue-300 rounded-xl p-4">
                    <p className="text-xs font-black uppercase tracking-widest text-blue-700 mb-2">🤖 AI Command for {displayName}</p>
                    <p className="text-gray-900 text-sm font-black leading-snug">{ai.cmd}</p>
                    <div className="mt-2 pt-2 border-t border-gray-100">
                      <p className="text-gray-400 text-xs italic"><span className="font-black text-gray-500">Why:</span> {ai.reason}</p>
                    </div>
                  </div>
                )}
                {ai?.loading && (
                  <div className="mt-3 bg-white border border-gray-200 rounded-xl p-3 flex items-center gap-3">
                    <div className="flex gap-1">{[0,150,300].map(d => <span key={d} className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: `${d}ms` }}></span>)}</div>
                    <span className="text-xs text-blue-600 font-black uppercase tracking-widest">AI analyzing situation...</span>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex gap-2 mt-4 flex-wrap">
                  {a.status === 'CRITICAL' && (
                    <>
                      <button onClick={() => acknowledge(a)} className="flex-1 py-3 bg-amber-500 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-amber-600 transition-all min-w-[110px] shadow-sm">
                        ✋ Acknowledge
                      </button>
                      <button onClick={() => resolve(a)} className="flex-1 py-3 bg-emerald-500 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-emerald-600 transition-all min-w-[110px] shadow-sm">
                        ✓ Resolve
                      </button>
                    </>
                  )}
                  {a.status === 'ACKNOWLEDGED' && (
                    <button onClick={() => resolve(a)} className="flex-1 py-3 bg-emerald-500 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-emerald-600 transition-all shadow-sm">
                      ✓ Mark Resolved
                    </button>
                  )}
                  <button onClick={() => getStaffAI(a)} className="py-3 px-4 bg-blue-100 border-2 border-blue-300 text-blue-700 rounded-xl text-xs font-black uppercase hover:bg-blue-200 transition-all shrink-0">
                    🤖 AI Help
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Timeline + Stats */}
        <div className="space-y-4">
          <div className="bg-gray-50 border-2 border-gray-200 rounded-2xl p-5">
            <h3 className="text-xs font-black uppercase tracking-widest text-gray-700 mb-4">📋 Crisis Timeline</h3>
            {timeline.length === 0 && <p className="text-gray-400 text-xs font-bold uppercase tracking-widest text-center mt-4">Awaiting events...</p>}
            <div className="space-y-3 max-h-72 overflow-y-auto">
              {timeline.map((item, i) => (
                <div key={i} className="flex gap-2 items-start">
                  <div className="w-0.5 self-stretch bg-gray-300 rounded-full shrink-0 mt-1"></div>
                  <div>
                    <p className={`text-xs font-black uppercase tracking-wide leading-tight ${item.color}`}>{item.msg}</p>
                    <p className="text-gray-400 text-[10px] font-medium mt-0.5">{item.time}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="bg-gray-50 border-2 border-gray-200 rounded-2xl p-5">
            <h4 className="text-xs font-black uppercase tracking-widest text-gray-500 mb-4">Session Stats</h4>
            {['FIRE','MEDICAL','INTRUDER','OTHER'].map(type => {
              const c = alerts.filter(a => a.type === type).length;
              const t = THEME[type];
              return (
                <div key={type} className="flex justify-between items-center mb-3">
                  <span className={`text-xs font-black uppercase tracking-widest ${t.text}`}>{t.icon} {type}</span>
                  <span className="text-gray-900 font-black text-lg">{c}</span>
                </div>
              );
            })}
            <div className="pt-3 border-t border-gray-200">
              <div className="flex justify-between">
                <span className="text-xs text-gray-500 font-black uppercase">Total</span>
                <span className="text-gray-900 font-black text-lg">{alerts.length}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
