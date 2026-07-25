import React, { useState } from 'react';
import { PoseTrackerConfig } from '../types/pose';

interface TopBarProps {
  config: PoseTrackerConfig;
  onChangeConfig: (newConfig: Partial<PoseTrackerConfig>) => void;
  devices: MediaDeviceInfo[];
  fps: number;
  isModelLoading: boolean;
}

export default function TopBar({
  config,
  onChangeConfig,
  devices,
  fps,
  isModelLoading
}: TopBarProps) {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  return (
    <div className="top-bar-wrapper glass-panel">
      <div className="top-bar-title-row" style={{ display: 'flex', width: '100%', justifyContent: 'space-between', alignItems: 'center' }}>
        <div className="top-bar-title">
          <span className="title-glow">POSE</span>
          <span>SPOTTER</span>
          <div 
            className="pulse-dot" 
            style={{ 
              backgroundColor: isModelLoading ? 'hsl(var(--accent-orange))' : 'hsl(var(--accent-green))',
              boxShadow: isModelLoading ? '0 0 8px hsl(var(--accent-orange))' : '0 0 8px hsl(var(--accent-green))'
            }} 
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {/* Mobile FPS Counter */}
          <div className="mobile-fps-display" style={{ display: 'none', fontFamily: 'var(--font-mono)', fontSize: '0.825rem', fontWeight: 600, color: fps > 25 ? 'hsl(var(--accent-green))' : 'hsl(var(--accent-orange))' }}>
            {fps} FPS
          </div>

          <button 
            className={`btn-glass settings-toggle-btn ${isSettingsOpen ? 'active' : ''}`}
            onClick={() => setIsSettingsOpen(!isSettingsOpen)}
            style={{ display: 'none', padding: '6px 12px', fontSize: '0.75rem', gap: '5px' }}
          >
            <span>⚙️</span>
            <span>{isSettingsOpen ? 'CLOSE' : 'SETTINGS'}</span>
          </button>
        </div>
      </div>

      <div className={`controls-group ${isSettingsOpen ? 'mobile-open' : ''}`}>
        {/* Camera Selector */}
        <div className="control-item">
          <label htmlFor="camera-select">Camera Source</label>
          <select
            id="camera-select"
            className="select-glass"
            value={config.activeCameraId}
            onChange={(e) => onChangeConfig({ activeCameraId: e.target.value })}
          >
            {devices.length === 0 ? (
              <option value="">No Camera Detected</option>
            ) : (
              devices.map((device, index) => (
                <option key={device.deviceId} value={device.deviceId}>
                  {device.label || `Camera ${index + 1}`}
                </option>
              ))
            )}
          </select>
        </div>

        {/* Target Pose Selector */}
        <div className="control-item">
          <label htmlFor="target-pose-select">Target Pose</label>
          <select
            id="target-pose-select"
            className="select-glass"
            value={config.targetPose}
            onChange={(e) => onChangeConfig({ targetPose: e.target.value })}
            style={{ 
              borderColor: config.targetPose && config.targetPose !== 'None' ? 'hsl(var(--primary))' : undefined,
              boxShadow: config.targetPose && config.targetPose !== 'None' ? '0 0 8px hsl(var(--primary) / 0.2)' : undefined
            }}
          >
            <option value="None">None (Monitor Mode)</option>
            <option value="Standing">Standing</option>
            <option value="Squatting">Squatting</option>
            <option value="T-Pose">T-Pose</option>
            <option value="Arms Raised">Arms Raised</option>
            <option value="Hands on Hips">Hands on Hips</option>
            <option value="Waving">Waving (Wave Hand)</option>
            <option value="Jumping">Jumping (Jump Up)</option>
            <option value="Leaning Left">Leaning Left</option>
            <option value="Leaning Right">Leaning Right</option>
          </select>
        </div>

        {/* Model Complexity */}
        <div className="control-item">
          <label htmlFor="complexity-select">Model Tier</label>
          <select
            id="complexity-select"
            className="select-glass"
            value={config.modelComplexity}
            onChange={(e) => onChangeConfig({ modelComplexity: e.target.value as 'lite' | 'full' | 'heavy' })}
          >
            <option value="lite">Lite (Fastest)</option>
            <option value="full">Full (Balanced)</option>
            <option value="heavy">Heavy (Precise)</option>
          </select>
        </div>

        {/* Min Detection Confidence */}
        <div className="control-item slider-container">
          <div className="slider-label">
            <span>Detect Conf.</span>
            <span>{Math.round(config.minDetectionConfidence * 100)}%</span>
          </div>
          <input
            type="range"
            min="0.1"
            max="0.9"
            step="0.05"
            className="slider-glass"
            value={config.minDetectionConfidence}
            onChange={(e) => onChangeConfig({ minDetectionConfidence: parseFloat(e.target.value) })}
          />
        </div>

        {/* Min Tracking Confidence */}
        <div className="control-item slider-container">
          <div className="slider-label">
            <span>Track Conf.</span>
            <span>{Math.round(config.minTrackingConfidence * 100)}%</span>
          </div>
          <input
            type="range"
            min="0.1"
            max="0.9"
            step="0.05"
            className="slider-glass"
            value={config.minTrackingConfidence}
            onChange={(e) => onChangeConfig({ minTrackingConfidence: parseFloat(e.target.value) })}
          />
        </div>

        {/* Toggle Skeleton */}
        <div className="control-item" style={{ alignSelf: 'center', marginTop: '14px' }}>
          <label className="checkbox-container">
            <input
              type="checkbox"
              className="checkbox-glass"
              checked={config.showSkeleton}
              onChange={(e) => onChangeConfig({ showSkeleton: e.target.checked })}
            />
            <span>Render Skeleton</span>
          </label>
        </div>

        {/* FPS Counter */}
        <div className="control-item" style={{ minWidth: '70px', textAlign: 'right' }}>
          <label>Performance</label>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1rem', fontWeight: 600, color: fps > 25 ? 'hsl(var(--accent-green))' : 'hsl(var(--accent-orange))' }}>
            {fps} FPS
          </div>
        </div>
      </div>
    </div>
  );
}
