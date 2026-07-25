"use client";

import React, { useEffect, useRef, useState } from 'react';
import { PoseTrackerConfig, Landmark, ClassifiedPose } from '../types/pose';
import { detectPose } from '../utils/poseDetector';
import TopBar from './TopBar';
import CoordinatesPanel from './CoordinatesPanel';

export default function PoseTracker() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number | null>(null);

  // MediaPipe landmarker reference
  const landmarkerRef = useRef<any>(null);

  // States
  const [isModelLoading, setIsModelLoading] = useState(true);
  const [modelError, setModelError] = useState<string | null>(null);
  const [consoleLogs, setConsoleLogs] = useState<string[]>([]);
  const [showLogsPanel, setShowLogsPanel] = useState(false);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [landmarks, setLandmarks] = useState<Landmark[] | null>(null);
  const [currentPose, setCurrentPose] = useState<ClassifiedPose>({ name: 'Initializing...', confidence: 0 });
  const [fps, setFps] = useState<number>(0);
  const [isPoseMatched, setIsPoseMatched] = useState<boolean>(false);
  const [showCheckmark, setShowCheckmark] = useState<boolean>(false);

  // Configuration State
  const [config, setConfig] = useState<PoseTrackerConfig>({
    modelComplexity: 'full',
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5,
    showSkeleton: true,
    activeCameraId: '',
    targetPose: 'None',
  });

  // Dynamic gesture buffer and success state trackers
  const historyRef = useRef<Landmark[][]>([]);
  const wasMatchedRef = useRef<boolean>(false);
  const checkmarkTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Track FPS calculation variables
  const frameCountRef = useRef(0);
  const lastFpsUpdateRef = useRef(0);

  // Capture console streams for mobile debugging panel
  useEffect(() => {
    const handleLog = (type: string, ...args: any[]) => {
      const msg = args.map(arg => {
        if (arg instanceof Error) return arg.stack || arg.message;
        return typeof arg === 'object' ? JSON.stringify(arg) : String(arg);
      }).join(' ');
      setConsoleLogs((prev) => [...prev.slice(-30), `[${type}] ${msg}`]);
    };

    const originalLog = console.log;
    const originalWarn = console.warn;
    const originalError = console.error;

    console.log = (...args) => {
      originalLog.apply(console, args);
      handleLog('INFO', ...args);
    };
    console.warn = (...args) => {
      originalWarn.apply(console, args);
      handleLog('WARN', ...args);
    };
    console.error = (...args) => {
      originalError.apply(console, args);
      handleLog('ERROR', ...args);
    };

    const handleError = (e: ErrorEvent) => {
      handleLog('CRITICAL', `${e.message} at ${e.filename}:${e.lineno}`);
    };
    const handleRejection = (e: PromiseRejectionEvent) => {
      handleLog('REJECTION', e.reason?.stack || e.reason?.message || String(e.reason));
    };

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleRejection);

    return () => {
      console.log = originalLog;
      console.warn = originalWarn;
      console.error = originalError;
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleRejection);
    };
  }, []);

  // Connection mapping for skeletal drawing
  const CONNECTIONS = [
    // Torso
    [11, 12], [12, 24], [24, 23], [23, 11],
    // Left arm
    [11, 13], [13, 15],
    // Right arm
    [12, 14], [14, 16],
    // Left leg
    [23, 25], [25, 27], [27, 29], [29, 31], [27, 31],
    // Right leg
    [24, 26], [26, 28], [28, 30], [30, 32], [28, 32],
    // Face
    [0, 1], [1, 2], [2, 3], [3, 7],
    [0, 4], [4, 5], [5, 6], [6, 8],
    [9, 10]
  ];

  // Helper to change config partials
  const handleChangeConfig = (newConfig: Partial<PoseTrackerConfig>) => {
    setConfig((prev) => ({ ...prev, ...newConfig }));
  };

  // Enumerate active video cameras
  useEffect(() => {
    async function getDevices() {
      try {
        // Request temporary stream to trigger permission prompt so labels are available
        const tempStream = await navigator.mediaDevices.getUserMedia({ video: true });
        tempStream.getTracks().forEach(track => track.stop());

        const allDevices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = allDevices.filter(d => d.kind === 'videoinput');
        setDevices(videoDevices);

        // Choose first camera if none is set
        if (videoDevices.length > 0 && !config.activeCameraId) {
          handleChangeConfig({ activeCameraId: videoDevices[0].deviceId });
        }
      } catch (err) {
        console.error("Camera access error:", err);
      }
    }

    getDevices();
  }, []);

  // Initialize MediaPipe PoseLandmarker model dynamically
  useEffect(() => {
    let active = true;
    setIsModelLoading(true);
    setModelError(null);

    async function initModel() {
      try {
        // Dynamic import to prevent SSR build failures
        const { FilesetResolver, PoseLandmarker } = await import('@mediapipe/tasks-vision');

        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
        );

        // Map model tier to official Google Storage URLs
        const modelUrlMap = {
          lite: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
          full: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task",
          heavy: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_heavy/float16/1/pose_landmarker_heavy.task",
        };

        let landmarker;
        try {
          // Attempt loading using GPU delegation
          landmarker = await PoseLandmarker.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath: modelUrlMap[config.modelComplexity],
              delegate: "GPU"
            },
            runningMode: "VIDEO",
            numPoses: 1,
            minPoseDetectionConfidence: config.minDetectionConfidence,
            minPosePresenceConfidence: config.minTrackingConfidence
          });
        } catch (gpuErr) {
          console.warn("WebGL GPU delegation failed. Retrying with CPU delegate...", gpuErr);
          // Fallback to CPU delegation (required for many mobile browsers/Safari contexts)
          landmarker = await PoseLandmarker.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath: modelUrlMap[config.modelComplexity],
              delegate: "CPU"
            },
            runningMode: "VIDEO",
            numPoses: 1,
            minPoseDetectionConfidence: config.minDetectionConfidence,
            minPosePresenceConfidence: config.minTrackingConfidence
          });
        }

        if (active) {
          landmarkerRef.current = landmarker;
          setIsModelLoading(false);
        } else {
          landmarker.close();
        }
      } catch (err: any) {
        console.error("Failed to load MediaPipe model:", err);
        if (active) {
          setModelError(err?.message || String(err));
          // Keep loading overlay open but show the error state
        }
      }
    }

    initModel();

    return () => {
      active = false;
      if (landmarkerRef.current) {
        landmarkerRef.current.close();
        landmarkerRef.current = null;
      }
    };
  }, [config.modelComplexity, config.minDetectionConfidence, config.minTrackingConfidence]);

  // Bind WebRTC camera stream to video element
  useEffect(() => {
    let activeStream: MediaStream | null = null;
    
    async function bindCamera() {
      if (!videoRef.current || !config.activeCameraId) return;
      if (typeof navigator === 'undefined' || !navigator.mediaDevices) {
        console.error("WEBCAM BIND BLOCKED: navigator.mediaDevices is undefined (insecure connection).");
        return;
      }

      try {
        if (activeStream) {
          activeStream.getTracks().forEach(track => track.stop());
        }

        let stream: MediaStream;
        try {
          // Attempt exact matching with high resolution ideal values
          stream = await navigator.mediaDevices.getUserMedia({
            video: {
              deviceId: { exact: config.activeCameraId },
              width: { ideal: 1280 },
              height: { ideal: 720 }
            }
          });
        } catch (constraintErr) {
          console.warn("Exact camera constraints failed, attempting fallback camera select...", constraintErr);
          try {
            // Fallback 1: ID select without specific resolution constraints
            stream = await navigator.mediaDevices.getUserMedia({
              video: {
                deviceId: { exact: config.activeCameraId }
              }
            });
          } catch (idErr) {
            console.warn("Device ID binding failed, attempting generic user camera facing mode...", idErr);
            // Fallback 2: Default user/selfie camera (vital for mobile web contexts)
            stream = await navigator.mediaDevices.getUserMedia({
              video: { facingMode: 'user' }
            });
          }
        }

        activeStream = stream;
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      } catch (err) {
        console.error("Camera access error:", err);
      }
    }

    bindCamera();

    return () => {
      if (activeStream) {
        activeStream.getTracks().forEach(track => track.stop());
      }
    };
  }, [config.activeCameraId]);

  // Dynamic Drawing and Prediction Loop
  useEffect(() => {
    let lastTimestamp = 0;

    const runDetection = () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const landmarker = landmarkerRef.current;

      if (!video || !canvas || !landmarker || isModelLoading) {
        requestRef.current = requestAnimationFrame(runDetection);
        return;
      }

      // Check if video is loaded and playing
      if (video.readyState >= 2) {
        // Adjust canvas sizing
        if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
        }

        const ctx = canvas.getContext('2d');
        if (ctx) {
          // Clear previous canvas drawing
          ctx.clearRect(0, 0, canvas.width, canvas.height);

          try {
            // Predict Pose Landmarkers
            const timestampMs = performance.now();
            const results = landmarker.detectForVideo(video, timestampMs);

            if (results && results.landmarks && results.landmarks.length > 0) {
              const currentLandmarks = results.landmarks[0] as Landmark[];
              setLandmarks(currentLandmarks);

              // Maintain dynamic frame history (sliding window of 45 frames, approx 1.5 seconds)
              historyRef.current.push(currentLandmarks);
              if (historyRef.current.length > 45) {
                historyRef.current.shift();
              }

              // Classify user body position with static and dynamic checks
              const classification = detectPose(currentLandmarks, historyRef.current);
              setCurrentPose(classification);

              // Evaluate target match
              const isMatched = config.targetPose !== 'None' && classification.name === config.targetPose;
              if (isMatched !== wasMatchedRef.current) {
                wasMatchedRef.current = isMatched;
                setIsPoseMatched(isMatched);

                if (isMatched) {
                  // Trigger success checkmark animation
                  setShowCheckmark(true);
                  if (checkmarkTimeoutRef.current) clearTimeout(checkmarkTimeoutRef.current);
                  checkmarkTimeoutRef.current = setTimeout(() => {
                    setShowCheckmark(false);
                  }, 1200);
                }
              }

              // Draw skeleton if config enabled
              if (config.showSkeleton) {
                // Set shadow and glowing options
                ctx.shadowBlur = 8;
                ctx.lineWidth = 3;
                ctx.lineCap = 'round';

                // 1. Draw connecting lines
                CONNECTIONS.forEach(([pt1, pt2]) => {
                  const jointA = currentLandmarks[pt1];
                  const jointB = currentLandmarks[pt2];

                  if (
                    jointA && jointB &&
                    (jointA.visibility ?? 1) > 0.4 &&
                    (jointB.visibility ?? 1) > 0.4
                  ) {
                    // Decide color scheme (Cyan for left, Magenta for right, Purple for midline)
                    let strokeColor = 'rgba(171, 52, 235, 0.7)'; // Torso / Purple
                    let shadowColor = 'rgba(171, 52, 235, 0.4)';

                    const isLeftLimb = (pt1 >= 11 && pt1 % 2 !== 0 && pt2 % 2 !== 0) || pt1 === 23 || pt1 === 25 || pt1 === 27;
                    const isRightLimb = (pt1 >= 12 && pt1 % 2 === 0 && pt2 % 2 === 0) || pt1 === 24 || pt1 === 26 || pt1 === 28;

                    if (isLeftLimb) {
                      strokeColor = 'rgba(0, 242, 254, 0.8)'; // Cyan
                      shadowColor = 'rgba(0, 242, 254, 0.5)';
                    } else if (isRightLimb) {
                      strokeColor = 'rgba(243, 85, 136, 0.8)'; // Magenta
                      shadowColor = 'rgba(243, 85, 136, 0.5)';
                    }

                    ctx.shadowColor = shadowColor;
                    ctx.strokeStyle = strokeColor;

                    ctx.beginPath();
                    ctx.moveTo(jointA.x * canvas.width, jointA.y * canvas.height);
                    ctx.lineTo(jointB.x * canvas.width, jointB.y * canvas.height);
                    ctx.stroke();
                  }
                });

                // 2. Draw joint dots
                ctx.shadowBlur = 10;
                currentLandmarks.forEach((lm, index) => {
                  if ((lm.visibility ?? 1) > 0.4) {
                    // Custom joint colors
                    let fillColor = '#ab34eb'; // Purple default
                    let shadowColor = 'rgba(171, 52, 235, 0.6)';
                    let size = 4;

                    if (index === 0) {
                      fillColor = '#fff'; // Nose
                      size = 6;
                    } else if (index >= 1 && index <= 10) {
                      fillColor = '#ffe600'; // Eyes, Ears, Mouth (Yellow)
                      size = 3;
                    } else if (index % 2 !== 0) {
                      fillColor = '#00f2fe'; // Left limb (Cyan)
                      size = 5;
                    } else {
                      fillColor = '#f35588'; // Right limb (Magenta)
                      size = 5;
                    }

                    ctx.fillStyle = fillColor;
                    ctx.shadowColor = shadowColor;
                    ctx.beginPath();
                    ctx.arc(lm.x * canvas.width, lm.y * canvas.height, size, 0, 2 * Math.PI);
                    ctx.fill();
                  }
                });
              }
            } else {
              setLandmarks(null);
              setCurrentPose({ name: 'Searching for body...', confidence: 0 });

              // Clear context history when body leaves camera frame
              historyRef.current = [];
              if (wasMatchedRef.current) {
                wasMatchedRef.current = false;
                setIsPoseMatched(false);
              }
            }
          } catch (error) {
            console.error("Frame prediction error:", error);
          }
        }

        // FPS Calculations
        frameCountRef.current++;
        const now = performance.now();
        if (now - lastFpsUpdateRef.current >= 1000) {
          setFps(frameCountRef.current);
          frameCountRef.current = 0;
          lastFpsUpdateRef.current = now;
        }
      }

      requestRef.current = requestAnimationFrame(runDetection);
    };

    // Begin Loop
    requestRef.current = requestAnimationFrame(runDetection);

    return () => {
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
      }
      if (checkmarkTimeoutRef.current) {
        clearTimeout(checkmarkTimeoutRef.current);
      }
    };
  }, [isModelLoading, config.showSkeleton, config.targetPose]);

  return (
    <div className="app-container">
      {/* Loading Overlay */}
      {isModelLoading && (
        <div className="loading-overlay">
          {modelError ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '15px', padding: '0 20px', maxWidth: '400px', textAlign: 'center' }}>
              <div style={{ fontSize: '2.5rem', color: 'hsl(var(--accent-red))' }}>⚠️</div>
              <div className="loading-text" style={{ color: '#fff', fontWeight: 600 }}>CATASTROPHIC ERROR</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'hsl(var(--fg-muted))', wordBreak: 'break-word', background: 'rgba(0,0,0,0.3)', padding: '12px', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(255,255,255,0.05)' }}>
                {modelError}
              </div>
              <button
                className="btn-glass"
                onClick={() => window.location.reload()}
                style={{ marginTop: '10px', borderColor: 'rgba(255,255,255,0.2)' }}
              >
                RELOAD PROTOCOLS
              </button>
            </div>
          ) : (
            <>
              <div className="loading-spinner" />
              <div className="loading-text">LOAD PROTOCOLS & MODEL: {config.modelComplexity.toUpperCase()}</div>
            </>
          )}
        </div>
      )}

      {/* Top Floating Control Bar */}
      <TopBar
        config={config}
        onChangeConfig={handleChangeConfig}
        devices={devices}
        fps={fps}
        isModelLoading={isModelLoading}
      />

      {/* Camera feed and SVG Canvas overlay */}
      <div className={`camera-wrapper ${isPoseMatched ? 'matched' : ''}`}>
        <video
          ref={videoRef}
          className="camera-video"
          playsInline
          muted
        />
        <canvas
          ref={canvasRef}
          className="overlay-canvas"
        />

        {/* Success confirmation popup */}
        {showCheckmark && (
          <div className="pose-matched-success">
            <svg viewBox="0 0 24 24">
              <path d="M20 6L9 17L4 12" />
            </svg>
          </div>
        )}
      </div>

      {/* Identified Pose Badge (Lower-Left Overlay) */}
      {!isModelLoading && (
        <div className="pose-badge-wrapper glass-panel">
          <div className="pose-label">Detected Pose</div>
          <div className="pose-name">
            {currentPose.name}
          </div>
          <div className="pose-confidence">
            <span>Accuracy</span>
            <div className="confidence-bar-bg">
              <div
                className="confidence-bar-fill"
                style={{ width: `${currentPose.confidence}%` }}
              />
            </div>
            <span>{currentPose.confidence}%</span>
          </div>
        </div>
      )}

      {/* Telemetry Console (Lower-Right Monospace Panel) */}
      <CoordinatesPanel landmarks={landmarks} />

      {/* Dynamic On-Screen Console Logger for Mobile Debugging */}
      <div
        className="glass-panel mobile-debug-panel"
        style={{
          position: 'absolute',
          top: '120px',
          left: '20px',
          zIndex: 35,
          width: '320px',
          maxHeight: showLogsPanel ? '250px' : '40px',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          fontFamily: 'var(--font-mono)',
          fontSize: '0.65rem',
          backgroundColor: 'rgba(10, 10, 15, 0.95)',
          transition: 'max-height 0.3s ease',
          border: '1px solid rgba(255, 255, 255, 0.15)'
        }}
      >
        <div
          onClick={() => setShowLogsPanel(!showLogsPanel)}
          style={{
            padding: '10px 15px',
            borderBottom: showLogsPanel ? '1px solid var(--glass-border)' : 'none',
            cursor: 'pointer',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            color: 'hsl(var(--primary))',
            fontWeight: 'bold',
            userSelect: 'none'
          }}
        >
          <span>🐞 MOBILE DEBUG LOGS ({consoleLogs.length})</span>
          <span>{showLogsPanel ? 'HIDE' : 'SHOW'}</span>
        </div>

        {showLogsPanel && (
          <div style={{ flex: 1, overflowY: 'auto', padding: '10px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
            {consoleLogs.length === 0 ? (
              <div style={{ color: 'rgba(255,255,255,0.3)' }}>// No logs captured yet. Try starting camera or changing options.</div>
            ) : (
              consoleLogs.map((log, index) => {
                let color = '#fff';
                if (log.startsWith('[ERROR]')) color = 'hsl(var(--accent-red))';
                else if (log.startsWith('[CRITICAL]') || log.startsWith('[REJECTION]')) color = '#ff3300';
                else if (log.startsWith('[WARN]')) color = 'hsl(var(--accent-orange))';
                else if (log.startsWith('[INFO]')) color = '#a3e635';

                return (
                  <div key={index} style={{ color, whiteSpace: 'pre-wrap', wordBreak: 'break-all', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '4px' }}>
                    {log}
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
}
