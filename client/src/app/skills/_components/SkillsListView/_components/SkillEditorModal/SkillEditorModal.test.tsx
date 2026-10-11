import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/skills.json";
import common from "../../../../../../../messages/en/common.json";
import { ToastProvider } from "@/lib/toast";

const createMutate = vi.fn();
const updateMutate = vi.fn();
vi.mock("@/lib/hooks/skills", () => ({
  useCreateSkill: () => ({ mutate: createMutate, isPending: false }),
  useUpdateSkill: () => ({ mutate: updateMutate, isPending: false }),
}));

import { SkillEditorModal } from "./SkillEditorModal";

afterEach(cleanup);
beforeEach(() => {
  createMutate.mockReset();
  updateMutate.mockReset();
});

function renderModal(skill?: Skill) {
  render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages, common }}>
      <ToastProvider>
        <SkillEditorModal skill={skill} onClose={() => {}} />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
}

describe("SkillEditorModal", () => {
  it("hints that the description is the skill's interface, phrased as a directive", () => {
    renderModal();
    expect(screen.getByText(/The description is the skill's interface/)).toBeInTheDocument();
  });

  it("requires name and body before creating", () => {
    renderModal();
    const create = screen.getByRole("button", { name: "Create skill" });
    expect(create).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText("uncovered-branches"), { target: { value: "my-skill" } });
    const textareas = screen.getAllByRole("textbox").filter((el) => el.tagName === "TEXTAREA");
    fireEvent.change(textareas[textareas.length - 1]!, { target: { value: "# Rule\nFlag it." } });
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "security" } });
    expect(create).toBeEnabled();

    fireEvent.click(create);
    expect(createMutate).toHaveBeenCalledWith(
      { name: "my-skill", description: "", type: "security", body: "# Rule\nFlag it." },
      expect.anything(),
    );
  });

  it("edits an existing skill and previews the markdown body", () => {
    renderModal({
      id: "s1",
      name: "over-mocking",
      description: "Use when mocks.",
      type: "convention",
      source: "manual",
      body: "# Over mocking",
      enabled: true,
      version: 2,
    });
    expect(screen.getByText("Edit skill")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    expect(screen.getByRole("heading", { name: "Over mocking" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Save skill" }));
    expect(updateMutate).toHaveBeenCalledWith(
      { id: "s1", patch: expect.objectContaining({ name: "over-mocking", type: "convention" }) },
      expect.anything(),
    );
  });

  describe("change note", () => {
    const SKILL = {
      id: "s1",
      name: "over-mocking",
      description: "d",
      type: "convention" as const,
      source: "manual" as const,
      body: "# Over mocking",
      enabled: true,
      version: 2,
    };

    it("is not offered when creating", () => {
      renderModal();
      expect(screen.queryByText("Change note")).toBeNull();
    });

    it("is sent only when the body changed", () => {
      updateMutate.mockClear();
      renderModal(SKILL);
      fireEvent.change(screen.getByPlaceholderText("What changed and why (optional)"), { target: { value: "Reworded" } });
      fireEvent.click(screen.getByRole("button", { name: "Save skill" }));
      expect(updateMutate.mock.calls[0]![0].patch).not.toHaveProperty("change_note");
    });

    it("is included with a body change", () => {
      updateMutate.mockClear();
      renderModal(SKILL);
      fireEvent.change(screen.getByPlaceholderText("What changed and why (optional)"), { target: { value: " Reworded " } });
      const textareas = screen.getAllByRole("textbox").filter((el) => el.tagName === "TEXTAREA");
      fireEvent.change(textareas[textareas.length - 1]!, { target: { value: "# New body" } });
      fireEvent.click(screen.getByRole("button", { name: "Save skill" }));
      expect(updateMutate.mock.calls[0]![0].patch).toMatchObject({ body: "# New body", change_note: "Reworded" });
    });
  });
});
