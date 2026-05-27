/**
 * razer-chroma.js
 * Razer Chroma REST API 연동 모듈
 * 악보 재생 중 현재 눌러야 할 키를 실시간으로 키보드 RGB 조명으로 표시합니다.
 *
 * 작동 요건:
 *   - Razer Synapse 3 가 백그라운드에서 실행 중이어야 합니다.
 *   - Synapse 설정 > Connect > Chroma Apps 가 활성화되어 있어야 합니다.
 */

// ──────────────────────────────────────────────
// Razer 6×22 키보드 그리드 좌표 테이블
// (Razer BlackWidow / Huntsman 계열 기준, 대부분의 풀사이즈 Razer 키보드와 호환)
// ──────────────────────────────────────────────
const GRID_ROWS = 6;
const GRID_COLS = 22;

// 각 문자(대문자/특수문자) → [row, col] 좌표 매핑
// Razer Chroma SDK 6×22 그리드 기준:
//   Row 0 = Esc / F1~F12 행
//   Row 1 = 숫자 행  (`  1  2 ... 0  -  =  BS)   → ` 은 col 1부터 시작
//   Row 2 = QWERTY 행 (Tab col 1, Q col 2부터 시작)
//   Row 3 = ASDF 행   (CapsLock col 1, A col 2부터 시작)
//   Row 4 = ZXCV 행   (LShift col 1, Z col 2부터 시작)
const KEY_GRID_POS = {
  // ── 숫자 행 (Row 1) ── ` 은 col 1, 1은 col 2, ...
  '`': [1, 1],
  '1': [1, 2], '2': [1, 3], '3': [1, 4], '4': [1, 5],
  '5': [1, 6], '6': [1, 7], '7': [1, 8], '8': [1, 9],
  '9': [1, 10], '0': [1, 11], '-': [1, 12], '=': [1, 13],

  // ── QWERTY 행 (Row 2) ── Tab이 col 1 차지 → Q는 col 2부터
  'Q': [2, 2], 'W': [2, 3], 'E': [2, 4], 'R': [2, 5],
  'T': [2, 6], 'Y': [2, 7], 'U': [2, 8], 'I': [2, 9],
  'O': [2, 10], 'P': [2, 11], '[': [2, 12], ']': [2, 13],

  // ── ASDF 행 (Row 3) ── CapsLock이 col 1 차지 → A는 col 2부터
  'A': [3, 2], 'S': [3, 3], 'D': [3, 4], 'F': [3, 5],
  'G': [3, 6], 'H': [3, 7], 'J': [3, 8], 'K': [3, 9],
  'L': [3, 10], ';': [3, 11], "'": [3, 12],

  // ── ZXCV 행 (Row 4) ── LShift이 col 1 차지 → Z는 col 2부터
  'Z': [4, 2], 'X': [4, 3], 'C': [4, 4], 'V': [4, 5],
  'B': [4, 6], 'N': [4, 7], 'M': [4, 8],
  ',': [4, 9], '.': [4, 10], '/': [4, 11],
};

// ──────────────────────────────────────────────
// 옥타브별 색상 (Razer BGR 32-bit integer format: 0x00BBGGRR)
// ──────────────────────────────────────────────
const COLORS = {
  off:    0x00000000,              // 꺼짐 (검정)
  dim:    0x00080808,              // 매핑된 키지만 현재 비활성 (매우 어두운 흰색)
  oct1:   0x00F8BD38,              // 파랑 #38bdf8  (저음)
  oct2:   0x0099D334,              // 초록 #34d399  (중음)
  oct3:   0x003C92FB,              // 주황 #fb923c  (고음)
  oct4:   0x00FC84C0,              // 보라 #c084fc  (최고음)
};

// 옥타브 번호 → 색상
const OCTAVE_COLORS = {
  1: COLORS.oct1,
  2: COLORS.oct2,
  3: COLORS.oct3,
  4: COLORS.oct4,
};

// ──────────────────────────────────────────────
// 내부 상태
// ──────────────────────────────────────────────
let sessionUri = null;
let heartbeatTimer = null;
let isConnected = false;
let onStatusChange = null; // (connected, message) 콜백

// Chroma 업데이트 중복 방지: 이전 전송 값을 캐싱
let lastSentKey = null;   // 마지막으로 전송한 activeMidiNotes 직렬화 키
let isShowingIdle = false; // 현재 아이들 레이아웃이 표시 중인지
let lastGrid = null;       // 마지막으로 전송한 그리드 (하트비트 재전송용)

// 앱 등록 정보 (Razer Chroma SDK에 앱 이름을 표시)
const APP_INFO = {
  title: '두근두근타운 악보 도우미',
  description: '인게임 피아노 악보에 맞춰 키보드 RGB 조명을 실시간 동기화합니다.',
  author: { name: 'DDTown Piano Helper', contact: 'localhost' },
  device_supported: ['keyboard'],
  category: 'application',
};

// ──────────────────────────────────────────────
// 공개 API
// ──────────────────────────────────────────────

// Chroma SDK 엔드포인트
// HTTP 먼저 시도 → 브라우저 Private Network Access 차단 시 HTTPS 폴백
const CHROMA_ENDPOINTS = [
  'http://localhost:54235/razer/chromasdk',
  'https://chromasdk.io:54236/razer/chromasdk',
];

/**
 * Razer Chroma SDK 세션을 초기화합니다.
 * HTTP → HTTPS 순서로 자동 폴백합니다.
 * @param {function} statusCallback (isConnected: boolean, message: string) => void
 */
export async function initChroma(statusCallback) {
  onStatusChange = statusCallback;

  let lastErr = null;
  for (const endpoint of CHROMA_ENDPOINTS) {
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(APP_INFO),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();
      if (!data.uri) throw new Error('세션 URI 없음');

      sessionUri = data.uri;
      isConnected = true;
      lastSentKey = null;
      isShowingIdle = false;

      // 1.5초마다 하트비트 전송 (세션 유지)
      heartbeatTimer = setInterval(sendHeartbeat, 1500);

      if (onStatusChange) onStatusChange(true, '✅ Razer Chroma 연결됨 — 매핑된 키가 발광합니다.');
      return;

    } catch (err) {
      lastErr = err;
      console.warn(`[Chroma] ${endpoint} 연결 실패:`, err.message);
    }
  }

  isConnected = false;
  if (onStatusChange) {
    onStatusChange(false, `⚠️ 연결 실패: Synapse가 실행 중이고 Chroma Apps가 활성화되어 있는지 확인하세요. (${lastErr?.message})`);
  }
}

/**
 * Chroma 세션을 종료하고 키보드 조명을 원래 상태로 복원합니다.
 */
export async function destroyChroma() {
  if (!sessionUri) return;

  clearInterval(heartbeatTimer);
  heartbeatTimer = null;

  try {
    // 조명을 꺼서 키보드를 Synapse 기본 프로필로 복원
    await applyGrid(buildBlankGrid());
    await fetch(sessionUri, { method: 'DELETE' });
  } catch (_) {}

  sessionUri = null;
  isConnected = false;
  lastSentKey = null;
  isShowingIdle = false;
  lastGrid = null;
  if (onStatusChange) onStatusChange(false, '— Razer Chroma 연결 해제됨');
}

/**
 * 현재 재생 중 활성화된 MIDI 노트들을 받아 키보드 조명을 업데이트합니다.
 * 이전 전송 값과 동일하면 HTTP 요청을 건너뜁니다 (60fps 폭탄 방지).
 * @param {Set<number>} activeMidiNotes  현재 재생 중인 MIDI 음표 번호 Set
 * @param {object} keyMap               KEY_MAP 객체 (keymap.js에서 import)
 */
export async function updateChromaLighting(activeMidiNotes, keyMap) {
  if (!isConnected || !sessionUri) return;

  // 변경이 없으면 전송 생략
  const key = [...activeMidiNotes].sort((a, b) => a - b).join(',');
  if (key === lastSentKey) return;
  lastSentKey = key;
  isShowingIdle = false;

  // 기본 레이아웃: 매핑된 키는 어두운 표시, 나머지는 꺼짐
  const grid = buildIdleGrid(keyMap);

  // 활성 노트에 해당하는 키를 옥타브 색상으로 점등
  for (const midiNote of activeMidiNotes) {
    const entry = keyMap[midiNote];
    if (!entry) continue;

    const pos = KEY_GRID_POS[entry.key.toUpperCase()] || KEY_GRID_POS[entry.key];
    if (!pos) continue;

    const [row, col] = pos;
    grid[row][col] = OCTAVE_COLORS[entry.octave] || COLORS.oct3;
  }

  await applyGrid(grid);
}

/**
 * 키보드를 정지 상태로 복원합니다 (매핑 키만 어둡게 표시).
 * 이미 아이들 상태면 재전송하지 않습니다.
 * @param {object} keyMap
 */
export async function showIdleLayout(keyMap) {
  if (!isConnected || !sessionUri) return;
  if (isShowingIdle) return;
  isShowingIdle = true;
  lastSentKey = null;
  const grid = buildIdleGrid(keyMap);
  await applyGrid(grid);
}

/**
 * 키보드 조명을 완전히 끕니다.
 */
export async function clearLighting() {
  if (!isConnected || !sessionUri) return;
  await applyGrid(buildBlankGrid());
}

/** Chroma SDK가 현재 연결되어 있는지 반환 */
export function isChromaConnected() {
  return isConnected;
}

// ──────────────────────────────────────────────
// 내부 헬퍼 함수
// ──────────────────────────────────────────────

/** 6×22 그리드를 모두 0(꺼짐)으로 초기화 */
function buildBlankGrid() {
  return Array.from({ length: GRID_ROWS }, () =>
    new Array(GRID_COLS).fill(COLORS.off)
  );
}

/**
 * 매핑된 키는 어두운 색, 나머지는 꺼짐인 그리드 생성
 * @param {object} keyMap
 */
function buildIdleGrid(keyMap) {
  const grid = buildBlankGrid();

  if (!keyMap) return grid;

  for (const entry of Object.values(keyMap)) {
    const pos = KEY_GRID_POS[entry.key.toUpperCase()] || KEY_GRID_POS[entry.key];
    if (!pos) continue;
    const [row, col] = pos;
    // 매핑된 키를 매우 어두운 옥타브 색상으로 "대기" 표시
    const dimColor = dimOctaveColor(OCTAVE_COLORS[entry.octave] || COLORS.dim);
    grid[row][col] = dimColor;
  }

  return grid;
}

/**
 * 색상을 약 10% 밝기로 어둡게 만듦 (대기 상태 표시용)
 * @param {number} color BGR 정수
 */
function dimOctaveColor(color) {
  const r = Math.floor((color & 0xFF) * 0.12);
  const g = Math.floor(((color >> 8) & 0xFF) * 0.12);
  const b = Math.floor(((color >> 16) & 0xFF) * 0.12);
  return (b << 16) | (g << 8) | r;
}

/**
 * 6×22 컬러 그리드를 Chroma SDK에 전송
 * @param {number[][]} grid
 */
async function applyGrid(grid) {
  if (!sessionUri) return;

  lastGrid = grid;

  try {
    await fetch(`${sessionUri}/keyboard`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        effect: 'CHROMA_CUSTOM',
        param: grid,
      }),
    });
  } catch (err) {
    // 연결 끊김 감지
    if (err.name === 'TypeError') {
      isConnected = false;
      clearInterval(heartbeatTimer);
      if (onStatusChange) onStatusChange(false, '⚠️ Razer Chroma 연결이 끊겼습니다. Synapse 상태를 확인하세요.');
    }
  }
}

/**
 * 하트비트 전송 + 마지막 조명 상태 재전송
 * Razer SDK는 주기적으로 재전송하지 않으면 Synapse 기본 프로필로 복귀하므로
 * 하트비트마다 lastGrid를 다시 PUT해서 앱의 조명 제어권을 유지합니다.
 */
async function sendHeartbeat() {
  if (!sessionUri) return;
  try {
    await fetch(`${sessionUri}/heartbeat`, { method: 'PUT' });
    // 조명 제어권 유지: 마지막 그리드 재전송
    if (lastGrid) {
      await fetch(`${sessionUri}/keyboard`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ effect: 'CHROMA_CUSTOM', param: lastGrid }),
      });
    }
  } catch (_) {
    isConnected = false;
    clearInterval(heartbeatTimer);
    if (onStatusChange) onStatusChange(false, '⚠️ Razer Chroma 세션이 만료되었습니다.');
  }
}
