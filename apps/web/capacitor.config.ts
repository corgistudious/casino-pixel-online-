import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'online.casinopixel.app',
  appName: 'Casino Pixel Online',
  webDir: 'dist',
  android: {
    // Landscape is enforced in AndroidManifest by the CI build (see .github/workflows/android.yml).
    backgroundColor: '#05040b',
  },
};

export default config;
