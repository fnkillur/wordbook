import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.teo.wordbook',
  appName: '제초검정시험',
  webDir: 'dist',
  backgroundColor: '#f1eee8',
  plugins: {
    CapacitorHttp: { enabled: true },
  },
}

export default config
