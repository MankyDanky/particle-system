/**
 * UI module for handling user interface interactions
 */

import { hexToRgb } from './utils.js';

// Updated MultiSystemUI class to use existing HTML elements
export class MultiSystemUI {
  constructor(manager, onSystemSelected) {
    this.manager = manager;
    this.onSystemSelected = onSystemSelected;
    this.systemsList = document.getElementById('systems-list');
    this.container = document.getElementById('particle-systems-list');
    this.setupEventListeners();
    this.updateSystemsList();
  }

  setupEventListeners() {
    // Add event listeners for the buttons
    document.getElementById('add-system-button').addEventListener('click', () => this.addNewSystem());
    document.getElementById('duplicate-system-button').addEventListener('click', () => this.duplicateSystem());
    document.getElementById('delete-system-button').addEventListener('click', () => this.deleteSystem());
  }

  updateSystemsList() {
    // Clear existing items
    this.systemsList.innerHTML = '';
    
    // Get systems from manager
    const systems = this.manager.getSystemsList();
    
    // Create list items
    systems.forEach(system => {
      const item = document.createElement('li');
      if (system.isActive) {
        item.classList.add('active');
      }
      
      item.textContent = system.name;
      item.onclick = () => {
        this.manager.setActiveSystem(system.index);
        this.updateSystemsList();
        if (this.onSystemSelected) {
          this.onSystemSelected(system.index);
        }
      };
      
      this.systemsList.appendChild(item);
    });
  }

  addNewSystem() {
    // Create a new system with default config - adding all required color properties
    const id = this.manager.createParticleSystem({
      name: `System ${this.manager.systemCounter}`,
      particleCount: 100,
      lifetime: 5,
      emissionRate: 10,
      emissionDuration: 10,
      particleSize: 0.5,
      particleSpeed: 1.0,
      emissionShape: 'cube',
      cubeLength: 2.0,
      outerLength: 2.0,
      innerLength: 0.0,
      outerRadius: 2.0,
      innerRadius: 0.0,
      squareSize: 2.0,
      squareInnerSize: 0.0,
      circleInnerRadius: 0.0,
      circleOuterRadius: 2.0,
      fadeEnabled: true,
      colorTransitionEnabled: false,
      particleColor: [1, 1, 1], // White
      startColor: [1, 0, 0], // Red
      endColor: [0, 0, 1], // Blue
      bloomEnabled: true,
      bloomIntensity: 1.0,
      burstMode: false
    });
    
    // Set as active
    const index = this.manager.particleSystems.length - 1;
    this.manager.setActiveSystem(index);
    
    // Spawn particles in the new system
    this.manager.getActiveSystem().spawnParticles();
    
    // Update UI
    this.updateSystemsList();
    
    // Notify parent
    if (this.onSystemSelected) {
      this.onSystemSelected(index);
    }
  }

  duplicateSystem() {
    if (this.manager.particleSystems.length === 0) return;
    
    // Duplicate active system
    const newId = this.manager.duplicateActiveSystem();
    if (newId >= 0) {
      // Find and set the new system as active
      const newIndex = this.manager.particleSystems.findIndex(
        sys => sys.config.id === newId
      );
      
      if (newIndex >= 0) {
        this.manager.setActiveSystem(newIndex);
        
        // Spawn particles in the new system
        this.manager.getActiveSystem().spawnParticles();
        
        // Update UI
        this.updateSystemsList();
        
        // Notify parent
        if (this.onSystemSelected) {
          this.onSystemSelected(newIndex);
        }
      }
    }
  }

  deleteSystem() {
    if (this.manager.particleSystems.length <= 1) {
      // Don't allow deleting the last system
      alert("Cannot delete the only particle system.");
      return;
    }
    
    // Remove active system
    const index = this.manager.activeSystemIndex;
    this.manager.removeSystem(index);
    
    // Update UI
    this.updateSystemsList();
    
    // Notify parent
    if (this.onSystemSelected) {
      this.onSystemSelected(this.manager.activeSystemIndex);
    }
  }
}

export class ParticleUI {
  constructor(config) {
    this.config = config;
    this.initElements();
    this.setupEventListeners();
    this.updateUIState();
  }

  // Clean up previous event listeners to prevent memory leaks and multiple handlers
  cleanup() {
    // Optional - only implement if needed for memory management
    // Currently UI elements are reused rather than recreated
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
    this.squareSettings = document.getElementById('square-settings');
    this.circleSettings = document.getElementById('circle-settings');
    
    // 3D shape settings
    this.cubeLengthSlider = document.getElementById('cube-length-slider');
    this.cubeLengthValue = document.getElementById('cube-length-value');
    this.innerLengthSlider = document.getElementById('inner-length-slider');
    this.innerLengthValue = document.getElementById('inner-length-value');
    this.innerRadiusSlider = document.getElementById('inner-radius-slider');
    this.innerRadiusValue = document.getElementById('inner-radius-value');
    this.outerRadiusSlider = document.getElementById('outer-radius-slider');
    this.outerRadiusValue = document.getElementById('outer-radius-value');
    
    // 2D shape settings
    this.squareSizeSlider = document.getElementById('square-size-slider');
    this.squareSizeValue = document.getElementById('square-size-value');
    this.squareInnerSizeSlider = document.getElementById('square-inner-size-slider');
    this.squareInnerSizeValue = document.getElementById('square-inner-size-value');
    this.circleInnerRadiusSlider = document.getElementById('circle-inner-radius-slider');
    this.circleInnerRadiusValue = document.getElementById('circle-inner-radius-value');
    this.circleOuterRadiusSlider = document.getElementById('circle-outer-radius-slider');
    this.circleOuterRadiusValue = document.getElementById('circle-outer-radius-value');
  }

  setupEventListeners() {
    // Remove any existing event listeners to prevent duplicates
    this.removeAllEventListeners();
    
    // Lifetime slider
    this.lifetimeSlider.addEventListener('input', this.onLifetimeChange = () => {
      const value = this.lifetimeSlider.value;
      this.lifetimeValue.textContent = `${value} sec`;
      this.config.lifetime = parseFloat(value);
    });
    
    // Emission duration slider
    this.emissionDurationSlider.addEventListener('input', this.onEmissionDurationChange = () => {
      const value = this.emissionDurationSlider.value;
      this.emissionDurationValue.textContent = `${value} sec`;
      this.config.emissionDuration = parseFloat(value);
    });
    
    // Emission rate slider
    this.emissionRateSlider.addEventListener('input', this.onEmissionRateChange = () => {
      const value = this.emissionRateSlider.value;
      this.emissionRateValue.textContent = `${value} particles/sec`;
      this.config.emissionRate = parseFloat(value);
    });
    
    // Fade checkbox
    this.fadeCheckbox.addEventListener('change', this.onFadeChange = () => {
      this.config.fadeEnabled = this.fadeCheckbox.checked;
      
      if (this.config.onAppearanceChange) {
        this.config.onAppearanceChange();
      }
    });
    
    // Color transition checkbox
    this.colorTransitionCheckbox.addEventListener('change', this.onColorTransitionChange = () => {
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
    this.particleColorInput.addEventListener('input', this.onParticleColorChange = () => {
      this.config.particleColor = hexToRgb(this.particleColorInput.value);
      
      if (this.config.onAppearanceChange) {
        this.config.onAppearanceChange();
      }
      
      if (this.config.onColorChange) {
        this.config.onColorChange();
      }
    });
    
    this.startColorInput.addEventListener('input', this.onStartColorChange = () => {
      this.config.startColor = hexToRgb(this.startColorInput.value);
      
      if (this.config.onAppearanceChange) {
        this.config.onAppearanceChange();
      }
      
      if (this.config.onColorChange) {
        this.config.onColorChange();
      }
    });
    
    this.endColorInput.addEventListener('input', this.onEndColorChange = () => {
      this.config.endColor = hexToRgb(this.endColorInput.value);
      
      if (this.config.onAppearanceChange) {
        this.config.onAppearanceChange();
      }
      
      if (this.config.onColorChange) {
        this.config.onColorChange();
      }
    });
    
    // Size slider
    this.sizeSlider.addEventListener('input', this.onSizeChange = () => {
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
    this.speedSlider.addEventListener('input', this.onSpeedChange = () => {
      const value = this.speedSlider.value;
      this.speedValue.textContent = value;
      this.config.particleSpeed = parseFloat(value);
      
      if (this.config.onSpeedChange) {
        this.config.onSpeedChange();
      }
    });
    
    // Particle count slider
    this.particleCountSlider.addEventListener('input', this.onParticleCountChange = () => {
      const value = this.particleCountSlider.value;
      this.particleCountValue.textContent = value;
      this.config.particleCount = parseInt(value);
      
      // If in burst mode, trigger respawn to apply the new particle count immediately
      if (this.config.burstMode && this.config.onRespawn) {
        this.config.onRespawn();
      }
    });
    
    // Burst mode checkbox
    this.burstCheckbox.addEventListener('change', this.onBurstChange = () => {
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
    this.emissionShapeSelect.addEventListener('change', this.onEmissionShapeChange = () => {
      this.config.emissionShape = this.emissionShapeSelect.value;
      
      if (this.config.emissionShape === 'cube') {
        this.cubeSettings.classList.remove('hidden');
        this.sphereSettings.classList.add('hidden');
        this.squareSettings.classList.add('hidden');
        this.circleSettings.classList.add('hidden');
      } else if (this.config.emissionShape === 'sphere') {
        this.cubeSettings.classList.add('hidden');
        this.sphereSettings.classList.remove('hidden');
        this.squareSettings.classList.add('hidden');
        this.circleSettings.classList.add('hidden');
      } else if (this.config.emissionShape === 'square') {
        this.cubeSettings.classList.add('hidden');
        this.sphereSettings.classList.add('hidden');
        this.squareSettings.classList.remove('hidden');
        this.circleSettings.classList.add('hidden');
      } else if (this.config.emissionShape === 'circle') {
        this.cubeSettings.classList.add('hidden');
        this.sphereSettings.classList.add('hidden');
        this.squareSettings.classList.add('hidden');
        this.circleSettings.classList.remove('hidden');
      }
    });
    
    // Cube length slider
    this.cubeLengthSlider.addEventListener('input', this.onCubeLengthChange = () => {
      const value = this.cubeLengthSlider.value;
      this.cubeLengthValue.textContent = value;
      this.config.outerLength = parseFloat(value);
      
      // Make sure outer length is greater than inner length
      if (this.config.outerLength <= this.config.innerLength) {
        this.innerLengthSlider.value = this.config.outerLength - 0.1;
        this.innerLengthValue.textContent = this.innerLengthSlider.value;
        this.config.innerLength = parseFloat(this.innerLengthSlider.value);
      }
    });
    
    // Inner length slider for cube
    this.innerLengthSlider.addEventListener('input', this.onInnerLengthChange = () => {
      const value = this.innerLengthSlider.value;
      this.innerLengthValue.textContent = value;
      this.config.innerLength = parseFloat(value);
      
      // Make sure inner length is less than outer length
      if (this.config.innerLength >= this.config.outerLength) {
        this.cubeLengthSlider.value = this.config.innerLength + 0.1;
        this.cubeLengthValue.textContent = this.cubeLengthSlider.value;
        this.config.outerLength = parseFloat(this.cubeLengthSlider.value);
      }
    });
    
    // Inner radius slider
    this.innerRadiusSlider.addEventListener('input', this.onInnerRadiusChange = () => {
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
    this.outerRadiusSlider.addEventListener('input', this.onOuterRadiusChange = () => {
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
    this.bloomCheckbox.addEventListener('change', this.onBloomChange = () => {
      this.config.bloomEnabled = this.bloomCheckbox.checked;
      
      // Show/hide the bloom intensity slider based on bloom enabled state
      if (this.config.bloomEnabled) {
        this.bloomIntensityContainer.classList.remove('hidden');
      } else {
        this.bloomIntensityContainer.classList.add('hidden');
      }
      
      // Call bloom intensity change to update the uniform buffer
      if (this.config.onBloomIntensityChange) {
        this.config.onBloomIntensityChange();
      }
    });
    
    // Bloom intensity slider
    this.bloomIntensitySlider.addEventListener('input', this.onBloomIntensityChange = () => {
      this.config.bloomIntensity = parseFloat(this.bloomIntensitySlider.value);
      this.bloomIntensityValue.textContent = this.config.bloomIntensity.toFixed(1);
      
      if (this.config.onBloomIntensityChange) {
        this.config.onBloomIntensityChange();
      }
    });
    
    // Respawn button
    this.respawnButton.addEventListener('click', this.onRespawnClick = () => {
      if (this.config.onRespawn) {
        this.config.onRespawn();
      }
    });
    
    // Square size slider
    this.squareSizeSlider.addEventListener('input', this.onSquareSizeChange = () => {
      const value = this.squareSizeSlider.value;
      this.squareSizeValue.textContent = value;
      this.config.squareSize = parseFloat(value);
      
      // Make sure outer size is greater than inner size
      if (this.config.squareSize <= this.config.squareInnerSize) {
        this.squareInnerSizeSlider.value = this.config.squareSize - 0.1;
        this.squareInnerSizeValue.textContent = this.squareInnerSizeSlider.value;
        this.config.squareInnerSize = parseFloat(this.squareInnerSizeSlider.value);
      }
    });
    
    // Square inner size slider
    this.squareInnerSizeSlider.addEventListener('input', this.onSquareInnerSizeChange = () => {
      const value = this.squareInnerSizeSlider.value;
      this.squareInnerSizeValue.textContent = value;
      this.config.squareInnerSize = parseFloat(value);
      
      // Make sure inner size is less than outer size
      if (this.config.squareInnerSize >= this.config.squareSize) {
        this.squareSizeSlider.value = this.config.squareInnerSize + 0.1;
        this.squareSizeValue.textContent = this.squareSizeSlider.value;
        this.config.squareSize = parseFloat(this.squareSizeSlider.value);
      }
    });
    
    // Circle inner radius slider
    this.circleInnerRadiusSlider.addEventListener('input', this.onCircleInnerRadiusChange = () => {
      const value = this.circleInnerRadiusSlider.value;
      this.circleInnerRadiusValue.textContent = value;
      this.config.circleInnerRadius = parseFloat(value);
      
      // Make sure inner radius is less than outer radius
      if (this.config.circleInnerRadius >= this.config.circleOuterRadius) {
        this.circleOuterRadiusSlider.value = this.config.circleInnerRadius + 0.1;
        this.circleOuterRadiusValue.textContent = this.circleOuterRadiusSlider.value;
        this.config.circleOuterRadius = parseFloat(this.circleOuterRadiusSlider.value);
      }
    });
    
    // Circle outer radius slider
    this.circleOuterRadiusSlider.addEventListener('input', this.onCircleOuterRadiusChange = () => {
      const value = this.circleOuterRadiusSlider.value;
      this.circleOuterRadiusValue.textContent = value;
      this.config.circleOuterRadius = parseFloat(value);
      
      // Make sure outer radius is greater than inner radius
      if (this.config.circleOuterRadius <= this.config.circleInnerRadius) {
        this.circleInnerRadiusSlider.value = this.config.circleOuterRadius - 0.1;
        this.circleInnerRadiusValue.textContent = this.circleInnerRadiusSlider.value;
        this.config.circleInnerRadius = parseFloat(this.circleInnerRadiusSlider.value);
      }
    });
  }

  // New method to remove all event listeners to prevent duplicates
  removeAllEventListeners() {
    // Only remove if the event listeners exist
    if (this.onLifetimeChange) {
      this.lifetimeSlider.removeEventListener('input', this.onLifetimeChange);
    }
    if (this.onEmissionDurationChange) {
      this.emissionDurationSlider.removeEventListener('input', this.onEmissionDurationChange);
    }
    if (this.onEmissionRateChange) {
      this.emissionRateSlider.removeEventListener('input', this.onEmissionRateChange);
    }
    if (this.onFadeChange) {
      this.fadeCheckbox.removeEventListener('change', this.onFadeChange);
    }
    if (this.onColorTransitionChange) {
      this.colorTransitionCheckbox.removeEventListener('change', this.onColorTransitionChange);
    }
    if (this.onParticleColorChange) {
      this.particleColorInput.removeEventListener('input', this.onParticleColorChange);
    }
    if (this.onStartColorChange) {
      this.startColorInput.removeEventListener('input', this.onStartColorChange);
    }
    if (this.onEndColorChange) {
      this.endColorInput.removeEventListener('input', this.onEndColorChange);
    }
    if (this.onSizeChange) {
      this.sizeSlider.removeEventListener('input', this.onSizeChange);
    }
    if (this.onSpeedChange) {
      this.speedSlider.removeEventListener('input', this.onSpeedChange);
    }
    if (this.onParticleCountChange) {
      this.particleCountSlider.removeEventListener('input', this.onParticleCountChange);
    }
    if (this.onBurstChange) {
      this.burstCheckbox.removeEventListener('change', this.onBurstChange);
    }
    if (this.onEmissionShapeChange) {
      this.emissionShapeSelect.removeEventListener('change', this.onEmissionShapeChange);
    }
    if (this.onCubeLengthChange) {
      this.cubeLengthSlider.removeEventListener('input', this.onCubeLengthChange);
    }
    if (this.onInnerLengthChange) {
      this.innerLengthSlider.removeEventListener('input', this.onInnerLengthChange);
    }
    if (this.onInnerRadiusChange) {
      this.innerRadiusSlider.removeEventListener('input', this.onInnerRadiusChange);
    }
    if (this.onOuterRadiusChange) {
      this.outerRadiusSlider.removeEventListener('input', this.onOuterRadiusChange);
    }
    if (this.onBloomChange) {
      this.bloomCheckbox.removeEventListener('change', this.onBloomChange);
    }
    if (this.onBloomIntensityChange) {
      this.bloomIntensitySlider.removeEventListener('input', this.onBloomIntensityChange);
    }
    if (this.onRespawnClick) {
      this.respawnButton.removeEventListener('click', this.onRespawnClick);
    }
    if (this.onSquareSizeChange) {
      this.squareSizeSlider.removeEventListener('input', this.onSquareSizeChange);
    }
    if (this.onSquareInnerSizeChange) {
      this.squareInnerSizeSlider.removeEventListener('input', this.onSquareInnerSizeChange);
    }
    if (this.onCircleInnerRadiusChange) {
      this.circleInnerRadiusSlider.removeEventListener('input', this.onCircleInnerRadiusChange);
    }
    if (this.onCircleOuterRadiusChange) {
      this.circleOuterRadiusSlider.removeEventListener('input', this.onCircleOuterRadiusChange);
    }
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
    
    this.innerLengthSlider.value = this.config.innerLength;
    this.innerLengthValue.textContent = this.config.innerLength;
    
    this.outerRadiusSlider.value = this.config.outerRadius;
    this.outerRadiusValue.textContent = this.config.outerRadius;
    
    // Initialize 2D shape settings
    this.squareSizeSlider.value = this.config.squareSize;
    this.squareSizeValue.textContent = this.config.squareSize;
    this.squareInnerSizeSlider.value = this.config.squareInnerSize;
    this.squareInnerSizeValue.textContent = this.config.squareInnerSize;
    
    this.circleInnerRadiusSlider.value = this.config.circleInnerRadius;
    this.circleInnerRadiusValue.textContent = this.config.circleInnerRadius;
    this.circleOuterRadiusSlider.value = this.config.circleOuterRadius;
    this.circleOuterRadiusValue.textContent = this.config.circleOuterRadius;
    
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
      this.squareSettings.classList.add('hidden');
      this.circleSettings.classList.add('hidden');
    } else if (this.config.emissionShape === 'sphere') {
      this.cubeSettings.classList.add('hidden');
      this.sphereSettings.classList.remove('hidden');
      this.squareSettings.classList.add('hidden');
      this.circleSettings.classList.add('hidden');
    } else if (this.config.emissionShape === 'square') {
      this.cubeSettings.classList.add('hidden');
      this.sphereSettings.classList.add('hidden');
      this.squareSettings.classList.remove('hidden');
      this.circleSettings.classList.add('hidden');
    } else if (this.config.emissionShape === 'circle') {
      this.cubeSettings.classList.add('hidden');
      this.sphereSettings.classList.add('hidden');
      this.squareSettings.classList.add('hidden');
      this.circleSettings.classList.remove('hidden');
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