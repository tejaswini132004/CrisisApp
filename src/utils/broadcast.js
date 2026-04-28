// broadcastAlert.js — Call this when an alert is resolved or times out
// Writes a broadcast node to Firebase that Guest, Staff, and Admin all listen to

import { db, ref, set, push, serverTimestamp } from '../firebase';

/**
 * Send a broadcast message to all roles (guest, staff, admin)
 * @param {string} hotelCode - the hotel's code
 * @param {object} alert - the resolved alert object
 * @param {string} resolvedBy - staff name who resolved
 * @param {'resolved'|'timeout'} reason - why broadcast is sent
 */
export const broadcastAlertResolved = async (hotelCode, alert, resolvedBy, reason = 'resolved') => {
  const message = reason === 'resolved'
    ? `✅ Emergency in ${alert.roomLabel} has been resolved by ${resolvedBy}. The situation is under control.`
    : `⏱️ Emergency alert for ${alert.roomLabel} has been cleared after no further reports. Staff remain on standby.`;

  const broadcastRef = push(ref(db, `broadcasts/${hotelCode}`));
  await set(broadcastRef, {
    message,
    alertId: alert.id,
    alertType: alert.type,
    roomLabel: alert.roomLabel,
    resolvedBy,
    reason,
    timestamp: Date.now(),
    // Each role can mark as read — listeners filter by timestamp
    readBy: {}
  });
};

/**
 * Auto-broadcast after a set time if alert isn't resolved manually
 * Call this when an alert is created. Pass the cleanup fn to cancel if resolved early.
 * @param {string} hotelCode
 * @param {object} alert
 * @param {number} timeoutMs - default 10 minutes
 * @returns {function} cancel — call this if resolved before timeout
 */
export const scheduleAutoBroadcast = (hotelCode, alert, timeoutMs = 10 * 60 * 1000) => {
  const timer = setTimeout(() => {
    broadcastAlertResolved(hotelCode, alert, 'System', 'timeout');
  }, timeoutMs);

  return () => clearTimeout(timer); // return cancel fn
};