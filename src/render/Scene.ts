import * as THREE from 'three';

export function createScene(): THREE.Scene {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b0d12);

  const ambient = new THREE.AmbientLight(0xffffff, 0.55);
  scene.add(ambient);

  const key = new THREE.DirectionalLight(0xffffff, 0.85);
  key.position.set(5, 7, 6);
  scene.add(key);

  const fill = new THREE.DirectionalLight(0x99aaff, 0.35);
  fill.position.set(-6, -2, -4);
  scene.add(fill);

  return scene;
}

export function createCamera(aspect: number): THREE.PerspectiveCamera {
  const cam = new THREE.PerspectiveCamera(40, aspect, 0.1, 100);
  cam.position.set(5.5, 5.0, 7.0);
  cam.lookAt(0, 0, 0);
  return cam;
}
