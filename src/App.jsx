import React, { useState, useEffect } from 'react';
import AdminLayout from './components/AdminLayout';
import GuestPage from './pages/GuestPage';
import StaffPage from './pages/StaffPage';
import { db, ref, onValue } from './firebase';

const App = () => {
  const [userRole, setUserRole] = useState(null);
  const [authStep, setAuthStep] = useState(null);
  const [passkey, setPasskey] = useState('');
  const [error, setError] = useState('');
  const [staffName, setStaffName] = useState('');
  const [staffNameSaved, setStaffNameSaved] = useState(false);
  const [guestHotelCode, setGuestHotelCode] = useState('');
  const [guestHotelInfo, setGuestHotelInfo] = useState(null);
  const [guestCodeError, setGuestCodeError] = useState('');
  // BONUS: Global panic indicator — flashes when any SOS is CRITICAL
  const [panicActive, setPanicActive] = useState(false);

  const ADMIN_PASS = '1234';
  const STAFF_PASS = '0000';

  useEffect(() => {
    const saved = localStorage.getItem('gg_staff_name');
    if (saved) { setStaffName(saved); setStaffNameSaved(true); }
  }, []);

  // Global SOS watcher — panic flash for any active CRITICAL alert
  useEffect(() => {
    const unsub = onValue(ref(db, 'live_alerts/'), (snap) => {
      const data = snap.val();
      if (!data) { setPanicActive(false); return; }
      const hasCritical = Object.values(data).some(a => a.status === 'CRITICAL');
      setPanicActive(hasCritical);
    });
    return () => unsub();
  }, []);

  const attemptLogin = () => {
    setError('');
    if (authStep === 'admin') {
      if (passkey === ADMIN_PASS) { setUserRole('admin'); setAuthStep(null); setPasskey(''); }
      else setError('INVALID ADMIN KEY');
    } else if (authStep === 'staff') {
      if (passkey === STAFF_PASS) {
        if (!staffNameSaved) { setAuthStep('staff_name'); setPasskey(''); }
        else { setUserRole('staff'); setAuthStep(null); setPasskey(''); }
      } else setError('INVALID STAFF KEY');
    }
  };

  const saveStaffName = () => {
    if (!staffName.trim()) { setError('Enter your name'); return; }
    localStorage.setItem('gg_staff_name', staffName.trim());
    setStaffNameSaved(true);
    setUserRole('staff');
    setAuthStep(null);
  };

  const verifyGuestCode = () => {
    setGuestCodeError('');
    const code = guestHotelCode.trim().toUpperCase();
    if (code.length < 4) { setGuestCodeError('Enter the hotel code from reception'); return; }
    onValue(ref(db, 'hotel_codes/'), (snap) => {
      const data = snap.val();
      if (data && data[code]) {
        setGuestHotelInfo({ ...data[code], code });
        setUserRole('guest');
        setAuthStep(null);
      } else {
        setGuestCodeError('Code not found — ask hotel front desk');
      }
    }, { onlyOnce: true });
  };

  const signOut = () => {
    setUserRole(null); setAuthStep(null); setPasskey(''); setError('');
    setGuestHotelCode(''); setGuestHotelInfo(null); setGuestCodeError('');
    window.speechSynthesis?.cancel();
  };

  // GUEST CODE SCREEN
  if (authStep === 'guest_code') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4 font-sans">
        <div className="w-full max-w-[420px]">
          <div className="bg-white border-2 border-gray-200 shadow-2xl p-8 rounded-3xl">
            <button onClick={() => { setAuthStep(null); setGuestCodeError(''); }} className="text-xs font-black text-gray-400 uppercase tracking-widest mb-6 hover:text-gray-900 transition-colors">← Back</button>
            <div className="text-center mb-8">
              <div className="text-5xl mb-3">🏨</div>
              <h2 className="text-2xl font-black uppercase italic tracking-tighter text-gray-900">Guest Check-In</h2>
              <p className="text-xs text-gray-500 uppercase tracking-widest mt-2">Enter hotel code from reception</p>
            </div>
            <input autoFocus placeholder="HOTEL CODE" value={guestHotelCode}
              onChange={e => setGuestHotelCode(e.target.value.toUpperCase().slice(0, 8))}
              onKeyDown={e => e.key === 'Enter' && verifyGuestCode()}
              className="w-full bg-gray-50 border-2 border-gray-300 rounded-2xl p-5 text-center text-emerald-600 font-mono font-black tracking-[0.5em] text-2xl focus:outline-none focus:border-emerald-500 transition-all mb-3"
            />
            {guestCodeError && <p className="text-red-600 text-xs font-black uppercase tracking-widest text-center mb-3 animate-pulse">{guestCodeError}</p>}
            <button onClick={verifyGuestCode} className="w-full py-4 bg-gray-900 text-white rounded-2xl font-black uppercase text-sm tracking-widest hover:bg-gray-700 transition-all active:scale-95">
              Enter Hotel →
            </button>
            <p className="text-[10px] text-gray-400 text-center mt-4 font-medium">No code? Ask hotel front desk</p>
          </div>
        </div>
      </div>
    );
  }

  // STAFF NAME SCREEN
  if (authStep === 'staff_name') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4 font-sans">
        <div className="w-full max-w-[420px]">
          <div className="bg-white border-2 border-gray-200 shadow-2xl p-8 rounded-3xl text-center">
            <div className="text-5xl mb-4">👤</div>
            <h2 className="text-2xl font-black uppercase italic tracking-tighter text-gray-900 mb-2">Your Name</h2>
            <p className="text-xs text-blue-600 font-black tracking-widest mb-6 uppercase">One-time setup · saved for all future logins</p>
            <input autoFocus placeholder="e.g. Rahul Sharma" value={staffName}
              onChange={e => setStaffName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && saveStaffName()}
              className="w-full bg-gray-50 border-2 border-gray-300 rounded-2xl p-4 text-center text-gray-900 font-bold text-lg focus:outline-none focus:border-blue-400 transition-all mb-3"
            />
            {error && <p className="text-red-600 text-xs font-black uppercase tracking-widest text-center mb-3">{error}</p>}
            <button onClick={saveStaffName} className="w-full py-4 bg-gray-900 text-white rounded-2xl font-black uppercase text-sm tracking-widest hover:bg-gray-700 transition-all active:scale-95">
              Save & Enter →
            </button>
          </div>
        </div>
      </div>
    );
  }

  // LANDING
  if (!userRole) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4 sm:p-8 font-sans">
        <div className="w-full max-w-[420px]">
          {!authStep ? (
            <div className="bg-white border-2 border-gray-200 shadow-2xl p-8 sm:p-10 rounded-3xl">
              <div className="text-center mb-10">
                <div className="w-16 h-16 bg-gray-900 rounded-2xl mx-auto mb-5 flex items-center justify-center text-3xl font-black shadow-lg text-white italic">G</div>
                <h1 className="text-3xl sm:text-4xl font-black tracking-tighter uppercase italic text-gray-900">GuestGuard</h1>
                <p className="text-xs text-emerald-600 font-black tracking-[0.4em] mt-3 uppercase">Hotel Safety System</p>
              </div>
              <div className="space-y-3">
                <button onClick={() => setAuthStep('guest_code')}
                  className="w-full p-5 rounded-2xl bg-gray-900 text-white font-black uppercase tracking-widest text-sm hover:bg-gray-700 active:scale-95 transition-all shadow-sm">
                  🏨 Guest Portal
                </button>
                <div className="flex items-center gap-4 my-4">
                  <div className="h-px bg-gray-200 w-full"></div>
                  <span className="text-[10px] font-black uppercase tracking-widest text-gray-400 whitespace-nowrap">Staff / Admin</span>
                  <div className="h-px bg-gray-200 w-full"></div>
                </div>
                <button onClick={() => setAuthStep('staff')} className="w-full p-4 rounded-2xl bg-white border-2 border-gray-200 hover:border-blue-400 hover:bg-blue-50 transition-all text-left">
                  <p className="font-black text-sm uppercase tracking-widest text-blue-700">👮 Staff Login</p>
                  <p className="text-[10px] text-gray-400 mt-1 font-medium italic">{staffName ? `Welcome back, ${staffName}` : 'Security Personnel'}</p>
                </button>
                <button onClick={() => setAuthStep('admin')} className="w-full p-4 rounded-2xl bg-white border-2 border-gray-200 hover:border-gray-900 hover:bg-gray-50 transition-all text-left">
                  <p className="font-black text-sm uppercase tracking-widest text-gray-900">🔐 Admin Login</p>
                  <p className="text-[10px] text-gray-400 mt-1 font-medium italic">Hotel Administrator</p>
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-white border-2 border-gray-200 shadow-2xl p-8 rounded-3xl">
              <button onClick={() => { setAuthStep(null); setError(''); setPasskey(''); }} className="text-xs font-black text-gray-400 uppercase tracking-widest mb-6 hover:text-gray-900 transition-colors">← Back</button>
              <h2 className="text-2xl font-black uppercase italic tracking-tighter text-gray-900 mb-1">{authStep === 'admin' ? 'Admin' : 'Staff'} Access</h2>
              {authStep === 'staff' && staffName && <p className="text-xs text-blue-600 font-black uppercase tracking-widest mb-4">Welcome back, {staffName} 👋</p>}
              <p className="text-xs text-gray-400 uppercase tracking-widest mb-6 italic">Enter access code</p>
              <input autoFocus type="password" placeholder="••••" value={passkey}
                onChange={e => setPasskey(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && attemptLogin()}
                className="w-full bg-gray-50 border-2 border-gray-300 rounded-2xl p-5 text-center text-gray-900 font-mono tracking-[0.6em] text-2xl focus:outline-none focus:border-gray-900 transition-all mb-4"
              />
              {error && <p className="text-red-600 text-xs font-black uppercase tracking-widest text-center mb-4 animate-pulse">{error}</p>}
              <button onClick={attemptLogin} className="w-full py-4 bg-gray-900 text-white rounded-2xl font-black uppercase text-sm tracking-widest hover:bg-gray-700 transition-all active:scale-95">
                Confirm →
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen bg-white ${panicActive && userRole === 'staff' ? 'panic-bg' : ''}`}>
      {/* BONUS FEATURE: Panic indicator bar for staff when SOS is active */}
      {panicActive && userRole === 'staff' && (
        <div className="w-full bg-red-600 text-white text-center py-2 px-4 text-xs font-black uppercase tracking-widest animate-pulse sticky top-0 z-[200]">
          🚨 ACTIVE SOS EMERGENCY — Guests need help right now
        </div>
      )}

      <button onClick={signOut}
        className="fixed top-4 right-4 z-[100] px-4 py-2 bg-white border-2 border-gray-200 rounded-xl text-xs font-black uppercase tracking-widest text-gray-500 hover:text-gray-900 hover:border-gray-400 transition-all shadow-sm">
        Sign Out
      </button>

      {userRole === 'admin' && <AdminLayout />}
      {userRole === 'guest' && <GuestPage hotelInfo={guestHotelInfo} />}
      {userRole === 'staff' && <StaffPage staffName={staffName} />}
    </div>
  );
};

export default App;
