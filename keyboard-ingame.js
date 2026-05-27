import { KEY_MAP } from './keymap.js';
import { playSingleNote } from './player.js';

// Setup key data for each octave row to construct the virtual piano bed
const INGAME_OCTAVES = [
  // Low (Octave 1)
  {
    octave: 1,
    title: '저음부 (Octave 1)',
    className: 'oct-low',
    whites: [
      { midi: 48, key: ',', label: '도' },
      { midi: 50, key: '.', label: '레' },
      { midi: 52, key: '/', label: '미' },
      { midi: 53, key: 'O', label: '파' },
      { midi: 55, key: 'P', label: '솔' },
      { midi: 57, key: '[', label: '라' },
      { midi: 59, key: ']', label: '시' }
    ],
    blacks: [
      { midi: 49, key: 'L', label: '도#', leftOffset: 1 }, // after 도
      { midi: 51, key: ';', label: '레#', leftOffset: 2 }, // after 레
      { midi: 54, key: '0', label: '파#', leftOffset: 4 }, // after 파
      { midi: 56, key: '-', label: '솔#', leftOffset: 5 }, // after 솔
      { midi: 58, key: '=', label: '라#', leftOffset: 6 }  // after 라
    ]
  },
  // Medium (Octave 2)
  {
    octave: 2,
    title: '중음부 (Octave 2)',
    className: 'oct-medium',
    whites: [
      { midi: 60, key: 'Z', label: '도' },
      { midi: 62, key: 'X', label: '레' },
      { midi: 64, key: 'C', label: '미' },
      { midi: 65, key: 'V', label: '파' },
      { midi: 67, key: 'B', label: '솔' },
      { midi: 69, key: 'N', label: '라' },
      { midi: 71, key: 'M', label: '시' }
    ],
    blacks: [
      { midi: 61, key: 'S', label: '도#', leftOffset: 1 },
      { midi: 63, key: 'D', label: '레#', leftOffset: 2 },
      { midi: 66, key: 'G', label: '파#', leftOffset: 4 },
      { midi: 68, key: 'H', label: '솔#', leftOffset: 5 },
      { midi: 70, key: 'J', label: '라#', leftOffset: 6 }
    ]
  },
  // High / Max (Octave 3 & 4)
  {
    octave: 3,
    title: '고음부 (Octave 3 & 4)',
    className: 'oct-high',
    whites: [
      { midi: 72, key: 'Q', label: '도' },
      { midi: 74, key: 'W', label: '레' },
      { midi: 76, key: 'E', label: '미' },
      { midi: 77, key: 'R', label: '파' },
      { midi: 79, key: 'T', label: '솔' },
      { midi: 81, key: 'Y', label: '라' },
      { midi: 83, key: 'U', label: '시' },
      { midi: 84, key: 'I', label: '도', maxOctave: true } // Octave 4 도
    ],
    blacks: [
      { midi: 73, key: '2', label: '도#', leftOffset: 1 },
      { midi: 75, key: '3', label: '레#', leftOffset: 2 },
      { midi: 78, key: '5', label: '파#', leftOffset: 4 },
      { midi: 80, key: '6', label: '솔#', leftOffset: 5 },
      { midi: 82, key: '7', label: '라#', leftOffset: 6 }
    ]
  }
];

export function renderIngameKeyboard(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = '';

  const mainWrapper = document.createElement('div');
  mainWrapper.className = 'ingame-piano';

  INGAME_OCTAVES.forEach((octaveInfo) => {
    const rowContainer = document.createElement('div');
    rowContainer.className = `piano-octave-row ${octaveInfo.className}`;

    // Keyboard container where white and black keys reside
    const keyboardEl = document.createElement('div');
    keyboardEl.className = 'piano-keybed';

    // Total number of white keys determines the grid width or width ratio
    const totalWhites = octaveInfo.whites.length;
    keyboardEl.style.setProperty('--whites-count', totalWhites);

    // 1. Render White Keys
    octaveInfo.whites.forEach((wKey, idx) => {
      const whiteEl = document.createElement('div');
      const currentOctave = wKey.maxOctave ? 4 : octaveInfo.octave;
      whiteEl.className = `piano-key white-key octave-${currentOctave}`;
      whiteEl.setAttribute('data-midi', wKey.midi);
      whiteEl.setAttribute('data-key', wKey.key);

      whiteEl.innerHTML = `
        <div class="key-labels">
          <span class="note-name">${wKey.label}</span>
        </div>
      `;

      whiteEl.addEventListener('mousedown', () => {
        playSingleNote(wKey.midi);
        whiteEl.classList.add('pressed');
        setTimeout(() => whiteEl.classList.remove('pressed'), 150);
      });

      keyboardEl.appendChild(whiteEl);
    });

    // 2. Render Black Keys (positioned absolutely)
    octaveInfo.blacks.forEach((bKey) => {
      const blackEl = document.createElement('div');
      blackEl.className = `piano-key black-key octave-${octaveInfo.octave}`;
      blackEl.setAttribute('data-midi', bKey.midi);
      blackEl.setAttribute('data-key', bKey.key);

      // position black keys precisely in between the white keys
      // leftOffset matches the index of the white key it sits after
      // standard formula: (leftOffset * (100% / totalWhites)) - (blackKeyWidth / 2)
      // We will handle widths and offsets gracefully using CSS Custom Properties
      blackEl.style.setProperty('--key-offset', bKey.leftOffset);

      blackEl.innerHTML = `
        <div class="key-labels">
          <span class="note-name">${bKey.label}</span>
        </div>
      `;

      blackEl.addEventListener('mousedown', (e) => {
        e.stopPropagation(); // prevent triggering underlying white key
        playSingleNote(bKey.midi);
        blackEl.classList.add('pressed');
        setTimeout(() => blackEl.classList.remove('pressed'), 150);
      });

      keyboardEl.appendChild(blackEl);
    });

    rowContainer.appendChild(keyboardEl);
    mainWrapper.appendChild(rowContainer);
  });

  container.appendChild(mainWrapper);
}

/**
 * Updates highlights on the virtual piano keys based on currently active MIDI notes.
 * @param {Set<number>} activeMidiNotes 
 */
export function updateIngameHighlights(activeMidiNotes) {
  const keys = document.querySelectorAll('.piano-key');
  keys.forEach(keyEl => {
    const midi = parseInt(keyEl.getAttribute('data-midi'), 10);
    if (activeMidiNotes.has(midi)) {
      keyEl.classList.add('pressed');
    } else {
      keyEl.classList.remove('pressed');
    }
  });
}
