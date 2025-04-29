/**
 * Particle system core functionality
 */

export class ParticleSystem {
  constructor(device, config) {
    this.device = device;
    this.config = config;
    
    // Particle system state
    this.MAX_PARTICLES = config.maxParticles || 10000;
    this.particleCount = config.particleCount || 100;
    this.activeParticles = 0;
    this.emitting = false;
    this.currentEmissionTime = 0;
    
    // Create typed arrays for particle data and velocities
    this.particleData = new Float32Array(this.MAX_PARTICLES * 8); // [x, y, z, r, g, b, age, lifetime]
    this.particleVelocities = new Float32Array(this.MAX_PARTICLES * 4); // [vx, vy, vz, padding]
    
    // Create GPU buffers for rendering
    this.instanceBuffer = device.createBuffer({
      size: this.MAX_PARTICLES * 8 * 4,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST | GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
      label: "particleInstanceBuffer"
    });
    
    // Create GPU buffers for compute shader
    this.velocityBuffer = device.createBuffer({
      size: this.MAX_PARTICLES * 4 * 4, // vec3 + padding
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
      label: "particleVelocityBuffer"
    });
    
    // Create physics uniform buffer
    this.physicsUniformBuffer = device.createBuffer({
      size: 48, // 12 float32 values (48 bytes)
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      label: "physicsUniformBuffer"
    });
    
    // Create appearance uniform buffer for this specific particle system
    this.appearanceUniformBuffer = device.createBuffer({
      size: 64, // [fadeEnabled, colorTransitionEnabled, particleSize, padding, colors...]
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      label: "appearanceUniformBuffer"
    });
    
    // Create bloom intensity buffer specific to this system
    this.bloomIntensityBuffer = device.createBuffer({
      size: 64, // intensity (f32) + padding
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      label: "systemBloomIntensityBuffer"
    });
    
    // Initialize bloom intensity buffer with this system's bloom intensity
    this.updateBloomIntensity();
    
    // Initialize appearance uniform buffer with this system's settings
    this.updateAppearanceUniform();
    
    // Set default physics values
    this.physicsSettings = {
      deltaTime: 0.016,
      gravity: 0.0,
      turbulence: 0.0,
      attractorStrength: 0.0,
      attractorPosition: [0.0, 0.0, 0.0]
    };
    
    // Velocity override settings
    this.velocityOverrides = {
      overrideX: false,
      overrideY: false,
      overrideZ: false,
      xVelocity: 0,
      yVelocity: 0,
      zVelocity: 0
    };
    
    // Fixed timestep physics system for consistent updates
    this.fixedDeltaTime = 1.0 / 60.0; // Consistent 60Hz physics updates
    this.physicsClock = 0;
    this.physicsAccumulator = 0;
    
    // Initialize the frame counter for readback scheduling
    this.frameCount = 0;
    this.shouldReset = false;
    this.computeReady = false;
    
    // Minimum update frequency
    this.minUpdatesPerSecond = 30;
    this.lastUpdateTime = 0;
    
    // Create compute pipeline and bind group layout
    this.initComputePipeline(device);
  }
  
  updateAppearanceUniform() {
    const appearanceData = new Float32Array([
      this.config.fadeEnabled ? 1.0 : 0.0,
      this.config.colorTransitionEnabled ? 1.0 : 0.0,
      this.config.particleSize,
      0.0, // padding
      // Single color (vec3 + padding)
      this.config.particleColor[0], this.config.particleColor[1], this.config.particleColor[2], 0.0,
      // Start color (vec3 + padding)
      this.config.startColor[0], this.config.startColor[1], this.config.startColor[2], 0.0,
      // End color (vec3 + padding)
      this.config.endColor[0], this.config.endColor[1], this.config.endColor[2], 0.0
    ]);
    
    this.device.queue.writeBuffer(this.appearanceUniformBuffer, 0, appearanceData);
  }
  
  updateBloomIntensity() {
    const bloomIntensityData = new Float32Array(16).fill(0);
    bloomIntensityData[0] = this.config.bloomIntensity || 1.0;
    this.device.queue.writeBuffer(this.bloomIntensityBuffer, 0, bloomIntensityData);
  }

  async initComputePipeline(device) {
    try {
      await this.createComputePipeline(device);
      this.computeReady = true;
    } catch (error) {
      console.error("Error initializing compute pipeline:", error);
    }
  }
  
  async createComputePipeline(device) {
    const { particlePhysicsShader } = await import('./shaders.js');
    
    // Create bind group layout for compute shader
    this.computeBindGroupLayout = device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: 'uniform' }
        },
        {
          binding: 1,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: 'storage' }
        },
        {
          binding: 2,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: 'storage' }
        }
      ]
    });
    
    // Create compute pipeline
    this.computePipeline = device.createComputePipeline({
      layout: device.createPipelineLayout({
        bindGroupLayouts: [this.computeBindGroupLayout]
      }),
      compute: {
        module: device.createShaderModule({
          code: particlePhysicsShader
        }),
        entryPoint: 'main'
      }
    });
    
    // Create compute bind group
    this.computeBindGroup = device.createBindGroup({
      layout: this.computeBindGroupLayout,
      entries: [
        {
          binding: 0,
          resource: { buffer: this.physicsUniformBuffer }
        },
        {
          binding: 1,
          resource: { buffer: this.instanceBuffer }
        },
        {
          binding: 2,
          resource: { buffer: this.velocityBuffer }
        }
      ]
    });
  }

  spawnParticles() {
    // Reset counters
    this.activeParticles = 0;
    this.currentEmissionTime = 0;
    
    if (this.config.burstMode) {
      // Burst mode: emit all particles at once
      const burstCount = this.config.particleCount;
      // Update the particle count to match the requested burst count
      this.particleCount = burstCount;
      
      // Track the number of particles emitted in each batch
      let particlesBatch = 0;
      const batchSize = 500; // Process in smaller batches
      
      // Emit all particles immediately, but in batches
      for (let i = 0; i < burstCount; i++) {
        this.emitParticle();
        particlesBatch++;
        
        // Write to GPU in batches to avoid large buffer uploads at once
        if (particlesBatch >= batchSize || i === burstCount - 1) {
          const startIdx = i - particlesBatch + 1;
          const dataOffset = startIdx * 8;
          const velOffset = startIdx * 4;
          
          // Upload this batch to the GPU
          this.device.queue.writeBuffer(
            this.instanceBuffer, 
            dataOffset * 4, // Offset in bytes
            this.particleData, 
            dataOffset, 
            particlesBatch * 8
          );
          
          this.device.queue.writeBuffer(
            this.velocityBuffer, 
            velOffset * 4, // Offset in bytes
            this.particleVelocities, 
            velOffset, 
            particlesBatch * 4
          );
          
          particlesBatch = 0;
        }
      }
      
      // No need to continue emitting
      this.emitting = false;
    } else {
      // Continuous emission mode
      this.emitting = true;
      
      // Calculate max particles based on emission rate and duration
      const baseLifetime = this.config.lifetime || 5;
      const effectiveDuration = Math.max(this.config.emissionDuration || 10, baseLifetime);
      this.particleCount = Math.min(Math.ceil((this.config.emissionRate || 10) * effectiveDuration), this.MAX_PARTICLES);
    }
  }

  emitParticle() {
    if (this.activeParticles >= this.particleCount) return false;
    
    const index = this.activeParticles * 8;
    let posX, posY, posZ;
    
    if (this.config.emissionShape === 'cube') {
      // Generate random position within a cube shell
      let innerLength = this.config.innerLength || 0;
      let outerLength = this.config.outerLength || this.config.cubeLength;
      
      if (innerLength > 0) {
        // Generate position in a cube shell (between inner and outer length)
        // First get random position on a unit cube (-0.5 to 0.5)
        const sides = Math.floor(Math.random() * 6); // Choose one of 6 cube faces
        const u = Math.random() - 0.5; // -0.5 to 0.5
        const v = Math.random() - 0.5; // -0.5 to 0.5
        
        // Generate points on the selected face of a unit cube
        switch(sides) {
          case 0: // Front face (z = 0.5)
            posX = u;
            posY = v;
            posZ = 0.5;
            break;
          case 1: // Back face (z = -0.5)
            posX = u;
            posY = v;
            posZ = -0.5;
            break;
          case 2: // Right face (x = 0.5)
            posX = 0.5;
            posY = u;
            posZ = v;
            break;
          case 3: // Left face (x = -0.5)
            posX = -0.5;
            posY = u;
            posZ = v;
            break;
          case 4: // Top face (y = 0.5)
            posX = u;
            posY = 0.5;
            posZ = v;
            break;
          case 5: // Bottom face (y = -0.5)
            posX = u;
            posY = -0.5;
            posZ = v;
            break;
        }
        
        // Interpolate between inner and outer length
        const t = Math.random();
        const length = innerLength + t * (outerLength - innerLength);
        
        // Scale unit cube points to the shell size
        posX *= length;
        posY *= length;
        posZ *= length;
      } else {
        // Original solid cube generation using outer length
        posX = (Math.random() - 0.5) * outerLength;
        posY = (Math.random() - 0.5) * outerLength;
        posZ = (Math.random() - 0.5) * outerLength;
      }
    } else if (this.config.emissionShape === 'sphere') {
      // Generate random position within a sphere shell
      let theta = Math.random() * 2 * Math.PI; // azimuthal angle
      let phi = Math.acos(2 * Math.random() - 1); // polar angle
      
      // Calculate direction vector
      let dirX = Math.sin(phi) * Math.cos(theta);
      let dirY = Math.sin(phi) * Math.sin(theta);
      let dirZ = Math.cos(phi);
      
      // Generate random radius between inner and outer
      let radius;
      if (this.config.innerRadius === 0) {
        // For solid sphere, use cubic distribution for uniform volume distribution
        radius = this.config.outerRadius * Math.cbrt(Math.random());
      } else {
        // For shell, interpolate between inner and outer
        radius = this.config.innerRadius + (this.config.outerRadius - this.config.innerRadius) * Math.random();
      }
      
      // Calculate position
      posX = dirX * radius;
      posY = dirY * radius;
      posZ = dirZ * radius;
    } else if (this.config.emissionShape === 'square') {
      // Generate particles in a 2D square along the XY plane (Z=0)
      const innerSize = this.config.squareInnerSize || 0;
      const outerSize = this.config.squareSize || 2.0;
      
      if (innerSize > 0) {
        // Generate position on the perimeter of a square (between inner and outer)
        // Choose which side to place particle on
        const side = Math.floor(Math.random() * 4);
        let size = innerSize + (outerSize - innerSize) * Math.random();
        
        switch(side) {
          case 0: // Top side
            posX = (Math.random() * 2 - 1) * size; // -size to size
            posY = size;
            break;
          case 1: // Right side
            posX = size;
            posY = (Math.random() * 2 - 1) * size; // -size to size
            break;
          case 2: // Bottom side
            posX = (Math.random() * 2 - 1) * size; // -size to size
            posY = -size;
            break;
          case 3: // Left side
            posX = -size;
            posY = (Math.random() * 2 - 1) * size; // -size to size
            break;
        }
        posZ = 0; // Flat on XY plane
      } else {
        // Generate in a solid square
        posX = (Math.random() * 2 - 1) * outerSize; // -outerSize to outerSize
        posY = (Math.random() * 2 - 1) * outerSize; // -outerSize to outerSize
        posZ = 0; // Flat on XY plane
      }
    } else if (this.config.emissionShape === 'circle') {
      // Generate particles in a 2D circle along the XY plane (Z=0)
      const innerRadius = this.config.circleInnerRadius || 0;
      const outerRadius = this.config.circleOuterRadius || 2.0;
      
      // Generate angle around the circle
      const angle = Math.random() * Math.PI * 2; // 0 to 2π
      
      // Generate radius
      let radius;
      if (innerRadius > 0) {
        // For ring, interpolate between inner and outer
        radius = innerRadius + (outerRadius - innerRadius) * Math.random();
      } else {
        // For solid circle, use square root for uniform area distribution
        radius = outerRadius * Math.sqrt(Math.random());
      }
      
      // Calculate position
      posX = Math.cos(angle) * radius;
      posY = Math.sin(angle) * radius;
      posZ = 0; // Flat on XY plane
    }
    
    // Store the position
    const particleIndex = this.activeParticles * 8;
    this.particleData[particleIndex] = posX;
    this.particleData[particleIndex + 1] = posY;
    this.particleData[particleIndex + 2] = posZ;
    
    // Create velocity direction
    const velIndex = this.activeParticles * 4;
    
    // First try: Use position to create an outward direction from origin
    const length = Math.sqrt(posX * posX + posY * posY + posZ * posZ);
    let dirX, dirY, dirZ;
    
    if (length > 0.0001) {
      // Normalize position to get direction
      dirX = posX / length;
      dirY = posY / length;
      dirZ = posZ / length;
    } else {
      // If particle is at origin, create a random direction
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      dirX = Math.sin(phi) * Math.cos(theta);
      dirY = Math.sin(phi) * Math.sin(theta);
      dirZ = Math.cos(phi);
    }
    
    // Store velocity vector (scaled by speed)
    if (this.velocityOverrides.overrideX) {
      this.particleVelocities[velIndex] = this.velocityOverrides.xVelocity;
    } else {
      this.particleVelocities[velIndex] = dirX * this.config.particleSpeed;
    }
    
    if (this.velocityOverrides.overrideY) {
      this.particleVelocities[velIndex + 1] = this.velocityOverrides.yVelocity;
    } else {
      this.particleVelocities[velIndex + 1] = dirY * this.config.particleSpeed;
    }
    
    if (this.velocityOverrides.overrideZ) {
      this.particleVelocities[velIndex + 2] = this.velocityOverrides.zVelocity;
    } else {
      this.particleVelocities[velIndex + 2] = dirZ * this.config.particleSpeed;
    }
    
    this.particleVelocities[velIndex + 3] = 0; // padding
    
    // Color
    if (this.config.colorTransitionEnabled) {
      this.particleData[particleIndex + 3] = this.config.startColor[0];
      this.particleData[particleIndex + 4] = this.config.startColor[1];
      this.particleData[particleIndex + 5] = this.config.startColor[2];
    } else {
      this.particleData[particleIndex + 3] = this.config.particleColor[0];
      this.particleData[particleIndex + 4] = this.config.particleColor[1];
      this.particleData[particleIndex + 5] = this.config.particleColor[2];
    }
    
    // Age and lifetime - set a lifetime from the config with small variance
    const baseLifetime = this.config.lifetime || 5;
    this.particleData[particleIndex + 6] = 0; // Age starts at 0
    this.particleData[particleIndex + 7] = baseLifetime + (Math.random() * 0.4 - 0.2) * baseLifetime; // Add up to ±20% variance
    
    this.activeParticles++;
    return true;
  }

  updateParticles(deltaTime) {
    // Fixed-step physics system - accumulate real time and step at fixed intervals
    this.physicsAccumulator += deltaTime;
    
    // Ensure a minimum update frequency for smoother motion at low emission rates
    const now = performance.now() / 1000;
    const timeSinceLastUpdate = now - this.lastUpdateTime;
    const forceUpdate = timeSinceLastUpdate > (1.0 / this.minUpdatesPerSecond);
    
    if (this.emitting) {
      // Update emission timer
      this.currentEmissionTime += deltaTime;
      
      // Check if we're still within emission duration
      if (this.currentEmissionTime < this.config.emissionDuration) {
        // Remember the current active count before emitting new particles
        const prevActiveCount = this.activeParticles;
        
        // Calculate the number of particles to emit this frame based on emission rate
        let particlesToEmit = 0;
        
        if (this.config.emissionRate >= 1) {
          // For rates >= 1, calculate deterministically
          particlesToEmit = Math.floor(this.config.emissionRate * deltaTime);
          
          // Probabilistic component for the fractional part
          const fractionalPart = (this.config.emissionRate * deltaTime) - particlesToEmit;
          if (Math.random() < fractionalPart) {
            particlesToEmit += 1;
          }
        } else {
          // For very low rates, use pure probability
          const emissionProbability = this.config.emissionRate * deltaTime;
          if (Math.random() < emissionProbability) {
            particlesToEmit = 1;
          }
        }
        
        // Force at least one particle emission at lower emission rates if it's been too long
        if (particlesToEmit === 0 && forceUpdate && this.config.emissionRate > 0 && 
            this.activeParticles < this.particleCount) {
          particlesToEmit = 1;
        }
        
        // Emit particles
        let particlesEmitted = false;
        for (let i = 0; i < particlesToEmit; i++) {
          if (this.emitParticle()) {
            particlesEmitted = true;
          } else {
            // We reached the particle limit, no need to continue
            break;
          }
        }
        
        // Update GPU buffers if new particles were emitted - only for the newly emitted particles
        if (particlesEmitted) {
          // Only write the newly emitted particles, not the entire buffer
          const newParticleCount = this.activeParticles - prevActiveCount;
          const particleDataOffset = prevActiveCount * 8;
          const velocityOffset = prevActiveCount * 4;
          
          this.device.queue.writeBuffer(
            this.instanceBuffer, 
            particleDataOffset * 4, // Offset in bytes (float32 = 4 bytes)
            this.particleData, 
            particleDataOffset, 
            newParticleCount * 8
          );
          
          this.device.queue.writeBuffer(
            this.velocityBuffer, 
            velocityOffset * 4, // Offset in bytes (float32 = 4 bytes)
            this.particleVelocities, 
            velocityOffset, 
            newParticleCount * 4
          );
        }
      } else {
        // Important: Explicitly stop emitting once duration is reached
        this.emitting = false;
        // Set emission time to exactly match the duration to prevent any timing issues
        this.currentEmissionTime = this.config.emissionDuration;
      }
    }
    
    // Take fixed physics steps based on accumulated time
    while (this.physicsAccumulator >= this.fixedDeltaTime) {
      this.updatePhysics(this.fixedDeltaTime);
      this.physicsAccumulator -= this.fixedDeltaTime;
      this.physicsClock += this.fixedDeltaTime;
    }
    
    // Force an update if it's been too long since the last one
    if (forceUpdate && this.activeParticles > 0) {
      this.updatePhysics(this.fixedDeltaTime);
      this.lastUpdateTime = now;
    }
    
    // Readback less frequently but still regularly to clean up particles
    if (this.frameCount++ % 300 === 0) {
      this.readbackAndProcessParticles();
    }
  }
  
  updatePhysics(fixedDeltaTime) {
    // Nothing to update if no particles are active
    if (this.activeParticles <= 0 || !this.computeReady) {
      return;
    }
    
    // Update physics uniforms for compute shader
    const physicsData = new Float32Array([
      fixedDeltaTime,
      this.config.particleSpeed,
      this.physicsSettings.gravity,
      this.physicsSettings.turbulence,
      this.physicsSettings.attractorStrength,
      0.0, // padding
      this.physicsSettings.attractorPosition[0],
      this.physicsSettings.attractorPosition[1],
      this.physicsSettings.attractorPosition[2],
      0.0, // padding2
      0.0, // Extra padding
      0.0  // Extra padding
    ]);
    this.device.queue.writeBuffer(this.physicsUniformBuffer, 0, physicsData);
    
    // Run compute shader to update particles on the GPU
    const commandEncoder = this.device.createCommandEncoder({label: "ParticlePhysicsEncoder"});
    const computePass = commandEncoder.beginComputePass({label: "ParticlePhysicsPass"});
    
    computePass.setPipeline(this.computePipeline);
    computePass.setBindGroup(0, this.computeBindGroup);
    
    // Dispatch enough workgroups to cover all particles (64 threads per workgroup)
    const workgroupCount = Math.max(1, Math.ceil(this.activeParticles / 64));
    computePass.dispatchWorkgroups(workgroupCount, 1, 1);
    
    computePass.end();
    this.device.queue.submit([commandEncoder.finish()]);
    
    // Update the last update time
    this.lastUpdateTime = performance.now() / 1000;
  }
  
  async readbackAndProcessParticles() {
    if (this.activeParticles <= 0) {
      return;
    }
    
    try {
      // Create staging buffers to read back both position and velocity data
      const particleDataStagingBuffer = this.device.createBuffer({
        size: this.activeParticles * 8 * 4,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
        label: "ParticleDataReadbackBuffer"
      });
      
      const velocityStagingBuffer = this.device.createBuffer({
        size: this.activeParticles * 4 * 4,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
        label: "VelocityReadbackBuffer"
      });
      
      // Copy both buffers using a single command encoder
      const commandEncoder = this.device.createCommandEncoder({
        label: "ParticleReadbackEncoder"
      });
      
      // Copy particle data
      const particleDataCopySize = this.activeParticles * 8 * 4;
      commandEncoder.copyBufferToBuffer(
        this.instanceBuffer, 0,
        particleDataStagingBuffer, 0,
        particleDataCopySize
      );
      
      // Copy velocity data
      const velocityCopySize = this.activeParticles * 4 * 4;
      commandEncoder.copyBufferToBuffer(
        this.velocityBuffer, 0,
        velocityStagingBuffer, 0,
        velocityCopySize
      );
      
      this.device.queue.submit([commandEncoder.finish()]);
      
      // Map and read both buffers in parallel
      const [particleDataArray, velocityArray] = await Promise.all([
        (async () => {
          await particleDataStagingBuffer.mapAsync(GPUMapMode.READ);
          const mapped = new Float32Array(particleDataStagingBuffer.getMappedRange());
          const data = new Float32Array(mapped.length);
          data.set(mapped);
          particleDataStagingBuffer.unmap();
          return data;
        })(),
        (async () => {
          await velocityStagingBuffer.mapAsync(GPUMapMode.READ);
          const mapped = new Float32Array(velocityStagingBuffer.getMappedRange());
          const data = new Float32Array(mapped.length);
          data.set(mapped);
          velocityStagingBuffer.unmap();
          return data;
        })()
      ]);
      
      // Copy the data to our CPU-side arrays for processing
      for (let i = 0; i < this.activeParticles * 8; i++) {
        this.particleData[i] = particleDataArray[i];
      }
      
      for (let i = 0; i < this.activeParticles * 4; i++) {
        this.particleVelocities[i] = velocityArray[i];
      }
      
      // Clean up staging buffers
      particleDataStagingBuffer.destroy();
      velocityStagingBuffer.destroy();
      
      // Process the data to remove dead particles
      let newActiveCount = 0;
      for (let i = 0; i < this.activeParticles; i++) {
        const age = this.particleData[i * 8 + 6];
        const lifetime = this.particleData[i * 8 + 7];
        
        if (age >= lifetime) {
          // Check if we should respawn the particle
          if (this.emitting && 
              this.currentEmissionTime < this.config.emissionDuration &&
              newActiveCount < this.particleCount) {
            this.respawnParticle(i, newActiveCount);
            newActiveCount++;
            continue;
          }
          // Skip dead particles
          continue;
        }
        
        if (newActiveCount !== i) {
          // Copy particle data
          for (let j = 0; j < 8; j++) {
            this.particleData[newActiveCount * 8 + j] = this.particleData[i * 8 + j];
          }
          
          // Also copy the velocity data to keep arrays in sync
          for (let j = 0; j < 4; j++) {
            this.particleVelocities[newActiveCount * 4 + j] = this.particleVelocities[i * 4 + j];
          }
        }
        newActiveCount++;
      }
      
      // Update active count if it changed
      if (newActiveCount !== this.activeParticles) {
        this.activeParticles = newActiveCount;
        
        // Update GPU buffers with compacted particle data
        this.device.queue.writeBuffer(this.instanceBuffer, 0, this.particleData, 0, this.activeParticles * 8);
        this.device.queue.writeBuffer(this.velocityBuffer, 0, this.particleVelocities, 0, this.activeParticles * 4);
      }
    } catch (error) {
      console.error("Error reading back particle data:", error);
    }
  }

  respawnParticle(oldIndex, newIndex) {
    if (!this.emitting || this.currentEmissionTime >= this.config.emissionDuration) {
      return;
    }
    
    let posX, posY, posZ;
    
    if (this.config.emissionShape === 'cube') {
      let innerLength = this.config.innerLength || 0;
      let outerLength = this.config.outerLength || this.config.cubeLength;
      
      if (innerLength > 0) {
        const sides = Math.floor(Math.random() * 6);
        const u = Math.random() - 0.5;
        const v = Math.random() - 0.5;
        
        switch(sides) {
          case 0:
            posX = u; posY = v; posZ = 0.5; break;
          case 1:
            posX = u; posY = v; posZ = -0.5; break;
          case 2:
            posX = 0.5; posY = u; posZ = v; break;
          case 3:
            posX = -0.5; posY = u; posZ = v; break;
          case 4:
            posX = u; posY = 0.5; posZ = v; break;
          case 5:
            posX = u; posY = -0.5; posZ = v; break;
        }
        
        const t = Math.random();
        const length = innerLength + t * (outerLength - innerLength);
        
        posX *= length;
        posY *= length;
        posZ *= length;
      } else {
        posX = (Math.random() - 0.5) * outerLength;
        posY = (Math.random() - 0.5) * outerLength;
        posZ = (Math.random() - 0.5) * outerLength;
      }
    } else if (this.config.emissionShape === 'sphere') {
      let theta = Math.random() * 2 * Math.PI;
      let phi = Math.acos(2 * Math.random() - 1);
      
      let dirX = Math.sin(phi) * Math.cos(theta);
      let dirY = Math.sin(phi) * Math.sin(theta);
      let dirZ = Math.cos(phi);
      
      let radius;
      if (this.config.innerRadius === 0) {
        radius = this.config.outerRadius * Math.cbrt(Math.random());
      } else {
        radius = this.config.innerRadius + (this.config.outerRadius - this.config.innerRadius) * Math.random();
      }
      
      posX = dirX * radius;
      posY = dirY * radius;
      posZ = dirZ * radius;
    } else if (this.config.emissionShape === 'square') {
      const innerSize = this.config.squareInnerSize || 0;
      const outerSize = this.config.squareSize || 2.0;
      
      if (innerSize > 0) {
        const side = Math.floor(Math.random() * 4);
        let size = innerSize + (outerSize - innerSize) * Math.random();
        
        switch(side) {
          case 0:
            posX = (Math.random() * 2 - 1) * size; posY = size; break;
          case 1:
            posX = size; posY = (Math.random() * 2 - 1) * size; break;
          case 2:
            posX = (Math.random() * 2 - 1) * size; posY = -size; break;
          case 3:
            posX = -size; posY = (Math.random() * 2 - 1) * size; break;
        }
        posZ = 0;
      } else {
        posX = (Math.random() * 2 - 1) * outerSize;
        posY = (Math.random() * 2 - 1) * outerSize;
        posZ = 0;
      }
    } else if (this.config.emissionShape === 'circle') {
      const innerRadius = this.config.circleInnerRadius || 0;
      const outerRadius = this.config.circleOuterRadius || 2.0;
      
      const angle = Math.random() * Math.PI * 2;
      
      let radius;
      if (innerRadius > 0) {
        radius = innerRadius + (outerRadius - innerRadius) * Math.random();
      } else {
        radius = outerRadius * Math.sqrt(Math.random());
      }
      
      posX = Math.cos(angle) * radius;
      posY = Math.sin(angle) * radius;
      posZ = 0;
    }
    
    // Store the position
    const particleIndex = newIndex * 8;
    this.particleData[particleIndex] = posX;
    this.particleData[particleIndex + 1] = posY;
    this.particleData[particleIndex + 2] = posZ;
    
    // Create velocity direction
    const velIndex = newIndex * 4;
    
    const length = Math.sqrt(posX * posX + posY * posY + posZ * posZ);
    let dirX, dirY, dirZ;
    
    if (length > 0.0001) {
      dirX = posX / length;
      dirY = posY / length;
      dirZ = posZ / length;
    } else {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      dirX = Math.sin(phi) * Math.cos(theta);
      dirY = Math.sin(phi) * Math.sin(theta);
      dirZ = Math.cos(phi);
    }
    
    // Store velocity vector
    if (this.velocityOverrides.overrideX) {
      this.particleVelocities[velIndex] = this.velocityOverrides.xVelocity;
    } else {
      this.particleVelocities[velIndex] = dirX * this.config.particleSpeed;
    }
    
    if (this.velocityOverrides.overrideY) {
      this.particleVelocities[velIndex + 1] = this.velocityOverrides.yVelocity;
    } else {
      this.particleVelocities[velIndex + 1] = dirY * this.config.particleSpeed;
    }
    
    if (this.velocityOverrides.overrideZ) {
      this.particleVelocities[velIndex + 2] = this.velocityOverrides.zVelocity;
    } else {
      this.particleVelocities[velIndex + 2] = dirZ * this.config.particleSpeed;
    }
    
    this.particleVelocities[velIndex + 3] = 0;
    
    // Color
    if (this.config.colorTransitionEnabled) {
      this.particleData[particleIndex + 3] = this.config.startColor[0];
      this.particleData[particleIndex + 4] = this.config.startColor[1];
      this.particleData[particleIndex + 5] = this.config.startColor[2];
    } else {
      this.particleData[particleIndex + 3] = this.config.particleColor[0];
      this.particleData[particleIndex + 4] = this.config.particleColor[1];
      this.particleData[particleIndex + 5] = this.config.particleColor[2];
    }
    
    // Age and lifetime
    const baseLifetime = this.config.lifetime || 5;
    this.particleData[particleIndex + 6] = 0;
    this.particleData[particleIndex + 7] = baseLifetime + (Math.random() * 0.4 - 0.2) * baseLifetime;
  }

  updateBuffers() {
    this.device.queue.writeBuffer(this.instanceBuffer, 0, this.particleData, 0, this.activeParticles * 8);
  }

  updateParticleColors() {
    for (let i = 0; i < this.activeParticles; i++) {
      const index = i * 8;
      
      if (this.config.colorTransitionEnabled) {
        this.particleData[index + 3] = this.config.startColor[0];
        this.particleData[index + 4] = this.config.startColor[1];
        this.particleData[index + 5] = this.config.startColor[2];
      } else {
        this.particleData[index + 3] = this.config.particleColor[0];
        this.particleData[index + 4] = this.config.particleColor[1];
        this.particleData[index + 5] = this.config.particleColor[2];
      }
    }
    
    if (this.activeParticles > 0) {
      this.device.queue.writeBuffer(this.instanceBuffer, 0, this.particleData, 0, this.activeParticles * 8);
    }
  }

  updateParticleVelocities() {
    for (let i = 0; i < this.activeParticles; i++) {
      const index = i * 8;
      const velIndex = i * 4;
      
      const posX = this.particleData[index];
      const posY = this.particleData[index + 1];
      const posZ = this.particleData[index + 2];
      
      const curVelX = this.particleVelocities[velIndex];
      const curVelY = this.particleVelocities[velIndex + 1];
      const curVelZ = this.particleVelocities[velIndex + 2];
      
      const curVelLength = Math.sqrt(
        curVelX * curVelX + 
        curVelY * curVelY + 
        curVelZ * curVelZ
      );
      
      if (curVelLength > 0.001) {
        const speedFactor = this.config.particleSpeed * 2.0;
        this.particleVelocities[velIndex] = (curVelX / curVelLength) * speedFactor;
        this.particleVelocities[velIndex + 1] = (curVelY / curVelLength) * speedFactor;
        this.particleVelocities[velIndex + 2] = (curVelZ / curVelLength) * speedFactor;
      } else {
        const posLength = Math.sqrt(posX * posX + posY * posY + posZ * posZ);
        
        if (posLength > 0.001) {
          const speedFactor = this.config.particleSpeed * 2.0;
          this.particleVelocities[velIndex] = (posX / posLength) * speedFactor;
          this.particleVelocities[velIndex + 1] = (posY / posLength) * speedFactor;
          this.particleVelocities[velIndex + 2] = (posZ / posLength) * speedFactor;
        } else {
          this.particleVelocities[velIndex] = 0;
          this.particleVelocities[velIndex + 1] = this.config.particleSpeed * 2.0;
          this.particleVelocities[velIndex + 2] = 0;
        }
      }
    }
    
    if (this.activeParticles > 0) {
      this.device.queue.writeBuffer(this.velocityBuffer, 0, this.particleVelocities, 0, this.activeParticles * 4);
    }
  }
   
  setGravity(gravityValue) {
    this.physicsSettings.gravity = gravityValue;
  }
  
  setAttractor(strength, position) {
    this.physicsSettings.attractorStrength = strength;
    this.physicsSettings.attractorPosition = position;
  }
}

export class ParticleSystemManager {
  constructor(device) {
    this.device = device;
    this.particleSystems = [];
    this.activeSystemIndex = 0;
    this.systemCounter = 0;
  }

  createParticleSystem(config = {}) {
    const systemId = this.systemCounter++;
    const systemName = config.name || `System ${systemId + 1}`;
    
    const systemConfig = {
      ...config,
      name: systemName,
      id: systemId
    };
    
    const particleSystem = new ParticleSystem(this.device, systemConfig);
    this.particleSystems.push({
      system: particleSystem,
      config: systemConfig
    });
    
    if (this.particleSystems.length === 1) {
      this.activeSystemIndex = 0;
    }
    
    return systemId;
  }

  getActiveSystem() {
    if (this.particleSystems.length === 0) return null;
    return this.particleSystems[this.activeSystemIndex].system;
  }

  getActiveConfig() {
    if (this.particleSystems.length === 0) return null;
    return this.particleSystems[this.activeSystemIndex].config;
  }

  setActiveSystem(index) {
    if (index >= 0 && index < this.particleSystems.length) {
      this.activeSystemIndex = index;
      return true;
    }
    return false;
  }

  removeSystem(index) {
    if (index >= 0 && index < this.particleSystems.length) {
      this.particleSystems.splice(index, 1);
      
      if (this.particleSystems.length === 0) {
        this.activeSystemIndex = 0;
      } else if (index <= this.activeSystemIndex) {
        this.activeSystemIndex = Math.max(0, this.activeSystemIndex - 1);
      }
      
      return true;
    }
    return false;
  }

  respawnAllSystems() {
    for (const { system } of this.particleSystems) {
      system.spawnParticles();
    }
  }

  updateAllSystems(deltaTime) {
    for (const { system } of this.particleSystems) {
      system.updateParticles(deltaTime);
    }
  }

  getSystemsList() {
    return this.particleSystems.map(({ config }, index) => ({
      name: config.name,
      id: config.id,
      index,
      isActive: index === this.activeSystemIndex
    }));
  }

  duplicateActiveSystem() {
    if (this.particleSystems.length === 0) return -1;
    
    const activeConfig = this.getActiveConfig();
    const newConfig = JSON.parse(JSON.stringify(activeConfig));
    newConfig.name = `${activeConfig.name} (Copy)`;
    
    return this.createParticleSystem(newConfig);
  }
}