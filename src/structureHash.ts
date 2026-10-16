export interface HashNode {
  type: string;
  name: string;
  children?: readonly HashNode[];
}

// Must stay byte-identical with the copy in the component-studio-naming skill.
export function structureHash(root: HashNode): string {
  const lines: string[] = [];
  const walk = (n: HashNode, path: number[]): void => {
    lines.push(path.join(".") + "|" + n.type + "|" + (path.length ? n.name : ""));
    if (n.children && n.type !== "INSTANCE") n.children.forEach((c, i) => walk(c, [...path, i]));
  };
  walk(root, []);
  const s = lines.join("\n");
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h.toString(16);
}
