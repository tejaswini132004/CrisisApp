# GuestGuard — Emergency Safety System

## Quick Start

1. Install dependencies (already included in node_modules):
   ```
   npm install
   ```
   (Skip if node_modules already present)

2. Run the dev server:
   ```
   npm run dev
   ```

3. Open in browser: http://localhost:5173

## Login Credentials

- **Guest Portal** — Click directly, no login needed
- **Staff Login** — Password: `0000`
- **Admin Login** — Password: `1234`

## Admin Setup (First Time)
1. Login as Admin → Enter any email + name + password (min 4 chars)
2. Type your Hotel Name in the top bar
3. Enable "Architect Mode" → Draw rooms by click-dragging on the canvas
4. Color Code your zones:
   - 🔵 Cyan = Regular Room
   - 🟢 Green (#10b981) = Exit / Safe Zone ← IMPORTANT for pathfinding
   - 🩷 Pink (#ec4899) = Staircase
   - 🟡 Yellow = Hazard Zone
   - 🔴 Red = Fire Point
5. Click "Deploy Sync" → Map goes live for Guests

## Features

### Guest Page
- Hold SOS button 2 seconds → Select emergency type → Alert sent to Firebase
- Mini map shows your room + nearest exit highlighted green
- Gemini AI speaks evacuation instructions aloud
- Floating 🤖 chat bubble for situational guidance
- Haptic feedback (mobile)

### Staff Page
- Live SOS alert feed with real-time Firebase sync
- Browser sound alarm + Desktop Notification on new alert
- "Acknowledge" button → Guest sees "Help is coming"
- "Mark Resolved" → Closes the alert
- Crisis timeline + per-type stats

### Admin Page
- Draw hotel floorplan on canvas
- Zone editor (label, sqft, color/type)
- Live alerts preview panel
- Analytics bar chart (Fire/Medical/Intruder/Other counts)
- Emergency broadcast to all guests

## Tech Stack
- React 18 + Vite
- Firebase Realtime Database
- Tailwind CSS
- Gemini 1.5 Flash API
- Web Speech API (TTS)
- Web Notifications API
