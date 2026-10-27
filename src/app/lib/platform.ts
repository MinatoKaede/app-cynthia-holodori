// 안드로이드 기능 (브라우저에서는 조용히 무시)
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { KeepAwake } from '@capacitor-community/keep-awake';

export const isNative = Capacitor.isNativePlatform();

/** 계산 중에는 화면이 꺼지지 않게 한다 (꺼지면 WebView가 멈춰 계산도 멈춘다) */
export async function keepScreenOn(on: boolean): Promise<void> {
  try {
    if (on) await KeepAwake.keepAwake();
    else await KeepAwake.allowSleep();
  } catch {
    // 지원하지 않는 환경
  }
}

/** 뒤로 가기 버튼. handler가 false를 돌려주면 앱을 내린다 (종료하지 않아 계산이 이어진다) */
export function onBackButton(handler: () => boolean): void {
  if (!isNative) return;
  void App.addListener('backButton', () => {
    if (!handler()) void App.minimizeApp();
  });
}
