import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'game.keyo.app',
  appName: 'Keyo Game',
  webDir: 'dist',
  android: {
    // Landscape is enforced in AndroidManifest by the CI build (see .github/workflows/android.yml).
    backgroundColor: '#05040b',
  },
};

export default config;
