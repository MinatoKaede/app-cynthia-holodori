// 화면 빌드 → Capacitor 동기화 → 디버그 APK 빌드 → out/에 복사
// 필요: JAVA_HOME(JDK 21), ANDROID_HOME(Android SDK)
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

// 인자는 모두 이 파일의 상수 (윈도우의 npx·gradlew.bat은 셸로만 실행된다)
const run = (cmd, args, cwd = '.') =>
  execSync([path.isAbsolute(cmd) ? `"${cmd}"` : cmd, ...args].join(' '), { cwd, stdio: 'inherit' });

for (const v of ['JAVA_HOME', 'ANDROID_HOME']) {
  if (!process.env[v]) throw new Error(`${v} 환경 변수가 없습니다.`);
}

run('npx', ['vite', 'build']);
run('npx', ['cap', 'sync', 'android']);
run(path.resolve('android', process.platform === 'win32' ? 'gradlew.bat' : 'gradlew'), ['assembleDebug'], 'android');

const built = 'android/app/build/outputs/apk/debug/app-debug.apk';
const version = JSON.parse(fs.readFileSync('package.json', 'utf8')).version ?? '0.0.0';
fs.mkdirSync('out', { recursive: true });
const dest = path.join('out', `holodori-${version}-debug.apk`);
fs.copyFileSync(built, dest);
console.log(`\nAPK: ${dest} (${(fs.statSync(dest).size / 1024 / 1024).toFixed(1)}MB)`);
