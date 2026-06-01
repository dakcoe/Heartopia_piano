import { KEY_MAP } from './keymap.js';
import { playSingleNote } from './player.js';

// QWERTY physical keyboard layout for visual reference
const QWERTY_LAYOUT = [
  // Row 0
  [
    { char: '`', label: '`', width: '1fr' },
    { char: '1', label: '1', width: '1fr' },
    { char: '2', label: '2', width: '1fr' },
    { char: '3', label: '3', width: '1fr' },
    { char: '4', label: '4', width: '1fr' },
    { char: '5', label: '5', width: '1fr' },
    { char: '6', label: '6', width: '1fr' },
    { char: '7', label: '7', width: '1fr' },
    { char: '8', label: '8', width: '1fr' },
    { char: '9', label: '9', width: '1fr' },
    { char: '0', label: '0', width: '1fr' },
    { char: '-', label: '-', width: '1fr' },
    { char: '=', label: '=', width: '1fr' },
    { char: 'Backspace', label: '←', width: '2fr', functional: true }
  ],
  // Row 1
  [
    { char: 'Tab', label: 'Tab', width: '1.5fr', functional: true },
    { char: 'Q', label: 'Q', width: '1fr' },
    { char: 'W', label: 'W', width: '1fr' },
    { char: 'E', label: 'E', width: '1fr' },
    { char: 'R', label: 'R', width: '1fr' },
    { char: 'T', label: 'T', width: '1fr' },
    { char: 'Y', label: 'Y', width: '1fr' },
    { char: 'U', label: 'U', width: '1fr' },
    { char: 'I', label: 'I', width: '1fr' },
    { char: 'O', label: 'O', width: '1fr' },
    { char: 'P', label: 'P', width: '1fr' },
    { char: '[', label: '[', width: '1fr' },
    { char: ']', label: ']', width: '1fr' },
    { char: '\\', label: '\\', width: '1.5fr' }
  ],
  // Row 2
  [
    { char: 'CapsLock', label: 'Caps', width: '1.8fr', functional: true },
    { char: 'A', label: 'A', width: '1fr' },
    { char: 'S', label: 'S', width: '1fr' },
    { char: 'D', label: 'D', width: '1fr' },
    { char: 'F', label: 'F', width: '1fr' },
    { char: 'G', label: 'G', width: '1fr' },
    { char: 'H', label: 'H', width: '1fr' },
    { char: 'J', label: 'J', width: '1fr' },
    { char: 'K', label: 'K', width: '1fr' },
    { char: 'L', label: 'L', width: '1fr' },
    { char: ';', label: ';', width: '1fr' },
    { char: "'", label: "'", width: '1fr' },
    { char: 'Enter', label: 'Enter', width: '2.2fr', functional: true }
  ],
  // Row 3
  [
    { char: 'ShiftLeft', label: 'Shift', width: '2.4fr', functional: true },
    { char: 'Z', label: 'Z', width: '1fr' },
    { char: 'X', label: 'X', width: '1fr' },
    { char: 'C', label: 'C', width: '1fr' },
    { char: 'V', label: 'V', width: '1fr' },
    { char: 'B', label: 'B', width: '1fr' },
    { char: 'N', label: 'N', width: '1fr' },
    { char: 'M', label: 'M', width: '1fr' },
    { char: ',', label: ',', width: '1fr' },
    { char: '.', label: '.', width: '1fr' },
    { char: '/', label: '/', width: '1fr' },
    { char: 'ShiftRight', label: 'Shift', width: '2.8fr', functional: true }
  ]
];

// Helper to find the MIDI note for a key
function getMidiForKey(key) {
  const upperKey = key.toUpperCase();
  const entry = Object.entries(KEY_MAP).find(([_, value]) => value.key === upperKey || value.key === key);
  return entry ? parseInt(entry[0], 10) : null;
}

export function renderQwertyKeyboard(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = '';
  const keyboardWrapper = document.createElement('div');
  keyboardWrapper.className = 'qwerty-keyboard';

  QWERTY_LAYOUT.forEach((row, rowIndex) => {
    const rowEl = document.createElement('div');
    rowEl.className = 'qwerty-row';

    row.forEach(keyInfo => {
      const keyEl = document.createElement('button');
      keyEl.className = 'qwerty-key';
      keyEl.style.flex = keyInfo.width.replace('fr', '');
      keyEl.setAttribute('data-key', keyInfo.char);

      const midiNote = getMidiForKey(keyInfo.char);
      
      if (keyInfo.functional) {
        keyEl.classList.add('functional');
        keyEl.innerHTML = `<span class="key-char">${keyInfo.label}</span>`;
      } else if (midiNote !== null) {
        const mapping = KEY_MAP[midiNote];
        keyEl.classList.add('playable-key', `octave-${mapping.octave}`);
        if (mapping.sharp) keyEl.classList.add('sharp');

        keyEl.innerHTML = `
          <span class="key-char">${keyInfo.label}</span>
          <span class="music-label">${mapping.label}</span>
          <span class="octave-indicator">${mapping.octave}</span>
        `;

        // Add interactive click listener
        const handleQwertyPress = (e) => {
          if (e.type === 'touchstart') {
            e.preventDefault();
          }
          playSingleNote(midiNote);
          // Temporary click visual effect
          keyEl.classList.add('pressed');
          setTimeout(() => keyEl.classList.remove('pressed'), 150);
        };
        keyEl.addEventListener('mousedown', handleQwertyPress);
        keyEl.addEventListener('touchstart', handleQwertyPress, { passive: false });
      } else {
        keyEl.classList.add('inactive-key');
        keyEl.innerHTML = `<span class="key-char">${keyInfo.label}</span>`;
      }

      rowEl.appendChild(keyEl);
    });

    keyboardWrapper.appendChild(rowEl);
  });

  container.appendChild(keyboardWrapper);
}

/**
 * Highlights keys based on a Set of active keys currently playing.
 * @param {Set<string>} activeKeys 
 */
export function updateQwertyHighlights(activeKeys) {
  const keys = document.querySelectorAll('.qwerty-key.playable-key');
  keys.forEach(keyEl => {
    const keyChar = keyEl.getAttribute('data-key');
    if (activeKeys.has(keyChar)) {
      keyEl.classList.add('pressed');
    } else {
      keyEl.classList.remove('pressed');
    }
  });
}
