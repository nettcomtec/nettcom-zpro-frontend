import { create } from "zustand";

interface AudioPlayerState {
  url: string | null;
  originalUrl: string | null;
  title: string;
  currentTime: number;
  duration: number;
  playing: boolean;
  miniPlayerVisible: boolean;
}

interface AudioPlayerActions {
  /** Called when WaveAudioContent starts playing — registers the audio source */
  register: (url: string, originalUrl: string, title: string) => void;
  updateTime: (currentTime: number) => void;
  updateDuration: (duration: number) => void;
  setPlaying: (playing: boolean) => void;
  /**
   * Called when WaveAudioContent unmounts while playing.
   * Saves current position and shows the mini player.
   */
  handoff: (currentTime: number, duration: number) => void;
  /** User dismisses the mini player */
  dismiss: () => void;
}

export const useAudioPlayerStore = create<AudioPlayerState & AudioPlayerActions>((set) => ({
  url: null,
  originalUrl: null,
  title: "",
  currentTime: 0,
  duration: 0,
  playing: false,
  miniPlayerVisible: false,

  register: (url, originalUrl, title) =>
    set({ url, originalUrl, title, currentTime: 0, duration: 0, playing: false, miniPlayerVisible: false }),

  updateTime: (currentTime) => set({ currentTime }),
  updateDuration: (duration) => set({ duration }),
  setPlaying: (playing) => set({ playing }),

  handoff: (currentTime, duration) =>
    set({ currentTime, duration, miniPlayerVisible: true, playing: true }),

  dismiss: () =>
    set({ miniPlayerVisible: false, playing: false, url: null, originalUrl: null, currentTime: 0, duration: 0 }),
}));
