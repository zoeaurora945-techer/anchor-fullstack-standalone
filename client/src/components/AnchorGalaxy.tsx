import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { useEffect, useRef } from "react";

type Goal = { id: string; title: string; color: string };
type Project = { id: string; title: string; goalId: string | null };
type Task = { id: string; projectId: string | null; status: string };

/**
 * 跨场景重建保持用户视角。
 * goals/projects/tasks 每 15s 轮询会触发 useEffect 重建场景，
 * 若不保留相机状态，用户每次调整缩放后都会被重置。
 */
let savedCam: { pos: number[]; target: number[] } | null = null;

/* ---------- 幽蓝深空背景 ---------- */
const DEEP_BLUE = 0x0a1836;
const FOG_BLUE = 0x0a1836;

/* ---------- 星尘着色器：远处微光 + 缓慢闪烁 ---------- */
const DUST_VERT = /* glsl */ `
  attribute float aScale;
  attribute float aSeed;
  uniform float uTime;
  uniform float uPixelRatio;
  varying float vTwinkle;
  void main() {
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    // 每颗粒子独立相位的呼吸式闪烁
    float tw = sin(uTime * 1.15 + aSeed * 6.2831);
    vTwinkle = 0.45 + 0.55 * (0.5 + 0.5 * tw);
    gl_PointSize = aScale * uPixelRatio * (240.0 / max(-mvPosition.z, 0.001));
  }
`;

const DUST_FRAG = /* glsl */ `
  uniform vec3 uColor;
  varying float vTwinkle;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    if (d > 0.5) discard;
    float glow = 1.0 - smoothstep(0.0, 0.5, d);
    glow = pow(glow, 2.4);
    gl_FragColor = vec4(uColor, glow * vTwinkle);
  }
`;

/* ---------- 恒星表面：噪声湍流的光球层 ---------- */
const STAR_VERT = /* glsl */ `
  varying vec3 vPos;
  varying vec3 vNormal;
  void main() {
    vPos = position;
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const STAR_FRAG = /* glsl */ `
  uniform float uTime;
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  varying vec3 vPos;
  varying vec3 vNormal;

  float hash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
  float noise(vec3 p) {
    vec3 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash(i + vec3(0.0,0.0,0.0)), hash(i + vec3(1.0,0.0,0.0)), f.x),
                   mix(hash(i + vec3(0.0,1.0,0.0)), hash(i + vec3(1.0,1.0,0.0)), f.x), f.y),
               mix(mix(hash(i + vec3(0.0,0.0,1.0)), hash(i + vec3(1.0,0.0,1.0)), f.x),
                   mix(hash(i + vec3(0.0,1.0,1.0)), hash(i + vec3(1.0,1.0,1.0)), f.x), f.y), f.z);
  }
  float fbm(vec3 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.02; a *= 0.5; }
    return v;
  }

  void main() {
    // 缓慢流动的对流纹理
    float n = fbm(vPos * 2.4 + vec3(0.0, uTime * 0.10, uTime * 0.07));
    vec3 col = mix(uColorA, uColorB, smoothstep(0.25, 0.78, n));
    // 边缘辉光（Fresnel）
    float fres = pow(1.0 - max(dot(normalize(vNormal), vec3(0.0, 0.0, 1.0)), 0.0), 2.6);
    gl_FragColor = vec4(col * (1.1 + n * 0.95) + vec3(1.0, 0.96, 0.88) * fres * 0.7, 1.0);
  }
`;

/* ---------- 行星大气层：背面渲染 + 加法混合的辉光 ---------- */
const ATMO_VERT = /* glsl */ `
  varying vec3 vNormal;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const ATMO_FRAG = /* glsl */ `
  uniform vec3 uColor;
  varying vec3 vNormal;
  void main() {
    float intensity = pow(max(0.70 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 0.0), 3.0);
    gl_FragColor = vec4(uColor, 1.0) * intensity;
  }
`;

/** 生成径向渐变光晕贴图，用于日冕 sprite */
function makeGlowTexture(): THREE.Texture {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0.0, "rgba(255,255,255,1)");
    g.addColorStop(0.18, "rgba(255,255,255,0.62)");
    g.addColorStop(0.45, "rgba(255,255,255,0.16)");
    g.addColorStop(1.0, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export type GoalSelection = { id: string; title: string; color: string; screen: { x: number; y: number } };

export function AnchorGalaxy({
  goals,
  projects,
  tasks,
  onSelectGoal,
  onSelectGoalDetail,
  destroyingGoalId,
  onDestroyComplete,
}: {
  goals: Goal[];
  projects: Project[];
  tasks: Task[];
  onSelectGoal?: (id: string) => void;
  onSelectGoalDetail?: (selection: GoalSelection) => void;
  /** 正在播放摧毁动效的恒星 id；动效播完回调 onDestroyComplete，由父组件删除数据。 */
  destroyingGoalId?: string | null;
  onDestroyComplete?: (goalId: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  /* 供摧毁动效 effect 访问当前场景（主 effect 每次重建都会刷新） */
  const sceneRef = useRef<{
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    stars: THREE.Object3D[];
    host: HTMLDivElement;
    alive: { value: boolean };
  } | null>(null);

  useEffect(() => {
    const host = containerRef.current;
    if (!host) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      return;
    }
    const pixelRatio = Math.min(window.devicePixelRatio, 1.75);
    renderer.setPixelRatio(pixelRatio);
    renderer.setClearColor(DEEP_BLUE, 1);
    renderer.domElement.style.display = "block";
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(FOG_BLUE, 0.012);

    const alive = { value: true };
    sceneRef.current = { scene: scene as THREE.Scene, camera: null as unknown as THREE.PerspectiveCamera, stars: [], host, alive };

    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 400);
    camera.position.set(0, 14, 30);
    if (sceneRef.current) sceneRef.current.camera = camera;

    /* ---------- 轨道控制器：拖拽旋转 / 滚轮缩放 / 右键平移 ---------- */
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.rotateSpeed = 0.55;
    controls.zoomSpeed = 0.9;
    controls.panSpeed = 0.7;
    controls.minDistance = 4;
    controls.maxDistance = 160;
    controls.maxPolarAngle = Math.PI * 0.92;
    controls.minPolarAngle = Math.PI * 0.06;

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();

    const stars: THREE.Object3D[] = [];
    const pivots: Array<{ object: THREE.Object3D; speed: number }> = [];
    const tickers: Array<(t: number) => void> = [];
    const disposables: Array<{ dispose: () => void }> = [];

    /* ---------- 灯光：冷环境光压暗，突出恒星自发光 ---------- */
    scene.add(new THREE.AmbientLight(0x4a6a9a, 0.55));
    const rim = new THREE.DirectionalLight(0x8fb4ff, 0.35);
    rim.position.set(-8, 12, 10);
    scene.add(rim);

    /* ---------- 星尘：远近两层，均带闪烁 ---------- */
    const glowTex = makeGlowTexture();
    disposables.push(glowTex);

    const makeDust = (count: number, spreadXZ: number, spreadY: number, depth: number, color: number, scaleBase: number, opacity: number) => {
      const pos = new Float32Array(count * 3);
      const scale = new Float32Array(count);
      const seed = new Float32Array(count);
      for (let i = 0; i < count; i++) {
        pos[i * 3] = (Math.random() - 0.5) * spreadXZ;
        pos[i * 3 + 1] = (Math.random() - 0.5) * spreadY;
        pos[i * 3 + 2] = -Math.random() * depth;
        scale[i] = scaleBase * (0.45 + Math.random() * 0.9);
        seed[i] = Math.random();
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      geo.setAttribute("aScale", new THREE.BufferAttribute(scale, 1));
      geo.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
      const mat = new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uColor: { value: new THREE.Color(color) },
          uPixelRatio: { value: pixelRatio },
        },
        vertexShader: DUST_VERT,
        fragmentShader: DUST_FRAG,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      mat.opacity = opacity;
      const pts = new THREE.Points(geo, mat);
      pts.frustumCulled = false;
      scene.add(pts);
      disposables.push(geo, mat);
      tickers.push((t) => { mat.uniforms.uTime.value = t; });
      return pts;
    };

    // 远景：细密冷白微光；近景：稍大、偏青蓝
    const farDust = makeDust(1400, 260, 170, 220, 0xdce8ff, 1.5, 0.55);
    const nearDust = makeDust(420, 120, 80, 110, 0xa8c8ff, 2.6, 0.75);

    /* ---------- 恒星 / 行星 / 卫星 ---------- */
    const goldenAngle = Math.PI * (3 - Math.sqrt(5));
    const activeGoals = goals.length ? goals : [];

    activeGoals.forEach((goal, index) => {
      const root = new THREE.Group();
      // 黄金角螺旋分布，保证任意数量下恒星都均匀散开、互不遮挡
      const angle = index * goldenAngle;
      const radius = index === 0 ? 0 : 5.2 * Math.sqrt(index) + 2.6;
      const y = index === 0 ? 0 : (Math.random() - 0.5) * 1.6;
      root.position.set(Math.cos(angle) * radius, y, Math.sin(angle) * radius);
      root.userData.goalId = goal.id;
      // 盘面轻微倾斜，增强立体感
      root.rotation.x = -0.22;

      const starColor = new THREE.Color(goal.color);

      // 光球层：噪声湍流着色器
      const starMat = new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uColorA: { value: starColor.clone() },
          uColorB: { value: starColor.clone().lerp(new THREE.Color(0xffffff), 0.72) },
        },
        vertexShader: STAR_VERT,
        fragmentShader: STAR_FRAG,
      });
      const starGeo = new THREE.SphereGeometry(1.35, 48, 48);
      const core = new THREE.Mesh(starGeo, starMat);
      disposables.push(starGeo, starMat);
      tickers.push((t) => { starMat.uniforms.uTime.value = t; });

      // 日冕：两层加法混合的光晕 sprite
      const corona = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glowTex, color: starColor, transparent: true,
        opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending,
      }));
      corona.scale.set(7.5, 7.5, 1);
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glowTex, color: starColor, transparent: true,
        opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending,
      }));
      halo.scale.set(15, 15, 1);

      root.add(core, corona, halo);

      // 恒星自身作为点光源，照亮环绕的行星
      const light = new THREE.PointLight(starColor, 26, 46, 1.7);
      root.add(light);

      // 不可见的放大命中体，便于点选
      const hitGeo = new THREE.SphereGeometry(2.4, 16, 16);
      const hitMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0 });
      const hit = new THREE.Mesh(hitGeo, hitMat);
      hit.userData.goalId = goal.id;
      disposables.push(hitGeo, hitMat);
      root.add(hit);
      scene.add(root);
      stars.push(root);
      if (sceneRef.current) sceneRef.current.stars = stars;

      const linked = projects.filter((project) => project.goalId === goal.id);
      linked.forEach((project, projectIndex) => {
        // 行星公转：绕 Y 轴（盘面），与轨道线共面
        const pivot = new THREE.Group();
        pivot.rotation.y = (projectIndex / Math.max(linked.length, 1)) * Math.PI * 2;
        root.add(pivot);

        const radiusOrbit = 3.0 + projectIndex * 1.15;
        const planet = new THREE.Group();
        planet.position.set(radiusOrbit, 0, 0);
        pivot.add(planet);

        const taskCount = tasks.filter((task) => task.projectId === project.id).length;
        const planetSize = 0.42 + Math.min(0.32, taskCount * 0.055);
        const planetGeo = new THREE.SphereGeometry(planetSize, 32, 32);
        const planetMat = new THREE.MeshStandardMaterial({
          color: projectIndex % 2 ? 0x7fb5d6 : 0xd8b48c,
          roughness: 0.62,
          metalness: 0.12,
        });
        planet.add(new THREE.Mesh(planetGeo, planetMat));
        disposables.push(planetGeo, planetMat);

        // 大气辉光
        const atmoGeo = new THREE.SphereGeometry(planetSize * 1.32, 32, 32);
        const atmoMat = new THREE.ShaderMaterial({
          uniforms: { uColor: { value: new THREE.Color(projectIndex % 2 ? 0x6fa8ff : 0xffc98a) } },
          vertexShader: ATMO_VERT,
          fragmentShader: ATMO_FRAG,
          side: THREE.BackSide,
          blending: THREE.AdditiveBlending,
          transparent: true,
          depthWrite: false,
        });
        planet.add(new THREE.Mesh(atmoGeo, atmoMat));
        disposables.push(atmoGeo, atmoMat);

        // 轨道线：xz 平面的椭圆，与行星运动平面一致
        const orbitPts: THREE.Vector3[] = [];
        for (let n = 0; n <= 96; n++) {
          const a = (n / 96) * Math.PI * 2;
          orbitPts.push(new THREE.Vector3(Math.cos(a) * radiusOrbit, 0, Math.sin(a) * radiusOrbit * 0.93));
        }
        const orbitGeo = new THREE.BufferGeometry().setFromPoints(orbitPts);
        const orbitMat = new THREE.LineBasicMaterial({ color: 0x6f8fd0, transparent: true, opacity: 0.3 });
        root.add(new THREE.Line(orbitGeo, orbitMat));
        disposables.push(orbitGeo, orbitMat);

        const linkedTasks = tasks.filter((task) => task.projectId === project.id);
        linkedTasks.slice(0, 8).forEach((task, taskIndex) => {
          const moonPivot = new THREE.Group();
          moonPivot.rotation.y = (taskIndex / Math.max(linkedTasks.length, 1)) * Math.PI * 2;
          planet.add(moonPivot);
          const moonGeo = new THREE.SphereGeometry(0.11, 14, 14);
          const moonMat = new THREE.MeshStandardMaterial({
            color: task.status === "doing" ? 0xffe9a8 : 0xb9c6dd,
            emissive: task.status === "doing" ? 0xffc760 : 0x223049,
            emissiveIntensity: task.status === "doing" ? 1.6 : 0.5,
            roughness: 0.7,
          });
          const moon = new THREE.Mesh(moonGeo, moonMat);
          moon.position.set(planetSize + 0.42 + taskIndex * 0.1, 0, 0);
          moonPivot.add(moon);
          disposables.push(moonGeo, moonMat);
          pivots.push({ object: moonPivot, speed: 0.02 + taskIndex * 0.003 });
        });

        pivots.push({ object: pivot, speed: 0.0055 + projectIndex * 0.0022 });
      });
    });

    /* ---------- 自适应取景：让所有恒星都进入视野 ---------- */
    const frameAll = () => {
      if (!stars.length) {
        controls.target.set(0, 0, 0);
        camera.position.set(0, 14, 30);
        controls.update();
        return;
      }
      const box = new THREE.Box3();
      stars.forEach((s) => box.expandByObject(s));
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z, 6);
      const fov = (camera.fov * Math.PI) / 180;
      const dist = ((maxDim / 2) / Math.tan(fov / 2)) * 1.9;
      const dir = new THREE.Vector3(0, 0.55, 1).normalize();
      camera.position.copy(center).add(dir.multiplyScalar(dist));
      controls.target.copy(center);
      controls.update();
    };

    if (savedCam) {
      // 保留用户上一次的视角
      camera.position.fromArray(savedCam.pos);
      controls.target.fromArray(savedCam.target);
      controls.update();
    } else {
      frameAll();
    }

    /* ---------- 尺寸同步：必须更新 style，否则 canvas 会溢出并被裁切 ---------- */
    const resize = () => {
      const width = host.clientWidth || 1;
      const height = host.clientHeight || 1;
      renderer.setSize(width, height); // updateStyle 默认为 true
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();

    /* ---------- 点选恒星（与拖拽区分） ---------- */
    let downX = 0;
    let downY = 0;
    const onPointerDown = (event: PointerEvent) => { downX = event.clientX; downY = event.clientY; };
    const onPointerUp = (event: PointerEvent) => {
      if (Math.hypot(event.clientX - downX, event.clientY - downY) > 5) return; // 拖拽，不触发选择
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster
        .intersectObjects(stars, true)
        .find((item) => item.object.userData.goalId || item.object.parent?.userData.goalId);
      const id = hit?.object.userData.goalId ?? hit?.object.parent?.userData.goalId;
      if (!id) return;
      const goal = goals.find((g) => g.id === id);
      if (goal && onSelectGoalDetail) {
        // 恒星世界坐标 → 屏幕投影坐标，供操作面板定位
        const root = stars.find((s) => s.userData.goalId === id);
        if (root) {
          const world = root.position.clone().project(camera);
          onSelectGoalDetail({
            id: goal.id,
            title: goal.title,
            color: goal.color,
            screen: {
              x: (world.x * 0.5 + 0.5) * rect.width,
              y: (-world.y * 0.5 + 0.5) * rect.height,
            },
          });
          return;
        }
      }
      onSelectGoal?.(id);
    };
    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    renderer.domElement.addEventListener("pointerup", onPointerUp);

    /* ---------- 动画循环 ---------- */
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const clock = new THREE.Clock();
    let frame = 0;
    let raf = 0;
    const render = () => {
      const t = clock.getElapsedTime();
      frame += 1;
      if (!reduced) {
        pivots.forEach((p) => { p.object.rotation.y += p.speed; });
        farDust.rotation.y += 0.00016;
        nearDust.rotation.y += 0.00042;
        tickers.forEach((fn) => fn(t));
        // 日冕缓慢呼吸
        const pulse = 1 + Math.sin(t * 0.9) * 0.05;
        stars.forEach((s) => {
          const sp = s.children.find((c) => (c as THREE.Sprite).isSprite) as THREE.Sprite | undefined;
          if (sp) sp.material.opacity = 0.55 * pulse;
        });
      }
      controls.update();
      renderer.render(scene, camera);
      if (!reduced || frame < 3) raf = requestAnimationFrame(render);
    };
    render();

    return () => {
      alive.value = false;
      sceneRef.current = null;
      savedCam = {
        pos: camera.position.toArray(),
        target: controls.target.toArray(),
      };
      cancelAnimationFrame(raf);
      observer.disconnect();
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("pointerup", onPointerUp);
      controls.dispose();
      disposables.forEach((d) => d.dispose());
      renderer.dispose();
      if (renderer.domElement.parentNode === host) host.removeChild(renderer.domElement);
    };
  }, [goals, projects, tasks, onSelectGoal, onSelectGoalDetail]);

  /* ---------- 恒星摧毁动效：坍缩 → 爆闪 → 碎片爆散渐隐 ---------- */
  useEffect(() => {
    if (!destroyingGoalId) return;
    const ctx = sceneRef.current;
    if (!ctx || !ctx.alive.value) return;
    const { scene, stars, alive } = ctx;
    const root = stars.find((s) => s.userData.goalId === destroyingGoalId);
    if (!root) {
      // 数据已先行消失（例如列表刷新），直接完成
      onDestroyComplete?.(destroyingGoalId);
      return;
    }

    const starColor = new THREE.Color((goals.find((g) => g.id === destroyingGoalId)?.color) ?? "#ffd27d");

    /* 碎片粒子：恒星颜色 + 白热混合，从核心向外爆散并受重力坍落 */
    const COUNT = 160;
    const positions = new Float32Array(COUNT * 3);
    const velocities: THREE.Vector3[] = [];
    const origin = new THREE.Vector3();
    root.getWorldPosition(origin);
    for (let i = 0; i < COUNT; i++) {
      positions[i * 3] = origin.x;
      positions[i * 3 + 1] = origin.y;
      positions[i * 3 + 2] = origin.z;
      // 球面均匀方向
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const speed = 2.2 + Math.random() * 4.2;
      velocities.push(new THREE.Vector3(
        Math.sin(phi) * Math.cos(theta) * speed,
        Math.cos(phi) * speed * 0.9 + 0.8,
        Math.sin(phi) * Math.sin(theta) * speed,
      ));
    }
    const fragGeo = new THREE.BufferGeometry();
    fragGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const fragMat = new THREE.PointsMaterial({
      size: 0.34,
      map: makeGlowTexture(),
      color: starColor,
      transparent: true,
      opacity: 1,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const fragments = new THREE.Points(fragGeo, fragMat);
    fragments.frustumCulled = false;
    scene.add(fragments);

    // 冲击波光环
    const shockMat = new THREE.SpriteMaterial({
      map: makeGlowTexture(), color: starColor, transparent: true,
      opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const shockwave = new THREE.Sprite(shockMat);
    shockwave.position.copy(origin);
    shockwave.scale.set(1, 1, 1);
    scene.add(shockwave);

    const corona = root.children.find((c) => (c as THREE.Sprite).isSprite) as THREE.Sprite | undefined;
    const DURATION = 1500;
    const start = performance.now();
    let raf = 0;

    const tick = () => {
      const now = performance.now();
      const p = Math.min((now - start) / DURATION, 1);
      if (!alive.value) {
        scene.remove(fragments, shockwave);
        fragGeo.dispose(); fragMat.dispose(); shockMat.map?.dispose(); shockMat.dispose();
        return;
      }
      // 阶段1（0~0.3）：核心坍缩 + 光晕爆闪；阶段2（0.3~1）：碎片扩散渐隐
      if (p < 0.3) {
        const k = p / 0.3;
        root.scale.setScalar(1 - 0.92 * k * k);
        if (corona) corona.material.opacity = 0.55 + 2.2 * k;
        shockwave.scale.setScalar(1 + 22 * k);
        shockMat.opacity = 0.9 * (1 - k);
      } else {
        root.scale.setScalar(0.08);
        if (corona) corona.material.opacity = Math.max(0, 2.75 * (1 - (p - 0.3) / 0.25));
        const attr = fragGeo.getAttribute("position") as THREE.BufferAttribute;
        const dt = 1 / 60;
        for (let i = 0; i < COUNT; i++) {
          const v = velocities[i];
          v.y -= 1.6 * dt; // 重力坍落
          attr.setXYZ(i, attr.getX(i) + v.x * dt, attr.getY(i) + v.y * dt, attr.getZ(i) + v.z * dt);
        }
        attr.needsUpdate = true;
        fragMat.opacity = Math.max(0, 1 - (p - 0.3) / 0.7);
      }
      if (p < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        scene.remove(fragments, shockwave);
        fragGeo.dispose(); fragMat.dispose(); shockMat.map?.dispose(); shockMat.dispose();
        onDestroyComplete?.(destroyingGoalId);
      }
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      scene.remove(fragments, shockwave);
      fragGeo.dispose(); fragMat.dispose(); shockMat.map?.dispose(); shockMat.dispose();
    };
  }, [destroyingGoalId, goals, onDestroyComplete]);

  return (
    <div className="relative h-[460px] w-full overflow-hidden rounded-3xl border border-primary/20 bg-[#0a1836] shadow-[0_0_90px_rgba(70,120,220,0.18)]">
      <div ref={containerRef} className="absolute inset-0" />
      <div className="pointer-events-none absolute bottom-3 left-4 text-[11px] text-white/45">
        拖拽旋转 · 滚轮缩放 · 点击恒星编辑或摧毁
      </div>
    </div>
  );
}
