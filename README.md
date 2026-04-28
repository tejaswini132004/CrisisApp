# 🛡️ GuestGuard AI: Smart Crisis Navigation System

**GuestGuard AI** is an AI-powered, real-time crisis management and indoor navigation ecosystem specifically designed for the hospitality industry. It replaces static paper maps with a "Dynamic Digital Twin" that guides guests to safety using real-time AI instructions, audio guidance, and visual pathfinding.

---
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

  ---
  
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

---

## 1. ⚠️ Problem Statement
In emergencies like fires, medical crises, or security threats within large hotels, guests often panic. Traditional safety measures fail because:
* **Static Maps:** Paper evacuation maps on doors are hard to read under stress or in smoke-filled environments.
* **Lack of Real-Time Data:** Existing systems don't adapt if a primary exit is blocked by fire.
* **Communication Gap:** There is no direct, real-time link between a panicking guest and the security staff.
* **Indoor GPS Limitations:** Standard GPS doesn't work inside buildings, leaving guests without directional assistance.

---

## 2. 🚀 Solution Overview
GuestGuard AI addresses these challenges through a three-pronged integrated platform:

* **Master Architect Suite:** Allows hotel admins to digitize their floor plans into a smart schematic in minutes.
* **Smart SOS Hub:** A 2-second "Neural Hold" button for guests to report emergencies (Fire, Medical, Intruder) which logs their precise location and device ID to prevent pranks.
* **AI Guardian Engine (Gemini 1.5 Flash):** Uses Google’s Gemini AI to analyze the specific crisis context and provide dynamic, voice-guided survival instructions tailored to the guest's room and the nearest clear exit.
* **Staff Command Center:** Provides hotel security with a live feed of all incidents, the ability to broadcast global alerts, and one-click PDF crisis reporting.

---

## 3. 🌐 Prototype Link
Experience the live MVP here:
👉 **[Live Demo Link - GuestGuard AI](https://guestguard-319c8.web.app/)** *(Recommended: Use "Admin" to draw a room and "Guest" to trigger a simulated SOS).*

---

## 4. 📊 Project Deck
A concise presentation detailing our research methodology, technical architecture, and impact.
👉 **[View Project Deck (PDF/Google Slides)](https://your-deck-link.com)**

---

## 5. 💻 GitHub Repository
Access the complete source code, including our Graph Theory implementation for pathfinding and Gemini AI integration.
👉 **[GitHub Source Code](https://github.com/your-username/guestguard-ai)**

---

## 🛠️ Tech Stack
* **Frontend:** React.js, Tailwind CSS, Vite
* **Backend:** Firebase Realtime Database
* **AI:** Google Gemini 1.5 Flash API
* **Logic:** Graph Theory (Dijkstra’s Algorithm)

---

## 🔮 Future Roadmap
* **IoT Integration:** Auto-triggering SOS via smart smoke detectors.
* **AR Navigation:** Overlaying digital green arrows on the hotel floor via the phone camera.
* **PWA Offline Mode:** Ensuring maps work even if the hotel Wi-Fi goes down.
