export interface Landmark {
  x: number;
  y: number;
  z: number;
  visibility?: number;
}

export interface PoseTrackerConfig {
  modelComplexity: 'lite' | 'full' | 'heavy';
  minDetectionConfidence: number;
  minTrackingConfidence: number;
  showSkeleton: boolean;
  activeCameraId: string;
  targetPose: string;
}

export interface ClassifiedPose {
  name: string;
  confidence: number;
}
export const LANDMARK_NAMES = [
  "Nose", "Left Eye (Inner)", "Left Eye", "Left Eye (Outer)",
  "Right Eye (Inner)", "Right Eye", "Right Eye (Outer)",
  "Left Ear", "Right Ear", "Mouth (Left)", "Mouth (Right)",
  "Left Shoulder", "Right Shoulder", "Left Elbow", "Right Elbow",
  "Left Wrist", "Right Wrist", "Left Pinky", "Right Pinky",
  "Left Index", "Right Index", "Left Thumb", "Right Thumb",
  "Left Hip", "Right Hip", "Left Knee", "Right Knee",
  "Left Ankle", "Right Ankle", "Left Heel", "Right Heel",
  "Left Toe", "Right Toe"
];
