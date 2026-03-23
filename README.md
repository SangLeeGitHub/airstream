# AirStream

[English](README.en.md)

Windows PC의 시스템 오디오를 WiFi를 통해 iPhone/iPad/Android 등의 브라우저로 스트리밍합니다.
AirPods 등 Bluetooth 오디오 장치에서 재생 가능합니다.
Safari, Chrome 등 주요 브라우저를 지원합니다.

```
Windows PC                          iPhone/iPad/Android
[시스템 오디오] → [WASAPI Loopback]     Safari / Chrome 등
       → [MP3 인코딩] → HTTP ────→  <audio> 태그 재생
                                      → AirPods / Bluetooth
```

## 특징

- 앱 설치 불필요 (Safari, Chrome 등 브라우저만 사용)
- WASAPI Loopback 캡처 (PC 음소거 상태에서도 동작)
- MP3 128kbps 실시간 스트리밍
- iOS 백그라운드/잠금화면 재생 지원
- QR 코드로 간편 접속
- 다중 클라이언트 동시 접속

## 사전 요구사항

- **Windows 10/11**
- **Node.js 18+** - https://nodejs.org
- **FFmpeg** - https://ffmpeg.org (PATH에 추가 필요)

FFmpeg 설치 확인:
```bash
ffmpeg -version
```

## 설치 및 실행

```bash
git clone https://github.com/SangLeeGitHub/airstream.git
cd airstream
npm install
npm start
```

서버가 시작되면 터미널에 접속 URL과 QR 코드가 표시됩니다.
iPhone Safari에서 해당 URL에 접속하고 "시작" 버튼을 탭하면 오디오가 재생됩니다.

## 포터블 빌드 (Node.js 설치 불필요)

```bash
npm install
npm run build
```

`dist/` 폴더에 다음 파일이 생성됩니다:

```
dist/
├── airstream.exe        # 서버 실행 파일
├── wasapi-capture.exe   # 오디오 캡처 (자동 포함)
├── ffmpeg.exe           # 별도 복사 필요
└── client/
    └── index.html       # 웹 클라이언트 (별도 복사 필요)
```

빌드 후 추가 작업:
```bash
# client 폴더 복사
cp -r client dist/

# ffmpeg.exe 복사 (ffmpeg이 PATH에 있는 경우)
cp $(which ffmpeg) dist/
```

`dist/` 폴더를 통째로 다른 PC에 복사하고 `airstream.exe`를 실행하면 됩니다.

## 사용법

1. PC에서 `npm start` 또는 `airstream.exe` 실행
2. iPhone과 PC가 같은 WiFi에 연결되어 있는지 확인
3. iPhone Safari에서 터미널에 표시된 URL 접속 (또는 QR 스캔)
4. "시작" 버튼 탭
5. PC에서 음악/영상 재생 → iPhone에서 소리 출력

## 환경 변수

| 변수 | 기본값 | 설명 |
|------|--------|------|
| `PORT` | `3000` | 서버 포트 번호 |

## 알려진 제한사항

- 오디오 지연이 약 3~5초 발생합니다 (iOS `<audio>` 태그 내부 버퍼링)
- 유튜브 등 웹 비디오 재생 시 영상과 오디오 싱크가 맞지 않습니다
- 동일 WiFi LAN 내에서만 동작합니다

## 라이선스

MIT
