import * as Tone from 'tone';

let sampler = null;
let synth = null;
let currentTrack = null;
let scheduledEvents = [];
let baseBpm = 120;
let currentSpeed = 1.0;
let isSamplerLoaded = false;
let isAudioInitialized = false;
let activeInstrument = 'synth'; // 'synth' or 'sampler'

// Initialize PolySynth as fallback
function getSynth() {
  if (!synth) {
    synth = new Tone.PolySynth(Tone.Synth, {
      oscillator: {
        type: 'triangle' // Smooth, retro, premium feel
      },
      envelope: {
        attack: 0.01,
        decay: 0.15,
        sustain: 0.5,
        release: 0.8
      }
    }).toDestination();
    synth.volume.value = -6; // safe volume
  }
  return synth;
}

/**
 * Initializes the audio context on user action (required by browsers)
 */
export async function initializeAudio() {
  if (isAudioInitialized) return;
  await Tone.start();
  isAudioInitialized = true;
  console.log("Audio Context initialized");
}

/**
 * Initializes the Salamander Piano Sampler
 * @param {Function} onLoad - Success callback
 * @param {Function} onError - Error callback
 */
export function initSampler(onLoad, onError) {
  if (sampler) return;

  sampler = new Tone.Sampler({
    urls: {
      A0: "A0.mp3", C1: "C1.mp3", "D#1": "Ds1.mp3", "F#1": "Fs1.mp3",
      A1: "A1.mp3", C2: "C2.mp3", "D#2": "Ds2.mp3", "F#2": "Fs2.mp3",
      A2: "A2.mp3", C3: "C3.mp3", "D#3": "Ds3.mp3", "F#3": "Fs3.mp3",
      A3: "A3.mp3", C4: "C4.mp3", "D#4": "Ds4.mp3", "F#4": "Fs4.mp3",
      A4: "A4.mp3", C5: "C5.mp3", "D#5": "Ds5.mp3", "F#5": "Fs5.mp3",
      A5: "A5.mp3", C6: "C6.mp3", "D#6": "Ds6.mp3", "F#6": "Fs6.mp3",
      A6: "A6.mp3", C7: "C7.mp3", "D#7": "Ds7.mp3", "F#7": "Fs7.mp3",
      A7: "A7.mp3", C8: "C8.mp3"
    },
    release: 1,
    baseUrl: "https://tonejs.github.io/audio/salamander/",
    onload: () => {
      isSamplerLoaded = true;
      activeInstrument = 'sampler';
      sampler.volume.value = -3;
      if (onLoad) onLoad();
    },
    onerror: (err) => {
      console.warn("Failed to load Salamander Sampler. Falling back to built-in Synth.", err);
      activeInstrument = 'synth';
      if (onError) onError(err);
    }
  }).toDestination();
}

/**
 * Play a specific note (can be used for preview when clicking keys)
 */
export function playSingleNote(midiNote) {
  if (!isAudioInitialized) initializeAudio();
  
  const noteName = Tone.Frequency(midiNote, "midi").toNote();
  const inst = (activeInstrument === 'sampler' && isSamplerLoaded) ? sampler : getSynth();
  
  try {
    inst.triggerAttackRelease(noteName, "4n");
  } catch (err) {
    console.error("Error playing single note:", err);
  }
}

/**
 * Sets the active instrument type
 * @param {'synth'|'sampler'} type 
 */
export function setInstrument(type) {
  if (type === 'sampler' && isSamplerLoaded) {
    activeInstrument = 'sampler';
  } else {
    activeInstrument = 'synth';
  }
}

export function getActiveInstrument() {
  return activeInstrument;
}

export function isSamplerReady() {
  return isSamplerLoaded;
}

/**
 * Schedules a track for playing in the Tone.Transport
 */
export function scheduleTrack(track, bpm) {
  currentTrack = track;
  baseBpm = bpm;

  // Clear existing scheduled events
  clearSchedule();

  // Schedule notes at base BPM so tick positions are in original-time space.
  // Speed is applied AFTER scheduling by changing BPM, which shifts when
  // those ticks fire in real time without altering their tick positions.
  Tone.Transport.bpm.value = baseBpm;

  // Schedule all notes
  track.notes.forEach((note) => {
    const eventId = Tone.Transport.schedule((time) => {
      const noteName = Tone.Frequency(note.midi, "midi").toNote();
      const inst = (activeInstrument === 'sampler' && isSamplerLoaded) ? sampler : getSynth();

      try {
        inst.triggerAttackRelease(noteName, note.duration, time, note.velocity);
      } catch (err) {
        // Safe play failover
      }
    }, note.time);

    scheduledEvents.push(eventId);
  });

  // Now apply speed: BPM change makes scheduled ticks fire faster/slower
  Tone.Transport.bpm.value = baseBpm * currentSpeed;
}

/**
 * Clears scheduled events from the Tone.Transport
 */
export function clearSchedule() {
  scheduledEvents.forEach(id => Tone.Transport.clear(id));
  scheduledEvents = [];
}

/**
 * Play controls
 */
export async function play() {
  await initializeAudio();
  Tone.Transport.start();
}

export function pause() {
  Tone.Transport.pause();
}

export function stop() {
  Tone.Transport.stop();
  Tone.Transport.seconds = 0;
}

/**
 * Set playback speed (e.g. 0.5 to 1.5)
 */
export function setSpeed(speed) {
  currentSpeed = speed;
  Tone.Transport.bpm.value = baseBpm * speed;
}

/**
 * Seek to a specific time in original-song seconds.
 * Transport.seconds runs in real time, so we divide by speed to place
 * the transport at the correct tick position for the current BPM.
 */
export function seek(seconds) {
  Tone.Transport.seconds = seconds / currentSpeed;
}

/**
 * Gets the current playback progress status
 */
export function getPlaybackState() {
  // Transport.seconds is real-time; multiply by speed to get the virtual
  // position in original-song-time space, where note.time values live.
  const time = Tone.Transport.seconds * currentSpeed;
  const state = Tone.Transport.state; // "started", "paused", "stopped"
  
  // Determine active notes at current time
  const activeKeys = new Set();
  const activeMidiNotes = new Set();
  let activeNotesList = [];
  
  if (currentTrack && state === "started") {
    // Collect notes playing currently
    currentTrack.notes.forEach(note => {
      if (time >= note.time && time <= (note.time + note.duration)) {
        if (note.resolved) {
          activeKeys.add(note.key);
          activeMidiNotes.add(note.midi);
          activeNotesList.push(note);
        }
      }
    });
  }

  return {
    time,
    state,
    activeKeys,
    activeMidiNotes,
    activeNotes: activeNotesList
  };
}
