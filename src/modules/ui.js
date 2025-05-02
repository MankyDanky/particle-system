import { hexToRgb, rgbToHex } from './utils.js';

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
      burstMode: false,
      gravityEnabled: false,
      gravityStrength: 2
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
    // Get existing UI elements
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
    
    // Appearance tab elements
    this.fadeCheckbox = document.getElementById('fade-checkbox');
    this.colorTransitionCheckbox = document.getElementById('color-transition-checkbox');
    this.particleColorInput = document.getElementById('particle-color');
    this.startColorInput = document.getElementById('start-color');
    this.endColorInput = document.getElementById('end-color');
    this.singleColorContainer = document.getElementById('single-color-container');
    this.gradientColorContainer = document.getElementById('gradient-color-container');
    this.bloomCheckbox = document.getElementById('bloom-checkbox');
    this.bloomIntensitySlider = document.getElementById('bloom-intensity-slider');
    this.bloomIntensityValue = document.getElementById('bloom-intensity-value');
    this.bloomIntensityContainer = document.getElementById('bloom-intensity-container');
    
    // Play button
    this.respawnButton = document.getElementById('respawn-button');
    
    // Velocity override controls
    this.overrideXVelocityCheckbox = document.getElementById('override-x-velocity-checkbox');
    this.overrideYVelocityCheckbox = document.getElementById('override-y-velocity-checkbox');
    this.overrideZVelocityCheckbox = document.getElementById('override-z-velocity-checkbox');
    
    this.xVelocitySlider = document.getElementById('x-velocity-slider');
    this.yVelocitySlider = document.getElementById('y-velocity-slider');
    this.zVelocitySlider = document.getElementById('z-velocity-slider');
    
    this.xVelocityValue = document.getElementById('x-velocity-value');
    this.yVelocityValue = document.getElementById('y-velocity-value');
    this.zVelocityValue = document.getElementById('z-velocity-value');
    
    this.xVelocitySliderContainer = document.getElementById('x-velocity-slider-container');
    this.yVelocitySliderContainer = document.getElementById('y-velocity-slider-container');
    this.zVelocitySliderContainer = document.getElementById('z-velocity-slider-container');
    
    // Gravity
    this.gravityCheckbox = document.getElementById('gravity-checkbox');
    this.gravityStrengthSlider = document.getElementById('gravity-strength-slider');
    this.gravityStrengthValue = document.getElementById('gravity-strength-value');
    this.gravityStrengthContainer = document.getElementById('gravity-strength-container');
    
    // Damping
    this.dampingCheckbox = document.getElementById('damping-checkbox');
    this.dampingStrengthSlider = document.getElementById('damping-strength-slider');
    this.dampingStrengthValue = document.getElementById('damping-strength-value');
    this.dampingStrengthContainer = document.getElementById('damping-strength-container');
    
    // Attractor
    this.attractorCheckbox = document.getElementById('attractor-checkbox');
    this.attractorStrengthSlider = document.getElementById('attractor-strength-slider');
    this.attractorStrengthValue = document.getElementById('attractor-strength-value');
    this.attractorPositionXSlider = document.getElementById('attractor-position-x-slider');
    this.attractorPositionYSlider = document.getElementById('attractor-position-y-slider');
    this.attractorPositionZSlider = document.getElementById('attractor-position-z-slider');
    this.attractorPositionXValue = document.getElementById('attractor-position-x-value');
    this.attractorPositionYValue = document.getElementById('attractor-position-y-value');
    this.attractorPositionZValue = document.getElementById('attractor-position-z-value');
    this.attractorControlsContainer = document.getElementById('attractor-controls-container');
    
    // Shape UI elements
    this.emissionShapeSelect = document.getElementById('emission-shape');
    this.cubeSettings = document.getElementById('cube-settings');
    this.sphereSettings = document.getElementById('sphere-settings');
    this.cylinderSettings = document.getElementById('cylinder-settings');
    this.squareSettings = document.getElementById('square-settings');
    this.circleSettings = document.getElementById('circle-settings');
    
    // Shape rotation sliders
    this.shapeRotationXSlider = document.getElementById('shape-rotation-x-slider');
    this.shapeRotationYSlider = document.getElementById('shape-rotation-y-slider');
    this.shapeRotationZSlider = document.getElementById('shape-rotation-z-slider');
    this.shapeRotationXValue = document.getElementById('shape-rotation-x-value');
    this.shapeRotationYValue = document.getElementById('shape-rotation-y-value');
    this.shapeRotationZValue = document.getElementById('shape-rotation-z-value');
    
    // 3D shape settings
    this.cubeLengthSlider = document.getElementById('cube-length-slider');
    this.cubeLengthValue = document.getElementById('cube-length-value');
    this.innerLengthSlider = document.getElementById('inner-length-slider');
    this.innerLengthValue = document.getElementById('inner-length-value');
    this.innerRadiusSlider = document.getElementById('inner-radius-slider');
    this.innerRadiusValue = document.getElementById('inner-radius-value');
    this.outerRadiusSlider = document.getElementById('outer-radius-slider');
    this.outerRadiusValue = document.getElementById('outer-radius-value');
    
    // Cylinder settings
    this.cylinderInnerRadiusSlider = document.getElementById('cylinder-inner-radius-slider');
    this.cylinderInnerRadiusValue = document.getElementById('cylinder-inner-radius-value');
    this.cylinderOuterRadiusSlider = document.getElementById('cylinder-outer-radius-slider');
    this.cylinderOuterRadiusValue = document.getElementById('cylinder-outer-radius-value');
    this.cylinderHeightSlider = document.getElementById('cylinder-height-slider');
    this.cylinderHeightValue = document.getElementById('cylinder-height-value');
    this.cylinderVelocityDirectionSelect = document.getElementById('cylinder-velocity-direction');
    
    // 2D shape settings
    this.squareSizeSlider = document.getElementById('square-size-slider');
    this.squareSizeValue = document.getElementById('square-size-value');
    this.squareInnerSizeSlider = document.getElementById('square-inner-size-slider');
    this.squareInnerSizeValue = document.getElementById('square-inner-size-value');
    this.circleInnerRadiusSlider = document.getElementById('circle-inner-radius-slider');
    this.circleInnerRadiusValue = document.getElementById('circle-inner-radius-value');
    this.circleOuterRadiusSlider = document.getElementById('circle-outer-radius-slider');
    this.circleOuterRadiusValue = document.getElementById('circle-outer-radius-value');
    this.circleVelocityDirectionSelect = document.getElementById('circle-velocity-direction');
    
    // Rotation controls
    this.randomRotationCheckbox = document.getElementById('random-rotation-checkbox');
    this.fixedRotationContainer = document.getElementById('fixed-rotation-container');
    this.randomRotationContainer = document.getElementById('random-rotation-container');
    this.rotationSlider = document.getElementById('rotation-slider');
    this.rotationValue = document.getElementById('rotation-value');
    this.minRotationSlider = document.getElementById('min-rotation-slider');
    this.minRotationValue = document.getElementById('min-rotation-value');
    this.maxRotationSlider = document.getElementById('max-rotation-slider');
    this.maxRotationValue = document.getElementById('max-rotation-value');
    
    // Texture controls - reference the static HTML elements
    this.textureCheckbox = document.getElementById('texture-checkbox');
    this.textureUploadContainer = document.getElementById('texture-upload-container');
    this.textureFileInput = document.getElementById('texture-file-input');
    this.currentTextureDisplay = document.getElementById('current-texture-display');
    this.removeTextureButton = document.getElementById('remove-texture-button');
  }

  setupEventListeners() {
    // Remove existing event listeners
    this.removeAllEventListeners();
    
    // Initialize lastUploadedTextureUrl if not already set
    this.lastUploadedTextureUrl = this.lastUploadedTextureUrl || null;
    
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
    
    // Gravity checkbox
    this.gravityCheckbox.addEventListener('change', this.onGravityChange = () => {
      this.config.gravityEnabled = this.gravityCheckbox.checked;
      
      // Show/hide gravity strength slider based on gravity enabled state
      if (this.config.gravityEnabled) {
        this.gravityStrengthContainer.classList.remove('hidden');
        // Set gravity to the slider value
        const gravityValue = parseFloat(this.gravityStrengthSlider.value);
        if (this.config.onPhysicsChange) {
          this.config.onPhysicsChange('gravity', gravityValue);
        }
      } else {
        this.gravityStrengthContainer.classList.add('hidden');
        // Set gravity to zero when disabled
        if (this.config.onPhysicsChange) {
          this.config.onPhysicsChange('gravity', 0);
        }
      }
    });
    
    // Gravity strength slider
    this.gravityStrengthSlider.addEventListener('input', this.onGravityStrengthChange = () => {
      const value = this.gravityStrengthSlider.value;
      this.gravityStrengthValue.textContent = value;
      
      if (this.config.gravityEnabled && this.config.onPhysicsChange) {
        this.config.onPhysicsChange('gravity', parseFloat(value));
      }
    });
    
    // Damping checkbox
    this.dampingCheckbox.addEventListener('change', this.onDampingChange = () => {
      this.config.dampingEnabled = this.dampingCheckbox.checked;
      
      // Show/hide damping strength slider based on damping enabled state
      if (this.config.dampingEnabled) {
        this.dampingStrengthContainer.classList.remove('hidden');
        // Set damping to the slider value
        const dampingValue = parseFloat(this.dampingStrengthSlider.value);
        if (this.config.onPhysicsChange) {
          this.config.onPhysicsChange('damping', dampingValue);
        }
      } else {
        this.dampingStrengthContainer.classList.add('hidden');
        // Set damping to zero when disabled
        if (this.config.onPhysicsChange) {
          this.config.onPhysicsChange('damping', 0);
        }
      }
    });
    
    // Damping strength slider
    this.dampingStrengthSlider.addEventListener('input', this.onDampingStrengthChange = () => {
      const value = this.dampingStrengthSlider.value;
      this.dampingStrengthValue.textContent = value;
      
      if (this.config.dampingEnabled && this.config.onPhysicsChange) {
        this.config.onPhysicsChange('damping', parseFloat(value));
      }
    });
    
    // Attractor checkbox
    this.attractorCheckbox.addEventListener('change', this.onAttractorChange = () => {
      this.config.attractorEnabled = this.attractorCheckbox.checked;
      
      // Show/hide attractor controls based on attractor enabled state
      if (this.config.attractorEnabled) {
        this.attractorControlsContainer.classList.remove('hidden');
        // Set attractor to the initial values
        const attractorStrength = parseFloat(this.attractorStrengthSlider.value);
        const posX = parseFloat(this.attractorPositionXSlider.value);
        const posY = parseFloat(this.attractorPositionYSlider.value);
        const posZ = parseFloat(this.attractorPositionZSlider.value);
        
        if (this.config.onPhysicsChange) {
          this.config.onPhysicsChange('attractor', {
            strength: attractorStrength,
            position: [posX, posY, posZ]
          });
        }
      } else {
        this.attractorControlsContainer.classList.add('hidden');
        // Disable attractor when checkbox is unchecked
        if (this.config.onPhysicsChange) {
          this.config.onPhysicsChange('attractor', {
            strength: 0,
            position: [0, 0, 0]
          });
        }
      }
    });
    
    // Attractor strength slider
    this.attractorStrengthSlider.addEventListener('input', this.onAttractorStrengthChange = () => {
      const value = this.attractorStrengthSlider.value;
      this.attractorStrengthValue.textContent = value;
      
      if (this.config.attractorEnabled && this.config.onPhysicsChange) {
        this.config.onPhysicsChange('attractor', {
          strength: parseFloat(value),
          position: [
            parseFloat(this.attractorPositionXSlider.value),
            parseFloat(this.attractorPositionYSlider.value),
            parseFloat(this.attractorPositionZSlider.value)
          ]
        });
      }
    });
    
    // Attractor position sliders
    this.attractorPositionXSlider.addEventListener('input', this.onAttractorPositionXChange = () => {
      const value = this.attractorPositionXSlider.value;
      this.attractorPositionXValue.textContent = value;
      
      if (this.config.attractorEnabled && this.config.onPhysicsChange) {
        this.config.onPhysicsChange('attractor', {
          strength: parseFloat(this.attractorStrengthSlider.value),
          position: [
            parseFloat(value),
            parseFloat(this.attractorPositionYSlider.value),
            parseFloat(this.attractorPositionZSlider.value)
          ]
        });
      }
    });
    
    this.attractorPositionYSlider.addEventListener('input', this.onAttractorPositionYChange = () => {
      const value = this.attractorPositionYSlider.value;
      this.attractorPositionYValue.textContent = value;
      
      if (this.config.attractorEnabled && this.config.onPhysicsChange) {
        this.config.onPhysicsChange('attractor', {
          strength: parseFloat(this.attractorStrengthSlider.value),
          position: [
            parseFloat(this.attractorPositionXSlider.value),
            parseFloat(value),
            parseFloat(this.attractorPositionZSlider.value)
          ]
        });
      }
    });
    
    this.attractorPositionZSlider.addEventListener('input', this.onAttractorPositionZChange = () => {
      const value = this.attractorPositionZSlider.value;
      this.attractorPositionZValue.textContent = value;
      
      if (this.config.attractorEnabled && this.config.onPhysicsChange) {
        this.config.onPhysicsChange('attractor', {
          strength: parseFloat(this.attractorStrengthSlider.value),
          position: [
            parseFloat(this.attractorPositionXSlider.value),
            parseFloat(this.attractorPositionYSlider.value),
            parseFloat(value)
          ]
        });
      }
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
        this.cylinderSettings.classList.add('hidden');
        this.squareSettings.classList.add('hidden');
        this.circleSettings.classList.add('hidden');
      } else if (this.config.emissionShape === 'sphere') {
        this.cubeSettings.classList.add('hidden');
        this.sphereSettings.classList.remove('hidden');
        this.cylinderSettings.classList.add('hidden');
        this.squareSettings.classList.add('hidden');
        this.circleSettings.classList.add('hidden');
      } else if (this.config.emissionShape === 'cylinder') {
        this.cubeSettings.classList.add('hidden');
        this.sphereSettings.classList.add('hidden');
        this.cylinderSettings.classList.remove('hidden');
        this.squareSettings.classList.add('hidden');
        this.circleSettings.classList.add('hidden');
      } else if (this.config.emissionShape === 'square') {
        this.cubeSettings.classList.add('hidden');
        this.sphereSettings.classList.add('hidden');
        this.cylinderSettings.classList.add('hidden');
        this.squareSettings.classList.remove('hidden');
        this.circleSettings.classList.add('hidden');
      } else if (this.config.emissionShape === 'circle') {
        this.cubeSettings.classList.add('hidden');
        this.sphereSettings.classList.add('hidden');
        this.cylinderSettings.classList.add('hidden');
        this.squareSettings.classList.add('hidden');
        this.circleSettings.classList.remove('hidden');
      }
    });
    
    // Cube length slider
    this.cubeLengthSlider.addEventListener('input', this.onCubeLengthChange = () => {
      const value = this.cubeLengthSlider.value;
      this.cubeLengthValue.textContent = value;
      this.config.outerLength = parseFloat(value);
      // Also update cubeLength to keep them synchronized
      this.config.cubeLength = parseFloat(value);
      
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
    
    // Velocity override checkboxes and sliders
    this.overrideXVelocityCheckbox.addEventListener('change', this.onOverrideXVelocityChange = () => {
      this.config.overrideXVelocity = this.overrideXVelocityCheckbox.checked;
      
      if (this.overrideXVelocityCheckbox.checked) {
        this.xVelocitySliderContainer.classList.remove('hidden');
        this.config.xVelocity = parseFloat(this.xVelocitySlider.value);
      } else {
        this.xVelocitySliderContainer.classList.add('hidden');
      }
      
      if (this.config.onRespawn) {
        this.config.onRespawn();
      }
    });
    
    this.overrideYVelocityCheckbox.addEventListener('change', this.onOverrideYVelocityChange = () => {
      this.config.overrideYVelocity = this.overrideYVelocityCheckbox.checked;
      
      if (this.overrideYVelocityCheckbox.checked) {
        this.yVelocitySliderContainer.classList.remove('hidden');
        this.config.yVelocity = parseFloat(this.yVelocitySlider.value);
      } else {
        this.yVelocitySliderContainer.classList.add('hidden');
      }
      
      if (this.config.onRespawn) {
        this.config.onRespawn();
      }
    });
    
    this.overrideZVelocityCheckbox.addEventListener('change', this.onOverrideZVelocityChange = () => {
      this.config.overrideZVelocity = this.overrideZVelocityCheckbox.checked;
      
      if (this.overrideZVelocityCheckbox.checked) {
        this.zVelocitySliderContainer.classList.remove('hidden');
        this.config.zVelocity = parseFloat(this.zVelocitySlider.value);
      } else {
        this.zVelocitySliderContainer.classList.add('hidden');
      }
      
      if (this.config.onRespawn) {
        this.config.onRespawn();
      }
    });
    
    this.xVelocitySlider.addEventListener('input', this.onXVelocityChange = () => {
      const value = this.xVelocitySlider.value;
      this.xVelocityValue.textContent = value;
      
      if (this.config.overrideXVelocity) {
        this.config.xVelocity = parseFloat(value);
        
        if (this.config.onRespawn) {
          this.config.onRespawn();
        }
      }
    });
    
    this.yVelocitySlider.addEventListener('input', this.onYVelocityChange = () => {
      const value = this.yVelocitySlider.value;
      this.yVelocityValue.textContent = value;
      
      if (this.config.overrideYVelocity) {
        this.config.yVelocity = parseFloat(value);
        
        if (this.config.onRespawn) {
          this.config.onRespawn();
        }
      }
    });
    
    this.zVelocitySlider.addEventListener('input', this.onZVelocityChange = () => {
      const value = this.zVelocitySlider.value;
      this.zVelocityValue.textContent = value;
      
      if (this.config.overrideZVelocity) {
        this.config.zVelocity = parseFloat(value);
        
        if (this.config.onRespawn) {
          this.config.onRespawn();
        }
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
    
    // Circle velocity direction dropdown
    this.circleVelocityDirectionSelect.addEventListener('change', this.onCircleVelocityDirectionChange = () => {
      this.config.circleVelocityDirection = this.circleVelocityDirectionSelect.value;
      
      if (this.config.onRespawn) {
        this.config.onRespawn();
      }
    });
    
    // Cylinder inner radius slider
    this.cylinderInnerRadiusSlider.addEventListener('input', this.onCylinderInnerRadiusChange = () => {
      const value = this.cylinderInnerRadiusSlider.value;
      this.cylinderInnerRadiusValue.textContent = value;
      this.config.cylinderInnerRadius = parseFloat(value);
      
      // Make sure inner radius is less than outer radius
      if (this.config.cylinderInnerRadius >= this.config.cylinderOuterRadius) {
        this.cylinderOuterRadiusSlider.value = this.config.cylinderInnerRadius + 0.1;
        this.cylinderOuterRadiusValue.textContent = this.cylinderOuterRadiusSlider.value;
        this.config.cylinderOuterRadius = parseFloat(this.cylinderOuterRadiusSlider.value);
      }
    });
    
    // Cylinder outer radius slider
    this.cylinderOuterRadiusSlider.addEventListener('input', this.onCylinderOuterRadiusChange = () => {
      const value = this.cylinderOuterRadiusSlider.value;
      this.cylinderOuterRadiusValue.textContent = value;
      this.config.cylinderOuterRadius = parseFloat(value);
      
      // Make sure outer radius is greater than inner radius
      if (this.config.cylinderOuterRadius <= this.config.cylinderInnerRadius) {
        this.cylinderInnerRadiusSlider.value = this.config.cylinderOuterRadius - 0.1;
        this.cylinderInnerRadiusValue.textContent = this.cylinderInnerRadiusSlider.value;
        this.config.cylinderInnerRadius = parseFloat(this.cylinderInnerRadiusSlider.value);
      }
    });
    
    // Cylinder height slider
    this.cylinderHeightSlider.addEventListener('input', this.onCylinderHeightChange = () => {
      const value = this.cylinderHeightSlider.value;
      this.cylinderHeightValue.textContent = value;
      this.config.cylinderHeight = parseFloat(value);
    });
    
    // Cylinder velocity direction dropdown
    this.cylinderVelocityDirectionSelect.addEventListener('change', this.onCylinderVelocityDirectionChange = () => {
      this.config.cylinderVelocityDirection = this.cylinderVelocityDirectionSelect.value;
      
      if (this.config.onRespawn) {
        this.config.onRespawn();
      }
    });
    
    // Texture checkbox listener
    if (this.textureCheckbox) {
      this.textureCheckbox.addEventListener('change', this.onTextureCheckboxChange = () => {
        this.config.textureEnabled = this.textureCheckbox.checked;
        
        if (this.config.textureEnabled) {
          this.textureUploadContainer.classList.remove('hidden');
        } else {
          this.textureUploadContainer.classList.add('hidden');
        }
        
        if (this.config.onAppearanceChange) {
          this.config.onAppearanceChange();
        }
      });
    }
    
    // Texture file input listener
    if (this.textureFileInput) {
      this.textureFileInput.addEventListener('change', this.onTextureFileChange = async (event) => {
        const file = event.target.files[0];
        if (!file) return;
        
        try {
          // Create a URL for the selected file
          const fileUrl = URL.createObjectURL(file);
          
          // Create an image element to load the texture
          const img = new Image();
          img.onload = async () => {
            try {
              // Create an ImageBitmap which WebGPU can use
              const imageBitmap = await createImageBitmap(img);
              
              // Update the texture display
              this.currentTextureDisplay.innerHTML = '';
              const thumbnailImg = document.createElement('img');
              thumbnailImg.src = fileUrl;
              thumbnailImg.style.width = '100%';
              thumbnailImg.style.height = '100%';
              thumbnailImg.style.objectFit = 'contain';
              this.currentTextureDisplay.appendChild(thumbnailImg);
              
              // Show the remove button
              this.removeTextureButton.classList.remove('hidden');
              
              // Enable texture in the config
              this.config.textureEnabled = true;
              this.textureCheckbox.checked = true;
              this.textureUploadContainer.classList.remove('hidden');
              
              // Store the texture URL in the config for this specific system
              this.lastUploadedTextureUrl = fileUrl;
              if (!this.config.textureUrls) {
                this.config.textureUrls = {};
              }
              const activeSystem = this.config.getActiveSystem?.();
              if (activeSystem) {
                const systemId = this.config.id;
                this.config.textureUrls[systemId] = fileUrl;
              }
              
              // Set the texture on the active particle system
              if (activeSystem && activeSystem.setTexture) {
                await activeSystem.setTexture(imageBitmap);
                
                // Force a complete buffer update to ensure vertex buffers are properly set
                if (activeSystem.updateBuffers) {
                  activeSystem.updateBuffers();
                }
              }
              
              // Update appearance uniforms
              if (this.config.onAppearanceChange) {
                this.config.onAppearanceChange();
              }
            } catch (error) {
              console.error('Error processing texture:', error);
              alert('Failed to process texture. Please try a different image.');
            }
          };
          img.src = fileUrl;
        } catch (error) {
          console.error('Error loading texture:', error);
          alert('Failed to load texture. Please try a different image.');
        }
      });
    }
    
    // Set up remove texture button
    if (this.removeTextureButton) {
      this.removeTextureButton.addEventListener('click', this.onRemoveTextureClick = () => {
        this.removeTexture();
      });
    }
    
    // Rotation controls event handlers
    this.randomRotationCheckbox.addEventListener('change', this.onRandomRotationChange = () => {
      this.config.randomRotation = this.randomRotationCheckbox.checked;
      
      if (this.config.randomRotation) {
        this.fixedRotationContainer.classList.add('hidden');
        this.randomRotationContainer.classList.remove('hidden');
      } else {
        this.fixedRotationContainer.classList.remove('hidden');
        this.randomRotationContainer.classList.add('hidden');
      }
      
      if (this.config.onAppearanceChange) {
        this.config.onAppearanceChange();
      }
    });
    
    this.rotationSlider.addEventListener('input', this.onRotationChange = () => {
      const value = this.rotationSlider.value;
      this.rotationValue.textContent = `${value}°`;
      this.config.rotation = parseFloat(value);
      
      if (this.config.onAppearanceChange) {
        this.config.onAppearanceChange();
      }
    });
    
    this.minRotationSlider.addEventListener('input', this.onMinRotationChange = () => {
      const value = this.minRotationSlider.value;
      this.minRotationValue.textContent = `${value}°`;
      this.config.minRotation = parseFloat(value);
      
      // Make sure min rotation is less than max rotation
      if (this.config.minRotation >= this.config.maxRotation) {
        this.maxRotationSlider.value = this.config.minRotation + 10;
        this.maxRotationValue.textContent = `${this.maxRotationSlider.value}°`;
        this.config.maxRotation = parseFloat(this.maxRotationSlider.value);
      }
      
      if (this.config.onAppearanceChange) {
        this.config.onAppearanceChange();
      }
    });
    
    this.maxRotationSlider.addEventListener('input', this.onMaxRotationChange = () => {
      const value = this.maxRotationSlider.value;
      this.maxRotationValue.textContent = `${value}°`;
      this.config.maxRotation = parseFloat(value);
      
      // Make sure max rotation is greater than min rotation
      if (this.config.maxRotation <= this.config.minRotation) {
        this.minRotationSlider.value = this.config.maxRotation - 10;
        this.minRotationValue.textContent = `${this.minRotationSlider.value}°`;
        this.config.minRotation = parseFloat(this.minRotationSlider.value);
      }
      
      if (this.config.onAppearanceChange) {
        this.config.onAppearanceChange();
      }
    });
    
    // Shape rotation sliders
    this.shapeRotationXSlider.addEventListener('input', this.onShapeRotationXChange = () => {
      const value = this.shapeRotationXSlider.value;
      this.shapeRotationXValue.textContent = `${value}°`;
      this.config.shapeRotationX = parseFloat(value);
      
      if (this.config.onRespawn) {
        this.config.onRespawn();
      }
    });
    
    this.shapeRotationYSlider.addEventListener('input', this.onShapeRotationYChange = () => {
      const value = this.shapeRotationYSlider.value;
      this.shapeRotationYValue.textContent = `${value}°`;
      this.config.shapeRotationY = parseFloat(value);
      
      if (this.config.onRespawn) {
        this.config.onRespawn();
      }
    });
    
    this.shapeRotationZSlider.addEventListener('input', this.onShapeRotationZChange = () => {
      const value = this.shapeRotationZSlider.value;
      this.shapeRotationZValue.textContent = `${value}°`;
      this.config.shapeRotationZ = parseFloat(value);
      
      if (this.config.onRespawn) {
        this.config.onRespawn();
      }
    });
  }

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
    if (this.onGravityChange) {
      this.gravityCheckbox.removeEventListener('change', this.onGravityChange);
    }
    if (this.onGravityStrengthChange) {
      this.gravityStrengthSlider.removeEventListener('input', this.onGravityStrengthChange);
    }
    
    // Damping event listeners
    if (this.onDampingChange) {
      this.dampingCheckbox.removeEventListener('change', this.onDampingChange);
    }
    if (this.onDampingStrengthChange) {
      this.dampingStrengthSlider.removeEventListener('input', this.onDampingStrengthChange);
    }
    
    // Attractor event listeners
    if (this.onAttractorChange) {
      this.attractorCheckbox.removeEventListener('change', this.onAttractorChange);
    }
    if (this.onAttractorStrengthChange) {
      this.attractorStrengthSlider.removeEventListener('input', this.onAttractorStrengthChange);
    }
    if (this.onAttractorPositionXChange) {
      this.attractorPositionXSlider.removeEventListener('input', this.onAttractorPositionXChange);
    }
    if (this.onAttractorPositionYChange) {
      this.attractorPositionYSlider.removeEventListener('input', this.onAttractorPositionYChange);
    }
    if (this.onAttractorPositionZChange) {
      this.attractorPositionZSlider.removeEventListener('input', this.onAttractorPositionZChange);
    }
    
    // Add velocity override event listener removals
    if (this.onOverrideXVelocityChange) {
      this.overrideXVelocityCheckbox.removeEventListener('change', this.onOverrideXVelocityChange);
    }
    if (this.onOverrideYVelocityChange) {
      this.overrideYVelocityCheckbox.removeEventListener('change', this.onOverrideYVelocityChange);
    }
    if (this.onOverrideZVelocityChange) {
      this.overrideZVelocityCheckbox.removeEventListener('change', this.onOverrideZVelocityChange);
    }
    
    // Also remove the velocity slider event listeners
    if (this.onXVelocityChange) {
      this.xVelocitySlider.removeEventListener('input', this.onXVelocityChange);
    }
    if (this.onYVelocityChange) {
      this.yVelocitySlider.removeEventListener('input', this.onYVelocityChange);
    }
    if (this.onZVelocityChange) {
      this.zVelocitySlider.removeEventListener('input', this.onZVelocityChange);
    }
    
    // Texture event listeners
    if (this.onTextureCheckboxChange) {
      this.textureCheckbox.removeEventListener('change', this.onTextureCheckboxChange);
    }
    if (this.onTextureFileChange) {
      this.textureFileInput.removeEventListener('change', this.onTextureFileChange);
    }
    if (this.onRemoveTextureClick) {
      this.removeTextureButton.removeEventListener('click', this.onRemoveTextureClick);
    }
    
    // Rotation controls event listeners
    if (this.onRandomRotationChange) {
      this.randomRotationCheckbox.removeEventListener('change', this.onRandomRotationChange);
    }
    if (this.onRotationChange) {
      this.rotationSlider.removeEventListener('input', this.onRotationChange);
    }
    if (this.onMinRotationChange) {
      this.minRotationSlider.removeEventListener('input', this.onMinRotationChange);
    }
    if (this.onMaxRotationChange) {
      this.maxRotationSlider.removeEventListener('input', this.onMaxRotationChange);
    }
    
    // Circle velocity direction dropdown
    if (this.onCircleVelocityDirectionChange) {
      this.circleVelocityDirectionSelect.removeEventListener('change', this.onCircleVelocityDirectionChange);
    }
    
    // Cylinder controls
    if (this.onCylinderInnerRadiusChange) {
      this.cylinderInnerRadiusSlider.removeEventListener('input', this.onCylinderInnerRadiusChange);
    }
    if (this.onCylinderOuterRadiusChange) {
      this.cylinderOuterRadiusSlider.removeEventListener('input', this.onCylinderOuterRadiusChange);
    }
    if (this.onCylinderHeightChange) {
      this.cylinderHeightSlider.removeEventListener('input', this.onCylinderHeightChange);
    }
    if (this.onCylinderVelocityDirectionChange) {
      this.cylinderVelocityDirectionSelect.removeEventListener('change', this.onCylinderVelocityDirectionChange);
    }
    
    // Shape rotation sliders
    if (this.onShapeRotationXChange) {
      this.shapeRotationXSlider.removeEventListener('input', this.onShapeRotationXChange);
    }
    if (this.onShapeRotationYChange) {
      this.shapeRotationYSlider.removeEventListener('input', this.onShapeRotationYChange);
    }
    if (this.onShapeRotationZChange) {
      this.shapeRotationZSlider.removeEventListener('input', this.onShapeRotationZChange);
    }
  }

  updateUIState() {
    // Initialize velocity override controls
    
    // Set initial checkbox state
    this.overrideXVelocityCheckbox.checked = this.config.overrideXVelocity || false;
    this.overrideYVelocityCheckbox.checked = this.config.overrideYVelocity || false;
    this.overrideZVelocityCheckbox.checked = this.config.overrideZVelocity || false;
    
    // Set initial slider values
    this.xVelocitySlider.value = this.config.xVelocity || 0;
    this.yVelocitySlider.value = this.config.yVelocity || 0;
    this.zVelocitySlider.value = this.config.zVelocity || 0;
    
    // Set text display values
    this.xVelocityValue.textContent = this.config.xVelocity || 0;
    this.yVelocityValue.textContent = this.config.yVelocity || 0;
    this.zVelocityValue.textContent = this.config.zVelocity || 0;
    
    // Show/hide slider containers based on checkbox state
    if (this.config.overrideXVelocity) {
      this.xVelocitySliderContainer.classList.remove('hidden');
    } else {
      this.xVelocitySliderContainer.classList.add('hidden');
    }
    
    if (this.config.overrideYVelocity) {
      this.yVelocitySliderContainer.classList.remove('hidden');
    } else {
      this.yVelocitySliderContainer.classList.add('hidden');
    }
    
    if (this.config.overrideZVelocity) {
      this.zVelocitySliderContainer.classList.remove('hidden');
    } else {
      this.zVelocitySliderContainer.classList.add('hidden');
    }
    
    // Initialize rotation controls
    this.randomRotationCheckbox.checked = this.config.randomRotation || false;
    this.rotationSlider.value = this.config.rotation || 0;
    this.rotationValue.textContent = `${this.config.rotation || 0}°`;
    this.minRotationSlider.value = this.config.minRotation || 0;
    this.minRotationValue.textContent = `${this.config.minRotation || 0}°`;
    this.maxRotationSlider.value = this.config.maxRotation || 90;
    this.maxRotationValue.textContent = `${this.config.maxRotation || 90}°`;
    
    if (this.config.randomRotation) {
      this.fixedRotationContainer.classList.add('hidden');
      this.randomRotationContainer.classList.remove('hidden');
    } else {
      this.fixedRotationContainer.classList.remove('hidden');
      this.randomRotationContainer.classList.add('hidden');
    }
    
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
    
    // Initialize gravity settings
    this.gravityCheckbox.checked = this.config.gravityEnabled || false;
    this.gravityStrengthSlider.value = this.config.gravityStrength || 2;
    this.gravityStrengthValue.textContent = this.config.gravityStrength || 2;
    
    if (this.config.gravityEnabled) {
      this.gravityStrengthContainer.classList.remove('hidden');
    } else {
      this.gravityStrengthContainer.classList.add('hidden');
    }
    
    // Initialize damping settings
    this.dampingCheckbox.checked = this.config.dampingEnabled || false;
    this.dampingStrengthSlider.value = this.config.dampingStrength || 1;
    this.dampingStrengthValue.textContent = this.config.dampingStrength || 1;
    
    if (this.config.dampingEnabled) {
      this.dampingStrengthContainer.classList.remove('hidden');
    } else {
      this.dampingStrengthContainer.classList.add('hidden');
    }
    
    // Initialize attractor settings
    this.attractorCheckbox.checked = this.config.attractorEnabled || false;
    this.attractorStrengthSlider.value = this.config.attractorStrength || 1;
    this.attractorStrengthValue.textContent = this.config.attractorStrength || 1;
    
    // Initialize attractor position sliders with default values if not set
    const attractorPosition = this.config.attractorPosition || [0, 0, 0];
    this.attractorPositionXSlider.value = attractorPosition[0];
    this.attractorPositionYSlider.value = attractorPosition[1];
    this.attractorPositionZSlider.value = attractorPosition[2];
    this.attractorPositionXValue.textContent = attractorPosition[0];
    this.attractorPositionYValue.textContent = attractorPosition[1];
    this.attractorPositionZValue.textContent = attractorPosition[2];
    
    // Show/hide attractor controls
    if (this.config.attractorEnabled) {
      this.attractorControlsContainer.classList.remove('hidden');
    } else {
      this.attractorControlsContainer.classList.add('hidden');
    }
    
    this.fadeCheckbox.checked = this.config.fadeEnabled;
    this.colorTransitionCheckbox.checked = this.config.colorTransitionEnabled;
    this.burstCheckbox.checked = this.config.burstMode;
    
    this.particleColorInput.value = rgbToHex(this.config.particleColor);
    this.startColorInput.value = rgbToHex(this.config.startColor);
    this.endColorInput.value = rgbToHex(this.config.endColor);
    
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
      this.cylinderSettings.classList.add('hidden');
      this.squareSettings.classList.add('hidden');
      this.circleSettings.classList.add('hidden');
    } else if (this.config.emissionShape === 'sphere') {
      this.cubeSettings.classList.add('hidden');
      this.sphereSettings.classList.remove('hidden');
      this.cylinderSettings.classList.add('hidden');
      this.squareSettings.classList.add('hidden');
      this.circleSettings.classList.add('hidden');
    } else if (this.config.emissionShape === 'cylinder') {
      this.cubeSettings.classList.add('hidden');
      this.sphereSettings.classList.add('hidden');
      this.cylinderSettings.classList.remove('hidden');
      this.squareSettings.classList.add('hidden');
      this.circleSettings.classList.add('hidden');
    } else if (this.config.emissionShape === 'square') {
      this.cubeSettings.classList.add('hidden');
      this.sphereSettings.classList.add('hidden');
      this.cylinderSettings.classList.add('hidden');
      this.squareSettings.classList.remove('hidden');
      this.circleSettings.classList.add('hidden');
    } else if (this.config.emissionShape === 'circle') {
      this.cubeSettings.classList.add('hidden');
      this.sphereSettings.classList.add('hidden');
      this.cylinderSettings.classList.add('hidden');
      this.squareSettings.classList.add('hidden');
      this.circleSettings.classList.remove('hidden');
    }
    
    if (this.config.bloomEnabled) {
      this.bloomIntensityContainer.classList.remove('hidden');
    } else {
      this.bloomIntensityContainer.classList.add('hidden');
    }
    
    // Initialize texture UI state when switching between systems
    if (this.textureCheckbox) {
      this.textureCheckbox.checked = this.config.textureEnabled || false;
      
      if (this.config.textureEnabled) {
        this.textureUploadContainer.classList.remove('hidden');
      } else {
        this.textureUploadContainer.classList.add('hidden');
      }
      
      // If there's a current texture, update the display
      const activeSystem = this.config.getActiveSystem?.();
      if (activeSystem && activeSystem.particleTexture) {
        if (activeSystem.particleTexture.label !== "defaultParticleTexture") {
          // Check if we have a stored URL for this system
          const systemId = this.config.id;
          if (this.config.textureUrls && this.config.textureUrls[systemId]) {
            this.lastUploadedTextureUrl = this.config.textureUrls[systemId];
            
            // Show the texture in the preview area
            this.currentTextureDisplay.innerHTML = '';
            const img = document.createElement('img');
            img.src = this.lastUploadedTextureUrl;
            img.style.width = '100%';
            img.style.height = '100%';
            img.style.objectFit = 'contain';
            this.currentTextureDisplay.appendChild(img);
            
            // Show the remove button
            this.removeTextureButton.classList.remove('hidden');
          } else {
            this.currentTextureDisplay.innerHTML = 'None';
            this.removeTextureButton.classList.add('hidden');
          }
        } else {
          this.currentTextureDisplay.innerHTML = 'None';
          this.removeTextureButton.classList.add('hidden');
        }
      } else {
        this.currentTextureDisplay.innerHTML = 'None';
        this.removeTextureButton.classList.add('hidden');
      }
    }
    
    // Initialize circle velocity direction dropdown
    this.circleVelocityDirectionSelect.value = this.config.circleVelocityDirection || 'away';
    
    // Initialize cylinder settings
    this.cylinderInnerRadiusSlider.value = this.config.cylinderInnerRadius || 0;
    this.cylinderInnerRadiusValue.textContent = this.config.cylinderInnerRadius || 0;
    this.cylinderOuterRadiusSlider.value = this.config.cylinderOuterRadius || 2;
    this.cylinderOuterRadiusValue.textContent = this.config.cylinderOuterRadius || 2;
    this.cylinderHeightSlider.value = this.config.cylinderHeight || 4;
    this.cylinderHeightValue.textContent = this.config.cylinderHeight || 4;
    this.cylinderVelocityDirectionSelect.value = this.config.cylinderVelocityDirection || 'away';
    
    // Initialize shape rotation sliders
    this.shapeRotationXSlider.value = this.config.shapeRotationX || 0;
    this.shapeRotationXValue.textContent = `${this.config.shapeRotationX || 0}°`;
    this.shapeRotationYSlider.value = this.config.shapeRotationY || 0;
    this.shapeRotationYValue.textContent = `${this.config.shapeRotationY || 0}°`;
    this.shapeRotationZSlider.value = this.config.shapeRotationZ || 0;
    this.shapeRotationZValue.textContent = `${this.config.shapeRotationZ || 0}°`;
  }

  // Method to remove texture from the current system
  removeTexture() {
    const activeSystem = this.config.getActiveSystem?.();
    if (activeSystem) {
      // Use the dedicated method to reset texture
      activeSystem.resetTexture();
      
      // Update UI
      this.currentTextureDisplay.innerHTML = 'None';
      
      // Update config
      this.config.textureEnabled = false;
      
      // Remove the stored texture URL for this system
      if (this.config.textureUrls && this.config.id) {
        delete this.config.textureUrls[this.config.id];
      }
      
      // Clear the last uploaded texture URL
      this.lastUploadedTextureUrl = null;
      
      // Reset the file input element to clear the filename
      if (this.textureFileInput) {
        // Create a new file input element to replace the old one
        const newFileInput = document.createElement('input');
        newFileInput.type = 'file';
        newFileInput.id = 'texture-file-input';
        newFileInput.accept = 'image/*';
        
        // Replace the old input with the new one
        const parentElement = this.textureFileInput.parentElement;
        if (parentElement) {
          parentElement.replaceChild(newFileInput, this.textureFileInput);
          
          // Update the reference to the new input
          this.textureFileInput = newFileInput;
          
          // Reattach the event listener to the new element
          this.textureFileInput.addEventListener('change', this.onTextureFileChange);
        }
      }
      
      // Make sure checkbox is unchecked but keep the container visible
      this.textureCheckbox.checked = false;
      
      // Hide remove button 
      this.removeTextureButton.classList.add('hidden');
      
      // Call appearance change to update rendering if needed
      if (this.config.onAppearanceChange) {
        this.config.onAppearanceChange();
      }
    }
  }
}