#ifndef MKNK_WALK_ANIMATION_H
#define MKNK_WALK_ANIMATION_H
#define FRAME_COUNT 14
#define WALK_FRAME_COUNT 8
#define SIMULATION_MS 50u
#define TIMER_MS 33u
/* Walks use the unchanged supplied full-body poses in row-major order.
   The six recovered nonwalking poses follow these eight frames. */
static const int walk_frames[WALK_FRAME_COUNT]={0,1,2,3,4,5,6,7};
static inline int walk_slot_for_frame(int frame) {
  return frame>=0 && frame<WALK_FRAME_COUNT ? frame : -1;
}
#endif
