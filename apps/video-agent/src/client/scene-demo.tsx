import { useEffect, useRef } from "react";
import * as THREE from "three";
export default function SceneDemo({ tokens }: { tokens: Record<string, string> }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const host = ref.current!;
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(340, 220);
    host.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const colors = Object.values(tokens);
    scene.background = new THREE.Color(colors[0]);
    const camera = new THREE.OrthographicCamera(-3, 3, 2, -2, 0.1, 100);
    camera.position.set(5, 5, 5);
    camera.lookAt(0, 0, 0);
    const group = new THREE.Group();
    scene.add(group);
    const geometries: THREE.BufferGeometry[] = [];
    const materials: THREE.Material[] = [];
    for (let i = 0; i < 4; i++) {
      const geo = new THREE.BoxGeometry(0.8, 0.7 + i * 0.2, 0.8);
      const mat = new THREE.MeshStandardMaterial({
        color: colors[2 + (i % 2)] || colors[1],
        roughness: 0.7,
      });
      geometries.push(geo);
      materials.push(mat);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set((i % 2) - 0.5, 0.35 + i * 0.1, Math.floor(i / 2) - 0.5);
      group.add(mesh);
    }
    scene.add(new THREE.AmbientLight(0xffffff, 2));
    const light = new THREE.DirectionalLight(0xffffff, 4);
    light.position.set(3, 5, 4);
    scene.add(light);
    const draw = () => renderer.render(scene, camera);
    draw();
    const move = (e: PointerEvent) => {
      const bounds = host.getBoundingClientRect();
      group.rotation.y = ((e.clientX - bounds.left) / bounds.width - 0.5) * 0.5;
      draw();
    };
    host.addEventListener("pointermove", move);
    return () => {
      host.removeEventListener("pointermove", move);
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [tokens]);
  return (
    <div className="scene-demo" ref={ref} aria-label="Interactive orthographic geometry study" />
  );
}
