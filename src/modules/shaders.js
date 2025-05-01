/**
 * Shader code for various rendering operations
 */

export const particleShader = `
  struct Uniforms {
    transform: mat4x4<f32>,
    cameraPosition: vec3<f32>,
    aspectRatio: f32,
  }

  struct AppearanceUniforms {
    fadeEnabled: f32,
    colorTransitionEnabled: f32,
    particleSize: f32,
    textureEnabled: f32,
    singleColor: vec3<f32>,
    rotation: f32,
    startColor: vec3<f32>,
    randomRotation: f32,
    endColor: vec3<f32>,
    minRotation: f32,
    maxRotation: f32,
    padding: f32,
  }

  @binding(0) @group(0) var<uniform> uniforms : Uniforms;
  @binding(1) @group(0) var<uniform> appearance : AppearanceUniforms;
  @binding(2) @group(0) var particleTexture: texture_2d<f32>;
  @binding(3) @group(0) var particleSampler: sampler;

  struct VertexInput {
    @location(0) position : vec3<f32>,
    @location(1) particlePosition : vec3<f32>,
    @location(2) particleColor : vec3<f32>,
    @location(3) particleAgeAndLife : vec2<f32>,
  }

  struct VertexOutput {
    @builtin(position) position : vec4<f32>,
    @location(0) color : vec3<f32>,
    @location(1) alpha : f32,
    @location(2) texCoord : vec2<f32>,
  }

  @vertex
  fn vs_main(input: VertexInput) -> VertexOutput {
    var output : VertexOutput;
    
    let center = input.particlePosition;
    let baseColor = input.particleColor;
    let age = input.particleAgeAndLife.x;
    let lifetime = input.particleAgeAndLife.y;
    let lifeRatio = age / lifetime;
    
    var finalColor = baseColor;
    
    if (appearance.colorTransitionEnabled > 0.5) {
      finalColor = mix(appearance.startColor, appearance.endColor, lifeRatio);
    } else {
      finalColor = appearance.singleColor;
    }
    
    var alpha = 0.0;
    if (appearance.fadeEnabled > 0.5) {
      alpha = max(0.0, 1.0 - lifeRatio);
    } else {
      alpha = select(0.0, 1.0, age < lifetime);
    }
    
    let viewCenter = uniforms.transform * vec4<f32>(center, 1.0);
    
    let cameraToParticle = length(center - uniforms.cameraPosition);
    let baseScaleFactor = 0.15 * appearance.particleSize;
    let distanceScaleFactor = baseScaleFactor * (10.0 / cameraToParticle);
    
    // Create a unique rotation value for each particle
    var particleRotation = appearance.rotation;
    if (appearance.randomRotation > 0.5) {
      // Use the particle's lifetime as a seed to create a consistent random rotation
      // between minRotation and maxRotation
      particleRotation = appearance.minRotation + 
        fract(sin(lifetime * 12345.67) * 43758.5453) * 
        (appearance.maxRotation - appearance.minRotation);
    }
    
    // Convert rotation from degrees to radians
    let rotRadians = particleRotation * 0.01745329252; // PI/180
    
    // Create a rotation matrix for 2D rotation in screen space
    let cosTheta = cos(rotRadians);
    let sinTheta = sin(rotRadians);
    
    // Apply rotation to the vertex position before scaling and positioning
    let rotatedX = input.position.x * cosTheta - input.position.y * sinTheta;
    let rotatedY = input.position.x * sinTheta + input.position.y * cosTheta;
    
    let finalPosition = vec4<f32>(
      viewCenter.x + rotatedX * distanceScaleFactor * uniforms.aspectRatio * viewCenter.w,
      viewCenter.y + rotatedY * distanceScaleFactor * viewCenter.w,
      viewCenter.z,
      viewCenter.w
    );
    
    output.position = finalPosition;
    output.color = finalColor;
    output.alpha = alpha;
    
    // Convert the quad position to texture coordinates (0,0 to 1,1)
    output.texCoord = vec2<f32>(input.position.x + 0.5, -input.position.y + 0.5);
    
    return output;
  }

  @fragment
  fn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {
    if (appearance.textureEnabled > 0.5) {
      let texColor = textureSample(particleTexture, particleSampler, input.texCoord);
      return vec4<f32>(input.color * texColor.rgb, input.alpha * texColor.a);
    } else {
      return vec4<f32>(input.color, input.alpha);
    }
  }
`;

export const blurShader = `
  struct BloomUniforms {
    direction: vec2<f32>,
    resolution: vec2<f32>,
    padding: vec2<f32>,
  }

  @binding(0) @group(0) var texSampler: sampler;
  @binding(1) @group(0) var inputTexture: texture_2d<f32>;
  @binding(2) @group(0) var<uniform> uniforms: BloomUniforms;

  struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) texCoord: vec2<f32>,
  }

  @vertex
  fn vs_main(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
    var output: VertexOutput;
    
    let positions = array<vec2<f32>, 3>(
      vec2<f32>(-1.0, -1.0),
      vec2<f32>(3.0, -1.0),
      vec2<f32>(-1.0, 3.0)
    );
    
    let texCoords = array<vec2<f32>, 3>(
      vec2<f32>(0.0, 1.0),
      vec2<f32>(2.0, 1.0),
      vec2<f32>(0.0, -1.0)
    );
    
    output.position = vec4<f32>(positions[vertexIndex], 0.0, 1.0);
    output.texCoord = texCoords[vertexIndex];
    return output;
  }

  @fragment
  fn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {
    let pixelSize = 1.0 / uniforms.resolution;
    
    var result = vec4<f32>(0.0);
    var totalWeight = 0.0;
    
    let weights = array<f32, 15>(
      0.0045, 0.0154, 0.0383, 0.0703, 0.1055, 0.1308, 0.1333,
      0.1124,
      0.1333, 0.1308, 0.1055, 0.0703, 0.0383, 0.0154, 0.0045
    );
    
    for (var i = -7; i <= 7; i++) {
      let offset = uniforms.direction * (f32(i) * pixelSize * 2);
      let weight = weights[i + 7];
      
      result += textureSample(inputTexture, texSampler, input.texCoord + offset) * weight;
      totalWeight += weight;
    }
    
    return result / totalWeight * 1.1;
  }
`;

export const compositeShader = `
  struct BloomIntensityUniforms {
    intensity: f32,
    padding: vec3<f32>,
  }

  @binding(0) @group(0) var texSampler: sampler;
  @binding(1) @group(0) var originalTexture: texture_2d<f32>;
  @binding(2) @group(0) var blurredTexture: texture_2d<f32>;
  @binding(3) @group(0) var<uniform> bloomUniforms: BloomIntensityUniforms;

  struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) texCoord: vec2<f32>,
  }

  @vertex
  fn vs_main(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
    var output: VertexOutput;
    
    let positions = array<vec2<f32>, 3>(
      vec2<f32>(-1.0, -1.0),
      vec2<f32>(3.0, -1.0),
      vec2<f32>(-1.0, 3.0)
    );
    
    let texCoords = array<vec2<f32>, 3>(
      vec2<f32>(0.0, 1.0),
      vec2<f32>(2.0, 1.0),
      vec2<f32>(0.0, -1.0)
    );
    
    output.position = vec4<f32>(positions[vertexIndex], 0.0, 1.0);
    output.texCoord = texCoords[vertexIndex];
    return output;
  }

  @fragment
  fn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {
    let originalColor = textureSample(originalTexture, texSampler, input.texCoord);
    let bloomColor = textureSample(blurredTexture, texSampler, input.texCoord);
    
    let mappedBloom = pow(bloomColor.rgb, vec3<f32>(0.85));
    
    return vec4<f32>(originalColor.rgb + (mappedBloom * bloomUniforms.intensity), originalColor.a);
  }
`;

export const directRenderShader = `
  struct BloomIntensityUniforms {
    intensity: f32,
    padding: vec3<f32>,
  }

  @binding(0) @group(0) var texSampler: sampler;
  @binding(1) @group(0) var originalTexture: texture_2d<f32>;
  @binding(2) @group(0) var blurredTexture: texture_2d<f32>;
  @binding(3) @group(0) var<uniform> bloomUniforms: BloomIntensityUniforms;

  struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) texCoord: vec2<f32>,
  }

  @vertex
  fn vs_main(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
    var output: VertexOutput;
    
    let positions = array<vec2<f32>, 3>(
      vec2<f32>(-1.0, -1.0),
      vec2<f32>(3.0, -1.0),
      vec2<f32>(-1.0, 3.0)
    );
    
    let texCoords = array<vec2<f32>, 3>(
      vec2<f32>(0.0, 1.0),
      vec2<f32>(2.0, 1.0),
      vec2<f32>(0.0, -1.0)
    );
    
    output.position = vec4<f32>(positions[vertexIndex], 0.0, 1.0);
    output.texCoord = texCoords[vertexIndex];
    return output;
  }

  @fragment
  fn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {
    return textureSample(originalTexture, texSampler, input.texCoord);
  }
`;

export const particlePhysicsShader = `
  struct PhysicsUniforms {
    deltaTime: f32,
    particleSpeed: f32,
    gravity: f32,
    turbulence: f32,
    attractorStrength: f32,
    padding: f32,
    attractorPositionX: f32,
    attractorPositionY: f32,
    attractorPositionZ: f32,
    padding2: f32,
    padding3: f32,
    padding4: f32,
  };

  // Updated struct to match actual memory layout [x, y, z, r, g, b, age, lifetime]
  struct ParticleData {
    position: vec3<f32>,
    color: vec3<f32>,
    age: f32,
    lifetime: f32,
  }

  struct ParticleVelocity {
    velocity: vec3<f32>,
    padding: f32,
  }

  @binding(0) @group(0) var<uniform> physics: PhysicsUniforms;
  @binding(1) @group(0) var<storage, read_write> particleBuffer: array<f32>;
  @binding(2) @group(0) var<storage, read_write> velocities: array<ParticleVelocity>;

  @compute @workgroup_size(64)
  fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let index = global_id.x;
    let particleStride = 8u; // 8 floats per particle
    
    // Calculate base index in the float array
    let baseIndex = index * particleStride;
    
    // Skip if out of bounds (check if we have at least 8 more floats)
    if (baseIndex + 7u >= arrayLength(&particleBuffer)) {
      return;
    }
    
    // Read particle data from flat array
    let posX = particleBuffer[baseIndex];
    let posY = particleBuffer[baseIndex + 1u];
    let posZ = particleBuffer[baseIndex + 2u];
    // color values at baseIndex + 3,4,5
    let age = particleBuffer[baseIndex + 6u];
    let lifetime = particleBuffer[baseIndex + 7u];
    
    // Skip dead particles
    if (age >= lifetime) {
      return;
    }
    
    // Update age
    particleBuffer[baseIndex + 6u] = age + physics.deltaTime;
    
    // Get current velocity data
    let velocityIndex = index;
    let currentVelocity = velocities[velocityIndex].velocity;
    
    // Apply gravity if enabled (gravity value > 0)
    var modifiedVelocity = currentVelocity;
    if (physics.gravity > 0.0) {
      // Apply downward force - reduce Y component of velocity
      modifiedVelocity.y -= physics.gravity * physics.deltaTime;
    }
    
    // Apply attractor force if enabled
    if (physics.attractorStrength > 0.0) {
      // Calculate direction vector from particle to attractor
      let attractorPos = vec3<f32>(physics.attractorPositionX, physics.attractorPositionY, physics.attractorPositionZ);
      let toAttractor = attractorPos - vec3<f32>(posX, posY, posZ);
      let distance = length(toAttractor);
      
      // Avoid division by zero and limit effect at very close range
      if (distance > 0.1) {
        // Normalize direction and apply force based on distance (inverse square law)
        let attractionForce = normalize(toAttractor) * physics.attractorStrength / max(distance * distance, 0.01);
        modifiedVelocity += attractionForce * physics.deltaTime;
      }
    }
    
    let timeScale = min(physics.deltaTime, 0.033); // Cap max time step to prevent large jumps
    
    // Store the modified velocity for the next frame regardless of gravity
    velocities[velocityIndex].velocity = modifiedVelocity;
    
    // Apply the velocity
    let moveDistance = modifiedVelocity * timeScale;
    
    // Update position with the calculated movement
    particleBuffer[baseIndex] = posX + moveDistance.x;
    particleBuffer[baseIndex + 1u] = posY + moveDistance.y;
    particleBuffer[baseIndex + 2u] = posZ + moveDistance.z;
  }
`;