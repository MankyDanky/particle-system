/**
 * Camera controls for handling user interactions with the 3D view
 */

export function setupCameraControls(canvas, config) {
  // Camera control event listeners
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
  
  // Zoom control
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    
    const zoomAmount = e.deltaY * 0.01;
    config.cameraDistance = Math.max(config.minZoom, Math.min(config.maxZoom, config.cameraDistance + zoomAmount));
  }, { passive: false });
}