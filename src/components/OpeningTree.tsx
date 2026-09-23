import { useState, type ReactNode } from "react";
import type { OpeningTreeNode } from "@/lib/chess/openingTree";

/**
 * OpeningTree (brief §31) — the personal opening map.
 * Expandable nodes, banded by whether the player scores well, badly, or has
 * never tried the line.
 */

const BAND_LABEL: Record<OpeningTreeNode["band"], string> = {
  strong: "you score well",
  neutral: "even",
  weak: "you leak points",
  unplayed: "never tried",
};

function Node({
  node,
  depth,
}: {
  node: OpeningTreeNode;
  depth: number;
}): ReactNode {
  const [open, setOpen] = useState(depth < 1);
  const hasChildren = node.children.length > 0;

  return (
    <div className="tree-branch">
      <button
        type="button"
        className="tree-node"
        data-band={node.band}
        aria-expanded={hasChildren ? open : undefined}
        onClick={() => hasChildren && setOpen((value) => !value)}
      >
        <span className="caret" aria-hidden="true">
          {hasChildren ? "▾" : "·"}
        </span>
        <span className="mv">
          {node.ply % 2 === 1 ? `${Math.ceil(node.ply / 2)}.` : `${Math.ceil(node.ply / 2)}…`}{" "}
          {node.san}
        </span>
        <span className="nm">
          {node.games > 0
            ? `${node.games} game${node.games === 1 ? "" : "s"} · ${BAND_LABEL[node.band]}${
                node.accuracy !== null ? ` · ${node.accuracy}% acc` : ""
              }`
            : BAND_LABEL.unplayed}
        </span>
        {node.games > 0 && (
          <span className={`chip ${node.band === "strong" ? "green" : node.band === "weak" ? "red" : ""}`}>
            {node.score}%
          </span>
        )}
      </button>

      {hasChildren && open && (
        <div className="tree-children">
          {node.children.map((child) => (
            <Node key={`${child.ply}-${child.san}`} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function OpeningTree({ nodes }: { nodes: OpeningTreeNode[] }): ReactNode {
  if (nodes.length === 0) {
    return (
      <p className="faint small">
        Import a few games and your opening map builds itself from the lines you actually play.
      </p>
    );
  }

  return (
    <div className="tree">
      {nodes.map((node) => (
        <Node key={`${node.ply}-${node.san}`} node={node} depth={0} />
      ))}
    </div>
  );
}
