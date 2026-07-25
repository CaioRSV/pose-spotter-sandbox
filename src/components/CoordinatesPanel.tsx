import React, { useState } from 'react';
import { Landmark, LANDMARK_NAMES } from '../types/pose';

interface CoordinatesPanelProps {
  landmarks: Landmark[] | null;
}

export default function CoordinatesPanel({ landmarks }: CoordinatesPanelProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <div className="coords-panel-wrapper glass-panel">
      <div className="coords-panel-header">
        <h3>
          <div className="pulse-dot" />
          <span>LIVESTREAM METRICS</span>
        </h3>
        <button 
          onClick={() => setIsCollapsed(!isCollapsed)} 
          className="btn-glass"
          style={{ padding: '4px 8px', fontSize: '0.7rem' }}
        >
          {isCollapsed ? 'EXPAND' : 'COLLAPSE'}
        </button>
      </div>

      {!isCollapsed && (
        <div className="coords-content-scroll">
          {(!landmarks || landmarks.length === 0) ? (
            <div style={{ 
              fontFamily: 'var(--font-mono)', 
              fontSize: '0.75rem', 
              color: 'hsl(var(--fg-muted))', 
              textAlign: 'center', 
              padding: '20px 0' 
            }}>
              // WAITING FOR TELEMETRY DATA
            </div>
          ) : (
            <div className="coords-grid">
              <div className="coords-grid-header">Joint</div>
              <div className="coords-grid-header" style={{ textAlign: 'right' }}>X</div>
              <div className="coords-grid-header" style={{ textAlign: 'right' }}>Y</div>
              <div className="coords-grid-header" style={{ textAlign: 'right' }}>Z</div>
              <div className="coords-grid-header" style={{ textAlign: 'right' }}>Vis</div>

              {landmarks.map((lm, idx) => {
                const vis = lm.visibility ?? 1.0;
                const isLowVis = vis < 0.5;
                const jointName = LANDMARK_NAMES[idx] || `Point ${idx}`;
                
                return (
                  <React.Fragment key={idx}>
                    <div 
                      className="coords-row-name" 
                      title={jointName}
                      style={{ color: isLowVis ? 'hsl(var(--fg-muted))' : '#fff' }}
                    >
                      {idx.toString().padStart(2, '0')} {jointName}
                    </div>
                    <div className="coords-row-val">{lm.x.toFixed(3)}</div>
                    <div className="coords-row-val">{lm.y.toFixed(3)}</div>
                    <div className="coords-row-val">{lm.z.toFixed(3)}</div>
                    <div 
                      className={`coords-row-val ${isLowVis ? 'low-vis' : ''}`}
                      style={{ color: isLowVis ? 'hsl(var(--accent-orange))' : 'hsl(var(--accent-green))' }}
                    >
                      {vis.toFixed(2)}
                    </div>
                  </React.Fragment>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
