# ONE MORE FLOOR: SKY TOWER

끝없는 탑을 오르는 오프라인 3D 모바일 아케이드 게임입니다. 외부 라이브러리와 음원 파일 없이 WebGL2와 WebAudio만 사용하며, `www/` 폴더가 게임 전체입니다.

## 바로 실행 (PC)

```bash
powershell -ExecutionPolicy Bypass -File tools\serve.ps1
```

브라우저에서 `http://localhost:8790/www/`를 엽니다. 키보드는 A/D 또는 방향키로 이동, 스페이스로 점프, P로 일시 정지입니다.

## 휴대폰에서 바로 플레이 (PWA)

`www/` 폴더를 HTTPS 정적 호스팅에 올리고 휴대폰으로 접속한 뒤 "홈 화면에 추가"를 선택합니다. 한 번 접속하면 서비스 워커가 파일을 저장하므로 이후에는 인터넷 없이 실행됩니다.

## Android / iOS 앱 빌드

필요한 도구: Node.js LTS, Android Studio(Android), macOS와 Xcode(iOS).

```bash
npm install
```

```bash
npx cap add android
```

```bash
npx cap add ios
```

```bash
npx cap sync
```

```bash
npx cap open android
```

```bash
npx cap open ios
```

세로 화면으로 고정하려면 생성된 네이티브 프로젝트를 수정합니다.

- Android: `AndroidManifest.xml`의 `MainActivity`에 `android:screenOrientation="portrait"` 추가
- iOS: Xcode의 Deployment Info에서 Portrait만 체크

## 구조

| 파일 | 역할 |
| --- | --- |
| `www/js/data.js` | 물리 수치, 환경, 스킨 30종, 테마 10종, 층수 보상 |
| `www/js/sim.js` | 플레이어 물리, 절차적 발판 생성, 용암 (DOM/GL 비의존) |
| `www/js/gfx.js` | WebGL2 렌더러, 셰이더, 인스턴싱 |
| `www/js/scene.js` | 카메라, 캐릭터 리그, 배경, 파티클 풀 |
| `www/js/audio.js` | 합성 효과음과 배경 음악 |
| `www/js/save.js` | localStorage 저장 (백업 사본 포함) |
| `www/js/input.js` | 조이스틱, 점프, 한 손 모드, 키보드 |
| `www/js/ui.js`, `www/js/main.js` | 메뉴, HUD, 게임 흐름, 자동 품질 조절 |

## 테스트

서버 실행 후 `http://localhost:8790/tests/sim-test.html`을 열면 점프 도달성, 점프 높이, 봇 플레이 시간을 검사합니다.

URL에 `?mute`를 붙이면 소리 없이 실행되고, `?bot=0.8`은 봇이 소리 없이 자동 플레이합니다.
