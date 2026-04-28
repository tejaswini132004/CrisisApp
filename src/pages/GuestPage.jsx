import React, { useState, useEffect, useRef, useCallback } from 'react';
import { db, ref, set, onValue } from '../firebase';
import { getNearestSafeNode } from '../utils/graph';
import { getAIGuidance, getChatReply } from '../utils/gemini';

export default function GuestPage({ hotelInfo }) {
  const [stage, setStage] = useState('sos');
  const [isHolding, setIsHolding] = useState(false);
  const [progress, setProgress] = useState(0);
  const [zones, setZones] = useState([]);
  const [hotelName, setHotelName] = useState('');
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [nearestExit, setNearestExit] = useState(null);
  const [aiText, setAiText] = useState('');
  const [chatOpen, setChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState([
    { role: 'ai', text: "Hi — I'm your emergency assistant. Tell me exactly what's happening around you and I'll guide you step by step. I'm listening." }
  ]);
  const [alertType, setAlertType] = useState(null);
  const [helpStatus, setHelpStatus] = useState(null);
  const [helpCountdown, setHelpCountdown] = useState(null);
  const [helpStaffName, setHelpStaffName] = useState('');
  const [broadcasts, setBroadcasts] = useState([]);
  const [myAlertId, setMyAlertId] = useState(null);
  const [movingPeople, setMovingPeople] = useState([]);
  const [pathPoints, setPathPoints] = useState([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [deviceLocation, setDeviceLocation] = useState(null); // real GPS
  const timerRef = useRef(null);
  const countdownRef = useRef(null);
  const chatEndRef = useRef(null);
  const mapRef = useRef(null);
  const chatInputRef = useRef(null);
  const peopleMoveRef = useRef(null);
  const geoWatchRef = useRef(null);

  const MAP_W = 900, MAP_H = 500;

  // Load hotel data
  useEffect(() => {
    if (hotelInfo) {
      if (hotelInfo.zones) setZones(hotelInfo.zones);
      if (hotelInfo.hotelName) setHotelName(hotelInfo.hotelName);
      return;
    }
    onValue(ref(db, 'infrastructure/'), (snap) => {
      const data = snap.val();
      if (data) { setZones(data.zones || []); setHotelName(data.hotelInfo?.name || 'HOTEL'); }
    });
  }, [hotelInfo]);

  // Real device GPS — updates map dot on movement
  useEffect(() => {
    if (!navigator.geolocation) return;
    geoWatchRef.current = navigator.geolocation.watchPosition(
      (pos) => setDeviceLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude, acc: pos.coords.accuracy }),
      null,
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 }
    );
    return () => { if (geoWatchRef.current) navigator.geolocation.clearWatch(geoWatchRef.current); };
  }, []);

  // Listen for broadcasts
  useEffect(() => {
    onValue(ref(db, 'broadcasts/'), (snap) => {
      const data = snap.val();
      if (!data) { setBroadcasts([]); return; }
      const arr = Object.entries(data).map(([id, v]) => ({ id, ...v })).sort((a, b) => b.id - a.id).slice(0, 5);
      setBroadcasts(arr);
    });
  }, []);

  // Listen for ACK
  useEffect(() => {
    if (!myAlertId) return;
    const unsub = onValue(ref(db, `live_alerts/${myAlertId}`), (snap) => {
      const data = snap.val();
      if (!data) return;
      if (data.status === 'ACKNOWLEDGED' && helpStatus !== 'ACKNOWLEDGED') {
        setHelpStatus('ACKNOWLEDGED');
        const name = data.staffName || 'Security';
        setHelpStaffName(name);
        setHelpCountdown(300);
        // Pronounce name properly — split camelCase / all-caps
        const pronounceable = name.replace(/([A-Z])/g, ' $1').trim();
        speak(`Help is coming! ${pronounceable} from hotel security is on the way to your location right now. Stay calm.`);
      } else if (data.status === 'RESOLVED') {
        setHelpStatus('RESOLVED');
        clearInterval(countdownRef.current);
        speak('The emergency has been resolved. Help has reached you. You are safe.');
      }
    });
    return () => unsub();
  }, [myAlertId]);

  // Countdown
  useEffect(() => {
    if (helpStatus === 'ACKNOWLEDGED' && helpCountdown > 0) {
      countdownRef.current = setInterval(() => {
        setHelpCountdown(p => { if (p <= 1) { clearInterval(countdownRef.current); return 0; } return p - 1; });
      }, 1000);
    }
    return () => clearInterval(countdownRef.current);
  }, [helpStatus]);

  // Moving people animation
  useEffect(() => {
    if (stage !== 'map' || zones.length === 0) return;
    const roomZones = zones.filter(z => z.color !== '#10b981' && z.color !== '#ec4899');
    const people = Array.from({ length: 5 }, (_, i) => {
      const room = roomZones[Math.floor(Math.random() * roomZones.length)] || zones[0];
      return { id: i, x: room ? room.x + room.w / 2 + (Math.random() - 0.5) * 20 : 100 + i * 60, y: room ? room.y + room.h / 2 + (Math.random() - 0.5) * 10 : 200, color: i === 0 ? '#ef4444' : '#60a5fa' };
    });
    setMovingPeople(people);
    return () => { setMovingPeople([]); };
  }, [stage, zones.length]);

  useEffect(() => {
    if (!nearestExit || movingPeople.length === 0) return;
    const ex = nearestExit.x + nearestExit.w / 2, ey = nearestExit.y + nearestExit.h / 2;
    peopleMoveRef.current = setInterval(() => {
      setMovingPeople(prev => prev.map(p => {
        const dx = ex - p.x, dy = ey - p.y, dist = Math.hypot(dx, dy);
        if (dist < 8) return p;
        return { ...p, x: p.x + (dx / dist) * 1.8, y: p.y + (dy / dist) * 1.8 };
      }));
    }, 60);
    return () => clearInterval(peopleMoveRef.current);
  }, [nearestExit, movingPeople.length]);

  // Path
  useEffect(() => {
    if (!nearestExit || !selectedRoom) { setPathPoints([]); return; }
    setPathPoints([
      { x: selectedRoom.x + selectedRoom.w / 2, y: selectedRoom.y + selectedRoom.h / 2 },
      { x: nearestExit.x + nearestExit.w / 2, y: nearestExit.y + nearestExit.h / 2 }
    ]);
  }, [nearestExit, selectedRoom]);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chatMessages]);

  const speak = (text) => {
    window.speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(text);
    utt.rate = 0.88; utt.pitch = 1; utt.volume = 1;
    window.speechSynthesis.speak(utt);
  };

  const startHold = (e) => {
    e?.preventDefault();
    setIsHolding(true); setProgress(0);
    timerRef.current = setInterval(() => {
      setProgress(p => {
        if (p >= 100) { clearInterval(timerRef.current); setStage('type'); return 100; }
        return p + 2;
      });
    }, 20);
  };
  const stopHold = () => {
    setIsHolding(false); clearInterval(timerRef.current);
    if (progress < 100) setProgress(0);
  };

  const handleTypeSelect = async (type) => {
    setAlertType(type);
    if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
    const alertId = Date.now().toString();
    setMyAlertId(alertId);
    const name = hotelInfo?.hotelName || hotelName;
    await set(ref(db, `live_alerts/${alertId}`), {
      type, timestamp: new Date().toLocaleTimeString(), status: 'CRITICAL',
      deviceId: navigator.platform, hotelName: name,
      hotelCode: hotelInfo?.code || 'DIRECT',
      roomLabel: selectedRoom?.label || 'Unknown Room',
    });
    const roomCenter = selectedRoom
      ? { x: selectedRoom.x + selectedRoom.w / 2, y: selectedRoom.y + selectedRoom.h / 2 }
      : { x: MAP_W / 2, y: MAP_H / 2 };
    const exit = getNearestSafeNode(zones, roomCenter);
    setNearestExit(exit);
    setStage('map');
    const guidance = await getAIGuidance(name, selectedRoom || { label: 'Unknown' }, zones, type);
    setAiText(guidance);
    speak(guidance);
  };

  const sendChat = async () => {
    if (!chatInput.trim() || chatLoading) return;
    const userMsg = chatInput.trim();
    const updatedHistory = [...chatMessages, { role: 'user', text: userMsg }];
    setChatMessages(updatedHistory);
    setChatInput('');
    setChatLoading(true);
    try {
      const historyForAI = chatMessages.slice(-8);
      const reply = await getChatReply(hotelInfo?.hotelName || hotelName, selectedRoom, zones, userMsg, historyForAI, alertType);
      setChatMessages(p => [...p, { role: 'ai', text: reply }]);
      speak(reply);
    } catch {
      setChatMessages(p => [...p, { role: 'ai', text: 'I am here with you. Please move towards the nearest exit sign and stay low if there is smoke.' }]);
    }
    setChatLoading(false);
  };

  const formatCountdown = (s) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;

  const renderMap = () => {
    const mw = mapRef.current?.clientWidth || 320;
    const mh = 190;
    const sw = mw / MAP_W, sh = mh / MAP_H;

    return (
      <div ref={mapRef} className="relative w-full bg-gray-900 rounded-2xl overflow-hidden" style={{ height: mh }}>
        {/* Grid */}
        <div className="absolute inset-0 opacity-5" style={{ backgroundImage: 'linear-gradient(#fff 1px,transparent 1px),linear-gradient(90deg,#fff 1px,transparent 1px)', backgroundSize: '20px 20px' }} />

        {zones.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-white/30 text-xs font-bold uppercase tracking-widest text-center">No map — Follow exit signs</p>
          </div>
        )}

        {zones.map(z => {
          const isExit = z.color === '#10b981';
          const isSelected = z.id === selectedRoom?.id;
          const isEmergency = isSelected && stage === 'map';
          return (
            <div key={z.id} style={{
              left: z.x * sw, top: z.y * sh,
              width: Math.abs(z.w) * sw, height: Math.abs(z.h) * sh,
              borderColor: isExit ? '#4ade80' : isSelected ? '#ef4444' : z.color,
              backgroundColor: isExit ? 'rgba(74,222,128,0.15)' : isSelected ? 'rgba(239,68,68,0.2)' : `${z.color}18`,
              boxShadow: isExit ? '0 0 12px rgba(74,222,128,0.5)' : isEmergency ? '0 0 14px rgba(239,68,68,0.6)' : 'none',
              animation: isEmergency ? 'emergencyBlink 1s ease-in-out infinite' : 'none',
            }} className="absolute border-2 flex flex-col items-center justify-center overflow-hidden">
              <span className="font-black text-center leading-tight" style={{ fontSize: 5, color: isExit ? '#4ade80' : isSelected ? '#ef4444' : z.color, padding: '0 2px' }}>
                {isExit ? '🚪' : isSelected ? '📍' : ''}{z.label}
              </span>
            </div>
          );
        })}

        {/* Path line */}
        {pathPoints.length === 2 && (
          <svg className="absolute inset-0 pointer-events-none" style={{ width: '100%', height: '100%' }}>
            <defs>
              <marker id="arrowG" markerWidth="7" markerHeight="7" refX="3.5" refY="3.5" orient="auto">
                <path d="M0,0 L7,3.5 L0,7 Z" fill="#4ade80" />
              </marker>
            </defs>
            <line x1={pathPoints[0].x * sw} y1={pathPoints[0].y * sh}
              x2={pathPoints[1].x * sw} y2={pathPoints[1].y * sh}
              stroke="#4ade80" strokeWidth="3" strokeDasharray="8,5"
              markerEnd="url(#arrowG)" opacity="0.9" />
          </svg>
        )}

        {/* Moving people */}
        {movingPeople.map(p => (
          <div key={p.id} style={{
            left: p.x * sw - 5, top: p.y * sh - 5, width: 10, height: 10,
            backgroundColor: p.color, boxShadow: `0 0 6px ${p.color}`,
          }} className="absolute rounded-full z-10" />
        ))}

        {/* GPS device dot */}
        {deviceLocation && selectedRoom && (
          <div style={{ left: (selectedRoom.x + selectedRoom.w / 2) * sw - 6, top: (selectedRoom.y + selectedRoom.h / 2) * sh - 6, width: 12, height: 12 }}
            className="absolute bg-white border-2 border-red-500 rounded-full z-20 shadow-lg" title="Your device location" />
        )}
      </div>
    );
  };

  const resetAll = () => {
    setStage('sos'); setProgress(0); setAlertType(null); setAiText('');
    setHelpStatus(null); setMyAlertId(null); setPathPoints([]);
    setMovingPeople([]); setHelpCountdown(null);
    window.speechSynthesis.cancel(); clearInterval(countdownRef.current);
  };

  // Smart broadcast filter — show most recent, not all
  const recentBroadcasts = broadcasts.slice(0, 2);

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-start pt-4 pb-24 px-3 sm:px-6 text-gray-900 font-sans overflow-x-hidden">

      {/* Blink animation */}
      <style>{`
        @keyframes emergencyBlink {
          0%, 100% { opacity: 1; } 50% { opacity: 0.3; }
        }
        @keyframes slideDown { from { opacity:0; transform:translateY(-10px); } to { opacity:1; transform:translateY(0); } }
        .slide-down { animation: slideDown 0.3s ease forwards; }
      `}</style>

      {/* Broadcasts — white theme */}
      {recentBroadcasts.length > 0 && (
        <div className="w-full max-w-lg mb-4 space-y-2">
          {recentBroadcasts.map(b => (
            <div key={b.id} className="bg-amber-50 border-2 border-amber-400 rounded-2xl px-4 py-3 flex items-start gap-3 slide-down shadow-sm">
              <span className="text-2xl shrink-0">📢</span>
              <div>
                <p className="text-amber-700 font-black text-xs uppercase tracking-widest">Hotel Broadcast</p>
                <p className="text-gray-900 text-sm font-semibold mt-0.5">{b.message}</p>
                <p className="text-gray-400 text-[10px] mt-1">{b.sentBy ? `From: ${b.sentBy} · ` : ''}{b.timestamp}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* STAGE 1: SOS */}
      {stage === 'sos' && (
        <div className="w-full max-w-sm text-center">
          <div className="mb-6">
            <h1 className="text-3xl font-black italic tracking-tighter text-gray-900">GUESTGUARD</h1>
            {(hotelInfo?.hotelName || hotelName) && (
              <p className="text-base font-black text-emerald-600 mt-1 uppercase tracking-wider">{hotelInfo?.hotelName || hotelName}</p>
            )}
            <p className="text-xs text-gray-500 font-bold tracking-widest mt-1 uppercase">Hold 2 seconds to report emergency</p>
          </div>

          {zones.length > 0 && (
            <div className="mb-6 bg-gray-50 border-2 border-gray-200 rounded-2xl p-4">
              <p className="text-xs text-gray-500 font-black uppercase tracking-widest mb-2">Your Room</p>
              <select
                onChange={e => setSelectedRoom(zones.find(z => z.id == e.target.value) || null)}
                className="w-full bg-white border-2 border-gray-300 rounded-xl px-3 py-3 text-sm font-bold text-gray-900 outline-none focus:border-emerald-500"
              >
                <option value="">— Select your room —</option>
                {zones.filter(z => z.color !== '#10b981').map(z => (
                  <option key={z.id} value={z.id}>{z.label}</option>
                ))}
              </select>
              {selectedRoom && <p className="text-xs text-emerald-600 font-bold mt-2">📍 {selectedRoom.label}</p>}
            </div>
          )}

          {/* SOS Button */}
          <div className="relative flex items-center justify-center my-6">
            <svg className="absolute w-64 h-64 -rotate-90">
              <circle cx="128" cy="128" r="118" stroke="#e5e7eb" strokeWidth="4" fill="transparent" />
              <circle cx="128" cy="128" r="118" stroke="#ef4444" strokeWidth="10" fill="transparent"
                strokeDasharray="741" strokeDashoffset={741 - (741 * progress) / 100}
                className="transition-all duration-75 ease-linear" strokeLinecap="round" />
            </svg>
            <button
              onMouseDown={startHold} onMouseUp={stopHold} onMouseLeave={stopHold}
              onTouchStart={startHold} onTouchEnd={stopHold}
              className={`w-48 h-48 rounded-full flex flex-col items-center justify-center z-10 transition-all duration-200 select-none touch-none border-4 ${
                isHolding ? 'scale-95 bg-red-600 border-red-700 shadow-2xl shadow-red-500/50' : 'bg-white border-red-500 shadow-2xl shadow-red-200'
              }`}
            >
              <span className={`text-5xl font-black italic tracking-tighter ${isHolding ? 'text-white' : 'text-red-600'}`}>SOS</span>
              <p className={`text-[10px] font-black uppercase tracking-widest mt-2 ${isHolding ? 'text-white/70' : 'text-red-400'}`}>
                {isHolding ? `${Math.round(progress)}%` : 'Hold 2 Seconds'}
              </p>
            </button>
          </div>
          <p className="text-[9px] text-gray-400 font-bold uppercase tracking-widest">
            {hotelInfo?.code ? `Hotel Code: ${hotelInfo.code}` : 'Emergency System Active'}
          </p>
        </div>
      )}

      {/* STAGE 2: Type */}
      {stage === 'type' && (
        <div className="bg-white border-2 border-gray-200 shadow-2xl rounded-3xl p-6 sm:p-8 w-full max-w-md">
          <button onClick={() => { setStage('sos'); setProgress(0); }} className="text-xs font-black text-gray-400 uppercase tracking-widest mb-6 hover:text-gray-900 transition-colors">← Cancel</button>
          <h2 className="text-2xl font-black uppercase italic tracking-tighter text-gray-900 mb-1">Emergency Type</h2>
          <p className="text-xs text-red-600 font-black tracking-widest mb-8 uppercase animate-pulse">🚨 Select your emergency</p>
          <div className="grid grid-cols-2 gap-3">
            {[['🔥','Fire','FIRE','#ef4444','bg-red-50 border-red-300 hover:border-red-500'],
              ['🚑','Medical','MEDICAL','#2563eb','bg-blue-50 border-blue-300 hover:border-blue-500'],
              ['🛡️','Intruder','INTRUDER','#d97706','bg-amber-50 border-amber-300 hover:border-amber-500'],
              ['⚠️','Other','OTHER','#64748b','bg-gray-50 border-gray-300 hover:border-gray-500']
            ].map(([icon,label,type,color,cls]) => (
              <button key={type} onClick={() => handleTypeSelect(type)}
                className={`p-6 rounded-2xl border-2 ${cls} transition-all flex flex-col items-center group active:scale-95`}>
                <span className="text-4xl mb-2 group-hover:scale-110 transition-transform">{icon}</span>
                <span className="text-sm font-black uppercase tracking-widest" style={{ color }}>{label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* STAGE 3: Map + Status */}
      {stage === 'map' && (
        <div className="w-full max-w-lg space-y-3">

          {/* Help Status */}
          {helpStatus === 'ACKNOWLEDGED' && (
            <div className="bg-emerald-50 border-2 border-emerald-500 rounded-2xl px-4 py-4 shadow-sm slide-down">
              <div className="flex items-center gap-2 mb-2">
                <span className="w-3 h-3 bg-emerald-500 rounded-full animate-ping inline-block shrink-0"></span>
                <p className="text-emerald-700 font-black text-sm uppercase tracking-widest">✓ Help Is On The Way!</p>
              </div>
              <p className="text-gray-700 text-sm font-semibold">{helpStaffName} from hotel security is coming to you</p>
              {helpCountdown !== null && helpCountdown > 0 && (
                <div className="mt-3 bg-white border border-emerald-200 rounded-xl px-4 py-2 inline-block">
                  <p className="text-emerald-600 font-mono font-black text-xl">{formatCountdown(helpCountdown)}</p>
                  <p className="text-gray-400 text-[9px] uppercase tracking-widest">Estimated arrival</p>
                </div>
              )}
              {/* Smart instructions based on emergency type */}
              <p className="text-gray-600 text-xs mt-3 font-medium">
                {alertType === 'FIRE'
                  ? '🔥 Move to the hallway — do not lock yourself inside. Stay near the floor if smoky.'
                  : alertType === 'INTRUDER'
                  ? '🛡️ Lock your door, move away from it. Open ONLY when staff announces their name.'
                  : alertType === 'MEDICAL'
                  ? '🚑 Keep the person still and calm. Do not move them. Keep the door unlocked for staff.'
                  : '⚠️ Stay where you are — help is coming to your location.'}
              </p>
            </div>
          )}

          {helpStatus === 'RESOLVED' && (
            <div className="bg-emerald-50 border-2 border-emerald-500 rounded-2xl px-4 py-4 text-center">
              <p className="text-emerald-700 font-black text-sm uppercase tracking-widest">✓ Emergency Resolved — You Are Safe</p>
            </div>
          )}

          {!helpStatus && (
            <div className="bg-red-50 border-2 border-red-400 rounded-2xl px-4 py-3 flex items-center gap-3">
              <span className="w-3 h-3 bg-red-500 rounded-full animate-ping shrink-0"></span>
              <div>
                <p className="text-red-700 font-black text-sm uppercase tracking-widest">🚨 {alertType} Alert Sent</p>
                <p className="text-gray-500 text-xs">Staff has been notified — help is being dispatched</p>
              </div>
            </div>
          )}

          {/* Map */}
          <div className="bg-white border-2 border-gray-200 rounded-3xl p-4 shadow-sm">
            <div className="flex justify-between items-center mb-3">
              <p className="text-xs font-black uppercase tracking-widest text-gray-700">🗺 Evacuation Map</p>
              {nearestExit && <p className="text-xs text-emerald-600 font-black">→ Exit: {nearestExit.label}</p>}
            </div>
            {renderMap()}
            <div className="flex gap-4 mt-3 flex-wrap">
              {[['bg-red-500','You (Blinking)'],['bg-emerald-400','Exit'],['bg-blue-400','Others'],['','— — Path']].map(([bg,label],i) => (
                <div key={i} className="flex items-center gap-1.5">
                  {bg ? <span className={`w-2.5 h-2.5 ${bg} rounded-full`}></span> : <span className="text-emerald-500 text-xs font-black">—</span>}
                  <span className="text-[10px] text-gray-500 font-bold">{label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* AI Guidance */}
          {aiText && (
            <div className="bg-blue-50 border-2 border-blue-300 rounded-2xl p-4">
              <div className="flex justify-between items-center mb-2">
                <p className="text-xs font-black uppercase tracking-widest text-blue-700">🤖 AI Guidance</p>
                <button onClick={() => speak(aiText)} className="text-blue-400 hover:text-blue-600 transition-colors text-base">🔊</button>
              </div>
              <p className="text-gray-800 text-sm leading-relaxed font-medium">{aiText}</p>
            </div>
          )}

          <button onClick={resetAll} className="w-full py-3 bg-gray-100 border-2 border-gray-200 rounded-2xl text-xs font-black uppercase tracking-widest text-gray-500 hover:text-gray-900 hover:border-gray-400 transition-all">
            Cancel & Return
          </button>
        </div>
      )}

      {/* Chat */}
      <div className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-50">
        {chatOpen && (
          <div className="mb-3 w-[min(340px,calc(100vw-2rem))] bg-white border-2 border-gray-200 rounded-3xl shadow-2xl overflow-hidden">
            <div className="p-3 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <div>
                <p className="text-xs font-black uppercase tracking-widest text-blue-700">🤖 Emergency Assistant</p>
                <p className="text-[9px] text-gray-400 mt-0.5">Powered by Gemini AI · Always listening</p>
              </div>
              <button onClick={() => setChatOpen(false)} className="text-gray-400 hover:text-gray-900 text-xl w-8 h-8 flex items-center justify-center">×</button>
            </div>
            <div className="p-3 space-y-2.5 max-h-64 overflow-y-auto bg-white">
              {chatMessages.map((m, i) => (
                <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] px-3 py-2.5 rounded-2xl text-sm font-medium leading-relaxed ${
                    m.role === 'user' ? 'bg-emerald-500 text-white' : 'bg-gray-100 text-gray-800'
                  }`}>{m.text}</div>
                </div>
              ))}
              {chatLoading && (
                <div className="flex justify-start">
                  <div className="bg-gray-100 px-4 py-3 rounded-2xl flex gap-1">
                    {[0,150,300].map(d => <span key={d} className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: `${d}ms` }}></span>)}
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
            <div className="p-3 border-t border-gray-100 flex gap-2">
              <input ref={chatInputRef} value={chatInput} onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendChat()}
                placeholder="Tell me what's happening..."
                className="flex-1 bg-gray-50 border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none text-gray-900 placeholder:text-gray-400 min-w-0 focus:border-blue-400"
              />
              <button onClick={sendChat} disabled={chatLoading}
                className="bg-emerald-500 text-white px-4 py-2.5 rounded-xl text-sm font-black disabled:opacity-50 hover:bg-emerald-600 transition-colors shrink-0">→</button>
            </div>
          </div>
        )}
        <button onClick={() => { setChatOpen(o => !o); setTimeout(() => chatInputRef.current?.focus(), 100); }}
          className={`w-14 h-14 rounded-full flex items-center justify-center text-xl shadow-lg transition-all ${
            chatOpen ? 'bg-red-500 shadow-red-300 rotate-45' : 'bg-emerald-500 shadow-emerald-300 hover:scale-110'
          }`}>
          {chatOpen ? '×' : '🤖'}
        </button>
      </div>
    </div>
  );
}
