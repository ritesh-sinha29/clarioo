import { useVideoCall } from '@/lib/videocall/useVideoCall';
import { useState } from 'react';
import { useRouter } from 'next/router';
import { v4 as uuidv4 } from 'uuid';

export default function StartSessionButton() {
  const router = useRouter();
  const [durationMinutes, setDurationMinutes] = useState(30);
  const { startSession, isLoading, error } = useVideoCall({
    mentorId: uuidv4(), // Replace with actual logged-in user ID
    durationMinutes,
  });

  const handleStartSession = async () => {
    try {
      const roomId = await startSession();
      if (roomId) {
        // Redirect to video call room
        router.push(`/room/${roomId}`);
      }
    } catch (err) {
      console.error('Error starting session:', err);
    }
  };

  return (
    <div style={{ padding: '20px', textAlign: 'center' }}>
      <h1>Start a Video Session</h1>

      {error && (
        <div style={{ color: 'red', marginBottom: '10px' }}>
          Error: {error}
        </div>
      )}

      <div style={{ marginBottom: '20px' }}>
        <label htmlFor="duration" style={{ display: 'block', marginBottom: '10px' }}>
          Session Duration (minutes):
        </label>
        <input
          id="duration"
          type="number"
          value={durationMinutes}
          onChange={(e) => setDurationMinutes(Number(e.target.value))}
          min="1"
          max="480"
          style={{
            padding: '8px',
            fontSize: '16px',
            borderRadius: '4px',
            border: '1px solid #ccc',
          }}
        />
      </div>

      <button
        onClick={handleStartSession}
        disabled={isLoading}
        style={{
          padding: '12px 24px',
          fontSize: '16px',
          backgroundColor: '#0070f3',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: isLoading ? 'not-allowed' : 'pointer',
          opacity: isLoading ? 0.6 : 1,
        }}
      >
        {isLoading ? 'Starting Session...' : 'Start Video Session'}
      </button>
    </div>
  );
}
