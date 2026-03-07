/**
 * Plan 067 Phase 5: Question Popper — Desktop Notifications
 *
 * Utility for triggering desktop notifications via the Notifications API.
 * Also provides toast notifications via sonner.
 *
 * AC-15: Toast notification on new question/alert
 * AC-30: Desktop notification via Notifications API (if permission granted)
 *
 * Permission is requested lazily on first notification attempt.
 */

import { toast } from 'sonner';

/**
 * Request notification permission if not already granted/denied.
 * Safe to call multiple times — only prompts once per session.
 */
export async function requestNotificationPermission(): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;

  const result = await Notification.requestPermission();
  return result === 'granted';
}

/**
 * Send a desktop notification. Silently no-ops if permission not granted
 * or API not available.
 */
export function sendDesktopNotification(title: string, body: string): void {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;

  try {
    new Notification(title, {
      body,
      icon: '/favicon.ico',
      tag: 'question-popper',
    });
  } catch {
    // Silently ignore notification errors (e.g., service worker required on some platforms)
  }
}

/**
 * Show a toast notification for a new question.
 */
export function toastNewQuestion(source: string, text: string): void {
  const truncated = text.length > 80 ? `${text.slice(0, 77)}...` : text;
  toast(`❓ Question from ${source}: ${truncated}`, { duration: 5000 });
}

/**
 * Show a toast notification for a new alert.
 */
export function toastNewAlert(source: string, text: string): void {
  const truncated = text.length > 80 ? `${text.slice(0, 77)}...` : text;
  toast(`🔔 Alert from ${source}: ${truncated}`, { duration: 4000 });
}
