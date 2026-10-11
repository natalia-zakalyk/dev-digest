import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { SkillImportPreview } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/skills.json";
import common from "../../../../../../../messages/en/common.json";
import { ToastProvider } from "@/lib/toast";

const PREVIEW: SkillImportPreview = {
  name: "flaky-tests",
  description: "Use when tests touch timers.",
  type: "convention",
  body: "# Flaky tests\n\nFlag real time.",
  source_file: "flaky-tests/SKILL.md",
  ignored_files: ["flaky-tests/scripts/detect.sh", "flaky-tests/README.md"],
  warnings: [],
};

const previewMutate = vi.fn();
const createMutate = vi.fn();
vi.mock("@/lib/hooks/skills", () => ({
  useImportSkillPreview: () => ({ mutate: previewMutate, isPending: false }),
  useCreateSkill: () => ({ mutate: createMutate, isPending: false }),
}));

import { ImportSkillDrawer } from "./ImportSkillDrawer";

afterEach(cleanup);
beforeEach(() => {
  createMutate.mockReset();
  previewMutate.mockReset();
  previewMutate.mockImplementation((_input, opts) => opts.onSuccess(PREVIEW));
});

function renderDrawer(onClose = vi.fn()) {
  render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages, common }}>
      <ToastProvider>
        <ImportSkillDrawer onClose={onClose} onSaved={() => {}} />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
  return { onClose };
}

async function pickFile() {
  const file = new File(["zip-bytes"], "flaky-tests.zip", { type: "application/zip" });
  fireEvent.change(screen.getByLabelText("File"), { target: { files: [file] } });
  await waitFor(() => expect(previewMutate).toHaveBeenCalled());
}

describe("ImportSkillDrawer", () => {
  it("sends the file base64 to the preview endpoint", async () => {
    renderDrawer();
    expect(screen.getByRole("button", { name: "Save skill" })).toBeDisabled();
    await pickFile();
    expect(previewMutate.mock.calls[0]![0]).toEqual({
      filename: "flaky-tests.zip",
      content_base64: btoa("zip-bytes"),
    });
  });

  it("shows the extracted core, ignored files and the trust banner — nothing saved yet", async () => {
    renderDrawer();
    await pickFile();
    expect(await screen.findByDisplayValue("flaky-tests")).toBeInTheDocument();
    expect(screen.getByText("You are importing someone else's instructions")).toBeInTheDocument();
    expect(screen.getByText("Ignored files (2)")).toBeInTheDocument();
    expect(screen.getByText("flaky-tests/scripts/detect.sh")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Flaky tests" })).toBeInTheDocument();
    expect(createMutate).not.toHaveBeenCalled();
  });

  it("saves only after confirmation, as an imported_file skill", async () => {
    renderDrawer();
    await pickFile();
    fireEvent.click(await screen.findByRole("button", { name: "Save skill" }));
    expect(createMutate).toHaveBeenCalledWith(
      {
        name: "flaky-tests",
        description: "Use when tests touch timers.",
        type: "convention",
        body: PREVIEW.body,
        source: "imported_file",
      },
      expect.anything(),
    );
  });

  it("cancel writes nothing", async () => {
    const { onClose } = renderDrawer();
    await pickFile();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalled();
    expect(createMutate).not.toHaveBeenCalled();
  });
});
