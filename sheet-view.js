import { playSingleNote } from './player.js';

let noteColumns = [];
let activeColumnIndex = -1;
let onSeekCallback = null;

/**
 * Groups notes that occur at approximately the same time into chord columns
 * @param {Array} notes 
 * @returns {Array} grouped columns
 */
function groupNotesIntoColumns(notes) {
  const columns = [];
  const CHORD_THRESHOLD = 0.08; // 80ms grouping threshold for chords

  notes.forEach(note => {
    let matchedColumn = columns.find(col => Math.abs(col.time - note.time) < CHORD_THRESHOLD);
    
    if (matchedColumn) {
      matchedColumn.notes.push(note);
    } else {
      columns.push({
        time: note.time,
        notes: [note]
      });
    }
  });

  // Sort columns chronologically
  columns.sort((a, b) => a.time - b.time);
  return columns;
}

/**
 * Renders the sheet music view inside a container
 * @param {string} containerId 
 * @param {Array} notes - Array of note objects
 * @param {Function} onSeek - Callback when user clicks a note to seek
 */
export function renderSheetView(containerId, notes, onSeek) {
  const container = document.getElementById(containerId);
  if (!container) return;

  onSeekCallback = onSeek;
  noteColumns = groupNotesIntoColumns(notes);
  activeColumnIndex = -1;

  container.innerHTML = '';
  
  const scrollWrapper = document.createElement('div');
  scrollWrapper.className = 'sheet-scroll-wrapper';
  scrollWrapper.id = 'sheet-scroll-wrapper';

  if (noteColumns.length === 0) {
    scrollWrapper.innerHTML = `<div class="sheet-empty-state">재생할 노트가 없습니다.</div>`;
    container.appendChild(scrollWrapper);
    return;
  }

  noteColumns.forEach((column, colIdx) => {
    const columnEl = document.createElement('div');
    columnEl.className = 'sheet-column';
    columnEl.setAttribute('data-col-idx', colIdx);
    columnEl.setAttribute('data-time', column.time);

    // Format start time for display (e.g. "0:23")
    const minutes = Math.floor(column.time / 60);
    const seconds = Math.floor(column.time % 60).toString().padStart(2, '0');
    const milliseconds = Math.floor((column.time % 1) * 10).toString();
    const timeLabel = `${minutes}:${seconds}.${milliseconds}`;

    const columnHeader = document.createElement('div');
    columnHeader.className = 'sheet-column-header';
    columnHeader.textContent = timeLabel;
    columnEl.appendChild(columnHeader);

    // Render notes inside this column
    column.notes.forEach(note => {
      const noteEl = document.createElement('div');
      noteEl.className = `sheet-note-card octave-${note.octave}`;
      if (note.sharp) noteEl.classList.add('sharp');
      if (note.outOfRange) noteEl.classList.add('out-of-range');
      if (!note.resolved) noteEl.classList.add('unresolved');

      let octaveBadge = `<span class="oct-badge">${note.octave}</span>`;
      let rangeWarning = '';

      if (note.outOfRange && note.resolved) {
        const direction = note.shifted > 0 ? `+${note.shifted / 12}` : `${note.shifted / 12}`;
        rangeWarning = `<span class="range-badge shift" title="원래 음이 지원 범위를 벗어나 ${direction}옥타브 시프트 되었습니다.">Shift ${direction}</span>`;
      } else if (!note.resolved) {
        rangeWarning = `<span class="range-badge error" title="지원 범위를 완전히 벗어난 음표입니다.">지원불가</span>`;
        octaveBadge = '';
      }

      noteEl.innerHTML = `
        <div class="card-main">
          <span class="game-key">${note.key}</span>
          <span class="pitch-label">${note.label}</span>
        </div>
        <div class="card-footer">
          ${octaveBadge}
          ${rangeWarning}
        </div>
      `;

      noteEl.addEventListener('click', (e) => {
        e.stopPropagation(); // Stop column click
        playSingleNote(note.midi);
      });

      columnEl.appendChild(noteEl);
    });

    // Column click triggers seek
    columnEl.addEventListener('click', () => {
      if (onSeekCallback) {
        onSeekCallback(column.time);
      }
    });

    scrollWrapper.appendChild(columnEl);
  });

  container.appendChild(scrollWrapper);
}

/**
 * Updates the active column highlight based on the current playback time.
 * Automatically scrolls the container to center the active column.
 * @param {number} currentTime 
 */
export function updateSheetHighlight(currentTime) {
  if (noteColumns.length === 0) return;

  // Find the column closest to current playback time (but not after it unless it's the first)
  let activeIdx = -1;
  
  for (let i = 0; i < noteColumns.length; i++) {
    // If current time is close to or past this column but before the next one
    const nextCol = noteColumns[i + 1];
    if (currentTime >= noteColumns[i].time && (!nextCol || currentTime < nextCol.time)) {
      activeIdx = i;
      break;
    }
  }

  // Fallback to first column if time is before first note
  if (activeIdx === -1 && noteColumns.length > 0 && currentTime < noteColumns[0].time) {
    activeIdx = 0;
  }

  // Update classes if active column index has changed
  if (activeIdx !== activeColumnIndex) {
    // Remove old active class
    if (activeColumnIndex !== -1) {
      const prevEl = document.querySelector(`.sheet-column[data-col-idx="${activeColumnIndex}"]`);
      if (prevEl) prevEl.classList.remove('active');
    }

    activeColumnIndex = activeIdx;

    if (activeColumnIndex !== -1) {
      const activeEl = document.querySelector(`.sheet-column[data-col-idx="${activeColumnIndex}"]`);
      if (activeEl) {
        activeEl.classList.add('active');

        // Scroll to active column (smooth scroll center)
        const wrapper = document.getElementById('sheet-scroll-wrapper');
        if (wrapper) {
          const wrapperWidth = wrapper.clientWidth;
          const activeOffsetLeft = activeEl.offsetLeft;
          const activeWidth = activeEl.clientWidth;

          // Target scroll left puts active element in the middle
          const targetScroll = activeOffsetLeft - (wrapperWidth / 2) + (activeWidth / 2);
          
          wrapper.scrollTo({
            left: targetScroll,
            behavior: 'smooth'
          });
        }
      }
    }
  }
}
