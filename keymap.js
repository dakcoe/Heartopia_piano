// MIDI note number → 게임 키 매핑
// 옥타브 1(저음) = MIDI 48~59 (C3~B3)
// 옥타브 2(중음) = MIDI 60~71 (C4~B4)
// 옥타브 3(고음) = MIDI 72~83 (C5~B5)
// 옥타브 4(최고음) = MIDI 84 (C6) - 'I'

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

  // ── 옥타브 4 (최고음 - 하나만 있음) ───────────
  84: { key: 'I', label: '도',  octave: 4, sharp: false },
};

// MIDI 번호 → 주파수 변환
export const midiToFreq = (midi) => 440 * Math.pow(2, (midi - 69) / 12);

// 범위 밖 음표 처리: 가장 가까운 playable 옥타브로 시프트 후 재매핑
export function resolveKey(midiNote) {
  if (KEY_MAP[midiNote]) {
    return { ...KEY_MAP[midiNote], outOfRange: false, originalMidi: midiNote };
  }
  
  // 옥타브 시프트 시도 (±12, ±24)
  for (const offset of [-12, 12, -24, 24, -36, 36]) {
    const shiftedMidi = midiNote + offset;
    if (KEY_MAP[shiftedMidi]) {
      return { 
        ...KEY_MAP[shiftedMidi], 
        outOfRange: true, 
        shifted: -offset, // 원래 음표를 playable하게 만드려면 어떤 offset을 적용해야 하는지 (예: 원래 midiNote=40, shiftedMidi=52, offset=12, shifted=-12)
        originalMidi: midiNote 
      };
    }
  }
  return null; // 완전 범위 밖
}
