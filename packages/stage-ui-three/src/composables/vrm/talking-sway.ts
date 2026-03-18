import type { VRMCore } from '@pixiv/three-vrm-core'

import { Euler, Quaternion } from 'three'

/**
 * Comprehensive procedural body animation for VRM models.
 *
 * Provides four layered animation systems that work together:
 * 1. **Breathing** — Always active. Subtle chest/spine expansion cycle.
 * 2. **Text-Driven Accents** — Active during speech. Head tilts/nods on punctuation.
 * 3. **Contextual nods** — Triggered on emotion changes. Small downward head pitch pulse.
 * 4. **Text-Driven Arm/Finger Gestures** — Active during speech. Fired by expressions in asterisks.
 *
 * All systems use smooth blending to avoid jarring transitions.
 */
export function useVRMTalkingSway() {
  // Accumulated time counters
  let breathTimer = 0

  // Current blend weights
  let gestureBlend = 0

  // --- Text-Driven Accent state (punctuational head movements) ---
  let accentProgress = -1 // -1 = inactive
  let accentDuration = 0.5
  let accentType: 'tilt' | 'nod' | 'shift' = 'tilt'
  let accentDirection = 1
  const accentsQueue: ('tilt' | 'nod' | 'shift')[] = []
  let nextAccentDelay = 0

  // Nod state (contextual/emotion-based)
  let nodProgress = -1 // -1 = inactive
  const NOD_DURATION = 0.35 // seconds for one nod cycle

  // Text-Driven Gesture state
  let currentGestureSide: 'left' | 'right' = 'right'
  let gesturePhase = 0 // 0..1 progress through current gesture
  let gestureActive = false
  let gestureHoldTimer = 0

  // Fade speeds (units/second)
  const GESTURE_FADE_IN = 2.5
  const GESTURE_FADE_OUT = 1.8

  // ---- Breathing parameters ----
  const BREATH_FREQ = 0.25 // Hz (~4s per cycle, natural breathing rate)
  const CHEST_PITCH_AMP = 0.008 // very subtle forward lean on inhale
  const UPPER_CHEST_PITCH_AMP = 0.006
  // Removed spine movement for strict "no body movement" rule


  // ---- Accent parameters (intentional head pulses) ----
  const ACCENT_YAW_AMP = 0.015
  const ACCENT_PITCH_AMP = 0.012
  const ACCENT_ROLL_AMP = 0.008

  // ---- Arm/Finger gesture parameters ----
  const UPPER_ARM_PITCH_AMP = 0.18 // forward lift
  const UPPER_ARM_ROLL_AMP = 0.08 // outward spread
  const LOWER_ARM_PITCH_AMP = 0.22 // forearm bend
  const HAND_PITCH_AMP = 0.15 // wrist flick
  const FINGER_AMP = 0.12 // curl of proximal/intermediate phalanges

  // ---- Nod parameters ----
  const NOD_PITCH_AMP = 0.03 // downward pitch for nod

  // Reusable math objects
  const _euler = new Euler()
  const _inverseQuat = new Quaternion()
  const lastRotations = new Map<string, Quaternion>()

  /**
   * Applies a rotation offset to a bone via quaternion multiplication.
   * To prevent infinite accumulation, we undo the previous frame's procedural 
   * rotation before applying the new one.
   */
  function applyRotation(
    vrm: VRMCore,
    boneName: string,
    pitch: number,
    yaw: number,
    roll: number,
  ) {
    const node = vrm.humanoid.getNormalizedBoneNode(boneName as any)
    if (!node)
      return

    // 1. Undo the previous frame's procedural offset
    let last = lastRotations.get(boneName)
    if (last) {
      _inverseQuat.copy(last).conjugate()
      node.quaternion.multiply(_inverseQuat)
    }

    // 2. Calculate and store the new procedural offset
    _euler.set(pitch, yaw, roll)
    if (!last) {
      last = new Quaternion()
      lastRotations.set(boneName, last)
    }
    last.setFromEuler(_euler)

    // 3. Apply the new procedural offset
    node.quaternion.multiply(last)
  }

  /**
   * Easing function for smooth gesture curves.
   * Bell curve: rises then falls over 0..1
   */
  function bellCurve(t: number): number {
    return Math.sin(t * Math.PI)
  }

  /**
   * Main update function. Call every frame in onBeforeRender.
   */
  function update(vrm: VRMCore | undefined, delta: number, speaking: boolean) {
    if (!vrm?.humanoid)
      return

    breathTimer += delta

    // ==========================================
    // 1. BREATHING (always active, no spine)
    // ==========================================
    const breathPhase = Math.sin(breathTimer * BREATH_FREQ * Math.PI * 2)
    const breathAmount = (breathPhase + 1) * 0.5

    applyRotation(vrm, 'chest', -CHEST_PITCH_AMP * breathAmount, 0, 0)
    applyRotation(vrm, 'upperChest', -UPPER_CHEST_PITCH_AMP * breathAmount, 0, 0)

    // ==========================================
    // 2. TEXT-DRIVEN ACCENTS
    // ==========================================
    if (speaking) {
      if (accentProgress < 0 && nextAccentDelay <= 0 && accentsQueue.length > 0) {
        accentType = accentsQueue.shift()!
        accentProgress = 0
        accentDuration = 0.4 + Math.random() * 0.3
        accentDirection = Math.random() > 0.5 ? 1 : -1
      }

      if (accentProgress < 0) {
        nextAccentDelay -= delta
      }

      if (accentProgress >= 0) {
        accentProgress += delta / accentDuration
        if (accentProgress >= 1) {
          accentProgress = -1
          nextAccentDelay = 0.5 + Math.random() * 0.5 // small delay between queued accents
        }
        else {
          const power = bellCurve(accentProgress)
          let p = 0
          let y = 0
          let r = 0
          if (accentType === 'tilt') {
            r = ACCENT_ROLL_AMP * power * accentDirection
            y = ACCENT_YAW_AMP * power * 0.3 * accentDirection
          }
          else if (accentType === 'nod') {
            p = ACCENT_PITCH_AMP * power
          }
          else if (accentType === 'shift') {
            y = ACCENT_YAW_AMP * power * accentDirection
          }
          
          applyRotation(vrm, 'head', p, y, r)
        }
      }
    }
    else {
      accentProgress = -1
      applyRotation(vrm, 'head', 0, 0, 0)
    }

    // ==========================================
    // 3. TEXT-DRIVEN GESTURES (Asterisks)
    // ==========================================
    if (speaking) {
      if (gestureActive) {
        gestureBlend = Math.min(1, gestureBlend + GESTURE_FADE_IN * delta)
        
        if (gesturePhase < 0.5) {
          // Raising arm
          gesturePhase += delta / 0.8
        } else if (gestureHoldTimer > 0) {
          // Holding the gesture mid-way to match the text
          gestureHoldTimer -= delta
        } else {
          // Lowering arm
          gesturePhase += delta / 0.8
        }

        if (gesturePhase >= 1) {
          gestureActive = false
          gesturePhase = 0
        }
      }
      else {
        gestureBlend = Math.max(0, gestureBlend - GESTURE_FADE_OUT * delta)
      }
    }
    else {
      gestureBlend = Math.max(0, gestureBlend - GESTURE_FADE_OUT * delta)
      gestureActive = false
      if (gestureBlend < 0.01) {
        ['left', 'right'].forEach((side) => {
          applyRotation(vrm, `${side}UpperArm`, 0, 0, 0)
          applyRotation(vrm, `${side}LowerArm`, 0, 0, 0)
          applyRotation(vrm, `${side}Hand`, 0, 0, 0)
          const fingers = ['Thumb', 'Index', 'Middle', 'Ring', 'Little']
          fingers.forEach(finger => {
            applyRotation(vrm, `${side}${finger}Proximal`, 0, 0, 0)
            applyRotation(vrm, `${side}${finger}Intermediate`, 0, 0, 0)
          })
        })
      }
    }

    if (gestureBlend > 0.001) {
      const curve = bellCurve(gesturePhase) * gestureBlend
      const side = currentGestureSide
      const otherSide = side === 'left' ? 'right' : 'left'

      applyRotation(vrm, `${side}UpperArm`, -UPPER_ARM_PITCH_AMP * curve, 0, (side === 'right' ? -1 : 1) * UPPER_ARM_ROLL_AMP * curve)
      applyRotation(vrm, `${side}LowerArm`, -LOWER_ARM_PITCH_AMP * curve, 0, 0)
      applyRotation(vrm, `${side}Hand`, HAND_PITCH_AMP * curve, 0, 0)
      
      const fingers = ['Thumb', 'Index', 'Middle', 'Ring', 'Little']
      fingers.forEach(finger => {
        applyRotation(vrm, `${side}${finger}Proximal`, 0, 0, FINGER_AMP * curve)
        applyRotation(vrm, `${side}${finger}Intermediate`, 0, 0, FINGER_AMP * curve)
      })

      const sympathetic = curve * 0.2
      applyRotation(vrm, `${otherSide}UpperArm`, -UPPER_ARM_PITCH_AMP * sympathetic, 0, (otherSide === 'right' ? -1 : 1) * UPPER_ARM_ROLL_AMP * sympathetic)
    }

    // ==========================================
    // 4. CONTEXTUAL NOD
    // ==========================================
    if (nodProgress >= 0) {
      nodProgress += delta / NOD_DURATION
      if (nodProgress >= 1) {
        nodProgress = -1
        applyRotation(vrm, 'head', 0, 0, 0)
      }
      else {
        const nodAmount = bellCurve(nodProgress) * NOD_PITCH_AMP
        applyRotation(vrm, 'head', -nodAmount, 0, 0)
      }
    }
  }

  function triggerNod() {
    nodProgress = 0
  }

  function simulateSpeechGestures(text: string) {
    if (!text) return

    // 1. Plan head accents based on punctuation (pauses)
    const punctuationMatches = text.match(/[.,!?]/g)
    if (punctuationMatches && accentsQueue.length < 3) {
      for (let i = 0; i < punctuationMatches.length; i++) {
        // limit queue length
        if (accentsQueue.length >= 3) break
        const r = Math.random()
        accentsQueue.push(r < 0.4 ? 'tilt' : r < 0.7 ? 'nod' : 'shift')
      }
    }

    // 2. Plan hand/finger gestures based on asterisks
    const asteriskMatches = text.match(/\*[^*]+\*/g)
    if (asteriskMatches) {
      // Trigger a gesture
      if (!gestureActive || gesturePhase > 0.9) {
        gestureActive = true
        gesturePhase = 0
        gestureHoldTimer = Math.max(0.5, Math.min(2.0, asteriskMatches[0].length * 0.05))
        currentGestureSide = Math.random() > 0.5 ? 'left' : 'right'
      } else {
        // Extend existing gesture hold
        gestureHoldTimer += Math.max(0.2, Math.min(1.0, asteriskMatches[0].length * 0.05))
      }
    }
  }

  return { update, triggerNod, simulateSpeechGestures }
}
