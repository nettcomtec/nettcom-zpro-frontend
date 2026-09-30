/**
 * Converte áudio gravado (Blob webm) em MP3 para envio.
 * Mesma lógica do front legado (InputMensagem → convertToWav + convertToMp3).
 */
import { Mp3Encoder } from "@breezystack/lamejs";

const SAMPLE_BLOCK = 1152;

async function decodeAudio(blob: Blob): Promise<AudioBuffer> {
  const arrayBuffer = await blob.arrayBuffer();
  const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  try {
    return await ctx.decodeAudioData(arrayBuffer);
  } finally {
    ctx.close().catch(() => {});
  }
}

export async function convertWebmBlobToMp3(blob: Blob): Promise<Blob> {
  if (typeof window === "undefined") {
    throw new Error("convertWebmBlobToMp3 só pode ser executado no browser");
  }

  const audioBuffer = await decodeAudio(blob);

  const sampleRate = audioBuffer.sampleRate;
  const numChannels = audioBuffer.numberOfChannels;

 // Interleave channel data → flat Float32 (same as front legado convertToMp3)
  const samples = new Float32Array(audioBuffer.length * numChannels);
  let idx = 0;
  for (let ch = 0; ch < numChannels; ch++) {
    const channelData = audioBuffer.getChannelData(ch);
    for (let i = 0; i < channelData.length; i++) {
      samples[idx++] = channelData[i];
    }
  }

  // Float32 → Int16 PCM
  const pcm = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    pcm[i] = Math.max(-32768, Math.min(32767, samples[i] * 32768));
  }

  // Encode to MP3
  const encoder = new Mp3Encoder(numChannels, sampleRate, 128);
  const mp3Data: Uint8Array[] = [];

  for (let i = 0; i < pcm.length; i += SAMPLE_BLOCK) {
    const chunk = pcm.subarray(i, i + SAMPLE_BLOCK);
    const buf = encoder.encodeBuffer(chunk);
    if (buf.length > 0) mp3Data.push(buf);
  }

  const tail = encoder.flush();
  if (tail.length > 0) mp3Data.push(tail);

  return new Blob(mp3Data as BlobPart[], { type: "audio/mpeg" });
}
