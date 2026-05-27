import { parseMidi } from './parser.js';
import { KEY_MAP, resolveKey } from './keymap.js';
import { 
  initializeAudio, 
  initSampler, 
  setInstrument, 
  scheduleTrack, 
  play, 
  pause, 
  stop, 
  seek, 
  setSpeed, 
  getPlaybackState, 
  isSamplerReady,
  getActiveInstrument,
  playSingleNote
} from './player.js';
import { renderQwertyKeyboard, updateQwertyHighlights } from './keyboard-qwerty.js';
import { renderSheetView, updateSheetHighlight } from './sheet-view.js';
// ──────────────────────────────────────────────
// Application State
// ──────────────────────────────────────────────
let loadedSong = null;
let activeTrack = null;
let animationFrameId = null;
let persistentWarning = '';
let transposeAmount = 0;
const pressedPhysicalKeys = new Set();

// ──────────────────────────────────────────────
// DOM References
// ──────────────────────────────────────────────
const fileInput          = document.getElementById('file-input');
const uploadBox          = document.getElementById('upload-box');
const trackSelect        = document.getElementById('track-select');
const instrumentSelect   = document.getElementById('instrument-select');
const instrumentBadge    = document.getElementById('instrument-badge');
const bpmBadge           = document.getElementById('bpm-badge');
const songTitleEl        = document.getElementById('song-title');
const trackCountBadge    = document.getElementById('track-count-badge');
const noteCountBadge     = document.getElementById('note-count-badge');
const warningContainer   = document.getElementById('warning-container');

const playBtn            = document.getElementById('play-btn');
const pauseBtn           = document.getElementById('pause-btn');
const stopBtn            = document.getElementById('stop-btn');
const speedRange         = document.getElementById('speed-range');
const speedVal           = document.getElementById('speed-val');

const progressTrack      = document.getElementById('progress-track');
const progressFill       = document.getElementById('progress-fill');
const progressHandle     = document.getElementById('progress-handle');
const currentTimeVal     = document.getElementById('current-time-val');
const totalTimeVal       = document.getElementById('total-time-val');

// Topbar Controls
const menuToggleBtn      = document.getElementById('menu-toggle-btn');
const appLayout          = document.querySelector('.app-layout');

// Transpose UI
const transposeDownBtn   = document.getElementById('transpose-down-btn');
const transposeUpBtn     = document.getElementById('transpose-up-btn');
const transposeValEl     = document.getElementById('transpose-val');
const transposeResetBtn  = document.getElementById('transpose-reset-btn');

// ──────────────────────────────────────────────
// Utilities
// ──────────────────────────────────────────────
function formatTime(seconds) {
  if (isNaN(seconds) || seconds < 0) return '0:00.0';
  const mins   = Math.floor(seconds / 60);
  const secs   = Math.floor(seconds % 60);
  const tenths = Math.floor((seconds % 1) * 10);
  return `${mins}:${secs.toString().padStart(2, '0')}.${tenths}`;
}

function getMidiForKey(keyChar) {
  const entry = Object.entries(KEY_MAP).find(([_, v]) => v.key === keyChar);
  return entry ? parseInt(entry[0], 10) : null;
}

function highlightKeyVisually(keyChar, isPressed) {
  document.querySelectorAll(`.qwerty-key[data-key="${keyChar}"]`).forEach(el => {
    if (isPressed) el.classList.add('pressed');
    else el.classList.remove('pressed');
  });
}

// ──────────────────────────────────────────────
// Init
// ──────────────────────────────────────────────
function init() {
  renderQwertyKeyboard('qwerty-container');
  setupEventListeners();
  // Trigger initial instrument load
  handleInstrumentChange({ target: instrumentSelect });
}

// ──────────────────────────────────────────────
// Event Listeners
// ──────────────────────────────────────────────
function setupEventListeners() {
  menuToggleBtn.addEventListener('click', () => {
    appLayout.classList.toggle('sidebar-hidden');
  });

  fileInput.addEventListener('change', handleFileSelect);

  uploadBox.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadBox.style.borderColor = '#38bdf8';
    uploadBox.style.background = 'rgba(56, 189, 248, 0.05)';
  });
  uploadBox.addEventListener('dragleave', () => {
    uploadBox.style.borderColor = '';
    uploadBox.style.background = '';
  });
  uploadBox.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadBox.style.borderColor = '';
    uploadBox.style.background = '';
    if (e.dataTransfer.files.length > 0) {
      fileInput.files = e.dataTransfer.files;
      handleFileSelect();
    }
  });

  trackSelect.addEventListener('change', handleTrackSelect);
  playBtn.addEventListener('click', handlePlay);
  pauseBtn.addEventListener('click', handlePause);
  stopBtn.addEventListener('click', handleStop);

  speedRange.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    speedVal.textContent = `${val.toFixed(2)}x`;
    setSpeed(val);
  });

  progressTrack.addEventListener('click', handleProgressBarSeek);
  instrumentSelect.addEventListener('change', handleInstrumentChange);

  // ── Transpose Buttons ────────────────────
  transposeDownBtn.addEventListener('click', () => applyTranspose(transposeAmount - 1));
  transposeUpBtn.addEventListener('click',   () => applyTranspose(transposeAmount + 1));
  transposeResetBtn.addEventListener('click',() => applyTranspose(0));

  // ── Physical Keyboard ─────────────────────
  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;

    const keyChar  = e.key.length === 1 ? e.key.toUpperCase() : e.key;
    const midiNote = getMidiForKey(keyChar);

    if (midiNote !== null && !pressedPhysicalKeys.has(keyChar)) {
      e.preventDefault();
      pressedPhysicalKeys.add(keyChar);
      highlightKeyVisually(keyChar, true);
      playSingleNote(midiNote);
    }
  });

  window.addEventListener('keyup', (e) => {
    const keyChar = e.key.length === 1 ? e.key.toUpperCase() : e.key;
    if (pressedPhysicalKeys.has(keyChar)) {
      pressedPhysicalKeys.delete(keyChar);
      highlightKeyVisually(keyChar, false);
    }
  });
}

// ──────────────────────────────────────────────
// File Handling
// ──────────────────────────────────────────────
async function handleFileSelect() {
  const file = fileInput.files[0];
  if (!file) return;

  try {
    songTitleEl.textContent = '분석 중...';
    loadedSong = await parseMidi(file);

    songTitleEl.textContent        = loadedSong.name;
    trackCountBadge.textContent    = `트랙 ${loadedSong.tracks.length}개`;
    bpmBadge.textContent           = `BPM ${loadedSong.bpm}`;
    totalTimeVal.textContent       = formatTime(loadedSong.duration);

    trackSelect.innerHTML = '';
    if (loadedSong.tracks.length === 0) throw new Error('연주 가능한 트랙이 없습니다.');

    const sorted = [...loadedSong.tracks].sort((a, b) => b.noteCount - a.noteCount);
    sorted.forEach((track, idx) => {
      const opt = document.createElement('option');
      opt.value       = track.id;
      opt.textContent = `${track.name} (${track.noteCount}음)${idx === 0 ? ' [추천]' : ''}`;
      trackSelect.appendChild(opt);
    });

    trackSelect.disabled = false;
    trackSelect.value    = sorted[0].id;
    loadTrack(sorted[0].id);

    playBtn.disabled  = false;
    pauseBtn.disabled = false;
    stopBtn.disabled  = false;

  } catch (err) {
    console.error('MIDI Load Error:', err);
    songTitleEl.textContent = '파일을 로드하지 못했습니다.';
    alert(`MIDI 파싱 오류: ${err.message}`);
  }
}

// ──────────────────────────────────────────────
// Track Management
// ──────────────────────────────────────────────
function loadTrack(trackId) {
  if (!loadedSong) return;
  activeTrack = loadedSong.tracks.find(t => t.id === parseInt(trackId, 10));
  if (!activeTrack) return;

  noteCountBadge.textContent = `노트 ${activeTrack.noteCount}개`;

  // Re-apply current transpose to the newly selected track
  if (transposeAmount !== 0) {
    activeTrack.notes.forEach(note => {
      note.midi = note.originalMidi + transposeAmount;
      const resolved = resolveKey(note.midi);
      note.key        = resolved ? resolved.key        : '?';
      note.label      = resolved ? resolved.label      : '?';
      note.octave     = resolved ? resolved.octave     : 0;
      note.sharp      = resolved ? resolved.sharp      : false;
      note.outOfRange = resolved ? resolved.outOfRange : true;
      note.shifted    = resolved ? resolved.shifted    : 0;
      note.resolved   = !!resolved;
    });
  }

  scheduleTrack(activeTrack, loadedSong.bpm);
  renderSheetView('sheet-container', activeTrack.notes, (time) => {
    seek(time);
    updateTimelineUI(time);
  });

  calculatePersistentWarning(activeTrack.notes);
  handleStop();
}

function handleTrackSelect(e) { loadTrack(e.target.value); }

function calculatePersistentWarning(notes) {
  let shifted = 0, unresolved = 0;
  notes.forEach(n => { if (!n.resolved) unresolved++; else if (n.outOfRange) shifted++; });

  if (unresolved > 0)   persistentWarning = `❌ 게임 키 범위를 벗어난 음표 ${unresolved}개 포함 (회색 카드).`;
  else if (shifted > 0) persistentWarning = `⚠️ 옥타브 시프트된 음표 ${shifted}개 포함.`;
  else                  persistentWarning = `✅ 모든 음표가 두근두근타운 음역 내에 있습니다.`;

  updateWarningUI(false);
}

function updateWarningUI(isShifting) {
  warningContainer.innerHTML = '';
  const el = document.createElement('div');
  el.className = 'warning-notification';
  if (isShifting) {
    el.style.cssText = 'background:rgba(239,68,68,0.15);border-color:rgba(239,68,68,0.3)';
  }
  el.innerHTML = `
    <span class="warning-icon">${isShifting ? '⚠️' : '🔔'}</span>
    <span class="warning-message">${isShifting ? '[실시간] 범위 초과 음표가 옥타브 시프트 재생 중입니다.' : persistentWarning}</span>
  `;
  warningContainer.appendChild(el);
}

// ──────────────────────────────────────────────
// Playback
// ──────────────────────────────────────────────
async function handlePlay() {
  try {
    await initializeAudio();
    play();
    fileInput.disabled  = true;
    trackSelect.disabled = true;
    if (animationFrameId) cancelAnimationFrame(animationFrameId);
    animationFrameId = requestAnimationFrame(playbackLoop);
  } catch (err) {
    console.error('Play error:', err);
  }
}

function handlePause() {
  pause();
  if (animationFrameId) { cancelAnimationFrame(animationFrameId); animationFrameId = null; }
}

function handleStop() {
  stop();
  if (animationFrameId) { cancelAnimationFrame(animationFrameId); animationFrameId = null; }
  fileInput.disabled   = false;
  trackSelect.disabled = false;
  updateTimelineUI(0);
  updateQwertyHighlights(new Set());
  updateSheetHighlight(0);
  updateWarningUI(false);
}

function handleProgressBarSeek(e) {
  if (!loadedSong) return;
  const rect       = progressTrack.getBoundingClientRect();
  const pct        = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  const targetTime = pct * loadedSong.duration;
  seek(targetTime);
  updateTimelineUI(targetTime);
  updateSheetHighlight(targetTime);
}

// ──────────────────────────────────────────────
// 60 FPS Animation Loop
// ──────────────────────────────────────────────
function playbackLoop() {
  if (!loadedSong) return;

  const state = getPlaybackState();
  updateTimelineUI(state.time);
  updateQwertyHighlights(state.activeKeys);
  updateSheetHighlight(state.time);

  const hasShift = state.activeNotes.some(n => n.outOfRange);
  updateWarningUI(hasShift);

  if (state.time >= loadedSong.duration) {
    handleStop();
  } else {
    animationFrameId = requestAnimationFrame(playbackLoop);
  }
}

function updateTimelineUI(time) {
  if (!loadedSong) return;
  currentTimeVal.textContent = formatTime(time);
  const pct = Math.max(0, Math.min(100, (time / loadedSong.duration) * 100));
  progressFill.style.width  = `${pct}%`;
  progressHandle.style.left = `${pct}%`;
}

// ──────────────────────────────────────────────
// Transpose
// ──────────────────────────────────────────────
function applyTranspose(semitones) {
  transposeAmount = semitones;
  transposeValEl.textContent = semitones > 0 ? `+${semitones}` : `${semitones}`;
  transposeValEl.style.color = semitones === 0
    ? 'var(--text-secondary)'
    : semitones > 0 ? 'var(--color-oct3)' : 'var(--color-oct1)';
  transposeResetBtn.disabled = semitones === 0;

  if (!activeTrack) return;

  // Re-resolve all note mappings with the new MIDI offset
  activeTrack.notes.forEach(note => {
    note.midi = note.originalMidi + semitones;
    const resolved = resolveKey(note.midi);
    note.key        = resolved ? resolved.key        : '?';
    note.label      = resolved ? resolved.label      : '?';
    note.octave     = resolved ? resolved.octave     : 0;
    note.sharp      = resolved ? resolved.sharp      : false;
    note.outOfRange = resolved ? resolved.outOfRange : true;
    note.shifted    = resolved ? resolved.shifted    : 0;
    note.resolved   = !!resolved;
  });

  // Reschedule audio and refresh visuals
  scheduleTrack(activeTrack, loadedSong.bpm);
  renderSheetView('sheet-container', activeTrack.notes, (time) => {
    seek(time);
    updateTimelineUI(time);
  });
  calculatePersistentWarning(activeTrack.notes);
  updateQwertyHighlights(new Set());
}

// ──────────────────────────────────────────────
// Instrument Switcher
// ──────────────────────────────────────────────
function handleInstrumentChange(e) {
  if (e.target.value === 'sampler') {
    instrumentBadge.textContent = '음원: 피아노 (로딩 중...)';
    instrumentSelect.disabled   = true;
    initSampler(
      () => { setInstrument('sampler'); updateInstrumentBadge(); instrumentSelect.disabled = false; },
      ()  => { setInstrument('synth');  updateInstrumentBadge(); instrumentSelect.value = 'synth'; instrumentSelect.disabled = false; alert('샘플 로드 실패 — 신디사이저로 재생합니다.'); }
    );
  } else {
    setInstrument('synth');
    updateInstrumentBadge();
  }
}

function updateInstrumentBadge() {
  const isSampler = getActiveInstrument() === 'sampler' && isSamplerReady();
  instrumentBadge.textContent = isSampler ? '음원: 리얼 피아노 (활성)' : '음원: 신디사이저 (활성)';
  instrumentBadge.style.color = isSampler ? 'var(--color-oct4)' : 'var(--color-oct2)';
}

// ──────────────────────────────────────────────
// Boot
// ──────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', init);
