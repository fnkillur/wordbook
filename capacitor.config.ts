import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.teo.wordbook',
  appName: 'wordbook',
  webDir: 'dist',
  backgroundColor: '#f7f6f3',
  plugins: {
    CapacitorHttp: { enabled: true },
  },
}

export default config
