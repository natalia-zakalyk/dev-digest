import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../../messages/en/conventions.json";
import common from "../../../../../../../../../messages/en/common.json";
import { ToastProvider } from "@/lib/toast";

const DRAFT = { name: "repo-conventions", description: "3 house conventions", type: "convention", body: "# repo-conventions\n\n## rule" };
const draftMutate = vi.fn((_ids: string[], opts?: { onSuccess?: (d: typeof DRAFT) => void }) => opts?.onSuccess?.(DRAFT));
const createMutate = vi.fn();
const linkMutate = vi.fn(() => Promise.resolve([]));
vi.mock("@/lib/hooks/conventions", () => ({
  useConventionSkillDraft: () => ({ mutate: draftMutate, isError: false }),
}));
vi.mock("@/lib/hooks/skills", () => ({
  useCreateSkill: () => ({ mutate: createMutate, isPending: false, isError: false }),
  useLinkSkillToAgent: () => ({ mutateAsync: linkMutate }),
}));
vi.mock("@/lib/hooks/agents", () => ({
  useAgents: () => ({ data: [{ id: "ag1", name: "API Contract Reviewer" }] }),
}));

import { SkillDraftModal } from "./SkillDraftModal";

afterEach(cleanup);
beforeEach(() => {
  draftMutate.mockClear();
  createMutate.mockReset();
});

function renderModal(onClose = vi.fn()) {
  render(
    <NextIntlClientProvider locale="en" messages={{ conventions: messages, common }}>
      <ToastProvider>
        <SkillDraftModal repoId="r1" repoName="payments-api" conventionIds={["a", "b", "c"]} onClose={onClose} />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
  return onClose;
}

describe("SkillDraftModal", () => {
  it("requests the draft for the accepted ids and fills the editable fields", () => {
    renderModal();
    expect(draftMutate.mock.calls[0]?.[0]).toEqual(["a", "b", "c"]);
    expect(screen.getByDisplayValue("repo-conventions")).toBeInTheDocument();
    expect(screen.getByText(/Merged from 3 accepted conventions in payments-api/)).toBeInTheDocument();
  });

  it("creates the skill with source 'extracted' using edited fields", () => {
    renderModal();
    fireEvent.change(screen.getByDisplayValue("3 house conventions"), { target: { value: "Edited description" } });
    fireEvent.click(screen.getByRole("button", { name: "Create skill" }));
    expect(createMutate.mock.calls[0]?.[0]).toMatchObject({
      name: "repo-conventions",
      description: "Edited description",
      type: "convention",
      enabled: true,
      source: "extracted",
    });
  });

  it("links the new skill to the ticked agents after saving", async () => {
    createMutate.mockImplementation((_i, opts) => opts?.onSuccess?.({ id: "sk1", name: "repo-conventions" }));
    renderModal();
    fireEvent.click(screen.getByRole("checkbox", { name: "API Contract Reviewer" }));
    fireEvent.click(screen.getByRole("button", { name: "Create skill" }));
    expect(linkMutate).toHaveBeenCalledWith({ agentId: "ag1", skillId: "sk1" });
  });

  it("cancel writes nothing", () => {
    const onClose = renderModal();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalled();
    expect(createMutate).not.toHaveBeenCalled();
  });
});
