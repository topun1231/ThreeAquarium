/** Always walk mesh.material as a list. Skinned shrimp use arrays; eggs use one material. */
export function materialsOf(mesh) {
  const list = mesh?.material;
  if (!list) return [];
  return Array.isArray(list) ? list : [list];
}

export function isEggMesh(object) {
  return !!(object && (object.userData?.eggs || object.name === 'Shrimp eggs'));
}

export function assignMaterials(mesh, list) {
  mesh.material = Array.isArray(mesh.material) || list.length !== 1 ? list : list[0];
}

export function cloneCreatureMaterials(mesh, tint = 1) {
  const next = materialsOf(mesh).map(material => {
    if (/eye/i.test(material.name || '')) return material;
    const copy = material.clone();
    if (copy.color?.multiplyScalar) copy.color.multiplyScalar(tint);
    copy.userData = {...(copy.userData || {}), populationOwned:true};
    return copy;
  });
  assignMaterials(mesh, next);
  return next;
}

export function stripEggMeshes(root) {
  const removed = [];
  root.traverse(object => { if (isEggMesh(object)) removed.push(object); });
  for (const object of removed) object.removeFromParent?.();
  return removed;
}

export function releaseCreatureMesh(mesh) {
  for (const material of materialsOf(mesh)) {
    if (material.userData?.populationOwned || isEggMesh(mesh)) material.dispose?.();
  }
  if (isEggMesh(mesh)) {
    mesh.geometry?.dispose?.();
    mesh.removeFromParent?.();
  }
}
