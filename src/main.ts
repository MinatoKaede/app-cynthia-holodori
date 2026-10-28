import '@fontsource/ibm-plex-sans-kr/400.css';
import '@fontsource/ibm-plex-sans-kr/500.css';
import '@fontsource/ibm-plex-sans-kr/600.css';
import '@fontsource/ibm-plex-sans-kr/700.css';
import './app/styles.css';
import { mount } from 'svelte';

// 개발용: ?now=2026-10-25T12:00:00Z 로 시계를 옮겨 이벤트 진행 중 화면을 확인한다 (빌드에는 들어가지 않음)
if (import.meta.env.DEV) {
  const fake = new URLSearchParams(location.search).get('now');
  if (fake && Number.isFinite(Date.parse(fake))) {
    const offset = Date.parse(fake) - Date.now();
    const realNow = Date.now;
    Date.now = () => realNow() + offset;
  }
}
import App from './app/App.svelte';

mount(App, { target: document.getElementById('app')! });
