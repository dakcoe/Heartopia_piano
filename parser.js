import { Midi } from '@tonejs/midi';
import { resolveKey } from './keymap.js';

/**
 * Parses a MIDI file and returns structured tracks with keys pre-resolved.
 * @param {File} file 
 * @returns {Promise<{bpm: number, duration: number, tracks: Array}>}
 */
export async function parseMidi(file) {
  const arrayBuffer = await file.arrayBuffer();
  const midi = new Midi(arrayBuffer);

  // Extract BPM (fallback to 120)
  const bpm = Math.round(midi.header.tempos[0]?.bpm ?? 120);

  const tracks = midi.tracks
    .map((track, i) => {
      const notes = track.notes.map(note => {
        const resolved = resolveKey(note.midi);
        return {
          midi: note.midi,
          originalMidi: note.midi,    // Preserved for transposition
          time: note.time,            // Start time in seconds
          duration: note.duration,    // Duration in seconds
          velocity: note.velocity,    // 0 to 1
          name: note.name,            // e.g. "C4"
          // Mapped key information
          key: resolved ? resolved.key : '?',
          label: resolved ? resolved.label : '?',
          octave: resolved ? resolved.octave : 0,
          sharp: resolved ? resolved.sharp : false,
          outOfRange: resolved ? resolved.outOfRange : true,
          shifted: resolved ? resolved.shifted : 0,
          resolved: !!resolved
        };
      });

      // Ensure notes are sorted chronologically
      notes.sort((a, b) => a.time - b.time);

      return {
        id: i,
        name: track.name || `Track ${i + 1}`,
        noteCount: notes.length,
        notes: notes
      };
    })
    .filter(track => track.noteCount > 0); // Only keep tracks that have playable notes

  return {
    name: file.name.replace(/\.[^/.]+$/, ""), // file name without extension
    bpm,
    duration: midi.duration, // Total song duration in seconds
    tracks
  };
}
