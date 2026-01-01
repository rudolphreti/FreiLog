export const focusTextInput = (input, { resetValue = false, caret = 'end' } = {}) => {
  if (!(input instanceof HTMLInputElement)) {
    return false;
  }

  input.disabled = false;
  input.readOnly = false;
  input.removeAttribute('aria-disabled');
  if (resetValue) {
    input.value = '';
  }

  const placeCaret = () => {
    const position = caret === 'start' ? 0 : input.value.length;
    input.focus({ preventScroll: true });
    input.setSelectionRange(position, position);
  };

  requestAnimationFrame(placeCaret);
  return true;
};
