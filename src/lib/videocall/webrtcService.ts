// WebRTC Peer Connection Service
export class WebRTCService {
  private peerConnection: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;

  constructor(iceServers?: RTCIceServer[]) {
    const config: RTCConfiguration = {
      iceServers: iceServers || [{ urls: 'stun:stun.l.google.com:19302' }],
    };
    this.peerConnection = new RTCPeerConnection(config);
  }

  /**
   * Initialize peer connection and add local stream
   */
  async initialize(stream: MediaStream): Promise<void> {
    if (!this.peerConnection) throw new Error('PeerConnection not initialized');

    this.localStream = stream;
    stream.getTracks().forEach((track) => {
      this.peerConnection?.addTrack(track, stream);
    });
  }

  /**
   * Get local peer connection
   */
  getPeerConnection(): RTCPeerConnection {
    if (!this.peerConnection) throw new Error('PeerConnection not initialized');
    return this.peerConnection;
  }

  /**
   * Create and return an offer
   */
  async createOffer(): Promise<RTCSessionDescriptionInit> {
    if (!this.peerConnection) throw new Error('PeerConnection not initialized');

    const offer = await this.peerConnection.createOffer();
    await this.peerConnection.setLocalDescription(offer);
    return offer;
  }

  /**
   * Create and return an answer
   */
  async createAnswer(offer: RTCSessionDescriptionInit): Promise<RTCSessionDescriptionInit> {
    if (!this.peerConnection) throw new Error('PeerConnection not initialized');

    await this.peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await this.peerConnection.createAnswer();
    await this.peerConnection.setLocalDescription(answer);
    return answer;
  }

  /**
   * Set remote description (answer/offer)
   */
  async setRemoteDescription(description: RTCSessionDescriptionInit): Promise<void> {
    if (!this.peerConnection) throw new Error('PeerConnection not initialized');
    await this.peerConnection.setRemoteDescription(new RTCSessionDescription(description));
  }

  /**
   * Add ICE candidate
   */
  async addIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    if (!this.peerConnection) throw new Error('PeerConnection not initialized');
    await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
  }

  /**
   * Setup ICE candidate callback
   */
  onIceCandidate(callback: (candidate: RTCIceCandidate) => void): void {
    if (!this.peerConnection) throw new Error('PeerConnection not initialized');
    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        callback(event.candidate);
      }
    };
  }

  /**
   * Setup remote track callback
   */
  onRemoteTrack(callback: (stream: MediaStream) => void): void {
    if (!this.peerConnection) throw new Error('PeerConnection not initialized');
    this.peerConnection.ontrack = (event) => {
      if (event.streams[0]) {
        callback(event.streams[0]);
      }
    };
  }

  /**
   * Setup connection state change callback
   */
  onConnectionStateChange(callback: (state: RTCPeerConnectionState) => void): void {
    if (!this.peerConnection) throw new Error('PeerConnection not initialized');
    const pc = this.peerConnection;
    pc.onconnectionstatechange = () => {
      callback(pc.connectionState);
    };
  }

  /**
   * Get connection statistics
   */
  async getStats(): Promise<RTCStatsReport> {
    if (!this.peerConnection) throw new Error('PeerConnection not initialized');
    return await this.peerConnection.getStats();
  }

  /**
   * Close peer connection
   */
  close(): void {
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => track.stop());
      this.localStream = null;
    }
  }
}
