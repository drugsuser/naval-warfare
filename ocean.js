export function addOcean(scene, uniforms) {
  const { BufferGeometry, Float32BufferAttribute, Mesh, ShaderMaterial } = THREE;
  // A single screen-covering triangle. View rays intersect the plane y = 0.
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute([
    -1, -1, 0,  3, -1, 0,  -1, 3, 0
  ], 3));
  const material = new ShaderMaterial({
    uniforms,
    depthTest: false,
    depthWrite: false,
    vertexShader: `
      varying vec2 vScreen;
      void main() {
        vScreen = position.xy;
        gl_Position = vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform mat3 uCameraBasis;
      uniform vec3 uCameraPosition;
      uniform float uTanHalfFov;
      uniform float uAspect;
      uniform float uPhase;
      uniform float uTime;
      uniform vec3 uSun;
      varying vec2 vScreen;

      const float PI = 3.14159265;

      vec2 randomGradient(vec2 cell, float phase) {
        vec3 bits = fract(vec3(cell.xyx) * vec3(0.1031, 0.1030, 0.0973));
        bits += dot(bits, bits.yzx + 33.33);
        float angle = 2.0 * PI * fract((bits.x + bits.y) * bits.z);
        // Rotate gradients at fixed locations, with a different rate per corner.
        float motion = fract((bits.z + bits.x) * bits.y);
        float direction = 2.0 * step(0.5, motion) - 1.0;
        float speed = 1.0 + mod(floor(4.0 * motion), 2.0);
        angle += direction * speed * phase;
        return vec2(cos(angle), sin(angle));
      }

      // Simplex noise and its analytic gradient in world space.
      vec3 simplexCorner(vec2 offset, vec2 gradient) {
        float radius = max(0.5 - dot(offset, offset), 0.0);
        float radial2 = radius * radius;
        float radial3 = radial2 * radius;
        float projection = dot(gradient, offset);
        return radial3 * vec3(
          radius * projection,
          radius * gradient - 8.0 * projection * offset
        );
      }

      vec3 simplex(vec2 point, float phase) {
        const float skew = 0.3660254038;
        const float unskew = 0.2113248654;
        vec2 cell = floor(point + skew * (point.x + point.y));
        vec2 first = point - cell + unskew * (cell.x + cell.y);
        vec2 stepToMiddle = first.x > first.y ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
        vec2 middle = first - stepToMiddle + unskew;
        vec2 last = first - 1.0 + 2.0 * unskew;
        return 70.0 * (
          simplexCorner(first, randomGradient(cell, phase)) +
          simplexCorner(middle, randomGradient(cell + stepToMiddle, phase)) +
          simplexCorner(last, randomGradient(cell + 1.0, phase))
        );
      }

      vec2 surfaceBand(
        vec2 point, vec2 screenX, vec2 screenY, mat2 axes, vec2 offset, float phase
      ) {
        vec2 stepX = axes * screenX;
        vec2 stepY = axes * screenY;
        float footprint = max(length(stepX), length(stepY));
        float visible = 1.0 - smoothstep(0.12, 0.62, footprint);
        if (visible <= 0.0) return vec2(0.0);
        vec2 gradient = simplex(axes * point + offset, phase).yz;
        return transpose(axes) * gradient * visible;
      }

      vec3 skyColor(vec3 ray) {
        float height = max(ray.y, 0.0);
        float clearAir = 1.0 - exp(-height * 5.1);
        vec3 horizon = vec3(0.49, 0.67, 0.80);
        vec3 zenith = vec3(0.030, 0.175, 0.40);
        float sunAngle = max(dot(ray, uSun), 0.0);
        float scatter = 0.073 * pow(sunAngle, 12.0) + 0.115 * pow(sunAngle, 132.0);
        vec3 color = mix(horizon, zenith, clearAir);
        return color + scatter * vec3(1.0, 0.88, 0.68);
      }

      float waterFresnel(float cosI) {
        cosI = clamp(cosI, 0.0, 1.0);
        const float ior = 1.333;
        float cosT = sqrt(1.0 - (1.0 - cosI * cosI) / (ior * ior));
        float s = (cosI - ior * cosT) / (cosI + ior * cosT);
        float p = (ior * cosI - cosT) / (ior * cosI + cosT);
        return 0.5 * (s * s + p * p);
      }

      float sunGlint(vec3 normal, vec3 view, float roughness) {
        vec3 halfVector = normalize(view + uSun);
        float alignment = max(dot(normal, halfVector), 0.001);
        float alignment2 = alignment * alignment;
        float roughness2 = roughness * roughness;
        float slope2 = (1.0 - alignment2) / alignment2;
        // Beckmann distribution for unresolved variation in surface slope.
        float distribution = exp(-slope2 / roughness2)
          / (PI * roughness2 * alignment2 * alignment2);
        float halfView = max(dot(halfVector, view), 0.001);
        float facing = max(dot(normal, view), 0.0);
        float lit = max(dot(normal, uSun), 0.0);
        float masking = min(1.0, 2.0 * alignment * min(facing, lit) / halfView);
        return distribution * waterFresnel(halfView) * masking
          / (4.0 * max(facing, 0.028));
      }

      vec3 oceanColor(
        vec3 ray, float distanceToPlane, vec2 point, vec2 screenX, vec2 screenY
      ) {

        float surfaceVariation = simplex(point * vec2(0.079, 0.125) + vec2(8.4, 12.7), 0.0).x;
        float detail = 1.0 + 0.40 * surfaceVariation;
        // Every band drifts along the surface (travelling waves) and also
        // churns in place via rotating gradients (uPhase).
        vec2 windA = vec2(0.62, 0.78);
        vec2 windB = vec2(0.90, 0.43);
        vec2 windC = vec2(0.35, 0.94);
        vec2 slope = surfaceBand(point + windA * (0.55 * uTime), screenX, screenY,
          mat2(0.130, -0.045, 0.030, 0.074), vec2(7.6, -12.3), uPhase) * 0.072;
        slope += surfaceBand(point + windB * (0.45 * uTime), screenX, screenY,
          mat2(0.072, 0.104, -0.037, 0.043), vec2(-21.5, 3.3), uPhase) * 0.061;
        slope += surfaceBand(point + windA * (0.38 * uTime), screenX, screenY,
          mat2(0.28, -0.35, 0.14, 0.67), vec2(11.4, 19.9), uPhase * 2.0) * 0.088 * detail;
        slope += surfaceBand(point + windB * (0.32 * uTime), screenX, screenY,
          mat2(0.39, 0.66, -0.57, 1.04), vec2(37.2, 21.3), uPhase * 3.0) * 0.039;
        vec2 rippleSlope = surfaceBand(point + windC * (0.28 * uTime), screenX, screenY,
          mat2(1.75, -0.33, 0.52, 2.55), vec2(-5.1, 7.2), uPhase * 6.0) * 0.013;
        rippleSlope += surfaceBand(point + windA * (0.24 * uTime), screenX, screenY,
          mat2(3.8, 0.54, -1.48, 5.7), vec2(25.4, 2.7), uPhase * 10.0) * 0.0038 * detail;
        rippleSlope += surfaceBand(point + windB * (0.20 * uTime), screenX, screenY,
          mat2(10.4, -5.1, 3.1, 10.7), vec2(3.4, 47.1), uPhase * 16.0) * 0.0013 * detail;
        // Extra small waves: short choppy ripples riding on top.
        rippleSlope += surfaceBand(point + windC * (0.30 * uTime), screenX, screenY,
          mat2(5.6, 1.9, -2.3, 7.4), vec2(14.2, -33.1), uPhase * 12.0) * 0.0026 * detail;
        rippleSlope += surfaceBand(point + windA * (0.26 * uTime), screenX, screenY,
          mat2(14.5, 6.2, -7.5, 16.0), vec2(61.3, -8.8), uPhase * 20.0) * 0.0011;
        rippleSlope += surfaceBand(point + windB * (0.22 * uTime), screenX, screenY,
          mat2(24.0, -9.5, 10.8, 26.5), vec2(-48.7, 29.4), uPhase * 28.0) * 0.0006;
        slope += rippleSlope;

        vec3 view = -ray;
        vec3 normal = normalize(vec3(-slope.x, 1.0, -slope.y));
        float facing = dot(normal, view);
        // An averaged normal at grazing angles models occlusion by small ripples.
        float fresnel = waterFresnel(max(facing, -ray.y * 0.42) + 0.022);
        vec3 reflection = reflect(ray, normal);
        reflection.y = sqrt(reflection.y * reflection.y + 0.0014);
        float smoothPatch = surfaceVariation * (1.0 - smoothstep(70.0, 230.0, distanceToPlane));
        vec3 deepWater = vec3(0.0075, 0.045, 0.082);
        deepWater += smoothPatch * vec3(0.003, 0.016, 0.026);
        // Give nearby ripples subtle shading where sky reflections are weak.
        float nearby = 1.0 - smoothstep(5.0, 28.0, distanceToPlane);
        float downward = smoothstep(0.28, 0.80, -ray.y);
        // Softer gain so the shading no longer saturates into hard dark blotches.
        float rippleShade = clamp(
          1.4 * dot(rippleSlope, normalize(uSun.xz)), -0.22, 0.22
        );
        deepWater *= 1.0 + 0.35 * rippleShade * nearby * downward;
        vec3 reflected = skyColor(normalize(reflection)) * vec3(0.65, 0.90, 1.0);
        // Light scattered back out of the water. Straight down, Fresnel reflection is ~2%,
        // so without this term the water under the camera is flat near-black blue.
        // Each wave facet is lit by how much it faces the Sun, which gives crisp structure.
        // Facet lighting is kept gentle and the tint matches the open-ocean blue,
        // so the water under the camera has no black blotches and no turquoise cast.
        float facetLight = max(dot(normal, uSun), 0.0);
        float facetX = 7.0 * (facetLight - uSun.y);
        float facetMod = 1.0 + 0.24 * facetX / (1.0 + abs(facetX)); // smooth, never hard-clipped
        vec3 scatter = vec3(0.0105, 0.066, 0.118) * facetMod;
        scatter += vec3(0.004, 0.020, 0.032) * smoothPatch;
        float nearWater = 1.0 - smoothstep(8.0, 70.0, distanceToPlane);
        float lookingDown = smoothstep(0.12, 0.65, -ray.y);
        deepWater += scatter * nearWater * lookingDown;
        vec3 color = mix(deepWater, reflected, fresnel);

        float farDetail = smoothstep(30.0, 280.0, distanceToPlane);
        float roughness = mix(0.049 + 0.019 * smoothPatch, 0.112, farDetail);
        float glint = sunGlint(normal, view, roughness);
        // Compress only the direct sunlight to preserve the sky and ocean palette.
        float grazingFade = smoothstep(0.019, 0.117, -ray.y);
        vec3 shine = vec3(1.0, 0.94, 0.81) * glint * grazingFade * (0.63 + 0.16 * smoothPatch);
        color += 0.94 * (vec3(1.0) - exp(-shine * 0.8));

        vec3 horizonRay = normalize(vec3(ray.x, 0.00001, ray.z));
        vec3 maritimeHaze = skyColor(horizonRay) * vec3(0.65, 0.76, 0.85);
        float haze = 1.0 - exp(-distanceToPlane * 0.00065);
        return mix(color, maritimeHaze, haze);
      }

      void main() {
        vec3 ray = normalize(uCameraBasis * vec3(
          vScreen * vec2(uAspect, 1.0) * uTanHalfFov, -1.0
        ));
        float horizonWidth = max(fwidth(ray.y) * 0.58, 0.00001);
        vec3 color = skyColor(ray);
        // Chord distance gives the Sun an antialiased disc of angular diameter 0.53°.
        float solarDistance = length(ray - uSun);
        float solarWidth = max(fwidth(solarDistance) * 0.68, 0.00001);
        float solarDisc = 1.0 - smoothstep(
          0.00465 - solarWidth, 0.00465 + solarWidth, solarDistance
        );
        color += solarDisc * vec3(1.7, 1.52, 1.18);
        float distanceToPlane = uCameraPosition.y / max(-ray.y, 0.0002);
        vec2 point = uCameraPosition.xz + ray.xz * distanceToPlane;
        vec2 screenX = dFdx(point);
        vec2 screenY = dFdy(point);
        if (ray.y < horizonWidth) {
          float sea = 1.0 - smoothstep(-horizonWidth, horizonWidth, ray.y);
          color = mix(color, oceanColor(ray, distanceToPlane, point, screenX, screenY), sea);
        }
        gl_FragColor = vec4(color, 1.0);
        #include <colorspace_fragment>
      }
    `
  });
  const ocean = new Mesh(geometry, material);
  ocean.frustumCulled = false;
  ocean.renderOrder = -100;
  scene.add(ocean);

}
