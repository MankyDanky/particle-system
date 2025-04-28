/**
 * UI module for handling user interface interactions
 */

import { hexToRgb } from './utils.js';

export class ParticleUI {
  constructor(config) {
    this.config = config;
    this.initElements();
    this.setupEventListeners();
    this.updateUIState();
  }

  initElements() {
    // Get UI elements
    this.lifetimeSlider = document.getElementById('lifetime-slider');
    this.lifetimeValue = document.getElementById('lifetime-value');
    this.emissionDurationSlider = document.getElementById('emission-duration-slider');
    this.emissionDurationValue = document.getElementById('emission-duration-value');
    this.emissionRateSlider = document.getElementById('emission-rate-slider');
    this.emissionRateValue = document.getElementById('emission-rate-value');
    this.particleCountSlider = document.getElementById('particle-count-slider');
    this.particleCountValue = document.getElementById('particle-count-value');
    this.burstCheckbox = document.getElementById('burst-checkbox');
    this.continuousEmissionContainer = document.getElementById('continuous-emission-container');
    this.burstEmissionContainer = document.getElementById('burst-emission-container');
    this.sizeSlider = document.getElementById('size-slider');
    this.sizeValue = document.getElementById('size-value');
    this.speedSlider = document.getElementById('speed-slider');
    this.speedValue = document.getElementById('speed-value');
    this.fadeCheckbox = document.getElementById('fade-checkbox');
    this.colorTransitionCheckbox = document.getElementById('color-transition-checkbox');
    this.singleColorContainer = document.getElementById('single-color-container');
    this.gradientColorContainer = document.getElementById('gradient-color-container');
    this.particleColorInput = document.getElementById('particle-color');
    this.startColorInput = document.getElementById('start-color');
    this.endColorInput = document.getElementById('end-color');
    this.bloomCheckbox = document.getElementById('bloom-checkbox');
    this.bloomIntensitySlider = document.getElementById('bloom-intensity-slider');
    this.bloomIntensityValue = document.getElementById('bloom-intensity-value');
    this.bloomIntensityContainer = document.getElementById('bloom-intensity-container');
    this.respawnButton = document.getElementById('respawn-button');
    
    // Shape UI elements
    this.emissionShapeSelect = document.getElementById('emission-shape');
    this.cubeSettings = document.getElementById('cube-settings');
    this.sphereSettings = document.getElementById('sphere-settings');
    this.cubeLengthSlider = document.getElementById('cube-length-slider');
    this.cubeLengthValue = document.getElementById('cube-length-value');
    this.innerRadiusSlider = document.getElementById('inner-radius-slider');
    this.innerRadiusValue = document.getElementById('inner-radius-value');
    this.outerRadiusSlider = document.getElementById('outer-radius-slider');
    this.outerRadiusValue = document.getElementById('outer-radius-value');
  }

  setupEventListeners() {
    // Lifetime slider
    this.lifetimeSlider.addEventListener('input', () => {
      const value = this.lifetimeSlider.value;
      this.lifetimeValue.textContent = `${value} sec`;
      this.config.lifetime = parseFloat(value);
    });
    
    // Emission duration slider
    this.emissionDurationSlider.addEventListener('input', () => {
      const value = this.emissionDurationSlider.value;
      this.emissionDurationValue.textContent = `${value} sec`;
      this.config.emissionDuration = parseFloat(value);
    });
    
    // Emission rate slider
    this.emissionRateSlider.addEventListener('input', () => {
      const value = this.emissionRateSlider.value;
      this.emissionRateValue.textContent = `${value} particles/sec`;
      this.config.emissionRate = parseFloat(value);
    });
    
    // Fade checkbox
    this.fadeCheckbox.addEventListener('change', () => {
      this.config.fadeEnabled = this.fadeCheckbox.checked;
      
      if (this.config.onAppearanceChange) {
        this.config.onAppearanceChange();
      }
    });
    
    // Color transition checkbox
    this.colorTransitionCheckbox.addEventListener('change', () => {
      this.config.colorTransitionEnabled = this.colorTransitionCheckbox.checked;
      
      if (this.colorTransitionCheckbox.checked) {
        this.singleColorContainer.classList.add('hidden');
        this.gradientColorContainer.classList.remove('hidden');
      } else {
        this.singleColorContainer.classList.remove('hidden');
        this.gradientColorContainer.classList.add('hidden');
      }
      
      if (this.config.onAppearanceChange) {
        this.config.onAppearanceChange();
      }
    });
    
    // Color input event listeners
    this.particleColorInput.addEventListener('input', () => {
      this.config.particleColor = hexToRgb(this.particleColorInput.value);
      
      if (this.config.onAppearanceChange) {
        this.config.onAppearanceChange();
      }
      
      if (this.config.onColorChange) {
        this.config.onColorChange();
      }
    });
    
    this.startColorInput.addEventListener('input', () => {
      this.config.startColor = hexToRgb(this.startColorInput.value);
      
      if (this.config.onAppearanceChange) {
        this.config.onAppearanceChange();
      }
      
      if (this.config.onColorChange) {
        this.config.onColorChange();
      }
    });
    
    this.endColorInput.addEventListener('input', () => {
      this.config.endColor = hexToRgb(this.endColorInput.value);
      
      if (this.config.onAppearanceChange) {
        this.config.onAppearanceChange();
      }
      
      if (this.config.onColorChange) {
        this.config.onColorChange();
      }
    });
    
    // Size slider
    this.sizeSlider.addEventListener('input', () => {
      const value = this.sizeSlider.value;
      this.sizeValue.textContent = value;
      this.config.particleSize = parseFloat(value);
      
      if (this.config.onAppearanceChange) {
        this.config.onAppearanceChange();
      }
      
      if (this.config.onSizeChange) {
        this.config.onSizeChange(this.config.particleSize);
      }
    });
    
    // Speed slider
    this.speedSlider.addEventListener('input', () => {
      const value = this.speedSlider.value;
      this.speedValue.textContent = value;
      this.config.particleSpeed = parseFloat(value);
      
      if (this.config.onSpeedChange) {
        this.config.onSpeedChange();
      }
    });
    
    // Particle count slider
    this.particleCountSlider.addEventListener('input', () => {
      const value = this.particleCountSlider.value;
      this.particleCountValue.textContent = value;
      this.config.particleCount = parseInt(value);
      
      // If in burst mode, trigger respawn to apply the new particle count immediately
      if (this.config.burstMode && this.config.onRespawn) {
        this.config.onRespawn();
      }
    });
    
    // Burst mode checkbox
    this.burstCheckbox.addEventListener('change', () => {
      this.config.burstMode = this.burstCheckbox.checked;
      
      if (this.burstCheckbox.checked) {
        this.continuousEmissionContainer.classList.add('hidden');
        this.burstEmissionContainer.classList.remove('hidden');
      } else {
        this.continuousEmissionContainer.classList.remove('hidden');
        this.burstEmissionContainer.classList.add('hidden');
      }
    });
    
    // Emission shape select
    this.emissionShapeSelect.addEventListener('change', () => {
      this.config.emissionShape = this.emissionShapeSelect.value;
      
      if (this.config.emissionShape === 'cube') {
        this.cubeSettings.classList.remove('hidden');
        this.sphereSettings.classList.add('hidden');
      } else if (this.config.emissionShape === 'sphere') {
        this.cubeSettings.classList.add('hidden');
        this.sphereSettings.classList.remove('hidden');
      }
    });
    
    // Cube length slider
    this.cubeLengthSlider.addEventListener('input', () => {
      const value = this.cubeLengthSlider.value;
      this.cubeLengthValue.textContent = value;
      this.config.cubeLength = parseFloat(value);
    });
    
    // Inner radius slider
    this.innerRadiusSlider.addEventListener('input', () => {
      const value = this.innerRadiusSlider.value;
      this.innerRadiusValue.textContent = value;
      this.config.innerRadius = parseFloat(value);
      
      // Make sure inner radius is less than outer radius
      if (this.config.innerRadius >= this.config.outerRadius) {
        this.outerRadiusSlider.value = this.config.innerRadius + 0.1;
        this.outerRadiusValue.textContent = this.outerRadiusSlider.value;
        this.config.outerRadius = parseFloat(this.outerRadiusSlider.value);
      }
    });
    
    // Outer radius slider
    this.outerRadiusSlider.addEventListener('input', () => {
      const value = this.outerRadiusSlider.value;
      this.outerRadiusValue.textContent = value;
      this.config.outerRadius = parseFloat(value);
      
      // Make sure outer radius is greater than inner radius
      if (this.config.outerRadius <= this.config.innerRadius) {
        this.innerRadiusSlider.value = this.config.outerRadius - 0.1;
        this.innerRadiusValue.textContent = this.innerRadiusSlider.value;
        this.config.innerRadius = parseFloat(this.innerRadiusSlider.value);
      }
    });
    
    // Bloom checkbox
    this.bloomCheckbox.addEventListener('change', () => {
      this.config.bloomEnabled = this.bloomCheckbox.checked;
      
      // Show/hide the bloom intensity slider based on bloom enabled state
      if (this.config.bloomEnabled) {
        this.bloomIntensityContainer.classList.remove('hidden');
      } else {
        this.bloomIntensityContainer.classList.add('hidden');
      }
    });
    
    // Bloom intensity slider
    this.bloomIntensitySlider.addEventListener('input', () => {
      this.config.bloomIntensity = parseFloat(this.bloomIntensitySlider.value);
      this.bloomIntensityValue.textContent = this.config.bloomIntensity.toFixed(1);
      
      if (this.config.onBloomIntensityChange) {
        this.config.onBloomIntensityChange();
      }
    });
    
    // Respawn button
    this.respawnButton.addEventListener('click', () => {
      if (this.config.onRespawn) {
        this.config.onRespawn();
      }
    });
  }

  updateUIState() {
    // Initialize UI based on config values
    this.lifetimeSlider.value = this.config.lifetime || 5;
    this.lifetimeValue.textContent = `${this.lifetimeSlider.value} sec`;
    
    this.emissionDurationSlider.value = this.config.emissionDuration || 10;
    this.emissionDurationValue.textContent = `${this.emissionDurationSlider.value} sec`;
    
    this.emissionRateSlider.value = this.config.emissionRate || 10;
    this.emissionRateValue.textContent = `${this.emissionRateSlider.value} particles/sec`;
    
    this.particleCountSlider.value = this.config.particleCount || 100;
    this.particleCountValue.textContent = this.config.particleCount || 100;
    
    this.sizeSlider.value = this.config.particleSize || 0.5;
    this.sizeValue.textContent = this.config.particleSize || 0.5;
    
    this.speedSlider.value = this.config.particleSpeed || 1.0;
    this.speedValue.textContent = this.config.particleSpeed || 1.0;
    
    this.fadeCheckbox.checked = this.config.fadeEnabled;
    this.colorTransitionCheckbox.checked = this.config.colorTransitionEnabled;
    this.burstCheckbox.checked = this.config.burstMode;
    
    this.particleColorInput.value = this.rgbToHex(this.config.particleColor);
    this.startColorInput.value = this.rgbToHex(this.config.startColor);
    this.endColorInput.value = this.rgbToHex(this.config.endColor);
    
    this.emissionShapeSelect.value = this.config.emissionShape;
    this.cubeLengthSlider.value = this.config.cubeLength;
    this.cubeLengthValue.textContent = this.config.cubeLength;
    
    this.innerRadiusSlider.value = this.config.innerRadius;
    this.innerRadiusValue.textContent = this.config.innerRadius;
    
    this.outerRadiusSlider.value = this.config.outerRadius;
    this.outerRadiusValue.textContent = this.config.outerRadius;
    
    this.bloomCheckbox.checked = this.config.bloomEnabled;
    this.bloomIntensitySlider.value = this.config.bloomIntensity;
    this.bloomIntensityValue.textContent = this.config.bloomIntensity.toFixed(1);
    
    // Set initial visibility states
    if (this.config.colorTransitionEnabled) {
      this.singleColorContainer.classList.add('hidden');
      this.gradientColorContainer.classList.remove('hidden');
    } else {
      this.singleColorContainer.classList.remove('hidden');
      this.gradientColorContainer.classList.add('hidden');
    }
    
    if (this.config.burstMode) {
      this.continuousEmissionContainer.classList.add('hidden');
      this.burstEmissionContainer.classList.remove('hidden');
    } else {
      this.continuousEmissionContainer.classList.remove('hidden');
      this.burstEmissionContainer.classList.add('hidden');
    }
    
    if (this.config.emissionShape === 'cube') {
      this.cubeSettings.classList.remove('hidden');
      this.sphereSettings.classList.add('hidden');
    } else if (this.config.emissionShape === 'sphere') {
      this.cubeSettings.classList.add('hidden');
      this.sphereSettings.classList.remove('hidden');
    }
    
    if (this.config.bloomEnabled) {
      this.bloomIntensityContainer.classList.remove('hidden');
    } else {
      this.bloomIntensityContainer.classList.add('hidden');
    }
  }

  // Helper to convert RGB array to hex string
  rgbToHex(rgb) {
    if (!rgb) return '#ffffff';
    
    const r = Math.round(rgb[0] * 255).toString(16).padStart(2, '0');
    const g = Math.round(rgb[1] * 255).toString(16).padStart(2, '0');
    const b = Math.round(rgb[2] * 255).toString(16).padStart(2, '0');
    
    return `#${r}${g}${b}`;
  }
}

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