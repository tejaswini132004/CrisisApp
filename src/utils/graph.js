export const getNearestSafeNode = (zones, currentPos) => {
  // Green (#10b981) = Exit, Pink (#ec4899) = Staircase
  const safeNodes = zones.filter(z => z.color === '#10b981' || z.color === '#ec4899');
  if (!safeNodes.length) return null;
  return safeNodes.reduce((prev, curr) => {
    const distPrev = Math.hypot((prev.x + prev.w/2) - currentPos.x, (prev.y + prev.h/2) - currentPos.y);
    const distCurr = Math.hypot((curr.x + curr.w/2) - currentPos.x, (curr.y + curr.h/2) - currentPos.y);
    return distCurr < distPrev ? curr : prev;
  });
};

export const calculateDirection = (currentPos, targetNode) => {
  if (!currentPos || !targetNode) return 0;
  const dy = (targetNode.y + targetNode.h/2) - currentPos.y;
  const dx = (targetNode.x + targetNode.w/2) - currentPos.x;
  return Math.atan2(dy, dx) * (180 / Math.PI);
};
