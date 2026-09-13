#ifndef MKNK_REFERENCE_WALK_H
#define MKNK_REFERENCE_WALK_H

/* The supplied PNG has no durations. Normal playback is 8 full-body
   images / 1.2 seconds. Speed changes only the time spent on each image. */
#define REFERENCE_FRAME_UNITS 300u
#define REFERENCE_FRAME_COUNT 8u
#define REFERENCE_STRIDE 48u

typedef struct ReferenceWalk {
  unsigned int phaseUnits;
  unsigned int distanceRemainder;
  unsigned int motionUnits;
  int slot;
} ReferenceWalk;

/* Never omit an image. A late Windows timer slows playback instead of
   jumping to a later pose. The caller freezes this clock when not visible,
   paused or dragged. No memory allocation or rendering occurs here. */
static int reference_advance(ReferenceWalk* clock, unsigned int elapsedMs, int speed) {
  if (speed < 1) speed = 1;
  if (speed > 3) speed = 3;
  if (elapsedMs > 250u) elapsedMs = 250u;
  unsigned int units = clock->phaseUnits + elapsedMs * (unsigned int)speed;
  /* A long stall must not omit poses or teleport across several steps. */
  if (units >= REFERENCE_FRAME_UNITS * 2u) units = REFERENCE_FRAME_UNITS;
  clock->motionUnits = units - clock->phaseUnits;
  if (units < REFERENCE_FRAME_UNITS) { clock->phaseUnits = units; return 0; }
  clock->phaseUnits = units % REFERENCE_FRAME_UNITS;
  clock->slot = (clock->slot + 1) % REFERENCE_FRAME_COUNT;
  return 1;
}

/* Move the whole window between pose changes using the same accepted clock.
   At most one call follows each reference_advance. No body deformation. */
static int reference_step_pixels(ReferenceWalk* clock, unsigned int size) {
  const unsigned int denominator = REFERENCE_FRAME_UNITS * REFERENCE_FRAME_COUNT * 256u;
  clock->distanceRemainder += REFERENCE_STRIDE * size * clock->motionUnits;
  clock->motionUnits = 0;
  int pixels = (int)(clock->distanceRemainder / denominator);
  clock->distanceRemainder %= denominator;
  return pixels;
}

#endif
