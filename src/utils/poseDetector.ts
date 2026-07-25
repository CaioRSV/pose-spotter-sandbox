import { Landmark, ClassifiedPose } from '../types/pose';

// Helper: Calculate 2D/3D Euclidean distance
export function distance(a: Landmark, b: Landmark, use3D = false): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = use3D ? (a.z - b.z) : 0;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

// Helper: Calculate angle between three landmarks (angle ABC at vertex B)
export function calculateAngle(a: Landmark, b: Landmark, c: Landmark): number {
  // Vector BA
  const ba = { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
  // Vector BC
  const bc = { x: c.x - b.x, y: c.y - b.y, z: c.z - b.z };
  
  // Dot product
  const dotProduct = ba.x * bc.x + ba.y * bc.y + ba.z * bc.z;
  
  // Magnitudes
  const magBA = Math.sqrt(ba.x * ba.x + ba.y * ba.y + ba.z * ba.z);
  const magBC = Math.sqrt(bc.x * bc.x + bc.y * bc.y + bc.z * bc.z);
  
  if (magBA === 0 || magBC === 0) return 0;
  
  // Cosine of angle
  let cosAngle = dotProduct / (magBA * magBC);
  // Clamp between -1 and 1 to prevent NaN in acos due to rounding errors
  cosAngle = Math.max(-1, Math.min(1, cosAngle));
  
  const angleRad = Math.acos(cosAngle);
  return (angleRad * 180) / Math.PI;
}

// Dynamic Helper: Detect hand waving by counting alternating local extrema
function checkWaving(history: Landmark[][]): boolean {
  if (history.length < 15) return false;

  // Extract history for left hand (15) and left shoulder (11)
  const leftWristHistory = history.map(frame => frame?.[15]).filter(Boolean) as Landmark[];
  const leftShoulderHistory = history.map(frame => frame?.[11]).filter(Boolean) as Landmark[];

  // Extract history for right hand (16) and right shoulder (12)
  const rightWristHistory = history.map(frame => frame?.[16]).filter(Boolean) as Landmark[];
  const rightShoulderHistory = history.map(frame => frame?.[12]).filter(Boolean) as Landmark[];

  const isHandWaving = (wristHist: Landmark[], shoulderHist: Landmark[]) => {
    if (wristHist.length < 12 || shoulderHist.length < 12) return false;

    // Check if the hand is consistently raised above shoulder
    // Note: y decreases as we go up the screen
    const aboveShoulder = wristHist.every((w, idx) => {
      const s = shoulderHist[idx];
      return w && s && w.y < s.y - 0.02;
    });
    if (!aboveShoulder) return false;

    // Smooth horizontal positions using a moving average window of 3
    const xs: number[] = [];
    for (let i = 1; i < wristHist.length - 1; i++) {
      xs.push((wristHist[i - 1].x + wristHist[i].x + wristHist[i + 1].x) / 3);
    }

    // Count direction flips (horizontal oscillations)
    let directionFlips = 0;
    let currentDirection: 'up' | 'down' | null = null;
    let lastExtremumValue = xs[0];
    const minAmplitude = 0.025; // 2.5% of frame width threshold

    for (let i = 1; i < xs.length; i++) {
      const diff = xs[i] - xs[i - 1];
      if (Math.abs(diff) < 0.001) continue; // Skip minor jitter

      const dir = diff > 0 ? 'up' : 'down';
      if (currentDirection === null) {
        currentDirection = dir;
      } else if (dir !== currentDirection) {
        // Horizontal movement reversed direction!
        const amplitude = Math.abs(xs[i - 1] - lastExtremumValue);
        if (amplitude > minAmplitude) {
          directionFlips++;
          lastExtremumValue = xs[i - 1];
          currentDirection = dir;
        }
      }
    }

    return directionFlips >= 3;
  };

  return isHandWaving(leftWristHistory, leftShoulderHistory) || isHandWaving(rightWristHistory, rightShoulderHistory);
}

// Dynamic Helper: Detect jumping by evaluating the vertical shift against historical average baseline
function checkJumping(history: Landmark[][]): boolean {
  if (history.length < 15) return false;

  const hipYs: number[] = [];
  history.forEach(frame => {
    if (frame && frame[23] && frame[24]) {
      // Average Left Hip (23) and Right Hip (24)
      hipYs.push((frame[23].y + frame[24].y) / 2);
    } else if (frame && frame[0]) {
      // Fallback to Nose (0) if hips are not visible
      hipYs.push(frame[0].y);
    }
  });

  if (hipYs.length < 10) return false;

  // Calculate the average height of the body over the tracked window
  const avgY = hipYs.reduce((sum, y) => sum + y, 0) / hipYs.length;
  const minY = Math.min(...hipYs); // Peak height (lowest y value)
  const currentY = hipYs[hipYs.length - 1];

  const jumpThreshold = 0.06; // 6% of vertical window height
  
  // 1. Center of mass has moved significantly higher than the average baseline
  // 2. The user is currently in the air (still above average)
  return (avgY - minY > jumpThreshold) && (currentY < avgY - jumpThreshold * 0.5);
}

export function detectPose(landmarks: Landmark[], history?: Landmark[][]): ClassifiedPose {
  if (!landmarks || landmarks.length < 33) {
    return { name: "Detecting...", confidence: 0 };
  }

  // Check dynamic poses first if we have landmark history context
  if (history && history.length >= 15) {
    if (checkJumping(history)) {
      return { name: "Jumping", confidence: 95 };
    }
    if (checkWaving(history)) {
      return { name: "Waving", confidence: 90 };
    }
  }

  // Extract key landmarks for readability
  const nose = landmarks[0];
  const leftEye = landmarks[2];
  const rightEye = landmarks[5];
  
  const leftShoulder = landmarks[11];
  const rightShoulder = landmarks[12];
  
  const leftElbow = landmarks[13];
  const rightElbow = landmarks[14];
  
  const leftWrist = landmarks[15];
  const rightWrist = landmarks[16];
  
  const leftHip = landmarks[23];
  const rightHip = landmarks[24];
  
  const leftKnee = landmarks[25];
  const rightKnee = landmarks[26];
  
  const leftAnkle = landmarks[27];
  const rightAnkle = landmarks[28];

  // Helper check: are key landmarks visible enough?
  const checkVisibility = (points: Landmark[]) => {
    return points.every(p => p && (p.visibility === undefined || p.visibility > 0.4));
  };

  // 1. Calculate key angles
  const leftKneeAngle = calculateAngle(leftHip, leftKnee, leftAnkle);
  const rightKneeAngle = calculateAngle(rightHip, rightKnee, rightAnkle);
  const avgKneeAngle = (leftKneeAngle + rightKneeAngle) / 2;

  const leftHipAngle = calculateAngle(leftShoulder, leftHip, leftKnee);
  const rightHipAngle = calculateAngle(rightShoulder, rightHip, rightKnee);
  const avgHipAngle = (leftHipAngle + rightHipAngle) / 2;

  // Reference measurement for scale invariance: Shoulder Width
  const shoulderWidth = distance(leftShoulder, rightShoulder);

  // 2. Classify: ARMS RAISED
  // Wrists must be above the nose/eyes (y is inverted, so wrist.y < eye.y means wrist is higher)
  if (checkVisibility([leftWrist, rightWrist, nose, leftEye, rightEye])) {
    if (leftWrist.y < leftEye.y && rightWrist.y < rightEye.y) {
      const heightDiff = ((leftEye.y - leftWrist.y) + (rightEye.y - rightWrist.y)) / 2;
      const confidence = Math.min(100, Math.max(70, Math.round(70 + heightDiff * 150)));
      return { name: "Arms Raised", confidence };
    }
  }

  // 3. Classify: T-POSE
  // Wrists must be at similar height as shoulders, and extended horizontally
  if (checkVisibility([leftShoulder, rightShoulder, leftWrist, rightWrist])) {
    const leftArmAlign = Math.abs(leftWrist.y - leftShoulder.y);
    const rightArmAlign = Math.abs(rightWrist.y - rightShoulder.y);
    const leftArmDist = distance(leftWrist, leftShoulder);
    const rightArmDist = distance(rightWrist, rightShoulder);

    if (
      leftArmAlign < 0.15 &&
      rightArmAlign < 0.15 &&
      leftArmDist > shoulderWidth * 0.7 &&
      rightArmDist > shoulderWidth * 0.7
    ) {
      const alignError = (leftArmAlign + rightArmAlign) / 2;
      const confidence = Math.min(100, Math.round(Math.max(60, 100 - (alignError * 200))));
      return { name: "T-Pose", confidence };
    }
  }

  // 4. Classify: HANDS ON HIPS
  if (checkVisibility([leftWrist, rightWrist, leftHip, rightHip, leftElbow, rightElbow])) {
    const leftWristToHip = distance(leftWrist, leftHip);
    const rightWristToHip = distance(rightWrist, rightHip);
    
    // Elbows should be bent
    const leftElbowAngle = calculateAngle(leftShoulder, leftElbow, leftWrist);
    const rightElbowAngle = calculateAngle(rightShoulder, rightElbow, rightWrist);

    if (leftWristToHip < 0.22 && rightWristToHip < 0.22 && leftElbowAngle < 130 && rightElbowAngle < 130) {
      const avgDistance = (leftWristToHip + rightWristToHip) / 2;
      const confidence = Math.min(100, Math.round(Math.max(60, 100 - (avgDistance * 120))));
      return { name: "Hands on Hips", confidence };
    }
  }

  // 5. Classify: SQUATTING
  if (checkVisibility([leftHip, leftKnee, leftAnkle, rightHip, rightKnee, rightAnkle])) {
    // Knee angle is significantly bent, hip is also bent, and hips are lower relative to ankles
    if (avgKneeAngle < 135 && avgHipAngle < 140) {
      const confidence = Math.round(Math.max(60, 100 - (avgKneeAngle - 70) * 0.6));
      return { name: "Squatting", confidence: Math.min(100, confidence) };
    }
  }

  // 6. Classify: LEANING LEFT / RIGHT (Torso lean)
  if (checkVisibility([leftShoulder, rightShoulder, leftHip, rightHip])) {
    const midShoulderX = (leftShoulder.x + rightShoulder.x) / 2;
    const midHipX = (leftHip.x + rightHip.x) / 2;
    const leanRatio = (midShoulderX - midHipX) / shoulderWidth; // Normalized by torso width

    // Since camera is mirrored:
    // Leaning left: torso shifts left (x decreases), so midShoulderX < midHipX, leanRatio < -0.18
    if (leanRatio < -0.18) {
      const confidence = Math.min(100, Math.round(50 + Math.abs(leanRatio) * 150));
      return { name: "Leaning Left", confidence };
    } else if (leanRatio > 0.18) {
      const confidence = Math.min(100, Math.round(50 + Math.abs(leanRatio) * 150));
      return { name: "Leaning Right", confidence };
    }
  }

  // 7. DEFAULT: STANDING (or sitting depending on knee alignment)
  if (checkVisibility([leftKnee, leftAnkle, rightKnee, rightAnkle])) {
    if (avgKneeAngle > 150) {
      return { name: "Standing", confidence: Math.min(100, Math.round(50 + (avgKneeAngle - 150) * 2)) };
    }
  }

  return { name: "Calibrating", confidence: 100 };
}
