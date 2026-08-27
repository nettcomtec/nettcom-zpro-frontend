import { getPrivateChatRtcConfiguration } from "./webrtc-ice-servers"

/**
 * WebRTC peer connection helper para chamadas Dialog360.
 * Implementação independente de `waba-webrtc.ts` — sem imports cruzados.
 * O fluxo SDP é idêntico ao WABA pois ambos são passthrough da Cloud API.
 */
export class Dialog360WebRTC {
  private pc: RTCPeerConnection | null = null
  private localStream: MediaStream | null = null
  private remoteAudio: HTMLAudioElement | null = null

  private async freshPeerConnection(): Promise<RTCPeerConnection> {
    if (this.pc) {
      this.pc.close()
      this.pc = null
    }
    const config = await getPrivateChatRtcConfiguration()
    this.pc = new RTCPeerConnection(config)

    // Configura áudio remoto automaticamente em qualquer PC novo.
    this.pc.ontrack = (event) => {
      if (event.streams?.[0]) {
        if (!this.remoteAudio) {
          this.remoteAudio = new Audio()
          this.remoteAudio.autoplay = true
        }
        this.remoteAudio.srcObject = event.streams[0]
      }
    }

    return this.pc
  }

  private async getStream(): Promise<MediaStream> {
    if (
      !this.localStream ||
      this.localStream.getTracks().every((t) => t.readyState === "ended")
    ) {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      })
    }
    return this.localStream
  }

  private addTracksIfNeeded(pc: RTCPeerConnection, stream: MediaStream): void {
    const existingSenderTracks = new Set(pc.getSenders().map((s) => s.track))
    stream.getTracks().forEach((track) => {
      if (!existingSenderTracks.has(track)) {
        pc.addTrack(track, stream)
      }
    })
  }

  /** User-initiated: recebe SDP offer, retorna SDP answer. */
  async createAnswerForOffer(sdpOffer: string): Promise<string> {
    const pc = await this.freshPeerConnection()
    const stream = await this.getStream()
    this.addTracksIfNeeded(pc, stream)

    await pc.setRemoteDescription(
      new RTCSessionDescription({ type: "offer", sdp: sdpOffer })
    )
    const answer = await pc.createAnswer()
    await pc.setLocalDescription(answer)
    return answer.sdp!
  }

  /** Business-initiated: cria SDP offer. */
  async createOffer(): Promise<string> {
    const pc = await this.freshPeerConnection()
    const stream = await this.getStream()
    this.addTracksIfNeeded(pc, stream)

    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)
    return offer.sdp!
  }

  /** Business-initiated: aplica SDP answer recebido via webhook. */
  async setRemoteAnswer(sdpAnswer: string): Promise<void> {
    if (!this.pc) return
    await this.pc.setRemoteDescription(
      new RTCSessionDescription({ type: "answer", sdp: sdpAnswer })
    )
  }

  setMuted(muted: boolean): void {
    if (!this.localStream) return
    this.localStream.getAudioTracks().forEach((track) => {
      track.enabled = !muted
    })
  }

  onRemoteStream(callback: (stream: MediaStream) => void): void {
    if (!this.pc) return
    this.pc.ontrack = (event) => {
      if (event.streams?.[0]) {
        callback(event.streams[0])
        if (!this.remoteAudio) {
          this.remoteAudio = new Audio()
          this.remoteAudio.autoplay = true
        }
        this.remoteAudio.srcObject = event.streams[0]
      }
    }
  }

  close(): void {
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => track.stop())
      this.localStream = null
    }
    if (this.remoteAudio) {
      this.remoteAudio.srcObject = null
      this.remoteAudio = null
    }
    if (this.pc) {
      this.pc.close()
      this.pc = null
    }
  }
}
