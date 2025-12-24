// Media Capture and Screen Sharing Service
export class MediaService {
  /**
   * Get user media (camera and microphone)
   */
  static async getUserMedia(
    constraints: MediaStreamConstraints = {
      video: { width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: true,
    }
  ): Promise<MediaStream> {
    try {
      return await navigator.mediaDevices.getUserMedia(constraints);
    } catch (error) {
      throw new Error(`Failed to access media devices: ${error}`);
    }
  }

  /**
   * Get screen/display media for screen sharing
   */
  static async getScreenMedia(
    constraints: DisplayMediaStreamOptions = {
      video: true,
      audio: false,
    }
  ): Promise<MediaStream> {
    try {
      return await navigator.mediaDevices.getDisplayMedia(constraints);
    } catch (error) {
      if ((error as DOMException).name === 'NotAllowedError') {
        throw new Error('Screen capture permission denied');
      }
      throw new Error(`Failed to get screen media: ${error}`);
    }
  }

  /**
   * Toggle audio track on/off
   */
  static toggleAudio(stream: MediaStream, enabled: boolean): boolean {
    const audioTracks = stream.getAudioTracks();
    audioTracks.forEach((track) => {
      track.enabled = enabled;
    });
    return audioTracks.length > 0 && enabled;
  }

  /**
   * Toggle video track on/off
   */
  static toggleVideo(stream: MediaStream, enabled: boolean): boolean {
    const videoTracks = stream.getVideoTracks();
    videoTracks.forEach((track) => {
      track.enabled = enabled;
    });
    return videoTracks.length > 0 && enabled;
  }

  /**
   * Stop all tracks in a stream
   */
  static stopTracks(stream: MediaStream): void {
    stream.getTracks().forEach((track) => {
      track.stop();
    });
  }

  /**
   * Check device permissions
   */
  static async checkPermissions(): Promise<{
    camera: boolean;
    microphone: boolean;
  }> {
    try {
      const cameraPermission = await navigator.permissions.query({ name: 'camera' as PermissionName });
      const microphonePermission = await navigator.permissions.query({ name: 'microphone' as PermissionName });

      return {
        camera: cameraPermission.state === 'granted',
        microphone: microphonePermission.state === 'granted',
      };
    } catch {
      return { camera: false, microphone: false };
    }
  }

  /**
   * Get available devices
   */
  static async getDevices(): Promise<{
    audioDevices: MediaDeviceInfo[];
    videoDevices: MediaDeviceInfo[];
  }> {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return {
        audioDevices: devices.filter((d) => d.kind === 'audioinput'),
        videoDevices: devices.filter((d) => d.kind === 'videoinput'),
      };
    } catch (error) {
      throw new Error(`Failed to enumerate devices: ${error}`);
    }
  }

  /**
   * Replace track in peer connection
   */
  static async replaceTrack(
    peerConnection: RTCPeerConnection,
    newStream: MediaStream,
    trackType: 'audio' | 'video'
  ): Promise<void> {
    const newTrack = trackType === 'audio' ? newStream.getAudioTracks()[0] : newStream.getVideoTracks()[0];

    if (!newTrack) throw new Error(`No ${trackType} track in stream`);

    const senders = await peerConnection.getSenders();
    const sender = senders.find((s) => s.track?.kind === trackType);

    if (sender) {
      await sender.replaceTrack(newTrack);
    }
  }
}
