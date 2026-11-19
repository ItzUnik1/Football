import type { CapacitorConfig } from '@capacitor/cli';
const config: CapacitorConfig = {
  appId: 'com.itzunik1.touchline',
  appName: 'Touchline',
  webDir: 'dist',
  backgroundColor: '#0b0f17',
  plugins: { SplashScreen: { launchShowDuration: 1200, backgroundColor: '#0b0f17', showSpinner: false } },
};
export default config;
