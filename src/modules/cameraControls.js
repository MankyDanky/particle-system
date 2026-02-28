export function setupCameraControls(canvas, config) {
  // Camera control event listeners - Mouse
  canvas.addEventListener('mousedown', (e) => {
    config.isDragging = true;
    config.lastMouseX = e.clientX;
    config.lastMouseY = e.clientY;
  });
  
  window.addEventListener('mouseup', () => {
    config.isDragging = false;
  });
  
  window.addEventListener('mousemove', (e) => {
    if (config.isDragging) {
      const deltaX = e.clientX - config.lastMouseX;
      const deltaY = e.clientY - config.lastMouseY;
      
      config.cameraRotationY -= deltaX * config.rotationSpeed;
      config.cameraRotationX += deltaY * config.rotationSpeed;
      
      // Limit vertical rotation to prevent flipping
      config.cameraRotationX = Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, config.cameraRotationX));
      
      config.lastMouseX = e.clientX;
      config.lastMouseY = e.clientY;
    }
  });
  
  // Touch controls for mobile
  let lastTouchX = 0;
  let lastTouchY = 0;
  let initialPinchDistance = 0;
  
  canvas.addEventListener('touchstart', (e) => {
    if (e.touches.length === 1) {
      // Single finger - rotation
      config.isDragging = true;
      lastTouchX = e.touches[0].clientX;
      lastTouchY = e.touches[0].clientY;
    } else if (e.touches.length === 2) {
      // Two fingers - pinch to zoom
      config.isDragging = false;
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      initialPinchDistance = Math.sqrt(dx * dx + dy * dy);
    }
  }, { passive: true });
  
  canvas.addEventListener('touchmove', (e) => {
    if (e.touches.length === 1 && config.isDragging) {
      // Single finger - rotation
      const deltaX = e.touches[0].clientX - lastTouchX;
      const deltaY = e.touches[0].clientY - lastTouchY;
      
      config.cameraRotationY -= deltaX * config.rotationSpeed;
      config.cameraRotationX += deltaY * config.rotationSpeed;
      
      // Limit vertical rotation to prevent flipping
      config.cameraRotationX = Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, config.cameraRotationX));
      
      lastTouchX = e.touches[0].clientX;
      lastTouchY = e.touches[0].clientY;
    } else if (e.touches.length === 2) {
      // Two fingers - pinch to zoom
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const currentPinchDistance = Math.sqrt(dx * dx + dy * dy);
      
      const pinchDelta = initialPinchDistance - currentPinchDistance;
      const zoomAmount = pinchDelta * 0.02;
      config.cameraDistance = Math.max(config.minZoom, Math.min(config.maxZoom, config.cameraDistance + zoomAmount));
      
      initialPinchDistance = currentPinchDistance;
    }
  }, { passive: true });
  
  canvas.addEventListener('touchend', () => {
    config.isDragging = false;
  }, { passive: true });
  
  canvas.addEventListener('touchcancel', () => {
    config.isDragging = false;
  }, { passive: true });
  
  // Zoom control - Mouse wheel
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    
    const zoomAmount = e.deltaY * 0.01;
    config.cameraDistance = Math.max(config.minZoom, Math.min(config.maxZoom, config.cameraDistance + zoomAmount));
  }, { passive: false });
}