type SpineMaskRenderer = {
  currentClippingSlot?: { slot?: { attachment?: unknown } };
  updateAndSetPixiMask?: (slot: unknown, lastSlot: boolean) => void;
};


export function guardClearedClippingAttachment(spine: SpineMaskRenderer) {
  const updateMask = spine.updateAndSetPixiMask;
  if (typeof updateMask !== 'function') return;

  spine.updateAndSetPixiMask = function guardedUpdateMask(slot, lastSlot) {
    const attachment = this.currentClippingSlot?.slot?.attachment;
    if (this.currentClippingSlot
      && (!attachment || typeof attachment !== 'object'
        || !('endSlot' in attachment))) {
      this.currentClippingSlot = undefined;
    }
    updateMask.call(this, slot, lastSlot);
  };
}
