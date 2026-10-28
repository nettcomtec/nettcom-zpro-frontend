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
  const numChannels = Math.max(1, audioBuffer.numberOfChannels);

  // Mono (média dos canais): com microfone estéreo o lamejs exige os dois canais em
  // buffers separados, e o antigo encadeava os canais e entregava um só — a conversão
  // falhava ("Falha ao converter áudio para MP3"). Mensagem de voz é mono; com
  // microfone mono o resultado é o mesmo de antes.
  const samples = new Float32Array(audioBuffer.length);
  for (let ch = 0; ch < numChannels; ch++) {
    const channelData = audioBuffer.getChannelData(ch);
    for (let i = 0; i < channelData.length; i++) {
      samples[i] += channelData[i] / numChannels;
    }
  }

  // Float32 → Int16 PCM
  const pcm = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    pcm[i] = Math.max(-32768, Math.min(32767, samples[i] * 32768));
  }

  // Encode to MP3
  const encoder = new Mp3Encoder(1, sampleRate, 128);
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
