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
const KEY_GRID_POS = {
  // ── 숫자 행 (Row 0) ──
  '`': [0, 1],
  '1': [0, 2], '2': [0, 3], '3': [0, 4], '4': [0, 5],
  '5': [0, 6], '6': [0, 7], '7': [0, 8], '8': [0, 9],
  '9': [0, 10], '0': [0, 11], '-': [0, 12], '=': [0, 13],

  // ── QWERTY 행 (Row 1) ──
  'Q': [1, 1], 'W': [1, 2], 'E': [1, 3], 'R': [1, 4],
  'T': [1, 5], 'Y': [1, 6], 'U': [1, 7], 'I': [1, 8],
  'O': [1, 9], 'P': [1, 10], '[': [1, 11], ']': [1, 12],

  // ── ASDF 행 (Row 2) ──
  'A': [2, 1], 'S': [2, 2], 'D': [2, 3], 'F': [2, 4],
  'G': [2, 5], 'H': [2, 6], 'J': [2, 7], 'K': [2, 8],
  'L': [2, 9], ';': [2, 10], "'": [2, 11],

  // ── ZXCV 행 (Row 3) ──
  'Z': [3, 1], 'X': [3, 2], 'C': [3, 3], 'V': [3, 4],
  'B': [3, 5], 'N': [3, 6], 'M': [3, 7],
  ',': [3, 8], '.': [3, 9], '/': [3, 10],
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

/**
 * Razer Chroma SDK 세션을 초기화합니다.
 * @param {function} statusCallback (isConnected: boolean, message: string) => void
 */
export async function initChroma(statusCallback) {
  onStatusChange = statusCallback;
  
  try {
    const res = await fetch('http://localhost:54235/razer/chromasdk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(APP_INFO),
    });

    if (!res.ok) {
      throw new Error(`Chroma SDK 초기화 실패: HTTP ${res.status}`);
    }

    const data = await res.json();
    
    if (!data.uri) {
      throw new Error('Chroma SDK에서 세션 URI를 반환하지 않았습니다.');
    }

    sessionUri = data.uri;
    isConnected = true;

    // 1.5초마다 하트비트 전송 (세션 유지)
    heartbeatTimer = setInterval(sendHeartbeat, 1500);

    // 매핑된 키 전체를 어두운 색상으로 초기화 (매핑 영역 표시)
    await showIdleLayout();

    if (onStatusChange) onStatusChange(true, '✅ Razer Chroma 연결됨 — 매핑된 키가 발광합니다.');

  } catch (err) {
    isConnected = false;
    console.warn('[Chroma] 연결 실패:', err.message);
    if (onStatusChange) {
      onStatusChange(false, `⚠️ Razer Chroma 연결 실패: Synapse가 실행 중인지 확인하세요. (${err.message})`);
    }
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
  if (onStatusChange) onStatusChange(false, '— Razer Chroma 연결 해제됨');
}

/**
 * 현재 재생 중 활성화된 MIDI 노트들을 받아 키보드 조명을 업데이트합니다.
 * @param {Set<number>} activeMidiNotes  현재 재생 중인 MIDI 음표 번호 Set
 * @param {object} keyMap               KEY_MAP 객체 (keymap.js에서 import)
 */
export async function updateChromaLighting(activeMidiNotes, keyMap) {
  if (!isConnected || !sessionUri) return;

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
 * @param {object} keyMap
 */
export async function showIdleLayout(keyMap) {
  if (!isConnected || !sessionUri) return;
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

/** 하트비트 전송 (세션 유지) */
async function sendHeartbeat() {
  if (!sessionUri) return;
  try {
    await fetch(`${sessionUri}/heartbeat`, { method: 'PUT' });
  } catch (_) {
    isConnected = false;
    clearInterval(heartbeatTimer);
    if (onStatusChange) onStatusChange(false, '⚠️ Razer Chroma 세션이 만료되었습니다.');
  }
}
