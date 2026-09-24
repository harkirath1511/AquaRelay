"use client";

import { useEffect, useRef } from "react";

const vertexShaderSource = `
attribute vec2 a_position;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
}`;

const fragmentShaderSource = `
precision highp float;
uniform sampler2D u_earth;
uniform vec2 u_center;
uniform float u_radius;
uniform float u_angle;
uniform float u_tilt;
const float PI = 3.141592653589793;

void main() {
  vec2 point = (gl_FragCoord.xy - u_center) / u_radius;
  float distanceSquared = dot(point, point);
  if (distanceSquared > 1.0) discard;

  float depth = sqrt(1.0 - distanceSquared);
  float tiltCos = cos(u_tilt);
  float tiltSin = sin(u_tilt);
  vec3 tilted = vec3(point.x,
    tiltCos * point.y + tiltSin * depth,
    -tiltSin * point.y + tiltCos * depth);
  float turnCos = cos(u_angle);
  float turnSin = sin(u_angle);
  vec3 earth = vec3(turnCos * tilted.x + turnSin * tilted.z,
    tilted.y,
    -turnSin * tilted.x + turnCos * tilted.z);
  float longitude = atan(earth.x, earth.z);
  float latitude = asin(clamp(earth.y, -1.0, 1.0));
  vec2 texturePoint = vec2(fract(0.5 + longitude / (2.0 * PI)),
    0.5 + latitude / PI);
  vec3 surface = texture2D(u_earth, texturePoint).rgb;

  float daylight = max(dot(vec3(point, depth),
    normalize(vec3(-0.42, 0.72, 0.9))), 0.0);
  vec3 color = surface * (0.61 + daylight * 0.39);
  color += vec3(0.025, 0.08, 0.07) * pow(1.0 - depth, 2.8);
  float edge = 1.0 - smoothstep(0.985, 1.0, distanceSquared);
  gl_FragColor = vec4(color, edge);
}`;

function makeShader(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader;
  gl.deleteShader(shader);
  return null;
}

export function HeroGlobe() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const gl = canvas.getContext("webgl", { alpha: true, antialias: false,
      powerPreference: "low-power" });
    if (!gl) return;

    const vertex = makeShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
    const fragment = makeShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);
    if (!vertex || !fragment) {
      if (vertex) gl.deleteShader(vertex);
      if (fragment) gl.deleteShader(fragment);
      return;
    }
    const program = gl.createProgram();
    const buffer = gl.createBuffer();
    const texture = gl.createTexture();
    if (!program || !buffer || !texture) {
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
      return;
    }
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      gl.deleteProgram(program);
      gl.deleteBuffer(buffer);
      gl.deleteTexture(texture);
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
      return;
    }
    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, "a_position");
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    const centerUniform = gl.getUniformLocation(program, "u_center");
    const radiusUniform = gl.getUniformLocation(program, "u_radius");
    const angleUniform = gl.getUniformLocation(program, "u_angle");
    const tiltUniform = gl.getUniformLocation(program, "u_tilt");
    gl.uniform1i(gl.getUniformLocation(program, "u_earth"), 0);

    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let reducedMotion = motion.matches;
    let visible = true;
    let loaded = false;
    let disposed = false;
    let dragging = false;
    let previousX = 0;
    let previousY = 0;
    let angle = 0.28;
    let tilt = 0.22;
    let frame = 0;
    let lastFrame = 0;

    const draw = () => {
      if (!loaded || disposed) return;
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (!width || !height) return;
      const ratio = Math.min(window.devicePixelRatio || 1, 1.75);
      const pixelWidth = Math.round(width * ratio);
      const pixelHeight = Math.round(height * ratio);
      if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
      }
      gl.viewport(0, 0, pixelWidth, pixelHeight);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      const radius = width < 700
        ? Math.min(width * 0.62, height * 0.28)
        : Math.min(width * 0.37, height * 0.65);
      gl.uniform2f(centerUniform,
        (width < 700 ? width * 0.5 : width * 0.82) * ratio,
        (width < 700 ? height * 0.23 : height * 0.5) * ratio);
      gl.uniform1f(radiusUniform, radius * ratio);
      gl.uniform1f(angleUniform, angle);
      gl.uniform1f(tiltUniform, tilt);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    };

    const tick = (time: number) => {
      if (!visible || reducedMotion || disposed) return;
      if (time - lastFrame >= 32) {
        if (!dragging) angle += Math.min(time - lastFrame, 100) * 0.000035;
        lastFrame = time;
        draw();
      }
      frame = requestAnimationFrame(tick);
    };
    const restart = () => {
      cancelAnimationFrame(frame);
      if (loaded && visible && !reducedMotion) {
        lastFrame = performance.now();
        frame = requestAnimationFrame(tick);
      } else {
        draw();
      }
    };
    const onMotionChange = () => {
      reducedMotion = motion.matches;
      restart();
    };
    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      dragging = true;
      previousX = event.clientX;
      previousY = event.clientY;
      canvas.setPointerCapture(event.pointerId);
      container.classList.add("is-dragging");
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!dragging) return;
      angle -= (event.clientX - previousX) * 0.006;
      tilt = Math.max(-1.1, Math.min(1.1, tilt + (event.clientY - previousY) * 0.004));
      previousX = event.clientX;
      previousY = event.clientY;
      draw();
    };
    const onPointerUp = () => {
      dragging = false;
      container.classList.remove("is-dragging");
    };

    const image = new Image();
    image.onload = () => {
      if (disposed) return;
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA,
        gl.UNSIGNED_BYTE, image);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      loaded = true;
      draw();
      container.classList.add("is-ready");
      restart();
    };
    image.src = "/images/globe-texture-light.webp";

    const resizeObserver = new ResizeObserver(draw);
    resizeObserver.observe(container);
    const intersectionObserver = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      restart();
    });
    intersectionObserver.observe(container);
    motion.addEventListener("change", onMotionChange);
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerUp);

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      image.onload = null;
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      motion.removeEventListener("change", onMotionChange);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
      gl.deleteTexture(texture);
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
    };
  }, []);

  return (
    <div className="hero-globe" ref={containerRef} aria-hidden="true">
      <div className="hero-globe-halo" />
      <div className="hero-globe-fallback" />
      <canvas ref={canvasRef} />
    </div>
  );
}
