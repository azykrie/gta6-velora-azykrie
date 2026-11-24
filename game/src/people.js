// Velora City — people: real humanoid figures, not boxes. A capsule torso, a ball
// head, cylinder arms and legs on shoulder/hip pivots so they swing when they walk,
// with human proportions and varied clothes. Geometry is shared across every person.
import * as THREE from 'three';

const torsoGeo = new THREE.CapsuleGeometry(0.26, 0.42, 4, 10);
const headGeo = new THREE.SphereGeometry(0.21, 12, 10);
const hairGeo = new THREE.SphereGeometry(0.22, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55);
const armGeo = new THREE.CylinderGeometry(0.085, 0.07, 0.62, 8);
const legGeo = new THREE.CylinderGeometry(0.11, 0.09, 0.8, 8);
const shoeGeo = new THREE.BoxGeometry(0.16, 0.09, 0.3);
const shoeMat = new THREE.MeshLambertMaterial({ color: 0x1c1c1c });

function limb(geo, mat, x, y, parent) {
  const pivot = new THREE.Group();
  pivot.position.set(x, y, 0);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = -0.31; // arms hang from the shoulder
  mesh.castShadow = true;
  pivot.add(mesh);
  parent.add(pivot);
  return pivot;
}

export function makeHumanoid({ shirt = 0x2a6db0, pants = 0x2c313a, skin = 0xd8a077, hair = 0x2a1c10, scale = 1 } = {}) {
  const g = new THREE.Group();
  const shirtMat = new THREE.MeshLambertMaterial({ color: shirt });
  const pantsMat = new THREE.MeshLambertMaterial({ color: pants });
  const skinMat = new THREE.MeshLambertMaterial({ color: skin });
  const hairMat = new THREE.MeshLambertMaterial({ color: hair });
  // torso: a capsule, not a box
  const torso = new THREE.Mesh(torsoGeo, shirtMat);
  torso.position.y = 1.26;
  torso.castShadow = true;
  g.add(torso);
  // head: a ball, with a hair cap
  const head = new THREE.Mesh(headGeo, skinMat);
  head.position.y = 1.72;
  head.castShadow = true;
  g.add(head);
  const hairMesh = new THREE.Mesh(hairGeo, hairMat);
  hairMesh.position.y = 1.75;
  g.add(hairMesh);
  // arms pivot at the shoulders, legs at the hips — they swing when walking
  const armL = limb(armGeo, shirtMat, -0.36, 1.5, g);
  const armR = limb(armGeo, shirtMat, 0.36, 1.5, g);
  const legL = limb(legGeo, pantsMat, -0.14, 0.85, g);
  const legR = limb(legGeo, pantsMat, 0.14, 0.85, g);
  // the leg pivots hang their cylinders from the hip, not the shoulder
  for (const leg of [legL, legR]) {
    leg.children[0].position.y = -0.4;
    const shoe = new THREE.Mesh(shoeGeo, shoeMat);
    shoe.position.set(0, -0.8, 0.05);
    leg.add(shoe);
  }
  g.userData = { legL, legR, armL, armR, torso, head };
  if (scale !== 1) g.scale.setScalar(scale);
  return g;
}

// Swing the limbs for a walk cycle; phase advances with distance walked.
export function animateWalk(person, phase, moving) {
  const u = person.userData;
  const swing = moving ? Math.sin(phase) * 0.6 : 0;
  u.legL.rotation.x = swing;
  u.legR.rotation.x = -swing;
  u.armL.rotation.x = -swing * 0.75;
  u.armR.rotation.x = swing * 0.75;
  u.torso.position.y = 1.26 + (moving ? Math.abs(Math.sin(phase)) * 0.05 : 0);
}
