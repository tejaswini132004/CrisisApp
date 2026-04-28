import React, { useState, useRef, useEffect } from 'react';
import { db, ref, set, onValue, update } from '../firebase';

function generateHotelCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

export default function AdminLayout() {
  const [auth, setAuth] = useState({ email: '', name: '', password: '' });
  const [errors, setErrors] = useState({ email: false, pass: false });
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [adminId, setAdminId] = useState('');
  const [hotelCode, setHotelCode] = useState('');
  const [codeCopied, setCodeCopied] = useState(false);

  // Hotel setup wizard
  const [setupDone, setSetupDone] = useState(false);
  const [hotelName, setHotelName] = useState('');
  const [totalFloors, setTotalFloors] = useState('');
  const [currentFloor, setCurrentFloor] = useState(1);

  // Map per floor — { floorNum: zones[] }
  const [floorZones, setFloorZones] = useState({});
  const [isArchitectMode, setIsArchitectMode] = useState(false);
  const [drawing, setDrawing] = useState(null);
  const [selectedZone, setSelectedZone] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [broadcasts, setBroadcasts] = useState([]);
  const [broadcastMsg, setBroadcastMsg] = useState('');
  const [broadcastSent, setBroadcastSent] = useState(false);
  const [deploySuccess, setDeploySuccess] = useState(false);

  const canvasRef = useRef(null);

  const zones = floorZones[currentFloor] || [];
  const setZones = (updater) => {
    setFloorZones(prev => {
      const cur = prev[currentFloor] || [];
      const next = typeof updater === 'function' ? updater(cur) : updater;
      return { ...prev, [currentFloor]: next };
    });
  };

  useEffect(() => {
    onValue(ref(db, 'live_alerts/'), (snap) => {
      const data = snap.val();
      if (!data) { setAlerts([]); return; }
      setAlerts(Object.entries(data).map(([id, v]) => ({ id, ...v })).sort((a, b) => b.id - a.id));
    });
    onValue(ref(db, 'broadcasts/'), (snap) => {
      const data = snap.val();
      if (!data) { setBroadcasts([]); return; }
      setBroadcasts(Object.entries(data).map(([id, v]) => ({ id, ...v })).sort((a, b) => b.id - a.id).slice(0, 5));
    });
  }, []);

  const handleAuth = () => {
    const emailOk = auth.email.includes('@');
    const passOk = auth.password.length >= 4;
    setErrors({ email: !emailOk, pass: !passOk });
    if (!emailOk || !passOk) return;

    const aId = auth.email.toLowerCase().replace(/\./g, '_');
    setAdminId(aId);

    onValue(ref(db, `admins/${aId}`), (snap) => {
      const data = snap.val();
      if (data && data.password === auth.password) {
        // Existing admin — load THEIR data only
        setHotelCode(data.hotelCode || '');
        if (data.hotelName) { setHotelName(data.hotelName); setSetupDone(true); }
        if (data.totalFloors) setTotalFloors(String(data.totalFloors));
        if (data.floorZones) setFloorZones(data.floorZones);
        else if (data.zones) setFloorZones({ 1: data.zones }); // legacy
        setIsLoggedIn(true);
      } else if (!data) {
        // New admin — give fresh canvas
        if (!auth.name) return alert('Enter your name for first-time registration');
        const newCode = generateHotelCode();
        setHotelCode(newCode);
        set(ref(db, `admins/${aId}`), { ...auth, hotelCode: newCode });
        setFloorZones({}); // fresh canvas!
        setIsLoggedIn(true);
      } else {
        alert('Incorrect password!');
      }
    }, { onlyOnce: true });
  };

  const finishSetup = () => {
    if (!hotelName.trim() || !totalFloors || parseInt(totalFloors) < 1) {
      alert('Enter hotel name and number of floors');
      return;
    }
    const floors = parseInt(totalFloors);
    // Initialize empty floor zones
    const initial = {};
    for (let i = 1; i <= floors; i++) initial[i] = floorZones[i] || [];
    setFloorZones(initial);
    setSetupDone(true);
  };

  // Canvas drawing
  const getPos = (e, touch = false) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const src = touch ? e.touches[0] : e;
    return { x: src.clientX - rect.left, y: src.clientY - rect.top };
  };
  const startDraw = (e) => {
    if (!isArchitectMode) return;
    const p = getPos(e);
    setDrawing({ x: p.x, y: p.y, w: 0, h: 0 });
  };
  const startDrawTouch = (e) => {
    if (!isArchitectMode) return;
    e.preventDefault();
    const p = getPos(e, true);
    setDrawing({ x: p.x, y: p.y, w: 0, h: 0 });
  };
  const onDraw = (e) => {
    if (!drawing) return;
    const p = getPos(e);
    setDrawing(d => ({ ...d, w: p.x - d.x, h: p.y - d.y }));
  };
  const onDrawTouch = (e) => {
    if (!drawing) return;
    e.preventDefault();
    const p = getPos(e, true);
    setDrawing(d => ({ ...d, w: p.x - d.x, h: p.y - d.y }));
  };
  const stopDraw = () => {
    if (drawing && Math.abs(drawing.w) > 15 && Math.abs(drawing.h) > 10) {
      const newZone = { ...drawing, id: Date.now(), label: `F${currentFloor}-ROOM ${zones.length + 101}`, sqFt: Math.round(Math.abs(drawing.w * drawing.h) / 5), color: '#06b6d4', floor: currentFloor };
      setZones(prev => [...prev, newZone]);
      setSelectedZone(newZone);
    }
    setDrawing(null);
  };

  const updateZone = (id, field, value) => {
    setZones(prev => prev.map(z => {
      if (z.id !== id) return z;
      const updated = { ...z, [field]: value };
      if (selectedZone?.id === id) setTimeout(() => setSelectedZone(updated), 0);
      return updated;
    }));
  };

  const deploy = () => {
    // Flatten all floor zones for infrastructure (for guest/staff compatibility)
    const allZones = Object.values(floorZones).flat();
    const info = { name: hotelName, code: hotelCode, totalFloors: parseInt(totalFloors) || 1 };
    set(ref(db, `admins/${adminId}`), { ...auth, hotelCode, hotelName, totalFloors: parseInt(totalFloors) || 1, floorZones });
    set(ref(db, 'infrastructure/'), { hotelInfo: info, zones: allZones, floorZones });
    set(ref(db, `hotel_codes/${hotelCode}`), { hotelName, zones: allZones, floorZones, code: hotelCode });
    setDeploySuccess(true);
    setTimeout(() => setDeploySuccess(false), 3000);
  };

  const sendBroadcast = () => {
    if (!broadcastMsg.trim()) return;
    set(ref(db, `broadcasts/${Date.now()}`), { message: broadcastMsg.trim(), timestamp: new Date().toLocaleTimeString(), sentBy: auth.name || 'Admin' });
    setBroadcastMsg('');
    setBroadcastSent(true);
    setTimeout(() => setBroadcastSent(false), 2500);
  };

  const copyCode = () => { navigator.clipboard.writeText(hotelCode).catch(() => {}); setCodeCopied(true); setTimeout(() => setCodeCopied(false), 2000); };

  const counts = { FIRE: 0, MEDICAL: 0, INTRUDER: 0, OTHER: 0 };
  alerts.forEach(a => { if (counts[a.type] !== undefined) counts[a.type]++; });
  const maxCount = Math.max(...Object.values(counts), 1);

  // LOGIN SCREEN
  if (!isLoggedIn) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4 font-sans">
        <div className="bg-white border-2 border-gray-200 shadow-2xl p-8 sm:p-12 rounded-3xl w-full max-w-md">
          <div className="text-center mb-8">
            <div className="text-5xl mb-3">🔐</div>
            <h2 className="text-3xl font-black uppercase italic tracking-tighter text-gray-900">Admin Console</h2>
            <p className="text-xs text-gray-400 uppercase tracking-widest mt-2">New account gets a unique hotel code + fresh canvas</p>
          </div>
          <div className="space-y-4">
            <input placeholder="Email" value={auth.email} onChange={e => setAuth({ ...auth, email: e.target.value })}
              className={`w-full border-2 ${errors.email ? 'border-red-400' : 'border-gray-200'} rounded-2xl p-4 text-sm font-bold text-gray-900 outline-none focus:border-blue-400 bg-white`} />
            <input placeholder="Your Name (required for new account)" value={auth.name} onChange={e => setAuth({ ...auth, name: e.target.value })}
              className="w-full border-2 border-gray-200 rounded-2xl p-4 text-sm font-bold text-gray-900 outline-none focus:border-blue-400 bg-white" />
            <input type="password" placeholder="Password (min 4 characters)" value={auth.password}
              onChange={e => setAuth({ ...auth, password: e.target.value })}
              onKeyDown={e => e.key === 'Enter' && handleAuth()}
              className={`w-full border-2 ${errors.pass ? 'border-red-400' : 'border-gray-200'} rounded-2xl p-4 text-sm font-bold text-gray-900 outline-none focus:border-blue-400 bg-white`} />
            <button onClick={handleAuth} className="w-full py-4 bg-gray-900 text-white font-black uppercase rounded-2xl tracking-widest hover:bg-gray-700 transition-all active:scale-95">
              Unlock System
            </button>
          </div>
        </div>
      </div>
    );
  }

  // HOTEL SETUP WIZARD (first time or no hotel name)
  if (!setupDone) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4 font-sans">
        <div className="bg-white border-2 border-gray-200 shadow-2xl p-8 sm:p-10 rounded-3xl w-full max-w-md">
          <div className="text-center mb-8">
            <div className="text-5xl mb-3">🏨</div>
            <h2 className="text-2xl font-black uppercase italic tracking-tighter text-gray-900">Hotel Setup</h2>
            <p className="text-xs text-gray-400 uppercase tracking-widest mt-2">Configure your hotel before drawing the map</p>
          </div>
          {hotelCode && (
            <div className="bg-emerald-50 border-2 border-emerald-300 rounded-2xl p-4 mb-6 text-center">
              <p className="text-xs text-gray-500 font-bold uppercase tracking-widest mb-1">Your Unique Hotel Code</p>
              <p className="text-3xl font-black font-mono tracking-[0.4em] text-emerald-600">{hotelCode}</p>
              <button onClick={copyCode} className="text-xs text-emerald-500 font-bold mt-1 hover:text-emerald-700">{codeCopied ? '✓ Copied!' : 'Copy code'}</button>
              <p className="text-[10px] text-gray-400 mt-1">Share this with guests at check-in</p>
            </div>
          )}
          <div className="space-y-4">
            <div>
              <label className="text-xs font-black uppercase tracking-widest text-gray-500 block mb-2">Hotel Name</label>
              <input placeholder="e.g. THE GRAND MUMBAI" value={hotelName}
                onChange={e => setHotelName(e.target.value.toUpperCase())}
                className="w-full border-2 border-gray-200 rounded-xl p-4 text-base font-black text-gray-900 outline-none focus:border-blue-400 uppercase" />
            </div>
            <div>
              <label className="text-xs font-black uppercase tracking-widest text-gray-500 block mb-2">Number of Floors</label>
              <input type="number" placeholder="e.g. 5" min="1" max="50" value={totalFloors}
                onChange={e => setTotalFloors(e.target.value)}
                className="w-full border-2 border-gray-200 rounded-xl p-4 text-base font-black text-gray-900 outline-none focus:border-blue-400" />
              <p className="text-[10px] text-gray-400 mt-1">You'll get a separate map canvas for each floor</p>
            </div>
            <button onClick={finishSetup} className="w-full py-4 bg-gray-900 text-white font-black uppercase rounded-2xl tracking-widest hover:bg-gray-700 transition-all">
              Start Drawing Maps →
            </button>
          </div>
        </div>
      </div>
    );
  }

  // MAIN DASHBOARD
  const totalFloorsNum = parseInt(totalFloors) || 1;

  return (
    <div className="max-w-7xl mx-auto p-3 sm:p-6 font-sans pb-10 bg-white min-h-screen">

      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-5 bg-gray-50 border-2 border-gray-200 p-4 sm:p-5 rounded-2xl flex-wrap">
        <div>
          <h1 className="text-2xl font-black uppercase italic tracking-tighter text-gray-900">{hotelName}</h1>
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-1">
              <span className="text-xs text-gray-500 font-bold uppercase tracking-widest">Code:</span>
              <span className="font-mono font-black text-base tracking-[0.3em] text-emerald-600">{hotelCode}</span>
              <button onClick={copyCode} className="text-[10px] text-emerald-500 font-bold hover:text-emerald-700">{codeCopied ? '✓' : 'Copy'}</button>
            </div>
            <span className="text-[10px] text-gray-400 font-bold italic">Give to guests at check-in · {totalFloorsNum} floors</span>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setIsArchitectMode(!isArchitectMode)}
            className={`px-4 py-3 rounded-xl font-black uppercase text-xs tracking-widest transition-all border-2 ${
              isArchitectMode ? 'bg-blue-600 border-blue-600 text-white shadow-lg' : 'bg-white border-gray-300 text-gray-700 hover:border-gray-500'
            }`}>
            {isArchitectMode ? '✏️ Drawing ON' : '✏️ Draw Rooms'}
          </button>
          <button onClick={deploy}
            className={`px-6 py-3 rounded-xl font-black uppercase text-xs tracking-widest transition-all border-2 shadow-sm ${
              deploySuccess ? 'bg-emerald-500 border-emerald-500 text-white' : 'bg-gray-900 border-gray-900 text-white hover:bg-gray-700'
            }`}>
            {deploySuccess ? '✓ Deployed!' : '🚀 Deploy Sync'}
          </button>
        </div>
      </div>

      {/* Floor selector tabs */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {Array.from({ length: totalFloorsNum }, (_, i) => i + 1).map(f => (
          <button key={f} onClick={() => { setCurrentFloor(f); setSelectedZone(null); }}
            className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest border-2 transition-all ${
              currentFloor === f ? 'bg-gray-900 border-gray-900 text-white' : 'bg-white border-gray-200 text-gray-600 hover:border-gray-400'
            }`}>
            Floor {f} {(floorZones[f]?.length || 0) > 0 ? `(${floorZones[f].length})` : ''}
          </button>
        ))}
      </div>

      {/* Canvas + Sidebar */}
      <div className="flex flex-col lg:flex-row gap-4 mb-5 items-start">
        <div ref={canvasRef}
          onMouseDown={startDraw} onMouseMove={onDraw} onMouseUp={stopDraw} onMouseLeave={stopDraw}
          onTouchStart={startDrawTouch} onTouchMove={onDrawTouch} onTouchEnd={stopDraw}
          className={`relative flex-1 bg-gray-900 rounded-2xl border-2 overflow-hidden shadow-lg touch-none ${isArchitectMode ? 'cursor-crosshair border-blue-400' : 'cursor-default border-gray-700'}`}
          style={{ minHeight: 280, aspectRatio: '16/9' }}>

          {/* Grid */}
          <div className="absolute inset-0 opacity-10 pointer-events-none"
            style={{ backgroundImage: 'linear-gradient(#fff 1px,transparent 1px),linear-gradient(90deg,#fff 1px,transparent 1px)', backgroundSize: '40px 40px' }} />

          {/* Floor label */}
          <div className="absolute top-3 left-4 bg-black/50 px-3 py-1 rounded-lg">
            <span className="text-white font-black text-xs uppercase tracking-widest">Floor {currentFloor}</span>
          </div>

          {zones.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <p className="text-white/30 text-sm font-black uppercase tracking-widest">
                  {isArchitectMode ? 'Click and drag to draw rooms' : 'Enable Draw Rooms to start'}
                </p>
                <p className="text-white/20 text-xs mt-1">Floor {currentFloor} of {totalFloorsNum}</p>
              </div>
            </div>
          )}

          {zones.map(z => (
            <div key={z.id} onClick={() => setSelectedZone(z)}
              style={{ left: z.x, top: z.y, width: Math.abs(z.w), height: Math.abs(z.h), borderColor: z.color, backgroundColor: `${z.color}18` }}
              className={`absolute border-2 flex flex-col items-center justify-center p-1 transition-all cursor-pointer ${selectedZone?.id === z.id ? 'ring-2 ring-white z-50 scale-105' : 'hover:scale-[1.02]'}`}>
              <span className="text-[10px] font-black uppercase text-center leading-tight" style={{ color: z.color }}>{z.label}</span>
              <span className="text-[7px] opacity-60 mt-0.5 text-white font-bold">{Math.round(z.sqFt)} ft²</span>
            </div>
          ))}

          {drawing && <div className="absolute border-2 border-dashed border-blue-400 bg-blue-500/10 pointer-events-none"
            style={{ left: drawing.x, top: drawing.y, width: drawing.w, height: drawing.h }} />}

          {/* Color legend */}
          <div className="absolute bottom-3 left-3 flex gap-1.5 flex-wrap">
            {[['#06b6d4','Room'],['#10b981','Exit'],['#ec4899','Stairs'],['#f59e0b','Hazard'],['#ef4444','Fire Pt']].map(([c,l]) => (
              <div key={c} className="flex items-center gap-1 bg-black/60 px-2 py-1 rounded-lg">
                <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: c }}></div>
                <span className="text-[8px] text-white/60 font-bold">{l}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Zone Editor */}
        {selectedZone && (
          <div className="w-full lg:w-64 bg-white border-2 border-gray-200 rounded-2xl p-5 shadow-sm">
            <div className="flex justify-between items-center mb-5">
              <h3 className="text-xs font-black uppercase tracking-widest text-gray-700">Zone Editor</h3>
              <button onClick={() => setSelectedZone(null)} className="text-gray-400 hover:text-red-500 text-lg">×</button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 block mb-1">Label</label>
                <input value={selectedZone.label} onChange={e => updateZone(selectedZone.id, 'label', e.target.value)}
                  className="w-full border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm font-black uppercase text-gray-900 outline-none focus:border-blue-400" />
              </div>
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 block mb-1">Sq Ft</label>
                <input type="number" value={selectedZone.sqFt} onChange={e => updateZone(selectedZone.id, 'sqFt', e.target.value)}
                  className="w-full border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm font-bold text-gray-900 outline-none focus:border-blue-400" />
              </div>
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 block mb-2">Zone Type</label>
                <div className="flex gap-2 flex-wrap">
                  {[['#06b6d4','Room'],['#10b981','Exit'],['#f59e0b','Hazard'],['#ec4899','Stairs'],['#ef4444','Fire']].map(([c,l]) => (
                    <button key={c} onClick={() => updateZone(selectedZone.id, 'color', c)} title={l}
                      className={`w-8 h-8 rounded-full border-2 transition-transform ${selectedZone.color === c ? 'scale-125 border-gray-900' : 'border-transparent'}`}
                      style={{ backgroundColor: c }} />
                  ))}
                </div>
                <p className="text-[9px] text-gray-400 mt-1.5">🟢 Green = Exit · 💗 Pink = Stairs</p>
              </div>
              <button onClick={() => { setZones(prev => prev.filter(z => z.id !== selectedZone.id)); setSelectedZone(null); }}
                className="w-full py-3 text-red-600 text-xs font-black uppercase tracking-widest hover:bg-red-50 rounded-xl transition-all border-2 border-red-200">
                🗑 Delete Zone
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">

        {/* Live Alerts */}
        <div className="bg-gray-50 border-2 border-gray-200 rounded-2xl p-5">
          <h3 className="text-xs font-black uppercase tracking-widest text-red-600 mb-4 flex items-center gap-2">
            <span className="w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse inline-block"></span> Live Alerts
          </h3>
          {alerts.length === 0 && <p className="text-gray-400 text-xs font-bold uppercase text-center mt-4">No alerts</p>}
          <div className="space-y-3 max-h-48 overflow-y-auto">
            {alerts.slice(0, 8).map(a => (
              <div key={a.id} className="flex justify-between items-start gap-2">
                <div>
                  <span className="text-xs font-black text-gray-800">{a.type}</span>
                  <p className="text-[10px] text-gray-400">{a.roomLabel || '—'} · {a.timestamp}</p>
                  {a.hotelCode && <p className="text-[9px] text-gray-300">Code: {a.hotelCode}</p>}
                </div>
                <span className={`text-[9px] font-black px-2 py-0.5 rounded-full border shrink-0 ${
                  a.status === 'CRITICAL' ? 'bg-red-100 border-red-300 text-red-600' :
                  a.status === 'ACKNOWLEDGED' ? 'bg-amber-100 border-amber-300 text-amber-600' :
                  'bg-emerald-100 border-emerald-300 text-emerald-600'
                }`}>{a.status}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Analytics */}
        <div className="bg-gray-50 border-2 border-gray-200 rounded-2xl p-5">
          <h3 className="text-xs font-black uppercase tracking-widest text-gray-700 mb-5">📊 Analytics</h3>
          <div className="space-y-4">
            {[['🔥','FIRE','#ef4444'],['🚑','MEDICAL','#2563eb'],['🛡️','INTRUDER','#d97706'],['⚠️','OTHER','#64748b']].map(([icon,type,color]) => (
              <div key={type}>
                <div className="flex justify-between mb-1">
                  <span className="text-xs font-black text-gray-600 uppercase">{icon} {type}</span>
                  <span className="text-xs font-black text-gray-900">{counts[type]}</span>
                </div>
                <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${(counts[type] / maxCount) * 100}%`, backgroundColor: color, transition: 'width 0.5s' }}></div>
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-400 font-bold mt-4 pt-3 border-t border-gray-200">Total Incidents: <span className="text-gray-900 font-black">{alerts.length}</span></p>
        </div>

        {/* Broadcast */}
        <div className="bg-amber-50 border-2 border-amber-200 rounded-2xl p-5">
          <h3 className="text-xs font-black uppercase tracking-widest text-amber-700 mb-4">📢 Broadcast to All Guests</h3>
          <textarea value={broadcastMsg} onChange={e => setBroadcastMsg(e.target.value)}
            placeholder="Type emergency message for all guests..."
            className="w-full bg-white border-2 border-amber-200 rounded-xl p-3 text-sm font-medium outline-none resize-none text-gray-900 h-24 focus:border-amber-400 placeholder:text-gray-400"
          />
          <button onClick={sendBroadcast}
            className={`w-full mt-3 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all border-2 ${
              broadcastSent ? 'bg-emerald-500 border-emerald-500 text-white' : 'bg-amber-500 border-amber-500 text-white hover:bg-amber-600'
            }`}>
            {broadcastSent ? '✓ Broadcast Sent!' : '📢 Send to All Guests'}
          </button>

          {/* Recent broadcasts */}
          {broadcasts.length > 0 && (
            <div className="mt-4 pt-4 border-t border-amber-200">
              <p className="text-[10px] text-amber-600 font-black uppercase tracking-widest mb-2">Recent</p>
              {broadcasts.slice(0, 3).map(b => (
                <div key={b.id} className="mb-2">
                  <p className="text-xs text-gray-700 font-medium">{b.message}</p>
                  <p className="text-[9px] text-gray-400">{b.sentBy} · {b.timestamp}</p>
                </div>
              ))}
            </div>
          )}

          {/* Hotel code reminder */}
          <div className="mt-4 pt-4 border-t border-amber-200 text-center">
            <p className="text-[9px] text-gray-400 font-bold uppercase tracking-widest">Guest Check-in Code</p>
            <p className="text-2xl font-black font-mono tracking-[0.5em] text-emerald-600 mt-1">{hotelCode}</p>
            <p className="text-[9px] text-gray-400 italic">Display at reception desk</p>
          </div>
        </div>
      </div>
    </div>
  );
}
