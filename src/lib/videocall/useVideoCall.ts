import { useState, useCallback, useRef, useEffect } from 'react';
import { SupabaseService } from './supabaseService';
import { WebRTCService } from './webrtcService';
import { MediaService } from './mediaService';
import { supabase } from './supabaseClient';
import toast from 'react-hot-toast';

interface UseVideoCallProps {
  mentorId?: string;
  durationMinutes?: number;
}

export const useVideoCall = ({ mentorId, durationMinutes }: UseVideoCallProps = {}) => {
  const [roomId, setRoomId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
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
  const subscriptionRef = useRef<any>(null);

  // Initialize User ID
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user) setUserId(data.user.id);
    });
  }, []);

  const cleanup = useCallback(() => {
    if (localStream) {
      localStream.getTracks().forEach((track) => track.stop());
    }
    webrtcServiceRef.current?.close();
    webrtcServiceRef.current = null;
    if (subscriptionRef.current) {
      supabase.removeChannel(subscriptionRef.current);
      subscriptionRef.current = null;
    }
    setLocalStream(null);
    setRemoteStream(null);
    setRoomId(null);
  }, []); // Remove localStream dependency to prevent premature cleanup

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  // Initialize WebRTC and Signaling
  const initializeSession = useCallback(async (currentRoomId: string, currentUserId: string) => {
    try {
      // 1. Get Local Media
      const stream = await MediaService.getUserMedia({
        audio: true,
        video: { width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      setLocalStream(stream);

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      // 2. Init WebRTC Service
      const webrtc = new WebRTCService();
      webrtcServiceRef.current = webrtc;
      await webrtc.initialize(stream);

      // Handle Remote Track
      webrtc.onRemoteTrack((stream) => {
        setRemoteStream(stream);
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = stream;
        }
      });

      // Handle ICE Candidates -> Send to Supabase
      webrtc.onIceCandidate(async (candidate) => {
        if (candidate) {
          await SupabaseService.storeSignal({
            room_id: currentRoomId,
            sender_id: currentUserId,
            signal_type: 'ice',
            signal_data: candidate.toJSON(),
          });
        }
      });

      // 3. Subscribe to Signals
      const subscription = SupabaseService.subscribeToSignals(currentRoomId, async (signal) => {
        if (signal.sender_id === currentUserId) return; // Ignore own signals

        try {
          if (signal.signal_type === 'offer') {
            toast('Incoming call connection...', { icon: '📞' });
            await webrtc.setRemoteDescription(signal.signal_data);
            const answer = await webrtc.createAnswer(signal.signal_data);

            await SupabaseService.storeSignal({
              room_id: currentRoomId,
              sender_id: currentUserId,
              signal_type: 'answer',
              signal_data: answer,
            });
          } else if (signal.signal_type === 'answer') {
            await webrtc.setRemoteDescription(signal.signal_data);
          } else if (signal.signal_type === 'ice') {
            await webrtc.addIceCandidate(signal.signal_data);
          }
        } catch (err) {
          console.error('Signaling error:', err);
        }
      });
      subscriptionRef.current = subscription;

      // 4. Check for existing offer (if we are joining)
      // If we are the first one, we create an offer.
      const signals = await SupabaseService.getSignals(currentRoomId);
      const existingOffer = signals.find(s => s.signal_type === 'offer');

      if (!existingOffer) {
        // No offer found, so we create one
        const offer = await webrtc.createOffer();
        await SupabaseService.storeSignal({
          room_id: currentRoomId,
          sender_id: currentUserId,
          signal_type: 'offer',
          signal_data: offer,
        });
      } else if (existingOffer.sender_id !== currentUserId) {
        // Offer exists from someone else, process it
        await webrtc.setRemoteDescription(existingOffer.signal_data);
        const answer = await webrtc.createAnswer(existingOffer.signal_data);
        await SupabaseService.storeSignal({
          room_id: currentRoomId,
          sender_id: currentUserId,
          signal_type: 'answer',
          signal_data: answer,
        });

        // Process any existing ICE candidates from remote
        const remoteIce = signals.filter(s => s.signal_type === 'ice' && s.sender_id !== currentUserId);
        for (const ice of remoteIce) {
          await webrtc.addIceCandidate(ice.signal_data);
        }
      }

    } catch (err) {
      console.error('Initialization error:', err);
      throw err;
    }
  }, []);

  const joinSession = useCallback(async (existingRoomId: string) => {
    if (!userId) {
      // Try to get authenticated user
      const { data } = await supabase.auth.getUser();
      let currentUserId: string;

      if (data.user) {
        currentUserId = data.user.id;
        setUserId(currentUserId);
      } else {
        // No authenticated user - generate temporary guest ID
        const tempId = `guest-${Math.random().toString(36).substring(2, 15)}`;
        currentUserId = tempId;
        setUserId(tempId);
        console.log('Using temporary guest ID:', tempId);
      }

      return joinSessionWithUser(existingRoomId, currentUserId);
    }
    return joinSessionWithUser(existingRoomId, userId);
  }, [userId, initializeSession]);

  const joinSessionWithUser = async (targetRoomId: string, currentUserId: string) => {
    try {
      setIsLoading(true);
      setError(null);
      setRoomId(targetRoomId);

      await initializeSession(targetRoomId, currentUserId);

      toast.success('Joined session');
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to join session';
      setError(errorMsg);
      toast.error(errorMsg);
    } finally {
      setIsLoading(false);
    }
  };

  const startSession = useCallback(async () => {
    // Get or create user ID
    let currentUserId = userId;
    if (!userId) {
      const { data } = await supabase.auth.getUser();
      if (data.user) {
        currentUserId = data.user.id;
        setUserId(currentUserId);
      } else {
        // Generate temporary guest ID
        const tempId = `guest-${Math.random().toString(36).substring(2, 15)}`;
        currentUserId = tempId;
        setUserId(tempId);
        console.log('Using temporary guest ID:', tempId);
      }
    }

    if (!mentorId || !durationMinutes) {
      toast.error('Missing session details');
      return;
    }

    try {
      console.log('🚀 Starting session for user:', currentUserId);
      setIsLoading(true);
      setError(null);

      const room = await SupabaseService.createRoom(mentorId, durationMinutes);
      console.log('✅ Room created:', room.id);
      setRoomId(room.id);

      await initializeSession(room.id, currentUserId!);

      toast.success('Session started successfully');
      console.log('✅ Session started successfully');
      return room.id;
    } catch (err) {
      console.error('❌ Failed to start session:', err);
      const errorMsg = err instanceof Error ? err.message : 'Failed to start session';
      setError(errorMsg);
      toast.error(`Start failed: ${errorMsg}`);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [mentorId, durationMinutes, userId, initializeSession]);

  const endSession = useCallback(async () => {
    try {
      if (roomId) {
        await SupabaseService.updateRoomStatus(roomId, 'ended');
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to end session';
      setError(errorMsg);
      toast.error(errorMsg);
    } finally {
      cleanup();
    }
  }, [roomId, cleanup]);

  const toggleCamera = useCallback((enabled?: boolean) => {
    if (localStream) {
      const newState = enabled !== undefined ? enabled : !isCameraOn;
      MediaService.toggleVideo(localStream, newState);
      setIsCameraOn(newState);
      toast.success(newState ? 'Camera on' : 'Camera off');
    }
  }, [localStream, isCameraOn]);

  const toggleMicrophone = useCallback((enabled?: boolean) => {
    if (localStream) {
      const newState = enabled !== undefined ? enabled : !isMicOn;
      MediaService.toggleAudio(localStream, newState);
      setIsMicOn(newState);
      toast.success(newState ? 'Microphone on' : 'Microphone off');
    }
  }, [localStream, isMicOn]);

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

  const sendChatMessage = useCallback(async (message: string) => {
    if (!roomId || !userId) return;
    try {
      await SupabaseService.sendMessage({
        room_id: roomId,
        user_id: userId,
        user_name: 'User', // TODO: Fetch real name
        message,
      });
    } catch (err) {
      toast.error('Failed to send message');
    }
  }, [roomId, userId]);

  const updateTypingStatus = useCallback(async (isTyping: boolean) => {
    if (!roomId || !userId) return;
    try {
      await SupabaseService.updateTypingStatus(roomId, userId, isTyping, 'User');
    } catch (err) {
      console.error('Failed to update typing status:', err);
    }
  }, [roomId, userId]);

  const leaveSession = useCallback(() => {
    cleanup();
  }, [cleanup]);

  return {
    roomId,
    userId,
    isLoading,
    error,
    localStream,
    remoteStream,
    localVideoRef,
    remoteVideoRef,
    isCameraOn,
    isMicOn,
    isScreenSharing,
    joinSession,
    startSession,
    endSession,
    leaveSession,
    toggleCamera,
    toggleMicrophone,
    shareScreen,
    stopScreenShare,
    sendChatMessage,
    updateTypingStatus,
  };
};
