import type { CapacitorConfig } from '@capacitor/cli';

// 앱 이름·패키지 ID는 배포 전에 확정 (SPEC 8. 미확정 사항)
const config: CapacitorConfig = {
  appId: 'io.github.minatokaede.holodori',
  appName: '홀로도리 덱 추천',
  webDir: 'dist',
  android: { backgroundColor: '#F6F4F8' },
};

export default config;
