import { useState, useCallback, useRef, useEffect } from 'react';
import { SupabaseService } from './supabaseService.js';
import { WebRTCService } from './webrtcService.js';
import { MediaService } from './mediaService.js';
import toast from 'react-hot-toast';

interface UseVideoCallProps {
  mentorId: string;
  durationMinutes: number;
}

export const useVideoCall = ({ mentorId, durationMinutes }: UseVideoCallProps) => {
  const [roomId, setRoomId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isCameraOn, setIsCameraOn] = useState(true);
  const [isMicOn, setIsMicOn] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const webrtcServiceRef = useRef<WebRTCService | null>(null);

  // Start session
  const startSession = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Create room in Supabase
      const room = await SupabaseService.createRoom(mentorId, durationMinutes);
      setRoomId(room.id);

      // Get local media stream
      const stream = await MediaService.getUserMedia({
        audio: true,
        video: { width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      setLocalStream(stream);

      // Attach to local video element
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      // Initialize WebRTC
      webrtcServiceRef.current = new WebRTCService();
      await webrtcServiceRef.current.initialize(stream);

      // Setup remote track handler
      webrtcServiceRef.current.onRemoteTrack((remoteStream) => {
        setRemoteStream(remoteStream);
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = remoteStream;
        }
      });

      toast.success('Session started! Waiting for participant...');
      return room.id;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to start session';
      setError(errorMsg);
      toast.error(errorMsg);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [mentorId, durationMinutes]);

  // End session
  const endSession = useCallback(async () => {
    try {
      if (roomId) {
        await SupabaseService.updateRoomStatus(roomId, 'ended');
      }

      // Stop all tracks
      localStream?.getTracks().forEach((track) => track.stop());
      remoteStream?.getTracks().forEach((track) => track.stop());

      // Cleanup WebRTC
      webrtcServiceRef.current?.close();

      setLocalStream(null);
      setRemoteStream(null);
      setRoomId(null);
      setIsCameraOn(true);
      setIsMicOn(true);

      toast.success('Session ended');
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to end session';
      toast.error(errorMsg);
    }
  }, [roomId, localStream, remoteStream]);

  // Toggle camera
  const toggleCamera = useCallback(
    (enabled?: boolean) => {
      if (localStream) {
        const newState = enabled !== undefined ? enabled : !isCameraOn;
        MediaService.toggleVideo(localStream, newState);
        setIsCameraOn(newState);
        toast.success(newState ? 'Camera on' : 'Camera off');
      }
    },
    [localStream, isCameraOn]
  );

  // Toggle microphone
  const toggleMicrophone = useCallback(
    (enabled?: boolean) => {
      if (localStream) {
        const newState = enabled !== undefined ? enabled : !isMicOn;
        MediaService.toggleAudio(localStream, newState);
        setIsMicOn(newState);
        toast.success(newState ? 'Microphone on' : 'Microphone off');
      }
    },
    [localStream, isMicOn]
  );

  // Share screen
  const shareScreen = useCallback(async () => {
    try {
      const screenStream = await MediaService.getScreenMedia();
      const screenTrack = screenStream.getVideoTracks()[0];

      if (webrtcServiceRef.current) {
        const pc = webrtcServiceRef.current.getPeerConnection();
        const senders = await pc.getSenders();
        const videoSender = senders.find((s) => s.track?.kind === 'video');

        if (videoSender) {
          await videoSender.replaceTrack(screenTrack);
          setIsScreenSharing(true);
          toast.success('Screen sharing started');

          // Stop screen sharing when user stops sharing
          screenTrack.onended = async () => {
            if (localStream) {
              const videoTrack = localStream.getVideoTracks()[0];
              await videoSender.replaceTrack(videoTrack);
              setIsScreenSharing(false);
              toast.success('Screen sharing stopped');
            }
          };
        }
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'NotAllowedError') {
        toast.error('Screen sharing cancelled');
      } else {
        toast.error('Failed to share screen');
      }
    }
  }, [localStream]);

  // Stop screen sharing
  const stopScreenShare = useCallback(async () => {
    try {
      if (localStream && webrtcServiceRef.current) {
        const videoTrack = localStream.getVideoTracks()[0];
        const pc = webrtcServiceRef.current.getPeerConnection();
        const senders = await pc.getSenders();
        const videoSender = senders.find((s) => s.track?.kind === 'video');

        if (videoSender && videoTrack) {
          await videoSender.replaceTrack(videoTrack);
          setIsScreenSharing(false);
          toast.success('Screen sharing stopped');
        }
      }
    } catch (err) {
      toast.error('Failed to stop screen sharing');
    }
  }, [localStream]);

  // Send chat message
  const sendChatMessage = useCallback(
    async (message: string) => {
      if (!roomId) return;

      try {
        await SupabaseService.sendMessage({
          room_id: roomId,
          user_id: mentorId,
          user_name: 'User',
          message,
        });
      } catch (err) {
        toast.error('Failed to send message');
      }
    },
    [roomId, mentorId]
  );

  // Update typing status
  const updateTypingStatus = useCallback(
    async (isTyping: boolean) => {
      if (!roomId) return;

      try {
        await SupabaseService.updateTypingStatus(roomId, mentorId, isTyping, 'User');
      } catch (err) {
        console.error('Failed to update typing status:', err);
      }
    },
    [roomId, mentorId]
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      localStream?.getTracks().forEach((track) => track.stop());
      webrtcServiceRef.current?.close();
    };
  }, [localStream]);

  return {
    roomId,
    isLoading,
    error,
    localStream,
    remoteStream,
    localVideoRef,
    remoteVideoRef,
    isCameraOn,
    isMicOn,
    isScreenSharing,
    startSession,
    endSession,
    toggleCamera,
    toggleMicrophone,
    shareScreen,
    stopScreenShare,
    sendChatMessage,
    updateTypingStatus,
  };
};
