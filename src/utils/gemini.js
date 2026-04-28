const API_KEY = import.meta.env.VITE_GEMINI_API_KEY || "AIzaSyCtFB_p26tK3CBwdi6Yf-xZwX9sRJK9iws";

async function callGemini(contents, temperature = 0.85) {
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents,
          systemInstruction: {
            parts: [{ text: `You are GuestGuard AI — a calm, experienced crisis responder embedded in a hotel emergency system.
You think like a trained first responder AND a compassionate human. You NEVER give generic advice.
You always respond specifically to what the person actually said.
You remember context from the conversation.
Never repeat yourself — each response must offer new, actionable information.
Keep responses under 3 sentences. No markdown. No bullet points.` }]
          },
          generationConfig: { temperature, maxOutputTokens: 250 }
        })
      }
    );
    const data = await res.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────
// AI DECISION ENGINE
// ─────────────────────────────────────────────────────────────
export const getAIDecision = async (message, hotelName, roomLabel) => {
  const contents = [{
    role: 'user',
    parts: [{ text: `You are an emergency classification engine for hotel "${hotelName || 'Hotel'}".
Guest in "${roomLabel || 'Unknown Room'}" reported: "${message}"

Respond ONLY as valid JSON, no markdown, no backticks:
{
  "type": "FIRE | MEDICAL | INTRUDER | OTHER",
  "severity": <number 1-10>,
  "priority": "LOW | MEDIUM | HIGH | CRITICAL",
  "actions": ["action 1 (max 8 words)", "action 2", "action 3"],
  "summary": "one sentence tactical summary for staff (max 20 words)"
}

Rules:
- severity 8-10 = life-threatening, immediate evacuation needed
- severity 5-7 = serious, rapid response needed  
- severity 1-4 = low risk, monitor and assist
- CRITICAL priority only for severity >= 8
- actions must be specific to the emergency type and location` }]
  }];

  try {
    const text = await callGemini(contents, 0.3);
    if (!text) throw new Error('no response');
    const clean = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);
    return {
      type: parsed.type || 'OTHER',
      severity: Math.min(10, Math.max(1, parseInt(parsed.severity) || 5)),
      priority: parsed.priority || 'MEDIUM',
      actions: Array.isArray(parsed.actions) ? parsed.actions.slice(0, 3) : ['Assess the situation immediately'],
      summary: parsed.summary || 'Emergency reported — assess immediately'
    };
  } catch {
    // Minimal fallback — still hits Gemini next time
    return { type: 'OTHER', severity: 5, priority: 'MEDIUM', actions: ['Assess the situation immediately'], summary: 'Emergency reported — assess immediately' };
  }
};

// ─────────────────────────────────────────────────────────────
// INITIAL AI GUIDANCE — fully dynamic, no fixed scripts
// ─────────────────────────────────────────────────────────────
export const getAIGuidance = async (hotelName, currentRoom, allZones, emergencyType = 'EMERGENCY') => {
  const exits = allZones.filter(z => z.color === '#10b981').map(z => z.label);
  const stairs = allZones.filter(z => z.color === '#ec4899').map(z => z.label);
  const contents = [{
    role: 'user',
    parts: [{ text: `Hotel: "${hotelName || 'Unknown Hotel'}". Emergency: ${emergencyType}. Guest is in: "${currentRoom?.label || 'Unknown Room'}". Nearest exits: ${exits.join(', ') || 'follow green exit signs'}. Staircases: ${stairs.join(', ') || 'use nearest staircase, never elevators'}.

Give 2 specific, urgent, actionable sentences for THIS guest in THIS location for THIS emergency type. Be direct and human. Do NOT use any scripted phrases — respond as if this is a real live emergency happening right now.` }]
  }];

  const reply = await callGemini(contents, 0.85);
  if (reply) return reply;

  // Only if Gemini is completely unreachable — bare minimum
  return `Move away from the source of danger now and head toward the nearest exit. Call for help immediately if you haven't already.`;
};

// ─────────────────────────────────────────────────────────────
// CONVERSATIONAL CHAT — dynamic, never repeats
// ─────────────────────────────────────────────────────────────
export const getChatReply = async (hotelName, currentRoom, allZones, userMessage, history = [], emergencyType = null) => {
  const exits = allZones.filter(z => z.color === '#10b981').map(z => z.label);

  const systemPrefix = [{
    role: 'user',
    parts: [{ text: `[CONTEXT] Hotel: "${hotelName || 'Hotel'}". ${emergencyType ? `Active emergency: ${emergencyType}.` : 'No active emergency.'} Guest room: "${currentRoom?.label || 'Unknown'}". Exits: ${exits.join(', ') || 'follow floor signs'}. You are helping this specific guest right now. Read the full conversation before responding. Never repeat advice already given. React naturally to exactly what the guest just said.` }]
  }, {
    role: 'model',
    parts: [{ text: 'Understood. I am ready to help this specific guest.' }]
  }];

  const conversationHistory = history.map(m => ({
    role: m.role === 'user' ? 'user' : 'model',
    parts: [{ text: m.text }]
  }));

  const contents = [
    ...systemPrefix,
    ...conversationHistory,
    { role: 'user', parts: [{ text: userMessage }] }
  ];

  const reply = await callGemini(contents, 0.9);
  if (reply) return reply;
  return 'Stay calm and move toward the nearest exit. I am here — tell me exactly what you see right now.';
};

// ─────────────────────────────────────────────────────────────
// STAFF AI COMMAND — dynamic, tactical
// ─────────────────────────────────────────────────────────────
export const getAIStaffCommand = async (alert, zones, staffName, staffPos) => {
  const roomZone = zones.find(z => z.label === alert.roomLabel);
  const exits = zones.filter(z => z.color === '#10b981').map(z => z.label);
  const stairs = zones.filter(z => z.color === '#ec4899').map(z => z.label);

  let distanceInfo = '';
  if (staffPos && roomZone) {
    const dx = (roomZone.x + roomZone.w / 2) - staffPos.x;
    const dy = (roomZone.y + roomZone.h / 2) - staffPos.y;
    const dist = Math.round(Math.hypot(dx, dy) / 10);
    distanceInfo = `Approx ${dist}m from you.`;
  }

  const contents = [{
    role: 'user',
    parts: [{ text: `You are a tactical emergency coordinator. Give a specific command to staff member ${staffName}.

Emergency: ${alert.type}
Severity: ${alert.severity || 'Unknown'}/10
Location: "${alert.roomLabel || 'Unknown'}" in "${alert.hotelName || 'Hotel'}"
${distanceInfo}
Available exits: ${exits.join(', ') || 'unknown'}
Staircases: ${stairs.join(', ') || 'unknown'}
Time elapsed since alert: ${Math.round((Date.now() - parseInt(alert.id)) / 1000)}s

Respond ONLY as valid JSON, no markdown, no backticks:
{"command": "direct imperative for ${staffName} — specific to this emergency type and location (max 18 words)", "reason": "tactical reasoning — why this specific action matters right now (max 25 words)"}` }]
  }];

  try {
    const text = await callGemini(contents, 0.7);
    if (!text) throw new Error('no response');
    const clean = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);
    return {
      command: parsed.command || `${staffName}, respond to ${alert.roomLabel} immediately.`,
      reason: parsed.reason || 'Immediate response required.'
    };
  } catch {
    return {
      command: `${staffName}, respond to ${alert.roomLabel} immediately for ${alert.type} emergency.`,
      reason: 'Immediate on-site assessment required.'
    };
  }
};