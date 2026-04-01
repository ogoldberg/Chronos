import { REGION_LANES } from '../data/regions';

interface Props {
  lanesEnabled: boolean;
  onToggle: () => void;
  activeLanes: Set<string>;
  onToggleLane: (laneId: string) => void;
}

export default function LaneToggle({ lanesEnabled, onToggle, activeLanes, onToggleLane }: Props) {
  return (
    <div style={{
      position: 'absolute',
      bottom: 20,
      left: '50%',
      transform: 'translateX(-50%)',
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      zIndex: 20,
      background: 'rgba(13, 17, 23, 0.9)',
      borderRadius: 14,
      padding: '6px 12px',
      border: '1px solid rgba(255,255,255,0.08)',
      backdropFilter: 'blur(10px)',
    }}>
      <button
        onClick={onToggle}
        style={{
          background: lanesEnabled ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.06)',
          border: `1px solid ${lanesEnabled ? 'rgba(59,130,246,0.4)' : 'rgba(255,255,255,0.1)'}`,
          borderRadius: 8,
          padding: '4px 10px',
          color: lanesEnabled ? '#3b82f6' : '#ffffff80',
          fontSize: 11,
          cursor: 'pointer',
          fontWeight: 600,
          whiteSpace: 'nowrap',
        }}
      >
        {lanesEnabled ? '↕ Lanes ON' : '↕ Compare Regions'}
      </button>

      {lanesEnabled && (
        <div style={{ display: 'flex', gap: 4 }}>
          {REGION_LANES.map(lane => {
            const active = activeLanes.has(lane.id);
            return (
              <button
                key={lane.id}
                onClick={() => onToggleLane(lane.id)}
                style={{
                  background: active ? `${lane.color}20` : 'transparent',
                  border: `1px solid ${active ? lane.color + '60' : 'rgba(255,255,255,0.06)'}`,
                  borderRadius: 6,
                  padding: '2px 6px',
                  color: active ? lane.color : '#ffffff40',
                  fontSize: 10,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
                title={lane.label}
              >
                {lane.emoji}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
