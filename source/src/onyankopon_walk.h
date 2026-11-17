#ifndef MKNK_ONYANKOPON_WALK_H
#define MKNK_ONYANKOPON_WALK_H

#include "reference_walk.h"
#include "win32_min.h"

static int onyankopon_paw_shift(const ReferenceWalk* walk, unsigned int size) {
  const unsigned int denominator = REFERENCE_FRAME_UNITS * REFERENCE_FRAME_COUNT * 256u;
  unsigned int travel = REFERENCE_STRIDE * size * walk->phaseUnits;
  // Subtract the fractional window position to count actual pixel moves
  // since this pose began. Round up to the next whole pixel.
  return (int)((travel + denominator - 1u - walk->distanceRemainder) / denominator);
}

static void onyankopon_hold_forepaws(BYTE* pixels, int size, int direction, int shift) {
  // Coordinates are the corresponding features on the 425px atlas. The
  // shoulder and rear paws stay fixed while the forelegs absorb window motion.
  int rear = 206 * size / 425;
  int front = 265 * size / 425;
  int shoulder = 235 * size / 425;
  int foot = 333 * size / 425;
  int bottom = 360 * size / 425;
  int height = foot - shoulder;
  int width = front - rear;
  for (int y = shoulder + 1; y <= bottom; y++) {
    int rise = y < foot ? y - shoulder : height;
    int offset = (shift * rise + height / 2) / height;
    BYTE* row = pixels + (SIZE_T)y * size * 4u;
    // Copy from ahead of the destination in travel order, including when mirrored.
    for (int x = rear + 1; x < size - offset; x++) {
      int blend = x < front ? x - rear : width;
      int localShift = (offset * blend + width / 2) / width;
      if (!localShift) continue;
      int dest = direction > 0 ? x : size - 1 - x;
      int source = dest + direction * localShift;
      for (int channel = 0; channel < 4; channel++) {
        row[dest * 4 + channel] = row[source * 4 + channel];
      }
    }
  }
}

#endif
