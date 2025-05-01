/**
 * Particle physics functionality
 */

export class ParticlePhysics {
  constructor(device) {
    this.device = device;
    this.physicsSettings = {
      deltaTime: 0.016,
      gravity: 0.0,
      turbulence: 0.0,
      attractorStrength: 0.0,
      attractorPosition: [0.0, 0.0, 0.0]
    };
    
    // Fixed timestep physics system for consistent updates
    this.fixedDeltaTime = 1.0 / 60.0; // Consistent 60Hz physics updates
    this.physicsClock = 0;
    this.physicsAccumulator = 0;
    
    // Minimum update frequency
    this.minUpdatesPerSecond = 30;
    this.lastUpdateTime = 0;
    
    this.computeReady = false;
    this.computePipeline = null;
    this.computeBindGroupLayout = null;
    
    // Physics uniform buffer
    this.physicsUniformBuffer = device.createBuffer({
      size: 48, // 12 float32 values (48 bytes)
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      label: "physicsUniformBuffer"
    });
  }

  async initComputePipeline(instanceBuffer, velocityBuffer) {
    try {
      await this.createComputePipeline(instanceBuffer, velocityBuffer);
      this.computeReady = true;
      return true;
    } catch (error) {
      console.error("Error initializing compute pipeline:", error);
      return false;
    }
  }
  
  async createComputePipeline(instanceBuffer, velocityBuffer) {
    const { particlePhysicsShader } = await import('./shaders.js');
    
    // Create bind group layout for compute shader
    this.computeBindGroupLayout = this.device.createBindGroupLayout({
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
    this.computePipeline = this.device.createComputePipeline({
      layout: this.device.createPipelineLayout({
        bindGroupLayouts: [this.computeBindGroupLayout]
      }),
      compute: {
        module: this.device.createShaderModule({
          code: particlePhysicsShader
        }),
        entryPoint: 'main'
      }
    });
    
    // Create compute bind group
    this.computeBindGroup = this.device.createBindGroup({
      layout: this.computeBindGroupLayout,
      entries: [
        {
          binding: 0,
          resource: { buffer: this.physicsUniformBuffer }
        },
        {
          binding: 1,
          resource: { buffer: instanceBuffer }
        },
        {
          binding: 2,
          resource: { buffer: velocityBuffer }
        }
      ]
    });
  }

  updatePhysics(fixedDeltaTime, activeParticles, config, instanceBuffer, velocityBuffer) {
    // Nothing to update if no particles are active or compute not ready
    if (activeParticles <= 0 || !this.computeReady) {
      return;
    }
    
    // Update physics uniforms for compute shader
    const physicsData = new Float32Array([
      fixedDeltaTime,
      config.particleSpeed,
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
    const workgroupCount = Math.max(1, Math.ceil(activeParticles / 64));
    computePass.dispatchWorkgroups(workgroupCount, 1, 1);
    
    computePass.end();
    this.device.queue.submit([commandEncoder.finish()]);
    
    // Update the last update time
    this.lastUpdateTime = performance.now() / 1000;
  }
  
  async readbackAndProcessParticles(activeParticles, particleData, particleVelocities, instanceBuffer, velocityBuffer) {
    if (activeParticles <= 0) {
      return { activeCount: 0, shouldUpdate: false };
    }
    
    try {
      // Create staging buffers to read back both position and velocity data
      const particleDataStagingBuffer = this.device.createBuffer({
        size: activeParticles * 8 * 4,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
        label: "ParticleDataReadbackBuffer"
      });
      
      const velocityStagingBuffer = this.device.createBuffer({
        size: activeParticles * 4 * 4,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
        label: "VelocityReadbackBuffer"
      });
      
      // Copy both buffers using a single command encoder
      const commandEncoder = this.device.createCommandEncoder({
        label: "ParticleReadbackEncoder"
      });
      
      // Copy particle data
      const particleDataCopySize = activeParticles * 8 * 4;
      commandEncoder.copyBufferToBuffer(
        instanceBuffer, 0,
        particleDataStagingBuffer, 0,
        particleDataCopySize
      );
      
      // Copy velocity data
      const velocityCopySize = activeParticles * 4 * 4;
      commandEncoder.copyBufferToBuffer(
        velocityBuffer, 0,
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
      for (let i = 0; i < activeParticles * 8; i++) {
        particleData[i] = particleDataArray[i];
      }
      
      for (let i = 0; i < activeParticles * 4; i++) {
        particleVelocities[i] = velocityArray[i];
      }
      
      // Clean up staging buffers
      particleDataStagingBuffer.destroy();
      velocityStagingBuffer.destroy();
      
      return {
        particleData,
        particleVelocities,
        shouldUpdate: true
      };
    } catch (error) {
      console.error("Error reading back particle data:", error);
      return { activeCount: activeParticles, shouldUpdate: false };
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