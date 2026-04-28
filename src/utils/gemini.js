const API_KEY = "AIzaSyCtFB_p26tK3CBwdi6Yf-xZwX9sRJK9iws";

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
Keep responses under 3 sentences. No markdown. No bullet points. No repeating the same lines.` }]
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

// Initial AI guidance when SOS is triggered
export const getAIGuidance = async (hotelName, currentRoom, allZones, emergencyType = 'EMERGENCY') => {
  const exits = allZones.filter(z => z.color === '#10b981').map(z => z.label);
  const stairs = allZones.filter(z => z.color === '#ec4899').map(z => z.label);
  const contents = [{
    role: 'user',
    parts: [{ text: `Hotel: "${hotelName || 'Unknown Hotel'}". Emergency: ${emergencyType}. Guest is in: "${currentRoom?.label || 'Unknown Room'}". Nearest exits: ${exits.join(', ') || 'follow green exit signs'}. Staircases: ${stairs.join(', ') || 'use nearest staircase, never elevators'}.

Give 2 specific, urgent, actionable sentences for THIS emergency type. For FIRE: talk about smoke, crawling, not using lifts. For MEDICAL: staying still, not moving the person. For INTRUDER: hiding, silence, locking door. Be direct. Start with the most critical action right now.` }]
  }];
  return await callGemini(contents, 0.7)
    || (emergencyType === 'FIRE' ? 'Stay low, cover your nose with cloth, and crawl towards the nearest exit — do not use elevators. Alert others by knocking on doors as you pass.'
      : emergencyType === 'MEDICAL' ? 'Do not move the person unless there is immediate danger. Call front desk now and keep the person calm and still until help arrives.'
      : emergencyType === 'INTRUDER' ? 'Lock your door immediately and move away from it. Stay silent and do not open until you hear hotel staff announce their name.'
      : 'Move to the nearest exit immediately and follow the green floor markers. Stay together with others and do not use elevators.');
};

// Conversational chat — context-aware, never repeats
export const getChatReply = async (hotelName, currentRoom, allZones, userMessage, history = [], emergencyType = null) => {
  const exits = allZones.filter(z => z.color === '#10b981').map(z => z.label);

  // Build proper multi-turn conversation
  const systemPrefix = [{
    role: 'user',
    parts: [{ text: `[CONTEXT] Hotel: "${hotelName || 'Hotel'}". ${emergencyType ? `Active emergency: ${emergencyType}.` : 'No active emergency.'} Guest room: "${currentRoom?.label || 'Unknown'}". Exits: ${exits.join(', ') || 'follow floor signs'}. You are helping this specific guest. Read the full conversation before responding. Never repeat advice you already gave.` }]
  }, {
    role: 'model',
    parts: [{ text: 'Understood. I am ready to help this specific guest with context-aware guidance.' }]
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

  return await callGemini(contents, 0.9)
    || 'I hear you — stay calm. Move away from the source of danger and head towards the nearest illuminated exit sign. I am here with you.';
};

// Staff AI command — dynamic, tactical, named
export const getAIStaffCommand = async (alert, zones, staffName, staffPos) => {
  const roomZone = zones.find(z => z.label === alert.roomLabel);
  const exits = zones.filter(z => z.color === '#10b981').map(z => z.label);
  const stairs = zones.filter(z => z.color === '#ec4899').map(z => z.label);

  // Calculate approximate distance if positions known
  let distanceInfo = '';
  if (staffPos && roomZone) {
    const dx = (roomZone.x + roomZone.w / 2) - staffPos.x;
    const dy = (roomZone.y + roomZone.h / 2) - staffPos.y;
    const dist = Math.round(Math.hypot(dx, dy) / 10); // rough meters
    distanceInfo = `Approx ${dist}m from you.`;
  }

  const contents = [{
    role: 'user',
    parts: [{ text: `You are a tactical emergency coordinator. Give a specific command to staff member ${staffName}.

Emergency: ${alert.type}
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
      command: parsed.command || fallbackCommand(alert.type, staffName),
      reason: parsed.reason || fallbackReason(alert.type)
    };
  } catch {
    return { command: fallbackCommand(alert.type, staffName), reason: fallbackReason(alert.type) };
  }
};

function fallbackCommand(type, name) {
  const cmds = {
    FIRE: `${name}, evacuate the floor now — guide guests to the stairwell, do not use lifts.`,
    MEDICAL: `${name}, grab the first aid kit and reach the room immediately — call ambulance on the way.`,
    INTRUDER: `${name}, do NOT go alone — radio backup first, then secure the floor exits.`,
    OTHER: `${name}, proceed to the reported location and assess the situation immediately.`
  };
  return cmds[type] || cmds.OTHER;
}

function fallbackReason(type) {
  const reasons = {
    FIRE: 'Every 30 seconds of delay doubles evacuation risk on affected floor.',
    MEDICAL: 'First 4 minutes are critical — on-site response before EMS arrival saves lives.',
    INTRUDER: 'Solo confrontation increases staff risk — backup ensures controlled response.',
    OTHER: 'Unverified emergency needs immediate eyes-on assessment before escalation.'
  };
  return reasons[type] || reasons.OTHER;
}
