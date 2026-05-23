import { useRef, useCallback, useEffect, useState } from 'react';
import { Role } from '@/game/types';

interface Props {
  role: Role;
  canAction: boolean; // near task for crew, near target for imposter/protector
  actionLabel: string; // "TASK" | "KILL" | "FREEZE"
  onMove: (dx: number, dy: number) => void;
  onAction: () => void;
}

export default function MobileControls({ role, canAction, actionLabel, onMove, onAction }: Props) {
  const joystickRef = useRef<HTMLDivElement>(null);
  const [knobPos, setKnobPos] = useState({ x: 0, y: 0 });
  const activeTouch = useRef<number | null>(null);
  const centerRef = useRef({ x: 0, y: 0 });

  const JOYSTICK_R = 50;

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (activeTouch.current !== null) return;
    const touch = e.touches[0];
    const rect = joystickRef.current?.getBoundingClientRect();
    if (!rect) return;
    activeTouch.current = touch.identifier;
    centerRef.current = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    const dx = touch.clientX - centerRef.current.x;
    const dy = touch.clientY - centerRef.current.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    const clamped = Math.min(d, JOYSTICK_R);
    const nx = d > 0 ? (dx / d) * clamped : 0;
    const ny = d > 0 ? (dy / d) * clamped : 0;
    setKnobPos({ x: nx, y: ny });
    onMove(d > 5 ? dx / d : 0, d > 5 ? dy / d : 0);
  }, [onMove]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (activeTouch.current === null) return;
    for (let i = 0; i < e.touches.length; i++) {
      const touch = e.touches[i];
      if (touch.identifier === activeTouch.current) {
        const dx = touch.clientX - centerRef.current.x;
        const dy = touch.clientY - centerRef.current.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        const clamped = Math.min(d, JOYSTICK_R);
        const nx = d > 0 ? (dx / d) * clamped : 0;
        const ny = d > 0 ? (dy / d) * clamped : 0;
        setKnobPos({ x: nx, y: ny });
        onMove(d > 5 ? dx / d : 0, d > 5 ? dy / d : 0);
        break;
      }
    }
  }, [onMove]);

  const handleTouchEnd = useCallback(() => {
    activeTouch.current = null;
    setKnobPos({ x: 0, y: 0 });
    onMove(0, 0);
  }, [onMove]);

  const actionColor = role === 'imposter' ? '#e03030' : role === 'protector' ? '#ffaa33' : '#4a90d9';

  return (
    <div className="fixed inset-0 pointer-events-none z-40" style={{ touchAction: 'none' }}>
      {/* Joystick - bottom left */}
      <div
        ref={joystickRef}
        className="pointer-events-auto absolute"
        style={{
          bottom: 40,
          left: 30,
          width: 120,
          height: 120,
          borderRadius: '50%',
          background: 'rgba(255,255,255,0.1)',
          border: '2px solid rgba(255,255,255,0.25)',
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
      >
        <div
          style={{
            position: 'absolute',
            width: 44,
            height: 44,
            borderRadius: '50%',
            background: 'rgba(255,255,255,0.4)',
            border: '2px solid rgba(255,255,255,0.6)',
            left: 60 - 22 + knobPos.x,
            top: 60 - 22 + knobPos.y,
            transition: activeTouch.current !== null ? 'none' : 'all 0.15s',
          }}
        />
      </div>

      {/* Action button - bottom right */}
      <button
        className="pointer-events-auto absolute"
        style={{
          bottom: 50,
          right: 30,
          width: 80,
          height: 80,
          borderRadius: '50%',
          background: canAction ? actionColor : 'rgba(100,100,100,0.4)',
          border: `3px solid ${canAction ? 'white' : 'rgba(255,255,255,0.2)'}`,
          color: 'white',
          fontFamily: 'monospace',
          fontWeight: 'bold',
          fontSize: 14,
          opacity: canAction ? 1 : 0.5,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
        onTouchStart={(e) => {
          e.preventDefault();
          if (canAction) onAction();
        }}
      >
        {actionLabel}
      </button>
    </div>
  );
}
