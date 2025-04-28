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
    padding: f32,
    singleColor: vec3<f32>,
    padding2: f32,
    startColor: vec3<f32>,
    padding3: f32,
    endColor: vec3<f32>,
    padding4: f32,
  }

  @binding(0) @group(0) var<uniform> uniforms : Uniforms;
  @binding(1) @group(0) var<uniform> appearance : AppearanceUniforms;

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
    
    let finalPosition = vec4<f32>(
      viewCenter.x + input.position.x * distanceScaleFactor * uniforms.aspectRatio * viewCenter.w,
      viewCenter.y + input.position.y * distanceScaleFactor * viewCenter.w,
      viewCenter.z,
      viewCenter.w
    );
    
    output.position = finalPosition;
    output.color = finalColor;
    output.alpha = alpha;
    return output;
  }

  @fragment
  fn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {
    return vec4<f32>(input.color, input.alpha);
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