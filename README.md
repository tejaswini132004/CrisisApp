# 🛡️ GuestGuard AI: Smart Crisis Navigation System

**GuestGuard AI** is an AI-powered, real-time crisis management and indoor navigation ecosystem specifically designed for the hospitality industry. It replaces static paper maps with a "Dynamic Digital Twin" that guides guests to safety using real-time AI instructions, audio guidance, and visual pathfinding.

---

## ⚠️ Problem Statement

In emergencies like fires, medical crises, or security threats within large hotels, guests often panic. Traditional safety measures fail because:

- **Static Maps:** Paper evacuation maps on doors are hard to read under stress or in smoke-filled environments.
- **Lack of Real-Time Data:** Existing systems don't adapt if a primary exit is blocked by fire.
- **Communication Gap:** There is no direct, real-time link between a panicking guest and the security staff.
- **Indoor GPS Limitations:** Standard GPS doesn't work inside buildings, leaving guests without directional assistance.

---

## 🚀 Solution Overview

GuestGuard AI addresses these challenges through a three-pronged integrated platform:

- **Master Architect Suite:** Allows hotel admins to digitize their floor plans into a smart schematic in minutes.
- **Smart SOS Hub:** A 2-second "Neural Hold" button for guests to report emergencies (Fire, Medical, Intruder) which logs their precise location and device ID to prevent pranks.
- **AI Guardian Engine (Gemini 1.5 Flash):** Uses Google’s Gemini AI to analyze the specific crisis context and provide dynamic, voice-guided survival instructions tailored to the guest's room and the nearest clear exit.
- **Staff Command Center:** Provides hotel security with a live feed of all incidents, the ability to broadcast global alerts.

---

## ✨ Features

### 👤 Guest Page
- Hold SOS button 2 seconds → Select emergency type → Alert sent to Firebase  
- Mini map shows your room + nearest exit highlighted  
- AI speaks evacuation instructions aloud  
- Floating 🤖 chat bubble for situational guidance  
- Haptic feedback (mobile)

---

### 👨‍💼 Staff Page
- Live SOS alert feed with real-time Firebase sync  
- Browser sound alarm + Desktop Notification on new alert  
- "Acknowledge" button → Guest sees "Help is coming"  
- "Mark Resolved" → Closes the alert  
- Crisis timeline + per-type stats  

---

### 🛠️ Admin Page
- Draw hotel floorplan on canvas  
- Zone editor (label, sqft, color/type)  
- Live alerts preview panel  
- Analytics bar chart (Fire/Medical/Intruder/Other counts)  
- Emergency broadcast to all guests  

---

## 🧠 System Flow

1. Admin registers property and digitizes floor plan  
2. Data is synced to Firebase in real time  
3. Guest triggers SOS using Neural Hold  
4. AI analyzes the situation and calculates safest route  
5. Guest receives voice + visual evacuation guidance  
6. Staff receives alerts and coordinates response  

---

## 🌐 Live Demo
Experience the live MVP here:
👉 https://guestguard-319c8.web.app/
*(Recommended: Use "Admin" to draw a room and "Guest" to trigger a simulated SOS).*

---

## 💻 GitHub Repository
Access the complete source code, including our Graph Theory implementation for pathfinding and Gemini AI integration.
👉 https://github.com/tejaswini132004/CrisisApp.git

---

## 💻 Project Deck
A concise presentation detailing our research methodology, technical architecture, and impact.
👉 https://github.com/tejaswini132004/CrisisApp.git](https://drive.google.com/file/d/1T5-6JdtG4o5vwUvdG4aeAA71zQU1qGH0/view?usp=sharing

---

## 🛠️ Tech Stack

- **Frontend:** React.js, Tailwind CSS, Vite  
- **Backend:** Firebase Realtime Database  
- **AI:** Google Gemini 1.5 Flash API  
- **Logic:** Graph Theory (Dijkstra’s Algorithm)  

---

## ▶️ Quick Start

```bash
npm install
npm run dev

## ▶️ Open in Browser
http://localhost:5173

---

## 🔐 Login Credentials
- **Guest Portal:** No login required  
- **Staff Login:** `0000`  
- **Admin Login:** `1234`  

---

## ⚙️ Admin Setup (First Time)

1. Login as Admin → Enter email, name, password  
2. Enter Hotel Name  
3. Enable **Architect Mode** → Draw rooms on canvas  

### 🎨 Color Code Zones
- 🔵 **Cyan** = Regular Room  
- 🟢 **Green** = Exit / Safe Zone  
- 🩷 **Pink** = Staircase  
- 🟡 **Yellow** = Hazard Zone  
- 🔴 **Red** = Fire Point  

4. Click **Deploy Sync** → Map goes live  

---

## 🔮 Future Roadmap
- In the future, we plan to extend this into a full crisis management system that can handle large-scale emergencies with better coordination and smarter response.
handle large-scale emergencies with better coordination and smarter response.
npm install
npm run dev
