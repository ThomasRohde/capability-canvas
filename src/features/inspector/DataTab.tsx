import { Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { updateNode } from "../../domain/commands/operations";
import type { CapabilityNode } from "../../domain/document/types";
import { useDocumentStore } from "../../app/stores/documentStore";
import { nextMetadataKey } from "./inspectorUtils";

export function DataTab({ node }: { node: CapabilityNode }) {
  const execute = useDocumentStore((state) => state.execute);
  const metadataText = JSON.stringify(node.metadata, null, 2);
  const [draft, setDraft] = useState(metadataText);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(metadataText);
    setError(null);
  }, [metadataText, node.id]);

  const commitMetadata = () => {
    if (draft === metadataText) {
      setError(null);
      return;
    }
    try {
      const parsed = JSON.parse(draft) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        setError("Metadata must be a JSON object.");
        return;
      }
      setError(null);
      execute(
        updateNode(node.id, { metadata: parsed as Record<string, unknown> }),
      );
    } catch {
      setError("Metadata JSON is invalid.");
    }
  };

  return (
    <>
      <dl className="cc-meta-list">
        <dt>ID</dt>
        <dd>{node.id}</dd>
        <dt>Type</dt>
        <dd>{node.type}</dd>
        <dt>Parent</dt>
        <dd>{node.parentId ?? "Root"}</dd>
        <dt>Updated</dt>
        <dd>{new Date(node.updatedAt).toLocaleString()}</dd>
      </dl>
      <div className="cc-field">
        <label htmlFor="metadata-json">Metadata JSON</label>
        <textarea
          id="metadata-json"
          className="cc-textarea"
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            if (error) setError(null);
          }}
          onBlur={commitMetadata}
        />
        {error && <span className="cc-field-error">{error}</span>}
      </div>
      <button
        className="cc-btn"
        type="button"
        onClick={() =>
          execute(
            updateNode(node.id, {
              metadata: {
                ...node.metadata,
                [nextMetadataKey(node.metadata)]: "value",
              },
            }),
          )
        }
      >
        <Plus /> Add metadata
      </button>
    </>
  );
}
