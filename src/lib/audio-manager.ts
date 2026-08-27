// Global singleton: ensures only one audio element plays at a time across
// WaveAudioContent (message bubbles) and PersistentAudioPlayer.

let _currentAudio: HTMLAudioElement | null = null;

export function registerAudioPlay(el: HTMLAudioElement) {
  if (_currentAudio && _currentAudio !== el) {
    _currentAudio.pause();
  }
  _currentAudio = el;
}
