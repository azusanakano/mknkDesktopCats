#ifndef MKNK_ONYANKOPON_WALK_H
#define MKNK_ONYANKOPON_WALK_H

#include "reference_walk.h"

#define ONYANKOPON_WALK_POSES_PER_FRAME 3u
#define ONYANKOPON_STRIDE 112u
#define ONYANKOPON_EXTRA_POSES (REFERENCE_FRAME_COUNT * (ONYANKOPON_WALK_POSES_PER_FRAME - 1u))

static int onyankopon_subpose(const ReferenceWalk* walk) {
  return (int)(walk->phaseUnits * ONYANKOPON_WALK_POSES_PER_FRAME / REFERENCE_FRAME_UNITS);
}

#endif
