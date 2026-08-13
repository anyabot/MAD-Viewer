// Every viewer player is created here so a recording can tap all of them at once.
const players = new Set<HTMLAudioElement>();
const sources = new Map<HTMLAudioElement, MediaElementAudioSourceNode>();
let context: AudioContext | null = null;
let capture: MediaStreamAudioDestinationNode | null = null;

export function busAudio(): HTMLAudioElement {
  const player = new Audio();
  // A streamed clip loaded without this is opaque to Web Audio and captures as silence.
  player.crossOrigin = 'anonymous';
  players.add(player);
  if (capture) route(player);
  return player;
}

function route(player: HTMLAudioElement) {
  if (!context || !capture) return;
  let source = sources.get(player);
  if (!source) {
    source = context.createMediaElementSource(player);
    source.connect(context.destination);
    sources.set(player, source);
  }
  source.connect(capture);
}

/** Call from a user gesture: routing starts the context the players now feed. */
export function captureAudioTracks(): MediaStreamTrack[] {
  if (typeof AudioContext === 'undefined') return [];
  try {
    if (!context) context = new AudioContext();
    if (!capture) capture = context.createMediaStreamDestination();
    for (const player of players) route(player);
    void context.resume().catch(() => { /* resumes on the next gesture */ });
    return capture.stream.getAudioTracks();
  } catch {
    return [];
  }
}
