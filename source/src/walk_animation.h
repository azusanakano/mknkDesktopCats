#ifndef MKNK_WALK_ANIMATION_H
#define MKNK_WALK_ANIMATION_H

#define FRAME_COUNT 16
#define WALK_FRAME_COUNT 8
#define SIMULATION_MS 50u
#define TIMER_MS 25u

/* Keep the original non-walking frame IDs (4..11) stable. */
static const int walk_frames[WALK_FRAME_COUNT] = {0, 12, 1, 13, 2, 14, 3, 15};

/* Normal speed (2): 600 ms per stride, 75 ms per pose. The stride tracks
   movement speed; multiplying frame count must not double the stride time. */
static int walk_frame_at_time(unsigned int timeMs, int speed) {
  unsigned int phase = (timeMs % 1200u) * (unsigned int)speed;
  return walk_frames[(phase / 150u) % WALK_FRAME_COUNT];
}

static int walk_slot_for_frame(int frame) {
  if (frame >= 0 && frame < 4) return frame * 2;
  if (frame >= 12 && frame < 16) return (frame - 12) * 2 + 1;
  return -1;
}

static int interpolate_position(int previous, int current, unsigned int remainder) {
  int delta = current - previous;
  int distance = delta < 0 ? -delta : delta;
  int step = (int)((unsigned int)distance * remainder / SIMULATION_MS);
  return previous + (delta < 0 ? -step : step);
}

#endif
