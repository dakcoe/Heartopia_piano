# 두근두근타운 악보 도우미 — Implementation Plan

## 프로젝트 개요

두근두근타운 인게임 피아노 연주를 위해 MIDI 파일을 업로드하면,
게임 키보드 매핑으로 변환해 시각적으로 표시하고 소리를 재생해주는 웹 서비스.
실제 QWERTY 키보드와 인게임 키보드를 나란히 보면서 연습 가능.

- **배포**: GCP VM (포트 오픈, Nginx static serve)
- **아키텍처**: 순수 프론트엔드 (백엔드 없음, 모든 처리 브라우저 내 완결)
- **핵심 라이브러리**: `@tonejs/midi`, Web Audio API

---

## 두근두근타운 키보드 매핑 (확정)

### 전체 매핑 테이블

| 옥타브 | 도  | 도# | 레  | 레# | 미  | 파  | 파# | 솔  | 솔# | 라  | 라# | 시  |
|--------|-----|-----|-----|-----|-----|-----|-----|-----|-----|-----|-----|-----|
| 4 (최고) | I   | 이후 없음   |
| 3 (고) | Q   | 2   | W   | 3   | E   | R   | 5   | T   | 6   | Y   | 7   | U   |
| 2 (중) | Z   | S   | X   | D   | C   | V   | G   | B   | H   | N   | J   | M   |
| 1 (저) | ,   | L   | .   | ;   | /   | O   | 0   | P   | -   | [   | =   | ]   |

+

### KEY_MAP 상수 (keymap.js)

```javascript
// MIDI note number → 게임 키 매핑
// 옥타브 1(저음) = MIDI 48~59 (C3~B3)
// 옥타브 2(중음) = MIDI 60~71 (C4~B4)
// 옥타브 3(고음) = MIDI 72~83 (C5~B5)

export const KEY_MAP = {
  // ── 옥타브 1 (저음) ──────────────────────────
  48: { key: ',', label: '도',  octave: 1, sharp: false },
  49: { key: 'L', label: '도#', octave: 1, sharp: true  },
  50: { key: '.', label: '레',  octave: 1, sharp: false },
  51: { key: ';', label: '레#', octave: 1, sharp: true  },
  52: { key: '/', label: '미',  octave: 1, sharp: false },
  53: { key: 'O', label: '파',  octave: 1, sharp: false },
  54: { key: '0', label: '파#', octave: 1, sharp: true  },
  55: { key: 'P', label: '솔',  octave: 1, sharp: false },
  56: { key: '-', label: '솔#', octave: 1, sharp: true  },
  57: { key: '[', label: '라',  octave: 1, sharp: false },
  58: { key: '=', label: '라#', octave: 1, sharp: true  },
  59: { key: ']', label: '시',  octave: 1, sharp: false },
  // ── 옥타브 2 (중음) ──────────────────────────
  60: { key: 'Z', label: '도',  octave: 2, sharp: false },
  61: { key: 'S', label: '도#', octave: 2, sharp: true  },
  62: { key: 'X', label: '레',  octave: 2, sharp: false },
  63: { key: 'D', label: '레#', octave: 2, sharp: true  },
  64: { key: 'C', label: '미',  octave: 2, sharp: false },
  65: { key: 'V', label: '파',  octave: 2, sharp: false },
  66: { key: 'G', label: '파#', octave: 2, sharp: true  },
  67: { key: 'B', label: '솔',  octave: 2, sharp: false },
  68: { key: 'H', label: '솔#', octave: 2, sharp: true  },
  69: { key: 'N', label: '라',  octave: 2, sharp: false },
  70: { key: 'J', label: '라#', octave: 2, sharp: true  },
  71: { key: 'M', label: '시',  octave: 2, sharp: false },
  // ── 옥타브 3 (고음) ──────────────────────────
  72: { key: 'Q', label: '도',  octave: 3, sharp: false },
  73: { key: '2', label: '도#', octave: 3, sharp: true  },
  74: { key: 'W', label: '레',  octave: 3, sharp: false },
  75: { key: '3', label: '레#', octave: 3, sharp: true  },
  76: { key: 'E', label: '미',  octave: 3, sharp: false },
  77: { key: 'R', label: '파',  octave: 3, sharp: false },
  78: { key: '5', label: '파#', octave: 3, sharp: true  },
  79: { key: 'T', label: '솔',  octave: 3, sharp: false },
  80: { key: '6', label: '솔#', octave: 3, sharp: true  },
  81: { key: 'Y', label: '라',  octave: 3, sharp: false },
  82: { key: '7', label: '라#', octave: 3, sharp: true  },
  83: { key: 'U', label: '시',  octave: 3, sharp: false },
  // ── 옥타브 4 (하나만 있음) ──────────────────────────
  84: { key: 'I', label: '도',  octave: 4, sharp: false },
};

// MIDI 번호 → 주파수
export const midiToFreq = midi => 440 * Math.pow(2, (midi - 69) / 12);

// 범위 밖 음표 처리: 가장 가까운 옥타브로 시프트 후 재매핑
export function resolveKey(midiNote) {
  if (KEY_MAP[midiNote]) return { ...KEY_MAP[midiNote], outOfRange: false };
  // 옥타브 시프트 시도 (±12)
  for (const offset of [-12, 12, -24, 24]) {
    if (KEY_MAP[midiNote + offset]) {
      return { ...KEY_MAP[midiNote + offset], outOfRange: true, shifted: offset };
    }
  }
  return null; // 완전 범위 밖
}
```

---

## 핵심 기능 명세

### 1. MIDI 파일 파싱

```javascript
import { Midi } from '@tonejs/midi';

async function parseMidi(file) {
  const arrayBuffer = await file.arrayBuffer();
  const midi = new Midi(arrayBuffer);

  return {
    bpm: midi.header.tempos[0]?.bpm ?? 120,
    tracks: midi.tracks.map((track, i) => ({
      id: i,
      name: track.name || `트랙 ${i + 1}`,
      noteCount: track.notes.length,
      notes: track.notes.map(note => ({
        midi:     note.midi,
        time:     note.time,      // 초
        duration: note.duration,  // 초
        velocity: note.velocity,  // 0~1
      })),
    })),
  };
}
```

### 2. 이중 키보드 표시 (핵심 신규 기능)

재생 중 두 개의 키보드를 나란히 표시:

```
┌─────────────────────┐  ┌──────────────────────┐
│  실제 QWERTY 키보드  │  │  인게임 키보드 레이아웃 │
│                     │  │                       │
│  [Q][W][E][R][T]... │  │  [도][레][미][파][솔]  │
│  (현재 키 하이라이트) │  │  (현재 음 하이라이트)  │
└─────────────────────┘  └──────────────────────┘
```

#### 실제 QWERTY 키보드 렌더링

표준 키보드 레이아웃을 SVG 또는 CSS Grid로 렌더링.
재생 중 눌러야 할 키를 실시간으로 강조 표시.

```javascript
// QWERTY 키보드 레이아웃 정의
const QWERTY_ROWS = [
  ['`','1','2','3','4','5','6','7','8','9','0','-','='],
  ['Q','W','E','R','T','Y','U','I','O','P','[',']'],
  ['A','S','D','F','G','H','J','K','L',';',"'"],
  ['Z','X','C','V','B','N','M',',','.','/',],
];

// 게임에서 사용되는 키 목록 (비활성 키는 흐리게 표시)
const GAME_KEYS = new Set(Object.values(KEY_MAP).map(v => v.key));

function renderQwertyKeyboard(activeKeys = new Set()) {
  // activeKeys: 현재 재생 중 눌러야 할 키 집합
  // GAME_KEYS에 포함된 키: 불투명 표시
  // activeKeys에 포함된 키: 강조 색상 표시
  // 나머지 키: 흐리게(opacity 0.3) 표시
}
```

#### 인게임 키보드 레이아웃 렌더링

두근두근타운 게임 내 키보드 모양 재현:

```javascript
// 인게임 키보드 구조 (3행 × 13열, 흰/검 건반 구분)
const INGAME_LAYOUT = [
  // [label, key, isSharp, octave]
  // 옥타브 3 행 (위)
  ['도', 'Q', false, 3], ['도#','2', true, 3], ['레','W', false, 3],
  ['레#','3', true, 3],  ['미', 'E', false, 3], ['파','R', false, 3],
  ['파#','5', true, 3],  ['솔', 'T', false, 3], ['솔#','6', true, 3],
  ['라', 'Y', false, 3], ['라#','7', true, 3],  ['시', 'U', false, 3],
  // 옥타브 2 행 (중간)
  ['도', 'Z', false, 2], ['도#','S', true, 2], ['레','X', false, 2],
  // ... 동일 패턴
  // 옥타브 1 행 (아래)
  ['도', ',', false, 1], ...
];
```

각 건반 렌더링 스타일:
- 흰 건반 (sharp: false): 흰 배경, 검은 테두리
- 검은 건반 (sharp: true): 진한 회색/검정 배경
- 활성 건반: 노란색/초록색 하이라이트
- 옥타브별 색상 구분 (배지): 1=파랑, 2=초록, 3=주황

### 3. 악보 뷰어 (시퀀스 표시)

```
[Q] [2] [W] [E] [R] [T]  ← 키 이름
 도  도#  레   미   파  솔   ← 음 이름
 3   3   3   3   3   3    ← 옥타브
```

- 흰 건반 노트: 흰 박스, 검은 글씨
- 검은 건반 노트(#): 어두운 박스, 흰 글씨
- 현재 재생 위치 하이라이트: 노란 테두리 + 배경
- 가로 스크롤, 재생 중 현재 위치 자동 스크롤
- 범위 밖 음표: `[?]` 표시 + 툴팁으로 원래 음 안내

### 4. 소리 재생

**방식 A — Tone.js Salamander 피아노 샘플 (권장)**
```javascript
import * as Tone from 'tone';

const sampler = new Tone.Sampler({
  urls: {
    C4: "C4.mp3", "D#4": "Ds4.mp3", "F#4": "Fs4.mp3",
    A4: "A4.mp3", C5: "C5.mp3",
  },
  baseUrl: "https://tonejs.github.io/audio/salamander/",
}).toDestination();

async function playNote(midiNote, time, duration) {
  const noteName = Tone.Frequency(midiNote, "midi").toNote();
  sampler.triggerAttackRelease(noteName, duration, time);
}
```

**방식 B — OscillatorNode 합성 (폴백, 샘플 로딩 실패 시)**
```javascript
function playTone(midiNote, startTime, duration) {
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.frequency.value = midiToFreq(midiNote);
  osc.type = 'triangle';
  gain.gain.setValueAtTime(0.4, startTime);
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
  osc.start(startTime);
  osc.stop(startTime + duration);
}
```

### 5. 재생 컨트롤

| 컨트롤 | 구현 |
|--------|------|
| 재생 / 일시정지 | `Tone.Transport.start()` / `.pause()` |
| 정지 | `Tone.Transport.stop()` + 위치 초기화 |
| 속도 (0.5x~1.5x) | `Tone.Transport.bpm.value = baseBpm * speed` |
| 진행 바 | `requestAnimationFrame` + `Tone.Transport.seconds` |
| 현재 키 하이라이트 | 재생 시간 기준 active note 계산 → 두 키보드 동시 업데이트 |

---

## UI 레이아웃 (전체)

```
┌──────────────────────────────────────────────────────┐
│  🎹 두근두근타운 악보 도우미                            │
├──────────────────────────────────────────────────────┤
│  [ MIDI 파일 선택 ]  song.mid    트랙: [트랙1 멜로디▼] │
├──────────────────────────────────────────────────────┤
│  악보 뷰어 (가로 스크롤)                               │
│  [Q] [W] [E] [R] [T] [W] [Q] ...                     │
│   도   레   미   파   솔   레   도                     │
├─────────────────────┬────────────────────────────────┤
│  실제 QWERTY 키보드  │  인게임 키보드                   │
│  ┌──┬──┬──┬──┐     │  ┌──┬─┬──┬─┬──┬──┬─┐           │
│  │Q*│W │E │R │ ... │  │도*│#│레│#│미│파│#│...        │
│  └──┴──┴──┴──┘     │  └──┴─┴──┴─┴──┴──┴─┘           │
│  (* = 현재 눌러야 할 키 강조)                           │
├──────────────────────────────────────────────────────┤
│  ▶ 재생  ⏸ 일시정지  ⏹ 정지                          │
│  속도: [──●──────] 0.8x                              │
│  진행: [████░░░░░░░] 0:24 / 1:32                     │
└──────────────────────────────────────────────────────┘
```

---

## 디렉토리 구조

```
project/
├── index.html        # 메인 HTML
├── style.css         # 전체 스타일
├── app.js            # 진입점, 이벤트 바인딩
├── keymap.js         # KEY_MAP 상수, resolveKey(), midiToFreq()
├── parser.js         # MIDI 파싱 (@tonejs/midi 래핑)
├── player.js         # Tone.js 재생 로직
├── keyboard-qwerty.js  # QWERTY 키보드 UI 컴포넌트
├── keyboard-ingame.js  # 인게임 키보드 UI 컴포넌트
├── sheet-view.js     # 악보 뷰어 컴포넌트
├── package.json
└── nginx.conf
```

---

## 구현 순서

### Phase 1 — 파싱 + 악보 뷰어 (1주차 전반)
1. `index.html` 기본 구조 + 파일 업로드
2. `parser.js`: MIDI 파싱 → 노트 배열 추출
3. `keymap.js`: KEY_MAP 상수 + `resolveKey()` 구현
4. `sheet-view.js`: 노트 배열 → 키 박스 렌더링

### Phase 2 — 재생 (1주차 후반)
5. `player.js`: Tone.js Sampler 연동 + 재생/정지
6. 재생 중 악보 뷰어 하이라이트 동기화
7. 속도 조절 슬라이더, 진행 바

### Phase 3 — 이중 키보드 (2주차 전반)
8. `keyboard-qwerty.js`: QWERTY 키보드 레이아웃 렌더링
9. `keyboard-ingame.js`: 인게임 키보드 레이아웃 렌더링
10. 두 키보드를 재생 상태와 동기화 (activeKeys 공유)

### Phase 4 — 마무리 (2주차 후반)
11. 트랙 선택 드롭다운
12. 범위 밖 음표 처리 + 경고 UI
13. 반응형 레이아웃, GCP 배포

---

## 배포 (GCP)

### Nginx 설정

```nginx
server {
    listen 80;
    root /var/www/ddtown-piano;
    index index.html;

    location / {
        try_files $uri $uri/ =404;
    }

    location ~* \.(js|css|mp3|mid)$ {
        expires 7d;
        add_header Cache-Control "public";
    }
}
```

### 배포 명령어

```bash
sudo apt update && sudo apt install -y nginx nodejs npm
cd /var/www && sudo git clone <repo> ddtown-piano
cd ddtown-piano && sudo npm install && sudo npm run build
sudo cp nginx.conf /etc/nginx/sites-available/ddtown-piano
sudo ln -s /etc/nginx/sites-available/ddtown-piano /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
# GCP Console: VPC 방화벽 규칙 → TCP 80 허용
```

---

## 엣지 케이스 처리

| 케이스 | 처리 |
|--------|------|
| 범위 밖 음표 | `resolveKey()`로 인접 옥타브 매핑 시도, 실패 시 `[?]` 표시 |
| MIDI에 BPM 없음 | 기본값 120 BPM |
| 트랙이 1개 | 트랙 선택 UI 숨김 |
| 모바일 AudioContext 제한 | 첫 사용자 클릭 이벤트 후 `AudioContext` 초기화 |
| 긴 곡 악보 뷰어 | 가로 스크롤 + 재생 중 현재 위치로 자동 스크롤 |
| 동시에 여러 음 (화음) | 모두 하이라이트, 악보 뷰어에 세로로 겹쳐 표시 |

---

## 의존성

```json
{
  "dependencies": {
    "@tonejs/midi": "^2.0.28",
    "tone": "^14.7.77"
  }
}
```
