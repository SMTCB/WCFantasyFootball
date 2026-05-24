import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';
import { SplashScreen } from '@capacitor/splash-screen';
import { App } from '@capacitor/app';
import { supabase } from './supabase';

export const isNative = Capacitor.isNativePlatform();
export const platform = Capacitor.getPlatform(); // 'ios' | 'android' | 'web'

/**
 * Call once on app boot. No-ops on web.
 */
export async function initNative() {
  if (!isNative) return;

  // Match app dark theme
  await StatusBar.setStyle({ style: Style.Dark });
  await StatusBar.setBackgroundColor({ color: '#080A0E' });

  // Hide splash after React has rendered
  await SplashScreen.hide();

  // Refresh Supabase session whenever app returns from background.
  App.addListener('appStateChange', ({ isActive }) => {
    if (isActive) supabase.auth.getSession();
  });

  // Android hardware back button: navigate back in history, or exit app at root.
  App.addListener('backButton', () => {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      App.exitApp();
    }
  });
}
