import { Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createVisualView } from "../../domain/commands/operations";
import type {
  CapabilityDocument,
  NodeId,
} from "../../domain/document/types";
import {
  BUILT_IN_VIEW_TEMPLATES,
  DEFAULT_VISUAL_TEMPLATE_ID,
  templateById,
  type VisualTemplateId,
} from "../../domain/visual/templates";
import {
  createDescriptionPreview,
  defaultRootIdForDeepDive,
  normalizeCreateName,
  orderedRootTargets,
} from "./viewDrawerModel";
import type { ExecuteTransaction } from "./viewDrawerTypes";

interface CreateViewFormProps {
  doc: CapabilityDocument;
  execute: ExecuteTransaction;
  selectedNodeIds: NodeId[];
  onCreated: () => void;
}

export function CreateViewForm({
  doc,
  execute,
  selectedNodeIds,
  onCreated,
}: CreateViewFormProps) {
  const [createName, setCreateName] = useState("");
  const [templateId, setTemplateId] =
    useState<VisualTemplateId>(DEFAULT_VISUAL_TEMPLATE_ID);
  const [createRootId, setCreateRootId] = useState<NodeId>("");
  const selectedTemplate = templateById(templateId);
  const rootTargets = useMemo(() => orderedRootTargets(doc), [doc]);
  const defaultDeepDiveRootId = defaultRootIdForDeepDive(
    doc,
    selectedNodeIds,
    rootTargets,
  );

  useEffect(() => {
    if (templateId !== "domain-deep-dive@1") return;
    if (createRootId && doc.nodesById[createRootId]) return;
    setCreateRootId(defaultDeepDiveRootId);
  }, [createRootId, defaultDeepDiveRootId, doc.nodesById, templateId]);

  const createAndSwitch = () => {
    const rootId =
      templateId === "domain-deep-dive@1"
        ? createRootId || defaultDeepDiveRootId
        : undefined;
    execute(
      createVisualView({
        name: normalizeCreateName(createName, selectedTemplate.name),
        templateId,
        rootId,
      }),
    );
    onCreated();
    setCreateName("");
  };

  return (
    <>
      <div className="cc-view-create-form">
        <label className="cc-field">
          <span>View name</span>
          <input
            className="cc-input"
            aria-label="New view name"
            value={createName}
            placeholder={selectedTemplate.name}
            onChange={(event) => setCreateName(event.target.value)}
          />
        </label>
        <label className="cc-field">
          <span>Template</span>
          <select
            className="cc-select"
            aria-label="View template"
            value={templateId}
            onChange={(event) =>
              setTemplateId(event.target.value as VisualTemplateId)
            }
          >
            {BUILT_IN_VIEW_TEMPLATES.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name}
              </option>
            ))}
          </select>
        </label>
        {templateId === "domain-deep-dive@1" && (
          <label className="cc-field cc-view-root-field">
            <span>Root target</span>
            <select
              className="cc-select"
              aria-label="Deep-dive root target"
              value={createRootId || defaultDeepDiveRootId}
              onChange={(event) => setCreateRootId(event.target.value)}
            >
              {rootTargets.map((node) => (
                <option key={node.id} value={node.id}>
                  {node.path}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <div className="cc-view-create-footer">
        <p className="cc-view-template-description">
          {createDescriptionPreview(
            selectedTemplate.description,
            templateId,
            doc,
            createRootId || defaultDeepDiveRootId,
          )}
        </p>
        <button
          className="cc-btn cc-btn-primary cc-view-create-action"
          type="button"
          disabled={
            templateId === "domain-deep-dive@1" && rootTargets.length === 0
          }
          onClick={createAndSwitch}
        >
          <Plus /> Create and switch
        </button>
      </div>
    </>
  );
}
