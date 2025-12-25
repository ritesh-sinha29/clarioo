"use client";
import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { useVideoCall } from "@/lib/videocall/useVideoCall";
import { supabase } from "@/lib/videocall/supabaseClient";
import toast from "react-hot-toast";
import EmojiPicker, { Theme } from "emoji-picker-react";
import {
  FaMicrophone, FaMicrophoneSlash, FaVideo, FaVideoSlash,
  FaDesktop, FaPhoneSlash, FaComments, FaTimes, FaUserCircle,
  FaPaperPlane, FaSmile, FaCopy, FaCheck
} from "react-icons/fa";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function RoomPage() {
  const { roomid } = useParams();
  const router = useRouter();

  const {
    joinSession,
    endSession,
    leaveSession,
    localVideoRef,
    remoteVideoRef,
    toggleCamera,
    toggleMicrophone,
    shareScreen,
    stopScreenShare,
    isCameraOn,
    isMicOn,
    isScreenSharing,
    userId,
    localStream,
    remoteStream,
    isLoading
  } = useVideoCall();

  // UI State
  const [showChat, setShowChat] = useState(true);
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [remoteTyping, setRemoteTyping] = useState(false);
  const [copied, setCopied] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  // Call duration timer
  useEffect(() => {
    const timer = setInterval(() => {
      setCallDuration(prev => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  useEffect(() => {
    if (roomid) {
      const id = Array.isArray(roomid) ? roomid[0] : roomid;
      checkRoomAndJoin(id);
      loadChatHistory(id);
      subscribeToChat(id);
      subscribeToTyping(id);
    }
  }, [roomid]);

  // Auto-scroll chat
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [chatMessages]);

  const checkRoomAndJoin = async (id: string) => {
    const { data: room, error } = await supabase
      .from("rooms")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !room) {
      toast.error("Room not found");
      router.push("/");
      return;
    }

    if (room.status !== "active") {
      toast.error("This session has ended");
      return;
    }

    joinSession(id);
  };

  const loadChatHistory = async (id: string) => {
    try {
      const { data, error } = await supabase
        .from("chat_messages")
        .select("*")
        .eq("room_id", id)
        .order("created_at", { ascending: true });

      if (error) {
        console.error("Failed to load chat history:", error);
        return;
      }
      if (data) {
        console.log("Chat history loaded:", data.length, "messages");
        setChatMessages(data);
      }
    } catch (err) {
      console.error("Chat history error:", err);
    }
  };

  const subscribeToChat = (id: string) => {
    console.log("Subscribing to chat for room:", id);
    const channel = supabase
      .channel(`chat-${id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "chat_messages",
          filter: `room_id=eq.${id}`,
        },
        (payload) => {
          console.log("New chat message received:", payload.new);
          setChatMessages((prev) => [...prev, payload.new as any]);
        }
      )
      .subscribe((status) => {
        console.log("Chat subscription status:", status);
      });

    return channel;
  };

  const subscribeToTyping = (id: string) => {
    supabase
      .channel(`typing-${id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "typing_status",
          filter: `room_id=eq.${id}`,
        },
        (payload: { new?: { is_typing?: boolean } }) => {
          setRemoteTyping(payload.new?.is_typing ?? false);
        }
      )
      .subscribe();
  };

  const sendMessage = async () => {
    console.log("🔵 Send clicked - message:", newMessage, "roomid:", roomid, "userId:", userId);
    if (!newMessage.trim() || !roomid) {
      console.log("❌ Blocked - empty or no room");
      return;
    }
    const id = Array.isArray(roomid) ? roomid[0] : roomid;

    try {
      console.log("Sending message:", newMessage);
      const { data, error } = await supabase.from("chat_messages").insert({
        room_id: id,
        user_id: userId || "anonymous",
        message: newMessage,
      }).select().single();

      if (error) {
        console.error("Failed to send message:", error);
        toast.error("Failed to send message");
        return;
      }

      console.log("Message sent successfully:", data);
      setNewMessage("");
      setShowEmojiPicker(false);
    } catch (err) {
      console.error("Send message error:", err);
      toast.error("Failed to send message");
    }
  };

  const handleTyping = (e: React.ChangeEvent<HTMLInputElement>) => {
    setNewMessage(e.target.value);
    if (!roomid) return;
    const id = Array.isArray(roomid) ? roomid[0] : roomid;

    supabase.from("typing_status").upsert({
      room_id: id,
      is_typing: true,
      updated_at: new Date().toISOString(),
    });

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    typingTimeoutRef.current = setTimeout(() => {
      supabase.from("typing_status").upsert({
        room_id: id,
        is_typing: false,
        updated_at: new Date().toISOString(),
      });
    }, 1500);
  };

  const handleEndSession = async () => {
    await endSession();
    router.push("/");
  };

  const toggleScreenShare = () => {
    if (isScreenSharing) stopScreenShare();
    else shareScreen();
  };

  const copyRoomLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    toast.success("Room link copied!");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="h-screen w-full bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 flex overflow-hidden">
      {/* Main Video Area */}
      <div className="flex-1 flex flex-col p-4 lg:p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg">
              <FaVideo className="text-white text-sm" />
            </div>
            <div>
              <h1 className="font-raleway text-white font-semibold text-lg">Clario Session</h1>
              <p className="text-indigo-300 text-sm font-inter">
                {formatDuration(callDuration)} • {localStream ? "In Call" : "Connecting..."}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowChat(!showChat)}
              className="text-white hover:bg-white/10"
            >
              <FaComments />
            </Button>
          </div>
        </div>

        {/* Video Grid */}
        <div className="flex-1 relative rounded-2xl overflow-hidden bg-gradient-to-br from-slate-800/50 to-slate-900/50 backdrop-blur-xl border border-white/10 shadow-2xl">
          {/* Remote Video (Full) */}
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className="absolute inset-0 w-full h-full object-cover"
          />

          {/* Remote Video Placeholder - Shows your camera when no remote yet */}
          {!remoteStream && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-slate-800 to-slate-900">
              <div className="w-24 h-24 rounded-full bg-gradient-to-br from-indigo-500/30 to-purple-600/30 flex items-center justify-center mb-4">
                <FaUserCircle className="text-5xl text-indigo-400" />
              </div>
              <p className="text-white/60 font-inter text-center">
                Your video is ready
              </p>
            </div>
          )}

          {/* Local Video (PiP) */}
          <div className="absolute bottom-4 right-4 w-32 h-24 sm:w-48 sm:h-36 lg:w-64 lg:h-48 rounded-xl overflow-hidden border-2 border-indigo-500/50 shadow-2xl bg-slate-900/80 backdrop-blur-sm transition-all hover:scale-105">
            <video
              ref={localVideoRef}
              autoPlay
              muted
              playsInline
              className="w-full h-full object-cover"
            />
            {!localStream && (
              <div className="absolute inset-0 flex items-center justify-center bg-slate-800">
                <FaUserCircle className="text-3xl text-slate-600" />
              </div>
            )}
            {!isCameraOn && localStream && (
              <div className="absolute inset-0 flex items-center justify-center bg-slate-800">
                <FaVideoSlash className="text-2xl text-slate-500" />
              </div>
            )}
            <div className="absolute bottom-2 left-2 bg-black/60 px-2 py-1 rounded-lg">
              <span className="text-white text-xs font-inter">You</span>
            </div>
          </div>

          {/* Loading Overlay */}
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm z-10">
              <div className="flex flex-col items-center gap-3">
                <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                <p className="text-white font-inter">Connecting...</p>
              </div>
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="mt-4 flex items-center justify-center gap-3">
          {/* Mic Toggle */}
          <button
            onClick={() => toggleMicrophone()}
            className={`w-14 h-14 rounded-xl flex items-center justify-center transition-all shadow-lg hover:scale-105 ${isMicOn
              ? "bg-white/10 text-white hover:bg-white/20 border border-white/20"
              : "bg-red-500/80 text-white hover:bg-red-600"
              }`}
          >
            {isMicOn ? <FaMicrophone size={20} /> : <FaMicrophoneSlash size={20} />}
          </button>

          {/* Camera Toggle */}
          <button
            onClick={() => toggleCamera()}
            className={`w-14 h-14 rounded-xl flex items-center justify-center transition-all shadow-lg hover:scale-105 ${isCameraOn
              ? "bg-white/10 text-white hover:bg-white/20 border border-white/20"
              : "bg-red-500/80 text-white hover:bg-red-600"
              }`}
          >
            {isCameraOn ? <FaVideo size={20} /> : <FaVideoSlash size={20} />}
          </button>

          {/* End Call */}
          <button
            onClick={handleEndSession}
            className="px-8 h-14 rounded-xl bg-gradient-to-r from-red-500 to-pink-500 text-white font-semibold flex items-center justify-center gap-2 transition-all shadow-lg hover:scale-105 hover:shadow-red-500/25"
          >
            <FaPhoneSlash size={18} />
            <span className="hidden sm:inline font-inter">End Session</span>
          </button>

          {/* Screen Share */}
          <button
            onClick={toggleScreenShare}
            className={`w-14 h-14 rounded-xl flex items-center justify-center transition-all shadow-lg hover:scale-105 ${isScreenSharing
              ? "bg-indigo-500 text-white"
              : "bg-white/10 text-white hover:bg-white/20 border border-white/20"
              }`}
          >
            <FaDesktop size={20} />
          </button>

          {/* Chat Toggle (Desktop) */}
          <button
            onClick={() => setShowChat(!showChat)}
            className={`w-14 h-14 rounded-xl hidden lg:flex items-center justify-center transition-all shadow-lg hover:scale-105 ${showChat
              ? "bg-indigo-500 text-white"
              : "bg-white/10 text-white hover:bg-white/20 border border-white/20"
              }`}
          >
            <FaComments size={20} />
          </button>
        </div>
      </div>

      {/* Chat Sidebar */}
      <div className={`${showChat ? "w-80 lg:w-96" : "w-0"} transition-all duration-300 overflow-hidden bg-slate-900/80 backdrop-blur-xl border-l border-white/10`}>
        <div className="w-80 lg:w-96 h-full flex flex-col">
          {/* Chat Header */}
          <div className="p-4 border-b border-white/10 flex items-center justify-between">
            <h2 className="text-white font-semibold font-raleway flex items-center gap-2">
              <FaComments className="text-indigo-400" />
              Chat
            </h2>
            <button
              onClick={() => setShowChat(false)}
              className="text-white/60 hover:text-white lg:hidden"
            >
              <FaTimes />
            </button>
          </div>

          {/* Messages */}
          <div
            ref={chatContainerRef}
            className="flex-1 overflow-y-auto p-4 space-y-3 scroll-container"
          >
            {chatMessages.length === 0 && (
              <div className="text-center text-white/40 py-8 font-inter">
                <FaComments className="mx-auto text-3xl mb-2 opacity-50" />
                <p>No messages yet</p>
                <p className="text-sm">Start the conversation!</p>
              </div>
            )}
            {chatMessages.map((msg, index) => (
              <div
                key={msg.id || index}
                className={`flex ${msg.user_id === userId ? 'justify-end' : 'justify-start'}`}
              >
                <div className={`max-w-[80%] rounded-2xl px-4 py-2 ${msg.user_id === userId
                  ? 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white'
                  : 'bg-white/10 text-white'
                  }`}>
                  <p className="font-inter text-sm">{msg.message}</p>
                </div>
              </div>
            ))}
            {remoteTyping && (
              <div className="flex justify-start">
                <div className="bg-white/10 rounded-2xl px-4 py-2 text-white/60 text-sm font-inter flex items-center gap-1">
                  <span className="flex gap-1">
                    <span className="w-2 h-2 bg-white/60 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-2 h-2 bg-white/60 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-2 h-2 bg-white/60 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Emoji Picker */}
          {showEmojiPicker && (
            <div className="p-2 border-t border-white/10">
              <EmojiPicker
                theme={Theme.DARK}
                width="100%"
                height={280}
                onEmojiClick={(emojiData) =>
                  setNewMessage((prev) => prev + emojiData.emoji)
                }
              />
            </div>
          )}

          {/* Input */}
          <div className="p-4 border-t border-white/10">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-white/60 hover:text-white hover:bg-white/20 transition-all"
              >
                <FaSmile />
              </button>
              <input
                type="text"
                value={newMessage}
                onChange={handleTyping}
                onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                placeholder="Type a message..."
                className="flex-1 bg-white/10 border border-white/20 rounded-xl px-4 py-2.5 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-inter"
              />
              <button
                onClick={sendMessage}
                disabled={!newMessage.trim()}
                className="w-10 h-10 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 flex items-center justify-center text-white disabled:opacity-50 hover:scale-105 transition-all shadow-lg"
              >
                <FaPaperPlane />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
