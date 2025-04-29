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
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      label: "particleVelocityBuffer"
    });
    
    // Create physics uniform buffer - now with additional physics parameters
    // Increasing the size to 48 bytes (12 floats) to match shader expectations
    this.physicsUniformBuffer = device.createBuffer({
      size: 48, // 12 float32 values (48 bytes)
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      label: "physicsUniformBuffer"
    });
    
    // Set default physics values
    this.physicsSettings = {
      gravity: 0.0,        // Turning off gravity for basic velocity
      turbulence: 0.0,     // Turning off turbulence for basic velocity
      attractorStrength: 0, // No attractor for basic velocity
      attractorPosition: [0, 0, 0]  // Default attractor position
    };
    
    // Fixed timestep physics system for consistent updates
    this.fixedDeltaTime = 1.0 / 60.0; // Consistent 60Hz physics updates
    this.physicsClock = 0;
    this.physicsAccumulator = 0;
    
    // Initialize the frame counter for readback scheduling
    this.frameCount = 0;
    this.shouldReset = false;
    this.computeReady = false;
    
    // Minimum update frequency (to prevent choppy rendering at low emission rates)
    this.minUpdatesPerSecond = 30;
    this.lastUpdateTime = 0;
    
    // Create compute pipeline and bind group layout
    this.initComputePipeline(device);
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
    }
    
    // Store the position
    this.particleData[index] = posX;
    this.particleData[index + 1] = posY;
    this.particleData[index + 2] = posZ;
    
    // Create a stable velocity direction that won't be recalculated during physics updates
    // We'll use a consistent approach to determine initial velocity direction
    
    // Initialize a random but consistent direction vector for this particle
    // This ensures smoother movement at all emission rates
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
    this.particleVelocities[velIndex] = dirX * this.config.particleSpeed;
    this.particleVelocities[velIndex + 1] = dirY * this.config.particleSpeed;
    this.particleVelocities[velIndex + 2] = dirZ * this.config.particleSpeed;
    this.particleVelocities[velIndex + 3] = 0; // padding
    
    // Color
    if (this.config.colorTransitionEnabled) {
      this.particleData[index + 3] = this.config.startColor[0];
      this.particleData[index + 4] = this.config.startColor[1];
      this.particleData[index + 5] = this.config.startColor[2];
    } else {
      this.particleData[index + 3] = this.config.particleColor[0];
      this.particleData[index + 4] = this.config.particleColor[1];
      this.particleData[index + 5] = this.config.particleColor[2];
    }
    
    // Age and lifetime - set a lifetime from the config with small variance
    const baseLifetime = this.config.lifetime || 5;
    this.particleData[index + 6] = 0; // Age starts at 0
    this.particleData[index + 7] = baseLifetime + (Math.random() * 0.4 - 0.2) * baseLifetime; // Add up to ±20% variance
    
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
        // For low emission rates, use probabilistic approach
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
    // This ensures smooth visuals even at very low emission rates
    if (forceUpdate && this.activeParticles > 0) {
      this.updatePhysics(this.fixedDeltaTime);
      this.lastUpdateTime = now;
    }
    
    // Readback less frequently but still regularly to clean up particles
    if (this.frameCount++ % 60 === 0) {
      this.readbackAndProcessParticles();
    }
  }
  
  // Separate physics update method for fixed-step updates
  updatePhysics(fixedDeltaTime) {
    // Nothing to update if no particles are active
    if (this.activeParticles <= 0 || !this.computeReady) {
      return;
    }
    
    // Update physics uniforms for compute shader
    const physicsData = new Float32Array([
      fixedDeltaTime,                 // Always use fixed delta time for consistent physics
      this.config.particleSpeed,      // particleSpeed
      this.physicsSettings.gravity,   // gravity
      this.physicsSettings.turbulence, // turbulence
      this.physicsSettings.attractorStrength, // attractorStrength
      0.0,                            // padding
      this.physicsSettings.attractorPosition[0], // attractorPosition.x
      this.physicsSettings.attractorPosition[1], // attractorPosition.y
      this.physicsSettings.attractorPosition[2], // attractorPosition.z
      0.0,                            // padding2
      0.0,                            // Extra padding to match 48 bytes (12 floats)
      0.0                             // Extra padding to match 48 bytes (12 floats)
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
    // Skip if we don't have any particles to read back
    if (this.activeParticles <= 0) {
      return;
    }
    
    try {
      // Create a staging buffer to read back the data
      const stagingBuffer = this.device.createBuffer({
        size: this.activeParticles * 8 * 4,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
        label: "ParticleReadbackBuffer"
      });
      
      // Copy the data from the storage buffer to the staging buffer
      const commandEncoder = this.device.createCommandEncoder({
        label: "ParticleReadbackEncoder"
      });
      
      // Ensure we're copying a valid size (must be a multiple of 4 bytes)
      const copySize = this.activeParticles * 8 * 4;
      
      commandEncoder.copyBufferToBuffer(
        this.instanceBuffer, 0,
        stagingBuffer, 0,
        copySize
      );
      
      this.device.queue.submit([commandEncoder.finish()]);
      
      // Map the staging buffer and read the data
      await stagingBuffer.mapAsync(GPUMapMode.READ);
      const mappedData = new Float32Array(stagingBuffer.getMappedRange());
      
      // Copy the data to our CPU-side array for processing
      for (let i = 0; i < this.activeParticles * 8; i++) {
        this.particleData[i] = mappedData[i];
      }
      
      // Unmap and destroy the staging buffer
      stagingBuffer.unmap();
      stagingBuffer.destroy();
      
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
      // We'll skip readback but still continue with the compute shader
    }
  }

  // Add a new helper method to respawn particles
  respawnParticle(oldIndex, newIndex) {
    // Strict check to ensure we never respawn particles when emission has ended
    if (!this.emitting || this.currentEmissionTime >= this.config.emissionDuration) {
      return;
    }
    
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
    }
    
    // Store the position
    const index = newIndex * 8;
    this.particleData[index] = posX;
    this.particleData[index + 1] = posY;
    this.particleData[index + 2] = posZ;
    
    // Create a stable velocity direction - consistent with emitParticle method
    const velIndex = newIndex * 4;
    
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
    this.particleVelocities[velIndex] = dirX * this.config.particleSpeed;
    this.particleVelocities[velIndex + 1] = dirY * this.config.particleSpeed;
    this.particleVelocities[velIndex + 2] = dirZ * this.config.particleSpeed;
    this.particleVelocities[velIndex + 3] = 0; // padding
    
    // Color
    if (this.config.colorTransitionEnabled) {
      this.particleData[index + 3] = this.config.startColor[0];
      this.particleData[index + 4] = this.config.startColor[1];
      this.particleData[index + 5] = this.config.startColor[2];
    } else {
      this.particleData[index + 3] = this.config.particleColor[0];
      this.particleData[index + 4] = this.config.particleColor[1];
      this.particleData[index + 5] = this.config.particleColor[2];
    }
    
    // Age and lifetime - set a lifetime from the config with small variance
    const baseLifetime = this.config.lifetime || 5;
    this.particleData[index + 6] = 0; // Age starts at 0
    this.particleData[index + 7] = baseLifetime + (Math.random() * 0.4 - 0.2) * baseLifetime; // Add up to ±20% variance
  }

  updateBuffers() {
    // No longer needed as the main updating happens in the compute shader
    // We'll just upload the particle data directly when needed
    this.device.queue.writeBuffer(this.instanceBuffer, 0, this.particleData, 0, this.activeParticles * 8);
  }

  updateParticleColors() {
    for (let i = 0; i < this.activeParticles; i++) {
      const index = i * 8;
      
      // Update color based on current settings
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
    
    // Update the buffer with the new colors
    if (this.activeParticles > 0) {
      this.device.queue.writeBuffer(this.instanceBuffer, 0, this.particleData, 0, this.activeParticles * 8);
    }
  }

  updateParticleVelocities() {
    // Use a more consistent approach for velocity updates
    // that matches our improved compute shader
    for (let i = 0; i < this.activeParticles; i++) {
      const index = i * 8; // Position data index
      const velIndex = i * 4; // Velocity data index
      
      // Get the current position and velocity
      const posX = this.particleData[index];
      const posY = this.particleData[index + 1];
      const posZ = this.particleData[index + 2];
      
      // Get current velocity
      const curVelX = this.particleVelocities[velIndex];
      const curVelY = this.particleVelocities[velIndex + 1];
      const curVelZ = this.particleVelocities[velIndex + 2];
      
      // Keep existing velocity direction but update speed
      const curVelLength = Math.sqrt(
        curVelX * curVelX + 
        curVelY * curVelY + 
        curVelZ * curVelZ
      );
      
      // Only normalize if we have a non-zero velocity
      if (curVelLength > 0.001) {
        // Preserve direction but apply new speed
        const speedFactor = this.config.particleSpeed * 2.0;
        this.particleVelocities[velIndex] = (curVelX / curVelLength) * speedFactor;
        this.particleVelocities[velIndex + 1] = (curVelY / curVelLength) * speedFactor;
        this.particleVelocities[velIndex + 2] = (curVelZ / curVelLength) * speedFactor;
      } else {
        // If velocity is nearly zero, use position as direction instead
        const posLength = Math.sqrt(posX * posX + posY * posY + posZ * posZ);
        
        if (posLength > 0.001) {
          // Use normalized position as direction
          const speedFactor = this.config.particleSpeed * 2.0;
          this.particleVelocities[velIndex] = (posX / posLength) * speedFactor;
          this.particleVelocities[velIndex + 1] = (posY / posLength) * speedFactor;
          this.particleVelocities[velIndex + 2] = (posZ / posLength) * speedFactor;
        } else {
          // Default upward direction as last resort
          this.particleVelocities[velIndex] = 0;
          this.particleVelocities[velIndex + 1] = this.config.particleSpeed * 2.0;
          this.particleVelocities[velIndex + 2] = 0;
        }
      }
    }
    
    // Update the velocity buffer
    if (this.activeParticles > 0) {
      this.device.queue.writeBuffer(this.velocityBuffer, 0, this.particleVelocities, 0, this.activeParticles * 4);
    }
  }
  
  // Methods to control physics parameters
  setGravity(gravityValue) {
    this.physicsSettings.gravity = gravityValue;
  }
  
  setTurbulence(turbulenceValue) {
    this.physicsSettings.turbulence = turbulenceValue;
  }
  
  // Set attractor strength (positive = attraction, negative = repulsion)
  setAttractorStrength(strengthValue) {
    this.physicsSettings.attractorStrength = strengthValue;
  }
  
  // Set attractor position
  setAttractorPosition(x, y, z) {
    this.physicsSettings.attractorPosition = [x, y, z];
  }
  
  // Apply a preset of physics settings
  applyPhysicsPreset(presetName) {
    switch(presetName) {
      case 'explosion':
        this.physicsSettings.gravity = 2.0;
        this.physicsSettings.turbulence = 0.5;
        this.physicsSettings.attractorStrength = -10.0; // Strong repulsion
        this.physicsSettings.attractorPosition = [0, 0, 0];
        break;
        
      case 'fountain':
        this.physicsSettings.gravity = 5.0;
        this.physicsSettings.turbulence = 0.2;
        this.physicsSettings.attractorStrength = 0;
        break;
        
      case 'vortex':
        this.physicsSettings.gravity = 0.1;
        this.physicsSettings.turbulence = 1.0;
        this.physicsSettings.attractorStrength = 5.0; // Strong attraction
        this.physicsSettings.attractorPosition = [0, 0, 0];
        break;
        
      case 'smoke':
        this.physicsSettings.gravity = -0.1; // Slight upward drift
        this.physicsSettings.turbulence = 0.8;
        this.physicsSettings.attractorStrength = 0;
        break;
        
      case 'none':
      default:
        this.physicsSettings.gravity = 0;
        this.physicsSettings.turbulence = 0;
        this.physicsSettings.attractorStrength = 0;
        break;
    }
  }
}